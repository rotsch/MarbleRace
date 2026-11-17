import { Vector3 } from 'three';
import { tracePath, makeFrame, framePoint, arc, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { lathe, sweepRings, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

// Big jump into a big funnel.
// A long steep run that widens towards its end, a short upward kicker that
// throws the marbles into the air, and a wide funnel that catches them. Its
// wall is low on the side the marbles fly in from and tall on the far side.
// The funnel drains into a closed pipe: straight down, a bend to level, a
// sideways turn, then out onto ordinary track.
// opts: { side: 1 | -1 (pipe turns left / right), rim, kick }
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const wide = 1.3;

  // Run-up and kicker, one piece.
  const ramp = tracePath(entry, [
    { len: 0.8, pitch: deg(-30) },
    { len: 2.4 },
    { len: 0.9, pitch: deg(opts.kick ?? 22) },
    { len: 0.12 },
  ]);
  ctx.setCamera({ type: 'offset', offset: framePoint(ramp[0], -2.6, 0, 0).sub(ramp[0].pos).add(new Vector3(0, 1.4, 0)) });
  buildTrack(ctx, ramp, { width: widthStops([[0, TRACK.width], [1.4, TRACK.width], [2.8, wide]]), rail: 0.3 });
  const lip = lastFrame(ramp);
  const Fh = new Vector3(Math.sin(lip.yaw), 0, Math.cos(lip.yaw));

  // Funnel: rim just beyond the lip and below it.
  const rRim = opts.rim ?? 2.0, rHole = 0.12, t = 0.05, tube = 0.08;
  const center = lip.pos.clone().addScaledVector(Fh, rRim + t + 0.15);
  center.y = lip.pos.y - 0.45; // rim level
  const n = 18, s0 = Math.tan(0.3), s1 = Math.tan(0.95);
  const top = [];
  let y = 0;
  for (let i = n; i >= 0; i--) {
    const r = rHole + ((rRim - rHole) * i) / n;
    top.unshift(v2(r, y));
    const u = (rRim - (r - (rRim - rHole) / (2 * n))) / (rRim - rHole);
    y -= (s0 + (s1 - s0) * Math.pow(Math.max(u, 0), 2)) * ((rRim - rHole) / n);
  }
  const yHole = top[0].y;
  const profile = [v2(rHole, yHole - tube), ...top, v2(rRim + t, 0), v2(rRim + t, -t)];
  for (let i = n - 1; i >= 0; i--) if (top[i].x > rHole + 2.5 * t) profile.push(v2(top[i].x, top[i].y - t));
  profile.push(v2(rHole + t, yHole - tube));
  // Faceted like the small funnel: the creases slowly take a circling
  // marble's energy, so it spirals down to the hole.
  ctx.addSolid(lathe(center, profile, 20));

  // Rim wall, 0.15 high where the marbles fly in, 1.0 on the far side.
  const aNear = Math.atan2(lip.pos.z - center.z, lip.pos.x - center.x);
  const rings = [];
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const h = 0.15 + 0.85 * (1 - Math.cos(a - aNear)) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    rings.push([v2(rRim, -t), v2(rRim + t, -t), v2(rRim + t, h), v2(rRim, h)]
      .map((p) => new Vector3(center.x + p.x * c, center.y + p.y, center.z + p.x * s)));
  }
  ctx.addSolid(sweepRings(rings, [v2(rRim, -t), v2(rRim + t, -t), v2(rRim + t, 1), v2(rRim, 1)], { loop: true }));

  ctx.setCamera({ type: 'fixed', pos: center.clone().addScaledVector(Fh, -3.2).add(new Vector3(0, 4.6, 0)) });
  ctx.addPathPoint(new Vector3(center.x, center.y + yHole, center.z));

  // Closed pipe from the hole: down, a bend to almost level, a sideways turn.
  const ri = rHole + 0.004, ro = ri + 0.03;
  const yaw = lip.yaw;
  const frames = [];
  const top0 = new Vector3(center.x, center.y + yHole - tube + 0.03, center.z);
  const fall = 0.35, bend = 0.45, pEnd = deg(-6);
  for (let k = 0; k <= 6; k++) {
    const f = makeFrame(top0.clone().setY(top0.y - (fall * k) / 6), yaw, -Math.PI / 2);
    f.d = (fall * k) / 6;
    frames.push(f);
  }
  const bottom = lastFrame(frames);
  const pivot = bottom.pos.clone().addScaledVector(bottom.U, bend);
  const nb = 14;
  for (let k = 1; k <= nb; k++) {
    const phi = -Math.PI / 2 + ((pEnd + Math.PI / 2) * k) / nb;
    const f = makeFrame(new Vector3(), yaw, phi);
    f.pos.copy(pivot).addScaledVector(f.U, -bend);
    f.d = fall + (bend * (phi + Math.PI / 2));
    frames.push(f);
  }
  const turn = tracePath(lastFrame(frames), [arc(1.0, side * Math.PI / 2, { pitch: pEnd }), { len: 0.4 }]);
  const d0 = lastFrame(frames).d;
  for (const f of turn.slice(1)) { f.d += d0; frames.push(f); }

  // C-shaped cross-section with a hairline slit at the very top, so it is a
  // simple polygon the sweep can cap; nothing can pass through the slit.
  const slit = 0.004, N = 28, pipe = [];
  for (let k = 0; k <= N; k++) {
    const a = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    pipe.push(v2(ri * Math.cos(a), ri * Math.sin(a)));
  }
  for (let k = N; k >= 0; k--) {
    const a = Math.PI / 2 + slit + ((2 * Math.PI - 2 * slit) * k) / N;
    pipe.push(v2(ro * Math.cos(a), ro * Math.sin(a)));
  }
  ctx.addSolid(sweepRings(frames.map((f) => pipe.map((p) => framePoint(f, p.x, p.y, 0))), pipe));
  // Inside the pipe: never a rescue spot (a marble put there would sit in its wall).
  for (const f of frames) ctx.addPathPoint(f.pos, f.U, f.F, false);
  ctx.setCamera(null);

  // Out onto ordinary track, its floor level with the bottom of the pipe.
  const end = lastFrame(frames);
  const out = tracePath(makeFrame(framePoint(end, 0, -ri, 0), end.yaw, end.pitch), [{ len: 1.2, pitch: deg(-4) }]);
  buildTrack(ctx, out);
  return lastFrame(out);
}
