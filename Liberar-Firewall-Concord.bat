@echo off
title Concord - Liberar Firewall (Tailscale)
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-firewall.ps1"
if errorlevel 1 (
  echo.
  echo Falha ao configurar o Firewall do Windows.
  pause
)
