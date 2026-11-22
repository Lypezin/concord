import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ModalDialog } from './ui/Dialog.js';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = true,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalDialog
      onClose={onClose}
      title={title}
      icon={danger ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : undefined}
      maxWidthClass="max-w-sm"
      preventClose={busy}
    >
      <div className="p-5">
        <p className="mb-5 text-xs leading-relaxed text-zinc-300">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
              danger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-[#5865f2] hover:bg-[#4752c4]'
            }`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
