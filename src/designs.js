import * as THREE from 'three';
import { COLORS } from './config.js';

// Marble designs: how a marble looks. A design is plain data, saved as one
// JSON file per design in the project's marbles/ folder (the file name, minus
// .json, is the design's name), so a design painted on one machine can be put
// in the folder for everyone:
//   {
//     kind: 'marble-design', version: 1, name: 'Bumblebee',
//     finish: 'glossy' | 'matte' | 'metal' | 'pearl',
//     base: { pattern: 'swirl', color: '#fdd835', color2: '#111111' },
//     paint: 'data:image/png;base64,...' or null
//   }
// The marble's surface is a 1024 x 512 picture wrapped around the sphere
// (longitude across, latitude down: an equirectangular map, the way three.js
// puts UVs on a sphere). `base` is a colour with an optional pattern, drawn
// from the numbers above; `paint` is everything painted on top, a PNG with
// transparency of that size.
//
// Under the dev server (npm run dev) or vite preview the folder is read and
// written through /api/marbles (see vite.config.js). A static build has the
// designs that were in the folder when it was built; designs saved there are
// kept in the browser and downloaded as a file (put it in marbles/ to share).

export const TEX_W = 1024;
export const TEX_H = 512;
export const DESIGN_VERSION = 1;
export const DESIGN_NAME = /^[\p{L}\p{N} _\-]{1,60}$/u; // also in vite.config.js

export const PATTERNS = [
  { id: 'solid', label: 'Plain' },
  { id: 'swirl', label: 'Swirl' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'segments', label: 'Beach ball' },
  { id: 'halves', label: 'Two halves' },
  { id: 'checker', label: 'Checker' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'dots', label: 'Dots' },
];

export const FINISHES = [
  { id: 'glossy', label: 'Glossy' },
  { id: 'matte', label: 'Matte' },
  { id: 'metal', label: 'Metal' },
  { id: 'pearl', label: 'Pearl' },
];

const hexStr = (n) => `#${n.toString(16).padStart(6, '0')}`;
export const hexNum = (s) => parseInt(String(s).replace('#', ''), 16) || 0;

// The colour a design shows as a dot in lists (its base colour).
export function designColor(design) {
  return hexNum(design?.base?.color ?? '#888888');
}

// A plain marble of one colour with a lighter swirl, as the racers always
// looked. Made once per colour, so every user shares the same texture.
const plain = new Map();
export function colorDesign(hex, name = null) {
  let d = plain.get(hex);
  if (!d) {
    const light = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.35);
    d = {
      kind: 'marble-design', version: DESIGN_VERSION, name: name ?? hexStr(hex), builtin: true,
      finish: 'glossy',
      base: { pattern: 'swirl', color: hexStr(hex), color2: `#${light.getHexString()}` },
      paint: null,
    };
    plain.set(hex, d);
  }
  return d;
}

// Built-in designs: the plain colours, by id 'color:<Name>'.
export const BUILTIN = COLORS.map((c) => ({ id: `color:${c.name}`, name: c.name, design: colorDesign(c.hex, c.name) }));

export function newDesign(from = null) {
  return {
    kind: 'marble-design', version: DESIGN_VERSION, name: '',
    finish: from?.finish ?? 'glossy',
    base: { ...(from?.base ?? { pattern: 'solid', color: '#e53935', color2: '#ffffff' }) },
    paint: null,
  };
}

// ---------------------------------------------------------------------------
// Drawing

// Unit direction of texel (x, y) on the sphere, matching three.js's
// SphereGeometry: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)
// with phi = u * 2 pi and theta = v * pi (v = 0 at the top).
export function texelDir(u, v, out = new THREE.Vector3()) {
  const phi = u * Math.PI * 2, theta = v * Math.PI;
  const st = Math.sin(theta);
  return out.set(-Math.cos(phi) * st, Math.cos(theta), Math.sin(phi) * st);
}

// The 12 corners of an icosahedron: evenly spread dots.
const DOTS = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const pts = [];
  for (const a of [-1, 1]) for (const b of [-t, t]) pts.push([0, a, b], [a, b, 0], [b, 0, a]);
  return pts.map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
})();
const DOT_COS = Math.cos(0.3);

