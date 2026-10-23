import type { Message, Profile } from '../lib/types';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Props {
  message: Message;
  author: Profile | null;
  isMe: boolean;
  isPinned: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onProfile: () => void;
  onClose: () => void;
}

function Row({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium hover:bg-surface2 ${
        danger ? 'text-danger' : ''
      }`}
    >
      {children}
    </button>
  );
}

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
    <path d={d} />
  </svg>
);

/** Fiche d'actions façon Discord après appui long sur un message. */
export default function MessageActionSheet(p: Props) {
  const authorName = p.author?.display_name || p.author?.username || 'Inconnu';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label="Actions du message">
      <button aria-label="Fermer" onClick={p.onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full rounded-t-3xl bg-surface p-4 shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <p className="mb-3 px-2 text-sm font-bold text-muted">@{p.author?.username ?? 'inconnu'}</p>

        <div className="mb-2 flex justify-around rounded-2xl bg-surface2 px-2 py-2">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => p.onReact(e)}
              className="rounded-xl px-2 py-1 text-2xl hover:scale-125 hover:bg-line"
              aria-label={`Réagir ${e}`}
            >
              {e}
            </button>
          ))}
        </div>

        <Row onClick={p.onReply}>
          {icon('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z')}
          Répondre
        </Row>
        {p.message.content && (
          <Row onClick={p.onCopy}>
            {icon('M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')}
            Copier le texte
          </Row>
        )}
        <Row onClick={p.onTogglePin}>
          {icon('M12 17v5 M9 3h6l1 7 3 3H5l3-3z')}
          {p.isPinned ? 'Désépingler' : 'Épingler'}
        </Row>
        {!p.isMe && (
          <Row onClick={p.onProfile}>
            {icon('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z')}
            Profil de {authorName}
          </Row>
        )}
        {p.isMe && (
          <Row onClick={p.onEdit}>
            {icon('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z')}
            Modifier
          </Row>
        )}
        {p.isMe && (
          <Row onClick={p.onDelete} danger>
            {icon('M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6')}
            Supprimer
          </Row>
        )}
      </div>
    </div>
  );
}
