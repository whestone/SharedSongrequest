// YouTube-Links in einen Suchtext für Spotify umwandeln.
// Nutzt die öffentliche oEmbed-Schnittstelle von YouTube (kein API-Schlüssel nötig).

const YT_LINK = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i;

export function youtubeId(text) {
  return text.match(YT_LINK)?.[1] || null;
}

// Typische Zusätze in Videotiteln, die bei der Spotify-Suche stören
const NOISE = [
  /[([](?:[^)\]]*?)(official|offizielles|video|audio|lyrics?|visuali[sz]er|music|musik|hd|hq|4k|remaster(?:ed)?|clip|live|explicit|prod\.?)[^)\]]*[)\]]/gi,
  /\b(official\s+(music\s+)?video|official\s+audio|lyric\s+video|lyrics|visuali[sz]er|music\s+video|videoclip|hd|hq|4k)\b/gi,
  /\b(ft|feat|featuring)\.?\s.*$/i,
  /#\S+/g,
  /[|｜].*$/,
];

function cleanTitle(title) {
  let t = title;
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/["“”„]/g, '').replace(/\s*[-–—:]\s*$/, '').replace(/\s+/g, ' ').trim();
}

function cleanChannel(name) {
  return name
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\b(official|offiziell|music|musik|tv|records?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fromWatchPage(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    // SOCS-Cookie überspringt die Cookie-Abfrage, die YouTube in der EU vorschaltet
    headers: { 'Accept-Language': 'de-DE,de;q=0.9', Cookie: 'SOCS=CAI', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return {};
  const html = await res.text();
  const unescape = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return {
    title: unescape(html.match(/<meta name="title" content="([^"]*)"/)?.[1]),
    channel: unescape(html.match(/"ownerChannelName":"([^"]*)"/)?.[1]),
  };
}

// Liefert z. B. { title: 'Linkin Park - Numb (Official Music Video)', query: 'Linkin Park Numb' }
export async function youtubeQuery(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  let title = '';
  let channel = '';
  if (res.ok) {
    ({ title = '', author_name: channel = '' } = await res.json());
  } else if (res.status === 401 || res.status === 403) {
    // Einbetten deaktiviert (oft bei VEVO): Titel aus der Videoseite lesen
    ({ title, channel } = await fromWatchPage(id));
  }
  if (!title) return null; // privat, gelöscht oder kein gültiges Video
  const clean = cleanTitle(title);
  // "Künstler - Song" im Titel: reicht so. Sonst den Kanalnamen als Künstler dazunehmen.
  const query = /\s[-–—]\s/.test(clean) ? clean.replace(/\s[-–—]\s/, ' ') : `${cleanChannel(channel)} ${clean}`.trim();
  return { title, query };
}
