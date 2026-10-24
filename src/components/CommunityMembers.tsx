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
    </>
  );
}
