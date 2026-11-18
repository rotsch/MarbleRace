import { defineConfig } from 'vite';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Saved tracks live in tracks/, one JSON file per track, the file name being
// the track's name. The dev server (and `vite preview`) answers
//   GET  /api/tracks         -> ["name", ...]
//   GET  /api/tracks/<name>  -> the course data
//   PUT  /api/tracks/<name>  -> writes tracks/<name>.json
// A plain static build has no server: it loads the tracks that were in the
// folder when it was built, and saving downloads the file instead.
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tracks');
const NAME = /^[\p{L}\p{N} _\-]{1,60}$/u; // also in src/tracks.js
const MAX_BYTES = 5 * 1024 * 1024;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) reject(new Error('track file too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
  try {
    if (!name) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const files = await readdir(DIR).catch(() => []);
      return send(res, 200, files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b)));
    }
    if (!NAME.test(name) || name.trim() !== name) return send(res, 400, { error: 'invalid track name' });
    const file = path.join(DIR, `${name}.json`);
    if (req.method === 'GET') {
      const text = await readFile(file, 'utf8').catch(() => null);
      return text === null ? send(res, 404, { error: 'no such track' }) : send(res, 200, JSON.parse(text));
    }
    if (req.method === 'PUT') {
      const data = JSON.parse(await readBody(req));
      if (!Array.isArray(data?.pieces) || !Array.isArray(data?.links)) return send(res, 400, { error: 'not a marble course' });
      await mkdir(DIR, { recursive: true });
      await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
      return send(res, 200, { saved: name });
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

const tracksApi = () => ({
  name: 'tracks-api',
  configureServer(server) {
    server.middlewares.use('/api/tracks', handle);
    // Saving a track writes into tracks/; that must not reload the page.
    server.watcher.unwatch(DIR);
  },
  configurePreviewServer(server) {
    server.middlewares.use('/api/tracks', handle);
  },
});

export default defineConfig({
  plugins: [tracksApi()],
});
