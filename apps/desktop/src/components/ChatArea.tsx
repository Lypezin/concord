import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Attachment, Channel, Message, UserPublic } from '@concord/shared';
import {
  ChevronUp,
  Crown,
  Download,
  FileText,
  Hash,
  Loader2,
  Paperclip,
  Pencil,
  SendHorizontal,
  Smile,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import type { ConcordApiClient } from '../lib/api.js';
import {
  formatDateDivider,
  formatFileSize,
  formatMessageTimestamp,
  formatShortTime,
  getDayKey,
} from '../lib/format.js';
import { openExternalUrl } from '../lib/storage.js';
import { Avatar } from './Avatar.js';

const QUICK_EMOJIS = ['👍', '😂', '🔥', '❤️', '👀'];
const PICKER_EMOJIS = [
  '😀', '😂', '🤣', '😍', '🥳', '😎', '🤔', '😭',
  '😡', '👍', '👎', '👏', '🙏', '🔥', '❤️', '💯',
  '👀', '🎉', '🎮', '🎧', '💀', '✅', '⚡', '🚀',
];
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface PendingUpload {
  localId: string;
  file: File;
  previewUrl?: string;
  status: 'uploading' | 'ready' | 'error';
  attachment?: Attachment;
  error?: string;
}

interface ChatAreaProps {
  api: ConcordApiClient;
  channel: Channel;
  currentUser: UserPublic;
  messages: Message[];
  hasMore: boolean;
  loadingMessages: boolean;
  loadingOlder: boolean;
  typingUsers: UserPublic[];
  showMembers?: boolean;
  onToggleMembers?: () => void;
  onLoadOlder: () => Promise<void>;
  onSendMessage: (content: string, attachmentIds: string[]) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onTypingSignal: (isTyping: boolean) => void;
}

function splitUrlTrailingPunctuation(rawUrl: string): { cleanUrl: string; trailing: string } {
  let cleanUrl = rawUrl;
  let trailing = '';
  while (cleanUrl.length > 0) {
    const last = cleanUrl[cleanUrl.length - 1]!;
    if (/[.,!?;:]/.test(last)) {
      cleanUrl = cleanUrl.slice(0, -1);
      trailing = last + trailing;
      continue;
    }
    if (last === ')') {
      const opens = (cleanUrl.match(/\(/g) ?? []).length;
      const closes = (cleanUrl.match(/\)/g) ?? []).length;
      if (closes > opens) {
        cleanUrl = cleanUrl.slice(0, -1);
        trailing = last + trailing;
        continue;
      }
    }
    break;
  }
  return { cleanUrl, trailing };
}

function renderFormattedText(text: string): ReactNode {
  const tokenRe =
    /(https?:\/\/[^\s<>"'`]+|`[^`\n]+`|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*[^*\n]+?\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    const token = match[0]!;
    if (token.startsWith('http://') || token.startsWith('https://')) {
      const { cleanUrl, trailing } = splitUrlTrailingPunctuation(token);
      if (cleanUrl) {
        nodes.push(
          <a
            key={key++}
            href={cleanUrl}
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl(cleanUrl);
            }}
            className="text-indigo-400 underline decoration-indigo-400/40 underline-offset-2 transition hover:text-indigo-300"
          >
            {cleanUrl}
          </a>,
        );
      }
      if (trailing) {
        nodes.push(<span key={key++}>{trailing}</span>);
      }
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="rounded-md border border-indigo-400/20 bg-indigo-500/12 px-1.5 py-0.5 font-mono text-[12.5px] text-indigo-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={key++} className="text-slate-400 line-through">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key++} className="italic text-slate-100">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(<span key={key++}>{token}</span>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

export function ChatArea({
  api,
  channel,
  currentUser,
  messages,
  hasMore,
  loadingMessages,
  loadingOlder,
  typingUsers,
  showMembers = true,
  onToggleMembers,
  onLoadOlder,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTypingSignal,
}: ChatAreaProps) {
  const [draft, setDraft] = useState('');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>(pendingUploads);
  const isNearBottomRef = useRef(true);
  const prevChannelIdRef = useRef<string | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const prependRestoreRef = useRef<number | null>(null);
  const lastTypingPingRef = useRef<number>(0);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  // Reset editing state when changing channels
  useEffect(() => {
    setEditingId(null);
    setComposerError(null);
    setShowEmojiPicker(false);
    isNearBottomRef.current = true;
    composerRef.current?.focus();
  }, [channel.id]);

  // Auto-resize composer textarea cleanly
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

  // Close emoji popover on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPopoverRef.current && !emojiPopoverRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker]);

  // Close image lightbox on Escape key
  useEffect(() => {
    if (!lightboxImage) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage]);

  // Cleanup object URLs on unmount without stale closure
  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  // Smart scroll management
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (prependRestoreRef.current !== null) {
      const diff = el.scrollHeight - prependRestoreRef.current;
      el.scrollTop = diff;
      prependRestoreRef.current = null;
      return;
    }

    const lastMsg = messages[messages.length - 1];
    const channelChanged = prevChannelIdRef.current !== channel.id;
    const newMessageAdded = lastMsg && prevLastMsgIdRef.current !== lastMsg.id;

    if (channelChanged) {
      el.scrollTop = el.scrollHeight;
    } else if (newMessageAdded) {
      if (isNearBottomRef.current || lastMsg.authorId === currentUser.id) {
        el.scrollTop = el.scrollHeight;
      }
    }

    prevChannelIdRef.current = channel.id;
    prevLastMsgIdRef.current = lastMsg?.id ?? null;
  }, [channel.id, messages, currentUser.id]);

  function handleScroll(): void {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
  }

  async function handleLoadOlderClick(): Promise<void> {
    const el = scrollContainerRef.current;
    if (el) {
      prependRestoreRef.current = el.scrollHeight;
    }
    await onLoadOlder();
  }

  async function queueFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const availableSlots = Math.max(0, 5 - pendingUploadsRef.current.length);
    if (availableSlots === 0) {
      setComposerError('Máximo de 5 anexos por mensagem.');
      return;
    }

    const chosen = fileArray.slice(0, availableSlots);
    setComposerError(null);

    for (const file of chosen) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      setPendingUploads((prev) => {
        const next = [...prev, { localId, file, previewUrl, status: 'uploading' as const }];
        pendingUploadsRef.current = next;
        return next;
      });

      try {
        const res = await api.uploadFile(file);
        setPendingUploads((prev) =>
          prev.map((item) =>
            item.localId === localId
              ? { ...item, status: 'ready', attachment: res.attachment }
              : item,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao enviar arquivo.';
        setPendingUploads((prev) =>
          prev.map((item) =>
            item.localId === localId ? { ...item, status: 'error', error: msg } : item,
          ),
        );
      }
    }
  }

  function removePendingUpload(localId: string): void {
    const target = pendingUploadsRef.current.find((i) => i.localId === localId);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    if (target?.status === 'ready' && target.attachment) {
      void api.deleteUpload(target.attachment.id).catch(() => undefined);
    }
    setPendingUploads((prev) => prev.filter((i) => i.localId !== localId));
  }

  function insertEmojiAtCursor(emoji: string): void {
    const el = composerRef.current;
    if (!el) {
      handleDraftChange(`${draft}${emoji}`);
      setShowEmojiPicker(false);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    handleDraftChange(next);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      void queueFiles(pastedFiles);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void queueFiles(e.dataTransfer.files);
    }
  }

  function handleDraftChange(next: string): void {
    setDraft(next);
    if (next.trim().length > 0) {
      const now = Date.now();
      if (now - lastTypingPingRef.current > 2400) {
        lastTypingPingRef.current = now;
        onTypingSignal(true);
      }
    } else {
      lastTypingPingRef.current = 0;
      onTypingSignal(false);
    }
  }

  async function submitMessage(): Promise<void> {
    if (sending) return;
    const stillUploading = pendingUploads.some((p) => p.status === 'uploading');
    if (stillUploading) {
      setComposerError('Aguarde o envio dos anexos terminar.');
      return;
    }

    const readyAttachments = pendingUploads
      .filter((p) => p.status === 'ready' && p.attachment)
      .map((p) => p.attachment!.id);

    if (draft.trim().length === 0 && readyAttachments.length === 0) {
      return;
    }

    setSending(true);
    setComposerError(null);

    try {
      await onSendMessage(draft.trim(), readyAttachments);
      for (const item of pendingUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setDraft('');
      setPendingUploads([]);
      lastTypingPingRef.current = 0;
      onTypingSignal(false);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitMessage();
    }
  }

  async function saveEdit(messageId: string): Promise<void> {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    try {
      await onEditMessage(messageId, trimmed);
      setEditingId(null);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Erro ao editar mensagem.');
    }
  }

  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]!.displayName} está digitando`
        : `${typingUsers.map((u) => u.displayName).join(', ')} estão digitando`;

  return (
    <section
      className="concord-island relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e121c]/95"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-indigo-500/[0.06] to-transparent" />

      {/* Overlay de Drag & Drop */}
      {isDragging && (
        <div className="animate-modal-in pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400/70 bg-indigo-950/80 backdrop-blur-md">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-400/30">
            <UploadCloud className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold text-white">
            Solte aqui para anexar em #{channel.name}
          </p>
          <p className="mt-1 text-xs text-indigo-200/80">Imagens e arquivos até 15 MB</p>
        </div>
      )}

      {/* Cabeçalho do Canal */}
      <div className="relative z-10 flex h-13 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0e121c]/85 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/20 to-violet-500/15 text-indigo-300 shadow-sm">
            <Hash className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold tracking-tight text-white">
              {channel.name}
            </h3>
            <p className="truncate text-[10.5px] text-slate-400">
              Chat em tempo real • Cole imagens com Ctrl+V
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[#080a10] px-2.5 py-1 text-[10.5px] text-slate-400 sm:flex">
            <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.2 font-mono text-[10px] text-slate-200">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.2 font-mono text-[10px] text-slate-200">
              V
            </kbd>
            <span>para colar prints</span>
          </div>

          {onToggleMembers && (
            <button
              type="button"
              onClick={onToggleMembers}
              title={showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros'}
              className={`hidden rounded-xl border p-2 transition lg:inline-flex ${
                showMembers
                  ? 'border-indigo-400/30 bg-indigo-500/15 text-indigo-200'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de Mensagens */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4 select-text"
      >
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {hasMore && (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleLoadOlderClick()}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-[#080a10] px-3.5 py-1.5 text-xs font-medium text-slate-300 shadow-sm transition hover:border-indigo-400/35 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                >
                  {loadingOlder ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                  Carregar mensagens anteriores
                </button>
              </div>
            )}

            {messages.length === 0 && (
              <div className="mx-auto my-8 max-w-md rounded-2xl border border-white/[0.07] bg-gradient-to-b from-indigo-500/[0.08] to-[#131826]/70 p-8 text-center shadow-xl">
                <div className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/20 text-indigo-200 shadow-[0_0_28px_rgba(99,102,241,0.28)]">
                  <Hash className="h-6 w-6" />
                </div>
                <h4 className="text-base font-bold tracking-tight text-white">
                  Bem-vindo a #{channel.name}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Este é o início do canal. Mande uma mensagem, use{' '}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-indigo-200">
                    **negrito**
                  </code>{' '}
                  ou cole uma captura de tela com Ctrl+V!
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const prev = idx > 0 ? messages[idx - 1]! : null;
              const isNewDay = !prev || getDayKey(prev.createdAt) !== getDayKey(msg.createdAt);
              const isGrouped =
                !isNewDay &&
                prev !== null &&
                prev.authorId === msg.authorId &&
                Date.parse(msg.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;

              const isAuthor = msg.authorId === currentUser.id;
              const canDelete = isAuthor || currentUser.role === 'admin';
              const isEditing = editingId === msg.id;

              return (
                <Fragment key={msg.id}>
                  {isNewDay && (
                    <div className="my-5 flex items-center gap-3 select-none">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.09] to-white/[0.09]" />
                      <span className="rounded-full border border-white/[0.08] bg-[#080a10] px-3 py-0.5 text-[10.5px] font-semibold tracking-wide text-slate-300 shadow-sm">
                        {formatDateDivider(msg.createdAt)}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/[0.09] to-white/[0.09]" />
                    </div>
                  )}

                  <div
                    className={`group relative flex gap-3 rounded-xl px-3 py-1 transition hover:bg-white/[0.03] ${
                      isGrouped ? 'mt-0' : 'mt-2.5 pt-1.5'
                    }`}
                  >
                    {/* Ações no Hover */}
                    {!isEditing && (
                      <div className="absolute -top-3.5 right-3 z-10 hidden items-center gap-0.5 rounded-xl border border-white/[0.1] bg-[#080a10]/95 p-0.5 shadow-xl backdrop-blur-md group-hover:flex">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => void onToggleReaction(msg.id, emoji)}
                            className="rounded-lg px-1.5 py-0.5 text-sm transition hover:scale-110 hover:bg-white/10"
                          >
                            {emoji}
                          </button>
                        ))}
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(msg.id);
                              setEditDraft(msg.content);
                            }}
                            title="Editar"
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => void onDeleteMessage(msg.id)}
                            title="Excluir"
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Coluna esquerda: Avatar ou Horário agrupado */}
                    <div className="w-9 shrink-0">
                      {isGrouped ? (
                        <span className="hidden pt-1 text-[10px] font-medium tabular-nums text-slate-500 group-hover:inline-block">
                          {formatShortTime(msg.createdAt)}
                        </span>
                      ) : (
                        <Avatar
                          displayName={msg.author.displayName}
                          color={msg.author.avatarColor}
                          size="md"
                          ringBg="border-[#0e121c]"
                        />
                      )}
                    </div>

                    {/* Conteúdo da Mensagem */}
                    <div className="min-w-0 flex-1">
                      {!isGrouped && (
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="text-sm font-bold tracking-tight text-white">
                            {msg.author.displayName}
                          </span>
                          {msg.author.role === 'admin' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-400/25 bg-amber-500/12 px-1.5 py-0.2 text-[9px] font-bold uppercase text-amber-300">
                              <Crown className="h-2.5 w-2.5" />
                              Admin
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500">
                            {formatMessageTimestamp(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="mt-1 space-y-1.5">
                          <textarea
                            autoFocus
                            rows={2}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void saveEdit(msg.id);
                              } else if (e.key === 'Escape') {
                                setEditingId(null);
                              }
                            }}
                            className="w-full resize-none rounded-xl border border-indigo-500/60 bg-[#080a10] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span>Enter para salvar • Esc para cancelar</span>
                            <button
                              type="button"
                              onClick={() => void saveEdit(msg.id)}
                              className="font-semibold text-indigo-400 hover:underline"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-slate-400 hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        msg.content && (
                          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-slate-200">
                            {renderFormattedText(msg.content)}
                            {msg.editedAt && (
                              <span className="ml-1.5 text-[10px] text-slate-500">(editada)</span>
                            )}
                          </p>
                        )
                      )}

                      {/* Anexos */}
                      {msg.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.attachments.map((att) => {
                            const fullUrl = api.resolveAssetUrl(att.url);
                            if (att.isImage) {
                              return (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() =>
                                    setLightboxImage({ url: fullUrl, name: att.originalName })
                                  }
                                  className="group/img relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[#080a10] shadow-lg transition hover:border-indigo-400/50 hover:shadow-indigo-500/15"
                                >
                                  <img
                                    src={fullUrl}
                                    alt={att.originalName}
                                    loading="lazy"
                                    onLoad={() => {
                                      const el = scrollContainerRef.current;
                                      if (el && isNearBottomRef.current) {
                                        el.scrollTop = el.scrollHeight;
                                      }
                                    }}
                                    className="max-h-72 max-w-sm object-contain transition duration-200 group-hover/img:scale-[1.015] group-hover/img:brightness-105"
                                  />
                                </button>
                              );
                            }

                            return (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => openExternalUrl(fullUrl)}
                                className="flex items-center gap-2.5 rounded-xl border border-white/[0.09] bg-[#080a10] px-3 py-2 text-left shadow-sm transition hover:border-indigo-500/45 hover:bg-white/[0.04]"
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 max-w-[200px]">
                                  <div className="truncate text-xs font-medium text-slate-200">
                                    {att.originalName}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {formatFileSize(att.size)}
                                  </div>
                                </div>
                                <Download className="h-4 w-4 shrink-0 text-slate-400" />
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Reações */}
                      {msg.reactions.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {msg.reactions.map((r) => {
                            const reactedByMe = r.userIds.includes(currentUser.id);
                            return (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() => void onToggleReaction(msg.id, r.emoji)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition ${
                                  reactedByMe
                                    ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 shadow-sm'
                                    : 'border-white/[0.08] bg-[#080a10]/85 text-slate-300 hover:border-white/20 hover:bg-white/[0.08]'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-mono text-[11px] font-semibold tabular-nums">
                                  {r.userIds.length}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Indicador de Digitando */}
      <div className="flex h-6 shrink-0 items-center px-4 text-[11px] text-slate-400">
        {typingText && (
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-indigo-400" />
              <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-indigo-400" />
            </span>
            <span>{typingText}...</span>
          </div>
        )}
      </div>

      {/* Área de Composição */}
      <div className="shrink-0 px-4 pb-3.5">
        {composerError && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
            <span>{composerError}</span>
            <button type="button" onClick={() => setComposerError(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pré-visualização de Anexos */}
        {pendingUploads.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-[#080a10]/90 p-2.5">
            {pendingUploads.map((item) => (
              <div
                key={item.localId}
                className="relative flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#131724] p-1.5 pr-7"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <FileText className="h-6 w-6 text-indigo-400" />
                )}
                <div className="max-w-[140px]">
                  <div className="truncate text-xs font-medium text-slate-200">
                    {item.file.name || 'imagem.png'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {item.status === 'uploading'
                      ? 'Enviando...'
                      : item.status === 'error'
                        ? item.error || 'Erro'
                        : formatFileSize(item.file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePendingUpload(item.localId)}
                  className="absolute right-1 top-1 rounded-md p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-[#080a10]/95 px-3 py-2.5 shadow-inner transition focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/15">
          {showEmojiPicker && (
            <div
              ref={emojiPopoverRef}
              className="animate-modal-in concord-glass absolute bottom-14 right-2 z-30 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-white/[0.1] bg-[#131724]/98 p-2.5 backdrop-blur-xl"
            >
              {PICKER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmojiAtCursor(emoji)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition hover:scale-110 hover:bg-white/10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                void queueFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo ou imagem"
            className="mb-0.5 rounded-xl border border-white/[0.06] bg-white/[0.04] p-1.5 text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={composerRef}
            rows={1}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              lastTypingPingRef.current = 0;
              onTypingSignal(false);
            }}
            placeholder={`Conversar em #${channel.name}...`}
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Inserir emoji"
            className={`mb-0.5 rounded-xl p-1.5 transition ${
              showEmojiPicker
                ? 'bg-indigo-500/25 text-indigo-200'
                : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <Smile className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void submitMessage()}
            disabled={
              sending ||
              (draft.trim().length === 0 &&
                !pendingUploads.some((p) => p.status === 'ready'))
            }
            title="Enviar (Enter)"
            className="mb-0.5 inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-35 disabled:shadow-none"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Lightbox de Imagem */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <div className="mb-3 flex w-full max-w-4xl items-center justify-between text-xs text-slate-300">
            <span className="truncate font-medium">{lightboxImage.name}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrl(lightboxImage.url);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 font-medium text-white transition hover:bg-white/20"
              >
                <Download className="h-3.5 w-3.5" />
                Abrir / Baixar
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                title="Fechar (Esc)"
                className="rounded-xl border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name}
            onClick={(e) => e.stopPropagation()}
            className="animate-modal-in max-h-[82vh] max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl"
          />
        </div>
      )}
    </section>
  );
}
