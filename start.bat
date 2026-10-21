@echo off
rem Startet den Songrequest-Bot. Fenster offen lassen, solange ihr streamt.
title Songrequest-Bot
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js fehlt. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
start "" http://127.0.0.1:8888
node src\index.js
echo.
echo Der Bot wurde beendet.
pause
