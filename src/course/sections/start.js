import { tracePath, framePoint, lastFrame } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { MARBLE, TRACK } from '../../config.js';

// Start ramp with a back wall. Defines 8 spawn slots (2 columns x 4 rows).
export function build(ctx, entry, opts = {}) {
  const frames = tracePath(entry, [{ len: opts.len ?? 3 }]);
  buildTrack(ctx, frames, { rail: 0.32 });
  const f0 = frames[0];
  ctx.addBoxAt(f0, { x: 0, y: 0.13, z: -0.02 }, TRACK.width / 2 + TRACK.railThickness, 0.17, 0.02);
  ctx.spawn = [];
  for (let row = 0; row < 4; row++) {
    for (const x of [-0.14, 0.14]) {
      ctx.spawn.push(framePoint(f0, x, MARBLE.radius + 0.03, 0.2 + row * 0.24));
    }
  }
  ctx.spawnFrame = f0;
  return lastFrame(frames);
}
