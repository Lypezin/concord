import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'apps', 'server', 'bin');
const targetExe = path.join(binDir, 'livekit-server.exe');

const FALLBACK_VERSION = '1.13.11';

async function resolveDownloadInfo() {
  try {
    const res = await fetch('https://api.github.com/repos/livekit/livekit/releases/latest', {
      headers: { 'User-Agent': 'concord-setup' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      const asset = (json.assets || []).find(
        (a) => typeof a.name === 'string' && /windows_amd64\.zip$/i.test(a.name),
      );
      if (asset?.browser_download_url) {
        return {
          version: String(json.tag_name || FALLBACK_VERSION),
          url: String(asset.browser_download_url),
        };
      }
    }
  } catch {
    // fallback abaixo
  }

  return {
    version: `v${FALLBACK_VERSION}`,
    url: `https://github.com/livekit/livekit/releases/download/v${FALLBACK_VERSION}/livekit_${FALLBACK_VERSION}_windows_amd64.zip`,
  };
}

function findExeRecursive(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findExeRecursive(full);
      if (found) return found;
    } else if (/^livekit-server\.exe$/i.test(entry.name)) {
      return full;
    }
  }
  return null;
}

export async function ensureLiveKitBinary() {
  if (fs.existsSync(targetExe)) {
    return targetExe;
  }

  fs.mkdirSync(binDir, { recursive: true });
  const info = await resolveDownloadInfo();
  console.log(`[Concord Setup] Baixando LiveKit Server ${info.version} para Windows...`);

  const res = await fetch(info.url, {
    headers: { 'User-Agent': 'concord-setup' },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar LiveKit (${res.status} ${res.statusText})`);
  }

  const zipBytes = Buffer.from(await res.arrayBuffer());
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concord-lk-'));
  const zipPath = path.join(tmpDir, 'livekit.zip');
  const extractDir = path.join(tmpDir, 'extracted');

  try {
    fs.writeFileSync(zipPath, zipBytes);
    fs.mkdirSync(extractDir, { recursive: true });

    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );

    const exePath = findExeRecursive(extractDir);
    if (!exePath) {
      throw new Error('livekit-server.exe não encontrado dentro do arquivo compactado.');
    }

    fs.copyFileSync(exePath, targetExe);
    console.log(`[Concord Setup] livekit-server.exe salvo em ${targetExe}`);
    return targetExe;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureLiveKitBinary()
    .then((exe) => {
      try {
        const out = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim();
        console.log(`[Concord Setup] Verificado: ${out}`);
      } catch {
        console.log(`[Concord Setup] Pronto em ${exe}`);
      }
    })
    .catch((err) => {
      console.error('[Concord Setup] Erro:', err);
      process.exit(1);
    });
}
