import { useState } from 'react';
import { TRANSLATE_LANGS, translateText } from '../lib/translate';
import { Languages } from 'lucide-react';

/**
 * Traduction d'un message, affichée sous celui-ci.
 * API gratuite sans clé (endpoint public Google Translate, repli MyMemory).
 * Aucune traduction simulée : en cas d'échec, l'erreur est affichée telle quelle.
 */
export default function TranslateBlock({ content, onClose }: { content: string; onClose?: () => void }) {
  const [lang, setLang] = useState('en');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const run = async (target: string) => {
    setStatus('loading');
    setError('');
    try {
      const out = await translateText(content, target);
      setResult(out);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Traduction impossible.');
      setStatus('error');
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface2/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Languages size={15} className="text-muted" />
        <span className="text-xs font-semibold">Traduire vers :</span>
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            setStatus('idle');
          }}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
        >
          {TRANSLATE_LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => run(lang)}
          disabled={status === 'loading'}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {status === 'loading' ? 'Traduction…' : status === 'done' ? 'Retraduire' : 'Traduire'}
        </button>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-xs text-muted hover:text-ink" aria-label="Fermer la traduction">
            ✕
          </button>
        )}
      </div>
      {status === 'done' && (
        <p className="mt-2 text-sm">
          <span className="mr-1 text-xs font-semibold text-muted">Traduction :</span>
          {result}
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs text-danger">
          Traduction indisponible pour le moment ({error}). Réessaie plus tard — aucune traduction approximative
          n’est affichée à la place.
        </p>
      )}
    </div>
  );
}
