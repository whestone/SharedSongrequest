import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { SpotifyAuth, SpotifyAccount } from './spotify.js';
import { TwitchAuth, TwitchChat } from './twitch.js';
import { Player } from './player.js';
import { createCommands, aliases } from './commands.js';
import { MESSAGES, DEFAULT_TEXTS, format, songVars } from './messages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8888;

// --- Log ---------------------------------------------------------------
const logLines = [];
function log(text) {
  const line = `${new Date().toLocaleTimeString('de-DE')} ${text}`;
  console.log(line);
  logLines.push(line);
  if (logLines.length > 50) logLines.shift();
}

// --- Einstellungen -----------------------------------------------------
// Alles wird über die Weboberfläche eingetragen und in data/state.json gespeichert.
const store = new Store(path.join(root, 'data', 'state.json'));
const cfg = (store.data.settings ||= {});
cfg.twitch ||= { clientId: '', clientSecret: '' };
cfg.spotify ||= { clientId: '', clientSecret: '' };
cfg.channels ||= [];
cfg.accounts ||= ['Spieler 1', 'Spieler 2'];
cfg.requests = {
  maxPerUser: 3,
  maxQueueLength: 50,
  maxDurationMinutes: 8,
  announce: 'first',
  historySize: 50,
  modsBypassClosed: false,
  ...cfg.requests,
};
cfg.chat = { enabled: true, texts: {}, ...cfg.chat };
cfg.blacklist ||= [];
store.data.history ||= [];
store.save();
const settings = cfg.requests;

const blacklist = {
  has: (name) => !!name && cfg.blacklist.includes(String(name).toLowerCase()),
  add(name) {
    name = String(name).trim().replace(/^@/, '').toLowerCase();
    if (name && !cfg.blacklist.includes(name)) cfg.blacklist.push(name);
    store.save();
  },
  remove(name) {
    name = String(name).trim().replace(/^@/, '').toLowerCase();
    cfg.blacklist = cfg.blacklist.filter((n) => n !== name);
    store.save();
  },
};

const text = (key) => (key in cfg.chat.texts ? cfg.chat.texts[key] : DEFAULT_TEXTS[key]) ?? '';
function sendChat(channel, key, vars) {
  if (!cfg.chat.enabled) return;
  const t = text(key);
  if (t.trim()) chat.say(channel, format(t, vars));
}

// --- Setup -------------------------------------------------------------
const redirect = {
  twitch: `http://localhost:${port}/callback/twitch`,
  spotify: `http://127.0.0.1:${port}/callback/spotify`,
};
const spotifyAuth = new SpotifyAuth(() => cfg.spotify, redirect.spotify);
const accounts = [];
function syncAccounts() {
  cfg.accounts.forEach((name, slot) => {
    if (accounts[slot]) accounts[slot].name = name;
    else accounts[slot] = new SpotifyAccount({ slot, name, auth: spotifyAuth, store });
  });
  accounts.length = cfg.accounts.length;
}
syncAccounts();
const twitchAuth = new TwitchAuth(() => cfg.twitch, redirect.twitch, store);
const chat = new TwitchChat({ auth: twitchAuth, channels: cfg.channels, log });
const player = new Player({ store, accounts, log });
const commands = createCommands({ player, accounts, settings, blacklist });

const configured = () => ({
  twitch: !!(cfg.twitch.clientId && cfg.twitch.clientSecret),
  spotify: !!(cfg.spotify.clientId && cfg.spotify.clientSecret),
  channels: cfg.channels.length > 0,
});

