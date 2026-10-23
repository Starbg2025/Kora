import { Link } from 'react-router-dom';
import Logo from '../components/Logo';

const FEATURES = [
  {
    title: 'Messages en temps réel',
    text: 'Tes conversations s’affichent instantanément, sans recharger la page. Tu vois aussi quand l’autre est en train d’écrire.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    title: 'Amis, simplement',
    text: 'Ajoute des amis par nom d’utilisateur, accepte ou refuse les demandes, bloque qui tu veux. Tes contacts, tes règles.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Groupes jusqu’à 10',
    text: 'Crée un groupe de discussion avec tes amis, nomme-le, ajoute ou retire des membres. Parfait pour organiser une soirée.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    title: 'Pièces jointes',
    text: 'Partage photos, vidéos et documents directement dans la conversation. Tes fichiers restent privés, entre membres.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    ),
  },
  {
    title: 'Profils à ton image',
    text: 'Pseudo unique, nom d’affichage, avatar, biographie et statut personnalisé. Présente-toi comme tu veux.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: 'Présence en direct',
    text: 'Vois qui est en ligne, occupé ou invisible. Ton statut t’appartient et se change en un clic.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Clair ou sombre',
    text: 'Trois ambiances — clair, sombre, ou synchronisé avec ton appareil — et deux densités d’affichage. Kora s’adapte à toi.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    ),
  },
  {
    title: 'Double authentification',
    text: 'Protège ton compte avec la vérification en deux étapes (TOTP). La sécurité n’est pas une option payante.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

const ROADMAP = [
  { title: 'Serveurs & salons', text: 'Des espaces communautaires avec salons texte, rôles et permissions.' },
  { title: 'Appels audio & vidéo', text: 'Des salons vocaux persistants et des appels en un clic.' },
  { title: 'Forum & scène', text: 'Des discussions organisées par sujet et des événements audio.' },
  { title: 'Kora Plus', text: 'Une offre premium honnête : plus d’espace, plus de personnalisation.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={40} />
          <span className="text-xl font-extrabold tracking-tight">Kora</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#fonctionnalites" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">
            Fonctionnalités
          </a>
          <a href="#feuille-de-route" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:block">
            Feuille de route
          </a>
          <Link to="/connexion" className="rounded-lg px-4 py-2 font-medium text-muted hover:text-ink">
            Se connecter
          </Link>
          <Link to="/inscription" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:opacity-90">
            Créer un compte
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <p className="mb-5 inline-block rounded-full bg-surface2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            Phase 1 — messages privés
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Rassemble ta communauté. <span className="text-primary">Parle, joue, crée.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Kora commence par l’essentiel : des conversations privées instantanées avec tes amis.
            Ici, pas de faux membres ni de faux messages — tout ce que tu vois est réel.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/inscription"
              className="w-full rounded-2xl bg-primary px-8 py-4 text-lg font-bold text-white shadow-lg hover:opacity-90 sm:w-auto"
            >
              Créer un compte gratuit
            </Link>
            <Link
              to="/connexion"
              className="w-full rounded-2xl bg-surface2 px-8 py-4 text-lg font-semibold text-ink hover:bg-line sm:w-auto"
            >
              J’ai déjà un compte
            </Link>
          </div>
        </section>

        <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Ce que Kora sait déjà faire</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
            Chaque fonction ci-dessous existe vraiment et fonctionne aujourd’hui. Rien n’est simulé.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl bg-surface p-6">
                <div className="mb-4 inline-flex rounded-xl bg-primary/15 p-3 text-primary">{f.icon}</div>
                <h3 className="mb-2 font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="feuille-de-route" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Feuille de route</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
            <span className="font-semibold text-accent">À venir</span> — ces fonctions ne sont pas encore
            disponibles. On préfère te le dire franchement plutôt que de les afficher comme si elles existaient.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROADMAP.map((r) => (
              <div key={r.title} className="rounded-2xl border border-dashed border-line bg-surface/50 p-6">
                <p className="mb-2 inline-block rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-muted">
                  À venir
                </p>
                <h3 className="mb-2 font-bold">{r.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{r.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div>
              <p className="font-bold">Kora</p>
              <p className="text-xs text-muted">© 2026 Kora — Tous droits réservés</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            <Link to="/confidentialite" className="hover:text-ink">Confidentialité</Link>
            <Link to="/conditions" className="hover:text-ink">Conditions d’utilisation</Link>
            <Link to="/regles" className="hover:text-ink">Règles de la communauté</Link>
            <Link to="/contact" className="hover:text-ink">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
