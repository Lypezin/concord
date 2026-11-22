import { useState, type FormEvent } from 'react';
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#161922] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {mode === 'create' ? 'Criar Canal' : 'Renomear Canal'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {mode === 'create' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('text')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  type === 'text'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 bg-[#0f1117] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Hash className="h-4 w-4" />
                Texto
              </button>
              <button
                type="button"
                onClick={() => setType('voice')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  type === 'voice'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 bg-[#0f1117] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Volume2 className="h-4 w-4" />
                Voz
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Nome do canal</label>
            <input
              type="text"
              autoFocus
              required
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'text' ? 'ex: clipes' : 'ex: Jogatina'}
              className="w-full rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
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
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
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
