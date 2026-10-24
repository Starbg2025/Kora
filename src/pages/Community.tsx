import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import CommunityMembers from '../components/CommunityMembers';
import CommunitySettings from '../components/CommunitySettings';
import ModerationPanel from '../components/ModerationPanel';
import InviteModal from '../components/InviteModal';
import type { ChannelOutletContext } from './ChannelRoute';
import { normalizeChannelName } from '../lib/community';
import type {
  Channel,
  ChannelCategory,
  Community,
  CommunityMember,
  CommunityRole,
} from '../lib/types';

/** Vue d'une communauté : sidebar des salons + contenu + panneau des membres. */
export default function Community() {
  const { communityId } = useParams<{ communityId: string }>();
  const match = useMatch('/app/c/:communityId/:channelId');
  const channelId = match?.params.channelId ?? null;
  const { sb, user } = useAuth();
  const { online } = usePresence();
  const navigate = useNavigate();
  const location = useLocation();
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [community, setCommunity] = useState<Community | null>(null);
  const [myRole, setMyRole] = useState<CommunityRole | null>(null);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  // Panneau membres : colonne persistante sur bureau, tiroir sur mobile
  const [membersOpen, setMembersOpen] = useState(() => {
    try {
      return localStorage.getItem('kora:members-open') !== 'false';
    } catch {
      return true;
    }
  });
  const [membersDrawer, setMembersDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');
  // Catégories repliées (persistées)
  const [collapsedCats, setCollapsedCats] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('kora:collapsed-cats') ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  // Création de salon / catégorie (admin)
  const [showChannelModal, setShowChannelModal] = useState<string | null>(null); // categoryId ou 'none'
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [newChannelCategory, setNewChannelCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const me = user?.id ?? '';
  const isAdmin = myRole === 'proprietaire' || myRole === 'admin';
  const canModerate = myRole === 'proprietaire' || myRole === 'admin' || myRole === 'moderateur';

  const logAction = useCallback(
    async (action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) => {
      if (!communityId) return;
      await sb.rpc('log_moderation_action', {
        p_community: communityId,
        p_action: action,
        p_target_type: targetType,
        p_target_id: targetId,
        p_details: details,
      });
    },
    [sb, communityId],
  );

  const load = useCallback(async () => {
    if (!communityId || !me) return;
    setLoading(true);
    setNotMember(false);
    const { data: cData, error: cErr } = await sb.from('communities').select('*').eq('id', communityId).single();
    if (cErr || !cData) {
      setNotMember(true);
      setLoading(false);
      return;
    }
    const [{ data: roleRow }, { data: catRows }, { data: chRows }, { data: memRows }] = await Promise.all([
      sb.from('community_members').select('role').eq('community_id', communityId).eq('user_id', me).maybeSingle(),
      sb.from('channel_categories').select('*').eq('community_id', communityId).order('position'),
      sb.from('channels').select('*').eq('community_id', communityId).order('position'),
      sb.from('community_members').select('*, profiles(*)').eq('community_id', communityId).order('joined_at'),
    ]);
    if (!roleRow) {
      setNotMember(true);
      setLoading(false);
      return;
    }
    setCommunity(cData as Community);
    setMyRole((roleRow as { role: CommunityRole }).role);
    setCategories((catRows ?? []) as ChannelCategory[]);
    setChannels((chRows ?? []) as Channel[]);
    setMembers(((memRows ?? []) as CommunityMember[]).map((m) => ({ ...m, profiles: m.profiles ?? null })));
    setLoading(false);
  }, [sb, communityId, me]);

  useEffect(() => {
    load();
  }, [load]);

  // Temps réel : communauté, membres, salons, catégories (topic unique par montage)
  useEffect(() => {
    if (!communityId || !me || !myRole) return;
    const ch = sb
      .channel(`community:${communityId}:${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communities', filter: `id=eq.${communityId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          navigate('/app/communautes');
          return;
        }
        setCommunity(payload.new as Community);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_members', filter: `community_id=eq.${communityId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_categories', filter: `community_id=eq.${communityId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `community_id=eq.${communityId}` }, () => load())
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, communityId, me, myRole, channelTag, load, navigate]);

  const channelsByCategory = useMemo(() => {
    const map = new Map<string | null, Channel[]>();
    for (const ch of channels) {
      const key = ch.category_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ch);
    }
    return map;
  }, [channels]);

  const uncategorized = channelsByCategory.get(null) ?? [];

  const outletContext: ChannelOutletContext = {
    communityId: communityId ?? '',
    myRole,
    members,
    onToggleMembers: () => {
      if (window.innerWidth < 768) {
        setMembersDrawer(true);
      } else {
        setMembersOpen((prev) => {
          const next = !prev;
          try {
            localStorage.setItem('kora:members-open', String(next));
          } catch {
            /* stockage indisponible */
          }
          return next;
        });
      }
    },
    onBack: () => navigate(`/app/c/${communityId}`),
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  };

  // Ouverture des paramètres demandée depuis le menu contextuel du rail
  useEffect(() => {
    const st = location.state as { openSettings?: boolean } | null;
    if (st?.openSettings) {
      setShowSettings(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const toggleCategory = (catId: string) => {
    setCollapsedCats((prev) => {
      const next = prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId];
      try {
        localStorage.setItem('kora:collapsed-cats', JSON.stringify(next));
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  };

  const openChannelModal = (categoryId: string | null) => {
    setShowChannelModal(categoryId === null ? 'none' : categoryId);
    setNewChannelCategory(categoryId);
    setNewChannelType('text');
    setNewChannelName('');
    setNewChannelTopic('');
  };

  const createChannel = async () => {
    const cleanName = normalizeChannelName(newChannelName);
    if (!cleanName) {
      flash('Nom de salon invalide.');
      return;
    }
    if (!communityId) return;
    setBusy(true);
    try {
      const targetCat = newChannelCategory;
      const pos = (channelsByCategory.get(targetCat) ?? []).length;
      const { data: created, error } = await sb
        .from('channels')
        .insert({
          community_id: communityId,
          category_id: targetCat,
          name: cleanName,
          topic: newChannelTopic.trim().slice(0, 200),
          type: newChannelType,
          position: pos,
        })
        .select('id')
        .single();
      if (error) throw error;
      await logAction('channel_created', 'channel', (created as { id: string }).id, { name: cleanName });
      setShowChannelModal(null);
      setNewChannelName('');
      setNewChannelTopic('');
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    const cleanName = newCategoryName.trim();
    if (!cleanName || !communityId) return;
    setBusy(true);
    try {
      const { data: created, error } = await sb
        .from('channel_categories')
        .insert({
          community_id: communityId,
          name: cleanName.slice(0, 60),
          position: categories.length,
        })
        .select('id')
        .single();
      if (error) throw error;
      await logAction('category_created', 'category', (created as { id: string }).id, { name: cleanName });
      setShowCategoryModal(false);
      setNewCategoryName('');
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const saveChannelEdit = async () => {
    if (!editingChannel) return;
    const cleanName = normalizeChannelName(editingChannel.name);
    if (!cleanName) {
      flash('Nom de salon invalide.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb
        .from('channels')
        .update({ name: cleanName, topic: editingChannel.topic.trim().slice(0, 200) })
        .eq('id', editingChannel.id);
      if (error) throw error;
      setEditingChannel(null);
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deleteChannel = async (ch: Channel) => {
    if (!window.confirm(`Supprimer le salon #${ch.name} et tous ses messages ?`)) return;
    const { error } = await sb.from('channels').delete().eq('id', ch.id);
    if (error) {
      flash(error.message);
      return;
    }
    await logAction('channel_deleted', 'channel', ch.id, { name: ch.name });
    if (channelId === ch.id) navigate(`/app/c/${communityId}`);
    load();
  };

  const moveChannel = async (ch: Channel, dir: -1 | 1) => {
    const siblings = (channelsByCategory.get(ch.category_id) ?? []).slice().sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((s) => s.id === ch.id);
    const other = siblings[idx + dir];
    if (!other) return;
    await sb.from('channels').update({ position: other.position }).eq('id', ch.id);
    await sb.from('channels').update({ position: ch.position }).eq('id', other.id);
    load();
  };

  const moveCategory = async (cat: ChannelCategory, dir: -1 | 1) => {
    const sortedCats = [...categories].sort((a, b) => a.position - b.position);
    const idx = sortedCats.findIndex((c) => c.id === cat.id);
    const other = sortedCats[idx + dir];
    if (!other) return;
    await sb.from('channel_categories').update({ position: other.position }).eq('id', cat.id);
    await sb.from('channel_categories').update({ position: cat.position }).eq('id', other.id);
    load();
  };

  const saveCategoryEdit = async () => {
    if (!editingCategory) return;
    const cleanName = editingCategory.name.trim();
    if (!cleanName) return;
    const { error } = await sb.from('channel_categories').update({ name: cleanName.slice(0, 60) }).eq('id', editingCategory.id);
    if (error) {
      flash(error.message);
      return;
    }
    setEditingCategory(null);
    load();
  };

  const deleteCategory = async (cat: ChannelCategory) => {
    if (!window.confirm(`Supprimer la catégorie « ${cat.name} » ? Les salons seront conservés sans catégorie.`)) return;
    const { error } = await sb.from('channel_categories').delete().eq('id', cat.id);
    if (error) {
      flash(error.message);
      return;
    }
    await logAction('category_deleted', 'category', cat.id, { name: cat.name });
    load();
  };

  const leaveCommunity = async () => {
    if (myRole === 'proprietaire') {
      flash('Transfère la propriété ou supprime la communauté avant de partir.');
      return;
    }
    const { error } = await sb.from('community_members').delete().eq('community_id', communityId).eq('user_id', me);
    if (error) {
      flash(error.message);
      return;
    }
    navigate('/app/communautes');
  };

  const deleteCommunity = async () => {
    const { error } = await sb.from('communities').delete().eq('id', communityId);
    if (error) {
      flash(error.message);
      return;
    }
    navigate('/app/communautes');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Chargement…</p>
      </div>
    );
  }

  if (notMember || !community) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-lg font-extrabold">Communauté introuvable</h2>
        <p className="text-sm text-muted">Elle n’existe pas ou tu n’y as plus accès.</p>
        <button
          onClick={() => navigate('/app/communautes')}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          Mes communautés
        </button>
      </div>
    );
  }

  const renderChannelRow = (ch: Channel) => {
    const active = channelId === ch.id;
    const isVoice = ch.type === 'voice';
    return (
      <div key={ch.id} className="group flex items-center gap-1 px-2">
        <button
          onClick={() => {
            if (isVoice) {
              flash('Les salons vocaux arrivent avec la prochaine mise à jour de Kora.');
              return;
            }
            navigate(`/app/c/${communityId}/${ch.id}`);
          }}
          className={`flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-left text-[15px] ${
            active ? 'bg-surface2 font-semibold text-ink' : 'text-muted hover:bg-surface2/60 hover:text-ink'
          }`}
        >
          <span className="shrink-0 text-base text-muted">{isVoice ? '🔊' : '#'}</span>
          <span className="truncate">{ch.name}</span>
        </button>
        {isAdmin && (
          <div className="hidden shrink-0 items-center group-hover:flex">
            <button
              onClick={() => moveChannel(ch, -1)}
              className="rounded px-1 text-muted hover:text-ink"
              title="Monter"
              aria-label="Monter le salon"
            >
              ↑
            </button>
            <button
              onClick={() => moveChannel(ch, 1)}
              className="rounded px-1 text-muted hover:text-ink"
              title="Descendre"
              aria-label="Descendre le salon"
            >
              ↓
            </button>
            <button
              onClick={() => setEditingChannel({ ...ch })}
              className="rounded px-1 text-muted hover:text-ink"
              title="Renommer"
              aria-label="Renommer le salon"
            >
              ✎
            </button>
            <button
              onClick={() => deleteChannel(ch)}
              className="rounded px-1 text-muted hover:text-danger"
              title="Supprimer"
              aria-label="Supprimer le salon"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-base">
      {/* Sidebar des salons (240 px sur bureau) */}
      <aside
        className={`${
          channelId ? 'hidden md:flex' : 'flex'
        } w-full flex-col bg-surface md:w-60 md:shrink-0`}
        aria-label="Salons de la communauté"
      >
        <div className="relative flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
          <button
            onClick={() => navigate('/app/communautes')}
            className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:hidden"
            aria-label="Retour aux communautés"
          >
            ←
          </button>
          {community.icon_url ? (
            <img src={community.icon_url} alt={community.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-base font-extrabold text-primary">
              {community.name.trim()[0]?.toUpperCase()}
            </div>
          )}
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-surface2/60"
            aria-label="Menu de la communauté"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold">{community.name}</span>
              <span className="block truncate text-[11px] text-muted">{members.length} membre{members.length > 1 ? 's' : ''}</span>
            </span>
            <span className="shrink-0 text-muted">{showMenu ? '▴' : '▾'}</span>
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink"
            title="Inviter des membres"
            aria-label="Inviter des membres"
          >
            🔗
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-2 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                <button
                  onClick={() => { setShowMenu(false); setShowInvite(true); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                >
                  <span>🔗</span> Inviter des membres
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (window.innerWidth < 768) setMembersDrawer(true);
                    else setMembersOpen(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                >
                  <span>👥</span> Voir les membres
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { setShowMenu(false); setShowSettings(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                  >
                    <span>⚙️</span> Paramètres
                  </button>
                )}
                {canModerate && (
                  <button
                    onClick={() => { setShowMenu(false); setShowModeration(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                  >
                    <span>🛡️</span> Modération
                  </button>
                )}
                <div className="h-px bg-line" />
                {myRole === 'proprietaire' ? (
                  <button
                    onClick={() => { setShowMenu(false); setConfirmDelete(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-danger hover:bg-surface2"
                  >
                    <span>🗑️</span> Supprimer la communauté
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowMenu(false); setConfirmLeave(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-danger hover:bg-surface2"
                  >
                    <span>🚪</span> Quitter la communauté
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {categories.map((cat) => {
            const collapsed = collapsedCats.includes(cat.id);
            const catChannels = (channelsByCategory.get(cat.id) ?? []).slice().sort((a, b) => a.position - b.position);
            return (
              <div key={cat.id} className="mb-1">
                <div className="group flex items-center px-3 py-1">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    aria-label={collapsed ? `Déplier ${cat.name}` : `Replier ${cat.name}`}
                  >
                    <span className="shrink-0 text-[10px] text-muted">{collapsed ? '▶' : '▼'}</span>
                    <span className="truncate text-xs font-bold uppercase tracking-wide text-muted">{cat.name}</span>
                  </button>
                  {isAdmin && (
                    <div className="hidden shrink-0 items-center group-hover:flex">
                      <button
                        onClick={() => openChannelModal(cat.id)}
                        className="rounded px-1 text-muted hover:text-ink"
                        title="Ajouter un salon"
                        aria-label="Ajouter un salon"
                      >
                        ＋
                      </button>
                      <button
                        onClick={() => moveCategory(cat, -1)}
                        className="rounded px-1 text-muted hover:text-ink"
                        title="Monter la catégorie"
                        aria-label="Monter la catégorie"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveCategory(cat, 1)}
                        className="rounded px-1 text-muted hover:text-ink"
                        title="Descendre la catégorie"
                        aria-label="Descendre la catégorie"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => setEditingCategory({ ...cat })}
                        className="rounded px-1 text-muted hover:text-ink"
                        title="Renommer la catégorie"
                        aria-label="Renommer la catégorie"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteCategory(cat)}
                        className="rounded px-1 text-muted hover:text-danger"
                        title="Supprimer la catégorie"
                        aria-label="Supprimer la catégorie"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                {!collapsed && (
                  <>
                    {catChannels.filter((c) => c.type !== 'voice').map(renderChannelRow)}
                    {catChannels.some((c) => c.type === 'voice') && catChannels.some((c) => c.type !== 'voice') && (
                      <p className="px-5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Vocal</p>
                    )}
                    {catChannels.filter((c) => c.type === 'voice').map(renderChannelRow)}
                  </>
                )}
              </div>
            );
          })}
          {uncategorized.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Sans catégorie</span>
              </div>
              {uncategorized.filter((c) => c.type !== 'voice').map(renderChannelRow)}
              {uncategorized.filter((c) => c.type === 'voice').map(renderChannelRow)}
            </div>
          )}
          {channels.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">Aucun salon pour le moment.</p>
          )}
        </div>

        {isAdmin && (
          <div className="flex gap-2 border-t border-line p-3">
            <button
              onClick={() => openChannelModal(null)}
              className="flex-1 rounded-xl bg-surface2 px-3 py-2 text-sm font-semibold hover:bg-line"
            >
              ＋ Salon
            </button>
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex-1 rounded-xl bg-surface2 px-3 py-2 text-sm font-semibold hover:bg-line"
            >
              ＋ Catégorie
            </button>
          </div>
        )}
      </aside>

      {/* Zone principale : vue salon */}
      <div className={`${channelId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {channelId ? (
          <Outlet context={outletContext} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="Sélectionne un salon" text="Choisis un salon dans la liste pour commencer à discuter." />
          </div>
        )}
      </div>

      {/* Panneau des membres : colonne persistante sur bureau, tiroir sur mobile */}
      {membersOpen && (
        <CommunityMembers
          variant="column"
          members={members}
          myRole={myRole}
          me={me}
          online={online}
          communityId={communityId!}
          onClose={() => {
            setMembersOpen(false);
            try {
              localStorage.setItem('kora:members-open', 'false');
            } catch {
              /* stockage indisponible */
            }
          }}
          onChanged={load}
          flash={flash}
        />
      )}
      {membersDrawer && (
        <CommunityMembers
          variant="drawer"
          members={members}
          myRole={myRole}
          me={me}
          online={online}
          communityId={communityId!}
          onClose={() => setMembersDrawer(false)}
          onChanged={load}
          flash={flash}
        />
      )}

      {showSettings && community && (
        <CommunitySettings
          community={community}
          myRole={myRole!}
          members={members}
          me={me}
          onClose={() => setShowSettings(false)}
          onChanged={load}
          flash={flash}
          onOpenModeration={() => {
            setShowSettings(false);
            setShowModeration(true);
          }}
        />
      )}

      {showModeration && community && (
        <ModerationPanel
          communityId={community.id}
          communityName={community.name}
          onClose={() => setShowModeration(false)}
          flash={flash}
        />
      )}

      {showInvite && community && (
        <InviteModal communityId={community.id} communityName={community.name} onClose={() => setShowInvite(false)} />
      )}

      {notice && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-base shadow-xl md:bottom-6">
          {notice}
        </div>
      )}

      {/* Modals de création / édition */}
      {showChannelModal !== null && (
        <Modal title="Créer un salon" onClose={() => setShowChannelModal(null)} maxWidth="max-w-[480px]">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom du salon</label>
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="ex. annonces"
                maxLength={40}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Type de salon</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewChannelType('text')}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                    newChannelType === 'text' ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:bg-surface2'
                  }`}
                >
                  # Textuel
                </button>
                <button
                  onClick={() => setNewChannelType('voice')}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                    newChannelType === 'voice' ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:bg-surface2'
                  }`}
                >
                  🔊 Vocal
                </button>
              </div>
              {newChannelType === 'voice' && (
                <p className="mt-1 text-xs text-muted">
                  Les salons vocaux seront affichés et pourront être rejoints dans une prochaine mise à jour.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Catégorie</label>
              <select
                value={newChannelCategory ?? ''}
                onChange={(e) => setNewChannelCategory(e.target.value === '' ? null : e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Sans catégorie</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sujet (optionnel)</label>
              <input
                value={newChannelTopic}
                onChange={(e) => setNewChannelTopic(e.target.value)}
                placeholder="De quoi parle ce salon ?"
                maxLength={200}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Visibilité</label>
              <select
                value="public"
                disabled
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-muted outline-none"
                title="Les salons privés réservés à certains rôles arrivent dans une prochaine mise à jour."
              >
                <option value="public">Public — tous les membres de la communauté</option>
              </select>
              <p className="mt-1 text-xs text-muted">Les salons privés (certains rôles seulement) arrivent bientôt.</p>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setShowChannelModal(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                onClick={createChannel}
                disabled={busy}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCategoryModal && (
        <Modal title="Créer une catégorie" onClose={() => setShowCategoryModal(false)}>
          <div className="space-y-3">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="ex. Jeux"
              maxLength={60}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCategoryModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                onClick={createCategory}
                disabled={busy}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? '…' : 'Créer'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editingChannel && (
        <Modal title="Modifier le salon" onClose={() => setEditingChannel(null)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <input
                value={editingChannel.name}
                onChange={(e) => setEditingChannel({ ...editingChannel, name: e.target.value })}
                maxLength={40}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sujet</label>
              <input
                value={editingChannel.topic}
                onChange={(e) => setEditingChannel({ ...editingChannel, topic: e.target.value })}
                maxLength={200}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingChannel(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                onClick={saveChannelEdit}
                disabled={busy}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editingCategory && (
        <Modal title="Renommer la catégorie" onClose={() => setEditingCategory(null)}>
          <div className="space-y-3">
            <input
              value={editingCategory.name}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              maxLength={60}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingCategory(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                onClick={saveCategoryEdit}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmLeave && (
        <Modal title="Quitter la communauté ?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-muted">
            Tu ne verras plus « {community.name} » et tu devras être réinvité pour revenir.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmLeave(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={() => { setConfirmLeave(false); leaveCommunity(); }}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Quitter
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Supprimer la communauté ?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-muted">
            « {community.name} », ses salons et tous ses messages seront définitivement supprimés. Cette action est irréversible.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={() => { setConfirmDelete(false); deleteCommunity(); }}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Supprimer définitivement
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
