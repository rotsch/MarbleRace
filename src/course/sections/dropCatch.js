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
  const gap = opts.gap ?? 1.05, drop = opts.drop ?? 0.6;
  const ramp = tracePath(entry, [{ len: 2.2, pitch: deg(-20) }, { len: 0.9, pitch: deg(-3) }]);
  buildTrack(ctx, ramp);
  const lip = lastFrame(ramp);
  const F = new Vector3(Math.sin(lip.yaw), 0, Math.cos(lip.yaw));

  const landing = lip.pos.clone().addScaledVector(F, gap).setY(lip.pos.y - drop);
  const recovery = lip.pos.clone().addScaledVector(F, -0.35).setY(lip.pos.y - drop - 0.95);
  const { exit, lowFrames } = rejoin(ctx, {
    main: { pos: landing, yaw: lip.yaw, width: 1.1 },
    low: { pos: recovery, width: 1.7, wideLen: gap + 1.5, lead: gap + 0.6 },
    len: opts.len ?? 6,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.2, z: -0.02 }, 0.85 + TRACK.railThickness, 0.24, 0.02);
  ctx.addSensorAt('drop: caught', lip, { x: 0, y: -drop + 0.2, z: gap + 1.3 }, 0.6, 0.3, 0.05);
  const mid = lowFrames[Math.floor(lowFrames.length * 0.75)];
  ctx.addSensorAt('drop: recovery path', mid, { x: 0, y: 0.2, z: 0 }, 0.4, 0.25, 0.05);
  return exit;
}
