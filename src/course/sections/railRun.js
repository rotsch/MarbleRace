import { Vector3 } from 'three';
import { tracePath, framePoint, makeFrame, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { sweepRings, v2 } from '../geometry.js';
import { rejoin, trayBackWall } from './rejoin.js';
import { TRACK, MARBLE } from '../../config.js';

// Gutter rails: the track narrows to single file and hands the marbles over
// to two thin round rails with nothing at the sides. A marble on its own
// rides them to the end; one that is knocked or wobbles too much drops off
// onto a wide catch tray underneath, which is the slow way round and rejoins
// the course after the rails.
// The rails are spaced so a marble sitting on them is exactly as high as on
// the track floor, and they rise out of the floor (and sink into it at the
// end), so there is no step at either hand-over.
// opts: { len (of the rails), pitch, gap (between rail centres), drop (tray below the rails),
//         entryWidth (of the track where it meets the rails) }
const RAIL_R = 0.02;
const SINK = 0.03; // how far the rails start and end below their riding height

export function build(ctx, entry, opts = {}) {
  const len = opts.len ?? 3, pitch = opts.pitch ?? -deg(6);
  const r = MARBLE.radius;
  const gap = Math.min(opts.gap ?? 0.12, 2 * (r + RAIL_R) - 0.01);
  // Rail centres below the floor line so a marble on them sits at height r.
  const yRail = r - Math.sqrt((r + RAIL_R) ** 2 - (gap / 2) ** 2);

  // Lead-in narrows to a little over one marble, so marbles reach the rails centred.
  const narrow = Math.min(TRACK.width, Math.max(2 * r + 0.02, opts.entryWidth ?? 2 * r + 0.06)), leadLen = 1.6;
  const lead = tracePath(entry, [{ len: 0.6, pitch }, { len: leadLen - 0.6 }]);
  buildTrack(ctx, lead, { width: widthStops([[0, TRACK.width], [1.1, narrow]]), rail: 0.3 });
  const a = lastFrame(lead);
  const F = new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));

  // Rails: from 0.3 back inside the lead-in to 0.3 into the track after.
  const back = 0.3, over = 0.3, ramp = 0.35;
  const start = makeFrame(a.pos.clone().addScaledVector(F, -back).setY(a.pos.y + Math.tan(-pitch) * back), a.yaw, pitch);
  const frames = tracePath(start, [{ len: back + len + over }]);
  const total = back + len + over;
  const tube = [];
  const n = 10;
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    tube.push(v2(RAIL_R * Math.cos(t), RAIL_R * Math.sin(t)));
  }
  for (const s of [1, -1]) {
    const rings = frames.map((f) => {
      const d = f.d - frames[0].d;
      const u = Math.min(1, Math.max(0, (d - back + ramp) / ramp), Math.max(0, (total - d - over + ramp) / ramp));
      const y = yRail - SINK * (1 - u * u * (3 - 2 * u));
      return tube.map((p) => framePoint(f, s * gap / 2 + p.x, y + p.y, 0));
    });
    ctx.addSolid(sweepRings(rings, tube));
  }
  // Progress along the rails (in the air: never a rescue spot).
  for (const f of frames) if (f.d - frames[0].d > back && f.d - frames[0].d < back + len) ctx.addPathPoint(f.pos, f.U, f.F, false);

  // After the rails: the main track, and the catch tray underneath.
  const endPos = frames[0].pos.clone().addScaledVector(F, back + len);
  endPos.y = frames[0].pos.y - Math.tan(-pitch) * (back + len);
  const drop = opts.drop ?? 0.5;
  const trayBack = 0.6;
  const trayStart = a.pos.clone().addScaledVector(F, -trayBack).setY(a.pos.y - drop);
  const trayLen = trayBack + len;
  const { exit, lowFrames } = rejoin(ctx, {
    // The main track starts at the rails' slope, under their last stretch.
    main: { pos: endPos, yaw: a.yaw, pitch0: pitch },
    // Tall tray walls only under the rails: further on the main track
    // crosses over the tray's edge, and tall walls would poke through it.
    low: { pos: trayStart, width: 1.5, wideLen: trayLen + 0.4, taper: 1.6, lead: trayLen + 0.5, rail: (d) => (d < trayLen + 0.1 ? 0.45 : 0.2) },
    len: opts.rejoinLen ?? 6,
  });
  trayBackWall(ctx, lowFrames[0], 0.75, lead);
  ctx.addSensorAt('rails: made it', makeFrame(endPos, a.yaw, 0), { x: 0, y: 0.15, z: 0.5 }, 0.35, 0.2, 0.05);
  return exit;
}
