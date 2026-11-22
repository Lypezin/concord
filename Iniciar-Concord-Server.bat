@echo off
title Concord Server
cd /d "%~dp0"
node scripts\host-server.mjs
if errorlevel 1 (
  echo.
  echo O Concord Server encerrou com erro.
  pause
)
