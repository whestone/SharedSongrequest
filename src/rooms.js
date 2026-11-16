import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { roomCode, randomId } from './crypto.js';
import { SpotifyAuth, SpotifyAccount } from './spotify.js';
import { Player } from './player.js';
import { createCommands, aliases } from './commands.js';
import { MESSAGES, MESSAGE_GROUPS, DEFAULT_TEXTS, format, songVars } from './messages.js';

const REQUEST_DEFAULTS = {
  maxPerUser: 3,
  maxQueueLength: 50,
  maxDurationMinutes: 8,
  announce: 'first',
  historySize: 50,
  modsBypassClosed: false,
  mode: 'both', // 'command' = nur !sr, 'points' = nur Kanalpunkte, 'both' = beides
};
const LEARN_MS = 5 * 60_000;

// Ein Raum: Mitglieder (je mit Twitch-Kanal und Spotify), eine Warteschlange, eigene Einstellungen.
export class Room {
  constructor(store, manager) {
    this.store = store;
    this.manager = manager;
    const d = (this.data = store.data);
    d.members ||= [];
    d.spotifyApp ||= { clientId: '', clientSecret: '' };
    d.requests = { ...REQUEST_DEFAULTS, ...d.requests };
    d.chat = { enabled: true, texts: {}, ...d.chat };
    d.blacklist ||= [];
    d.history ||= [];
    d.overlayKey ||= randomId(18);
    d.publicPage ??= true;
    d.overlay = { showAll: false, ...d.overlay }; // showAll: auch Songs ohne Request anzeigen
    this.logLines = [];
    this.auth = new SpotifyAuth(() => d.spotifyApp, config.redirect.spotify);
    this.accounts = [];
    this.syncAccounts();
    this.player = new Player({ store, accounts: this.accounts, log: (t) => this.log(t) });
    this.commands = createCommands({
      player: this.player,
      accounts: this.accounts,
      settings: d.requests,
      blacklist: this.blacklist(),
    });
    this.player.on('nowPlaying', (c) => this.onNowPlaying(c));
    this.player.start();
  }

  get code() {
    return this.data.code;
  }

  get owner() {
    return this.data.members.find((m) => m.id === this.data.ownerId);
  }

  get channels() {
    return this.data.members.filter((m) => m.useChannel).map((m) => m.login);
  }

  get spotifyReady() {
    return !!(this.data.spotifyApp.clientId && this.data.spotifyApp.clientSecret);
  }

  member(userId) {
    return this.data.members.find((m) => m.id === userId);
  }

  save() {
    this.store.save();
  }

  log(text) {
    this.logLines.push(`${new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })} ${text}`);
    if (this.logLines.length > 40) this.logLines.shift();
  }

  // Spotify-Accounts in der Reihenfolge der Mitglieder; der erste verbundene ist der Taktgeber.
  syncAccounts() {
    const old = new Map(this.accounts.map((a) => [a.id, a]));
    const next = this.data.members.map(
      (m) => old.get(m.id) || new SpotifyAccount({ member: m, auth: this.auth, save: () => this.save() }),
    );
    next.forEach((a, i) => (a.member = this.data.members[i]));
    this.accounts.splice(0, this.accounts.length, ...next);
  }

  blacklist() {
    const d = this.data;
    const norm = (n) => String(n).trim().replace(/^@/, '').toLowerCase();
    return {
      has: (name) => !!name && d.blacklist.includes(norm(name)),
      // Nur gültige Twitch-Namen (a–z, 0–9, _), alles andere wird abgelehnt
      add: (name) => {
        const n = norm(name);
        if (!/^[a-z0-9_]{1,25}$/.test(n)) throw new Error('Das ist kein gültiger Twitch-Name.');
        if (!d.blacklist.includes(n)) d.blacklist.push(n);
        this.save();
      },
      remove: (name) => {
        d.blacklist = d.blacklist.filter((n) => n !== norm(name));
        this.save();
      },
    };
  }

  text(key) {
    const t = this.data.chat.texts;
    return (key in t ? t[key] : DEFAULT_TEXTS[key]) ?? '';
  }

  sendChat(channel, key, vars) {
    if (!this.data.chat.enabled) return;
    const t = this.text(key);
    if (t.trim()) this.manager.say(channel, format(t, vars));
  }

