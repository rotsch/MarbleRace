import { tracePath, framePoint, frameQuat, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK, RUBBER, MARBLE } from '../../config.js';

// Pinball bumpers: the track opens into a wide, gently tilted table with a
// few large round rubber bumpers. Marbles that hit one are thrown sideways,
// much harder than off the peg field's small pegs, then the table funnels
// back to track width.
// Every gap (bumper to bumper, bumper to wall) is wider than two marbles, so
// marbles cannot wedge between them.
// opts: { len (table length), width (table width), radius (bumper radius), pitch }
export function build(ctx, entry, opts = {}) {
  const pitch = opts.pitch ?? -deg(11);
  const board = opts.width ?? 2.4, field = opts.len ?? 3.2, r = opts.radius ?? 0.14;
  const flare = 1.1, taper = 1.5;
  const frames = tracePath(entry, [{ len: flare, pitch }, { len: field }, { len: taper, pitch: -deg(6) }]);
  buildTrack(ctx, frames, {
    width: widthStops([[0, TRACK.width], [flare, board], [flare + field, board], [flare + field + taper, TRACK.width]]),
    rail: 0.4,
  });

  // Rows alternate between bumpers on the centre line and bumpers either
  // side of it, like the triangle of bumpers on a pinball table.
  const rubber = { restitution: RUBBER.restitution, friction: RUBBER.friction, bounceMax: true };
  const clear = 4.4 * MARBLE.radius; // a little more than two marbles
  const pitchX = 2 * r + clear + 0.25; // across, between bumpers in a row
  const rowGap = 2 * r + clear + 0.2; // along, between rows
  const h = 0.11;
  for (let row = 0, d = flare + r + 0.3; d < flare + field - r - 0.2; row++, d += rowGap) {
    const fr = frames.find((x) => x.d >= d);
    const offset = row % 2 ? pitchX / 2 : 0;
    for (let k = -6; k <= 6; k++) {
      const x = k * pitchX + offset;
      if (board / 2 - Math.abs(x) - r < clear) continue;
      ctx.addCylinder(framePoint(fr, x, h - 0.01, 0), frameQuat(fr), h, r, rubber);
    }
  }
  return lastFrame(frames);
}
