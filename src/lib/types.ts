export type PresenceStatus = 'en_ligne' | 'inactif' | 'ne_pas_deranger' | 'invisible';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  status: PresenceStatus;
  custom_status: string;
  custom_status_expires_at: string | null;
  created_at: string;
  banner_color: string | null;
}

export interface UserSettings {
  user_id: string;
  theme: 'clair' | 'sombre' | 'systeme';
  density: 'confortable' | 'compacte';
  dm_mute: string[];
  friend_requests_open: boolean;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface DM {
  id: string;
  name: string | null;
  is_group: boolean;
  created_by: string;
  created_at: string;
}

export interface DMMemberRow {
  dm_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
}

export interface Message {
  id: string;
  dm_id: string;
  author_id: string;
  content: string;
  attachment_path: string | null;
  attachment_name: string | null;
  edited_at: string | null;
  reply_to: string | null;
  created_at: string;
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MessagePin {
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export interface MessagePoll {
  id: string;
  message_id: string;
  question: string;
  options: string[];
  created_by: string;
  ends_at: string | null;
  created_at: string;
}

export interface MessagePollVote {
  poll_id: string;
  user_id: string;
  option_index: number;
  created_at: string;
}

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  en_ligne: 'En ligne',
  inactif: 'Inactif',
  ne_pas_deranger: 'Ne pas déranger',
  invisible: 'Invisible',
};

export const STATUS_COLORS: Record<string, string> = {
  en_ligne: '#22C55E',
  inactif: '#F59E0B',
  ne_pas_deranger: '#EF4444',
  invisible: '#6B7280',
  hors_ligne: '#6B7280',
};
