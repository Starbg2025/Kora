import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import Logo from './Logo';
import Avatar from './Avatar';
import BottomNav from './BottomNav';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';

function NavItem({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
          isActive ? 'bg-primary text-white' : 'bg-surface2 text-muted hover:bg-line hover:text-ink'
        }`
      }
    >
      {icon}
    </NavLink>
  );
}

const ICONS = {
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  friends: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

/** Coquille de l'application : rail de navigation + contenu. */
export default function AppShell() {
  const { profile } = useAuth();
  const { online } = usePresence();
  const navigate = useNavigate();
  const location = useLocation();
  const myPresence = profile ? online[profile.id]?.status ?? profile.status : 'hors_ligne';
  // Sur mobile, la barre du bas disparaît dans une conversation ou le flux « nouveau message »
  const hideBottomNav = /^\/app\/dm\/.+/.test(location.pathname);

  return (
    <div className="flex h-dvh overflow-hidden bg-base text-ink">
      <nav className="hidden w-[72px] shrink-0 flex-col items-center gap-3 bg-surface py-3 md:flex" aria-label="Navigation principale">
        <button onClick={() => navigate('/')} title="Kora — accueil" aria-label="Kora — accueil">
          <Logo size={48} />
        </button>
        <div className="h-px w-8 bg-line" />
        <NavItem to="/app/dm" label="Messages privés" icon={ICONS.chat} />
        <NavItem to="/app/amis" label="Amis" icon={ICONS.friends} />
        <div className="flex-1" />
        <NavItem to="/app/parametres" label="Paramètres" icon={ICONS.settings} />
        <button
          onClick={() => navigate('/app/parametres?onglet=profil')}
          title="Mon profil"
          aria-label="Mon profil"
          className="mt-1"
        >
          <Avatar profile={profile} size={44} status={myPresence} showStatus />
        </button>
      </nav>
      <main className={`min-w-0 flex-1 ${hideBottomNav ? '' : 'pb-[68px] md:pb-0'}`}>
        <Outlet />
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
