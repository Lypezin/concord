import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLiveKitBinary } from './ensure-livekit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function isTailscaleCgnatIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 100 && b !== undefined && b >= 64 && b <= 127;
}

function detectTailscaleIp() {
  const interfaces = os.networkInterfaces();

  // Pass 1: prefer explicit Tailscale network adapter
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

async function main() {
  await ensureLiveKitBinary();

  const sharedDist = path.join(rootDir, 'packages', 'shared', 'dist', 'index.js');
  const serverDist = path.join(rootDir, 'apps', 'server', 'dist', 'index.js');

  if (!fs.existsSync(sharedDist) || !fs.existsSync(serverDist)) {
    console.log('[Concord Host] Compilando servidor pela primeira vez...');
    execSync('npm run build:shared && npm run build -w @concord/server', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  }

  const port = process.env.CONCORD_PORT || '3000';
  const lkPort = process.env.CONCORD_LIVEKIT_PORT || '7880';
  const lkTcpPort = process.env.CONCORD_LIVEKIT_TCP_PORT || '7881';
  const lkUdpPort = process.env.CONCORD_LIVEKIT_UDP_PORT || '7882';
  const dataDir = process.env.CONCORD_DATA_DIR || path.join(rootDir, 'apps', 'server', 'data');
  const tsIp = detectTailscaleIp();

  console.log('');
  console.log('======================================================');
  console.log('                 CONCORD SERVER ONLINE                ');
  console.log('======================================================');
  console.log(`  Localhost      : http://127.0.0.1:${port}`);
  if (tsIp) {
    console.log(`  Tailscale      : http://${tsIp}:${port}  <-- envie este para seus amigos`);
  } else {
    console.log('  Tailscale      : nao detectado (rode o Tailscale para seus amigos entrarem)');
  }
  console.log(`  LiveKit        : ws://127.0.0.1:${lkPort} (UDP ${lkUdpPort} / TCP ${lkTcpPort})`);
  console.log(`  LiveKit ICE IP : ${process.env.CONCORD_LIVEKIT_NODE_IP || tsIp || 'auto'}`);
  console.log(`  Dados          : ${dataDir}`);
  console.log('------------------------------------------------------');
  console.log('  Se um amigo nao conseguir conectar, execute Liberar-Firewall-Concord.bat uma vez.');
  console.log('  Pressione Ctrl+C para desligar o servidor com seguranca.');
  console.log('======================================================');
  console.log('');

  const child = spawn(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', serverDist],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        CONCORD_DATA_DIR: dataDir,
      },
    },
  );

  const forwardSignal = (sig) => {
    if (child.exitCode === null) {
      child.kill(sig);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[Concord Host] Erro ao iniciar:', err);
  process.exit(1);
});
