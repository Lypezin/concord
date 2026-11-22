import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { isImageMime, toAttachment, type AttachmentRow } from '../db.js';
import type { RouteContext } from './helpers.js';

const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function cleanupOrphanUploads(db: DatabaseSync, uploadsDir: string): void {
  try {
    const cutoff = new Date(Date.now() - ORPHAN_MAX_AGE_MS).toISOString();
    const rows = db
      .prepare('SELECT id, filename FROM attachments WHERE message_id IS NULL AND created_at < ?')
      .all(cutoff) as Array<{ id: string; filename: string }>;

    if (rows.length === 0) return;

    const deleteStmt = db.prepare('DELETE FROM attachments WHERE id = ?');
    for (const row of rows) {
      deleteStmt.run(row.id);
      try {
        fsSync.unlinkSync(path.join(uploadsDir, row.filename));
      } catch {
        // ignore missing file
      }
    }
  } catch {
    // non-fatal startup cleanup
  }
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const SAFE_FILENAME_RE = /^[a-f0-9]{32}(\.[a-z0-9]{1,8})?$/i;
const SAFE_EXT_RE = /^\.[a-z0-9]{1,8}$/i;

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
};

const BLOCKED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.js',
  '.mjs',
  '.cjs',
  '.vbs',
]);

function resolveSafeExtension(originalName: string, mimeType: string): string {
  const rawExt = path.extname(originalName).toLowerCase();
  if (rawExt && SAFE_EXT_RE.test(rawExt) && !BLOCKED_EXTENSIONS.has(rawExt)) {
    return rawExt;
  }
  const fromMime = MIME_TO_EXT[mimeType.toLowerCase()];
  if (fromMime) {
    return fromMime;
  }
  return '.bin';
}

function sanitizeDownloadName(name: string): string {
  const base = path.basename(name || 'arquivo').replace(/["\\\r\n;]/g, '_');
  return base.slice(0, 120) || 'arquivo';
}

export function registerUploadRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  const { db, config, auth } = ctx;

  fastify.post('/api/uploads', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    let part;
    try {
      part = await req.file({ limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 } });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'Arquivo excede o limite de 15 MB.' });
      }
      return reply.code(400).send({ error: 'Falha ao ler o arquivo enviado.' });
    }

    if (!part) {
      return reply.code(400).send({ error: 'Nenhum arquivo enviado.' });
    }

    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'Arquivo excede o limite de 15 MB.' });
      }
      return reply.code(400).send({ error: 'Não foi possível processar o arquivo.' });
    }

    if (part.file.truncated || buffer.length > MAX_FILE_SIZE_BYTES) {
      return reply.code(413).send({ error: 'Arquivo excede o limite de 15 MB.' });
    }

    if (buffer.length === 0) {
      return reply.code(400).send({ error: 'O arquivo enviado está vazio.' });
    }

    const id = crypto.randomUUID();
    const randomHex = crypto.randomBytes(16).toString('hex');
    const originalName = sanitizeDownloadName(part.filename || 'arquivo');
    const mimeType = (part.mimetype || 'application/octet-stream').split(';')[0]!.trim().toLowerCase();
    const ext = resolveSafeExtension(originalName, mimeType);
    const storedFilename = `${randomHex}${ext}`;
    const targetPath = path.join(config.uploadsDir, storedFilename);

    await fs.mkdir(config.uploadsDir, { recursive: true });
    await fs.writeFile(targetPath, buffer);

    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO attachments (id, message_id, uploader_id, filename, original_name, mime_type, size, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
    ).run(id, user.id, storedFilename, originalName, mimeType, buffer.length, now);

    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as unknown as AttachmentRow;
    return reply.code(201).send({ attachment: toAttachment(row) });
  });

  fastify.get('/api/uploads/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    if (!SAFE_FILENAME_RE.test(filename)) {
      return reply.code(400).send({ error: 'Nome de arquivo inválido.' });
    }

    const row = db
      .prepare('SELECT * FROM attachments WHERE filename = ?')
      .get(filename) as unknown as AttachmentRow | undefined;
    if (!row) {
      return reply.code(404).send({ error: 'Arquivo não encontrado.' });
    }

    const filePath = path.join(config.uploadsDir, row.filename);
    if (!fsSync.existsSync(filePath)) {
      return reply.code(404).send({ error: 'Arquivo não encontrado no disco.' });
    }

    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");

    if (isImageMime(row.mime_type)) {
      reply.type(row.mime_type);
      reply.header('Content-Disposition', 'inline');
    } else {
      reply.type('application/octet-stream');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${sanitizeDownloadName(row.original_name)}"`,
      );
    }

    return reply.send(fsSync.createReadStream(filePath));
  });

  fastify.delete('/api/uploads/:id', async (req, reply) => {
    const user = auth.requireAuth(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as unknown as
      | AttachmentRow
      | undefined;

    if (!row) {
      return reply.code(404).send({ error: 'Anexo não encontrado.' });
    }
    if (row.uploader_id !== user.id) {
      return reply.code(403).send({ error: 'Você só pode remover seus próprios anexos.' });
    }
    if (row.message_id !== null) {
      return reply.code(400).send({ error: 'Este anexo já está vinculado a uma mensagem.' });
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    await fs.unlink(path.join(config.uploadsDir, row.filename)).catch(() => undefined);
    return reply.send({ ok: true });
  });
}
