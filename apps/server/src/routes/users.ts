import type { FastifyInstance } from 'fastify';
import { toUserPublic, type UserRow } from '../db.js';
import type { RouteContext } from './helpers.js';

export function registerUserRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, auth } = ctx;

  fastify.get('/api/users', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const rows = db
      .prepare("SELECT * FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC")
      .all() as unknown as UserRow[];

    return reply.send({ users: rows.map(toUserPublic) });
  });
}
