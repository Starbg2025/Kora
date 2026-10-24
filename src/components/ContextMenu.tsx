import { useEffect, type ReactNode } from 'react';

/**
 * Menu contextuel générique : positionné au point du pointeur, ramené dans les
 * limites de l'écran, fermé au clic extérieur, au clic droit ailleurs ou à Échap.
 */
export default function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Le menu fait 224 px de large ; on le ramène dans la fenêtre si besoin.
  const left = Math.max(8, Math.min(x, window.innerWidth - 232));
  const top = Math.max(8, Math.min(y, window.innerHeight - 280));

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[60] w-56 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-2xl"
        style={{ left, top }}
        role="menu"
      >
        {children}
      </div>
    </>
  );
}

/** Une ligne d'action dans un ContextMenu. */
export function ContextMenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface2 ${
        danger ? 'text-danger' : ''
      }`}
      role="menuitem"
    >
      {children}
    </button>
  );
}
