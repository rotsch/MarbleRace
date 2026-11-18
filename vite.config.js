import { defineConfig } from 'vite';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Saved tracks live in tracks/ and painted marble designs in marbles/, one
// JSON file each, the file name being its name. The dev server (and
// `vite preview`) answers, for <kind> = tracks or marbles,
//   GET  /api/<kind>         -> ["name", ...]
//   GET  /api/<kind>/<name>  -> the file's data
//   PUT  /api/<kind>/<name>  -> writes <kind>/<name>.json
// A plain static build has no server: it loads the files that were in the
// folders when it was built, and saving downloads the file instead.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NAME = /^[\p{L}\p{N} _\-]{1,60}$/u; // also in src/tracks.js and src/designs.js
const MAX_BYTES = 8 * 1024 * 1024;
const KINDS = {
  tracks: {
    dir: path.join(ROOT, 'tracks'),
    what: 'track',
    valid: (d) => Array.isArray(d?.pieces) && Array.isArray(d?.links),
    invalid: 'not a marble course',
  },
  marbles: {
    dir: path.join(ROOT, 'marbles'),
    what: 'marble design',
    valid: (d) => d?.kind === 'marble-design' && typeof d.base === 'object',
    invalid: 'not a marble design',
  },
};

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
      if (size > MAX_BYTES) reject(new Error('file too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const handler = (kind) => (req, res) => handle(KINDS[kind], req, res);

async function handle(kind, req, res) {
  const DIR = kind.dir;
  const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
  try {
    if (!name) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      const files = await readdir(DIR).catch(() => []);
      return send(res, 200, files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b)));
    }
    if (!NAME.test(name) || name.trim() !== name) return send(res, 400, { error: `invalid ${kind.what} name` });
    const file = path.join(DIR, `${name}.json`);
    if (req.method === 'GET') {
      const text = await readFile(file, 'utf8').catch(() => null);
      return text === null ? send(res, 404, { error: `no such ${kind.what}` }) : send(res, 200, JSON.parse(text));
    }
    if (req.method === 'PUT') {
      const data = JSON.parse(await readBody(req));
      if (!kind.valid(data)) return send(res, 400, { error: kind.invalid });
      await mkdir(DIR, { recursive: true });
      await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
      return send(res, 200, { saved: name });
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

const filesApi = () => ({
  name: 'files-api',
  configureServer(server) {
    for (const kind of Object.keys(KINDS)) {
      server.middlewares.use(`/api/${kind}`, handler(kind));
      // Saving writes into the folder; that must not reload the page.
      server.watcher.unwatch(KINDS[kind].dir);
    }
  },
  configurePreviewServer(server) {
    for (const kind of Object.keys(KINDS)) server.middlewares.use(`/api/${kind}`, handler(kind));
  },
});

export default defineConfig({
  plugins: [filesApi()],
});
