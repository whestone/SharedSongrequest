import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Einfache .env-Datei (KEY=wert pro Zeile) einlesen, echte Umgebungsvariablen haben Vorrang.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnvFile(path.join(root, '.env'));

const env = process.env;
const port = Number(env.PORT) || 8888;
const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(publicUrl);

export const config = {
  port,
  publicUrl,
  // Lokal (ohne HTTPS): Spotify verlangt 127.0.0.1, Twitch akzeptiert nur localhost
  local,
  redirect: {
    twitch: `${publicUrl}/callback/twitch`,
    spotify: local ? `http://127.0.0.1:${port}/callback/spotify` : `${publicUrl}/callback/spotify`,
  },
  twitch: { clientId: env.TWITCH_CLIENT_ID || '', clientSecret: env.TWITCH_CLIENT_SECRET || '' },
  secretKey: env.SECRET_KEY || '',
  admins: (env.ADMIN_TWITCH_LOGINS || '').split(/[\s,]+/).map((s) => s.toLowerCase()).filter(Boolean),
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  maxMembers: Number(env.MAX_MEMBERS_PER_ROOM) || 5,
  maxRoomsPerUser: Number(env.MAX_ROOMS_PER_USER) || 3,
};

export function checkConfig() {
  const missing = [];
  if (!config.twitch.clientId) missing.push('TWITCH_CLIENT_ID');
  if (!config.twitch.clientSecret) missing.push('TWITCH_CLIENT_SECRET');
  if (config.secretKey.length < 32) missing.push('SECRET_KEY (mindestens 32 Zeichen)');
  if (missing.length) {
    console.error(`Es fehlen Einstellungen in .env: ${missing.join(', ')}\nSiehe .env.example und DEPLOY.md.`);
    process.exit(1);
  }
}
