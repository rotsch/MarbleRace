import { Vector3 } from 'three';
import { tracePath, makeFrame, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { rejoin } from './rejoin.js';
import { TRACK } from '../../config.js';

// Loop-the-loop after a steep drop.
//
// The loop is a corkscrew: it shifts sideways by more than a track width so
// the exit runs next to the entry. Marbles that are too slow roll back into
// the valley at the foot of the loop. The valley floor leans to the right and
// has no right-hand rail there, so anything lingering in it drains sideways
// into a bypass channel that rejoins the course after the loop. Fast marbles
// cross the valley too quickly to drift off.
// opts: { radius, drop, shift }
export function build(ctx, entry, opts = {}) {
  const r = opts.radius ?? 0.7;
  const drop = opts.drop ?? 3.5 * r;
  const shift = opts.shift ?? 0.92;
  const steep = deg(40);
  const curveIn = 0.9, curveOut = 1.4;

  // Steep ramp, flattening out to level at the foot of the loop.
  const straight = Math.max(0.2, drop / Math.tan(steep) - (curveIn + curveOut) / 2);
  const ramp = tracePath(entry, [{ len: curveIn, pitch: -steep }, { len: straight }, { len: curveOut, pitch: 0 }]);
  const foot = lastFrame(ramp);
  const Fh = new Vector3(Math.sin(foot.yaw), 0, Math.cos(foot.yaw));
  const Lh = new Vector3(Math.cos(foot.yaw), 0, -Math.sin(foot.yaw));

  // Valley: where the open side and the lean are.
  const valleyStart = foot.d - 0.95;
  const openAngle = deg(24);
  const valleyEnd = foot.d + r * openAngle;
  const lean = -deg(opts.lean ?? 6);
  const leanAt = (d) => lean * Math.max(0, Math.min(1, (d - valleyStart + 0.4) / 0.4, (valleyEnd + 0.4 - d) / 0.4));

  const frames = ramp.map((f) => {
    const g = makeFrame(f.pos, f.yaw, f.pitch, leanAt(f.d));
    g.d = f.d;
    return g;
  });
  const n = Math.ceil((2 * Math.PI * r) / TRACK.step);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = u * Math.PI * 2;
    const side = shift * (u - Math.sin(a) / (2 * Math.PI)); // eases in and out
    const pos = foot.pos.clone()
      .addScaledVector(Fh, r * Math.sin(a))
      .addScaledVector(Lh, side)
      .setY(foot.pos.y + r * (1 - Math.cos(a)));
    const d = foot.d + r * a;
    const g = makeFrame(pos, foot.yaw, a, leanAt(d));
    g.d = d;
    frames.push(g);
  }
  buildTrack(ctx, frames, {
    rail: (d) => ({ l: 0.32, r: d > valleyStart && d < valleyEnd ? 0 : 0.32 }),
  });
  const exit = lastFrame(frames);
  const out = { pos: exit.pos, yaw: foot.yaw, pitch: 0 };
  ctx.addSensorAt('loop: completed', makeFrame(out.pos, out.yaw, 0), { x: 0, y: 0.2, z: 0.3 }, 0.36, 0.25, 0.05);

  // Bypass channel alongside the valley, lower than its open edge.
  const side = -(TRACK.width + 2 * TRACK.railThickness + 0.02);
  const back = 1.3;
  const lowPitch = 0.05;
  const lowStart = framePoint(makeFrame(foot.pos, foot.yaw, 0), side, -0.32 + Math.tan(lowPitch) * back, -back);
  const catchEnd = back + r * Math.sin(openAngle) + 0.25;
  const { exit: merged, lowFrames } = rejoin(ctx, {
    main: { pos: out.pos, yaw: out.yaw },
    low: {
      pos: lowStart,
      lead: back + r + 0.6, // stay clear of the loop before moving sideways
      // Low rail on the valley side (marbles drop in over it), tall backboard
      // on the far side for the ones that arrive with sideways speed.
      rail: (d) => ({ l: d < catchEnd ? 0.22 : 0.3, r: d < catchEnd + 0.4 ? 0.95 : 0.4 }),
    },
    len: opts.len ?? 6.5,
    lowPitch,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.16, z: -0.02 }, TRACK.width / 2 + TRACK.railThickness, 0.2, 0.02);
  const mid = lowFrames[Math.floor(lowFrames.length * 0.7)];
  ctx.addSensorAt('loop: bypass', mid, { x: 0, y: 0.2, z: 0 }, 0.36, 0.25, 0.05);
  return merged;
}
