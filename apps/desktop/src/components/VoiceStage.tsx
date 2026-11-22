import { useEffect, useRef, useState } from 'react';
import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import type { Track } from 'livekit-client';
import {
  HeadphoneOff,
  Maximize2,
  MessageSquare,
  MicOff,
  Minimize2,
  MonitorOff,
  MonitorUp,
  SlidersHorizontal,
  Volume2,
  VolumeX,
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
  totalUnreadCount: number;
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
  totalUnreadCount,
  onSelectFocusShare,
  onSetUserVolume,
  onSetStreamVolume,
  onStartScreenShare,
  onStopScreenShare,
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
    <section className="relative flex min-w-0 flex-1 flex-col bg-[#0b0d14]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_65%)]" />

      {/* Cabeçalho do Palco */}
      <div className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0d1018]/85 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
            <Volume2 className="h-3.5 w-3.5" />
          </div>
          <h3 className="truncate text-sm font-semibold tracking-tight text-white">
            {channel.name}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {participants.length} na call
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={screenSharing ? onStopScreenShare : onStartScreenShare}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              screenSharing
                ? 'border border-rose-500/30 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-500 hover:to-violet-500'
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
            className="rounded-xl border border-white/[0.08] bg-white/[0.05] p-1.5 text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.1] hover:text-white"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Voltar ao Chat</span>
            {totalUnreadCount > 0 && (
              <span className="rounded-full bg-indigo-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-sm">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Área Principal */}
      <div className="relative flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {focusedShare ? (
          <div
            ref={stageContainerRef}
            className={`concord-glass flex flex-col overflow-hidden bg-black ${
              isFullscreen
                ? 'h-screen w-screen'
                : 'rounded-2xl border border-white/[0.09]'
            }`}
          >
            <div
              onDoubleClick={handleFullscreen}
              className="relative flex min-h-[280px] flex-1 items-center justify-center bg-black"
            >
              <VideoTrackPlayer
                track={focusedShare.videoTrack}
                className={
                  isFullscreen
                    ? 'h-full w-full object-contain'
                    : 'max-h-[62vh] w-full object-contain'
                }
              />

              <div className="absolute left-3.5 top-3.5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-2.5 py-1 text-xs shadow-lg backdrop-blur-md">
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  AO VIVO
                </span>
                <span className="font-semibold text-white">
                  {resolveStreamerName(focusedShare)}
                  {focusedShare.isLocal ? ' (Você)' : ''}
                </span>
                {resolutionLabel && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                    {resolutionLabel}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleFullscreen}
                title={isFullscreen ? 'Sair de tela cheia (Esc)' : 'Tela cheia (ou duplo clique)'}
                className="absolute right-3.5 top-3.5 rounded-xl border border-white/10 bg-black/70 p-2 text-slate-200 shadow-lg backdrop-blur-md transition hover:bg-black/90 hover:text-white"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Barra de controle da stream */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0a0d15] px-4 py-2.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                {screenShares.length > 1 &&
                  screenShares.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectFocusShare(s.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        s.id === focusedShare.id
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                          : 'bg-white/[0.07] text-slate-300 hover:bg-white/[0.14]'
                      }`}
                    >
                      {resolveStreamerName(s)}
                    </button>
                  ))}
                {focusedShare.isLocal && (
                  <span className="text-xs text-slate-400">
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
                      className="rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      {(streamVolumes[focusedShare.participantId] ?? 100) === 0 ? (
                        <VolumeX className="h-4 w-4 text-rose-400" />
                      ) : (
                        <Volume2 className="h-4 w-4 text-indigo-300" />
                      )}
                    </button>
                    <span className="text-xs text-slate-300">Volume da tela</span>
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
                    <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-300">
                      {streamVolumes[focusedShare.participantId] ?? 100}%
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <VolumeX className="h-3.5 w-3.5" />
                    Sem áudio do sistema
                  </span>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="concord-glass flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#121622]/75 p-7 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/25 bg-indigo-500/15 text-indigo-300 shadow-[0_0_24px_rgba(99,102,241,0.22)]">
              <MonitorUp className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold tracking-tight text-white">
              Ninguém está transmitindo agora
            </h4>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">
              Transmita seu jogo ou janela em até 1440p 60 FPS com áudio do sistema sem eco para os amigos na call.
            </p>
            <button
              type="button"
              onClick={onStartScreenShare}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500"
            >
              <MonitorUp className="h-3.5 w-3.5" />
              Compartilhar Minha Tela
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
                style={{
                  backgroundImage: `radial-gradient(circle at top left, ${p.avatarColor}22, transparent 62%)`,
                }}
                className={`flex flex-col justify-between rounded-2xl border bg-[#131724]/90 p-4 transition ${
                  isSpeaking
                    ? 'border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.16)]'
                    : 'border-white/[0.08] hover:border-white/[0.15]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    displayName={p.displayName}
                    color={p.avatarColor}
                    size="lg"
                    speaking={isSpeaking}
                    ringBg="border-[#131724]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold tracking-tight text-white">
                        {p.displayName}
                      </span>
                      {st?.screenSharing && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-300">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-rose-300" />
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
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                          <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                            <span className="voice-bar-1 h-2.5 w-[2px] rounded-full bg-emerald-400" />
                            <span className="voice-bar-2 h-3 w-[2px] rounded-full bg-emerald-400" />
                            <span className="voice-bar-3 h-2 w-[2px] rounded-full bg-emerald-400" />
                          </span>
                          Falando
                        </span>
                      ) : (
                        <span>No canal</span>
                      )}
                    </div>
                  </div>
                </div>

                {!isMe && (
                  <div className="mt-3 flex items-center gap-2.5 border-t border-white/[0.06] pt-2.5">
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={vol}
                      onChange={(e) => onSetUserVolume(p.id, Number(e.target.value))}
                      className="concord-slider flex-1"
                    />
                    <span className="w-10 text-right font-mono text-[11px] tabular-nums text-slate-300">
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
