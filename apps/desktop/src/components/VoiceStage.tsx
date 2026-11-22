import { useEffect, useRef, useState } from 'react';
import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import type { Track } from 'livekit-client';
import {
  HeadphoneOff,
  Maximize2,
  MessageSquare,
  MicOff,
  MonitorOff,
  MonitorUp,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import type { ScreenShareStream } from '../hooks/useVoiceRoom.js';
import { Avatar } from './Avatar.js';

interface VideoTrackPlayerProps {
  track: Track;
  className?: string;
}

function VideoTrackPlayer({ track, className }: VideoTrackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
    />
  );
}

interface VoiceStageProps {
  channel: Channel;
  currentUser: UserPublic;
  participants: UserPublic[];
  voiceStates: Record<string, VoiceUserState>;
  speakingUserIds: string[];
  screenShares: ScreenShareStream[];
  screenSharing: boolean;
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
  focusedShareId: string | null;
  onSelectFocusShare: (id: string) => void;
  onSetUserVolume: (userId: string, volume: number) => void;
  onSetStreamVolume: (userId: string, volume: number) => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onOpenSettings: () => void;
  onBackToChat: () => void;
}

export function VoiceStage({
  channel,
  currentUser,
  participants,
  voiceStates,
  speakingUserIds,
  screenShares,
  screenSharing,
  userVolumes,
  streamVolumes,
  focusedShareId,
  onSelectFocusShare,
  onSetUserVolume,
  onSetStreamVolume,
  onStartScreenShare,
  onStopScreenShare,
  onOpenSettings,
  onBackToChat,
}: VoiceStageProps) {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [resolutionLabel, setResolutionLabel] = useState<string | null>(null);

  const focusedShare =
    screenShares.find((s) => s.id === focusedShareId) ??
    screenShares.find((s) => !s.isLocal) ??
    screenShares[0] ??
    null;

  useEffect(() => {
    if (!focusedShare) {
      setResolutionLabel(null);
      return;
    }
    const updateDims = () => {
      const settings = focusedShare.videoTrack.mediaStreamTrack.getSettings();
      if (settings.width && settings.height) {
        const fpsPart = settings.frameRate ? ` • ${Math.round(settings.frameRate)}fps` : '';
        setResolutionLabel(`${settings.width}×${settings.height}${fpsPart}`);
      }
    };
    updateDims();
    const timer = setInterval(updateDims, 2000);
    return () => clearInterval(timer);
  }, [focusedShare]);

  function handleFullscreen() {
    const el = stageContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen().catch(() => undefined);
    }
  }

  const speakingSet = new Set(speakingUserIds);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#11131b]">
      {/* Cabeçalho do Palco */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/6 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <h3 className="truncate text-sm font-semibold text-white">{channel.name}</h3>
          <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
            {participants.length} na call
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              screenSharing
                ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
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
                Compartilhar Tela
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Configurações de Áudio e Atalhos"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/10"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Voltar ao Chat
          </button>
        </div>
      </div>

      {/* Área Principal */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {focusedShare && (
          <div
            ref={stageContainerRef}
            className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
          >
            <div className="relative flex min-h-[280px] flex-1 items-center justify-center bg-black">
              <VideoTrackPlayer
                track={focusedShare.videoTrack}
                className="max-h-[62vh] w-full object-contain"
              />

              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-black/70 px-2.5 py-1 text-xs backdrop-blur-xs">
                <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  AO VIVO
                </span>
                <span className="font-medium text-white">
                  {focusedShare.participantName}
                  {focusedShare.isLocal ? ' (Você)' : ''}
                </span>
                {resolutionLabel && (
                  <span className="text-[11px] text-slate-300">{resolutionLabel}</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleFullscreen}
                title="Tela cheia"
                className="absolute right-3 top-3 rounded-lg bg-black/70 p-2 text-slate-200 backdrop-blur-xs transition hover:bg-black/90 hover:text-white"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Barra de controle da stream */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0d1018] px-4 py-2.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                {screenShares.length > 1 &&
                  screenShares.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectFocusShare(s.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        s.id === focusedShare.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/8 text-slate-300 hover:bg-white/15'
                      }`}
                    >
                      {s.participantName}
                    </button>
                  ))}
                {focusedShare.isLocal && (
                  <span className="text-xs text-slate-400">
                    Pré-visualização da sua transmissão
                  </span>
                )}
              </div>

              {!focusedShare.isLocal && focusedShare.hasAudio && (
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Volume da tela</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={streamVolumes[focusedShare.participantId] ?? 100}
                    onChange={(e) =>
                      onSetStreamVolume(focusedShare.participantId, Number(e.target.value))
                    }
                    className="w-28 accent-indigo-500"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-slate-400">
                    {streamVolumes[focusedShare.participantId] ?? 100}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Participantes da Call */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {participants.map((p) => {
            const st = voiceStates[p.id];
            const isSpeaking = speakingSet.has(p.id);
            const isMe = p.id === currentUser.id;
            const vol = userVolumes[p.id] ?? 100;

            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-2xl border bg-[#161922] p-4 transition ${
                  isSpeaking
                    ? 'border-emerald-400/80 shadow-lg shadow-emerald-500/10'
                    : 'border-white/8'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-full p-0.5 transition ${
                      isSpeaking ? 'ring-2 ring-emerald-400' : ''
                    }`}
                  >
                    <Avatar
                      displayName={p.displayName}
                      color={p.avatarColor}
                      size="lg"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-white">
                        {p.displayName}
                      </span>
                      {st?.screenSharing && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-300">
                          AO VIVO
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      {st?.deafened ? (
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          <HeadphoneOff className="h-3.5 w-3.5" />
                          Ensurdecido
                        </span>
                      ) : st?.muted ? (
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          <MicOff className="h-3.5 w-3.5" />
                          Mutado
                        </span>
                      ) : isSpeaking ? (
                        <span className="text-emerald-400">Falando...</span>
                      ) : (
                        <span>No canal</span>
                      )}
                    </div>
                  </div>
                </div>

                {!isMe && (
                  <div className="mt-3 flex items-center gap-2 border-t border-white/6 pt-2.5">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={vol}
                      onChange={(e) => onSetUserVolume(p.id, Number(e.target.value))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">
                      {vol}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
