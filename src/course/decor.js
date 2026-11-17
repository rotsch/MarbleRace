import * as THREE from 'three';
import { framePoint, frameQuat, makeFrame } from './frame.js';
import { TRACK, COLORS } from '../config.js';

// Race-track dressing for the start and finish: gantries with banners, start
// lights, a painted grid, chequered lines, red and white kerbs on the rails
// and grandstands. All of it is decoration only (no colliders), so it changes
// nothing about the race, and headless runs skip it entirely.

const RED = 0xe0201b;
const GREEN = 0x22c55e;
const LIGHT_OFF = 0x3a1414;
const LIGHT_COUNT = 5;
// Spectators in the grandstands: marbles a little smaller than the racers.
const SPECTATOR = { radius: 0.055, gap: 0.14 };

// Materials and textures are made once and shared by every race.
let M = null;
function materials() {
  if (M) return M;
  const std = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
  const basic = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, ...extra });
  const decal = (map) =>
    basic(map, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M = {
    frame: std(0x2a2a2a),
    white: std(0xffffff),
    kerbRed: std(RED),
    kerbWhite: std(0xffffff),
    seat: std(0xd9dde3),
    startBanner: basic(bannerTexture('START')),
    finishBanner: basic(bannerTexture('FINISH')),
    flag: basic(checkerTexture(4, 3)),
    line: decal(checkerTexture(12, 2)),
    grid: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => decal(gridBoxTexture(n))),
    lights: Array.from({ length: LIGHT_COUNT }, () => new THREE.MeshBasicMaterial({ color: LIGHT_OFF })),
  };
  return M;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, pixelated = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (pixelated) t.magFilter = THREE.NearestFilter;
  return t;
}

function checker(g, x, y, w, h, cols, rows) {
  const sw = w / cols, sh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      g.fillStyle = (r + k) % 2 ? '#111' : '#fff';
      g.fillRect(x + k * sw, y + r * sh, Math.ceil(sw), Math.ceil(sh));
    }
  }
}

function checkerTexture(cols, rows) {
  const [c, g] = canvas(cols * 16, rows * 16);
  checker(g, 0, 0, c.width, c.height, cols, rows);
  return texture(c, true);
}

// Black banner, chequered ends, the word in the middle.
function bannerTexture(text) {
  const [c, g] = canvas(1024, 192);
  g.fillStyle = '#111';
  g.fillRect(0, 0, 1024, 192);
  checker(g, 0, 0, 144, 192, 3, 4);
  checker(g, 880, 0, 144, 192, 3, 4);
  g.fillStyle = '#fff';
  g.font = 'bold 128px system-ui, "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 102, 700);
  return texture(c);
}

// Painted grid slot: an open bracket with the slot number, on transparency.
function gridBoxTexture(n) {
  const [c, g] = canvas(256, 256);
  g.strokeStyle = '#111';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(28, 150);
  g.lineTo(28, 24);
  g.lineTo(228, 24);
  g.lineTo(228, 150);
  g.stroke();
  g.fillStyle = '#111';
  g.font = 'bold 96px system-ui, "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 128, 104);
  return texture(c);
}

// Same point and heading as frame `f` (offset by local x, y, z), but level:
// gantries and stands stand upright on a sloping track.
const level = (f, x = 0, y = 0, z = 0) => makeFrame(framePoint(f, x, y, z), f.yaw, 0, 0);

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Flat plane lying on the track floor of frame `f`, its top edge pointing
// forward, so it reads the right way round from a camera following the race.
function floorDecal(ctx, f, x, z, w, d, material) {
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(Math.PI);
  return ctx.addDecor(geo, framePoint(f, x, 0.004, z), frameQuat(f), { material });
}

