import type { FastifyInstance } from 'fastify';
import { updateProfileSchema } from '@concord/shared';
import { toUserPublic, type UserRow } from '../db.js';
import { parseBody, type RouteContext } from './helpers.js';

export function registerUserRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, auth, realtime } = ctx;

  fastify.get('/api/users', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const rows = db
      .prepare("SELECT * FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC")
      .all() as unknown as UserRow[];

    return reply.send({ users: rows.map(toUserPublic) });
  });

  fastify.patch('/api/users/me', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const input = parseBody(updateProfileSchema, req.body, reply);
    if (!input) return;

    db.prepare('UPDATE users SET display_name = ?, avatar_color = ? WHERE id = ?').run(
      input.displayName.trim(),
      input.avatarColor,
      user.id,
    );

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as UserRow;
    const updated = toUserPublic(row);
    realtime.emitUserUpdated(updated);
    return reply.send({ user: updated });
  });
}
