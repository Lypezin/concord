import type { UserPublic } from '@concord/shared';
import { Crown } from 'lucide-react';
import { Avatar } from './Avatar.js';

interface MemberListProps {
  users: UserPublic[];
  onlineUserIds: string[];
}

export function MemberList({ users, onlineUserIds }: MemberListProps) {
  const onlineSet = new Set(onlineUserIds);
  const onlineUsers = users.filter((u) => onlineSet.has(u.id));
  const offlineUsers = users.filter((u) => !onlineSet.has(u.id));

  function renderMember(user: UserPublic, isOnline: boolean) {
    return (
      <div
        key={user.id}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/5 ${
          isOnline ? '' : 'opacity-50'
        }`}
      >
        <Avatar
          displayName={user.displayName}
          color={user.avatarColor}
          size="sm"
          status={isOnline ? 'online' : 'offline'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-xs font-medium text-slate-200">
              {user.displayName}
            </span>
            {user.role === 'admin' && (
              <span title="Administrador">
                <Crown className="h-3 w-3 shrink-0 text-amber-400" />
              </span>
            )}
          </div>
          <div className="truncate text-[10px] text-slate-500">@{user.username}</div>
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-l border-white/6 bg-[#131620] p-3 lg:flex">
      <div className="flex-1 space-y-5 overflow-y-auto">
        <div>
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Online — {onlineUsers.length}
          </div>
          <div className="space-y-0.5">
            {onlineUsers.map((u) => renderMember(u, true))}
          </div>
        </div>

        {offlineUsers.length > 0 && (
          <div>
            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
