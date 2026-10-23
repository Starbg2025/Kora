import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import type { Profile, UserSettings } from '../lib/types';

interface AuthCtxValue {
  sb: SupabaseClient;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
}

const AuthCtx = createContext<AuthCtxValue | null>(null);

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = requireSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async (uid: string) => {
    const [pRes, sRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('user_settings').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    const p = pRes.data as Profile | null;
    // Compte désactivé : déconnexion immédiate avec message honnête à la connexion
    if (p?.is_disabled) {
      localStorage.setItem('kora-account-disabled', '1');
      await sb.auth.signOut();
      setUser(null);
      setProfile(null);
      setSettings(null);
      return;
    }
    if (p) setProfile(p);
    if (sRes.data) setSettings(sRes.data as UserSettings);
  };

  useEffect(() => {
    let mounted = true;
    sb.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) loadData(u.id).finally(() => mounted && setLoading(false));
      else setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        loadData(u.id);
      } else {
        setProfile(null);
        setSettings(null);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await sb.auth.signOut();
    setUser(null);
    setProfile(null);
    setSettings(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (data) setProfile(data as Profile);
  };

  const refreshSettings = async () => {
    if (!user) return;
    const { data } = await sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (data) setSettings(data as UserSettings);
  };

  const saveSettings = async (patch: Partial<UserSettings>) => {
    if (!user) return;
    const { error } = await sb.from('user_settings').upsert({ user_id: user.id, ...patch });
    if (error) throw error;
    await refreshSettings();
  };

  const updateProfile = async (patch: Partial<Profile>) => {
    if (!user) throw new Error('Non connecté');
    const { error } = await sb.from('profiles').update(patch).eq('id', user.id);
    if (error) throw error;
    await refreshProfile();
  };

  return (
    <AuthCtx.Provider
      value={{ sb, user, profile, settings, loading, signOut, refreshProfile, refreshSettings, saveSettings, updateProfile }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
