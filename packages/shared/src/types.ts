export type UserRole = 'admin' | 'member';

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  role: UserRole;
  createdAt: string;
}

export type ChannelType = 'text' | 'voice' | 'dm';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  isImage: boolean;
}

export interface ReactionSummary {
  emoji: string;
  userIds: string[];
}

export interface MessageReplySummary {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  content: string;
  hasAttachments: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  author: UserPublic;
  content: string;
  attachments: Attachment[];
  reactions: ReactionSummary[];
  replyToId?: string | null;
  replyTo?: MessageReplySummary | null;
  editedAt: string | null;
  createdAt: string;
}

export interface InviteInfo {
  code: string;
  createdBy: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface BootstrapStatus {
  serverName: string;
  needsAdminSetup: boolean;
  userCount: number;
  maxUsers: number;
  version: string;
}

export interface VoiceUserState {
  userId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
}

export interface PresencePayload {
  onlineUserIds: string[];
  voiceParticipants: Record<string, string[]>;
  voiceStates: Record<string, VoiceUserState>;
}

export interface VoiceTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

export interface VoiceStatusResponse {
  available: boolean;
  livekitPort: number;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
}

export interface ClientToServerEvents {
  'typing:start': (payload: { channelId: string }) => void;
  'typing:stop': (payload: { channelId: string }) => void;
  'voice:state': (payload: {
    channelId: string | null;
    muted: boolean;
    deafened: boolean;
    screenSharing: boolean;
  }) => void;
}

export interface ServerToClientEvents {
  'presence:update': (payload: PresencePayload) => void;
  'typing:update': (payload: { channelId: string; userIds: string[] }) => void;
  'channel:created': (channel: Channel) => void;
  'channel:updated': (channel: Channel) => void;
  'channel:deleted': (payload: { channelId: string }) => void;
  'message:new': (message: Message) => void;
  'message:updated': (message: Message) => void;
  'message:deleted': (payload: { channelId: string; messageId: string }) => void;
  'user:joined': (user: UserPublic) => void;
  'user:updated': (user: UserPublic) => void;
}
