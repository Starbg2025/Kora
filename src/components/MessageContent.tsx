import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCustomEmojis, type CustomEmojiEntry } from '../lib/emojis';

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
 * Découpe un segment de texte sur les :nom: d'émojis personnalisés.
 * Nom connu → image (les GIF animés jouent) ; nom inconnu (émoji supprimé
 * ou jamais existant) → texte d'origine, le message ne casse jamais.
 */
function renderTextWithEmojis(text: string, keyPrefix: string, map: Map<string, CustomEmojiEntry>): ReactNode[] {
  const segs = text.split(/:([a-z0-9_-]{2,32}):/g);
  return segs.map((seg, j) => {
    if (j % 2 === 1) {
      const e = map.get(seg);
      if (e) {
        return (
          <img
            key={`${keyPrefix}-${j}`}
            src={e.url}
            alt={`:${seg}:`}
            title={`:${seg}:`}
            className="mx-px inline-block h-5 w-5 align-text-bottom"
            loading="lazy"
          />
        );
      }
      return <span key={`${keyPrefix}-${j}`}>:{seg}:</span>;
    }
    return <span key={`${keyPrefix}-${j}`}>{seg}</span>;
  });
}

// Tokens @pseudo / @everyone. Le surlignage est volontairement conservateur :
// @everyone toujours, @pseudo uniquement si le pseudo figure dans la liste des
// pseudos connus de la conversation (évite de surligner les emails).
const MENTION_SPLIT_RE = /(@everyone|@[A-Za-z0-9_.-]+)/gi;

/**
 * Mentions d'abord, émojis ensuite (les deux syntaxes ne se croisent pas).
 * Clic sur un @pseudo connu → onMentionClick si la vue le gère, sinon simple
 * surlignage. @everyone n'a pas de fiche : surlignage seul.
 */
function renderTextWithMentions(
  text: string,
  keyPrefix: string,
  emojiMap: Map<string, CustomEmojiEntry>,
  nameSet: Set<string> | null,
  onMentionClick?: (username: string) => void,
): ReactNode[] {
  const parts = text.split(MENTION_SPLIT_RE);
  return parts.map((seg, j) => {
    if (j % 2 === 1) {
      if (seg.toLowerCase() === '@everyone') {
        return (
          <span key={`${keyPrefix}-m${j}`} className="font-bold text-primary">
            {seg}
          </span>
        );
      }
      const uname = seg.slice(1).toLowerCase();
      if (nameSet && nameSet.has(uname)) {
        if (onMentionClick) {
          const raw = seg.slice(1);
          return (
            <button
              key={`${keyPrefix}-m${j}`}
              type="button"
              onClick={() => onMentionClick(raw)}
              className="font-bold text-primary hover:underline"
            >
              {seg}
            </button>
          );
        }
        return (
          <span key={`${keyPrefix}-m${j}`} className="font-bold text-primary">
            {seg}
          </span>
        );
      }
      return <span key={`${keyPrefix}-m${j}`}>{seg}</span>;
    }
    return <span key={`${keyPrefix}-m${j}`}>{renderTextWithEmojis(seg, `${keyPrefix}-e${j}`, emojiMap)}</span>;
  });
}

/**
 * Contenu d'un message : texte avec liens cliquables, mentions surlignées
 * (@everyone toujours, @pseudo si connu dans cette conversation), aperçus
 * YouTube (oEmbed) et images distantes (ex. GIF Tenor) affichées directement.
 * Jamais de HTML brut : tout passe par React, aucun risque XSS.
 */
export default function MessageContent({
  content,
  mentionNames,
  onMentionClick,
}: {
  content: string;
  /** Pseudos connus dans cette conversation (insensibles à la casse). */
  mentionNames?: ReadonlySet<string> | string[];
  /** Clic sur un @pseudo connu (fiche profil), si la vue le gère. */
  onMentionClick?: (username: string) => void;
}) {
  const { sb } = useAuth();
  const emojiMap = useCustomEmojis(sb);
  const nameSet = useMemo(() => {
    if (!mentionNames) return null;
    return new Set(Array.from(mentionNames, (n) => n.toLowerCase()));
  }, [mentionNames]);
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
        if (!/^https?:\/\//.test(part))
          return <span key={i}>{renderTextWithMentions(part, `p${i}`, emojiMap, nameSet, onMentionClick)}</span>;
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
