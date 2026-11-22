param(
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host 'Solicitando permissao de Administrador para configurar o Firewall do Windows...'
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath))
  if ($NoPause) {
    $argList += '-NoPause'
  }
  Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -Wait
  exit $LASTEXITCODE
}

$rules = @(
  @{ Name = 'Concord - API & Chat (Tailscale)'; Protocol = 'TCP'; Port = 3000 },
  @{ Name = 'Concord - LiveKit Signal (Tailscale)'; Protocol = 'TCP'; Port = 7880 },
  @{ Name = 'Concord - LiveKit TCP (Tailscale)'; Protocol = 'TCP'; Port = 7881 },
  @{ Name = 'Concord - LiveKit UDP (Tailscale)'; Protocol = 'UDP'; Port = 7882 }
)

Write-Host ''
Write-Host '=========================================================='
Write-Host '   CONCORD - CONFIGURANDO FIREWALL DO WINDOWS (TAILSCALE) '
Write-Host '=========================================================='
Write-Host ''

foreach ($rule in $rules) {
  Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

  New-NetFirewallRule `
    -DisplayName $rule.Name `
    -Description 'Libera apenas a rede privada Tailscale (100.64.0.0/10) para o Concord.' `
    -Direction Inbound `
    -Action Allow `
    -Enabled True `
    -Profile Any `
    -Protocol $rule.Protocol `
    -LocalPort $rule.Port `
    -RemoteAddress '100.64.0.0/10' | Out-Null

  Write-Host ("  [OK] {0} -> {1} {2} (somente Tailscale 100.64.0.0/10)" -f $rule.Name, $rule.Protocol, $rule.Port)
}

Write-Host ''
Write-Host 'Regras aplicadas com sucesso! Seus amigos podem conectar normalmente.'

if (-not $NoPause) {
  Write-Host ''
  [void](Read-Host 'Pressione Enter para fechar')
}
