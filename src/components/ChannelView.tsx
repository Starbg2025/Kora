import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { containsMention, snippet } from '../lib/mentions';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';
import MessageToolbar from './MessageToolbar';
import Modal from './Modal';
import ReportModal from './ReportModal';
import EmptyState from './EmptyState';
import { formatDay, formatFull, formatTime } from '../lib/format';
import {
  ROLE_COLORS,
  type Channel,
  type CommunityMember,
  type CommunityMessage,
  type CommunityMessagePin,
  type CommunityMessageReaction,
  type CommunityRole,
  type Profile,
} from '../lib/types';

const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name);
const isAudioName = (name: string) => /\.(mp3|wav|ogg|oga|m4a|webm|opus)$/i.test(name);
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Props {
  communityId: string;
  channel: Channel;
  myRole: CommunityRole | null;
  members: CommunityMember[];
  onToggleMembers: () => void;
  onBack: () => void;
}

function AttachmentView({ path, name }: { path: string; name: string }) {
  const { sb } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    sb.storage
      .from('pieces-jointes')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (alive && !error && data) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path, sb]);
  if (!url) return <div className="mt-2 h-24 w-48 animate-pulse rounded-xl bg-surface2" />;
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
      <span className="truncate">{name}</span>
    </a>
  );
}

