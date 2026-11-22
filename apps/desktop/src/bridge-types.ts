export interface SavedSession {
  serverUrl: string;
  token: string;
}

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

export interface ScreenSourceOption {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

export type ShortcutAction = 'toggleMute' | 'toggleDeafen';

export interface ShortcutConfig {
  toggleMute: string;
  toggleDeafen: string;
}

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

export interface ConcordBridge {
  loadSession: () => Promise<SavedSession | null>;
  saveSession: (session: SavedSession) => Promise<void>;
  clearSession: () => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getVersion: () => Promise<string>;

  getScreenSources: () => Promise<ScreenSourceOption[]>;
  selectScreenSource: (selection: {
    sourceId: string;
    includeSystemAudio: boolean;
  }) => Promise<void>;

  registerShortcuts: (
    config: ShortcutConfig,
  ) => Promise<{ registered: { toggleMute: boolean; toggleDeafen: boolean } }>;
  onShortcutTriggered: (listener: (action: ShortcutAction) => void) => () => void;

  getTailscaleStatus: () => Promise<TailscaleStatus>;
  setupTailscale: (options?: { authKey?: string }) => Promise<TailscaleStatus>;
  onTailscaleProgress: (listener: (progress: TailscaleProgress) => void) => () => void;

  getUpdaterStatus: () => Promise<UpdaterStatus>;
  checkForUpdates: () => Promise<UpdaterStatus>;
  installUpdate: () => Promise<void>;
  onUpdaterStatus: (listener: (status: UpdaterStatus) => void) => () => void;
}
