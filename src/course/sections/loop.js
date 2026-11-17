import { Vector3 } from 'three';
import { tracePath, makeFrame, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { rejoin } from './rejoin.js';
import { TRACK } from '../../config.js';

// Loop-the-loop after a steep drop.
//
// The loop is a corkscrew: it shifts sideways by more than a track width so
// the exit runs next to the entry.
//
// Bypass: at the foot of the loop there is a short gap in the floor. A marble
// that is fast enough for the loop flies across it and lands on the far side,
// which sits a little lower. A marble that is too slow drops through, and so
// does any marble that rolls back down out of the loop (from that side the gap
// is a step up, so it cannot get back onto the ramp). Underneath, a channel
// collects them and rejoins the course after the loop.
// opts: { radius, drop, shift, gap }
export function build(ctx, entry, opts = {}) {
  const r = opts.radius ?? 0.55;
  const drop = opts.drop ?? 3.2 * r;
  const shift = opts.shift ?? 0.92;
  const gap = opts.gap ?? 0.34;
  const step = 0.03;
  const steep = deg(40);
  const curveIn = 0.9, curveOut = 1.4;

  // Steep ramp, flattening out to level just before the gap.
  const straight = Math.max(0.2, drop / Math.tan(steep) - (curveIn + curveOut) / 2);
  const ramp = tracePath(entry, [{ len: curveIn, pitch: -steep }, { len: straight }, { len: curveOut, pitch: 0 }, { len: 0.2 }]);
  buildTrack(ctx, ramp, { rail: 0.32 });
  const edge = lastFrame(ramp);
  const Fh = new Vector3(Math.sin(edge.yaw), 0, Math.cos(edge.yaw));
  const Lh = new Vector3(Math.cos(edge.yaw), 0, -Math.sin(edge.yaw));

  // Far side of the gap: a short level run, then the loop.
  const foot = makeFrame(edge.pos.clone().addScaledVector(Fh, gap).setY(edge.pos.y - step), edge.yaw, 0);
  const runIn = 0.15;
  const frames = tracePath(foot, [{ len: runIn }]);
  const base = lastFrame(frames);
  const n = Math.ceil((2 * Math.PI * r) / TRACK.step);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = u * Math.PI * 2;
    const side = shift * (u - Math.sin(a) / (2 * Math.PI)); // eases in and out
    const pos = base.pos.clone()
      .addScaledVector(Fh, r * Math.sin(a))
      .addScaledVector(Lh, side)
      .setY(base.pos.y + r * (1 - Math.cos(a)));
    // Lean the track into the sideways shift (like a banked corkscrew), so the
    // floor rather than a rail pushes the marble across. Rubbing along a rail
    // at loop speeds would cost it most of its energy.
    const bank = Math.atan((shift * Math.sin(a)) / (2 * Math.PI * r));
    const g = makeFrame(pos, base.yaw, a, bank);
    g.d = base.d + r * a;
    frames.push(g);
  }
  buildTrack(ctx, frames, { rail: 0.36 });
  const out = { pos: lastFrame(frames).pos, yaw: base.yaw, pitch: 0 };
  ctx.addSensorAt('loop: completed', makeFrame(out.pos, out.yaw, 0), { x: 0, y: 0.2, z: 0.3 }, 0.36, 0.25, 0.05);

  // Bypass channel under the gap. Its rails reach up past the main track
  // there, closing the sides of the gap.
  const depth = 0.36, back = 0.45, lowPitch = 0.05;
  const lowStart = framePoint(makeFrame(edge.pos, edge.yaw, 0), 0, -depth + Math.tan(lowPitch) * back, -back);
  const tall = depth + 0.3;
  const { exit: merged, lowFrames } = rejoin(ctx, {
    main: { pos: out.pos, yaw: out.yaw, rail: 0.4 },
    low: {
      pos: lowStart,
      lead: back + gap + runIn + r + 0.5, // stay under the loop before moving sideways
      rail: (d) => (d > back - 0.08 && d < back + gap + 0.08 ? tall : 0.28),
    },
    len: opts.len ?? 6.5,
    lowPitch,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.12, z: -0.02 }, TRACK.width / 2 + TRACK.railThickness, 0.16, 0.02);
  const mid = lowFrames[Math.floor(lowFrames.length * 0.7)];
  ctx.addSensorAt('loop: bypass', mid, { x: 0, y: 0.2, z: 0 }, 0.36, 0.25, 0.05);
  return merged;
}
