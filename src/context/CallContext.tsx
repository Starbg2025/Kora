import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { usePresence } from './PresenceContext';
import Avatar from '../components/Avatar';
import type { CallKind, Profile } from '../lib/types';

/**
 * Appels 1:1 réels (WebRTC), globaux à l'application.
 *
 * Pourquoi deux mécanismes :
 * - La table `call_invites` (temps réel postgres_changes) sert de SONNERIE :
 *   l'appel entrant atteint le destinataire PARTOUT dans l'app, pas seulement
 *   quand la conversation est ouverte. Les statuts (ringing/accepted/declined/
 *   busy/missed/ended) y sont persistés.
 * - Le canal Broadcast `call:<dmId>` ne transporte que la négociation WebRTC
 *   (ready/offre/réponse/ICE/fin), entre les deux pairs, pendant l'appel.
 *
 * Aucun serveur média : pair-à-pair direct avec un STUN public Google. Sur des
 * réseaux très restrictifs (NAT symétrique, sans TURN), l'établissement peut
 * échouer — c'est une limite documentée, pas un appel simulé.
 * Seul l'appelant journalise l'appel (call_logs) — jamais de doublon.
 * Les appels de groupe et les salons vocaux ne passent pas par ici.
 */

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const NO_ANSWER_TIMEOUT_MS = 30_000;

type Phase = 'idle' | 'confirm' | 'outgoing' | 'incoming' | 'active';
type InviteStatus = 'ringing' | 'accepted' | 'declined' | 'busy' | 'missed' | 'ended';

interface InviteRow {
  id: string;
  dm_id: string;
  caller_id: string;
  callee_id: string;
  kind: CallKind;
  status: InviteStatus;
  created_at: string;
}

