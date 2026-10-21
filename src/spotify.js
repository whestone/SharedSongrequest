const SCOPES = 'user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://api.spotify.com/v1';

export class SpotifyAuth {
  // getCreds() liefert { clientId, clientSecret } aus den gespeicherten Einstellungen
  constructor(getCreds, redirectUri) {
    this.getCreds = getCreds;
    this.redirectUri = redirectUri;
  }

  // Prüft Client-ID und Secret, ohne dass sich jemand anmelden muss.
  static async verify(clientId, clientSecret) {
    const auth = new SpotifyAuth(() => ({ clientId, clientSecret }));
    try {
      await auth.token({ grant_type: 'client_credentials' });
    } catch {
      throw new Error('Spotify kennt diese Client-ID / dieses Secret nicht. Bitte nochmal aus dem Dashboard kopieren.');
    }
  }

  authorizeUrl(state) {
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.getCreds().clientId,
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      state,
      show_dialog: 'true',
    });
    return `https://accounts.spotify.com/authorize?${q}`;
  }

  async token(params) {
    const { clientId, clientSecret } = this.getCreds();
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams(params),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Spotify-Login fehlgeschlagen: ${json.error_description || json.error || res.status}`);
    return json;
  }

  exchange(code) {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri });
  }

  refresh(refreshToken) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }
}

// Ein Spotify-Login eines Raum-Mitglieds. Die Tokens liegen in member.spotify,
// save() speichert den Raum.
export class SpotifyAccount {
  constructor({ member, auth, save }) {
    this.member = member;
    this.auth = auth;
    this.saveRoom = save;
    this.error =
      this.saved && this.saved.scopes !== SCOPES
        ? 'Bitte einmal trennen und neu verbinden, der Bot braucht eine zusätzliche Berechtigung'
        : null;
  }

  get id() {
    return this.member.id;
  }

  get name() {
    return this.member.displayName;
  }

  get saved() {
    return this.member.spotify;
  }

  get connected() {
    return !!this.saved?.refreshToken;
  }

  saveTokens(t) {
    const prev = this.saved || {};
    this.member.spotify = {
      ...prev,
      accessToken: t.access_token,
      refreshToken: t.refresh_token || prev.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    this.saveRoom();
  }

  async connectWithCode(code) {
    this.saveTokens(await this.auth.exchange(code));
    const me = await this.api('GET', '/me');
    Object.assign(this.member.spotify, {
      displayName: me.display_name || me.id,
      product: me.product,
      country: me.country,
      scopes: SCOPES,
    });
    this.saveRoom();
    this.error = me.product && me.product !== 'premium' ? 'Kein Premium – Wiedergabe steuern geht nur mit Premium' : null;
  }

  disconnect() {
    delete this.member.spotify;
    this.saveRoom();
    this.error = null;
  }

  async accessToken(force = false) {
    const s = this.saved;
    if (!s) throw new Error(`${this.name}: Spotify nicht verbunden`);
    if (force || !s.accessToken || s.expiresAt < Date.now() + 60_000) {
      this.saveTokens(await this.auth.refresh(s.refreshToken));
    }
    return this.saved.accessToken;
  }

  async api(method, path, body, retried = false) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken(retried === 'auth')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) return this.api(method, path, body, 'auth');
    if (res.status === 429 && !retried) {
      const wait = Number(res.headers.get('retry-after') || 1);
      await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
      return this.api(method, path, body, 'rate');
    }
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = new Error(json?.error?.message || `Spotify-Fehler ${res.status}`);
      err.status = res.status;
      err.reason = json?.error?.reason;
      throw err;
    }
    return json;
  }

  player() {
    return this.api('GET', '/me/player');
  }

  // Liefert das Gerät, auf dem Spotify spielt, und aktiviert es bei Bedarf.
  async device() {
    const { devices = [] } = (await this.api('GET', '/me/player/devices')) || {};
    const usable = devices.filter((d) => !d.is_restricted);
    const device =
      usable.find((d) => d.is_active) || usable.find((d) => d.type === 'Computer') || usable[0];
    if (!device) throw new Error('Kein Spotify-Gerät gefunden – Spotify öffnen und kurz etwas abspielen');
    if (!device.is_active) {
      await this.api('PUT', '/me/player', { device_ids: [device.id], play: false });
      await sleep(1000);
    }
    return device.id;
  }

  // Song hinten an die Spotify-Warteschlange hängen ("Als Nächstes").
  async enqueue(uri) {
    const id = await this.device();
    await this.api('POST', `/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${id}`);
    if (this.saved?.scopes === SCOPES) this.error = null;
  }

  // Zum nächsten Song in der Spotify-Warteschlange springen und abspielen.
  async next() {
    const id = await this.device();
    await this.api('POST', `/me/player/next?device_id=${id}`);
    await sleep(300);
    // Falls pausiert war: fortsetzen (läuft es schon, meldet Spotify 403 – egal)
    await this.api('PUT', `/me/player/play?device_id=${id}`).catch(() => {});
  }

  async findTrack(input) {
    // Mit dem Land des Accounts suchen, damit nur abspielbare Songs gefunden werden
    const market = this.saved?.country ? `market=${this.saved.country}` : '';
    const id = input.match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/)?.[1];
    if (id) return trackFromApi(await this.api('GET', `/tracks/${id}?${market}`));
    // Mit limit=1 liefert Spotify oft unpassende Treffer, darum 10 holen und selbst bewerten
    const q = new URLSearchParams({ q: input, type: 'track', limit: '10' });
    const items = (await this.api('GET', `/search?${q}&${market}`))?.tracks?.items || [];
    const t = bestMatch(input, items);
    return t ? trackFromApi(t) : null;
  }
}

const words = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const VERSION_WORDS = ['live', 'remix', 'karaoke', 'instrumental', 'cover', 'acoustic', 'sped', 'slowed', 'nightcore', 'tribute'];

// Treffer, der die meisten Wörter der Suche in Titel + Künstler enthält.
// Live-, Remix-, Karaoke-Versionen usw. nur, wenn danach gesucht wurde.
function bestMatch(query, items) {
  const q = new Set(words(query));
  let best = null;
  let bestScore = -Infinity;
  items.forEach((t, i) => {
    const name = words(t.name);
    const all = new Set([...name, ...t.artists.flatMap((a) => words(a.name))]);
    let score = q.size ? [...q].filter((w) => all.has(w)).length / q.size : 0;
    for (const v of VERSION_WORDS) if (all.has(v) && !q.has(v)) score -= 0.3;
    score -= name.filter((w) => !q.has(w)).length * 0.02; // Zusätze im Titel leicht abwerten
    score -= i * 0.001; // bei Gleichstand Spotifys Reihenfolge
    if (score > bestScore) [best, bestScore] = [t, score];
  });
  return best;
}

function trackFromApi(t) {
  const images = t.album?.images || [];
  return {
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    durationMs: t.duration_ms,
    image: (images[1] || images[0])?.url || null,
    url: t.external_urls?.spotify,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
