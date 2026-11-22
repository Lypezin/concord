import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '../../lib/cn.js';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          'z-[110] min-w-[190px] overflow-hidden rounded-lg border border-white/[0.1] bg-[#18181d] p-1 text-zinc-100 shadow-2xl outline-none',
          className,
        )}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

interface ContextMenuItemProps extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  danger?: boolean;
}

export function ContextMenuItem({
  danger = false,
  className,
  ...props
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none transition data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        danger
          ? 'text-rose-300 data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-rose-200'
          : 'text-zinc-200 data-[highlighted]:bg-[#26262f] data-[highlighted]:text-white',
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className }: { className?: string }) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn('my-1 h-px bg-white/[0.07]', className)}
    />
  );
}

export function ContextMenuLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenuPrimitive.Label
      className={cn(
        'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500',
        className,
      )}
    >
      {children}
    </ContextMenuPrimitive.Label>
  );
}
