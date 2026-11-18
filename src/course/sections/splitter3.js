import { tracePath, framePoint, arc, pathLength, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

const LANE = 0.8; // lane centres sit this far apart

// Three-way splitter: the track widens and two wedges split the stream into
// three lanes. The middle lane runs straight; the outer two each swing out
// in a loop to their own side, one short and one long, and come back into
// line. All three drop the same height and funnel back into one track.
// opts: { radius (of the loops), leftLeg, rightLeg (straight part of each loop),
//         tipGap (distance between the wedges' points: smaller sends more
//         marbles to the outer lanes, larger more down the middle) }
export function build(ctx, entry, opts = {}) {
  const flareLen = 1.8;
  const wide = 2 * LANE + TRACK.width;
  const flare = tracePath(entry, [{ len: flareLen, pitch: -0.09 }]);
  buildTrack(ctx, flare, { width: widthStops([[0, TRACK.width], [flareLen, wide]]), rail: 0.3 });
  const s = lastFrame(flare);

  // Wedges between the lanes: knife edge pointing upstream, widening to
  // cover the gap between neighbouring lanes' walls.
  const hw = LANE / 2 - TRACK.width / 2 + 0.02, h = 0.3;
  const tip = Math.min(1.3, Math.max(0.1, opts.tipGap ?? 0.6)) / 2;
  for (const k of [1, -1]) {
    const x = k * LANE / 2, pts = [];
    for (const y of [-0.03, h]) {
      pts.push(framePoint(s, k * tip, y, -0.85), framePoint(s, x + hw, y, 0), framePoint(s, x - hw, y, 0));
      pts.push(framePoint(s, x + hw, y, 0.25), framePoint(s, x - hw, y, 0.25));
    }
    ctx.addHull(pts);
  }

  const r = opts.radius ?? 1.0;
  const loop = (side, leg) => [
    arc(r, side * deg(90), { bank: side * 0.25 }),
    { len: leg },
    arc(r, -side * deg(180), { bank: -side * 0.3 }),
    { len: leg },
    arc(r, side * deg(90), { bank: side * 0.25 }),
  ];
  const left = loop(1, opts.leftLeg ?? 0.5), right = loop(-1, opts.rightLeg ?? 1.2);
  const advance = 4 * r;
  // Every lane drops the same height: the longest at 4 degrees, the others
  // at whatever slope that takes.
  const drop = Math.tan(deg(4)) * Math.max(pathLength(left), pathLength(right));
  const lane = (x, segs, path, name) => {
    const start = { pos: framePoint(s, x, 0, 0), yaw: s.yaw, pitch: -Math.atan(drop / pathLength(segs)) };
    buildTrack(ctx, tracePath(start, segs), { rail: path ? TRACK.railHeight : 0.36, path });
    ctx.addSensorAt(`splitter3: ${name}`, s, { x, y: 0.2, z: 0.5 }, 0.3, 0.25, 0.05);
  };
  lane(0, [{ len: advance }], true, 'middle');
  lane(LANE, left, false, 'left loop');
  lane(-LANE, right, false, 'right loop');

  // Three lanes into one.
  const center = { pos: s.pos.clone(), yaw: s.yaw, pitch: -0.08 };
  center.pos.x += Math.sin(s.yaw) * advance;
  center.pos.z += Math.cos(s.yaw) * advance;
  center.pos.y -= drop;
  const len = 2.4;
  const frames = tracePath(center, [{ len, pitch: -0.08 }]);
  buildTrack(ctx, frames, { width: widthStops([[0, wide], [len, TRACK.width]]), rail: 0.5 });
  return lastFrame(frames);
}