interface SignalPayload {
  type: 'ready' | 'offer' | 'answer' | 'ice' | 'end';
  from: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface CallCtxValue {
  startCall: (dmId: string, peer: Profile, kind: CallKind) => void;
  busy: boolean;
}

const CallCtx = createContext<CallCtxValue>({ startCall: () => {}, busy: false });

export const useCall = () => useContext(CallCtx);

function minimalProfile(id: string): Profile {
  return {
    id,
    username: 'Utilisateur',
    display_name: '',
    avatar_url: null,
    bio: '',
    status: 'invisible',
    custom_status: '',
    custom_status_expires_at: null,
    created_at: '',
    banner_color: null,
    is_disabled: false,
    is_verified: false,
    is_site_admin: false,
    is_creator: false,
  };
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { sb, user } = useAuth();
  const { online } = usePresence();
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [phase, setPhase] = useState<Phase>('idle');
  const [kind, setKind] = useState<CallKind>('audio');
  const [peer, setPeer] = useState<Profile | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<InviteRow | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [ringMuted, setRingMuted] = useState(false);
  const [notice, setNotice] = useState('');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const me = user?.id ?? '';
  const phaseRef = useRef<Phase>('idle');
  const peerRef = useRef<Profile | null>(null);
  const dmIdRef = useRef<string | null>(null);
  const inviteIdRef = useRef<string | null>(null);
  const isCallerRef = useRef(false);
  const startedAtRef = useRef<string | null>(null);
  const loggedRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const noAnswerTimer = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const ringCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const ringMutedRef = useRef(false);
  const negChannelRef = useRef<{ send: (m: unknown) => void; unsubscribe: () => void } | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  phaseRef.current = phase;
  ringMutedRef.current = ringMuted;

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }, []);

  // --- Sonnerie générée en WebAudio (aucun fichier externe) ---
  const stopRingtone = useCallback(() => {
    if (ringTimerRef.current) window.clearInterval(ringTimerRef.current);
    ringTimerRef.current = null;
    if (ringCtxRef.current) {
      ringCtxRef.current.close().catch(() => {});
      ringCtxRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(() => {
    if (ringMutedRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      ringCtxRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const beep = (freq: number, delay: number) => {
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      };
      let n = 0;
      ringTimerRef.current = window.setInterval(() => {
        const f = n % 2 === 0 ? 880 : 660;
        beep(f, 0);
        beep(f, 0.6);
        n += 1;
      }, 1600);
    } catch {
      // Sonnerie indisponible : la modale reste visible, c'est l'essentiel.
    }
  }, []);

  const stopTracks = useCallback(() => {
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const clearTimers = useCallback(() => {
    if (noAnswerTimer.current) window.clearTimeout(noAnswerTimer.current);
    if (elapsedTimer.current) window.clearInterval(elapsedTimer.current);
    noAnswerTimer.current = null;
    elapsedTimer.current = null;
  }, []);

  const closeNegotiation = useCallback(() => {
    negChannelRef.current?.unsubscribe();
    negChannelRef.current = null;
  }, []);

  const sendSignal = useCallback((payload: Omit<SignalPayload, 'from'>) => {
    negChannelRef.current?.send({ type: 'broadcast', event: 'call', payload: { ...payload, from: me } });
  }, [me]);

  const logCall = useCallback(
    async (status: 'termine' | 'manque' | 'refuse') => {
      if (loggedRef.current || !startedAtRef.current || !dmIdRef.current || !peerRef.current) return;
      loggedRef.current = true;
      await sb.from('call_logs').insert({
        dm_id: dmIdRef.current,
        caller_id: me,
        callee_id: peerRef.current.id,
        kind,
        started_at: startedAtRef.current,
        ended_at: new Date().toISOString(),
        status,
      }).then(() => {});
    },
    [sb, me, kind],
  );

  const resetCall = useCallback(() => {
    clearTimers();
    stopRingtone();
    closeNegotiation();
    pcRef.current?.close();
    pcRef.current = null;
    stopTracks();
    iceQueueRef.current = [];
    setIncomingInvite(null);
    setMinimized(false);
    setMuted(false);
    setCameraOff(false);
    inviteIdRef.current = null;
    isCallerRef.current = false;
    setPhase('idle');
  }, [clearTimers, stopRingtone, closeNegotiation, stopTracks]);

  const endCall = useCallback(
    (status: 'termine' | 'manque' | 'refuse' | null, notifyPeer: boolean) => {
      const inviteId = inviteIdRef.current;
      if (notifyPeer) {
        sendSignal({ type: 'end' });
        if (inviteId) {
          void sb.from('call_invites').update({ status: 'ended' }).eq('id', inviteId);
        }
      }
      if (status) void logCall(status);
      resetCall();
    },
    [sendSignal, sb, logCall, resetCall],
  );

  const startTimer = useCallback(() => {
    if (elapsedTimer.current) window.clearInterval(elapsedTimer.current);
    const start = startedAtRef.current ? new Date(startedAtRef.current).getTime() : Date.now();
    setElapsed(0);
    elapsedTimer.current = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
  }, []);

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
    };
    pcRef.current = pc;
    return pc;
  }, [sendSignal]);

  const acquireMedia = useCallback(
    async (k: CallKind): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: k === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        localRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch {
        flash('Impossible d’accéder au micro ou à la caméra. Autorise l’accès dans les paramètres de ton navigateur, puis réessaie.');
        return null;
      }
    },
    [flash],
  );

  // Canal de négociation WebRTC pour un DM donné (rejoint pendant l'appel).
  const joinNegotiation = useCallback(
    (targetDmId: string) => {
      closeNegotiation();
      const ch = sb.channel(`call:${targetDmId}:${channelTag}`);
      negChannelRef.current = ch as unknown as { send: (m: unknown) => void; unsubscribe: () => void };
      ch.on('broadcast', { event: 'call' }, ({ payload }: { payload: SignalPayload }) => {
        if (!payload || payload.from === me) return;
        const cur = phaseRef.current;
        switch (payload.type) {
          case 'ready':
            // L'appelé a rejoint : l'appelant peut envoyer son offre.
            if (cur === 'outgoing' && pcRef.current && pcRef.current.localDescription) {
              sendSignal({ type: 'offer', sdp: pcRef.current.localDescription });
            }
            break;
          case 'offer':
            // Offre de l'appelant : traitée une seule fois (avant toute
            // description distante). L'appelé est déjà en phase 'active'
            // (écran d'appel affiché dès l'acceptation) : on ne filtre donc
            // pas sur la phase, mais sur l'absence de remoteDescription.
            if (payload.sdp && pcRef.current && !pcRef.current.remoteDescription) {
              pcRef.current
                .setRemoteDescription(new RTCSessionDescription(payload.sdp))
                .then(async () => {
                  for (const c of iceQueueRef.current) {
                    await pcRef.current!.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                  }
                  iceQueueRef.current = [];
                  const answer = await pcRef.current!.createAnswer();
                  await pcRef.current!.setLocalDescription(answer);
                  sendSignal({ type: 'answer', sdp: answer });
                })
                .catch(() => {});
            }
            break;
          case 'answer':
            if (cur === 'outgoing' && payload.sdp && pcRef.current) {
              pcRef.current
                .setRemoteDescription(new RTCSessionDescription(payload.sdp))
                .then(() => {
                  if (noAnswerTimer.current) window.clearTimeout(noAnswerTimer.current);
                  setPhase('active');
                  startTimer();
                })
                .catch(() => {});
            }
            break;
          case 'ice':
            if (payload.candidate) {
              const pc = pcRef.current;
              if (pc && pc.remoteDescription) {
                pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
              } else {
                iceQueueRef.current.push(payload.candidate);
              }
            }
            break;
          case 'end':
            if (cur === 'active' || cur === 'outgoing' || cur === 'incoming') {
              endCall(isCallerRef.current ? 'termine' : null, false);
            }
            break;
          default:
            break;
        }
      }).subscribe();
    },
    [sb, channelTag, me, sendSignal, closeNegotiation, startTimer, endCall],
  );

  // --- Appel sortant : confirmation puis invitation + offre ---
  const confirmOutgoing = useCallback(async () => {
    const p = peerRef.current;
    const targetDm = dmIdRef.current;
    if (!p || !targetDm) {
      setPhase('idle');
      return;
    }
    const k = kind;
    const stream = await acquireMedia(k);
    if (!stream) {
      setPhase('idle');
      return;
    }
    try {
      // 1. Invitation persistée (fait sonner le destinataire partout dans l'app).
      const { data: invite, error: invErr } = await sb
        .from('call_invites')
        .insert({ dm_id: targetDm, caller_id: me, callee_id: p.id, kind: k, status: 'ringing' })
        .select()
        .single();
      if (invErr || !invite) throw invErr ?? new Error('Invitation impossible');
      inviteIdRef.current = (invite as InviteRow).id;
      // 2. Négociation WebRTC.
      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      startedAtRef.current = new Date().toISOString();
      loggedRef.current = false;
      isCallerRef.current = true;
      joinNegotiation(targetDm);
      // L'offre est renvoyée quand l'appelé signale 'ready' ; on l'envoie aussi
      // tout de suite au cas où il aurait déjà rejoint.
      sendSignal({ type: 'offer', sdp: offer });
      setPhase('outgoing');
      noAnswerTimer.current = window.setTimeout(() => {
        if (inviteIdRef.current) {
          void sb.from('call_invites').update({ status: 'missed' }).eq('id', inviteIdRef.current);
        }
        endCall('manque', false);
        flash('Pas de réponse : appel manqué.');
      }, NO_ANSWER_TIMEOUT_MS);
    } catch {
      flash('Impossible de démarrer l’appel.');
      endCall(null, false);
    }
  }, [kind, acquireMedia, sb, me, createPC, joinNegotiation, sendSignal, endCall, flash]);

  // --- Appel entrant : accepter ---
  const acceptIncoming = useCallback(async () => {
    const invite = incomingInvite;
    const p = peerRef.current;
    if (!invite || !p) return;
    stopRingtone();
    // Marquer acceptée seulement si elle sonne encore (évite les courses).
    const { data: updated } = await sb
      .from('call_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id)
      .eq('status', 'ringing')
      .select()
      .single();
    if (!updated) {
      flash('Cet appel est déjà terminé.');
      resetCall();
      return;
    }
    const k = invite.kind;
    const stream = await acquireMedia(k);
    if (!stream) {
      void sb.from('call_invites').update({ status: 'declined' }).eq('id', invite.id);
      resetCall();
      return;
    }
    try {
      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      startedAtRef.current = invite.created_at;
      isCallerRef.current = false;
      setKind(k);
      dmIdRef.current = invite.dm_id;
      joinNegotiation(invite.dm_id);
      // Signaler la présence : l'appelant envoie alors son offre.
      sendSignal({ type: 'ready' });
      setPhase('active');
      startTimer();
    } catch {
      flash('Impossible de répondre à l’appel.');
      resetCall();
    }
  }, [incomingInvite, sb, acquireMedia, createPC, joinNegotiation, sendSignal, startTimer, stopRingtone, resetCall, flash]);

  const declineIncoming = useCallback(() => {
    const invite = incomingInvite;
    stopRingtone();
    if (invite) {
      void sb.from('call_invites').update({ status: 'declined' }).eq('id', invite.id);
    }
    resetCall();
  }, [incomingInvite, sb, stopRingtone, resetCall]);

  // --- Demande sortante depuis une conversation ---
  const startCall = useCallback(
    (targetDmId: string, targetPeer: Profile, k: CallKind) => {
      if (phaseRef.current !== 'idle') {
        flash('Tu es déjà en appel.');
        return;
      }
      if (!online[targetPeer.id]) {
        flash(`${targetPeer.display_name || targetPeer.username} n’est pas disponible pour le moment.`);
        return;
      }
      dmIdRef.current = targetDmId;
      peerRef.current = targetPeer;
      setPeer(targetPeer);
      setKind(k);
      setPhase('confirm');
    },
    [online, flash],
  );

  // --- Sonnerie globale : invitations entrantes (postgres_changes) ---
  useEffect(() => {
    if (!me) return;
    const ch = sb
      .channel(`call-invites:${me}:${channelTag}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_invites', filter: `callee_id=eq.${me}` },
        async (payload) => {
          const invite = payload.new as InviteRow;
          if (phaseRef.current !== 'idle') {
            // Déjà en appel : l'appelant saura qu'on est occupé.
            await sb.from('call_invites').update({ status: 'busy' }).eq('id', invite.id);
            return;
          }
          const { data: caller } = await sb.from('profiles').select('*').eq('id', invite.caller_id).maybeSingle();
          peerRef.current = (caller as Profile) ?? minimalProfile(invite.caller_id);
          setPeer(peerRef.current);
          setKind(invite.kind);
          dmIdRef.current = invite.dm_id;
          inviteIdRef.current = invite.id;
          setIncomingInvite(invite);
          setPhase('incoming');
          startRingtone();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `caller_id=eq.${me}` },
        (payload) => {
          // Réponse de l'appelé à MON invitation sortante.
          const invite = payload.new as InviteRow;
          if (invite.id !== inviteIdRef.current) return;
          if (phaseRef.current !== 'outgoing') return;
          if (invite.status === 'declined') {
            endCall('refuse', false);
            flash('Appel refusé.');
          } else if (invite.status === 'busy') {
            endCall(null, false);
            flash(`${peerRef.current?.display_name || peerRef.current?.username || 'Ton contact'} est déjà en appel.`);
          } else if (invite.status === 'ended') {
            endCall(null, false);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `callee_id=eq.${me}` },
        (payload) => {
          // L'appelant a raccroché pendant que je n'avais pas encore répondu.
          const invite = payload.new as InviteRow;
          if (invite.id !== inviteIdRef.current) return;
          if (phaseRef.current === 'incoming' && (invite.status === 'ended' || invite.status === 'missed')) {
            stopRingtone();
            resetCall();
          }
          if (phaseRef.current === 'active' && (invite.status === 'ended' || invite.status === 'missed')) {
            endCall(isCallerRef.current ? 'termine' : null, false);
          }
        },
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, me, channelTag, startRingtone, stopRingtone, endCall, resetCall, flash]);

  // Fermeture propre si le fournisseur se démonte en plein appel.
  useEffect(() => {
    return () => {
      if (phaseRef.current === 'active' || phaseRef.current === 'outgoing') {
        if (inviteIdRef.current) {
          void sb.from('call_invites').update({ status: 'ended' }).eq('id', inviteIdRef.current);
        }
        if (phaseRef.current === 'active' && isCallerRef.current) void logCall('termine');
      }
      closeNegotiation();
      pcRef.current?.close();
      stopTracks();
      clearTimers();
      stopRingtone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Brancher les flux sur les balises vidéo/audio.
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, phase, minimized]);
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, phase, minimized]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    setCameraOff(next);
    localRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const fmtElapsed = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const peerName = peer?.display_name || peer?.username || 'Utilisateur';

  return (
    <CallCtx.Provider value={{ startCall, busy: phase !== 'idle' }}>
      {children}

      {notice && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-surface px-4 py-2.5 text-sm font-medium shadow-2xl ring-1 ring-line md:bottom-8">
          {notice}
        </div>
      )}

      {/* --- Modale de confirmation (appel sortant) --- */}
      {phase === 'confirm' && peer && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-label="Commencer l’appel">
          <button aria-label="Annuler" onClick={() => setPhase('idle')} className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-sm rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
            <h2 className="text-center text-xl font-extrabold">Peut-on commencer l’appel ?</h2>
            <p className="mt-2 text-center text-sm text-muted">
              {peerName} sera prévenu dès que tu lances l’appel {kind === 'video' ? 'vidéo' : 'vocal'}.
            </p>
            <button
              onClick={confirmOutgoing}
              className="mt-6 w-full rounded-xl bg-[#22C55E] px-4 py-3.5 text-base font-bold text-white hover:opacity-90"
            >
              Commencer l’appel
            </button>
            <button
              onClick={() => setPhase('idle')}
              className="mt-2 w-full rounded-xl bg-surface2 px-4 py-3.5 text-base font-bold hover:bg-line"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* --- Appel entrant plein écran --- */}
      {phase === 'incoming' && incomingInvite && peer && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-base px-6" role="dialog" aria-label="Appel entrant">
          <Avatar profile={peer} size={112} />
          <div className="text-center">
            <p className="text-2xl font-extrabold">{peerName}</p>
            <p className="mt-1 text-muted">Appel {kind === 'video' ? 'vidéo' : 'vocal'} entrant…</p>
          </div>
          <div className="flex items-end gap-6">
            <button
              onClick={declineIncoming}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl text-white hover:opacity-90"
              aria-label="Refuser"
              title="Refuser"
            >
              ✕
            </button>
            <button
              onClick={acceptIncoming}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#22C55E] text-2xl text-white hover:opacity-90"
              aria-label="Accepter"
              title="Accepter"
            >
              📞
            </button>
            <button
              onClick={() => {
                if (ringMuted) {
                  setRingMuted(false);
                  startRingtone();
                } else {
                  setRingMuted(true);
                  stopRingtone();
                }
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-lg text-muted hover:text-ink"
              aria-label={ringMuted ? 'Réactiver la sonnerie' : 'Couper la sonnerie'}
              title={ringMuted ? 'Réactiver la sonnerie' : 'Couper la sonnerie'}
            >
              {ringMuted ? '🔇' : '🔔'}
            </button>
          </div>
        </div>
      )}

      {/* --- En attente de réponse (appel sortant) --- */}
      {phase === 'outgoing' && peer && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-base px-6" role="dialog" aria-label="Appel en cours">
          <Avatar profile={peer} size={112} />
          <div className="text-center">
            <p className="text-2xl font-extrabold">{peerName}</p>
            <p className="mt-1 text-muted">Appel {kind === 'video' ? 'vidéo' : 'vocal'} en cours… En attente de réponse.</p>
          </div>
          <button
            onClick={() => endCall('manque', true)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl text-white hover:opacity-90"
            aria-label="Annuler l’appel"
            title="Annuler l’appel"
          >
            ✕
          </button>
        </div>
      )}

      {/* --- Barre flottante quand on navigue hors de l'appel --- */}
      {phase === 'active' && minimized && peer && (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-24 left-1/2 z-[65] flex w-[min(480px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left shadow-2xl ring-1 ring-line md:bottom-6"
          aria-label="Retour à l’appel"
        >
          <Avatar profile={peer} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{peerName}</span>
            <span className="block font-mono text-xs text-muted">{fmtElapsed} — En appel, appuie pour revenir</span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${muted ? 'bg-danger' : 'bg-surface2'}`}
            aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
          >
            {muted ? '🔇' : '🎤'}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              endCall('termine', true);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger text-white"
            aria-label="Raccrocher"
          >
            📞
          </span>
        </button>
      )}

      {/* --- En appel (plein écran) --- */}
      {phase === 'active' && !minimized && peer && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-label="En appel">
          <div className="relative min-h-0 flex-1">
            {kind === 'video' ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <Avatar profile={peer} size={120} />
                <p className="text-xl font-extrabold text-white">{peerName}</p>
                <p className="text-white/70">Appel vocal en cours</p>
                <audio ref={remoteAudioRef} autoPlay />
              </div>
            )}
            {kind === 'video' && localStream && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 h-32 w-24 rounded-xl border border-white/30 bg-surface object-cover"
              />
            )}
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
              <p className="font-bold text-white">{peerName}</p>
              <div className="flex items-center gap-3">
                <p className="font-mono text-white/90">{fmtElapsed}</p>
                <button
                  onClick={() => setMinimized(true)}
                  className="rounded-full bg-black/40 px-3 py-1.5 text-sm font-bold text-white hover:bg-black/60"
                  aria-label="Réduire l’appel"
                  title="Réduire l’appel"
                >
                  ⌄ Réduire
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-5 bg-black px-4 py-5 pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={toggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-xl text-white ${muted ? 'bg-danger' : 'bg-white/20 hover:bg-white/30'}`}
              aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
              title={muted ? 'Réactiver le micro' : 'Couper le micro'}
            >
              {muted ? '🔇' : '🎤'}
            </button>
            {kind === 'video' && (
              <button
                onClick={toggleCamera}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl text-white ${cameraOff ? 'bg-danger' : 'bg-white/20 hover:bg-white/30'}`}
                aria-label={cameraOff ? 'Réactiver la caméra' : 'Couper la caméra'}
                title={cameraOff ? 'Réactiver la caméra' : 'Couper la caméra'}
              >
                {cameraOff ? '🚫' : '📹'}
              </button>
            )}
            <button
              onClick={() => endCall('termine', true)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-xl text-white hover:opacity-90"
              aria-label="Raccrocher"
              title="Raccrocher"
            >
              📞
            </button>
          </div>
        </div>
      )}
    </CallCtx.Provider>
  );
}
