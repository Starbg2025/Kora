import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { formatDay, formatFull, formatTime } from '../lib/format';
import { STATUS_LABELS, type DM, type DMMemberRow, type Message, type Profile } from '../lib/types';

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

  const isImage = /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name);
  if (failed) return <p className="mt-1 text-xs text-muted">Pièce jointe indisponible.</p>;
  if (!url) return <p className="mt-1 text-xs text-muted">Chargement de la pièce jointe…</p>;
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block max-w-md">
        <img src={url} alt={name} className="max-h-72 rounded-xl border border-line" loading="lazy" />
      </a>
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

export default function Conversation() {
  const { dmId } = useParams<{ dmId: string }>();
  const { sb, user, settings, saveSettings } = useAuth();
  const { online, setTyping } = usePresence();
  const navigate = useNavigate();

  const [dm, setDm] = useState<DM | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [showPanel, setShowPanel] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [newBelow, setNewBelow] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastMark = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const me = user?.id ?? '';
  const muted = settings?.dm_mute.includes(dmId ?? '') ?? false;
  const profilesById = new Map<string, Profile>();
  for (const m of members) {
    if (m.profiles) profilesById.set(m.user_id, m.profiles);
  }
  const friend = !dm?.is_group ? members.find((m) => m.user_id !== me)?.profiles ?? null : null;

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
    setDm(dmData as DM);
    setGroupName((dmData as DM).name ?? '');
    setMembers(mems);
    setMessages((msgRows ?? []) as Message[]);
    setLoading(false);
    requestAnimationFrame(() => scrollToBottom(false));
    markRead();
  }, [sb, dmId, me, markRead]);

  useEffect(() => {
    setDraft('');
    setReplyTo(null);
    setEditingId(null);
    setShowSearch(false);
    setSearchQ('');
    setSearchResults([]);
    setShowPanel(false);
    setNewBelow(false);
    load();
  }, [dmId, load]);

  // Temps réel sur les messages du DM
  useEffect(() => {
    if (!dmId || !me) return;
    const ch = sb
      .channel(`dm:${dmId}`)
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
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, dmId, me, markRead]);

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
      const { error } = await sb.from('messages').insert({
        dm_id: dmId,
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
      setTyping(null);
      requestAnimationFrame(() => scrollToBottom());
      markRead();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async (m: Message) => {
    const content = editText.trim();
    if (!content) return;
    const { error } = await sb.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', m.id);
    if (!error) {
      setEditingId(null);
    }
  };

  const doDelete = async (m: Message) => {
    setDeleteTarget(null);
    await sb.from('messages').delete().eq('id', m.id);
    if (m.attachment_path) {
      await sb.storage.from('pieces-jointes').remove([m.attachment_path]).catch(() => {});
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Chargement de la conversation…</p>
      </div>
    );
  }
  if (notMember || !dm) {
    return <EmptyState title="Conversation introuvable" text="Elle n’existe pas ou tu n’y as plus accès." />;
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

  let lastDay = '';
  let lastAuthor = '';
  let lastTs = 0;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête */}
        <div className="border-b border-line px-3 py-3 md:px-5">
          <div className="flex items-center gap-2 md:gap-3">
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
            {dm.is_group ? (
              <Avatar profile={null} size={40} />
            ) : (
              <Avatar profile={friend} size={40} status={friendStatus} showStatus />
            )}
            <div className="min-w-0 flex-1">
              {renaming ? (
                <div className="flex gap-2">
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full max-w-xs rounded-lg border border-line bg-surface2 px-3 py-1 text-sm outline-none focus:border-primary"
                    maxLength={60}
                  />
                  <button onClick={saveGroupName} className="rounded-lg bg-primary px-3 py-1 text-sm font-bold text-white">OK</button>
                  <button onClick={() => setRenaming(false)} className="rounded-lg bg-surface2 px-3 py-1 text-sm hover:bg-line">Annuler</button>
                </div>
              ) : (
                <>
                  <p className="truncate font-bold">{headerTitle}</p>
                  <p className="truncate text-xs text-muted">{headerSub}</p>
                </>
              )}
            </div>
            <div className="hidden shrink-0 items-center gap-1 md:flex">
            <button
              onClick={() => setShowSearch((s) => !s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${showSearch ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}
              title="Rechercher dans la conversation"
            >
              Rechercher
            </button>
            <button
              onClick={toggleMute}
              className={`rounded-lg px-3 py-1.5 text-sm ${muted ? 'bg-surface2 text-accent' : 'text-muted hover:text-ink'}`}
              title={muted ? 'Réactiver les notifications' : 'Couper les notifications'}
            >
              {muted ? 'Notifications coupées' : 'Notifications'}
            </button>
            <button
              onClick={() => setShowPanel((s) => !s)}
              className={`rounded-lg px-3 py-1.5 text-sm ${showPanel ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}
            >
              {dm.is_group ? 'Membres' : 'Profil'}
            </button>
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
                <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-line bg-surface p-1 shadow-2xl">
                  <button
                    onClick={() => { setShowSearch((s) => !s); setShowMenu(false); }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2"
                  >
                    Rechercher
                  </button>
                  <button
                    onClick={() => { toggleMute(); setShowMenu(false); }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2"
                  >
                    {muted ? 'Réactiver les notifications' : 'Couper les notifications'}
                  </button>
                  <button
                    onClick={() => { setShowPanel((s) => !s); setShowMenu(false); }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface2"
                  >
                    {dm.is_group ? 'Membres du groupe' : 'Voir le profil'}
                  </button>
                </div>
              )}
            </div>
          </div>
          {showSearch && (
            <div className="mt-3">
              <form onSubmit={runSearch} className="flex gap-2">
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Rechercher un message…"
                  className="w-full rounded-xl border border-line bg-surface2 px-4 py-2 text-sm outline-none focus:border-primary"
                />
                <button type="submit" disabled={searching} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {searching ? '…' : 'OK'}
                </button>
              </form>
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-surface">
                  {searchResults.map((m) => {
                    const a = profilesById.get(m.author_id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => jumpTo(m.id)}
                        className="block w-full px-4 py-2 text-left text-sm hover:bg-surface2"
                      >
                        <span className="font-semibold">{a?.display_name || a?.username || 'Inconnu'}</span>
                        <span className="text-muted"> — {m.content.slice(0, 80) || (m.attachment_name ?? '')}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {searchQ.trim() && !searching && searchResults.length === 0 && (
                <p className="mt-2 text-sm text-muted">Aucun message trouvé.</p>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <EmptyState
              title="Aucun message pour l’instant"
              text={dm.is_group ? 'Lance la discussion !' : `Dis bonjour à ${friend?.display_name || friend?.username || 'ton ami'} !`}
            />
          ) : (
            messages.map((m) => {
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
                    ref={(el) => {
                      msgRefs.current[m.id] = el;
                    }}
                    className={`msg group flex gap-3 rounded-lg px-2 py-1 ${compact ? 'mt-0.5' : 'mt-3'} ${
                      highlightId === m.id ? 'bg-accent/15' : 'hover:bg-surface/60'
                    }`}
                  >
                    {!compact ? (
                      <Avatar profile={author ?? null} size={38} />
                    ) : (
                      <span className="w-[38px] shrink-0 pt-0.5 text-center text-[10px] text-muted opacity-0 group-hover:opacity-100">
                        {formatTime(m.created_at)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      {!compact && (
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className={`text-sm font-bold ${isMe ? 'text-primary' : ''}`}>
                            {author?.display_name || author?.username || 'Inconnu'}
                          </span>
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
                          {m.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>}
                          {m.attachment_path && <Attachment path={m.attachment_path} name={m.attachment_name ?? 'fichier'} />}
                          {m.edited_at && <span className="ml-2 text-[11px] text-muted">(modifié)</span>}
                        </>
                      )}
                    </div>
                    {isMe && editingId !== m.id && (
                      <div className="flex shrink-0 items-start gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => setReplyTo(m)}
                          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-ink"
                          title="Répondre"
                        >
                          Répondre
                        </button>
                        <button
                          onClick={() => { setEditingId(m.id); setEditText(m.content); }}
                          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-ink"
                          title="Modifier"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => setDeleteTarget(m)}
                          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-danger"
                          title="Supprimer"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                    {!isMe && (
                      <div className="flex shrink-0 items-start opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => setReplyTo(m)}
                          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-ink"
                          title="Répondre"
                        >
                          Répondre
                        </button>
                      </div>
                    )}
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

        {/* Compositeur */}
        <div className="border-t border-line px-5 py-3">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
              <p className="truncate text-muted">
                Réponse à <strong className="text-ink">{profilesById.get(replyTo.author_id)?.display_name || 'Inconnu'}</strong> : {replyTo.content.slice(0, 80) || (replyTo.attachment_name ?? '')}
              </p>
              <button onClick={() => setReplyTo(null)} className="ml-2 text-muted hover:text-ink" aria-label="Annuler la réponse">×</button>
            </div>
          )}
          {file && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-xs">
              <p className="truncate">Fichier : <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} Ko)</p>
              <button onClick={() => setFile(null)} className="ml-2 text-muted hover:text-ink" aria-label="Retirer le fichier">×</button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              className="mb-1 rounded-xl bg-surface2 p-2.5 text-muted hover:bg-line hover:text-ink"
              title="Joindre un fichier (max 25 Mo)"
              aria-label="Joindre un fichier"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <textarea
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
              className="max-h-40 flex-1 resize-none rounded-xl border border-line bg-surface2 px-4 py-2.5 text-[15px] outline-none focus:border-primary"
              aria-label="Écrire un message"
            />
            <button
              onClick={send}
              disabled={sending || (!draft.trim() && !file)}
              className="mb-1 rounded-xl bg-primary px-5 py-2.5 font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>
          {sendError && <p className="mt-1 text-xs text-danger">{sendError}</p>}
        </div>
      </div>

      {/* Panneau droit contextuel */}
      {showPanel && (
        <aside className="fixed inset-y-0 right-0 z-40 w-72 border-l border-line bg-surface p-4 shadow-2xl md:static md:z-auto md:shrink-0 md:shadow-none">
          {dm.is_group ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">Membres</h2>
                {dm.created_by === me && !renaming && (
                  <button onClick={() => setRenaming(true)} className="text-xs text-primary hover:underline">
                    Renommer
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {members.map((m) => {
                  const p = m.profiles;
                  if (!p) return null;
                  const st = online[p.id]?.status ?? 'hors_ligne';
                  return (
                    <div key={m.user_id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                      <Avatar profile={p} size={32} status={st} showStatus />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.display_name || p.username}{m.user_id === me && ' (toi)'}</p>
                        <p className="text-[11px] text-muted">@{p.username}</p>
                      </div>
                      {dm.created_by === me && m.user_id !== me && (
                        <button onClick={() => removeMember(m.user_id)} className="text-xs text-muted hover:text-danger" title="Retirer du groupe">
                          Retirer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setConfirmLeave(true)} className="mt-4 w-full rounded-xl bg-surface2 px-4 py-2 text-sm font-medium text-danger hover:bg-line">
                Quitter le groupe
              </button>
            </>
          ) : friend ? (
            <>
              <h2 className="mb-3 font-bold">Profil</h2>
              <div className="flex flex-col items-center text-center">
                <Avatar profile={friend} size={80} status={friendStatus} showStatus />
                <p className="mt-2 text-lg font-bold">{friend.display_name || friend.username}</p>
                <p className="text-sm text-muted">@{friend.username}</p>
                <p className="mt-1 text-xs text-muted">{presenceLabel(friendStatus)}</p>
                {activeCustomStatus(friend) && (
                  <p className="mt-2 rounded-xl bg-surface2 px-3 py-2 text-sm">« {activeCustomStatus(friend)} »</p>
                )}
                {friend.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{friend.bio}</p>}
              </div>
            </>
          ) : null}
        </aside>
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
    </div>
  );
}
