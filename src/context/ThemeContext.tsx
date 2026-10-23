import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type ThemeChoice = 'clair' | 'sombre' | 'systeme';
export type DensityChoice = 'confortable' | 'compacte';
export type TextSizeChoice = 'petit' | 'normal' | 'grand';

export const ACCENT_COLORS = ['#7C3AED', '#3B82F6', '#0EA5E9', '#14B8A6', '#22C55E', '#F59E0B', '#EC4899', '#EF4444'];

interface ThemeCtxValue {
  theme: ThemeChoice;
  resolved: 'clair' | 'sombre';
  density: DensityChoice;
  accentColor: string;
  textSize: TextSizeChoice;
  reduceMotion: boolean;
  setTheme: (t: ThemeChoice) => void;
  setDensity: (d: DensityChoice) => void;
  setAccentColor: (c: string) => void;
  setTextSize: (s: TextSizeChoice) => void;
  setReduceMotion: (v: boolean) => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  theme: 'systeme',
  resolved: 'sombre',
  density: 'confortable',
  accentColor: '#7C3AED',
  textSize: 'normal',
  reduceMotion: false,
  setTheme: () => {},
  setDensity: () => {},
  setAccentColor: () => {},
  setTextSize: () => {},
  setReduceMotion: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

function systemTheme(): 'clair' | 'sombre' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'clair' : 'sombre';
}

function hexToRgb(c: string): string | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(c.trim());
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `${r} ${g} ${b}`;
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
  const [accentColor, setAccentColorState] = useState<string>(() => localStorage.getItem('kora-accent') || '#7C3AED');
  const [textSize, setTextSizeState] = useState<TextSizeChoice>(() => {
    const saved = localStorage.getItem('kora-text-size');
    return saved === 'petit' || saved === 'grand' ? saved : 'normal';
  });
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => localStorage.getItem('kora-reduce-motion') === '1');
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
      if (settings.accent_color) {
        setAccentColorState(settings.accent_color);
        localStorage.setItem('kora-accent', settings.accent_color);
      }
      setTextSizeState(settings.text_size ?? 'normal');
      localStorage.setItem('kora-text-size', settings.text_size ?? 'normal');
      setReduceMotionState(!!settings.reduce_motion);
      localStorage.setItem('kora-reduce-motion', settings.reduce_motion ? '1' : '0');
    }
  }, [settings?.theme, settings?.density, settings?.accent_color, settings?.text_size, settings?.reduce_motion]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Applique la couleur d'accent, la taille du texte et la réduction des animations
  useEffect(() => {
    const rgb = hexToRgb(accentColor);
    if (rgb) document.documentElement.style.setProperty('--c-primary', rgb);
    else document.documentElement.style.removeProperty('--c-primary');
    document.documentElement.style.fontSize = textSize === 'petit' ? '14px' : textSize === 'grand' ? '18px' : '';
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full';
  }, [accentColor, textSize, reduceMotion]);

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

  const setAccentColor = (c: string) => {
    setAccentColorState(c);
    localStorage.setItem('kora-accent', c);
    if (user) saveSettings({ accent_color: c }).catch(() => {});
  };

  const setTextSize = (s: TextSizeChoice) => {
    setTextSizeState(s);
    localStorage.setItem('kora-text-size', s);
    if (user) saveSettings({ text_size: s }).catch(() => {});
  };

  const setReduceMotion = (v: boolean) => {
    setReduceMotionState(v);
    localStorage.setItem('kora-reduce-motion', v ? '1' : '0');
    if (user) saveSettings({ reduce_motion: v }).catch(() => {});
  };

  return (
    <ThemeCtx.Provider
      value={{ theme, resolved, density, accentColor, textSize, reduceMotion, setTheme, setDensity, setAccentColor, setTextSize, setReduceMotion }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}
