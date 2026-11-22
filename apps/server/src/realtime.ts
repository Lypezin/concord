import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type {
  Channel,
  ClientToServerEvents,
  Message,
  PresencePayload,
  ServerToClientEvents,
  UserPublic,
  VoiceUserState,
} from '@concord/shared';
import type { AuthHelpers } from './auth.js';

interface SocketData {
  userId: string;
}

export interface RealtimeHub {
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  getPresence: () => PresencePayload;
  emitMessageNew: (message: Message) => void;
  emitMessageUpdated: (message: Message) => void;
  emitMessageDeleted: (channelId: string, messageId: string) => void;
  emitChannelCreated: (channel: Channel) => void;
  emitChannelUpdated: (channel: Channel) => void;
  emitChannelDeleted: (channelId: string) => void;
  emitUserJoined: (user: UserPublic) => void;
  close: () => Promise<void>;
}

const TYPING_TTL_MS = 5000;

export function createRealtime(
  fastify: FastifyInstance,
  db: DatabaseSync,
  auth: AuthHelpers,
): RealtimeHub {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    fastify.server,
    {
      cors: {
        origin: true,
        credentials: true,
      },
    },
  );

  const onlineSockets = new Map<string, Set<string>>();
  const typingState = new Map<string, Map<string, NodeJS.Timeout>>();
  const voiceStates = new Map<string, VoiceUserState>();
  const checkTextChannelStmt = db.prepare("SELECT id FROM channels WHERE id = ? AND type = 'text'");
  const checkVoiceChannelStmt = db.prepare("SELECT id FROM channels WHERE id = ? AND type = 'voice'");

  function getPresence(): PresencePayload {
    const voiceParticipants: Record<string, string[]> = {};
    const statesObj: Record<string, VoiceUserState> = {};

    for (const [userId, state] of voiceStates.entries()) {
      statesObj[userId] = state;
      const list = voiceParticipants[state.channelId] ?? [];
      list.push(userId);
      voiceParticipants[state.channelId] = list;
    }

    return {
      onlineUserIds: Array.from(onlineSockets.keys()),
      voiceParticipants,
      voiceStates: statesObj,
    };
  }

  function broadcastPresence(): void {
    io.emit('presence:update', getPresence());
  }

  function emitTypingUpdate(channelId: string): void {
    const channelTypers = typingState.get(channelId);
    const userIds = channelTypers ? Array.from(channelTypers.keys()) : [];
    io.emit('typing:update', { channelId, userIds });
  }

  function clearUserTypingInChannel(channelId: string, userId: string): void {
    const channelTypers = typingState.get(channelId);
    if (!channelTypers) return;
    const timer = channelTypers.get(userId);
    if (timer) {
      clearTimeout(timer);
      channelTypers.delete(userId);
      if (channelTypers.size === 0) {
        typingState.delete(channelId);
      }
      emitTypingUpdate(channelId);
    }
  }

  function clearUserTypingAll(userId: string): void {
    for (const channelId of Array.from(typingState.keys())) {
      clearUserTypingInChannel(channelId, userId);
    }
  }

  io.use((socket, next) => {
    const rawToken = socket.handshake.auth?.token;
    const token = typeof rawToken === 'string' ? rawToken : null;
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    const user = auth.authenticateToken(token);
    if (!user) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    let sockets = onlineSockets.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      onlineSockets.set(userId, sockets);
    }
    sockets.add(socket.id);

    socket.emit('presence:update', getPresence());
    if (wasOffline) {
      broadcastPresence();
    }

    socket.on('typing:start', ({ channelId }) => {
      if (typeof channelId !== 'string' || !channelId) return;
      const valid = checkTextChannelStmt.get(channelId);
      if (!valid) return;

      let channelTypers = typingState.get(channelId);
      if (!channelTypers) {
        channelTypers = new Map();
        typingState.set(channelId, channelTypers);
      }

      const existingTimer = channelTypers.get(userId);
      const isNew = !existingTimer;
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        clearUserTypingInChannel(channelId, userId);
      }, TYPING_TTL_MS);
      channelTypers.set(userId, timer);

      if (isNew) {
        emitTypingUpdate(channelId);
      }
    });

    socket.on('typing:stop', ({ channelId }) => {
      if (typeof channelId !== 'string' || !channelId) return;
      clearUserTypingInChannel(channelId, userId);
    });

    socket.on('voice:state', (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if (payload.channelId === null) {
        if (voiceStates.delete(userId)) {
          broadcastPresence();
        }
        return;
      }

      if (typeof payload.channelId !== 'string' || !payload.channelId) return;
      const validVoice = checkVoiceChannelStmt.get(payload.channelId);
      if (!validVoice) return;

      voiceStates.set(userId, {
        userId,
        channelId: payload.channelId,
        muted: Boolean(payload.muted),
        deafened: Boolean(payload.deafened),
        screenSharing: Boolean(payload.screenSharing),
      });
      broadcastPresence();
    });

    socket.on('disconnect', () => {
      const userSockets = onlineSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineSockets.delete(userId);
          voiceStates.delete(userId);
          clearUserTypingAll(userId);
          broadcastPresence();
        }
      }
    });
  });

  return {
    io,
    getPresence,
    emitMessageNew(message) {
      clearUserTypingInChannel(message.channelId, message.authorId);
      io.emit('message:new', message);
    },
    emitMessageUpdated(message) {
      io.emit('message:updated', message);
    },
    emitMessageDeleted(channelId, messageId) {
      io.emit('message:deleted', { channelId, messageId });
    },
    emitChannelCreated(channel) {
      io.emit('channel:created', channel);
    },
    emitChannelUpdated(channel) {
      io.emit('channel:updated', channel);
    },
    emitChannelDeleted(channelId) {
      const channelTypers = typingState.get(channelId);
      if (channelTypers) {
        for (const timer of channelTypers.values()) {
          clearTimeout(timer);
        }
        typingState.delete(channelId);
      }
      let voiceChanged = false;
      for (const [uid, st] of voiceStates.entries()) {
        if (st.channelId === channelId) {
          voiceStates.delete(uid);
          voiceChanged = true;
        }
      }
      io.emit('channel:deleted', { channelId });
      if (voiceChanged) {
        broadcastPresence();
      }
    },
    emitUserJoined(user) {
      io.emit('user:joined', user);
    },
    async close() {
      for (const channelTypers of typingState.values()) {
        for (const timer of channelTypers.values()) {
          clearTimeout(timer);
        }
      }
      typingState.clear();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
