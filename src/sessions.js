import { randomId } from './crypto.js';

const COOKIE = 'sr_session';
const MAX_AGE = 30 * 24 * 3600; // 30 Tage

// Logins (Twitch) als Sitzungen im globalen Speicher.
export class Sessions {
  constructor(store, secure) {
    this.store = store;
    this.secure = secure;
    store.data.sessions ||= {};
    this.prune();
  }

  prune() {
    const now = Date.now();
    for (const [id, s] of Object.entries(this.store.data.sessions)) if (s.exp < now) delete this.store.data.sessions[id];
    this.store.save();
  }

  create(res, user) {
    const id = randomId(32);
    this.store.data.sessions[id] = { ...user, exp: Date.now() + MAX_AGE * 1000 };
    this.store.save();
    res.setHeader('Set-Cookie', this.cookie(id, MAX_AGE));
  }

  get(req) {
    const id = parseCookies(req.headers.cookie)[COOKIE];
    const s = id && this.store.data.sessions[id];
    if (!s || s.exp < Date.now()) return null;
    return { ...s, sid: id };
  }

  destroy(req, res) {
    const id = parseCookies(req.headers.cookie)[COOKIE];
    if (id) delete this.store.data.sessions[id];
    this.store.save();
    res.setHeader('Set-Cookie', this.cookie('', 0));
  }

  cookie(value, maxAge) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secure ? '; Secure' : ''}`;
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
