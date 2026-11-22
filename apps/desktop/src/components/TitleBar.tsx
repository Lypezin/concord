import { Download, Volume2 } from 'lucide-react';
import type { UpdaterStatus } from '../bridge-types.js';
import type { SocketConnectionState } from '../lib/socket.js';

interface TitleBarProps {
  connectionState?: SocketConnectionState | null;
  serverName?: string;
  connectedVoiceChannelName?: string | null;
  onClickVoicePill?: () => void;
  updaterStatus?: UpdaterStatus | null;
  onInstallUpdate?: () => void;
}

export function TitleBar({
  connectionState,
  serverName = 'Concord',
  connectedVoiceChannelName,
  onClickVoicePill,
  updaterStatus,
  onInstallUpdate,
}: TitleBarProps) {
  return (
    <header className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0c0c0e] px-3 pr-36 text-xs text-zinc-400">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-[#18181d] text-[11px] font-bold text-zinc-100">
          C
        </div>

        <span className="truncate font-semibold tracking-tight text-zinc-200">
          {serverName}
        </span>

        {connectionState && (
          <span
            className={`app-no-drag inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
              connectionState === 'connected'
                ? 'border-white/[0.07] bg-[#16161b] text-zinc-300'
                : connectionState === 'reconnecting'
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                  : 'border-rose-500/25 bg-rose-500/10 text-rose-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-[#23a55a]'
                  : connectionState === 'reconnecting'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-rose-400'
              }`}
            />
            {connectionState === 'connected'
              ? 'Conectado'
              : connectionState === 'reconnecting'
                ? 'Reconectando...'
                : 'Desconectado'}
          </span>
        )}

        {connectedVoiceChannelName && onClickVoicePill && (
          <button
            type="button"
            onClick={onClickVoicePill}
            title="Alternar palco de voz"
            className="app-no-drag hidden items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/15 sm:inline-flex"
          >
            <Volume2 className="h-3 w-3 text-emerald-400" />
            <span className="max-w-[150px] truncate">{connectedVoiceChannelName}</span>
          </button>
        )}
      </div>

      {updaterStatus?.state === 'downloaded' && onInstallUpdate && (
        <button
          type="button"
          onClick={onInstallUpdate}
          className="app-no-drag inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#23a55a] px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:bg-[#1e8e4d]"
        >
          <Download className="h-3 w-3" />
          Atualização v{updaterStatus.version} pronta — Reiniciar
        </button>
      )}
    </header>
  );
}
