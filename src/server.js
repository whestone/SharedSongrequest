import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config, checkConfig, root } from './config.js';
import { deriveKey, randomId, safeEqual } from './crypto.js';
import { Store } from './store.js';
import { Sessions } from './sessions.js';
import { TwitchAuth, TwitchChat } from './twitch.js';
import { RoomManager } from './rooms.js';

checkConfig();

function log(text) {
  console.log(`${new Date().toISOString()} ${text}`);
}

// --- Setup -------------------------------------------------------------
const key = deriveKey(config.secretKey);
const globalStore = new Store(path.join(config.dataDir, 'global.json'), key);
const sessions = new Sessions(globalStore, config.publicUrl.startsWith('https://'));
const twitchAuth = new TwitchAuth(() => config.twitch, config.redirect.twitch, globalStore, 'bot');
const bot = new TwitchChat({ auth: twitchAuth, channels: [], log });
const rooms = new RoomManager({ key, bot, log });
if (twitchAuth.saved?.refreshToken) bot.start();
else log('Bot-Account ist noch nicht verbunden: als Admin unter /admin anmelden.');

// --- OAuth-States ------------------------------------------------------
const pending = new Map();
function newState(data) {
  const id = randomId(18);
  pending.set(id, { ...data, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60_000) pending.delete(k);
  return id;
}
function takeState(id) {
  const s = pending.get(id);
  pending.delete(id);
  return s && Date.now() - s.at < 30 * 60_000 ? s : null;
}

// --- Helfer ------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isAdmin = (user) => !!user && config.admins.includes(user.login);
const safeNext = (n) => (typeof n === 'string' && /^\/[\w\-/?=&.%]*$/.test(n) && !n.startsWith('//') ? n : '/');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function page(res, file) {
  send(res, 200, fs.readFileSync(path.join(root, 'public', file)), 'text/html; charset=utf-8');
}

function message(res, title, text, status = 200) {
  send(
    res,
    status,
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;background:#0f0f12;color:#ececf1;padding:2rem;max-width:640px;margin:auto">` +
      `<h2>${esc(title)}</h2><p>${esc(text)}</p><p><a style="color:#c4a7ff" href="/">Zur Startseite</a></p>`,
    'text/html; charset=utf-8',
  );
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Anfrage zu groß');
  }
  return body ? JSON.parse(body) : {};
}

