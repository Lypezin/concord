import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn.js';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  children,
  align = 'start',
  sideOffset = 6,
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[110] min-w-[215px] overflow-hidden rounded-lg border border-white/[0.1] bg-[#18181d] p-1 text-zinc-100 shadow-2xl outline-none',
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

interface DropdownMenuItemProps
  extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  danger?: boolean;
}

export function DropdownMenuItem({
  danger = false,
  className,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none transition data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        danger
          ? 'text-rose-300 data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-rose-200'
          : 'text-zinc-200 data-[highlighted]:bg-[#26262f] data-[highlighted]:text-white',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('my-1 h-px bg-white/[0.07]', className)}
    />
  );
}
