import { tracePath, arc, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Long winding descent: a chain of gentle banked bends, alternating left and
// right, on a shallow slope.
// opts: { bends: [[radius, degrees (+ = left)], ...], pitch, straight }
export function build(ctx, entry, opts = {}) {
  const pitch = opts.pitch ?? deg(-3.5);
  const bends = opts.bends ?? [[1.6, 90], [1.4, -120], [1.5, 110], [1.6, -80]];
  const straight = opts.straight ?? 0.5;
  const segs = [{ len: 0.6, pitch }];
  for (const [r, a] of bends) segs.push(arc(r, deg(a), { bank: Math.sign(a) * 0.3 }), { len: straight });
  const frames = tracePath(entry, segs);
  // Taller rails than a straight: bends come both ways, so both sides are an outside.
  buildTrack(ctx, frames, { rail: 0.4 });
  return lastFrame(frames);
}
