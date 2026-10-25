import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const { sb, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.email_confirmed_at) navigate('/app', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email_confirmed_at) navigate('/app', { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, navigate]);

  const resend = async () => {
    if (!email) {
      setMessage('Renseigne ton adresse courriel sur la page d’inscription puis reviens ici.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/verifier-email` },
      });
      if (error) throw error;
      setMessage('Email renvoyé. Vérifie ta boîte de réception (et tes indésirables).');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Envoi impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-extrabold">Kora</span>
        </Link>
        <div className="rounded-xl bg-surface p-8 shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold">Vérifie ton adresse courriel</h1>
          <p className="mt-2 text-sm text-muted">
            {email ? (
              <>Nous avons envoyé un lien de vérification à <strong className="text-ink">{email}</strong>. Clique dessus pour activer ton compte.</>
            ) : (
              <>Un lien de vérification t’a été envoyé par courriel. Clique dessus pour activer ton compte.</>
            )}
          </p>
          {message && <p className="mt-4 rounded-xl bg-surface2 px-4 py-3 text-sm text-ink">{message}</p>}
          <button
            onClick={resend} disabled={busy}
            className="mt-6 w-full rounded-xl bg-surface2 px-4 py-3 font-semibold text-ink hover:bg-line disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Renvoyer l’email'}
          </button>
          <p className="mt-6 text-sm text-muted">
            <Link to="/connexion" className="font-semibold text-primary hover:underline">Retour à la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
