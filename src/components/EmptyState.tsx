import type { ReactNode } from 'react';

/** État vide honnête : jamais de faux contenu, toujours un vrai message en français. */
export default function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-lg font-semibold text-ink">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}
