import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import type { Community } from '../lib/types';

interface DiscoverRow extends Community {
  member_count: number;
  already_member: boolean;
}

/** Découverte : communautés publiques, recherche, rejoindre. */
export default function Discover() {
  const { sb } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<DiscoverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState('');

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
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6">
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
        <ul className="mt-4 space-y-2 overflow-y-auto pb-4">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-4 rounded-2xl bg-surface p-4">
              {c.icon_url ? (
                <img src={c.icon_url} alt={c.name} className="h-14 w-14 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-2xl font-extrabold text-primary">
                  {c.name.trim()[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.name}</p>
                {c.description && <p className="truncate text-sm text-muted">{c.description}</p>}
                <p className="mt-0.5 text-xs text-muted">
                  {c.member_count} membre{c.member_count > 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => join(c)}
                disabled={joiningId === c.id}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                  c.already_member ? 'bg-surface2 hover:bg-line' : 'bg-primary text-white hover:opacity-90'
                }`}
              >
                {joiningId === c.id ? '…' : c.already_member ? 'Ouvrir' : 'Rejoindre'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
