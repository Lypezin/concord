import { useEffect, useRef, useState } from 'react';
import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import type { Track } from 'livekit-client';
import {
  HeadphoneOff,
  Headphones,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ScreenShareStream } from '../hooks/useVoiceRoom.js';
import { Avatar } from './Avatar.js';

interface VideoTrackPlayerProps {
  track: Track;
  className?: string;
  onStats?: (stats: { width: number; height: number; fps: number }) => void;
}

type FrameCallbackVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function VideoTrackPlayer({ track, className, onStats }: VideoTrackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current as FrameCallbackVideoElement | null;
    if (!el) return;
    track.attach(el);

    let frameCount = 0;
    let lastCheck = performance.now();
    let vfcHandle = 0;

    const onFrame = (now: number) => {
      frameCount++;
      const elapsed = now - lastCheck;
      if (elapsed >= 1000) {
        const measuredFps = Math.round((frameCount * 1000) / elapsed);
        const w = el.videoWidth || track.mediaStreamTrack.getSettings().width || 0;
        const h = el.videoHeight || track.mediaStreamTrack.getSettings().height || 0;
        if (w > 0 && h > 0) {
          onStats?.({ width: w, height: h, fps: measuredFps });
        }
        frameCount = 0;
        lastCheck = now;
      }
      if (el.requestVideoFrameCallback) {
        vfcHandle = el.requestVideoFrameCallback(onFrame);
      }
    };

    if (el.requestVideoFrameCallback) {
      vfcHandle = el.requestVideoFrameCallback(onFrame);
    }

    return () => {
      if (vfcHandle && el.cancelVideoFrameCallback) {
        el.cancelVideoFrameCallback(vfcHandle);
      }
      track.detach(el);
    };
  }, [track, onStats]);

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
  muted?: boolean;
  deafened?: boolean;
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
  focusedShareId: string | null;
  totalUnreadCount: number;
  onSelectFocusShare: (id: string) => void;
  onSetUserVolume: (userId: string, volume: number) => void;
  onSetStreamVolume: (userId: string, volume: number) => void;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onDisconnectVoice?: () => void;
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
  muted = false,
  deafened = false,
  userVolumes,
  streamVolumes,
  focusedShareId,
  totalUnreadCount,
  onSelectFocusShare,
  onSetUserVolume,
  onSetStreamVolume,
  onToggleMute,
  onToggleDeafen,
  onStartScreenShare,
  onStopScreenShare,
  onDisconnectVoice,
  onOpenSettings,
  onBackToChat,
}: VoiceStageProps) {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const previousStreamVolRef = useRef<Record<string, number>>({});
  const [resolutionLabel, setResolutionLabel] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const resolveStreamerName = (share: ScreenShareStream): string =>
    participantsById.get(share.participantId)?.displayName ?? share.participantName;

  const focusedShare =
    screenShares.find((s) => s.id === focusedShareId) ??
    screenShares.find((s) => !s.isLocal) ??
    screenShares[0] ??
    null;

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === stageContainerRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!focusedShare) {
      setResolutionLabel(null);
      return;
    }
    const settings = focusedShare.videoTrack.mediaStreamTrack.getSettings();
    if (settings.width && settings.height) {
      const fpsPart = settings.frameRate ? ` • ${Math.round(settings.frameRate)} FPS` : '';
      setResolutionLabel(`${settings.width}×${settings.height}${fpsPart}`);
    }
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

  function handleToggleMuteStream(participantId: string) {
    const current = streamVolumes[participantId] ?? 100;
    if (current > 0) {
      previousStreamVolRef.current[participantId] = current;
      onSetStreamVolume(participantId, 0);
    } else {
      const restore = previousStreamVolRef.current[participantId] || 100;
      onSetStreamVolume(participantId, restore);
    }
  }

  const speakingSet = new Set(speakingUserIds);

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-[#101013]">
      {/* Cabeçalho do Palco */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#101013] px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Volume2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <h3 className="truncate text-sm font-semibold tracking-tight text-white">
            {channel.name}
          </h3>
          <span className="rounded-md border border-white/[0.07] bg-[#18181d] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
            {participants.length} na chamada
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#18181d] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-[#222229] hover:text-white"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Voltar ao Chat</span>
            {totalUnreadCount > 0 && (
              <span className="rounded-full bg-[#5865f2] px-1.5 py-0.2 text-[10px] font-bold text-white">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Área Principal */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pb-20">
        {focusedShare ? (
          <div
            ref={stageContainerRef}
            className={`flex flex-col overflow-hidden bg-black ${
              isFullscreen
                ? 'h-screen w-screen'
                : 'rounded-xl border border-white/[0.08]'
            }`}
          >
            <div
              onDoubleClick={handleFullscreen}
              className="relative flex min-h-[300px] flex-1 items-center justify-center bg-black"
            >
              <VideoTrackPlayer
                track={focusedShare.videoTrack}
                onStats={({ width, height, fps }) => {
                  setResolutionLabel(`${width}×${height} • ${fps} FPS`);
                }}
                className={
                  isFullscreen
                    ? 'h-full w-full object-contain'
                    : 'max-h-[60vh] w-full object-contain'
                }
              />

              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/80 px-2.5 py-1 text-xs">
                <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  AO VIVO
                </span>
                <span className="font-medium text-white">
                  {resolveStreamerName(focusedShare)}
                  {focusedShare.isLocal ? ' (Você)' : ''}
                </span>
                {resolutionLabel && (
                  <span className="font-mono text-[11px] text-zinc-300">
                    {resolutionLabel}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleFullscreen}
                title={isFullscreen ? 'Sair de tela cheia (Esc)' : 'Tela cheia (ou duplo clique)'}
                className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/80 p-2 text-zinc-200 transition hover:bg-black hover:text-white"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Barra de controle da stream */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#141418] px-4 py-2.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                {screenShares.length > 1 &&
                  screenShares.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectFocusShare(s.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        s.id === focusedShare.id
                          ? 'bg-[#26262f] text-white'
                          : 'bg-[#1c1c22] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {resolveStreamerName(s)}
                    </button>
                  ))}
                {focusedShare.isLocal && (
                  <span className="text-xs text-zinc-400">
                    Pré-visualização da sua transmissão
                  </span>
                )}
              </div>

              {!focusedShare.isLocal && (
                focusedShare.hasAudio ? (
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleMuteStream(focusedShare.participantId)}
                      title={
                        (streamVolumes[focusedShare.participantId] ?? 100) === 0
                          ? 'Desmutar áudio da tela'
                          : 'Mutar áudio da tela'
                      }
                      className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      {(streamVolumes[focusedShare.participantId] ?? 100) === 0 ? (
                        <VolumeX className="h-4 w-4 text-rose-400" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-zinc-300" />
                      )}
                    </button>
                    <span className="text-xs text-zinc-400">Volume da tela</span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={streamVolumes[focusedShare.participantId] ?? 100}
                      onChange={(e) =>
                        onSetStreamVolume(focusedShare.participantId, Number(e.target.value))
                      }
                      className="concord-slider w-28"
                    />
                    <span className="w-10 text-right font-mono text-xs tabular-nums text-zinc-400">
                      {streamVolumes[focusedShare.participantId] ?? 100}%
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                    <VolumeX className="h-3.5 w-3.5" />
                    Sem áudio do sistema
                  </span>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#16161b] p-7 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[#202027] text-zinc-300">
              <MonitorUp className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-semibold text-white">
              Nenhuma transmissão ativa
            </h4>
            <p className="mt-1 max-w-md text-xs text-zinc-400">
              Compartilhe sua tela ou janela com os participantes do canal.
            </p>
            <button
              type="button"
              onClick={onStartScreenShare}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#5865f2] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4]"
            >
              <MonitorUp className="h-4 w-4" />
              Compartilhar Tela
            </button>
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
                className={`flex flex-col justify-between rounded-xl border bg-[#16161b] p-4 transition ${
                  isSpeaking
                    ? 'border-[#23a55a]'
                    : 'border-white/[0.07]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    displayName={p.displayName}
                    color={p.avatarColor}
                    size="lg"
                    speaking={isSpeaking}
                    ringBg="border-[#16161b]"
                  />
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
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
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
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                          <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                            <span className="voice-bar-1 h-2.5 w-[2px] rounded-full bg-emerald-400" />
                            <span className="voice-bar-2 h-3 w-[2px] rounded-full bg-emerald-400" />
                            <span className="voice-bar-3 h-2 w-[2px] rounded-full bg-emerald-400" />
                          </span>
                          Falando
                        </span>
                      ) : (
                        <span>Conectado</span>
                      )}
                    </div>
                  </div>
                </div>

                {!isMe && (
                  <div className="mt-3 flex items-center gap-2.5 border-t border-white/[0.06] pt-2.5">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={vol}
                      onChange={(e) => onSetUserVolume(p.id, Number(e.target.value))}
                      className="concord-slider flex-1"
                    />
                    <span className="w-10 text-right font-mono text-[11px] tabular-nums text-zinc-400">
                      {vol}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra Inferior de Controles da Chamada */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3.5 z-20 flex justify-center px-4">
        <div className="concord-panel pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-[#18181d] px-2.5 py-1.5">
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              title={muted ? 'Ativar microfone' : 'Mutar microfone'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                muted
                  ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-[#222229] text-zinc-100 hover:bg-[#2b2b34]'
              }`}
            >
              {muted ? <MicOff className="h-4 w-4 text-rose-300" /> : <Mic className="h-4 w-4 text-zinc-200" />}
              <span>{muted ? 'Mutado' : 'Microfone'}</span>
            </button>
          )}

          {onToggleDeafen && (
            <button
              type="button"
              onClick={onToggleDeafen}
              title={deafened ? 'Reativar áudio' : 'Ensurdecer'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                deafened
                  ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-[#222229] text-zinc-100 hover:bg-[#2b2b34]'
              }`}
            >
              {deafened ? (
                <HeadphoneOff className="h-4 w-4 text-rose-300" />
              ) : (
                <Headphones className="h-4 w-4 text-zinc-200" />
              )}
              <span className="hidden sm:inline">{deafened ? 'Ensurdecido' : 'Áudio'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              screenSharing
                ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                : 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
            }`}
          >
            {screenSharing ? (
              <>
                <MonitorOff className="h-4 w-4" />
                <span>Parar Tela</span>
              </>
            ) : (
              <>
                <MonitorUp className="h-4 w-4" />
                <span>Compartilhar Tela</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Configurações"
            className="rounded-lg bg-[#222229] p-1.5 text-zinc-300 transition hover:bg-[#2b2b34] hover:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {onDisconnectVoice && (
            <button
              type="button"
              onClick={onDisconnectVoice}
              title="Desconectar"
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
            >
              <PhoneOff className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
