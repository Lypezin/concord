import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TailscaleStatus {
  installed: boolean;
  connected: boolean;
  selfIp?: string;
  hostName?: string;
}

export interface TailscaleProgress {
  stage: 'checking' | 'downloading' | 'installing' | 'connecting' | 'done' | 'error';
  percent?: number;
  message: string;
}

const VALID_AUTH_KEY_RE = /^tskey-auth-[a-zA-Z0-9_-]+$/;

function findTailscaleExe(): { exePath: string; fileExists: boolean } {
  const candidates = [
    'C:\\Program Files\\Tailscale\\tailscale.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  return {
    exePath: found ?? 'tailscale',
    fileExists: Boolean(found),
  };
}

export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const { exePath, fileExists } = findTailscaleExe();

  return new Promise((resolve) => {
    execFile(exePath, ['status', '--json'], { timeout: 3500 }, (error, stdout) => {
      if (error) {
        const notInstalled =
          !fileExists && ((error as NodeJS.ErrnoException).code === 'ENOENT' || !stdout);
        resolve({ installed: !notInstalled, connected: false });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as {
          BackendState?: string;
          Self?: { TailscaleIPs?: string[]; HostName?: string };
        };
        const connected = parsed.BackendState === 'Running';
        const selfIp = parsed.Self?.TailscaleIPs?.[0];
        const hostName = parsed.Self?.HostName;
        resolve({
          installed: true,
          connected,
          selfIp,
          hostName,
        });
      } catch {
        resolve({ installed: fileExists, connected: false });
      }
    });
  });
}

function runElevatedProcess(filePath: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const escapedExe = filePath.replace(/'/g, "''");
    const escapedArgs = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    const psScript = `$p = Start-Process -FilePath '${escapedExe}' -ArgumentList @(${escapedArgs}) -Verb RunAs -Wait -PassThru; exit $p.ExitCode`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 180000 },
      (error, _stdout, stderr) => {
        if (error) {
          const code = typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : null;
          if (code !== null && (code === 0 || code === 3010)) {
            resolve(code);
            return;
          }
          reject(new Error(stderr?.trim() || error.message || 'Operação cancelada ou recusada.'));
          return;
        }
        resolve(0);
      },
    );
  });
}

async function downloadTailscaleMsi(
  onProgress: (p: TailscaleProgress) => void,
): Promise<string> {
  onProgress({
    stage: 'downloading',
    percent: 0,
    message: 'Consultando instalador oficial do Tailscale...',
  });

  const metaRes = await fetch('https://pkgs.tailscale.com/stable/?mode=json', {
    signal: AbortSignal.timeout(15000),
  });
  if (!metaRes.ok) {
    throw new Error('Não foi possível consultar a página de downloads do Tailscale.');
  }
  const meta = (await metaRes.json()) as {
    MSIs?: { amd64?: string; arm64?: string };
  };

  const msiName = process.arch === 'arm64' ? meta.MSIs?.arm64 : meta.MSIs?.amd64;
  if (!msiName) {
    throw new Error('Instalador Windows do Tailscale não encontrado.');
  }

  const downloadUrl = `https://pkgs.tailscale.com/stable/${msiName}`;
  const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(180000) });
  if (!res.ok || !res.body) {
    throw new Error(`Erro ao baixar Tailscale (${res.status}).`);
  }

  const totalBytes = Number(res.headers.get('content-length') ?? 0);
  const targetPath = path.join(os.tmpdir(), msiName);
  const fileStream = fs.createWriteStream(targetPath);

  let downloaded = 0;
  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloaded += value.byteLength;
        await new Promise<void>((resolve, reject) => {
          fileStream.write(value, (err) => (err ? reject(err) : resolve()));
        });
        if (totalBytes > 0) {
          const percent = Math.min(99, Math.round((downloaded / totalBytes) * 100));
          onProgress({
            stage: 'downloading',
            percent,
            message: `Baixando Tailscale... ${percent}%`,
          });
        }
      }
    }
    await new Promise<void>((resolve) => fileStream.end(() => resolve()));
    return targetPath;
  } catch (err) {
    fileStream.destroy();
    fs.rmSync(targetPath, { force: true });
    throw err;
  }
}

export async function installAndConnectTailscale(
  options: { authKey?: string },
  onProgress: (p: TailscaleProgress) => void,
): Promise<TailscaleStatus> {
  const authKey = options.authKey?.trim();
  if (authKey && !VALID_AUTH_KEY_RE.test(authKey)) {
    throw new Error('Chave Tailscale inválida no convite.');
  }

  onProgress({ stage: 'checking', message: 'Verificando instalação do Tailscale...' });
  let status = await getTailscaleStatus();

  if (!status.installed) {
    const msiPath = await downloadTailscaleMsi(onProgress);
    try {
      onProgress({
        stage: 'installing',
        message: 'Instalando Tailscale (aceite a permissão de administrador do Windows)...',
      });
      await runElevatedProcess('msiexec.exe', [
        '/i',
        msiPath,
        '/qn',
        '/norestart',
        'TS_NO_GUI=1',
      ]);

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        status = await getTailscaleStatus();
        if (status.installed) break;
      }
    } finally {
      fs.rmSync(msiPath, { force: true });
    }
  }

  if (!status.installed) {
    throw new Error('O Tailscale não terminou de inicializar. Tente novamente em alguns segundos.');
  }

  if (authKey && !status.connected) {
    onProgress({
      stage: 'connecting',
      message: 'Conectando seu PC à rede privada do Concord...',
    });
    const { exePath } = findTailscaleExe();
    await runElevatedProcess(exePath, ['up', `--auth-key=${authKey}`, '--unattended']);

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = await getTailscaleStatus();
      if (status.connected) break;
    }
  }

  onProgress({
    stage: 'done',
    percent: 100,
    message: status.connected
      ? `Rede privada conectada (${status.selfIp ?? 'OK'})!`
      : 'Tailscale instalado!',
  });

  return status;
}