// Two pillars and a beam carrying a banner on both faces. Returns the level
// frame of the gantry and its beam height, for adding more parts.
function gantry(ctx, f, banner) {
  const m = materials();
  const g = level(f);
  const q = frameQuat(g);
  const W = TRACK.width / 2 + TRACK.railThickness + 0.14;
  const H = 1.05; // beam centre above the floor
  const P = 0.07; // pillar thickness
  const foot = -0.4; // pillars reach below the track, as if standing on the ground below
  for (const s of [-1, 1]) {
    ctx.addDecor(box(P, H + 0.12 - foot, P), framePoint(g, s * W, (H + 0.12 + foot) / 2, 0), q, { material: m.frame, outline: 30 });
  }
  ctx.addDecor(box(2 * W + P, 0.26, P), framePoint(g, 0, H, 0), q, { material: m.frame, outline: 30 });
  for (const s of [-1, 1]) {
    const plane = new THREE.PlaneGeometry(2 * W - 0.1, 0.22);
    if (s < 0) plane.rotateY(Math.PI);
    ctx.addDecor(plane, framePoint(g, 0, H, s * (P / 2 + 0.002)), q, { material: banner });
  }
  return { g, q, W, H };
}

// Alternating red and white blocks on top of both rails along `frames`.
function kerbs(ctx, frames, railHeight, every = 2) {
  const m = materials();
  const t = TRACK.railThickness;
  for (let i = 0, k = 0; i + every < frames.length; i += every, k++) {
    const a = frames[i], b = frames[i + every];
    const len = a.pos.distanceTo(b.pos);
    const mid = { pos: a.pos.clone().lerp(b.pos, 0.5), L: a.L, U: a.U, F: a.F };
    for (const s of [-1, 1]) {
      const c = framePoint(mid, s * (TRACK.width / 2 + t / 2), railHeight + 0.008, 0);
      ctx.addDecor(box(t + 0.006, 0.016, len), c, frameQuat(a), { material: k % 2 ? m.kerbWhite : m.kerbRed });
    }
  }
}

// Stepped stand beside the track, `side` 1 = left, -1 = right, spanning
// local z from z0 to z1 of the level frame `g`, starting `x0` out from the
// centre line and facing the track.
function grandstand(ctx, g, side, x0, z0, z1, floorY, crowd) {
  const m = materials();
  const q = frameQuat(g);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const tiers = 4, depth = 0.2, rise = 0.13;
  for (let i = 0; i < tiers; i++) {
    const top = floorY + 0.12 + i * rise;
    const bottom = floorY - 0.35;
    const x = side * (x0 + depth * (i + 0.5));
    ctx.addDecor(box(depth, top - bottom, len), framePoint(g, x, (top + bottom) / 2, zc), q, { material: m.seat, outline: 30 });
    // Spectators: a row of marbles sitting on the tier, a few seats empty.
    for (let z = z0 + SPECTATOR.gap / 2; z < z1; z += SPECTATOR.gap) {
      if (crowd.rnd() < 0.12) continue;
      const jitter = (crowd.rnd() - 0.5) * 0.03;
      crowd.seats.push({
        pos: framePoint(g, x + side * jitter, top + SPECTATOR.radius, z + jitter),
        color: COLORS[Math.floor(crowd.rnd() * COLORS.length)].hex,
      });
    }
  }
  // Back wall and roof.
  const back = side * (x0 + depth * tiers + 0.02);
  const roofY = floorY + 0.12 + tiers * rise + 0.3;
  ctx.addDecor(box(0.04, roofY + 0.35 - floorY, len), framePoint(g, back, (roofY + floorY - 0.35) / 2, zc), q, { material: m.white, outline: 30 });
  ctx.addDecor(box(depth * tiers + 0.12, 0.03, len + 0.08), framePoint(g, side * (x0 + (depth * tiers) / 2), roofY, zc), q, { material: m.frame, outline: 30 });
}

