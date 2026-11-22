import { useEffect, useState } from 'react';
import type { Channel } from '@concord/shared';
import { MonitorOff, MonitorUp, PhoneOff, Radio, Tv } from 'lucide-react';
import type { VoiceConnectionState } from '../hooks/useVoiceRoom.js';

interface VoiceDockProps {
  channel: Channel;
  voiceState: VoiceConnectionState;
  connectedAt: number | null;
  screenSharing: boolean;
  viewingStage: boolean;
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
    <div className="border-t border-white/[0.07] bg-[#101013] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleStage}
          className="group min-w-0 flex-1 text-left"
          title="Alternar visualização da chamada"
        >
          <div className="flex items-center justify-between gap-1.5 text-[11px] font-semibold">
            <span
              className={`flex min-w-0 items-center gap-1.5 ${
                isConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <Radio className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{statusLabel}</span>
            </span>

            {connectedAt && isConnected && (
              <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-zinc-400">
                {formatDuration(connectedAt, now)}
              </span>
            )}
          </div>

          <div className="mt-0.5 truncate text-xs font-medium text-zinc-300 transition group-hover:text-white">
            {channel.name}
          </div>
        </button>

        <button
          type="button"
          onClick={onDisconnect}
          title="Desconectar"
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-300"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
          disabled={!isConnected}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-40 ${
            screenSharing
              ? 'border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
              : 'border-white/[0.07] bg-[#1a1a20] text-zinc-200 hover:bg-[#23232b] hover:text-white'
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
              Compartilhar
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleStage}
          className={`relative flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
            viewingStage
              ? 'border-white/[0.14] bg-[#26262f] text-white'
              : 'border-white/[0.07] bg-[#1a1a20] text-zinc-200 hover:bg-[#23232b] hover:text-white'
          }`}
        >
          <Tv className="h-3.5 w-3.5" />
          <span>{viewingStage ? 'Ver Chat' : 'Ver Palco'}</span>
          {viewingStage && totalUnreadCount > 0 && (
            <span className="rounded-full bg-[#5865f2] px-1.5 py-0.2 text-[9px] font-bold text-white">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
