import tls from 'node:tls';
import { EventEmitter } from 'node:events';

const SCOPES = 'chat:read chat:edit';

export class TwitchAuth {
  // getCreds() liefert { clientId, clientSecret }; die Bot-Tokens liegen in store.data[key]
  constructor(getCreds, redirectUri, store, key = 'twitch') {
    this.getCreds = getCreds;
    this.redirectUri = redirectUri;
    this.store = store;
    this.key = key;
  }

  // Login-Link für normale Nutzer (nur zur Identifizierung, keine Rechte)
  userLoginUrl(state) {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.getCreds().clientId,
      redirect_uri: this.redirectUri,
      state,
    });
    return `https://id.twitch.tv/oauth2/authorize?${q}`;
  }

  // Code aus dem Nutzer-Login einlösen und herausfinden, wer das ist.
  async identify(code) {
    const { clientId, clientSecret } = this.getCreds();
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: this.redirectUri }),
    });
    const tok = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twitch-Login fehlgeschlagen: ${tok.message || res.status}`);
    const users = await fetch('https://api.twitch.tv/helix/users', {
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Client-Id': clientId },
    }).then((r) => r.json());
    const u = users.data?.[0];
    if (!u) throw new Error('Twitch-Login fehlgeschlagen: Nutzer nicht gefunden');
    // Token wird nicht gebraucht, gleich wieder ungültig machen
    fetch('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, token: tok.access_token }),
    }).catch(() => {});
    return { id: u.id, login: u.login, displayName: u.display_name, image: u.profile_image_url };
  }

  // Prüft Client-ID und Secret, ohne dass sich jemand anmelden muss.
  static async verify(clientId, clientSecret) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    if (res.ok) return;
    const json = await res.json().catch(() => ({}));
    throw new Error(
      /secret/i.test(json.message || '')
        ? 'Das Twitch-Client-Secret stimmt nicht. Erzeuge in der Twitch-Konsole ein neues und füge es ein.'
        : 'Twitch kennt diese Client-ID nicht. Bitte nochmal aus der Twitch-Konsole kopieren.',
    );
  }

  get saved() {
    return this.store.data[this.key];
  }

  authorizeUrl(state) {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.getCreds().clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      state,
      force_verify: 'true',
    });
    return `https://id.twitch.tv/oauth2/authorize?${q}`;
  }

  async token(params) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.getCreds().clientId, client_secret: this.getCreds().clientSecret, ...params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twitch-Login fehlgeschlagen: ${json.message || res.status}`);
    this.store.data[this.key] = {
      ...this.saved,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };
    this.store.save();
  }

  async connectWithCode(code) {
    await this.token({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri });
    await this.validate();
  }

  async validate() {
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${this.saved.accessToken}` },
    });
    if (!res.ok) return false;
    const json = await res.json();
    this.saved.login = json.login;
    this.store.save();
    return true;
  }

  // Liefert ein gültiges Token, erneuert es bei Bedarf.
  async getToken(force = false) {
    if (!this.saved?.refreshToken) throw new Error('Twitch-Bot ist nicht verbunden');
    if (force || this.saved.expiresAt < Date.now() + 60_000 || !(await this.validate())) {
      await this.token({ grant_type: 'refresh_token', refresh_token: this.saved.refreshToken });
      await this.validate();
    }
    return { token: this.saved.accessToken, login: this.saved.login };
  }
}

// Minimaler Twitch-IRC-Client über TLS. Tritt allen Kanälen bei und
// filtert doppelte Nachrichten aus Shared Chat (gleiche source-id).
export class TwitchChat extends EventEmitter {
  constructor({ auth, channels, log }) {
    super();
    this.auth = auth;
    this.log = log;
    this.connected = false;
    this.seen = new Map();
    this.stopped = true;
    this.joined = new Set();
    this.outbox = [];
    this.sent = [];
    this.channels = [];
    this.setChannels(channels);
  }

  setChannels(channels) {
    this.channels = [...new Set(channels.map((c) => c.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))];
    if (this.connected) this.syncJoins();
  }

  // Nur die Unterschiede beitreten/verlassen, statt neu zu verbinden.
  // Twitch erlaubt ca. 20 JOINs pro 10 s, darum in Paketen.
  syncJoins() {
    const want = new Set(this.channels);
    const part = [...this.joined].filter((c) => !want.has(c));
    const join = this.channels.filter((c) => !this.joined.has(c));
    if (part.length) this.raw(`PART ${part.map((c) => '#' + c).join(',')}`);
    part.forEach((c) => this.joined.delete(c));
    clearTimeout(this.joinTimer);
    const next = () => {
      const batch = join.splice(0, 15);
      if (!batch.length || !this.connected) return;
      this.raw(`JOIN ${batch.map((c) => '#' + c).join(',')}`);
      batch.forEach((c) => this.joined.add(c));
      if (join.length) this.joinTimer = setTimeout(next, 11_000);
    };
    next();
  }

