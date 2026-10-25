import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Trash2 } from 'lucide-react';
import { useNotifications, TYPE_ICONS, TYPE_LABELS } from '../context/NotificationsContext';
import EmptyState from '../components/EmptyState';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/**
 * Centre de notifications : liste, marquage lu, navigation vers le contenu.
 * Onglet Mentions : les mentions des 30 derniers jours (MP et salons),
 * cartes cliquables qui sautent directement au message mentionné.
 */
export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'toutes' | 'mentions'>('toutes');

  const mentions = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400 * 1000;
    return notifications.filter((n) => n.type === 'mention' && new Date(n.created_at).getTime() >= cutoff);
  }, [notifications]);
  const unreadMentions = mentions.filter((n) => !n.is_read).length;

  const open = async (id: string, link: string | null) => {
    await markAsRead(id);
    if (!link) return;
    navigate(link);
    // Saut au message mentionné (l'ancre #msg-<id> est dans le lien).
    const anchor = /#msg-([A-Za-z0-9-]+)/.exec(link)?.[1];
    if (anchor) {
      window.setTimeout(() => {
        const el =
          document.getElementById(`cmsg-${anchor}`) ?? document.getElementById(`msg-${anchor}`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('bg-primary/10');
          window.setTimeout(() => el.classList.remove('bg-primary/10'), 2000);
        }
      }, 900);
    }
  };

  const shown = tab === 'mentions' ? mentions : notifications;

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0 text-lg font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="shrink-0 whitespace-nowrap rounded-lg bg-surface2 px-4 py-2 text-sm font-semibold text-primary hover:bg-line">
            Tout marquer comme lu
          </button>
        )}
      </div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('toutes')}
          className={`rounded-full px-4 py-2 text-sm font-bold ${tab === 'toutes' ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:text-ink'}`}
        >
          Toutes
        </button>
        <button
          onClick={() => setTab('mentions')}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${tab === 'mentions' ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:text-ink'}`}
        >
          <AtSign size={15} /> Mentions
          {unreadMentions > 0 && (
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${tab === 'mentions' ? 'bg-white text-primary' : 'bg-danger text-white'}`}>
              {unreadMentions > 99 ? '99+' : unreadMentions}
            </span>
          )}
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === 'mentions' ? 'Aucune mention (30 jours)' : 'Aucune notification'}
          text={
            tab === 'mentions'
              ? 'Les messages où quelqu’un te mentionne avec @tonpseudo apparaîtront ici, avec un saut direct au message.'
              : "Les demandes d'ami, mentions et invitations apparaîtront ici. Si cette page reste vide après avoir exécuté la migration SQL, c'est normal : il n'y a encore rien à signaler."
          }
        />
      ) : (
        <div className="space-y-2">
          {shown.map((n) => {
            const Icon = TYPE_ICONS[n.type];
            const isMention = n.type === 'mention';
            return (
              <div
                key={n.id}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-surface2 ${
                  n.is_read ? 'border-transparent' : 'border-primary/30 bg-primary/5'
                }`}
              >
                <button onClick={() => open(n.id, n.link)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted">
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">{n.title}</span>
                      {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {isMention ? <span dangerouslySetInnerHTML={{ __html: highlightMention(n.body) }} /> : n.body}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-muted">
                      {TYPE_LABELS[n.type]} · {timeAgo(n.created_at)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-danger"
                  title="Supprimer cette notification"
                  aria-label="Supprimer cette notification"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Surligne la mention dans l'extrait (échappement HTML d'abord). */
function highlightMention(body: string): string {
  const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/(@[A-Za-z0-9_.-]+)/g, '<strong class="text-primary">$1</strong>');
}
