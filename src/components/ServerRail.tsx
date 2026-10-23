import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCommunities } from '../hooks/useCommunities';
import CreateCommunityModal from './CreateCommunityModal';

function CommunityButton({
  name,
  iconUrl,
  active,
  onClick,
  title,
}: {
  name: string;
  iconUrl: string | null;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all hover:rounded-xl ${
        active ? 'rounded-xl bg-primary text-white' : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
      }`}
    >
      {active && <span className="absolute -left-2.5 h-8 w-1 rounded-r-full bg-ink" />}
      {iconUrl ? (
        <img src={iconUrl} alt={name} className="h-12 w-12 rounded-2xl object-cover hover:rounded-xl" />
      ) : (
        <span className="text-lg font-extrabold">{name.trim()[0]?.toUpperCase() ?? '?'}</span>
      )}
    </button>
  );
}

/** Rail des serveurs (desktop) : accueil MPs, communautés, création, découverte. */
export default function ServerRail() {
  const { communities, reload } = useCommunities();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const activeCommunity = /^\/app\/c\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
  const onDMs = location.pathname.startsWith('/app/dm');

  return (
    <>
      <nav
        className="hidden w-[76px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto bg-surface py-3 md:flex"
        aria-label="Communautés"
      >
        <button
          onClick={() => navigate('/app/dm')}
          title="Messages privés"
          aria-label="Messages privés"
          className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all hover:rounded-xl ${
            onDMs && !activeCommunity ? 'rounded-xl bg-primary text-white' : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
          }`}
        >
          {onDMs && !activeCommunity && <span className="absolute -left-2.5 h-8 w-1 rounded-r-full bg-ink" />}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
        <div className="h-px w-8 shrink-0 bg-line" />
        {communities.map((c) => (
          <CommunityButton
            key={c.id}
            name={c.name}
            iconUrl={c.icon_url}
            title={c.name}
            active={activeCommunity === c.id}
            onClick={() => navigate(`/app/c/${c.id}`)}
          />
        ))}
        <button
          onClick={() => setShowCreate(true)}
          title="Créer une communauté"
          aria-label="Créer une communauté"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface2 text-xl text-muted transition-all hover:rounded-xl hover:bg-primary hover:text-white"
        >
          ＋
        </button>
        <button
          onClick={() => navigate('/app/decouvrir')}
          title="Découvrir des communautés"
          aria-label="Découvrir des communautés"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all hover:rounded-xl ${
            location.pathname === '/app/decouvrir'
              ? 'rounded-xl bg-primary text-white'
              : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </button>
      </nav>

      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            reload();
            navigate(`/app/c/${id}`);
          }}
        />
      )}
    </>
  );
}
