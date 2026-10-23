import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PresenceProvider } from './context/PresenceContext';
import { isSupabaseConfigured } from './lib/supabase';
import RequireAuth from './components/RequireAuth';
import AppShell from './components/AppShell';
import Logo from './components/Logo';
import Landing from './pages/Landing';
import { Confidentialite, Conditions, Contact, Regles } from './pages/Legal';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import DMs, { EmptyDM } from './pages/DMs';
import NewMessage from './pages/NewMessage';
import Conversation from './components/Conversation';
import Friends from './pages/Friends';
import Settings from './pages/Settings';
import Communities from './pages/Communities';
import Discover from './pages/Discover';
import Community from './pages/Community';
import ChannelRoute from './pages/ChannelRoute';
import InvitePage from './pages/InvitePage';

/** Écran affiché quand Supabase n'est pas configuré : honnête, sans mode démo. */
function ConfigRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4 text-ink">
      <div className="w-full max-w-lg rounded-3xl bg-surface p-8 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <Logo size={40} />
          <h1 className="text-xl font-extrabold">Kora — configuration requise</h1>
        </div>
        <p className="text-sm text-muted">
          Kora a besoin d’un projet Supabase pour fonctionner (comptes, messages en temps réel, stockage).
          Aucune donnée de démonstration ne sera affichée : tout ce que tu vois dans Kora est réel.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Crée un projet gratuit sur <span className="font-semibold text-ink">supabase.com</span>.</li>
          <li>
            Dans l’éditeur SQL du projet, exécute le fichier{' '}
            <code className="rounded bg-surface2 px-1 font-mono text-xs">supabase/migrations/20261023_phase1.sql</code>.
          </li>
          <li>
            Crée un fichier <code className="rounded bg-surface2 px-1 font-mono text-xs">.env</code> à la racine avec :
            <pre className="mt-2 overflow-x-auto rounded-xl bg-surface2 p-3 font-mono text-xs text-ink">
              VITE_SUPABASE_URL=https://ton-projet.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=ta-cle-anon
            </pre>
          </li>
          <li>Relance <code className="rounded bg-surface2 px-1 font-mono text-xs">npm run dev</code>.</li>
        </ol>
        <p className="mt-4 text-xs text-muted">
          Détails complets dans le <code className="rounded bg-surface2 px-1 font-mono">README.md</code>.
        </p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base text-ink">
      <Logo size={56} />
      <h1 className="text-2xl font-extrabold">Page introuvable</h1>
      <p className="text-sm text-muted">Cette page n’existe pas ou a été déplacée.</p>
      <Link to="/" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90">
        Retour à l’accueil
      </Link>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigRequired />;

  return (
    <AuthProvider>
      <ThemeProvider>
        <PresenceProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="/conditions" element={<Conditions />} />
            <Route path="/regles" element={<Regles />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/connexion" element={<Login />} />
            <Route path="/inscription" element={<Signup />} />
            <Route path="/verifier-email" element={<VerifyEmail />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/app/dm" replace />} />
              <Route path="dm" element={<DMs />}>
                <Route index element={<EmptyDM />} />
                <Route path="nouveau" element={<NewMessage />} />
                <Route path=":dmId" element={<Conversation />} />
              </Route>
              <Route path="amis" element={<Friends />} />
              <Route path="parametres" element={<Settings />} />
              <Route path="communautes" element={<Communities />} />
              <Route path="decouvrir" element={<Discover />} />
              <Route path="c/:communityId" element={<Community />}>
                <Route path=":channelId" element={<ChannelRoute />} />
              </Route>
            </Route>
            <Route path="/invitation/:code" element={<InvitePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PresenceProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
