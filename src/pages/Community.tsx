import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import CommunityMembers from '../components/CommunityMembers';
import CommunitySettings from '../components/CommunitySettings';
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
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');

  const [community, setCommunity] = useState<Community | null>(null);
  const [myRole, setMyRole] = useState<CommunityRole | null>(null);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');

  // Création de salon / catégorie (admin)
  const [showChannelModal, setShowChannelModal] = useState<string | null>(null); // categoryId ou 'none'
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const me = user?.id ?? '';
  const isAdmin = myRole === 'proprietaire' || myRole === 'admin';

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
    onToggleMembers: () => setShowMembers(true),
    onBack: () => navigate(`/app/c/${communityId}`),
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
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
      const pos = (channelsByCategory.get(showChannelModal === 'none' ? null : showChannelModal) ?? []).length;
      const { error } = await sb.from('channels').insert({
        community_id: communityId,
        category_id: showChannelModal === 'none' ? null : showChannelModal,
        name: cleanName,
        topic: newChannelTopic.trim().slice(0, 200),
        position: pos,
      });
      if (error) throw error;
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
      const { error } = await sb.from('channel_categories').insert({
        community_id: communityId,
        name: cleanName.slice(0, 60),
        position: categories.length,
      });
      if (error) throw error;
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
    return (
      <div key={ch.id} className="group flex items-center gap-1 px-2">
        <button
          onClick={() => navigate(`/app/c/${communityId}/${ch.id}`)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[15px] ${
            active ? 'bg-surface2 font-semibold text-ink' : 'text-muted hover:bg-surface2/60 hover:text-ink'
          }`}
        >
          <span className="shrink-0 text-lg text-muted">#</span>
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
      {/* Sidebar des salons */}
      <aside
        className={`${
          channelId ? 'hidden md:flex' : 'flex'
        } w-full flex-col bg-surface md:w-64 md:shrink-0`}
        aria-label="Salons de la communauté"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <button
            onClick={() => navigate('/app/communautes')}
            className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink md:hidden"
            aria-label="Retour aux communautés"
          >
            ←
          </button>
          {community.icon_url ? (
            <img src={community.icon_url} alt={community.name} className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-xl font-extrabold text-primary">
              {community.name.trim()[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-extrabold">{community.name}</h1>
            <p className="truncate text-xs text-muted">{members.length} membre{members.length > 1 ? 's' : ''}</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink"
              aria-label="Menu de la communauté"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
                  <button
                    onClick={() => { setShowMenu(false); setShowInvite(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-surface2"
                  >
                    <span>🔗</span> Inviter des membres
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); setShowMembers(true); }}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {categories.map((cat) => (
            <div key={cat.id} className="mb-1">
              <div className="group flex items-center px-3 py-1">
                <span className="flex-1 truncate text-xs font-bold uppercase tracking-wide text-muted">{cat.name}</span>
                {isAdmin && (
                  <div className="hidden items-center group-hover:flex">
                    <button
                      onClick={() => setShowChannelModal(cat.id)}
                      className="rounded px-1 text-muted hover:text-ink"
                      title="Ajouter un salon"
                      aria-label="Ajouter un salon"
                    >
                      ＋
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
              {(channelsByCategory.get(cat.id) ?? []).map(renderChannelRow)}
            </div>
          ))}
          {uncategorized.length > 0 && (
            <div className="mb-1">
              <div className="px-3 py-1">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Sans catégorie</span>
              </div>
              {uncategorized.map(renderChannelRow)}
            </div>
          )}
          {channels.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">Aucun salon pour le moment.</p>
          )}
        </div>

        {isAdmin && (
          <div className="flex gap-2 border-t border-line p-3">
            <button
              onClick={() => setShowChannelModal('none')}
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

      {/* Panneau des membres : colonne sur desktop, tiroir sur mobile */}
      {showMembers && (
        <CommunityMembers
          members={members}
          myRole={myRole}
          me={me}
          online={online}
          communityId={communityId!}
          onClose={() => setShowMembers(false)}
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
        <Modal title="Créer un salon" onClose={() => setShowChannelModal(null)}>
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
              <label className="mb-1 block text-sm font-medium">Sujet (optionnel)</label>
              <input
                value={newChannelTopic}
                onChange={(e) => setNewChannelTopic(e.target.value)}
                placeholder="De quoi parle ce salon ?"
                maxLength={200}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowChannelModal(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button
                onClick={createChannel}
                disabled={busy}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? '…' : 'Créer'}
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
