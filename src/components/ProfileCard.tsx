import { useState } from 'react';
import Avatar from './Avatar';
import { formatDate } from '../lib/format';
import { STATUS_COLORS, STATUS_LABELS, type Friendship, type Profile } from '../lib/types';

interface Props {
  profile: Profile;
  friendship?: Friendship | null; // pour « Ami(e) depuis le »
  status?: string;
  onMessage: () => void;
  onClose: () => void;
}

function activeCustomStatus(p: Profile): string {
  if (!p.custom_status) return '';
  if (p.custom_status_expires_at && new Date(p.custom_status_expires_at).getTime() < Date.now()) return '';
  return p.custom_status;
}

/** Fiche profil façon Discord : bannière, avatar, bio, dates, actions. */
export default function ProfileCard({ profile, friendship, status = 'hors_ligne', onMessage, onClose }: Props) {
  const [tab, setTab] = useState<'principal' | 'activite'>('principal');
  const [callNote, setCallNote] = useState(false);
  const dot = STATUS_COLORS[status] ?? STATUS_COLORS.hors_ligne;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label={`Profil de ${profile.display_name || profile.username}`}>
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-2xl sm:max-w-sm sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        {/* Bannière décorative (couleurs Kora) + avatar */}
        <div
          className={`relative h-28 ${profile.banner_color ? '' : 'bg-gradient-to-br from-primary via-[#a855f7] to-accent'}`}
          style={profile.banner_color ? { background: `linear-gradient(135deg, ${profile.banner_color}, ${profile.banner_color}88)` } : undefined}
        >
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Fermer le profil"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18 M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-10 mb-3 flex items-end justify-between">
            <span className="relative inline-block rounded-full border-4 border-surface">
              <Avatar profile={profile} size={88} />
              <span
                className="absolute bottom-1 right-1 h-6 w-6 rounded-full border-4 border-surface"
                style={{ backgroundColor: dot }}
                title={STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
              />
            </span>
          </div>

          <h2 className="text-xl font-extrabold">{profile.display_name || profile.username}</h2>
          <p className="text-sm text-muted">@{profile.username}</p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={onMessage}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface2 px-4 py-2.5 text-sm font-bold hover:bg-line"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Envoyer un message
            </button>
            <button
              onClick={() => setCallNote(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface2 px-4 py-2.5 text-sm font-bold hover:bg-line"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Appeler
            </button>
          </div>
          {callNote && (
            <p className="mt-2 rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent">
              Les appels vocaux et vidéo arrivent avec la prochaine mise à jour de Kora.
            </p>
          )}

          <div className="mt-4 flex border-b border-line">
            {(
              [
                ['principal', 'Principal'],
                ['activite', 'Activité'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 border-b-2 px-4 py-2 text-sm font-bold ${
                  tab === id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'principal' ? (
            <div className="space-y-4 pt-4">
              {profile.bio ? (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Bio</p>
                  <p className="whitespace-pre-wrap text-sm">{profile.bio}</p>
                </div>
              ) : (
                <p className="text-sm italic text-muted">Aucune bio pour l’instant.</p>
              )}
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Membre depuis</p>
                <p className="text-sm">🎂 {formatDate(profile.created_at)}</p>
              </div>
              {friendship?.status === 'accepted' && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Ami(e) depuis le</p>
                  <p className="text-sm">{formatDate(friendship.created_at)}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: dot }} />
                <p className="text-sm font-semibold">
                  {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? 'Hors ligne'}
                </p>
              </div>
              {activeCustomStatus(profile) ? (
                <p className="rounded-xl bg-surface2 px-3 py-2 text-sm">« {activeCustomStatus(profile)} »</p>
              ) : (
                <p className="text-sm italic text-muted">Aucun statut personnalisé.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
