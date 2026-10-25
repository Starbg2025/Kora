/** Traduction de messages via un service gratuit sans clé.
 *  Point de terminaison public non officiel : en cas d'échec, l'erreur est
 *  affichée telle quelle — jamais de traduction simulée. */

export const TRANSLATE_LANGS: { id: string; label: string }[] = [
  { id: 'en', label: 'Anglais' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Espagnol' },
  { id: 'de', label: 'Allemand' },
  { id: 'it', label: 'Italien' },
  { id: 'pt', label: 'Portugais' },
];

export async function translateText(text: string, target: string): Promise<string> {
  // 1) Endpoint public Google Translate (sans clé, non officiel).
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      target,
    )}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Service de traduction indisponible (${res.status}).`);
    const data = (await res.json()) as unknown;
    // Forme : [[[traduction, source, ...], ...], ...]
    const sentences = (data as Array<Array<Array<string>>> | null)?.[0];
    if (!sentences) throw new Error('Réponse de traduction incompréhensible.');
    const out = sentences.map((s) => s?.[0] ?? '').join('');
    if (!out.trim()) throw new Error('Aucune traduction reçue.');
    return out;
  } catch (primaryErr) {
    // 2) Repli MyMemory (gratuit sans clé, quota journalier limité).
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${encodeURIComponent(target)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MyMemory indisponible (${res.status}).`);
      const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
      const out = data.responseData?.translatedText ?? '';
      if (!out.trim() || out.toUpperCase().includes('QUERY LENGTH LIMIT') || out.toUpperCase().includes('TOO MANY REQUESTS')) {
        throw new Error('MyMemory a refusé la requête (quota ?).');
      }
      return out;
    } catch {
      throw primaryErr instanceof Error ? primaryErr : new Error('Traduction impossible.');
    }
  }
}
