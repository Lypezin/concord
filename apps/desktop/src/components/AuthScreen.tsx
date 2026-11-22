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
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { TailscaleProgress, TailscaleStatus } from '../bridge-types.js';
import { ApiError, createApiClient, normalizeServerUrl } from '../lib/api.js';
import { loadLastServerUrl, saveLastServerUrl } from '../lib/storage.js';

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
            setUnifiedFeedback('Convite preenchido automaticamente! Conectando ao servidor...');
            void checkServer(decoded.serverUrl);
          } else {
            setStatus(null);
            setServerError(null);
            setUnifiedFeedback(
              'Convite reconhecido! Conecte a rede privada Tailscale abaixo antes de entrar no servidor.',
            );
          }
        })
        .catch(() => {
          setUnifiedFeedback('Convite preenchido automaticamente! Conectando ao servidor...');
          void checkServer(decoded.serverUrl);
        });
      return;
    }

    setUnifiedFeedback('Convite preenchido automaticamente! Conectando ao servidor...');
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
    'w-full rounded-xl border border-white/[0.08] bg-[#0a0d14] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-y-auto bg-[#080a0f] p-6">
      {/* Ambient aurora */}
      <div className="pointer-events-none fixed -left-32 -top-24 h-[420px] w-[420px] rounded-full bg-indigo-600/18 blur-[130px]" />
      <div className="pointer-events-none fixed -bottom-32 -right-24 h-[420px] w-[420px] rounded-full bg-violet-600/14 blur-[130px]" />

      <div className="concord-glass animate-modal-in relative w-full max-w-md space-y-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121622]/90 p-7 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

        <div className="text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_28px_rgba(99,102,241,0.4)] ring-1 ring-inset ring-white/25">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 7.5a6.5 6.5 0 1 0 0 9" />
              <circle cx="17.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            {status?.serverName || 'Concord'}
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Chat, voz e tela com qualidade máxima só entre vocês.
          </p>
        </div>

        {/* Convite unificado rápido */}
        <div className="rounded-xl border border-white/[0.07] bg-[#0a0d14]/85 p-3.5">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            Recebeu um convite unificado? Cole aqui
          </label>
          <input
            type="text"
            value={unifiedInput}
            onChange={(e) => handleApplyUnifiedInvite(e.target.value)}
            placeholder="CONCORD-eyJzZXJ2ZXJVcmwiOi..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#121622] px-3 py-2 font-mono text-xs text-slate-200 placeholder:font-sans placeholder:text-slate-600 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {unifiedFeedback && (
            <p className="mt-1.5 text-xs leading-relaxed text-indigo-300">{unifiedFeedback}</p>
          )}
          {tailscaleAuthKey && window.concordAPI && (
            <div className="mt-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.09] p-3">
              {tailscaleStatus?.connected ? (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Rede privada Tailscale ativa ({tailscaleStatus.selfIp})</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <span className="block text-[11px] leading-relaxed text-indigo-200/90">
                    Este convite usa rede privada segura (Tailscale).
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSetupTailscale()}
                    disabled={tailscaleBusy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
                  >
                    {tailscaleBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                    {tailscaleStatus?.installed
                      ? 'Conectar ao Tailscale do Grupo'
                      : 'Instalar e Conectar Tailscale'}
                  </button>
                  {tailscaleProgress && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-indigo-200">
                        <span className="truncate">{tailscaleProgress.message}</span>
                        {typeof tailscaleProgress.percent === 'number' && (
                          <span className="shrink-0 font-mono text-[10px] font-semibold text-indigo-300">
                            {tailscaleProgress.percent}%
                          </span>
                        )}
                      </div>
                      {typeof tailscaleProgress.percent === 'number' && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all duration-200"
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
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Server className="h-3.5 w-3.5 text-slate-400" />
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
              className="flex-1 rounded-xl border border-white/[0.08] bg-[#0a0d14] px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 transition focus:border-indigo-500/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="button"
              onClick={() => void checkServer(serverUrl)}
              disabled={checkingServer}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-50"
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
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {serverError}
            </div>
          )}
          {status && (
            <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                Servidor online
              </span>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                Membros: {status.userCount}/{status.maxUsers}
              </span>
            </div>
          )}
        </div>

        {status && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            {status.needsAdminSetup ? (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3.5 text-xs text-indigo-200">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-100">
                  <ShieldCheck className="h-4 w-4 text-indigo-400" />
                  Configuração Inicial do Servidor
                </div>
                <p className="mt-1 leading-relaxed text-indigo-200/80">
                  Crie a primeira conta de Administrador para liberar o servidor e gerar convites para seus amigos.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-[#0a0d14] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setFormError(null);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                    tab === 'login'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setFormError(null);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                    tab === 'register'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Criar Conta (Convite)
                </button>
              </div>
            )}

            {!status.needsAdminSetup && tab === 'register' && (
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" />
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
              <label className="text-xs font-medium text-slate-300">Nome de usuário</label>
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
                <label className="text-xs font-medium text-slate-300">Nome exibido no chat</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como seus amigos te chamam"
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Senha</label>
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
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
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
                  : 'Entrar no Concord'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
