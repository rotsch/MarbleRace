import { tracePath, framePoint, arc, pathLength, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { merge, BRANCH_OFFSET } from './rejoin.js';
import { TRACK } from '../../config.js';

// A wedge splits the stream into a short straight path and a long detour that
// loops out to the side. Both drop the same height and merge again.
// opts: { side: 1 | -1 } which side the long path swings out to (default right)
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? -1;
  const flareLen = 1.5;
  const wide = 2 * BRANCH_OFFSET + TRACK.width;
  const flare = tracePath(entry, [{ len: flareLen, pitch: -0.16 }]);
  buildTrack(ctx, flare, { width: widthStops([[0, TRACK.width], [flareLen, wide]]), rail: 0.26 });
  const s = lastFrame(flare);

  // Wedge: knife edge pointing upstream, widening to cover the gap between branches.
  const hw = BRANCH_OFFSET - TRACK.width / 2 + 0.02, h = 0.26;
  const pts = [];
  for (const y of [-0.03, h]) {
    pts.push(framePoint(s, 0, y, -0.85), framePoint(s, hw, y, 0), framePoint(s, -hw, y, 0));
    pts.push(framePoint(s, hw, y, 0.25), framePoint(s, -hw, y, 0.25));
  }
  ctx.addHull(pts);

  // Long path: out, around, and back in line.
  const r = 1.2, leg = opts.leg ?? 0.8;
  const longSegs = [
    arc(r, side * deg(90), { bank: side * 0.25 }),
    { len: leg },
    arc(r, -side * deg(180), { bank: -side * 0.3 }),
    { len: leg },
    arc(r, side * deg(90), { bank: side * 0.25 }),
  ];
  const advance = 4 * r;
  const drop = Math.tan(deg(6.5)) * pathLength(longSegs);
  const longStart = { pos: framePoint(s, side * BRANCH_OFFSET, 0, 0), yaw: s.yaw, pitch: -deg(6.5) };
  buildTrack(ctx, tracePath(longStart, longSegs), { rail: 0.32, path: false });
  ctx.addSensorAt('splitter: long path', s, { x: side * BRANCH_OFFSET, y: 0.2, z: 0.5 }, 0.3, 0.25, 0.05);

  const shortStart = { pos: framePoint(s, -side * BRANCH_OFFSET, 0, 0), yaw: s.yaw, pitch: -Math.atan(drop / advance) };
  buildTrack(ctx, tracePath(shortStart, [{ len: advance }]));
  ctx.addSensorAt('splitter: short path', s, { x: -side * BRANCH_OFFSET, y: 0.2, z: 0.5 }, 0.3, 0.25, 0.05);

  const center = { pos: s.pos.clone(), yaw: s.yaw, pitch: -0.14 };
  center.pos.x += Math.sin(s.yaw) * advance;
  center.pos.z += Math.cos(s.yaw) * advance;
  center.pos.y -= drop;
  return merge(ctx, center);
}
