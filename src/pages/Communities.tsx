import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCommunities } from '../hooks/useCommunities';
import CreateCommunityModal from '../components/CreateCommunityModal';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { ROLE_LABELS, type ServerFolder, type ServerFolderItem } from '../lib/types';

function CommunityIcon({ name, iconUrl, size = 56 }: { name: string; iconUrl: string | null; size?: number }) {
  if (iconUrl) {
    return <img src={iconUrl} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-2xl font-extrabold text-primary"
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

/** Mes communautés : liste, création, accès à la découverte. */
export default function Communities() {
  const { sb, user } = useAuth();
  const { communities, loading, reload } = useCommunities();
  const [showCreate, setShowCreate] = useState(false);
  const [folders, setFolders] = useState<ServerFolder[]>([]);
  const [folderItems, setFolderItems] = useState<ServerFolderItem[]>([]);
  const [moveTarget, setMoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [folderEditor, setFolderEditor] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMenu, setFolderMenu] = useState<ServerFolder | null>(null);
  const [renameName, setRenameName] = useState('');
  const [confirmFolderDelete, setConfirmFolderDelete] = useState(false);
  const navigate = useNavigate();
  const me = user?.id ?? '';

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
      setFolders([]);
      setFolderItems([]);
    }
  };

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const folderOf = (communityId: string) => folderItems.find((i) => i.community_id === communityId)?.folder_id ?? null;
  const moveCommunity = async (communityId: string, folderId: string | null) => {
    await sb.from('server_folder_items').delete().eq('owner_id', me).eq('community_id', communityId);
    if (folderId) {
      const maxPos = folderItems.filter((i) => i.folder_id === folderId).reduce((m, i) => Math.max(m, i.position), -1);
      await sb.from('server_folder_items').insert({ owner_id: me, folder_id: folderId, community_id: communityId, position: maxPos + 1 });
    }
    setMoveTarget(null);
    await loadFolders();
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim().slice(0, 40);
    if (!name) return;
    await sb.from('server_folders').insert({ owner_id: me, name, position: folders.length });
    setNewFolderName('');
    setFolderEditor(false);
    await loadFolders();
  };

  const renameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderMenu) return;
    const name = renameName.trim().slice(0, 40);
    if (!name) return;
    await sb.from('server_folders').update({ name }).eq('id', folderMenu.id);
    setFolderMenu(null);
    await loadFolders();
  };

  const deleteFolder = async () => {
    if (!folderMenu) return;
    await sb.from('server_folder_items').delete().eq('folder_id', folderMenu.id);
    await sb.from('server_folders').delete().eq('id', folderMenu.id);
    setConfirmFolderDelete(false);
    setFolderMenu(null);
    await loadFolders();
  };

  const row = (c: (typeof communities)[number]) => (
    <li key={c.id} className="flex items-center gap-2">
      <button
        onClick={() => navigate(`/app/c/${c.id}`)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl bg-surface p-4 text-left hover:bg-surface2"
      >
        <CommunityIcon name={c.name} iconUrl={c.icon_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{c.name}</span>
          {c.description && <span className="block truncate text-sm text-muted">{c.description}</span>}
          <span className="mt-1 inline-block rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold text-muted">
            {ROLE_LABELS[c.role]}
          </span>
        </span>
        <span className="text-muted">›</span>
      </button>
      <button
        onClick={() => setMoveTarget({ id: c.id, name: c.name })}
        className="shrink-0 rounded-xl bg-surface px-3 py-3 text-lg text-muted hover:bg-surface2"
        aria-label={`Déplacer ${c.name} vers un dossier`}
        title="Déplacer vers un dossier"
      >
        ⋯
      </button>
    </li>
  );

  const unfiled = communities.filter((c) => !folderOf(c.id));

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0 text-xl font-extrabold sm:text-2xl">Communautés</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/decouvrir"
            className="shrink-0 whitespace-nowrap rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line"
          >
            Découvrir
          </Link>
          <button
            onClick={() => setFolderEditor(true)}
            className="shrink-0 whitespace-nowrap rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line"
          >
            Nouveau dossier
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 whitespace-nowrap rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            ＋ Créer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : communities.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="Aucune communauté"
            text="Crée ta première communauté ou rejoins-en une via Découvrir."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-6 overflow-y-auto pb-4">
          <ul className="space-y-2">{unfiled.map(row)}</ul>
          {folders.map((f) => {
            const items = folderItems
              .filter((i) => i.folder_id === f.id)
              .map((i) => communities.find((c) => c.id === i.community_id))
              .filter((c) => !!c);
            return (
              <section key={f.id}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h2 className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-muted">
                    {f.name} · {items.length}
                  </h2>
                  <button
                    onClick={() => {
                      setFolderMenu(f);
                      setRenameName(f.name);
                      setConfirmFolderDelete(false);
                    }}
                    className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-surface2"
                    aria-label={`Gérer le dossier ${f.name}`}
                    title="Gérer le dossier"
                  >
                    ⋯
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="px-1 text-sm text-muted">
                    Aucune communauté dans ce dossier — utilise ⋯ sur une communauté pour l’y déplacer.
                  </p>
                ) : (
                  <ul className="space-y-2">{items.map(row)}</ul>
                )}
              </section>
            );
          })}
          <div className="rounded-2xl border border-dashed border-line px-4 py-4">
            <p className="text-sm font-semibold">Envie de plus de monde ?</p>
            <p className="mt-1 text-sm text-muted">
              Découvre des communautés publiques ou crée la tienne pour inviter tes amis.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/app/decouvrir"
                className="rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line"
              >
                Découvrir
              </Link>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                ＋ Créer une communauté
              </button>
            </div>
          </div>
        </div>
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

      {moveTarget && (
        <Modal title={`Déplacer « ${moveTarget.name} »`} onClose={() => setMoveTarget(null)}>
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
          </div>
        </Modal>
      )}

      {folderMenu && (
        <Modal title="Gérer le dossier" onClose={() => setFolderMenu(null)}>
          <form onSubmit={renameFolder} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Nom du dossier</span>
              <input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={40}
                className="mt-1 w-full rounded-xl bg-base px-3 py-2 text-sm outline-none ring-primary focus:ring-2"
              />
            </label>
            <button type="submit" className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
              Renommer
            </button>
          </form>
          {!confirmFolderDelete ? (
            <button
              onClick={() => setConfirmFolderDelete(true)}
              className="mt-3 w-full rounded-xl bg-danger/15 px-4 py-2 text-sm font-bold text-danger"
            >
              Supprimer le dossier
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted">
                Supprimer ce dossier ? Les communautés qu’il contient resteront dans ta liste, hors dossier.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={deleteFolder}
                  className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white"
                >
                  Oui, supprimer
                </button>
                <button
                  onClick={() => setConfirmFolderDelete(false)}
                  className="flex-1 rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {folderEditor && (
        <Modal title="Nouveau dossier" onClose={() => setFolderEditor(false)}>
          <form onSubmit={createFolder} className="space-y-4">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Ex. : Jeux, Copains, Travail"
              maxLength={40}
              className="w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFolderEditor(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
                Annuler
              </button>
              <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">Créer</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
