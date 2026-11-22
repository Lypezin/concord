import { useEffect } from 'react';
import type { Channel } from '@concord/shared';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  Hash,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Plus,
  Search,
  Settings,
  Tv,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: Channel[];
  isAdmin: boolean;
  inVoiceCall: boolean;
  muted: boolean;
  deafened: boolean;
  screenSharing: boolean;
  showMembers: boolean;
  onSelectChannel: (channel: Channel) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onDisconnectVoice: () => void;
  onOpenVoiceStage: () => void;
  onOpenSettings: () => void;
  onOpenInvites: () => void;
  onOpenCreateChannel: (type: 'text' | 'voice') => void;
  onToggleMembers: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  channels,
  isAdmin,
  inVoiceCall,
  muted,
  deafened,
  screenSharing,
  showMembers,
  onSelectChannel,
  onToggleMute,
  onToggleDeafen,
  onStartScreenShare,
  onStopScreenShare,
  onDisconnectVoice,
  onOpenVoiceStage,
  onOpenSettings,
  onOpenInvites,
  onOpenCreateChannel,
  onToggleMembers,
}: CommandPaletteProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const runAction = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="concord-panel animate-dialog-in fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.1] bg-[#16161b] text-zinc-100 focus:outline-none"
        >
          <DialogPrimitive.Title className="sr-only">
            Busca rápida e comandos do Concord
          </DialogPrimitive.Title>

          <Command label="Comandos rápidos" className="flex flex-col">
            <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <Command.Input
                autoFocus
                placeholder="Ir para canal ou executar comando..."
                className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              />
              <kbd className="rounded border border-white/[0.1] bg-[#0c0c0e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="py-8 text-center text-xs text-zinc-500">
                Nenhum canal ou comando encontrado.
              </Command.Empty>

              {textChannels.length > 0 && (
                <Command.Group
                  heading="Canais de Texto"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500"
                >
                  {textChannels.map((ch) => (
                    <Command.Item
                      key={ch.id}
                      value={`texto #${ch.name}`}
                      onSelect={() => runAction(() => onSelectChannel(ch))}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                    >
                      <Hash className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{ch.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {voiceChannels.length > 0 && (
                <Command.Group
                  heading="Canais de Voz"
                  className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500"
                >
                  {voiceChannels.map((ch) => (
                    <Command.Item
                      key={ch.id}
                      value={`voz call ${ch.name}`}
                      onSelect={() => runAction(() => onSelectChannel(ch))}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{ch.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group
                heading="Ações Rápidas"
                className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-500"
              >
                <Command.Item
                  value="mutar desmutar microfone mic"
                  onSelect={() => runAction(onToggleMute)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  {muted ? (
                    <MicOff className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                  <span>{muted ? 'Ativar Microfone' : 'Mutar Microfone'}</span>
                </Command.Item>

                <Command.Item
                  value="ensurdecer deafen fone audio"
                  onSelect={() => runAction(onToggleDeafen)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  {deafened ? (
                    <HeadphoneOff className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Headphones className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                  <span>{deafened ? 'Reativar Áudio' : 'Ensurdecer (Deafen)'}</span>
                </Command.Item>

                {inVoiceCall && (
                  <>
                    <Command.Item
                      value="compartilhar tela stream parar"
                      onSelect={() =>
                        runAction(screenSharing ? onStopScreenShare : onStartScreenShare)
                      }
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                    >
                      {screenSharing ? (
                        <MonitorOff className="h-3.5 w-3.5 text-rose-400" />
                      ) : (
                        <MonitorUp className="h-3.5 w-3.5 text-[#7983f5]" />
                      )}
                      <span>
                        {screenSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
                      </span>
                    </Command.Item>

                    <Command.Item
                      value="abrir palco de voz chamada"
                      onSelect={() => runAction(onOpenVoiceStage)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                    >
                      <Tv className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Abrir Palco da Chamada</span>
                    </Command.Item>

                    <Command.Item
                      value="desconectar sair da call voz"
                      onSelect={() => runAction(onDisconnectVoice)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-300 transition aria-selected:bg-rose-500/20 aria-selected:text-rose-200"
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                      <span>Desconectar da Chamada</span>
                    </Command.Item>
                  </>
                )}

                <Command.Item
                  value="criar novo canal texto"
                  onSelect={() => runAction(() => onOpenCreateChannel('text'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  <Plus className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Criar Canal de Texto</span>
                </Command.Item>

                <Command.Item
                  value="criar novo canal voz"
                  onSelect={() => runAction(() => onOpenCreateChannel('voice'))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  <Plus className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Criar Canal de Voz</span>
                </Command.Item>

                {isAdmin && (
                  <Command.Item
                    value="convites convidar amigo"
                    onSelect={() => runAction(onOpenInvites)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                  >
                    <UserPlus className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Gerenciar Convites</span>
                  </Command.Item>
                )}

                <Command.Item
                  value="membros mostrar ocultar lista"
                  onSelect={() => runAction(onToggleMembers)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  <Users className="h-3.5 w-3.5 text-zinc-400" />
                  <span>{showMembers ? 'Ocultar Lista de Membros' : 'Mostrar Lista de Membros'}</span>
                </Command.Item>

                <Command.Item
                  value="configuracoes audio perfil atalhos"
                  onSelect={() => runAction(onOpenSettings)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-200 transition aria-selected:bg-[#24242c] aria-selected:text-white"
                >
                  <Settings className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Abrir Configurações</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
