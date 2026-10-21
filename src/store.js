import fs from 'node:fs';
import path from 'node:path';
import { encrypt, decrypt } from './crypto.js';

// Kleiner JSON-Speicher. Mit Schlüssel wird die Datei verschlüsselt abgelegt,
// damit Tokens und Client-Secrets nicht im Klartext auf der Platte liegen.
export class Store {
  constructor(file, key = null) {
    this.file = file;
    this.key = key;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      this.data = JSON.parse(key ? decrypt(key, raw) : raw);
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`${path.basename(file)} konnte nicht gelesen werden (falscher SECRET_KEY?)`);
      this.data = {};
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    if (this.deleted) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const json = JSON.stringify(this.data, null, this.key ? 0 : 2);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.key ? encrypt(this.key, json) : json);
    fs.renameSync(tmp, this.file);
  }

  remove() {
    clearTimeout(this.timer);
    this.deleted = true;
    fs.rmSync(this.file, { force: true });
  }
}
