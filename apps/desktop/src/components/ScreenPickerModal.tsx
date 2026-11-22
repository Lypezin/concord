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
      const preferred =
        list.find((s) => s.type === tab) ?? list[0] ?? null;
      setSelectedId((prev) =>
        prev && list.some((s) => s.id === prev) ? prev : preferred?.id ?? null,
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

  const filtered = sources.filter((s) => s.type === tab);

  async function handleConfirm(): Promise<void> {
    if (!selectedId) return;
    setStarting(true);
    setError(null);
    try {
      await onStartShare({
        sourceId: selectedId,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#161922] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Compartilhar Tela</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSources()}
              disabled={loading}
              title="Atualizar lista"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Abas Telas / Janelas */}
          <div className="grid grid-cols-2 rounded-xl bg-[#0f1117] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('screen');
                const first = sources.find((s) => s.type === 'screen');
                if (first) setSelectedId(first.id);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'screen'
                  ? 'bg-indigo-600 text-white shadow'
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
                if (first) setSelectedId(first.id);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'window'
                  ? 'bg-indigo-600 text-white shadow'
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
              <Loader2 className="h-6 w-6 animate-spin" />
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
                    className={`flex flex-col overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? 'border-indigo-500 bg-indigo-500/15 ring-2 ring-indigo-500/40'
                        : 'border-white/10 bg-[#0f1117] hover:border-white/25'
                    }`}
                  >
                    <div className="aspect-video w-full overflow-hidden bg-black">
                      <img
                        src={src.thumbnail}
                        alt={src.name}
                        className="h-full w-full object-contain"
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
          <div className="space-y-3 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4">
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
                      className={`rounded-lg py-1.5 text-xs font-medium transition ${
                        resolution === r
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[#161922] text-slate-400 hover:text-slate-200'
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
                      className={`rounded-lg py-1.5 text-xs font-medium transition ${
                        fps === f
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[#161922] text-slate-400 hover:text-slate-200'
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
                    className={`rounded-lg py-1.5 text-xs font-medium transition ${
                      contentHint === 'motion'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[#161922] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Jogos
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentHint('detail')}
                    className={`rounded-lg py-1.5 text-xs font-medium transition ${
                      contentHint === 'detail'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[#161922] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Texto
                  </button>
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/6 bg-[#161922] px-3 py-2">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-indigo-400" />
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Compartilhar áudio do sistema (sem eco)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Captura o som do jogo/vídeo filtrando as vozes do Concord
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeSystemAudio}
                onChange={(e) => setIncludeSystemAudio(e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedId || starting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Transmitir Agora
          </button>
        </div>
      </div>
    </div>
  );
}
