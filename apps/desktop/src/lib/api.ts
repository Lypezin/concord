import type {
  Attachment,
  AuthResponse,
  BootstrapStatus,
  Channel,
  ChannelType,
  InviteInfo,
  Message,
  MessagesPage,
  UserPublic,
  VoiceStatusResponse,
  VoiceTokenResponse,
} from '@concord/shared';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return 'http://127.0.0.1:3000';
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const url = `${normalizeServerUrl(baseUrl)}${path}`;
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      'Não foi possível conectar ao servidor. Verifique o endereço e se o Concord Server está aberto.',
    );
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new ApiError(res.status, errMsg);
  }

  return data as T;
}

export function createApiClient(baseUrl: string, token?: string) {
  const cleanUrl = normalizeServerUrl(baseUrl);

  return {
    baseUrl: cleanUrl,

    resolveAssetUrl(relativePath: string): string {
      if (/^https?:\/\//i.test(relativePath)) return relativePath;
      return `${cleanUrl}${relativePath}`;
    },

    getBootstrapStatus(): Promise<BootstrapStatus> {
      return requestJson<BootstrapStatus>(cleanUrl, '/api/bootstrap-status');
    },

    setupAdmin(body: {
      username: string;
      displayName: string;
      password: string;
    }): Promise<AuthResponse> {
      return requestJson<AuthResponse>(cleanUrl, '/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    register(body: {
      inviteCode: string;
      username: string;
      displayName: string;
      password: string;
    }): Promise<AuthResponse> {
      return requestJson<AuthResponse>(cleanUrl, '/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    login(body: { username: string; password: string }): Promise<AuthResponse> {
      return requestJson<AuthResponse>(cleanUrl, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    getMe(): Promise<{ user: UserPublic }> {
      return requestJson<{ user: UserPublic }>(cleanUrl, '/api/auth/me', {}, token);
    },

    getUsers(): Promise<{ users: UserPublic[] }> {
      return requestJson<{ users: UserPublic[] }>(cleanUrl, '/api/users', {}, token);
    },

    getInvites(): Promise<{ invites: InviteInfo[] }> {
      return requestJson<{ invites: InviteInfo[] }>(cleanUrl, '/api/invites', {}, token);
    },

    createInvite(body: {
      maxUses?: number;
      expiresInHours?: number | null;
    }): Promise<{ invite: InviteInfo }> {
      return requestJson<{ invite: InviteInfo }>(
        cleanUrl,
        '/api/invites',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      );
    },

    deleteInvite(code: string): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        cleanUrl,
        `/api/invites/${encodeURIComponent(code)}`,
        { method: 'DELETE' },
        token,
      );
    },

    getChannels(): Promise<{ channels: Channel[] }> {
      return requestJson<{ channels: Channel[] }>(cleanUrl, '/api/channels', {}, token);
    },

    createChannel(body: {
      name: string;
      type: Extract<ChannelType, 'text' | 'voice'>;
    }): Promise<{ channel: Channel }> {
      return requestJson<{ channel: Channel }>(
        cleanUrl,
        '/api/channels',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      );
    },

    updateChannel(id: string, body: { name: string }): Promise<{ channel: Channel }> {
      return requestJson<{ channel: Channel }>(
        cleanUrl,
        `/api/channels/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
        token,
      );
    },

    deleteChannel(id: string): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        cleanUrl,
        `/api/channels/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        token,
      );
    },

    getMessages(channelId: string, before?: string, limit = 50): Promise<MessagesPage> {
      const params = new URLSearchParams({ limit: String(limit) });
      if (before) params.set('before', before);
      return requestJson<MessagesPage>(
        cleanUrl,
        `/api/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
        {},
        token,
      );
    },

    sendMessage(
      channelId: string,
      body: { content: string; attachmentIds?: string[] },
    ): Promise<{ message: Message }> {
      return requestJson<{ message: Message }>(
        cleanUrl,
        `/api/channels/${encodeURIComponent(channelId)}/messages`,
        { method: 'POST', body: JSON.stringify(body) },
        token,
      );
    },

    editMessage(messageId: string, content: string): Promise<{ message: Message }> {
      return requestJson<{ message: Message }>(
        cleanUrl,
        `/api/messages/${encodeURIComponent(messageId)}`,
        { method: 'PATCH', body: JSON.stringify({ content }) },
        token,
      );
    },

    deleteMessage(messageId: string): Promise<{ ok: boolean }> {
      return requestJson<{ ok: boolean }>(
        cleanUrl,
        `/api/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' },
        token,
      );
    },

    toggleReaction(messageId: string, emoji: string): Promise<{ message: Message }> {
      return requestJson<{ message: Message }>(
        cleanUrl,
        `/api/messages/${encodeURIComponent(messageId)}/reactions`,
        { method: 'POST', body: JSON.stringify({ emoji }) },
        token,
      );
    },

    async uploadFile(file: File): Promise<{ attachment: Attachment }> {
      const form = new FormData();
      form.append('file', file, file.name || 'imagem.png');
      return requestJson<{ attachment: Attachment }>(
        cleanUrl,
        '/api/uploads',
        { method: 'POST', body: form },
        token,
      );
    },

    getVoiceStatus(): Promise<VoiceStatusResponse> {
      return requestJson<VoiceStatusResponse>(cleanUrl, '/api/voice/status', {}, token);
    },

    createVoiceToken(channelId: string): Promise<VoiceTokenResponse> {
      return requestJson<VoiceTokenResponse>(
        cleanUrl,
        '/api/voice/token',
        { method: 'POST', body: JSON.stringify({ channelId }) },
        token,
      );
    },
  };
}

export type ConcordApiClient = ReturnType<typeof createApiClient>;
