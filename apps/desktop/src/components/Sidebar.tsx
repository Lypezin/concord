import type { Channel, ChannelType, UserPublic, VoiceUserState } from '@concord/shared';
import {
  Bell,
  BellOff,
  ChevronDown,
  Copy,
  Hash,
  HeadphoneOff,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react';
import type { VoiceConnectionState, VoiceTelemetry } from '../hooks/useVoiceRoom.js';
import { Avatar } from './Avatar.js';
import { VoiceDock } from './VoiceDock.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/ContextMenu.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/DropdownMenu.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover.js';
import { VolumeSlider } from './ui/Slider.js';
import { ActionTooltip } from './ui/Tooltip.js';

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
  voiceTelemetry: VoiceTelemetry;
  rnnoiseEnabled: boolean;
  totalUnreadCount: number;
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
  onOpenCommandPalette: () => void;
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
  onCopyText?: (text: string, label: string) => void;
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
  voiceTelemetry,
  rnnoiseEnabled,
  totalUnreadCount,
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
  onOpenCommandPalette,
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
  onCopyText,
}: SidebarProps) {
  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const usersById = new Map(users.map((u) => [u.id, u]));
  const speakingSet = new Set(speakingUserIds);
  const connectedVoiceChannel =
    channels.find((c) => c.id === connectedVoiceChannelId) ?? null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-[#0c0c0e]">
      {/* Cabeçalho do Servidor com Menu Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-3.5 text-left transition hover:bg-white/[0.03] focus:outline-none"
          >
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight text-white">
                {serverName}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {userCount}/{maxUsers} membros
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {currentUser.role === 'admin' && (
            <>
              <DropdownMenuItem onSelect={onOpenInvites}>
                <span className="flex items-center gap-2 text-[#7983f5]">
                  <UserPlus className="h-3.5 w-3.5" />
                  Convidar Amigos
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onOpenCreateChannel('text')}>
            <span className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-zinc-400" />
              Criar Canal de Texto
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenCreateChannel('voice')}>
            <span className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
              Criar Canal de Voz
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenCommandPalette}>
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              Busca Rápida
            </span>
            <kbd className="font-mono text-[10px] text-zinc-500">Ctrl+K</kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenVoiceSettings}>
            <span className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-zinc-400" />
              Configurações
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem danger onSelect={onLogout}>
            <span className="flex items-center gap-2">
              <LogOut className="h-3.5 w-3.5" />
              Sair da Conta
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Botão de Acesso Rápido */}
      <div className="px-2.5 pt-2.5">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-[#141418] px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-white/[0.14] hover:text-zinc-200"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <span>Ir para canal...</span>
          </span>
          <kbd className="rounded border border-white/[0.08] bg-[#0c0c0e] px-1 font-mono text-[9px] text-zinc-500">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Lista de Canais */}
      <div className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {/* Canais de Texto */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Texto
            </span>
            <ActionTooltip label="Criar canal de texto" side="right">
              <button
                type="button"
                onClick={() => onOpenCreateChannel('text')}
                className="rounded p-0.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </ActionTooltip>
          </div>

          <div className="space-y-0.5">
            {textChannels.map((ch) => {
              const isActive = !viewingVoiceStage && ch.id === activeChannelId;
              const unread = unreadCounts[ch.id] ?? 0;
              const canDelete = textChannels.length > 1;

              return (
                <ContextMenu key={ch.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition ${
                        isActive
                          ? 'bg-[#202027] text-white'
                          : unread > 0
                            ? 'text-zinc-100 hover:bg-white/[0.04]'
                            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectChannel(ch)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <Hash
                          className={`h-4 w-4 shrink-0 ${
                            isActive ? 'text-zinc-200' : 'text-zinc-500'
                          }`}
                        />
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
                          <span className="rounded-full bg-[#5865f2] px-1.5 py-0.2 text-[10px] font-bold text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                        <ActionTooltip label="Renomear canal">
                          <button
                            type="button"
                            onClick={() => onOpenRenameChannel(ch)}
                            className="hidden rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white group-hover:inline-flex"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </ActionTooltip>
                        {canDelete && (
                          <ActionTooltip label="Excluir canal">
                            <button
                              type="button"
                              onClick={() => onDeleteChannel(ch)}
                              className="hidden rounded p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                        )}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel>#{ch.name}</ContextMenuLabel>
                    <ContextMenuItem onSelect={() => onSelectChannel(ch)}>
                      <Hash className="h-3.5 w-3.5 text-zinc-400" />
                      Abrir Canal
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onOpenRenameChannel(ch)}>
                      <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                      Renomear Canal
                    </ContextMenuItem>
                    {onCopyText && (
                      <ContextMenuItem onSelect={() => onCopyText(`#${ch.name}`, 'Nome do canal')}>
                        <Copy className="h-3.5 w-3.5 text-zinc-400" />
                        Copiar Nome
                      </ContextMenuItem>
                    )}
                    {canDelete && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem danger onSelect={() => onDeleteChannel(ch)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir Canal
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </div>

        {/* Canais de Voz */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Voz
            </span>
            <ActionTooltip label="Criar canal de voz" side="right">
              <button
                type="button"
                onClick={() => onOpenCreateChannel('voice')}
                className="rounded p-0.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </ActionTooltip>
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
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition ${
                          isConnectedHere
                            ? 'bg-[#1a221d] text-emerald-200'
                            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectChannel(ch)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <Volume2
                            className={`h-4 w-4 shrink-0 ${
                              isConnectedHere ? 'text-emerald-400' : 'text-zinc-500'
                            }`}
                          />
                          <span className={`truncate ${isConnectedHere ? 'font-semibold' : 'font-medium'}`}>
                            {ch.name}
                          </span>
                        </button>

                        <div className="flex items-center gap-1">
                          {participantUsers.length > 0 && (
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[10px] font-medium tabular-nums text-zinc-400 group-hover:hidden">
                              {participantUsers.length}
                            </span>
                          )}
                          <ActionTooltip label="Renomear canal">
                            <button
                              type="button"
                              onClick={() => onOpenRenameChannel(ch)}
                              className="hidden rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white group-hover:inline-flex"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="Excluir canal">
                            <button
                              type="button"
                              onClick={() => onDeleteChannel(ch)}
                              className="hidden rounded p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:inline-flex"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuLabel>{ch.name}</ContextMenuLabel>
                      <ContextMenuItem onSelect={() => onSelectChannel(ch)}>
                        <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                        {isConnectedHere ? 'Abrir Palco' : 'Entrar na Chamada'}
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => onOpenRenameChannel(ch)}>
                        <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                        Renomear Canal
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem danger onSelect={() => onDeleteChannel(ch)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir Canal
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* Participantes dentro do canal de voz */}
                  {participantUsers.length > 0 && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/[0.07] pl-2">
                      {participantUsers.map((u) => {
                        const st = voiceStates[u.id];
                        const isSpeaking = speakingSet.has(u.id);
                        const isMe = u.id === currentUser.id;
                        const vol = userVolumes[u.id] ?? 100;

                        const rowContent = (
                          <div
                            className={`flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-xs transition ${
                              isMe
                                ? 'text-zinc-200'
                                : 'cursor-pointer text-zinc-300 hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar
                                displayName={u.displayName}
                                color={u.avatarColor}
                                size="xs"
                                speaking={isSpeaking}
                                ringBg="border-[#0c0c0e]"
                              />
                              <span
                                className={`truncate ${
                                  isSpeaking ? 'font-semibold text-white' : 'font-medium text-zinc-300'
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
                                  className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white transition hover:bg-rose-500"
                                >
                                  AO VIVO
                                </button>
                              )}
                            </div>
                          </div>
                        );

                        if (isMe) {
                          return <div key={u.id}>{rowContent}</div>;
                        }

                        return (
                          <Popover key={u.id}>
                            <PopoverTrigger asChild>{rowContent}</PopoverTrigger>
                            <PopoverContent side="right" align="center" className="w-56 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex min-w-0 items-center gap-2">
                                  <Avatar
                                    displayName={u.displayName}
                                    color={u.avatarColor}
                                    size="xs"
                                  />
                                  <span className="truncate text-xs font-semibold text-white">
                                    {u.displayName}
                                  </span>
                                </div>
                                <span className="font-mono text-xs tabular-nums text-zinc-400">
                                  {vol}%
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                  <span>Volume do usuário</span>
                                  {vol !== 100 && (
                                    <button
                                      type="button"
                                      onClick={() => onSetUserVolume(u.id, 100)}
                                      className="text-zinc-300 hover:underline"
                                    >
                                      100%
                                    </button>
                                  )}
                                </div>
                                <VolumeSlider
                                  value={vol}
                                  max={200}
                                  onChange={(val) => onSetUserVolume(u.id, val)}
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
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
          telemetry={voiceTelemetry}
          rnnoiseEnabled={rnnoiseEnabled}
          screenSharing={screenSharing}
          viewingStage={viewingVoiceStage}
          totalUnreadCount={totalUnreadCount}
          onToggleStage={onToggleVoiceStage}
          onStartScreenShare={onStartScreenShare}
          onStopScreenShare={onStopScreenShare}
          onDisconnect={onDisconnectVoice}
        />
      )}

      {/* Rodapé do Usuário */}
      <div className="flex items-center justify-between gap-1 border-t border-white/[0.07] bg-[#0a0a0c] px-2.5 py-2">
        <ActionTooltip label="Configurações de perfil e áudio">
          <button
            type="button"
            onClick={onOpenVoiceSettings}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left transition hover:bg-white/[0.05]"
          >
            <Avatar
              displayName={currentUser.displayName}
              color={currentUser.avatarColor}
              size="sm"
              status="online"
              speaking={speakingSet.has(currentUser.id) && !muted && !deafened}
              ringBg="border-[#0a0a0c]"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-zinc-100">
                {currentUser.displayName}
              </div>
              <div className="truncate text-[10px] text-zinc-500">
                {muted ? 'Mutado' : deafened ? 'Ensurdecido' : `@${currentUser.username}`}
              </div>
            </div>
          </button>
        </ActionTooltip>

        <div className="flex shrink-0 items-center gap-0.5">
          <ActionTooltip label={muted ? 'Ativar microfone' : 'Mutar microfone'}>
            <button
              type="button"
              onClick={onToggleMute}
              className={`rounded-md p-1.5 transition ${
                muted
                  ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
          </ActionTooltip>

          <ActionTooltip label={deafened ? 'Reativar áudio' : 'Ensurdecer'}>
            <button
              type="button"
              onClick={onToggleDeafen}
              className={`rounded-md p-1.5 transition ${
                deafened
                  ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {deafened ? (
                <HeadphoneOff className="h-3.5 w-3.5" />
              ) : (
                <Headphones className="h-3.5 w-3.5" />
              )}
            </button>
          </ActionTooltip>

          <ActionTooltip label="Configurações">
            <button
              type="button"
              onClick={onOpenVoiceSettings}
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </ActionTooltip>

          <ActionTooltip
            label={mutedNotifications ? 'Ativar som de notificação' : 'Silenciar notificações'}
          >
            <button
              type="button"
              onClick={onToggleMuteNotifications}
              className={`rounded-md p-1.5 transition ${
                mutedNotifications
                  ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {mutedNotifications ? (
                <BellOff className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
            </button>
          </ActionTooltip>

          <ActionTooltip label="Sair da conta">
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md p-1.5 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </ActionTooltip>
        </div>
      </div>
    </aside>
  );
}
