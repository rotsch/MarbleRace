import { framePoint, makeFrame } from '../frame.js';
import { merge, BRANCH_OFFSET } from './rejoin.js';

// Merge: two inputs side by side, BRANCH_OFFSET to the left (in 0, the
// entry) and right (in 1) of the centre line, flowing into one track.
// opts: { len }
export function build(ctx, entry, opts = {}) {
  const e = makeFrame(entry.pos, entry.yaw, entry.pitch);
  const center = { pos: framePoint(e, -BRANCH_OFFSET, 0, 0), yaw: e.yaw, pitch: e.pitch };
  ctx.addSocket('in', makeFrame(framePoint(e, -2 * BRANCH_OFFSET, 0, 0), e.yaw, e.pitch));
  return merge(ctx, center, { len: opts.len ?? 1.7, pitch: -0.08 });
}
