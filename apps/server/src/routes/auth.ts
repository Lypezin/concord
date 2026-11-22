import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  loginSchema,
  registerSchema,
  setupAdminSchema,
  type AuthResponse,
  type BootstrapStatus,
} from '@concord/shared';
import { hashPassword, pickAvatarColor, signToken, verifyPassword } from '../auth.js';
import { toUserPublic, withTransaction, type InviteRow, type UserRow } from '../db.js';
import { handleRouteError, HttpError, parseBody, type RouteContext } from './helpers.js';

export function registerAuthRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, config, secret, auth, realtime } = ctx;

  fastify.get('/api/bootstrap-status', async (): Promise<BootstrapStatus> => {
    const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    return {
      serverName: config.serverName,
      needsAdminSetup: row.count === 0,
      userCount: row.count,
      maxUsers: config.maxUsers,
      version: config.version,
    };
  });

  fastify.post(
    '/api/auth/setup-admin',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(setupAdminSchema, req.body, reply);
      if (!input) return;

      try {
        const user = withTransaction(db, () => {
          const countRow = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
          if (countRow.count > 0) {
            throw new HttpError(403, 'O servidor já possui um administrador configurado.');
          }

          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const passwordHash = hashPassword(input.password);
          const avatarColor = pickAvatarColor(input.username.toLowerCase());

          db.prepare(
            'INSERT INTO users (id, username, display_name, password_hash, avatar_color, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(id, input.username, input.displayName, passwordHash, avatarColor, 'admin', now);

          const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
          return toUserPublic(row);
        });

        const token = signToken({ sub: user.id, role: user.role }, secret);
        const response: AuthResponse = { token, user };
        return reply.code(201).send(response);
      } catch (error) {
        if (handleRouteError(error, reply)) return;
        throw error;
      }
    },
  );

  fastify.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(registerSchema, req.body, reply);
      if (!input) return;

      const normalizedCode = input.inviteCode.trim().toUpperCase();

      try {
        const user = withTransaction(db, () => {
          const countRow = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
          if (countRow.count === 0) {
            throw new HttpError(400, 'O servidor ainda precisa da configuração inicial do administrador.');
          }
          if (countRow.count >= config.maxUsers) {
            throw new HttpError(
              403,
              `Este servidor atingiu o limite máximo de ${config.maxUsers} membros.`,
            );
          }

          const invite = db
            .prepare('SELECT * FROM invites WHERE code = ?')
            .get(normalizedCode) as unknown as InviteRow | undefined;
          if (!invite) {
            throw new HttpError(400, 'Código de convite inválido.');
          }
          if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) {
            throw new HttpError(400, 'Este código de convite expirou.');
          }
          if (invite.uses >= invite.max_uses) {
            throw new HttpError(400, 'Este código de convite já atingiu o limite de usos.');
          }

          const existing = db
            .prepare('SELECT id FROM users WHERE username = ?')
            .get(input.username) as { id: string } | undefined;
          if (existing) {
            throw new HttpError(409, 'Este nome de usuário já está em uso.');
          }

          db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(normalizedCode);

          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const passwordHash = hashPassword(input.password);
          const avatarColor = pickAvatarColor(input.username.toLowerCase());

          db.prepare(
            'INSERT INTO users (id, username, display_name, password_hash, avatar_color, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(id, input.username, input.displayName, passwordHash, avatarColor, 'member', now);

          const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
          return toUserPublic(row);
        });

        realtime.emitUserJoined(user);
        const token = signToken({ sub: user.id, role: user.role }, secret);
        const response: AuthResponse = { token, user };
        return reply.code(201).send(response);
      } catch (error) {
        if (handleRouteError(error, reply)) return;
        throw error;
      }
    },
  );

  fastify.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(loginSchema, req.body, reply);
      if (!input) return;

      const row = db
        .prepare('SELECT * FROM users WHERE username = ?')
        .get(input.username) as unknown as UserRow | undefined;

      if (!row || !verifyPassword(input.password, row.password_hash)) {
        return reply.code(401).send({ error: 'Usuário ou senha incorretos.' });
      }

      const user = toUserPublic(row);
      const token = signToken({ sub: user.id, role: user.role }, secret);
      const response: AuthResponse = { token, user };
      return reply.send(response);
    },
  );

  fastify.get('/api/auth/me', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;
    return reply.send({ user });
  });
}
