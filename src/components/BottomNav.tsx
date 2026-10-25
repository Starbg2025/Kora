import { NavLink } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePresence } from '../context/PresenceContext';
import { useNotifications } from '../context/NotificationsContext';
import Avatar from './Avatar';

const chatIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const friendsIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const communitiesIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const bellIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** Barre de navigation inférieure (mobile uniquement), façon application mobile. */
export default function BottomNav() {
  const { profile } = useAuth();
  const { online } = usePresence();
  const { unreadCount } = useNotifications();
  const myPresence = profile ? online[profile.id]?.status ?? profile.status : 'hors_ligne';

  const item = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2 text-[9px] font-semibold ${
      active ? 'text-primary' : 'text-muted'
    }`;
  const label = 'max-w-full truncate';
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navigation mobile"
    >
      <NavLink to="/app/dm" className={({ isActive }) => item(isActive)} aria-label="Discussions">
        {chatIcon}
        <span className={label}>Discussions</span>
      </NavLink>
      <NavLink to="/app/amis" className={({ isActive }) => item(isActive)} aria-label="Amis">
        {friendsIcon}
        <span className={label}>Amis</span>
      </NavLink>
      <NavLink to="/app/communautes" className={({ isActive }) => item(isActive)} aria-label="Communautés">
        {communitiesIcon}
        <span className={label}>Communautés</span>
      </NavLink>
      <NavLink to="/app/shorts" className={({ isActive }) => item(isActive)} aria-label="Shorts">
        <Clapperboard size={24} />
        <span className={label}>Shorts</span>
      </NavLink>
      <NavLink to="/app/notifications" className={({ isActive }) => item(isActive)} aria-label="Notifications">
        <span className="relative">
          {bellIcon}
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <span className={label}>Notifs</span>
      </NavLink>
      <NavLink
        to="/app/parametres?onglet=profil"
        className={({ isActive }) => item(isActive)}
        aria-label="Mon profil"
      >
        <Avatar profile={profile} size={24} status={myPresence} showStatus />
        <span className={label}>Profil</span>
      </NavLink>
    </nav>
  );
}
