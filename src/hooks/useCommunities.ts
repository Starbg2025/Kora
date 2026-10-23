import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { myCommunities } from '../lib/community';
import type { Community, CommunityRole } from '../lib/types';

export interface CommunityEntry extends Community {
  role: CommunityRole;
}

/** Communautés de l'utilisateur connecté, avec temps réel sur les membres. */
export function useCommunities() {
  const { sb, user } = useAuth();
  const [communities, setCommunities] = useState<CommunityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setCommunities([]);
      setLoading(false);
      return;
    }
    const list = await myCommunities(sb, user.id);
    // Re-récupère les communautés complètes (nom/icône à jour)
    const ids = list.map((c) => c.id);
    if (ids.length === 0) {
      setCommunities([]);
      setLoading(false);
      return;
    }
    const { data } = await sb.from('communities').select('*').in('id', ids);
    const byId = new Map(((data ?? []) as Community[]).map((c) => [c.id, c]));
    setCommunities(
      list
        .map((e) => {
          const full = byId.get(e.id);
          return full ? { ...full, role: e.role } : null;
        })
        .filter((e): e is CommunityEntry => e !== null),
    );
    setLoading(false);
  }, [sb, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { communities, loading, reload };
}
