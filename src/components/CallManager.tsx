import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Avatar from './Avatar';
import { usePresence } from '../context/PresenceContext';
import type { CallKind, Profile } from '../lib/types';

/**
 * Appels 1:1 réels (WebRTC) dans un MP.
 *
 * Signalisation via Supabase Realtime Broadcast sur le canal `call:<dmId>`
 * (offre / réponse / ICE / refus / fin). Aucun serveur média : connexion
 * pair-à-pair directe avec un STUN public Google. Sur des réseaux très
 * restrictifs (NAT symétrique, sans TURN), l'établissement peut échouer —
 * c'est une limite documentée, pas un appel simulé.
 *
 * Règles :
 * - Seul l'appelant journalise l'appel (call_logs) — jamais de doublon.
 * - L'appelé ne voit la modale d'appel entrant que s'il a la conversation
 *   ouverte (ce composant n'est monté que dans Conversation).
 * - Les appels de groupe ne passent pas par ici (message honnête côté Conversation).
 */

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const NO_ANSWER_TIMEOUT_MS = 30_000;

type Phase = 'idle' | 'confirm' | 'outgoing' | 'incoming' | 'active';

interface SignalPayload {
  type: 'offer' | 'answer' | 'ice' | 'decline' | 'end' | 'busy';
  from: string;
  kind?: CallKind;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  startedAt?: string;
}

interface Props {
  sb: SupabaseClient;
  me: string;
  dmId: string;
  peer: Profile;
  request: CallKind | null;
  onRequestHandled: () => void;
  flash: (msg: string) => void;
}

