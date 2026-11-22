import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@concord/shared';
import { normalizeServerUrl } from './api.js';

export type ConcordSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type SocketConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export function createConcordSocket(serverUrl: string, token: string): ConcordSocket {
  return io(normalizeServerUrl(serverUrl), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
