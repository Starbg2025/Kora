import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, MessageCircle, Phone, UserPlus, Users, MailPlus, type LucideIcon } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { AppNotification, NotificationType, UserSettings } from '../lib/types';

interface NotificationsCtxValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  notify: (type: NotificationType, title: string, body?: string, link?: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  mutedCommunities: Set<string>;
  toggleCommunityMute: (communityId: string) => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  browserEnabled: boolean;
  setBrowserEnabled: (v: boolean) => void;
}

const NotificationsCtx = createContext<NotificationsCtxValue>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markAsRead: async () => {},
  markAllRead: async () => {},
  deleteNotification: async () => {},
  notify: async () => {},
  refresh: async () => {},
  mutedCommunities: new Set(),
  toggleCommunityMute: async () => {},
  soundEnabled: false,
  setSoundEnabled: () => {},
  browserEnabled: false,
  setBrowserEnabled: () => {},
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

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  message: MessageCircle,
  mention: AtSign,
  demande_ami: UserPlus,
  invitation: MailPlus,
  appel: Phone,
  communaute: Users,
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
  const [mutedCommunities, setMutedCommunities] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kora:notif-sound') === '1';
    } catch {
      return false;
    }
  });
  const [browserEnabled, setBrowserEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kora:notif-browser') === '1';
    } catch {
      return false;
    }
  });

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    try {
      localStorage.setItem('kora:notif-sound', v ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const setBrowserEnabled = useCallback(async (v: boolean) => {
    setBrowserEnabledState(v);
    try {
      localStorage.setItem('kora:notif-browser', v ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
    if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* refusé */
      }
    }
  }, []);

  // Bip discret (WebAudio, aucun fichier) quand une notification arrive.
  const playBlip = useCallback(() => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => void ctx.close();
    } catch {
      /* audio indisponible */
    }
  }, []);

  const refreshMutes = useCallback(async () => {
    if (!user) {
      setMutedCommunities(new Set());
      return;
    }
    try {
      const { data } = await sb.from('community_mutes').select('community_id').eq('user_id', user.id);
      setMutedCommunities(new Set(((data ?? []) as { community_id: string }[]).map((r) => r.community_id)));
    } catch {
      // Table absente (migration non exécutée) : aucune sourdine, jamais d'erreur visible.
      setMutedCommunities(new Set());
    }
  }, [sb, user]);

  useEffect(() => {
    refreshMutes();
  }, [refreshMutes]);

  const toggleCommunityMute = useCallback(
    async (communityId: string) => {
      if (!user) return;
      const muted = mutedCommunities.has(communityId);
      setMutedCommunities((prev) => {
        const next = new Set(prev);
        if (muted) next.delete(communityId);
        else next.add(communityId);
        return next;
      });
      try {
        if (muted) {
          await sb.from('community_mutes').delete().eq('user_id', user.id).eq('community_id', communityId);
        } else {
          await sb.from('community_mutes').insert({ user_id: user.id, community_id: communityId });
        }
      } catch {
        await refreshMutes();
      }
    },
    [sb, user, mutedCommunities, refreshMutes],
  );

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

  const pushToast = useCallback(
    (t: Toast) => {
      // Pas de toast si l'utilisateur est déjà sur la cible (ancre ignorée).
      if (t.link && window.location.pathname.startsWith(t.link.split('?')[0].split('#')[0])) return;
      setToasts((prev) => [...prev.slice(-2), t]);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToasts([]), 4500);
      if (soundEnabled) playBlip();
      if (browserEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        try {
          const notif = new Notification(t.title, { body: t.body || undefined });
          notif.onclick = () => {
            window.focus();
            if (t.link) navigate(t.link);
            notif.close();
          };
        } catch {
          /* notifications navigateur indisponibles */
        }
      }
    },
    [soundEnabled, browserEnabled, playBlip, navigate],
  );

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

  const deleteNotification = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await sb.from('notifications').delete().eq('id', id);
      } catch {
        await refresh();
      }
    },
    [sb, refresh],
  );

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
    <NotificationsCtx.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllRead,
        deleteNotification,
        notify,
        refresh,
        mutedCommunities,
        toggleCommunityMute,
        soundEnabled,
        setSoundEnabled,
        browserEnabled,
        setBrowserEnabled,
      }}
    >
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
