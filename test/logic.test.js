// Chat-Befehle, Warteschlange und Spotify-Steuerung mit nachgebautem Spotify
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { createCommands } from '../src/commands.js';
import { parse, TwitchChat } from '../src/twitch.js';
import { format, DEFAULT_TEXTS, MESSAGES, MESSAGE_GROUPS } from '../src/messages.js';

const track = (uri, progress = 0, playing = true) => ({ is_playing: playing, progress_ms: progress, item: { uri, duration_ms: 180000, artists: [] } });

function fakeAccount(slot) {
  const a = {
    id: String(slot), name: 'S' + slot, connected: true, state: null, spQueue: [],
    player: async () => a.state,
    enqueue: async (uri) => a.spQueue.push(uri),
    next: async () => { const u = a.spQueue.shift(); if (u) a.state = track(u); },
    findTrack: async (q) => ({ uri: 'spotify:track:' + q, name: q, artists: 'X', durationMs: 180000 }),
  };
  return a;
}

function setup(settings = {}) {
  const A = fakeAccount(0);
  const B = fakeAccount(1);
  const player = new Player({ store: { data: {}, save() {} }, accounts: [A, B], log() {} });
  const bl = new Set();
  const blacklist = { has: (n) => bl.has(String(n).toLowerCase()), add: (n) => bl.add(n), remove: (n) => bl.delete(n) };
  const s = { maxPerUser: 5, maxQueueLength: 50, maxDurationMinutes: 8, modsBypassClosed: false, mode: 'both', ...settings };
  const cmds = createCommands({ player, accounts: [A, B], settings: s, blacklist });
  const said = [];
  const say = (key, vars) => said.push(key);
  const viewer = (user = 'v', extra = {}) => ({ user, login: user, userId: user, channel: 'k', ...extra });
  return { A, B, player, cmds, said, say, viewer, settings: s, bl };
}

test('Spotify-Warteschlange: einreihen kurz vor Ende, Taktgeber zieht die anderen mit', async () => {
  const { A, B, player, cmds, say, viewer } = setup();
  A.state = track('eigenA', 60000);
  B.state = track('eigenB', 10000);
  await cmds.sr(viewer('a'), 'songA', say);
  await cmds.sr(viewer('b'), 'songB', say);
  await player.tick();
  assert.equal(A.spQueue.length, 0, 'noch nicht einreihen');
  A.state = track('eigenA', 170000);
  await player.tick();
  assert.deepEqual(A.spQueue, ['spotify:track:songA']);
  assert.deepEqual(B.spQueue, ['spotify:track:songA']);
  A.state = track(A.spQueue.shift(), 500);
  await player.tick();
  assert.equal(player.current.name, 'songA');
  assert.equal(B.state.item.uri, 'spotify:track:songA', 'B springt mit');
  await player.skip();
  assert.equal(A.state.item.uri, 'spotify:track:songB');
});

test('Nichts läuft: Request startet sofort; Pause durch Streamer: warten', async () => {
  const { A, player, cmds, say, viewer } = setup();
  await cmds.sr(viewer(), 'songC', say);
  await player.tick();
  assert.equal(A.state.item.uri, 'spotify:track:songC');
  A.state = track('spotify:track:songC', 50000, false);
  await cmds.sr(viewer('d'), 'songD', say);
  await player.tick();
  assert.equal(player.queue.length, 1);
});

test('!sr: Links, geschlossen, Limits, Duplikate', async () => {
  const { player, cmds, said, say, viewer, settings } = setup({ maxPerUser: 1 });
  await cmds.sr(viewer(), 'https://soundcloud.com/x', say);
  assert.equal(said.at(-1), 'badLink');
  player.setOpen(false);
  await cmds.sr(viewer('chef', { isMod: true, isBroadcaster: true }), 'x', say);
  assert.equal(said.at(-1), 'closed', 'geschlossen gilt auch für den Broadcaster');
  settings.modsBypassClosed = true;
  await cmds.sr(viewer('chef', { isMod: true, isBroadcaster: true }), 'x', say);
  assert.equal(said.at(-1), 'added');
  player.setOpen(true);
  await cmds.sr(viewer('a'), 'y', say);
  await cmds.sr(viewer('a'), 'z', say);
  assert.equal(said.at(-1), 'userLimit');
  await cmds.sr(viewer('b'), 'y', say);
  assert.equal(said.at(-1), 'duplicate');
});

test('Sperrliste per Chat, nur gültige Twitch-Namen', async () => {
  const { cmds, said, say, viewer, bl } = setup();
  await cmds.srblock({ isMod: true }, '@Troll', say);
  await cmds.sr(viewer('troll'), 'songX', say);
  assert.equal(said.at(-1), 'blacklisted');
  await cmds.srblock({ isMod: true }, "x');alert(1)//", say);
  assert.equal(bl.size, 1, 'ungültiger Name wird ignoriert');
  await cmds.srunblock({ isMod: true }, 'troll', say);
  await cmds.sr(viewer('troll'), 'songX', say);
  assert.equal(said.at(-1), 'added');
});

test('Kanalpunkte-Modus: !sr nur für Mods, Punkte-Wünsche ohne Limit', async () => {
  const { cmds, said, say, viewer } = setup({ mode: 'points', maxPerUser: 1 });
  await cmds.sr(viewer('a'), 'x', say);
  assert.equal(said.at(-1), 'pointsOnly');
  await cmds.sr(viewer('a', { viaPoints: true }), 'x', say);
  await cmds.sr(viewer('a', { viaPoints: true }), 'y', say);
  assert.equal(said.at(-1), 'added', 'Kanalpunkte zählen nicht zum Limit');
});

test('IRC-Parser und Shared-Chat-Spiegelungen', () => {
  const m = parse('@badges=moderator/1;display-name=Max\\sM;id=a;user-id=4 :max!max@max PRIVMSG #k :!sr hi');
  assert.equal(m.tags['display-name'], 'Max M');
  assert.equal(m.trailing, '!sr hi');
  const chat = new TwitchChat({ auth: {}, channels: [], log() {} });
  const got = [];
  chat.on('message', (x) => got.push(x));
  const base = '@id=X;room-id=1;source-room-id=1;source-id=S;user-id=5;custom-reward-id=R :v!v@v PRIVMSG #a :x';
  chat.handle(parse(base));
  chat.handle(parse(base.replace('id=X', 'id=Y').replace('room-id=1;', 'room-id=2;').replace('#a', '#b')));
  assert.deepEqual(got.map((g) => g.channel), ['a'], 'Spiegelung ignoriert');
  assert.equal(got[0].rewardId, 'R');
  assert.equal(got[0].isMod, false);
});

test('Nachrichten: Platzhalter und vollständige Gruppen', () => {
  assert.equal(format(DEFAULT_TEXTS.added, { user: 'Max', song: 'A – B', pos: 2 }), '@Max A – B ist auf Platz 2.');
  const grouped = MESSAGE_GROUPS.flatMap((g) => g.keys).sort();
  assert.deepEqual(grouped, MESSAGES.map((m) => m.key).sort());
});
