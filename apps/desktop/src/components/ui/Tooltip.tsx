import type { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/cn.js';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={160} skipDelayDuration={80}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

interface ActionTooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function ActionTooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  className,
}: ActionTooltipProps) {
  if (!label) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'z-[100] select-none rounded-md border border-white/[0.1] bg-[#18181d] px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl',
            className,
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[#18181d]" width={8} height={4} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
