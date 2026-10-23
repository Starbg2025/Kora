import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useFriends } from '../hooks/useFriends';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { timeAgo } from '../lib/format';
import type { DM, Message, Profile } from '../lib/types';

export interface DMView {
  dm: DM;
  others: Profile[]; // membres sauf moi
  lastMessage: Message | null;
  lastAuthorName: string;
  unread: number;
}

function GroupAvatar({ profiles, size = 44 }: { profiles: Profile[]; size?: number }) {
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

export default function DMs() {
  const { sb, user } = useAuth();
  const { online } = usePresence();
  const { entries } = useFriends();
  const navigate = useNavigate();
  const match = useMatch('/app/dm/:dmId');
  const openDmId = match?.params.dmId ?? null;

  const [views, setViews] = useState<DMView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const me = user?.id ?? '';

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
    built.sort((a, b) => {
      const ta = a.lastMessage?.created_at ?? a.dm.created_at;
      const tb = b.lastMessage?.created_at ?? b.dm.created_at;
      return tb.localeCompare(ta);
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
      .channel('dms-feed')
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
          next.sort((a, b) => {
            const ta = a.lastMessage?.created_at ?? a.dm.created_at;
            const tb = b.lastMessage?.created_at ?? b.dm.created_at;
            return tb.localeCompare(ta);
          });
          return next;
        });
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
  }, [sb, me, openDmId, load]);

  const dmTitle = (v: DMView) => {
    if (v.dm.is_group) return v.dm.name || 'Groupe sans nom';
    return v.others[0]?.display_name || v.others[0]?.username || 'Conversation';
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

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-lg font-extrabold">Messages privés</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary px-3 py-1.5 text-sm font-bold text-white hover:opacity-90"
            title="Créer un groupe"
          >
            + Groupe
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Chargement…</p>
          ) : views.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-semibold">Aucune conversation</p>
              <p className="mt-1 text-sm text-muted">Ouvre le profil d’un ami et clique sur « Message » pour commencer.</p>
            </div>
          ) : (
            views.map((v) => {
              const isOpen = openDmId === v.dm.id;
              const st = !v.dm.is_group && v.others[0] ? online[v.others[0].id]?.status ?? 'hors_ligne' : null;
              return (
                <NavLink
                  key={v.dm.id}
                  to={`/app/dm/${v.dm.id}`}
                  className={`dm-item mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    isOpen ? 'bg-surface2' : 'hover:bg-surface2/60'
                  }`}
                >
                  {v.dm.is_group ? (
                    <GroupAvatar profiles={v.others} />
                  ) : (
                    <Avatar profile={v.others[0]} size={44} status={st} showStatus />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{dmTitle(v)}</p>
                      {v.lastMessage && (
                        <span className="shrink-0 text-[11px] text-muted">{timeAgo(v.lastMessage.created_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted">
                        {v.lastMessage
                          ? `${v.lastMessage.author_id === me ? 'Toi' : v.lastAuthorName} : ${v.lastMessage.attachment_name && !v.lastMessage.content ? `Fichier : ${v.lastMessage.attachment_name}` : v.lastMessage.content}`
                          : 'Aucun message pour l’instant'}
                      </p>
                      {v.unread > 0 && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
                          {v.unread > 99 ? '99+' : v.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </NavLink>
              );
            })
          )}
        </div>
      </aside>
      <section className="min-w-0 flex-1 bg-base">
        <Outlet />
      </section>

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
    </div>
  );
}

export function EmptyDM() {
  return (
    <EmptyState
      title="Tes messages privés"
      text="Sélectionne une conversation à gauche, ou ouvre le profil d’un ami et clique sur « Message » pour en commencer une."
      action={
        <NavLink to="/app/amis" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
          Voir mes amis
        </NavLink>
      }
    />
  );
}
