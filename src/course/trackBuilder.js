import { TRACK } from '../config.js';
import { framePoint, tracePath } from './frame.js';
import { sweepRings, v2 } from './geometry.js';

const val = (v, d, total, i) => (typeof v === 'function' ? v(d, total, i) : v);

// Cross-section of a U channel in local (x = left, y = up) coordinates.
//  l, r    half-widths to the left and right of the centre line
//  hl, hr  rail heights
export function uProfile(l, r, hl, hr, t = TRACK.railThickness, tf = TRACK.floorThickness) {
  hl = Math.max(hl, 0.012);
  hr = Math.max(hr, 0.012);
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
  const total = frames[frames.length - 1].d - frames[0].d || 1;
  let profile0 = null;
  const rings = frames.map((f, i) => {
    const d = f.d - frames[0].d;
    let w = val(opts.width ?? TRACK.width, d, total, i);
    if (typeof w === 'number') w = { l: w / 2, r: w / 2 };
    let h = val(opts.rail ?? TRACK.railHeight, d, total, i);
    if (typeof h === 'number') h = { l: h, r: h };
    const prof = uProfile(w.l, w.r, h.l, h.r);
    if (!profile0) profile0 = prof;
    return prof.map((p) => framePoint(f, p.x, p.y, 0));
  });
  ctx.addSolid(sweepRings(rings, profile0), opts.material);
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
