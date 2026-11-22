import { app, type BrowserWindow } from 'electron';
import updaterPkg from 'electron-updater';

const { autoUpdater } = updaterPkg;

export interface UpdaterStatus {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'up-to-date'
    | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

let currentStatus: UpdaterStatus = { state: 'idle' };
let initialized = false;

export function getUpdaterStatus(): UpdaterStatus {
  return currentStatus;
}

export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const publishStatus = (next: UpdaterStatus) => {
    currentStatus = next;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', next);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    publishStatus({ state: 'checking', message: 'Procurando atualizações...' });
  });

  autoUpdater.on('update-available', (info) => {
    publishStatus({
      state: 'available',
      version: info.version,
      message: `Nova versão ${info.version} encontrada. Baixando...`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    publishStatus({
      state: 'downloading',
      percent: Math.round(progress.percent),
      message: `Baixando atualização... ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    publishStatus({
      state: 'downloaded',
      version: info.version,
      percent: 100,
      message: `Versão ${info.version} pronta para instalar!`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    publishStatus({ state: 'up-to-date', message: 'Você já está na versão mais recente.' });
  });

  autoUpdater.on('error', (err) => {
    publishStatus({
      state: 'error',
      message: err?.message || 'Erro ao verificar atualizações.',
    });
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 8000);
}

export async function checkForUpdates(): Promise<UpdaterStatus> {
  if (!app.isPackaged) {
    currentStatus = {
      state: 'up-to-date',
      message: 'Modo de desenvolvimento (auto-update ativo apenas no instalador .exe).',
    };
    return currentStatus;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    currentStatus = {
      state: 'error',
      message: err instanceof Error ? err.message : 'Erro ao verificar atualizações.',
    };
  }
  return currentStatus;
}

export function quitAndInstallUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}
