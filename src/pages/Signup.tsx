import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { isValidUsername } from '../lib/format';

export default function Signup() {
  const { sb, user, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const checkUsername = async () => {
    const u = username.trim();
    if (!isValidUsername(u)) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    try {
      const { data, error: rpcError } = await sb.rpc('username_available', { p_username: u });
      if (rpcError) throw rpcError;
      setAvailable(data === true);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const u = username.trim();
    if (!isValidUsername(u)) {
      setError('Le nom d’utilisateur doit contenir 3 à 32 caractères (lettres, chiffres, . _ -).');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      const { data, error: signUpError } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: u, display_name: displayName.trim() || u },
          emailRedirectTo: `${window.location.origin}/verifier-email`,
        },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Inscription impossible, réessaie.');
      navigate(`/verifier-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Inscription impossible.';
      setError(
        msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')
          ? 'Cette adresse courriel est déjà utilisée.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-ink outline-none focus:border-primary';

  // Déjà connecté : ne jamais afficher le formulaire d'inscription.
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-extrabold">Kora</span>
        </Link>
        <div className="rounded-xl bg-surface p-8 shadow-xl">
          <h1 className="text-2xl font-extrabold">Créer un compte</h1>
          <p className="mt-1 text-sm text-muted">Gratuit, en moins d’une minute.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium">
                Nom d’utilisateur <span className="text-muted">(unique, sans espaces)</span>
              </label>
              <input
                id="username" required value={username}
                onChange={(e) => { setUsername(e.target.value); setAvailable(null); }}
                onBlur={checkUsername}
                className={inputCls} placeholder="ex. : marie_dupont" autoComplete="username"
              />
              <p className="mt-1 h-5 text-xs">
                {checking && <span className="text-muted">Vérification…</span>}
                {!checking && available === true && <span className="text-success">Ce nom d’utilisateur est disponible.</span>}
                {!checking && available === false && <span className="text-danger">Ce nom d’utilisateur est déjà pris.</span>}
              </p>
            </div>
            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
                Nom d’affichage <span className="text-muted">(optionnel)</span>
              </label>
              <input
                id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls} placeholder="ex. : Marie" autoComplete="nickname"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">Adresse courriel</label>
              <input
                id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputCls} placeholder="toi@exemple.com" autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">Mot de passe</label>
              <input
                id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputCls} placeholder="8 caractères minimum" autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1 block text-sm font-medium">Confirmer le mot de passe</label>
              <input
                id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className={inputCls} placeholder="Répète ton mot de passe" autoComplete="new-password"
              />
            </div>
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            Déjà inscrit ?{' '}
            <Link to="/connexion" className="font-semibold text-primary hover:underline">Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