const origin = new URL(config.publicUrl).origin;
const allowedOrigins = config.local
  ? [origin, `http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]
  : [origin];

class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}

function requireRoom(code, user) {
  const room = rooms.get(code);
  if (!room) throw new HttpError(404, 'Diesen Raum gibt es nicht.');
  if (!user || !room.member(user.id)) throw new HttpError(403, 'Du bist kein Mitglied dieses Raums.');
  return room;
}

// --- Routen ------------------------------------------------------------
async function handle(req, res) {
  const url = new URL(req.url, config.publicUrl);
  const p = url.pathname;
  const user = sessions.get(req);
  let m;

  if (req.method === 'GET') {
    if (p === '/') return page(res, 'home.html');
    if (p === '/style.css') return send(res, 200, fs.readFileSync(path.join(root, 'public', 'style.css')), 'text/css; charset=utf-8');
    if (p === '/common.js') return send(res, 200, fs.readFileSync(path.join(root, 'public', 'common.js')), 'text/javascript; charset=utf-8');
    if ((m = p.match(/^\/join\/([A-Za-z0-9]{4,10})$/))) return redirect(res, `/?join=${m[1].toUpperCase()}`);
    if ((m = p.match(/^\/r\/([A-Za-z0-9]{4,10})$/))) {
      if (!user) return redirect(res, `/auth/twitch?next=${encodeURIComponent(p)}`);
      return page(res, 'room.html');
    }
    if (/^\/r\/[A-Za-z0-9]{4,10}\/overlay$/.test(p)) return page(res, 'overlay.html');
    if (/^\/r\/[A-Za-z0-9]{4,10}\/live$/.test(p)) return page(res, 'live.html');
    if (p === '/admin') return page(res, 'admin.html');

    // Login mit Twitch (nur zur Identifizierung)
    if (p === '/auth/twitch') {
      return redirect(res, twitchAuth.userLoginUrl(newState({ kind: 'login', next: safeNext(url.searchParams.get('next')) })));
    }
    // Bot-Account verbinden (nur Admins)
    if (p === '/auth/bot') {
      if (!isAdmin(user)) return message(res, 'Kein Zugriff', 'Nur Admins können den Bot-Account verbinden.', 403);
      return redirect(res, twitchAuth.authorizeUrl(newState({ kind: 'bot' })));
    }
    if (p === '/callback/twitch') {
      const s = takeState(url.searchParams.get('state'));
      if (url.searchParams.get('error')) return message(res, 'Abgebrochen', url.searchParams.get('error_description') || 'Login abgebrochen.');
      if (!s) return message(res, 'Login abgelaufen', 'Bitte nochmal versuchen.', 400);
      if (s.kind === 'bot') {
        await twitchAuth.connectWithCode(url.searchParams.get('code'));
        log(`Bot-Account verbunden: ${twitchAuth.saved.login}`);
        bot.start();
        return redirect(res, '/admin');
      }
      const who = await twitchAuth.identify(url.searchParams.get('code'));
      sessions.create(res, who);
      // Profil in allen Räumen aktuell halten
      for (const room of rooms.roomsOf(who.id)) {
        Object.assign(room.member(who.id), { login: who.login, displayName: who.displayName, image: who.image });
        room.save();
      }
      return redirect(res, s.next || '/');
    }

    // Spotify des eingeloggten Mitglieds verbinden
    if ((m = p.match(/^\/auth\/spotify\/([A-Za-z0-9]{4,10})$/))) {
      if (!user) return redirect(res, `/auth/twitch?next=${encodeURIComponent(p)}`);
      const room = requireRoom(m[1], user);
      if (!room.spotifyReady) return message(res, 'Noch nicht bereit', 'Der Raum-Besitzer muss zuerst die Spotify-App eintragen.');
      return redirect(res, room.auth.authorizeUrl(newState({ kind: 'spotify', code: room.code, userId: user.id })));
    }
    if (p === '/callback/spotify') {
      const s = takeState(url.searchParams.get('state'));
      if (!s || s.kind !== 'spotify') return message(res, 'Login abgelaufen', 'Bitte nochmal versuchen.', 400);
      const back = `${config.publicUrl}/r/${s.code}`;
      if (url.searchParams.get('error')) return redirect(res, back);
      const room = rooms.get(s.code);
      if (!room) return message(res, 'Fehler', 'Der Raum existiert nicht mehr.', 404);
      try {
        await room.connectSpotify(s.userId, url.searchParams.get('code'));
      } catch (e) {
        return message(res, 'Spotify-Verbindung fehlgeschlagen', e.message, 400);
      }
      return redirect(res, back);
    }

    // --- API (lesen) ---
    if (p === '/api/me') {
      if (!user) return send(res, 200, { user: null });
      return send(res, 200, {
        user: { id: user.id, login: user.login, displayName: user.displayName, image: user.image },
        isAdmin: isAdmin(user),
        rooms: rooms.roomsOf(user.id).map((r) => ({
          code: r.code,
          owner: r.owner?.displayName,
          isOwner: r.data.ownerId === user.id,
          members: r.data.members.map((x) => x.displayName),
        })),
      });
    }
    if ((m = p.match(/^\/api\/r\/([A-Za-z0-9]{4,10})$/))) return send(res, 200, requireRoom(m[1], user).view(user.id));
    if ((m = p.match(/^\/api\/live\/([A-Za-z0-9]{4,10})$/))) {
      const room = rooms.get(m[1]);
      if (!room || !room.data.publicPage) return send(res, 404, { error: 'Nicht gefunden' });
      return send(res, 200, room.publicView());
    }
    if ((m = p.match(/^\/api\/overlay\/([A-Za-z0-9]{4,10})$/))) {
      const room = rooms.get(m[1]);
      if (!room || !safeEqual(url.searchParams.get('k') || '', room.data.overlayKey)) return send(res, 404, { error: 'Nicht gefunden' });
      return send(res, 200, room.publicView());
    }
    if (p === '/api/admin') {
      if (!isAdmin(user)) return send(res, 403, { error: 'Kein Zugriff' });
      return send(res, 200, {
        bot: { ...rooms.botStatus(), linked: !!twitchAuth.saved?.refreshToken, channels: bot.channels.length },
        rooms: [...rooms.rooms.values()].map((r) => ({
          code: r.code,
          owner: r.owner?.login,
          members: r.data.members.length,
          channels: r.channels,
          queue: r.player.queue.length,
        })),
        twitchRedirect: config.redirect.twitch,
        spotifyRedirect: config.redirect.spotify,
      });
    }
    return send(res, 404, { error: 'Nicht gefunden' });
  }

  if (req.method === 'POST') {
    if (!allowedOrigins.includes(req.headers.origin)) return send(res, 403, { error: 'Nicht erlaubt' });
    if (p === '/logout') {
      sessions.destroy(req, res);
      return send(res, 200, { ok: true });
    }
    if (!user) return send(res, 401, { error: 'Bitte zuerst mit Twitch anmelden.' });
    const body = await readJson(req);

    if (p === '/api/rooms') return send(res, 200, { code: rooms.create(user).code });
    if (p === '/api/join') return send(res, 200, { code: rooms.join(body.code, user).code });

    if ((m = p.match(/^\/api\/r\/([A-Za-z0-9]{4,10})\/([a-z-]+)$/))) {
      const room = requireRoom(m[1], user);
      const owner = room.data.ownerId === user.id;
      const ownerOnly = () => {
        if (!owner) throw new HttpError(403, 'Das darf nur der Raum-Besitzer.');
      };
      const pl = room.player;
      switch (m[2]) {
        case 'skip':
          await pl.skip();
          break;
        case 'remove':
          pl.remove(body.id);
          break;
        case 'move':
          pl.move(body.id, body.dir > 0 ? 1 : -1);
          break;
        case 'clear':
          pl.clear();
          break;
        case 'open':
          pl.setOpen(body.open);
          break;
        case 'blacklist':
          if (body.add) room.blacklist().add(body.user);
          else room.blacklist().remove(body.user);
          break;
        case 'history-clear':
          room.data.history.length = 0;
          room.save();
          break;
        case 'requeue': {
          const h = room.data.history.find((e) => e.id === body.id);
          if (h) {
            const { id, startedAt, playedAt, queuedAt, kicked, addedAt, ...track } = h;
            pl.add(track, {});
          }
          break;
        }
        case 'settings':
          await room.saveSettings(body, user.id);
          break;
        case 'channel':
          room.setUseChannel(user.id, body.use);
          break;
        case 'spotify-disconnect':
          room.accounts.find((a) => a.id === user.id)?.disconnect();
          break;
        case 'leave':
          rooms.removeMember(room, user.id);
          return send(res, 200, { left: true });
        case 'kick':
          ownerOnly();
          rooms.removeMember(room, body.memberId);
          break;
        case 'overlay-reset':
          ownerOnly();
          room.data.overlayKey = randomId(18);
          room.save();
          break;
        case 'delete':
          ownerOnly();
          rooms.delete(room);
          return send(res, 200, { deleted: true });
        default:
          return send(res, 404, { error: 'Nicht gefunden' });
      }
      return send(res, 200, room.view(user.id));
    }
    return send(res, 404, { error: 'Nicht gefunden' });
  }
  send(res, 405, { error: 'Methode nicht erlaubt' });
}

function onRequest(req, res) {
  handle(req, res).catch((e) => {
    const status = e.status || 400;
    if (!e.status) log(`Fehler bei ${req.method} ${req.url.split('?')[0]}: ${e.message}`);
    if (res.headersSent) return;
    if (req.method === 'GET' && !req.url.startsWith('/api/')) message(res, 'Fehler', e.message, status);
    else send(res, status, { error: e.message });
  });
}

// Lokal nur auf diesem PC erreichbar, auf dem Server hinter einem Reverse-Proxy (HTTPS)
const host = process.env.HOST || (config.local ? '127.0.0.1' : '0.0.0.0');
http.createServer(onRequest).listen(config.port, host);
if (config.local) http.createServer(onRequest).listen(config.port, '::1').on('error', () => {});
log(`Shared Songrequest läuft auf ${config.publicUrl} (Port ${config.port})`);

// Beim Beenden noch alles speichern
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    globalStore.flush();
    for (const r of rooms.rooms.values()) r.store.flush();
    process.exit(0);
  });
}