async function saveSettings(body) {
  if (body.twitch) {
    const clientId = String(body.twitch.clientId || '').trim();
    const clientSecret = String(body.twitch.clientSecret || '').trim() || cfg.twitch.clientSecret;
    if (!clientId || !clientSecret) throw new Error('Bitte Client-ID und Client-Secret von Twitch eintragen.');
    await TwitchAuth.verify(clientId, clientSecret);
    if (clientId !== cfg.twitch.clientId) {
      // Alte Logins gehören zur alten App
      chat.stop();
      delete store.data.twitch;
    }
    cfg.twitch = { clientId, clientSecret };
    log('Twitch-App gespeichert');
  }
  if (body.spotify) {
    const clientId = String(body.spotify.clientId || '').trim();
    const clientSecret = String(body.spotify.clientSecret || '').trim() || cfg.spotify.clientSecret;
    if (!clientId || !clientSecret) throw new Error('Bitte Client-ID und Client-Secret von Spotify eintragen.');
    await SpotifyAuth.verify(clientId, clientSecret);
    if (clientId !== cfg.spotify.clientId) accounts.forEach((a) => a.disconnect());
    cfg.spotify = { clientId, clientSecret };
    log('Spotify-App gespeichert');
  }
  if (body.channels) {
    const list = (Array.isArray(body.channels) ? body.channels : String(body.channels).split(/[\s,]+/))
      .map((c) => String(c).trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, ''))
      .filter((c) => /^\w{3,25}$/.test(c));
    if (!list.length) throw new Error('Bitte mindestens einen gültigen Twitch-Kanalnamen eintragen.');
    cfg.channels = [...new Set(list)];
    chat.setChannels(cfg.channels);
    log(`Kanäle: ${cfg.channels.join(', ')}`);
  }
  if (body.accounts) {
    const names = body.accounts.map((n) => String(n).trim().slice(0, 30)).filter(Boolean).slice(0, 6);
    if (!names.length) throw new Error('Mindestens ein Spotify-Account wird gebraucht.');
    cfg.accounts = names;
    syncAccounts();
  }
  if (body.requests) {
    const r = body.requests;
    const num = (v, min, max, def) => Math.min(max, Math.max(min, Math.round(Number(v)) || def));
    settings.maxPerUser = num(r.maxPerUser, 1, 50, settings.maxPerUser);
    settings.maxQueueLength = num(r.maxQueueLength, 1, 500, settings.maxQueueLength);
    settings.maxDurationMinutes = num(r.maxDurationMinutes, 1, 60, settings.maxDurationMinutes);
    if (['first', 'all', 'off'].includes(r.announce)) settings.announce = r.announce;
    settings.historySize = num(r.historySize, 1, 500, settings.historySize);
    if ('modsBypassClosed' in r) settings.modsBypassClosed = !!r.modsBypassClosed;
    store.data.history.length = Math.min(store.data.history.length, settings.historySize);
  }
  if (body.chat) {
    if ('enabled' in body.chat) cfg.chat.enabled = !!body.chat.enabled;
    if (body.chat.texts) {
      for (const { key } of MESSAGES) {
        if (!(key in body.chat.texts)) continue;
        const t = String(body.chat.texts[key]).slice(0, 400);
        if (t === DEFAULT_TEXTS[key]) delete cfg.chat.texts[key];
        else cfg.chat.texts[key] = t;
      }
    }
  }
  if (body.blacklist) {
    const names = (Array.isArray(body.blacklist) ? body.blacklist : String(body.blacklist).split(/[\s,]+/))
      .map((n) => String(n).trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    cfg.blacklist = [...new Set(names)];
  }
  store.save();
}

chat.on('message', async (msg) => {
  const m = msg.text.match(/^!(\w+)\s*(.*)$/s);
  if (!m) return;
  const name = aliases[m[1].toLowerCase()] || m[1].toLowerCase();
  const cmd = commands[name];
  if (!cmd) return;
  log(`#${msg.channel} ${msg.user}: ${msg.text.slice(0, 80)}`);
  const say = (key, vars = {}) => sendChat(msg.channel, key, { user: msg.user, ...vars });
  try {
    await cmd(msg, m[2].trim(), say);
  } catch (e) {
    log(`Fehler bei !${name}: ${e.message}`);
    say('error');
  }
});

