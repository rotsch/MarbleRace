import { tracePath, framePoint, makeFrame, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { BRANCH_OFFSET } from './rejoin.js';
import { TRACK } from '../../config.js';

// Fork: the track widens and a wedge splits the stream into two outputs side
// by side, BRANCH_OFFSET to the left (out 0) and right (out 1) of the centre
// line. What follows each output is up to the course: two routes that meet
// again in a merge, or a short cut and a long way round.
// opts: { len }
export function build(ctx, entry, opts = {}) {
  const len = opts.len ?? 1.5;
  const wide = 2 * BRANCH_OFFSET + TRACK.width;
  const flare = tracePath(entry, [{ len, pitch: -0.09 }]);
  buildTrack(ctx, flare, { width: widthStops([[0, TRACK.width], [len, wide]]), rail: 0.3 });
  const s = lastFrame(flare);

  // Wedge: knife edge pointing upstream, ending level with the outputs.
  const hw = BRANCH_OFFSET - TRACK.width / 2 + 0.02, h = 0.3;
  const pts = [];
  for (const y of [-0.03, h]) pts.push(framePoint(s, 0, y, -0.85), framePoint(s, hw, y, 0), framePoint(s, -hw, y, 0));
  ctx.addHull(pts);

  const out = (x) => makeFrame(framePoint(s, x, 0, 0), s.yaw, s.pitch);
  return { exits: [out(BRANCH_OFFSET), out(-BRANCH_OFFSET)] };
}
