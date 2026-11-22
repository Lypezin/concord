import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioPresets,
  createLocalAudioTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type { ConcordApiClient } from '../lib/api.js';
import {
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceAudioSettings,
} from '../lib/audioSettings.js';
import { RemoteAudioEngine } from '../lib/remoteAudioEngine.js';
import { RNNoiseAudioProcessor } from '../lib/rnnoiseProcessor.js';
import type { ConcordSocket } from '../lib/socket.js';
import {
  playDeafenToggle,
  playJoinVoice,
  playLeaveVoice,
  playMuteToggle,
  playStartStream,
} from '../lib/sounds.js';

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ScreenShareOptions {
  sourceId: string;
  includeSystemAudio: boolean;
  resolution: '720p' | '1080p' | '1440p';
  fps: 30 | 60;
  contentHint: 'motion' | 'detail';
}

export interface ScreenShareStream {
  id: string;
  participantId: string;
  participantName: string;
  videoTrack: Track;
  hasAudio: boolean;
  isLocal: boolean;
}

const RESOLUTION_PRESETS: Record<
  ScreenShareOptions['resolution'],
  { width: number; height: number; maxBitrate: number }
> = {
  '720p': { width: 1280, height: 720, maxBitrate: 3_000_000 },
  '1080p': { width: 1920, height: 1080, maxBitrate: 6_000_000 },
  '1440p': { width: 2560, height: 1440, maxBitrate: 10_000_000 },
};

