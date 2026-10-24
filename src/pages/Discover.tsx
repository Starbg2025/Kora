import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { formatDate } from '../lib/format';
import type { Community } from '../lib/types';

interface DiscoverRow extends Community {
  member_count: number;
  already_member: boolean;
}

/** Découverte : communautés publiques, recherche, rejoindre. */
export default function Discover() {
  const { sb } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<DiscoverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<DiscoverRow | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb.rpc('discover_communities', { p_query: '' });
      if (!alive) return;
      if (error) {
        setError('Découverte indisponible : exécute la migration 20261024_phase2_communities.sql.');
        setRows([]);
      } else {
        setRows((data ?? []) as DiscoverRow[]);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb]);

  const join = async (c: DiscoverRow) => {
    if (c.already_member) {
      navigate(`/app/c/${c.id}`);
      return;
    }
    setJoiningId(c.id);
    setError('');
    try {
      const { error } = await sb.rpc('join_community', { p_community: c.id });
      if (error) throw error;
      await notify('communaute', `Bienvenue dans ${c.name} !`, c.description?.slice(0, 120) ?? '', `/app/c/${c.id}`);
      navigate(`/app/c/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre.');
    } finally {
      setJoiningId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)) : rows;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6">
      <h1 className="text-2xl font-extrabold">Découvrir des communautés</h1>
      <p className="mt-1 text-sm text-muted">Des espaces publics créés par la communauté Kora.</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher une communauté…"
        className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        aria-label="Rechercher une communauté"
      />
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={q ? 'Aucun résultat' : 'Aucune communauté publique'}
            text={q ? 'Essaie un autre mot-clé.' : 'Sois le premier à créer une communauté publique !'}
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 overflow-y-auto pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <li key={c.id} className="flex flex-col rounded-2xl bg-surface p-4">
              {c.icon_url ? (
                <img src={c.icon_url} alt={c.name} className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-2xl font-extrabold text-primary">
                  {c.name.trim()[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <p className="mt-3 truncate font-bold">{c.name}</p>
              {c.description ? (
                <p className="mt-0.5 line-clamp-2 min-h-10 text-sm text-muted">{c.description}</p>
              ) : (
                <p className="mt-0.5 min-h-10 text-sm italic text-muted">Aucune description.</p>
              )}
              <p className="mt-2 text-xs text-muted">
                {c.member_count} membre{c.member_count > 1 ? 's' : ''}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setDetails(c)}
                  className="flex-1 rounded-xl bg-surface2 px-3 py-2 text-sm font-bold hover:bg-line"
                >
                  Détails
                </button>
                <button
                  onClick={() => join(c)}
                  disabled={joiningId === c.id}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50 ${
                    c.already_member ? 'bg-surface2 hover:bg-line' : 'bg-primary text-white hover:opacity-90'
                  }`}
                >
                  {joiningId === c.id ? '…' : c.already_member ? 'Ouvrir' : 'Rejoindre'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {details && (
        <Modal title={details.name} onClose={() => setDetails(null)} maxWidth="max-w-[480px]">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {details.icon_url ? (
                <img src={details.icon_url} alt={details.name} className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-3xl font-extrabold text-primary">
                  {details.name.trim()[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div>
                <p className="text-sm text-muted">
                  {details.member_count} membre{details.member_count > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-muted">Créée le {formatDate(details.created_at)}</p>
              </div>
            </div>
            {details.description ? (
              <p className="whitespace-pre-wrap text-sm">{details.description}</p>
            ) : (
              <p className="text-sm italic text-muted">Aucune description.</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setDetails(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
              >
                Fermer
              </button>
              <button
                onClick={() => {
                  const c = details;
                  setDetails(null);
                  join(c);
                }}
                disabled={joiningId === details.id}
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {details.already_member ? 'Ouvrir' : 'Rejoindre'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
