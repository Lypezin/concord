import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createChannelSchema, updateChannelSchema } from '@concord/shared';
import { toChannel, withTransaction, type ChannelRow } from '../db.js';
import { handleRouteError, HttpError, parseBody, type RouteContext } from './helpers.js';

function cleanChannelName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function registerChannelRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, config, auth, realtime } = ctx;

  fastify.get('/api/channels', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const rows = db
      .prepare('SELECT * FROM channels ORDER BY position ASC, created_at ASC')
      .all() as unknown as ChannelRow[];

    return reply.send({ channels: rows.map(toChannel) });
  });

  fastify.post('/api/channels', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const input = parseBody(createChannelSchema, req.body, reply);
    if (!input) return;

    const name = cleanChannelName(input.name);
    if (!name) {
      return reply.code(400).send({ error: 'Nome do canal inválido.' });
    }

    const posRow = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM channels')
      .get() as { maxPos: number };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const position = posRow.maxPos + 1;

    db.prepare(
      'INSERT INTO channels (id, name, type, position, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, name, input.type, position, now);

    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as unknown as ChannelRow;
    const channel = toChannel(row);
    realtime.emitChannelCreated(channel);
    return reply.code(201).send({ channel });
  });

  fastify.patch('/api/channels/:id', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const input = parseBody(updateChannelSchema, req.body, reply);
    if (!input) return;

    const name = cleanChannelName(input.name);
    if (!name) {
      return reply.code(400).send({ error: 'Nome do canal inválido.' });
    }

    const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as unknown as
      | ChannelRow
      | undefined;
    if (!existing) {
      return reply.code(404).send({ error: 'Canal não encontrado.' });
    }

    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, id);
    const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as unknown as ChannelRow;
    const channel = toChannel(updated);
    realtime.emitChannelUpdated(channel);
    return reply.send({ channel });
  });

  fastify.delete('/api/channels/:id', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    try {
      const attachmentFiles = withTransaction(db, () => {
        const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as unknown as
          | ChannelRow
          | undefined;
        if (!existing) {
          throw new HttpError(404, 'Canal não encontrado.');
        }

        if (existing.type === 'text') {
          const textCount = db
            .prepare("SELECT COUNT(*) AS count FROM channels WHERE type = 'text'")
            .get() as { count: number };
          if (textCount.count <= 1) {
            throw new HttpError(400, 'Não é possível excluir o único canal de texto do servidor.');
          }
        }

        const files = db
          .prepare(
            'SELECT a.filename FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.channel_id = ?',
          )
          .all(id) as Array<{ filename: string }>;

        db.prepare('DELETE FROM channels WHERE id = ?').run(id);
        return files.map((f) => f.filename);
      });

      for (const filename of attachmentFiles) {
        await fs.unlink(path.join(config.uploadsDir, filename)).catch(() => undefined);
      }

      realtime.emitChannelDeleted(id);
      return reply.send({ ok: true });
    } catch (error) {
      if (handleRouteError(error, reply)) return;
      throw error;
    }
  });
}
