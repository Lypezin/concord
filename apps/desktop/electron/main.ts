import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  protocol,
  safeStorage,
  session,
  shell,
  Tray,
} from 'electron';
import {
  getTailscaleStatus,
  installAndConnectTailscale,
  type TailscaleStatus,
} from './tailscale.js';
import {
  checkForUpdates,
  getUpdaterStatus,
  initAutoUpdater,
  quitAndInstallUpdate,
} from './updater.js';

export interface SavedSession {
  serverUrl: string;
  token: string;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'concord',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pendingScreenSelection: {
  sourceId: string;
  includeSystemAudio: boolean;
  createdAt: number;
} | null = null;

const SESSION_FILE = 'session.enc';

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function getSessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE);
}

function getIconPath(): string {
  return path.join(__dirname, '../electron/icon.png');
}

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function loadSavedSession(): SavedSession | null {
  try {
    const filePath = getSessionPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    let jsonText: string;
    if (safeStorage.isEncryptionAvailable()) {
      jsonText = safeStorage.decryptString(raw);
    } else {
      jsonText = raw.toString('utf8');
    }
    const parsed = JSON.parse(jsonText) as Partial<SavedSession>;
    if (typeof parsed.serverUrl === 'string' && typeof parsed.token === 'string') {
      return { serverUrl: parsed.serverUrl, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(saved: SavedSession): void {
  const filePath = getSessionPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify({ serverUrl: saved.serverUrl, token: saved.token });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(payload);
    fs.writeFileSync(filePath, encrypted);
  } else {
    fs.writeFileSync(filePath, payload, 'utf8');
  }
}

function clearSession(): void {
  try {
    const filePath = getSessionPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup error
  }
}

function registerAppProtocol(): void {
  const distDir = path.resolve(__dirname, '../dist');
  protocol.handle('concord', async (request) => {
    try {
      const url = new URL(request.url);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
      }
      const relative = reqPath.replace(/^\/+/, '');
      let filePath = path.resolve(distDir, relative);
      const relCheck = path.relative(distDir, filePath);
      if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
      const bytes = await fs.promises.readFile(filePath);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function isTrustedAppOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'concord:' ||
      (parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
        parsed.port === '5173')
    );
  } catch {
    return false;
  }
}

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'speaker-selection',
  'notifications',
  'fullscreen',
  'clipboard-sanitized-write',
]);

function setupPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isTrustedAppOrigin(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const origin = details?.requestingUrl || webContents.getURL();
      callback(isTrustedAppOrigin(origin) && ALLOWED_PERMISSIONS.has(permission));
    },
  );
}

function setupDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const selection =
        pendingScreenSelection && Date.now() - pendingScreenSelection.createdAt < 15000
          ? pendingScreenSelection
          : null;
      pendingScreenSelection = null;

      const requestedTypes: Array<'screen' | 'window'> = selection?.sourceId.startsWith('window:')
        ? ['window']
        : selection?.sourceId.startsWith('screen:')
          ? ['screen']
          : ['screen', 'window'];

      const sources = await desktopCapturer.getSources({
        types: requestedTypes,
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });

      const matched =
        (selection ? sources.find((s) => s.id === selection.sourceId) : undefined) ??
        sources.find((s) => s.id.startsWith('screen:')) ??
        sources[0];

      if (!matched) {
        callback({});
        return;
      }

      if (selection?.includeSystemAudio && process.platform === 'win32') {
        callback({
          video: matched,
          audio: 'loopback',
        });
      } else {
        callback({
          video: matched,
        });
      }
    } catch {
      callback({});
    }
  });
}

function createTray(): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return;

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Concord');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Concord',
      click: () => showMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Sair do Concord',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => showMainWindow());
}