export function useVoiceRoom(options: {
  api: ConcordApiClient | null;
  socket: ConcordSocket | null;
  currentUserId: string | null;
  currentDisplayName: string | null;
}) {
  const { api, socket, currentUserId, currentDisplayName } = options;

  const [settings, setSettings] = useState<VoiceAudioSettings>(() => loadVoiceSettings());
  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceConnectionState>('disconnected');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<{
    toggleMute: boolean;
    toggleDeafen: boolean;
  } | null>(null);

  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [screenShares, setScreenShares] = useState<ScreenShareStream[]>([]);

  const roomRef = useRef<Room | null>(null);
  const micTrackRef = useRef<LocalAudioTrack | null>(null);
  const screenVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const audioEngineRef = useRef<RemoteAudioEngine | null>(null);
  const socketRef = useRef<ConcordSocket | null>(socket);
  const micRebuildChainRef = useRef<Promise<void>>(Promise.resolve());
  const joinAttemptIdRef = useRef(0);

  const settingsRef = useRef(settings);
  const connectedChannelRef = useRef(connectedChannelId);
  const mutedRef = useRef(muted);
  const deafenedRef = useRef(deafened);
  const screenSharingRef = useRef(screenSharing);
  const mutedBeforeDeafenRef = useRef(false);
  const displayNameRef = useRef(currentDisplayName);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    displayNameRef.current = currentDisplayName;
  }, [currentDisplayName]);

  useEffect(() => {
    settingsRef.current = settings;
    saveVoiceSettings(settings);
  }, [settings]);

  useEffect(() => {
    connectedChannelRef.current = connectedChannelId;
  }, [connectedChannelId]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);

  useEffect(() => {
    screenSharingRef.current = screenSharing;
  }, [screenSharing]);

  const emitVoiceState = useCallback(
    (next: {
      channelId: string | null;
      muted: boolean;
      deafened: boolean;
      screenSharing: boolean;
    }) => {
      const sock = socketRef.current;
      if (sock && sock.connected) {
        sock.emit('voice:state', next);
      }
    },
    [],
  );

  // Sync voice state whenever socket connects/reconnects while in a call
  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      if (connectedChannelRef.current) {
        socket.emit('voice:state', {
          channelId: connectedChannelRef.current,
          muted: mutedRef.current,
          deafened: deafenedRef.current,
          screenSharing: screenSharingRef.current,
        });
      }
    };
    socket.on('connect', handleConnect);
    if (socket.connected && connectedChannelRef.current) {
      handleConnect();
    }
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket]);

  const rebuildScreenShares = useCallback((room: Room | null) => {
    if (!room) {
      setScreenShares([]);
      return;
    }

    const shares: ScreenShareStream[] = [];
    const localPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (localPub?.track) {
      const localAudioPub = room.localParticipant.getTrackPublication(
        Track.Source.ScreenShareAudio,
      );
      shares.push({
        id: `local-${room.localParticipant.identity}`,
        participantId: room.localParticipant.identity,
        participantName: displayNameRef.current || room.localParticipant.name || 'Você',
        videoTrack: localPub.track,
        hasAudio: Boolean(localAudioPub?.track),
        isLocal: true,
      });
    }

    for (const participant of room.remoteParticipants.values()) {
      const videoPub = participant.getTrackPublication(Track.Source.ScreenShare);
      if (videoPub?.track && videoPub.isSubscribed) {
        const audioPub = participant.getTrackPublication(Track.Source.ScreenShareAudio);
        shares.push({
          id: `remote-${participant.identity}`,
          participantId: participant.identity,
          participantName: participant.name || participant.identity,
          videoTrack: videoPub.track,
          hasAudio: Boolean(audioPub?.track && audioPub.isSubscribed),
          isLocal: false,
        });
      }
    }

    setScreenShares(shares);
  }, []);

  const stopScreenShareInternal = useCallback(async () => {
    const room = roomRef.current;
    const vTrack = screenVideoTrackRef.current;
    const aTrack = screenAudioTrackRef.current;
    screenVideoTrackRef.current = null;
    screenAudioTrackRef.current = null;

    if (room && vTrack) {
      await room.localParticipant.unpublishTrack(vTrack, true).catch(() => undefined);
    } else {
      vTrack?.stop();
    }

    if (room && aTrack) {
      await room.localParticipant.unpublishTrack(aTrack, true).catch(() => undefined);
    } else {
      aTrack?.stop();
    }

    setScreenSharing(false);
    screenSharingRef.current = false;
    rebuildScreenShares(room);

    if (connectedChannelRef.current) {
      emitVoiceState({
        channelId: connectedChannelRef.current,
        muted: mutedRef.current,
        deafened: deafenedRef.current,
        screenSharing: false,
      });
    }
  }, [emitVoiceState, rebuildScreenShares]);

  const leaveVoiceInternal = useCallback(
    async (playSound = true) => {
      const wasConnected = Boolean(connectedChannelRef.current || roomRef.current);

      const vTrack = screenVideoTrackRef.current;
      const aTrack = screenAudioTrackRef.current;
      screenVideoTrackRef.current = null;
      screenAudioTrackRef.current = null;
      vTrack?.stop();
      aTrack?.stop();

      const mic = micTrackRef.current;
      micTrackRef.current = null;
      if (mic) {
        await mic.stopProcessor().catch(() => undefined);
        mic.stop();
      }

      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        await room.disconnect(true).catch(() => undefined);
      }

      audioEngineRef.current?.destroy();
      audioEngineRef.current = null;

      setConnectedChannelId(null);
      connectedChannelRef.current = null;
      setConnectedAt(null);
      setVoiceState('disconnected');
      setScreenSharing(false);
      screenSharingRef.current = false;
      setSpeakingUserIds([]);
      setScreenShares([]);

      emitVoiceState({
        channelId: null,
        muted: mutedRef.current,
        deafened: deafenedRef.current,
        screenSharing: false,
      });

      if (wasConnected && playSound) {
        playLeaveVoice();
      }
    },
    [emitVoiceState],
  );

  const leaveVoice = useCallback(
    async (playSound = true) => {
      joinAttemptIdRef.current++;
      await leaveVoiceInternal(playSound);
    },
    [leaveVoiceInternal],
  );

  // Leave voice cleanly on logout
  useEffect(() => {
    if (!api || !currentUserId) {
      void leaveVoice(false);
    }
  }, [api, currentUserId, leaveVoice]);

  // Leave voice cleanly on unmount
  useEffect(() => {
    return () => {
      void leaveVoice(false);
    };
  }, [leaveVoice]);

  const createMicTrackWithSettings = useCallback(
    async (cfg: VoiceAudioSettings): Promise<LocalAudioTrack> => {
      const track = await createLocalAudioTrack({
        deviceId: cfg.inputDeviceId !== 'default' ? cfg.inputDeviceId : undefined,
        echoCancellation: cfg.echoCancellation,
        autoGainControl: cfg.autoGainControl,
        noiseSuppression: !cfg.rnnoiseEnabled,
      });

      if (cfg.rnnoiseEnabled) {
        const processor = new RNNoiseAudioProcessor();
        await track.setProcessor(processor);
      }

      if (mutedRef.current || deafenedRef.current) {
        await track.mute();
      }
      return track;
    },
    [],
  );

  const joinVoice = useCallback(
    async (channelId: string) => {
      if (!api) return;
      if (connectedChannelRef.current === channelId && roomRef.current) {
        return;
      }

      const attemptId = ++joinAttemptIdRef.current;
      setVoiceError(null);
      await leaveVoiceInternal(false);
      if (joinAttemptIdRef.current !== attemptId) {
        return;
      }

      setVoiceState('connecting');
      setConnectedChannelId(channelId);
      connectedChannelRef.current = channelId;

      let localEngine: RemoteAudioEngine | null = null;
      let localRoom: Room | null = null;

      try {
        const { token, url } = await api.createVoiceToken(channelId);
        if (joinAttemptIdRef.current !== attemptId) {
          return;
        }

        const engine = new RemoteAudioEngine();
        localEngine = engine;
        engine.setDeafened(deafenedRef.current);
        await engine.setOutputDevice(settingsRef.current.outputDeviceId);
        if (joinAttemptIdRef.current !== attemptId) {
          engine.destroy();
          return;
        }
        audioEngineRef.current = engine;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
        });
        localRoom = room;
        roomRef.current = room;

        const attachAudioPub = (
          track: RemoteTrack,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          if (track.kind !== Track.Kind.Audio) return;
          if (publication.source === Track.Source.ScreenShareAudio) {
            const vol = settingsRef.current.streamVolumes[participant.identity] ?? 100;
            engine.attachTrack(`screen:${participant.identity}`, track.mediaStreamTrack, vol);
          } else {
            const vol = settingsRef.current.userVolumes[participant.identity] ?? 100;
            engine.attachTrack(`voice:${participant.identity}`, track.mediaStreamTrack, vol);
          }
        };

        room.on(RoomEvent.Reconnecting, () => {
          if (roomRef.current === room) {
            setVoiceState('reconnecting');
          }
        });
        room.on(RoomEvent.Reconnected, () => {
          if (roomRef.current === room) {
            setVoiceState('connected');
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) {
            void leaveVoice(true);
          }
        });

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          if (roomRef.current === room) {
            setSpeakingUserIds(speakers.map((s) => s.identity));
          }
        });

        room.on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (roomRef.current !== room) return;
            attachAudioPub(track, publication, participant);
            if (
              publication.source === Track.Source.ScreenShare ||
              publication.source === Track.Source.ScreenShareAudio
            ) {
              rebuildScreenShares(room);
            }
          },
        );

        room.on(
          RoomEvent.TrackUnsubscribed,
          (
            track: RemoteTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (roomRef.current !== room) return;
            if (track.kind === Track.Kind.Audio) {
              if (publication.source === Track.Source.ScreenShareAudio) {
                engine.detachTrack(`screen:${participant.identity}`);
              } else {
                engine.detachTrack(`voice:${participant.identity}`);
              }
            }
            if (
              publication.source === Track.Source.ScreenShare ||
              publication.source === Track.Source.ScreenShareAudio
            ) {
              rebuildScreenShares(room);
            }
          },
        );

        room.on(RoomEvent.LocalTrackPublished, (_pub: LocalTrackPublication) => {
          if (roomRef.current === room) {
            rebuildScreenShares(room);
          }
        });
        room.on(RoomEvent.LocalTrackUnpublished, (_pub: LocalTrackPublication) => {
          if (roomRef.current === room) {
            rebuildScreenShares(room);
          }
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          if (roomRef.current !== room) return;
          engine.detachTrack(`voice:${participant.identity}`);
          engine.detachTrack(`screen:${participant.identity}`);
          rebuildScreenShares(room);
        });

        await room.connect(url, token);

        if (joinAttemptIdRef.current !== attemptId || roomRef.current !== room) {
          await room.disconnect(true).catch(() => undefined);
          engine.destroy();
          return;
        }

        // Sync any already-subscribed remote tracks immediately upon connect
        for (const participant of room.remoteParticipants.values()) {
          for (const pub of participant.trackPublications.values()) {
            if (pub.isSubscribed && pub.track) {
              attachAudioPub(pub.track, pub, participant);
            }
          }
        }
        rebuildScreenShares(room);

        // Publish microphone (warn gracefully if PC has no microphone)
        try {
          const micTrack = await createMicTrackWithSettings(settingsRef.current);
          if (joinAttemptIdRef.current !== attemptId || roomRef.current !== room) {
            await micTrack.stopProcessor().catch(() => undefined);
            micTrack.stop();
            return;
          }
          micTrackRef.current = micTrack;
          await room.localParticipant.publishTrack(micTrack, {
            source: Track.Source.Microphone,
            audioPreset: AudioPresets.speech,
            dtx: true,
            red: true,
          });
        } catch (micErr) {
          if (joinAttemptIdRef.current !== attemptId) {
            return;
          }
          setVoiceError(
            micErr instanceof Error
              ? `Microfone indisponível (ouvindo apenas): ${micErr.message}`
              : 'Microfone indisponível (conectado apenas para ouvir).',
          );
        }

        if (joinAttemptIdRef.current !== attemptId || roomRef.current !== room) {
          return;
        }

        setVoiceState('connected');
        setConnectedAt(Date.now());
        playJoinVoice();

        emitVoiceState({
          channelId,
          muted: mutedRef.current,
          deafened: deafenedRef.current,
          screenSharing: false,
        });
      } catch (err) {
        if (joinAttemptIdRef.current !== attemptId) {
          if (localRoom && roomRef.current !== localRoom) {
            await localRoom.disconnect(true).catch(() => undefined);
          }
          if (localEngine && audioEngineRef.current !== localEngine) {
            localEngine.destroy();
          }
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Não foi possível conectar ao canal de voz.';
        setVoiceError(message);
        await leaveVoiceInternal(false);
      }
    },
    [api, createMicTrackWithSettings, emitVoiceState, leaveVoice, leaveVoiceInternal, rebuildScreenShares],
  );

  const toggleMute = useCallback(async () => {
    const nextMuted = !mutedRef.current;
    let nextDeafened = deafenedRef.current;

    if (!nextMuted && nextDeafened) {
      nextDeafened = false;
      setDeafened(false);
      deafenedRef.current = false;
      audioEngineRef.current?.setDeafened(false);
    }

    setMuted(nextMuted);
    mutedRef.current = nextMuted;

    const mic = micTrackRef.current;
    if (mic) {
      if (nextMuted) {
        await mic.mute().catch(() => undefined);
      } else {
        await mic.unmute().catch(() => undefined);
      }
    }

    playMuteToggle(nextMuted);

    if (connectedChannelRef.current) {
      emitVoiceState({
        channelId: connectedChannelRef.current,
        muted: nextMuted,
        deafened: nextDeafened,
        screenSharing: screenSharingRef.current,
      });
    }
  }, [emitVoiceState]);

  const toggleDeafen = useCallback(async () => {
    const nextDeafened = !deafenedRef.current;
    let nextMuted = mutedRef.current;

    if (nextDeafened) {
      mutedBeforeDeafenRef.current = mutedRef.current;
      nextMuted = true;
    } else {
      nextMuted = mutedBeforeDeafenRef.current;
    }

    setDeafened(nextDeafened);
    deafenedRef.current = nextDeafened;
    setMuted(nextMuted);
    mutedRef.current = nextMuted;

    audioEngineRef.current?.setDeafened(nextDeafened);

    const mic = micTrackRef.current;
    if (mic) {
      if (nextMuted) {
        await mic.mute().catch(() => undefined);
      } else {
        await mic.unmute().catch(() => undefined);
      }
    }

    playDeafenToggle(nextDeafened);

    if (connectedChannelRef.current) {
      emitVoiceState({
        channelId: connectedChannelRef.current,
        muted: nextMuted,
        deafened: nextDeafened,
        screenSharing: screenSharingRef.current,
      });
    }
  }, [emitVoiceState]);

  const startScreenShare = useCallback(
    async (opts: ScreenShareOptions) => {
      const room = roomRef.current;
      if (!room || !connectedChannelRef.current) {
        throw new Error('Entre em um canal de voz antes de compartilhar a tela.');
      }

      await stopScreenShareInternal();

      const preset = RESOLUTION_PRESETS[opts.resolution];
      if (window.concordAPI) {
        await window.concordAPI.selectScreenSource({
          sourceId: opts.sourceId,
          includeSystemAudio: opts.includeSystemAudio,
        });
      }

      const streamConstraints = {
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: opts.fps, max: opts.fps },
        },
        audio: opts.includeSystemAudio
          ? ({
              restrictOwnAudio: true,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as MediaTrackConstraints)
          : false,
      };

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(streamConstraints);

        const rawVideo = stream.getVideoTracks()[0];
        if (!rawVideo) {
          throw new Error('Nenhuma faixa de vídeo retornada pelo sistema.');
        }

        rawVideo.contentHint = opts.contentHint;

        const localVideo = new LocalVideoTrack(rawVideo, undefined, false);
        screenVideoTrackRef.current = localVideo;

        rawVideo.onended = () => {
          void stopScreenShareInternal();
        };

        await room.localParticipant.publishTrack(localVideo, {
          source: Track.Source.ScreenShare,
          simulcast: true,
          screenShareEncoding: {
            maxBitrate: preset.maxBitrate,
            maxFramerate: opts.fps,
          },
          screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
          degradationPreference:
            opts.contentHint === 'detail' ? 'maintain-resolution' : 'maintain-framerate',
        });

        const rawAudio = stream.getAudioTracks()[0];
        if (rawAudio) {
          const localAudio = new LocalAudioTrack(rawAudio, undefined, false);
          screenAudioTrackRef.current = localAudio;
          await room.localParticipant.publishTrack(localAudio, {
            source: Track.Source.ScreenShareAudio,
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false,
            forceStereo: true,
          });
        }

        setScreenSharing(true);
        screenSharingRef.current = true;
        rebuildScreenShares(room);
        playStartStream();

        emitVoiceState({
          channelId: connectedChannelRef.current,
          muted: mutedRef.current,
          deafened: deafenedRef.current,
          screenSharing: true,
        });
      } catch (err) {
        if (stream) {
          for (const t of stream.getTracks()) {
            t.stop();
          }
        }
        await stopScreenShareInternal().catch(() => undefined);
        throw err;
      }
    },
    [emitVoiceState, rebuildScreenShares, stopScreenShareInternal],
  );

  const updateSettings = useCallback(
    async (next: VoiceAudioSettings) => {
      const prev = settingsRef.current;
      setSettings(next);
      settingsRef.current = next;

      if (next.outputDeviceId !== prev.outputDeviceId) {
        await audioEngineRef.current?.setOutputDevice(next.outputDeviceId);
      }

      const micNeedsRebuild =
        next.inputDeviceId !== prev.inputDeviceId ||
        next.rnnoiseEnabled !== prev.rnnoiseEnabled ||
        next.echoCancellation !== prev.echoCancellation ||
        next.autoGainControl !== prev.autoGainControl;

      if (micNeedsRebuild) {
        const runRebuild = async () => {
          const room = roomRef.current;
          if (!room || !connectedChannelRef.current) return;

          const latestSettings = settingsRef.current;
          const oldMic = micTrackRef.current;
          micTrackRef.current = null;
          if (oldMic) {
            await room.localParticipant.unpublishTrack(oldMic, true).catch(() => undefined);
            await oldMic.stopProcessor().catch(() => undefined);
            oldMic.stop();
          }

          try {
            const newMic = await createMicTrackWithSettings(latestSettings);
            if (roomRef.current !== room || !connectedChannelRef.current) {
              await newMic.stopProcessor().catch(() => undefined);
              newMic.stop();
              return;
            }
            micTrackRef.current = newMic;
            await room.localParticipant.publishTrack(newMic, {
              source: Track.Source.Microphone,
              audioPreset: AudioPresets.speech,
              dtx: true,
              red: true,
            });
          } catch (err) {
            setVoiceError(
              err instanceof Error ? err.message : 'Erro ao atualizar microfone.',
            );
          }
        };

        micRebuildChainRef.current = micRebuildChainRef.current.then(runRebuild, runRebuild);
        await micRebuildChainRef.current;
      }
    },
    [createMicTrackWithSettings],
  );

  const setUserVolume = useCallback((userId: string, volumePercent: number) => {
    const clamped = Math.min(200, Math.max(0, Math.round(volumePercent)));
    audioEngineRef.current?.setVolume(`voice:${userId}`, clamped);
    setSettings((prev) => ({
      ...prev,
      userVolumes: { ...prev.userVolumes, [userId]: clamped },
    }));
  }, []);

  const setStreamVolume = useCallback((userId: string, volumePercent: number) => {
    const clamped = Math.min(200, Math.max(0, Math.round(volumePercent)));
    audioEngineRef.current?.setVolume(`screen:${userId}`, clamped);
    setSettings((prev) => ({
      ...prev,
      streamVolumes: { ...prev.streamVolumes, [userId]: clamped },
    }));
  }, []);

  const clearVoiceError = useCallback(() => {
    setVoiceError(null);
  }, []);

  // Register Electron global shortcuts & listen to shortcut triggers
  useEffect(() => {
    if (!window.concordAPI) return;
    void window.concordAPI
      .registerShortcuts(settings.shortcuts)
      .then((res) => {
        if (res?.registered) {
          setShortcutStatus(res.registered);
        }
      })
      .catch(() => undefined);
  }, [settings.shortcuts]);

  useEffect(() => {
    if (!window.concordAPI) return;
    return window.concordAPI.onShortcutTriggered((action) => {
      if (action === 'toggleMute') {
        void toggleMute();
      } else if (action === 'toggleDeafen') {
        void toggleDeafen();
      }
    });
  }, [toggleMute, toggleDeafen]);

  return {
    settings,
    connectedChannelId,
    connectedAt,
    voiceState,
    voiceError,
    clearVoiceError,
    shortcutStatus,
    muted,
    deafened,
    screenSharing,
    speakingUserIds,
    screenShares,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare: stopScreenShareInternal,
    updateSettings,
    setUserVolume,
    setStreamVolume,
  };
}
