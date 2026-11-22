import type { Channel } from '@concord/shared';
import { MonitorOff, MonitorUp, PhoneOff, Radio, Tv } from 'lucide-react';
import type { VoiceConnectionState } from '../hooks/useVoiceRoom.js';

interface VoiceDockProps {
  channel: Channel;
  voiceState: VoiceConnectionState;
  screenSharing: boolean;
  viewingStage: boolean;
  onToggleStage: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onDisconnect: () => void;
}

export function VoiceDock({
  channel,
  voiceState,
  screenSharing,
  viewingStage,
  onToggleStage,
  onStartScreenShare,
  onStopScreenShare,
  onDisconnect,
}: VoiceDockProps) {
  const statusLabel =
    voiceState === 'connected'
      ? 'Voz Conectada'
      : voiceState === 'reconnecting'
        ? 'Reconectando voz...'
        : 'Conectando voz...';

  const statusColor =
    voiceState === 'connected' ? 'text-emerald-400' : 'text-amber-400';

  return (
    <div className="border-t border-white/6 bg-[#0d1018] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleStage}
          className="min-w-0 flex-1 text-left group"
          title="Abrir palco de voz e telas"
        >
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${statusColor}`}>
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{statusLabel}</span>
          </div>
          <div className="truncate text-xs text-slate-400 group-hover:text-slate-200">
            {channel.name}
          </div>
        </button>

        <button
          type="button"
          onClick={onDisconnect}
          title="Desconectar da call"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
          disabled={voiceState !== 'connected'}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-40 ${
            screenSharing
              ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
              : 'bg-white/6 text-slate-200 hover:bg-white/10'
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
              Tela
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleStage}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
            viewingStage
              ? 'bg-indigo-600/30 text-indigo-200 hover:bg-indigo-600/40'
              : 'bg-white/6 text-slate-200 hover:bg-white/10'
          }`}
        >
          <Tv className="h-3.5 w-3.5" />
          {viewingStage ? 'Ver Chat' : 'Ver Call'}
        </button>
      </div>
    </div>
  );
}
