import { tracePath, framePoint, lastFrame, makeFrame } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { dressStart } from '../decor.js';
import { MARBLE, TRACK } from '../../config.js';

const RAIL = 0.32;
const COLS = [-0.14, 0.14]; // two marbles side by side
const BASE_ROWS = 4; // rows that fit on the ramp as laid out in the editor

// Start ramp with a back wall and a starting grid under a start-light gantry.
// The grid has two columns and as many rows as the race has marbles for
// (ctx.marbleCount). Up to four rows fit on the ramp as laid out; for more,
// the ramp reaches further back (uphill) instead, so the start line, the
// ramp's end and the whole rest of the course stay exactly where they are.
export function build(ctx, entry, opts = {}) {
  const count = Math.max(1, ctx.marbleCount ?? MARBLE.count);
  const rows = Math.ceil(count / COLS.length);
  // Rows are spaced for the marble size (a bigger marble needs more room).
  const gap = Math.max(0.24, MARBLE.radius * 2 + 0.07);
  const extra = Math.max(0, 0.2 + (rows - 1) * gap - (0.2 + (BASE_ROWS - 1) * 0.24)); // along the slope
  const e0 = makeFrame(entry.pos, entry.yaw, entry.pitch ?? 0, 0);
  const back = extra > 0 ? makeFrame(entry.pos.clone().addScaledVector(e0.F, -extra), e0.yaw, e0.pitch, 0) : e0;
  const len = (opts.len ?? 3) + extra * Math.cos(e0.pitch);
  const frames = tracePath(back, [{ len }]);
  buildTrack(ctx, frames, { rail: RAIL });
  const f0 = frames[0];
  ctx.addBoxAt(f0, { x: 0, y: 0.13, z: -0.02 }, TRACK.width / 2 + TRACK.railThickness, 0.17, 0.02);
  ctx.spawn = [];
  // Row 0 is the back row (against the wall).
  for (let row = 0; row < rows; row++) {
    for (const x of COLS) {
      ctx.spawn.push(framePoint(f0, x, MARBLE.radius + 0.03, 0.2 + row * gap));
    }
  }
  ctx.spawnFrame = f0;
  dressStart(ctx, frames, RAIL, 0.2 + (rows - 1) * gap + 0.2);
  return lastFrame(frames);
}
