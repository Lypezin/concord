import { useState } from 'react';
import type { Channel, ChannelType, UserPublic, VoiceUserState } from '@concord/shared';
import {
  Bell,
  BellOff,
  Hash,
  HeadphoneOff,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react';
import type { VoiceConnectionState } from '../hooks/useVoiceRoom.js';
import { Avatar } from './Avatar.js';
import { VoiceDock } from './VoiceDock.js';

interface SidebarProps {
  serverName: string;
  userCount: number;
  maxUsers: number;
  currentUser: UserPublic;
  users: UserPublic[];
  channels: Channel[];
  activeChannelId: string | null;
  unreadCounts: Record<string, number>;
  mutedNotifications: boolean;

  connectedVoiceChannelId: string | null;
  voiceConnectionState: VoiceConnectionState;
  voiceParticipants: Record<string, string[]>;
  voiceStates: Record<string, VoiceUserState>;
  speakingUserIds: string[];
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  viewingVoiceStage: boolean;
  userVolumes: Record<string, number>;

  onSelectChannel: (channel: Channel) => void;
  onOpenCreateChannel: (type: Extract<ChannelType, 'text' | 'voice'>) => void;
  onOpenRenameChannel: (channel: Channel) => void;
  onDeleteChannel: (channel: Channel) => void;
  onOpenInvites: () => void;
  onToggleMuteNotifications: () => void;
  onLogout: () => void;

  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenVoiceSettings: () => void;
  onToggleVoiceStage: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onDisconnectVoice: () => void;
  onWatchScreenShare: (participantId: string) => void;
  onSetUserVolume: (userId: string, volume: number) => void;
}

export function Sidebar({
  serverName,
  userCount,
  maxUsers,
  currentUser,
  users,
  channels,
  activeChannelId,
  unreadCounts,
  mutedNotifications,
  connectedVoiceChannelId,
  voiceConnectionState,
  voiceParticipants,
  voiceStates,
  speakingUserIds,
  muted,
  deafened,
  screenSharing,
  viewingVoiceStage,
  userVolumes,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenRenameChannel,
  onDeleteChannel,
  onOpenInvites,
  onToggleMuteNotifications,
  onLogout,
  onToggleMute,
  onToggleDeafen,
  onOpenVoiceSettings,
  onToggleVoiceStage,
  onStartScreenShare,
  onStopScreenShare,
  onDisconnectVoice,
  onWatchScreenShare,
  onSetUserVolume,
}: SidebarProps) {
  const [volumeOpenUserId, setVolumeOpenUserId] = useState<string | null>(null);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const usersById = new Map(users.map((u) => [u.id, u]));
  const speakingSet = new Set(speakingUserIds);
  const connectedVoiceChannel =
    channels.find((c) => c.id === connectedVoiceChannelId) ?? null;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/6 bg-[#131620]">
      {/* Cabeçalho do Servidor */}
      <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-white">{serverName}</h2>
          <p className="text-[11px] text-slate-400">
            {userCount}/{maxUsers} membros
          </p>
        </div>
        {currentUser.role === 'admin' && (
          <button
            type="button"
            onClick={onOpenInvites}
            title="Gerenciar convites"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Convites
          </button>
        )}
      </div>

      {/* Lista de Canais */}
      <div className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {/* Canais de Texto */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Canais de Texto
            </span>
            <button
              type="button"
              onClick={() => onOpenCreateChannel('text')}
              title="Criar canal de texto"
              className="rounded p-0.5 text-slate-400 transition hover:bg-white/8 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((ch) => {
              const isActive = !viewingVoiceStage && ch.id === activeChannelId;
              const unread = unreadCounts[ch.id] ?? 0;
              const canDelete = textChannels.length > 1;

              return (
                <div
                  key={ch.id}
                  className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-indigo-600/20 text-white'
                      : unread > 0
                        ? 'text-slate-100 hover:bg-white/5'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChannel(ch)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Hash
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-indigo-400' : 'text-slate-500'
                      }`}
                    />
                    <span
                      className={`truncate ${
                        unread > 0 && !isActive ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {ch.name}
                    </span>
                  </button>

                  <div className="flex items-center gap-1">
                    {unread > 0 && !isActive && (
                      <span className="rounded-full bg-indigo-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenRenameChannel(ch)}
                      title="Renomear canal"
                      className="hidden rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white group-hover:inline-flex"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteChannel(ch)}
                        title="Excluir canal"
                        className="hidden rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Canais de Voz */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Canais de Voz
            </span>
            <button
              type="button"
              onClick={() => onOpenCreateChannel('voice')}
              title="Criar canal de voz"
              className="rounded p-0.5 text-slate-400 transition hover:bg-white/8 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {voiceChannels.map((ch) => {
              const isConnectedHere = connectedVoiceChannelId === ch.id;
              const participantIds = voiceParticipants[ch.id] ?? [];
              const participantUsers = participantIds
                .map((id) => usersById.get(id))
                .filter((u): u is UserPublic => Boolean(u));

              return (
                <div key={ch.id}>
                  <div
                    className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
                      isConnectedHere
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectChannel(ch)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Volume2
                        className={`h-4 w-4 shrink-0 ${
                          isConnectedHere ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate font-medium">{ch.name}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenRenameChannel(ch)}
                        title="Renomear canal"
                        className="hidden rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white group-hover:inline-flex"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteChannel(ch)}
                        title="Excluir canal"
                        className="hidden rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Participantes dentro do canal de voz */}
                  {participantUsers.length > 0 && (
                    <div className="ml-4 mt-0.5 space-y-1 border-l border-white/8 pl-2">
                      {participantUsers.map((u) => {
                        const st = voiceStates[u.id];
                        const isSpeaking = speakingSet.has(u.id);
                        const isMe = u.id === currentUser.id;
                        const isVolumeOpen = volumeOpenUserId === u.id;
                        const vol = userVolumes[u.id] ?? 100;

                        return (
                          <div key={u.id} className="space-y-1">
                            <div
                              onClick={() => {
                                if (!isMe) {
                                  setVolumeOpenUserId(isVolumeOpen ? null : u.id);
                                }
                              }}
                              title={isMe ? undefined : 'Clique para ajustar o volume deste amigo'}
                              className={`flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-xs ${
                                isMe
                                  ? 'text-slate-200'
                                  : 'cursor-pointer text-slate-300 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <div
                                  className={`rounded-full p-[1px] ${
                                    isSpeaking ? 'ring-2 ring-emerald-400' : ''
                                  }`}
                                >
                                  <Avatar
                                    displayName={u.displayName}
                                    color={u.avatarColor}
                                    size="sm"
                                  />
                                </div>
                                <span className="truncate font-medium">{u.displayName}</span>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                {st?.deafened ? (
                                  <HeadphoneOff className="h-3 w-3 text-rose-400" />
                                ) : st?.muted ? (
                                  <MicOff className="h-3 w-3 text-rose-400" />
                                ) : null}
                                {st?.screenSharing && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onWatchScreenShare(u.id);
                                    }}
                                    className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white hover:bg-rose-500"
                                  >
                                    AO VIVO
                                  </button>
                                )}
                              </div>
                            </div>

                            {!isMe && isVolumeOpen && (
                              <div className="flex items-center gap-2 rounded-md bg-[#0f1117] px-2 py-1.5">
                                <Volume2 className="h-3 w-3 shrink-0 text-slate-400" />
                                <input
                                  type="range"
                                  min={0}
                                  max={200}
                                  value={vol}
                                  onChange={(e) =>
                                    onSetUserVolume(u.id, Number(e.target.value))
                                  }
                                  className="flex-1 accent-indigo-500"
                                />
                                <span className="w-8 text-right text-[10px] tabular-nums text-slate-400">
                                  {vol}%
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Painel de Voz Conectada */}
      {connectedVoiceChannel && (
        <VoiceDock
          channel={connectedVoiceChannel}
          voiceState={voiceConnectionState}
          screenSharing={screenSharing}
          viewingStage={viewingVoiceStage}
          onToggleStage={onToggleVoiceStage}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onDisconnect={onDisconnectVoice}
        />
      )}

      {/* Rodapé do Usuário */}
      <div className="flex items-center justify-between gap-1.5 border-t border-white/6 bg-[#0f1117]/80 px-2.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            displayName={currentUser.displayName}
            color={currentUser.avatarColor}
            size="sm"
            status="online"
          />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-white">
              {currentUser.displayName}
            </div>
            <div className="truncate text-[10px] text-slate-400">@{currentUser.username}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Ativar microfone' : 'Mutar microfone'}
            className={`rounded-lg p-1.5 transition ${
              muted
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'text-slate-400 hover:bg-white/8 hover:text-white'
            }`}
          >
            {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onToggleDeafen}
            title={deafened ? 'Reativar áudio' : 'Ensurdecer (mutar saída e mic)'}
            className={`rounded-lg p-1.5 transition ${
              deafened
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'text-slate-400 hover:bg-white/8 hover:text-white'
            }`}
          >
            {deafened ? (
              <HeadphoneOff className="h-3.5 w-3.5" />
            ) : (
              <Headphones className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenVoiceSettings}
            title="Configurações de voz, atalhos e atualizações"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/8 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleMuteNotifications}
            title={mutedNotifications ? 'Ativar som de notificação' : 'Silenciar notificações'}
            className={`rounded-lg p-1.5 transition ${
              mutedNotifications
                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'text-slate-400 hover:bg-white/8 hover:text-white'
            }`}
          >
            {mutedNotifications ? (
              <BellOff className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