const frac = (x) => x - Math.floor(x);
// Whether texture point (u, v) shows the second colour.
const PATTERN_FN = {
  solid: () => false,
  swirl: (u, v) => Math.abs(v - (0.5 + Math.sin(u * Math.PI * 2) * 0.265)) < 0.0273,
  stripes: (u, v) => Math.floor(v * 7) % 2 === 1,
  segments: (u) => Math.floor(u * 6) % 2 === 1,
  halves: (u, v) => v > 0.5,
  checker: (u, v) => (Math.floor(u * 8) + Math.floor(v * 4)) % 2 === 1,
  spiral: (u, v) => frac(u * 2 + v * 3) < 0.5,
  dots: (u, v, d) => DOTS.some((p) => p.x * d.x + p.y * d.y + p.z * d.z > DOT_COS),
};

// Fill a 2D canvas context (TEX_W x TEX_H) with a base: colour plus pattern
// in the second colour, 2 x 2 samples per texel for smooth edges.
export function drawBase(g, base, w = TEX_W, h = TEX_H) {
  const fn = PATTERN_FN[base?.pattern] ?? PATTERN_FN.solid;
  const c1 = new THREE.Color(base?.color ?? '#888888');
  const c2 = new THREE.Color(base?.color2 ?? '#ffffff');
  g.fillStyle = `#${c1.getHexString()}`;
  g.fillRect(0, 0, w, h);
  if (fn === PATTERN_FN.solid) return;
  const img = g.getImageData(0, 0, w, h);
  const px = img.data;
  const a = [c1.r * 255, c1.g * 255, c1.b * 255], b = [c2.r * 255, c2.g * 255, c2.b * 255];
  const d = new THREE.Vector3();
  const sub = [0.25, 0.75];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (const sy of sub) {
        for (const sx of sub) {
          const u = (x + sx) / w, v = (y + sy) / h;
          if (fn === PATTERN_FN.dots) texelDir(u, v, d);
          if (fn(u, v, d)) n++;
        }
      }
      if (!n) continue;
      const k = n / 4, i = (y * w + x) * 4;
      px[i] = a[0] + (b[0] - a[0]) * k;
      px[i + 1] = a[1] + (b[1] - a[1]) * k;
      px[i + 2] = a[2] + (b[2] - a[2]) * k;
    }
  }
  g.putImageData(img, 0, 0);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('picture did not load'));
    img.src = src;
  });
}

// One texture per design object, shared by every view (race, lineup,
// setup, painter): base drawn right away, the paint added once its PNG has
// decoded. Designs are never changed in place (saving makes a new object),
// so the cache never goes stale.
const textures = new WeakMap();
export function designTexture(design) {
  let tex = textures.get(design);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d', { willReadFrequently: true });
  drawBase(g, design.base);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // userData.ready: resolves once the paint is on (for 2D previews).
  tex.userData.ready = !design.paint
    ? Promise.resolve()
    : loadImage(design.paint)
      .then((img) => {
        g.drawImage(img, 0, 0, TEX_W, TEX_H);
        tex.needsUpdate = true;
      })
      .catch((err) => console.error(`Design "${design.name}": paint did not load`, err));
  textures.set(design, tex);
  return tex;
}

// Material settings per finish.
export function finishParams(finish) {
  switch (finish) {
    case 'matte':
      return { roughness: 0.55, metalness: 0, clearcoat: 0, clearcoatRoughness: 0, iridescence: 0 };
    case 'metal':
      return { roughness: 0.22, metalness: 0.85, clearcoat: 0.4, clearcoatRoughness: 0.1, iridescence: 0 };
    case 'pearl':
      return { roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6 };
    default:
      return { roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0 };
  }
}

// A marble material for a design (a new material; the texture is shared).
export function marbleMaterial(design, envMap) {
  return new THREE.MeshPhysicalMaterial({
    map: designTexture(design),
    envMap, envMapIntensity: 0.9,
    iridescenceThicknessRange: [200, 600],
    ...finishParams(design.finish),
  });
}

// ---------------------------------------------------------------------------
// Library: the marbles/ folder

