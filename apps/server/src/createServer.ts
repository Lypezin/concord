import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAuthHelpers } from './auth.js';
import {
  getOrCreateLiveKitKeys,
  getOrCreateSecret,
  loadServerConfig,
  type ServerConfig,
  type ServerOptions,
} from './config.js';
import { createDatabase } from './db.js';
import { createLiveKitSupervisor, type LiveKitSupervisor } from './livekit.js';
import { createRealtime, type RealtimeHub } from './realtime.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChannelRoutes } from './routes/channels.js';
import type { RouteContext } from './routes/helpers.js';
import { registerInviteRoutes } from './routes/invites.js';
import { registerMessageRoutes } from './routes/messages.js';
import { cleanupOrphanUploads, registerUploadRoutes } from './routes/uploads.js';
import { registerUserRoutes } from './routes/users.js';
import { registerVoiceRoutes } from './routes/voice.js';

export interface ConcordServerInstance {
  fastify: FastifyInstance;
  realtime: RealtimeHub;
  livekit: LiveKitSupervisor;
  config: ServerConfig;
  address: string;
  port: number;
  close: () => Promise<void>;
}

export async function createConcordServer(options: ServerOptions = {}): Promise<ConcordServerInstance> {
  const config = loadServerConfig(options);
  const secret = getOrCreateSecret(config.dataDir);
  const livekitKeys = getOrCreateLiveKitKeys(config.dataDir);
  const db = createDatabase(config.dataDir, config.uploadsDir);
  cleanupOrphanUploads(db, config.uploadsDir);
  const livekit = await createLiveKitSupervisor(config, livekitKeys);

  const fastify = Fastify({
    logger: false,
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(rateLimit, {
    global: false,
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 1,
    },
  });

  const auth = createAuthHelpers(db, secret);
  const realtime = createRealtime(fastify, db, auth);

  const ctx: RouteContext = {
    db,
    config,
    secret,
    livekitKeys,
    auth,
    realtime,
  };

  fastify.get('/health', async () => ({
    ok: true,
    name: config.serverName,
    version: config.version,
  }));

  registerAuthRoutes(fastify, ctx);
  registerUserRoutes(fastify, ctx);
  registerInviteRoutes(fastify, ctx);
  registerChannelRoutes(fastify, ctx);
  registerUploadRoutes(fastify, ctx);
  registerMessageRoutes(fastify, ctx);
  registerVoiceRoutes(fastify, ctx);

  await fastify.listen({
    port: config.port,
    host: config.host,
  });

  const addrInfo = fastify.server.address();
  const actualPort = typeof addrInfo === 'object' && addrInfo ? addrInfo.port : config.port;
  const displayHost = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
  const address = `http://${displayHost}:${actualPort}`;

  let closed = false;
  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await realtime.close();
    await fastify.close();
    await livekit.stop();
    db.close();
  }

  return {
    fastify,
    realtime,
    livekit,
    config,
    address,
    port: actualPort,
    close,
  };
}
