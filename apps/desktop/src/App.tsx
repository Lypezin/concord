import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuthResponse,
  BootstrapStatus,
  Channel,
  ChannelType,
  Message,
  UserPublic,
  VoiceUserState,
} from '@concord/shared';
import { Loader2, RefreshCw, ServerOff, Volume2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { SavedSession, UpdaterStatus } from './bridge-types.js';
import { AuthScreen } from './components/AuthScreen.js';
import { ChannelModal } from './components/ChannelModal.js';
import { ChatArea } from './components/ChatArea.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ConfirmModal } from './components/ConfirmModal.js';
import { InviteModal } from './components/InviteModal.js';
import { MemberList } from './components/MemberList.js';
import { PipStreamPlayer } from './components/PipStreamPlayer.js';
import { ScreenPickerModal } from './components/ScreenPickerModal.js';
import { Sidebar } from './components/Sidebar.js';
import { TitleBar } from './components/TitleBar.js';
import { VoiceSettingsModal } from './components/VoiceSettingsModal.js';
import { VoiceStage } from './components/VoiceStage.js';
import { TooltipProvider } from './components/ui/Tooltip.js';
import { useVoiceRoom } from './hooks/useVoiceRoom.js';
import { ApiError, createApiClient } from './lib/api.js';
import { createConcordSocket, type ConcordSocket, type SocketConnectionState } from './lib/socket.js';
import { playMessagePing } from './lib/sounds.js';
import {
  clearSession,
  loadMutedNotifications,
  loadSession,
  notifyDesktop,
  saveMutedNotifications,
  saveSession,
} from './lib/storage.js';

interface ActiveSession {
  serverUrl: string;
  token: string;
  user: UserPublic;
}

export function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [pendingOfflineSession, setPendingOfflineSession] = useState<SavedSession | null>(null);
  const [retryingOffline, setRetryingOffline] = useState(false);

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [serverStatus, setServerStatus] = useState<BootstrapStatus | null>(null);
  const [connectionState, setConnectionState] = useState<SocketConnectionState | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);

  const [users, setUsers] = useState<UserPublic[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, string[]>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, VoiceUserState>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, Message[]>>({});
  const [hasMoreByChannel, setHasMoreByChannel] = useState<Record<string, boolean>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [typingByChannel, setTypingByChannel] = useState<Record<string, string[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [mutedNotifications, setMutedNotifications] = useState(() => loadMutedNotifications());
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [viewingVoiceStage, setViewingVoiceStage] = useState(false);
  const [focusedShareId, setFocusedShareId] = useState<string | null>(null);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<Channel | null>(null);
  const [channelModal, setChannelModal] = useState<
    | { mode: 'create'; type: Extract<ChannelType, 'text' | 'voice'> }
    | { mode: 'rename'; channel: Channel }
    | null
  >(null);

  const [socketInstance, setSocketInstance] = useState<ConcordSocket | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const viewingVoiceStageRef = useRef(false);
  const connectedVoiceIdRef = useRef<string | null>(null);
  const mutedRef = useRef(mutedNotifications);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    viewingVoiceStageRef.current = viewingVoiceStage;
    if (!viewingVoiceStage && activeChannelIdRef.current) {
      const chId = activeChannelIdRef.current;
      setUnreadCounts((prev) => (prev[chId] ? { ...prev, [chId]: 0 } : prev));
    }
  }, [viewingVoiceStage]);

  useEffect(() => {
    mutedRef.current = mutedNotifications;
  }, [mutedNotifications]);

  const handleCopyText = useCallback((text: string, label: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} copiado.`))
      .catch(() => toast.error('Não foi possível copiar para a área de transferência.'));
  }, []);

  // Escuta status de auto-atualização do Electron
  useEffect(() => {
    if (!window.concordAPI) return;
    void window.concordAPI.getUpdaterStatus().then(setUpdaterStatus).catch(() => undefined);
    return window.concordAPI.onUpdaterStatus(setUpdaterStatus);
  }, []);

  const attemptSessionRestore = useCallback(async (saved: SavedSession): Promise<'ok' | 'invalid' | 'offline'> => {
    try {
      const client = createApiClient(saved.serverUrl, saved.token);
      const [{ user }, status] = await Promise.all([
        client.getMe(),
        client.getBootstrapStatus().catch(() => null),
      ]);
      setServerStatus(status);
      setPendingOfflineSession(null);
      setSession({ serverUrl: saved.serverUrl, token: saved.token, user });
      return 'ok';
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await clearSession();
        setPendingOfflineSession(null);
        return 'invalid';
      }
      setPendingOfflineSession(saved);
      return 'offline';
    }
  }, []);

  // Tenta restaurar sessão salva na inicialização
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const saved = await loadSession();
        if (!saved || cancelled) return;
        await attemptSessionRestore(saved);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [attemptSessionRestore]);

  // Auto-retry a cada 4s se existir sessão salva e o servidor estiver offline
  useEffect(() => {
    if (!pendingOfflineSession || session) return;
    const timer = setInterval(() => {
      void attemptSessionRestore(pendingOfflineSession);
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingOfflineSession, session, attemptSessionRestore]);

  const sessionServerUrl = session?.serverUrl;
  const sessionToken = session?.token;
  const api = useMemo(() => {
    if (!sessionServerUrl || !sessionToken) return null;
    return createApiClient(sessionServerUrl, sessionToken);
  }, [sessionServerUrl, sessionToken]);

  const voice = useVoiceRoom({
    api,
    socket: socketInstance,
    currentUserId: session?.user.id ?? null,
    currentDisplayName: session?.user.displayName ?? null,
  });

  const { voiceError, clearVoiceError } = voice;

  useEffect(() => {
    connectedVoiceIdRef.current = voice.connectedChannelId;
    if (!voice.connectedChannelId) {
      setViewingVoiceStage(false);
      setFocusedShareId(null);
    }
  }, [voice.connectedChannelId]);

  useEffect(() => {
    if (voiceError) {
      toast.error(voiceError);
      clearVoiceError();
    }
  }, [voiceError, clearVoiceError]);

  const loadChannelMessages = useCallback(
    async (channelId: string) => {
      if (!api) return;
      setLoadingMessages(true);
      try {
        const page = await api.getMessages(channelId, undefined, 50);
        setMessagesByChannel((prev) => ({ ...prev, [channelId]: page.messages }));
        setHasMoreByChannel((prev) => ({ ...prev, [channelId]: page.hasMore }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [api],
  );

  // Carrega dados iniciais e abre Socket.IO quando logado
  useEffect(() => {
    if (!session || !api) return;

    let cancelled = false;
    const currentUserId = session.user.id;
    const currentUserRole = session.user.role;

    async function initWorkspace() {
      try {
        const [usersRes, channelsRes, statusRes] = await Promise.all([
          api!.getUsers(),
          api!.getChannels(),
          api!.getBootstrapStatus().catch(() => null),
        ]);
        if (cancelled) return;
        setUsers(usersRes.users);
        setChannels(channelsRes.channels);
        if (statusRes) {
          setServerStatus(statusRes);
          if (currentUserRole === 'admin' && statusRes.version) {
            const [maj, min] = statusRes.version.split('.').map(Number);
            if ((maj ?? 0) === 0 && (min ?? 0) < 6) {
              toast.warning(
                `Seu Concord Server ainda está na v${statusRes.version}. Reinicie o Iniciar-Concord-Server.bat para ativar exclusão/edição de canais, respostas e busca.`,
                { duration: 9000 },
              );
            }
          }
        }

        const firstText = channelsRes.channels.find((c) => c.type === 'text');
        if (firstText) {
          setActiveChannelId(firstText.id);
          await loadChannelMessages(firstText.id);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.');
        }
      }
    }

    void initWorkspace();

    const socket = createConcordSocket(session.serverUrl, session.token);
    setSocketInstance(socket);
    setConnectionState('reconnecting');
    let hasConnectedOnce = false;

    socket.on('connect', () => {
      setConnectionState('connected');
      if (hasConnectedOnce && !cancelled) {
        void (async () => {
          try {
            const [usersRes, channelsRes] = await Promise.all([
              api!.getUsers(),
              api!.getChannels(),
            ]);
            if (cancelled) return;
            setUsers(usersRes.users);
            setChannels(channelsRes.channels);
            const activeId = activeChannelIdRef.current;
            const validActive =
              activeId &&
              channelsRes.channels.some((c) => c.id === activeId && c.type === 'text')
                ? activeId
                : (channelsRes.channels.find((c) => c.type === 'text')?.id ?? null);
            setMessagesByChannel((prev) =>
              validActive && prev[validActive] ? { [validActive]: prev[validActive] } : {},
            );
            if (validActive) {
              if (validActive !== activeId) {
                setActiveChannelId(validActive);
              }
              await loadChannelMessages(validActive);
            }
          } catch {
            // ignore transient reconnect sync error
          }
        })();
      }
      hasConnectedOnce = true;
    });

    socket.on('disconnect', () => {
      setConnectionState('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionState('disconnected');
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        void clearSession();
        setSession(null);
        setConnectionState(null);
      } else {
        setConnectionState('reconnecting');
      }
    });

    socket.on('presence:update', (payload) => {
      setOnlineUserIds(payload.onlineUserIds);
      setVoiceParticipants(payload.voiceParticipants ?? {});
      setVoiceStates(payload.voiceStates ?? {});
    });

    socket.on('typing:update', ({ channelId, userIds }) => {
      setTypingByChannel((prev) => ({ ...prev, [channelId]: userIds }));
    });

    socket.on('user:joined', (newUser) => {
      setUsers((prev) => (prev.some((u) => u.id === newUser.id) ? prev : [...prev, newUser]));
    });

    socket.on('user:updated', (updatedUser) => {
      setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      setSession((prev) =>
        prev && prev.user.id === updatedUser.id ? { ...prev, user: updatedUser } : prev,
      );
      setMessagesByChannel((prev) => {
        const next: Record<string, Message[]> = {};
        for (const [chId, list] of Object.entries(prev)) {
          next[chId] = list.map((m) =>
            m.authorId === updatedUser.id ? { ...m, author: updatedUser } : m,
          );
        }
        return next;
      });
    });

    socket.on('channel:created', (channel) => {
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel],
      );
    });

    socket.on('channel:updated', (channel) => {
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? channel : c)));
    });

    socket.on('channel:deleted', ({ channelId }) => {
      if (connectedVoiceIdRef.current === channelId) {
        void voice.leaveVoice(true);
        toast.info('O canal de voz em que você estava foi excluído.');
      }

      setMessagesByChannel((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });
      setHasMoreByChannel((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });
      setUnreadCounts((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });
      setTypingByChannel((prev) => {
        if (!(channelId in prev)) return prev;
        const next = { ...prev };
        delete next[channelId];
        return next;
      });

      setChannels((prev) => {
        const next = prev.filter((c) => c.id !== channelId);
        if (activeChannelIdRef.current === channelId) {
          const fallback = next.find((c) => c.type === 'text');
          setActiveChannelId(fallback?.id ?? null);
          if (fallback) {
            void loadChannelMessages(fallback.id);
          }
        }
        return next;
      });
    });

    socket.on('message:new', (message) => {
      setMessagesByChannel((prev) => {
        const list = prev[message.channelId];
        if (!list) return prev;
        if (list.some((m) => m.id === message.id)) return prev;
        return { ...prev, [message.channelId]: [...list, message] };
      });

      const isCurrentlyViewingThisChannel =
        !viewingVoiceStageRef.current && activeChannelIdRef.current === message.channelId;
      const isMine = message.authorId === currentUserId;

      if (!isCurrentlyViewingThisChannel && !isMine) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.channelId]: (prev[message.channelId] ?? 0) + 1,
        }));
      }

      if (!isMine && !mutedRef.current) {
        playMessagePing();
        const preview = message.content || 'Enviou um anexo';
        notifyDesktop(`${message.author.displayName} no Concord`, preview);
      }
    });

    socket.on('message:updated', (message) => {
      setMessagesByChannel((prev) => {
        const list = prev[message.channelId];
        if (!list) return prev;
        return {
          ...prev,
          [message.channelId]: list.map((m) => (m.id === message.id ? message : m)),
        };
      });
    });

    socket.on('message:deleted', ({ channelId, messageId }) => {
      setMessagesByChannel((prev) => {
        const list = prev[channelId];
        if (!list) return prev;
        return {
          ...prev,
          [channelId]: list
            .filter((m) => m.id !== messageId)
            .map((m) =>
              m.replyToId === messageId ? { ...m, replyToId: null, replyTo: null } : m,
            ),
        };
      });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      setSocketInstance(null);
      setConnectionState(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, session?.serverUrl]);

  async function handleAuthenticated(
    serverUrl: string,
    auth: AuthResponse,
    status: BootstrapStatus,
  ): Promise<void> {
    await saveSession({ serverUrl, token: auth.token });
    setPendingOfflineSession(null);
    setServerStatus(status);
    setSession({ serverUrl, token: auth.token, user: auth.user });
  }

  async function handleLogout(): Promise<void> {
    await voice.leaveVoice(false);
    await clearSession();
    setPendingOfflineSession(null);
    setSession(null);
    setChannels([]);
    setUsers([]);
    setMessagesByChannel({});
    setUnreadCounts({});
    setVoiceParticipants({});
    setVoiceStates({});
    setActiveChannelId(null);
  }

  function handleSelectChannel(channel: Channel): void {
    if (channel.type === 'voice') {
      if (voice.connectedChannelId === channel.id) {
        setViewingVoiceStage(true);
      } else {
        setViewingVoiceStage(true);
        void voice.joinVoice(channel.id);
      }
      return;
    }

    setViewingVoiceStage(false);
    setActiveChannelId(channel.id);
    setUnreadCounts((prev) => ({ ...prev, [channel.id]: 0 }));
    if (!messagesByChannel[channel.id]) {
      void loadChannelMessages(channel.id);
    }
  }

  function handleWatchScreenShare(participantId: string): void {
    if (!session) return;
    const ownerChannel = Object.entries(voiceParticipants).find(([, ids]) =>
      ids.includes(participantId),
    )?.[0];
    if (ownerChannel && voice.connectedChannelId !== ownerChannel) {
      void voice.joinVoice(ownerChannel);
    }
    setFocusedShareId(
      participantId === session.user.id
        ? `local-${participantId}`
        : `remote-${participantId}`,
    );
    setViewingVoiceStage(true);
  }

  async function handleLoadOlder(): Promise<void> {
    if (!api || !activeChannelId || loadingOlder) return;
    const current = messagesByChannel[activeChannelId] ?? [];
    const oldest = current[0];
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      const page = await api.getMessages(activeChannelId, oldest.id, 50);
      setMessagesByChannel((prev) => {
        const existing = prev[activeChannelId] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const olderUnique = page.messages.filter((m) => !existingIds.has(m.id));
        return {
          ...prev,
          [activeChannelId]: [...olderUnique, ...existing],
        };
      });
      setHasMoreByChannel((prev) => ({ ...prev, [activeChannelId]: page.hasMore }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
    } finally {
      setLoadingOlder(false);
    }
  }

  const totalUnreadCount = useMemo(
    () => Object.values(unreadCounts).reduce((acc, n) => acc + n, 0),
    [unreadCounts],
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const connectedVoiceChannel =
    channels.find((c) => c.id === voice.connectedChannelId) ?? null;

  const voiceChannelParticipants = useMemo(() => {
    if (!connectedVoiceChannel) return [];
    const ids = new Set(voiceParticipants[connectedVoiceChannel.id] ?? []);
    if (session) ids.add(session.user.id);
    return users.filter((u) => ids.has(u.id));
  }, [connectedVoiceChannel, voiceParticipants, users, session]);

  const activeTypingUsers = useMemo(() => {
    if (!activeChannel || !session) return [];
    const ids = typingByChannel[activeChannel.id] ?? [];
    return ids
      .filter((id) => id !== session.user.id)
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is UserPublic => Boolean(u));
  }, [activeChannel, session, typingByChannel, users]);

  const activePipShare = useMemo(() => {
    if (viewingVoiceStage || !connectedVoiceChannel || voice.screenShares.length === 0) {
      return null;
    }
    return (
      voice.screenShares.find((s) => s.id === focusedShareId && !s.isLocal) ??
      voice.screenShares.find((s) => !s.isLocal) ??
      null
    );
  }, [viewingVoiceStage, connectedVoiceChannel, voice.screenShares, focusedShareId]);

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0c0c0e] text-zinc-100">
        <TitleBar
          connectionState={session ? connectionState : null}
          serverName={serverStatus?.serverName || 'Concord'}
          connectedVoiceChannelName={connectedVoiceChannel?.name ?? null}
          onClickVoicePill={() => setViewingVoiceStage((prev) => !prev)}
          onOpenCommandPalette={session ? () => setShowCommandPalette(true) : undefined}
          updaterStatus={updaterStatus}
          onInstallUpdate={() => void window.concordAPI?.installUpdate()}
        />

        {bootstrapping ? (
          <div className="flex flex-1 items-center justify-center bg-[#0c0c0e]">
            <div className="flex flex-col items-center gap-2.5">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              <span className="text-xs font-medium text-zinc-500">
                Iniciando Concord...
              </span>
            </div>
          </div>
        ) : !session && pendingOfflineSession ? (
          <div className="flex flex-1 items-center justify-center bg-[#0c0c0e] p-6">
            <div className="concord-panel w-full max-w-md space-y-5 rounded-xl border border-white/[0.08] bg-[#16161b] p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
                <ServerOff className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Aguardando o servidor ficar online...
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  Tentando reconectar em{' '}
                  <span className="rounded border border-white/[0.08] bg-[#0c0c0e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
                    {pendingOfflineSession.serverUrl}
                  </span>{' '}
                  automaticamente a cada 4 segundos.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={retryingOffline}
                  onClick={() => {
                    setRetryingOffline(true);
                    void attemptSessionRestore(pendingOfflineSession).finally(() =>
                      setRetryingOffline(false),
                    );
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865f2] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
                >
                  {retryingOffline ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Tentar Agora
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-lg border border-white/[0.08] bg-[#202027] px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-[#292932] hover:text-white"
                >
                  Trocar de servidor / Sair
                </button>
              </div>
            </div>
          </div>
        ) : !session || !api ? (
          <AuthScreen onAuthenticated={(url, auth, st) => void handleAuthenticated(url, auth, st)} />
        ) : (
          <div className="flex min-h-0 flex-1 bg-[#141418]">
            <Sidebar
              serverName={serverStatus?.serverName || 'Concord'}
              userCount={users.length || serverStatus?.userCount || 1}
              maxUsers={serverStatus?.maxUsers || 4}
              currentUser={session.user}
              users={users}
              channels={channels}
              activeChannelId={activeChannelId}
              unreadCounts={unreadCounts}
              mutedNotifications={mutedNotifications}
              connectedVoiceChannelId={voice.connectedChannelId}
              voiceConnectionState={voice.voiceState}
              connectedAt={voice.connectedAt}
              voiceTelemetry={voice.telemetry}
              rnnoiseEnabled={voice.settings.rnnoiseEnabled}
              totalUnreadCount={totalUnreadCount}
              voiceParticipants={voiceParticipants}
              voiceStates={voiceStates}
              speakingUserIds={voice.speakingUserIds}
              muted={voice.muted}
              deafened={voice.deafened}
              screenSharing={voice.screenSharing}
              viewingVoiceStage={viewingVoiceStage}
              userVolumes={voice.settings.userVolumes}
              onSelectChannel={handleSelectChannel}
              onOpenCreateChannel={(type) => setChannelModal({ mode: 'create', type })}
              onOpenRenameChannel={(channel) => setChannelModal({ mode: 'rename', channel })}
              onDeleteChannel={(channel) => setDeleteChannelTarget(channel)}
              onOpenInvites={() => setShowInviteModal(true)}
              onOpenCommandPalette={() => setShowCommandPalette(true)}
              onToggleMuteNotifications={() => {
                const next = !mutedNotifications;
                setMutedNotifications(next);
                saveMutedNotifications(next);
                toast.info(next ? 'Notificações silenciadas.' : 'Notificações ativadas.');
              }}
              onLogout={() => void handleLogout()}
              onToggleMute={() => void voice.toggleMute()}
              onToggleDeafen={() => void voice.toggleDeafen()}
              onOpenVoiceSettings={() => setShowVoiceSettings(true)}
              onToggleVoiceStage={() => setViewingVoiceStage((prev) => !prev)}
              onStartScreenShare={() => setShowScreenPicker(true)}
              onStopScreenShare={() => void voice.stopScreenShare()}
              onDisconnectVoice={() => void voice.leaveVoice(true)}
              onWatchScreenShare={handleWatchScreenShare}
              onSetUserVolume={voice.setUserVolume}
              onCopyText={handleCopyText}
            />

            {viewingVoiceStage && connectedVoiceChannel ? (
              <VoiceStage
                channel={connectedVoiceChannel}
                currentUser={session.user}
                participants={voiceChannelParticipants}
                voiceStates={voiceStates}
                speakingUserIds={voice.speakingUserIds}
                screenShares={voice.screenShares}
                screenSharing={voice.screenSharing}
                muted={voice.muted}
                deafened={voice.deafened}
                settings={voice.settings}
                userVolumes={voice.settings.userVolumes}
                streamVolumes={voice.settings.streamVolumes}
                focusedShareId={focusedShareId}
                totalUnreadCount={totalUnreadCount}
                onSelectFocusShare={setFocusedShareId}
                onSetUserVolume={voice.setUserVolume}
                onSetStreamVolume={voice.setStreamVolume}
                onUpdateSettings={voice.updateSettings}
                onToggleMute={() => void voice.toggleMute()}
                onToggleDeafen={() => void voice.toggleDeafen()}
                onStartScreenShare={() => setShowScreenPicker(true)}
                onStopScreenShare={() => void voice.stopScreenShare()}
                onDisconnectVoice={() => void voice.leaveVoice(true)}
                onOpenSettings={() => setShowVoiceSettings(true)}
                onBackToChat={() => setViewingVoiceStage(false)}
              />
            ) : activeChannel ? (
              <ChatArea
                api={api}
                channel={activeChannel}
                currentUser={session.user}
                messages={messagesByChannel[activeChannel.id] ?? []}
                hasMore={hasMoreByChannel[activeChannel.id] ?? false}
                loadingMessages={loadingMessages && !messagesByChannel[activeChannel.id]}
                loadingOlder={loadingOlder}
                typingUsers={activeTypingUsers}
                showMembers={showMembers}
                onToggleMembers={() => setShowMembers((prev) => !prev)}
                onLoadOlder={handleLoadOlder}
                onSendMessage={async (content, attachmentIds, replyToId) => {
                  await api.sendMessage(activeChannel.id, {
                    content,
                    attachmentIds,
                    replyToId: replyToId ?? undefined,
                  });
                }}
                onEditMessage={async (messageId, content) => {
                  await api.editMessage(messageId, content);
                }}
                onDeleteMessage={async (messageId) => {
                  try {
                    await api.deleteMessage(messageId);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Erro ao excluir mensagem.');
                  }
                }}
                onToggleReaction={async (messageId, emoji) => {
                  try {
                    await api.toggleReaction(messageId, emoji);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Erro ao atualizar reação.');
                  }
                }}
                onTypingSignal={(isTyping) => {
                  if (!socketInstance || !socketInstance.connected) return;
                  socketInstance.emit(isTyping ? 'typing:start' : 'typing:stop', {
                    channelId: activeChannel.id,
                  });
                }}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center bg-[#141418] text-zinc-400">
                <Volume2 className="mb-2 h-8 w-8 text-zinc-500" />
                <p className="text-sm">Selecione um canal de texto para conversar.</p>
              </div>
            )}

            {showMembers && (
              <MemberList
                users={users}
                onlineUserIds={onlineUserIds}
                channels={channels}
                voiceParticipants={voiceParticipants}
                voiceStates={voiceStates}
                onWatchScreenShare={handleWatchScreenShare}
                onCopyText={handleCopyText}
              />
            )}

            {activePipShare && (
              <PipStreamPlayer
                share={activePipShare}
                streamerName={
                  users.find((u) => u.id === activePipShare.participantId)?.displayName ??
                  activePipShare.participantName
                }
                streamVolume={voice.settings.streamVolumes[activePipShare.participantId] ?? 100}
                onToggleMuteStream={() => {
                  const cur = voice.settings.streamVolumes[activePipShare.participantId] ?? 100;
                  voice.setStreamVolume(activePipShare.participantId, cur > 0 ? 0 : 100);
                }}
                onExpandToStage={() => {
                  setFocusedShareId(activePipShare.id);
                  setViewingVoiceStage(true);
                }}
              />
            )}
          </div>
        )}

        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: '#18181d',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f4f4f5',
            },
          }}
        />

        {session && (
          <CommandPalette
            open={showCommandPalette}
            onOpenChange={setShowCommandPalette}
            channels={channels}
            isAdmin={session.user.role === 'admin'}
            inVoiceCall={Boolean(connectedVoiceChannel)}
            muted={voice.muted}
            deafened={voice.deafened}
            screenSharing={voice.screenSharing}
            showMembers={showMembers}
            onSelectChannel={handleSelectChannel}
            onToggleMute={() => void voice.toggleMute()}
            onToggleDeafen={() => void voice.toggleDeafen()}
            onStartScreenShare={() => setShowScreenPicker(true)}
            onStopScreenShare={() => void voice.stopScreenShare()}
            onDisconnectVoice={() => void voice.leaveVoice(true)}
            onOpenVoiceStage={() => setViewingVoiceStage(true)}
            onOpenSettings={() => setShowVoiceSettings(true)}
            onOpenInvites={() => setShowInviteModal(true)}
            onOpenCreateChannel={(type) => setChannelModal({ mode: 'create', type })}
            onToggleMembers={() => setShowMembers((prev) => !prev)}
          />
        )}

        {showInviteModal && api && session && (
          <InviteModal
            api={api}
            currentServerUrl={session.serverUrl}
            onClose={() => setShowInviteModal(false)}
          />
        )}

        {showScreenPicker && (
          <ScreenPickerModal
            onClose={() => setShowScreenPicker(false)}
            onStartShare={async (opts) => {
              await voice.startScreenShare(opts);
              setViewingVoiceStage(true);
            }}
          />
        )}

        {showVoiceSettings && session && api && (
          <VoiceSettingsModal
            currentUser={session.user}
            settings={voice.settings}
            shortcutStatus={voice.shortcutStatus}
            onUpdateProfile={async (body) => {
              const res = await api.updateProfile(body);
              setSession((prev) => (prev ? { ...prev, user: res.user } : prev));
              setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
              toast.success('Perfil atualizado.');
            }}
            onUpdateSettings={voice.updateSettings}
            onClose={() => setShowVoiceSettings(false)}
          />
        )}

        {deleteChannelTarget && api && (
          <ConfirmModal
            title="Excluir canal"
            message={`Tem certeza que deseja excluir ${
              deleteChannelTarget.type === 'text'
                ? `#${deleteChannelTarget.name}`
                : deleteChannelTarget.name
            }? Todas as mensagens deste canal serão apagadas permanentemente.`}
            confirmLabel="Excluir Canal"
            onClose={() => setDeleteChannelTarget(null)}
            onConfirm={async () => {
              try {
                await api.deleteChannel(deleteChannelTarget.id);
                toast.success(
                  `Canal ${deleteChannelTarget.type === 'text' ? `#${deleteChannelTarget.name}` : deleteChannelTarget.name} excluído.`,
                );
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Erro ao excluir canal.');
              }
            }}
          />
        )}

        {channelModal && api && (
          <ChannelModal
            mode={channelModal.mode}
            initialType={channelModal.mode === 'create' ? channelModal.type : undefined}
            channel={channelModal.mode === 'rename' ? channelModal.channel : undefined}
            onClose={() => setChannelModal(null)}
            onSubmit={async ({ name, type }) => {
              if (channelModal.mode === 'create') {
                const res = await api.createChannel({ name, type });
                if (res.channel.type === 'text') {
                  setMessagesByChannel((prev) => ({
                    ...prev,
                    [res.channel.id]: prev[res.channel.id] ?? [],
                  }));
                  setHasMoreByChannel((prev) => ({ ...prev, [res.channel.id]: false }));
                  setViewingVoiceStage(false);
                  setActiveChannelId(res.channel.id);
                }
                toast.success(
                  `Canal ${res.channel.type === 'text' ? `#${res.channel.name}` : res.channel.name} criado.`,
                );
              } else {
                const res = await api.updateChannel(channelModal.channel.id, { name });
                toast.success(`Canal renomeado para ${res.channel.name}.`);
              }
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
