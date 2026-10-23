import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCommunities } from '../hooks/useCommunities';
import CreateCommunityModal from '../components/CreateCommunityModal';
import EmptyState from '../components/EmptyState';
import { ROLE_LABELS } from '../lib/types';

function CommunityIcon({ name, iconUrl, size = 56 }: { name: string; iconUrl: string | null; size?: number }) {
  if (iconUrl) {
    return <img src={iconUrl} alt={name} style={{ width: size, height: size }} className="rounded-2xl object-cover" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-2xl bg-primary/20 text-2xl font-extrabold text-primary"
    >
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

/** Mes communautés : liste, création, accès à la découverte. */
export default function Communities() {
  const { communities, loading, reload } = useCommunities();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Communautés</h1>
        <div className="flex gap-2">
          <Link
            to="/app/decouvrir"
            className="rounded-xl bg-surface2 px-4 py-2 text-sm font-semibold hover:bg-line"
          >
            Découvrir
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            ＋ Créer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">Chargement…</p>
        </div>
      ) : communities.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="Aucune communauté"
            text="Crée ta première communauté ou rejoins-en une via Découvrir."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-2 overflow-y-auto pb-4">
          {communities.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/app/c/${c.id}`)}
                className="flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left hover:bg-surface2"
              >
                <CommunityIcon name={c.name} iconUrl={c.icon_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{c.name}</span>
                  {c.description && <span className="block truncate text-sm text-muted">{c.description}</span>}
                  <span className="mt-1 inline-block rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold text-muted">
                    {ROLE_LABELS[c.role]}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            reload();
            navigate(`/app/c/${id}`);
          }}
        />
      )}
    </div>
  );
}
