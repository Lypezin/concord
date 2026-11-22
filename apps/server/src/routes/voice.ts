import type { FastifyInstance } from 'fastify';
import { voiceTokenSchema, type VoiceStatusResponse, type VoiceTokenResponse } from '@concord/shared';
import type { ChannelRow } from '../db.js';
import { checkLiveKitAvailable, generateLiveKitToken } from '../livekit.js';
import { parseBody, type RouteContext } from './helpers.js';

function resolveClientLiveKitUrl(
  configuredUrl: string | undefined,
  requestHostHeader: string | undefined,
  livekitPort: number,
  isHttps: boolean,
): string {
  if (configuredUrl && configuredUrl.trim().length > 0) {
    return configuredUrl.trim().replace(/\/+$/, '');
  }

  let hostname = '127.0.0.1';
  if (requestHostHeader) {
    const hostWithoutPort = requestHostHeader.startsWith('[')
      ? requestHostHeader.replace(/:\d+$/, '')
      : requestHostHeader.split(':')[0];
    if (hostWithoutPort) {
      hostname = hostWithoutPort;
    }
  }

  const protocol = isHttps ? 'wss' : 'ws';
  return `${protocol}://${hostname}:${livekitPort}`;
}

export function registerVoiceRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, config, livekitKeys, auth } = ctx;

  fastify.get('/api/voice/status', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const available = await checkLiveKitAvailable(config.livekitPort);
    const response: VoiceStatusResponse = {
      available,
      livekitPort: config.livekitPort,
    };
    return reply.send(response);
  });

  fastify.post('/api/voice/token', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const input = parseBody(voiceTokenSchema, req.body, reply);
    if (!input) return;

    const channel = db
      .prepare('SELECT * FROM channels WHERE id = ?')
      .get(input.channelId) as unknown as ChannelRow | undefined;
    if (!channel || channel.type !== 'voice') {
      return reply.code(404).send({ error: 'Canal de voz não encontrado.' });
    }

    const available = await checkLiveKitAvailable(config.livekitPort);
    if (!available) {
      return reply.code(503).send({
        error:
          'Servidor de voz (LiveKit) não está ativo. Execute "npm run setup:livekit" e reinicie o servidor.',
      });
    }

    const token = await generateLiveKitToken(livekitKeys, user, channel.id);
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isHttps = req.protocol === 'https' || forwardedProto === 'https';
    const url = resolveClientLiveKitUrl(
      config.livekitPublicUrl,
      req.headers.host,
      config.livekitPort,
      isHttps,
    );

    const response: VoiceTokenResponse = {
      token,
      url,
      roomName: channel.id,
    };
    return reply.send(response);
  });
}
