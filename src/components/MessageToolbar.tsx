import { Link2, MoreHorizontal, Pencil, Reply, Smile, Trash2 } from 'lucide-react';
/**
 * Barre d'actions flottante d'un message (bureau) : apparaît au survol, ancrée
 * en haut à droite du message. Le parent doit être `relative` et `group`.
 * Sur mobile, l'appui long existant reste le mécanisme principal.
 */
export default function MessageToolbar({
  onReact,
  onReply,
  onCopyLink,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  onMore,
}: {
  onReact: () => void;
  onReply: () => void;
  onCopyLink: () => void;
  canEdit: boolean;
  onEdit?: () => void;
  canDelete: boolean;
  onDelete?: () => void;
  onMore: () => void;
}) {
  const btn =
    'flex h-7 w-7 items-center justify-center rounded-md text-sm text-muted hover:bg-surface2 hover:text-ink';
  return (
    <div className="absolute -top-3 right-2 z-20 hidden items-center gap-0.5 rounded-lg border border-line bg-surface px-1 py-0.5 shadow-xl group-hover:flex">
      <button onClick={onReact} className={btn} title="Ajouter une réaction" aria-label="Ajouter une réaction">
        <Smile size={16} />
      </button>
      <button onClick={onReply} className={btn} title="Répondre" aria-label="Répondre">
        <Reply size={16} />
      </button>
      <button onClick={onCopyLink} className={btn} title="Copier le lien du message" aria-label="Copier le lien du message">
        <Link2 size={16} />
      </button>
      {canEdit && (
        <button onClick={onEdit} className={btn} title="Modifier" aria-label="Modifier le message">
          <Pencil size={16} />
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          className={`${btn} hover:text-danger`}
          title="Supprimer"
          aria-label="Supprimer le message"
        >
          <Trash2 size={16} />
        </button>
      )}
      <button onClick={onMore} className={btn} title="Plus d'actions" aria-label="Plus d'actions">
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}
