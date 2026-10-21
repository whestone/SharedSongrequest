# Shared Songrequest

Eine gemeinsame Songrequest-Warteschlange für mehrere Twitch-Kanäle. Jeder Request wird gleichzeitig auf mehreren Spotify-Accounts abgespielt.

- `!sr` mit Songnamen, Spotify-Link oder YouTube-Link (wird auf Spotify umgewandelt)
- Weboberfläche mit Warteschlange, Verlauf, Sperrliste und Einstellungen
- Einstellbare Chat-Nachrichten, Stumm-Modus
- OBS-Overlay
- Keine Abhängigkeiten außer Node.js ≥ 18

## Start

```bash
npm start
```

Oder unter Windows `start.bat` doppelklicken. Danach http://127.0.0.1:8888 öffnen. Der Einrichtungs-Assistent führt durch Twitch- und Spotify-App.

Die ausführliche Anleitung steht in [ANLEITUNG.md](ANLEITUNG.md).

Logins und Einstellungen liegen in `data/state.json`. Der Ordner ist per `.gitignore` ausgeschlossen, weil er Tokens und Client-Secrets enthält.
