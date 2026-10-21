# Shared Songrequest

Gemeinsame Songrequests für Twitch-Streamer, die zusammen streamen. Jeder Raum hat einen Code und eine eigene URL. Zuschauer aus allen Kanälen des Raums wünschen mit `!sr`, und jeder Song läuft gleichzeitig auf allen Spotify-Accounts im Raum.

- Räume mit Code, Einladungslink und eigener URL, Login mit Twitch
- `!sr` mit Songnamen, Spotify- oder YouTube-Link (YouTube wird auf Spotify umgewandelt)
- Warteschlange, Verlauf, Sperrliste, einstellbare Chat-Nachrichten, Stumm-Modus
- OBS-Overlay und öffentliche Zuschauer-Seite pro Raum
- Ein gemeinsamer Bot für alle Räume, Daten verschlüsselt gespeichert
- Keine Abhängigkeiten außer Node.js ≥ 18

**Für Streamer:** [ANLEITUNG.md](ANLEITUNG.md) · **Server einrichten:** [DEPLOY.md](DEPLOY.md)

## Schnellstart lokal

```bash
cp .env.example .env   # ausfüllen, PUBLIC_URL=http://localhost:8888
npm start
```
