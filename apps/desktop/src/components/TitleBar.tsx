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
    <header className="app-drag flex h-[38px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#080a0f] px-3 pr-36 text-xs text-slate-300">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_12px_rgba(99,102,241,0.45)] ring-1 ring-inset ring-white/25">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16.5 7.5a6.5 6.5 0 1 0 0 9" />
            <circle cx="17.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <span className="truncate font-semibold tracking-tight text-slate-100">
          {serverName}
        </span>

        {connectionState && (
          <span
            className={`app-no-drag inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
              connectionState === 'connected'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : connectionState === 'reconnecting'
                  ? 'border-amber-500/25 bg-amber-500/12 text-amber-300'
                  : 'border-rose-500/25 bg-rose-500/12 text-rose-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : connectionState === 'reconnecting'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-rose-400'
              }`}
            />
            {connectionState === 'connected'
              ? 'Online'
              : connectionState === 'reconnecting'
                ? 'Reconectando...'
                : 'Desconectado'}
          </span>
        )}

        {connectedVoiceChannelName && onClickVoicePill && (
          <button
            type="button"
            onClick={onClickVoicePill}
            title="Alternar palco de voz e compartilhamento de tela"
            className="app-no-drag hidden items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 sm:inline-flex"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <Volume2 className="h-3 w-3 text-emerald-300" />
            <span className="max-w-[140px] truncate">Em {connectedVoiceChannelName}</span>
          </button>
        )}
      </div>

      {updaterStatus?.state === 'downloaded' && onInstallUpdate && (
        <button
          type="button"
          onClick={onInstallUpdate}
          className="app-no-drag inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/35 bg-gradient-to-r from-emerald-500/25 to-teal-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.28)] transition hover:from-emerald-500/35 hover:to-teal-500/30"
        >
          <Download className="h-3 w-3 text-emerald-300" />
          Atualização v{updaterStatus.version} pronta — Reiniciar
        </button>
      )}
    </header>
  );
}
