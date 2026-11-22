# Concord

Aplicativo desktop privado (Windows) para chat, voz e compartilhamento de tela entre amigos — sem limites de minutos, sem mensalidade e rodando o servidor direto no seu PC.

## O que vem pronto (v0.6.0)

- **Chat em tempo real:** canais de texto livres, Markdown seguro (`**negrito**`, `*itálico*`, `~~tachado~~`, `` `código` `` e links clicáveis), divisores de data por dia, seletor de emojis, `Ctrl+V` para colar prints direto da área de transferência, arrastar e soltar arquivos (até 15 MB), *lightbox* de imagens, reações rápidas, edição/exclusão, paginação de histórico, indicador de digitando e notificações.
- **Voz com baixa latência:** `livekit-server.exe` nativo (sem Docker) com detecção automática de `node_ip` Tailscale, supressão de ruído **RNNoise**, seleção de microfone/saída com teste e retorno ao vivo, controle individual de volume (**0% a 200%**) por usuário, perfil personalizável (nome e cor do avatar) e **atalhos globais** (Mute e Ensurdecer funcionando dentro de jogos).
- **Compartilhamento de tela em 60 FPS:** seletor visual de monitor ou janela com pré-visualização, presets `720p`/`1080p`/`1440p` em `30`/`60 FPS` com codificação H.264 por hardware, modo Jogos/Texto, captura de **áudio do sistema sem eco** (Electron 45 + `restrictOwnAudio`), tela cheia real, silenciamento rápido e controle de volume separado da transmissão.
- **Conexão privada fácil e reconexão automática:** suporte embutido a **Convite Unificado (`CONCORD-...`)** que baixa e conecta o **Tailscale** automaticamente, tela automática de reconexão e auto-update via GitHub Releases (`Lypezin/concord`).
