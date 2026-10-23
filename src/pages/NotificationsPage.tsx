import { useNavigate } from 'react-router-dom';
import { useNotifications, TYPE_ICONS, TYPE_LABELS } from '../context/NotificationsContext';
import EmptyState from '../components/EmptyState';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/** Centre de notifications : liste, marquage lu, navigation vers le contenu. */
export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  const open = async (id: string, link: string | null) => {
    await markAsRead(id);
    if (link) navigate(link);
  };

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold text-primary hover:bg-line">
            Tout marquer comme lu
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Aucune notification"
          text="Les demandes d'ami, mentions et invitations apparaîtront ici. Si cette page reste vide après avoir exécuté la migration SQL, c'est normal : il n'y a encore rien à signaler."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n.id, n.link)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-surface2 ${
                n.is_read ? 'border-transparent' : 'border-primary/30 bg-primary/5'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-xl">
                {TYPE_ICONS[n.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold">{n.title}</span>
                  {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
                </span>
                {n.body && <span className="mt-0.5 block truncate text-sm text-muted">{n.body}</span>}
                <span className="mt-1 block text-xs text-muted">
                  {TYPE_LABELS[n.type]} · {timeAgo(n.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