const BUNDLED = import.meta.glob('../marbles/*.json', { import: 'default' }); // loaded when asked for
const bundledName = (file) => file.replace(/^.*\//, '').replace(/\.json$/, '');
const BUNDLED_BY_NAME = Object.fromEntries(Object.entries(BUNDLED).map(([f, load]) => [bundledName(f), load]));
const LOCAL_KEY = 'marble-race-designs'; // designs saved in this browser (static build only)

if (import.meta.hot) import.meta.hot.accept();

export function checkDesignName(name) {
  const n = (name ?? '').trim();
  if (!DESIGN_NAME.test(n)) throw new Error('A design name is 1 to 60 letters, digits, spaces, - or _.');
  return n;
}

// Check (and tidy) a design read from a file.
export function checkDesign(data) {
  if (data?.kind !== 'marble-design' || typeof data.base !== 'object') throw new Error('not a marble design file');
  if (data.version > DESIGN_VERSION) throw new Error('this design was made by a newer version of the game');
  const base = data.base;
  return {
    kind: 'marble-design', version: DESIGN_VERSION,
    name: typeof data.name === 'string' ? data.name : '',
    finish: FINISHES.some((f) => f.id === data.finish) ? data.finish : 'glossy',
    base: {
      pattern: PATTERNS.some((p) => p.id === base.pattern) ? base.pattern : 'solid',
      color: /^#[0-9a-f]{6}$/i.test(base.color) ? base.color : '#888888',
      color2: /^#[0-9a-f]{6}$/i.test(base.color2) ? base.color2 : '#ffffff',
    },
    paint: typeof data.paint === 'string' && data.paint.startsWith('data:image/') ? data.paint : null,
  };
}

let server = null;
async function hasServer() {
  server ??= fetch('/api/marbles').then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json')).catch(() => false);
  return server;
}

function localDesigns() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) ?? {};
  } catch {
    return {};
  }
}

const cache = new Map(); // name -> design (loaded)

export async function listDesigns() {
  if (await hasServer()) return (await fetch('/api/marbles')).json();
  const names = new Set([...Object.keys(BUNDLED_BY_NAME), ...Object.keys(localDesigns())]);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function loadDesign(name) {
  name = checkDesignName(name);
  if (cache.has(name)) return cache.get(name);
  let data;
  if (await hasServer()) {
    const r = await fetch(`/api/marbles/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`no marble design called "${name}"`);
    data = await r.json();
  } else {
    data = localDesigns()[name] ?? (BUNDLED_BY_NAME[name] ? structuredClone(await BUNDLED_BY_NAME[name]()) : null);
    if (!data) throw new Error(`no marble design called "${name}"`);
  }
  const design = { ...checkDesign(data), name };
  cache.set(name, design);
  return design;
}

// Already loaded design, or null.
export const cachedDesign = (name) => cache.get(name) ?? null;

// Save under design.name. Returns { how: 'saved' | 'kept', design }: 'saved'
// wrote marbles/<name>.json; 'kept' (no server) stored it in this browser
// and downloaded the file.
export async function saveDesign(design) {
  const name = checkDesignName(design.name);
  const data = { ...checkDesign(design), name };
  let how;
  if (await hasServer()) {
    const r = await fetch(`/api/marbles/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`could not save "${name}": ${(await r.json().catch(() => ({}))).error ?? r.status}`);
    how = 'saved';
  } else {
    const all = localDesigns();
    all[name] = data;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    } catch {
      // full: the download below still has it
    }
    downloadDesign(data);
    how = 'kept';
  }
  cache.set(name, data);
  return { how, design: data };
}

export function downloadDesign(design) {
  const data = checkDesign(design);
  const blob = new Blob([`${JSON.stringify({ ...data, name: design.name }, null, 2)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${design.name || 'marble'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readDesignFile(file) {
  const data = checkDesign(JSON.parse(await file.text()));
  if (!data.name) data.name = file.name.replace(/\.json$/i, '');
  return data;
}

// Resolve a design id from the race setup: 'color:<Name>' (built-in) or
// 'design:<name>' (library, must be loaded). Null when unknown.
export function designById(id) {
  if (!id) return null;
  if (id.startsWith('color:')) return BUILTIN.find((b) => b.id === id)?.design ?? null;
  if (id.startsWith('design:')) return cachedDesign(id.slice(7));
  return null;
}
