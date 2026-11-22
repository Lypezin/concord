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
  ArrowDown,
  Check,
  ChevronUp,
  Copy,
  CornerDownRight,
  Download,
  FileText,
  Hash,
  Loader2,
  Paperclip,
  Pencil,
  Reply,
  Search,
  SendHorizontal,
  Smile,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/ContextMenu.js';
import { Popover, PopoverContent, PopoverTrigger } from './ui/Popover.js';
import { ActionTooltip } from './ui/Tooltip.js';

const QUICK_EMOJIS = ['👍', '😂', '🔥', '❤️', '👀'];

const EMOJI_CATEGORIES: Array<{ id: string; label: string; emojis: string[] }> = [
  {
    id: 'top',
    label: 'Populares',
    emojis: [
      '😀', '😂', '🤣', '😍', '🥳', '😎', '🤔', '😭',
      '😡', '🤯', '🥶', '🤡', '👍', '👎', '👏', '🙏',
      '🔥', '❤️', '💯', '👀', '🎉', '💀', '✅', '🚀',
    ],
  },
  {
    id: 'faces',
    label: 'Rostos',
    emojis: [
      '😁', '😅', '😉', '😊', '😋', '😜', '🤪', '🤨',
      '🧐', '😏', '😒', '🙄', '😬', '😮‍💨', '😴', '🤤',
      '🤮', '🤧', '🥵', '😱', '😨', '😥', '😓', '🤗',
    ],
  },
  {
    id: 'games',
    label: 'Jogos & Tech',
    emojis: [
      '🎮', '🕹️', '🎧', '🎤', '💻', '🖥️', '⌨️', '🖱️',
      '🏆', '🥇', '🎯', '⚔️', '🛡️', '💣', '⚡', '🔋',
      '📡', '🎬', '🎵', '🔊', '📸', '📱', '🕹', '👾',
    ],
  },
  {
    id: 'symbols',
    label: 'Gestos & Símbolos',
    emojis: [
      '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '💪', '🫡',
      '🤝', '🫶', '🙌', '🤦', '🤷', '❌', '⚠️', '❓',
      '❗', '💬', '📌', '⭐', '💎', '👑', '🍻', '☕',
    ],
  },
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
  onSendMessage: (
    content: string,
    attachmentIds: string[],
    replyToId?: string | null,
  ) => Promise<void>;
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

function renderInlineText(text: string, keyPrefix: string): ReactNode {
  const tokenRe =
    /(https?:\/\/[^\s<>"'`]+|`[^`\n]+`|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*[^*\n]+?\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`${keyPrefix}-${key++}`}>{text.slice(lastIndex, match.index)}</span>);
    }

    const token = match[0]!;
    if (token.startsWith('http://') || token.startsWith('https://')) {
      const { cleanUrl, trailing } = splitUrlTrailingPunctuation(token);
      if (cleanUrl) {
        nodes.push(
          <a
            key={`${keyPrefix}-${key++}`}
            href={cleanUrl}
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl(cleanUrl);
            }}
            className="text-[#7983f5] underline decoration-[#7983f5]/40 underline-offset-2 transition hover:text-[#a5acf8]"
          >
            {cleanUrl}
          </a>,
        );
      }
      if (trailing) {
        nodes.push(<span key={`${keyPrefix}-${key++}`}>{trailing}</span>);
      }
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-${key++}`}
          className="rounded border border-white/[0.08] bg-[#0c0c0e] px-1.5 py-0.5 font-mono text-[12.5px] text-zinc-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-${key++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={`${keyPrefix}-${key++}`} className="text-zinc-500 line-through">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={`${keyPrefix}-${key++}`} className="italic text-zinc-100">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(<span key={`${keyPrefix}-${key++}`}>{token}</span>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`${keyPrefix}-${key++}`}>{text.slice(lastIndex)}</span>);
  }
  return nodes;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#121216] px-3 py-1 text-[10px] text-zinc-400">
        <span className="font-mono uppercase">{lang || 'código'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span>Copiado</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderFormattedMessage(text: string): ReactNode {
  const fenceRe = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(
        <span key={`txt-${idx++}`} className="whitespace-pre-wrap break-words">
          {renderInlineText(before, `in-${idx}`)}
        </span>,
      );
    }
    const lang = match[1] ?? '';
    const code = (match[2] ?? '').replace(/\n$/, '');
    parts.push(<CodeBlock key={`code-${idx++}`} lang={lang} code={code} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`txt-${idx++}`} className="whitespace-pre-wrap break-words">
        {renderInlineText(text.slice(lastIndex), `in-${idx}`)}
      </span>,
    );
  }

  return parts;
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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(EMOJI_CATEGORIES[0]!.id);

  // Busca no histórico do canal
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>(pendingUploads);
  const isNearBottomRef = useRef(true);
  const prevChannelIdRef = useRef<string | null>(null);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const prependRestoreRef = useRef<number | null>(null);
  const lastTypingPingRef = useRef<number>(0);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    setEditingId(null);
    setReplyingTo(null);
    setComposerError(null);
    setShowEmojiPicker(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setShowJumpBottom(false);
    isNearBottomRef.current = true;
    composerRef.current?.focus();
  }, [channel.id]);

  // Ctrl+F abre busca no canal
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery('');
          setSearchResults([]);
        } else if (replyingTo) {
          setReplyingTo(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, replyingTo]);

  // Debounce da busca no histórico do servidor
  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void api
        .searchMessages(channel.id, trimmed, 30)
        .then((res) => {
          if (!cancelled) {
            setSearchResults(res.messages);
          }
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, channel.id, searchOpen, searchQuery]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

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

  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

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
    setShowJumpBottom(distanceFromBottom > 320);
  }

  function scrollToBottom(): void {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  function jumpToMessage(messageId: string): void {
    const targetEl = document.getElementById(`msg-${messageId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      setTimeout(() => {
        setHighlightedMsgId((cur) => (cur === messageId ? null : cur));
      }, 1800);
    } else {
      toast.info('Essa mensagem está mais acima no histórico. Use "Carregar mensagens anteriores".');
    }
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
      await onSendMessage(draft.trim(), readyAttachments, replyingTo?.id ?? null);
      for (const item of pendingUploads) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setDraft('');
      setPendingUploads([]);
      setReplyingTo(null);
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
    } else if (e.key === 'ArrowUp' && draft.length === 0 && !editingId) {
      const lastOwn = [...messages]
        .reverse()
        .find((m) => m.authorId === currentUser.id && m.content.trim().length > 0);
      if (lastOwn) {
        e.preventDefault();
        setEditingId(lastOwn.id);
        setEditDraft(lastOwn.content);
      }
    } else if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
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

  function copyMessageText(content: string): void {
    void navigator.clipboard.writeText(content).then(() => {
      toast.success('Texto copiado.');
    });
  }

  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]!.displayName} está digitando`
        : `${typingUsers.map((u) => u.displayName).join(', ')} estão digitando`;

  const currentEmojiCat =
    EMOJI_CATEGORIES.find((c) => c.id === emojiCategory) ?? EMOJI_CATEGORIES[0]!;

  return (
    <section
      className="relative flex min-w-0 flex-1 flex-col bg-[#141418]"
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
        <div className="animate-modal-in pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/25 bg-[#0c0c0e]/90">
          <UploadCloud className="mb-2 h-8 w-8 text-zinc-200" />
          <p className="text-sm font-semibold text-white">
            Solte aqui para anexar em #{channel.name}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">Arquivos até 15 MB</p>
        </div>
      )}

      {/* Cabeçalho do Canal */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#141418] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="h-4 w-4 shrink-0 text-zinc-400" />
          <h3 className="truncate text-sm font-semibold tracking-tight text-white">
            {channel.name}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <ActionTooltip label="Buscar mensagens neste canal (Ctrl+F)">
            <button
              type="button"
              onClick={() => {
                setSearchOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                  } else {
                    setSearchQuery('');
                    setSearchResults([]);
                  }
                  return next;
                });
              }}
              className={`rounded-lg p-1.5 transition ${
                searchOpen
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>
          </ActionTooltip>

          {onToggleMembers && (
            <ActionTooltip label={showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros'}>
              <button
                type="button"
                onClick={onToggleMembers}
                className={`hidden rounded-lg p-1.5 transition lg:inline-flex ${
                  showMembers
                    ? 'bg-white/[0.08] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
                }`}
              >
                <Users className="h-4 w-4" />
              </button>
            </ActionTooltip>
          )}
        </div>
      </div>

      {/* Barra de Busca no Canal */}
      {searchOpen && (
        <div className="shrink-0 border-b border-white/[0.07] bg-[#101013] px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0c0c0e] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Buscar no histórico de #${channel.name}...`}
              className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            {searchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="rounded p-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {searchQuery.trim().length > 0 && !searchLoading && (
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="py-2 text-center text-xs text-zinc-500">
                  Nenhuma mensagem encontrada para "{searchQuery.trim()}".
                </p>
              ) : (
                searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => jumpToMessage(res.id)}
                    className="flex w-full items-start gap-2.5 rounded-lg border border-white/[0.05] bg-[#16161b] px-3 py-2 text-left transition hover:border-white/[0.12] hover:bg-[#1d1d24]"
                  >
                    <Avatar
                      displayName={res.author.displayName}
                      color={res.author.avatarColor}
                      size="xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-white">
                          {res.author.displayName}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {formatMessageTimestamp(res.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-300">
                        {res.content}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Lista de Mensagens */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-4 py-4 select-text"
      >
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-0.5">
            {hasMore && (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleLoadOlderClick()}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1c1c22] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-[#24242c] hover:text-white disabled:opacity-50"
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
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1c1c22] text-zinc-300">
                  <Hash className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-semibold text-white">
                  Início de #{channel.name}
                </h4>
                <p className="mt-1 text-xs text-zinc-400">
                  Envie a primeira mensagem, cole uma imagem com Ctrl+V ou use ``` para blocos de código.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const prev = idx > 0 ? messages[idx - 1]! : null;
              const isNewDay = !prev || getDayKey(prev.createdAt) !== getDayKey(msg.createdAt);
              const isGrouped =
                !isNewDay &&
                !msg.replyTo &&
                prev !== null &&
                prev.authorId === msg.authorId &&
                Date.parse(msg.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;

              const isAuthor = msg.authorId === currentUser.id;
              const canDelete = isAuthor || currentUser.role === 'admin';
              const isEditing = editingId === msg.id;
              const isHighlighted = highlightedMsgId === msg.id;

              return (
                <Fragment key={msg.id}>
                  {isNewDay && (
                    <div className="my-4 flex items-center gap-3 select-none">
                      <div className="h-px flex-1 bg-white/[0.07]" />
                      <span className="text-[11px] font-medium text-zinc-500">
                        {formatDateDivider(msg.createdAt)}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.07]" />
                    </div>
                  )}

                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        id={`msg-${msg.id}`}
                        className={`group relative flex flex-col rounded-lg px-2.5 py-1 transition ${
                          isHighlighted
                            ? 'bg-[#5865f2]/15 ring-1 ring-[#5865f2]/40'
                            : 'hover:bg-white/[0.025]'
                        } ${isGrouped ? 'mt-0' : 'mt-2.5 pt-1.5'}`}
                      >
                        {/* Prévia da Mensagem Respondida */}
                        {msg.replyTo && (
                          <button
                            type="button"
                            onClick={() => jumpToMessage(msg.replyTo!.id)}
                            className="mb-1 ml-12 flex max-w-full items-center gap-1.5 text-left text-[11px] text-zinc-400 transition hover:text-zinc-200"
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-zinc-500" />
                            <span
                              className="shrink-0 font-semibold"
                              style={{ color: msg.replyTo.authorColor }}
                            >
                              {msg.replyTo.authorName}
                            </span>
                            <span className="truncate text-zinc-400">
                              {msg.replyTo.content || (msg.replyTo.hasAttachments ? 'Enviou um anexo' : '')}
                            </span>
                          </button>
                        )}

                        <div className="flex gap-3">
                          {/* Ações no Hover */}
                          {!isEditing && (
                            <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-lg border border-white/[0.09] bg-[#18181d] p-0.5 shadow-lg group-hover:flex">
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
                              <ActionTooltip label="Responder">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyingTo(msg);
                                    composerRef.current?.focus();
                                  }}
                                  className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                                >
                                  <Reply className="h-3.5 w-3.5" />
                                </button>
                              </ActionTooltip>
                              {isAuthor && (
                                <ActionTooltip label="Editar">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(msg.id);
                                      setEditDraft(msg.content);
                                    }}
                                    className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </ActionTooltip>
                              )}
                              {canDelete && (
                                <ActionTooltip label="Excluir">
                                  <button
                                    type="button"
                                    onClick={() => void onDeleteMessage(msg.id)}
                                    className="rounded p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </ActionTooltip>
                              )}
                            </div>
                          )}

                          {/* Coluna esquerda: Avatar ou Horário agrupado */}
                          <div className="w-9 shrink-0">
                            {isGrouped ? (
                              <span className="hidden pt-1 text-[10px] tabular-nums text-zinc-500 group-hover:inline-block">
                                {formatShortTime(msg.createdAt)}
                              </span>
                            ) : (
                              <Avatar
                                displayName={msg.author.displayName}
                                color={msg.author.avatarColor}
                                size="md"
                                ringBg="border-[#141418]"
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
                                <span className="text-[11px] text-zinc-500">
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
                                  className="w-full resize-none rounded-lg border border-white/[0.18] bg-[#0c0c0e] px-3 py-2 text-sm text-zinc-100 focus:outline-none"
                                />
                                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                  <span>Enter para salvar • Esc para cancelar</span>
                                  <button
                                    type="button"
                                    onClick={() => void saveEdit(msg.id)}
                                    className="font-semibold text-white hover:underline"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="text-zinc-400 hover:underline"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              msg.content && (
                                <div className="text-[13.5px] leading-relaxed text-zinc-200">
                                  {renderFormattedMessage(msg.content)}
                                  {msg.editedAt && (
                                    <span className="ml-1.5 text-[10px] text-zinc-500">(editada)</span>
                                  )}
                                </div>
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
                                        className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e] transition hover:border-white/[0.2]"
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
                                      className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#1a1a20] px-3 py-2 text-left transition hover:border-white/[0.16] hover:bg-[#202028]"
                                    >
                                      <FileText className="h-4 w-4 shrink-0 text-zinc-300" />
                                      <div className="min-w-0 max-w-[200px]">
                                        <div className="truncate text-xs font-medium text-zinc-200">
                                          {att.originalName}
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                          {formatFileSize(att.size)}
                                        </div>
                                      </div>
                                      <Download className="h-4 w-4 shrink-0 text-zinc-400" />
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
                                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition ${
                                        reactedByMe
                                          ? 'border-[#5865f2]/60 bg-[#5865f2]/15 text-zinc-100'
                                          : 'border-white/[0.08] bg-[#1c1c22] text-zinc-300 hover:bg-[#24242c]'
                                      }`}
                                    >
                                      <span>{r.emoji}</span>
                                      <span className="font-mono text-[11px] font-medium tabular-nums">
                                        {r.userIds.length}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={() => {
                          setReplyingTo(msg);
                          composerRef.current?.focus();
                        }}
                      >
                        <Reply className="h-3.5 w-3.5 text-zinc-400" />
                        Responder
                      </ContextMenuItem>
                      {msg.content && (
                        <ContextMenuItem onSelect={() => copyMessageText(msg.content)}>
                          <Copy className="h-3.5 w-3.5 text-zinc-400" />
                          Copiar Texto
                        </ContextMenuItem>
                      )}
                      <ContextMenuSeparator />
                      <div className="grid grid-cols-5 gap-0.5 px-1 py-1">
                        {QUICK_EMOJIS.map((emoji) => (
                          <ContextMenuItem
                            key={emoji}
                            onSelect={() => void onToggleReaction(msg.id, emoji)}
                            className="justify-center px-1 py-1 text-sm"
                          >
                            {emoji}
                          </ContextMenuItem>
                        ))}
                      </div>
                      {(isAuthor || canDelete) && <ContextMenuSeparator />}
                      {isAuthor && (
                        <ContextMenuItem
                          onSelect={() => {
                            setEditingId(msg.id);
                            setEditDraft(msg.content);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                          Editar Mensagem
                        </ContextMenuItem>
                      )}
                      {canDelete && (
                        <ContextMenuItem danger onSelect={() => void onDeleteMessage(msg.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir Mensagem
                        </ContextMenuItem>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Botão flutuante para descer ao final do chat */}
      {showJumpBottom && (
        <div className="pointer-events-none absolute bottom-24 right-6 z-20">
          <button
            type="button"
            onClick={scrollToBottom}
            className="concord-panel pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#18181d] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-[#24242c] hover:text-white"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            <span>Voltar ao final</span>
          </button>
        </div>
      )}

      {/* Indicador de Digitando */}
      <div className="flex h-5 shrink-0 items-center px-4 text-[11px] text-zinc-400">
        {typingText && (
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-zinc-400" />
              <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-zinc-400" />
              <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-zinc-400" />
            </span>
            <span>{typingText}...</span>
          </div>
        )}
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

        {/* Banner de Resposta Ativa */}
        {replyingTo && (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#18181d] px-3 py-1.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <Reply className="h-3.5 w-3.5 shrink-0 text-[#7983f5]" />
              <span className="shrink-0 text-zinc-400">Respondendo a</span>
              <span
                className="shrink-0 font-semibold"
                style={{ color: replyingTo.author.avatarColor }}
              >
                {replyingTo.author.displayName}
              </span>
              <span className="truncate text-zinc-400">
                {replyingTo.content || 'Enviou um anexo'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              title="Cancelar resposta (Esc)"
              className="rounded p-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Pré-visualização de Anexos */}
        {pendingUploads.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-white/[0.08] bg-[#1a1a20] p-2.5">
            {pendingUploads.map((item) => (
              <div
                key={item.localId}
                className="relative flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#121216] p-1.5 pr-7"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-11 w-11 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-5 w-5 text-zinc-300" />
                )}
                <div className="max-w-[140px]">
                  <div className="truncate text-xs font-medium text-zinc-200">
                    {item.file.name || 'imagem.png'}
                  </div>
                  <div className="text-[10px] text-zinc-500">
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
                  className="absolute right-1 top-1 rounded p-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-white/[0.08] bg-[#1c1c22] px-3 py-2 transition focus-within:border-white/[0.18]">
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
          <ActionTooltip label="Anexar arquivo ou imagem">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-0.5 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.07] hover:text-white"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </ActionTooltip>

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
            placeholder={
              replyingTo
                ? `Responder a ${replyingTo.author.displayName}...`
                : `Mensagem em #${channel.name}`
            }
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />

          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Inserir emoji"
                className={`mb-0.5 rounded-lg p-1.5 transition ${
                  showEmojiPicker
                    ? 'bg-white/[0.1] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-72 space-y-2 p-2.5">
              <div className="flex gap-1 rounded-lg border border-white/[0.07] bg-[#0c0c0e] p-0.5">
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setEmojiCategory(cat.id)}
                    className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition ${
                      emojiCategory === cat.id
                        ? 'bg-[#24242c] text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat.label.split(' ')[0]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-8 gap-1">
                {currentEmojiCat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmojiAtCursor(emoji)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-base transition hover:bg-white/10"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <ActionTooltip label="Enviar (Enter)">
            <button
              type="button"
              onClick={() => void submitMessage()}
              disabled={
                sending ||
                (draft.trim().length === 0 &&
                  !pendingUploads.some((p) => p.status === 'ready'))
              }
              className="mb-0.5 rounded-lg bg-[#5865f2] p-1.5 text-white transition hover:bg-[#4752c4] disabled:opacity-35"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </ActionTooltip>
        </div>
      </div>

      {/* Lightbox de Imagem */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div className="mb-3 flex w-full max-w-4xl items-center justify-between text-xs text-zinc-300">
            <span className="truncate font-medium">{lightboxImage.name}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrl(lightboxImage.url);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#18181d] px-3 py-1.5 font-medium text-white transition hover:bg-[#24242c]"
              >
                <Download className="h-3.5 w-3.5" />
                Abrir / Baixar
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                title="Fechar (Esc)"
                className="rounded-lg border border-white/10 bg-[#18181d] p-1.5 text-zinc-300 transition hover:bg-[#24242c] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name}
            onClick={(e) => e.stopPropagation()}
            className="animate-dialog-in max-h-[82vh] max-w-full rounded-lg border border-white/10 object-contain shadow-2xl"
          />
        </div>
      )}
    </section>
  );
}
