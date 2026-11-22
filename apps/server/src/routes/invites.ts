import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createInviteSchema } from '@concord/shared';
import { toInviteInfo, type InviteRow } from '../db.js';
import { parseBody, type RouteContext } from './helpers.js';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) {
    raw += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length]!;
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function registerInviteRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, auth } = ctx;

  fastify.get('/api/invites', async (req, reply) => {
    const admin = auth.requireAdmin(req, reply);
    if (!admin) return;

    const rows = db
      .prepare('SELECT * FROM invites ORDER BY created_at DESC')
      .all() as unknown as InviteRow[];

    return reply.send({ invites: rows.map(toInviteInfo) });
  });

  fastify.post('/api/invites', async (req, reply) => {
    const admin = auth.requireAdmin(req, reply);
    if (!admin) return;

    const input = parseBody(createInviteSchema, req.body ?? {}, reply);
    if (!input) return;

    let code = generateInviteCode();
    const checkStmt = db.prepare('SELECT code FROM invites WHERE code = ?');
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!checkStmt.get(code)) break;
      code = generateInviteCode();
    }

    const now = new Date();
    const expiresAt =
      input.expiresInHours != null
        ? new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000).toISOString()
        : null;

    db.prepare(
      'INSERT INTO invites (code, created_by, max_uses, uses, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)',
    ).run(code, admin.id, input.maxUses, expiresAt, now.toISOString());

    const row = db.prepare('SELECT * FROM invites WHERE code = ?').get(code) as unknown as InviteRow;
    return reply.code(201).send({ invite: toInviteInfo(row) });
  });

  fastify.delete('/api/invites/:code', async (req, reply) => {
    const admin = auth.requireAdmin(req, reply);
    if (!admin) return;

    const { code } = req.params as { code: string };
    const normalized = code.trim().toUpperCase();
    const result = db.prepare('DELETE FROM invites WHERE code = ?').run(normalized);
    if (result.changes === 0) {
      return reply.code(404).send({ error: 'Convite não encontrado.' });
    }
    return reply.send({ ok: true });
  });
}