// Start: grid boxes under the spawn slots, a chequered start line, a gantry
// with five start lights over it and kerbs along the start straight.
//  frames     the start ramp's frames
//  railHeight its rail height
//  lineZ      distance of the start line from the ramp's first frame
export function dressStart(ctx, frames, railHeight, lineZ) {
  if (!ctx.group) return;
  const m = materials();
  const f0 = frames[0];
  ctx.spawn.forEach((p, i) => {
    // Slot numbers count from the front row, left to right as seen from behind.
    const rows = ctx.spawn.length / 2;
    const row = Math.floor(i / 2), col = i % 2;
    const n = (rows - 1 - row) * 2 + (1 - col) + 1;
    const local = p.clone().sub(f0.pos);
    floorDecal(ctx, f0, local.dot(f0.L), local.dot(f0.F), 0.25, 0.25, m.grid[n - 1]);
  });
  floorDecal(ctx, f0, 0, lineZ, TRACK.width, 0.1, m.line);
  kerbs(ctx, frames, railHeight);

  const lineFrame = { pos: framePoint(f0, 0, 0, lineZ + 0.12), L: f0.L, U: f0.U, F: f0.F, yaw: f0.yaw };
  const { g, q, H } = gantry(ctx, lineFrame, m.startBanner);
  // Light pod hanging under the beam, facing the grid.
  const y = H - 0.25;
  ctx.addDecor(box(0.5, 0.11, 0.06), framePoint(g, 0, y, 0), q, { material: m.frame, outline: 30 });
  ctx.addDecor(box(0.03, 0.12, 0.03), framePoint(g, 0, y + 0.1, 0), q, { material: m.frame });
  m.lights.forEach((mat, i) => {
    const disc = new THREE.CircleGeometry(0.034, 20).rotateY(Math.PI);
    ctx.addDecor(disc, framePoint(g, (i - (LIGHT_COUNT - 1) / 2) * 0.095, y, -0.032), q, { material: mat });
  });
  setStartLights(0);
  ctx.startLights = setStartLights;
}

// Colours of the structures for the white look or the neon look (T).
const LOOKS = {
  white: { frame: 0x2a2a2a, white: 0xffffff, seat: 0xd9dde3, emissive: 0x000000 },
  neon: { frame: 0xff2a6d, white: 0x2b0f54, seat: 0x05d9e8, emissive: 0x330818 },
};
export function setDecorLook(look) {
  if (!M) return;
  const c = LOOKS[look] ?? LOOKS.white;
  M.frame.color.set(c.frame);
  M.frame.emissive.set(c.emissive);
  M.white.color.set(c.white);
  M.seat.color.set(c.seat);
}

// Start lights: `lit` red lights on (0..5), or all green with go = true.
export function setStartLights(lit, go = false) {
  if (!M) return;
  M.lights.forEach((mat, i) => mat.color.setHex(go ? GREEN : i < lit ? RED : LIGHT_OFF));
}
export const START_LIGHTS = LIGHT_COUNT;

// Finish: chequered line at the finish sensor, a finish gantry with flags,
// kerbs along the run-out and grandstands on both sides.
export function dressFinish(ctx, runFrames, gate, railHeight) {
  if (!ctx.group) return;
  const m = materials();
  floorDecal(ctx, gate, 0, -0.05, TRACK.width, 0.1, m.line);
  kerbs(ctx, runFrames, railHeight);
  const { g, q, W, H } = gantry(ctx, gate, m.finishBanner);
  for (const s of [-1, 1]) {
    // Chequered flag flying outwards from the top of each pillar.
    const flag = new THREE.PlaneGeometry(0.24, 0.17);
    ctx.addDecor(box(0.015, 0.36, 0.015), framePoint(g, s * W, H + 0.3, 0), q, { material: m.frame });
    ctx.addDecor(flag, framePoint(g, s * (W + 0.125), H + 0.38, 0), q, { material: m.flag });
  }
  let seed = 20240611;
  const crowd = { seats: [], rnd: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
  grandstand(ctx, g, 1, 1.35, -1.5, 0.9, 0, crowd);
  grandstand(ctx, g, -1, 1.35, -1.5, 0.9, 0, crowd);
  addSpectators(ctx, crowd.seats);
}

// All spectator marbles as one instanced mesh (one draw call).
function addSpectators(ctx, seats) {
  const m = materials();
  m.spectator ??= new THREE.MeshPhysicalMaterial({
    roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    envMap: ctx.materials.envMap ?? null, envMapIntensity: 0.9,
  });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(SPECTATOR.radius, 20, 14), m.spectator, seats.length);
  const mat = new THREE.Matrix4();
  const color = new THREE.Color();
  seats.forEach((s, i) => {
    mesh.setMatrixAt(i, mat.makeTranslation(s.pos.x, s.pos.y, s.pos.z));
    mesh.setColorAt(i, color.setHex(s.color));
  });
  mesh.userData.decor = true;
  ctx.group.add(mesh);
}
