import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import {
  Check,
  ChevronUp,
  Eye,
  EyeOff,
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
import type { VoiceAudioSettings } from '../lib/audioSettings.js';
import { Avatar } from './Avatar.js';
import { VideoTrackPlayer } from './VideoTrackPlayer.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover.js';
import { VolumeSlider } from './ui/Slider.js';
import { Switch } from './ui/Switch.js';
import { ActionTooltip } from './ui/Tooltip.js';

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
  settings: VoiceAudioSettings;
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
  focusedShareId: string | null;
  totalUnreadCount: number;
  onSelectFocusShare: (id: string) => void;
  onSetUserVolume: (userId: string, volume: number) => void;
  onSetStreamVolume: (userId: string, volume: number) => void;
  onUpdateSettings: (next: VoiceAudioSettings) => Promise<void>;
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
  settings,
  userVolumes,
  streamVolumes,
  focusedShareId,
  totalUnreadCount,
  onSelectFocusShare,
  onSetUserVolume,
  onSetStreamVolume,
  onUpdateSettings,
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
  const [hideLocalPreview, setHideLocalPreview] = useState(false);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setInputs(list.filter((d) => d.kind === 'audioinput'));
      setOutputs(list.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // ignore enumeration errors
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const onChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, [refreshDevices]);

  const participantsById = new Map(participants.map((p) => [p.id, p]));

  const resolveStreamerName = (share: ScreenShareStream): string =>
    participantsById.get(share.participantId)?.displayName ?? share.participantName;

  const focusedShare =
    screenShares.find((s) => s.id === focusedShareId) ??
    screenShares.find((s) => !s.isLocal) ??
    screenShares[0] ??
    null;

  const focusedVideoTrack = focusedShare?.videoTrack ?? null;

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === stageContainerRef.current);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!focusedVideoTrack) {
      setResolutionLabel(null);
      return;
    }
    const trackSettings = focusedVideoTrack.mediaStreamTrack?.getSettings?.();
    if (trackSettings?.width && trackSettings?.height) {
      const fpsPart = trackSettings.frameRate ? ` • ${Math.round(trackSettings.frameRate)} FPS` : '';
      const next = `${trackSettings.width}×${trackSettings.height}${fpsPart}`;
      setResolutionLabel((prev) => (prev === next ? prev : next));
    }
  }, [focusedVideoTrack]);

  const handleStats = useCallback(
    ({ width, height, fps }: { width: number; height: number; fps: number }) => {
      const next = fps > 0 ? `${width}×${height} • ${fps} FPS` : `${width}×${height}`;
      setResolutionLabel((prev) => (prev === next ? prev : next));
    },
    [],
  );

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
            {focusedShare.isLocal && hideLocalPreview ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center bg-[#141418] p-6 text-center">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  <MonitorUp className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    AO VIVO
                  </span>
                  <h4 className="text-sm font-semibold text-white">
                    Você está transmitindo sua tela
                  </h4>
                  {resolutionLabel && (
                    <span className="rounded border border-white/[0.08] bg-[#0c0c0e] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                      {resolutionLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-md text-xs text-zinc-400">
                  Pré-visualização oculta para evitar o efeito de espelho infinito e economizar uso de placa de vídeo.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHideLocalPreview(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-[#202027] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-[#2a2a33] hover:text-white"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Mostrar Prévia
                  </button>
                  <button
                    type="button"
                    onClick={onStopScreenShare}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
                  >
                    <MonitorOff className="h-3.5 w-3.5" />
                    Encerrar Transmissão
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDoubleClick={handleFullscreen}
                className="relative flex min-h-[300px] flex-1 items-center justify-center bg-black"
              >
                <VideoTrackPlayer
                  track={focusedShare.videoTrack}
                  onStats={handleStats}
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

                <div className="absolute right-3 top-3 flex items-center gap-1.5">
                  {focusedShare.isLocal && (
                    <ActionTooltip label="Ocultar prévia local (evita espelho infinito)">
                      <button
                        type="button"
                        onClick={() => setHideLocalPreview(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-black hover:text-white"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Ocultar Prévia</span>
                      </button>
                    </ActionTooltip>
                  )}

                  <ActionTooltip
                    label={
                      isFullscreen
                        ? 'Sair de tela cheia (Esc)'
                        : 'Tela cheia (ou duplo clique)'
                    }
                  >
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      className="rounded-lg border border-white/10 bg-black/80 p-2 text-zinc-200 transition hover:bg-black hover:text-white"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </button>
                  </ActionTooltip>
                </div>
              </div>
            )}

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
                    Sua transmissão está ativa para o canal
                  </span>
                )}
              </div>

              {!focusedShare.isLocal && (
                focusedShare.hasAudio ? (
                  <div className="flex items-center gap-2.5">
                    <ActionTooltip
                      label={
                        (streamVolumes[focusedShare.participantId] ?? 100) === 0
                          ? 'Desmutar áudio da tela'
                          : 'Mutar áudio da tela'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleMuteStream(focusedShare.participantId)}
                        className="rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        {(streamVolumes[focusedShare.participantId] ?? 100) === 0 ? (
                          <VolumeX className="h-4 w-4 text-rose-400" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-zinc-300" />
                        )}
                      </button>
                    </ActionTooltip>
                    <span className="text-xs text-zinc-400">Volume da tela</span>
                    <VolumeSlider
                      value={streamVolumes[focusedShare.participantId] ?? 100}
                      max={200}
                      onChange={(val) =>
                        onSetStreamVolume(focusedShare.participantId, val)
                      }
                      className="w-28"
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
              Compartilhe sua tela ou janela em até 1440p a 60 FPS com os participantes do canal.
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
                    <VolumeSlider
                      value={vol}
                      max={200}
                      onChange={(val) => onSetUserVolume(p.id, val)}
                      className="flex-1"
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
            <div className="flex items-center overflow-hidden rounded-lg bg-[#222229]">
              <ActionTooltip label={muted ? 'Ativar microfone' : 'Mutar microfone'}>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                    muted
                      ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                      : 'text-zinc-100 hover:bg-[#2b2b34]'
                  }`}
                >
                  {muted ? (
                    <MicOff className="h-4 w-4 text-rose-300" />
                  ) : (
                    <Mic className="h-4 w-4 text-zinc-200" />
                  )}
                  <span>{muted ? 'Mutado' : 'Microfone'}</span>
                </button>
              </ActionTooltip>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void refreshDevices()}
                    title="Trocar microfone ou filtro de ruído"
                    className="border-l border-white/[0.07] px-1.5 py-1.5 text-zinc-400 transition hover:bg-[#2b2b34] hover:text-white"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64 space-y-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Microfone de Entrada
                  </div>
                  <div className="max-h-40 space-y-0.5 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSettings({ ...settings, inputDeviceId: 'default' })
                      }
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-[#26262f]"
                    >
                      <span className="truncate">Padrão do Windows</span>
                      {settings.inputDeviceId === 'default' && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#5865f2]" />
                      )}
                    </button>
                    {inputs.map((dev, i) => (
                      <button
                        key={dev.deviceId || i}
                        type="button"
                        onClick={() =>
                          void onUpdateSettings({ ...settings, inputDeviceId: dev.deviceId })
                        }
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-[#26262f]"
                      >
                        <span className="truncate">{dev.label || `Microfone ${i + 1}`}</span>
                        {settings.inputDeviceId === dev.deviceId && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-[#5865f2]" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-white/[0.07] pt-2">
                    <span className="text-xs font-medium text-zinc-200">
                      Filtro RNNoise
                    </span>
                    <Switch
                      checked={settings.rnnoiseEnabled}
                      onCheckedChange={(checked) =>
                        void onUpdateSettings({ ...settings, rnnoiseEnabled: checked })
                      }
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {onToggleDeafen && (
            <div className="flex items-center overflow-hidden rounded-lg bg-[#222229]">
              <ActionTooltip label={deafened ? 'Reativar áudio' : 'Ensurdecer'}>
                <button
                  type="button"
                  onClick={onToggleDeafen}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                    deafened
                      ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                      : 'text-zinc-100 hover:bg-[#2b2b34]'
                  }`}
                >
                  {deafened ? (
                    <HeadphoneOff className="h-4 w-4 text-rose-300" />
                  ) : (
                    <Headphones className="h-4 w-4 text-zinc-200" />
                  )}
                  <span className="hidden sm:inline">{deafened ? 'Ensurdecido' : 'Áudio'}</span>
                </button>
              </ActionTooltip>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void refreshDevices()}
                    title="Trocar dispositivo de saída"
                    className="border-l border-white/[0.07] px-1.5 py-1.5 text-zinc-400 transition hover:bg-[#2b2b34] hover:text-white"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-64 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Saída de Áudio (Fones / Caixa)
                  </div>
                  <div className="max-h-40 space-y-0.5 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() =>
                        void onUpdateSettings({ ...settings, outputDeviceId: 'default' })
                      }
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-[#26262f]"
                    >
                      <span className="truncate">Padrão do Windows</span>
                      {settings.outputDeviceId === 'default' && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#5865f2]" />
                      )}
                    </button>
                    {outputs.map((dev, i) => (
                      <button
                        key={dev.deviceId || i}
                        type="button"
                        onClick={() =>
                          void onUpdateSettings({ ...settings, outputDeviceId: dev.deviceId })
                        }
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-[#26262f]"
                      >
                        <span className="truncate">{dev.label || `Saída ${i + 1}`}</span>
                        {settings.outputDeviceId === dev.deviceId && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-[#5865f2]" />
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
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

          <ActionTooltip label="Configurações de voz e perfil">
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg bg-[#222229] p-1.5 text-zinc-300 transition hover:bg-[#2b2b34] hover:text-white"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </ActionTooltip>

          {onDisconnectVoice && (
            <ActionTooltip label="Desconectar da chamada">
              <button
                type="button"
                onClick={onDisconnectVoice}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
              >
                <PhoneOff className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </ActionTooltip>
          )}
        </div>
      </div>
    </section>
  );
}
