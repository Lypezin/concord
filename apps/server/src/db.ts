import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Attachment,
  Channel,
  ChannelType,
  InviteInfo,
  Message,
  MessageReplySummary,
  ReactionSummary,
  UserPublic,
  UserRole,
} from '@concord/shared';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_color: string;
  role: UserRole;
  created_at: string;
}

export interface InviteRow {
  code: string;
  created_by: string;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface ChannelRow {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
  created_at: string;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  reply_to_id?: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  uploader_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export function toUserPublic(row: UserRow): UserPublic {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function toChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    url: `/api/uploads/${row.filename}`,
    isImage: isImageMime(row.mime_type),
  };
}

export function toInviteInfo(row: InviteRow): InviteInfo {
  return {
    code: row.code,
    createdBy: row.created_by,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure if already rolled back
    }
    throw error;
  }
}

export function createDatabase(dataDir: string, uploadsDir: string): DatabaseSync {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  const dbPath = path.join(dataDir, 'concord.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE COLLATE NOCASE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_uses INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'voice', 'dm')),
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      edited_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created
      ON messages(channel_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_message
      ON attachments(message_id);

    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );
  `);

  // Migração segura para bancos existentes criados antes da v0.6.0
  const msgCols = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  if (!msgCols.some((c) => c.name === 'reply_to_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL');
  }

  const countRow = db.prepare('SELECT COUNT(*) AS count FROM channels').get() as { count: number };
  if (countRow.count === 0) {
    const now = new Date().toISOString();
    const insertChannel = db.prepare(
      'INSERT INTO channels (id, name, type, position, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const seedChannels: Array<{ name: string; type: ChannelType; position: number }> = [
      { name: 'geral', type: 'text', position: 0 },
      { name: 'jogos', type: 'text', position: 1 },
      { name: 'Call Principal', type: 'voice', position: 2 },
      { name: 'AFK', type: 'voice', position: 3 },
    ];
    for (const ch of seedChannels) {
      insertChannel.run(crypto.randomUUID(), ch.name, ch.type, ch.position, now);
    }
  }

  return db;
}

export function hydrateMessages(db: DatabaseSync, messageRows: MessageRow[]): Message[] {
  if (messageRows.length === 0) {
    return [];
  }

  const replyIds = [
    ...new Set(
      messageRows
        .map((m) => m.reply_to_id)
        .filter((rid): rid is string => typeof rid === 'string' && rid.length > 0),
    ),
  ];

  const replyRows =
    replyIds.length > 0
      ? (db
          .prepare(
            `SELECT id, author_id, content FROM messages WHERE id IN (${replyIds.map(() => '?').join(',')})`,
          )
          .all(...replyIds) as unknown as Array<{
          id: string;
          author_id: string;
          content: string;
        }>)
      : [];

  const replyAttachmentIds = new Set<string>();
  if (replyRows.length > 0) {
    const rPlaceholders = replyRows.map(() => '?').join(',');
    const rAttRows = db
      .prepare(`SELECT DISTINCT message_id FROM attachments WHERE message_id IN (${rPlaceholders})`)
      .all(...replyRows.map((r) => r.id)) as Array<{ message_id: string }>;
    for (const r of rAttRows) {
      if (r.message_id) replyAttachmentIds.add(r.message_id);
    }
  }

  const authorIds = [
    ...new Set([...messageRows.map((m) => m.author_id), ...replyRows.map((r) => r.author_id)]),
  ];
  const messageIds = messageRows.map((m) => m.id);

  const authorPlaceholders = authorIds.map(() => '?').join(',');
  const userRows = db
    .prepare(`SELECT * FROM users WHERE id IN (${authorPlaceholders})`)
    .all(...authorIds) as unknown as UserRow[];
  const userMap = new Map<string, UserPublic>();
  for (const u of userRows) {
    userMap.set(u.id, toUserPublic(u));
  }

  const replyMap = new Map<string, MessageReplySummary>();
  for (const rr of replyRows) {
    const replyAuthor = userMap.get(rr.author_id);
    replyMap.set(rr.id, {
      id: rr.id,
      authorId: rr.author_id,
      authorName: replyAuthor?.displayName ?? 'Usuário',
      authorColor: replyAuthor?.avatarColor ?? '#6366f1',
      content: rr.content,
      hasAttachments: replyAttachmentIds.has(rr.id),
    });
  }

  const msgPlaceholders = messageIds.map(() => '?').join(',');
  const attachmentRows = db
    .prepare(`SELECT * FROM attachments WHERE message_id IN (${msgPlaceholders}) ORDER BY created_at ASC`)
    .all(...messageIds) as unknown as AttachmentRow[];
  const attachmentMap = new Map<string, Attachment[]>();
  for (const att of attachmentRows) {
    if (!att.message_id) continue;
    const list = attachmentMap.get(att.message_id) ?? [];
    list.push(toAttachment(att));
    attachmentMap.set(att.message_id, list);
  }

  const reactionRows = db
    .prepare(`SELECT * FROM reactions WHERE message_id IN (${msgPlaceholders}) ORDER BY created_at ASC`)
    .all(...messageIds) as unknown as ReactionRow[];
  const reactionMap = new Map<string, Map<string, string[]>>();
  for (const r of reactionRows) {
    let byEmoji = reactionMap.get(r.message_id);
    if (!byEmoji) {
      byEmoji = new Map();
      reactionMap.set(r.message_id, byEmoji);
    }
    const users = byEmoji.get(r.emoji) ?? [];
    users.push(r.user_id);
    byEmoji.set(r.emoji, users);
  }

  return messageRows.map((row) => {
    const author = userMap.get(row.author_id) ?? {
      id: row.author_id,
      username: 'usuario',
      displayName: 'Usuário',
      avatarColor: '#6366f1',
      role: 'member' as UserRole,
      createdAt: row.created_at,
    };

    const byEmoji = reactionMap.get(row.id);
    const reactions: ReactionSummary[] = byEmoji
      ? Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({ emoji, userIds }))
      : [];

    return {
      id: row.id,
      channelId: row.channel_id,
      authorId: row.author_id,
      author,
      content: row.content,
      attachments: attachmentMap.get(row.id) ?? [],
      reactions,
      replyToId: row.reply_to_id ?? null,
      replyTo: row.reply_to_id ? (replyMap.get(row.reply_to_id) ?? null) : null,
      editedAt: row.edited_at,
      createdAt: row.created_at,
    };
  });
}

export function getMessageById(db: DatabaseSync, messageId: string): Message | null {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown as
    | MessageRow
    | undefined;
  if (!row) {
    return null;
  }
  const hydrated = hydrateMessages(db, [row]);
  return hydrated[0] ?? null;
}
