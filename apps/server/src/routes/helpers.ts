import type { DatabaseSync } from 'node:sqlite';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { AuthHelpers } from '../auth.js';
import type { LiveKitKeys, ServerConfig } from '../config.js';
import type { RealtimeHub } from '../realtime.js';

export interface RouteContext {
  db: DatabaseSync;
  config: ServerConfig;
  secret: string;
  livekitKeys: LiveKitKeys;
  auth: AuthHelpers;
  realtime: RealtimeHub;
}

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    void reply.code(400).send({ error: firstIssue?.message ?? 'Dados inválidos.' });
    return null;
  }
  return result.data;
}

export function handleRouteError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof HttpError) {
    void reply.code(error.statusCode).send({ error: error.message });
    return true;
  }
  return false;
}
