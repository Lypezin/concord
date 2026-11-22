import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="concord-glass animate-modal-in relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131724]/98 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${
            danger ? 'via-rose-400/50' : 'via-indigo-400/50'
          } to-transparent`}
        />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {danger && (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/15 text-rose-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-5 text-xs leading-relaxed text-slate-300">{message}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="rounded-xl px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-md transition disabled:opacity-50 ${
              danger
                ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-500/20 hover:from-rose-500 hover:to-red-500'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/20 hover:from-indigo-500 hover:to-violet-500'
            }`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
