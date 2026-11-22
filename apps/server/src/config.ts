import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface LiveKitKeys {
  apiKey: string;
  apiSecret: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  uploadsDir: string;
  maxUsers: number;
  serverName: string;
  version: string;
  livekitPort: number;
  livekitTcpPort: number;
  livekitUdpPort: number;
  livekitPublicUrl?: string;
  livekitNodeIp?: string;
  manageLiveKit: boolean;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  maxUsers?: number;
  serverName?: string;
  livekitPort?: number;
  livekitTcpPort?: number;
  livekitUdpPort?: number;
  livekitPublicUrl?: string;
  livekitNodeIp?: string;
  manageLiveKit?: boolean;
}

export function loadServerConfig(options: ServerOptions = {}): ServerConfig {
  const dataDir = path.resolve(
    options.dataDir ?? process.env.CONCORD_DATA_DIR ?? path.join(process.cwd(), 'data'),
  );
  const uploadsDir = path.join(dataDir, 'uploads');

  return {
    port: options.port ?? Number(process.env.CONCORD_PORT ?? process.env.PORT ?? 3000),
    host: options.host ?? process.env.CONCORD_HOST ?? '0.0.0.0',
    dataDir,
    uploadsDir,
    maxUsers: options.maxUsers ?? Number(process.env.CONCORD_MAX_USERS ?? 4),
    serverName: options.serverName ?? process.env.CONCORD_SERVER_NAME ?? 'Concord',
    version: '0.3.1',
    livekitPort: options.livekitPort ?? Number(process.env.CONCORD_LIVEKIT_PORT ?? 7880),
    livekitTcpPort: options.livekitTcpPort ?? Number(process.env.CONCORD_LIVEKIT_TCP_PORT ?? 7881),
    livekitUdpPort: options.livekitUdpPort ?? Number(process.env.CONCORD_LIVEKIT_UDP_PORT ?? 7882),
    livekitPublicUrl: options.livekitPublicUrl ?? process.env.CONCORD_LIVEKIT_PUBLIC_URL,
    livekitNodeIp: options.livekitNodeIp ?? process.env.CONCORD_LIVEKIT_NODE_IP,
    manageLiveKit:
      options.manageLiveKit ?? (process.env.CONCORD_MANAGED_LIVEKIT !== 'false'),
  };
}

export function getOrCreateSecret(dataDir: string): string {
  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, 'server.secret');
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) {
      return existing;
    }
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export function getOrCreateLiveKitKeys(dataDir: string): LiveKitKeys {
  fs.mkdirSync(dataDir, { recursive: true });
  const keysPath = path.join(dataDir, 'livekit.keys.json');
  if (fs.existsSync(keysPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(keysPath, 'utf8')) as Partial<LiveKitKeys>;
      if (
        typeof parsed.apiKey === 'string' &&
        parsed.apiKey.length >= 8 &&
        typeof parsed.apiSecret === 'string' &&
        parsed.apiSecret.length >= 32
      ) {
        return { apiKey: parsed.apiKey, apiSecret: parsed.apiSecret };
      }
    } catch {
      // regenerate below
    }
  }
  const keys: LiveKitKeys = {
    apiKey: `concord_${crypto.randomBytes(6).toString('hex')}`,
    apiSecret: crypto.randomBytes(32).toString('hex'),
  };
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2), { encoding: 'utf8', mode: 0o600 });
  return keys;
}
