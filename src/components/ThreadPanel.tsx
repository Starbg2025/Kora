import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { requireSupabase } from '../lib/supabase';
import { formatTime } from '../lib/format';

interface ReplyRow {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  attachment_name: string | null;
}

interface Props {
  table: 'messages' | 'community_messages';
  parentId: string;
  parentAuthor: string;
  parentContent: string;
  parentCreatedAt: string;
  resolveName: (authorId: string) => string;
  onSend: (content: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Fil de discussion : message parent + toutes ses réponses, en ordre
 * chronologique, avec un compositeur qui répond dans le fil. Les réponses
 * restent aussi visibles dans la conversation principale (réponses citées).
 */
export default function ThreadPanel(p: Props) {
  const sb = requireSupabase();
  const tag = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    sb.from(p.table)
      .select('id, author_id, content, created_at, attachment_name')
      .eq('reply_to', p.parentId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (alive) {
          setReplies((data ?? []) as ReplyRow[]);
          setLoading(false);
        }
      });
    const ch = sb
      .channel(`thread-${tag}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: p.table, filter: `reply_to=eq.${p.parentId}` },
        (payload) => {
          const row = payload.new as ReplyRow;
          setReplies((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      ch.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.table, p.parentId]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      await p.onSend(content);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-line bg-surface md:w-80 md:shrink-0">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="font-bold">Fil de discussion</h2>
        <button onClick={p.onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink" aria-label="Fermer le fil">
          <X size={16} />
        </button>
      </div>
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm">
          <span className="font-bold">{p.parentAuthor}</span>
          <span className="ml-2 text-xs text-muted">{formatTime(p.parentCreatedAt)}</span>
        </p>
        <p className="mt-1 text-sm leading-relaxed">{p.parentContent || 'Pièce jointe'}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : replies.length === 0 ? (
          <p className="text-sm text-muted">Aucune réponse pour l'instant. Lance le fil ci-dessous.</p>
        ) : (
          <ul className="space-y-3">
            {replies.map((r) => (
              <li key={r.id}>
                <p className="text-sm">
                  <span className="font-bold">{p.resolveName(r.author_id)}</span>
                  <span className="ml-2 text-xs text-muted">{formatTime(r.created_at)}</span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed">{r.content || r.attachment_name || 'Pièce jointe'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Répondre dans le fil…"
            aria-label="Répondre dans le fil"
            className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? '…' : 'Envoyer'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
