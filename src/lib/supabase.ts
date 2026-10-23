import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Vrai uniquement si les deux variables d'environnement sont renseignées. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  client = createClient(url as string, anonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/** Client Supabase (nullable). L'app affiche un écran de configuration si null. */
export const supabase: SupabaseClient | null = client;

/** Récupère le client ou lève une erreur claire (jamais de mode démo silencieux). */
export function requireSupabase(): SupabaseClient {
  if (!client) throw new Error('Supabase n’est pas configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes).');
  return client;
}
