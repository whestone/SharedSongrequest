import tls from 'node:tls';
import { EventEmitter } from 'node:events';

const SCOPES = 'chat:read chat:edit';

export class TwitchAuth {
  // getCreds() liefert { clientId, clientSecret } aus den gespeicherten Einstellungen
  constructor(getCreds, redirectUri, store) {
    this.getCreds = getCreds;
    this.redirectUri = redirectUri;
    this.store = store;
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
    return this.store.data.twitch;
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
    this.store.data.twitch = {
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
    this.setChannels(channels);
  }

  setChannels(channels) {
    this.channels = channels.map((c) => c.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
    // Läuft der Bot schon, mit den neuen Kanälen neu verbinden
    if (!this.stopped) this.start();
  }

  async start() {
    this.stopped = false;
    clearTimeout(this.retryTimer);
    const old = this.socket;
    this.socket = null;
    old?.destroy();
    this.connected = false;
    if (!this.channels.length) return this.log('Twitch: keine Kanäle eingetragen');
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
      this.raw(`JOIN ${this.channels.map((c) => '#' + c).join(',')}`);
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
    clearInterval(this.watchdog);
    const old = this.socket;
    this.socket = null;
    old?.destroy();
    this.connected = false;
  }

  raw(line) {
    this.socket?.write(line + '\r\n');
  }

  say(channel, text) {
    if (this.connected) this.raw(`PRIVMSG #${channel} :${text.replace(/[\r\n]/g, ' ').slice(0, 480)}`);
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
        this.log(`Twitch verbunden als ${this.login}, Kanäle: ${this.channels.join(', ')}`);
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