  async handleMessage(msg) {
    if (msg.rewardId) return this.handleRedemption(msg);
    const m = msg.text.match(/^!(\w+)\s*(.*)$/s);
    if (!m) return;
    const name = aliases[m[1].toLowerCase()] || m[1].toLowerCase();
    if (!this.commands[name]) return;
    this.log(`#${msg.channel} ${msg.user}: ${msg.text.slice(0, 80)}`);
    await this.run(name, msg, m[2].trim());
  }

  async run(name, msg, args) {
    let added = false;
    const say = (key, vars = {}) => {
      if (key === 'added') added = true;
      this.sendChat(msg.channel, key, { user: msg.user, ...vars });
    };
    try {
      await this.commands[name](msg, args, say);
    } catch (e) {
      this.log(`Fehler bei !${name}: ${e.message}`);
      say('error');
    }
    if (msg.viaPoints && !added) {
      say('pointsRefund');
      this.log(`Kanalpunkte von ${msg.user} bitte zurückerstatten (Wunsch nicht angenommen)`);
    }
  }

  // Kanalpunkte-Belohnung mit Texteingabe wurde eingelöst
  async handleRedemption(msg) {
    const owner = this.data.members.find((m) => m.login === msg.channel);
    if (!owner) return;
    if (this.learning?.memberId === owner.id && Date.now() < this.learning.until) {
      owner.rewardId = msg.rewardId;
      this.learning = null;
      this.save();
      this.log(`Kanalpunkte-Belohnung für #${msg.channel} verknüpft`);
      return;
    }
    if (owner.rewardId !== msg.rewardId || this.data.requests.mode === 'command') return;
    this.log(`#${msg.channel} ${msg.user} (Kanalpunkte): ${msg.text.slice(0, 80)}`);
    await this.run('sr', { ...msg, viaPoints: true }, msg.text);
  }

  learnReward(userId) {
    if (!this.member(userId)) return;
    this.learning = { memberId: userId, until: Date.now() + LEARN_MS };
  }

  unlinkReward(userId) {
    const m = this.member(userId);
    if (!m) return;
    m.rewardId = null;
    if (this.learning?.memberId === userId) this.learning = null;
    this.save();
  }

  onNowPlaying(c) {
    const d = this.data;
    d.history.unshift({ ...c, playedAt: Date.now() });
    d.history.length = Math.min(d.history.length, d.requests.historySize);
    this.save();
    if (d.requests.announce === 'off') return;
    const channels = d.requests.announce === 'all' ? this.channels : this.channels.slice(0, 1);
    for (const ch of channels) this.sendChat(ch, 'nowPlaying', { ...songVars(c), requester: c.user, user: c.user });
  }

  async connectSpotify(userId, code) {
    const acc = this.accounts.find((a) => a.id === userId);
    if (!acc) throw new Error('Du bist kein Mitglied dieses Raums.');
    try {
      await acc.connectWithCode(code);
    } catch (e) {
      if (e.status === 403) {
        acc.disconnect();
        throw new Error(
          `Spotify lässt diesen Account noch nicht zu. ${this.owner?.displayName || 'Der Raum-Besitzer'} muss dich in seiner Spotify-App unter „User Management“ eintragen (Name und E-Mail deines Spotify-Accounts).`,
        );
      }
      throw e;
    }
    this.log(`${acc.name}: Spotify verbunden (${acc.saved.product})`);
  }

