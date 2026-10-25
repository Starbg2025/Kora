import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Accessibility, Bell, Code2, Info, Keyboard, Lock, LogOut, Mic, Palette, Shield, SquarePen, User, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useFriends } from '../hooks/useFriends';
import { useTheme, ACCENT_COLORS, type DensityChoice, type TextSizeChoice, type ThemeChoice } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { isValidUsername } from '../lib/format';
import { normalizeSocialLink } from '../lib/privacy';
import { AVATAR_FRAMES, PROFILE_THEMES, parseProfileTheme } from '../lib/frames';
import { isDevMode, setDevMode, useServerColors, setUseServerColors } from '../lib/devMode';
import { STATUS_LABELS, type DM, type PresenceStatus, type UserSettings } from '../lib/types';

type TabId = 'compte' | 'profil' | 'apparence' | 'notifications' | 'confidentialite' | 'securite' | 'amis' | 'audio' | 'accessibilite' | 'raccourcis' | 'avance' | 'apropos';

const TABS: { id: TabId; label: string }[] = [
  { id: 'compte', label: 'Compte' },
  { id: 'profil', label: 'Profil' },
  { id: 'apparence', label: 'Apparence' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'amis', label: 'Amis et demandes' },
  { id: 'audio', label: 'Audio et vidéo' },
  { id: 'accessibilite', label: 'Accessibilité' },
  { id: 'raccourcis', label: 'Raccourcis' },
  { id: 'avance', label: 'Avancé' },
  { id: 'apropos', label: 'À propos' },
];

const TAB_ICONS: Record<TabId, LucideIcon> = {
  compte: User,
  profil: SquarePen,
  apparence: Palette,
  notifications: Bell,
  confidentialite: Lock,
  securite: Shield,
  amis: Users,
  audio: Mic,
  accessibilite: Accessibility,
  raccourcis: Keyboard,
  avance: Code2,
  apropos: Info,
};

const inputCls =
  'w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-ink outline-none focus:border-primary';

