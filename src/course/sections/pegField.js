import { tracePath, framePoint, frameQuat, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

// Plinko board: the track flares out into a tilted board with a staggered grid
// of cylinder pegs, then funnels back to track width.
export function build(ctx, entry, opts = {}) {
  const pitch = opts.pitch ?? -0.38;
  const board = opts.width ?? 2.2;
  const flare = 1.1, field = opts.len ?? 3.2, taper = 1.5;
  const frames = tracePath(entry, [{ len: flare, pitch }, { len: field }, { len: taper, pitch: opts.exitPitch ?? -0.2 }]);
  buildTrack(ctx, frames, {
    width: widthStops([[0, TRACK.width], [flare, board], [flare + field, board], [flare + field + taper, TRACK.width]]),
    rail: 0.3,
  });

  const radius = 0.045, half = 0.13;
  const rowGap = 0.42, colGap = 0.46;
  const rows = Math.floor((field - 0.3) / rowGap);
  for (let row = 0; row <= rows; row++) {
    const d = flare + 0.25 + row * rowGap;
    const f = frames.find((fr) => fr.d >= d);
    const offset = row % 2 ? colGap / 2 : 0;
    for (let k = -6; k <= 6; k++) {
      const x = k * colGap + offset;
      // Every gap (peg to peg, peg to wall) is wider than two marbles, so
      // neither one marble nor a pair can wedge and form a stable arch.
      if (board / 2 - Math.abs(x) < 0.4) continue;
      ctx.addCylinder(framePoint(f, x, half - 0.01, 0), frameQuat(f), half, radius);
    }
  }
  return lastFrame(frames);
}
