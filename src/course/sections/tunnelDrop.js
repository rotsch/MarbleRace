import { Vector3 } from 'three';
import { tracePath, arc, makeFrame, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { lathe, sweepRings, v2 } from '../geometry.js';

// Tunnel drop: the track runs out over the mouth of a shaft and the marbles
// fall in. A cone guides them into a see-through tube that drops straight
// down, bends round to nearly level, can turn to one side, and lets them out
// onto ordinary track much lower down. The wall round the mouth is open
// where the track comes in and tall on the far side, so nothing overshoots.
// opts: { depth (straight fall in the tube), exitTurn (+ = left) }
const R_TOP = 0.55, R_HOLE = 0.22, CONE = 0.3, T = 0.04;
const RI = R_HOLE + 0.004, RO = RI + 0.03;

export function build(ctx, entry, opts = {}) {
  // Run-in: the track narrows a little, then ends over the mouth.
  const run = tracePath(entry, [{ len: 1.2, pitch: -deg(5) }]);
  buildTrack(ctx, run, { rail: 0.3 });
  const lip = lastFrame(run);
  const F = new Vector3(Math.sin(lip.yaw), 0, Math.cos(lip.yaw));
  // Mouth: its rim just below the track's end, the track reaching a little
  // way in over it.
  const center = lip.pos.clone().addScaledVector(F, R_TOP * 0.55);
  center.y = lip.pos.y - 0.08;

  // Cone: steep sides down to the hole, then a short sleeve.
  const sleeve = 0.06;
  const profile = [
    v2(R_HOLE, -CONE - sleeve), v2(R_HOLE, -CONE), v2(R_TOP, 0),
    v2(R_TOP + T, 0), v2(R_HOLE + T, -CONE - sleeve),
  ];
  ctx.addSolid(lathe(center, profile, 24));
  // Wall round the mouth: none where the track comes in, 0.5 on the far side.
  const aNear = Math.atan2(lip.pos.z - center.z, lip.pos.x - center.x);
  const rings = [], steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const h = 0.5 * Math.pow((1 - Math.cos(a - aNear)) / 2, 1.5);
    const c = Math.cos(a), s = Math.sin(a);
    rings.push([v2(R_TOP, -0.02), v2(R_TOP + T, -0.02), v2(R_TOP + T, h), v2(R_TOP, h)]
      .map((p) => new Vector3(center.x + p.x * c, center.y + p.y, center.z + p.x * s)));
  }
  ctx.addSolid(sweepRings(rings, [v2(R_TOP, -0.02), v2(R_TOP + T, -0.02), v2(R_TOP + T, 0.5), v2(R_TOP, 0.5)], { loop: true }));

  ctx.setCamera({ type: 'offset', offset: new Vector3(0, 0.6, 0).addScaledVector(F, -2.6) });
  ctx.addPathPoint(new Vector3(center.x, center.y - CONE, center.z));

  // Tube: straight down from the hole, a bend to nearly level, an optional
  // sideways turn.
  const depth = opts.depth ?? 1.2, bend = 0.45, pEnd = deg(-6);
  const top0 = new Vector3(center.x, center.y - CONE - sleeve + 0.03, center.z);
  const frames = [];
  const nf = Math.max(2, Math.ceil(depth / 0.06));
  for (let k = 0; k <= nf; k++) {
    const f = makeFrame(top0.clone().setY(top0.y - (depth * k) / nf), lip.yaw, -Math.PI / 2);
    f.d = (depth * k) / nf;
    frames.push(f);
  }
  const bottom = lastFrame(frames);
  const pivot = bottom.pos.clone().addScaledVector(bottom.U, bend);
  const nb = 14;
  for (let k = 1; k <= nb; k++) {
    const phi = -Math.PI / 2 + ((pEnd + Math.PI / 2) * k) / nb;
    const f = makeFrame(new Vector3(), lip.yaw, phi);
    f.pos.copy(pivot).addScaledVector(f.U, -bend);
    f.d = depth + bend * (phi + Math.PI / 2);
    frames.push(f);
  }
  const turn = opts.exitTurn ?? 0;
  const tail = tracePath(lastFrame(frames), Math.abs(turn) > 1e-3 ? [arc(0.9, turn, { pitch: pEnd }), { len: 0.3 }] : [{ len: 0.5, pitch: pEnd }]);
  const d0 = lastFrame(frames).d;
  for (const f of tail.slice(1)) { f.d += d0; frames.push(f); }
  // C-shaped ring with a hairline slit at the very top (see bigJump.js).
  const slit = 0.004, N = 28, ring = [];
  for (let k = 0; k <= N; k++) {
    const a = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    ring.push(v2(RI * Math.cos(a), RI * Math.sin(a)));
  }
  for (let k = N; k >= 0; k--) {
    const a = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    ring.push(v2(RO * Math.cos(a), RO * Math.sin(a)));
  }
  ctx.addSolid(sweepRings(frames.map((f) => ring.map((p) => framePoint(f, p.x, p.y, 0))), ring), undefined, 'glass');
  for (const f of frames) ctx.addPathPoint(f.pos, f.U, f.F, false);
  ctx.setCamera(null);

  // Out onto ordinary track, its floor level with the bottom of the tube.
  const end = lastFrame(frames);
  const out = tracePath(makeFrame(framePoint(end, 0, -RI, 0), end.yaw, end.pitch), [{ len: 1.2, pitch: -deg(4) }]);
  buildTrack(ctx, out);
  return lastFrame(out);
}
