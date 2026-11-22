import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type { Attachment, Channel, Message, UserPublic } from '@concord/shared';
import {
  ChevronUp,
  Download,
  FileText,
  Hash,
  Loader2,
  Paperclip,
  Pencil,
  SendHorizontal,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { ConcordApiClient } from '../lib/api.js';
import { formatFileSize, formatMessageTimestamp, formatShortTime } from '../lib/format.js';
import { openExternalUrl } from '../lib/storage.js';
import { Avatar } from './Avatar.js';

const QUICK_EMOJIS = ['👍', '😂', '🔥', '❤️', '👀'];
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
  onLoadOlder: () => Promise<void>;
  onSendMessage: (content: string, attachmentIds: string[]) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onTypingSignal: (isTyping: boolean) => void;
}

function renderLinkifiedText(text: string) {
  const regex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(regex);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          onClick={(e) => {
            e.preventDefault();
            openExternalUrl(part);
          }}
          className="text-indigo-400 underline decoration-indigo-400/40 underline-offset-2 hover:text-indigo-300"
        >
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
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

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const isNearBottomRef = useRef(true);
  const prevChannelIdRef = useRef<string | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const prependRestoreRef = useRef<number | null>(null);
  const lastTypingPingRef = useRef<number>(0);

  // Reset editing state when changing channels
  useEffect(() => {
    setEditingId(null);
    setComposerError(null);
    isNearBottomRef.current = true;
    composerRef.current?.focus();
  }, [channel.id]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      for (const item of pendingUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const availableSlots = Math.max(0, 5 - pendingUploads.length);
    if (availableSlots === 0) {
      setComposerError('Máximo de 5 anexos por mensagem.');
      return;
    }

    const chosen = fileArray.slice(0, availableSlots);
    setComposerError(null);

    for (const file of chosen) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      setPendingUploads((prev) => [
        ...prev,
        { localId, file, previewUrl, status: 'uploading' },
      ]);

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
    setPendingUploads((prev) => {
      const target = prev.find((i) => i.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.localId !== localId);
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
        ? `${typingUsers[0]!.displayName} está digitando...`
        : `${typingUsers.map((u) => u.displayName).join(', ')} estão digitando...`;

  return (
    <section
      className="relative flex min-w-0 flex-1 flex-col bg-[#161922]"
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
      {/* Overlay de Drag & Drop */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-950/70 backdrop-blur-xs">
          <UploadCloud className="mb-2 h-10 w-10 text-indigo-300" />
          <p className="text-sm font-semibold text-white">
            Solte aqui para anexar em #{channel.name}
          </p>
        </div>
      )}

      {/* Cabeçalho do Canal */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/6 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Hash className="h-4 w-4 shrink-0 text-indigo-400" />
          <h3 className="truncate text-sm font-semibold text-white">{channel.name}</h3>
        </div>
        <span className="text-[11px] text-slate-500">Ctrl+V cola prints direto no chat</span>
      </div>

      {/* Lista de Mensagens */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 select-text"
      >
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {hasMore && (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleLoadOlderClick()}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0f1117] px-3.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
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
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
                  <Hash className="h-6 w-6" />
                </div>
                <h4 className="text-base font-semibold text-white">
                  Bem-vindo a #{channel.name}
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  Este é o início do canal. Mande um salve ou cole uma imagem!
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const prev = idx > 0 ? messages[idx - 1]! : null;
              const isGrouped =
                prev !== null &&
                prev.authorId === msg.authorId &&
                Date.parse(msg.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;

              const isAuthor = msg.authorId === currentUser.id;
              const canDelete = isAuthor || currentUser.role === 'admin';
              const isEditing = editingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`group relative flex gap-3 rounded-lg px-2 py-1 transition hover:bg-white/[0.03] ${
                    isGrouped ? 'mt-0' : 'mt-3 pt-1.5'
                  }`}
                >
                  {/* Ações no Hover */}
                  {!isEditing && (
                    <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-lg border border-white/10 bg-[#0f1117] p-0.5 shadow-lg group-hover:flex">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void onToggleReaction(msg.id, emoji)}
                          className="rounded px-1.5 py-0.5 text-sm transition hover:bg-white/10"
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
                          className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void onDeleteMessage(msg.id)}
                          title="Excluir"
                          className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Coluna esquerda: Avatar ou Horário agrupado */}
                  <div className="w-9 shrink-0">
                    {isGrouped ? (
                      <span className="hidden pt-0.5 text-[10px] text-slate-500 group-hover:inline-block">
                        {formatShortTime(msg.createdAt)}
                      </span>
                    ) : (
                      <Avatar
                        displayName={msg.author.displayName}
                        color={msg.author.avatarColor}
                        size="md"
                      />
                    )}
                  </div>

                  {/* Conteúdo da Mensagem */}
                  <div className="min-w-0 flex-1">
                    {!isGrouped && (
                      <div className="mb-0.5 flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">
                          {msg.author.displayName}
                        </span>
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
                          className="w-full resize-none rounded-lg border border-indigo-500/60 bg-[#0f1117] px-3 py-2 text-sm text-slate-100 focus:outline-none"
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
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
                          {renderLinkifiedText(msg.content)}
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
                                className="overflow-hidden rounded-xl border border-white/10 bg-[#0f1117] transition hover:border-indigo-400/50"
                              >
                                <img
                                  src={fullUrl}
                                  alt={att.originalName}
                                  loading="lazy"
                                  className="max-h-72 max-w-sm object-contain"
                                />
                              </button>
                            );
                          }

                          return (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => openExternalUrl(fullUrl)}
                              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0f1117] px-3 py-2 text-left transition hover:border-indigo-500/40 hover:bg-white/5"
                            >
                              <FileText className="h-5 w-5 shrink-0 text-indigo-400" />
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
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {msg.reactions.map((r) => {
                          const reactedByMe = r.userIds.includes(currentUser.id);
                          return (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => void onToggleReaction(msg.id, r.emoji)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                                reactedByMe
                                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                                  : 'border-white/10 bg-[#0f1117]/80 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[11px] font-medium">{r.userIds.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Indicador de Digitando */}
      <div className="flex h-5 shrink-0 items-center px-4 text-[11px] text-slate-400">
        {typingText && <span className="animate-pulse">{typingText}</span>}
      </div>

      {/* Área de Composição */}
      <div className="shrink-0 px-4 pb-4">
        {composerError && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
            <span>{composerError}</span>
            <button type="button" onClick={() => setComposerError(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pré-visualização de Anexos */}
        {pendingUploads.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-white/8 bg-[#0f1117]/90 p-2.5">
            {pendingUploads.map((item) => (
              <div
                key={item.localId}
                className="relative flex items-center gap-2 rounded-lg border border-white/10 bg-[#161922] p-1.5 pr-7"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-12 w-12 rounded object-cover"
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
                  className="absolute right-1 top-1 rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#0f1117] px-3 py-2 focus-within:border-indigo-500/60">
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
            className="mb-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/8 hover:text-white"
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
            placeholder={`Conversar em #${channel.name}`}
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => void submitMessage()}
            disabled={
              sending ||
              (draft.trim().length === 0 &&
                !pendingUploads.some((p) => p.status === 'ready'))
            }
            title="Enviar (Enter)"
            className="mb-0.5 rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-500 disabled:opacity-40"
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6 backdrop-blur-xs"
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
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/20"
              >
                <Download className="h-3.5 w-3.5" />
                Abrir / Baixar
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
          />
        </div>
      )}
    </section>
  );
}
