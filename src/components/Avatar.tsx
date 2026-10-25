import { initials } from '../lib/format';
import { frameStyle } from '../lib/frames';
import { STATUS_COLORS } from '../lib/types';

export interface AvatarData {
  avatar_url?: string | null;
  display_name?: string;
  username?: string;
  avatar_frame?: string | null;
}

interface Props {
  profile?: AvatarData | null;
  size?: number;
  status?: string | null;
  showStatus?: boolean;
}

/** Avatar avec repli sur initiales (jamais d'image cassée) + décoration Kora. */
export default function Avatar({ profile, size = 40, status = null, showStatus = false }: Props) {
  const name = profile?.display_name?.trim() || profile?.username || '?';
  const fontSize = Math.max(12, Math.round(size * 0.38));
  const frame = frameStyle(profile?.avatar_frame);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size, ...(frame ?? {}) }}
        />
      ) : (
        <span
          className="flex items-center justify-center rounded-full bg-primary font-semibold text-white"
          style={{ width: size, height: size, fontSize, ...(frame ?? {}) }}
          aria-label={name}
        >
          {initials(name)}
        </span>
      )}
      {showStatus && status && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-base"
          style={{
            width: Math.max(10, size * 0.32),
            height: Math.max(10, size * 0.32),
            backgroundColor: STATUS_COLORS[status] ?? STATUS_COLORS.hors_ligne,
          }}
          title={status}
        />
      )}
    </span>
  );
}
