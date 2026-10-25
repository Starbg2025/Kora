import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomEmoji } from './types';

/** Motif :nom: (2-32 caractères, comme l'upload le normalise). */
export const CUSTOM_EMOJI_RE = /:([a-z0-9_-]{2,32}):/g;

export interface CustomEmojiEntry extends CustomEmoji {
  community_name: string;
  /** URL publique (bucket public : pas d'expiration, les anciens messages survivent). */
  url: string;
}

/**
 * Cache de session des émojis personnalisés de l'utilisateur, partagé par
 * tous les messages affichés. Un seul chargement par session ; invalidé
 * après chaque import/renommage/suppression (voir invalidateCustomEmojis).
 */
let cache: CustomEmojiEntry[] | null = null;
let cachePromise: Promise<CustomEmojiEntry[]> | null = null;
const listeners = new Set<() => void>();

export function loadCustomEmojis(sb: SupabaseClient): Promise<CustomEmojiEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!cachePromise) {
    cachePromise = (async () => {
      const { data: memberships } = await sb.from('community_members').select('community_id');
      const ids = ((memberships ?? []) as { community_id: string }[]).map((m) => m.community_id);
      if (ids.length === 0) return [];
      const [{ data: rows }, { data: comms }] = await Promise.all([
        sb.from('custom_emojis').select('*').in('community_id', ids).order('created_at', { ascending: false }),
        sb.from('communities').select('id,name').in('id', ids),
      ]);
      const names = new Map<string, string>();
      for (const c of (comms ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
      const list = ((rows ?? []) as CustomEmoji[]).map((r) => {
        const { data } = sb.storage.from('emojis').getPublicUrl(r.image_path);
        return { ...r, community_name: names.get(r.community_id) ?? 'Communauté', url: data.publicUrl };
      });
      cache = list;
      return list;
    })().catch(() => {
      // Table ou bucket absents (migration non exécutée) : liste vide, jamais d'erreur visible.
      cachePromise = null;
      return [];
    });
  }
  return cachePromise;
}

/** Vide le cache et prévient tous les messages affichés de se recharger. */
export function invalidateCustomEmojis() {
  cache = null;
  cachePromise = null;
  listeners.forEach((l) => l());
}

export function customEmojiMap(list: CustomEmojiEntry[]): Map<string, CustomEmojiEntry> {
  const m = new Map<string, CustomEmojiEntry>();
  for (const e of list) if (!m.has(e.name)) m.set(e.name, e);
  return m;
}

/** Carte nom → émoji (premier trouvé) pour l'affichage des messages. */
export function useCustomEmojis(sb: SupabaseClient): Map<string, CustomEmojiEntry> {
  const [map, setMap] = useState<Map<string, CustomEmojiEntry>>(() => (cache ? customEmojiMap(cache) : new Map()));
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      loadCustomEmojis(sb).then((list) => {
        if (alive) setMap(customEmojiMap(list));
      });
    };
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [sb]);
  return map;
}
