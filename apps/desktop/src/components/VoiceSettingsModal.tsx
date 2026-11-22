import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Keyboard,
  Loader2,
  Mic,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import type { TailscaleStatus, UpdaterStatus } from '../bridge-types.js';
import {
  DEFAULT_VOICE_SETTINGS,
  type VoiceAudioSettings,
} from '../lib/audioSettings.js';

interface VoiceSettingsModalProps {
  settings: VoiceAudioSettings;
  onUpdateSettings: (next: VoiceAudioSettings) => Promise<void>;
  onClose: () => void;
}

function keyEventToAccelerator(e: React.KeyboardEvent<HTMLInputElement>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null;

  const keyUpper = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(keyUpper);
  return parts.join('+');
}

export function VoiceSettingsModal({
  settings,
  onUpdateSettings,
  onClose,
}: VoiceSettingsModalProps) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micTestCleanupRef = useRef<(() => void) | null>(null);

  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [appVersion, setAppVersion] = useState<string>('0.1.0');
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    async function loadDevices() {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setInputs(list.filter((d) => d.kind === 'audioinput'));
        setOutputs(list.filter((d) => d.kind === 'audiooutput'));
      } catch {
        // ignore device enumeration errors
      }
    }
    void loadDevices();

    if (window.concordAPI) {
      void window.concordAPI.getTailscaleStatus().then(setTailscaleStatus).catch(() => undefined);
      void window.concordAPI.getVersion().then(setAppVersion).catch(() => undefined);
      void window.concordAPI.getUpdaterStatus().then(setUpdaterStatus).catch(() => undefined);
      const unsub = window.concordAPI.onUpdaterStatus(setUpdaterStatus);
      return () => unsub();
    }
    return undefined;
  }, []);

  useEffect(() => {
    return () => {
      micTestCleanupRef.current?.();
    };
  }, []);

  async function toggleMicTest(): Promise<void> {
    if (testingMic) {
      micTestCleanupRef.current?.();
      micTestCleanupRef.current = null;
      setTestingMic(false);
      setMicLevel(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: settings.inputDeviceId !== 'default' ? settings.inputDeviceId : undefined,
          echoCancellation: settings.echoCancellation,
          autoGainControl: settings.autoGainControl,
          noiseSuppression: !settings.rnnoiseEnabled,
        },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let rafId = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i]! - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(100, Math.round(rms * 320)));
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      micTestCleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        source.disconnect();
        void ctx.close().catch(() => undefined);
        for (const t of stream.getTracks()) t.stop();
      };
      setTestingMic(true);
    } catch {
      setTestingMic(false);
    }
  }

  async function handleCheckUpdates(): Promise<void> {
    if (!window.concordAPI) return;
    setCheckingUpdates(true);
    try {
      const st = await window.concordAPI.checkForUpdates();
      setUpdaterStatus(st);
    } finally {
      setCheckingUpdates(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#161922] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Configurações de Voz e App</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Dispositivos de Áudio */}
          <div className="space-y-3 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Dispositivos de Áudio
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs text-slate-300">
                <Mic className="h-3.5 w-3.5 text-slate-400" />
                Microfone (Entrada)
              </label>
              <select
                value={settings.inputDeviceId}
                onChange={(e) =>
                  void onUpdateSettings({ ...settings, inputDeviceId: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="default">Padrão do Windows</option>
                {inputs.map((dev, i) => (
                  <option key={dev.deviceId || i} value={dev.deviceId}>
                    {dev.label || `Microfone ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs text-slate-300">
                <Volume2 className="h-3.5 w-3.5 text-slate-400" />
                Fone / Caixa de Som (Saída)
              </label>
              <select
                value={settings.outputDeviceId}
                onChange={(e) =>
                  void onUpdateSettings({ ...settings, outputDeviceId: e.target.value })
                }
                className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="default">Padrão do Windows</option>
                {outputs.map((dev, i) => (
                  <option key={dev.deviceId || i} value={dev.deviceId}>
                    {dev.label || `Saída ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Medidor de Microfone */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void toggleMicTest()}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  testingMic
                    ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    : 'bg-white/8 text-slate-200 hover:bg-white/15'
                }`}
              >
                {testingMic ? 'Parar Teste' : 'Testar Microfone'}
              </button>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#161922]">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-400 transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          </div>

          {/* Processamento de Voz */}
          <div className="space-y-2.5 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Qualidade de Voz
            </div>

            <label className="flex cursor-pointer items-center justify-between py-1">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  RNNoise — Supressão de ruído por IA
                </div>
                <div className="text-[11px] text-slate-400">
                  Remove som de teclado mecânico, ventilador e fundo
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.rnnoiseEnabled}
                onChange={(e) =>
                  void onUpdateSettings({ ...settings, rnnoiseEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-indigo-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between py-1">
              <div className="text-xs font-medium text-slate-200">Cancelamento de Eco</div>
              <input
                type="checkbox"
                checked={settings.echoCancellation}
                onChange={(e) =>
                  void onUpdateSettings({ ...settings, echoCancellation: e.target.checked })
                }
                className="h-4 w-4 accent-indigo-500"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between py-1">
              <div className="text-xs font-medium text-slate-200">
                Controle Automático de Ganho (AGC)
              </div>
              <input
                type="checkbox"
                checked={settings.autoGainControl}
                onChange={(e) =>
                  void onUpdateSettings({ ...settings, autoGainControl: e.target.checked })
                }
                className="h-4 w-4 accent-indigo-500"
              />
            </label>
          </div>

          {/* Atalhos Globais */}
          <div className="space-y-3 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Keyboard className="h-3.5 w-3.5" />
                Atalhos Globais (funcionam em jogos)
              </div>
              <button
                type="button"
                onClick={() =>
                  void onUpdateSettings({
                    ...settings,
                    shortcuts: { ...DEFAULT_VOICE_SETTINGS.shortcuts },
                  })
                }
                className="text-[11px] text-indigo-400 hover:underline"
              >
                Restaurar padrão
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">
                  Mutar / Desmutar Mic
                </label>
                <input
                  type="text"
                  readOnly
                  value={settings.shortcuts.toggleMute}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    const combo = keyEventToAccelerator(e);
                    if (combo) {
                      void onUpdateSettings({
                        ...settings,
                        shortcuts: { ...settings.shortcuts, toggleMute: combo },
                      });
                    }
                  }}
                  title="Clique e pressione uma combinação (ex: Ctrl+Shift+M)"
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-[#161922] px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-400">
                  Ensurdecer (Deafen)
                </label>
                <input
                  type="text"
                  readOnly
                  value={settings.shortcuts.toggleDeafen}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    const combo = keyEventToAccelerator(e);
                    if (combo) {
                      void onUpdateSettings({
                        ...settings,
                        shortcuts: { ...settings.shortcuts, toggleDeafen: combo },
                      });
                    }
                  }}
                  title="Clique e pressione uma combinação (ex: Ctrl+Shift+D)"
                  className="w-full cursor-pointer rounded-lg border border-white/10 bg-[#161922] px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Clique no campo e pressione uma combinação com Ctrl, Alt ou Shift + tecla.
            </p>
          </div>

          {/* Tailscale e Atualizações */}
          <div className="space-y-2.5 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300">
                <Shield className="h-4 w-4 text-indigo-400" />
                <span>Rede Privada Tailscale</span>
              </div>
              {tailscaleStatus ? (
                tailscaleStatus.connected ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Conectado ({tailscaleStatus.selfIp})
                  </span>
                ) : tailscaleStatus.installed ? (
                  <span className="text-amber-300">Instalado (desconectado)</span>
                ) : (
                  <span className="text-slate-400">Não instalado</span>
                )
              ) : (
                <span className="text-slate-500">Verificando...</span>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/6 pt-2.5">
              <div>
                <div className="text-slate-300">Concord v{appVersion}</div>
                {updaterStatus?.message && (
                  <div className="text-[11px] text-slate-400">{updaterStatus.message}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleCheckUpdates()}
                disabled={checkingUpdates}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                {checkingUpdates ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Buscar Atualização
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
