import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useCall } from '../context/CallContext';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import MessageToolbar from '../components/MessageToolbar';
import ThreadPanel from '../components/ThreadPanel';
import EmojiPicker from '../components/EmojiPicker';
import VoiceRecorder from '../components/VoiceRecorder';
import MessageActionSheet from '../components/MessageActionSheet';
import TranslateBlock from '../components/TranslateBlock';
import ReportModal from '../components/ReportModal';
import ProfileCard from '../components/ProfileCard';
import { formatDay, formatFull, formatTime } from '../lib/format';
import { getPinnedDMs, setPinnedDMs } from '../lib/dmPrefs';
import { isDevMode } from '../lib/devMode';
import { openDirectDM } from '../lib/dm';
import { escapeIlike } from '../lib/mentions';
import { STATUS_LABELS, type DM, type DMMemberRow, type Friendship, type Message, type MessagePin, type MessagePoll, type MessagePollVote, type MessageReaction, type Profile } from '../lib/types';
import MessageContent from './MessageContent';
import VerifiedBadge from './VerifiedBadge';
import type { CallLog } from '../lib/types';
import PollModal from './PollModal';
import PollCard from './PollCard';
import { BarChart3, Image, Paperclip, Phone, Pin, Users, Video, X } from 'lucide-react';

interface Member extends DMMemberRow {
  profiles: Profile | null;
}

function activeCustomStatus(p: Profile): string {
  if (!p.custom_status) return '';
  if (p.custom_status_expires_at && new Date(p.custom_status_expires_at).getTime() < Date.now()) return '';
  return p.custom_status;
}

function presenceLabel(status: string): string {
  if (status === 'invisible' || status === 'hors_ligne') return 'Hors ligne';
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name);
const isAudioName = (name: string) => /\.(mp3|wav|ogg|oga|m4a|webm|opus)$/i.test(name);

/** Affiche une pièce jointe via URL signée (jamais d'URL publique devinable). */
function Attachment({ path, name }: { path: string; name: string }) {
  const { sb } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    sb.storage
      .from('pieces-jointes')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path, sb]);

  if (failed) return <p className="mt-1 text-xs text-muted">Pièce jointe indisponible.</p>;
  if (!url) return <p className="mt-1 text-xs text-muted">Chargement de la pièce jointe…</p>;
  if (isImageName(name)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block max-w-md">
        <img src={url} alt={name} className="max-h-72 rounded-xl border border-line" loading="lazy" />
      </a>
    );
  }
  if (isAudioName(name)) {
    return (
      <div className="mt-2 max-w-md">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl bg-surface2 px-3 py-2 text-sm hover:bg-line"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
      <span className="truncate">{name}</span>
    </a>
  );
}

function MediaThumb({ path, name }: { path: string; name: string }) {
  const { sb } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    sb.storage.from('pieces-jointes').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (alive && !error && data) setUrl(data.signedUrl);
    });
    return () => {
      alive = false;
    };
  }, [path, sb]);
  if (!url) return <div className="aspect-square animate-pulse rounded-xl bg-surface2" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
      <img src={url} alt={name} className="aspect-square w-full object-cover" loading="lazy" />
    </a>
  );
}

const phoneIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const videoIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 8-6 4 6 4V8Z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
);
const searchIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

