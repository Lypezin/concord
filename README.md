# Concord

Aplicativo desktop privado (Windows) para chat, voz e compartilhamento de tela entre amigos — sem limites de minutos, sem mensalidade e rodando o servidor direto no seu PC.

## O que vem pronto (v0.2.0)

- **Chat em tempo real:** canais de texto livres, Markdown seguro (`**negrito**`, `*itálico*`, `~~tachado~~`, `` `código` `` e links clicáveis), divisores de data por dia, seletor de emojis, `Ctrl+V` para colar prints direto da área de transferência, arrastar e soltar arquivos (até 15 MB), *lightbox* de imagens, reações rápidas, edição/exclusão, paginação de histórico, indicador de digitando e notificações.
- **Voz com qualidade Discord:** `livekit-server.exe` nativo (sem Docker) com detecção automática de `node_ip` Tailscale, filtro neural **RNNoise** (tira som de teclado e ventilador), seleção de microfone/saída com teste ao vivo, controle individual de volume (**0% a 200%**) por amigo, perfil personalizável (nome e cor do avatar) e **atalhos globais** (Mute e Ensurdecer funcionando dentro de jogos).
- **Compartilhamento de tela:** seletor visual de monitor ou janela com pré-visualização, presets `720p`/`1080p`/`1440p` em `30`/`60 FPS`, modo Jogos/Texto, captura de **áudio do sistema sem eco** (Electron 45 + `restrictOwnAudio`), tela cheia real, silenciamento rápido e controle de volume separado da transmissão.
- **Conexão privada fácil e reconexão automática:** suporte embutido a **Convite Unificado (`CONCORD-...`)** que baixa e conecta o **Tailscale** automaticamente (sem o amigo precisar criar conta no Tailscale!), tela automática de reconexão quando o host ainda estiver ligando o servidor e auto-update via GitHub Releases (`Lypezin/concord`).

---

## Como você (Host) liga o servidor

1. Instale o [Tailscale no seu Windows](https://tailscale.com/download/windows) e entre na sua conta uma única vez.
2. **(Opcional, recomendado na 1ª vez):** dê dois cliques em **`Liberar-Firewall-Concord.bat`** e aceite a permissão de Administrador para criar as 4 regras de entrada do Windows Firewall restritas somente à rede privada Tailscale (`100.64.0.0/10` nas portas `3000`, `7880`, `7881` e `7882`).
3. Dê dois cliques em **`Iniciar-Concord-Server.bat`** (ou rode `npm run host` no terminal).
   - Na primeira vez, o script baixa automaticamente o `livekit-server.exe` oficial e inicia tudo consumindo menos de 100 MB de RAM.
   - O terminal mostra o seu endereço Tailscale, por exemplo: `http://100.xx.yy.zz:3000` e o `LiveKit ICE IP` detectado automaticamente.
4. Abra o **Concord** (ou rode `npm run dev` em desenvolvimento), conecte em `http://127.0.0.1:3000` e crie sua conta de **Administrador**.

---

## Como convidar seus 3 amigos (Passo único)

1. No painel admin do **Tailscale** (`Access Controls` → `JSON`):
   - Adicione a tag `tag:concord-friend` e aplique a ACL abaixo para garantir que seus amigos só consigam acessar as portas do Concord (`3000`, `7880`, `7881`, `7882`) e nada mais no seu PC:

```json
{
  "tagOwners": {
    "tag:concord-friend": ["autogroup:admin"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["autogroup:member"],
      "dst": ["*:*"]
    },
    {
      "action": "accept",
      "src": ["tag:concord-friend"],
      "dst": [
        "autogroup:member:3000",
        "autogroup:member:7880",
        "autogroup:member:7881",
        "autogroup:member:7882"
      ]
    }
  ]
}
```

2. Ainda no painel do Tailscale (`Settings` → `Keys` → **Generate auth key**):
   - Marque **Reusable** e **Tags: `tag:concord-friend`** (dispositivos com tag não expiram a cada 180 dias).
3. Dentro do **Concord**, clique em **Convites**:
   - O endereço Tailscale já é preenchido automaticamente quando o Tailscale está conectado no seu PC (ou clique em **Usar meu IP Tailscale**).
   - Gere um código, cole a *Auth Key* no campo indicado e clique em **Copiar Convite Unificado**.
4. Envie para o seu amigo:
   - O link de download do **`Concord-Setup-0.2.0.exe`** (em *Releases* no GitHub).
   - O código unificado `CONCORD-...`.
   - *(Aviso para a primeira instalação: como o `.exe` não tem assinatura digital paga, o Windows exibe o alerta azul do SmartScreen na primeira vez — basta clicar em **"Mais informações" → "Executar assim mesmo"**).*
5. Seu amigo só abre o Concord, cola o `CONCORD-...`, clica em **"Instalar e Conectar Tailscale"** e cria o usuário dele!

---

## Comandos úteis (Desenvolvimento e Build)

```powershell
# Baixar/atualizar o binário livekit-server.exe
npm run setup:livekit

# Rodar servidor + app Electron em modo dev
npm run dev

# Iniciar apenas o servidor pronto para receber amigos
npm run host

# Validar tipos, build e testes de integração
npm run typecheck
npm run build
npm run test:server

# Gerar o instalador Concord-Setup-<versão>.exe localmente em apps/desktop/release/
npm run dist:win
```

### Publicar uma atualização automática no GitHub Releases

Crie e envie uma tag semântica (ex.: `v0.2.0`) para o repositório `Lypezin/concord`:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

O GitHub Actions (`.github/workflows/release.yml`) compila o instalador `.exe`, `.blockmap` e `latest.yml` e publica nos *Releases*, atualizando automaticamente o Concord dos seus amigos na próxima abertura.