/** Vue d'un salon textuel : messages temps réel, réactions, épinglés, pièces jointes. */
export default function ChannelView({ communityId, channel, myRole, members, onToggleMembers, onBack }: Props) {
  const { sb, user, profile } = useAuth();
  const { notify } = useNotifications();
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [reactions, setReactions] = useState<CommunityMessageReaction[]>([]);
  const [pins, setPins] = useState<CommunityMessagePin[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sheetMsg, setSheetMsg] = useState<CommunityMessage | null>(null);
  const [reactionTarget, setReactionTarget] = useState<CommunityMessage | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityMessage | null>(null);
  const [myTimeoutUntil, setMyTimeoutUntil] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [toast, setToast] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const me = user?.id ?? '';
  const canModerate = myRole === 'proprietaire' || myRole === 'admin' || myRole === 'moderateur';

  const profilesById = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const m of members) if (m.profiles) map.set(m.user_id, m.profiles);
    return map;
  }, [members]);
  const rolesById = useMemo(() => {
    const map = new Map<string, CommunityRole>();
    for (const m of members) map.set(m.user_id, m.role);
    return map;
  }, [members]);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.message_id)), [pins]);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
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

  const load = useCallback(
    async (before?: string) => {
      if (!channel.id) return;
      if (before) setLoadingMore(true);
      else setLoading(true);
      const query = sb
        .from('community_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false })
        .limit(100);
      const q2 = before ? query.lt('created_at', before) : query;
      const { data: msgRows } = await q2;
      const msgs = ((msgRows ?? []) as CommunityMessage[]).reverse();
      if (before) {
        setMessages((prev) => [...msgs, ...prev]);
        setHasMore(msgs.length === 100);
        setLoadingMore(false);
        return;
      }
      setMessages(msgs);
      setHasMore(msgs.length === 100);
      const ids = msgs.map((m) => m.id);
      if (ids.length > 0) {
        const [{ data: rRows }, { data: pRows }] = await Promise.all([
          sb.from('community_message_reactions').select('*').in('message_id', ids),
          sb.from('community_message_pins').select('*').in('message_id', ids),
        ]);
        setReactions((rRows ?? []) as CommunityMessageReaction[]);
        setPins((pRows ?? []) as CommunityMessagePin[]);
      } else {
        setReactions([]);
        setPins([]);
      }
      setLoading(false);
      requestAnimationFrame(() => scrollToBottom(false));
    },
    [sb, channel.id],
  );

  useEffect(() => {
    setMessages([]);
    setReactions([]);
    setPins([]);
    setReplyTo(null);
    setDraft('');
    setHasMore(true);
    load();
  }, [load]);

  // Timeout actif pour moi dans cette communauté (bandeau au-dessus du compositeur)
  useEffect(() => {
    if (!communityId || !me) return;
    sb.from('server_timeouts')
      .select('expires_at')
      .eq('community_id', communityId)
      .eq('user_id', me)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data }) => {
        setMyTimeoutUntil(data ? (data as { expires_at: string }).expires_at : null);
      });
  }, [sb, communityId, me]);

  // Temps réel : messages (canal dédié, topic unique par montage)
  useEffect(() => {
    if (!channel.id || !me) return;
    const ch = sb
      .channel(`ch:${channel.id}:${channelTag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const m = payload.new as CommunityMessage;
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          const next = [...prev, m];
          // Charge les réactions/épinglés du nouveau message si on est en bas
          return next;
        });
        if (nearBottom()) requestAnimationFrame(() => scrollToBottom());
        // Déclencheur : mention @pseudo → notification pour le destinataire
        if (m.author_id !== me && profile?.username && containsMention(m.content, profile.username)) {
          sb.from('profiles')
            .select('display_name, username')
            .eq('id', m.author_id)
            .maybeSingle()
            .then(({ data }) => {
              const p = data as { display_name: string; username: string } | null;
              const name = p?.display_name || p?.username || 'Quelqu’un';
              notify('mention', `${name} t’a mentionné dans #${channel.name}`, snippet(m.content), `/app/c/${communityId}/${channel.id}`);
            });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const m = payload.new as CommunityMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const old = payload.old as { id: string };
        setMessages((prev) => prev.filter((x) => x.id !== old.id));
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, channel.id, me, channelTag, notify, profile?.username, communityId, channel.name]);

  // Temps réel : réactions + épinglés (canal séparé)
  useEffect(() => {
    if (!channel.id || !me) return;
    const ch = sb
      .channel(`ch:${channel.id}:rx:${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_message_reactions' }, (payload) => {
        const row = (payload.new ?? payload.old) as CommunityMessageReaction;
        if (!row?.message_id) return;
        setMessages((prev) => {
          if (!prev.some((m) => m.id === row.message_id)) return prev;
          if (payload.eventType === 'INSERT') {
            setReactions((rs) =>
              rs.some((r) => r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji)
                ? rs
                : [...rs, row],
            );
          } else if (payload.eventType === 'DELETE') {
            setReactions((rs) =>
              rs.filter((r) => !(r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji)),
            );
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_message_pins' }, (payload) => {
        const row = (payload.new ?? payload.old) as CommunityMessagePin;
        if (!row?.message_id) return;
        setMessages((prev) => {
          if (!prev.some((m) => m.id === row.message_id)) return prev;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setPins((ps) => (ps.some((p) => p.message_id === row.message_id) ? ps : [...ps, row]));
          } else if (payload.eventType === 'DELETE') {
            setPins((ps) => ps.filter((p) => p.message_id !== row.message_id));
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, channel.id, me, channelTag]);

  const send = async () => {
    const content = draft.trim();
    if ((!content && !file) || sending) return;
    setSending(true);
    setSendError('');
    try {
      // Timeout actif ? (la policy RLS fait foi côté serveur ; ce contrôle
      // donne juste un message clair au lieu d'une erreur générique)
      const { data: toRow } = await sb
        .from('server_timeouts')
        .select('expires_at')
        .eq('community_id', communityId)
        .eq('user_id', me)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (toRow) {
        throw new Error(`Tu es en timeout jusqu’au ${formatFull((toRow as { expires_at: string }).expires_at)}.`);
      }
      let attachment_path: string | null = null;
      let attachment_name: string | null = null;
      if (file) {
        if (file.size > 25 * 1024 * 1024) throw new Error('Le fichier dépasse 25 Mo.');
        const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
        attachment_path = `${channel.id}/${crypto.randomUUID()}_${safeName}`;
        attachment_name = file.name;
        const { error: upErr } = await sb.storage.from('pieces-jointes').upload(attachment_path, file);
        if (upErr) throw upErr;
      }
      const { error } = await sb.from('community_messages').insert({
        channel_id: channel.id,
        author_id: me,
        content,
        attachment_path,
        attachment_name,
        reply_to: replyTo?.id ?? null,
      });
      if (error) throw error;
      setDraft('');
      setFile(null);
      setReplyTo(null);
      requestAnimationFrame(() => scrollToBottom());
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

  const saveEdit = async (m: CommunityMessage) => {
    const content = editText.trim();
    if (!content) return;
    const { error } = await sb.from('community_messages').update({ content, edited_at: new Date().toISOString() }).eq('id', m.id);
    if (error) flash(error.message);
    else setEditingId(null);
  };

  const deleteMessage = async (m: CommunityMessage) => {
    const { error } = await sb.from('community_messages').delete().eq('id', m.id);
    if (error) flash(error.message);
    setSheetMsg(null);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === me && r.emoji === emoji);
    if (existing) {
      const { error } = await sb
        .from('community_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', me)
        .eq('emoji', emoji);
      if (error) flash(error.message);
    } else {
      const { error } = await sb.from('community_message_reactions').insert({ message_id: messageId, user_id: me, emoji });
      if (error) flash(error.message);
    }
  };

  const togglePin = async (m: CommunityMessage) => {
    const isPinned = pinnedIds.has(m.id);
    if (isPinned) {
      const { error } = await sb.from('community_message_pins').delete().eq('message_id', m.id);
      if (error) flash(error.message);
    } else {
      if (!canModerate) {
        flash('Seuls les modérateurs peuvent épingler.');
        return;
      }
      const { error } = await sb.from('community_message_pins').insert({ message_id: m.id, pinned_by: me });
      if (error) flash(error.message);
    }
    setSheetMsg(null);
  };

  const copyText = async (m: CommunityMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
    } catch {
      /* presse-papiers indisponible */
    }
    flash('Texte copié.');
    setSheetMsg(null);
  };

  const copyLink = async (m: CommunityMessage) => {
    const link = `${window.location.origin}/app/c/${communityId}/${channel.id}#msg-${m.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* presse-papiers indisponible */
    }
    flash('Lien copié.');
    setSheetMsg(null);
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`cmsg-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('bg-primary/10');
      window.setTimeout(() => el.classList.remove('bg-primary/10'), 2000);
    }
  };

  // Appui long (mobile) / clic droit (desktop)
  const pressStart = (m: CommunityMessage) => {
    pressTimer.current = window.setTimeout(() => setSheetMsg(m), 550);
  };
  const pressEnd = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 80 && hasMore && !loadingMore && messages.length > 0) {
      load(messages[0].created_at);
    }
  };

  let lastDay = '';
  let lastAuthor = '';
  let lastTs = 0;

  return (
    <div className="flex h-full min-w-0 flex-col bg-base">
      {/* En-tête du salon (48 px) */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:hidden" aria-label="Retour aux salons">
          ←
        </button>
        <span className="text-xl text-muted">#</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-extrabold">{channel.name}</h2>
          {channel.topic && <p className="truncate text-xs text-muted">{channel.topic}</p>}
        </div>
        <button
          onClick={() => setShowPins(true)}
          className="relative rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink"
          title="Messages épinglés"
          aria-label="Messages épinglés"
        >
          📌
          {pins.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {pins.length}
            </span>
          )}
        </button>
        <button
          onClick={onToggleMembers}
          className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink"
          title="Membres"
          aria-label="Afficher les membres"
        >
          👥
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Chargement…</p>
        ) : messages.length === 0 ? (
          <EmptyState title={`Bienvenue dans #${channel.name} !`} text="C’est le début des discussions ici." />
        ) : (
          <>
            {loadingMore && <p className="py-2 text-center text-xs text-muted">Chargement…</p>}
            {messages.map((m) => {
              const day = formatDay(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const ts = new Date(m.created_at).getTime();
              const compact = !showDay && m.author_id === lastAuthor && ts - lastTs < 5 * 60 * 1000 && !m.reply_to;
              lastAuthor = m.author_id;
              lastTs = ts;
              const author = profilesById.get(m.author_id);
              const role = rolesById.get(m.author_id);
              const isMe = m.author_id === me;
              const rcts = reactions.filter((r) => r.message_id === m.id);
              const grouped = new Map<string, { count: number; mine: boolean }>();
              for (const r of rcts) {
                const g = grouped.get(r.emoji) ?? { count: 0, mine: false };
                g.count += 1;
                if (r.user_id === me) g.mine = true;
                grouped.set(r.emoji, g);
              }
              const replied = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-line" />
                      <span className="text-xs font-semibold text-muted">{day}</span>
                      <div className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <div
                    id={`cmsg-${m.id}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSheetMsg(m);
                    }}
                    onTouchStart={() => pressStart(m)}
                    onTouchEnd={pressEnd}
                    onTouchMove={pressEnd}
                    className="group relative flex gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface/60"
                  >
                    {!compact ? (
                      <Avatar profile={author ?? null} size={40} />
                    ) : (
                      <div className="w-10 shrink-0 pt-0.5 text-center text-[11px] text-muted opacity-0 group-hover:opacity-100">
                        {formatTime(m.created_at)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {!compact && (
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className="font-bold"
                            style={role && role !== 'membre' ? { color: ROLE_COLORS[role] } : undefined}
                          >
                            {author?.display_name || author?.username || 'Inconnu'}
                          </span>
                          <span className="text-xs text-muted">{formatTime(m.created_at)}</span>
                          {pinnedIds.has(m.id) && <span className="text-xs" title="Épinglé">📌</span>}
                        </p>
                      )}
                      {replied && (
                        <p className="mb-1 truncate border-l-2 border-line pl-2 text-xs italic text-muted">
                          Réponse à <strong className="text-ink">{profilesById.get(replied.author_id)?.display_name || 'Inconnu'}</strong> :{' '}
                          {replied.content.slice(0, 80) || (replied.attachment_name ?? '')}
                        </p>
                      )}
                      {!replied && m.reply_to && (
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
                          {m.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>}
                          {m.attachment_path && <AttachmentView path={m.attachment_path} name={m.attachment_name ?? 'fichier'} />}
                          {m.edited_at && <span className="ml-2 text-[11px] text-muted">(modifié)</span>}
                        </>
                      )}
                      {grouped.size > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {[...grouped.entries()].map(([emoji, g]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(m.id, emoji)}
                              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${
                                g.mine ? 'border-primary bg-primary/15' : 'border-line bg-surface2 hover:border-primary/50'
                              }`}
                              title="Ajouter / retirer ma réaction"
                            >
                              <span>{emoji}</span>
                              <span className={`text-xs font-bold ${g.mine ? 'text-primary' : 'text-muted'}`}>{g.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Barre d'actions flottante au survol (bureau) */}
                    <MessageToolbar
                      onReact={() => setReactionTarget(m)}
                      onReply={() => setReplyTo(m)}
                      onCopyLink={() => copyLink(m)}
                      canEdit={isMe}
                      onEdit={() => { setEditingId(m.id); setEditText(m.content); }}
                      canDelete={isMe || canModerate}
                      onDelete={() => {
                        if (window.confirm('Supprimer ce message ?')) deleteMessage(m);
                      }}
                      onMore={() => setSheetMsg(m)}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Compositeur */}
      <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5 md:px-5">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
            <p className="truncate">
              Réponse à <strong>{profilesById.get(replyTo.author_id)?.display_name || 'Inconnu'}</strong> : {replyTo.content.slice(0, 80) || (replyTo.attachment_name ?? '')}
            </p>
            <button onClick={() => setReplyTo(null)} className="ml-2 text-muted hover:text-ink" aria-label="Annuler la réponse">✕</button>
          </div>
        )}
        {file && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
            <p className="truncate">Fichier : <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} Ko)</p>
            <button onClick={() => setFile(null)} className="ml-2 text-muted hover:text-ink" aria-label="Retirer le fichier">✕</button>
          </div>
        )}
        {sendError && <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{sendError}</p>}
        {myTimeoutUntil && (
          <p className="mb-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
            Tu es en timeout jusqu’au {formatFull(myTimeoutUntil)} : tu ne peux pas écrire dans les salons
            de cette communauté pour le moment.
          </p>
        )}
        <div className="flex items-center gap-1 rounded-2xl bg-surface2 px-2 py-1.5">
          <button
            onClick={() => fileInput.current?.click()}
            className="shrink-0 rounded-full bg-surface p-2 text-muted hover:text-ink"
            title="Joindre un fichier (max 25 Mo)"
            aria-label="Joindre un fichier"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14 M5 12h14" />
            </svg>
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Écrire dans #${channel.name}`}
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
          <button
            onClick={send}
            disabled={sending || (!draft.trim() && !file)}
            className="shrink-0 rounded-full bg-primary p-2.5 text-white hover:opacity-90 disabled:opacity-40"
            title="Envoyer"
            aria-label="Envoyer le message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </div>

      {showEmoji && (
        <EmojiPicker
          onPick={(e) => {
            insertEmoji(e);
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

      {reportTarget && (
        <ReportModal
          messageKind="channel"
          messageId={reportTarget.id}
          reportedUserId={reportTarget.author_id}
          communityId={communityId}
          onClose={() => setReportTarget(null)}
          onSent={(msg) => flash(msg)}
        />
      )}

      {/* Fiche d'actions (appui long / clic droit) */}
      {sheetMsg && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label="Actions du message">
          <button aria-label="Fermer" onClick={() => setSheetMsg(null)} className="absolute inset-0 bg-black/60" />
          <div className="relative max-h-[92dvh] w-full space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex justify-between gap-2">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    toggleReaction(sheetMsg.id, e);
                    setSheetMsg(null);
                  }}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-surface2/60 text-2xl hover:bg-surface2"
                  aria-label={`Réagir ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl bg-surface2/40">
              <SheetRow icon="💬" onClick={() => { setReplyTo(sheetMsg); setSheetMsg(null); }}>Répondre</SheetRow>
              <SheetRow icon="📋" onClick={() => copyText(sheetMsg)}>Copier le texte</SheetRow>
              <SheetRow icon="🔗" onClick={() => copyLink(sheetMsg)}>Copier le lien</SheetRow>
              {sheetMsg.author_id !== me && (
                <SheetRow icon="🚩" onClick={() => { setReportTarget(sheetMsg); setSheetMsg(null); }}>Signaler</SheetRow>
              )}
              {canModerate && (
                <SheetRow icon="📌" onClick={() => togglePin(sheetMsg)}>
                  {pinnedIds.has(sheetMsg.id) ? 'Désépingler' : 'Épingler le message'}
                </SheetRow>
              )}
              {sheetMsg.author_id === me && (
                <SheetRow
                  icon="✎"
                  onClick={() => {
                    setEditingId(sheetMsg.id);
                    setEditText(sheetMsg.content);
                    setSheetMsg(null);
                  }}
                >
                  Modifier
                </SheetRow>
              )}
              {(sheetMsg.author_id === me || canModerate) && (
                <SheetRow icon="🗑️" danger onClick={() => {
                  if (window.confirm('Supprimer ce message ?')) deleteMessage(sheetMsg);
                  else setSheetMsg(null);
                }}>
                  Supprimer
                </SheetRow>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages épinglés */}
      {showPins && (
        <Modal title={`Épinglés dans #${channel.name}`} onClose={() => setShowPins(false)}>
          {pins.length === 0 ? (
            <p className="text-sm text-muted">Aucun message épinglé pour le moment.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {pins.map((p) => {
                const m = messages.find((x) => x.id === p.message_id);
                if (!m) return null;
                const author = profilesById.get(m.author_id);
                return (
                  <li key={p.message_id}>
                    <button
                      onClick={() => {
                        setShowPins(false);
                        window.setTimeout(() => jumpTo(p.message_id), 150);
                      }}
                      className="block w-full rounded-xl bg-surface2 p-3 text-left hover:bg-line"
                    >
                      <p className="text-xs font-bold text-primary">{author?.display_name || 'Inconnu'}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm">{m.content || (m.attachment_name ?? 'Pièce jointe')}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-base shadow-xl md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  );
}

function SheetRow({
  icon,
  onClick,
  danger,
  children,
}: {
  icon: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2/60 ${
        danger ? 'text-danger' : ''
      }`}
    >
      <span className="w-6 text-center text-xl">{icon}</span>
      {children}
    </button>
  );
}
