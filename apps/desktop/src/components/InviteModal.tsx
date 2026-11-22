import { useEffect, useState } from 'react';
import { encodeUnifiedInvite, type InviteInfo } from '@concord/shared';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from 'lucide-react';
import type { ConcordApiClient } from '../lib/api.js';
import { ModalDialog } from './ui/Dialog.js';
import { Select } from './ui/Select.js';

interface InviteModalProps {
  api: ConcordApiClient;
  currentServerUrl: string;
  onClose: () => void;
}

function isLocalServerUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return /127\.0\.0\.1|localhost/i.test(raw);
  }
}

function buildTailscaleServerUrl(currentRaw: string, ip: string): string {
  try {
    const parsed = new URL(currentRaw);
    const portPart = parsed.port ? `:${parsed.port}` : ':3000';
    return `${parsed.protocol}//${ip}${portPart}`;
  } catch {
    return `http://${ip}:3000`;
  }
}

const MAX_USES_OPTIONS = [
  { value: '1', label: '1 uso' },
  { value: '2', label: '2 usos' },
  { value: '3', label: '3 usos' },
];

const EXPIRY_OPTIONS = [
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: 'never', label: 'Sem expiração' },
];

export function InviteModal({ api, currentServerUrl, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxUses, setMaxUses] = useState<string>('1');
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
            setPublicServerUrl((prev) =>
              isLocalServerUrl(prev) ? buildTailscaleServerUrl(prev, st.selfIp!) : prev,
            );
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
      const res = await api.createInvite({ maxUses: Number(maxUses) || 1, expiresInHours });
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

  const showLocalUrlWarning = isLocalServerUrl(publicServerUrl);

  return (
    <ModalDialog
      onClose={onClose}
      title="Convites do Servidor"
      icon={<KeyRound className="h-4 w-4" />}
      maxWidthClass="max-w-lg"
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Gerar novo convite */}
        <div className="space-y-3 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Gerar Novo Convite
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Máximo de usos</label>
              <Select
                value={maxUses}
                onValueChange={setMaxUses}
                options={MAX_USES_OPTIONS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Validade</label>
              <Select
                value={expiryOption}
                onValueChange={(val) => setExpiryOption(val as '24h' | '7d' | 'never')}
                options={EXPIRY_OPTIONS}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5865f2] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Criar Código de Convite
          </button>
        </div>

        {/* Parâmetros opcionais para convite unificado */}
        <div className="space-y-2.5 rounded-lg border border-white/[0.07] bg-[#101013] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Opções do Convite Unificado (CONCORD-...)
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[11px] text-zinc-400">
                Endereço do servidor para os convidados (IP Tailscale)
              </label>
              {tailscaleIp && (
                <button
                  type="button"
                  onClick={() =>
                    setPublicServerUrl(buildTailscaleServerUrl(publicServerUrl, tailscaleIp))
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-[#202027] px-2 py-0.5 text-[10px] font-medium text-zinc-200 transition hover:bg-[#292932]"
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
              className="w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-200 transition focus:border-white/[0.22] focus:outline-none"
            />
            {showLocalUrlWarning && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>
                  Atenção: endereço local só funciona no seu PC — use o IP Tailscale para amigos.
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-zinc-400">
              Tailscale Auth Key (opcional)
            </label>
            <input
              type="password"
              value={tailscaleAuthKey}
              onChange={(e) => setTailscaleAuthKey(e.target.value)}
              placeholder="tskey-auth-..."
              className="w-full rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-200 placeholder:font-sans placeholder:text-zinc-600 transition focus:border-white/[0.22] focus:outline-none"
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
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Convites Ativos
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 py-6 text-center text-xs text-zinc-500">
              Nenhum convite ativo.
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
                  className="flex flex-col gap-2.5 rounded-lg border border-white/[0.07] bg-[#101013] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-bold tracking-wider text-white">
                        {inv.code}
                      </span>
                      <span className="ml-2 text-xs text-zinc-400">
                        Usos: {inv.uses}/{inv.maxUses}
                      </span>
                      {(expired || exhausted) && (
                        <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                          {exhausted ? 'Esgotado' : 'Expirado'}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(inv.code)}
                      title="Revogar convite"
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(`code-${inv.code}`, inv.code)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1c1c22] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:bg-[#25252d]"
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#5865f2] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#4752c4]"
                    >
                      {copiedId === `uni-${inv.code}` ? (
                        <Check className="h-3 w-3 text-white" />
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
    </ModalDialog>
  );
}
