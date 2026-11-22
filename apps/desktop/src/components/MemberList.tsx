import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import { Copy, Crown, MonitorUp, Volume2 } from 'lucide-react';
import { Avatar } from './Avatar.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from './ui/ContextMenu.js';

interface MemberListProps {
  users: UserPublic[];
  onlineUserIds: string[];
  channels: Channel[];
  voiceParticipants: Record<string, string[]>;
  voiceStates: Record<string, VoiceUserState>;
  onWatchScreenShare?: (participantId: string) => void;
  onCopyText?: (text: string, label: string) => void;
}

export function MemberList({
  users,
  onlineUserIds,
  channels,
  voiceParticipants,
  voiceStates,
  onWatchScreenShare,
  onCopyText,
}: MemberListProps) {
  const onlineSet = new Set(onlineUserIds);
  const onlineUsers = users.filter((u) => onlineSet.has(u.id));
  const offlineUsers = users.filter((u) => !onlineSet.has(u.id));

  const channelsById = new Map(channels.map((c) => [c.id, c]));
  const voiceChannelByUser = new Map<string, string>();
  for (const [channelId, ids] of Object.entries(voiceParticipants)) {
    const ch = channelsById.get(channelId);
    if (!ch) continue;
    for (const uid of ids) {
      voiceChannelByUser.set(uid, ch.name);
    }
  }

  function renderMember(user: UserPublic, isOnline: boolean) {
    const voiceChannelName = isOnline ? voiceChannelByUser.get(user.id) : undefined;
    const isLive = Boolean(isOnline && voiceStates[user.id]?.screenSharing);

    return (
      <ContextMenu key={user.id}>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04] ${
              isOnline ? '' : 'opacity-45'
            }`}
          >
            <Avatar
              displayName={user.displayName}
              color={user.avatarColor}
              size="sm"
              status={isOnline ? 'online' : 'offline'}
              ringBg="border-[#101013]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-zinc-200">
                  {user.displayName}
                </span>
                {user.role === 'admin' && (
                  <span title="Administrador" className="text-amber-400">
                    <Crown className="h-3 w-3 shrink-0" />
                  </span>
                )}
              </div>
              {voiceChannelName ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-medium text-emerald-400">
                    <Volume2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{voiceChannelName}</span>
                  </span>
                  {isLive && (
                    <button
                      type="button"
                      onClick={() => onWatchScreenShare?.(user.id)}
                      className="rounded bg-rose-600 px-1 py-0.2 text-[8px] font-bold uppercase text-white transition hover:bg-rose-500"
                    >
                      AO VIVO
                    </button>
                  )}
                </div>
              ) : (
                <div className="truncate text-[10px] text-zinc-500">@{user.username}</div>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>{user.displayName}</ContextMenuLabel>
          {isLive && onWatchScreenShare && (
            <ContextMenuItem onSelect={() => onWatchScreenShare(user.id)}>
              <MonitorUp className="h-3.5 w-3.5 text-rose-400" />
              Assistir Transmissão
            </ContextMenuItem>
          )}
          {onCopyText && (
            <ContextMenuItem onSelect={() => onCopyText(`@${user.username}`, 'Usuário')}>
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
              Copiar @{user.username}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.07] bg-[#101013] lg:flex">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <span className="text-xs font-semibold text-zinc-200">Membros</span>
        <span className="text-[11px] font-medium tabular-nums text-zinc-500">
          {users.length}
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <div>
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Online — {onlineUsers.length}
          </div>
          <div className="space-y-0.5">
            {onlineUsers.map((u) => renderMember(u, true))}
          </div>
        </div>

        {offlineUsers.length > 0 && (
          <div>
            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Offline — {offlineUsers.length}
            </div>
            <div className="space-y-0.5">
              {offlineUsers.map((u) => renderMember(u, false))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
