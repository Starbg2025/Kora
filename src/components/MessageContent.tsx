import { useEffect, useState } from 'react';

const URL_RE = /(https?:\/\/[^\s]+)/g;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i;

function isYouTubeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && url.searchParams.get('v')) return url.searchParams.get('v');
    if (host === 'youtu.be' && url.pathname.length > 1) return url.pathname.slice(1);
    return null;
  } catch {
    return null;
  }
}

interface OEmbed {
  title: string;
  author_name: string;
  thumbnail_url: string;
}

const oembedCache = new Map<string, OEmbed | null>();

/** Carte d'aperçu YouTube via oEmbed public (sans clé). Échec → simple lien. */
function YouTubeCard({ url }: { url: string }) {
  const [meta, setMeta] = useState<OEmbed | null | undefined>(() =>
    oembedCache.has(url) ? oembedCache.get(url) ?? null : undefined,
  );
  useEffect(() => {
    if (meta !== undefined) return;
    let alive = true;
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const m = j ? { title: j.title, author_name: j.author_name, thumbnail_url: j.thumbnail_url } : null;
        oembedCache.set(url, m);
        setMeta(m);
      })
      .catch(() => {
        if (!alive) return;
        oembedCache.set(url, null);
        setMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [url, meta]);
  if (meta === undefined || meta === null) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
        {url}
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block max-w-md overflow-hidden rounded-xl border border-line bg-surface2 hover:border-primary/50"
    >
      <span className="relative block">
        <img src={meta.thumbnail_url} alt="" className="block w-full" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-xl text-white">▶</span>
        </span>
      </span>
      <span className="block px-3 py-2">
        <span className="block text-xs font-bold uppercase tracking-wide text-danger">YouTube</span>
        <span className="mt-0.5 block text-sm font-bold leading-snug">{meta.title}</span>
        <span className="block text-xs text-muted">{meta.author_name}</span>
      </span>
    </a>
  );
}

/**
 * Contenu d'un message : texte avec liens cliquables, aperçus YouTube (oEmbed)
 * et images distantes (ex. GIF Tenor) affichées directement.
 * Jamais de HTML brut : tout passe par React, aucun risque XSS.
 */
export default function MessageContent({ content }: { content: string }) {
  const trimmed = content.trim();
  // Message constitué d'une seule URL d'image → afficher l'image (ex. GIF envoyé).
  if (/^https?:\/\/\S+$/.test(trimmed) && IMAGE_EXT_RE.test(trimmed) && !isYouTubeUrl(trimmed)) {
    return (
      <span className="block">
        <a href={trimmed} target="_blank" rel="noreferrer" className="mt-1 block max-w-md">
          <img src={trimmed} alt="Image partagée" className="max-h-72 rounded-xl border border-line" loading="lazy" />
        </a>
      </span>
    );
  }
  const parts = content.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {parts.map((part, i) => {
        if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>;
        const yt = isYouTubeUrl(part);
        if (yt) return <YouTubeCard key={i} url={part} />;
        return (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
            {part}
          </a>
        );
      })}
    </span>
  );
}
