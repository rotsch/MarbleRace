import { COURSE_VERSION } from './course/pieces.js';

// Saved tracks: one JSON file per track in the project's tracks/ folder, the
// file name (without .json) being the track's name. Under the dev server
// (npm run dev) or vite preview they are read and written through
// /api/tracks (see vite.config.js); a static build has the tracks that were
// in the folder when it was built, and saving downloads the file instead
// (put it in tracks/ to ship it with the next build).

const BUNDLED = Object.fromEntries(
  Object.entries(import.meta.glob('../tracks/*.json', { eager: true, import: 'default' }))
    .map(([file, data]) => [file.replace(/^.*\//, '').replace(/\.json$/, ''), data])
);

// Saving a track changes a file in tracks/; take the update here instead
// of reloading the page.
if (import.meta.hot) import.meta.hot.accept();

export const TRACK_NAME = /^[\p{L}\p{N} _\-]{1,60}$/u; // also in vite.config.js

export function checkName(name) {
  const n = (name ?? '').trim();
  if (!TRACK_NAME.test(n)) throw new Error('A track name is 1 to 60 letters, digits, spaces, - or _.');
  return n;
}

export function checkCourse(data) {
  if (data?.version !== COURSE_VERSION || !Array.isArray(data.pieces) || !Array.isArray(data.links)) {
    throw new Error('not a marble course file');
  }
  return data;
}

// Whether the tracks/ folder can be written (dev server or preview), checked once.
let server = null;
async function hasServer() {
  server ??= fetch('/api/tracks').then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json')).catch(() => false);
  return server;
}

export async function listTracks() {
  if (await hasServer()) return (await fetch('/api/tracks')).json();
  return Object.keys(BUNDLED).sort((a, b) => a.localeCompare(b));
}

export async function loadTrack(name) {
  name = checkName(name);
  if (await hasServer()) {
    const r = await fetch(`/api/tracks/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`no track called "${name}"`);
    return checkCourse(await r.json());
  }
  if (!BUNDLED[name]) throw new Error(`no track called "${name}"`);
  return checkCourse(structuredClone(BUNDLED[name]));
}

// Returns 'saved' (written to tracks/) or 'downloaded' (no server).
export async function saveTrack(name, data) {
  name = checkName(name);
  if (await hasServer()) {
    const r = await fetch(`/api/tracks/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`could not save "${name}": ${(await r.json().catch(() => ({}))).error ?? r.status}`);
    return 'saved';
  }
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}
