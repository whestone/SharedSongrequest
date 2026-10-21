@echo off
rem Startet Shared Songrequest lokal zum Testen. Einstellungen stehen in .env (siehe .env.example).
title Shared Songrequest
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js fehlt. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
if not exist .env (
  echo .env fehlt. Kopiere .env.example nach .env und trage die Werte ein.
  pause
  exit /b 1
)
start "" http://localhost:8888
node src\server.js
echo.
echo Der Bot wurde beendet.
pause
