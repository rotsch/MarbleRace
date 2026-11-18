import { Vector3 } from 'three';
import { tracePath, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { sweepRings, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

// Half-pipe: a wide U-shaped channel. Marbles enter at an angle to its axis,
// swing from wall to wall while drifting downhill, and leave through a slot
// in the end wall. Hitting that wall is where most of their speed goes.
// opts: { side: 1 | -1 (which way the pipe axis turns away from the entry), radius, len, angle,
//        leadLen, leadPitch, leadTurn (+ = left): the short lead-in into the pipe }
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const R = opts.radius ?? 1.1, len = opts.len ?? 7;
  const lip = 0.45, endLip = 1.0, t = 0.05;
  const pitch = opts.pitch ?? -deg(7);

  // Short lead-in that ends inside the pipe, a little above its floor.
  const lead = tracePath(entry, [{ len: opts.leadLen ?? 1.0, pitch: opts.leadPitch ?? -0.05, turn: opts.leadTurn ?? 0 }]);
  buildTrack(ctx, lead, { path: false });
  const end = lastFrame(lead);

  const yaw = end.yaw + side * (opts.angle ?? deg(30));
  const axis = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const start = { pos: end.pos.clone().addScaledVector(axis, -0.55).setY(end.pos.y - 0.56), yaw, pitch };
  const frames = tracePath(start, [{ len }]);

  // Cross-section: semicircle with short vertical lips, as a thin shell.
  const n = 24;
  const inner = [v2(R, R + lip)], outer = [v2(R + t, R + lip)];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - (Math.PI * i) / n;
    inner.push(v2(R * Math.sin(a), R - R * Math.cos(a)));
    outer.push(v2((R + t) * Math.sin(a), R - (R + t) * Math.cos(a)));
  }
  inner.push(v2(-R, R + lip));
  outer.push(v2(-R - t, R + lip));
  const shell = [...inner, ...outer.reverse()];
  ctx.addSolid(sweepRings(frames.map((f) => shell.map((p) => framePoint(f, p.x, p.y, 0))), shell));
  ctx.addPath(frames);

  // A flat plate with the given outline, standing across the pipe at frame f.
  const plate = (f, outline, z0, z1) =>
    ctx.addSolid(sweepRings([z0, z1].map((z) => outline.map((p) => framePoint(f, p.x, p.y, z))), outline));

  // Low wall at the upstream end so nothing rolls out backwards.
  const hBack = 0.5;
  const aBack = Math.acos(1 - hBack / R);
  const back = [];
  for (let i = 0; i <= 10; i++) {
    const a = aBack - (2 * aBack * i) / 10;
    back.push(v2(R * Math.sin(a), R - R * Math.cos(a)));
  }
  plate(frames[0], back, 0, 0.05);

  // End wall in two halves, leaving a track-wide slot in the middle.
  const last = lastFrame(frames);
  const slot = TRACK.width / 2 + 0.02;
  const aSlot = Math.asin(slot / R);
  for (const s of [1, -1]) {
    // Taller than the side walls: a rolling marble that hits a wall head-on
    // climbs it, and the fastest ones climb a long way.
    const half = [v2(s * R, R + endLip)];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI / 2 - ((Math.PI / 2 - aSlot) * i) / 12;
      half.push(v2(s * R * Math.sin(a), R - R * Math.cos(a)));
    }
    half.push(v2(s * slot, R + endLip));
    plate(last, half, -0.06, 0);
  }

  // Exit track starts in the slot, just below the pipe floor.
  const exit = tracePath({ pos: framePoint(last, 0, -0.03, -0.06), yaw, pitch }, [{ len: 1.2, pitch: -0.07 }]);
  buildTrack(ctx, exit, { rail: 0.3 });
  return lastFrame(exit);
}