/* ------------------------------------------------------------------ */
/* Onglet Compte                                                       */
/* ------------------------------------------------------------------ */
function AccountTab() {
  const { sb, user, updateProfile, signOut } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionInfo, setSessionInfo] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [standing, setStanding] = useState<string | null>(null);
  const [standingDetail, setStandingDetail] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState('');

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s) return;
      const created = s.user.created_at ? new Date(s.user.created_at).toLocaleDateString('fr-FR') : '—';
      setSessionInfo(`Appareil actuel — compte créé le ${created}.`);
    });
  }, [sb]);

  // État réel du compte : sanctions actives issues des tables de modération.
  // Si ces tables n'existent pas encore (migration en attente), on le dit.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [bans, timeouts] = await Promise.all([
          sb.from('server_bans').select('community_id, reason, expires_at').eq('user_id', user.id),
          sb.from('server_timeouts').select('community_id, reason, expires_at').eq('user_id', user.id).gt('expires_at', new Date().toISOString()),
        ]);
        if (!alive) return;
        if (bans.error || timeouts.error) {
          setStanding('Modération non activée');
          setStandingDetail('Les tables de modération ne sont pas encore installées (migration SQL en attente) : aucune sanction ne peut être affichée.');
          return;
        }
        const activeBans = (bans.data ?? []).filter((b: { expires_at: string | null }) => !b.expires_at || new Date(b.expires_at).getTime() > Date.now());
        const activeTimeouts = timeouts.data ?? [];
        if (activeBans.length === 0 && activeTimeouts.length === 0) {
          setStanding('En règle');
          setStandingDetail('Aucun bannissement ni timeout actif sur tes communautés.');
        } else {
          setStanding('Sanctions actives');
          const parts: string[] = [];
          if (activeBans.length > 0) parts.push(`${activeBans.length} bannissement(s)`);
          if (activeTimeouts.length > 0) parts.push(`${activeTimeouts.length} timeout(s) en cours`);
          setStandingDetail(parts.join(' · ') + '. Détail visible dans le panneau Modération de chaque communauté.');
        }
      } catch {
        if (alive) {
          setStanding('Modération non activée');
          setStandingDetail('Impossible de lire les sanctions pour le moment.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sb, user]);

  // Export JSON : uniquement les données que l'utilisateur peut réellement lire.
  const exportData = async () => {
    if (!user) return;
    setExportBusy(true);
    setExportNotice('');
    try {
      const [profileRes, friendsRes, commsRes, dmMsgsRes, chMsgsRes] = await Promise.all([
        sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        sb.from('friendships').select('*').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        sb.from('community_members').select('community_id, role, joined_at').eq('user_id', user.id),
        sb.from('messages').select('id, dm_id, content, created_at').eq('author_id', user.id).order('created_at', { ascending: false }).limit(5000),
        sb.from('community_messages').select('id, channel_id, content, created_at').eq('author_id', user.id).order('created_at', { ascending: false }).limit(5000),
      ]);
      const payload = {
        exporte_le: new Date().toISOString(),
        profil: profileRes.data ?? null,
        amities: friendsRes.data ?? [],
        communautes: commsRes.data ?? [],
        messages_prives_propres: dmMsgsRes.data ?? [],
        messages_salons_propres: chMsgsRes.data ?? [],
        limite: '5000 messages les plus récents par catégorie (pièces jointes non incluses, fichiers récupérables depuis l’app).',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kora-donnees-${user.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Export téléchargé.');
    } catch (err) {
      setExportNotice(err instanceof Error ? err.message : 'Export impossible.');
    } finally {
      setExportBusy(false);
    }
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { error } = await sb.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      setNotice('Un lien de confirmation a été envoyé à ta nouvelle adresse.');
      setNewEmail('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setNotice('Les mots de passe ne correspondent pas.');
      return;
    }
    if (newPw.length < 8) {
      setNotice('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const { error } = await sb.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNotice('Mot de passe mis à jour.');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  };

  const disableAccount = async () => {
    setBusy(true);
    setNotice('');
    try {
      await updateProfile({ is_disabled: true });
      await signOut();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Désactivation impossible.');
      setBusy(false);
    }
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || !deletePw) return;
    setBusy(true);
    setNotice('');
    try {
      // Re-authentification par mot de passe avant toute action destructive
      const { error: reauth } = await sb.auth.signInWithPassword({ email: user.email, password: deletePw });
      if (reauth) throw new Error('Mot de passe incorrect.');
      await updateProfile({ is_disabled: true });
      await signOut();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Suppression impossible.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-1 font-bold">Adresse courriel</h3>
        <p className="mb-3 text-sm text-muted">Connecté avec <strong className="text-ink">{user?.email}</strong></p>
        <form onSubmit={changeEmail} className="flex gap-2">
          <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Nouvelle adresse courriel" className={inputCls} />
          <button disabled={busy} className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Changer
          </button>
        </form>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Mot de passe</h3>
        <form onSubmit={changePassword} className="space-y-2">
          <input type="password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" className={inputCls} />
          <input type="password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirmer" autoComplete="new-password" className={inputCls} />
          <button disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Mettre à jour le mot de passe
          </button>
        </form>
      </div>
      <div>
        <h3 className="mb-1 font-bold">Sessions</h3>
        <p className="text-sm text-muted">{sessionInfo || 'Chargement…'}</p>
        <p className="mt-2 text-xs text-muted">
          Pour des raisons de sécurité, seul l’appareil actuel est affiché ici. La déconnexion à distance des autres appareils n’est pas encore disponible.
        </p>
      </div>
      <div>
        <h3 className="mb-1 font-bold">État du compte</h3>
        {standing ? (
          <>
            <p className="text-sm font-semibold">{standing}</p>
            <p className="mt-1 text-sm text-muted">{standingDetail}</p>
          </>
        ) : (
          <p className="text-sm text-muted">Chargement…</p>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Mes données</h3>
        <p className="mb-3 text-sm text-muted">
          Télécharge tes données Kora au format JSON : profil, amitiés, communautés et tes 5000 messages les plus récents par catégorie.
        </p>
        <button onClick={exportData} disabled={exportBusy} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-50">
          {exportBusy ? 'Préparation…' : 'Télécharger mes données (JSON)'}
        </button>
        {exportNotice && <p className="mt-2 text-sm text-muted">{exportNotice}</p>}
      </div>
      <div className="rounded-2xl border border-danger/30 p-4">
        <h3 className="mb-1 font-bold text-danger">Zone dangereuse</h3>
        {!confirmDisable && !confirmDelete ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setConfirmDisable(true)} className="rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Désactiver mon compte
            </button>
            <button onClick={() => setConfirmDelete(true)} className="rounded-xl bg-danger/10 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/20">
              Supprimer mon compte
            </button>
          </div>
        ) : confirmDisable ? (
          <div>
            <p className="mb-3 text-sm text-muted">
              Ton compte sera désactivé immédiatement : tu ne pourras plus te connecter. C’est réversible — contacte l’assistance pour le réactiver.
            </p>
            <div className="flex gap-2">
              <button onClick={disableAccount} disabled={busy} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? '…' : 'Confirmer la désactivation'}
              </button>
              <button onClick={() => setConfirmDisable(false)} className="rounded-xl bg-surface2 px-4 py-2 text-sm hover:bg-line">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-muted">
              Entre ton mot de passe pour confirmer. Ton compte sera désactivé immédiatement. La suppression définitive des données se fait côté serveur — après cette étape, contacte l’assistance via la <Link to="/contact" className="text-primary underline">page Contact</Link> pour l’effacement complet.
            </p>
            <form onSubmit={deleteAccount} className="flex gap-2">
              <input
                type="password"
                required
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                placeholder="Ton mot de passe"
                autoComplete="current-password"
                className={inputCls}
              />
              <button disabled={busy} className="shrink-0 rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {busy ? '…' : 'Supprimer'}
              </button>
            </form>
            <button onClick={() => { setConfirmDelete(false); setDeletePw(''); }} className="mt-2 text-xs text-muted hover:text-ink">
              Annuler
            </button>
          </div>
        )}
      </div>
      {notice && <p className="rounded-xl bg-surface2 px-4 py-3 text-sm">{notice}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Profil                                                       */
/* ------------------------------------------------------------------ */
const STATUS_DURATIONS = [
  { id: '15min', label: '15 minutes' },
  { id: '1h', label: '1 heure' },
  { id: '4h', label: '4 heures' },
  { id: '24h', label: '24 heures' },
  { id: 'jamais', label: 'Ne jamais effacer' },
];

function durationToExpires(d: string): string | null {
  if (d === 'jamais') return null;
  const ms = d === '15min' ? 15 * 60000 : d === '1h' ? 3600000 : d === '4h' ? 4 * 3600000 : 24 * 3600000;
  return new Date(Date.now() + ms).toISOString();
}

function ProfileTab() {
  const { sb, user, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [status, setStatus] = useState<PresenceStatus>(profile?.status ?? 'en_ligne');
  const [customStatus, setCustomStatus] = useState(profile?.custom_status ?? '');
  const [duration, setDuration] = useState('jamais');
  const [bannerColor, setBannerColor] = useState(profile?.banner_color ?? '');
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile?.banner_url ?? null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [avatarFrame, setAvatarFrame] = useState(profile?.avatar_frame ?? 'none');
  const [themePreset, setThemePreset] = useState<string>(() => {
    const raw = profile?.profile_theme ?? '';
    if (!raw) return '';
    if (raw.startsWith('custom:')) return 'custom';
    return raw;
  });
  const [themeC1, setThemeC1] = useState(() => parseProfileTheme(profile?.profile_theme)?.c1 ?? '#FF6A00');
  const [themeC2, setThemeC2] = useState(() => parseProfileTheme(profile?.profile_theme)?.c2 ?? '#1C1C2B');
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '');
  const [socialWebsite, setSocialWebsite] = useState((profile?.social_links as Record<string, string> | undefined)?.website ?? '');
  const [socialX, setSocialX] = useState((profile?.social_links as Record<string, string> | undefined)?.x ?? '');
  const [socialYoutube, setSocialYoutube] = useState((profile?.social_links as Record<string, string> | undefined)?.youtube ?? '');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setUsername(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setStatus(profile?.status ?? 'en_ligne');
    setCustomStatus(profile?.custom_status ?? '');
    setBannerColor(profile?.banner_color ?? '');
    setBannerUrl(profile?.banner_url ?? null);
    setAvatarFrame(profile?.avatar_frame ?? 'none');
    const rawTheme = profile?.profile_theme ?? '';
    setThemePreset(!rawTheme ? '' : rawTheme.startsWith('custom:') ? 'custom' : rawTheme);
    const parsed = parseProfileTheme(rawTheme);
    if (parsed) {
      setThemeC1(parsed.c1);
      setThemeC2(parsed.c2);
    }
    setPronouns(profile?.pronouns ?? '');
    const links = (profile?.social_links ?? {}) as Record<string, string>;
    setSocialWebsite(links.website ?? '');
    setSocialX(links.x ?? '');
    setSocialYoutube(links.youtube ?? '');
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAvatar = async (f: File) => {
    if (!user) return;
    if (!f.type.startsWith('image/')) {
      setNotice('Choisis un fichier image.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setNotice('L’image dépasse 5 Mo.');
      return;
    }
    setUploading(true);
    setNotice('');
    try {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('avatars').upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const { data } = sb.storage.from('avatars').getPublicUrl(path);
      // Nettoyage de l'ancien avatar (au mieux)
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/avatars/')[1];
        if (oldPath) await sb.storage.from('avatars').remove([oldPath]).catch(() => {});
      }
      await updateProfile({ avatar_url: data.publicUrl });
      setNotice('Avatar mis à jour.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    await updateProfile({ avatar_url: null });
    setNotice('Avatar supprimé.');
  };

  // Bannière image (GIF animé accepté) : envoyée tout de suite, appliquée à l'enregistrement.
  const uploadBanner = async (f: File) => {
    if (!user) return;
    if (!f.type.startsWith('image/')) {
      setNotice('Choisis un fichier image.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setNotice('L’image dépasse 5 Mo.');
      return;
    }
    setBannerUploading(true);
    setNotice('');
    try {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/banner-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('avatars').upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const { data } = sb.storage.from('avatars').getPublicUrl(path);
      if (profile?.banner_url) {
        const oldPath = profile.banner_url.split('/avatars/')[1];
        if (oldPath) await sb.storage.from('avatars').remove([oldPath]).catch(() => {});
      }
      setBannerUrl(data.publicUrl);
      setNotice('Bannière envoyée — enregistre le profil pour l’appliquer.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBannerUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const u = username.trim();
      if (!isValidUsername(u)) throw new Error('Nom d’utilisateur invalide (3-32 caractères : lettres, chiffres, . _ -).');
      if (u.toLowerCase() !== (profile?.username ?? '').toLowerCase()) {
        const { data: free, error: rpcErr } = await sb.rpc('username_available', { p_username: u });
        if (rpcErr) throw rpcErr;
        if (free !== true) throw new Error('Ce nom d’utilisateur est déjà pris.');
      }
      const links: Record<string, string> = {};
      const website = normalizeSocialLink(socialWebsite);
      const x = normalizeSocialLink(socialX);
      const youtube = normalizeSocialLink(socialYoutube);
      if (socialWebsite.trim() && !website) throw new Error('Lien « Site web » invalide.');
      if (socialX.trim() && !x) throw new Error('Lien « X » invalide.');
      if (socialYoutube.trim() && !youtube) throw new Error('Lien « YouTube » invalide.');
      if (website) links.website = website;
      if (x) links.x = x;
      if (youtube) links.youtube = youtube;
      const profileTheme = themePreset === 'custom' ? `custom:${themeC1}:${themeC2}` : themePreset === '' ? null : themePreset;
      const fullPatch = {
        username: u,
        display_name: displayName.trim(),
        bio: bio.trim().slice(0, 300),
        status,
        custom_status: customStatus.trim().slice(0, 100),
        custom_status_expires_at: customStatus.trim() ? durationToExpires(duration) : null,
        banner_color: bannerColor || null,
        banner_url: bannerUrl,
        social_links: links,
        avatar_frame: avatarFrame,
        profile_theme: profileTheme,
        pronouns: pronouns.trim().slice(0, 30),
      };
      try {
        await updateProfile(fullPatch);
        setNotice('Profil enregistré.');
      } catch (saveErr) {
        // Colonnes absentes tant que les migrations ne sont pas exécutées :
        // on retire les champs fautifs et on enregistre le reste.
        const msg = saveErr instanceof Error ? saveErr.message : '';
        const missing = ['social_links', 'banner_url', 'avatar_frame', 'profile_theme', 'pronouns'].filter((k) =>
          msg.includes(k),
        );
        if (missing.length > 0) {
          const reduced = { ...fullPatch } as Record<string, unknown>;
          for (const k of missing) delete reduced[k];
          await updateProfile(reduced);
          setNotice(`Profil enregistré, sauf : ${missing.join(', ')} (migrations SQL en attente — voir À propos).`);
        } else {
          throw saveErr;
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-xl space-y-5">
      <div className="flex items-center gap-4">
        <Avatar profile={profile} size={72} />
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
            {uploading ? 'Envoi…' : 'Changer l’avatar'}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </label>
          {profile?.avatar_url && (
            <button type="button" onClick={removeAvatar} className="text-left text-xs text-muted hover:text-danger">
              Supprimer l’avatar
            </button>
          )}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">PNG, JPG, WebP ou GIF animé (5 Mo max) — les GIF jouent en animé dans le chat, les listes et les profils.</p>
      <div>
        <span className="mb-2 block text-sm font-medium">Décoration d’avatar</span>
        <div className="flex flex-wrap gap-2">
          {AVATAR_FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAvatarFrame(f.id)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${avatarFrame === f.id ? 'border-primary bg-primary/10' : 'border-line'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Anneaux sobres autour de ton avatar, visibles partout. Créations Kora, gratuites.</p>
      </div>
      <div>
        <label htmlFor="p-username" className="mb-1 block text-sm font-medium">Nom d’utilisateur (unique)</label>
        <input id="p-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
        <p className="mt-1 text-xs text-muted">Après un changement, ton ancien nom reste réservé 7 jours avant de pouvoir être repris par quelqu’un d’autre.</p>
      </div>
      <div>
        <label htmlFor="p-display" className="mb-1 block text-sm font-medium">Nom d’affichage</label>
        <input id="p-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} maxLength={60} />
      </div>
      <div>
        <label htmlFor="p-pronouns" className="mb-1 block text-sm font-medium">Pronoms (optionnel)</label>
        <input id="p-pronouns" value={pronouns} onChange={(e) => setPronouns(e.target.value)} className={inputCls} maxLength={30} placeholder="Ex. : il/lui, elle/elle, iel" />
      </div>
      <div>
        <label htmlFor="p-bio" className="mb-1 block text-sm font-medium">Biographie</label>
        <textarea id="p-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={300} className={inputCls} placeholder="Quelques mots sur toi…" />
        <p className="mt-1 text-right text-xs text-muted">{bio.length}/300</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="p-status" className="mb-1 block text-sm font-medium">Statut de présence</label>
          <select id="p-status" value={status} onChange={(e) => setStatus(e.target.value as PresenceStatus)} className={inputCls}>
            {(Object.keys(STATUS_LABELS) as PresenceStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="p-duration" className="mb-1 block text-sm font-medium">Durée du statut personnalisé</label>
          <select id="p-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls}>
            {STATUS_DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="p-custom" className="mb-1 block text-sm font-medium">Statut personnalisé</label>
        <input id="p-custom" value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} className={inputCls} maxLength={100} placeholder="Ex. : En réunion jusqu’à 15 h" />
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium">Couleur de bannière</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBannerColor('')}
            title="Bannière par défaut"
            className={`h-9 w-9 rounded-full bg-surface2 border border-line ${bannerColor === '' ? 'ring-2 ring-primary ring-offset-2 ring-offset-base' : 'opacity-70 hover:opacity-100'}`}
          />
          {['#7C3AED', '#3B82F6', '#14B8A6', '#22C55E', '#F59E0B', '#EC4899', '#EF4444', '#6B7280'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setBannerColor(c)}
              title={c}
              style={{ backgroundColor: c }}
              className={`h-9 w-9 rounded-full ${bannerColor === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-base' : 'opacity-70 hover:opacity-100'}`}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Gratuit, comme tout sur Kora.</p>
      </div>
      <div>
        <span className="mb-2 block text-sm font-medium">Thème de profil (deux couleurs)</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setThemePreset('')}
            className={`rounded-xl border px-4 py-2 text-sm font-medium ${themePreset === '' ? 'border-primary bg-primary/10' : 'border-line'}`}
          >
            Aucun
          </button>
          {PROFILE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setThemePreset(t.id);
                setThemeC1(t.c1);
                setThemeC2(t.c2);
              }}
              title={t.label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${themePreset === t.id ? 'border-primary bg-primary/10' : 'border-line'}`}
            >
              <span className="flex h-4 w-8 overflow-hidden rounded-full">
                <span className="h-full flex-1" style={{ backgroundColor: t.c1 }} />
                <span className="h-full flex-1" style={{ backgroundColor: t.c2 }} />
              </span>
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setThemePreset('custom')}
            className={`rounded-xl border px-4 py-2 text-sm font-medium ${themePreset === 'custom' ? 'border-primary bg-primary/10' : 'border-line'}`}
          >
            Personnalisé
          </button>
        </div>
        {themePreset === 'custom' && (
          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="color" value={themeC1} onChange={(e) => setThemeC1(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface2 p-1" />
              Bannière
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="color" value={themeC2} onChange={(e) => setThemeC2(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-surface2 p-1" />
              Accent
            </label>
          </div>
        )}
        <p className="mt-1 text-xs text-muted">Appliqué à ta fiche de profil. L’image de bannière, si présente, reste prioritaire.</p>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium">Image de bannière</span>
        {bannerUrl ? (
          <div className="overflow-hidden rounded-2xl border border-line">
            <img src={bannerUrl} alt="Bannière" className="h-28 w-full object-cover" />
          </div>
        ) : (
          <p className="text-xs text-muted">Aucune image : la couleur ci-dessus s’applique.</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
            {bannerUploading ? 'Envoi…' : 'Choisir une image…'}
            <input type="file" accept="image/*" className="hidden" disabled={bannerUploading} onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
          </label>
          {bannerUrl && (
            <button type="button" onClick={() => setBannerUrl(null)} className="text-xs text-muted hover:text-danger">
              Supprimer l’image (la couleur s’appliquera)
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">PNG, JPG, WebP ou GIF animé, 5 Mo max. L’image remplace la couleur ; la couleur reste le repli.</p>
      </div>
      <div className="space-y-2">
        <span className="block text-sm font-medium">Liens sociaux</span>
        <p className="-mt-1 text-xs text-muted">Affichés sur ta fiche de profil. Laisse vide pour ne rien afficher.</p>
        <input value={socialWebsite} onChange={(e) => setSocialWebsite(e.target.value)} placeholder="Site web (ex. monsite.com)" className={inputCls} inputMode="url" />
        <input value={socialX} onChange={(e) => setSocialX(e.target.value)} placeholder="X (ex. x.com/tonpseudo)" className={inputCls} inputMode="url" />
        <input value={socialYoutube} onChange={(e) => setSocialYoutube(e.target.value)} placeholder="YouTube (ex. youtube.com/@tonpseudo)" className={inputCls} inputMode="url" />
      </div>
      <div>
        <span className="mb-2 block text-sm font-medium">Aperçu du profil</span>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div
            className="relative h-20 overflow-hidden"
            style={
              bannerUrl
                ? undefined
                : themePreset !== ''
                  ? { backgroundColor: themeC1 }
                  : { backgroundColor: bannerColor || undefined }
            }
          >
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              !bannerColor && themePreset === '' && <div className="h-full w-full bg-primary/30" />
            )}
            {themePreset !== '' && !bannerUrl && (
              <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ backgroundColor: themeC2 }} />
            )}
          </div>
          <div className="flex items-start gap-3 p-4">
            <Avatar
              profile={{
                ...profile,
                display_name: displayName || profile?.display_name,
                username: username || profile?.username,
                avatar_frame: avatarFrame,
              }}
              size={56}
            />
            <div className="min-w-0">
              <p className="truncate font-bold">{displayName || username || 'Ton nom'}</p>
              <p className="truncate text-xs text-muted">
                @{username || 'tonpseudo'}
                {pronouns ? <span> · {pronouns}</span> : null}
              </p>
              {bio && <p className="mt-1 line-clamp-2 text-sm text-muted">{bio}</p>}
              {customStatus && <p className="mt-1 truncate text-xs text-muted">{customStatus}</p>}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Les vidéos de profil ne sont pas prises en charge sur Kora : seuls les GIF animés jouent en animé (avatar et bannière).
        </p>
      </div>
      {notice && <p className="rounded-xl bg-surface2 px-4 py-3 text-sm">{notice}</p>}
      <button disabled={busy} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Apparence                                                    */
/* ------------------------------------------------------------------ */
function AppearanceTab() {
  const { theme, density, setTheme, setDensity, accentColor, setAccentColor, textSize, setTextSize, reduceMotion, setReduceMotion } = useTheme();
  const { settings, saveSettings } = useAuth();
  const [sqlNotice, setSqlNotice] = useState('');
  const [serverColors, setServerColors] = useState<boolean>(() =>
    settings?.use_server_colors ?? useServerColors(),
  );
  const toggleServerColors = async () => {
    const next = !serverColors;
    setServerColors(next);
    setUseServerColors(next);
    try {
      await saveSettings({ use_server_colors: next });
    } catch {
      /* colonne absente (migration en attente) : le réglage reste local à l'appareil */
    }
  };
  const themes: { id: ThemeChoice; label: string; desc: string }[] = [
    { id: 'clair', label: 'Clair', desc: 'Fond clair, idéal le jour.' },
    { id: 'sombre', label: 'Sombre', desc: 'Fond sombre, doux pour les yeux le soir.' },
    { id: 'systeme', label: 'Système', desc: 'Suit le réglage de ton appareil.' },
  ];
  const densities: { id: DensityChoice; label: string; desc: string }[] = [
    { id: 'confortable', label: 'Confortable', desc: 'Espacements généreux.' },
    { id: 'compacte', label: 'Compacte', desc: 'Plus de messages à l’écran.' },
  ];
  const sizes: { id: TextSizeChoice; label: string; desc: string }[] = [
    { id: 'petit', label: 'Petit', desc: 'Texte plus compact.' },
    { id: 'normal', label: 'Normal', desc: 'Taille par défaut.' },
    { id: 'grand', label: 'Grand', desc: 'Texte plus lisible.' },
  ];

  // Les réglages d'apparence avancés sont stockés en base ; si la migration
  // n'a pas été exécutée, on affiche un message honnête au lieu d'échouer.
  const guardSql = async (fn: () => Promise<void>) => {
    setSqlNotice('');
    try {
      await fn();
      // Vérifie que la sauvegarde a bien persisté en relisant
      await saveSettings({});
    } catch {
      setSqlNotice('Option indisponible pour le moment : recharge la page et réessaie.');
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-3 font-bold">Thème</h3>
        <div className="space-y-2">
          {themes.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${theme === t.id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="theme" checked={theme === t.id} onChange={() => setTheme(t.id)} className="h-4 w-4 accent-primary" />
              <div>
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Couleur d’accent</h3>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((c) => {
            const selected = accentColor.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => guardSql(async () => setAccentColor(c))}
                title={c}
                aria-label={`Accent ${c}`}
                style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                className={`h-10 w-10 rounded-full ${selected ? 'ring-2 ring-offset-2 ring-offset-base' : 'opacity-70 hover:opacity-100'}`}
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Appliquée aux boutons, liens et éléments actifs. Aperçu : <span className="font-bold text-primary">ce texte utilise ta couleur</span>.</p>
      </div>
      <div>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Utiliser les couleurs des serveurs</p>
            <p className="text-xs text-muted">Quand une communauté définit sa propre couleur, elle colore son en-tête et ses éléments actifs. Sinon, ton accent s’applique partout.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={serverColors}
            onClick={toggleServerColors}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${serverColors ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${serverColors ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Taille du texte</h3>
        <div className="space-y-2">
          {sizes.map((s) => (
            <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${textSize === s.id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="textsize" checked={textSize === s.id} onChange={() => guardSql(async () => setTextSize(s.id))} className="h-4 w-4 accent-primary" />
              <div>
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-muted">{s.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Réduire les animations</p>
            <p className="text-xs text-muted">Désactive les transitions et animations de l’interface.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            onClick={() => guardSql(async () => setReduceMotion(!reduceMotion))}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${reduceMotion ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${reduceMotion ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Densité d’affichage</h3>
        <div className="space-y-2">
          {densities.map((d) => (
            <label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${density === d.id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="density" checked={density === d.id} onChange={() => setDensity(d.id)} className="h-4 w-4 accent-primary" />
              <div>
                <p className="text-sm font-semibold">{d.label}</p>
                <p className="text-xs text-muted">{d.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-3 font-bold">Langue</h3>
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-sm font-semibold">Français</p>
          <p className="text-xs text-muted">Seule langue disponible pour le moment.</p>
        </div>
      </div>
      {sqlNotice && <p className="rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">{sqlNotice}</p>}
      {!settings && <p className="text-xs text-muted">Connecte-toi pour synchroniser ces réglages sur tes appareils.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Notifications                                                */
/* ------------------------------------------------------------------ */
const NOTIF_TYPES: { key: keyof Pick<UserSettings, 'notif_messages' | 'notif_mentions' | 'notif_friend_requests' | 'notif_invites' | 'notif_calls'>; label: string; desc: string }[] = [
  { key: 'notif_messages', label: 'Nouveaux messages', desc: 'Notifications pour les messages reçus.' },
  { key: 'notif_mentions', label: 'Mentions', desc: 'Quand quelqu’un te mentionne avec @tonpseudo.' },
  { key: 'notif_friend_requests', label: 'Demandes d’ami', desc: 'Quand tu reçois une demande d’ami.' },
  { key: 'notif_invites', label: 'Invitations et communautés', desc: 'Invitations acceptées et activité des communautés.' },
  { key: 'notif_calls', label: 'Appels', desc: 'Appels entrants (quand les appels seront disponibles).' },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function NotificationsTab() {
  const { sb, settings, saveSettings } = useAuth();
  const { mutedCommunities, toggleCommunityMute, soundEnabled, setSoundEnabled, browserEnabled, setBrowserEnabled } = useNotifications();
  const [names, setNames] = useState<Record<string, string>>({});
  const [communityNames, setCommunityNames] = useState<Record<string, string>>({});
  const [sqlNotice, setSqlNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ids = settings?.dm_mute ?? [];
    if (ids.length === 0) {
      setNames({});
      return;
    }
    sb.from('dms').select('id, name, is_group').in('id', ids).then(({ data }) => {
      const map: Record<string, string> = {};
      for (const d of (data ?? []) as DM[]) map[d.id] = d.is_group ? d.name || 'Groupe sans nom' : 'Conversation privée';
      setNames(map);
    });
  }, [sb, settings?.dm_mute]);

  useEffect(() => {
    const ids = [...mutedCommunities];
    if (ids.length === 0) {
      setCommunityNames({});
      return;
    }
    sb.from('communities').select('id, name').in('id', ids).then(({ data }) => {
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as { id: string; name: string }[]) map[c.id] = c.name;
      setCommunityNames(map);
    });
  }, [sb, mutedCommunities]);

  const unmute = async (id: string) => {
    if (!settings) return;
    await saveSettings({ dm_mute: settings.dm_mute.filter((x) => x !== id) });
  };

  const toggleType = async (key: (typeof NOTIF_TYPES)[number]['key']) => {
    if (!settings || busy) return;
    setBusy(true);
    setSqlNotice('');
    try {
      await saveSettings({ [key]: !settings[key] });
    } catch {
      setSqlNotice('Option indisponible pour le moment : recharge la page et réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const muted = settings?.dm_mute ?? [];
  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-1 font-bold">Types de notifications</h3>
        <p className="mb-4 text-sm text-muted">Choisis ce qui déclenche une notification dans Kora.</p>
        <div className="space-y-2">
          {NOTIF_TYPES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted">{t.desc}</p>
              </div>
              <Toggle on={settings ? !!settings[t.key] : true} onChange={() => toggleType(t.key)} label={t.label} />
            </label>
          ))}
        </div>
        {sqlNotice && <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">{sqlNotice}</p>}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Sons et navigateur</h3>
        <p className="mb-4 text-sm text-muted">Réglages propres à cet appareil (non synchronisés).</p>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Son à l’arrivée d’une notification</p>
              <p className="text-xs text-muted">Petit bip quand une notification apparaît dans Kora.</p>
            </div>
            <Toggle on={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} label="Son des notifications" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifications du navigateur</p>
              <p className="text-xs text-muted">Affiche une notification système quand l’onglet Kora est en arrière-plan (autorisation demandée au navigateur).</p>
            </div>
            <Toggle on={browserEnabled} onChange={() => setBrowserEnabled(!browserEnabled)} label="Notifications du navigateur" />
          </label>
        </div>
      </div>
      <div>
        <h3 className="mb-1 font-bold">Conversations en sourdine</h3>
        <p className="mb-4 text-sm text-muted">
          Tu peux couper les notifications d’une conversation depuis son en-tête (bouton « Notifications »).
        </p>
        {muted.length === 0 ? (
          <p className="rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">Aucune conversation en sourdine.</p>
        ) : (
          <div className="space-y-2">
            {muted.map((id) => (
              <div key={id} className="flex items-center justify-between rounded-xl bg-surface2 px-4 py-2.5">
                <span className="text-sm font-medium">{names[id] ?? 'Conversation'}</span>
                <button onClick={() => unmute(id)} className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-surface">
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Communautés en sourdine</h3>
        <p className="mb-4 text-sm text-muted">
          Les mentions d’une communauté en sourdine ne créent pas de notification. Le réglage se change aussi depuis les paramètres de la communauté.
        </p>
        {mutedCommunities.size === 0 ? (
          <p className="rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">Aucune communauté en sourdine.</p>
        ) : (
          <div className="space-y-2">
            {[...mutedCommunities].map((id) => (
              <div key={id} className="flex items-center justify-between rounded-xl bg-surface2 px-4 py-2.5">
                <span className="text-sm font-medium">{communityNames[id] ?? 'Communauté'}</span>
                <button onClick={() => toggleCommunityMute(id)} className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-surface">
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Confidentialité                                              */
/* ------------------------------------------------------------------ */
function PrivacyTab() {
  const { profile, settings, saveSettings, updateProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const open = settings?.friend_requests_open ?? true;
  const privacyDms = profile?.privacy_dms ?? 'friends';
  const privacyStatus = profile?.privacy_status ?? 'everyone';

  const toggleRequests = async () => {
    setBusy(true);
    try {
      await saveSettings({ friend_requests_open: !open });
    } finally {
      setBusy(false);
    }
  };

  const setPrivacyDms = async (v: 'friends' | 'nobody') => {
    setBusy(true);
    setNotice('');
    try {
      await updateProfile({ privacy_dms: v });
    } catch {
      setNotice('Enregistrement impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const setPrivacyStatus = async (v: 'everyone' | 'friends' | 'nobody') => {
    setBusy(true);
    setNotice('');
    try {
      await updateProfile({ privacy_status: v });
    } catch {
      setNotice('Enregistrement impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-1 font-bold">Demandes d’ami</h3>
        <p className="mb-4 text-sm text-muted">Choisis qui peut t’envoyer une demande d’ami en te cherchant par nom d’utilisateur. Ce réglage est vérifié côté serveur : une demande vers un compte fermé est refusée.</p>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
          <span className="text-sm font-medium">Tout le monde peut m’envoyer une demande</span>
          <button
            type="button"
            role="switch"
            aria-checked={open}
            disabled={busy}
            onClick={toggleRequests}
            className={`relative h-6 w-11 rounded-full transition-colors ${open ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${open ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
        {!open && (
          <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">
            Seules les personnes que tu ajoutes toi-même pourront devenir tes amies.
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Messages privés</h3>
        <p className="mb-4 text-sm text-muted">
          Sur Kora, les messages privés 1:1 exigent déjà d’être amis (vérifié côté serveur). Ce réglage permet en plus de couper
          complètement tes messages privés, même pour tes amis.
        </p>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
          <span className="text-sm font-medium">Autoriser les messages privés de mes amis</span>
          <button
            type="button"
            role="switch"
            aria-checked={privacyDms === 'friends'}
            disabled={busy}
            onClick={() => setPrivacyDms(privacyDms === 'friends' ? 'nobody' : 'friends')}
            className={`relative h-6 w-11 rounded-full transition-colors ${privacyDms === 'friends' ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${privacyDms === 'friends' ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
        {privacyDms === 'nobody' && (
          <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">
            Personne ne peut ouvrir une nouvelle discussion privée avec toi pour le moment.
          </p>
        )}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Statut en ligne</h3>
        <p className="mb-4 text-sm text-muted">Choisis qui voit ton statut de présence (en ligne, inactif, ne pas déranger) dans les listes et les profils.</p>
        <div className="space-y-2">
          {([
            ['everyone', 'Tout le monde', 'Ton statut est visible par tous les membres.'],
            ['friends', 'Amis seulement', 'Seuls tes amis voient ton statut ; les autres te voient hors ligne.'],
            ['nobody', 'Personne', 'Tu apparais hors ligne pour tout le monde (sauf toi).'],
          ] as const).map(([id, label, desc]) => (
            <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${privacyStatus === id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="privacy-status" checked={privacyStatus === id} onChange={() => setPrivacyStatus(id)} className="h-4 w-4 accent-primary" />
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
            </label>
          ))}
        </div>
        {notice && <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">{notice}</p>}
      </div>
      <div>
        <h3 className="mb-1 font-bold">Comptes bloqués</h3>
        <p className="mb-4 text-sm text-muted">Les personnes bloquées ne peuvent plus te contacter ni te voir en ligne.</p>
        <Link
          to="/app/amis?onglet=bloques"
          className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-medium hover:bg-surface2"
        >
          <span>Gérer mes comptes bloqués</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Sécurité (2FA TOTP)                                          */
/* ------------------------------------------------------------------ */
function SecurityTab() {
  const { sb } = useAuth();
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'idle' | 'scan'>('idle');
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const loadFactors = async () => {
    setLoading(true);
    const { data } = await sb.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
    setLoading(false);
  };

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabled = factors.some((f) => f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    setNotice('');
    try {
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Kora' });
      if (error) throw error;
      setQrUri(data.totp.uri);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: data.id });
      if (chErr) throw chErr;
      setChallengeId(ch.id);
      setStep('scan');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Activation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { error } = await sb.auth.mfa.verify({ factorId, challengeId, code: code.trim() });
      if (error) throw error;
      setNotice('Double authentification activée. Conserve tes codes de secours en lieu sûr.');
      setStep('idle');
      setCode('');
      await loadFactors();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    const f = factors.find((x) => x.status === 'verified') ?? factors[0];
    if (!f) return;
    setBusy(true);
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw error;
      setNotice('Double authentification désactivée.');
      setConfirmDisable(false);
      await loadFactors();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Désactivation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h3 className="mb-1 font-bold">Vérification en 2 étapes (TOTP)</h3>
      <p className="mb-4 text-sm text-muted">
        Ajoute une couche de sécurité : à chaque connexion, un code à 6 chiffres généré par ton application
        d’authentification (Google Authenticator, Authy, 1Password…) sera demandé.
      </p>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : enabled && step === 'idle' ? (
        <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3">
          <p className="text-sm font-semibold text-success">Double authentification activée</p>
          <p className="mt-1 text-xs text-muted">Ton compte demande un code à chaque connexion.</p>
          {!confirmDisable ? (
            <button onClick={() => setConfirmDisable(true)} className="mt-3 rounded-xl bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line">
              Désactiver
            </button>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={disable} disabled={busy} className="rounded-xl bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                Confirmer la désactivation
              </button>
              <button onClick={() => setConfirmDisable(false)} className="rounded-xl bg-surface2 px-4 py-2 text-sm hover:bg-line">
                Annuler
              </button>
            </div>
          )}
        </div>
      ) : step === 'idle' ? (
        <button onClick={startEnroll} disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Préparation…' : 'Activer la double authentification'}
        </button>
      ) : (
        <div className="rounded-2xl border border-line p-5">
          <p className="text-sm font-semibold">1. Scanne ce QR code avec ton application d’authentification</p>
          <div className="my-4 inline-block rounded-xl bg-white p-3">
            <QRCode value={qrUri} size={180} />
          </div>
          <p className="text-xs text-muted">Ou saisis ce secret manuellement : <code className="rounded bg-surface2 px-1 font-mono">{secret}</code></p>
          <form onSubmit={verifyEnroll} className="mt-4">
            <p className="text-sm font-semibold">2. Entre le code à 6 chiffres affiché par l’application</p>
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="w-40 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-center text-xl font-bold tracking-[0.4em] outline-none focus:border-primary"
              />
              <button disabled={busy || code.length !== 6} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {busy ? '…' : 'Vérifier et activer'}
              </button>
            </div>
          </form>
          <button onClick={() => setStep('idle')} className="mt-3 text-xs text-muted hover:text-ink">
            Annuler l’activation
          </button>
        </div>
      )}
      {notice && <p className="mt-4 rounded-xl bg-surface2 px-4 py-3 text-sm">{notice}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Raccourcis (liste de référence — uniquement les réels)       */
/* ------------------------------------------------------------------ */
function ShortcutsTab() {
  const shortcuts: { keys: string; action: string }[] = [
    { keys: 'Ctrl + K (ou Cmd + K)', action: 'Ouvrir la recherche globale de messages' },
    { keys: 'Échap', action: 'Fermer la recherche, une modale ou un menu' },
    { keys: 'Entrée', action: 'Envoyer le message en cours de rédaction' },
    { keys: 'Maj + Entrée', action: 'Nouvelle ligne dans le message (sans envoyer)' },
    { keys: 'Maj + Échap', action: 'Marquer la communauté affichée comme lue' },
    { keys: 'Double-clic sur un message', action: 'Ajouter / retirer la réaction ❤️' },
    { keys: 'Appui long (mobile)', action: 'Ouvrir le menu d’actions du message' },
  ];
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted">
        Raccourcis réellement disponibles dans Kora. Aucune personnalisation pour le moment : cette liste reflète
        le comportement réel de l’application, pas une promesse.
      </p>
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span className="text-sm">{s.action}</span>
            <kbd className="shrink-0 rounded-lg bg-surface2 px-2.5 py-1 font-mono text-xs font-bold">{s.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Avancé : mode développeur + bots                             */
/* ------------------------------------------------------------------ */
function AdvancedTab() {
  const { sb, user } = useAuth();
  const [dev, setDev] = useState(isDevMode());
  const [bots, setBots] = useState<{ id: string; name: string; created_at: string }[]>([]);
  const [botName, setBotName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBots = async () => {
    if (!user) return;
    const { data } = await sb.from('bots').select('id, name, created_at').eq('owner_id', user.id).order('created_at', { ascending: false });
    setBots((data ?? []) as { id: string; name: string; created_at: string }[]);
  };

  useEffect(() => {
    loadBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const toggleDev = () => {
    const next = !dev;
    setDev(next);
    setDevMode(next);
  };

  const createBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = botName.trim().slice(0, 32);
    if (name.length < 2) {
      setNotice('Nom de bot invalide (2 à 32 caractères).');
      return;
    }
    setBusy(true);
    setNotice('');
    setNewToken('');
    try {
      // Le jeton n'est stocké que sous forme de hash SHA-256 côté serveur :
      // on l'affiche une seule fois, ici, puis il n'est plus récupérable.
      const token = `kora_bot_${crypto.randomUUID()}`;
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const hashHex = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const { error } = await sb.from('bots').insert({ owner_id: user.id, name, token_hash: hashHex });
      if (error) throw error;
      setNewToken(token);
      setBotName('');
      await loadBots();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Création impossible (migration SQL en attente ?).');
    } finally {
      setBusy(false);
    }
  };

  const deleteBot = async (id: string, name: string) => {
    if (!window.confirm(`Supprimer le bot « ${name} » ? Il ne pourra plus poster.`)) return;
    const { error } = await sb.from('bots').delete().eq('id', id);
    if (error) {
      setNotice(error.message);
      return;
    }
    await loadBots();
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-1 font-bold">Mode développeur</h3>
        <p className="mb-4 text-sm text-muted">
          Ajoute « Copier l’ID » aux menus des communautés, messages et profils. Réglage propre à cet appareil.
        </p>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
          <span className="text-sm font-medium">Activer le mode développeur</span>
          <button
            type="button"
            role="switch"
            aria-checked={dev}
            onClick={toggleDev}
            className={`relative h-6 w-11 rounded-full transition-colors ${dev ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${dev ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>
      <div>
        <h3 className="mb-1 font-bold">Mes bots</h3>
        <p className="mb-4 text-sm text-muted">
          Un bot poste dans les salons de tes communautés via l’API (jeton). Ajoute-le à une communauté depuis ses
          paramètres, puis poste avec le jeton. Les bots ne peuvent jamais poster sans y être ajoutés, et le débit est
          limité à 30 messages/minute. Aucun annuaire public « vérifié » : seuls tes bots et ceux de tes serveurs sont
          listés.
        </p>
        <form onSubmit={createBot} className="flex gap-2">
          <input
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="Nom du bot"
            maxLength={32}
            className={inputCls}
          />
          <button disabled={busy} className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            Créer
          </button>
        </form>
        {newToken && (
          <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
            <p className="text-sm font-bold">Jeton affiché une seule fois — copie-le maintenant :</p>
            <code className="mt-1 block break-all rounded bg-surface2 px-2 py-1 font-mono text-xs">{newToken}</code>
            <p className="mt-1 text-xs text-muted">
              Utilisation : POST sur Supabase avec la fonction <code className="font-mono">post_bot_message(jeton, salon_id, contenu)</code>.
              Le jeton n’est stocké que sous forme de hash et ne pourra plus être affiché.
            </p>
          </div>
        )}
        {bots.length === 0 ? (
          <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">Aucun bot pour le moment.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {bots.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface2 px-4 py-2.5">
                <span>
                  <span className="block text-sm font-bold">{b.name}</span>
                  <span className="text-xs text-muted">Créé le {new Date(b.created_at).toLocaleDateString('fr-FR')}</span>
                </span>
                <button onClick={() => deleteBot(b.id, b.name)} className="rounded-lg px-3 py-1 text-sm text-danger hover:bg-surface">
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
        {notice && <p className="mt-3 rounded-xl bg-surface2 px-4 py-3 text-sm text-muted">{notice}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet À propos                                                     */
/* ------------------------------------------------------------------ */
function AboutTab() {
  return (
    <div className="max-w-xl space-y-4">
      <h3 className="font-bold">Kora — version 0.3.0</h3>
      <p className="text-sm text-muted">
        Rassemble ta communauté. Parle, joue, crée. Comptes, amis, messages privés et salons en temps réel,
        profils avec bannières animées, communautés avec salons textuels et vocaux, rôles, modération,
        invitations, sondages, réactions, émojis et autocollants personnalisés, appels audio/vidéo et
        partage d’écran, recherche globale et centre de notifications. Tout est gratuit, sans abonnement.
      </p>
      <nav className="flex flex-col gap-1 text-sm">
        <Link to="/confidentialite" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Politique de confidentialité</Link>
        <Link to="/conditions" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Conditions d’utilisation</Link>
        <Link to="/regles" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Règles de la communauté</Link>
        <Link to="/contact" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Contact</Link>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Audio et vidéo                                               */
/* Les choix sont stockés dans le navigateur et appliqués au prochain   */
/* salon vocal (micro d'entrée, sortie audio, mode vocal, muet).       */
/* ------------------------------------------------------------------ */
function AudioTab() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [detected, setDetected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputId, setInputId] = useState(() => {
    try { return localStorage.getItem('kora:audio-input') || ''; } catch { return ''; }
  });
  const [outputId, setOutputId] = useState(() => {
    try { return localStorage.getItem('kora:audio-output') || ''; } catch { return ''; }
  });
  const [voiceMode, setVoiceMode] = useState(() => {
    try { return (localStorage.getItem('kora:voice-mode') as 'vad' | 'ptt') || 'vad'; } catch { return 'vad'; }
  });
  const [joinMuted, setJoinMuted] = useState(() => {
    try { return localStorage.getItem('kora:voice-join-muted') === '1'; } catch { return false; }
  });

  const detect = async () => {
    setError('');
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(devices.filter((d) => d.kind === 'audioinput'));
      setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      setDetected(true);
    } catch {
      setError("Impossible d'accéder au microphone. Autorise l'accès dans ton navigateur pour lister tes appareils.");
    } finally {
      setBusy(false);
    }
  };

  const pick = (key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
  };

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted">
        Ces réglages s'appliquent à ton prochain salon vocal. Ils sont conservés dans ce navigateur.
      </p>
      <section>
        <h3 className="mb-2 font-semibold">Périphériques</h3>
        {!detected ? (
          <>
            <button onClick={detect} disabled={busy} className="rounded-lg bg-surface2 px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-50">
              {busy ? 'Détection…' : 'Détecter mes appareils'}
            </button>
            <p className="mt-2 text-xs text-muted">Le navigateur demandera l'accès au microphone pour nommer tes appareils.</p>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="audio-in" className="mb-1 block text-sm font-medium">Microphone</label>
              <select
                id="audio-in" value={inputId} onChange={(e) => pick('kora:audio-input', e.target.value, setInputId)}
                className="w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
              >
                <option value="">Microphone par défaut</option>
                {inputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audio-out" className="mb-1 block text-sm font-medium">Sortie audio</label>
              <select
                id="audio-out" value={outputId} onChange={(e) => pick('kora:audio-output', e.target.value, setOutputId)}
                className="w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-primary"
              >
                <option value="">Sortie par défaut</option>
                {outputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Sortie ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">La sortie choisie s'applique aux voix distantes (navigateurs compatibles).</p>
            </div>
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Mode vocal</h3>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface2">
            <input type="radio" name="voice-mode" checked={voiceMode === 'vad'} onChange={() => { setVoiceMode('vad'); try { localStorage.setItem('kora:voice-mode', 'vad'); } catch { /* noop */ } }} />
            <span className="text-sm"><span className="font-medium">Activité vocale</span> — le micro s'ouvre quand tu parles.</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface2">
            <input type="radio" name="voice-mode" checked={voiceMode === 'ptt'} onChange={() => { setVoiceMode('ptt'); try { localStorage.setItem('kora:voice-mode', 'ptt'); } catch { /* noop */ } }} />
            <span className="text-sm"><span className="font-medium">Push-to-talk</span> — maintiens le bouton ou la touche Espace pour parler.</span>
          </label>
        </div>
      </section>
      <section>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-surface2">
          <span className="text-sm"><span className="font-medium">Rejoindre en muet</span><br /><span className="text-muted">Arriver dans un salon vocal avec le micro coupé.</span></span>
          <input
            type="checkbox" checked={joinMuted}
            onChange={(e) => { setJoinMuted(e.target.checked); try { localStorage.setItem('kora:voice-join-muted', e.target.checked ? '1' : '0'); } catch { /* noop */ } }}
            className="h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]"
          />
        </label>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Accessibilité                                                */
/* Regroupe les réglages existants : taille du texte, densité,         */
/* réduction des animations.                                           */
/* ------------------------------------------------------------------ */
function AccessibiliteTab() {
  const { textSize, setTextSize, density, setDensity, reduceMotion, setReduceMotion } = useTheme();
  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted">
        Ces réglages s'appliquent immédiatement et sont conservés dans ton compte.
      </p>
      <section>
        <h3 className="mb-2 font-semibold">Taille du texte</h3>
        <div className="flex gap-2">
          {([
            ['petit', 'Petit'],
            ['normal', 'Normal'],
            ['grand', 'Grand'],
          ] as Array<[TextSizeChoice, string]>).map(([v, label]) => (
            <button
              key={v} onClick={() => setTextSize(v)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${textSize === v ? 'bg-primary text-white' : 'bg-surface2 hover:bg-line'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Densité de l'interface</h3>
        <div className="flex gap-2">
          {([
            ['confortable', 'Confortable'],
            ['compacte', 'Compacte'],
          ] as Array<[DensityChoice, string]>).map(([v, label]) => (
            <button
              key={v} onClick={() => setDensity(v)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${density === v ? 'bg-primary text-white' : 'bg-surface2 hover:bg-line'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">La densité compacte resserre les listes de conversations et les messages.</p>
      </section>
      <section>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-surface2">
          <span className="text-sm"><span className="font-medium">Réduire les animations</span><br /><span className="text-muted">Désactive les transitions et animations non essentielles.</span></span>
          <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} className="h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" />
        </label>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Navigation au clavier</h3>
        <p className="text-sm text-muted">
          Les contrôles principaux sont atteignables au clavier (Tab / Maj+Tab) avec un contour visible.
          Raccourcis utiles : Ctrl+K pour rechercher, Maj+Échap pour marquer un serveur comme lu, Échap pour fermer les fenêtres.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Amis et demandes                                             */
/* Vue d'ensemble + bascules réelles, la gestion détaillée reste sur   */
/* la page Amis (listes, acceptation, blocage).                        */
/* ------------------------------------------------------------------ */
function AmisTab() {
  const { entries, loading } = useFriends();
  const { settings, saveSettings } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const friends = entries.filter((e) => e.friendship.status === 'accepted');
  const pending = entries.filter((e) => e.friendship.status === 'pending');
  const blocked = entries.filter((e) => e.friendship.status === 'blocked');
  const open = settings?.friend_requests_open ?? true;

  const toggleOpen = async () => {
    setBusy(true);
    setNotice('');
    try {
      await saveSettings({ friend_requests_open: !open });
      setNotice(!open ? 'Demandes d’amis ouvertes.' : 'Demandes d’amis fermées.');
    } catch {
      setNotice('Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <section>
        <h3 className="mb-2 font-semibold">Aperçu</h3>
        {loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Link to="/app/amis?onglet=tous" className="rounded-xl bg-surface2 px-4 py-3 text-center hover:bg-line">
              <p className="text-xl font-bold">{friends.length}</p>
              <p className="text-xs text-muted">Amis</p>
            </Link>
            <Link to="/app/amis?onglet=attente" className="rounded-xl bg-surface2 px-4 py-3 text-center hover:bg-line">
              <p className="text-xl font-bold">{pending.length}</p>
              <p className="text-xs text-muted">En attente</p>
            </Link>
            <Link to="/app/amis?onglet=bloques" className="rounded-xl bg-surface2 px-4 py-3 text-center hover:bg-line">
              <p className="text-xl font-bold">{blocked.length}</p>
              <p className="text-xs text-muted">Bloqués</p>
            </Link>
          </div>
        )}
      </section>
      <section>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-surface2">
          <span className="text-sm"><span className="font-medium">Accepter les demandes d'amis</span><br /><span className="text-muted">Si fermé, personne ne peut t'envoyer de demande.</span></span>
          <input type="checkbox" checked={open} disabled={busy} onChange={toggleOpen} className="h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" />
        </label>
        {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Gérer</h3>
        <nav className="flex flex-col gap-1 text-sm">
          <Link to="/app/amis?onglet=tous" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Voir mes amis →</Link>
          <Link to="/app/amis?onglet=attente" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Demandes en attente →</Link>
          <Link to="/app/amis?onglet=bloques" className="rounded-lg px-3 py-2 text-primary hover:bg-surface2">Utilisateurs bloqués →</Link>
        </nav>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Settings() {
  const [params, setParams] = useSearchParams();
  const { signOut, profile } = useAuth();
  const requested = params.get('onglet') as TabId | null;
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === requested) ? (requested as TabId) : 'compte');
  const [mobileOpen, setMobileOpen] = useState(false);

  const select = (t: TabId) => {
    setTab(t);
    setMobileOpen(true);
    setParams({ onglet: t }, { replace: true });
  };

  return (
    <div className="flex h-full">
      <aside className={`${mobileOpen ? 'hidden md:block' : 'block'} w-full shrink-0 border-r border-line bg-base p-4 md:w-64 md:bg-surface`}>
        <h1 className="px-2 py-2 text-lg font-extrabold">Paramètres</h1>
        <nav className="mt-2 space-y-1 md:space-y-1">
          {TABS.map((t, i) => {
            const Icon = TAB_ICONS[t.id];
            return (
              <button
                key={t.id}
                onClick={() => select(t.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] md:rounded-lg md:py-2 md:text-sm md:font-medium ${
                  tab === t.id ? 'font-semibold md:bg-surface2 md:text-ink' : 'text-ink md:font-medium md:text-muted md:hover:bg-surface2/60 md:hover:text-ink'
                } ${i > 0 ? 'border-t border-line/60 md:border-0' : ''}`}
              >
                <Icon size={18} className="shrink-0 text-muted" />
                <span className="flex-1">{t.label}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted md:hidden">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </nav>
        {profile?.is_site_admin && (
          <Link
            to="/app/admin"
            className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-primary hover:bg-surface2/60 md:mt-2 md:py-2 md:text-sm md:font-medium"
          >
            <Shield size={18} className="shrink-0" />
            <span className="flex-1">Panneau d’administration</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted md:hidden">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        )}
        <button
          onClick={signOut}
          className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-danger hover:bg-surface2/60 md:mt-6 md:py-2 md:text-sm md:font-medium"
        >
          <LogOut size={18} className="shrink-0" />
          <span className="flex-1">Se déconnecter</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted md:hidden">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </aside>
      <section className={`${mobileOpen ? 'block' : 'hidden md:block'} min-w-0 flex-1 overflow-y-auto bg-base p-4 md:p-8`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface2 hover:text-ink md:hidden"
          aria-label="Retour à la liste des paramètres"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5 M12 19l-7-7 7-7" />
          </svg>
          Paramètres
        </button>
        <h2 className="mb-6 text-lg font-bold">{TABS.find((t) => t.id === tab)?.label}</h2>
        {tab === 'compte' && <AccountTab />}
        {tab === 'profil' && <ProfileTab />}
        {tab === 'apparence' && <AppearanceTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'confidentialite' && <PrivacyTab />}
        {tab === 'securite' && <SecurityTab />}
        {tab === 'amis' && <AmisTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'accessibilite' && <AccessibiliteTab />}
        {tab === 'raccourcis' && <ShortcutsTab />}
        {tab === 'avance' && <AdvancedTab />}
        {tab === 'apropos' && <AboutTab />}
      </section>
    </div>
  );
}
