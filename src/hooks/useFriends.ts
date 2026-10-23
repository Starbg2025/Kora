import { useCallback, useEffect, useId, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import type { Friendship, Profile } from '../lib/types';

export interface FriendEntry {
  friendship: Friendship;
  profile: Profile;
}

/** Charge toutes les relations d'amitié de l'utilisateur + profils, avec temps réel. */
export function useFriends() {
  const { sb, user } = useAuth();
  const { notify } = useNotifications();
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
    const me = user.id;
    const ch = sb
      .channel(`friendships-feed-${channelTag}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload) => {
        // Déclencheur : demande d'ami reçue → notification pour le destinataire
        if (payload.eventType === 'INSERT') {
          const f = payload.new as Friendship;
          if (f.addressee_id === me && f.status === 'pending') {
            sb.from('profiles')
              .select('display_name, username')
              .eq('id', f.requester_id)
              .maybeSingle()
              .then(({ data }) => {
                const p = data as { display_name: string; username: string } | null;
                const name = p?.display_name || p?.username || 'Quelqu’un';
                notify('demande_ami', `Nouvelle demande d’ami`, `${name} (@${p?.username ?? '…'}) veut devenir ton ami.`, '/app/amis?onglet=recues');
              });
          }
        }
        reload();
      })
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [sb, user?.id, channelTag, reload, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  return { entries, loading, reload };
}