  // Einstellungen speichern. Manche Teile darf nur der Besitzer ändern.
  async saveSettings(body, userId) {
    const d = this.data;
    const isOwner = userId === d.ownerId;
    if (body.spotifyApp) {
      if (!isOwner) throw new Error('Nur der Raum-Besitzer kann die Spotify-App ändern.');
      const clientId = String(body.spotifyApp.clientId || '').trim();
      const clientSecret = String(body.spotifyApp.clientSecret || '').trim() || d.spotifyApp.clientSecret;
      if (!clientId || !clientSecret) throw new Error('Bitte Client-ID und Client-Secret von Spotify eintragen.');
      await SpotifyAuth.verify(clientId, clientSecret);
      if (clientId !== d.spotifyApp.clientId) this.accounts.forEach((a) => a.disconnect()); // Logins gehören zur alten App
      d.spotifyApp = { clientId, clientSecret };
      this.log('Spotify-App gespeichert');
    }
    if (body.requests) {
      const r = body.requests;
      const s = d.requests;
      const num = (v, min, max, def) => Math.min(max, Math.max(min, Math.round(Number(v)) || def));
      s.maxPerUser = num(r.maxPerUser, 1, 50, s.maxPerUser);
      s.maxQueueLength = num(r.maxQueueLength, 1, 500, s.maxQueueLength);
      s.maxDurationMinutes = num(r.maxDurationMinutes, 1, 60, s.maxDurationMinutes);
      s.historySize = num(r.historySize, 1, 500, s.historySize);
      if (['first', 'all', 'off'].includes(r.announce)) s.announce = r.announce;
      if ('modsBypassClosed' in r) s.modsBypassClosed = !!r.modsBypassClosed;
      if (['command', 'points', 'both'].includes(r.mode)) s.mode = r.mode;
      d.history.length = Math.min(d.history.length, s.historySize);
    }
    if (body.chat) {
      if ('enabled' in body.chat) d.chat.enabled = !!body.chat.enabled;
      for (const { key } of MESSAGES) {
        if (!body.chat.texts || !(key in body.chat.texts)) continue;
        const t = String(body.chat.texts[key]).slice(0, 400);
        if (t === DEFAULT_TEXTS[key]) delete d.chat.texts[key];
        else d.chat.texts[key] = t;
      }
    }
    if ('publicPage' in body) d.publicPage = !!body.publicPage;
    if (body.overlay && 'showAll' in body.overlay) d.overlay.showAll = !!body.overlay.showAll;
    this.save();
  }

  setUseChannel(userId, use) {
    const m = this.member(userId);
    if (!m) return;
    if (use) {
      const other = this.manager.roomForChannel(m.login);
      if (other && other !== this) throw new Error(`Dein Kanal ist schon im Raum ${other.code}. Nimm ihn dort zuerst raus.`);
    }
    m.useChannel = !!use;
    this.save();
    this.manager.refreshChannels();
  }

  // Daten für die Raum-Seite (nur für Mitglieder)
  view(userId) {
    const d = this.data;
    const base = `${config.publicUrl}/r/${d.code}`;
    return {
      code: d.code,
      me: { id: userId, isOwner: userId === d.ownerId },
      maxMembers: config.maxMembers,
      members: d.members.map((m, i) => {
        const acc = this.accounts[i];
        return {
          id: m.id,
          login: m.login,
          displayName: m.displayName,
          image: m.image,
          useChannel: !!m.useChannel,
          rewardLinked: !!m.rewardId,
          learning: this.learning?.memberId === m.id && Date.now() < this.learning.until,
          isOwner: m.id === d.ownerId,
          isMe: m.id === userId,
          spotify: { connected: acc.connected, displayName: m.spotify?.displayName, product: m.spotify?.product, error: acc.error },
        };
      }),
      spotifyReady: this.spotifyReady,
      bot: this.manager.botStatus(),
      open: this.player.open,
      current: this.player.current,
      queued: this.player.queued,
      playback: this.player.playback,
      queue: this.player.queue,
      history: d.history,
      blacklist: d.blacklist,
      log: this.logLines.slice(-25),
      settings: {
        spotifyApp: { clientId: d.spotifyApp.clientId, hasSecret: !!d.spotifyApp.clientSecret },
        requests: d.requests,
        chat: {
          enabled: d.chat.enabled,
          messages: MESSAGES.map((m) => ({ key: m.key, label: m.label, default: m.text, text: this.text(m.key) })),
          groups: MESSAGE_GROUPS,
        },
        publicPage: d.publicPage,
        overlay: d.overlay,
        blacklist: d.blacklist,
      },
      links: {
        room: base,
        join: `${config.publicUrl}/join/${d.code}`,
        overlay: `${base}/overlay?k=${d.overlayKey}`,
        public: `${base}/live`,
      },
      redirect: { spotify: config.redirect.spotify },
    };
  }

