import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useAuth } from '../context/AuthContext';
import { useTheme, type DensityChoice, type ThemeChoice } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { isValidUsername } from '../lib/format';
import { STATUS_LABELS, type DM, type PresenceStatus } from '../lib/types';

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

const inputCls =
  'w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-ink outline-none focus:border-primary';

/* ------------------------------------------------------------------ */
/* Onglet Compte                                                       */
/* ------------------------------------------------------------------ */
function AccountTab() {
  const { sb, user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setUsername(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setStatus(profile?.status ?? 'en_ligne');
    setCustomStatus(profile?.custom_status ?? '');
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
  const { theme, density, setTheme, setDensity } = useTheme();
  const themes: { id: ThemeChoice; label: string; desc: string }[] = [
    { id: 'clair', label: 'Clair', desc: 'Fond clair, idéal le jour.' },
    { id: 'sombre', label: 'Sombre', desc: 'Fond sombre, doux pour les yeux le soir.' },
    { id: 'systeme', label: 'Système', desc: 'Suit le réglage de ton appareil.' },
  ];
  const densities: { id: DensityChoice; label: string; desc: string }[] = [
    { id: 'confortable', label: 'Confortable', desc: 'Espacements généreux.' },
    { id: 'compacte', label: 'Compacte', desc: 'Plus de messages à l’écran.' },
  ];
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Notifications                                                */
/* ------------------------------------------------------------------ */
function NotificationsTab() {
  const { sb, settings, saveSettings } = useAuth();
  const [names, setNames] = useState<Record<string, string>>({});

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

  const muted = settings?.dm_mute ?? [];
  return (
    <div className="max-w-xl">
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
      <h3 className="font-bold">Kora — version 0.1.0 (Phase 1)</h3>
      <p className="text-sm text-muted">
        Rassemble ta communauté. Parle, joue, crée. Cette première version couvre l’essentiel :
        comptes, amis, messages privés en temps réel et profils.
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
  const { signOut } = useAuth();
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
      <aside className={`${mobileOpen ? 'hidden md:block' : 'block'} w-full shrink-0 border-r border-line bg-surface p-4 md:w-64`}>
        <h1 className="px-2 py-2 text-lg font-extrabold">Paramètres</h1>
        <nav className="mt-2 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${
                tab === t.id ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2/60 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="mt-6 w-full rounded-xl bg-surface2 px-3 py-2 text-left text-sm font-medium text-danger hover:bg-line"
        >
          Se déconnecter
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
