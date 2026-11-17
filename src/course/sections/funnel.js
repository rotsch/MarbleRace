import { Vector3 } from 'three';
import { tracePath, framePoint, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { lathe, sweepRings, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

// Vortex bowl. Marbles drop in tangentially at the rim, circle while spiralling
// inwards, and fall through the centre hole into a catch tray underneath.
// opts: { side: 1 | -1 (bowl to the left / right), exitYaw, rim, hole }
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const rRim = opts.rim ?? 1.5, rHole = opts.hole ?? 0.38;
  const wall = opts.wall ?? 0.55, t = 0.05, tube = 0.35;

  // Lead-in that flattens out, passes through a gap in the rim wall and ends
  // just inside it, tangent to the bowl and slightly above the surface.
  // The part that overhangs the bowl is a solid block down to the surface, so
  // no marble can wedge itself underneath the track.
  // One fixed camera above the bowl for the whole time marbles are in it.
  const cam = { type: 'fixed', pos: new Vector3() };
  ctx.setCamera(cam);
  const approach = tracePath(entry, [{ len: 0.9, pitch: -0.06 }]);
  buildTrack(ctx, approach);
  const lead = tracePath(lastFrame(approach), [{ len: 1.5 }]);
  buildTrack(ctx, lead, { floorThickness: 0.5 });
  const end = lastFrame(lead);
  const outer = TRACK.width / 2 + TRACK.railThickness;
  const rEntry = rRim - outer - 0.02;
  const center = framePoint(end, side * rEntry, 0, 0);
  center.y = end.pos.y - 0.1; // rim level

  // Bowl surface: gentle at the rim, steep at the hole, never flat.
  const n = 14, s0 = Math.tan(0.17), s1 = Math.tan(0.85);
  const top = [];
  let y = 0;
  for (let i = n; i >= 0; i--) {
    const r = rHole + ((rRim - rHole) * i) / n;
    top.unshift(v2(r, y));
    const u = (rRim - (r - (rRim - rHole) / (2 * n))) / (rRim - rHole);
    y -= (s0 + (s1 - s0) * Math.pow(Math.max(u, 0), 2.5)) * ((rRim - rHole) / n);
  }
  const yHole = top[0].y;
  const profile = [v2(rHole, yHole - tube), ...top, v2(rRim + t, 0), v2(rRim + t, -t)];
  for (let i = n - 1; i >= 0; i--) if (top[i].x > rHole + 2.5 * t) profile.push(v2(top[i].x, top[i].y - t));
  profile.push(v2(rHole + t, yHole - tube));
  // Deliberately faceted: every crease costs a circling marble a little energy,
  // which stands in for the rolling resistance that makes real marbles spiral in.
  ctx.addSolid(lathe(center, profile, opts.facets ?? 12));

  // Rim wall: an arc that leaves an opening where the lead-in track comes in.
  // Circling marbles that reach the opening meet the side of the track itself.
  const aEnd = Math.atan2(end.pos.z - center.z, end.pos.x - center.x);
  const forward = -Math.sin(aEnd) * end.F.x + Math.cos(aEnd) * end.F.z > 0 ? 1 : -1;
  const gap0 = Math.atan2(Math.sqrt(Math.max(0, rRim ** 2 - (rEntry + outer) ** 2)), rEntry + outer) - 0.06;
  const gap1 = Math.atan2(Math.sqrt(rRim ** 2 - (rEntry - outer) ** 2), rEntry - outer) + 0.06;
  const wallProfile = [v2(rRim, -t), v2(rRim + t, -t), v2(rRim + t, wall), v2(rRim, wall)];
  const span = Math.PI * 2 - (gap1 - gap0), steps = 44;
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const a = aEnd - forward * (gap1 + (span * i) / steps);
    rings.push(wallProfile.map((p) => new Vector3(center.x + p.x * Math.cos(a), center.y + p.y, center.z + p.x * Math.sin(a))));
  }
  ctx.addSolid(sweepRings(rings, wallProfile));
  cam.pos.copy(center).addScaledVector(end.F, -2.0).add(new Vector3(0, 3.4, 0));
  ctx.addPathPoint(new Vector3(center.x, center.y + yHole, center.z));

  // Catch tray under the hole, heading off in exitYaw.
  const yaw = opts.exitYaw ?? entry.yaw;
  const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const start = {
    pos: new Vector3(center.x, center.y + yHole - tube - 0.34, center.z).addScaledVector(dir, -0.55),
    yaw,
    pitch: -0.1,
  };
  const tray = tracePath(start, [{ len: 2.4 }]);
  buildTrack(ctx, tray, { width: widthStops([[0, 1.0], [1.1, 1.0], [2.4, TRACK.width]]), rail: 0.32, path: false });
  const emerge = tray.findIndex((f) => f.d > 1.0);
  ctx.addPath(tray.slice(0, emerge));
  ctx.setCamera(null);
  ctx.addPath(tray.slice(emerge));
  ctx.addBoxAt(tray[0], { x: 0, y: 0.13, z: -0.02 }, 0.5 + TRACK.railThickness, 0.17, 0.02);
  return lastFrame(tray);
}
