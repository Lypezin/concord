import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserPublic, UserRole } from '@concord/shared';
import { toUserPublic, type UserRow } from './db.js';

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) {
    return false;
  }
  try {
    const expected = Buffer.from(hexHash, 'hex');
    const actual = crypto.scryptSync(password, salt, 64);
    if (expected.length !== actual.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export interface TokenPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias

export function signToken(payload: { sub: string; role: UserRole }, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: TokenPayload = {
    sub: payload.sub,
    role: payload.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return null;
  }
  try {
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest();
    const actualSig = Buffer.from(sigB64, 'base64url');
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<TokenPayload>;
    if (
      typeof payload.sub !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'member') ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: FastifyRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1]! : null;
}

export interface AuthHelpers {
  authenticateToken: (token: string) => UserPublic | null;
  requireAuth: (req: FastifyRequest, reply: FastifyReply) => UserPublic | null;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => UserPublic | null;
}

export function createAuthHelpers(db: DatabaseSync, secret: string): AuthHelpers {
  const selectUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');

  function authenticateToken(token: string): UserPublic | null {
    const payload = verifyToken(token, secret);
    if (!payload) {
      return null;
    }
    const row = selectUserStmt.get(payload.sub) as unknown as UserRow | undefined;
    if (!row) {
      return null;
    }
    return toUserPublic(row);
  }

  function requireAuth(req: FastifyRequest, reply: FastifyReply): UserPublic | null {
    const token = extractBearerToken(req);
    if (!token) {
      void reply.code(401).send({ error: 'Sessão não autenticada. Faça login novamente.' });
      return null;
    }
    const user = authenticateToken(token);
    if (!user) {
      void reply.code(401).send({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
      return null;
    }
    return user;
  }

  function requireAdmin(req: FastifyRequest, reply: FastifyReply): UserPublic | null {
    const user = requireAuth(req, reply);
    if (!user) {
      return null;
    }
    if (user.role !== 'admin') {
      void reply.code(403).send({ error: 'Apenas o administrador do servidor pode fazer isso.' });
      return null;
    }
    return user;
  }

  return {
    authenticateToken,
    requireAuth,
    requireAdmin,
  };
}
