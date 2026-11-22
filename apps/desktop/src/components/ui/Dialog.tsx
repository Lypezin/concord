import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

interface ModalDialogProps {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  preventClose?: boolean;
}

export function ModalDialog({
  open = true,
  onClose,
  title,
  icon,
  headerRight,
  children,
  maxWidthClass = 'max-w-md',
  preventClose = false,
}: ModalDialogProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !preventClose) {
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => {
            const target = e.target as HTMLElement | null;
            if (preventClose || target?.dataset?.shortcutCapture === 'true') {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (preventClose) e.preventDefault();
          }}
          className={cn(
            'concord-panel animate-dialog-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-[#16161b] text-zinc-100 focus:outline-none',
            maxWidthClass,
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              {icon && <span className="text-zinc-300">{icon}</span>}
              <DialogPrimitive.Title className="text-sm font-semibold text-white">
                {title}
              </DialogPrimitive.Title>
            </div>
            <div className="flex items-center gap-1">
              {headerRight}
              <DialogPrimitive.Close
                disabled={preventClose}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Janela de diálogo do Concord
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
