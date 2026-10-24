import { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { REPORT_REASON_LABELS, type ReportReason } from '../lib/types';

interface Props {
  messageKind: 'dm' | 'channel';
  messageId: string;
  reportedUserId: string;
  communityId: string | null;
  onClose: () => void;
  onSent: (msg: string) => void;
}

/** Modale de signalement d'un message (MP ou salon). */
export default function ReportModal({ messageKind, messageId, reportedUserId, communityId, onClose, onSent }: Props) {
  const { sb, user } = useAuth();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const { error: insErr } = await sb.from('reports').insert({
        reporter_id: user.id,
        community_id: communityId,
        message_kind: messageKind,
        message_id: messageId,
        reported_user_id: reportedUserId,
        reason,
        details: details.trim().slice(0, 1000),
      });
      if (insErr) throw insErr;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Modal title="Signalement envoyé" onClose={onClose}>
        <p className="text-sm text-muted">
          Merci, ton signalement a été enregistré.
        </p>
        {communityId ? (
          <p className="mt-2 text-sm text-muted">
            Les modérateurs de la communauté peuvent le consulter et agir depuis le panneau de modération.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Pour les messages privés, il n’existe pas encore d’équipe de modération plateforme : ton
            signalement est conservé, mais il ne sera pas revu pour le moment. Tu peux aussi bloquer
            cet utilisateur depuis sa fiche de profil.
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => {
              onSent('Signalement envoyé. Merci.');
              onClose();
            }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            Fermer
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Signaler ce message" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Motif</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
              <option key={r} value={r}>
                {REPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Détails (optionnel)</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Précise ce qui pose problème…"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2">
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Signaler'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
