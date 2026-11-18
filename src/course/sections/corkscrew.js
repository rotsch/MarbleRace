import { Vector3 } from 'three';
import { tracePath, arc, makeFrame, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { sweepRings, v2 } from '../geometry.js';

// Corkscrew: a see-through tube that winds around a line running straight
// ahead and down, like a stretched-out spring. Marbles roll round its inside,
// wall over roof and back. The line falls steeply enough that the tube goes
// downhill everywhere, even where it winds upward, so a marble that is too
// slow to stay on the outside of a turn just drops across the tube and rolls
// on: nothing can stop in it. The winding eases in and out, so the tube
// starts and ends heading straight on, level with the track floor either side.
// After it, two sharp unbanked bends take off speed (radius 0 leaves them out).
// opts: { side (1: winds left first, -1: right), turns, radius (of the winding),
//         turnLen (forward distance per turn), brake (bend radius) }
const RI = 0.2, RO = RI + 0.03; // tube inside / outside radius (about two and a half marbles across)
const EASE = 0.6; // forward distance over which the winding eases in and out

export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const turns = Math.max(0.5, Math.round((opts.turns ?? 1) * 2) / 2);
  const R = opts.radius ?? 0.25, turnLen = opts.turnLen ?? 2.0;
  const lead = tracePath(entry, [{ len: 0.6, pitch: -deg(6) }]);
  buildTrack(ctx, lead, { rail: 0.3 });
  const a = lastFrame(lead);
  const F = new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  const L = new Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
  // Centre line of the tube starts RI above the floor.
  const p0 = a.pos.clone().add(new Vector3(0, RI, 0));

  // Angle round the winding against forward distance x: eases in over EASE,
  // runs at a steady rate, eases out over EASE.
  const span = turns * turnLen;
  const total = span + 2 * EASE;
  const rate = (2 * Math.PI * turns) / (span + EASE); // the eased ends together count as one EASE
  const theta = (x) => {
    if (x < EASE) return (rate * x * x) / (2 * EASE);
    if (x < EASE + span) return rate * (EASE / 2 + (x - EASE));
    const u = x - EASE - span;
    return rate * (EASE / 2 + span + u - (u * u) / (2 * EASE));
  };
  // The line drops fast enough that the tube never climbs: the winding lifts
  // the centre line at up to R * rate per unit forward, plus a margin.
  // The slope eases in from the lead-in's, so the tube's mouth sits level
  // with the floor in front of it.
  const fall = R * rate + Math.tan(deg(5)), s0 = Math.tan(deg(6));
  const drop = (x) => (x < EASE ? s0 * x + ((fall - s0) * x * x) / (2 * EASE) : s0 * EASE + ((fall - s0) * EASE) / 2 + fall * (x - EASE));
  const point = (x) => {
    const t = theta(x);
    return p0.clone().addScaledVector(F, x).addScaledVector(L, side * R * Math.sin(t)).add(new Vector3(0, R * (1 - Math.cos(t)) - drop(x), 0));
  };
  const n = Math.ceil(total / 0.04);
  const frames = [];
  for (let i = 0; i <= n; i++) {
    const x = (total * i) / n;
    const p = point(x), q = point(Math.min(total, x + 0.01)), o = point(Math.max(0, x - 0.01));
    const dir = q.sub(o).normalize();
    const f = makeFrame(p, Math.atan2(dir.x, dir.z), Math.asin(dir.y));
    f.d = x;
    frames.push(f);
  }
  // Closed tube: a C-shaped ring with a hairline slit on top, so it is a
  // simple polygon the sweep can cap; nothing can pass through the slit.
  const slit = 0.004, N = 28, ring = [];
  for (let k = 0; k <= N; k++) {
    const t = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    ring.push(v2(RI * Math.cos(t), RI * Math.sin(t)));
  }
  for (let k = N; k >= 0; k--) {
    const t = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    ring.push(v2(RO * Math.cos(t), RO * Math.sin(t)));
  }
  ctx.setCamera({ type: 'offset', offset: L.clone().multiplyScalar(-side * 3.6).add(new Vector3(0, 1.4, 0)) });
  ctx.addSolid(sweepRings(frames.map((f) => ring.map((p) => framePoint(f, p.x, p.y, 0))), ring), undefined, 'glass');
  // Inside the tube: never a rescue spot.
  for (const f of frames) ctx.addPathPoint(f.pos, f.U, f.F, false);
  ctx.setCamera(null);

  // Out onto ordinary track, its floor level with the bottom of the tube.
  const e = lastFrame(frames);
  let end = makeFrame(framePoint(e, 0, -RI, 0), e.yaw, e.pitch);
  const segs = [{ len: 1.0, pitch: -deg(4) }];
  const brake = opts.brake ?? 0.55;
  if (brake > 0) segs.push(arc(brake, deg(75)), arc(brake, deg(-75)));
  const out = tracePath(end, segs);
  buildTrack(ctx, out, { rail: brake > 0 ? 0.65 : 0.3 });
  return lastFrame(out);
}