export default function CallManager({ sb, me, dmId, peer, request, onRequestHandled, flash }: Props) {
  const { online } = usePresence();
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [kind, setKind] = useState<CallKind>('audio');
  const [incoming, setIncoming] = useState<SignalPayload | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const loggedRef = useRef(false);
  const isCallerRef = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const noAnswerTimer = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  phaseRef.current = phase;

  const sendSignal = useCallback(
    (payload: Omit<SignalPayload, 'from'>) => {
      const ch = (sendSignal as unknown as { ch?: { send: (m: unknown) => void } }).ch;
      ch?.send({ type: 'broadcast', event: 'call', payload: { ...payload, from: me } });
    },
    [me],
  );

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

  const logCall = useCallback(
    async (status: 'termine' | 'manque' | 'refuse') => {
      if (loggedRef.current || !startedAtRef.current) return;
      loggedRef.current = true;
      await sb.from('call_logs').insert({
        dm_id: dmId,
        caller_id: me,
        callee_id: peer.id,
        kind,
        started_at: startedAtRef.current,
        ended_at: new Date().toISOString(),
        status,
      });
    },
    [sb, dmId, me, peer.id, kind],
  );

  const endCall = useCallback(
    (status: 'termine' | 'manque' | 'refuse' | null, notifyPeer: boolean) => {
      clearTimers();
      if (notifyPeer) sendSignal({ type: 'end' });
      pcRef.current?.close();
      pcRef.current = null;
      stopTracks();
      iceQueueRef.current = [];
      setIncoming(null);
      setPhase('idle');
      if (status) void logCall(status);
    },
    [clearTimers, sendSignal, stopTracks, logCall],
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
        flash(
          'Impossible d’accéder au micro ou à la caméra. Autorise l’accès dans les paramètres de ton navigateur, puis réessaie.',
        );
        return null;
      }
    },
    [flash],
  );

  // --- Appel sortant : confirmation puis offre ---
  const confirmOutgoing = useCallback(async () => {
    const k = kind;
    const stream = await acquireMedia(k);
    if (!stream) {
      setPhase('idle');
      return;
    }
    try {
      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      startedAtRef.current = new Date().toISOString();
      loggedRef.current = false;
      isCallerRef.current = true;
      sendSignal({ type: 'offer', sdp: offer, kind: k, startedAt: startedAtRef.current });
      setPhase('outgoing');
      noAnswerTimer.current = window.setTimeout(() => {
        // Pas de réponse après 30 s : appel manqué.
        endCall('manque', false);
        flash('Pas de réponse : appel manqué.');
      }, NO_ANSWER_TIMEOUT_MS);
    } catch {
      flash('Impossible de démarrer l’appel.');
      endCall(null, false);
    }
  }, [kind, acquireMedia, createPC, sendSignal, endCall, flash]);

  // --- Appel entrant : accepter ---
  const acceptIncoming = useCallback(async () => {
    const offer = incoming;
    if (!offer || !offer.sdp || !offer.startedAt) return;
    const k = offer.kind ?? 'audio';
    const stream = await acquireMedia(k);
    if (!stream) {
      sendSignal({ type: 'decline' });
      setIncoming(null);
      setPhase('idle');
      return;
    }
    try {
      const pc = createPC();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer.sdp));
      // ICE arrivés avant la description distante : on les rejoue.
      for (const c of iceQueueRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      iceQueueRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      startedAtRef.current = offer.startedAt;
      isCallerRef.current = false;
      setKind(k);
      sendSignal({ type: 'answer', sdp: answer });
      setPhase('active');
      startTimer();
    } catch {
      flash('Impossible de répondre à l’appel.');
      endCall(null, false);
    }
  }, [incoming, acquireMedia, createPC, sendSignal, startTimer, endCall, flash]);

  // --- Demande sortante (depuis les boutons de l'en-tête) ---
  useEffect(() => {
    if (!request) return;
    onRequestHandled();
    if (phaseRef.current !== 'idle') {
      flash('Tu es déjà en appel.');
      return;
    }
    if (!online[peer.id]) {
      flash(`${peer.display_name || peer.username} n’est pas disponible pour le moment.`);
      return;
    }
    setKind(request);
    setPhase('confirm');
  }, [request, onRequestHandled, online, peer, flash]);

  // --- Canal de signalisation (toujours actif dans la conversation) ---
  useEffect(() => {
    const ch = sb.channel(`call:${dmId}:${channelTag}`);
    (sendSignal as unknown as { ch?: unknown }).ch = ch;
    ch.on('broadcast', { event: 'call' }, ({ payload }: { payload: SignalPayload }) => {
      if (!payload || payload.from === me) return;
      const cur = phaseRef.current;
      switch (payload.type) {
        case 'offer':
          if (cur !== 'idle') {
            ch.send({ type: 'broadcast', event: 'call', payload: { type: 'busy', from: me } });
            return;
          }
          setIncoming(payload);
          setKind(payload.kind ?? 'audio');
          setPhase('incoming');
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
        case 'decline':
          if (cur === 'outgoing') {
            endCall('refuse', false);
            flash('Appel refusé.');
          }
          break;
        case 'busy':
          if (cur === 'outgoing') {
            endCall(null, false);
            flash(`${peer.display_name || peer.username} est déjà en appel.`);
          }
          break;
        case 'end':
          if (cur === 'active' || cur === 'outgoing' || cur === 'incoming') {
            // Seul l'appelant journalise l'appel (anti-doublon).
            endCall(isCallerRef.current ? 'termine' : null, false);
          }
          break;
        default:
          break;
      }
    }).subscribe();
    return () => {
      // Fermeture propre si on quitte la conversation en plein appel.
      if (phaseRef.current === 'active' || phaseRef.current === 'outgoing') {
        ch.send({ type: 'broadcast', event: 'call', payload: { type: 'end', from: me } });
        if (phaseRef.current === 'active' && isCallerRef.current) void logCall('termine');
      }
      ch.unsubscribe();
      pcRef.current?.close();
      stopTracks();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, dmId, channelTag]);

  // Brancher les flux sur les balises vidéo/audio.
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, phase]);
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, phase]);

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
  const peerName = peer.display_name || peer.username;

  if (phase === 'idle') return null;

  // --- Modale de confirmation (appel sortant) ---
  if (phase === 'confirm') {
    return (
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
    );
  }

  // --- Appel entrant plein écran ---
  if (phase === 'incoming' && incoming) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-base px-6" role="dialog" aria-label="Appel entrant">
        <Avatar profile={peer} size={112} />
        <div className="text-center">
          <p className="text-2xl font-extrabold">{peerName}</p>
          <p className="mt-1 text-muted">Appel {kind === 'video' ? 'vidéo' : 'vocal'} entrant…</p>
        </div>
        <div className="flex gap-6">
          <button
            onClick={() => {
              sendSignal({ type: 'decline' });
              setIncoming(null);
              setPhase('idle');
            }}
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
        </div>
      </div>
    );
  }

  // --- En attente de réponse (appel sortant) ---
  if (phase === 'outgoing') {
    return (
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
    );
  }

  // --- En appel ---
  return (
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
          <p className="font-mono text-white/90">{fmtElapsed}</p>
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
  );
}
