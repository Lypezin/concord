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
import type { SavedSession, UpdaterStatus } from './bridge-types.js';
import { AuthScreen } from './components/AuthScreen.js';
import { ChannelModal } from './components/ChannelModal.js';
import { ChatArea } from './components/ChatArea.js';
import { ConfirmModal } from './components/ConfirmModal.js';
import { InviteModal } from './components/InviteModal.js';
import { MemberList } from './components/MemberList.js';
import { ScreenPickerModal } from './components/ScreenPickerModal.js';
import { Sidebar } from './components/Sidebar.js';
import { TitleBar } from './components/TitleBar.js';
import { VoiceSettingsModal } from './components/VoiceSettingsModal.js';
import { VoiceStage } from './components/VoiceStage.js';
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
  const [toast, setToast] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3800);
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
      showToast(voiceError);
      clearVoiceError();
    }
  }, [voiceError, clearVoiceError, showToast]);

  const loadChannelMessages = useCallback(
    async (channelId: string) => {
      if (!api) return;
      setLoadingMessages(true);
      try {
        const page = await api.getMessages(channelId, undefined, 50);
        setMessagesByChannel((prev) => ({ ...prev, [channelId]: page.messages }));
        setHasMoreByChannel((prev) => ({ ...prev, [channelId]: page.hasMore }));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [api, showToast],
  );

  // Carrega dados iniciais e abre Socket.IO quando logado
  useEffect(() => {
    if (!session || !api) return;

    let cancelled = false;
    const currentUserId = session.user.id;

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
        if (statusRes) setServerStatus(statusRes);

        const firstText = channelsRes.channels.find((c) => c.type === 'text');
        if (firstText) {
          setActiveChannelId(firstText.id);
          await loadChannelMessages(firstText.id);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : 'Erro ao carregar dados do servidor.');
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
        showToast('O canal de voz em que você estava foi excluído.');
      }
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
          [channelId]: list.filter((m) => m.id !== messageId),
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
      showToast(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#06070b] text-slate-100">
      <TitleBar
        connectionState={session ? connectionState : null}
        serverName={serverStatus?.serverName || 'Concord'}
        connectedVoiceChannelName={connectedVoiceChannel?.name ?? null}
        onClickVoicePill={() => setViewingVoiceStage((prev) => !prev)}
        updaterStatus={updaterStatus}
        onInstallUpdate={() => void window.concordAPI?.installUpdate()}
      />

      {bootstrapping ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#06070b]">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            <span className="text-xs font-medium tracking-wide text-slate-400">
              Iniciando Concord...
            </span>
          </div>
        </div>
      ) : !session && pendingOfflineSession ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#06070b] p-6">
          <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
          <div className="concord-glass relative w-full max-w-md space-y-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121622]/90 p-7 text-center backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/12 text-amber-300 shadow-[0_0_28px_rgba(245,158,11,0.2)]">
              <ServerOff className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Aguardando o servidor Concord ficar online...
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Tentando reconectar em{' '}
                <span className="inline-block rounded-md border border-white/10 bg-[#0a0d14] px-2 py-0.5 font-mono text-[11px] text-slate-200">
                  {pendingOfflineSession.serverUrl}
                </span>{' '}
                automaticamente a cada 4 segundos.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                disabled={retryingOffline}
                onClick={() => {
                  setRetryingOffline(true);
                  void attemptSessionRestore(pendingOfflineSession).finally(() =>
                    setRetryingOffline(false),
                  );
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
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
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Trocar de servidor / Sair
              </button>
            </div>
          </div>
        </div>
      ) : !session || !api ? (
        <AuthScreen onAuthenticated={(url, auth, st) => void handleAuthenticated(url, auth, st)} />
      ) : (
        <div className="relative flex min-h-0 flex-1 gap-2 bg-[#06070b] p-2 pt-0">
          <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-indigo-600/12 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-600/10 blur-[120px]" />

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
            totalUnreadCount={totalUnreadCount}
            voiceParticipants={voiceParticipants}
            voiceStates={voiceStates}
            speakingUserIds={voice.speakingUserIds}
            muted={voice.muted}
            deafened={voice.deafened}
            screenSharing={voice.screenSharing}
            rnnoiseEnabled={voice.settings.rnnoiseEnabled}
            viewingVoiceStage={viewingVoiceStage}
            userVolumes={voice.settings.userVolumes}
            onSelectChannel={handleSelectChannel}
            onOpenCreateChannel={(type) => setChannelModal({ mode: 'create', type })}
            onOpenRenameChannel={(channel) => setChannelModal({ mode: 'rename', channel })}
            onDeleteChannel={(channel) => setDeleteChannelTarget(channel)}
            onOpenInvites={() => setShowInviteModal(true)}
            onToggleMuteNotifications={() => {
              const next = !mutedNotifications;
              setMutedNotifications(next);
              saveMutedNotifications(next);
            }}
            onLogout={() => void handleLogout()}
            onToggleMute={() => void voice.toggleMute()}
            onToggleDeafen={() => void voice.toggleDeafen()}
            onOpenVoiceSettings={() => setShowVoiceSettings(true)}
            onToggleVoiceStage={() => setViewingVoiceStage((prev) => !prev)}
            onStartScreenShare={() => setShowScreenPicker(true)}
            onStopScreenShare={() => void voice.stopScreenShare()}
            onDisconnectVoice={() => void voice.leaveVoice(true)}
            onWatchScreenShare={(participantId) => {
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
            }}
            onSetUserVolume={voice.setUserVolume}
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
              rnnoiseEnabled={voice.settings.rnnoiseEnabled}
              userVolumes={voice.settings.userVolumes}
              streamVolumes={voice.settings.streamVolumes}
              focusedShareId={focusedShareId}
              totalUnreadCount={totalUnreadCount}
              onSelectFocusShare={setFocusedShareId}
              onSetUserVolume={voice.setUserVolume}
              onSetStreamVolume={voice.setStreamVolume}
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
              onSendMessage={async (content, attachmentIds) => {
                await api.sendMessage(activeChannel.id, { content, attachmentIds });
              }}
              onEditMessage={async (messageId, content) => {
                await api.editMessage(messageId, content);
              }}
              onDeleteMessage={async (messageId) => {
                try {
                  await api.deleteMessage(messageId);
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Erro ao excluir mensagem.');
                }
              }}
              onToggleReaction={async (messageId, emoji) => {
                try {
                  await api.toggleReaction(messageId, emoji);
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Erro ao atualizar reação.');
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
            <div className="concord-island flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0e121c]/95 text-slate-400">
              <Volume2 className="mb-2 h-8 w-8 text-slate-500" />
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
            />
          )}
        </div>
      )}

      {toast && (
        <div className="animate-toast-in fixed bottom-5 left-1/2 z-50 rounded-xl border border-indigo-400/35 bg-[#0e121c]/95 px-4 py-2.5 text-xs font-medium text-indigo-100 shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-md">
          {toast}
        </div>
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
          }}
          onUpdateSettings={voice.updateSettings}
          onClose={() => setShowVoiceSettings(false)}
        />
      )}

      {deleteChannelTarget && api && (
        <ConfirmModal
          title="Excluir canal"
          message={`Tem certeza que deseja excluir ${
            deleteChannelTarget.type === 'text' ? `#${deleteChannelTarget.name}` : deleteChannelTarget.name
          }? Todas as mensagens deste canal serão apagadas permanentemente.`}
          confirmLabel="Excluir Canal"
          onClose={() => setDeleteChannelTarget(null)}
          onConfirm={async () => {
            try {
              await api.deleteChannel(deleteChannelTarget.id);
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Erro ao excluir canal.');
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
            } else {
              await api.updateChannel(channelModal.channel.id, { name });
            }
          }}
        />
      )}
    </div>
  );
}
