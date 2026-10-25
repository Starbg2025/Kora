import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import type { Profile } from '../lib/types';
import { Search, X } from 'lucide-react';

/**
 * Recherche globale de messages (Ctrl/Cmd+K, ou bouton 🔍 du rail).
 *
 * Périmètre strict : seuls les messages des conversations que l'utilisateur
 * peut réellement lire (ses DMs + les salons de ses communautés). Les
 * requêtes passent par PostgREST avec son JWT : les règles RLS s'appliquent
 * en plus du périmètre explicite. Aucun résultat hors périmètre, jamais de
 * contenu inventé — l'état vide dit simplement « aucun résultat ».
 * Le clic navigue vers la conversation et saute au message (#msg-id).
 *
 * Filtres (syntaxe dans la requête) : from:pseudo, in:#salon,
 * has:lien|image|vidéo|fichier, before:AAAA-MM-JJ, after:AAAA-MM-JJ.
 * Les filtres s'appliquent après la recherche RLS, jamais hors périmètre.
 */

interface FilterState {
  text: string;
  from?: string;
  inChannel?: string;
  has?: 'lien' | 'image' | 'vidéo' | 'fichier';
  before?: string;
  after?: string;
}

/** Découpe la requête : texte libre + filtres. */
function parseSearchFilters(q: string): FilterState {
  const tokens = q.split(/\s+/).filter(Boolean);
  const f: FilterState = { text: '' };
  const rest: string[] = [];
  for (const t of tokens) {
    if (t.startsWith('from:')) f.from = t.slice(5);
    else if (t.startsWith('in:')) f.inChannel = t.slice(3).replace(/^#/, '');
    else if (t.startsWith('has:')) {
      const v = t.slice(4).toLowerCase();
      if (v === 'lien' || v === 'image' || v === 'vidéo' || v === 'fichier') f.has = v;
    } else if (t.startsWith('before:') && /^\d{4}-\d{2}-\d{2}$/.test(t.slice(7))) f.before = t.slice(7);
    else if (t.startsWith('after:') && /^\d{4}-\d{2}-\d{2}$/.test(t.slice(6))) f.after = t.slice(6);
    else rest.push(t);
  }
  f.text = rest.join(' ');
  return f;
}

function rebuildQuery(text: string, f: Partial<FilterState>): string {
  const parts = [text.trim()];
  if (f.from) parts.push(`from:${f.from}`);
  if (f.inChannel) parts.push(`in:#${f.inChannel}`);
  if (f.has) parts.push(`has:${f.has}`);
  if (f.before) parts.push(`before:${f.before}`);
  if (f.after) parts.push(`after:${f.after}`);
  return parts.filter(Boolean).join(' ');
}

interface SearchResult {
  id: string;
  kind: 'dm' | 'channel';
  content: string;
  authorName: string;
  authorUsername: string;
  authorProfile: Profile | null;
  label: string;
  channelName: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  target: string;
  createdAt: string;
}

/** Ouvre la recherche depuis n'importe quel bouton de l'app. */
export function openGlobalSearch() {
  window.dispatchEvent(new Event('kora:open-search'));
}

export default function GlobalSearch() {
  const { sb, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const me = user?.id ?? '';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onEsc);
    window.addEventListener('kora:open-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('kora:open-search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setSearched(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open ]);

  useEffect(() => {
    const filters = parseSearchFilters(q);
    const needle = filters.text;
    if (needle.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const myRun = ++runId.current;
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const esc = needle.replace(/[%_]/g, '');
        const pattern = `%${esc}%`;
        const [{ data: dmRows }, { data: cmRows }] = await Promise.all([
          sb.from('dm_members').select('dm_id').eq('user_id', me),
          sb.from('community_members').select('community_id').eq('user_id', me),
        ]);
        const dmIds = ((dmRows ?? []) as { dm_id: string }[]).map((r) => r.dm_id);
        const commIds = ((cmRows ?? []) as { community_id: string }[]).map((r) => r.community_id);

        const [dmRes, chRes] = await Promise.all([
          dmIds.length > 0
            ? sb
                .from('messages')
                .select('id,dm_id,author_id,content,attachment_path,attachment_name,created_at')
                .in('dm_id', dmIds)
                .ilike('content', pattern)
                .order('created_at', { ascending: false })
                .limit(50)
            : Promise.resolve({ data: [] as never[] }),
          (async () => {
            if (commIds.length === 0) return { data: [] as never[] };
            const { data: channels } = await sb.from('channels').select('id').in('community_id', commIds);
            const channelIds = ((channels ?? []) as { id: string }[]).map((c) => c.id);
            if (channelIds.length === 0) return { data: [] as never[] };
            return sb
              .from('community_messages')
              .select('id,channel_id,author_id,content,attachment_path,attachment_name,created_at')
              .in('channel_id', channelIds)
              .ilike('content', pattern)
              .order('created_at', { ascending: false })
              .limit(50);
          })(),
        ]);
        if (runId.current !== myRun) return;

        const dmMsgs = (dmRes.data ?? []) as { id: string; dm_id: string; author_id: string; content: string; attachment_path: string | null; attachment_name: string | null; created_at: string }[];
        const chMsgs = (chRes.data ?? []) as { id: string; channel_id: string; author_id: string; content: string; attachment_path: string | null; attachment_name: string | null; created_at: string }[];

        // Libellés : noms des DMs (autre membre / nom de groupe) et des salons.
        const authorIds = new Set<string>();
        dmMsgs.forEach((m) => authorIds.add(m.author_id));
        chMsgs.forEach((m) => authorIds.add(m.author_id));
        const dmIdSet = [...new Set(dmMsgs.map((m) => m.dm_id))];
        const chIdSet = [...new Set(chMsgs.map((m) => m.channel_id))];
        const [dmsRes, dmMembersRes, channelsRes] = await Promise.all([
          dmIdSet.length > 0 ? sb.from('dms').select('id,name,is_group').in('id', dmIdSet) : Promise.resolve({ data: [] as never[] }),
          dmIdSet.length > 0 ? sb.from('dm_members').select('dm_id,user_id').in('dm_id', dmIdSet) : Promise.resolve({ data: [] as never[] }),
          chIdSet.length > 0 ? sb.from('channels').select('id,name,community_id').in('id', chIdSet) : Promise.resolve({ data: [] as never[] }),
        ]);
        const dms = (dmsRes.data ?? []) as { id: string; name: string | null; is_group: boolean }[];
        const dmMembers = (dmMembersRes.data ?? []) as { dm_id: string; user_id: string }[];
        const channels = (channelsRes.data ?? []) as { id: string; name: string; community_id: string }[];
        const commIdSet = [...new Set(channels.map((c) => c.community_id))];
        const [commsRes, authorsRes] = await Promise.all([
          commIdSet.length > 0 ? sb.from('communities').select('id,name').in('id', commIdSet) : Promise.resolve({ data: [] as never[] }),
          authorIds.size > 0 || dmMembers.length > 0
            ? sb
                .from('profiles')
                .select('*')
                .in('id', [...new Set([...authorIds, ...dmMembers.map((m) => m.user_id)])])
            : Promise.resolve({ data: [] as never[] }),
        ]);
        const comms = (commsRes.data ?? []) as { id: string; name: string }[];
        const profiles = (authorsRes.data ?? []) as Profile[];
        const profileById = new Map(profiles.map((p) => [p.id, p]));
        const dmById = new Map(dms.map((d) => [d.id, d]));
        const channelById = new Map(channels.map((c) => [c.id, c]));
        const commById = new Map(comms.map((c) => [c.id, c]));

        const out: SearchResult[] = [];
        for (const m of dmMsgs) {
          const dm = dmById.get(m.dm_id);
          let label = 'Message privé';
          if (dm?.name) label = dm.name;
          else {
            const other = dmMembers.find((x) => x.dm_id === m.dm_id && x.user_id !== me);
            const p = other ? profileById.get(other.user_id) : undefined;
            label = p ? `MP · ${p.display_name || p.username}` : dm?.is_group ? 'Groupe' : 'Message privé';
          }
          const author = profileById.get(m.author_id) ?? null;
          out.push({
            id: m.id,
            kind: 'dm',
            content: m.content,
            authorName: author?.display_name || author?.username || 'Utilisateur',
            authorUsername: author?.username ?? '',
            authorProfile: author,
            label,
            channelName: '',
            attachmentPath: m.attachment_path,
            attachmentName: m.attachment_name,
            target: `/app/dm/${m.dm_id}`,
            createdAt: m.created_at,
          });
        }
        for (const m of chMsgs) {
          const ch = channelById.get(m.channel_id);
          const comm = ch ? commById.get(ch.community_id) : undefined;
          const author = profileById.get(m.author_id) ?? null;
          out.push({
            id: m.id,
            kind: 'channel',
            content: m.content,
            authorName: author?.display_name || author?.username || 'Utilisateur',
            authorUsername: author?.username ?? '',
            authorProfile: author,
            label: ch ? `# ${ch.name}${comm ? ` · ${comm.name}` : ''}` : 'Salon',
            channelName: ch?.name ?? '',
            attachmentPath: m.attachment_path,
            attachmentName: m.attachment_name,
            target: ch ? `/app/c/${ch.community_id}/${ch.id}` : '',
            createdAt: m.created_at,
          });
        }
        out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        // Post-filtrage (sur le seul périmètre RLS déjà récupéré) :
        const IMG = /\.(png|jpe?g|gif|webp|avif)$/i;
        const VID = /\.(mp4|webm|mov|mkv)$/i;
        const filtered = out.filter((r) => {
          if (filters.from) {
            const needle = filters.from.toLowerCase();
            if (!r.authorUsername.toLowerCase().includes(needle) && !r.authorName.toLowerCase().includes(needle)) return false;
          }
          if (filters.inChannel && r.kind !== 'channel') return false;
          if (filters.inChannel && !r.channelName.toLowerCase().includes(filters.inChannel.toLowerCase())) return false;
          if (filters.has === 'lien' && !/https?:\/\//.test(r.content)) return false;
          if (filters.has === 'image' && !IMG.test(r.attachmentPath ?? '') && !IMG.test(r.attachmentName ?? '')) return false;
          if (filters.has === 'vidéo' && !VID.test(r.attachmentPath ?? '') && !VID.test(r.attachmentName ?? '')) return false;
          if (filters.has === 'fichier' && !r.attachmentPath && !r.attachmentName) return false;
          if (filters.before && r.createdAt.slice(0, 10) >= filters.before) return false;
          if (filters.after && r.createdAt.slice(0, 10) < filters.after) return false;
          return true;
        });
        if (runId.current !== myRun) return;
        setResults(filtered.slice(0, 50));
        setSearched(true);
      } catch {
        if (runId.current === myRun) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (runId.current === myRun) setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, sb, me]);

  const select = (r: SearchResult) => {
    if (!r.target) return;
    setOpen(false);
    navigate(`${r.target}#msg-${r.id}`);
    // Saut effectif après le rendu — couvre aussi la conversation déjà ouverte.
    window.setTimeout(() => {
      const el = document.getElementById(r.kind === 'dm' ? `msg-${r.id}` : `cmsg-${r.id}`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('bg-primary/10');
        window.setTimeout(() => el.classList.remove('bg-primary/10'), 2000);
      }
    }, 900);
  };

  if (!open) return null;

  const filters = parseSearchFilters(q);
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.from) activeChips.push({ key: 'from', label: `De : ${filters.from}`, clear: () => setQ(rebuildQuery(filters.text, { ...filters, from: undefined })) });
  if (filters.inChannel) activeChips.push({ key: 'in', label: `Dans : #${filters.inChannel}`, clear: () => setQ(rebuildQuery(filters.text, { ...filters, inChannel: undefined })) });
  if (filters.has) activeChips.push({ key: 'has', label: `Avec : ${filters.has}`, clear: () => setQ(rebuildQuery(filters.text, { ...filters, has: undefined })) });
  if (filters.before) activeChips.push({ key: 'before', label: `Avant : ${filters.before}`, clear: () => setQ(rebuildQuery(filters.text, { ...filters, before: undefined })) });
  if (filters.after) activeChips.push({ key: 'after', label: `Après : ${filters.after}`, clear: () => setQ(rebuildQuery(filters.text, { ...filters, after: undefined })) });

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12dvh]" role="dialog" aria-label="Recherche globale">
      <button aria-label="Fermer" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
      <div className="relative flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher dans tes messages… (au moins 2 caractères)"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
            aria-label="Rechercher dans tes messages"
          />
          <button onClick={() => setOpen(false)} className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface2" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="border-b border-line px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={filters.from ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setQ(rebuildQuery(filters.text, { ...filters, from: v || undefined }));
              }}
              placeholder="De quelqu’un… (pseudo)"
              className="w-40 rounded-lg bg-surface2 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted focus:ring-1 focus:ring-primary"
              aria-label="Filtrer par auteur"
            />
            {activeChips.map((c) => (
              <button
                key={c.key}
                onClick={c.clear}
                className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20"
                title="Retirer ce filtre"
              >
                {c.label} ✕
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Filtres : <code className="font-mono">from:pseudo</code> · <code className="font-mono">in:#salon</code> ·{' '}
            <code className="font-mono">has:lien</code> / <code className="font-mono">has:image</code> /{' '}
            <code className="font-mono">has:vidéo</code> / <code className="font-mono">has:fichier</code> ·{' '}
            <code className="font-mono">before:AAAA-MM-JJ</code> · <code className="font-mono">after:AAAA-MM-JJ</code>.
            Ex. : <code className="font-mono">anniversaire from:lea in:#general</code>
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filters.text.length < 2 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Tape au moins 2 caractères pour rechercher dans tes messages privés et les salons de tes communautés.
              <span className="mt-2 block text-xs">Raccourci : Ctrl+K (ou Cmd+K).</span>
            </p>
          ) : searching ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Recherche…</p>
          ) : searched && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Aucun résultat pour « {q.trim()} ».</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => select(r)}
                className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface2"
              >
                <span className="mt-0.5 shrink-0">
                  <Avatar profile={r.authorProfile} size={32} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-bold">{r.authorName}</span>
                    <span className="truncate text-xs text-muted">{r.label}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {new Date(r.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{r.content}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
