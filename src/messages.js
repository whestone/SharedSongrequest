// Alle Chat-Nachrichten des Bots. Jede lässt sich in den Einstellungen ändern;
// ein leerer Text bedeutet: diese Nachricht wird nicht gesendet.
// Platzhalter: {user} {song} {title} {artist} {pos} {max} {query} {requester} {list} {url} {target}
export const MESSAGES = [
  { key: 'added', label: 'Song hinzugefügt', text: '@{user} {song} ist auf Platz {pos}.' },
  { key: 'nowPlaying', label: '„Jetzt läuft“-Ansage', text: '🎵 Jetzt läuft: {song} (gewünscht von @{requester})' },
  { key: 'duplicate', label: 'Song schon in der Warteschlange', text: '@{user} {song} ist schon in der Warteschlange.' },
  { key: 'notFound', label: 'Nichts gefunden', text: '@{user} Nichts gefunden für "{query}".' },
  { key: 'tooLong', label: 'Song zu lang', text: '@{user} {song} ist zu lang (max. {max} Min.).' },
  { key: 'userLimit', label: 'Zu viele Songs vom Zuschauer', text: '@{user} Du hast schon {max} Songs in der Warteschlange.' },
  { key: 'queueFull', label: 'Warteschlange voll', text: '@{user} Die Warteschlange ist voll.' },
  { key: 'closed', label: 'Request, obwohl geschlossen', text: '@{user} Songrequests sind gerade geschlossen.' },
  { key: 'blacklisted', label: 'Gesperrter Zuschauer wünscht etwas', text: '@{user} Du darfst gerade keine Songs wünschen.' },
  { key: 'badLink', label: 'Nicht unterstützter Link (z. B. SoundCloud)', text: '@{user} Bitte einen Songnamen, Spotify- oder YouTube-Link schicken.' },
  { key: 'ytNotFound', label: 'YouTube-Video nicht lesbar', text: '@{user} Das YouTube-Video konnte ich nicht öffnen (privat oder gelöscht?).' },
  { key: 'ytNoMatch', label: 'YouTube-Video nicht auf Spotify', text: '@{user} "{query}" habe ich auf Spotify nicht gefunden.' },
  { key: 'usage', label: '!sr ohne Song', text: '@{user} Benutze: !sr <Songname oder Spotify-Link>' },
  { key: 'song', label: '!song (Request läuft)', text: '@{user} Jetzt läuft: {song} (gewünscht von {requester}) {url}' },
  { key: 'songNoRequest', label: '!song (kein Request)', text: '@{user} Jetzt läuft: {song}' },
  { key: 'nothingPlaying', label: '!song (nichts läuft)', text: '@{user} Gerade läuft nichts.' },
  { key: 'queue', label: '!queue', text: '@{user} {list}' },
  { key: 'queueEmpty', label: '!queue (leer)', text: '@{user} Die Warteschlange ist leer.' },
  { key: 'removed', label: '!wrongsong', text: '@{user} {song} wurde entfernt.' },
  { key: 'nothingToRemove', label: '!wrongsong (nichts da)', text: '@{user} Du hast keinen Song in der Warteschlange.' },
  { key: 'skipped', label: '!skip', text: '@{user} Übersprungen.' },
  { key: 'opened', label: '!sropen', text: 'Songrequests sind offen! Benutze !sr <Song>' },
  { key: 'closedNow', label: '!srclose', text: 'Songrequests sind geschlossen.' },
  { key: 'blocked', label: '!srblock', text: '@{user} {target} darf keine Songs mehr wünschen.' },
  { key: 'unblocked', label: '!srunblock', text: '@{user} {target} darf wieder Songs wünschen.' },
  { key: 'notConnected', label: 'Spotify nicht verbunden', text: '@{user} Spotify ist noch nicht verbunden.' },
  { key: 'error', label: 'Fehler', text: '@{user} Da ist etwas schiefgelaufen, versuch es nochmal.' },
];

export const DEFAULT_TEXTS = Object.fromEntries(MESSAGES.map((m) => [m.key, m.text]));

export function format(template, vars) {
  return template.replace(/\{(\w+)\}/g, (all, k) => (vars[k] != null ? String(vars[k]) : all)).trim();
}

export function songVars(t) {
  return t ? { song: `${t.name} – ${t.artists}`, title: t.name, artist: t.artists, url: t.url || '' } : {};
}
