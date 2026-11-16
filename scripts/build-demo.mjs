// Baut die Demo-Website für GitHub Pages nach docs/.
// Nimmt die echten Seiten aus public/ und hängt demo/demo-api.js davor,
// das den Server im Browser simuliert.  Aufruf: npm run build:demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES, MESSAGE_GROUPS } from '../src/messages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');
const REPO = process.env.DEMO_REPO_URL || 'https://github.com/whestone/SharedSongrequest';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, t) => fs.writeFileSync(path.join(out, f), t);

function replaceAll(text, from, to, file) {
  if (!text.includes(from)) throw new Error(`${file}: "${from}" nicht gefunden – Seite geändert? Build-Skript anpassen.`);
  return text.split(from).join(to);
}

// Gemeinsame Anpassungen: relative Pfade und Demo-Skript vor common.js
function adapt(file, extra = (t) => t) {
  let t = read(`public/${file}`);
  if (t.includes('href="/style.css"')) t = replaceAll(t, 'href="/style.css"', 'href="style.css"', file);
  if (t.includes('<script src="/common.js"></script>')) {
    t = replaceAll(t, '<script src="/common.js"></script>', '<script src="demo-api.js"></script>\n<script src="common.js"></script>', file);
  }
  t = t.split('href="/"').join('href="index.html"');
  t = t.replace(/<title>([^<]*)<\/title>/, '<title>$1 (Demo)</title>');
  return extra(t);
}

write('index.html', adapt('home.html'));
write('room.html', adapt('room.html'));
write('live.html', adapt('live.html'));
write('overlay.html', adapt('overlay.html', (t) => {
  // Demo-Skript laden, Hinweis-Leiste weglassen, Hintergrund zeigen (in OBS ist er transparent)
  t = replaceAll(t, '<body>', '<body data-overlay="1" style="background:repeating-conic-gradient(#2a2a2a 0 25%,#202020 0 50%) 0 0/24px 24px;padding:24px">', 'overlay.html');
  return replaceAll(t, '<script>', '<script src="demo-api.js"></script>\n<script>', 'overlay.html');
}));

fs.copyFileSync(path.join(root, 'public/style.css'), path.join(out, 'style.css'));
fs.copyFileSync(path.join(root, 'public/common.js'), path.join(out, 'common.js'));
write(
  'demo-api.js',
  `// Automatisch erzeugt von scripts/build-demo.mjs – nicht von Hand bearbeiten.\n` +
    `window.__SR_REPO = ${JSON.stringify(REPO)};\n` +
    `window.__SR_MESSAGES = ${JSON.stringify(MESSAGES)};\n` +
    `window.__SR_GROUPS = ${JSON.stringify(MESSAGE_GROUPS)};\n` +
    read('demo/demo-api.js'),
);
write('.nojekyll', ''); // GitHub Pages soll die Dateien unverändert ausliefern

console.log(`Demo gebaut: ${fs.readdirSync(out).join(', ')}`);
