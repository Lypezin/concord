import { useEffect, useState, type FormEvent } from 'react';
import {
  decodeUnifiedInvite,
  type AuthResponse,
  type BootstrapStatus,
} from '@concord/shared';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { TailscaleProgress, TailscaleStatus } from '../bridge-types.js';
import { ApiError, createApiClient, normalizeServerUrl } from '../lib/api.js';
import { loadLastServerUrl, saveLastServerUrl } from '../lib/storage.js';
import { Tabs, TabsList, TabsTrigger } from './ui/Tabs.js';

interface AuthScreenProps {
  initialServerUrl?: string;
  onAuthenticated: (serverUrl: string, auth: AuthResponse, status: BootstrapStatus) => void;
}

export function AuthScreen({ initialServerUrl, onAuthenticated }: AuthScreenProps) {
  const [serverUrl, setServerUrl] = useState(() => initialServerUrl || loadLastServerUrl());
  const [unifiedInput, setUnifiedInput] = useState('');
  const [unifiedFeedback, setUnifiedFeedback] = useState<string | null>(null);

  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [checkingServer, setCheckingServer] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const [tailscaleAuthKey, setTailscaleAuthKey] = useState<string | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [tailscaleBusy, setTailscaleBusy] = useState(false);
  const [tailscaleProgress, setTailscaleProgress] = useState<TailscaleProgress | null>(null);
  const [tailscaleError, setTailscaleError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function checkServer(targetUrl: string): Promise<void> {
    const clean = normalizeServerUrl(targetUrl);
    setCheckingServer(true);
    setServerError(null);
    setFormError(null);
    try {
      const api = createApiClient(clean);
      const nextStatus = await api.getBootstrapStatus();
      saveLastServerUrl(clean);
      setServerUrl(clean);
      setStatus(nextStatus);
    } catch (err) {
      setStatus(null);
      setServerError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível alcançar o servidor Concord neste endereço.',
      );
    } finally {
      setCheckingServer(false);
    }
  }

  useEffect(() => {
    void checkServer(serverUrl);
    if (window.concordAPI) {
      void window.concordAPI.getTailscaleStatus().then(setTailscaleStatus).catch(() => undefined);
      return window.concordAPI.onTailscaleProgress((prog) => {
        setTailscaleProgress(prog);
      });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApplyUnifiedInvite(rawValue: string): void {
    setUnifiedInput(rawValue);
    setUnifiedFeedback(null);
    setTailscaleError(null);
    setTailscaleProgress(null);

    const trimmed = rawValue.trim();
    if (!trimmed) {
      setTailscaleAuthKey(null);
      return;
    }

    const decoded = decodeUnifiedInvite(trimmed);
    if (!decoded) {
      if (trimmed.startsWith('CONCORD-')) {
        setUnifiedFeedback('Código unificado inválido ou corrompido.');
      }
      setTailscaleAuthKey(null);
      return;
    }

    setServerUrl(decoded.serverUrl);
    setInviteCode(decoded.inviteCode);
    setTab('register');
    setTailscaleAuthKey(decoded.tailscaleAuthKey ?? null);

    if (decoded.tailscaleAuthKey && window.concordAPI) {
      void window.concordAPI
        .getTailscaleStatus()
        .then((st) => {
          setTailscaleStatus(st);
          if (st.connected) {
            setUnifiedFeedback('Convite preenchido automaticamente. Conectando ao servidor...');
            void checkServer(decoded.serverUrl);
          } else {
            setStatus(null);
            setServerError(null);
            setUnifiedFeedback(
              'Convite reconhecido. Conecte o Tailscale abaixo antes de entrar no servidor.',
            );
          }
        })
        .catch(() => {
          setUnifiedFeedback('Convite preenchido automaticamente. Conectando ao servidor...');
          void checkServer(decoded.serverUrl);
        });
      return;
    }

    setUnifiedFeedback('Convite preenchido automaticamente. Conectando ao servidor...');
    void checkServer(decoded.serverUrl);
  }

  async function handleSetupTailscale(): Promise<void> {
    if (!window.concordAPI || !tailscaleAuthKey) return;
    setTailscaleBusy(true);
    setTailscaleError(null);
    try {
      const nextStatus = await window.concordAPI.setupTailscale({ authKey: tailscaleAuthKey });
      setTailscaleStatus(nextStatus);
      if (nextStatus.connected) {
        await checkServer(serverUrl);
      }
    } catch (err) {
      setTailscaleError(
        err instanceof Error ? err.message : 'Falha ao instalar/conectar o Tailscale.',
      );
    } finally {
      setTailscaleBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!status) return;
    setFormError(null);
    setSubmitting(true);

    const cleanUrl = normalizeServerUrl(serverUrl);
    const api = createApiClient(cleanUrl);

    try {
      let auth: AuthResponse;
      if (status.needsAdminSetup) {
        auth = await api.setupAdmin({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        });
      } else if (tab === 'register') {
        auth = await api.register({
          inviteCode: inviteCode.trim(),
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        });
      } else {
        auth = await api.login({
          username: username.trim(),
          password,
        });
      }

      const refreshedStatus = await api.getBootstrapStatus().catch(() => status);
      onAuthenticated(cleanUrl, auth, refreshedStatus);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition focus:border-white/[0.22] focus:outline-none';

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto bg-[#0c0c0e] p-6">
      <div className="concord-panel animate-modal-in w-full max-w-md space-y-5 rounded-xl border border-white/[0.08] bg-[#16161b] p-6">
        <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.12] bg-[#202027] text-base font-bold text-white">
            C
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              {status?.serverName || 'Concord'}
            </h1>
            <p className="text-xs text-zinc-400">
              Acesso ao servidor privado
            </p>
          </div>
        </div>

        {/* Convite unificado rápido */}
        <div className="rounded-lg border border-white/[0.07] bg-[#101013] p-3.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
            Código de convite unificado (opcional)
          </label>
          <input
            type="text"
            value={unifiedInput}
            onChange={(e) => handleApplyUnifiedInvite(e.target.value)}
            placeholder="CONCORD-eyJzZXJ2ZXJVcmwiOi..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-200 placeholder:font-sans placeholder:text-zinc-600 transition focus:border-white/[0.22] focus:outline-none"
          />
          {unifiedFeedback && (
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{unifiedFeedback}</p>
          )}
          {tailscaleAuthKey && window.concordAPI && (
            <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-[#16161b] p-3">
              {tailscaleStatus?.connected ? (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Rede Tailscale ativa ({tailscaleStatus.selfIp})</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <span className="block text-[11px] leading-relaxed text-zinc-300">
                    Este servidor utiliza conexão privada via Tailscale.
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSetupTailscale()}
                    disabled={tailscaleBusy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5865f2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
                  >
                    {tailscaleBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                    {tailscaleStatus?.installed
                      ? 'Conectar ao Tailscale'
                      : 'Instalar e Conectar Tailscale'}
                  </button>
                  {tailscaleProgress && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-300">
                        <span className="truncate">{tailscaleProgress.message}</span>
                        {typeof tailscaleProgress.percent === 'number' && (
                          <span className="shrink-0 font-mono text-[10px] font-semibold text-zinc-400">
                            {tailscaleProgress.percent}%
                          </span>
                        )}
                      </div>
                      {typeof tailscaleProgress.percent === 'number' && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                          <div
                            className="h-full rounded-full bg-[#5865f2] transition-all duration-200"
                            style={{ width: `${tailscaleProgress.percent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {tailscaleError && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
                      {tailscaleError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Endereço do Servidor */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Server className="h-3.5 w-3.5 text-zinc-400" />
            Endereço do Servidor
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void checkServer(serverUrl);
                }
              }}
              placeholder="http://127.0.0.1:3000"
              className="flex-1 rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 transition focus:border-white/[0.22] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void checkServer(serverUrl)}
              disabled={checkingServer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#202027] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-[#292932] disabled:opacity-50"
            >
              {checkingServer ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Conectar
            </button>
          </div>
          {serverError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {serverError}
            </div>
          )}
          {status && (
            <div className="flex items-center justify-between pt-0.5 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-[#23a55a]" />
                Servidor online
              </span>
              <span>
                Membros: {status.userCount}/{status.maxUsers}
              </span>
            </div>
          )}
        </div>

        {status && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            {status.needsAdminSetup ? (
              <div className="rounded-lg border border-white/[0.08] bg-[#101013] p-3.5 text-xs text-zinc-300">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-zinc-300" />
                  Configuração Inicial do Servidor
                </div>
                <p className="mt-1 leading-relaxed text-zinc-400">
                  Crie a conta de Administrador para iniciar o servidor e gerar convites.
                </p>
              </div>
            ) : (
              <Tabs
                value={tab}
                onValueChange={(val) => {
                  setTab(val as 'login' | 'register');
                  setFormError(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Criar Conta</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {!status.needsAdminSetup && tab === 'register' && (
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                  Código de Convite
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-1234"
                  className={`${inputClass} font-mono uppercase tracking-wider`}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Nome de usuário</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: luiz"
                className={inputClass}
              />
            </div>

            {(status.needsAdminSetup || tab === 'register') && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">Nome de exibição</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como seu nome aparecerá"
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5865f2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status.needsAdminSetup ? (
                <ShieldCheck className="h-4 w-4" />
              ) : tab === 'register' ? (
                <UserPlus className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {status.needsAdminSetup
                ? 'Criar Servidor e Entrar'
                : tab === 'register'
                  ? 'Criar Conta e Entrar'
                  : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
