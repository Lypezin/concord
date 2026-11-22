import { useEffect, useRef, useState } from 'react';
import type { UserPublic } from '@concord/shared';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Headphones,
  Keyboard,
  Loader2,
  Mic,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  Volume2,
  X,
} from 'lucide-react';
import type { TailscaleStatus, UpdaterStatus } from '../bridge-types.js';
import {
  DEFAULT_VOICE_SETTINGS,
  type VoiceAudioSettings,
} from '../lib/audioSettings.js';
import { Avatar } from './Avatar.js';

const AVATAR_PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
];

interface VoiceSettingsModalProps {
  currentUser: UserPublic;
  settings: VoiceAudioSettings;
  shortcutStatus: { toggleMute: boolean; toggleDeafen: boolean } | null;
  onUpdateProfile: (body: { displayName: string; avatarColor: string }) => Promise<void>;
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

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
}

function ToggleSwitch({ checked, onToggle }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition ${
        checked
          ? 'border-indigo-400/50 bg-indigo-600'
          : 'border-white/10 bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function VoiceSettingsModal({
  currentUser,
  settings,
  shortcutStatus,
  onUpdateProfile,
  onUpdateSettings,
  onClose,
}: VoiceSettingsModalProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [avatarColor, setAvatarColor] = useState(currentUser.avatarColor);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  const [testingMic, setTestingMic] = useState(false);
  const [hearSelf, setHearSelf] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micTestCleanupRef = useRef<(() => void) | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);

  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [appVersion, setAppVersion] = useState<string>('0.3.0');
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setInputs(list.filter((d) => d.kind === 'audioinput'));
      setOutputs(list.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // ignore device enumeration errors
    }
  }

  useEffect(() => {
    void refreshDevices();

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
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = hearSelf ? 1 : 0;
    }
  }, [hearSelf]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target?.dataset?.shortcutCapture === 'true') {
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    return () => {
      micTestCleanupRef.current?.();
    };
  }, []);

  async function toggleMicTest(): Promise<void> {
    setMicError(null);

    if (testingMic) {
      micTestCleanupRef.current?.();
      micTestCleanupRef.current = null;
      loopbackGainRef.current = null;
      setTestingMic(false);
      setMicLevel(0);
      return;
    }

    try {
      const preferredId =
        settings.inputDeviceId !== 'default' ? settings.inputDeviceId : undefined;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: preferredId ? { exact: preferredId } : undefined,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGainControl,
            noiseSuppression: true,
          },
        });
      } catch (firstErr) {
        if (preferredId) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: settings.echoCancellation,
              autoGainControl: settings.autoGainControl,
              noiseSuppression: true,
            },
          });
          void onUpdateSettings({ ...settings, inputDeviceId: 'default' });
        } else {
          throw firstErr;
        }
      }

      void refreshDevices();

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const loopbackGain = ctx.createGain();
      loopbackGain.gain.value = hearSelf ? 1 : 0;
      source.connect(loopbackGain);
      loopbackGain.connect(ctx.destination);
      loopbackGainRef.current = loopbackGain;

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
        setMicLevel(Math.min(100, Math.round(rms * 340)));
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      micTestCleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        try {
          source.disconnect();
          loopbackGain.disconnect();
        } catch {
          // ignore
        }
        loopbackGainRef.current = null;
        void ctx.close().catch(() => undefined);
        for (const t of stream.getTracks()) t.stop();
      };
      setTestingMic(true);
    } catch (err) {
      setTestingMic(false);
      setMicLevel(0);
      setMicError(
        err instanceof Error
          ? `Não foi possível acessar o microfone: ${err.message}`
          : 'Não foi possível acessar o microfone. Verifique as permissões do Windows.',
      );
    }
  }

  async function handleCheckUpdates(): Promise<void> {
    if (!window.concordAPI) return;
    setCheckingUpdates(true);
    try {
      const st = await window.concordAPI.checkForUpdates();
      setUpdaterStatus(st);
    } catch {
      // handled by updater status state
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function handleSaveProfile(): Promise<void> {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError('Informe um nome de exibição.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await onUpdateProfile({ displayName: trimmed, avatarColor });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="concord-glass animate-modal-in relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#131724]/98"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/45 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/15 text-indigo-300">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Perfil, Voz e Atalhos
              </h2>
              <p className="text-[11px] text-slate-400">
                Personalize seu perfil e ajuste microfone, RNNoise IA e dispositivos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Meu Perfil */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <User className="h-3.5 w-3.5 text-indigo-400" />
              Meu Perfil
            </div>

            <div className="flex items-center gap-3">
              <Avatar
                displayName={displayName || currentUser.displayName}
                color={avatarColor}
                size="lg"
                ringBg="border-[#0a0d14]"
              />
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  maxLength={32}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nome exibido no chat"
                  className="flex-1 rounded-xl border border-white/[0.08] bg-[#131724] px-3 py-2 text-xs text-slate-100 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveProfile()}
                  disabled={savingProfile}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : profileSaved ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  ) : null}
                  {profileSaved ? 'Salvo' : 'Salvar'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-0.5">
              <span className="text-[11px] text-slate-400">Cor do avatar:</span>
              <div className="flex flex-wrap gap-2">
                {AVATAR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAvatarColor(color)}
                    className={`h-5 w-5 rounded-full transition ${
                      avatarColor === color
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0a0d14]'
                        : 'opacity-75 hover:scale-105 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {profileError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
                {profileError}
              </div>
            )}
          </div>

          {/* Dispositivos de Áudio */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
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
                className="w-full rounded-xl border border-white/[0.08] bg-[#131724] px-2.5 py-2 text-xs text-slate-200 transition focus:border-indigo-500/70 focus:outline-none"
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
                className="w-full rounded-xl border border-white/[0.08] bg-[#131724] px-2.5 py-2 text-xs text-slate-200 transition focus:border-indigo-500/70 focus:outline-none"
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
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void toggleMicTest()}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                    testingMic
                      ? 'border border-rose-500/30 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                      : 'border border-white/[0.09] bg-white/[0.07] text-slate-200 hover:bg-white/[0.13]'
                  }`}
                >
                  {testingMic ? 'Parar Teste' : 'Testar Microfone'}
                </button>

                <button
                  type="button"
                  onClick={() => setHearSelf((prev) => !prev)}
                  title="Ouvir o retorno da sua própria voz durante o teste"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition ${
                    hearSelf
                      ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-200'
                      : 'border-white/[0.07] bg-[#131724] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Headphones className="h-3.5 w-3.5" />
                  Ouvir retorno
                </button>

                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#131724] ring-1 ring-inset ring-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-indigo-400 to-violet-400 transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>

              {micError && (
                <div className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>{micError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Processamento de Voz */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Qualidade de Voz (Opus 64 kbps)
              </div>
              {settings.rnnoiseEnabled && (
                <span className="inline-flex items-center gap-1 rounded-md border border-indigo-400/25 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                  <Sparkles className="h-3 w-3 text-indigo-300" />
                  RNNoise 48kHz Ativo
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 py-0.5">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  RNNoise — Supressão de ruído por IA
                </div>
                <div className="text-[11px] text-slate-400">
                  Remove som de teclado mecânico, ventilador e ruído de fundo
                </div>
              </div>
              <ToggleSwitch
                checked={settings.rnnoiseEnabled}
                onToggle={() =>
                  void onUpdateSettings({ ...settings, rnnoiseEnabled: !settings.rnnoiseEnabled })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] pt-2.5">
              <div className="text-xs font-medium text-slate-200">Cancelamento de Eco</div>
              <ToggleSwitch
                checked={settings.echoCancellation}
                onToggle={() =>
                  void onUpdateSettings({
                    ...settings,
                    echoCancellation: !settings.echoCancellation,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] pt-2.5">
              <div className="text-xs font-medium text-slate-200">
                Controle Automático de Ganho (AGC)
              </div>
              <ToggleSwitch
                checked={settings.autoGainControl}
                onToggle={() =>
                  void onUpdateSettings({
                    ...settings,
                    autoGainControl: !settings.autoGainControl,
                  })
                }
              />
            </div>
          </div>

          {/* Atalhos Globais */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Keyboard className="h-3.5 w-3.5 text-indigo-400" />
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
                className="text-[11px] font-medium text-indigo-400 hover:underline"
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
                  data-shortcut-capture="true"
                  value={settings.shortcuts.toggleMute}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.blur();
                      return;
                    }
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
                  className="w-full cursor-pointer rounded-xl border border-white/[0.08] bg-[#131724] px-3 py-2 font-mono text-xs text-slate-200 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-400">
                  Ensurdecer (Deafen)
                </label>
                <input
                  type="text"
                  readOnly
                  data-shortcut-capture="true"
                  value={settings.shortcuts.toggleDeafen}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.blur();
                      return;
                    }
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
                  className="w-full cursor-pointer rounded-xl border border-white/[0.08] bg-[#131724] px-3 py-2 font-mono text-xs text-slate-200 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Clique no campo e pressione uma combinação com Ctrl, Alt ou Shift + tecla.
            </p>
            {shortcutStatus &&
              (!shortcutStatus.toggleMute || !shortcutStatus.toggleDeafen) && (
                <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    Atalho em conflito com outro app no Windows (
                    {!shortcutStatus.toggleMute ? 'Mute' : ''}
                    {!shortcutStatus.toggleMute && !shortcutStatus.toggleDeafen ? ' e ' : ''}
                    {!shortcutStatus.toggleDeafen ? 'Ensurdecer' : ''}
                    ). Escolha outra combinação.
                  </span>
                </div>
              )}
          </div>

          {/* Tailscale e Atualizações */}
          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300">
                <Shield className="h-4 w-4 text-indigo-400" />
                <span>Rede Privada Tailscale</span>
              </div>
              {tailscaleStatus ? (
                tailscaleStatus.connected ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
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

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
              <div>
                <div className="font-semibold text-slate-200">Concord v{appVersion}</div>
                {updaterStatus?.message && (
                  <div className="text-[11px] text-slate-400">{updaterStatus.message}</div>
                )}
              </div>

              {updaterStatus?.state === 'downloaded' ? (
                <button
                  type="button"
                  onClick={() => void window.concordAPI?.installUpdate()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-500 hover:to-teal-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Reiniciar e Instalar v{updaterStatus.version}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCheckUpdates()}
                  disabled={checkingUpdates}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-50"
                >
                  {checkingUpdates ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Buscar Atualização
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
