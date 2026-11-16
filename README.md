# Shared Songrequest

Gemeinsame Songrequests für Twitch-Streamer, die zusammen streamen. Jeder Raum hat einen Code und eine eigene URL. Zuschauer aus allen Kanälen des Raums wünschen mit `!sr` oder Kanalpunkten, und jeder Song läuft gleichzeitig auf allen Spotify-Accounts im Raum.

**▶ [Live-Demo ausprobieren](https://whestone.github.io/SharedSongrequest/)**: läuft komplett im Browser mit Beispieldaten, ohne Twitch- oder Spotify-Login.

- Räume mit Code, Einladungslink und eigener URL, Login mit Twitch
- `!sr` mit Songnamen, Spotify- oder YouTube-Link (YouTube wird auf Spotify umgewandelt)
- Songwünsche per Kanalpunkte-Belohnung, wahlweise statt oder zusätzlich zu `!sr`
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

## Entwicklung

```bash
npm test             # Tests (Node-Testrunner, keine Abhängigkeiten)
npm run build:demo   # Demo-Website nach docs/ bauen (GitHub Pages)
```

Die Demo nutzt die echten Seiten aus `public/`. `demo/demo-api.js` simuliert den Server im Browser. Nach Änderungen an den Seiten `npm run build:demo` ausführen und `docs/` mit committen.

## Hinweis zu Musikrechten

Spotify-Musik ist nicht für Twitch lizenziert. Wer sie im Stream hörbar abspielt, riskiert stummgeschaltete VODs und DMCA-Strikes.
