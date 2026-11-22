import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  decodeUnifiedInvite,
  encodeUnifiedInvite,
  type AuthResponse,
  type BootstrapStatus,
  type Channel,
  type ClientToServerEvents,
  type InviteInfo,
  type Message,
  type MessagesPage,
  type PresencePayload,
  type ServerToClientEvents,
  type UserPublic,
  type VoiceStatusResponse,
  type VoiceTokenResponse,
} from '@concord/shared';
import { createConcordServer } from './createServer.js';

// Minimal valid 1x1 PNG (67 bytes)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function waitForEvent<K extends keyof ServerToClientEvents>(
  socket: TestSocket,
  event: K,
  predicate: (...args: Parameters<ServerToClientEvents[K]>) => boolean = () => true,
  timeoutMs = 5000,
): Promise<Parameters<ServerToClientEvents[K]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`Timeout aguardando evento Socket.IO: ${String(event)}`));
    }, timeoutMs);

    const handler = (...args: Parameters<ServerToClientEvents[K]>) => {
      if (predicate(...args)) {
        clearTimeout(timer);
        socket.off(event, handler as never);
        resolve(args);
      }
    };

    socket.on(event, handler as never);
  });
}

async function apiJson<T>(
  baseUrl: string,
  route: string,
  options: RequestInit = {},
  token?: string,
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${baseUrl}${route}`, { ...options, headers });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function run(): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'concord-verify-'));
  const server = await createConcordServer({
    port: 0,
    host: '127.0.0.1',
    dataDir: tempDir,
    maxUsers: 4,
    serverName: 'Concord Teste',
    livekitPort: 37880,
    livekitTcpPort: 37881,
    livekitUdpPort: 37882,
    manageLiveKit: true,
  });

  const baseUrl = server.address;
  const sockets: TestSocket[] = [];

  try {
    // 1. Bootstrap inicial
    const boot1 = await apiJson<BootstrapStatus>(baseUrl, '/api/bootstrap-status');
    assert.equal(boot1.status, 200);
    assert.equal(boot1.data.needsAdminSetup, true);
    assert.equal(boot1.data.userCount, 0);
    assert.equal(boot1.data.maxUsers, 4);

    // 2. Setup admin & bloqueio de segundo setup
    const setupRes = await apiJson<AuthResponse>(baseUrl, '/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({
        username: 'luiz',
        displayName: 'Luiz',
        password: 'password123',
      }),
    });
    assert.equal(setupRes.status, 201);
    assert.equal(setupRes.data.user.role, 'admin');
    const adminToken = setupRes.data.token;
    const adminId = setupRes.data.user.id;

    const setupAgain = await apiJson<{ error: string }>(baseUrl, '/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({
        username: 'outro',
        displayName: 'Outro',
        password: 'password123',
      }),
    });
    assert.equal(setupAgain.status, 403);

    // 3. Autenticacao /api/auth/me
    const unauthMe = await apiJson<{ error: string }>(baseUrl, '/api/auth/me');
    assert.equal(unauthMe.status, 401);
    const authMe = await apiJson<{ user: UserPublic }>(baseUrl, '/api/auth/me', {}, adminToken);
    assert.equal(authMe.status, 200);
    assert.equal(authMe.data.user.id, adminId);

    // 4. Criar convite + codificacao/decodificacao unificada
    const invRes = await apiJson<{ invite: InviteInfo }>(
      baseUrl,
      '/api/invites',
      { method: 'POST', body: JSON.stringify({ maxUses: 4, expiresInHours: 24 }) },
      adminToken,
    );
    assert.equal(invRes.status, 201);
    const inviteCode = invRes.data.invite.code;

    const unified = encodeUnifiedInvite({
      serverUrl: baseUrl,
      inviteCode,
      tailscaleAuthKey: 'tskey-auth-exemplo',
    });
    const decoded = decodeUnifiedInvite(unified);
    assert.deepEqual(decoded, {
      serverUrl: baseUrl,
      inviteCode,
      tailscaleAuthKey: 'tskey-auth-exemplo',
    });

    // 5. Socket 1 (admin) conecta e recebe presence:update
    const sock1: TestSocket = ioClient(baseUrl, {
      auth: { token: adminToken },
      transports: ['websocket'],
    });
    sockets.push(sock1);
    const [initialPresence] = await waitForEvent(
      sock1,
      'presence:update',
      (p: PresencePayload) => p.onlineUserIds.includes(adminId),
    );
    assert.ok(initialPresence.onlineUserIds.includes(adminId));

    // 6. Cadastro com convite invalido vs valido + evento user:joined
    const badReg = await apiJson<{ error: string }>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        inviteCode: 'INVALIDO',
        username: 'amigo1',
        displayName: 'Amigo 1',
        password: 'password123',
      }),
    });
    assert.equal(badReg.status, 400);

    const joinedPromise = waitForEvent(sock1, 'user:joined', (u) => u.username === 'amigo1');
    const reg1 = await apiJson<AuthResponse>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        inviteCode,
        username: 'amigo1',
        displayName: 'Amigo Um',
        password: 'password123',
      }),
    });
    assert.equal(reg1.status, 201);
    const [joinedUser] = await joinedPromise;
    assert.equal(joinedUser.displayName, 'Amigo Um');
    const friend1Token = reg1.data.token;
    const friend1Id = reg1.data.user.id;

    // Member nao pode criar convite
    const memberInv = await apiJson<{ error: string }>(
      baseUrl,
      '/api/invites',
      { method: 'POST', body: JSON.stringify({ maxUses: 1 }) },
      friend1Token,
    );
    assert.equal(memberInv.status, 403);

    // 7. Preencher limite maxUsers (4) e bloquear o 5o usuario
    const reg2 = await apiJson<AuthResponse>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        inviteCode,
        username: 'amigo2',
        displayName: 'Amigo Dois',
        password: 'password123',
      }),
    });
    assert.equal(reg2.status, 201);

    const reg3 = await apiJson<AuthResponse>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        inviteCode,
        username: 'amigo3',
        displayName: 'Amigo Tres',
        password: 'password123',
      }),
    });
    assert.equal(reg3.status, 201);

    const reg4Blocked = await apiJson<{ error: string }>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        inviteCode,
        username: 'amigo4',
        displayName: 'Excedente',
        password: 'password123',
      }),
    });
    assert.equal(reg4Blocked.status, 403);

    // 8. Socket 2 (friend1) conecta e presence mostra ambos online
    const sock2: TestSocket = ioClient(baseUrl, {
      auth: { token: friend1Token },
      transports: ['websocket'],
    });
    sockets.push(sock2);
    const [bothPresence] = await waitForEvent(
      sock1,
      'presence:update',
      (p) => p.onlineUserIds.includes(adminId) && p.onlineUserIds.includes(friend1Id),
    );
    assert.equal(bothPresence.onlineUserIds.length, 2);

    // 9. CRUD de canais + broadcasts
    const channelsRes = await apiJson<{ channels: Channel[] }>(
      baseUrl,
      '/api/channels',
      {},
      adminToken,
    );
    assert.equal(channelsRes.status, 200);
    const textChannel = channelsRes.data.channels.find((c) => c.type === 'text')!;
    assert.ok(textChannel);

    const chCreateEv = waitForEvent(sock2, 'channel:created', (c) => c.name === 'clipes');
    const createdCh = await apiJson<{ channel: Channel }>(
      baseUrl,
      '/api/channels',
      { method: 'POST', body: JSON.stringify({ name: 'clipes', type: 'text' }) },
      adminToken,
    );
    assert.equal(createdCh.status, 201);
    const [newCh] = await chCreateEv;
    assert.equal(newCh.name, 'clipes');

    const chUpdEv = waitForEvent(sock2, 'channel:updated', (c) => c.id === newCh.id);
    const updCh = await apiJson<{ channel: Channel }>(
      baseUrl,
      `/api/channels/${newCh.id}`,
      { method: 'PATCH', body: JSON.stringify({ name: 'clipes-top' }) },
      adminToken,
    );
    assert.equal(updCh.status, 200);
    const [renamedCh] = await chUpdEv;
    assert.equal(renamedCh.name, 'clipes-top');

    const chDelEv = waitForEvent(sock2, 'channel:deleted', (p) => p.channelId === newCh.id);
    const delCh = await apiJson<{ ok: boolean }>(
      baseUrl,
      `/api/channels/${newCh.id}`,
      { method: 'DELETE' },
      adminToken,
    );
    assert.equal(delCh.status, 200);
    await chDelEv;

    // 10. Upload PNG + download + protecao path traversal
    const form = new FormData();
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'print.png');
    const uploadRes = await apiJson<{
      attachment: { id: string; filename: string; url: string; isImage: boolean };
    }>(baseUrl, '/api/uploads', { method: 'POST', body: form }, adminToken);
    assert.equal(uploadRes.status, 201);
    assert.equal(uploadRes.data.attachment.isImage, true);

    const assetRes = await fetch(`${baseUrl}${uploadRes.data.attachment.url}`);
    assert.equal(assetRes.status, 200);
    assert.equal(assetRes.headers.get('content-type'), 'image/png');
    assert.equal(assetRes.headers.get('x-content-type-options'), 'nosniff');
    const downloadedBytes = Buffer.from(await assetRes.arrayBuffer());
    assert.deepEqual(downloadedBytes, TINY_PNG);

    const traversalRes = await fetch(`${baseUrl}/api/uploads/..%2Fconcord.db`);
    assert.equal(traversalRes.status, 400);

    // 11. Mensagem com anexo -> entregue via Socket.IO
    const msgNewEv = waitForEvent(sock2, 'message:new', (m) => m.content === 'Olha esse print');
    const msgRes = await apiJson<{ message: Message }>(
      baseUrl,
      `/api/channels/${textChannel.id}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: 'Olha esse print',
          attachmentIds: [uploadRes.data.attachment.id],
        }),
      },
      adminToken,
    );
    assert.equal(msgRes.status, 201);
    const [receivedMsg] = await msgNewEv;
    assert.equal(receivedMsg.attachments.length, 1);
    assert.equal(receivedMsg.author.username, 'luiz');

    // 12. Edicao pelo autor + bloqueio por outro usuario
    const forbiddenEdit = await apiJson<{ error: string }>(
      baseUrl,
      `/api/messages/${receivedMsg.id}`,
      { method: 'PATCH', body: JSON.stringify({ content: 'hack' }) },
      friend1Token,
    );
    assert.equal(forbiddenEdit.status, 403);

    const msgUpdEv = waitForEvent(sock2, 'message:updated', (m) => m.id === receivedMsg.id);
    const editRes = await apiJson<{ message: Message }>(
      baseUrl,
      `/api/messages/${receivedMsg.id}`,
      { method: 'PATCH', body: JSON.stringify({ content: 'Print atualizado' }) },
      adminToken,
    );
    assert.equal(editRes.status, 200);
    const [editedMsg] = await msgUpdEv;
    assert.equal(editedMsg.content, 'Print atualizado');
    assert.ok(editedMsg.editedAt);

    // 13. Reacoes toggle
    const reactAddEv = waitForEvent(
      sock2,
      'message:updated',
      (m) => m.id === receivedMsg.id && m.reactions.some((r) => r.emoji === '🔥'),
    );
    await apiJson<{ message: Message }>(
      baseUrl,
      `/api/messages/${receivedMsg.id}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji: '🔥' }) },
      friend1Token,
    );
    await reactAddEv;

    const reactRemoveEv = waitForEvent(
      sock2,
      'message:updated',
      (m) => m.id === receivedMsg.id && m.reactions.length === 0,
    );
    await apiJson<{ message: Message }>(
      baseUrl,
      `/api/messages/${receivedMsg.id}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji: '🔥' }) },
      friend1Token,
    );
    await reactRemoveEv;

    // 14. Indicador de digitando
    const typingStartEv = waitForEvent(
      sock2,
      'typing:update',
      (p) => p.channelId === textChannel.id && p.userIds.includes(adminId),
    );
    sock1.emit('typing:start', { channelId: textChannel.id });
    await typingStartEv;

    const typingStopEv = waitForEvent(
      sock2,
      'typing:update',
      (p) => p.channelId === textChannel.id && p.userIds.length === 0,
    );
    sock1.emit('typing:stop', { channelId: textChannel.id });
    await typingStopEv;

    // 15. Exclusao de mensagem + limpeza do anexo no disco
    const msgDelEv = waitForEvent(sock2, 'message:deleted', (p) => p.messageId === receivedMsg.id);
    const delMsgRes = await apiJson<{ ok: boolean }>(
      baseUrl,
      `/api/messages/${receivedMsg.id}`,
      { method: 'DELETE' },
      adminToken,
    );
    assert.equal(delMsgRes.status, 200);
    await msgDelEv;

    const storedUploadPath = path.join(server.config.uploadsDir, uploadRes.data.attachment.filename);
    await assert.rejects(fs.access(storedUploadPath));

    // 16. Paginacao por cursor
    for (const label of ['m1', 'm2', 'm3']) {
      await apiJson(
        baseUrl,
        `/api/channels/${textChannel.id}/messages`,
        { method: 'POST', body: JSON.stringify({ content: label }) },
        adminToken,
      );
    }
    const page1 = await apiJson<MessagesPage>(
      baseUrl,
      `/api/channels/${textChannel.id}/messages?limit=2`,
      {},
      adminToken,
    );
    assert.equal(page1.data.hasMore, true);
    assert.deepEqual(
      page1.data.messages.map((m) => m.content),
      ['m2', 'm3'],
    );

    const page2 = await apiJson<MessagesPage>(
      baseUrl,
      `/api/channels/${textChannel.id}/messages?before=${page1.data.messages[0]!.id}&limit=2`,
      {},
      adminToken,
    );
    assert.equal(page2.data.hasMore, false);
    assert.deepEqual(
      page2.data.messages.map((m) => m.content),
      ['m1'],
    );

    // 17. LiveKit nativo + rotas de voz + voice:state via Socket.IO
    const voiceChannel = channelsRes.data.channels.find((c) => c.type === 'voice')!;
    assert.ok(voiceChannel);

    const voiceStatus = await apiJson<VoiceStatusResponse>(
      baseUrl,
      '/api/voice/status',
      {},
      adminToken,
    );
    assert.equal(voiceStatus.status, 200);
    assert.equal(voiceStatus.data.available, true);
    assert.equal(voiceStatus.data.livekitPort, 37880);

    const tokenForText = await apiJson<{ error: string }>(
      baseUrl,
      '/api/voice/token',
      { method: 'POST', body: JSON.stringify({ channelId: textChannel.id }) },
      adminToken,
    );
    assert.equal(tokenForText.status, 404);

    const tokenRes = await apiJson<VoiceTokenResponse>(
      baseUrl,
      '/api/voice/token',
      { method: 'POST', body: JSON.stringify({ channelId: voiceChannel.id }) },
      adminToken,
    );
    assert.equal(tokenRes.status, 200);
    assert.equal(tokenRes.data.roomName, voiceChannel.id);
    assert.ok(tokenRes.data.url.endsWith(':37880'));
    assert.ok(tokenRes.data.token.split('.').length === 3);

    const voiceJoinEv = waitForEvent(
      sock2,
      'presence:update',
      (p) =>
        Boolean(p.voiceParticipants[voiceChannel.id]?.includes(adminId)) &&
        p.voiceStates[adminId]?.screenSharing === true,
    );
    sock1.emit('voice:state', {
      channelId: voiceChannel.id,
      muted: true,
      deafened: false,
      screenSharing: true,
    });
    const [voicePresence] = await voiceJoinEv;
    assert.equal(voicePresence.voiceStates[adminId]?.muted, true);

    const voiceLeaveEv = waitForEvent(
      sock2,
      'presence:update',
      (p) => !(p.voiceParticipants[voiceChannel.id]?.includes(adminId) ?? false),
    );
    sock1.emit('voice:state', {
      channelId: null,
      muted: false,
      deafened: false,
      screenSharing: false,
    });
    await voiceLeaveEv;

    console.log('✅ Todos os testes de integração do Concord Server passaram com sucesso!');
  } finally {
    for (const sock of sockets) {
      sock.disconnect();
    }
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('❌ Falha nos testes de integração:', err);
  process.exit(1);
});
