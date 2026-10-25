import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clapperboard,
  Eye,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Send,
  Share2,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';

interface ShortAuthor {
  display_name: string;
  username: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
}

interface ShortRow {
  id: string;
  author_id: string;
  video_url: string;
  video_path: string;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  caption: string;
  created_at: string;
  author: ShortAuthor | null;
  short_likes: { count: number }[];
  short_comments: { count: number }[];
  short_views: { count: number }[];
}

interface ShortComment {
  id: string;
  short_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: ShortAuthor | null;
}

interface FeedShort {
  row: ShortRow;
  likes: number;
  comments: number;
  views: number;
  liked: boolean;
}

const MAX_SIZE = 100 * 1024 * 1024; // 100 Mo
const MAX_DURATION = 60; // secondes
const ALLOWED_EXTS = ['mp4', 'webm', 'mov'];

function countOf(arr?: { count: number }[]) {
  return arr?.[0]?.count ?? 0;
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/** Valide une vidéo : type, taille, durée (via les métadonnées). */
async function validateVideo(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.includes(ext)) return 'Format non pris en charge : utilise une vidéo MP4, WebM ou MOV.';
  if (file.size > MAX_SIZE) return 'Vidéo trop lourde : 100 Mo maximum.';
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(v.duration);
      v.onerror = () => reject(new Error('metadata'));
      v.src = url;
    });
    if (!Number.isFinite(duration) || duration <= 0) return 'Impossible de lire cette vidéo.';
    if (duration > MAX_DURATION) return `Vidéo trop longue : ${Math.round(duration)} s (60 s maximum).`;
    return null;
  } catch {
    return 'Impossible de lire cette vidéo.';
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Capture la première image lisible (miniature) — null si impossible. */
async function captureThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      const done = () => {
        try {
          const w = 360;
          const h = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h || 640;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(v, 0, 0, w, canvas.height);
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
        } catch {
          resolve(null);
        }
      };
      v.onseeked = done;
      v.onerror = () => resolve(null);
      v.src = url;
      v.onloadeddata = () => {
        try {
          v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
        } catch {
          resolve(null);
        }
      };
      setTimeout(() => resolve(null), 5000);
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shorts : fil vertical plein écran, une vidéo par écran. */
export default function Shorts() {
  const { sb, user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const me = user?.id ?? '';
  const isAdmin = !!profile?.is_site_admin;

  const [items, setItems] = useState<FeedShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedShort | null>(null);
  const [deleting, setDeleting] = useState(false);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const viewedRef = useRef(new Set<string>());
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMissingTable(false);
    const { data, error: err } = await sb
      .from('shorts')
      .select(
        '*, author:profiles!shorts_author_id_fkey(display_name, username, avatar_url, avatar_frame), short_likes(count), short_comments(count), short_views(count)',
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (err) {
      if ((err as { code?: string }).code === 'PGRST205') setMissingTable(true);
      else setError(err.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as ShortRow[];
    let liked = new Set<string>();
    if (me && rows.length > 0) {
      const { data: likes } = await sb
        .from('short_likes')
        .select('short_id')
        .eq('user_id', me)
        .in(
          'short_id',
          rows.map((r) => r.id),
        );
      liked = new Set(((likes ?? []) as { short_id: string }[]).map((l) => l.short_id));
    }
    setItems(
      rows.map((row) => ({
        row,
        likes: countOf(row.short_likes),
        comments: countOf(row.short_comments),
        views: countOf(row.short_views),
        liked: liked.has(row.id),
      })),
    );
    setLoading(false);
  }, [sb, me]);

  useEffect(() => {
    void load();
  }, [load]);

  // Temps réel : compteurs du fil — relecture exacte (évite tout double comptage
  // entre mise à jour optimiste et écho temps réel).
  const countTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const refreshCounts = useCallback(
    (shortId: string) => {
      const prev = countTimers.current.get(shortId);
      if (prev) clearTimeout(prev);
      countTimers.current.set(
        shortId,
        setTimeout(async () => {
          const [l, c, v] = await Promise.all([
            sb.from('short_likes').select('*', { count: 'exact', head: true }).eq('short_id', shortId),
            sb.from('short_comments').select('*', { count: 'exact', head: true }).eq('short_id', shortId),
            sb.from('short_views').select('*', { count: 'exact', head: true }).eq('short_id', shortId),
          ]);
          setItems((prevItems) =>
            prevItems.map((it) =>
              it.row.id === shortId
                ? {
                    ...it,
                    likes: l.count ?? it.likes,
                    comments: c.count ?? it.comments,
                    views: v.count ?? it.views,
                  }
                : it,
            ),
          );
        }, 300),
      );
    },
    [sb],
  );

  useEffect(() => {
    if (!user) return;
    const ch = sb
      .channel(`shorts-feed-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'short_likes' }, (p) => {
        refreshCounts((p.new as { short_id: string }).short_id);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'short_likes' }, (p) => {
        refreshCounts((p.old as { short_id: string }).short_id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'short_comments' }, (p) => {
        refreshCounts((p.new as { short_id: string }).short_id);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'short_comments' }, (p) => {
        refreshCounts((p.old as { short_id: string }).short_id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'short_views' }, (p) => {
        refreshCounts((p.new as { short_id: string }).short_id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shorts' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [sb, user, uid, load, refreshCounts]);

  // Détection du short actif au défilement (snap).
  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const h = el.clientHeight;
    if (h === 0 || items.length === 0) return;
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / h)));
    const id = items[idx]?.row.id;
    if (id && id !== activeId) {
      setActiveId(id);
      setPaused(false);
    }
  };

  // Premier short actif + lien profond ?id= (une seule fois, au premier chargement :
  // un nouveau short arrivant plus tard ne doit pas ramener l'utilisateur en haut).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (items.length === 0 || initializedRef.current) return;
    initializedRef.current = true;
    const wanted = searchParams.get('id');
    const idx = wanted ? items.findIndex((it) => it.row.id === wanted) : 0;
    const target = idx >= 0 ? idx : 0;
    setActiveId(items[target].row.id);
    if (idx > 0) {
      const el = feedRef.current;
      if (el) el.scrollTo({ top: target * el.clientHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Lecture : seul le short actif joue ; les autres sont en pause.
  useEffect(() => {
    videoRefs.current.forEach((v, id) => {
      if (id === activeId && !paused) {
        v.muted = muted;
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeId, paused, muted, items.length]);

  // Vues uniques : 1 s sur le short actif, une seule fois par session.
  useEffect(() => {
    if (!activeId || !me || viewedRef.current.has(activeId)) return;
    if (viewTimer.current) clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      if (activeId && !viewedRef.current.has(activeId)) {
        viewedRef.current.add(activeId);
        void sb
          .from('short_views')
          .upsert({ short_id: activeId, user_id: me }, { onConflict: 'short_id,user_id' })
          .then(() => {});
      }
    }, 1000);
    return () => {
      if (viewTimer.current) clearTimeout(viewTimer.current);
    };
  }, [activeId, me, sb]);

  const toggleLike = async (it: FeedShort) => {
    if (!me) return;
    const wasLiked = it.liked;
    // Optimiste sur le cœur uniquement ; le compteur exact vient du serveur
    // (relecture après confirmation + écho temps réel), jamais d'un +1 local.
    setItems((prev) => prev.map((x) => (x.row.id === it.row.id ? { ...x, liked: !wasLiked } : x)));
    const { error: err } = wasLiked
      ? await sb.from('short_likes').delete().eq('short_id', it.row.id).eq('user_id', me)
      : await sb.from('short_likes').insert({ short_id: it.row.id, user_id: me });
    if (err) {
      setItems((prev) => prev.map((x) => (x.row.id === it.row.id ? { ...x, liked: wasLiked } : x)));
      setNotice('Impossible d’enregistrer le like.');
    } else {
      refreshCounts(it.row.id);
    }
  };

  const share = async (it: FeedShort) => {
    const link = `${window.location.origin}/app/shorts?id=${it.row.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Lien du short copié.');
    } catch {
      setNotice(link);
    }
  };

  const deleteShort = async () => {
    if (!deleteTarget || !me) return;
    setDeleting(true);
    const { row } = deleteTarget;
    const paths = [row.video_path, row.thumbnail_path].filter((p): p is string => !!p);
    if (paths.length > 0) await sb.storage.from('shorts').remove(paths).catch(() => {});
    const { error: err } = await sb.from('shorts').delete().eq('id', row.id);
    setDeleting(false);
    if (err) {
      setNotice(`Suppression impossible : ${err.message}`);
      return;
    }
    setItems((prev) => prev.filter((x) => x.row.id !== row.id));
    setDeleteTarget(null);
    setNotice('Short supprimé.');
  };

  const likeBtn = (it: FeedShort) => (
    <button
      onClick={() => void toggleLike(it)}
      className="flex flex-col items-center gap-1 text-white drop-shadow"
      aria-label={it.liked ? 'Retirer le like' : 'Aimer'}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${it.liked ? 'bg-danger' : 'bg-black/45'}`}>
        <Heart size={22} fill={it.liked ? 'currentColor' : 'none'} />
      </span>
      <span className="text-xs font-bold">{it.likes}</span>
    </button>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">Chargement des Shorts…</p>
      </div>
    );
  }

  if (missingTable) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <Clapperboard size={48} className="text-muted" />
        <h1 className="mt-4 text-lg font-bold">Les Shorts arrivent</h1>
        <p className="mt-2 text-sm text-muted">
          La base de données n’a pas encore la table des Shorts : la migration 20261028_shorts.sql doit être exécutée
          dans Supabase avant de pouvoir publier ou regarder des Shorts.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[520px] flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between gap-2 bg-base px-4 py-3">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <Clapperboard size={20} className="shrink-0 text-primary" />
          <span className="truncate">Shorts</span>
        </h1>
        <button
          onClick={() => setShowPublish(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          <Plus size={16} /> Publier
        </button>
      </div>

      {error && (
        <div className="shrink-0 bg-danger/15 px-4 py-2.5 text-sm text-danger">
          Erreur : {error} <button onClick={() => void load()} className="ml-2 font-bold underline">Réessayer</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center bg-base px-6 text-center">
          <Clapperboard size={48} className="text-muted" />
          <h2 className="mt-4 text-lg font-bold">Aucun short pour le moment</h2>
          <p className="mt-2 text-sm text-muted">Sois le premier à en publier : 60 secondes maximum, 100 Mo maximum.</p>
          <button
            onClick={() => setShowPublish(true)}
            className="mt-5 flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus size={16} /> Publier un short
          </button>
        </div>
      ) : (
        <div
          ref={feedRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto bg-black"
        >
          {items.map((it, idx) => {
            const isActive = it.row.id === activeId;
            const canDelete = it.row.author_id === me || isAdmin;
            const neighbor = Math.abs(idx - items.findIndex((x) => x.row.id === activeId)) <= 1;
            return (
              <article key={it.row.id} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(it.row.id, el);
                    else videoRefs.current.delete(it.row.id);
                  }}
                  src={it.row.video_url}
                  poster={it.row.thumbnail_url ?? undefined}
                  className="h-full w-full object-cover"
                  playsInline
                  loop
                  muted={muted}
                  preload={isActive ? 'auto' : neighbor ? 'metadata' : 'none'}
                  onClick={() => {
                    if (isActive) setPaused((p) => !p);
                  }}
                />
                {isActive && paused && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white">
                      <Play size={28} fill="currentColor" />
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white"
                  aria-label={muted ? 'Activer le son' : 'Couper le son'}
                >
                  {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-5 pt-16">
                  <div className="flex min-w-0 items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Avatar
                          profile={
                            it.row.author
                              ? {
                                  display_name: it.row.author.display_name,
                                  username: it.row.author.username,
                                  avatar_url: it.row.author.avatar_url,
                                  avatar_frame: it.row.author.avatar_frame ?? null,
                                }
                              : null
                          }
                          size={36}
                        />
                        <span className="truncate text-sm font-bold text-white">
                          @{it.row.author?.username ?? 'inconnu'}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-white/80">
                          <Eye size={13} /> {it.views}
                        </span>
                      </div>
                      {it.row.caption && (
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-white">{it.row.caption}</p>
                      )}
                      <p className="mt-1 text-xs text-white/70">{timeAgo(it.row.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
                      {likeBtn(it)}
                      <button
                        onClick={() => setCommentsFor(it.row.id)}
                        className="flex flex-col items-center gap-1 text-white drop-shadow"
                        aria-label="Commentaires"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45">
                          <MessageCircle size={22} />
                        </span>
                        <span className="text-xs font-bold">{it.comments}</span>
                      </button>
                      <button
                        onClick={() => void share(it)}
                        className="flex flex-col items-center gap-1 text-white drop-shadow"
                        aria-label="Partager"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45">
                          <Share2 size={22} />
                        </span>
                        <span className="text-xs font-bold">Partager</span>
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(it)}
                          className="flex flex-col items-center gap-1 text-white drop-shadow"
                          aria-label="Supprimer ce short"
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45">
                            <Trash2 size={22} />
                          </span>
                          <span className="text-xs font-bold">Suppr.</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isActive && !paused && (
                  <button
                    onClick={() => setPaused(true)}
                    className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white"
                    aria-label="Mettre en pause"
                  >
                    <Pause size={20} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {notice && (
        <div className="fixed bottom-20 left-1/2 z-[70] max-w-[calc(100vw-2rem)] -translate-x-1/2 truncate rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-base shadow-xl md:bottom-6">
          {notice}
          <button onClick={() => setNotice('')} className="ml-3 font-bold" aria-label="Fermer">
            ×
          </button>
        </div>
      )}

      {showPublish && <PublishModal onClose={() => setShowPublish(false)} onPublished={() => void load()} />}
      {commentsFor && (
        <CommentsSheet
          shortId={commentsFor}
          onClose={() => setCommentsFor(null)}
        />
      )}
      {deleteTarget && (
        <Modal title="Supprimer ce short ?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-muted">
            La vidéo, sa miniature, ses likes, ses commentaires et ses vues seront définitivement supprimés.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
            >
              Annuler
            </button>
            <button
              onClick={() => void deleteShort()}
              disabled={deleting}
              className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PublishModal({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const { sb, user, profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const pick = async (f: File | null) => {
    setFile(null);
    setPreview('');
    setError('');
    if (!f) return;
    setChecking(true);
    const err = await validateVideo(f);
    setChecking(false);
    if (err) {
      setError(err);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;
    setBusy(true);
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
    const base = crypto.randomUUID();
    const videoPath = `${user.id}/${base}.${ext}`;
    let thumbPath: string | null = null;
    let thumbUrl: string | null = null;
    try {
      const { error: upErr } = await sb.storage.from('shorts').upload(videoPath, file, { upsert: false });
      if (upErr) throw upErr;
      const thumb = await captureThumbnail(file);
      if (thumb) {
        thumbPath = `${user.id}/thumb-${base}.jpg`;
        const { error: thErr } = await sb.storage.from('shorts').upload(thumbPath, thumb, {
          upsert: false,
          contentType: 'image/jpeg',
        });
        if (!thErr) thumbUrl = sb.storage.from('shorts').getPublicUrl(thumbPath).data.publicUrl;
        else thumbPath = null;
      }
      const videoUrl = sb.storage.from('shorts').getPublicUrl(videoPath).data.publicUrl;
      const { error: insErr } = await sb.from('shorts').insert({
        author_id: user.id,
        video_url: videoUrl,
        video_path: videoPath,
        thumbnail_url: thumbUrl,
        thumbnail_path: thumbPath,
        caption: caption.trim().slice(0, 300),
      });
      if (insErr) {
        await sb.storage.from('shorts').remove([videoPath, ...(thumbPath ? [thumbPath] : [])]).catch(() => {});
        throw insErr;
      }
      onPublished();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Publier un short" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Vidéo (60 s max, 100 Mo max, MP4/WebM/MOV)</label>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            onChange={(e) => void pick(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          {checking && <p className="mt-1 text-xs text-muted">Vérification de la vidéo…</p>}
          {preview && (
            <video src={preview} controls muted playsInline className="mt-3 max-h-64 w-full rounded-xl bg-black object-contain" />
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Légende (optionnel, 300 caractères max)</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Décris ton short…"
            className="w-full resize-none rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="mt-1 text-right text-xs text-muted">{caption.length}/300</p>
        </div>
        {profile && (
          <p className="text-xs text-muted">
            Publié en tant que @{profile.username}. Le short apparaîtra dans le fil public, du plus récent au plus ancien.
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
            Annuler
          </button>
          <button
            disabled={!file || busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Publier'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CommentsSheet({ shortId, onClose }: { shortId: string; onClose: () => void }) {
  const { sb, user, profile } = useAuth();
  const [comments, setComments] = useState<ShortComment[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    let alive = true;
    sb.from('short_comments')
      .select('*, author:profiles!short_comments_author_id_fkey(display_name, username, avatar_url, avatar_frame)')
      .eq('short_id', shortId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (alive) setComments((data ?? []) as ShortComment[]);
      });
    const ch = sb
      .channel(`short-comments-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'short_comments', filter: `short_id=eq.${shortId}` }, (p) => {
        const c = p.new as ShortComment;
        setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'short_comments', filter: `short_id=eq.${shortId}` }, (p) => {
        const old = p.old as { id: string };
        setComments((prev) => prev.filter((x) => x.id !== old.id));
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(ch);
    };
  }, [sb, shortId, uid]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim().slice(0, 500);
    if (!text || !user || busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await sb.from('short_comments').insert({ short_id: shortId, author_id: user.id, body: text });
    setBusy(false);
    if (err) setError(err.message);
    else setBody('');
  };

  const removeComment = async (c: ShortComment) => {
    if (c.author_id !== user?.id && !profile?.is_site_admin) return;
    await sb.from('short_comments').delete().eq('id', c.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[75dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface p-4 shadow-2xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Commentaires</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface2" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucun commentaire pour le moment. Sois le premier !</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex min-w-0 items-start gap-2.5">
                <Avatar
                  profile={
                    c.author
                      ? {
                          display_name: c.author.display_name,
                          username: c.author.username,
                          avatar_url: c.author.avatar_url,
                          avatar_frame: c.author.avatar_frame ?? null,
                        }
                      : null
                  }
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-bold">@{c.author?.username ?? 'inconnu'}</span>{' '}
                    <span className="text-xs text-muted">{timeAgo(c.created_at)}</span>
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                </div>
                {(c.author_id === user?.id || profile?.is_site_admin) && (
                  <button
                    onClick={() => void removeComment(c)}
                    className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-danger"
                    aria-label="Supprimer ce commentaire"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={send} className="mt-3 flex shrink-0 items-center gap-2 border-t border-line pt-3">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            placeholder="Ajouter un commentaire…"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            disabled={!body.trim() || busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:opacity-90 disabled:opacity-50"
            aria-label="Envoyer le commentaire"
          >
            <Send size={18} />
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
