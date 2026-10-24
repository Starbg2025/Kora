import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import ProfileCard from './ProfileCard';
import { openDirectDM } from '../lib/dm';
import { ROLE_COLORS, ROLE_LABELS, ROLE_RANK, type CommunityMember, type CommunityRole, type Profile } from '../lib/types';

interface Props {
  communityId: string;
  members: CommunityMember[];
  myRole: CommunityRole | null;
  me: string;
  online: Record<string, { status: string }>;
  variant: 'column' | 'drawer';
  onClose: () => void;
  onChanged: () => void;
  flash: (msg: string) => void;
}

function statusOf(member: CommunityMember, online: Props['online']): string {
  const p = member.profiles;
  if (!p) return 'hors_ligne';
  const live = online[member.user_id]?.status;
  if (live) return live;
  return p.status === 'invisible' ? 'hors_ligne' : p.status;
}

const ROLE_ORDER: CommunityRole[] = ['proprietaire', 'admin', 'moderateur', 'membre'];

/** Panneau des membres : en ligne / hors ligne, groupés par rôle, modération, fiche profil au clic. */
export default function CommunityMembers({ communityId, members, myRole, me, online, variant, onClose, onChanged, flash }: Props) {
  const { sb } = useAuth();
  const navigate = useNavigate();
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmKick, setConfirmKick] = useState<CommunityMember | null>(null);
  const [banTarget, setBanTarget] = useState<CommunityMember | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<'1h' | '1j' | '7j' | 'definitif'>('7j');
  const [timeoutTarget, setTimeoutTarget] = useState<CommunityMember | null>(null);
  const [timeoutReason, setTimeoutReason] = useState('');
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);

  const myRank = myRole ? ROLE_RANK[myRole] : 0;
  const canModerate = myRank >= 2;

  const sorted = [...members].sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 0;
    const rb = ROLE_RANK[b.role] ?? 0;
    if (rb !== ra) return rb - ra;
    return (a.profiles?.display_name ?? '').localeCompare(b.profiles?.display_name ?? '');
  });
  const onlineMembers = sorted.filter((m) => {
    const s = statusOf(m, online);
    return s !== 'hors_ligne' && s !== 'invisible';
  });
  const offlineMembers = sorted.filter((m) => {
    const s = statusOf(m, online);
    return s === 'hors_ligne' || s === 'invisible';
  });

  const setRole = async (target: CommunityMember, role: CommunityRole) => {
    setActingId(target.user_id);
    try {
      const { error } = await sb.rpc('set_member_role', {
        p_community: communityId,
        p_user: target.user_id,
        p_role: role,
      });
      if (error) throw error;
      flash(`${target.profiles?.display_name ?? 'Membre'} est maintenant ${ROLE_LABELS[role]}.`);
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setActingId(null);
    }
  };

  const kick = async (target: CommunityMember) => {
    setActingId(target.user_id);
    try {
      const { error } = await sb.rpc('kick_member', { p_community: communityId, p_user: target.user_id });
      if (error) throw error;
      flash(`${target.profiles?.display_name ?? 'Membre'} a été exclu.`);
      setConfirmKick(null);
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Exclusion impossible.');
    } finally {
      setActingId(null);
    }
  };

  const ban = async () => {
    if (!banTarget) return;
    setActingId(banTarget.user_id);
    try {
      const expires =
        banDuration === 'definitif'
          ? null
          : new Date(Date.now() + (banDuration === '1h' ? 3600 : banDuration === '1j' ? 86400 : 7 * 86400) * 1000).toISOString();
      const { error } = await sb.rpc('ban_member', {
        p_community: communityId,
        p_user: banTarget.user_id,
        p_reason: banReason.trim(),
        p_expires: expires,
      });
      if (error) throw error;
      flash(`${banTarget.profiles?.display_name ?? 'Membre'} a été banni.`);
      setBanTarget(null);
      setBanReason('');
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Bannissement impossible.');
    } finally {
      setActingId(null);
    }
  };

  const timeout = async () => {
    if (!timeoutTarget) return;
    setActingId(timeoutTarget.user_id);
    try {
      const { error } = await sb.rpc('timeout_member', {
        p_community: communityId,
        p_user: timeoutTarget.user_id,
        p_reason: timeoutReason.trim(),
        p_minutes: timeoutMinutes,
      });
      if (error) throw error;
      flash(`${timeoutTarget.profiles?.display_name ?? 'Membre'} est en timeout.`);
      setTimeoutTarget(null);
      setTimeoutReason('');
      onChanged();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Timeout impossible.');
    } finally {
      setActingId(null);
    }
  };

  const openMessageTo = async (p: Profile) => {
    setProfileTarget(null);
    try {
      const dmId = await openDirectDM(sb, me, p.id);
      navigate(`/app/dm/${dmId}`);
    } catch {
      flash('Ouverture de la conversation impossible.');
    }
  };

  const renderMember = (m: CommunityMember) => {
    const p = m.profiles;
    const st = statusOf(m, online);
    const targetRank = ROLE_RANK[m.role] ?? 0;
    const isMe = m.user_id === me;
    // Je peux agir si mon rang est strictement supérieur (ou propriétaire sur tout sauf lui-même)
    const actionable = canModerate && !isMe && myRank > targetRank;
    const canPromoteToAdmin = myRole === 'proprietaire';

    return (
      <li key={m.user_id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface2">
        <button
          onClick={() => p && setProfileTarget(p)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          title="Voir le profil"
        >
          <Avatar profile={p} size={32} status={st} showStatus />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{p?.display_name || p?.username || 'Inconnu'}</span>
            <span
              className="mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-bold"
              style={{ color: ROLE_COLORS[m.role], backgroundColor: `${ROLE_COLORS[m.role]}22` }}
            >
              {ROLE_LABELS[m.role]}
            </span>
          </span>
        </button>
        {actionable && (
          <div className="flex shrink-0 items-center gap-1">
            {targetRank < 3 && canPromoteToAdmin && m.role !== 'admin' && (
              <button
                disabled={actingId === m.user_id}
                onClick={() => setRole(m, 'admin')}
                className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold hover:bg-line disabled:opacity-50"
                title="Nommer admin"
              >
                Admin
              </button>
            )}
            {m.role !== 'moderateur' && targetRank < 2 && (
              <button
                disabled={actingId === m.user_id}
                onClick={() => setRole(m, 'moderateur')}
                className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold hover:bg-line disabled:opacity-50"
                title="Nommer modérateur"
              >
                Modo
              </button>
            )}
            {targetRank > 1 && (
              <button
                disabled={actingId === m.user_id}
                onClick={() => setRole(m, 'membre')}
                className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold hover:bg-line disabled:opacity-50"
                title="Rétrograder à membre"
              >
                Rétrograder
              </button>
            )}
            <button
              disabled={actingId === m.user_id}
              onClick={() => setConfirmKick(m)}
              className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold text-danger hover:bg-line disabled:opacity-50"
              title="Exclure"
            >
              Exclure
            </button>
            <button
              disabled={actingId === m.user_id}
              onClick={() => setTimeoutTarget(m)}
              className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold hover:bg-line disabled:opacity-50"
              title="Mettre en timeout"
            >
              Timeout
            </button>
            <button
              disabled={actingId === m.user_id}
              onClick={() => setBanTarget(m)}
              className="rounded-lg bg-surface2 px-2 py-1 text-xs font-semibold text-danger hover:bg-line disabled:opacity-50"
              title="Bannir"
            >
              Bannir
            </button>
          </div>
        )}
      </li>
    );
  };

  const renderSection = (title: string, list: CommunityMember[]) => {
    if (list.length === 0) return null;
    return (
      <>
        <p className="px-4 py-1 text-xs font-bold uppercase tracking-wide text-muted">
          {title} · {list.length}
        </p>
        {ROLE_ORDER.map((role) => {
          const group = list.filter((m) => m.role === role);
          if (group.length === 0) return null;
          return (
            <div key={role} className="mb-1">
              <p className="px-4 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: ROLE_COLORS[role] }}>
                {ROLE_LABELS[role]} · {group.length}
              </p>
              <ul>{group.map(renderMember)}</ul>
            </div>
          );
        })}
      </>
    );
  };

  const panel = (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="font-extrabold">Membres · {members.length}</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-ink"
          aria-label="Fermer les membres"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {renderSection('En ligne', onlineMembers)}
        {renderSection('Hors ligne', offlineMembers)}
      </div>
    </div>
  );

  return (
    <>
      {variant === 'drawer' ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw]">{panel}</div>
        </div>
      ) : (
        <div className="hidden w-60 shrink-0 flex-col border-l border-line md:flex">{panel}</div>
      )}

      {profileTarget && (
        <ProfileCard
          profile={profileTarget}
          friendship={null}
          status={online[profileTarget.id]?.status ?? 'hors_ligne'}
          onMessage={() => openMessageTo(profileTarget)}
          onClose={() => setProfileTarget(null)}
        />
      )}

      {confirmKick && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Exclure ce membre ?</h3>
            <p className="mt-2 text-sm text-muted">
              {confirmKick.profiles?.display_name} ne pourra plus voir la communauté. Il pourra être réinvité.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmKick(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
              >
                Annuler
              </button>
              <button
                onClick={() => kick(confirmKick)}
                disabled={actingId === confirmKick.user_id}
                className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Exclure
              </button>
            </div>
          </div>
        </div>
      )}

      {banTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Bannir {banTarget.profiles?.display_name} ?</h3>
            <p className="mt-2 text-sm text-muted">
              Le membre perd immédiatement l’accès à la communauté et ne pourra pas revenir tant que le
              bannissement est actif.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Motif (optionnel)</label>
                <input
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={280}
                  placeholder="ex. Spam répété"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Durée</label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value as typeof banDuration)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="1h">1 heure</option>
                  <option value="1j">1 jour</option>
                  <option value="7j">7 jours</option>
                  <option value="definitif">Définitif</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setBanTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
              >
                Annuler
              </button>
              <button
                onClick={ban}
                disabled={actingId === banTarget.user_id}
                className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Bannir
              </button>
            </div>
          </div>
        </div>
      )}

      {timeoutTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Timeout pour {timeoutTarget.profiles?.display_name} ?</h3>
            <p className="mt-2 text-sm text-muted">
              Le membre ne pourra plus écrire dans les salons jusqu’à l’expiration du timeout.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Motif (optionnel)</label>
                <input
                  value={timeoutReason}
                  onChange={(e) => setTimeoutReason(e.target.value)}
                  maxLength={280}
                  placeholder="ex. Propos déplacés"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Durée</label>
                <select
                  value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value={10}>10 minutes</option>
                  <option value={60}>1 heure</option>
                  <option value={1440}>1 jour</option>
                  <option value={10080}>7 jours</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setTimeoutTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface2"
              >
                Annuler
              </button>
              <button
                onClick={timeout}
                disabled={actingId === timeoutTarget.user_id}
                className="rounded-xl bg-danger px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                Appliquer le timeout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
