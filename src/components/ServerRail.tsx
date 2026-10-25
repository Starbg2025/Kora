import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useNotifications } from '../context/NotificationsContext';
import { useCommunities, type CommunityEntry } from '../hooks/useCommunities';
import { isDevMode, markCommunityRead } from '../lib/devMode';
import type { ServerFolder, ServerFolderItem } from '../lib/types';
import Avatar from './Avatar';
import Logo from './Logo';
import Modal from './Modal';
import CreateCommunityModal from './CreateCommunityModal';
import JoinCommunityModal from './JoinCommunityModal';
import InviteModal from './InviteModal';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';

function RailButton({
  active,
  onClick,
  onContextMenu,
  title,
  draggable,
  onDragStart,
  onDragEnd,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      aria-label={title}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all hover:rounded-xl ${
        active ? 'rounded-xl bg-primary text-white' : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
      }`}
    >
      {active && <span className="absolute -left-2.5 h-8 w-1 rounded-r-full bg-ink" />}
      {children}
    </button>
  );
}

const ICONS = {
  dm: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  discover: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  bell: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  search: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  settings: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

/**
 * Rail unique (bureau, 64 px) : accueil, messages privés, communautés,
 * création/découverte, notifications, paramètres, profil. Les noms des
 * serveurs n'apparaissent que dans les infobulles (title) et les menus.
 */
export default function ServerRail() {
  const { sb, user, profile } = useAuth();
  const { online } = usePresence();
  const { unreadCount } = useNotifications();
  const { communities, reload } = useCommunities();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [plusMenu, setPlusMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; community: CommunityEntry } | null>(null);
  const [inviteCommunity, setInviteCommunity] = useState<CommunityEntry | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<CommunityEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CommunityEntry | null>(null);
  const [notice, setNotice] = useState('');
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [folderItems, setFolderItems] = useState<ServerFolderItem[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('kora:folder-collapsed') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const [folderCtx, setFolderCtx] = useState<{ x: number; y: number; folder: ServerFolder } | null>(null);
  const [moveTarget, setMoveTarget] = useState<CommunityEntry | null>(null);
  const [folderEditor, setFolderEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<ServerFolder | null>(null);
  const [devMode, setDevMode] = useState(isDevMode());
  const navigate = useNavigate();
  const location = useLocation();

  const activeCommunity = /^\/app\/c\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
  const onDMs = location.pathname.startsWith('/app/dm');
  const myPresence = profile ? online[profile.id]?.status ?? profile.status : 'hors_ligne';
  const me = user?.id ?? '';

  const openCommunity = (c: CommunityEntry) => {
    setCtxMenu(null);
    navigate(`/app/c/${c.id}`);
  };

  const leaveCommunity = async (c: CommunityEntry) => {
    if (c.role === 'proprietaire') {
      setNotice('Transfère la propriété ou supprime la communauté avant de partir.');
      setConfirmLeave(null);
      return;
    }
    const { error } = await sb.from('community_members').delete().eq('community_id', c.id).eq('user_id', me);
    if (error) {
      setNotice(error.message);
    } else {
      if (activeCommunity === c.id) navigate('/app/communautes');
      reload();
    }
    setConfirmLeave(null);
  };

  const deleteCommunity = async (c: CommunityEntry) => {
    const { error } = await sb.from('communities').delete().eq('id', c.id);
    if (error) {
      setNotice(error.message);
    } else {
      if (activeCommunity === c.id) navigate('/app/communautes');
      reload();
    }
    setConfirmDelete(null);
  };

  // --- Dossiers de serveurs (persistés par utilisateur, migration 20261027) ---
  const loadFolders = async () => {
    if (!me) return;
    try {
      const [{ data: f }, { data: items }] = await Promise.all([
        sb.from('server_folders').select('*').eq('owner_id', me).order('position', { ascending: true }),
        sb.from('server_folder_items').select('*').eq('owner_id', me).order('position', { ascending: true }),
      ]);
      setFolders((f ?? []) as ServerFolder[]);
      setFolderItems((items ?? []) as ServerFolderItem[]);
    } catch {
      // Tables absentes (migration en attente) : les dossiers sont indisponibles,
      // les communautés s'affichent simplement sans dossier.
      setFolders([]);
      setFolderItems([]);
    }
  };

  useEffect(() => {
    loadFolders();
    const onDev = () => setDevMode(isDevMode());
    window.addEventListener('kora:dev-mode-changed', onDev);
    return () => window.removeEventListener('kora:dev-mode-changed', onDev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const folderOf = (communityId: string) => folderItems.find((i) => i.community_id === communityId)?.folder_id ?? null;
  const unfiled = communities.filter((c) => !folderOf(c.id));
  const folderCommunities = (folderId: string) => {
    const ids = folderItems.filter((i) => i.folder_id === folderId).map((i) => i.community_id);
    return ids.map((id) => communities.find((c) => c.id === id)).filter((c): c is CommunityEntry => !!c);
  };

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('kora:folder-collapsed', JSON.stringify([...next]));
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  };

  const moveCommunity = async (communityId: string, folderId: string | null) => {
    await sb.from('server_folder_items').delete().eq('owner_id', me).eq('community_id', communityId);
    if (folderId) {
      const maxPos = folderItems.filter((i) => i.folder_id === folderId).reduce((m, i) => Math.max(m, i.position), -1);
      await sb.from('server_folder_items').insert({ owner_id: me, folder_id: folderId, community_id: communityId, position: maxPos + 1 });
    }
    setMoveTarget(null);
    await loadFolders();
  };

  const saveFolder = async () => {
    if (!folderEditor) return;
    const name = folderEditor.name.trim().slice(0, 40);
    if (!name) return;
    if (folderEditor.id) {
      await sb.from('server_folders').update({ name }).eq('id', folderEditor.id);
    } else {
      await sb.from('server_folders').insert({ owner_id: me, name, position: folders.length });
    }
    setFolderEditor(null);
    await loadFolders();
  };

  const deleteFolder = async (f: ServerFolder) => {
    await sb.from('server_folder_items').delete().eq('folder_id', f.id);
    await sb.from('server_folders').delete().eq('id', f.id);
    setFolderToDelete(null);
    await loadFolders();
  };

  const markServerRead = async (c: CommunityEntry) => {
    const { data } = await sb.from('channels').select('id').eq('community_id', c.id);
    markCommunityRead(((data ?? []) as { id: string }[]).map((r) => r.id));
    setCtxMenu(null);
    setNotice(`« ${c.name} » marqué comme lu.`);
  };

  const communityButton = (c: CommunityEntry) => (
    <RailButton
      key={c.id}
      active={activeCommunity === c.id}
      onClick={() => navigate(`/app/c/${c.id}`)}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, community: c });
      }}
      title={c.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/kora-community', c.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      {c.icon_url ? (
        <img src={c.icon_url} alt={c.name} className="h-11 w-11 rounded-2xl object-cover hover:rounded-xl" />
      ) : (
        <span className="text-lg font-extrabold">{c.name.trim()[0]?.toUpperCase() ?? '?'}</span>
      )}
    </RailButton>
  );

  return (
    <>
      <nav
        className="hidden w-16 shrink-0 flex-col items-center gap-2.5 overflow-y-auto bg-surface py-3 md:flex"
        aria-label="Serveurs et navigation"
      >
        <button onClick={() => navigate('/')} title="Kora — accueil" aria-label="Kora — accueil" className="shrink-0">
          <Logo size={44} />
        </button>
        <RailButton active={onDMs && !activeCommunity} onClick={() => navigate('/app/dm')} title="Messages privés">
          {ICONS.dm}
        </RailButton>
        <RailButton active={false} onClick={() => window.dispatchEvent(new Event('kora:open-search'))} title="Rechercher dans tes messages (Ctrl+K)">
          {ICONS.search}
        </RailButton>
        <div className="h-px w-8 shrink-0 bg-line" />
        {/* Communautés sans dossier */}
        <div
          className="flex flex-col items-center gap-2.5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const cid = e.dataTransfer.getData('text/kora-community');
            if (cid) void moveCommunity(cid, null);
          }}
        >
          {unfiled.map((c) => communityButton(c))}
        </div>
        {/* Dossiers : repliables, glisser-déposer vers l'en-tête */}
        {folders.map((f) => {
          const items = folderCommunities(f.id);
          const collapsed = collapsedFolders.has(f.id);
          const containsActive = items.some((c) => c.id === activeCommunity);
          return (
            <div key={f.id} className="flex flex-col items-center gap-2.5">
              <button
                onClick={() => toggleFolder(f.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFolderCtx({ x: e.clientX, y: e.clientY, folder: f });
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const cid = e.dataTransfer.getData('text/kora-community');
                  if (cid) void moveCommunity(cid, f.id);
                }}
                title={`${f.name} (${items.length}) — clic pour ${collapsed ? 'déplier' : 'replier'}, clic droit pour gérer`}
                aria-label={`Dossier ${f.name}`}
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all hover:rounded-xl ${
                  containsActive ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
                }`}
              >
                <FolderPlus size={20} />
                <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-base px-0.5 text-[10px] font-bold text-ink">
                  {items.length}
                </span>
                <span className="absolute -left-1.5 top-1 text-ink">
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
              </button>
              {!collapsed && items.map((c) => communityButton(c))}
            </div>
          );
        })}
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setPlusMenu({ x: r.right + 8, y: r.top });
          }}
          title="Créer ou rejoindre une communauté"
          aria-label="Créer ou rejoindre une communauté"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface2 text-xl text-muted transition-all hover:rounded-xl hover:bg-primary hover:text-white"
        >
          ＋
        </button>
        <RailButton
          active={location.pathname === '/app/decouvrir'}
          onClick={() => navigate('/app/decouvrir')}
          title="Découvrir des communautés"
        >
          {ICONS.discover}
        </RailButton>
        <div className="flex-1" />
        <div className="relative">
          <RailButton
            active={location.pathname === '/app/notifications'}
            onClick={() => navigate('/app/notifications')}
            title="Notifications"
          >
            {ICONS.bell}
          </RailButton>
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <RailButton
          active={location.pathname === '/app/parametres'}
          onClick={() => navigate('/app/parametres')}
          title="Paramètres"
        >
          {ICONS.settings}
        </RailButton>
        <button
          onClick={() => navigate('/app/parametres?onglet=profil')}
          title="Mon profil"
          aria-label="Mon profil"
          className="shrink-0"
        >
          <Avatar profile={profile} size={44} status={myPresence} showStatus />
        </button>
      </nav>

      {plusMenu && (
        <ContextMenu x={plusMenu.x} y={plusMenu.y} onClose={() => setPlusMenu(null)}>
          <ContextMenuItem
            onClick={() => {
              setPlusMenu(null);
              setShowCreate(true);
            }}
          >
            Créer une communauté
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setPlusMenu(null);
              setShowJoin(true);
            }}
          >
            Rejoindre une communauté
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setPlusMenu(null);
              setFolderEditor({ id: null, name: '' });
            }}
          >
            Nouveau dossier de serveurs
          </ContextMenuItem>
        </ContextMenu>
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}>
          <ContextMenuItem onClick={() => openCommunity(ctxMenu.community)}>Ouvrir la communauté</ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setInviteCommunity(ctxMenu.community);
              setCtxMenu(null);
            }}
          >
            Inviter des membres
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const c = ctxMenu.community;
              setCtxMenu(null);
              navigate(`/app/c/${c.id}`, { state: { openSettings: true } });
            }}
          >
            Modifier la communauté
          </ContextMenuItem>
          <ContextMenuItem onClick={() => markServerRead(ctxMenu.community)}>Marquer comme lu</ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setMoveTarget(ctxMenu.community);
              setCtxMenu(null);
            }}
          >
            Déplacer vers…
          </ContextMenuItem>
          {devMode && (
            <ContextMenuItem
              onClick={() => {
                void navigator.clipboard?.writeText(ctxMenu.community.id);
                setNotice(`ID copié : ${ctxMenu.community.id.slice(0, 8)}…`);
                setCtxMenu(null);
              }}
            >
              Copier l’ID
            </ContextMenuItem>
          )}
          <div className="my-1 h-px bg-line" />
          {ctxMenu.community.role === 'proprietaire' ? (
            <ContextMenuItem
              danger
              onClick={() => {
                setConfirmDelete(ctxMenu.community);
                setCtxMenu(null);
              }}
            >
              Supprimer la communauté
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              danger
              onClick={() => {
                setConfirmLeave(ctxMenu.community);
                setCtxMenu(null);
              }}
            >
              Quitter la communauté
            </ContextMenuItem>
          )}
        </ContextMenu>
      )}

      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            reload();
            navigate(`/app/c/${id}`);
          }}
        />
      )}
      {showJoin && <JoinCommunityModal onClose={() => setShowJoin(false)} />}
      {inviteCommunity && (
        <InviteModal
          communityId={inviteCommunity.id}
          communityName={inviteCommunity.name}
          onClose={() => setInviteCommunity(null)}
        />
      )}

      {confirmLeave && (
        <Modal title="Quitter la communauté ?" onClose={() => setConfirmLeave(null)}>
          <p className="text-sm text-muted">
            Tu ne verras plus « {confirmLeave.name} » et tu devras être réinvité pour revenir.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmLeave(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={() => leaveCommunity(confirmLeave)}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Quitter
            </button>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Supprimer la communauté ?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted">
            « {confirmDelete.name} », ses salons et tous ses messages seront définitivement supprimés. Cette action est
            irréversible.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={() => deleteCommunity(confirmDelete)}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Supprimer définitivement
            </button>
          </div>
        </Modal>
      )}
      {folderCtx && (
        <ContextMenu x={folderCtx.x} y={folderCtx.y} onClose={() => setFolderCtx(null)}>
          <ContextMenuItem
            onClick={() => {
              toggleFolder(folderCtx.folder.id);
              setFolderCtx(null);
            }}
          >
            {collapsedFolders.has(folderCtx.folder.id) ? 'Déplier' : 'Replier'}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setFolderEditor({ id: folderCtx.folder.id, name: folderCtx.folder.name });
              setFolderCtx(null);
            }}
          >
            Renommer
          </ContextMenuItem>
          <ContextMenuItem
            danger
            onClick={() => {
              setFolderToDelete(folderCtx.folder);
              setFolderCtx(null);
            }}
          >
            Supprimer le dossier
          </ContextMenuItem>
        </ContextMenu>
      )}

      {moveTarget && (
        <Modal title={`Déplacer « ${moveTarget.name} »`} onClose={() => setMoveTarget(null)}>
          <p className="mb-3 text-sm text-muted">Choisis un dossier (les serveurs restent dans ton rail, juste regroupés).</p>
          <div className="space-y-2">
            <button
              onClick={() => moveCommunity(moveTarget.id, null)}
              className="w-full rounded-xl bg-surface2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-line"
            >
              Aucun dossier (hors dossier)
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => moveCommunity(moveTarget.id, f.id)}
                className="w-full rounded-xl bg-surface2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-line"
              >
                {f.name}
                {folderOf(moveTarget.id) === f.id && <span className="ml-2 text-xs text-primary">· déjà ici</span>}
              </button>
            ))}
            <button
              onClick={() => {
                setMoveTarget(null);
                setFolderEditor({ id: null, name: '' });
              }}
              className="w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-sm font-semibold text-muted hover:bg-surface2"
            >
              ＋ Nouveau dossier…
            </button>
          </div>
        </Modal>
      )}

      {folderEditor && (
        <Modal title={folderEditor.id ? 'Renommer le dossier' : 'Nouveau dossier'} onClose={() => setFolderEditor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveFolder();
            }}
            className="space-y-4"
          >
            <input
              autoFocus
              value={folderEditor.name}
              onChange={(e) => setFolderEditor({ ...folderEditor, name: e.target.value })}
              placeholder="Ex. : Jeux, Copains, Travail"
              maxLength={40}
              className="w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFolderEditor(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
                {folderEditor.id ? 'Renommer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {folderToDelete && (
        <Modal title="Supprimer le dossier ?" onClose={() => setFolderToDelete(null)}>
          <p className="text-sm text-muted">
            « {folderToDelete.name} » sera supprimé, mais ses communautés restent dans ton rail (hors dossier).
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setFolderToDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
              Annuler
            </button>
            <button
              onClick={() => deleteFolder(folderToDelete)}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}

      {notice && (
        <div className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-base shadow-xl md:bottom-6">
          {notice}
        </div>
      )}
    </>
  );
}
