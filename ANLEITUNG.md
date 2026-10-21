# Gemeinsamer Songrequest-Bot (Twitch × Spotify)

Ein Bot, eine Warteschlange: Zuschauer aus **allen** eingetragenen Twitch-Kanälen wünschen sich Songs mit `!sr`, und jeder Song startet **gleichzeitig auf allen verbundenen Spotify-Accounts**.

Der Bot läuft nur bei **einer** Person (dem „Host“). Der Freund muss nichts installieren, er verbindet nur einmal seinen Spotify-Account und lässt Spotify offen.

> ⚠️ **Musikrechte:** Spotify-Musik ist nicht für Twitch lizenziert. Wenn sie im Stream zu hören ist, riskiert ihr stummgeschaltete VODs und DMCA-Strikes. Am sichersten hört ihr nur selbst über Kopfhörer mit.

---

## Voraussetzungen

- **Node.js 18 oder neuer** (https://nodejs.org)
- **Spotify Premium** bei **allen** Beteiligten (ohne Premium lässt Spotify keine Fernsteuerung zu)
- Optional ein eigener Twitch-Account für den Bot (z. B. `euerbot`). Dein eigener Account geht auch.

## 1. Starten

```bash
npm start
```

Dann **http://127.0.0.1:8888** im Browser öffnen. Eine Konfigurationsdatei gibt es nicht, alles wird auf dieser Seite eingetragen.

## 2. Einrichtung (einmalig, direkt auf der Seite)

Beim ersten Start erscheint ein Assistent mit drei Schritten. Zu jedem Schritt gibt es eine Klick-für-Klick-Anleitung und Kopieren-Knöpfe für die Redirect-URLs:

1. **Twitch-App:** In der Twitch-Entwicklerkonsole eine App anlegen und Client-ID und Secret einfügen.
2. **Spotify-App:** Im Spotify-Dashboard eine App anlegen und Client-ID und Secret einfügen. Dort unter **User Management** deinen Freund mit der E-Mail seines Spotify-Accounts eintragen.
3. **Kanäle und Accounts:** Twitch-Kanäle (z. B. `deinkanal, kanaldeinesfreundes`) und Namen der Spotify-Accounts. Der erste Account ist der Taktgeber.

Beim Speichern prüft der Bot sofort, ob Twitch bzw. Spotify die Schlüssel akzeptieren. Ist etwas falsch kopiert, erscheint direkt eine Fehlermeldung.

Warum das nötig ist: Twitch und Spotify erlauben einen Login nur über eine registrierte App. Fertige Tools wie Nightbot haben die einmal zentral angelegt, ein eigener Bot braucht seine eigene.

Später lässt sich alles unter **⚙ Einstellungen** ändern, dazu kommen die Regeln: Songs pro Zuschauer, Länge der Warteschlange, maximale Songdauer und „Jetzt läuft“-Ansage.

## 3. Verbinden

1. **Mit Twitch verbinden:** Mit dem Bot-Account anmelden.
2. **Spotify · Spieler 1 → Hier anmelden:** Mit deinem eigenen Spotify-Account anmelden.
3. **Spotify · Spieler 2 → Account eines Freundes verbinden:**
   - **Link kopieren** und dem Freund schicken (z. B. über Discord)
   - Der Freund öffnet den Link, meldet sich an und bestätigt.
   - Danach zeigt sein Browser „Seite nicht erreichbar“. **Das ist normal.**
   - Er kopiert die **komplette Adresse** aus der Adresszeile (`http://127.0.0.1:8888/callback/spotify?code=…`) und schickt sie dir.
   - Du fügst sie ins Feld ein und klickst **Verbinden**. Das muss innerhalb von ein paar Minuten passieren, sonst ist der Code abgelaufen.

Die Logins bleiben gespeichert (`data/state.json`). Beim nächsten Start ist alles sofort wieder da.

**Tipp:** Gebt dem Bot-Account in beiden Kanälen Mod-Rechte (`/mod euerbot`), sonst kann Twitch seine Antworten drosseln.

## 4. Während des Streams

- Beide haben **Spotify offen** (am besten die Desktop-App). Falls „Kein Spotify-Gerät gefunden“ erscheint, einmal kurz irgendeinen Song abspielen.
- Ein Request startet, sobald der aktuelle Song endet, und zwar bei allen gleichzeitig.
- Läuft gerade gar nichts, startet der Request sofort.
- Ist die Warteschlange leer, macht Spotify normal weiter (Autoplay oder eure eigene Musik).

### Chat-Befehle

| Befehl | Wer | Was |
|---|---|---|
| `!sr <Song>`, `!sr <Spotify-Link>` oder `!sr <YouTube-Link>` | alle | Song wünschen (Alias: `!songrequest`). Bei YouTube liest der Bot den Videotitel und sucht den Song auf Spotify. |
| `!song` | alle | Was läuft gerade? |
| `!queue` | alle | Die nächsten Songs anzeigen (Alias: `!q`) |
| `!wrongsong` | alle | Den eigenen letzten Wunsch entfernen (Alias: `!oops`) |
| `!skip` | Mods | Nächster Song |
| `!sropen` / `!srclose` | Mods | Requests öffnen oder schließen. Geschlossen gilt für alle, auch für dich. In den Einstellungen kannst du Mods davon ausnehmen. |
| `!srblock name` / `!srunblock name` | Mods | Zuschauer für Requests sperren oder entsperren |

Die Weboberfläche kann außerdem:
- Songs verschieben und entfernen und die Warteschlange leeren
- einen **Verlauf** der letzten Songs zeigen (Anzahl einstellbar), mit Wünscher, Uhrzeit und Kanal. Mit ↻ reihst du einen Song nochmal ein.
- Zuschauer mit 🚫 direkt in Warteschlange oder Verlauf **sperren**
- unter **⚙ Einstellungen → Chat-Nachrichten** jeden Antworttext ändern (mit Platzhaltern wie `{user}` oder `{song}`). Ein leeres Feld bedeutet, dass diese Nachricht nicht gesendet wird. Mit dem Hauptschalter schreibt der Bot gar nicht mehr in den Chat.

### OBS-Overlay

Browserquelle hinzufügen: URL `http://127.0.0.1:8888/overlay`, Breite 600, Höhe 220. Das Overlay zeigt den aktuellen Request mit Cover, Wünscher und den nächsten zwei Songs. Es läuft nur beim Host. Der Freund kann es nicht direkt einbinden, weil der Bot nicht übers Internet erreichbar ist.

### Twitch Shared Chat

Mit Shared Chat („Stream Together“) seht ihr die Requests beider Chats in einem Chat. Der Bot erkennt doppelte Nachrichten und verarbeitet jede nur einmal. Ohne Shared Chat funktioniert er genauso: Er liest einfach beide Kanäle.

---

## Wie es funktioniert / Grenzen

- Der **erste** Spotify-Account ist der **Taktgeber**. Der Bot fragt alle 2 Sekunden dessen Wiedergabe ab und startet kurz vor Songende den nächsten Request auf **allen** Accounts.
- Synchronisiert wird nur beim Songwechsel. Pausiert oder spult jemand zwischendurch, läuft es bei ihm versetzt weiter, bis der nächste Request startet.
- Schaltet der Taktgeber in Spotify selbst weiter, gilt der Request als beendet.
- Wegen Netzwerk-Latenz können zwischen euch ein paar hundert Millisekunden Unterschied entstehen.
- Der Bot muss laufen, solange ihr streamt. Wird er geschlossen, bleibt die Warteschlange gespeichert.
