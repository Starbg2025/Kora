import { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { X } from 'lucide-react';

interface Props {
  dmId: string;
  onClose: () => void;
  onPublished: (messageId: string) => void;
}

const DURATIONS = [
  { id: '1h', label: '1 heure', ms: 3600_000 },
  { id: '24h', label: '24 heures', ms: 24 * 3600_000 },
  { id: '7j', label: '7 jours', ms: 7 * 24 * 3600_000 },
  { id: 'inf', label: 'Sans limite', ms: 0 },
];

export default function PollModal({ dmId, onClose, onPublished }: Props) {
  const { sb, user } = useAuth();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState('24h');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setOption = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length < 10 ? [...o, ''] : o));
  const removeOption = (i: number) => setOptions((o) => (o.length > 2 ? o.filter((_, j) => j !== i) : o));

  const publish = async () => {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q) { setError('Pose une question.'); return; }
    if (opts.length < 2) { setError('Ajoute au moins deux choix.'); return; }
    const me = user?.id;
    if (!me) { setError('Session expirée.'); return; }
    setBusy(true);
    setError('');
    try {
      // 1. Message porteur (la question reste lisible même sans la table des sondages)
      const { data: msg, error: msgErr } = await sb
        .from('messages')
        .insert({ dm_id: dmId, author_id: me, content: q })
        .select('id')
        .single();
      if (msgErr) throw msgErr;
      // 2. Le sondage
      const d = DURATIONS.find((x) => x.id === duration)!;
      const { error: pollErr } = await sb.from('message_polls').insert({
        message_id: msg.id,
        question: q,
        options: opts,
        created_by: me,
        ends_at: d.ms ? new Date(Date.now() + d.ms).toISOString() : null,
      });
      if (pollErr) {
        // Annule le message orphelin, message honnête
        await sb.from('messages').delete().eq('id', msg.id);
        throw new Error(
          /message_polls|PGRST205|Could not find the table/i.test(pollErr.message)
            ? 'Sondages non activés : exécute supabase/migrations/20261023_polls.sql dans ton tableau de bord Supabase.'
            : pollErr.message,
        );
      }
      onPublished(msg.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publication impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Créer un sondage" onClose={onClose}>
      <div className="p-5 pt-1">
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">Question</label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ex. On regarde quoi ce soir ?"
          maxLength={200}
          className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">Choix</label>
        <div className="mt-1 space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Choix ${i + 1}`}
                maxLength={80}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="rounded-lg px-2 py-1 text-muted hover:bg-surface2 hover:text-danger" aria-label="Retirer ce choix"><X size={16} /></button>
              )}
            </div>
          ))}
        </div>
        {options.length < 10 && (
          <button onClick={addOption} className="mt-2 text-sm font-semibold text-primary hover:underline">
            + Ajouter un choix
          </button>
        )}
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">Durée</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDuration(d.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${duration === d.id ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:text-ink'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
            Annuler
          </button>
          <button
            onClick={publish}
            disabled={busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Publication…' : 'Publier le sondage'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
