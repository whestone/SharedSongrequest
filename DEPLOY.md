# Server einrichten

Diese Anleitung ist für dich als Betreiber. Streamer, die nur einen Raum nutzen, brauchen [ANLEITUNG.md](ANLEITUNG.md).

## Was du brauchst

- **Einen Server, der immer läuft,** zum Beispiel einen kleinen VPS mit 1 vCPU und 1 GB RAM. Kostenlose Hoster, die Apps schlafen legen, gehen nicht, weil der Bot dauerhaft im Chat sein muss.
- **Eine Domain oder Subdomain,** zum Beispiel `songs.deinedomain.de`. Ihr DNS-A-Eintrag muss auf den Server zeigen.
- **Docker** auf dem Server (`docker compose`).
- **Einen eigenen Twitch-Account für den Bot,** zum Beispiel `SongShareBot`. Dein eigener Account geht auch, dann schreibt der Bot aber als du.

## 1. Twitch-App anlegen (einmal für den ganzen Server)

1. https://dev.twitch.tv/console/apps → **Register Your Application**
2. **OAuth-Redirect-URL:** `https://songs.deinedomain.de/callback/twitch`
3. Kategorie **Chat Bot**, Client-Typ **Vertraulich**
4. Client-ID kopieren, **Neues Geheimnis** erzeugen und kopieren

Mit dieser App melden sich alle Nutzer an. Der Bot-Account nutzt sie auch. Twitch begrenzt das nicht auf wenige Nutzer.

## 2. Konfigurieren

```bash
git clone <dein-repo> shared-songrequest
cd shared-songrequest
cp .env.example .env
```

In `.env` eintragen:
- `PUBLIC_URL`: deine Domain mit `https://`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- `SECRET_KEY`: ein langer Zufallswert. Erzeugen mit `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. **Nicht verlieren und nicht ändern**, sonst sind alle gespeicherten Logins unlesbar.
- `ADMIN_TWITCH_LOGINS`: dein Twitch-Name

In `Caddyfile` `songs.example.com` durch deine Domain ersetzen.

## 3. Starten

```bash
docker compose up -d --build
```

Caddy holt automatisch ein HTTPS-Zertifikat. Die Logs siehst du mit `docker compose logs -f app`.

## 4. Bot-Account verbinden

1. Öffne `https://songs.deinedomain.de/admin` und melde dich mit deinem Admin-Account an.
2. Klick auf **Bot-Account verbinden** und melde dich dabei mit dem **Bot-Account** bei Twitch an. Am einfachsten geht das in einem privaten Fenster.
3. Fertig. Der Bot tritt automatisch den Kanälen aller Räume bei.

Tipp: Streamer sollten den Bot in ihrem Kanal zum Mod machen (`/mod songsharebot`). Dann drosselt Twitch seine Nachrichten weniger.

## Updates

```bash
git pull
docker compose up -d --build
```

Die Daten liegen im Docker-Volume `app_data` und bleiben bei Updates erhalten.

## Lokal testen (ohne Server)

```bash
cp .env.example .env   # PUBLIC_URL=http://localhost:8888
npm start
```

In der Twitch-App zusätzlich `http://localhost:8888/callback/twitch` als Redirect-URL eintragen. Raum-Besitzer tragen in ihrer Spotify-App `http://127.0.0.1:8888/callback/spotify` ein. Lokal können nur Leute auf deinem PC beitreten. Für Freunde brauchst du den Server.

## Grenzen

- **Spotify:** Seit Februar 2026 erlaubt Spotify pro Entwickler-App nur 5 Nutzer, und der Besitzer der App braucht Premium. Deshalb legt jeder Raum-Besitzer seine eigene Spotify-App an. Ein Raum hat höchstens 5 Mitglieder (`MAX_MEMBERS_PER_ROOM`).
- **Twitch-Chat:** Der Bot sendet höchstens etwa 18 Nachrichten pro 30 Sekunden über alle Räume hinweg. Bei vielen Räumen hilft es, wenn er überall Mod ist. Dann lässt sich das Limit in `src/twitch.js` erhöhen.
- **Speicher:** Alles liegt verschlüsselt in JSON-Dateien. Das reicht für viele Räume, aber nicht für Tausende.
