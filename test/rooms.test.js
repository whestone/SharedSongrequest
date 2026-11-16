// Räume: Chat-Routing, Kanalpunkte-Verknüpfung, Sperrliste, Overlay-Einstellung
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-rooms-'));
Object.assign(process.env, { DATA_DIR: dir, PUBLIC_URL: 'http://localhost:8898', SECRET_KEY: 'y'.repeat(40) });
const { RoomManager } = await import('../src/rooms.js');
const { deriveKey } = await import('../src/crypto.js');

const bot = Object.assign(new EventEmitter(), { channels: [], said: [] });
bot.setChannels = (c) => (bot.channels = c);
bot.say = (ch, t) => bot.said.push([ch, t]);
const mgr = new RoomManager({ key: deriveKey('y'.repeat(40)), bot, log() {} });
const r1 = mgr.create({ id: '1', login: 'alice', displayName: 'Alice' });
mgr.join(r1.code, { id: '2', login: 'bob', displayName: 'Bob' });
const r2 = mgr.create({ id: '3', login: 'carol', displayName: 'Carol' });
for (const r of [r1, r2]) {
  r.accounts[0].member.spotify = { refreshToken: 'x' };
  r.accounts[0].findTrack = async (q) => ({ uri: 'spotify:track:' + q, name: q, artists: 'X', durationMs: 1000 });
}
after(() => {
  r1.stop();
  r2.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const wait = () => new Promise((r) => setTimeout(r, 30));
const msg = (channel, text, user = 'viewer') => ({ channel, text, user, login: user, userId: user, isMod: false });
const redeem = (channel, rewardId, text) => ({ ...msg(channel, text, 'fan'), rewardId });

test('Bot ist in den Kanälen aller Mitglieder', () => {
  assert.deepEqual([...bot.channels].sort(), ['alice', 'bob', 'carol']);
});

test('Nachrichten landen im Raum des Kanals, fremde Kanäle werden ignoriert', async () => {
  bot.emit('message', msg('bob', '!sr songA'));
  bot.emit('message', msg('carol', '!sr songB'));
  bot.emit('message', msg('fremd', '!sr songC'));
  await wait();
  assert.deepEqual(r1.player.queue.map((e) => e.name), ['songA']);
  assert.deepEqual(r2.player.queue.map((e) => e.name), ['songB']);
  assert.ok(bot.said.some(([ch, t]) => ch === 'bob' && t.includes('songA')));
});

test('Ein Kanal kann nur in einem Raum aktiv sein', () => {
  mgr.join(r2.code, { id: '2', login: 'bob', displayName: 'Bob' });
  assert.equal(r2.member('2').useChannel, false, 'bob ist schon in Raum 1 aktiv');
  assert.throws(() => r2.setUseChannel('2', true), /schon im Raum/);
});

test('Kanalpunkte: verknüpfen, einlösen, andere Belohnung ignorieren, Rückerstattungs-Hinweis', async () => {
  bot.emit('message', redeem('alice', 'R1', 'songX'));
  await wait();
  assert.equal(r1.player.queue.length, 1, 'unverknüpft ignoriert');
  r1.learnReward('1');
  bot.emit('message', redeem('alice', 'R1', 'egal'));
  await wait();
  assert.equal(r1.member('1').rewardId, 'R1');
  bot.emit('message', redeem('alice', 'R1', 'songP'));
  bot.emit('message', redeem('alice', 'ANDERE', 'songQ'));
  await wait();
  assert.deepEqual(r1.player.queue.map((e) => e.name), ['songA', 'songP']);
  bot.emit('message', redeem('alice', 'R1', 'songP'));
  await wait();
  assert.match(bot.said.at(-1)[1], /Kanalpunkte gibt dir ein Mod zurück/);
});

test('Sperrliste lehnt ungültige Namen ab', () => {
  assert.throws(() => r1.blacklist().add("x');alert(1)//"), /kein gültiger Twitch-Name/);
  r1.blacklist().add('@Troll');
  assert.deepEqual(r1.data.blacklist, ['troll']);
});

test('Overlay-Einstellung und öffentliche Ansicht ohne Geheimnisse', async () => {
  await r1.saveSettings({ overlay: { showAll: true } }, '2');
  const pub = r1.publicView();
  assert.equal(pub.overlayShowAll, true);
  assert.equal(JSON.stringify(pub).includes('clientSecret'), false);
  assert.equal(JSON.stringify(pub).includes(r1.data.overlayKey), false);
});
