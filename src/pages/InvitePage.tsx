import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

interface InviteInfo {
  community_id: string;
  name: string;
  icon_url: string | null;
  description: string;
  member_count: number;
}

/** Page d'invitation publique : /invitation/:code */
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { sb, user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error } = await sb.rpc('get_invite_info', { p_code: code ?? '' });
      if (!alive) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setError('Cette invitation est invalide, expirée ou épuisée.');
        setInfo(null);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as InviteInfo;
        setInfo(row);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, code]);

  const join = async () => {
    if (!info) return;
    setJoining(true);
    setError('');
    try {
      const { data, error } = await sb.rpc('join_community_via_invite', { p_code: code ?? '' });
      if (error) throw error;
      navigate(`/app/c/${data as string}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-base px-4 py-8 text-ink">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <Logo size={48} />
        </div>
        {loading ? (
          <p className="text-sm text-muted">Vérification de l’invitation…</p>
        ) : error ? (
          <>
            <h1 className="text-xl font-extrabold">Invitation introuvable</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Retour à l’accueil
            </Link>
          </>
        ) : (
          info && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invitation à rejoindre</p>
              <div className="mt-3 flex flex-col items-center gap-2">
                {info.icon_url ? (
                  <img src={info.icon_url} alt={info.name} className="h-20 w-20 rounded-3xl object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/20 text-4xl font-extrabold text-primary">
                    {info.name.trim()[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <h1 className="text-2xl font-extrabold">{info.name}</h1>
                {info.description && <p className="text-sm text-muted">{info.description}</p>}
                <p className="text-xs text-muted">
                  {info.member_count} membre{info.member_count > 1 ? 's' : ''}
                </p>
              </div>
              {user ? (
                <button
                  onClick={join}
                  disabled={joining}
                  className="mt-6 w-full rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {joining ? 'Adhésion…' : 'Rejoindre la communauté'}
                </button>
              ) : (
                <>
                  <p className="mt-4 text-sm text-muted">Connecte-toi ou crée un compte pour rejoindre.</p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/connexion?retour=${encodeURIComponent(`/invitation/${code}`)}`}
                      className="flex-1 rounded-xl bg-surface2 px-4 py-2.5 text-center text-sm font-bold hover:bg-line"
                    >
                      Se connecter
                    </Link>
                    <Link
                      to={`/inscription?retour=${encodeURIComponent(`/invitation/${code}`)}`}
                      className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-bold text-white hover:opacity-90"
                    >
                      Créer un compte
                    </Link>
                  </div>
                </>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
