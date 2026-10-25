import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { generateInviteCode } from '../lib/community';
import type { CommunityInvite } from '../lib/types';
import { X } from 'lucide-react';

interface Props {
  communityId: string;
  communityName: string;
  onClose: () => void;
}

const EXPIRIES = [
  { id: 'never', label: 'Jamais', value: null as string | null },
  { id: '1h', label: '1 heure', value: '1h' },
  { id: '24h', label: '24 heures', value: '24h' },
  { id: '7d', label: '7 jours', value: '7d' },
];

const MAX_USES = [
  { id: 'inf', label: 'Illimité', value: null as number | null },
  { id: '1', label: '1 utilisation', value: 1 },
  { id: '10', label: '10 utilisations', value: 10 },
  { id: '50', label: '50 utilisations', value: 50 },
];

/** Création et partage de liens d'invitation. */
export default function InviteModal({ communityId, communityName, onClose }: Props) {
  const { sb, user } = useAuth();
  const [invites, setInvites] = useState<CommunityInvite[]>([]);
  const [expiry, setExpiry] = useState('never');
  const [maxUses, setMaxUses] = useState('inf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const { data } = await sb
      .from('community_invites')
      .select('*')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false })
      .limit(20);
    setInvites((data ?? []) as CommunityInvite[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  const linkFor = (code: string) => `${window.location.origin}/invitation/${code}`;

  const create = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const exp = EXPIRIES.find((e) => e.id === expiry)!;
      const mu = MAX_USES.find((m) => m.id === maxUses)!;
      const ms = exp.value === '1h' ? 3600_000 : exp.value === '24h' ? 24 * 3600_000 : exp.value === '7d' ? 7 * 24 * 3600_000 : 0;
      let code = generateInviteCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await sb.from('community_invites').insert({
          code,
          community_id: communityId,
          created_by: user.id,
          max_uses: mu.value,
          expires_at: ms ? new Date(Date.now() + ms).toISOString() : null,
        });
        if (!error) break;
        if (error.code === '23505') {
          code = generateInviteCode();
          continue;
        }
        throw error;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (code: string) => {
    const { error } = await sb.from('community_invites').delete().eq('code', code);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = linkFor(code);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(code);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Modal title={`Inviter à « ${communityName} »`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Expire après</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRIES.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setExpiry(e.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${expiry === e.id ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:text-ink'}`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Utilisations max</label>
            <div className="flex flex-wrap gap-1.5">
              {MAX_USES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMaxUses(m.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${maxUses === m.id ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:text-ink'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={create}
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Création…' : 'Créer un lien d’invitation'}
        </button>
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

        {invites.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Liens actifs</p>
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li key={inv.code} className="flex items-center gap-2 rounded-xl bg-surface2 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{linkFor(inv.code)}</code>
                  <span className="shrink-0 text-xs text-muted">
                    {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ''} util.
                  </span>
                  <button
                    onClick={() => copy(inv.code)}
                    className="shrink-0 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-bold hover:bg-line"
                  >
                    {copied === inv.code ? 'Copié ✓' : 'Copier'}
                  </button>
                  <button
                    onClick={() => revoke(inv.code)}
                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface hover:text-danger"
                    title="Révoquer"
                    aria-label="Révoquer l’invitation"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
