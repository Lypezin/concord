import { contextBridge, ipcRenderer } from 'electron';
import type {
  ConcordBridge,
  SavedSession,
  ScreenSourceOption,
  ShortcutAction,
  ShortcutConfig,
  TailscaleProgress,
  UpdaterStatus,
} from '../src/bridge-types.js';

const api: ConcordBridge = {
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (session: SavedSession) => ipcRenderer.invoke('session:save', session),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  getVersion: () => ipcRenderer.invoke('app:version'),

  getScreenSources: () => ipcRenderer.invoke('screen:getSources') as Promise<ScreenSourceOption[]>,
  selectScreenSource: (selection) => ipcRenderer.invoke('screen:selectSource', selection),

  registerShortcuts: (config: ShortcutConfig) => ipcRenderer.invoke('shortcuts:register', config),
  onShortcutTriggered: (listener: (action: ShortcutAction) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: ShortcutAction) => listener(action);
    ipcRenderer.on('shortcut:triggered', handler);
    return () => {
      ipcRenderer.off('shortcut:triggered', handler);
    };
  },

  getTailscaleStatus: () => ipcRenderer.invoke('tailscale:status'),
  setupTailscale: (options) => ipcRenderer.invoke('tailscale:setup', options ?? {}),
  onTailscaleProgress: (listener: (progress: TailscaleProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: TailscaleProgress) =>
      listener(progress);
    ipcRenderer.on('tailscale:progress', handler);
    return () => {
      ipcRenderer.off('tailscale:progress', handler);
    };
  },

  getUpdaterStatus: () => ipcRenderer.invoke('updater:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => listener(status);
    ipcRenderer.on('updater:status', handler);
    return () => {
      ipcRenderer.off('updater:status', handler);
    };
  },
};

contextBridge.exposeInMainWorld('concordAPI', api);
