import { tracePath, arc, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Corkscrew: several tight turns of banked track stacked on top of each other.
// opts: { turns, radius, side: 1 | -1 (left / right hand), pitch }
export function build(ctx, entry, opts = {}) {
  const turns = opts.turns ?? 2.75, radius = opts.radius ?? 1.0, side = opts.side ?? 1;
  const pitch = opts.pitch ?? -deg(8.5);
  // Ease into the descent first so the bank can build up, then hold the helix.
  const frames = tracePath(entry, [
    arc(radius, side * Math.PI * 0.25, { pitch, bank: side * 0.2 }),
    arc(radius, side * Math.PI * 2 * (turns - 0.25), { bank: side * 0.42 }),
    { len: 0.8, pitch: -0.07 },
  ]);
  // Tall rail on the outside of the turn, where the marbles ride.
  buildTrack(ctx, frames, { rail: side > 0 ? { l: 0.24, r: 0.5 } : { l: 0.5, r: 0.24 } });
  return lastFrame(frames);
}
