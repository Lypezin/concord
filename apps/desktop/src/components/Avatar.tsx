import { getInitials } from '../lib/format.js';

interface AvatarProps {
  displayName: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'online' | 'offline';
}

export function Avatar({ displayName, color, size = 'md', status }: AvatarProps) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-11 w-11 text-sm'
        : 'h-9 w-9 text-xs';

  const dotSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div className="relative inline-flex shrink-0 select-none">
      <div
        className={`${sizeClass} flex items-center justify-center rounded-full font-semibold text-white shadow-inner`}
        style={{ backgroundColor: color }}
      >
        {getInitials(displayName)}
      </div>
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border-2 border-[#161922] ${
            status === 'online' ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        />
      )}
    </div>
  );
}
