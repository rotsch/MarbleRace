import { Vector3 } from 'three';
import { tracePath, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { rejoin } from './rejoin.js';
import { TRACK } from '../../config.js';

// Drop and catch: a ramp launches marbles across a gap onto a lower track.
// Marbles that fall short land on a wide recovery tray underneath, which takes
// a gentler, slower route and rejoins the main track further on.
// opts: { gap, drop }
export function build(ctx, entry, opts = {}) {
  const gap = opts.gap ?? 1.35, drop = opts.drop ?? 0.6;
  const ramp = tracePath(entry, [{ len: opts.rampLen ?? 1.6, pitch: deg(opts.rampPitch ?? -12) }, { len: 0.9, pitch: deg(-3) }]);
  buildTrack(ctx, ramp);
  const lip = lastFrame(ramp);
  const F = new Vector3(Math.sin(lip.yaw), 0, Math.cos(lip.yaw));

  const landing = lip.pos.clone().addScaledVector(F, gap).setY(lip.pos.y - drop);
  const recovery = lip.pos.clone().addScaledVector(F, -0.35).setY(lip.pos.y - drop - 0.75);
  const { exit, lowFrames } = rejoin(ctx, {
    // High walls where marbles land: one that clips the front edge bounces up.
    main: { pos: landing, yaw: lip.yaw, width: 1.1, rail: (d) => (d < 3 ? 0.85 : 0.4) },
    low: {
      pos: recovery, dead: true, width: 2.6, wideLen: gap + 1.2, taper: 2.2, lead: gap + 0.6,
      // Tall walls only under the gap. Further on the catch track crosses
      // overhead and tall walls would poke up through its floor.
      rail: (d) => (d < gap + 0.8 ? 1.0 : 0.3),
    },
    len: opts.len ?? 7,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.48, z: -0.02 }, 1.3 + TRACK.railThickness, 0.52, 0.02);
  ctx.addSensorAt('drop: caught', lip, { x: 0, y: -drop + 0.2, z: gap + 1.3 }, 0.6, 0.3, 0.05);
  const mid = lowFrames[Math.floor(lowFrames.length * 0.75)];
  ctx.addSensorAt('drop: recovery path', mid, { x: 0, y: 0.2, z: 0 }, 0.4, 0.25, 0.05);
  return exit;
}
