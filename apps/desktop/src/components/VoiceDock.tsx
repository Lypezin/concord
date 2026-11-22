import { useEffect, useState } from 'react';
import type { Channel } from '@concord/shared';
import { MonitorOff, MonitorUp, PhoneOff, Radio, Sparkles, Tv } from 'lucide-react';
import type { VoiceConnectionState } from '../hooks/useVoiceRoom.js';

interface VoiceDockProps {
  channel: Channel;
  voiceState: VoiceConnectionState;
  connectedAt: number | null;
  screenSharing: boolean;
  viewingStage: boolean;
  rnnoiseEnabled?: boolean;
  totalUnreadCount: number;
  onToggleStage: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onDisconnect: () => void;
}

function formatDuration(startedAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function VoiceDock({
  channel,
  voiceState,
  connectedAt,
  screenSharing,
  viewingStage,
  rnnoiseEnabled = true,
  totalUnreadCount,
  onToggleStage,
  onStartScreenShare,
  onStopScreenShare,
  onDisconnect,
}: VoiceDockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!connectedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [connectedAt]);

  const statusLabel =
    voiceState === 'connected'
      ? 'Voz Conectada'
      : voiceState === 'reconnecting'
        ? 'Reconectando...'
        : 'Conectando...';

  const isConnected = voiceState === 'connected';

  return (
    <div className="mx-2.5 mb-2 rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.13] via-[#101722] to-[#0c1018] p-3 shadow-xl">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggleStage}
          className="group min-w-0 flex-1 text-left"
          title="Abrir palco de voz e telas"
        >
          <div className="flex items-center justify-between gap-1.5 text-[11px] font-bold">
            <span
              className={`flex min-w-0 items-center gap-1.5 ${
                isConnected ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                    isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </span>
              <Radio className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{statusLabel}</span>
            </span>

            {connectedAt && isConnected && (
              <span className="shrink-0 rounded-md border border-emerald-400/25 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-emerald-200">
                {formatDuration(connectedAt, now)}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-white transition group-hover:text-emerald-200">
              {channel.name}
            </span>
            {rnnoiseEnabled && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-indigo-400/25 bg-indigo-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-indigo-200">
                <Sparkles className="h-2.5 w-2.5 text-indigo-300" />
                IA
              </span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onDisconnect}
          title="Desconectar da call"
          className="shrink-0 rounded-xl border border-rose-500/25 bg-rose-500/15 p-2 text-rose-300 transition hover:bg-rose-500/30 hover:text-white"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
          disabled={!isConnected}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-40 ${
            screenSharing
              ? 'border-rose-500/35 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
              : 'border-white/[0.08] bg-white/[0.06] text-slate-200 hover:bg-white/[0.12] hover:text-white'
          }`}
        >
          {screenSharing ? (
            <>
              <MonitorOff className="h-3.5 w-3.5" />
              Parar Tela
            </>
          ) : (
            <>
              <MonitorUp className="h-3.5 w-3.5" />
              Tela 60fps
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleStage}
          className={`relative flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            viewingStage
              ? 'border-indigo-400/40 bg-gradient-to-r from-indigo-600/35 to-violet-600/30 text-indigo-100 hover:from-indigo-600/45 hover:to-violet-600/40'
              : 'border-white/[0.08] bg-white/[0.06] text-slate-200 hover:bg-white/[0.12] hover:text-white'
          }`}
        >
          <Tv className="h-3.5 w-3.5" />
          <span>{viewingStage ? 'Ver Chat' : 'Ver Palco'}</span>
          {viewingStage && totalUnreadCount > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white shadow">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