  async start() {
    this.stopped = false;
    clearTimeout(this.retryTimer);
    const old = this.socket;
    this.socket = null;
    old?.destroy();
    this.connected = false;
    this.joined.clear();
    const gen = (this.gen = (this.gen || 0) + 1);
    let creds;
    try {
      creds = await this.auth.getToken(this.forceRefresh);
      this.forceRefresh = false;
    } catch (e) {
      this.log(`Twitch: ${e.message}`);
      return;
    }
    if (gen !== this.gen || this.stopped) return; // inzwischen neu gestartet oder gestoppt
    this.login = creds.login;
    const socket = tls.connect(6697, 'irc.chat.twitch.tv', { servername: 'irc.chat.twitch.tv' });
    this.socket = socket;
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('secureConnect', () => {
      this.raw('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.raw(`PASS oauth:${creds.token}`);
      this.raw(`NICK ${creds.login}`);
    });
    this.lastData = Date.now();
    clearInterval(this.watchdog);
    // Verbindungswächter: Eine "tote" Verbindung meldet sich nicht von selbst ab.
    // Alle 4 Min. pingen; kam 6 Min. lang nichts mehr an, neu verbinden.
    this.watchdog = setInterval(() => {
      if (this.socket !== socket) return clearInterval(this.watchdog);
      if (Date.now() - this.lastData > 6 * 60_000) {
        this.log('Twitch antwortet nicht mehr – verbinde neu');
        socket.destroy();
      } else {
        this.raw('PING :songbot');
      }
    }, 4 * 60_000);
    socket.on('data', (chunk) => {
      this.lastData = Date.now();
      buf += chunk;
      const lines = buf.split('\r\n');
      buf = lines.pop();
      for (const line of lines) if (line) this.handle(parse(line));
    });
    socket.on('error', (e) => this.log(`Twitch-Verbindung: ${e.message}`));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.emit('status');
      if (!this.stopped) {
        this.log('Twitch getrennt – neuer Versuch in 5 s');
        this.retryTimer = setTimeout(() => this.start(), 5000);
      }
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.joinTimer);
    clearInterval(this.watchdog);
    this.joined.clear();
    const old = this.socket;
    this.socket = null;
    old?.destroy();
    this.connected = false;
  }

  raw(line) {
    this.socket?.write(line + '\r\n');
  }

  // Nachrichten gedrosselt senden: Twitch erlaubt ohne Mod-Status ca. 20 pro 30 s.
  say(channel, text) {
    if (!this.connected || this.outbox.length > 50) return;
    this.outbox.push(`PRIVMSG #${channel} :${text.replace(/[\r\n]/g, ' ').slice(0, 480)}`);
    this.drain();
  }

  drain() {
    if (this.drainTimer) return;
    const now = Date.now();
    this.sent = this.sent.filter((t) => now - t < 30_000);
    while (this.outbox.length && this.sent.length < 18) {
      this.raw(this.outbox.shift());
      this.sent.push(now);
    }
    if (this.outbox.length) {
      this.drainTimer = setTimeout(() => {
        this.drainTimer = null;
        this.drain();
      }, 30_000 - (now - this.sent[0]) + 50);
    }
  }

  handle(msg) {
    switch (msg.command) {
      case 'PING':
        this.raw(`PONG :${msg.trailing}`);
        break;
      case 'RECONNECT':
        this.socket?.destroy();
        break;
      case '001':
        this.connected = true;
        this.log(`Twitch verbunden als ${this.login}, ${this.channels.length} Kanäle`);
        this.syncJoins();
        this.emit('status');
        break;
      case 'NOTICE':
        if (/authentication failed|improperly formatted auth/i.test(msg.trailing || '')) {
          this.log('Twitch: Anmeldung abgelehnt – Token wird erneuert');
          this.forceRefresh = true;
        } else if (msg.trailing) {
          this.log(`Twitch (${msg.params[0]}): ${msg.trailing}`);
        }
        break;
      case 'PRIVMSG': {
        // Shared Chat: Spiegelungen aus anderen Kanälen ignorieren. Jede Nachricht zählt
        // nur in dem Kanal, in dem sie geschrieben wurde (falls der Bot dort ist).
        const src = msg.tags['source-room-id'];
        if (src && msg.tags['room-id'] && src !== msg.tags['room-id']) return;
        const key = msg.tags['source-id'] || msg.tags.id;
        if (key) {
          if (this.seen.has(key)) return;
          this.seen.set(key, Date.now());
          if (this.seen.size > 1000) {
            for (const [k, t] of this.seen) if (Date.now() - t > 60_000) this.seen.delete(k);
          }
        }
        const badges = msg.tags['source-badges'] ?? msg.tags.badges ?? '';
        this.emit('message', {
          channel: msg.params[0].slice(1),
          user: msg.tags['display-name'] || msg.prefix?.split('!')[0],
          login: msg.prefix?.split('!')[0],
          userId: msg.tags['source-user-id'] || msg.tags['user-id'],
          isMod: /(^|,)(broadcaster|moderator)\//.test(badges),
          isBroadcaster: /(^|,)broadcaster\//.test(badges),
          // Kanalpunkte-Belohnung mit Texteingabe: Twitch schickt die Eingabe als Chat-Nachricht mit diesem Tag
          rewardId: msg.tags['custom-reward-id'] || null,
          text: (msg.trailing || '').trim(),
        });
        break;
      }
    }
  }
}

export function parse(line) {
  const tags = {};
  let rest = line;
  let prefix = null;
  if (rest[0] === '@') {
    const i = rest.indexOf(' ');
    for (const kv of rest.slice(1, i).split(';')) {
      const eq = kv.indexOf('=');
      const k = eq < 0 ? kv : kv.slice(0, eq);
      const v = eq < 0 ? '' : kv.slice(eq + 1);
      tags[k] = v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' })[c] ?? c);
    }
    rest = rest.slice(i + 1);
  }
  if (rest[0] === ':') {
    const i = rest.indexOf(' ');
    prefix = rest.slice(1, i);
    rest = rest.slice(i + 1);
  }
  let trailing = null;
  const t = rest.indexOf(' :');
  if (t >= 0) {
    trailing = rest.slice(t + 2);
    rest = rest.slice(0, t);
  } else if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  }
  const [command, ...params] = rest.split(' ');
  return { tags, prefix, command, params, trailing };
}