player.on('nowPlaying', (c) => {
  store.data.history.unshift({ ...c, playedAt: Date.now() });
  store.data.history.length = Math.min(store.data.history.length, settings.historySize);
  store.save();
  if (settings.announce === 'off') return;
  const channels = settings.announce === 'all' ? chat.channels : chat.channels.slice(0, 1);
  for (const ch of channels) sendChat(ch, 'nowPlaying', { ...songVars(c), requester: c.user, user: c.user });
});

// --- OAuth-States ------------------------------------------------------
const pendingStates = new Map();
function newState(data) {
  const id = crypto.randomBytes(16).toString('hex');
  pendingStates.set(id, { ...data, at: Date.now() });
  return id;
}
function takeState(id) {
  const s = pendingStates.get(id);
  pendingStates.delete(id);
  return s && Date.now() - s.at < 30 * 60_000 ? s : null;
}

async function finishSpotify(code, state) {
  const s = takeState(state);
  if (!s || s.kind !== 'spotify') throw new Error('Ungültiger oder abgelaufener Login-Link – bitte neu erzeugen');
  const acc = accounts[s.slot];
  await acc.connectWithCode(code);
  log(`${acc.name}: Spotify verbunden als ${acc.saved.displayName} (${acc.saved.product})`);
}

// --- HTTP --------------------------------------------------------------
function state() {
  return {
    port,
    open: player.open,
    current: player.current,
    queued: player.queued,
    playback: player.playback,
    queue: player.queue,
    twitch: { connected: chat.connected, login: twitchAuth.saved?.login, linked: !!twitchAuth.saved?.refreshToken, channels: chat.channels },
    accounts: accounts.map((a) => ({
      slot: a.slot,
      name: a.name,
      connected: a.connected,
      displayName: a.saved?.displayName,
      product: a.saved?.product,
      error: a.error,
    })),
    log: logLines.slice(-20),
    history: store.data.history,
    blacklist: cfg.blacklist,
    configured: configured(),
    settings: {
      twitch: { clientId: cfg.twitch.clientId, hasSecret: !!cfg.twitch.clientSecret },
      spotify: { clientId: cfg.spotify.clientId, hasSecret: !!cfg.spotify.clientSecret },
      channels: cfg.channels,
      accounts: cfg.accounts,
      requests: settings,
      chat: {
        enabled: cfg.chat.enabled,
        messages: MESSAGES.map((m) => ({ key: m.key, label: m.label, default: m.text, text: text(m.key) })),
      },
      blacklist: cfg.blacklist,
      redirect,
    },
  };
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function page(res, file) {
  send(res, 200, fs.readFileSync(path.join(root, 'public', file)), 'text/html; charset=utf-8');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function message(res, title, text) {
  send(res, 200, `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:sans-serif;background:#18181b;color:#eee;padding:2rem"><h2>${esc(title)}</h2><p>${esc(text)}</p><p><a style="color:#a78bfa" href="/">Zurück</a></p>`, 'text/html; charset=utf-8');
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

const allowedOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`];

async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const p = url.pathname;

  if (req.method === 'GET') {
    if (p === '/') return page(res, 'index.html');
    if (p === '/overlay') return page(res, 'overlay.html');
    if (p === '/api/state') return send(res, 200, state());

    if (p === '/auth/twitch') {
      if (!configured().twitch) return message(res, 'Twitch noch nicht eingerichtet', 'Trag zuerst Client-ID und Secret auf der Startseite ein.');
      res.writeHead(302, { Location: twitchAuth.authorizeUrl(newState({ kind: 'twitch' })) });
      return res.end();
    }
    if (p === '/callback/twitch') {
      const s = takeState(url.searchParams.get('state'));
      if (!s || s.kind !== 'twitch') return message(res, 'Fehler', 'Ungültiger Login-Versuch, bitte neu starten.');
      if (url.searchParams.get('error')) return message(res, 'Abgebrochen', url.searchParams.get('error_description') || '');
      await twitchAuth.connectWithCode(url.searchParams.get('code'));
      log(`Twitch-Bot verbunden als ${twitchAuth.saved.login}`);
      chat.start();
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    if (/^\/(auth\/spotify|api\/spotify-link)\//.test(p) && !configured().spotify) {
      return message(res, 'Spotify noch nicht eingerichtet', 'Trag zuerst Client-ID und Secret auf der Startseite ein.');
    }
    const auth = p.match(/^\/auth\/spotify\/(\d+)$/);
    if (auth && accounts[auth[1]]) {
      res.writeHead(302, { Location: spotifyAuth.authorizeUrl(newState({ kind: 'spotify', slot: Number(auth[1]) })) });
      return res.end();
    }
    const link = p.match(/^\/api\/spotify-link\/(\d+)$/);
    if (link && accounts[link[1]]) {
      return send(res, 200, { url: spotifyAuth.authorizeUrl(newState({ kind: 'spotify', slot: Number(link[1]) })) });
    }
    if (p === '/callback/spotify') {
      if (url.searchParams.get('error')) return message(res, 'Abgebrochen', url.searchParams.get('error'));
      await finishSpotify(url.searchParams.get('code'), url.searchParams.get('state'));
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    return send(res, 404, { error: 'Nicht gefunden' });
  }

  if (req.method === 'POST') {
    if (!allowedOrigins.includes(req.headers.origin)) return send(res, 403, { error: 'Nicht erlaubt' });
    const body = await readJson(req);
    switch (p) {
      case '/api/settings':
        await saveSettings(body);
        break;
      case '/api/skip':
        await player.skip();
        break;
      case '/api/remove':
        player.remove(body.id);
        break;
      case '/api/move':
        player.move(body.id, body.dir > 0 ? 1 : -1);
        break;
      case '/api/clear':
        player.clear();
        break;
      case '/api/blacklist':
        if (body.add) blacklist.add(body.user);
        else blacklist.remove(body.user);
        break;
      case '/api/history-clear':
        store.data.history.length = 0;
        store.save();
        break;
      case '/api/requeue': {
        // Song aus dem Verlauf nochmal hinten anstellen
        const h = store.data.history.find((e) => e.id === body.id);
        if (h) {
          const { id, startedAt, playedAt, queuedAt, kicked, addedAt, ...track } = h;
          player.add(track, {});
        }
        break;
      }
      case '/api/open':
        player.setOpen(body.open);
        break;
      case '/api/spotify-paste': {
        // Antwort-URL vom Freund: http://127.0.0.1:8888/callback/spotify?code=...&state=...
        const u = new URL(String(body.url || '').trim());
        if (u.searchParams.get('error')) throw new Error(`Spotify meldet: ${u.searchParams.get('error')}`);
        await finishSpotify(u.searchParams.get('code'), u.searchParams.get('state'));
        break;
      }
      case '/api/spotify-disconnect':
        accounts[body.slot]?.disconnect();
        break;
      case '/api/twitch-disconnect':
        chat.stop();
        delete store.data.twitch;
        store.save();
        break;
      default:
        return send(res, 404, { error: 'Nicht gefunden' });
    }
    return send(res, 200, state());
  }
  send(res, 405, { error: 'Methode nicht erlaubt' });
}

function onRequest(req, res) {
  handle(req, res).catch((e) => {
    log(`Fehler: ${e.message}`);
    if (!res.headersSent) {
      if (req.method === 'GET') message(res, 'Fehler', e.message);
      else send(res, 400, { error: e.message });
    }
  });
}

// IPv4 und IPv6 lokal, damit sowohl 127.0.0.1 als auch localhost funktionieren.
for (const host of ['127.0.0.1', '::1']) {
  const server = http.createServer(onRequest);
  server.on('error', (e) => {
    if (host === '127.0.0.1') {
      console.error(`Server konnte nicht starten (${e.message}). Läuft der Bot schon oder ist Port ${port} belegt?`);
      process.exit(1);
    }
  });
  server.listen(port, host);
}

log(`Songrequest-Bot läuft: http://127.0.0.1:${port}  (Overlay: http://127.0.0.1:${port}/overlay)`);
if (configured().twitch && twitchAuth.saved?.refreshToken) chat.start();
player.start();
