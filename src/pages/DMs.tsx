import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useFriends } from '../hooks/useFriends';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import VerifiedBadge from '../components/VerifiedBadge';
import Modal from '../components/Modal';
import ProfileCard from '../components/ProfileCard';
import { formatShort } from '../lib/format';
import { getPinnedDMs, setPinnedDMs } from '../lib/dmPrefs';
import { openDirectDM } from '../lib/dm';
import { containsMention, snippet } from '../lib/mentions';
import { useNotifications } from '../context/NotificationsContext';
import { STATUS_LABELS, type DM, type Friendship, type Message, type Profile } from '../lib/types';

export interface DMView {
  dm: DM;
  others: Profile[]; // membres sauf moi
  lastMessage: Message | null;
  lastAuthorName: string;
  unread: number;
}

function GroupAvatar({ profiles, size = 36 }: { profiles: Profile[]; size?: number }) {
  const shown = profiles.slice(0, 2);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {shown.map((p, i) => (
        <span
          key={p.id}
          className="absolute overflow-hidden rounded-full border-2 border-base"
          style={{
            width: size * 0.68,
            height: size * 0.68,
            left: i === 0 ? 0 : size * 0.32,
            top: i === 0 ? 0 : size * 0.32,
            zIndex: i === 0 ? 2 : 1,
          }}
        >
          <Avatar profile={p} size={Math.round(size * 0.68)} />
        </span>
      ))}
      {shown.length === 0 && <Avatar profile={null} size={size} />}
    </span>
  );
}

const muteIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
    <path d="M13.7 21a2 2 0 0 1-3.4 0 M18.4 15.5A9 9 0 1 1 5.6 8.4l12.8 7.1z M22 10a9 9 0 0 1-1.5 5 M2 2l20 20" />
  </svg>
);

