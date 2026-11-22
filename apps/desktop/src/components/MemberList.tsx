import type { Channel, UserPublic, VoiceUserState } from '@concord/shared';
import { Crown, Users, Volume2 } from 'lucide-react';
import { Avatar } from './Avatar.js';

interface MemberListProps {
  users: UserPublic[];
  onlineUserIds: string[];
  channels: Channel[];
  voiceParticipants: Record<string, string[]>;
  voiceStates: Record<string, VoiceUserState>;
}

export function MemberList({
  users,
  onlineUserIds,
  channels,
  voiceParticipants,
  voiceStates,
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
      <div
        key={user.id}
        className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
          isOnline
            ? 'border-white/[0.05] bg-white/[0.025] hover:border-white/[0.1] hover:bg-white/[0.05]'
            : 'border-transparent opacity-45 hover:bg-white/[0.03]'
        }`}
      >
        <Avatar
          displayName={user.displayName}
          color={user.avatarColor}
          size="sm"
          status={isOnline ? 'online' : 'offline'}
          ringBg="border-[#0b0e16]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-slate-100">
              {user.displayName}
            </span>
            {user.role === 'admin' && (
              <span
                title="Administrador"
                className="inline-flex shrink-0 items-center rounded-md border border-amber-400/25 bg-amber-500/12 p-0.5 text-amber-300"
              >
                <Crown className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
          {voiceChannelName ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold text-emerald-300">
                <Volume2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{voiceChannelName}</span>
              </span>
              {isLive && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-600 px-1 py-0.2 text-[8px] font-bold uppercase text-white">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
                  LIVE
                </span>
              )}
            </div>
          ) : (
            <div className="truncate text-[10px] text-slate-500">@{user.username}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside className="concord-island hidden w-60 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0e16]/95 lg:flex">
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex items-center gap-2 text-xs font-bold tracking-tight text-white">
          <Users className="h-3.5 w-3.5 text-indigo-400" />
          <span>Membros</span>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
          {users.length}
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        <div>
          <div className="mb-2 flex items-center justify-between px-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              Online
            </span>
            <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-emerald-300">
              {onlineUsers.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {onlineUsers.map((u) => renderMember(u, true))}
          </div>
        </div>

        {offlineUsers.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Offline
              </span>
              <span className="rounded-full bg-white/[0.05] px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-slate-500">
                {offlineUsers.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {offlineUsers.map((u) => renderMember(u, false))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
