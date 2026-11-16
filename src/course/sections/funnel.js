import { Vector3 } from 'three';
import { tracePath, framePoint, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { lathe, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

// Vortex bowl. Marbles drop in tangentially at the rim, circle while spiralling
// inwards, and fall through the centre hole into a catch tray underneath.
// opts: { side: 1 | -1 (bowl to the left / right), exitYaw, rim, hole }
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const rRim = opts.rim ?? 1.5, rHole = opts.hole ?? 0.38;
  const wall = opts.wall ?? 0.55, t = 0.05, tube = 0.35;

  // Lead-in that flattens out and ends above the rim, tangent to the bowl.
  const lead = tracePath(entry, [{ len: 1.6, pitch: -0.07 }]);
  buildTrack(ctx, lead);
  const end = lastFrame(lead);
  const rEntry = rRim - TRACK.width / 2 - 0.1;
  const center = framePoint(end, side * rEntry, 0, 0);
  center.y = end.pos.y - wall - 0.06; // rim level; lead-in clears the wall top

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
  const profile = [v2(rHole, yHole - tube), ...top, v2(rRim, wall), v2(rRim + t, wall), v2(rRim + t, -t)];
  for (let i = n - 1; i >= 0; i--) if (top[i].x > rHole + 2.5 * t) profile.push(v2(top[i].x, top[i].y - t));
  profile.push(v2(rHole + t, yHole - tube));
  // Deliberately faceted: every crease costs a circling marble a little energy,
  // which stands in for the rolling resistance that makes real marbles spiral in.
  ctx.addSolid(lathe(center, profile, opts.facets ?? 12));
  ctx.addPathPoint(new Vector3(center.x, center.y + yHole, center.z));

  // Catch tray under the hole, heading off in exitYaw.
  const yaw = opts.exitYaw ?? entry.yaw;
  const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const start = {
    pos: new Vector3(center.x, center.y + yHole - tube - 0.34, center.z).addScaledVector(dir, -0.55),
    yaw,
    pitch: -0.16,
  };
  const tray = tracePath(start, [{ len: 2.4 }]);
  buildTrack(ctx, tray, { width: widthStops([[0, 1.0], [1.1, 1.0], [2.4, TRACK.width]]), rail: 0.3 });
  ctx.addBoxAt(tray[0], { x: 0, y: 0.13, z: -0.02 }, 0.5 + TRACK.railThickness, 0.17, 0.02);
  return lastFrame(tray);
}