export default function DMs() {
  const { sb, user, profile, settings, saveSettings } = useAuth();
  const { online } = usePresence();
  const { entries } = useFriends();
  const { notify, unreadCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch('/app/dm/:dmId');
  const openDmId = match?.params.dmId ?? null;
  // Canal unique par instance (voir useFriends : sb.channel() réutilise les canaux existants).
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [views, setViews] = useState<DMView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [pinned, setPinned] = useState<string[]>(() => getPinnedDMs());
  const [sheetDM, setSheetDM] = useState<DMView | null>(null);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [profileFriendship, setProfileFriendship] = useState<Friendship | null>(null);
  const [toast, setToast] = useState('');
  const pressTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const me = user?.id ?? '';
  const mutedIds = new Set(settings?.dm_mute ?? []);
  const myPresence = profile ? online[profile.id]?.status ?? profile.status : 'hors_ligne';
  const pendingRequests = entries.filter(
    (e) => e.friendship.status === 'pending' && e.friendship.addressee_id === me,
  ).length;

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3000);
  };

  // Ouverture du modal « nouveau groupe » demandée depuis l'écran Nouveau message
  useEffect(() => {
    const st = location.state as { createGroup?: boolean } | null;
    if (st?.createGroup) {
      setShowCreate(true);
      navigate('/app/dm', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const load = useCallback(async () => {
    if (!me) return;
    const { data: memberships } = await sb.from('dm_members').select('dm_id, last_read_at').eq('user_id', me);
    const rows = (memberships ?? []) as { dm_id: string; last_read_at: string }[];
    if (rows.length === 0) {
      setViews([]);
      setLoading(false);
      return;
    }
    const dmIds = rows.map((r) => r.dm_id);
    const lastReadByDm = new Map(rows.map((r) => [r.dm_id, r.last_read_at]));

    const [{ data: dms }, { data: members }, { data: msgs }] = await Promise.all([
      sb.from('dms').select('*').in('id', dmIds),
      sb.from('dm_members').select('dm_id, user_id, profiles(*)').in('dm_id', dmIds),
      sb.from('messages').select('id, dm_id, author_id, content, attachment_name, created_at').in('dm_id', dmIds).order('created_at', { ascending: false }).limit(400),
    ]);

    const dmList = (dms ?? []) as DM[];
    const memberRows = (members ?? []) as unknown as Array<{ dm_id: string; user_id: string; profiles: Profile }>;
    const msgRows = (msgs ?? []) as Message[];

    const profilesByDm = new Map<string, Profile[]>();
    for (const m of memberRows) {
      if (!m.profiles) continue;
      const arr = profilesByDm.get(m.dm_id) ?? [];
      arr.push(m.profiles);
      profilesByDm.set(m.dm_id, arr);
    }
    const lastByDm = new Map<string, Message>();
    for (const m of msgRows) {
      if (!lastByDm.has(m.dm_id)) lastByDm.set(m.dm_id, m);
    }

    const unreadCounts = await Promise.all(
      dmList.map(async (d) => {
        const lastRead = lastReadByDm.get(d.id) ?? new Date(0).toISOString();
        const { count } = await sb
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('dm_id', d.id)
          .gt('created_at', lastRead)
          .neq('author_id', me);
        return [d.id, count ?? 0] as [string, number];
      }),
    );
    const unreadByDm = new Map(unreadCounts);

    const profileById = new Map<string, Profile>();
    for (const arr of profilesByDm.values()) for (const p of arr) profileById.set(p.id, p);

    const built: DMView[] = dmList.map((d) => {
      const all = profilesByDm.get(d.id) ?? [];
      const others = all.filter((p) => p.id !== me);
      const last = lastByDm.get(d.id) ?? null;
      return {
        dm: d,
        others,
        lastMessage: last,
        lastAuthorName: last ? profileById.get(last.author_id)?.display_name || profileById.get(last.author_id)?.username || '' : '',
        unread: unreadByDm.get(d.id) ?? 0,
      };
    });
    setViews(built);
    setLoading(false);
  }, [sb, me]);

  useEffect(() => {
    load();
  }, [load]);

  // Temps réel : nouveaux messages, nouveaux DM, renommages
  useEffect(() => {
    if (!me) return;
    const ch = sb
      .channel(`dms-feed-${channelTag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        setViews((prev) => {
          const idx = prev.findIndex((v) => v.dm.id === m.dm_id);
          if (idx === -1) {
            load(); // nouveau DM (ou premier message) : recharger
            return prev;
          }
          const next = [...prev];
          const v = { ...next[idx], lastMessage: m };
          if (m.dm_id !== openDmId && m.author_id !== me) v.unread = v.unread + 1;
          if (m.dm_id === openDmId) v.unread = 0;
          next[idx] = v;
          return next;
        });
        // Déclencheur : mention @pseudo → notification pour le destinataire
        if (m.author_id !== me && profile?.username && containsMention(m.content, profile.username)) {
          sb.from('profiles')
            .select('display_name, username')
            .eq('id', m.author_id)
            .maybeSingle()
            .then(({ data }) => {
              const p = data as { display_name: string; username: string } | null;
              const name = p?.display_name || p?.username || 'Quelqu’un';
              notify('mention', `${name} t’a mentionné`, snippet(m.content), `/app/dm/${m.dm_id}`);
            });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_members', filter: `user_id=eq.${me}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dms' }, (payload) => {
        const d = payload.new as DM;
        setViews((prev) => prev.map((v) => (v.dm.id === d.id ? { ...v, dm: d } : v)));
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, me, openDmId, load, channelTag, notify, profile?.username]);

  const dmTitle = (v: DMView) => {
    if (v.dm.is_group) return v.dm.name || 'Groupe sans nom';
    return v.others[0]?.display_name || v.others[0]?.username || 'Conversation';
  };

  const sorted = [...views].sort((a, b) => {
    const pa = pinned.includes(a.dm.id) ? 0 : 1;
    const pb = pinned.includes(b.dm.id) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = a.lastMessage?.created_at ?? a.dm.created_at;
    const tb = b.lastMessage?.created_at ?? b.dm.created_at;
    return tb.localeCompare(ta);
  });

  const needle = searchQ.trim().toLowerCase();
  const filtered = needle
    ? sorted.filter((v) => dmTitle(v).toLowerCase().includes(needle))
    : sorted;

  const preview = (v: DMView) => {
    if (!v.lastMessage) return 'Aucun message pour l’instant';
    const body = v.lastMessage.attachment_name && !v.lastMessage.content
      ? `Fichier : ${v.lastMessage.attachment_name}`
      : v.lastMessage.content;
    return v.lastMessage.author_id === me ? `Toi : ${body}` : `${v.lastAuthorName} : ${body}`;
  };

  const togglePin = (v: DMView) => {
    const next = pinned.includes(v.dm.id) ? pinned.filter((id) => id !== v.dm.id) : [v.dm.id, ...pinned];
    setPinned(next);
    setPinnedDMs(next);
    setSheetDM(null);
    flash(next.includes(v.dm.id) ? 'Conversation épinglée.' : 'Conversation désépinglée.');
  };

  const toggleMute = async (v: DMView) => {
    if (!settings) return;
    const list = mutedIds.has(v.dm.id)
      ? settings.dm_mute.filter((id) => id !== v.dm.id)
      : [...settings.dm_mute, v.dm.id];
    await saveSettings({ dm_mute: list });
    setSheetDM(null);
    flash(mutedIds.has(v.dm.id) ? 'Notifications réactivées.' : 'Conversation en sourdine.');
  };

  const markAsRead = async (v: DMView) => {
    await sb.from('dm_members').update({ last_read_at: new Date().toISOString() }).eq('dm_id', v.dm.id).eq('user_id', me);
    setViews((prev) => prev.map((x) => (x.dm.id === v.dm.id ? { ...x, unread: 0 } : x)));
    setSheetDM(null);
    flash('Conversation marquée comme lue.');
  };

  const closeDM = async (v: DMView) => {
    await sb.from('dm_members').delete().eq('dm_id', v.dm.id).eq('user_id', me);
    setSheetDM(null);
    if (openDmId === v.dm.id) navigate('/app/dm');
    load();
  };

  const openProfile = async (v: DMView) => {
    const p = v.others[0];
    if (!p) {
      setSheetDM(null);
      return;
    }
    setProfileTarget(p);
    setProfileFriendship(null);
    setSheetDM(null);
    const { data } = await sb
      .from('friendships')
      .select('*')
      .or(`and(requester_id.eq.${me},addressee_id.eq.${p.id}),and(requester_id.eq.${p.id},addressee_id.eq.${me})`)
      .eq('status', 'accepted')
      .maybeSingle();
    setProfileFriendship((data as Friendship) ?? null);
  };

  const openMessageTo = async (profile: Profile) => {
    setProfileTarget(null);
    try {
      const dmId = await openDirectDM(sb, me, profile.id);
      navigate(`/app/dm/${dmId}`);
    } catch {
      flash('Ouverture de la conversation impossible.');
    }
  };

  const startPress = (v: DMView) => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setSheetDM(v), 550);
  };
  const endPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) {
      setError('Sélectionne au moins un ami.');
      return;
    }
    if (selected.length > 9) {
      setError('Un groupe est limité à 10 membres au total.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const name = groupName.trim() || `Groupe de ${(entries.find((x) => x.profile.id === me)?.profile.display_name || entries.find((x) => x.profile.id === me)?.profile.username) ?? 'discussion'}`;
      const { data: dm, error: dmErr } = await sb
        .from('dms')
        .insert({ name, is_group: true, created_by: me })
        .select()
        .single();
      if (dmErr) throw dmErr;
      // D'abord moi (la RLS autorise l'auto-ajout), puis les invités
      const { error: selfErr } = await sb.from('dm_members').insert({ dm_id: (dm as DM).id, user_id: me });
      if (selfErr) throw selfErr;
      const { error: othersErr } = await sb
        .from('dm_members')
        .insert(selected.map((uid) => ({ dm_id: (dm as DM).id, user_id: uid })));
      if (othersErr) throw othersErr;
      setShowCreate(false);
      setGroupName('');
      setSelected([]);
      await load();
      navigate(`/app/dm/${(dm as DM).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setCreating(false);
    }
  };

  const friends = entries.filter((e) => e.friendship.status === 'accepted');
  const sheetFriend = sheetDM && !sheetDM.dm.is_group ? sheetDM.others[0] ?? null : null;
  // Utilisateurs bloqués (dans un sens ou l'autre) : leur contenu ne s'affiche pas.
  const blockedIds = new Set(
    entries.filter((e) => e.friendship.status === 'blocked').map((e) => e.profile.id),
  );

  return (
    <div className="flex h-full">
      <aside className={`${openDmId ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-line bg-surface md:w-60 md:shrink-0 lg:w-72`}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <h1 className="flex-1 text-lg font-extrabold">Messages privés</h1>
        </div>
        <div className="flex items-center gap-2 px-4 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-base px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Rechercher"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              aria-label="Rechercher une conversation"
            />
          </div>
          <button
            onClick={() => navigate('/app/amis')}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface2 px-3 py-2 text-sm font-semibold hover:bg-line"
            title="Ajouter des amis"
            aria-label="Ajouter des amis"
          >
            <span>👥</span> <span className="hidden lg:inline">Ajouter des amis</span>
          </button>
          <button
            onClick={() => navigate('/app/dm/nouveau')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-bold text-white hover:opacity-90"
            title="Nouveau message"
            aria-label="Nouveau message"
          >
            ＋
          </button>
        </div>
        <div className="space-y-0.5 px-2 pb-1">
          <button
            onClick={() => navigate('/app/amis')}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface2/60"
          >
            <span className="text-base">👥</span> Amis
          </button>
          <button
            onClick={() => navigate('/app/amis?onglet=attente')}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface2/60"
          >
            <span className="text-base">📩</span> Demandes d’amis
            {pendingRequests > 0 && (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                {pendingRequests}
              </span>
            )}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Chargement…</p>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-semibold">{needle ? 'Aucun résultat' : 'Aucune conversation'}</p>
              <p className="mt-1 text-sm text-muted">
                {needle ? 'Essaie un autre nom.' : 'Touche ＋ pour écrire à un ami.'}
              </p>
            </div>
          ) : (
            filtered.map((v) => {
              const isOpen = openDmId === v.dm.id;
              const isPinned = pinned.includes(v.dm.id);
              const isMuted = mutedIds.has(v.dm.id);
              const st = !v.dm.is_group && v.others[0] ? online[v.others[0].id]?.status ?? 'hors_ligne' : null;
              // Conversation avec un utilisateur bloqué : grisée, contenu masqué.
              const isBlocked = !v.dm.is_group && v.others[0] ? blockedIds.has(v.others[0].id) : false;
              return (
                <div
                  key={v.dm.id}
                  onContextMenu={(e) => { e.preventDefault(); setSheetDM(v); }}
                  onTouchStart={() => startPress(v)}
                  onTouchEnd={endPress}
                  onTouchMove={endPress}
                  className="select-none"
                >
                  <NavLink
                    to={`/app/dm/${v.dm.id}`}
                    className={`dm-item mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                      isOpen ? 'bg-surface2' : 'hover:bg-surface2/60'
                    } ${isBlocked ? 'opacity-50' : ''}`}
                  >
                    {v.dm.is_group ? (
                      <GroupAvatar profiles={v.others} />
                    ) : (
                      <Avatar profile={v.others[0]} size={36} status={st} showStatus />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                          {isPinned && <span title="Épinglée">📌</span>}
                          <span className="truncate">{dmTitle(v)}</span>
                          {!v.dm.is_group && v.others[0]?.is_verified && <VerifiedBadge size={13} />}
                        </p>
                        {v.lastMessage && !isBlocked && (
                          <span className="shrink-0 text-[11px] text-muted">{formatShort(v.lastMessage.created_at)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted">{isBlocked ? '🚫 Message bloqué' : preview(v)}</p>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isMuted && <span title="Sourdine">{muteIcon}</span>}
                          {v.unread > 0 && !isBlocked && (
                            <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                              {v.unread > 99 ? '99+' : v.unread}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </NavLink>
                </div>
              );
            })
          )}
        </div>
        {/* Barre de compte fixe (56 px) : avatar, nom avec ellipsis, cloche, paramètres.
            Boutons à taille fixe 36 px pour que le nom ne soit jamais écrasé,
            même dans un panneau de 240 px. */}
        <div className="flex h-14 shrink-0 items-center gap-1 border-t border-line bg-surface px-2">
          <span className="shrink-0">
            <Avatar profile={profile} size={36} status={myPresence} showStatus />
          </span>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-bold">{profile?.display_name || profile?.username || 'Moi'}</p>
            <p className="truncate text-[11px] text-muted">
              {STATUS_LABELS[myPresence as keyof typeof STATUS_LABELS] ?? 'Hors ligne'}
            </p>
          </div>
          <button
            onClick={() => navigate('/app/notifications')}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-ink"
            title="Notifications"
            aria-label="Notifications"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/app/parametres')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-ink"
            title="Paramètres utilisateur"
            aria-label="Paramètres utilisateur"
          >
            ⚙️
          </button>
        </div>
      </aside>
      <section className={`${openDmId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 bg-base`}>
        <Outlet />
      </section>

      {/* Fiche d'actions de la conversation (appui long) */}
      {sheetDM && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label="Actions de la conversation">
          <button aria-label="Fermer" onClick={() => setSheetDM(null)} className="absolute inset-0 bg-black/60" />
          <div className="relative w-full rounded-t-3xl bg-surface p-4 shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="mb-3 flex items-center gap-3 px-2">
              {sheetDM.dm.is_group ? <GroupAvatar profiles={sheetDM.others} size={44} /> : <Avatar profile={sheetDM.others[0]} size={44} />}
              <p className="truncate text-base font-extrabold">@{sheetDM.dm.is_group ? (sheetDM.dm.name || 'groupe') : (sheetDM.others[0]?.username ?? '')}</p>
            </div>
            <div className="space-y-1">
              {sheetFriend && (
                <button onClick={() => openProfile(sheetDM)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2">
                  <span className="text-muted">👤</span> Profil
                </button>
              )}
              <button onClick={() => closeDM(sheetDM)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2">
                <span className="text-muted">🚪</span> {sheetDM.dm.is_group ? 'Quitter le groupe' : 'Fermer le MP'}
              </button>
            </div>
            <div className="mt-2 space-y-1 rounded-2xl bg-surface2/50 p-1">
              <button onClick={() => togglePin(sheetDM)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2">
                <span className="text-muted">📌</span> {pinned.includes(sheetDM.dm.id) ? 'Désépingler' : 'Épingler'}
              </button>
            </div>
            <div className="mt-2 space-y-1 rounded-2xl bg-surface2/50 p-1">
              <button onClick={() => markAsRead(sheetDM)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2">
                <span className="text-muted">👁️</span> Marquer comme lu
              </button>
              <button onClick={() => toggleMute(sheetDM)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2">
                <span className="text-muted">🔕</span> {mutedIds.has(sheetDM.dm.id) ? 'Réactiver les notifications' : 'Rendre cette conversation muette'}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <ProfileCard
          profile={profileTarget}
          friendship={profileFriendship}
          status={online[profileTarget.id]?.status ?? 'hors_ligne'}
          onMessage={() => openMessageTo(profileTarget)}
          onClose={() => setProfileTarget(null)}
        />
      )}

      {showCreate && (
        <Modal title="Créer un groupe de discussion" onClose={() => setShowCreate(false)} wide>
          <form onSubmit={createGroup} className="space-y-4">
            <div>
              <label htmlFor="gname" className="mb-1 block text-sm font-medium">Nom du groupe</label>
              <input
                id="gname" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex. : Soirée jeux de vendredi"
                className="w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Inviter des amis ({selected.length}/9)</p>
              {friends.length === 0 ? (
                <p className="rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">
                  Tu n’as pas encore d’amis à inviter. Ajoute des amis d’abord.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
                  {friends.map((f) => (
                    <label key={f.profile.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface2">
                      <input
                        type="checkbox"
                        checked={selected.includes(f.profile.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, f.profile.id] : s.filter((id) => id !== f.profile.id),
                          )
                        }
                        className="h-4 w-4 accent-[#7C3AED]"
                      />
                      <Avatar profile={f.profile} size={32} />
                      <span className="text-sm font-medium">{f.profile.display_name || f.profile.username}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
                Annuler
              </button>
              <button type="submit" disabled={creating || friends.length === 0} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                {creating ? 'Création…' : 'Créer le groupe'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-base shadow-2xl md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

export function EmptyDM() {
  return (
    <EmptyState
      title="Tes messages privés"
      text="Sélectionne une conversation, ou touche ＋ pour écrire à un ami."
      action={
        <NavLink to="/app/dm/nouveau" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
          Nouveau message
        </NavLink>
      }
    />
  );
}
