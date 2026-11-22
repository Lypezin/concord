export interface UnifiedInvitePayload {
  serverUrl: string;
  inviteCode: string;
  tailscaleAuthKey?: string;
}

const PREFIX = 'CONCORD-';

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUtf8(b64url: string): string {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Codifica endereço do servidor, código de convite e (opcionalmente) chave Tailscale
 * em um único token amigável para copiar e colar.
 */
export function encodeUnifiedInvite(payload: UnifiedInvitePayload): string {
  const clean: UnifiedInvitePayload = {
    serverUrl: payload.serverUrl.trim().replace(/\/+$/, ''),
    inviteCode: payload.inviteCode.trim().toUpperCase(),
  };
  if (payload.tailscaleAuthKey && payload.tailscaleAuthKey.trim().length > 0) {
    clean.tailscaleAuthKey = payload.tailscaleAuthKey.trim();
  }
  return `${PREFIX}${utf8ToBase64Url(JSON.stringify(clean))}`;
}

/**
 * Decodifica um convite unificado "CONCORD-..." retornando null se for inválido.
 */
export function decodeUnifiedInvite(raw: string): UnifiedInvitePayload | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return null;
  }
  const encoded = trimmed.slice(PREFIX.length);
  if (!encoded) {
    return null;
  }
  try {
    const json = base64UrlToUtf8(encoded);
    const parsed = JSON.parse(json) as Partial<UnifiedInvitePayload>;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.serverUrl !== 'string' ||
      typeof parsed.inviteCode !== 'string'
    ) {
      return null;
    }
    const serverUrl = parsed.serverUrl.trim().replace(/\/+$/, '');
    const inviteCode = parsed.inviteCode.trim();
    if (!serverUrl || !inviteCode) {
      return null;
    }
    const parsedUrl = new URL(serverUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    const result: UnifiedInvitePayload = { serverUrl, inviteCode };
    if (typeof parsed.tailscaleAuthKey === 'string' && parsed.tailscaleAuthKey.trim().length > 0) {
      result.tailscaleAuthKey = parsed.tailscaleAuthKey.trim();
    }
    return result;
  } catch {
    return null;
  }
}
