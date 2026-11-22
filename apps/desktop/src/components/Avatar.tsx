import { getInitials } from '../lib/format.js';

interface AvatarProps {
  displayName: string;
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline';
  speaking?: boolean;
  ringBg?: string;
}

export function Avatar({
  displayName,
  color,
  size = 'md',
  status,
  speaking = false,
  ringBg = 'border-[#0c0c0e]',
}: AvatarProps) {
  const sizeClass =
    size === 'xs'
      ? 'h-6 w-6 text-[10px]'
      : size === 'sm'
        ? 'h-8 w-8 text-[11px]'
        : size === 'lg'
          ? 'h-11 w-11 text-sm'
          : size === 'xl'
            ? 'h-14 w-14 text-base'
            : 'h-9 w-9 text-xs';

  const dotSize =
    size === 'xs' || size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div className="relative inline-flex shrink-0 select-none">
      <div
        className={`${sizeClass} relative flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight text-white ring-1 ring-inset ring-black/20 transition-shadow ${
          speaking ? 'speaking-halo' : ''
        }`}
        style={{ backgroundColor: color }}
      >
        <span>{getInitials(displayName)}</span>
      </div>
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border-2 ${ringBg} ${
            status === 'online' ? 'bg-[#23a55a]' : 'bg-zinc-500'
          }`}
        />
      )}
    </div>
  );
}
