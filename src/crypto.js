import crypto from 'node:crypto';

// AES-256-GCM für gespeicherte Daten (Tokens, Client-Secrets).
export function deriveKey(secret) {
  return crypto.scryptSync(secret, 'shared-songrequest', 32);
}

export function encrypt(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}

export function decrypt(key, payload) {
  const { iv, tag, data } = JSON.parse(payload);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const randomId = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

// Raumcodes ohne verwechselbare Zeichen (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function roomCode(length = 6) {
  let s = '';
  for (const b of crypto.randomBytes(length)) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
