import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { AppNotification, NotificationType, UserSettings } from '../lib/types';

interface NotificationsCtxValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  notify: (type: NotificationType, title: string, body?: string, link?: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsCtx = createContext<NotificationsCtxValue>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markAsRead: async () => {},
  markAllRead: async () => {},
  notify: async () => {},
  refresh: async () => {},
});

export const useNotifications = () => useContext(NotificationsCtx);

const TYPE_LABELS: Record<NotificationType, string> = {
  message: 'Message',
  mention: 'Mention',
  demande_ami: 'Demande d’ami',
  invitation: 'Invitation',
  appel: 'Appel',
  communaute: 'Communauté',
};

const TYPE_ICONS: Record<NotificationType, string> = {
  message: '💬',
  mention: '📣',
  demande_ami: '👋',
  invitation: '✉️',
  appel: '📞',
  communaute: '🏘️',
};

export { TYPE_LABELS, TYPE_ICONS };

function prefFor(type: NotificationType, s: UserSettings | null): boolean {
  if (!s) return true;
  switch (type) {
    case 'message': return s.notif_messages ?? true;
    case 'mention': return s.notif_mentions ?? true;
    case 'demande_ami': return s.notif_friend_requests ?? true;
    case 'invitation': return s.notif_invites ?? true;
    case 'appel': return s.notif_calls ?? true;
    case 'communaute': return s.notif_invites ?? true;
  }
}

interface Toast {
  id: string;
  title: string;
  body: string;
  link: string | null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { sb, user, settings } = useAuth();
  const navigate = useNavigate();
  const tag = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications((data ?? []) as AppNotification[]);
    } catch {
      // Table absente (migration non exécutée) : reste vide, message honnête dans l'UI.
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [sb, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pushToast = useCallback((t: Toast) => {
    // Pas de toast si l'utilisateur est déjà sur la cible
    if (t.link && window.location.pathname.startsWith(t.link.split('?')[0])) return;
    setToasts((prev) => [...prev.slice(-2), t]);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToasts([]), 4500);
  }, []);

  // Temps réel : nouvelles notifications (canal unique par instance)
  useEffect(() => {
    if (!user) return;
    const ch = sb
      .channel(`notif-${tag}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
          pushToast({ id: n.id, title: n.title, body: n.body, link: n.link });
        },
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, user?.id, tag, pushToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      try {
        await sb.from('notifications').update({ is_read: true }).eq('id', id);
      } catch {
        // silencieux
      }
    },
    [sb],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    } catch {
      // silencieux
    }
  }, [sb, user]);

  const notify = useCallback(
    async (type: NotificationType, title: string, body = '', link: string | null = null) => {
      if (!user || !prefFor(type, settings)) return;
      try {
        // Anti-doublon : même type + même lien non lu dans les 10 dernières minutes
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from('notifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('type', type)
          .eq('is_read', false)
          .gte('created_at', since)
          .limit(1);
        const rows = (existing ?? []) as Array<{ id: string; link?: string | null }>;
        // On compare aussi le lien quand il est fourni
        if (link) {
          const { data: sameLink } = await sb
            .from('notifications')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', type)
            .eq('is_read', false)
            .eq('link', link)
            .gte('created_at', since)
            .limit(1);
          if ((sameLink ?? []).length > 0) return;
        } else if (rows.length > 0) {
          return;
        }
        const { error } = await sb.rpc('create_notification', {
          p_user: user.id,
          p_type: type,
          p_title: title.slice(0, 120),
          p_body: body.slice(0, 300),
          p_link: link,
        });
        if (error) throw error;
      } catch {
        // Table/fonction absente (migration non exécutée) : silencieux.
      }
    },
    [sb, user, settings],
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const openToast = (t: Toast) => {
    setToasts((prev) => prev.filter((x) => x.id !== t.id));
    if (t.link) {
      const n = notifications.find((x) => x.id === t.id);
      if (n && !n.is_read) markAsRead(t.id);
      navigate(t.link);
    }
  };

  return (
    <NotificationsCtx.Provider value={{ notifications, unreadCount, loading, markAsRead, markAllRead, notify, refresh }}>
      {children}
      {/* Toasts de notification */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => openToast(t)}
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-3 text-left shadow-xl"
          >
            <p className="text-sm font-bold">{t.title}</p>
            {t.body && <p className="mt-0.5 truncate text-xs text-muted">{t.body}</p>}
          </button>
        ))}
      </div>
    </NotificationsCtx.Provider>
  );
}
