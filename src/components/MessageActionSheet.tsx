import type { Message, Profile } from '../lib/types';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '✅', '💀', '🙂'];

interface Props {
  message: Message;
  author: Profile | null;
  isMe: boolean;
  isPinned: boolean;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onMarkUnread: () => void;
  onTogglePin: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onReport?: () => void;
  onClose: () => void;
}

function Row({ onClick, danger, icon, children }: { onClick: () => void; danger?: boolean; icon: string; children: React.ReactNode }) {
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

function Group({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-surface2/40">{children}</div>;
}

/** Fiche d'actions façon Discord après appui long sur un message. */
export default function MessageActionSheet(p: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label="Actions du message">
      <button aria-label="Fermer" onClick={p.onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[92dvh] w-full space-y-3 overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line sm:hidden" />

        <div className="flex justify-between gap-2">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => p.onReact(e)}
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-surface2/60 text-2xl hover:bg-surface2"
              aria-label={`Réagir ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="px-1 text-center text-[13px] text-muted">
          Appuie deux fois sur un message pour réagir ❤️
        </p>

        <Group>
          {p.isMe && <Row onClick={p.onEdit} icon="✏️">Modifier le message</Row>}
          <Row onClick={p.onReply} icon="↩️">Répondre</Row>
          <Row onClick={p.onForward} icon="➡️">Transférer</Row>
        </Group>

        <Group>
          {p.message.content && <Row onClick={p.onCopy} icon="📋">Copier le texte</Row>}
          <Row onClick={p.onMarkUnread} icon="👁️">Marquer comme non lu</Row>
          <Row onClick={p.onTogglePin} icon="📌">{p.isPinned ? 'Désépingler le message' : 'Épingler le message'}</Row>
          <Row onClick={p.onCopyLink} icon="🔗">Copier le lien du message</Row>
          {!p.isMe && p.onReport && <Row onClick={p.onReport} icon="🚩">Signaler</Row>}
          {p.isMe && <Row onClick={p.onDelete} icon="🗑️" danger>Supprimer le message</Row>}
        </Group>
      </div>
    </div>
  );
}
