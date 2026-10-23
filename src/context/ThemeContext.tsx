import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type ThemeChoice = 'clair' | 'sombre' | 'systeme';
export type DensityChoice = 'confortable' | 'compacte';

interface ThemeCtxValue {
  theme: ThemeChoice;
  resolved: 'clair' | 'sombre';
  density: DensityChoice;
  setTheme: (t: ThemeChoice) => void;
  setDensity: (d: DensityChoice) => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  theme: 'systeme',
  resolved: 'sombre',
  density: 'confortable',
  setTheme: () => {},
  setDensity: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

function systemTheme(): 'clair' | 'sombre' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, settings, saveSettings } = useAuth();
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem('kora-theme');
    return saved === 'clair' || saved === 'sombre' || saved === 'systeme' ? saved : 'systeme';
  });
  const [density, setDensityState] = useState<DensityChoice>(() => {
    const saved = localStorage.getItem('kora-density');
    return saved === 'compacte' ? 'compacte' : 'confortable';
  });
  const [resolved, setResolved] = useState<'clair' | 'sombre'>(() => {
    const t = localStorage.getItem('kora-theme');
    if (t === 'clair') return 'clair';
    if (t === 'sombre') return 'sombre';
    return systemTheme();
  });

  // Synchronise depuis les réglages du compte quand ils arrivent
  useEffect(() => {
    if (settings) {
      setThemeState(settings.theme);
      setDensityState(settings.density);
      localStorage.setItem('kora-theme', settings.theme);
      localStorage.setItem('kora-density', settings.density);
    }
  }, [settings?.theme, settings?.density]); // eslint-disable-line react-hooks/exhaustive-deps

  // Applique le thème + écoute le changement système
  useEffect(() => {
    const apply = () => {
      const r = theme === 'systeme' ? systemTheme() : theme;
      setResolved(r);
      document.documentElement.dataset.theme = r;
      document.documentElement.classList.toggle('dark', r === 'sombre');
      document.documentElement.dataset.density = density;
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => theme === 'systeme' && apply();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, density]);

  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    localStorage.setItem('kora-theme', t);
    if (user) saveSettings({ theme: t }).catch(() => {});
  };

  const setDensity = (d: DensityChoice) => {
    setDensityState(d);
    localStorage.setItem('kora-density', d);
    if (user) saveSettings({ density: d }).catch(() => {});
  };

  return <ThemeCtx.Provider value={{ theme, resolved, density, setTheme, setDensity }}>{children}</ThemeCtx.Provider>;
}
