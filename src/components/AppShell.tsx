import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BottomNav from './BottomNav';
import ServerRail from './ServerRail';
import GlobalSearch from './GlobalSearch';

/** Coquille de l'application : rail des serveurs (bureau) + contenu. */
export default function AppShell() {
  const location = useLocation();
  const { sb } = useAuth();
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Sur mobile, la barre du bas disparaît dans une conversation, un salon ou le flux « nouveau message »
  const hideBottomNav = /^\/app\/dm\/.+/.test(location.pathname) || /^\/app\/c\/[^/]+\/[^/]+/.test(location.pathname);

  // Annonce du site (si la migration 20261025_site_admin.sql est exécutée).
  useEffect(() => {
    sb.from('site_announcements')
      .select('text')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAnnouncement((data as { text: string }).text);
      }, () => {});
  }, [sb]);

  return (
    <div className="flex h-dvh overflow-hidden bg-base text-ink">
      <ServerRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {announcement && !dismissed && (
          <div className="flex shrink-0 items-center gap-3 bg-primary/15 px-4 py-2.5 text-sm">
            <span className="shrink-0 font-bold text-primary">Annonce</span>
            <p className="min-w-0 flex-1 truncate">{announcement}</p>
            <button onClick={() => setDismissed(true)} className="shrink-0 text-muted hover:text-ink" aria-label="Fermer l’annonce">
              ✕
            </button>
          </div>
        )}
        <main className={`min-h-0 min-w-0 flex-1 ${hideBottomNav ? '' : 'pb-[68px] md:pb-0'}`}>
          <Outlet />
        </main>
      </div>
      {!hideBottomNav && <BottomNav />}
      <GlobalSearch />
    </div>
  );
}
