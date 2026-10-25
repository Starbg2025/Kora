import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AtSign, MessageCircle, Phone, UserPlus, Users, MailPlus, type LucideIcon } from 'lucide-react';
import { useAuth } from './AuthContext';
import { containsEveryone, containsMention, snippet } from '../lib/mentions';
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
  const { sb, user, settings, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tag = useId().replace(/[^a-zA-Z0-9]/g, '');
  // Refs miroirs : l'observateur global des mentions lit l'état courant sans
  // réabonner le canal realtime à chaque navigation ou changement de réglage.
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);
  const mutedCommunitiesRef = useRef<Set<string>>(new Set());
  const dmMuteRef = useRef<string[]>([]);
  const usernameRef = useRef<string | null>(null);
  useEffect(() => {
    usernameRef.current = profile?.username ?? null;
  }, [profile?.username]);
  // Statut « Ne pas déranger » : les alertes (sons, notifications navigateur,
  // toasts) sont coupées, mais les notifications restent dans la boîte de
  // réception — rien n'est perdu. Ref pour ne pas réabonner le canal realtime
  // à chaque changement de profil.
  const dndRef = useRef(false);
  useEffect(() => {
    dndRef.current = profile?.status === 'ne_pas_deranger';
  }, [profile?.status]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimer = useRef<number | null>(null);
  const [mutedCommunities, setMutedCommunities] = useState<Set<string>>(new Set());
  useEffect(() => {
    mutedCommunitiesRef.current = mutedCommunities;
  }, [mutedCommunities]);
  useEffect(() => {
    dmMuteRef.current = settings?.dm_mute ?? [];
  }, [settings?.dm_mute]);
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
      // Ne pas déranger : aucune alerte (ni son, ni navigateur, ni toast).
      // La notification reste dans la boîte de réception.
      if (dndRef.current) return;
      // Application au premier plan : pas d'interruption (ni toast, ni son).
      // La ligne de notification est quand même créée (notify() + liste temps
      // réel) : la boîte de réception ne perd rien, seul le surgissement est
      // réservé aux onglets cachés.
      if (!document.hidden) return;
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

  // Observateur global des mentions (et des MPs) : monté une fois quand
  // l'utilisateur est authentifié, il remplace les anciens déclencheurs
  // étroits (ChannelView ne voyait que le salon ouvert dans un onglet caché,
  // DMs.tsx que la section MPs). RLS ne délivre que les lignes lisibles
  // (canaux dont je suis membre, MPs dont je suis participant) : la mention
  // notifie désormais même si je suis sur un autre salon, une autre page, ou
  // si j'ouvre l'app plus tard (la ligne est créée dès l'INSERT reçu).
  useEffect(() => {
    if (!user) return;
    const me = user.id;

    // Conversation regardée, lue depuis l'URL (ref, sans réabonner).
    const viewingDm = (dmId: string) => locationRef.current === `/app/dm/${dmId}`;
    const viewingChannel = (communityId: string, channelId: string) =>
      locationRef.current === `/app/c/${communityId}/${channelId}`;

    const authorName = async (authorId: string) => {
      const { data } = await sb
        .from('profiles')
        .select('display_name, username')
        .eq('id', authorId)
        .maybeSingle();
      const p = data as { display_name: string | null; username: string | null } | null;
      return p?.display_name || p?.username || 'Quelqu’un';
    };

    const onCommunityMessage = async (m: {
      id: string;
      channel_id: string;
      author_id: string;
      content: string;
    }) => {
      if (m.author_id === me) return;
      const username = usernameRef.current;
      const isMention = !!username && containsMention(m.content, username);
      const isEveryone = containsEveryone(m.content);
      if (!isMention && !isEveryone) return;
      // La ligne ne porte pas community_id : résolution via le salon.
      const { data: ch } = await sb
        .from('channels')
        .select('id, name, community_id')
        .eq('id', m.channel_id)
        .maybeSingle();
      const channel = ch as { id: string; name: string; community_id: string } | null;
      if (!channel) return;
      if (mutedCommunitiesRef.current.has(channel.community_id)) return;
      if (viewingChannel(channel.community_id, channel.id)) return;
      const name = await authorName(m.author_id);
      const title = isEveryone
        ? `${name} a mentionné tout le monde dans #${channel.name}`
        : `${name} t’a mentionné dans #${channel.name}`;
      await notify(
        'mention',
        title,
        snippet(m.content),
        `/app/c/${channel.community_id}/${channel.id}#msg-${m.id}`,
      );
    };

    const onDmMessage = async (m: { id: string; dm_id: string; author_id: string; content: string }) => {
      if (m.author_id === me) return;
      if (viewingDm(m.dm_id)) return;
      if (dmMuteRef.current.includes(m.dm_id)) return;
      const name = await authorName(m.author_id);
      const username = usernameRef.current;
      if (username && containsMention(m.content, username)) {
        await notify('mention', `${name} t’a mentionné`, snippet(m.content), `/app/dm/${m.dm_id}#msg-${m.id}`);
      } else {
        await notify('message', `${name} t’a envoyé un message`, snippet(m.content), `/app/dm/${m.dm_id}`);
      }
    };

    const ch = sb
      .channel(`mention-watch-${tag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, (payload) => {
        void onCommunityMessage(
          payload.new as { id: string; channel_id: string; author_id: string; content: string },
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        void onDmMessage(payload.new as { id: string; dm_id: string; author_id: string; content: string });
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, user?.id, tag, notify]); // eslint-disable-line react-hooks/exhaustive-deps

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
