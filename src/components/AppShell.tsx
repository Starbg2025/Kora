import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import ServerRail from './ServerRail';

/** Coquille de l'application : rail des serveurs (bureau) + contenu. */
export default function AppShell() {
  const location = useLocation();
  // Sur mobile, la barre du bas disparaît dans une conversation, un salon ou le flux « nouveau message »
  const hideBottomNav = /^\/app\/dm\/.+/.test(location.pathname) || /^\/app\/c\/[^/]+\/[^/]+/.test(location.pathname);

  return (
    <div className="flex h-dvh overflow-hidden bg-base text-ink">
      <ServerRail />
      <main className={`min-w-0 flex-1 ${hideBottomNav ? '' : 'pb-[68px] md:pb-0'}`}>
        <Outlet />
      </main>
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}
