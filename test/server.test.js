// Ende-zu-Ende: echter Server mit Test-Daten und simulierten Logins
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deriveKey, encrypt } from '../src/crypto.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-server-'));
const SECRET = 'x'.repeat(40);
const PORT = 8899;
const BASE = `http://localhost:${PORT}`;
let proc;

// Setup direkt beim Laden (ein globales before() wird in Node 20 nicht zuverlässig abgewartet)
await (async () => {
  const exp = Date.now() + 3600_000;
  fs.writeFileSync(path.join(dir, 'global.json'), encrypt(deriveKey(SECRET), JSON.stringify({
    sessions: {
      sessA: { id: '1', login: 'alice', displayName: 'Alice', exp },
      sessB: { id: '2', login: 'bob', displayName: 'Bob', exp },
      sessC: { id: '3', login: 'carol', displayName: 'Carol', exp },
    },
  })));
  proc = spawn(process.execPath, [path.join(root, 'src/server.js')], {
    env: { ...process.env, PUBLIC_URL: BASE, PORT: String(PORT), DATA_DIR: dir, SECRET_KEY: SECRET, TWITCH_CLIENT_ID: 't', TWITCH_CLIENT_SECRET: 't', ADMIN_TWITCH_LOGINS: 'alice', MAX_MEMBERS_PER_ROOM: '2' },
    stdio: process.env.DEBUG_TEST ? 'inherit' : 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/me'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
})();
after(() => {
  proc.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(sess, method, p, body, origin = BASE) {
  const res = await fetch(BASE + p, {
    method,
    redirect: 'manual',
    headers: { Cookie: sess ? `sr_session=${sess}` : '', Origin: origin, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, location: res.headers.get('location') };
}

test('Räume: erstellen, beitreten, Rechte, Kanäle, Links, löschen', async () => {
  assert.equal((await call(null, 'GET', '/api/me')).json.user, null);
  assert.equal((await call(null, 'POST', '/api/rooms', {})).status, 401);
  assert.match((await call(null, 'GET', '/r/ABCDEF')).location, /\/auth\/twitch/);

  const { code } = (await call('sessA', 'POST', '/api/rooms', {})).json;
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal((await call('sessA', 'POST', `/api/r/${code}/clear`, {}, 'https://evil.example')).status, 403, 'fremde Origin');
  assert.equal((await call('sessB', 'GET', `/api/r/${code}`)).status, 403, 'kein Mitglied');

  assert.equal((await call('sessB', 'POST', '/api/join', { code: code.toLowerCase() })).json.code, code);
  let v = (await call('sessB', 'GET', `/api/r/${code}`)).json;
  assert.equal(v.members.length, 2);
  assert.match((await call('sessC', 'POST', '/api/join', { code })).json.error, /voll/);

  assert.match((await call('sessB', 'POST', `/api/r/${code}/settings`, { spotifyApp: { clientId: 'a', clientSecret: 'b' } })).json.error, /Besitzer/);
  assert.equal((await call('sessB', 'POST', `/api/r/${code}/kick`, { memberId: '1' })).status, 403);
  v = (await call('sessB', 'POST', `/api/r/${code}/settings`, { requests: { maxPerUser: 7, mode: 'points' }, chat: { enabled: false } })).json;
  assert.equal(v.settings.requests.maxPerUser, 7);
  assert.equal(v.settings.requests.mode, 'points');
  assert.equal(v.settings.chat.enabled, false);
  assert.equal((await call('sessB', 'POST', `/api/r/${code}/blacklist`, { user: "x');alert(1)//", add: true })).status, 400);

  const { code: code2 } = (await call('sessB', 'POST', '/api/rooms', {})).json;
  assert.match((await call('sessB', 'POST', `/api/r/${code2}/channel`, { use: true })).json.error, /schon im Raum/);

  v = (await call('sessA', 'GET', `/api/r/${code}`)).json;
  const k = new URL(v.links.overlay).searchParams.get('k');
  assert.equal((await call(null, 'GET', `/api/overlay/${code}?k=falsch`)).status, 404);
  assert.equal((await call(null, 'GET', `/api/overlay/${code}?k=${k}`)).status, 200);
  assert.deepEqual((await call(null, 'GET', `/api/live/${code}`)).json.channels, ['alice', 'bob']);
  await call('sessA', 'POST', `/api/r/${code}/settings`, { publicPage: false });
  assert.equal((await call(null, 'GET', `/api/live/${code}`)).status, 404);

  assert.equal((await call('sessB', 'GET', '/api/admin')).status, 403);
  assert.equal((await call('sessA', 'GET', '/api/admin')).json.rooms.length, 2);

  v = (await call('sessA', 'POST', `/api/r/${code}/kick`, { memberId: '2' })).json;
  assert.equal(v.members.length, 1);
  assert.equal((await call('sessA', 'POST', `/api/r/${code}/delete`, {})).json.deleted, true);
  assert.equal((await call('sessA', 'GET', `/api/r/${code}`)).status, 404);

  await new Promise((r) => setTimeout(r, 400));
  const file = fs.readFileSync(path.join(dir, 'rooms', `${code2}.json`), 'utf8');
  assert.equal(file.includes('bob'), false, 'Raumdatei verschlüsselt');
});

test('Raumcodes lassen sich nicht durchprobieren', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await call('sessC', 'POST', '/api/join', { code: 'ZZZZZ' + (i % 9 + 1) });
  assert.equal(last.status, 429);
});

test('Seiten werden ausgeliefert', async () => {
  for (const p of ['/', '/style.css', '/common.js', '/admin', '/r/ABCDEF/overlay', '/r/ABCDEF/live']) {
    assert.equal((await call(null, 'GET', p)).status, 200, p);
  }
});
