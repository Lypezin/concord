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
  Sparkles,
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
  connectedAt: number | null;
  totalUnreadCount: number;
  voiceParticipants: Record<string, string[]>;
  voiceStates: Record<string, VoiceUserState>;
  speakingUserIds: string[];
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  rnnoiseEnabled?: boolean;
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
  connectedAt,
  totalUnreadCount,
  voiceParticipants,
  voiceStates,
  speakingUserIds,
  muted,
  deafened,
  screenSharing,
  rnnoiseEnabled = true,
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
    <aside className="concord-island relative flex w-[276px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0e16]/95">
      {/* Hero Banner do Servidor */}
      <div className="relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-br from-indigo-600/20 via-violet-600/12 to-transparent px-4 py-3.5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-indigo-500/25 blur-2xl" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-bold tracking-tight text-white">
                {serverName}
              </h2>
              <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <span>{userCount}/{maxUsers} membros</span>
              <span>•</span>
              <span className="text-indigo-300">Privado</span>
            </div>
          </div>

          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={onOpenInvites}
              title="Gerenciar convites privados"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-400/35 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Convidar
            </button>
          )}
        </div>
      </div>

      {/* Lista de Canais */}
      <div className="relative flex-1 space-y-5 overflow-y-auto px-2.5 py-3.5">
        {/* Canais de Texto */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Canais de Texto
            </span>
            <button
              type="button"
              onClick={() => onOpenCreateChannel('text')}
              title="Criar canal de texto"
              className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-1 text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1">
            {textChannels.map((ch) => {
              const isActive = !viewingVoiceStage && ch.id === activeChannelId;
              const unread = unreadCounts[ch.id] ?? 0;
              const canDelete = textChannels.length > 1;

              return (
                <div
                  key={ch.id}
                  className={`group relative flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[13.5px] transition ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-500/22 via-violet-500/12 to-transparent text-white ring-1 ring-inset ring-indigo-500/35 shadow-sm'
                      : unread > 0
                        ? 'bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.9)]" />
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectChannel(ch)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition ${
                        isActive
                          ? 'bg-indigo-500/25 text-indigo-300'
                          : 'bg-white/[0.04] text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      <Hash className="h-3.5 w-3.5" />
                    </div>
                    <span
                      className={`truncate ${
                        isActive || unread > 0 ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {ch.name}
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5">
                    {unread > 0 && !isActive && (
                      <span className="rounded-full bg-indigo-500 px-1.5 py-0.2 text-[10px] font-bold text-white shadow-sm">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenRenameChannel(ch)}
                      title="Renomear canal"
                      className="hidden rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white group-hover:inline-flex"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteChannel(ch)}
                        title="Excluir canal"
                        className="hidden rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
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
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Canais de Voz
            </span>
            <button
              type="button"
              onClick={() => onOpenCreateChannel('voice')}
              title="Criar canal de voz"
              className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-1 text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {voiceChannels.map((ch) => {
              const isConnectedHere = connectedVoiceChannelId === ch.id;
              const participantIds = voiceParticipants[ch.id] ?? [];
              const participantUsers = participantIds
                .map((id) => usersById.get(id))
                .filter((u): u is UserPublic => Boolean(u));

              return (
                <div
                  key={ch.id}
                  className={`rounded-xl transition ${
                    isConnectedHere
                      ? 'border border-emerald-500/25 bg-emerald-500/[0.07] p-1'
                      : ''
                  }`}
                >
                  <div
                    className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[13.5px] transition ${
                      isConnectedHere
                        ? 'text-emerald-100'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectChannel(ch)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition ${
                          isConnectedHere
                            ? 'bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                            : 'bg-white/[0.04] text-slate-400 group-hover:text-slate-200'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </div>
                      <span className={`truncate ${isConnectedHere ? 'font-semibold' : 'font-medium'}`}>
                        {ch.name}
                      </span>
                    </button>

                    <div className="flex items-center gap-1">
                      {participantUsers.length > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums group-hover:hidden ${
                            isConnectedHere
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-white/[0.07] text-slate-300'
                          }`}
                        >
                          {participantUsers.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenRenameChannel(ch)}
                        title="Renomear canal"
                        className="hidden rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white group-hover:inline-flex"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteChannel(ch)}
                        title="Excluir canal"
                        className="hidden rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Participantes dentro do canal de voz */}
                  {participantUsers.length > 0 && (
                    <div className="mt-1 space-y-1 rounded-xl border border-white/[0.05] bg-[#07090e]/75 p-1.5">
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
                              className={`flex items-center justify-between gap-1.5 rounded-lg px-2 py-1 text-xs transition ${
                                isMe
                                  ? 'text-slate-200'
                                  : 'cursor-pointer text-slate-300 hover:bg-white/[0.06]'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Avatar
                                  displayName={u.displayName}
                                  color={u.avatarColor}
                                  size="xs"
                                  speaking={isSpeaking}
                                  ringBg="border-[#07090e]"
                                />
                                <span
                                  className={`truncate font-medium ${
                                    isSpeaking ? 'font-semibold text-emerald-200' : 'text-slate-200'
                                  }`}
                                >
                                  {u.displayName}
                                </span>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                {isSpeaking && !st?.muted && !st?.deafened && (
                                  <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
                                    <span className="voice-bar-1 h-2.5 w-[2px] rounded-full bg-emerald-400" />
                                    <span className="voice-bar-2 h-3 w-[2px] rounded-full bg-emerald-400" />
                                    <span className="voice-bar-3 h-2 w-[2px] rounded-full bg-emerald-400" />
                                  </span>
                                )}
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
                                    className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow-sm transition hover:bg-rose-500"
                                  >
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                                    LIVE
                                  </button>
                                )}
                              </div>
                            </div>

                            {!isMe && isVolumeOpen && (
                              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0b0e16] px-2.5 py-1.5">
                                <Volume2 className="h-3 w-3 shrink-0 text-indigo-400" />
                                <input
                                  type="range"
                                  min={0}
                                  max={200}
                                  value={vol}
                                  onChange={(e) =>
                                    onSetUserVolume(u.id, Number(e.target.value))
                                  }
                                  className="concord-slider flex-1"
                                />
                                <span className="w-9 text-right font-mono text-[10px] tabular-nums text-slate-300">
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
          connectedAt={connectedAt}
          screenSharing={screenSharing}
          viewingStage={viewingVoiceStage}
          rnnoiseEnabled={rnnoiseEnabled}
          totalUnreadCount={totalUnreadCount}
          onToggleStage={onToggleVoiceStage}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onDisconnect={onDisconnectVoice}
        />
      )}

      {/* Rodapé / Pod do Usuário */}
      <div className="mx-2.5 mb-2.5 flex items-center justify-between gap-1.5 rounded-2xl border border-white/[0.08] bg-[#121726]/95 p-2 shadow-xl">
        <button
          type="button"
          onClick={onOpenVoiceSettings}
          title="Editar perfil e configurações de voz"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1 text-left transition hover:bg-white/[0.06]"
        >
          <Avatar
            displayName={currentUser.displayName}
            color={currentUser.avatarColor}
            size="sm"
            status="online"
            speaking={speakingSet.has(currentUser.id) && !muted && !deafened}
            ringBg="border-[#121726]"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-xs font-bold text-white">
                {currentUser.displayName}
              </span>
              {rnnoiseEnabled && (
                <span title="Filtro neural RNNoise ativo">
                  <Sparkles className="h-2.5 w-2.5 shrink-0 text-indigo-400" />
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-slate-400">
              {muted ? 'Microfone mutado' : deafened ? 'Áudio ensurdecido' : `@${currentUser.username}`}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleMute}
            title={muted ? 'Ativar microfone' : 'Mutar microfone'}
            className={`rounded-xl p-1.5 transition ${
              muted
                ? 'bg-rose-500/20 text-rose-300 ring-1 ring-inset ring-rose-500/35 hover:bg-rose-500/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onToggleDeafen}
            title={deafened ? 'Reativar áudio' : 'Ensurdecer (mutar saída e mic)'}
            className={`rounded-xl p-1.5 transition ${
              deafened
                ? 'bg-rose-500/20 text-rose-300 ring-1 ring-inset ring-rose-500/35 hover:bg-rose-500/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
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
            title="Perfil, áudio, atalhos e atualizações"
            className="rounded-xl p-1.5 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleMuteNotifications}
            title={mutedNotifications ? 'Ativar som de notificação' : 'Silenciar notificações'}
            className={`rounded-xl p-1.5 transition ${
              mutedNotifications
                ? 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25 hover:bg-amber-500/25'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
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
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
