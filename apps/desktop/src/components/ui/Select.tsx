import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Selecionar...',
  className,
}: SelectProps) {
  const safeValue = options.some((o) => o.value === value)
    ? value
    : (options[0]?.value ?? 'default');

  return (
    <SelectPrimitive.Root value={safeValue} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-1.5 text-left text-xs text-zinc-100 transition hover:border-white/[0.16] focus:border-white/[0.22] focus:outline-none',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[110] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-white/[0.1] bg-[#18181d] text-zinc-100 shadow-2xl"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-7 pr-2.5 text-xs text-zinc-200 outline-none transition data-[highlighted]:bg-[#26262f] data-[highlighted]:text-white"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5 text-[#5865f2]" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