function createWindow(): void {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0c0c0e',
    icon: icon.isEmpty() ? undefined : icon,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0c0c0e',
      symbolColor: '#a1a1aa',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(url);
      }
    } catch {
      // ignore invalid urls
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadURL('concord://app/index.html');
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Evita que o Windows/Chromium reduza os FPS da captura de tela e WebRTC
  // quando o Concord estiver em segundo plano atrás de um jogo em tela cheia.
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch(
    'disable-features',
    'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
  );
  app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100');

  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.lypezin.concord');
    }
    Menu.setApplicationMenu(null);
    registerAppProtocol();
    setupPermissionHandlers();
    setupDisplayMediaHandler();

    ipcMain.handle('session:load', () => loadSavedSession());
    ipcMain.handle('session:save', (_event, saved: SavedSession) => {
      if (saved && typeof saved.serverUrl === 'string' && typeof saved.token === 'string') {
        saveSession(saved);
      }
    });
    ipcMain.handle('session:clear', () => {
      clearSession();
    });

    ipcMain.handle('app:notify', (_event, payload: { title: string; body: string }) => {
      if (!mainWindow || (mainWindow.isVisible() && mainWindow.isFocused())) {
        return;
      }
      if (!Notification.isSupported()) return;
      const notifIcon = nativeImage.createFromPath(getIconPath());
      const notification = new Notification({
        title: String(payload?.title ?? 'Concord').slice(0, 80),
        body: String(payload?.body ?? '').slice(0, 240),
        icon: notifIcon.isEmpty() ? undefined : notifIcon,
      });
      notification.on('click', () => showMainWindow());
      notification.show();
    });

    ipcMain.handle('app:openExternal', (_event, url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return shell.openExternal(url);
        }
      } catch {
        // ignore invalid url
      }
      return undefined;
    });

    ipcMain.handle('app:version', () => app.getVersion());

    ipcMain.handle('screen:getSources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      return sources
        .filter((src) => src.name.trim().length > 0 && !src.thumbnail.isEmpty())
        .map((src) => ({
          id: src.id,
          name: src.name,
          type: src.id.startsWith('screen:') ? 'screen' : 'window',
          thumbnail: src.thumbnail.toDataURL(),
          appIcon: src.appIcon && !src.appIcon.isEmpty() ? src.appIcon.toDataURL() : null,
        }));
    });

    ipcMain.handle(
      'screen:selectSource',
      (_event, selection: { sourceId: string; includeSystemAudio: boolean }) => {
        if (selection && typeof selection.sourceId === 'string') {
          pendingScreenSelection = {
            sourceId: selection.sourceId,
            includeSystemAudio: Boolean(selection.includeSystemAudio),
            createdAt: Date.now(),
          };
        }
      },
    );

    ipcMain.handle(
      'shortcuts:register',
      (_event, cfg: { toggleMute?: string; toggleDeafen?: string }) => {
        globalShortcut.unregisterAll();
        let toggleMuteOk = false;
        let toggleDeafenOk = false;

        if (cfg?.toggleMute && cfg.toggleMute.trim().length > 0) {
          try {
            toggleMuteOk = globalShortcut.register(cfg.toggleMute.trim(), () => {
              mainWindow?.webContents.send('shortcut:triggered', 'toggleMute');
            });
          } catch {
            toggleMuteOk = false;
          }
        }

        if (cfg?.toggleDeafen && cfg.toggleDeafen.trim().length > 0) {
          try {
            toggleDeafenOk = globalShortcut.register(cfg.toggleDeafen.trim(), () => {
              mainWindow?.webContents.send('shortcut:triggered', 'toggleDeafen');
            });
          } catch {
            toggleDeafenOk = false;
          }
        }

        return {
          registered: {
            toggleMute: toggleMuteOk,
            toggleDeafen: toggleDeafenOk,
          },
        };
      },
    );

    ipcMain.handle('tailscale:status', () => getTailscaleStatus());
    ipcMain.handle(
      'tailscale:setup',
      async (_event, options: { authKey?: string }): Promise<TailscaleStatus> => {
        return installAndConnectTailscale(options ?? {}, (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('tailscale:progress', progress);
          }
        });
      },
    );

    ipcMain.handle('updater:getStatus', () => getUpdaterStatus());
    ipcMain.handle('updater:check', () => checkForUpdates());
    ipcMain.handle('updater:install', () => quitAndInstallUpdate());

    createTray();
    createWindow();
    initAutoUpdater(() => mainWindow);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && (isQuitting || !tray)) {
      app.quit();
    }
  });
}
