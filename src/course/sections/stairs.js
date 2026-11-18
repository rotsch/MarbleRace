import { tracePath, makeFrame, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Stairs: a flight of short treads, each ending in a small vertical drop onto
// the next. Every drop makes the marbles hop, and a hopping pack shuffles its
// order. Each tread slopes downhill, so nothing can come to rest on one.
// The next tread starts right under the edge of the one above, and its walls
// reach up past the upper tread's floor, so there is no gap at the sides.
// opts: { steps, tread (length of each tread), rise (height of each drop), pitch (tread slope) }
export function build(ctx, entry, opts = {}) {
  const steps = Math.max(1, Math.round(opts.steps ?? 6));
  const tread = opts.tread ?? 0.6, rise = opts.rise ?? 0.15;
  const pitch = opts.pitch ?? -deg(8);
  // Lead-in: reach the tread slope before the first drop.
  let f = buildTrack(ctx, tracePath(entry, [{ len: 0.5, pitch }]), { rail: 0.3 });
  for (let i = 0; i < steps; i++) {
    // Straight down from the edge, then the next tread.
    const start = makeFrame(f.pos.clone().setY(f.pos.y - rise), f.yaw, pitch);
    const frames = tracePath(start, [{ len: tread }]);
    // Walls tall enough to reach past the drop above.
    buildTrack(ctx, frames, { rail: Math.max(0.3, rise + 0.12) });
    f = lastFrame(frames);
  }
  // Ease out to a gentler slope for the next piece.
  const out = tracePath(f, [{ len: 0.5, pitch: deg(-4) }]);
  buildTrack(ctx, out, { rail: 0.3 });
  return lastFrame(out);
}
