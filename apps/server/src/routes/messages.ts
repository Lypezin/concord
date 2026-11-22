import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  createMessageSchema,
  editMessageSchema,
  toggleReactionSchema,
  type MessagesPage,
} from '@concord/shared';
import {
  getMessageById,
  hydrateMessages,
  withTransaction,
  type AttachmentRow,
  type ChannelRow,
  type MessageRow,
} from '../db.js';
import { handleRouteError, HttpError, parseBody, type RouteContext } from './helpers.js';

export function registerMessageRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, config, auth, realtime } = ctx;

  fastify.get('/api/channels/:id/messages', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id: channelId } = req.params as { id: string };
    const query = req.query as { before?: string; limit?: string };

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as unknown as
      | ChannelRow
      | undefined;
    if (!channel || channel.type !== 'text') {
      return reply.code(404).send({ error: 'Canal de texto não encontrado.' });
    }

    const parsedLimit = Number.parseInt(query.limit ?? '50', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

    let rows: MessageRow[];
    if (query.before && typeof query.before === 'string') {
      const cursor = db
        .prepare('SELECT created_at, id FROM messages WHERE id = ? AND channel_id = ?')
        .get(query.before, channelId) as { created_at: string; id: string } | undefined;

      if (!cursor) {
        return reply.send({ messages: [], hasMore: false } satisfies MessagesPage);
      }

      rows = db
        .prepare(
          `SELECT * FROM messages
           WHERE channel_id = ?
             AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(channelId, cursor.created_at, cursor.created_at, cursor.id, limit + 1) as unknown as MessageRow[];
    } else {
      rows = db
        .prepare(
          `SELECT * FROM messages
           WHERE channel_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(channelId, limit + 1) as unknown as MessageRow[];
    }

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit).reverse();
    const messages = hydrateMessages(db, pageRows);

    return reply.send({ messages, hasMore } satisfies MessagesPage);
  });

  fastify.post('/api/channels/:id/messages', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id: channelId } = req.params as { id: string };
    const input = parseBody(createMessageSchema, req.body, reply);
    if (!input) return;

    const attachmentIds = input.attachmentIds ? [...new Set(input.attachmentIds)] : [];

    try {
      const messageId = withTransaction(db, () => {
        const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as unknown as
          | ChannelRow
          | undefined;
        if (!channel || channel.type !== 'text') {
          throw new HttpError(404, 'Canal de texto não encontrado.');
        }

        if (attachmentIds.length > 0) {
          const placeholders = attachmentIds.map(() => '?').join(',');
          const rows = db
            .prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`)
            .all(...attachmentIds) as unknown as AttachmentRow[];

          if (rows.length !== attachmentIds.length) {
            throw new HttpError(400, 'Um ou mais anexos não foram encontrados.');
          }
          for (const att of rows) {
            if (att.uploader_id !== user.id || att.message_id !== null) {
              throw new HttpError(403, 'Anexo inválido ou já utilizado.');
            }
          }
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const trimmedContent = input.content.trim();

        db.prepare(
          'INSERT INTO messages (id, channel_id, author_id, content, edited_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
        ).run(id, channelId, user.id, trimmedContent, now);

        if (attachmentIds.length > 0) {
          const updateAtt = db.prepare('UPDATE attachments SET message_id = ? WHERE id = ?');
          for (const attId of attachmentIds) {
            updateAtt.run(id, attId);
          }
        }

        return id;
      });

      const message = getMessageById(db, messageId)!;
      realtime.emitMessageNew(message);
      return reply.code(201).send({ message });
    } catch (error) {
      if (handleRouteError(error, reply)) return;
      throw error;
    }
  });

  fastify.patch('/api/messages/:id', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const input = parseBody(editMessageSchema, req.body, reply);
    if (!input) return;

    const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as
      | MessageRow
      | undefined;
    if (!existing) {
      return reply.code(404).send({ error: 'Mensagem não encontrada.' });
    }
    if (existing.author_id !== user.id) {
      return reply.code(403).send({ error: 'Você só pode editar suas próprias mensagens.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(
      input.content.trim(),
      now,
      id,
    );

    const updated = getMessageById(db, id)!;
    realtime.emitMessageUpdated(updated);
    return reply.send({ message: updated });
  });

  fastify.delete('/api/messages/:id', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    try {
      const { channelId, filenames } = withTransaction(db, () => {
        const existing = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as unknown as
          | MessageRow
          | undefined;
        if (!existing) {
          throw new HttpError(404, 'Mensagem não encontrada.');
        }
        if (existing.author_id !== user.id && user.role !== 'admin') {
          throw new HttpError(403, 'Você não tem permissão para excluir esta mensagem.');
        }

        const attRows = db
          .prepare('SELECT filename FROM attachments WHERE message_id = ?')
          .all(id) as Array<{ filename: string }>;

        db.prepare('DELETE FROM messages WHERE id = ?').run(id);
        return {
          channelId: existing.channel_id,
          filenames: attRows.map((a) => a.filename),
        };
      });

      for (const filename of filenames) {
        await fs.unlink(path.join(config.uploadsDir, filename)).catch(() => undefined);
      }

      realtime.emitMessageDeleted(channelId, id);
      return reply.send({ ok: true });
    } catch (error) {
      if (handleRouteError(error, reply)) return;
      throw error;
    }
  });

  fastify.post('/api/messages/:id/reactions', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const input = parseBody(toggleReactionSchema, req.body, reply);
    if (!input) return;

    const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(id) as { id: string } | undefined;
    if (!existing) {
      return reply.code(404).send({ error: 'Mensagem não encontrada.' });
    }

    const emoji = input.emoji.trim();
    withTransaction(db, () => {
      const alreadyReacted = db
        .prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
        .get(id, user.id, emoji);

      if (alreadyReacted) {
        db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(
          id,
          user.id,
          emoji,
        );
      } else {
        db.prepare(
          'INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
        ).run(id, user.id, emoji, new Date().toISOString());
      }
    });

    const updated = getMessageById(db, id)!;
    realtime.emitMessageUpdated(updated);
    return reply.send({ message: updated });
  });
}
