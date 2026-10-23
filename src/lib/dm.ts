import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ouvre (ou récupère) la discussion 1:1 avec un ami, de façon blindée :
 *  1. Appelle la fonction SQL create_direct_dm (création atomique côté serveur).
 *  2. Le client (ré)ajoute les deux membres — idempotent, sécurise le cas où
 *     la fonction SQL appliquée ne le ferait pas complètement.
 *  3. Vérifie que la discussion est lisible avant de la renvoyer.
 * Lance une erreur explicite en cas de problème (jamais de navigation aveugle).
 */
export async function openDirectDM(sb: SupabaseClient, meId: string, friendId: string): Promise<string> {
  if (!meId) throw new Error('Session expirée, reconnecte-toi.');
  if (meId === friendId) throw new Error('Action impossible avec toi-même.');

  const { data, error } = await sb.rpc('create_direct_dm', { p_other: friendId });
  if (error) throw error;
  const dmId = data as string | null;
  if (!dmId) throw new Error('La conversation n’a pas pu être créée.');

  // Adhésion défensive : moi d'abord (RLS autorise l'auto-ajout), puis l'ami.
  const ins1 = await sb.from('dm_members').insert({ dm_id: dmId, user_id: meId });
  if (ins1.error && ins1.error.code !== '23505') throw ins1.error;
  const ins2 = await sb.from('dm_members').insert({ dm_id: dmId, user_id: friendId });
  if (ins2.error && ins2.error.code !== '23505') throw ins2.error;

  // Vérifie la lisibilité avant de naviguer (évite l'écran « introuvable »).
  const { error: readErr } = await sb.from('dms').select('id').eq('id', dmId).single();
  if (readErr) throw new Error('Conversation créée mais illisible : ' + readErr.message);

  return dmId;
}
