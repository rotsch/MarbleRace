import { tracePath, arc, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { sweepRings, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

// Wall ride: a steep run-in builds speed, then a tight bend whose outer side
// curves up into a tall rounded wall (a quarter-pipe). The faster a marble
// is going, the higher up the wall it rides, so the pack spreads out across
// the height of the wall instead of queuing along one rail. The wall grows
// out of an ordinary rail at both ends of the bend.
// opts: { leadLen, leadPitch (run-in), radius, angle (+ = left), pitch (of the bend),
//         wall (radius of the rounded wall), height (wall height above the floor) }
const N = 10; // points along the rounded part of the wall

export function build(ctx, entry, opts = {}) {
  const lead = tracePath(entry, [{ len: opts.leadLen ?? 1.4, pitch: opts.leadPitch ?? -deg(18) }]);
  buildTrack(ctx, lead, { rail: 0.3 });
  const angle = opts.angle ?? deg(150);
  const side = angle >= 0 ? -1 : 1; // the outer side of the bend: right for a left turn
  const R = opts.wall ?? 0.45, H = Math.max(opts.height ?? 0.8, R + 0.1);
  const ease = 0.9; // the wall grows over this distance at each end
  const frames = tracePath(lastFrame(lead), [
    arc(opts.radius ?? 0.9, angle, { pitch: opts.pitch ?? -deg(5) }),
  ]);
  // Then back to an ordinary track.
  const total = lastFrame(frames).d - frames[0].d;
  const half = TRACK.width / 2, t = TRACK.railThickness, tf = TRACK.floorThickness; // t = tf
  const smooth = (u) => u * u * (3 - 2 * u);
  // Cross-section with the wall on +x (mirrored for walls on the right).
  // u = 0: an ordinary rail; u = 1: the full rounded wall.
  const profile = (u, relief) => {
    const rc = 0.002 + R * u, top = TRACK.railHeight + (H - TRACK.railHeight) * u;
    const inner = [v2(-half - relief, TRACK.railHeight), v2(-half - relief, 0)];
    const wall = [], back = [];
    for (let k = 0; k <= N; k++) {
      const a = (Math.PI / 2) * (k / N);
      wall.push(v2(half + relief + rc * Math.sin(a), rc - rc * Math.cos(a)));
      back.unshift(v2(half + relief + (rc + t) * Math.sin(a), rc - (rc + t) * Math.cos(a)));
    }
    const w = half + relief + rc;
    return [
      // back ends under the floor's edge, floor thickness down (t = tf).
      ...inner, ...wall, v2(w, top), v2(w + t, top), ...back,
      v2(-half - relief - t, -tf), v2(-half - relief - t, TRACK.railHeight),
    ].map((p) => v2(side * p.x, p.y - relief));
  };
  const rings = frames.map((f) => {
    const d = f.d - frames[0].d;
    const u = smooth(Math.min(1, d / ease, (total - d) / ease));
    const relief = 0.005 * Math.max(0, 1 - d / 0.35);
    return profile(Math.max(0, u), relief).map((p) => framePoint(f, p.x, p.y, 0));
  });
  ctx.addSolid(sweepRings(rings, profile(0, 0)));
  ctx.addPath(frames);
  const out = tracePath(lastFrame(frames), [{ len: 0.8, pitch: -deg(4) }]);
  buildTrack(ctx, out, { rail: 0.3 });
  return lastFrame(out);
}
