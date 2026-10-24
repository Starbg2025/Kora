import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';

/** Rejoindre une communauté avec un code d'invitation. */
export default function JoinCommunityModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const join = () => {
    const clean = code.trim();
    if (!clean) {
      setError('Colle le code d’invitation reçu.');
      return;
    }
    navigate(`/invitation/${clean}`);
    onClose();
  };

  return (
    <Modal title="Rejoindre une communauté" onClose={onClose} maxWidth="max-w-[480px]">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Colle le code d’invitation partagé par un membre. Tu verras un aperçu de la communauté avant de la rejoindre.
        </p>
        <div>
          <label htmlFor="join-code" className="mb-1 block text-sm font-medium">
            Code d’invitation
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join();
            }}
            placeholder="Ex. A1B2C3"
            autoFocus
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
          >
            Annuler
          </button>
          <button
            onClick={join}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            Continuer
          </button>
        </div>
      </div>
    </Modal>
  );
}
