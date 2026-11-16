// Gemeinsame Helfer für alle Seiten
const $ = (id) => document.getElementById(id);

// Adressen der Seiten. Die Demo-Version (docs/) ersetzt sie über window.SR_ROUTES.
const ROUTES = Object.assign({
  home: '/',
  room: (code) => `/r/${code}`,
  login: (next) => `/auth/twitch?next=${encodeURIComponent(next)}`,
  spotify: (code) => `/auth/spotify/${code}`,
  admin: '/admin',
}, window.SR_ROUTES);
// Raumcode aus der URL /r/CODE/...
const pageCode = () => String(window.SR_CODE || location.pathname.split('/')[2] || '').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Wert sicher als JS-String in ein onclick-Attribut einsetzen (JSON maskiert Anführungszeichen,
// esc() schützt das HTML-Attribut). Nie '${esc(x)}' in onclick benutzen: &#39; wird dort wieder zu '.
const jsArg = (s) => esc(JSON.stringify(String(s ?? '')));
const time = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

async function api(url, body) {
  const res = await fetch(url, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fehler ${res.status}`);
  return json;
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Kopiert ✓';
      setTimeout(() => (btn.textContent = old), 1500);
    }
  } catch {
    prompt('Kopieren:', text);
  }
}

async function logout() {
  await fetch('/logout', { method: 'POST' });
  location.href = ROUTES.home;
}
