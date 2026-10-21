import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

// Hält die gemeinsame Warteschlange. Kurz bevor ein Song endet, wird der
// nächste Request bei allen Accounts in die echte Spotify-Warteschlange
// gelegt ("queued"). Spotify spielt ihn dann selbst ab. Der erste verbundene
// Account ist der "Taktgeber": Sobald der Request bei ihm startet, werden die
// anderen Accounts bei Bedarf auf denselben Song nachgezogen.
const PUSH_BEFORE_END_MS = 15_000;

export class Player extends EventEmitter {
  constructor({ store, accounts, log }) {
    super();
    this.store = store;
    this.accounts = accounts;
    this.log = log;
    store.data.queue ||= [];
    store.data.current ||= null;
    store.data.queued ||= null;
    store.data.open ??= true;
    this.idle = false;
    this.playback = null;
    this.retryAt = 0;
  }

  get queue() {
    return this.store.data.queue;
  }

  get current() {
    return this.store.data.current;
  }

  set current(v) {
    this.store.data.current = v;
  }

  // Bereits in Spotify eingereiht, aber noch nicht gestartet
  get queued() {
    return this.store.data.queued;
  }

  set queued(v) {
    this.store.data.queued = v;
  }

  get open() {
    return this.store.data.open;
  }

  setOpen(open) {
    this.store.data.open = !!open;
    this.changed();
  }

  changed() {
    this.store.save();
    this.emit('change');
  }

  get connectedAccounts() {
    return this.accounts.filter((a) => a.connected);
  }

  add(track, requester) {
    const entry = { id: crypto.randomUUID(), ...track, ...requester, addedAt: Date.now() };
    this.queue.push(entry);
    this.changed();
    return this.queue.length + (this.queued ? 1 : 0);
  }

  remove(id) {
    const i = this.queue.findIndex((e) => e.id === id);
    if (i < 0) return null;
    const [entry] = this.queue.splice(i, 1);
    this.changed();
    return entry;
  }

  move(id, dir) {
    const i = this.queue.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.queue.length) return;
    [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    this.changed();
  }

  clear() {
    this.queue.length = 0;
    this.changed();
  }

  async onAll(fn, accounts = this.connectedAccounts) {
    const results = await Promise.allSettled(accounts.map(fn));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        accounts[i].error = r.reason.message;
        this.log(`${accounts[i].name}: ${r.reason.message}`);
      }
    });
    return results;
  }

  async skip() {
    if (this.queued) return this.onAll((a) => a.next()); // springt zum eingereihten Request
    if (this.queue.length) return this.pushNext(true);
    this.current = null;
    this.changed();
    await this.onAll((a) => a.next());
  }

  // Nächsten Request in die Spotify-Warteschlange legen (now = sofort hinspringen).
  async pushNext(now = false) {
    if (this.advancing || this.queued || !this.queue.length || Date.now() < this.retryAt) return;
    this.advancing = true;
    try {
      const next = this.queue.shift();
      this.queued = { ...next, queuedAt: Date.now() };
      this.changed();
      const accounts = this.connectedAccounts;
      const results = await this.onAll((a) => a.enqueue(next.uri), accounts);
      if (results[0]?.status === 'rejected') {
        // Beim Taktgeber hat es nicht geklappt: zurücklegen und in 10 s nochmal
        this.queue.unshift(next);
        this.queued = null;
        this.retryAt = Date.now() + 10_000;
        this.changed();
        return;
      }
      this.log(`In Spotify eingereiht: ${next.name} – ${next.artists} (von ${next.user})`);
      if (now) await this.onAll((a) => a.next(), accounts);
    } finally {
      this.advancing = false;
    }
  }

  // Der eingereihte Song läuft beim Taktgeber: die anderen auf denselben Song ziehen.
  async syncOthers(uri) {
    const others = this.connectedAccounts.slice(1);
    await this.onAll(async (a) => {
      const p = await a.player();
      if (p?.item?.uri !== uri) await a.next();
    }, others);
  }

  start() {
    this.interval = setInterval(() => this.tick(), 2000);
  }

  stop() {
    clearInterval(this.interval);
  }

  async tick() {
    if (this.busy || this.advancing) return;
    this.busy = true;
    try {
      const leader = this.connectedAccounts[0];
      if (!leader) return;
      const p = await leader.player();
      const item = p?.item;
      this.playback = item
        ? {
            uri: item.uri,
            name: item.name,
            artists: item.artists?.map((a) => a.name).join(', '),
            image: (item.album?.images?.[1] || item.album?.images?.[0])?.url || null,
            isPlaying: p.is_playing,
            progressMs: p.progress_ms,
            durationMs: item.duration_ms,
            device: p.device?.name,
          }
        : null;
      this.emit('playback');

      // Der eingereihte Request hat begonnen
      const q = this.queued;
      if (q && item?.uri === q.uri) {
        this.current = { ...q, startedAt: Date.now() };
        this.queued = null;
        this.changed();
        this.log(`Jetzt läuft: ${q.name} – ${q.artists} (von ${q.user})`);
        this.emit('nowPlaying', this.current);
        await this.syncOthers(q.uri);
        return;
      }

      // Der aktuelle Request ist vorbei
      if (this.current && item?.uri !== this.current.uri) {
        this.current = null;
        this.changed();
      }

      const pending = !!(this.queued || this.queue.length);
      if (p?.is_playing) {
        this.idle = false;
        this.lastPlayingAt = Date.now();
      } else if (item && p.progress_ms < 1500 && Date.now() - (this.lastPlayingAt || 0) < 6000) {
        // Spotify hat am Songende von selbst angehalten (kein Autoplay)
        this.idle = true;
      }

      if (!item || (!p.is_playing && this.idle)) {
        // Nichts läuft: Request sofort starten
        if (!pending) return;
        if (this.queued) {
          if (Date.now() - this.queued.queuedAt > 5000 && !this.queued.kicked) {
            this.queued.kicked = true;
            await this.onAll((a) => a.next());
          }
        } else {
          await this.pushNext(true);
        }
        return;
      }
      if (!p.is_playing) return; // vom Streamer pausiert: abwarten

      // Kurz vor Songende den nächsten Request einreihen
      const remaining = item.duration_ms - p.progress_ms;
      if (remaining < PUSH_BEFORE_END_MS) await this.pushNext();
    } catch (e) {
      this.log(`Spotify: ${e.message}`);
    } finally {
      this.busy = false;
    }
  }
}
