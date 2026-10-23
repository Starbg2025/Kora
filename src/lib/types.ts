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
  is_disabled: boolean;
}

export interface UserSettings {
  user_id: string;
  theme: 'clair' | 'sombre' | 'systeme';
  density: 'confortable' | 'compacte';
  dm_mute: string[];
  friend_requests_open: boolean;
  accent_color: string;
  text_size: 'petit' | 'normal' | 'grand';
  reduce_motion: boolean;
  notif_messages: boolean;
  notif_mentions: boolean;
  notif_friend_requests: boolean;
  notif_invites: boolean;
  notif_calls: boolean;
}

export type NotificationType = 'message' | 'mention' | 'demande_ami' | 'invitation' | 'appel' | 'communaute';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
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

// ---------------------------------------------------------------------------
// Phase 2 — Communautés
// ---------------------------------------------------------------------------

export type CommunityRole = 'proprietaire' | 'admin' | 'moderateur' | 'membre';

export interface Community {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  owner_id: string;
  invite_code: string;
  is_public: boolean;
  created_at: string;
}

export interface CommunityMember {
  community_id: string;
  user_id: string;
  role: CommunityRole;
  joined_at: string;
  profiles?: Profile | null;
}

export interface ChannelCategory {
  id: string;
  community_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Channel {
  id: string;
  community_id: string;
  category_id: string | null;
  name: string;
  topic: string;
  type: 'text';
  position: number;
  created_at: string;
}

export interface CommunityMessage {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachment_path: string | null;
  attachment_name: string | null;
  edited_at: string | null;
  reply_to: string | null;
  created_at: string;
}

export interface CommunityMessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface CommunityMessagePin {
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export interface CommunityInvite {
  code: string;
  community_id: string;
  created_by: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export const ROLE_LABELS: Record<CommunityRole, string> = {
  proprietaire: 'Propriétaire',
  admin: 'Admin',
  moderateur: 'Modérateur',
  membre: 'Membre',
};

export const ROLE_COLORS: Record<CommunityRole, string> = {
  proprietaire: '#F59E0B',
  admin: '#EF4444',
  moderateur: '#3B82F6',
  membre: '#9CA3AF',
};

export const ROLE_RANK: Record<CommunityRole, number> = {
  membre: 1,
  moderateur: 2,
  admin: 3,
  proprietaire: 4,
};
