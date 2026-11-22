import { useEffect, useState } from 'react';
import { encodeUnifiedInvite, type InviteInfo } from '@concord/shared';
import { Check, Copy, KeyRound, Loader2, Plus, Shield, Trash2, X } from 'lucide-react';
import type { ConcordApiClient } from '../lib/api.js';

interface InviteModalProps {
  api: ConcordApiClient;
  currentServerUrl: string;
  onClose: () => void;
}

export function InviteModal({ api, currentServerUrl, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxUses, setMaxUses] = useState<number>(1);
  const [expiryOption, setExpiryOption] = useState<'24h' | '7d' | 'never'>('7d');

  const [publicServerUrl, setPublicServerUrl] = useState(currentServerUrl);
  const [tailscaleIp, setTailscaleIp] = useState<string | null>(null);
  const [tailscaleAuthKey, setTailscaleAuthKey] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function refreshInvites(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getInvites();
      setInvites(res.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar convites.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshInvites();
    if (window.concordAPI) {
      void window.concordAPI
        .getTailscaleStatus()
        .then((st) => {
          if (st.connected && st.selfIp) {
            setTailscaleIp(st.selfIp);
          }
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const expiresInHours =
        expiryOption === '24h' ? 24 : expiryOption === '7d' ? 168 : null;
      const res = await api.createInvite({ maxUses, expiresInHours });
      setInvites((prev) => [res.invite, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar convite.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(code: string): Promise<void> {
    setError(null);
    try {
      await api.deleteInvite(code);
      setInvites((prev) => prev.filter((inv) => inv.code !== code));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao revogar convite.');
    }
  }

  async function copyText(id: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 2000);
    } catch {
      setError('Não foi possível copiar para a área de transferência.');
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
            <KeyRound className="h-4 w-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Convites Privados</h2>
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
          {/* Gerar novo convite */}
          <div className="space-y-3 rounded-xl border border-white/8 bg-[#0f1117]/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Gerar Novo Convite
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Máximo de usos</label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value={1}>1 amigo</option>
                  <option value={2}>2 amigos</option>
                  <option value={3}>3 amigos</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Validade</label>
                <select
                  value={expiryOption}
                  onChange={(e) => setExpiryOption(e.target.value as '24h' | '7d' | 'never')}
                  className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="24h">24 horas</option>
                  <option value="7d">7 dias</option>
                  <option value="never">Sem expiração</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Criar Código de Convite
            </button>
          </div>

          {/* Parâmetros opcionais para convite unificado */}
          <div className="space-y-2.5 rounded-xl border border-white/8 bg-[#0f1117]/50 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Opções do Convite Unificado (CONCORD-...)
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[11px] text-slate-400">
                  Endereço do servidor para os amigos (ex: IP Tailscale http://100.x.x.x:3000)
                </label>
                {tailscaleIp && (
                  <button
                    type="button"
                    onClick={() => setPublicServerUrl(`http://${tailscaleIp}:3000`)}
                    className="inline-flex shrink-0 items-center gap-1 rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-500/30"
                  >
                    <Shield className="h-3 w-3" />
                    Usar meu IP Tailscale
                  </button>
                )}
              </div>
              <input
                type="text"
                value={publicServerUrl}
                onChange={(e) => setPublicServerUrl(e.target.value)}
                placeholder="http://100.x.x.x:3000"
                className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">
                Tailscale Auth Key (para conectar seu amigo à rede privada sem conta)
              </label>
              <input
                type="password"
                value={tailscaleAuthKey}
                onChange={(e) => setTailscaleAuthKey(e.target.value)}
                placeholder="tskey-auth-..."
                className="w-full rounded-lg border border-white/10 bg-[#161922] px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Lista de convites */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Convites Criados
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : invites.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-slate-500">
                Nenhum convite ativo ainda.
              </div>
            ) : (
              invites.map((inv) => {
                const expired = Boolean(inv.expiresAt && Date.parse(inv.expiresAt) <= Date.now());
                const exhausted = inv.uses >= inv.maxUses;
                const unified = encodeUnifiedInvite({
                  serverUrl: publicServerUrl || currentServerUrl,
                  inviteCode: inv.code,
                  tailscaleAuthKey: tailscaleAuthKey || undefined,
                });

                return (
                  <div
                    key={inv.code}
                    className="flex flex-col gap-2 rounded-xl border border-white/8 bg-[#0f1117]/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-bold tracking-wider text-white">
                          {inv.code}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          Usos: {inv.uses}/{inv.maxUses}
                        </span>
                        {(expired || exhausted) && (
                          <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                            {exhausted ? 'Esgotado' : 'Expirado'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRevoke(inv.code)}
                        title="Revogar convite"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void copyText(`code-${inv.code}`, inv.code)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/10"
                      >
                        {copiedId === `code-${inv.code}` ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Copiar Código
                      </button>

                      <button
                        type="button"
                        onClick={() => void copyText(`uni-${inv.code}`, unified)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/25"
                      >
                        {copiedId === `uni-${inv.code}` ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Copiar Convite Unificado
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
