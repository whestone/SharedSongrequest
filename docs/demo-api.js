// Automatisch erzeugt von scripts/build-demo.mjs – nicht von Hand bearbeiten.
window.__SR_REPO = "https://github.com/whestone/SharedSongrequest";
window.__SR_MESSAGES = [{"key":"added","label":"Song hinzugefügt","text":"@{user} {song} ist auf Platz {pos}."},{"key":"nowPlaying","label":"„Jetzt läuft“-Ansage","text":"🎵 Jetzt läuft: {song} (gewünscht von @{requester})"},{"key":"duplicate","label":"Song schon in der Warteschlange","text":"@{user} {song} ist schon in der Warteschlange."},{"key":"notFound","label":"Nichts gefunden","text":"@{user} Nichts gefunden für \"{query}\"."},{"key":"tooLong","label":"Song zu lang","text":"@{user} {song} ist zu lang (max. {max} Min.)."},{"key":"userLimit","label":"Zu viele Songs vom Zuschauer","text":"@{user} Du hast schon {max} Songs in der Warteschlange."},{"key":"queueFull","label":"Warteschlange voll","text":"@{user} Die Warteschlange ist voll."},{"key":"closed","label":"Request, obwohl geschlossen","text":"@{user} Songrequests sind gerade geschlossen."},{"key":"blacklisted","label":"Gesperrter Zuschauer wünscht etwas","text":"@{user} Du darfst gerade keine Songs wünschen."},{"key":"badLink","label":"Nicht unterstützter Link (z. B. SoundCloud)","text":"@{user} Bitte einen Songnamen, Spotify- oder YouTube-Link schicken."},{"key":"ytNotFound","label":"YouTube-Video nicht lesbar","text":"@{user} Das YouTube-Video konnte ich nicht öffnen (privat oder gelöscht?)."},{"key":"ytNoMatch","label":"YouTube-Video nicht auf Spotify","text":"@{user} \"{query}\" habe ich auf Spotify nicht gefunden."},{"key":"usage","label":"!sr ohne Song","text":"@{user} Benutze: !sr <Songname oder Spotify-Link>"},{"key":"song","label":"!song (Request läuft)","text":"@{user} Jetzt läuft: {song} (gewünscht von {requester}) {url}"},{"key":"songNoRequest","label":"!song (kein Request)","text":"@{user} Jetzt läuft: {song}"},{"key":"nothingPlaying","label":"!song (nichts läuft)","text":"@{user} Gerade läuft nichts."},{"key":"queue","label":"!queue","text":"@{user} {list}"},{"key":"queueEmpty","label":"!queue (leer)","text":"@{user} Die Warteschlange ist leer."},{"key":"removed","label":"!wrongsong","text":"@{user} {song} wurde entfernt."},{"key":"nothingToRemove","label":"!wrongsong (nichts da)","text":"@{user} Du hast keinen Song in der Warteschlange."},{"key":"skipped","label":"!skip","text":"@{user} Übersprungen."},{"key":"opened","label":"!sropen","text":"Songrequests sind offen! Benutze !sr <Song>"},{"key":"closedNow","label":"!srclose","text":"Songrequests sind geschlossen."},{"key":"blocked","label":"!srblock","text":"@{user} {target} darf keine Songs mehr wünschen."},{"key":"unblocked","label":"!srunblock","text":"@{user} {target} darf wieder Songs wünschen."},{"key":"pointsOnly","label":"!sr, obwohl nur Kanalpunkte erlaubt","text":"@{user} Songs wünschst du dir hier mit Kanalpunkten."},{"key":"pointsRefund","label":"Kanalpunkte-Wunsch fehlgeschlagen","text":"@{user} Das hat nicht geklappt, deine Kanalpunkte gibt dir ein Mod zurück."},{"key":"notConnected","label":"Spotify nicht verbunden","text":"@{user} Spotify ist noch nicht verbunden."},{"key":"error","label":"Fehler","text":"@{user} Da ist etwas schiefgelaufen, versuch es nochmal."}];
window.__SR_GROUPS = [{"id":"requests","label":"Song-Wünsche","keys":["added","duplicate","notFound","tooLong","usage","badLink","ytNotFound","ytNoMatch"]},{"id":"limits","label":"Limits & Sperren","keys":["userLimit","queueFull","closed","blacklisted"]},{"id":"points","label":"Kanalpunkte","keys":["pointsOnly","pointsRefund"]},{"id":"announce","label":"Ansagen","keys":["nowPlaying"]},{"id":"viewer","label":"Zuschauer-Befehle","keys":["song","songNoRequest","nothingPlaying","queue","queueEmpty","removed","nothingToRemove"]},{"id":"mod","label":"Mod-Befehle","keys":["skipped","opened","closedNow","blocked","unblocked"]},{"id":"system","label":"System","keys":["notConnected","error"]}];
// Demo-Modus für GitHub Pages: simuliert den Server komplett im Browser.
// Twitch-Chat, Spotify und Zuschauer-Wünsche sind ausgedacht; nichts verlässt den Browser.
// window.__SR_MESSAGES wird von scripts/build-demo.mjs aus src/messages.js eingesetzt.
(() => {
  const REPO = window.__SR_REPO;
  const CODE = 'DEMO42';
  window.SR_CODE = CODE;
  window.SR_ROUTES = {
    home: 'index.html',
    room: () => 'room.html',
    login: () => 'index.html',
    spotify: () => '#',
    admin: 'index.html',
  };

  // Cover als kleine Farbverläufe, damit keine fremden Bilder geladen werden
  const cover = (seed) => {
    const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,55%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},70%,35%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="40" font-family="sans-serif" font-size="22" font-weight="700" fill="white" text-anchor="middle">${seed.slice(0, 1)}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };
  const avatar = (name, h) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="hsl(${h},60%,45%)"/><text x="20" y="26" font-family="sans-serif" font-size="16" font-weight="700" fill="white" text-anchor="middle">${name[0]}</text></svg>`);

  const SONGS = [
    ['Blinding Lights', 'The Weeknd', 200], ['Numb', 'Linkin Park', 185], ['Mr. Brightside', 'The Killers', 222],
    ['Bohemian Rhapsody', 'Queen', 354], ['Dance Monkey', 'Tones And I', 209], ['Disturbia', 'Rihanna', 238],
    ['Levitating', 'Dua Lipa', 203], ['Smells Like Teen Spirit', 'Nirvana', 301], ['Titanium', 'David Guetta, Sia', 245],
    ['Wake Me Up', 'Avicii', 247], ['Sweater Weather', 'The Neighbourhood', 240], ['Believer', 'Imagine Dragons', 204],
  ];
  const FILLER = [['Lo-Fi Beats', 'Chill Radio', 150], ['Night Drive', 'Synthwave FM', 170]];
  const VIEWERS = ['pixelpanda', 'NachtEule', 'GG_Gamer', 'lisa_streams', 'KeksMonster', 'retro_rick'];
  const CHANNELS = ['demostreamer', 'mitstreamerin'];
  let n = 0;
  const id = () => 'demo-' + ++n;
  const track = ([name, artists, sec]) => ({ uri: 'spotify:track:' + name, name, artists, durationMs: sec * 1000, image: cover(name), url: null });
  const request = (song, user, channel) => ({ id: id(), ...track(song), user, login: user.toLowerCase(), userId: user, channel, addedAt: Date.now() });

  const M = window.__SR_MESSAGES;
  const s = {
    open: true,
    members: [
      { id: '1', login: 'demostreamer', displayName: 'DemoStreamer', image: avatar('D', 265), useChannel: true, rewardId: 'demo', spotify: 'DemoStreamer' },
      { id: '2', login: 'mitstreamerin', displayName: 'Mitstreamerin', image: avatar('M', 160), useChannel: true, rewardId: null, spotify: 'Mitstreamerin' },
    ],
    current: { ...request(SONGS[0], 'pixelpanda', 'demostreamer'), startedAt: Date.now() },
    queued: null,
    queue: [request(SONGS[1], 'NachtEule', 'mitstreamerin'), request(SONGS[2], 'GG_Gamer', 'demostreamer'), request(SONGS[3], 'lisa_streams', 'demostreamer')],
    history: [
      { ...request(SONGS[4], 'KeksMonster', 'mitstreamerin'), playedAt: Date.now() - 4 * 60_000 },
      { ...request(SONGS[5], 'retro_rick', 'demostreamer'), playedAt: Date.now() - 8 * 60_000 },
    ],
    playing: { ...track(SONGS[0]), progressMs: 42_000, isPlaying: true },
    blacklist: ['spambot3000'],
    requests: { maxPerUser: 3, maxQueueLength: 50, maxDurationMinutes: 8, announce: 'first', historySize: 50, modsBypassClosed: false, mode: 'both' },
    chat: { enabled: true, texts: {} },
    publicPage: true,
    overlay: { showAll: false },
    spotifyApp: { clientId: 'demo-client-id-1234', hasSecret: true },
    learning: null,
    log: [],
  };
  const log = (t) => {
    s.log.push(`${new Date().toLocaleTimeString('de-DE')} ${t}`);
    if (s.log.length > 25) s.log.shift();
  };
  const text = (k) => (k in s.chat.texts ? s.chat.texts[k] : M.find((m) => m.key === k)?.text) || '';
  const say = (key, vars) => {
    if (!s.chat.enabled || !text(key).trim()) return;
    log(`🤖 ${text(key).replace(/\{(\w+)\}/g, (a, k) => vars[k] ?? a)}`);
  };
  log('Demo gestartet: Bot im Chat von #demostreamer und #mitstreamerin');

  // --- Simulation: Songs laufen ab, Zuschauer wünschen sich etwas -----------
  function advance() {
    if (s.current) s.history.unshift({ ...s.current, playedAt: Date.now() });
    s.history.length = Math.min(s.history.length, s.requests.historySize);
    const next = s.queued || s.queue.shift();
    s.queued = null;
    if (next) {
      s.current = { ...next, startedAt: Date.now() };
      s.playing = { ...next, progressMs: 0, isPlaying: true };
      say('nowPlaying', { song: `${next.name} – ${next.artists}`, requester: next.user, user: next.user });
    } else {
      s.current = null;
      s.playing = { ...track(FILLER[Math.floor(Math.random() * FILLER.length)]), progressMs: 0, isPlaying: true };
    }
  }
  setInterval(() => {
    const p = s.playing;
    if (!p.isPlaying) return;
    p.progressMs += 1000;
    const left = p.durationMs - p.progressMs;
    if (left < 15_000 && !s.queued && s.queue.length) {
      s.queued = { ...s.queue.shift(), queuedAt: Date.now() };
      log(`In Spotify eingereiht: ${s.queued.name} – ${s.queued.artists}`);
    }
    if (left <= 0) advance();
  }, 1000);
  setInterval(() => {
    if (!s.open || s.queue.length > 6 || Math.random() < 0.4) return;
    const user = VIEWERS[Math.floor(Math.random() * VIEWERS.length)];
    const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
    const free = SONGS.filter(([t]) => ![s.current, s.queued, ...s.queue].some((e) => e && e.name === t));
    const song = free[Math.floor(Math.random() * free.length)];
    if (!song) return;
    const viaPoints = s.requests.mode !== 'command' && Math.random() < 0.4;
    log(`#${channel} ${user}${viaPoints ? ' (Kanalpunkte)' : ''}: ${viaPoints ? '' : '!sr '}${song[0]}`);
    if (s.blacklist.includes(user.toLowerCase())) return say('blacklisted', { user });
    s.queue.push(request(song, user, channel));
    say('added', { user, song: `${song[0]} – ${song[1]}`, pos: s.queue.length + (s.queued ? 1 : 0) });
  }, 9000);

  // --- Antworten wie der echte Server ---------------------------------------
  const view = () => ({
    code: CODE,
    me: { id: '1', isOwner: true },
    maxMembers: 5,
    members: s.members.map((m) => ({
      id: m.id, login: m.login, displayName: m.displayName, image: m.image, useChannel: m.useChannel,
      rewardLinked: !!m.rewardId, learning: s.learning === m.id, isOwner: m.id === '1', isMe: m.id === '1',
      spotify: { connected: !!m.spotify, displayName: m.spotify, product: 'premium', error: null },
    })),
    spotifyReady: true,
    bot: { connected: true, login: 'songsharebot' },
    open: s.open,
    current: s.current,
    queued: s.queued,
    playback: { ...s.playing, device: 'DEMO-PC' },
    queue: s.queue,
    history: s.history,
    blacklist: s.blacklist,
    log: s.log.slice(-25),
    settings: {
      spotifyApp: s.spotifyApp,
      requests: s.requests,
      chat: { enabled: s.chat.enabled, messages: M.map((m) => ({ key: m.key, label: m.label, default: m.text, text: text(m.key) })), groups: window.__SR_GROUPS },
      publicPage: s.publicPage,
      overlay: s.overlay,
      blacklist: s.blacklist,
    },
    links: { room: location.href, join: new URL(`index.html?join=${CODE}`, location.href).href, overlay: new URL('overlay.html', location.href).href, public: new URL('live.html', location.href).href },
    redirect: { spotify: 'https://deine-domain.de/callback/spotify' },
  });
  const strip = (e) => e && { name: e.name, artists: e.artists, image: e.image, user: e.user, durationMs: e.durationMs };
  const publicView = () => ({
    code: CODE,
    channels: s.members.filter((m) => m.useChannel).map((m) => m.login),
    open: s.open,
    current: strip(s.current),
    queued: strip(s.queued),
    queue: s.queue.map(strip),
    playback: { name: s.playing.name, artists: s.playing.artists, image: s.playing.image, progressMs: s.playing.progressMs, durationMs: s.playing.durationMs, isPlaying: s.playing.isPlaying, requested: !!s.current && s.playing.uri === s.current.uri },
    overlayShowAll: s.overlay.showAll,
  });

  const demoOnly = (what) => { throw Object.assign(new Error(`In der Demo nicht möglich: ${what}. Probier es auf deinem eigenen Server aus.`), { status: 400 }); };

  function action(name, b) {
    const findIdx = () => s.queue.findIndex((e) => e.id === b.id);
    switch (name) {
      case 'skip': s.playing.progressMs = s.playing.durationMs; advance(); break;
      case 'remove': if (findIdx() >= 0) s.queue.splice(findIdx(), 1); break;
      case 'move': {
        const i = findIdx(), j = i + (b.dir > 0 ? 1 : -1);
        if (i >= 0 && j >= 0 && j < s.queue.length) [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
        break;
      }
      case 'clear': s.queue.length = 0; break;
      case 'open': s.open = !!b.open; break;
      case 'blacklist': {
        const u = String(b.user || '').trim().replace(/^@/, '').toLowerCase();
        if (b.add) {
          if (!/^[a-z0-9_]{1,25}$/.test(u)) throw Object.assign(new Error('Das ist kein gültiger Twitch-Name.'), { status: 400 });
          if (!s.blacklist.includes(u)) s.blacklist.push(u);
        } else s.blacklist = s.blacklist.filter((x) => x !== u);
        break;
      }
      case 'history-clear': s.history.length = 0; break;
      case 'requeue': {
        const h = s.history.find((e) => e.id === b.id);
        if (h) s.queue.push({ ...h, id: id(), addedAt: Date.now() });
        break;
      }
      case 'settings': {
        if (b.spotifyApp) {
          if (String(b.spotifyApp.clientId || '').length < 8) throw Object.assign(new Error('Spotify kennt diese Client-ID / dieses Secret nicht. Bitte nochmal aus dem Dashboard kopieren.'), { status: 400 });
          s.spotifyApp = { clientId: b.spotifyApp.clientId, hasSecret: true };
        }
        if (b.requests) {
          const r = b.requests, q = s.requests;
          for (const k of ['maxPerUser', 'maxQueueLength', 'maxDurationMinutes', 'historySize']) if (r[k] !== undefined) q[k] = Math.max(1, Math.round(Number(r[k])) || q[k]);
          if (r.announce) q.announce = r.announce;
          if ('modsBypassClosed' in r) q.modsBypassClosed = !!r.modsBypassClosed;
          if (r.mode) q.mode = r.mode;
        }
        if (b.chat) {
          if ('enabled' in b.chat) s.chat.enabled = !!b.chat.enabled;
          for (const [k, v] of Object.entries(b.chat.texts || {})) s.chat.texts[k] = v;
        }
        if ('publicPage' in b) s.publicPage = !!b.publicPage;
        if (b.overlay) s.overlay.showAll = !!b.overlay.showAll;
        break;
      }
      case 'channel': s.members[0].useChannel = !!b.use; break;
      case 'reward-learn':
        s.learning = '1';
        setTimeout(() => { s.members[0].rewardId = 'demo'; s.learning = null; log('Kanalpunkte-Belohnung für #demostreamer verknüpft'); }, 4000);
        break;
      case 'reward-unlink': s.members[0].rewardId = null; break;
      case 'spotify-disconnect': demoOnly('Spotify trennen'); break;
      case 'kick': demoOnly('Mitglieder entfernen'); break;
      case 'overlay-reset': demoOnly('Overlay-Link erneuern'); break;
      case 'delete': case 'leave': demoOnly('Raum löschen/verlassen'); break;
      default: throw Object.assign(new Error('Nicht gefunden'), { status: 404 });
    }
    return view();
  }

  function route(method, path, body) {
    if (path.endsWith('/logout')) return { ok: true };
    const p = path.slice(path.indexOf('/api/'));
    if (method === 'GET') {
      if (p === '/api/me') return {
        user: { id: '1', login: 'demostreamer', displayName: 'DemoStreamer', image: s.members[0].image },
        isAdmin: false,
        rooms: [{ code: CODE, owner: 'DemoStreamer', isOwner: true, members: s.members.map((m) => m.displayName) }],
      };
      if (p.startsWith('/api/r/')) return view();
      if (p.startsWith('/api/live/')) {
        if (!s.publicPage) throw Object.assign(new Error('Nicht gefunden'), { status: 404 });
        return publicView();
      }
      if (p.startsWith('/api/overlay/')) return publicView();
    } else {
      if (p === '/api/rooms' || p === '/api/join') return { code: CODE };
      const m = p.match(/^\/api\/r\/[^/]+\/([a-z-]+)$/);
      if (m) return action(m[1], body || {});
    }
    throw Object.assign(new Error('Nicht gefunden'), { status: 404 });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.includes('/api/') && !url.pathname.endsWith('/logout')) return realFetch(input, opts);
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    try {
      return json(200, route((opts.method || 'GET').toUpperCase(), url.pathname, opts.body ? JSON.parse(opts.body) : null));
    } catch (e) {
      return json(e.status || 400, { error: e.message });
    }
  };

  // Hinweis-Leiste oben (nicht im Overlay)
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.overlay) return;
    const bar = document.createElement('div');
    bar.style.cssText = 'background:#2a1f45;color:#e9e2ff;padding:10px 16px;font:14px system-ui,sans-serif;text-align:center;border-bottom:1px solid #4c3a7a';
    bar.innerHTML = `🧪 <b>Demo mit Beispieldaten:</b> Twitch, Spotify und die Zuschauer sind simuliert, alle 9 Sekunden kommt ein Wunsch rein. · <a style="color:#c4a7ff" href="${REPO}">Code &amp; Anleitung auf GitHub</a>`;
    document.body.prepend(bar);
  });
})();
