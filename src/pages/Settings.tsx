import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useAuth } from '../context/AuthContext';
import { useTheme, ACCENT_COLORS, type DensityChoice, type TextSizeChoice, type ThemeChoice } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { isValidUsername } from '../lib/format';
import { STATUS_LABELS, type DM, type PresenceStatus, type UserSettings } from '../lib/types';

type TabId = 'compte' | 'profil' | 'apparence' | 'notifications' | 'confidentialite' | 'securite' | 'apropos';

const TABS: { id: TabId; label: string }[] = [
  { id: 'compte', label: 'Compte' },
  { id: 'profil', label: 'Profil' },
  { id: 'apparence', label: 'Apparence' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'apropos', label: 'À propos' },
];

const TAB_ICONS: Record<TabId, string> = {
  compte: '👤',
  profil: '📝',
  apparence: '🎨',
  notifications: '🔔',
  confidentialite: '🔒',
  securite: '🛡️',
  apropos: 'ℹ️',
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

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s) return;
      const created = s.user.created_at ? new Date(s.user.created_at).toLocaleDateString('fr-FR') : '—';
      setSessionInfo(`Appareil actuel — compte créé le ${created}.`);
    });
  }, [sb]);

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
      await updateProfile({
        username: u,
        display_name: displayName.trim(),
        bio: bio.trim().slice(0, 190),
        status,
        custom_status: customStatus.trim().slice(0, 100),
        custom_status_expires_at: customStatus.trim() ? durationToExpires(duration) : null,
        banner_color: bannerColor || null,
        banner_url: bannerUrl,
      });
      setNotice('Profil enregistré.');
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
        <label htmlFor="p-username" className="mb-1 block text-sm font-medium">Nom d’utilisateur (unique)</label>
        <input id="p-username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label htmlFor="p-display" className="mb-1 block text-sm font-medium">Nom d’affichage</label>
        <input id="p-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} maxLength={60} />
      </div>
      <div>
        <label htmlFor="p-bio" className="mb-1 block text-sm font-medium">Biographie</label>
        <textarea id="p-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={190} className={inputCls} placeholder="Quelques mots sur toi…" />
        <p className="mt-1 text-right text-xs text-muted">{bio.length}/190</p>
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
            className={`h-9 w-9 rounded-full bg-gradient-to-br from-primary via-[#a855f7] to-accent ${bannerColor === '' ? 'ring-2 ring-primary ring-offset-2 ring-offset-base' : 'opacity-70 hover:opacity-100'}`}
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
      setSqlNotice('Option indisponible pour le moment : exécute la migration supabase/migrations/20261024_settings_notifications.sql puis recharge.');
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h3 className="mb-3 font-bold">Thème</h3>
        <div className="space-y-2">
          {themes.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${theme === t.id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="theme" checked={theme === t.id} onChange={() => setTheme(t.id)} className="h-4 w-4 accent-[#7C3AED]" />
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
        <h3 className="mb-3 font-bold">Taille du texte</h3>
        <div className="space-y-2">
          {sizes.map((s) => (
            <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${textSize === s.id ? 'border-primary bg-primary/10' : 'border-line'}`}>
              <input type="radio" name="textsize" checked={textSize === s.id} onChange={() => guardSql(async () => setTextSize(s.id))} className="h-4 w-4 accent-[#7C3AED]" />
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
              <input type="radio" name="density" checked={density === d.id} onChange={() => setDensity(d.id)} className="h-4 w-4 accent-[#7C3AED]" />
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
  const [names, setNames] = useState<Record<string, string>>({});
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
      setSqlNotice('Option indisponible pour le moment : exécute la migration supabase/migrations/20261024_settings_notifications.sql puis recharge.');
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Confidentialité                                              */
/* ------------------------------------------------------------------ */
function PrivacyTab() {
  const { settings, saveSettings } = useAuth();
  const [busy, setBusy] = useState(false);
  const open = settings?.friend_requests_open ?? true;

  const toggle = async () => {
    setBusy(true);
    try {
      await saveSettings({ friend_requests_open: !open });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h3 className="mb-1 font-bold">Demandes d’ami</h3>
      <p className="mb-4 text-sm text-muted">Choisis qui peut t’envoyer une demande d’ami en te cherchant par nom d’utilisateur.</p>
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-line px-4 py-3">
        <span className="text-sm font-medium">Tout le monde peut m’envoyer une demande</span>
        <button
          type="button"
          role="switch"
          aria-checked={open}
          disabled={busy}
          onClick={toggle}
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
      <h3 className="mb-1 mt-8 font-bold">Comptes bloqués</h3>
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
/* Onglet À propos                                                     */
/* ------------------------------------------------------------------ */
function AboutTab() {
  return (
    <div className="max-w-xl space-y-4">
      <h3 className="font-bold">Kora — version 0.2.0 (Phases 1 + 2)</h3>
      <p className="text-sm text-muted">
        Rassemble ta communauté. Parle, joue, crée. Comptes, amis, messages privés en temps réel, profils,
        communautés avec salons, rôles et invitations, sondages, réactions et centre de notifications.
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
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] md:rounded-xl md:py-2 md:text-sm md:font-medium ${
                tab === t.id ? 'font-semibold md:bg-surface2 md:text-ink' : 'text-ink md:font-medium md:text-muted md:hover:bg-surface2/60 md:hover:text-ink'
              } ${i > 0 ? 'border-t border-line/60 md:border-0' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2 text-lg md:hidden">
                {TAB_ICONS[t.id]}
              </span>
              <span className="flex-1">{t.label}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted md:hidden">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </nav>
        {profile?.is_site_admin && (
          <Link
            to="/app/admin"
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-primary hover:bg-surface2/60 md:mt-2 md:py-2 md:text-sm md:font-medium"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2 text-lg md:hidden">🛡️</span>
            <span className="flex-1">Panneau d’administration</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted md:hidden">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        )}
        <button
          onClick={signOut}
          className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-danger hover:bg-surface2/60 md:mt-6 md:py-2 md:text-sm md:font-medium"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2 text-lg md:hidden">🚪</span>
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
        <h2 className="mb-6 text-xl font-extrabold">{TABS.find((t) => t.id === tab)?.label}</h2>
        {tab === 'compte' && <AccountTab />}
        {tab === 'profil' && <ProfileTab />}
        {tab === 'apparence' && <AppearanceTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'confidentialite' && <PrivacyTab />}
        {tab === 'securite' && <SecurityTab />}
        {tab === 'apropos' && <AboutTab />}
      </section>
    </div>
  );
}
