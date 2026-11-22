import { Download, Wifi, WifiOff } from 'lucide-react';
import type { UpdaterStatus } from '../bridge-types.js';
import type { SocketConnectionState } from '../lib/socket.js';

interface TitleBarProps {
  connectionState?: SocketConnectionState | null;
  serverName?: string;
  updaterStatus?: UpdaterStatus | null;
  onInstallUpdate?: () => void;
}

export function TitleBar({
  connectionState,
  serverName = 'Concord',
  updaterStatus,
  onInstallUpdate,
}: TitleBarProps) {
  return (
    <header className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-white/6 bg-[#0f1117] px-3 pr-36 text-xs text-slate-300">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white shadow">
          C
        </div>
        <span className="font-semibold tracking-wide text-slate-200">{serverName}</span>
        {connectionState && (
          <span
            className={`app-no-drag inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              connectionState === 'connected'
                ? 'bg-emerald-500/12 text-emerald-300'
                : connectionState === 'reconnecting'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {connectionState === 'connected' ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {connectionState === 'connected'
              ? 'Conectado'
              : connectionState === 'reconnecting'
                ? 'Reconectando...'
                : 'Desconectado'}
          </span>
        )}
      </div>

      {updaterStatus?.state === 'downloaded' && onInstallUpdate && (
        <button
          type="button"
          onClick={onInstallUpdate}
          className="app-no-drag inline-flex items-center gap-1.5 rounded-full bg-emerald-600/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-600/40"
        >
          <Download className="h-3 w-3" />
          Atualização v{updaterStatus.version} pronta — Reiniciar
        </button>
      )}
    </header>
  );
}