export default function Conversation() {
  const { dmId } = useParams<{ dmId: string }>();
  const { sb, user, settings, saveSettings } = useAuth();
  const { startCall } = useCall();
  const { online, setTyping } = usePresence();
  const navigate = useNavigate();

  const [dm, setDm] = useState<DM | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [reactionsReady, setReactionsReady] = useState(false);
  const [pins, setPins] = useState<MessagePin[]>([]);
  const [pinsReady, setPinsReady] = useState(false);
  const [polls, setPolls] = useState<Record<string, MessagePoll>>({});
  const [pollVotes, setPollVotes] = useState<MessagePollVote[]>([]);
  const [pollsReady, setPollsReady] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState<'membres' | 'medias' | 'epingles'>('membres');
  const [showMenu, setShowMenu] = useState(false);
  const [sheetMsg, setSheetMsg] = useState<Message | null>(null);
  const [translateId, setTranslateId] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(isDevMode());

  useEffect(() => {
    const onDev = () => setDevMode(isDevMode());
    window.addEventListener('kora:dev-mode-changed', onDev);
    return () => window.removeEventListener('kora:dev-mode-changed', onDev);
  }, []);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [toast, setToast] = useState('');
  const [convPinned, setConvPinned] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardDMs, setForwardDMs] = useState<{ id: string; title: string }[]>([]);
  const [forwarding, setForwarding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  // Temps réel dégradé : le canal ne s'est pas connecté → rafraîchissement
  // automatique (filet de sécurité, jamais de refresh manuel demandé).
  const [rtDegraded, setRtDegraded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMark = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  // Canal unique par instance/montage : sb.channel() réutilise un canal existant
  // du même nom, et ajouter des écouteurs après subscribe() fait planter l'app.
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const me = user?.id ?? '';
  const muted = settings?.dm_mute.includes(dmId ?? '') ?? false;
  const profilesById = new Map<string, Profile>();
  for (const m of members) {
    if (m.profiles) profilesById.set(m.user_id, m.profiles);
  }
  const friend = !dm?.is_group ? members.find((m) => m.user_id !== me)?.profiles ?? null : null;

  // Pseudos connus de cette conversation (surlignage des @mentions).
  const mentionNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      const u = m.profiles?.username;
      if (u) set.add(u.toLowerCase());
    }
    return set;
  }, [members]);

  // Clic sur un @pseudo dans un message → fiche profil (membre d'abord, sinon
  // recherche par pseudo ; rien si introuvable).
  const openMentionProfile = useCallback(
    async (username: string) => {
      const lower = username.toLowerCase();
      const local = members.find((m) => m.profiles?.username?.toLowerCase() === lower)?.profiles ?? null;
      if (local) {
        setProfileTarget(local);
        setShowProfile(true);
        return;
      }
      const { data } = await sb.from('profiles').select('*').ilike('username', escapeIlike(username)).maybeSingle();
      if (data) {
        setProfileTarget(data as Profile);
        setShowProfile(true);
      }
    },
    [sb, members],
  );
  const pinnedIds = useMemo(() => new Set(pins.map((x) => x.message_id)), [pins]);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  };

  const nearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };
  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const markRead = useCallback(async () => {
    if (!dmId || !me) return;
    const now = Date.now();
    if (now - lastMark.current < 2000) return;
    lastMark.current = now;
    await sb.from('dm_members').update({ last_read_at: new Date().toISOString() }).eq('dm_id', dmId).eq('user_id', me);
  }, [sb, dmId, me]);

  const load = useCallback(async () => {
    if (!dmId || !me) return;
    setLoading(true);
    setNotMember(false);
    const { data: dmData, error: dmErr } = await sb.from('dms').select('*').eq('id', dmId).single();
    if (dmErr || !dmData) {
      setNotMember(true);
      setLoading(false);
      return;
    }
    const { data: memberRows } = await sb.from('dm_members').select('dm_id, user_id, joined_at, last_read_at, profiles(*)').eq('dm_id', dmId);
    const mems = (memberRows ?? []) as unknown as Member[];
    if (!mems.some((m) => m.user_id === me)) {
      setNotMember(true);
      setLoading(false);
      return;
    }
    const { data: msgRows } = await sb.from('messages').select('*').eq('dm_id', dmId).order('created_at', { ascending: true }).limit(500);
    const msgs = (msgRows ?? []) as Message[];
    const ids = msgs.map((m) => m.id);

    // Réactions + épinglés (nécessitent la migration 20261023_reactions_pins.sql)
    let rReady = false;
    let pReady = false;
    if (ids.length > 0) {
      const { data: rRows, error: rErr } = await sb.from('message_reactions').select('*').in('message_id', ids);
      if (!rErr) {
        rReady = true;
        setReactions((rRows ?? []) as MessageReaction[]);
      }
      const { data: pRows, error: pErr } = await sb.from('message_pins').select('*').in('message_id', ids);
      if (!pErr) {
        pReady = true;
        setPins((pRows ?? []) as MessagePin[]);
      }
    } else {
      rReady = true;
      pReady = true;
    }
    setReactionsReady(rReady);
    setPinsReady(pReady);

    // Sondages (nécessitent la migration 20261023_polls.sql)
    let pollReady = false;
    if (ids.length > 0) {
      const { data: pollRows, error: pollErr } = await sb.from('message_polls').select('*').in('message_id', ids);
      if (!pollErr) {
        pollReady = true;
        const pr = (pollRows ?? []) as MessagePoll[];
        const map: Record<string, MessagePoll> = {};
        for (const p of pr) map[p.message_id] = p;
        setPolls(map);
        if (pr.length > 0) {
          const { data: vRows } = await sb.from('message_poll_votes').select('*').in('poll_id', pr.map((p) => p.id));
          setPollVotes((vRows ?? []) as MessagePollVote[]);
        } else {
          setPollVotes([]);
        }
      }
    } else {
      pollReady = true;
      setPolls({});
      setPollVotes([]);
    }
    setPollsReady(pollReady);

    // Amitié éventuelle (pour la fiche profil « Ami(e) depuis le »)
    const other = mems.find((m) => m.user_id !== me);
    if (other && !(dmData as DM).is_group) {
      const { data: fs } = await sb
        .from('friendships')
        .select('*')
        .or(`and(requester_id.eq.${me},addressee_id.eq.${other.user_id}),and(requester_id.eq.${other.user_id},addressee_id.eq.${me})`)
        .eq('status', 'accepted')
        .maybeSingle();
      setFriendship((fs as Friendship) ?? null);
    } else {
      setFriendship(null);
    }

    setDm(dmData as DM);
    setGroupName((dmData as DM).name ?? '');
    setMembers(mems);
    setMessages(msgs);
    // Journal d'appels (nécessite la migration 20261025_calls_stickers.sql ;
    // erreur ignorée silencieusement si la table n'existe pas encore).
    sb.from('call_logs')
      .select('*')
      .eq('dm_id', dmId)
      .order('started_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setCallLogs((data ?? []) as CallLog[]);
      });
    setConvPinned(getPinnedDMs().includes(dmId));
    setLoading(false);
    requestAnimationFrame(() => scrollToBottom(false));
    // Lien copié vers un message précis (#msg-<id>) : y sauter directement
    const hash = window.location.hash;
    if (hash.startsWith('#msg-')) {
      const targetId = hash.slice(5);
      window.setTimeout(() => jumpTo(targetId), 400);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    markRead();
  }, [sb, dmId, me, markRead, channelTag]);

  useEffect(() => {
    setDraft('');
    setReplyTo(null);
    setEditingId(null);
    setShowSearch(false);
    setSearchQ('');
    setSearchResults([]);
    setShowPanel(false);
    setPanelTab('membres');
    setNewBelow(false);
    setSheetMsg(null);
    setShowProfile(false);
    load();
  }, [dmId, load]);

  // Temps réel : messages. Canal dédié et isolé : si une table optionnelle
  // (réactions, épinglés) est absente, cela ne doit JAMAIS casser les messages.
  useEffect(() => {
    if (!dmId || !me) return;
    let subscribed = false;
    const ch = sb
      .channel(`dm:${dmId}:${channelTag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `dm_id=eq.${dmId}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (nearBottom()) {
          requestAnimationFrame(() => scrollToBottom());
          markRead();
        } else {
          setNewBelow(true);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `dm_id=eq.${dmId}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `dm_id=eq.${dmId}` }, (payload) => {
        const old = payload.old as { id: string };
        setMessages((prev) => prev.filter((x) => x.id !== old.id));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          setRtDegraded(false);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRtDegraded(true);
        }
      });
    // Si le canal ne se connecte pas sous 5 s, on bascule sur le filet.
    const degradedTimer = window.setTimeout(() => {
      if (!subscribed) setRtDegraded(true);
    }, 5000);
    return () => {
      window.clearTimeout(degradedTimer);
      ch.unsubscribe();
    };
  }, [sb, dmId, me, markRead, channelTag]);

  // Filet de sécurité : si le temps réel est en panne, rafraîchir les
  // messages toutes les 5 s tant que la vue est ouverte. L'utilisateur ne
  // doit jamais avoir à rafraîchir la page manuellement.
  useEffect(() => {
    if (!rtDegraded || !dmId) return;
    const t = window.setInterval(async () => {
      const { data } = await sb.from('messages').select('*').eq('dm_id', dmId).order('created_at', { ascending: true }).limit(500);
      if (data) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = (data as Message[]).filter((m) => !known.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [rtDegraded, sb, dmId]);

  // Temps réel : journal d'appels (table optionnelle, migration 20261025).
  useEffect(() => {
    if (!dmId || !me) return;
    const ch = sb
      .channel(`dm:${dmId}:calls:${channelTag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs', filter: `dm_id=eq.${dmId}` }, (payload) => {
        const c = payload.new as CallLog;
        setCallLogs((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, dmId, me, channelTag]);

  // Temps réel : réactions + épinglés, UNIQUEMENT si les tables existent
  // (migration 20261023_reactions_pins.sql appliquée).
  useEffect(() => {
    if (!dmId || !me || !reactionsReady) return;
    const ch = sb
      .channel(`dm:${dmId}:rx:${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        const row = (payload.new ?? payload.old) as MessageReaction;
        if (!row?.message_id) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          if (!known.has(row.message_id)) return prev;
          if (payload.eventType === 'INSERT') {
            setReactions((rs) => (rs.some((r) => r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji) ? rs : [...rs, row as MessageReaction]));
          } else if (payload.eventType === 'DELETE') {
            setReactions((rs) => rs.filter((r) => !(r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji)));
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_pins' }, (payload) => {
        const row = (payload.new ?? payload.old) as MessagePin;
        if (!row?.message_id) return;
        setMessages((prev) => {
          if (!prev.some((m) => m.id === row.message_id)) return prev;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setPins((ps) => (ps.some((x) => x.message_id === row.message_id) ? ps : [...ps, row as MessagePin]));
          } else if (payload.eventType === 'DELETE') {
            setPins((ps) => ps.filter((x) => x.message_id !== row.message_id));
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, dmId, me, reactionsReady, channelTag]);

  // Temps réel : sondages + votes, UNIQUEMENT si les tables existent
  // (migration 20261023_polls.sql appliquée).
  useEffect(() => {
    if (!dmId || !me || !pollsReady) return;
    const ch = sb
      .channel(`dm:${dmId}:polls:${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_polls' }, (payload) => {
        const row = (payload.new ?? payload.old) as MessagePoll;
        if (!row?.message_id) return;
        setMessages((prev) => {
          if (!prev.some((m) => m.id === row.message_id)) return prev;
          if (payload.eventType === 'DELETE') {
            setPolls((ps) => {
              const n = { ...ps };
              delete n[row.message_id];
              return n;
            });
            setPollVotes((vs) => vs.filter((v) => v.poll_id !== row.id));
          } else {
            setPolls((ps) => ({ ...ps, [row.message_id]: row as MessagePoll }));
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_poll_votes' }, (payload) => {
        const row = (payload.new ?? payload.old) as MessagePollVote;
        if (!row?.poll_id) return;
        setPolls((ps) => {
          const known = new Set(Object.values(ps).map((p) => p.id));
          if (!known.has(row.poll_id)) return ps;
          if (payload.eventType === 'INSERT') {
            setPollVotes((vs) =>
              vs.some((v) => v.poll_id === row.poll_id && v.user_id === row.user_id)
                ? vs
                : [...vs, row as MessagePollVote],
            );
          } else if (payload.eventType === 'DELETE') {
            setPollVotes((vs) => vs.filter((v) => !(v.poll_id === row.poll_id && v.user_id === row.user_id)));
          }
          return ps;
        });
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, dmId, me, pollsReady, channelTag]);

  const onScroll = () => {
    if (nearBottom()) {
      setNewBelow(false);
      markRead();
    }
  };

  const send = async () => {
    const content = draft.trim();
    if ((!content && !file) || sending || !dmId) return;
    setSending(true);
    setSendError('');
    try {
      let attachment_path: string | null = null;
      let attachment_name: string | null = null;
      if (file) {
        if (file.size > 25 * 1024 * 1024) throw new Error('Le fichier dépasse 25 Mo.');
        const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
        attachment_path = `${dmId}/${crypto.randomUUID()}_${safeName}`;
        attachment_name = file.name;
        const { error: upErr } = await sb.storage.from('pieces-jointes').upload(attachment_path, file);
        if (upErr) throw upErr;
      }
      const { data: inserted, error } = await sb.from('messages').insert({
        dm_id: dmId,
        author_id: me,
        content,
        attachment_path,
        attachment_name,
        reply_to: replyTo?.id ?? null,
      }).select().single();
      if (error) throw error;
      // Envoi optimiste : le message apparaît immédiatement, sans attendre
      // l'écho temps réel (dédupliqué par id si l'écho arrive ensuite).
      if (inserted) {
        const m = inserted as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
      setDraft('');
      setFile(null);
      setReplyTo(null);
      setTyping(null);
      requestAnimationFrame(() => scrollToBottom());
      markRead();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const ta = composerRef.current;
    if (!ta) {
      setDraft((d) => d + emoji);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
    });
  };

  /**
   * Envoi d'un GIF Tenor : l'URL distante est envoyée comme contenu du message
   * et rendue comme image par MessageContent. Choix documenté : éviter un
   * téléchargement + ré-upload (souvent bloqué par CORS) et ne pas dupliquer
   * des gigaoctets de GIF dans le Storage. L'URL reste celle de Tenor.
   */
  const sendGif = async (url: string) => {
    if (!dmId || sending) return;
    setShowEmoji(false);
    setSending(true);
    try {
      const { data: inserted, error } = await sb.from('messages').insert({
        dm_id: dmId,
        author_id: me,
        content: url,
        attachment_path: null,
        attachment_name: null,
        reply_to: null,
      }).select().single();
      if (error) throw error;
      if (inserted) {
        const m = inserted as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
      requestAnimationFrame(() => scrollToBottom());
      markRead();
    } catch {
      setSendError('Envoi du GIF impossible.');
    } finally {
      setSending(false);
    }
  };

  /**
   * Envoi d'un autocollant de serveur : le fichier est COPIÉ dans le bucket
   * « pieces-jointes » (pièce jointe normale). Ainsi, supprimer l'autocollant
   * du serveur ne casse jamais les anciens messages.
   */
  const sendSticker = async (sticker: { image_path: string; name: string }) => {
    if (!dmId || sending) return;
    setShowEmoji(false);
    setSending(true);
    try {
      const { data: signed } = await sb.storage.from('stickers').createSignedUrl(sticker.image_path, 300);
      if (!signed) throw new Error('Autocollant indisponible.');
      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error('Téléchargement impossible.');
      const blob = await res.blob();
      const ext = sticker.image_path.split('.').pop()?.toLowerCase() || 'png';
      const path = `${dmId}/${crypto.randomUUID()}_sticker.${ext}`;
      const { error: upErr } = await sb.storage.from('pieces-jointes').upload(path, blob);
      if (upErr) throw upErr;
      const { data: inserted, error } = await sb.from('messages').insert({
        dm_id: dmId,
        author_id: me,
        content: '',
        attachment_path: path,
        attachment_name: `autocollant-${sticker.name}.${ext}`,
        reply_to: null,
      }).select().single();
      if (error) throw error;
      if (inserted) {
        const m = inserted as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      }
      requestAnimationFrame(() => scrollToBottom());
      markRead();
    } catch {
      setSendError('Envoi de l’autocollant impossible.');
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async (m: Message) => {
    const content = editText.trim();
    if (!content) return;
    const { error } = await sb.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', m.id);
    if (!error) setEditingId(null);
  };

  const doDelete = async (m: Message) => {
    setDeleteTarget(null);
    setSheetMsg(null);
    await sb.from('messages').delete().eq('id', m.id);
    if (m.attachment_path) {
      await sb.storage.from('pieces-jointes').remove([m.attachment_path]).catch(() => {});
    }
  };

  const copyText = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.content);
      flash('Texte copié.');
    } catch {
      flash('Copie impossible.');
    }
    setSheetMsg(null);
  };

  const toggleReaction = async (msgId: string, emoji: string) => {
    setSheetMsg(null);
    if (!reactionsReady) {
      flash('Réactions indisponibles : exécute la migration SQL « 20261023_reactions_pins.sql » dans Supabase.');
      return;
    }
    const mine = reactions.some((r) => r.message_id === msgId && r.user_id === me && r.emoji === emoji);
    // Optimiste
    setReactions((rs) =>
      mine
        ? rs.filter((r) => !(r.message_id === msgId && r.user_id === me && r.emoji === emoji))
        : [...rs, { message_id: msgId, user_id: me, emoji, created_at: new Date().toISOString() }],
    );
    const { error } = mine
      ? await sb.from('message_reactions').delete().eq('message_id', msgId).eq('user_id', me).eq('emoji', emoji)
      : await sb.from('message_reactions').insert({ message_id: msgId, user_id: me, emoji });
    if (error) {
      // Annule l'optimiste
      setReactions((rs) =>
        mine
          ? [...rs, { message_id: msgId, user_id: me, emoji, created_at: new Date().toISOString() }]
          : rs.filter((r) => !(r.message_id === msgId && r.user_id === me && r.emoji === emoji)),
      );
      flash('Réaction impossible pour le moment.');
    }
  };

  const togglePin = async (m: Message) => {
    setSheetMsg(null);
    if (!pinsReady) {
      flash('Épinglés indisponibles : exécute la migration SQL « 20261023_reactions_pins.sql » dans Supabase.');
      return;
    }
    const isPinned = pinnedIds.has(m.id);
    setPins((ps) =>
      isPinned ? ps.filter((x) => x.message_id !== m.id) : [...ps, { message_id: m.id, pinned_by: me, pinned_at: new Date().toISOString() }],
    );
    const { error } = isPinned
      ? await sb.from('message_pins').delete().eq('message_id', m.id)
      : await sb.from('message_pins').insert({ message_id: m.id, pinned_by: me });
    if (error) {
      setPins((ps) =>
        isPinned ? [...ps, { message_id: m.id, pinned_by: me, pinned_at: new Date().toISOString() }] : ps.filter((x) => x.message_id !== m.id),
      );
      flash('Épinglage impossible pour le moment.');
    } else {
      flash(isPinned ? 'Message désépinglé.' : 'Message épinglé.');
    }
  };

  const markUnread = async (m: Message) => {
    if (!dmId) return;
    setSheetMsg(null);
    await sb.from('dm_members').update({ last_read_at: new Date(new Date(m.created_at).getTime() - 1).toISOString() }).eq('dm_id', dmId).eq('user_id', me);
    flash('Message marqué comme non lu.');
  };

  const copyMessageLink = async (m: Message) => {
    setSheetMsg(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/dm/${dmId}#msg-${m.id}`);
      flash('Lien du message copié.');
    } catch {
      flash('Copie impossible.');
    }
  };

  const openForward = async (m: Message) => {
    setSheetMsg(null);
    setForwardMsg(m);
    setForwardDMs([]);
    const { data: memberships } = await sb.from('dm_members').select('dm_id').eq('user_id', me);
    const ids = ((memberships ?? []) as { dm_id: string }[]).map((r) => r.dm_id).filter((id) => id !== dmId);
    if (ids.length === 0) return;
    const [{ data: dms }, { data: mems }] = await Promise.all([
      sb.from('dms').select('id,name,is_group').in('id', ids),
      sb.from('dm_members').select('dm_id,user_id,profiles(id,username,display_name)').in('dm_id', ids),
    ]);
    const profByDm = new Map<string, Profile[]>();
    for (const r of (mems ?? []) as unknown as { dm_id: string; user_id: string; profiles: Profile }[]) {
      if (!r.profiles) continue;
      const arr = profByDm.get(r.dm_id) ?? [];
      arr.push(r.profiles);
      profByDm.set(r.dm_id, arr);
    }
    const list = ((dms ?? []) as { id: string; name: string | null; is_group: boolean }[]).map((d) => {
      const others = (profByDm.get(d.id) ?? []).filter((p) => p.id !== me);
      return {
        id: d.id,
        title: d.is_group ? d.name || 'Groupe sans nom' : others[0]?.display_name || others[0]?.username || 'Conversation',
      };
    });
    setForwardDMs(list);
  };

  const doForward = async (targetId: string) => {
    const m = forwardMsg;
    if (!m || forwarding) return;
    setForwarding(true);
    try {
      let attachment_path: string | null = null;
      let attachment_name: string | null = null;
      if (m.attachment_path) {
        const { data: blob, error: dlErr } = await sb.storage.from('pieces-jointes').download(m.attachment_path);
        if (dlErr || !blob) throw dlErr ?? new Error('Téléchargement impossible.');
        const safeName = (m.attachment_name ?? 'fichier').replace(/[^\w.\-() ]+/g, '_');
        attachment_path = `${targetId}/${crypto.randomUUID()}_${safeName}`;
        attachment_name = m.attachment_name;
        const { error: upErr } = await sb.storage.from('pieces-jointes').upload(attachment_path, blob);
        if (upErr) throw upErr;
      }
      const { error } = await sb.from('messages').insert({
        dm_id: targetId,
        author_id: me,
        content: m.content,
        attachment_path,
        attachment_name,
        reply_to: null,
      });
      if (error) throw error;
      setForwardMsg(null);
      flash('Message transféré.');
    } catch {
      flash('Transfert impossible.');
    } finally {
      setForwarding(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (!q || !dmId) return;
    setSearching(true);
    const { data } = await sb
      .from('messages')
      .select('*')
      .eq('dm_id', dmId)
      .ilike('content', `%${q.replace(/[%_]/g, '')}%`)
      .order('created_at', { ascending: false })
      .limit(50);
    setSearchResults((data ?? []) as Message[]);
    setSearching(false);
  };

  const jumpTo = (id: string) => {
    const el = msgRefs.current[id];
    if (el) {
      el.scrollIntoView({ block: 'center' });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2000);
    }
  };

  const toggleMute = async () => {
    if (!dmId || !settings) return;
    const list = settings.dm_mute.includes(dmId)
      ? settings.dm_mute.filter((id) => id !== dmId)
      : [...settings.dm_mute, dmId];
    await saveSettings({ dm_mute: list });
    flash(settings.dm_mute.includes(dmId) ? 'Notifications réactivées.' : 'Conversation en sourdine.');
  };

  const toggleConvPin = () => {
    if (!dmId) return;
    const cur = getPinnedDMs();
    const next = cur.includes(dmId) ? cur.filter((id) => id !== dmId) : [dmId, ...cur];
    setPinnedDMs(next);
    setConvPinned(next.includes(dmId));
    flash(next.includes(dmId) ? 'Conversation épinglée en haut.' : 'Conversation désépinglée.');
  };

  const markAsRead = async () => {
    lastMark.current = 0;
    await markRead();
    flash('Conversation marquée comme lue.');
  };

  const closeDM = async () => {
    if (!dmId) return;
    await sb.from('dm_members').delete().eq('dm_id', dmId).eq('user_id', me);
    navigate('/app/dm');
  };

  const saveGroupName = async () => {
    if (!dmId) return;
    const name = groupName.trim();
    if (!name) return;
    await sb.from('dms').update({ name }).eq('id', dmId);
    setDm((d) => (d ? { ...d, name } : d));
    setRenaming(false);
  };

  const removeMember = async (userId: string) => {
    if (!dmId) return;
    await sb.from('dm_members').delete().eq('dm_id', dmId).eq('user_id', userId);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const leave = async () => {
    if (!dmId) return;
    await sb.from('dm_members').delete().eq('dm_id', dmId).eq('user_id', me);
    navigate('/app/dm');
  };

  const openMessageTo = async (profile: Profile) => {
    setShowProfile(false);
    setSheetMsg(null);
    try {
      const dmId = await openDirectDM(sb, me, profile.id);
      navigate(`/app/dm/${dmId}`);
    } catch {
      flash('Ouverture de la conversation impossible.');
    }
  };

  // Appui long (mobile) + clic droit (bureau) sur un message
  const startPress = (m: Message) => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setSheetMsg(m), 550);
  };
  const endPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Chargement de la conversation…</p>
      </div>
    );
  }
  if (notMember || !dm) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-lg font-extrabold">Conversation introuvable</h2>
        <p className="text-sm text-muted">Elle n’existe pas ou tu n’y as plus accès.</p>
        <button
          onClick={() => { setNotMember(false); setLoading(true); load(); }}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          Réessayer
        </button>
        <button onClick={() => navigate('/app/dm')} className="text-sm font-medium text-muted hover:text-ink">
          Retour aux discussions
        </button>
      </div>
    );
  }

  const typers = members
    .filter((m) => m.user_id !== me && online[m.user_id]?.typingIn === dmId)
    .map((m) => m.profiles)
    .filter((p): p is Profile => !!p);

  const friendStatus = friend ? online[friend.id]?.status ?? 'hors_ligne' : 'hors_ligne';
  const headerTitle = dm.is_group ? dm.name || 'Groupe sans nom' : friend?.display_name || friend?.username || 'Conversation';
  const headerSub = dm.is_group
    ? `${members.length} membre${members.length > 1 ? 's' : ''}`
    : typers.length > 0
      ? 'en train d’écrire…'
      : friend
        ? activeCustomStatus(friend) || presenceLabel(friendStatus)
        : 'Conversation';

  const replyTarget = (id: string | null) => messages.find((m) => m.id === id) ?? null;

  /** Libellé d'une entrée système d'appel dans le fil. */
  const callLabel = (c: CallLog) => {
    const kind = c.kind === 'video' ? 'Appel vidéo' : 'Appel vocal';
    const date = formatFull(c.started_at);
    if (c.status === 'termine' && c.ended_at) {
      const secs = Math.max(
        0,
        Math.round((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000),
      );
      const dur = secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min${secs % 60 ? ` ${secs % 60} s` : ''}`;
      return `${kind} terminé — ${dur} — ${date}`;
    }
    if (c.status === 'refuse') return `${kind} refusé — ${date}`;
    return `${kind} manqué — ${date}`;
  };

  /** Fil chronologique : messages + entrées système d'appels. */
  const timeline: Array<Message | CallLog> = [...messages, ...callLogs].sort((a, b) => {
    const ta = 'started_at' in a ? a.started_at : a.created_at;
    const tb = 'started_at' in b ? b.started_at : b.created_at;
    return ta.localeCompare(tb);
  });

  const reactionsByMsg = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactions) {
    const arr = reactionsByMsg.get(r.message_id) ?? [];
    const found = arr.find((x) => x.emoji === r.emoji);
    if (found) {
      found.count += 1;
      if (r.user_id === me) found.mine = true;
    } else {
      arr.push({ emoji: r.emoji, count: 1, mine: r.user_id === me });
    }
    reactionsByMsg.set(r.message_id, arr);
  }

  const mediaMessages = messages.filter((m) => m.attachment_path && isImageName(m.attachment_name ?? ''));
  const fileMessages = messages.filter((m) => m.attachment_path && !isImageName(m.attachment_name ?? ''));
  const pinnedMessages = messages.filter((m) => pinnedIds.has(m.id));

  const headerClick = () => {
    if (dm.is_group) {
      setPanelTab('membres');
      setShowPanel(true);
    } else if (friend) {
      setProfileTarget(friend);
      setShowProfile(true);
    }
  };

  let lastDay = '';
  let lastAuthor = '';
  let lastTs = 0;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête façon Discord (48 px) */}
        <div className="border-b border-line px-2 md:px-4">
          <div className="flex h-12 items-center gap-1">
            <button
              onClick={() => navigate('/app/dm')}
              className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink md:hidden"
              aria-label="Retour aux conversations"
              title="Retour"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5 M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={headerClick} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1 text-left hover:bg-surface2/60" title="Voir le profil">
              {dm.is_group ? (
                <Avatar profile={null} size={40} />
              ) : (
                <Avatar profile={friend} size={40} status={friendStatus} showStatus />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate font-extrabold">{headerTitle}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
                <span className="block truncate text-xs text-muted">{headerSub}</span>
              </span>
            </button>
            <button
              onClick={() => {
                if (dm.is_group) {
                  flash('Les appels de groupe arrivent avec une prochaine mise à jour de Kora.');
                } else if (friend) {
                  startCall(dmId!, friend, 'audio');
                }
              }}
              className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-surface2 hover:text-ink"
              title="Appel vocal"
              aria-label="Appel vocal"
            >
              {phoneIcon}
            </button>
            <button
              onClick={() => {
                if (dm.is_group) {
                  flash('Les appels de groupe arrivent avec une prochaine mise à jour de Kora.');
                } else if (friend) {
                  startCall(dmId!, friend, 'video');
                }
              }}
              className="shrink-0 rounded-lg p-2.5 text-muted hover:bg-surface2 hover:text-ink"
              title="Appel vidéo"
              aria-label="Appel vidéo"
            >
              {videoIcon}
            </button>
            <button
              onClick={() => setShowSearch((s) => !s)}
              className={`shrink-0 rounded-lg p-2.5 ${showSearch ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'}`}
              title="Rechercher dans la conversation"
              aria-label="Rechercher"
            >
              {searchIcon}
            </button>
            <button
              onClick={() => { setPanelTab('membres'); setShowPanel((s) => !s); }}
              className={`shrink-0 rounded-lg p-2.5 ${showPanel && panelTab === 'membres' ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'}`}
              title="Membres et infos"
              aria-label="Membres et infos"
            >
              <Users size={18} />
            </button>
            <div className="relative hidden shrink-0 md:block">
              <button
                onClick={() => setShowMenu((s) => !s)}
                className="rounded-lg p-2.5 text-muted hover:bg-surface2 hover:text-ink"
                aria-label="Options de la conversation"
                title="Options"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-2xl">
                  <button onClick={() => { markAsRead(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">Marquer comme lu</button>
                  <button onClick={() => { toggleMute(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">{muted ? 'Réactiver les notifications' : 'Rendre cette conversation muette'}</button>
                  <button onClick={() => { toggleConvPin(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">{convPinned ? 'Désépingler la conversation' : 'Épingler la conversation'}</button>
                  <button onClick={() => { setPanelTab('epingles'); setShowPanel(true); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">Messages épinglés</button>
                  {dm.is_group ? (
                    <button onClick={() => { setConfirmLeave(true); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface2">Quitter le groupe</button>
                  ) : (
                    <button onClick={() => { closeDM(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface2">Fermer le MP</button>
                  )}
                </div>
              )}
            </div>
            <div className="relative shrink-0 md:hidden">
              <button
                onClick={() => setShowMenu((s) => !s)}
                className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink"
                aria-label="Options de la conversation"
                title="Options"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-2xl">
                  <button onClick={() => { markAsRead(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">Marquer comme lu</button>
                  <button onClick={() => { toggleMute(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">{muted ? 'Réactiver les notifications' : 'Rendre cette conversation muette'}</button>
                  <button onClick={() => { toggleConvPin(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">{convPinned ? 'Désépingler la conversation' : 'Épingler la conversation'}</button>
                  <button onClick={() => { setPanelTab('epingles'); setShowPanel(true); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2">Messages épinglés</button>
                  {dm.is_group ? (
                    <button onClick={() => { setConfirmLeave(true); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface2">Quitter le groupe</button>
                  ) : (
                    <button onClick={() => { closeDM(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface2">Fermer le MP</button>
                  )}
                </div>
              )}
            </div>
          </div>
          {showSearch && (
            <div className="mt-2 px-1">
              <form onSubmit={runSearch} className="flex items-center gap-2 rounded-xl border border-primary bg-surface2 px-3 py-2">
                <span className="text-muted">{searchIcon}</span>
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={`Rechercher dans @${dm.is_group ? (dm.name || 'groupe') : (friend?.username || '')}`}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  autoFocus
                />
                {searchQ && (
                  <button type="button" onClick={() => { setSearchQ(''); setSearchResults([]); }} className="text-muted hover:text-ink" aria-label="Effacer"><X size={16} /></button>
                )}
              </form>
              {searching && <p className="mt-2 px-1 text-sm text-muted">Recherche…</p>}
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface">
                  {searchResults.map((m) => {
                    const a = profilesById.get(m.author_id);
                    return (
                      <button key={m.id} onClick={() => jumpTo(m.id)} className="block w-full px-4 py-2 text-left text-sm hover:bg-surface2">
                        <span className="font-semibold">{a?.display_name || a?.username || 'Inconnu'}</span>
                        <span className="text-muted"> — {m.content.slice(0, 80) || (m.attachment_name ?? '')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {searchQ.trim() && !searching && searchResults.length === 0 && (
                <p className="mt-2 px-1 text-sm text-muted">Aucun message trouvé.</p>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={onScroll} className="relative mx-auto w-full min-[1600px]:max-w-[820px] flex-1 overflow-y-auto px-3 py-4 md:px-5">
          {timeline.length === 0 ? (
            <EmptyState
              title="Aucun message pour l’instant"
              text={dm.is_group ? 'Lance la discussion !' : `Dis bonjour à ${friend?.display_name || friend?.username || 'ton ami'} !`}
            />
          ) : (
            timeline.map((item) => {
              // Entrée système : appel terminé / manqué / refusé.
              if ('caller_id' in item) {
                const c = item;
                const day = formatDay(c.started_at);
                const showDay = day !== lastDay;
                lastDay = day;
                lastAuthor = '';
                lastTs = 0;
                return (
                  <div key={c.id}>
                    {showDay && (
                      <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-line" />
                        <span className="text-xs font-semibold text-muted">{day}</span>
                        <div className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <div className="my-2 flex items-center justify-center gap-2 rounded-xl bg-surface2/60 px-3 py-2 text-center text-xs text-muted">
                      <span>{c.kind === 'video' ? <Video size={14} /> : <Phone size={14} />}</span>
                      <span>{callLabel(c)}</span>
                    </div>
                  </div>
                );
              }
              const m = item;
              const author = profilesById.get(m.author_id);
              const isMe = m.author_id === me;
              const day = formatDay(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const ts = new Date(m.created_at).getTime();
              const compact = !showDay && m.author_id === lastAuthor && ts - lastTs < 5 * 60 * 1000 && !m.reply_to;
              lastAuthor = m.author_id;
              lastTs = ts;
              const replied = m.reply_to ? replyTarget(m.reply_to) : null;
              const repliedAuthor = replied ? profilesById.get(replied.author_id) : null;
              const rcts = reactionsByMsg.get(m.id) ?? [];
              const isPinned = pinnedIds.has(m.id);

              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-line" />
                      <span className="text-xs font-semibold text-muted">{day}</span>
                      <div className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <div
                    id={`msg-${m.id}`}
                    ref={(el) => {
                      msgRefs.current[m.id] = el;
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSheetMsg(m);
                    }}
                    onDoubleClick={() => toggleReaction(m.id, '❤️')}
                    onTouchStart={() => startPress(m)}
                    onTouchEnd={endPress}
                    onTouchMove={endPress}
                    className={`msg group relative flex select-none gap-3 rounded-lg px-2 py-1 ${compact ? 'mt-0.5' : 'mt-3'} ${
                      highlightId === m.id ? 'bg-accent/15' : 'hover:bg-surface/60'
                    }`}
                  >
                    {!compact ? (
                      <button onClick={() => { if (author) { setProfileTarget(author); setShowProfile(true); } }} className="shrink-0 self-start" aria-label="Voir le profil">
                        <Avatar profile={author ?? null} size={38} />
                      </button>
                    ) : (
                      <span className="w-[38px] shrink-0 pt-0.5 text-center text-[10px] text-muted opacity-0 group-hover:opacity-100">
                        {formatTime(m.created_at)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {!compact && (
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <button
                            onClick={() => { if (author) { setProfileTarget(author); setShowProfile(true); } }}
                            className={`flex items-center gap-1.5 text-sm font-bold hover:underline ${isMe ? 'text-primary' : ''}`}
                          >
                            <span>{author?.display_name || author?.username || 'Inconnu'}</span>
                            {author?.is_verified && <VerifiedBadge size={14} />}
                          </button>
                          {isPinned && <Pin size={14} className="text-muted" />}
                          <span className="text-[11px] text-muted" title={formatFull(m.created_at)}>
                            {formatTime(m.created_at)}
                          </span>
                        </p>
                      )}
                      {replied && (
                        <p className="mb-1 truncate border-l-2 border-primary/50 pl-2 text-xs text-muted">
                          En réponse à {repliedAuthor?.display_name || repliedAuthor?.username || 'un message supprimé'} :{' '}
                          {replied.content.slice(0, 100) || (replied.attachment_name ?? '')}
                        </p>
                      )}
                      {m.reply_to && !replied && (
                        <p className="mb-1 text-xs italic text-muted">Message d’origine supprimé.</p>
                      )}
                      {editingId === m.id ? (
                        <div className="mt-1">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <div className="mt-1 flex gap-2">
                            <button onClick={() => saveEdit(m)} className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white">
                              Enregistrer
                            </button>
                            <button onClick={() => setEditingId(null)} className="rounded-lg bg-surface2 px-3 py-1 text-xs hover:bg-line">
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.content && (
                            <MessageContent
                              content={m.content}
                              mentionNames={mentionNames}
                              onMentionClick={openMentionProfile}
                            />
                          )}
                          {m.attachment_path && <Attachment path={m.attachment_path} name={m.attachment_name ?? 'fichier'} />}
                          {translateId === m.id && m.content && (
                            <TranslateBlock content={m.content} onClose={() => setTranslateId(null)} />
                          )}
                          {polls[m.id] && (
                            <PollCard
                              poll={polls[m.id]}
                              votes={pollVotes.filter((v) => v.poll_id === polls[m.id].id)}
                              meId={me}
                              flash={flash}
                            />
                          )}
                          {m.edited_at && <span className="ml-2 text-[11px] text-muted">(modifié)</span>}
                        </>
                      )}
                      {rcts.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rcts.map((r) => (
                            <button
                              key={r.emoji}
                              onClick={() => toggleReaction(m.id, r.emoji)}
                              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${
                                r.mine ? 'border-primary bg-primary/15' : 'border-line bg-surface2 hover:border-primary/50'
                              }`}
                              title="Ajouter / retirer ma réaction"
                            >
                              <span>{r.emoji}</span>
                              <span className={`text-xs font-bold ${r.mine ? 'text-primary' : 'text-muted'}`}>{r.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Barre d'actions flottante au survol (bureau) */}
                    <MessageToolbar
                      onReact={() => setReactionTarget(m)}
                      onReply={() => setReplyTo(m)}
                      onThread={() => setThreadParent(m)}
                      onCopyLink={() => copyMessageLink(m)}
                      canEdit={isMe}
                      onEdit={() => { setEditingId(m.id); setEditText(m.content); }}
                      canDelete={isMe}
                      onDelete={() => setDeleteTarget(m)}
                      onMore={() => setSheetMsg(m)}
                    />
                  </div>
                </div>
              );
            })
          )}
          {typers.length > 0 && (
            <p className="mt-2 text-xs italic text-muted">
              {typers.map((p) => p.display_name || p.username).join(', ')} {typers.length > 1 ? 'sont' : 'est'} en train d’écrire…
            </p>
          )}
        </div>

        {newBelow && (
          <button
            onClick={() => { setNewBelow(false); scrollToBottom(); markRead(); }}
            className="mx-auto mb-2 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-lg"
          >
            Nouveaux messages ↓
          </button>
        )}

        {/* Compositeur façon Discord */}
        <div className="border-t border-line px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:px-5 md:pt-3">
          <div className="mx-auto w-full min-[1600px]:max-w-[820px]">
          {rtDegraded && (
            <p className="mb-2 rounded-lg bg-accent/10 px-3 py-1.5 text-center text-xs text-accent">
              Connexion temps réel interrompue — actualisation automatique active.
            </p>
          )}
          {recording ? (
            <VoiceRecorder onDone={(f) => { setRecording(false); setFile(f); }} onCancel={() => setRecording(false)} />
          ) : (
            <>
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
                  <p className="truncate text-muted">
                    Réponse à <strong className="text-ink">{profilesById.get(replyTo.author_id)?.display_name || 'Inconnu'}</strong> : {replyTo.content.slice(0, 80) || (replyTo.attachment_name ?? '')}
                  </p>
                  <button onClick={() => setReplyTo(null)} className="ml-2 text-muted hover:text-ink" aria-label="Annuler la réponse"><X size={16} /></button>
                </div>
              )}
              {file && (
                <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
                  <p className="truncate">
                    {isAudioName(file.name) ? 'Message vocal prêt' : 'Fichier'} : <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} Ko)
                  </p>
                  <button onClick={() => setFile(null)} className="ml-2 text-muted hover:text-ink" aria-label="Retirer le fichier"><X size={16} /></button>
                </div>
              )}
              <div className="relative flex items-center gap-1 rounded-2xl bg-surface2 px-2 py-1.5">
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                      <button
                        onClick={() => { setShowAttachMenu(false); photoInput.current?.click(); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                      >
                        <Image size={16} /> Photos
                      </button>
                      <button
                        onClick={() => { setShowAttachMenu(false); setShowPollModal(true); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                      >
                        <BarChart3 size={16} /> Sondage
                      </button>
                      <button
                        onClick={() => { setShowAttachMenu(false); fileInput.current?.click(); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                      >
                        <Paperclip size={16} /> Fichiers
                      </button>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowAttachMenu((v) => !v)}
                  className="shrink-0 rounded-full bg-surface p-2 text-muted hover:text-ink"
                  title={showAttachMenu ? 'Fermer le menu' : 'Joindre ou créer'}
                  aria-label={showAttachMenu ? 'Fermer le menu' : 'Joindre un fichier ou créer un sondage'}
                >
                  {showAttachMenu ? (
                    <span className="flex h-[18px] w-[18px] items-center justify-center text-lg font-bold leading-none"><X size={16} /></span>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14 M5 12h14" />
                    </svg>
                  )}
                </button>
                <input ref={fileInput} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                    setTyping(dmId ?? null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={`Envoyer un message ${dm.is_group ? 'au groupe' : `à ${friend?.display_name || friend?.username || ''}`}`}
                  className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted"
                  aria-label="Écrire un message"
                />
                <button
                  onClick={() => setShowEmoji(true)}
                  className="shrink-0 rounded-full p-2 text-muted hover:bg-surface hover:text-ink"
                  title="Émojis"
                  aria-label="Ouvrir le sélecteur d’émojis"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
                {!draft.trim() && !file ? (
                  <button
                    onClick={() => setRecording(true)}
                    className="shrink-0 rounded-full p-2 text-muted hover:bg-surface hover:text-ink"
                    title="Message vocal"
                    aria-label="Enregistrer un message vocal"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10a7 7 0 0 0 14 0 M12 19v3" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={sending}
                    className="shrink-0 rounded-full bg-primary p-2.5 text-white hover:opacity-90 disabled:opacity-50"
                    title="Envoyer"
                    aria-label="Envoyer le message"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m22 2-7 20-4-9-9-4z M22 2 11 13" />
                    </svg>
                  </button>
                )}
              </div>
              {sendError && <p className="mt-1 text-xs text-danger">{sendError}</p>}
            </>
          )}
          </div>
        </div>
      </div>

      {/* Panneau droit : Membres / Médias / Épinglés */}
      {showPanel && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl md:static md:z-auto md:w-80 md:shrink-0 md:shadow-none">
          <div className="flex items-center gap-2 border-b border-line p-4">
            <button onClick={() => setShowPanel(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:hidden" aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5 M12 19l-7-7 7-7" /></svg>
            </button>
            {dm.is_group ? <Avatar profile={null} size={40} /> : <Avatar profile={friend} size={40} status={friendStatus} showStatus />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{headerTitle}</p>
              <p className="truncate text-xs text-muted">{headerSub}</p>
            </div>
            <button onClick={() => setShowPanel(false)} className="hidden rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:block" aria-label="Fermer"><X size={16} /></button>
          </div>
          <div className="flex border-b border-line">
            {(
              [
                ['membres', 'Membres'],
                ['medias', 'Contenu multimédia'],
                ['epingles', 'Messages épinglés'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPanelTab(id)}
                className={`flex-1 border-b-2 px-2 py-2.5 text-xs font-bold sm:text-sm ${
                  panelTab === id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {panelTab === 'membres' && (
              <div className="space-y-1">
                {dm.is_group && dm.created_by === me && !renaming && (
                  <button onClick={() => setRenaming(true)} className="mb-2 text-xs font-bold text-primary hover:underline">
                    Renommer le groupe
                  </button>
                )}
                {renaming && (
                  <div className="mb-3 flex gap-2">
                    <input
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm outline-none focus:border-primary"
                      maxLength={60}
                    />
                    <button onClick={saveGroupName} className="rounded-lg bg-primary px-3 py-1 text-sm font-bold text-white">OK</button>
                  </div>
                )}
                <p className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  Membres — {members.length}
                </p>
                {members.map((m) => {
                  const p = m.profiles;
                  if (!p) return null;
                  const st = online[p.id]?.status ?? 'hors_ligne';
                  return (
                    <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface2/60">
                      <button onClick={() => { setProfileTarget(p); setShowProfile(true); }} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <Avatar profile={p} size={36} status={st} showStatus />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.display_name || p.username}{m.user_id === me && ' (toi)'}</span>
                          <span className="block text-[11px] text-muted">@{p.username}</span>
                        </span>
                      </button>
                      {dm.is_group && dm.created_by === me && m.user_id !== me && (
                        <button onClick={() => removeMember(m.user_id)} className="shrink-0 text-xs text-muted hover:text-danger" title="Retirer du groupe">
                          Retirer
                        </button>
                      )}
                    </div>
                  );
                })}
                {dm.is_group && (
                  <button onClick={() => setConfirmLeave(true)} className="mt-3 w-full rounded-xl bg-surface2 px-4 py-2.5 text-sm font-bold text-danger hover:bg-line">
                    Quitter le groupe
                  </button>
                )}
              </div>
            )}
            {panelTab === 'medias' && (
              <div>
                {mediaMessages.length === 0 && fileMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Aucun contenu multimédia pour l’instant.</p>
                ) : (
                  <>
                    {mediaMessages.length > 0 && (
                      <>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Photos et images</p>
                        <div className="mb-4 grid grid-cols-3 gap-2">
                          {mediaMessages.map((m) => (
                            <MediaThumb key={m.id} path={m.attachment_path!} name={m.attachment_name ?? ''} />
                          ))}
                        </div>
                      </>
                    )}
                    {fileMessages.length > 0 && (
                      <>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Fichiers</p>
                        <div className="space-y-1">
                          {fileMessages.map((m) => (
                            <div key={m.id} className="rounded-xl bg-surface2 px-3 py-2">
                              <Attachment path={m.attachment_path!} name={m.attachment_name ?? 'fichier'} />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {panelTab === 'epingles' && (
              <div>
                {!pinsReady ? (
                  <p className="py-8 text-center text-sm text-muted">
                    Épinglés indisponibles : exécute la migration SQL « 20261023_reactions_pins.sql » dans Supabase.
                  </p>
                ) : pinnedMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">
                    Aucun message épinglé. Fais un appui long sur un message puis « Épingler ».
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pinnedMessages.map((m) => {
                      const a = profilesById.get(m.author_id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setShowPanel(false); jumpTo(m.id); }}
                          className="block w-full rounded-xl bg-surface2 p-3 text-left hover:bg-line"
                        >
                          <p className="flex items-center gap-1 text-xs font-bold text-primary"><Pin size={12} /> {a?.display_name || a?.username || 'Inconnu'}</p>
                          <p className="mt-1 line-clamp-3 text-sm">{m.content || (m.attachment_name ?? '')}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {showEmoji && (
        <EmojiPicker
          onPick={(e) => insertEmoji(e)}
          onPickGif={(url) => sendGif(url)}
          onPickSticker={(s) => sendSticker(s)}
          onPickCustom={(name) => {
            insertEmoji(`:${name}:`);
            setShowEmoji(false);
          }}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {reactionTarget && (
        <EmojiPicker
          onPick={(e) => {
            toggleReaction(reactionTarget.id, e);
            setReactionTarget(null);
          }}
          onClose={() => setReactionTarget(null)}
        />
      )}

      {sheetMsg && (
        <MessageActionSheet
          message={sheetMsg}
          author={profilesById.get(sheetMsg.author_id) ?? null}
          isMe={sheetMsg.author_id === me}
          isPinned={pinnedIds.has(sheetMsg.id)}
          onReact={(e) => toggleReaction(sheetMsg.id, e)}
          onEdit={() => { setEditingId(sheetMsg.id); setEditText(sheetMsg.content); setSheetMsg(null); }}
          onReply={() => { setReplyTo(sheetMsg); setSheetMsg(null); }}
          onThread={() => { setThreadParent(sheetMsg); setSheetMsg(null); }}
          onForward={() => openForward(sheetMsg)}
          onCopy={() => copyText(sheetMsg)}
          onMarkUnread={() => markUnread(sheetMsg)}
          onTogglePin={() => togglePin(sheetMsg)}
          onCopyLink={() => copyMessageLink(sheetMsg)}
          onDelete={() => setDeleteTarget(sheetMsg)}
          onReport={() => { setReportTarget(sheetMsg); setSheetMsg(null); }}
          onTranslate={() => { setTranslateId(sheetMsg.id); setSheetMsg(null); }}
          onCopyId={devMode ? () => { void navigator.clipboard?.writeText(sheetMsg.id); setSheetMsg(null); } : undefined}
          onClose={() => setSheetMsg(null)}
        />
      )}

      {reportTarget && (
        <ReportModal
          messageKind="dm"
          messageId={reportTarget.id}
          reportedUserId={reportTarget.author_id}
          communityId={null}
          onClose={() => setReportTarget(null)}
          onSent={(msg) => flash(msg)}
        />
      )}

      {forwardMsg && (
        <Modal title="Transférer à…" onClose={() => setForwardMsg(null)}>
          {forwardDMs.length === 0 ? (
            <p className="text-sm text-muted">Aucune autre conversation. Écris d’abord à quelqu’un pour pouvoir transférer.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {forwardDMs.map((d) => (
                <button
                  key={d.id}
                  disabled={forwarding}
                  onClick={() => doForward(d.id)}
                  className="block w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium hover:bg-surface2 disabled:opacity-50"
                >
                  {forwarding ? 'Transfert…' : d.title}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showProfile && profileTarget && (
        <ProfileCard
          profile={profileTarget}
          friendship={profileTarget.id === friend?.id ? friendship : null}
          status={online[profileTarget.id]?.status ?? 'hors_ligne'}
          onMessage={() => openMessageTo(profileTarget)}
          onCall={() => dmId && startCall(dmId, profileTarget, 'audio')}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showPollModal && dmId && (
        <PollModal
          dmId={dmId}
          onClose={() => setShowPollModal(false)}
          onPublished={(mid) => {
            window.setTimeout(() => jumpTo(mid), 300);
          }}
        />
      )}

      {deleteTarget && (
        <Modal title="Supprimer ce message ?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-muted">Cette action est définitive. Le message sera supprimé pour tout le monde.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Annuler
            </button>
            <button onClick={() => doDelete(deleteTarget)} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Supprimer
            </button>
          </div>
        </Modal>
      )}
      {confirmLeave && (
        <Modal title="Quitter ce groupe ?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-muted">Tu ne recevras plus les messages de ce groupe. Tu pourras être réinvité plus tard.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setConfirmLeave(false)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Annuler
            </button>
            <button onClick={leave} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              Quitter
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-base shadow-2xl md:bottom-8">
          {toast}
        </div>
      )}

      {/* Fil de discussion : colonne latérale sur bureau, plein écran sur mobile. */}
      {threadParent && (
        <div className="fixed inset-0 z-50 bg-surface md:static md:z-auto md:w-80 md:shrink-0 md:bg-transparent">
          <ThreadPanel
            table="messages"
            parentId={threadParent.id}
            parentAuthor={profilesById.get(threadParent.author_id)?.display_name || profilesById.get(threadParent.author_id)?.username || 'Inconnu'}
            parentContent={threadParent.content || ''}
            parentCreatedAt={threadParent.created_at}
            resolveName={(authorId) => profilesById.get(authorId)?.display_name || profilesById.get(authorId)?.username || 'Inconnu'}
            onSend={async (content) => {
              const { data: inserted, error } = await sb.from('messages').insert({
                dm_id: dmId,
                author_id: me,
                content,
                attachment_path: null,
                attachment_name: null,
                reply_to: threadParent.id,
              }).select().single();
              if (error) throw error;
              if (inserted) {
                setMessages((prev) => (prev.some((x) => x.id === (inserted as Message).id) ? prev : [...prev, inserted as Message]));
              }
            }}
            onClose={() => setThreadParent(null)}
          />
        </div>
      )}
    </div>
  );
}
