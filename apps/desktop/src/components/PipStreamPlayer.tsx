import { useState } from 'react';
import { Expand, EyeOff, MonitorUp, Volume2, VolumeX } from 'lucide-react';
import type { ScreenShareStream } from '../hooks/useVoiceRoom.js';
import { VideoTrackPlayer } from './VideoTrackPlayer.js';
import { ActionTooltip } from './ui/Tooltip.js';

interface PipStreamPlayerProps {
  share: ScreenShareStream;
  streamerName: string;
  streamVolume: number;
  onToggleMuteStream: () => void;
  onExpandToStage: () => void;
}

export function PipStreamPlayer({
  share,
  streamerName,
  streamVolume,
  onToggleMuteStream,
  onExpandToStage,
}: PipStreamPlayerProps) {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <div className="concord-panel fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-xl border border-white/[0.1] bg-[#16161b] px-3 py-2 shadow-2xl">
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        <span className="text-xs font-medium text-zinc-200">
          Transmissão de <strong className="text-white">{streamerName}</strong>
        </span>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="rounded-md bg-[#24242c] px-2 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-[#2e2e38] hover:text-white"
        >
          Mostrar Miniatura
        </button>
        <button
          type="button"
          onClick={onExpandToStage}
          className="rounded-md bg-[#5865f2] px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-[#4752c4]"
        >
          Abrir Palco
        </button>
      </div>
    );
  }

  return (
    <div className="concord-panel fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-xl border border-white/[0.12] bg-[#141418] shadow-2xl">
      <div
        onDoubleClick={onExpandToStage}
        className="group relative aspect-video w-full cursor-pointer bg-black"
      >
        <VideoTrackPlayer
          track={share.videoTrack}
          className="h-full w-full object-contain"
        />

        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/80 px-2 py-0.5 text-[10px]">
          <span className="rounded bg-rose-600 px-1 py-0.2 font-bold uppercase text-white">
            AO VIVO
          </span>
          <span className="max-w-[140px] truncate font-medium text-white">
            {streamerName}
          </span>
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!share.isLocal && share.hasAudio && (
            <ActionTooltip
              label={streamVolume === 0 ? 'Reativar som da tela' : 'Mutar som da tela'}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMuteStream();
                }}
                className="rounded-md border border-white/10 bg-black/80 p-1.5 text-zinc-200 transition hover:bg-black hover:text-white"
              >
                {streamVolume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
            </ActionTooltip>
          )}

          <ActionTooltip label="Minimizar miniatura">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMinimized(true);
              }}
              className="rounded-md border border-white/10 bg-black/80 p-1.5 text-zinc-200 transition hover:bg-black hover:text-white"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          </ActionTooltip>

          <ActionTooltip label="Expandir no Palco">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExpandToStage();
              }}
              className="rounded-md border border-white/10 bg-black/80 p-1.5 text-zinc-200 transition hover:bg-black hover:text-white"
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
          </ActionTooltip>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#16161b] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-300">
          <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate">Assistindo no modo miniplayer</span>
        </div>
        <button
          type="button"
          onClick={onExpandToStage}
          className="shrink-0 text-[11px] font-semibold text-[#7983f5] transition hover:text-white"
        >
          Ver em tela grande
        </button>
      </div>
    </div>
  );
}
