import { useEffect, useState, type FormEvent } from 'react';
import { Hash, Loader2, Volume2, X } from 'lucide-react';
import type { Channel, ChannelType } from '@concord/shared';

interface ChannelModalProps {
  mode: 'create' | 'rename';
  initialType?: Extract<ChannelType, 'text' | 'voice'>;
  channel?: Channel;
  onClose: () => void;
  onSubmit: (data: { name: string; type: Extract<ChannelType, 'text' | 'voice'> }) => Promise<void>;
}

export function ChannelModal({
  mode,
  initialType = 'text',
  channel,
  onClose,
  onSubmit,
}: ChannelModalProps) {
  const [name, setName] = useState(channel?.name ?? '');
  const [type, setType] = useState<Extract<ChannelType, 'text' | 'voice'>>(
    channel && (channel.type === 'text' || channel.type === 'voice') ? channel.type : initialType,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), type });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar canal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="concord-panel animate-modal-in w-full max-w-sm overflow-hidden rounded-xl border border-white/[0.09] bg-[#16161b] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {type === 'voice' ? (
              <Volume2 className="h-4 w-4 text-zinc-300" />
            ) : (
              <Hash className="h-4 w-4 text-zinc-300" />
            )}
            <h2 className="text-sm font-semibold text-white">
              {mode === 'create' ? 'Criar Canal' : 'Renomear Canal'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === 'create' && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.07] bg-[#0c0c0e] p-1">
              <button
                type="button"
                onClick={() => setType('text')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                  type === 'text'
                    ? 'border border-white/[0.09] bg-[#24242c] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Hash className="h-3.5 w-3.5" />
                Texto
              </button>
              <button
                type="button"
                onClick={() => setType('voice')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                  type === 'voice'
                    ? 'border border-white/[0.09] bg-[#24242c] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                Voz
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Nome do canal</label>
            <input
              type="text"
              autoFocus
              required
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'text' ? 'ex: geral' : 'ex: Sala de Voz'}
              className="w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-white/[0.22] focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (!saving) onClose();
              }}
              disabled={saving}
              className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5865f2] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