  // Für Overlay und öffentliche Seite: keine internen Daten
  publicView() {
    const strip = (e) => e && { name: e.name, artists: e.artists, image: e.image, user: e.user, url: e.url, durationMs: e.durationMs };
    const p = this.player.playback;
    return {
      code: this.code,
      channels: this.channels,
      open: this.player.open,
      current: strip(this.player.current),
      queued: strip(this.player.queued),
      queue: this.player.queue.slice(0, 20).map(strip),
      // Was wirklich gerade läuft (auch ohne Request); requested = es ist der aktuelle Request
      playback: p && {
        name: p.name,
        artists: p.artists,
        image: p.image,
        progressMs: p.progressMs,
        durationMs: p.durationMs,
        isPlaying: p.isPlaying,
        requested: !!this.player.current && p.uri === this.player.current.uri,
      },
      overlayShowAll: this.data.overlay.showAll,
    };
  }

  stop() {
    this.player.stop();
  }
}

export class RoomManager {
  constructor({ key, bot, log }) {
    this.key = key;
    this.bot = bot;
    this.log = log;
    this.dir = path.join(config.dataDir, 'rooms');
    this.rooms = new Map();
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'))) {
      try {
        const room = new Room(new Store(path.join(this.dir, f), key), this);
        this.rooms.set(room.code, room);
      } catch (e) {
        log(`Raum ${f} übersprungen: ${e.message}`);
      }
    }
    log(`${this.rooms.size} Räume geladen`);
    bot.on('message', (msg) => this.roomForChannel(msg.channel)?.handleMessage(msg));
    this.refreshChannels();
  }

  get(code) {
    return this.rooms.get(String(code || '').toUpperCase());
  }

  roomsOf(userId) {
    return [...this.rooms.values()].filter((r) => r.member(userId));
  }

  roomForChannel(login) {
    return [...this.rooms.values()].find((r) => r.channels.includes(login));
  }

  refreshChannels() {
    this.bot.setChannels([...this.rooms.values()].flatMap((r) => r.channels));
  }

  say(channel, text) {
    this.bot.say(channel, text);
  }

  botStatus() {
    return { connected: this.bot.connected, login: this.bot.login };
  }

  newMember(user) {
    const taken = !!this.roomForChannel(user.login);
    return { id: user.id, login: user.login, displayName: user.displayName, image: user.image, useChannel: !taken, joinedAt: Date.now() };
  }

  create(user) {
    const owned = [...this.rooms.values()].filter((r) => r.data.ownerId === user.id).length;
    if (owned >= config.maxRoomsPerUser) throw new Error(`Du kannst höchstens ${config.maxRoomsPerUser} Räume besitzen.`);
    let code;
    do code = roomCode(); while (this.rooms.has(code));
    const store = new Store(path.join(this.dir, `${code}.json`), this.key);
    store.data = { code, createdAt: Date.now(), ownerId: user.id, members: [this.newMember(user)] };
    const room = new Room(store, this);
    store.flush();
    this.rooms.set(code, room);
    this.refreshChannels();
    this.log(`Raum ${code} erstellt von ${user.login}`);
    return room;
  }

  join(code, user) {
    const room = this.get(code);
    if (!room) throw new Error('Diesen Raumcode gibt es nicht.');
    if (room.member(user.id)) return room;
    if (room.data.members.length >= config.maxMembers) {
      throw new Error(`Der Raum ist voll (max. ${config.maxMembers}, weil Spotify pro App nur so viele Nutzer erlaubt).`);
    }
    room.data.members.push(this.newMember(user));
    room.syncAccounts();
    room.save();
    room.log(`${user.displayName} ist beigetreten`);
    this.refreshChannels();
    return room;
  }

  // Mitglied entfernen (selbst verlassen oder vom Besitzer rausgeworfen)
  removeMember(room, memberId) {
    if (memberId === room.data.ownerId) throw new Error('Der Besitzer kann den Raum nicht verlassen, nur löschen.');
    const m = room.member(memberId);
    if (!m) return;
    room.data.members = room.data.members.filter((x) => x.id !== memberId);
    room.syncAccounts();
    room.save();
    room.log(`${m.displayName} hat den Raum verlassen`);
    this.refreshChannels();
  }

  delete(room) {
    room.stop();
    room.store.remove();
    this.rooms.delete(room.code);
    this.refreshChannels();
    this.log(`Raum ${room.code} gelöscht`);
  }
}
