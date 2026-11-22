import type { SavedSession } from '../bridge-types.js';

const SESSION_KEY = 'concord.session';
const LAST_SERVER_KEY = 'concord.lastServerUrl';
const MUTED_KEY = 'concord.mutedNotifications';

export async function loadSession(): Promise<SavedSession | null> {
  if (window.concordAPI) {
    return window.concordAPI.loadSession();
  }
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (typeof parsed.serverUrl === 'string' && typeof parsed.token === 'string') {
      return { serverUrl: parsed.serverUrl, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSession(session: SavedSession): Promise<void> {
  saveLastServerUrl(session.serverUrl);
  if (window.concordAPI) {
    await window.concordAPI.saveSession(session);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  if (window.concordAPI) {
    await window.concordAPI.clearSession();
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}

export function loadLastServerUrl(): string {
  try {
    return localStorage.getItem(LAST_SERVER_KEY) || 'http://127.0.0.1:3000';
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

export function saveLastServerUrl(url: string): void {
  try {
    localStorage.setItem(LAST_SERVER_KEY, url.trim().replace(/\/+$/, ''));
  } catch {
    // ignore storage errors
  }
}

export function loadMutedNotifications(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMutedNotifications(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function openExternalUrl(url: string): void {
  if (window.concordAPI) {
    void window.concordAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function notifyDesktop(title: string, body: string): void {
  if (window.concordAPI) {
    void window.concordAPI.notify(title, body);
  }
}
