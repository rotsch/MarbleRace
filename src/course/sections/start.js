import { tracePath, framePoint, lastFrame } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { dressStart } from '../decor.js';
import { MARBLE, TRACK } from '../../config.js';

const RAIL = 0.32;

// Start ramp with a back wall. Defines 8 spawn slots (2 columns x 4 rows),
// dressed as a starting grid under a start-light gantry.
export function build(ctx, entry, opts = {}) {
  const frames = tracePath(entry, [{ len: opts.len ?? 3 }]);
  buildTrack(ctx, frames, { rail: RAIL });
  const f0 = frames[0];
  ctx.addBoxAt(f0, { x: 0, y: 0.13, z: -0.02 }, TRACK.width / 2 + TRACK.railThickness, 0.17, 0.02);
  ctx.spawn = [];
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    for (const x of [-0.14, 0.14]) {
      ctx.spawn.push(framePoint(f0, x, MARBLE.radius + 0.03, 0.2 + row * 0.24));
    }
  }
  ctx.spawnFrame = f0;
  dressStart(ctx, frames, RAIL, 0.2 + (rows - 1) * 0.24 + 0.2);
  return lastFrame(frames);
}
