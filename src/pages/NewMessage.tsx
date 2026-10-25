import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../hooks/useFriends';
import { usePresence } from '../context/PresenceContext';
import Avatar from '../components/Avatar';
import { openDirectDM } from '../lib/dm';
import { Plus, Users } from 'lucide-react';

/** Écran « Nouveau message » façon Discord : recherche d'amis + suggestions. */
export default function NewMessage() {
  const { sb, user } = useAuth();
  const { online } = usePresence();
  const { entries } = useFriends();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const me = user?.id ?? '';
  const friends = useMemo(
    () => entries.filter((e) => e.friendship.status === 'accepted'),
    [entries],
  );
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(
      (f) =>
        f.profile.username.toLowerCase().includes(needle) ||
        (f.profile.display_name || '').toLowerCase().includes(needle),
    );
  }, [friends, q]);

  const openDM = async (friendId: string) => {
    setBusy(true);
    setError('');
    try {
      const dmId = await openDirectDM(sb, user?.id ?? '', friendId);
      navigate(`/app/dm/${dmId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ouverture impossible.');
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-base">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          onClick={() => navigate('/app/dm')}
          className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-ink md:hidden"
          aria-label="Retour"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5 M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-extrabold">Nouveau message</h1>
        <span className="w-9 md:hidden" />
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <span className="text-sm font-bold text-muted">À :</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher tes amis"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-1 px-4 pt-4">
        <button
          onClick={() => navigate('/app/dm', { state: { createGroup: true } })}
          className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left hover:bg-surface2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-muted"><Users size={20} /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Nouveau groupe</span>
            <span className="block text-xs text-muted">Créer un groupe avec tes amis</span>
          </span>
          <span className="text-muted">›</span>
        </button>
        <button
          onClick={() => navigate('/app/amis')}
          className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left hover:bg-surface2"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-muted"><Plus size={20} /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Ajouter un ami</span>
            <span className="block text-xs text-muted">Trouver quelqu’un par son pseudo</span>
          </span>
          <span className="text-muted">›</span>
        </button>
      </div>

      <p className="px-5 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted">Suggestion</p>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
            {friends.length === 0 ? 'Tu n’as pas encore d’amis.' : 'Aucun ami trouvé.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {filtered.map((f, i) => {
              const st = online[f.profile.id]?.status ?? 'hors_ligne';
              return (
                <button
                  key={f.profile.id}
                  disabled={busy || f.profile.id === me}
                  onClick={() => openDM(f.profile.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2 disabled:opacity-50 ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <Avatar profile={f.profile} size={44} status={st} showStatus />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {f.profile.display_name || f.profile.username}
                    </span>
                    <span className="block truncate text-xs text-muted">@{f.profile.username}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {error && <p className="mt-3 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
