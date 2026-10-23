import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export interface PresenceInfo {
  status: string;
  typingIn: string | null;
}

interface PresenceCtxValue {
  /** user_id -> infos de présence */
  online: Record<string, PresenceInfo>;
  setTyping: (dmId: string | null) => void;
}

const PresenceCtx = createContext<PresenceCtxValue>({ online: {}, setTyping: () => {} });

export const usePresence = () => useContext(PresenceCtx);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { sb, user, profile } = useAuth();
  const [online, setOnline] = useState<Record<string, PresenceInfo>>({});
  const channelRef = useRef<{ track: (p: object) => void; unsubscribe: () => void } | null>(null);
  const typingRef = useRef<string | null>(null);
  const statusRef = useRef<string>(profile?.status ?? 'en_ligne');
  const typingTimer = useRef<number | null>(null);

  statusRef.current = profile?.status ?? 'en_ligne';

  const track = (status: string, typingIn: string | null) => {
    channelRef.current?.track({ status, typing_in: typingIn });
  };

  useEffect(() => {
    if (!user) {
      setOnline({});
      return;
    }
    const ch = sb.channel('kora-presence', { config: { presence: { key: user.id } } });
    channelRef.current = ch as unknown as typeof channelRef.current;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const next: Record<string, PresenceInfo> = {};
      for (const [key, metas] of Object.entries(state)) {
        const meta = metas[metas.length - 1] ?? {};
        next[key] = {
          status: typeof meta.status === 'string' ? meta.status : 'hors_ligne',
          typingIn: typeof meta.typing_in === 'string' ? meta.typing_in : null,
        };
      }
      setOnline(next);
    });
    ch.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') track(statusRef.current, null);
    });
    return () => {
      ch.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Re-diffuse quand le statut choisi change
  useEffect(() => {
    if (user && channelRef.current) track(statusRef.current, typingRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.status, user?.id]);

  const setTyping = (dmId: string | null) => {
    if (typingRef.current === dmId) return;
    typingRef.current = dmId;
    track(statusRef.current, dmId);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    if (dmId) {
      typingTimer.current = window.setTimeout(() => {
        typingRef.current = null;
        track(statusRef.current, null);
      }, 3500);
    }
  };

  return <PresenceCtx.Provider value={{ online, setTyping }}>{children}</PresenceCtx.Provider>;
}
