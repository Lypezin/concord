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
import { Loader2, Volume2 } from 'lucide-react';
import type { UpdaterStatus } from './bridge-types.js';
import { AuthScreen } from './components/AuthScreen.js';
import { ChannelModal } from './components/ChannelModal.js';
import { ChatArea } from './components/ChatArea.js';
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
  const [viewingVoiceStage, setViewingVoiceStage] = useState(false);
  const [focusedShareId, setFocusedShareId] = useState<string | null>(null);
  const [channelModal, setChannelModal] = useState<
    | { mode: 'create'; type: Extract<ChannelType, 'text' | 'voice'> }
    | { mode: 'rename'; channel: Channel }
    | null
  >(null);

  const [socketInstance, setSocketInstance] = useState<ConcordSocket | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const mutedRef = useRef(mutedNotifications);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

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

  // Tenta restaurar sessão salva na inicialização
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const saved = await loadSession();
        if (!saved) return;
        const api = createApiClient(saved.serverUrl, saved.token);
        const [{ user }, status] = await Promise.all([
          api.getMe(),
          api.getBootstrapStatus().catch(() => null),
        ]);
        if (!cancelled) {
          setServerStatus(status);
          setSession({ serverUrl: saved.serverUrl, token: saved.token, user });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearSession();
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const api = useMemo(() => {
    if (!session) return null;
    return createApiClient(session.serverUrl, session.token);
  }, [session]);

  const voice = useVoiceRoom({
    api,
    socket: socketInstance,
    currentUserId: session?.user.id ?? null,
    currentDisplayName: session?.user.displayName ?? null,
  });

  useEffect(() => {
    if (voice.voiceError) {
      showToast(voice.voiceError);
      voice.clearVoiceError();
    }
  }, [voice, showToast]);

  // Se desconectar do canal de voz, fecha o palco automaticamente
  useEffect(() => {
    if (!voice.connectedChannelId) {
      setViewingVoiceStage(false);
      setFocusedShareId(null);
    }
  }, [voice.connectedChannelId]);

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

    socket.on('connect', () => {
      setConnectionState('connected');
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

    socket.on('channel:created', (channel) => {
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel],
      );
    });

    socket.on('channel:updated', (channel) => {
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? channel : c)));
    });

    socket.on('channel:deleted', ({ channelId }) => {
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

      const isActive = activeChannelIdRef.current === message.channelId;
      const isMine = message.authorId === currentUserId;

      if (!isActive) {
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
    setServerStatus(status);
    setSession({ serverUrl, token: auth.token, user: auth.user });
  }

  async function handleLogout(): Promise<void> {
    await voice.leaveVoice(false);
    await clearSession();
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0f1117] text-slate-100">
      <TitleBar
        connectionState={session ? connectionState : null}
        serverName={serverStatus?.serverName || 'Concord'}
        updaterStatus={updaterStatus}
        onInstallUpdate={() => void window.concordAPI?.installUpdate()}
      />

      {bootstrapping ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
        </div>
      ) : !session || !api ? (
        <AuthScreen onAuthenticated={(url, auth, st) => void handleAuthenticated(url, auth, st)} />
      ) : (
        <div className="flex min-h-0 flex-1">
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
            onDeleteChannel={(channel) => {
              void api
                .deleteChannel(channel.id)
                .catch((err) =>
                  showToast(err instanceof Error ? err.message : 'Erro ao excluir canal.'),
                );
            }}
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
              setFocusedShareId(`remote-${participantId}`);
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
              userVolumes={voice.settings.userVolumes}
              streamVolumes={voice.settings.streamVolumes}
              focusedShareId={focusedShareId}
              onSelectFocusShare={setFocusedShareId}
              onSetUserVolume={voice.setUserVolume}
              onSetStreamVolume={voice.setStreamVolume}
              onStartScreenShare={() => setShowScreenPicker(true)}
              onStopScreenShare={() => void voice.stopScreenShare()}
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
              onLoadOlder={handleLoadOlder}
              onSendMessage={async (content, attachmentIds) => {
                await api.sendMessage(activeChannel.id, { content, attachmentIds });
              }}
              onEditMessage={async (messageId, content) => {
                await api.editMessage(messageId, content);
              }}
              onDeleteMessage={async (messageId) => {
                await api.deleteMessage(messageId);
              }}
              onToggleReaction={async (messageId, emoji) => {
                await api.toggleReaction(messageId, emoji);
              }}
              onTypingSignal={(isTyping) => {
                if (!socketInstance || !socketInstance.connected) return;
                socketInstance.emit(isTyping ? 'typing:start' : 'typing:stop', {
                  channelId: activeChannel.id,
                });
              }}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#161922] text-slate-400">
              <Volume2 className="mb-2 h-8 w-8 text-slate-500" />
              <p className="text-sm">Selecione um canal de texto para conversar.</p>
            </div>
          )}

          <MemberList users={users} onlineUserIds={onlineUserIds} />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-indigo-400/30 bg-[#0f1117]/95 px-4 py-2 text-xs font-medium text-indigo-100 shadow-2xl">
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

      {showVoiceSettings && (
        <VoiceSettingsModal
          settings={voice.settings}
          onUpdateSettings={voice.updateSettings}
          onClose={() => setShowVoiceSettings(false)}
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
