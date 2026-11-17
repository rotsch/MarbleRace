import { tracePath, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK, MARBLE } from '../../config.js';

// Bottleneck: the track opens into a holding area, then narrows to a throat
// only one marble wide. One wall runs straight and the other closes in at an
// angle; with that asymmetry two marbles arriving together cannot brace
// against each other symmetrically and lock into an arch, one always slips
// ahead.
// opts: { gap, side: 1 | -1 (which side the straight wall is on) }
export function build(ctx, entry, opts = {}) {
  const gap = opts.gap ?? MARBLE.radius * 2.6;
  const side = opts.side ?? 1;
  const half = TRACK.width / 2;
  const w = (near, far) => (side > 0 ? { l: near, r: far } : { l: far, r: near });
  const open = 1.0, hold = 0.5, close = 1.3, throat = 0.35, release = 0.7;
  const d1 = open, d2 = d1 + hold, d3 = d2 + close, d4 = d3 + throat, d5 = d4 + release;
  const frames = tracePath(entry, [{ len: d5, pitch: opts.pitch ?? -deg(11) }]);
  buildTrack(ctx, frames, {
    width: widthStops([
      [0, w(half, half)],
      [d1, w(half, 1.0)],
      [d2, w(half, 1.0)],
      [d3, w(half, gap - half)],
      [d4, w(half, gap - half)],
      [d5, w(half, half)],
    ]),
    rail: 0.34,
  });
  return lastFrame(frames);
}
