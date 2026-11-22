import { useEffect, useMemo, useRef, useState } from 'react';
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
  User,
  Volume2,
} from 'lucide-react';
import type { TailscaleStatus, UpdaterStatus } from '../bridge-types.js';
import {
  DEFAULT_VOICE_SETTINGS,
  type VoiceAudioSettings,
} from '../lib/audioSettings.js';
import { Avatar } from './Avatar.js';
import { ModalDialog } from './ui/Dialog.js';
import { Select } from './ui/Select.js';
import { Switch } from './ui/Switch.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs.js';

const AVATAR_PALETTE = [
  '#5865f2',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#ec4899',
  '#71717a',
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

export function VoiceSettingsModal({
  currentUser,
  settings,
  shortcutStatus,
  onUpdateProfile,
  onUpdateSettings,
  onClose,
}: VoiceSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'audio' | 'profile' | 'shortcuts' | 'system'>('audio');
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
  const [appVersion, setAppVersion] = useState<string>('0.5.0');
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
    const onDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    let unsubUpdater: (() => void) | undefined;
    if (window.concordAPI) {
      void window.concordAPI.getTailscaleStatus().then(setTailscaleStatus).catch(() => undefined);
      void window.concordAPI.getVersion().then(setAppVersion).catch(() => undefined);
      void window.concordAPI.getUpdaterStatus().then(setUpdaterStatus).catch(() => undefined);
      unsubUpdater = window.concordAPI.onUpdaterStatus(setUpdaterStatus);
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      unsubUpdater?.();
    };
  }, []);

  useEffect(() => {
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = hearSelf ? 1 : 0;
    }
  }, [hearSelf]);

  useEffect(() => {
    return () => {
      micTestCleanupRef.current?.();
    };
  }, []);

  const inputOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set('default', 'Padrão do Windows');
    inputs.forEach((dev, i) => {
      if (dev.deviceId && !map.has(dev.deviceId)) {
        map.set(dev.deviceId, dev.label || `Microfone ${i + 1}`);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [inputs]);

  const outputOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set('default', 'Padrão do Windows');
    outputs.forEach((dev, i) => {
      if (dev.deviceId && !map.has(dev.deviceId)) {
        map.set(dev.deviceId, dev.label || `Saída ${i + 1}`);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [outputs]);

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
    <ModalDialog
      onClose={onClose}
      title="Configurações"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      maxWidthClass="max-w-xl"
    >
      <Tabs
        value={activeTab}
        onValueChange={(val) =>
          setActiveTab(val as 'audio' | 'profile' | 'shortcuts' | 'system')
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-white/[0.07] bg-[#131317] px-5 py-2.5">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="audio">
              <Volume2 className="h-3.5 w-3.5" />
              <span>Voz & Áudio</span>
            </TabsTrigger>
            <TabsTrigger value="profile">
              <User className="h-3.5 w-3.5" />
              <span>Perfil</span>
            </TabsTrigger>
            <TabsTrigger value="shortcuts">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Atalhos</span>
            </TabsTrigger>
            <TabsTrigger value="system">
              <Shield className="h-3.5 w-3.5" />
              <span>Sistema</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ABA 1: VOZ & ÁUDIO */}
          <TabsContent value="audio" className="space-y-4">
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Dispositivos de Áudio
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Mic className="h-3.5 w-3.5 text-zinc-400" />
                  Microfone (Entrada)
                </label>
                <Select
                  value={settings.inputDeviceId}
                  onValueChange={(value) =>
                    void onUpdateSettings({ ...settings, inputDeviceId: value })
                  }
                  options={inputOptions}
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
                  Fone / Caixa de Som (Saída)
                </label>
                <Select
                  value={settings.outputDeviceId}
                  onValueChange={(value) =>
                    void onUpdateSettings({ ...settings, outputDeviceId: value })
                  }
                  options={outputOptions}
                />
              </div>

              {/* Medidor de Microfone */}
              <div className="space-y-2.5 border-t border-white/[0.06] pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleMicTest()}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      testingMic
                        ? 'border-rose-500/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                        : 'border-white/[0.08] bg-[#202027] text-zinc-200 hover:bg-[#292932]'
                    }`}
                  >
                    {testingMic ? 'Parar Teste' : 'Testar Microfone'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setHearSelf((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                      hearSelf
                        ? 'border-white/[0.18] bg-[#26262f] text-white'
                        : 'border-white/[0.07] bg-[#16161b] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    Ouvir retorno
                  </button>

                  <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-white/[0.06] bg-[#0c0c0e]">
                    <div
                      className="h-full rounded-full bg-[#23a55a] transition-all duration-75"
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
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Processamento de Voz
              </div>

              <div className="flex items-center justify-between gap-3 py-0.5">
                <div>
                  <div className="text-xs font-medium text-zinc-200">
                    Supressão de ruído (RNNoise)
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Filtra som de teclado mecânico, cooler e ruídos de fundo em 48 kHz
                  </div>
                </div>
                <Switch
                  checked={settings.rnnoiseEnabled}
                  onCheckedChange={(checked) =>
                    void onUpdateSettings({ ...settings, rnnoiseEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
                <div>
                  <div className="text-xs font-medium text-zinc-200">Cancelamento de Eco</div>
                  <div className="text-[11px] text-zinc-500">
                    Impede que o som das caixas retorne pelo microfone
                  </div>
                </div>
                <Switch
                  checked={settings.echoCancellation}
                  onCheckedChange={(checked) =>
                    void onUpdateSettings({
                      ...settings,
                      echoCancellation: checked,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
                <div>
                  <div className="text-xs font-medium text-zinc-200">
                    Controle Automático de Ganho (AGC)
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Mantém o volume da sua voz equilibrado automaticamente
                  </div>
                </div>
                <Switch
                  checked={settings.autoGainControl}
                  onCheckedChange={(checked) =>
                    void onUpdateSettings({
                      ...settings,
                      autoGainControl: checked,
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* ABA 2: PERFIL */}
          <TabsContent value="profile" className="space-y-4">
            <div className="space-y-4 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <User className="h-3.5 w-3.5" />
                Identidade no Servidor
              </div>

              <div className="flex items-center gap-3.5">
                <Avatar
                  displayName={displayName || currentUser.displayName}
                  color={avatarColor}
                  size="lg"
                  ringBg="border-[#101013]"
                />
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    maxLength={32}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nome exibido"
                    className="flex-1 rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 text-xs text-zinc-100 transition focus:border-white/[0.22] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#5865f2] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
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

              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <span className="block text-xs font-medium text-zinc-300">Cor do Avatar</span>
                <div className="flex flex-wrap gap-2.5">
                  {AVATAR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      className={`h-6 w-6 rounded-full transition ${
                        avatarColor === color
                          ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#101013]'
                          : 'opacity-75 hover:opacity-100'
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
          </TabsContent>

          {/* ABA 3: ATALHOS GLOBAIS */}
          <TabsContent value="shortcuts" className="space-y-4">
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  <Keyboard className="h-3.5 w-3.5" />
                  Atalhos Globais (funcionam dentro de jogos)
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateSettings({
                      ...settings,
                      shortcuts: { ...DEFAULT_VOICE_SETTINGS.shortcuts },
                    })
                  }
                  className="text-[11px] font-medium text-zinc-300 hover:underline"
                >
                  Restaurar padrão
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                    Mutar / Desmutar Microfone
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
                    className="w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-200 transition focus:border-[#5865f2] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-300">
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
                    className="w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-200 transition focus:border-[#5865f2] focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                Clique em um campo acima e pressione uma combinação com Ctrl, Alt ou Shift + tecla.
              </p>

              {shortcutStatus &&
                (!shortcutStatus.toggleMute || !shortcutStatus.toggleDeafen) && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>
                      Atalho em conflito com outro aplicativo (
                      {!shortcutStatus.toggleMute ? 'Mute' : ''}
                      {!shortcutStatus.toggleMute && !shortcutStatus.toggleDeafen ? ' e ' : ''}
                      {!shortcutStatus.toggleDeafen ? 'Ensurdecer' : ''}
                      ). Escolha outra combinação.
                    </span>
                  </div>
                )}
            </div>
          </TabsContent>

          {/* ABA 4: SISTEMA E ATUALIZAÇÕES */}
          <TabsContent value="system" className="space-y-4">
            <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#101013] p-4 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Shield className="h-4 w-4 text-zinc-400" />
                  <div>
                    <div className="font-medium text-zinc-200">Rede Privada Tailscale</div>
                    <div className="text-[11px] text-zinc-500">
                      Conexão criptografada ponto a ponto entre os amigos
                    </div>
                  </div>
                </div>
                {tailscaleStatus ? (
                  tailscaleStatus.connected ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {tailscaleStatus.selfIp}
                    </span>
                  ) : tailscaleStatus.installed ? (
                    <span className="text-amber-300">Instalado (desconectado)</span>
                  ) : (
                    <span className="text-zinc-500">Não instalado</span>
                  )
                ) : (
                  <span className="text-zinc-500">Verificando...</span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <div>
                  <div className="font-semibold text-zinc-200">Concord v{appVersion}</div>
                  <div className="text-[11px] text-zinc-400">
                    {updaterStatus?.message || 'Atualizações automáticas via GitHub Releases'}
                  </div>
                </div>

                {updaterStatus?.state === 'downloaded' ? (
                  <button
                    type="button"
                    onClick={() => void window.concordAPI?.installUpdate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#23a55a] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#1e8e4d]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Reiniciar e Instalar v{updaterStatus.version}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCheckUpdates()}
                    disabled={checkingUpdates}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#202027] px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:bg-[#292932] disabled:opacity-50"
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
          </TabsContent>
        </div>
      </Tabs>
    </ModalDialog>
  );
}
