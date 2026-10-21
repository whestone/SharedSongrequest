# Anleitung für Streamer

Eine Warteschlange für alle: Zuschauer aus euren Kanälen wünschen sich Songs mit `!sr`, und jeder Song läuft gleichzeitig auf allen Spotify-Accounts im Raum.

> ⚠️ **Musikrechte:** Spotify-Musik ist nicht für Twitch lizenziert. Wenn sie im Stream zu hören ist, riskiert ihr stummgeschaltete VODs und DMCA-Strikes. Am sichersten hört ihr nur selbst über Kopfhörer mit.

## Voraussetzungen

- **Spotify Premium** für alle im Raum
- Die **Spotify-Desktop-App** (oder ein anderes Spotify-Gerät) läuft, solange ihr streamt

## Raum erstellen (eine Person)

1. Öffne die Startseite und melde dich **mit Twitch an**.
2. Klick auf **Neuen Raum erstellen**. Du bekommst einen Code wie `K7X2QM` und eine eigene Raum-URL.
3. **Spotify-App anlegen** (einmalig, der Raum zeigt dir jeden Schritt):
   - Im [Spotify-Dashboard](https://developer.spotify.com/dashboard) **Create app** klicken
   - Die angezeigte **Redirect URI** eintragen und **Web API** ankreuzen
   - **Client ID** und **Client secret** in den Raum kopieren
   - Unter **User Management** jeden Freund mit Name und **E-Mail seines Spotify-Accounts** eintragen
4. Bei dir auf **Spotify verbinden** klicken.

Warum die eigene App? Spotify erlaubt seit 2026 nur noch 5 Nutzer pro Entwickler-App. Mit einer eigenen App pro Raum hat jeder Raum seine eigenen 5 Plätze.

## Beitreten (Freunde)

1. Den **Einladungslink** öffnen oder auf der Startseite den **Code** eingeben.
2. Mit Twitch anmelden und auf **Beitreten** klicken.
3. Auf **Spotify verbinden** klicken. Kommt die Meldung „Spotify lässt diesen Account noch nicht zu“, muss der Raum-Besitzer dich erst in seiner Spotify-App unter User Management eintragen.

Der Twitch-Kanal jedes Mitglieds wird automatisch Teil des Raums. Requests aus allen diesen Kanälen landen in der gemeinsamen Warteschlange. Unter deiner Karte kannst du deinen Kanal auch deaktivieren. Ein Kanal kann immer nur in einem Raum aktiv sein.

## Während des Streams

- Der **Taktgeber** ist das erste Mitglied mit verbundenem Spotify, normalerweise der Besitzer. An seiner Wiedergabe erkennt der Bot das Songende.
- Etwa 15 Sekunden vor Songende kommt der nächste Request bei allen in die Spotify-Warteschlange. Startet er beim Taktgeber, ziehen die anderen mit.
- Läuft gar nichts, startet ein Request sofort. Ist Spotify pausiert, wartet der Bot.
- Mit **⏭ Nächster Song** startet der nächste Request sofort.

### Chat-Befehle

| Befehl | Wer | Was |
|---|---|---|
| `!sr <Song>`, `!sr <Spotify-Link>`, `!sr <YouTube-Link>` | alle | Song wünschen (Alias: `!songrequest`). YouTube wird auf Spotify umgewandelt. |
| `!song` | alle | Was läuft gerade? |
| `!queue` | alle | Die nächsten Songs (Alias: `!q`) |
| `!wrongsong` | alle | Eigenen letzten Wunsch entfernen (Alias: `!oops`) |
| `!skip` | Mods | Nächster Song |
| `!sropen` / `!srclose` | Mods | Requests öffnen oder schließen |
| `!srblock name` / `!srunblock name` | Mods | Zuschauer sperren oder entsperren |

### Im Raum

- **Warteschlange:** verschieben, entfernen, Zuschauer mit 🚫 sperren
- **Verlauf:** die letzten Songs mit Wünscher. Mit ↻ reihst du einen Song nochmal ein.
- **⚙ Einstellungen:**
  - Limits und Verlaufslänge
  - Chat-Nachrichten mit Platzhaltern. Ein leeres Feld bedeutet, dass diese Nachricht nicht gesendet wird. Mit dem Stumm-Schalter schreibt der Bot gar nicht in den Chat.
  - Sperrliste
  - Zuschauer-Seite ein- oder ausschalten

### Links

- **OBS-Overlay:** „Overlay-Link kopieren“, dann in OBS eine Browserquelle mit 600 × 220 anlegen. Der Link enthält einen geheimen Schlüssel, also nicht öffentlich teilen. Der Besitzer kann ihn erneuern.
- **Zuschauer-Seite:** zeigt aktuellen Song und Warteschlange. Den Link kannst du z. B. in die Stream-Beschreibung oder einen `!queue`-Befehl packen.
