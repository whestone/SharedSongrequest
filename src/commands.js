import { songVars } from './messages.js';
import { youtubeId, youtubeQuery } from './youtube.js';

// Chat-Befehle. Jede Funktion bekommt die Nachricht, die Argumente und
// say(nachrichtKey, platzhalter), das den passenden Text aus den Einstellungen sendet.
export function createCommands({ player, accounts, settings, blacklist }) {
  const fmt = (t) => `${t.name} – ${t.artists}`;
  const upcoming = () => [player.queued, ...player.queue].filter(Boolean);
  const mine = (userId) => [player.current, ...upcoming()].filter((e) => e && e.userId === userId);
  const targetName = (args) => args.trim().replace(/^@/, '').toLowerCase();

  return {
    async sr(msg, args, say) {
      if (blacklist.has(msg.login) || blacklist.has(msg.user)) return say('blacklisted');
      if (!args) return say('usage');
      if (!player.open && !(settings.modsBypassClosed && msg.isMod)) return say('closed');
      const searcher = accounts.find((a) => a.connected);
      if (!searcher) return say('notConnected');
      if (!msg.isBroadcaster && mine(msg.userId).length >= settings.maxPerUser) {
        return say('userLimit', { max: settings.maxPerUser });
      }
      if (player.queue.length >= settings.maxQueueLength) return say('queueFull');
      // YouTube-Link: Videotitel lesen und auf Spotify danach suchen
      let query = args;
      const yt = youtubeId(args);
      let ytTitle = null;
      if (yt) {
        const info = await youtubeQuery(yt);
        if (!info) return say('ytNotFound');
        query = info.query;
        ytTitle = info.title;
      } else if (/https?:\/\/|www\./i.test(args) && !/open\.spotify\.com\/(intl-[a-z-]+\/)?track\//i.test(args)) {
        return say('badLink');
      }

      const track = await searcher.findTrack(query);
      if (!track) return ytTitle ? say('ytNoMatch', { query: ytTitle }) : say('notFound', { query: args });
      if (track.durationMs > settings.maxDurationMinutes * 60_000) {
        return say('tooLong', { ...songVars(track), max: settings.maxDurationMinutes });
      }
      if (player.current?.uri === track.uri || upcoming().some((e) => e.uri === track.uri)) {
        return say('duplicate', songVars(track));
      }
      const pos = player.add(track, { user: msg.user, login: msg.login, userId: msg.userId, channel: msg.channel });
      say('added', { ...songVars(track), pos });
    },

    song(msg, args, say) {
      const c = player.current;
      if (c) return say('song', { ...songVars(c), requester: c.user });
      const p = player.playback;
      if (p) return say('songNoRequest', { song: `${p.name} – ${p.artists}`, title: p.name, artist: p.artists });
      say('nothingPlaying');
    },

    queue(msg, args, say) {
      const list = upcoming();
      if (!list.length) return say('queueEmpty');
      const next = list.slice(0, 3).map((e, i) => `${i + 1}. ${fmt(e)} (${e.user})`).join(' | ');
      const more = list.length > 3 ? ` … und ${list.length - 3} weitere` : '';
      say('queue', { list: next + more });
    },

    wrongsong(msg, args, say) {
      const last = player.queue.filter((e) => e.userId === msg.userId).at(-1);
      if (!last) return say('nothingToRemove');
      player.remove(last.id);
      say('removed', songVars(last));
    },

    async skip(msg, args, say) {
      if (!msg.isMod) return;
      await player.skip();
      say('skipped');
    },

    sropen(msg, args, say) {
      if (!msg.isMod) return;
      player.setOpen(true);
      say('opened');
    },

    srclose(msg, args, say) {
      if (!msg.isMod) return;
      player.setOpen(false);
      say('closedNow');
    },

    srblock(msg, args, say) {
      if (!msg.isMod || !targetName(args)) return;
      blacklist.add(targetName(args));
      say('blocked', { target: targetName(args) });
    },

    srunblock(msg, args, say) {
      if (!msg.isMod || !targetName(args)) return;
      blacklist.remove(targetName(args));
      say('unblocked', { target: targetName(args) });
    },
  };
}

export const aliases = {
  songrequest: 'sr',
  currentsong: 'song',
  q: 'queue',
  songs: 'queue',
  oops: 'wrongsong',
  srban: 'srblock',
  srunban: 'srunblock',
};
