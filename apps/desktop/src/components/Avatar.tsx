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
  ringBg = 'border-[#0d1017]',
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
        className={`${sizeClass} relative flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight text-white ring-1 ring-inset ring-white/20 transition-shadow ${
          speaking ? 'speaking-halo' : ''
        }`}
        style={{ backgroundColor: color }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 58%)',
          }}
        />
        <span className="relative z-10 drop-shadow-xs">{getInitials(displayName)}</span>
      </div>
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border-2 ${ringBg} ${
            status === 'online'
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]'
              : 'bg-slate-500'
          }`}
        />
      )}
    </div>
  );
}
