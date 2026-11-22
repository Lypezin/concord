import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessToken } from 'livekit-server-sdk';
import type { UserPublic } from '@concord/shared';
import type { LiveKitKeys, ServerConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface LiveKitSupervisor {
  startedByUs: boolean;
  configPath: string | null;
  nodeIp: string | null;
  stop: () => Promise<void>;
}

function isTailscaleCgnatIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 100 && b !== undefined && b >= 64 && b <= 127;
}

export function detectTailscaleIpv4(): string | null {
  const interfaces = os.networkInterfaces();
  // Pass 1: prefer explicit Tailscale interface
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || !/tailscale/i.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && isTailscaleCgnatIpv4(addr.address)) {
        return addr.address;
      }
    }
  }
  // Pass 2: fallback to any non-internal 100.64.0.0/10 address
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && isTailscaleCgnatIpv4(addr.address)) {
        return addr.address;
      }
    }
  }
  return null;
}

export function resolveLiveKitNodeIp(config: ServerConfig): string | null {
  if (config.livekitNodeIp && config.livekitNodeIp.trim().length > 0) {
    return config.livekitNodeIp.trim();
  }
  if (config.host !== '127.0.0.1') {
    return detectTailscaleIpv4();
  }
  return null;
}

export function resolveLiveKitBinaryPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../bin/livekit-server.exe'),
    path.resolve(process.cwd(), 'bin/livekit-server.exe'),
    path.resolve(process.cwd(), 'apps/server/bin/livekit-server.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function writeLiveKitConfig(config: ServerConfig, keys: LiveKitKeys): {
  yamlPath: string;
  nodeIp: string | null;
} {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const yamlPath = path.join(config.dataDir, 'livekit.yaml');
  const nodeIp = resolveLiveKitNodeIp(config);

  const lines = [
    `port: ${config.livekitPort}`,
    'log_level: warn',
    'rtc:',
    `  tcp_port: ${config.livekitTcpPort}`,
    `  udp_port: ${config.livekitUdpPort}`,
    '  use_external_ip: false',
  ];

  if (nodeIp) {
    lines.push(`  node_ip: "${nodeIp}"`);
  }

  lines.push('keys:');
  lines.push(`  ${keys.apiKey}: "${keys.apiSecret}"`);

  fs.writeFileSync(yamlPath, `${lines.join('\n')}\n`, 'utf8');
  return { yamlPath, nodeIp };
}

export async function checkLiveKitAvailable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(800),
    });
    return res.status >= 100 && res.status < 600;
  } catch {
    return false;
  }
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const fallbackTimer = setTimeout(() => {
      if (child.exitCode === null && child.pid) {
        if (process.platform === 'win32') {
          try {
            execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              stdio: 'ignore',
            });
          } catch {
            // ignore taskkill failure
          }
        } else {
          child.kill('SIGKILL');
        }
      }
      resolve();
    }, 1500);

    child.once('exit', () => {
      clearTimeout(fallbackTimer);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export async function createLiveKitSupervisor(
  config: ServerConfig,
  keys: LiveKitKeys,
): Promise<LiveKitSupervisor> {
  const resolvedNodeIp = resolveLiveKitNodeIp(config);

  if (!config.manageLiveKit) {
    return {
      startedByUs: false,
      configPath: null,
      nodeIp: resolvedNodeIp,
      stop: async () => undefined,
    };
  }

  const binPath = resolveLiveKitBinaryPath();
  if (!binPath) {
    console.warn(
      '[Concord Server] livekit-server.exe não encontrado em apps/server/bin/. Rode "npm run setup:livekit" para habilitar voz e tela.',
    );
    return {
      startedByUs: false,
      configPath: null,
      nodeIp: resolvedNodeIp,
      stop: async () => undefined,
    };
  }

  const alreadyRunning = await checkLiveKitAvailable(config.livekitPort);
  if (alreadyRunning) {
    console.warn(
      `[Concord Server] Aviso: LiveKit já estava rodando na porta ${config.livekitPort} (reaproveitando processo existente). Se amigos tiverem problemas de voz, encerre instâncias antigas de livekit-server.exe e reinicie o servidor.`,
    );
    return {
      startedByUs: false,
      configPath: null,
      nodeIp: resolvedNodeIp,
      stop: async () => undefined,
    };
  }

  const { yamlPath: configPath, nodeIp } = writeLiveKitConfig(config, keys);
  const child = spawn(binPath, ['--config', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let bootLogs = '';
  child.stdout?.on('data', (chunk) => {
    bootLogs += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    bootLogs += String(chunk);
  });

  const deadline = Date.now() + 5000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      break;
    }
    if (await checkLiveKitAvailable(config.livekitPort)) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!ready) {
    console.warn(
      `[Concord Server] Aviso: LiveKit não respondeu na porta ${config.livekitPort} dentro do esperado. ${bootLogs.trim()}`,
    );
  }

  return {
    startedByUs: true,
    configPath,
    nodeIp,
    stop: () => stopChildProcess(child),
  };
}

export async function generateLiveKitToken(
  keys: LiveKitKeys,
  user: UserPublic,
  roomName: string,
): Promise<string> {
  const at = new AccessToken(keys.apiKey, keys.apiSecret, {
    identity: user.id,
    name: user.displayName,
    metadata: JSON.stringify({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      role: user.role,
    }),
    ttl: '6h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}
