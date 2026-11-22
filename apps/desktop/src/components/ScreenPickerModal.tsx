import { useEffect, useState } from 'react';
import { AppWindow, Loader2, Monitor, RefreshCw, Volume2, X } from 'lucide-react';
import type { ScreenSourceOption } from '../bridge-types.js';
import type { ScreenShareOptions } from '../hooks/useVoiceRoom.js';

interface ScreenPickerModalProps {
  onClose: () => void;
  onStartShare: (options: ScreenShareOptions) => Promise<void>;
}

export function ScreenPickerModal({ onClose, onStartShare }: ScreenPickerModalProps) {
  const [sources, setSources] = useState<ScreenSourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [resolution, setResolution] = useState<'720p' | '1080p' | '1440p'>('1080p');
  const [fps, setFps] = useState<30 | 60>(60);
  const [contentHint, setContentHint] = useState<'motion' | 'detail'>('motion');
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSources(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      if (!window.concordAPI) {
        throw new Error('Captura de tela disponível apenas no aplicativo desktop.');
      }
      const list = await window.concordAPI.getScreenSources();
      setSources(list);
      const preferred = list.find((s) => s.type === tab) ?? null;
      setSelectedId((prev) =>
        prev && list.some((s) => s.id === prev && s.type === tab)
          ? prev
          : preferred?.id ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar telas e janelas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !starting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, starting]);

  const filtered = sources.filter((s) => s.type === tab);

  async function handleConfirm(overrideId?: string): Promise<void> {
    const targetId = overrideId ?? selectedId;
    if (!targetId || starting) return;
    setStarting(true);
    setError(null);
    try {
      await onStartShare({
        sourceId: targetId,
        includeSystemAudio,
        resolution,
        fps,
        contentHint,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar compartilhamento de tela.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={() => {
        if (!starting) onClose();
      }}
    >
      <div
        className="concord-glass animate-modal-in relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131724]/98"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/45 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/15 text-indigo-300">
              <Monitor className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Compartilhar Tela
              </h2>
              <p className="text-[11px] text-slate-400">
                Escolha um monitor ou janela para transmitir na call
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadSources()}
              disabled={loading}
              title="Atualizar lista"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!starting) onClose();
              }}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Abas Telas / Janelas */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-[#0a0d14] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('screen');
                const first = sources.find((s) => s.type === 'screen');
                setSelectedId(first?.id ?? null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'screen'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Telas ({sources.filter((s) => s.type === 'screen').length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('window');
                const first = sources.find((s) => s.type === 'window');
                setSelectedId(first?.id ?? null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'window'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AppWindow className="h-3.5 w-3.5" />
              Janelas ({sources.filter((s) => s.type === 'window').length})
            </button>
          </div>

          {/* Grid de Miniaturas */}
          {loading ? (
            <div className="flex h-44 items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-slate-500">
              Nenhuma fonte encontrada nesta categoria.
            </div>
          ) : (
            <div className="grid max-h-60 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
              {filtered.map((src) => {
                const selected = src.id === selectedId;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSelectedId(src.id)}
                    onDoubleClick={() => {
                      setSelectedId(src.id);
                      void handleConfirm(src.id);
                    }}
                    className={`group flex flex-col overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-500/35'
                        : 'border-white/[0.08] bg-[#0a0d14] hover:border-white/25'
                    }`}
                  >
                    <div className="aspect-video w-full overflow-hidden bg-black">
                      <img
                        src={src.thumbnail}
                        alt={src.name}
                        className="h-full w-full object-contain transition duration-150 group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-2">
                      {src.appIcon && (
                        <img src={src.appIcon} alt="" className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate text-[11px] font-medium text-slate-200">
                        {src.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Qualidade e Áudio */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Resolução
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['720p', '1080p', '1440p'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                        resolution === r
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                          : 'bg-[#131724] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Taxa de Quadros
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {([30, 60] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                        fps === f
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                          : 'bg-[#131724] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">
                  Otimização
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setContentHint('motion')}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      contentHint === 'motion'
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                        : 'bg-[#131724] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Jogos
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentHint('detail')}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                      contentHint === 'detail'
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                        : 'bg-[#131724] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Texto
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#131724] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <Volume2 className="h-4 w-4 shrink-0 text-indigo-400" />
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Compartilhar áudio do sistema (sem eco)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Captura o som do jogo/vídeo filtrando as vozes do Concord
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeSystemAudio}
                onClick={() => setIncludeSystemAudio((prev) => !prev)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition ${
                  includeSystemAudio
                    ? 'border-indigo-400/50 bg-indigo-600'
                    : 'border-white/10 bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    includeSystemAudio ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              if (!starting) onClose();
            }}
            disabled={starting}
            className="rounded-xl px-3.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedId || starting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
          >
            {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Transmitir Agora
          </button>
        </div>
      </div>
    </div>
  );
}
