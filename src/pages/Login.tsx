import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';

type Step = 'login' | 'mfa';

export default function Login() {
  const { sb } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('login');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [disabledNotice, setDisabledNotice] = useState('');

  useEffect(() => {
    if (localStorage.getItem('kora-account-disabled') === '1') {
      localStorage.removeItem('kora-account-disabled');
      setDisabledNotice('Ce compte a été désactivé. Pour le réactiver ou le supprimer définitivement, contacte l’assistance via la page Contact.');
    }
  }, []);
  const [code, setCode] = useState('');

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      // La double authentification est-elle requise ?
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors, error: fErr } = await sb.auth.mfa.listFactors();
        if (fErr) throw fErr;
        const totp = factors?.totp?.find((f) => f.status === 'verified') ?? factors?.totp?.[0];
        if (totp) {
          const { data: ch, error: cErr } = await sb.auth.mfa.challenge({ factorId: totp.id });
          if (cErr) throw cErr;
          setFactorId(totp.id);
          setChallengeId(ch.id);
          setStep('mfa');
          return;
        }
      }
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connexion impossible.';
      if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed')) {
        setError('Ton adresse courriel n’est pas encore vérifiée. Vérifie ta boîte de réception puis réessaie.');
      } else if (msg.toLowerCase().includes('invalid login credentials')) {
        setError('Courriel ou mot de passe incorrect.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: vErr } = await sb.auth.mfa.verify({ factorId, challengeId, code: code.trim() });
      if (vErr) throw vErr;
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-extrabold">Kora</span>
        </Link>
        <div className="rounded-3xl bg-surface p-8 shadow-xl">
          {step === 'login' ? (
            <>
              <h1 className="text-2xl font-extrabold">Bon retour !</h1>
              <p className="mt-1 text-sm text-muted">Connecte-toi pour retrouver tes conversations.</p>
              <form onSubmit={submitLogin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium">Adresse courriel</label>
                  <input
                    id="email" type="email" required autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-ink outline-none focus:border-primary"
                    placeholder="toi@exemple.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium">Mot de passe</label>
                  <input
                    id="password" type="password" required autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-ink outline-none focus:border-primary"
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
                {disabledNotice && <p className="rounded-xl bg-surface2 px-4 py-3 text-sm">{disabledNotice}</p>}
                <button
                  type="submit" disabled={busy}
                  className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-muted">
                Pas encore de compte ?{' '}
                <Link to="/inscription" className="font-semibold text-primary hover:underline">Créer un compte</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold">Vérification en 2 étapes</h1>
              <p className="mt-1 text-sm text-muted">Entre le code à 6 chiffres de ton application d’authentification.</p>
              <form onSubmit={submitMfa} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="code" className="mb-1 block text-sm font-medium">Code de vérification</label>
                  <input
                    id="code" inputMode="numeric" autoComplete="one-time-code" required
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-ink outline-none focus:border-primary"
                    placeholder="••••••"
                  />
                </div>
                {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
                <button
                  type="submit" disabled={busy || code.length !== 6}
                  className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Vérification…' : 'Vérifier'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
