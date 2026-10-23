import type { SupabaseClient } from '@supabase/supabase-js';
import type { Community, CommunityRole } from './types';

/** Rôle de l'utilisateur courant dans une communauté (null si non membre). */
export async function myCommunityRole(
  sb: SupabaseClient,
  communityId: string,
  userId: string,
): Promise<CommunityRole | null> {
  const { data } = await sb
    .from('community_members')
    .select('role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as CommunityRole | undefined) ?? null;
}

/** Communautés dont l'utilisateur est membre (avec son rôle). */
export async function myCommunities(
  sb: SupabaseClient,
  userId: string,
): Promise<Array<Community & { role: CommunityRole }>> {
  const { data: rows, error } = await sb
    .from('community_members')
    .select('role, communities(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });
  if (error || !rows) return [];
  const list = rows as unknown as Array<{ role: CommunityRole; communities: Community | null }>;
  return list
    .filter((r) => r.communities)
    .map((r) => ({ ...(r.communities as Community), role: r.role }));
}

/** Génère un code d'invitation lisible (8 caractères, sans ambiguïtés). */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Nom de salon normalisé façon Discord (minuscules, tirets). */
export function normalizeChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç-]/g, '')
    .slice(0, 40);
}
