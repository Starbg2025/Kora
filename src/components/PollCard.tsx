import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { MessagePoll, MessagePollVote } from '../lib/types';

interface Props {
  poll: MessagePoll;
  votes: MessagePollVote[];
  meId: string;
  flash: (t: string) => void;
}

/** Carte de sondage façon Discord : options votables, barres de résultats, temps réel. */
export default function PollCard({ poll, votes, meId, flash }: Props) {
  const { sb } = useAuth();
  const [busy, setBusy] = useState(false);

  const ended = poll.ends_at ? new Date(poll.ends_at).getTime() <= Date.now() : false;
  const counts = poll.options.map((_, i) => votes.filter((v) => v.option_index === i).length);
  const total = votes.length;
  const myVote = votes.find((v) => v.user_id === meId);

  const vote = async (i: number) => {
    if (ended || busy) return;
    if (myVote?.option_index === i) return;
    setBusy(true);
    try {
      if (myVote) {
        const { error } = await sb.from('message_poll_votes').delete().eq('poll_id', poll.id).eq('user_id', meId);
        if (error) throw error;
      }
      const { error } = await sb.from('message_poll_votes').insert({ poll_id: poll.id, user_id: meId, option_index: i });
      if (error) throw error;
    } catch {
      flash('Vote impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const endsLabel = poll.ends_at
    ? ended
      ? 'Sondage terminé'
      : 'Se termine le ' + new Date(poll.ends_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + new Date(poll.ends_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="mt-2 max-w-sm rounded-xl border border-line bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sondage</p>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((opt, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          const mine = myVote?.option_index === i;
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={ended || busy}
              className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                mine ? 'border-primary' : 'border-line hover:border-primary/50'
              } ${ended ? 'cursor-default' : ''}`}
            >
              <span className="absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${pct}%` }} />
              <span className="relative flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{mine ? '✓ ' : ''}{opt}</span>
                <span className="shrink-0 text-xs text-muted">{counts[i]} · {pct} %</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {total} vote{total > 1 ? 's' : ''}{endsLabel ? ` · ${endsLabel}` : ''}
      </p>
    </div>
  );
}
