import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import type { Channel, CommunityMember, Profile } from '../lib/types';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';

/**
 * Salon vocal de communauté en mesh WebRTC (pair-à-pair, sans SFU).
 *
 * - Présence : canal Realtime `voice:<channelId>` (qui est dedans).
 * - Signalisation : Broadcast `voice` sur le même canal (offre/réponse/ICE),
 *   filtrée par destinataire (`to`) — chaque paire négocie directement.
 * - Règle anti-double-offre : le nouveau venu offre aux participants déjà là
 *   (comparaison joined_at, puis user_id en cas d'égalité) ; les autres
 *   attendent et répondent. Jamais deux offres simultanées pour une paire.
 * - Indicateur « parle » : analyse réelle du volume (AnalyserNode) sur chaque
 *   flux distant et local — jamais simulé.
 * - Limite honnête : 6 participants max (le mesh ne passe pas à l'échelle).
 *   Au-delà, le bouton rejoindre laisse place à un message expliquant que
 *   les grands salons vocaux arriveront avec un serveur dédié (SFU).
 * - Comme les appels 1:1 : STUN public Google uniquement, pas de TURN.
 */

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_PARTICIPANTS = 6;

interface VoiceSignal {
  type: 'offer' | 'answer' | 'ice';
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface Participant {
  userId: string;
  joinedAt: number;
  profile: Profile | null;
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

export default function VoiceChannel({
  channel,
  members,
  onBack,
}: {
  channel: Channel;
  members: CommunityMember[];
  onBack: () => void;
}) {
  const { sb, user } = useAuth();
  const me = user?.id ?? '';

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState('');

  const channelRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const iceQueuesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const myJoinedAtRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef(new Map<string, AnalyserNode>());
  const participantsRef = useRef<Participant[]>([]);
  const extraProfilesRef = useRef<Record<string, Profile>>({});
  const joinedRef = useRef(false);

  const profilesById = useCallback(
    (userId: string): Profile | null =>
      members.find((m) => m.user_id === userId)?.profiles ?? extraProfilesRef.current[userId] ?? null,
    [members],
  );

  const sendSignal = useCallback((payload: VoiceSignal) => {
    const ch = channelRef.current;
    if (!ch) return;
    (ch as unknown as { send: (m: unknown) => void }).send({ type: 'broadcast', event: 'voice', payload });
  }, []);

  const attachRemote = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => (prev[peerId] === stream ? prev : { ...prev, [peerId]: stream }));
    const ctx = audioCtxRef.current;
    if (ctx && !analysersRef.current.has(peerId)) {
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analysersRef.current.set(peerId, analyser);
      } catch {
        /* indicateur indisponible pour ce pair */
      }
    }
  }, []);

  const makePC = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: STUN });
      pcsRef.current.set(peerId, pc);
      const stream = localStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ type: 'ice', from: me, to: peerId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        if (e.streams[0]) attachRemote(peerId, e.streams[0]);
      };
      return pc;
    },
    [attachRemote, me, sendSignal],
  );

  const createOfferTo = useCallback(
    async (peerId: string) => {
      try {
        const pc = makePC(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', from: me, to: peerId, sdp: offer });
      } catch {
        /* le pair réessaiera à sa prochaine synchronisation */
      }
    },
    [makePC, me, sendSignal],
  );

  const handleSignal = useCallback(
    async (payload: VoiceSignal) => {
      if (!payload || payload.to !== me || payload.from === me || !joinedRef.current) return;
      const peerId = payload.from;
      try {
        if (payload.type === 'offer') {
          let pc = pcsRef.current.get(peerId);
          if (!pc) pc = makePC(peerId);
          if (pc.signalingState !== 'stable') return;
          if (!payload.sdp) return;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const queued = iceQueuesRef.current.get(peerId) ?? [];
          for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          iceQueuesRef.current.set(peerId, []);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: 'answer', from: me, to: peerId, sdp: answer });
        } else if (payload.type === 'answer') {
          const pc = pcsRef.current.get(peerId);
          if (pc && payload.sdp && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(() => {});
          }
        } else if (payload.type === 'ice' && payload.candidate) {
          const pc = pcsRef.current.get(peerId);
          if (pc && pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
          } else {
            const q = iceQueuesRef.current.get(peerId) ?? [];
            q.push(payload.candidate);
            iceQueuesRef.current.set(peerId, q);
          }
        }
      } catch {
        /* signal ignoré : la paire se resynchronisera */
      }
    },
    [makePC, me, sendSignal],
  );

  const syncPresence = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const state = ch.presenceState() as Record<string, { user_id: string; joined_at: number }[]>;
    const byUser = new Map<string, number>();
    for (const arr of Object.values(state)) {
      for (const p of arr ?? []) {
        if (!p?.user_id || typeof p.joined_at !== 'number') continue;
        const prev = byUser.get(p.user_id);
        if (prev === undefined || p.joined_at < prev) byUser.set(p.user_id, p.joined_at);
      }
    }
    const list: Participant[] = [];
    const missing: string[] = [];
    byUser.forEach((joinedAt, userId) => {
      const profile = profilesById(userId);
      if (!profile) missing.push(userId);
      list.push({ userId, joinedAt, profile });
    });
    list.sort((a, b) => a.joinedAt - b.joinedAt);
    participantsRef.current = list;
    setParticipants(list);
    if (missing.length > 0) {
      sb.from('profiles')
        .select('*')
        .in('id', missing)
        .then(({ data }) => {
          if (!data) return;
          const next = { ...extraProfilesRef.current };
          for (const p of data as Profile[]) next[p.id] = p;
          extraProfilesRef.current = next;
          // Re-rendre les participants avec les profils récupérés.
          setParticipants(participantsRef.current.map((pt) => ({ ...pt, profile: pt.profile ?? next[pt.userId] ?? null })));
        });
    }
    // Nouveau venu : j'offre aux participants déjà là (pas l'inverse).
    for (const p of list) {
      if (p.userId === me) continue;
      const shouldOffer =
        p.joinedAt < myJoinedAtRef.current ||
        (p.joinedAt === myJoinedAtRef.current && p.userId < me);
      if (shouldOffer && !pcsRef.current.has(p.userId)) void createOfferTo(p.userId);
    }
  }, [createOfferTo, me, profilesById, sb]);

  const leave = useCallback(() => {
    joinedRef.current = false;
    const ch = channelRef.current;
    if (ch) {
      (ch as unknown as { untrack: () => Promise<unknown> }).untrack?.().catch(() => {});
      ch.unsubscribe();
    }
    channelRef.current = null;
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    iceQueuesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analysersRef.current.clear();
    participantsRef.current = [];
    setRemoteStreams({});
    setSpeaking({});
    setParticipants([]);
    setJoined(false);
    setMuted(false);
  }, []);

  // Fermeture propre si on quitte la page en plein vocal.
  useEffect(() => () => leave(), [leave]);

  // Indicateur « parle » : volume réel, mesuré 4 fois par seconde.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next: Record<string, boolean> = {};
      analysersRef.current.forEach((analyser, key) => {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        next[key] = Math.sqrt(sum / data.length) > 0.02;
      });
      setSpeaking(next);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const join = async () => {
    if (participantsRef.current.length >= MAX_PARTICIPANTS) {
      setNotice(`Ce salon est plein (${MAX_PARTICIPANTS} personnes maximum en vocal mesh). Les grands salons vocaux arriveront avec un serveur dédié.`);
      return;
    }
    setJoining(true);
    setNotice('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      localStreamRef.current = stream;
      myJoinedAtRef.current = Date.now();
      // Contexte audio créé dans le geste de l'utilisateur (sinon suspendu).
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          audioCtxRef.current = new Ctx();
          if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume().catch(() => {});
          const source = audioCtxRef.current.createMediaStreamSource(stream);
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analysersRef.current.set('local', analyser);
        }
      } catch {
        /* indicateur local indisponible, le vocal fonctionne quand même */
      }
      const ch = sb.channel(`voice:${channel.id}`);
      channelRef.current = ch;
      ch.on('presence', { event: 'sync' }, () => syncPresence());
      ch.on('broadcast', { event: 'voice' }, ({ payload }: { payload: VoiceSignal }) => {
        void handleSignal(payload);
      });
      await ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: me, joined_at: myJoinedAtRef.current });
          joinedRef.current = true;
          setJoined(true);
        }
      });
    } catch {
      setNotice('Impossible d’accéder au micro. Autorise l’accès dans les paramètres de ton navigateur, puis réessaie.');
    } finally {
      setJoining(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  const full = participants.length >= MAX_PARTICIPANTS && !joined;

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:hidden" aria-label="Retour">
          ←
        </button>
        <Volume2 size={20} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-extrabold">{channel.name}</h2>
          <p className="text-xs text-muted">
            {participants.length === 0 ? 'Salon vocal' : `${participants.length} en vocal${joined ? ' (toi inclus)' : ''}`}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {participants.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Volume2 size={48} />
            <p className="font-bold">Personne pour le moment</p>
            <p className="max-w-sm text-sm text-muted">Rejoins le salon pour parler avec les membres de la communauté, sans serveur dédié.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {participants.map((p) => {
              const isMe = p.userId === me;
              const isSpeaking = speaking[isMe ? 'local' : p.userId];
              const name = p.profile?.display_name || p.profile?.username || (isMe ? 'Toi' : 'Utilisateur');
              return (
                <div
                  key={p.userId}
                  className={`flex flex-col items-center gap-2 rounded-2xl bg-surface px-3 py-4 ring-2 ${
                    isSpeaking ? 'ring-[#22C55E]' : 'ring-transparent'
                  }`}
                >
                  <Avatar profile={p.profile} size={64} />
                  <p className="w-full truncate text-center text-sm font-bold">{name}</p>
                  <p className="text-xs text-muted">
                    {isMe ? (muted ? 'Micro coupé' : isSpeaking ? 'Parle…' : 'En vocal') : isSpeaking ? 'Parle…' : 'En vocal'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {notice && <p className="mt-4 rounded-xl bg-surface2 px-4 py-3 text-center text-sm">{notice}</p>}
        <p className="mt-4 text-center text-xs text-muted">
          Vocal de groupe en pair-à-pair (6 personnes maximum). Les grands salons vocaux arriveront avec un serveur dédié.
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-line px-4 py-4">
        {!joined ? (
          <button
            onClick={() => void join()}
            disabled={joining || full}
            className="rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {joining ? 'Connexion…' : full ? 'Salon plein' : 'Rejoindre le vocal'}
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex h-14 w-14 items-center justify-center rounded-full text-xl text-white ${muted ? 'bg-danger' : 'bg-surface2 text-ink hover:bg-line'}`}
              aria-label={muted ? 'Réactiver le micro' : 'Couper le micro'}
              title={muted ? 'Réactiver le micro' : 'Couper le micro'}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              onClick={leave}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-xl text-white hover:opacity-90"
              aria-label="Quitter le vocal"
              title="Quitter le vocal"
            >
              <PhoneOff size={20} />
            </button>
          </>
        )}
      </div>

      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}
    </div>
  );
}
