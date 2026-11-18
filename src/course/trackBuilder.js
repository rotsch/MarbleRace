import { TRACK } from '../config.js';
import { framePoint, tracePath } from './frame.js';
import { BufferAttribute } from 'three';
import { sweepRings, v2 } from './geometry.js';

const JOINT_RELIEF = 0.005;
const val = (v, d, total, i) => (typeof v === 'function' ? v(d, total, i) : v);

// Shape stops (track editor): changes a placed piece makes to its own
// design, at distances along the piece's main route.
//  [{ d, width, left, right }]  width: added to the inner width (both sides
//  equally); left / right: added to that wall's height. A wall brought down to
//  0 leaves that side open. Between stops the change eases smoothly; before
//  the first stop and after the last it eases back to nothing over SHAPE_EASE.
export const SHAPE_EASE = 0.5;
const MIN_HALF_WIDTH = 0.08; // a little more than a marble radius
const smooth = (u) => u * u * (3 - 2 * u);
export function shapeAt(stops, d) {
  if (!stops?.length) return null;
  const at = (s, u) => ({ width: (s.width ?? 0) * u, left: (s.left ?? 0) * u, right: (s.right ?? 0) * u });
  const first = stops[0], last = stops[stops.length - 1];
  if (d <= first.d) return at(first, smooth(Math.max(0, 1 - (first.d - d) / SHAPE_EASE)));
  if (d >= last.d) return at(last, smooth(Math.max(0, 1 - (d - last.d) / SHAPE_EASE)));
  let i = 1;
  while (stops[i].d < d) i++;
  const a = stops[i - 1], b = stops[i];
  const u = smooth((d - a.d) / (b.d - a.d || 1));
  const A = at(a, 1), B = at(b, 1);
  return { width: A.width + (B.width - A.width) * u, left: A.left + (B.left - A.left) * u, right: A.right + (B.right - A.right) * u };
}

// Cross-section of a U channel in local (x = left, y = up) coordinates.
//  l, r    half-widths to the left and right of the centre line
//  hl, hr  rail heights
export function uProfile(l, r, hl, hr, t = TRACK.railThickness, tf = TRACK.floorThickness) {
  // A rail height of 0 means an open side: the edge steps slightly down
  // instead of up, so nothing stops a marble rolling off it.
  if (hl < 0.012) hl = -0.012;
  if (hr < 0.012) hr = -0.012;
  return [
    v2(l + t, -tf), v2(l + t, hl), v2(l, hl), v2(l, 0),
    v2(-r, 0), v2(-r, hr), v2(-r - t, hr), v2(-r - t, -tf),
  ];
}

// Sweep a railed track along frames and add it to the course.
// opts.width: number or (d, total, i) => number | { l, r }   (inner width)
// opts.rail:  number or (d, total, i) => number | { l, r }   (rail heights)
// opts.path:  record the centre line as race progress (default true)
export function buildTrack(ctx, frames, opts = {}) {
  const length = frames[frames.length - 1].d - frames[0].d;
  const total = length || 1;
  // The piece's main route (the one recorded as race progress) takes the
  // piece's shape stops, measured from the start of the piece.
  const piece = opts.path !== false ? ctx.piece : null;
  const d0 = piece?.mainD ?? 0;
  const shape = piece?.shape?.length ? piece.shape : null;
  let profile0 = null;
  const accent = []; // per profile point: 0 floor, 1 rail top, -1 underside
  const rings = frames.map((f, i) => {
    const d = f.d - frames[0].d;
    let w = val(opts.width ?? TRACK.width, d, total, i);
    if (typeof w === 'number') w = { l: w / 2, r: w / 2 };
    let h = val(opts.rail ?? TRACK.railHeight, d, total, i);
    if (typeof h === 'number') h = { l: h, r: h };
    if (shape) {
      const s = shapeAt(shape, d0 + d);
      w = { l: Math.max(MIN_HALF_WIDTH, w.l + s.width / 2), r: Math.max(MIN_HALF_WIDTH, w.r + s.width / 2) };
      h = { l: Math.max(0, h.l + s.left), r: Math.max(0, h.r + s.right) };
    }
    // Where the walls are, for the editor's shape handles.
    if (piece && ctx.group) piece.samples.push({ d: d0 + d, frame: f, w, h });
    // Joint relief: each piece starts a few millimetres lower and wider than
    // nominal and eases back. A marble crossing from the previous piece then
    // always steps slightly down/out onto a face, and never runs into the
    // leading edge of this mesh (the classic "ghost collision" at seams).
    const relief = opts.relief === false ? 0 : JOINT_RELIEF * Math.max(0, 1 - d / 0.35);
    const prof = uProfile(w.l + relief, w.r + relief, h.l, h.r, TRACK.railThickness, opts.floorThickness);
    if (!profile0) profile0 = prof;
    const L = h.l < 0.012 ? 0 : 1, R = h.r < 0.012 ? 0 : 1; // an open side has no rail
    accent.push(-1, L, L, 0, 0, R, R, -1);
    return prof.map((p) => framePoint(f, p.x, p.y - relief, 0));
  });
  // `accent`: how far up its rail each vertex is, for themes that mark the
  // rail tops (the ITSENSE theme paints them red).
  const geometry = sweepRings(rings, profile0);
  geometry.setAttribute('accent', new BufferAttribute(new Float32Array(accent), 1));
  ctx.addSolid(geometry, opts.material);
  if (piece) piece.mainD = d0 + length;
  if (opts.path !== false) ctx.addPath(frames);
  return frames[frames.length - 1];
}

// Width helper: ease between widths. stops = [[d, width], ...] in distance units.
export function widthStops(stops) {
  return (d) => {
    if (d <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (d <= stops[i][0]) {
        const u = (d - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        const a = stops[i - 1][1], b = stops[i][1];
        if (typeof a === 'number') return a + (b - a) * u;
        return { l: a.l + (b.l - a.l) * u, r: a.r + (b.r - a.r) * u };
      }
    }
    return stops[stops.length - 1][1];
  };
}

// Trace segments from an entry pose, build the track, return the exit pose.
export function runTrack(ctx, entry, segments, opts = {}) {
  const frames = tracePath(entry, segments);
  buildTrack(ctx, frames, opts);
  return frames[frames.length - 1];
}
