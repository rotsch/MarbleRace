import { runTrack } from '../trackBuilder.js';
import { arc } from '../frame.js';
import { TRACK } from '../../config.js';

// Banked curve. opts: { radius, angle (+ = left), pitch, bank, rail }
export function build(ctx, entry, opts = {}) {
  const angle = opts.angle ?? Math.PI / 2;
  const bank = opts.bank ?? Math.sign(angle) * 0.3;
  // Taller rail on the outside of the bend.
  const hi = TRACK.railHeight + 0.14;
  const rail = opts.rail ?? (angle > 0 ? { l: TRACK.railHeight, r: hi } : { l: hi, r: TRACK.railHeight });
  return runTrack(ctx, entry, [arc(opts.radius ?? 1.5, angle, { pitch: opts.pitch, bank })], { ...opts, rail });
}
