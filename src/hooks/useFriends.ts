import { useCallback, useEffect, useId, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Friendship, Profile } from '../lib/types';

export interface FriendEntry {
  friendship: Friendship;
  profile: Profile;
}

/** Charge toutes les relations d'amitié de l'utilisateur + profils, avec temps réel. */
export function useFriends() {
  const { sb, user } = useAuth();
  // Identifiant unique par instance : sb.channel() renvoie le canal existant
  // pour un même nom, et ajouter des écouteurs après subscribe() fait planter.
  const channelTag = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const me = user.id;
    const { data: rows } = await sb
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
      .order('created_at', { ascending: false });
    const list = (rows ?? []) as Friendship[];
    if (list.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const otherIds = [...new Set(list.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id)))];
    const { data: profs } = await sb.from('profiles').select('*').in('id', otherIds);
    const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]));
    setEntries(
      list
        .map((f) => {
          const otherId = f.requester_id === me ? f.addressee_id : f.requester_id;
          const profile = byId.get(otherId);
          return profile ? { friendship: f, profile } : null;
        })
        .filter((e): e is FriendEntry => e !== null),
    );
    setLoading(false);
  }, [sb, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!user) return;
    const ch = sb
      .channel(`friendships-feed-${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => reload())
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, user?.id, channelTag, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { entries, loading, reload };
}
