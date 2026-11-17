import { Quaternion, Vector3 } from 'three';
import { tracePath, framePoint, frameQuat, lastFrame, deg } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK, MARBLE } from '../../config.js';

// Bottleneck: the track opens into a holding area, then narrows to a throat
// only one marble wide.
//
// The walls are asymmetric (one straight, one closing in at an angle), so two
// marbles that arrive side by side meet the narrowing at different points and
// one of them gets ahead. The walls are ordinary track material.
// opts: { gap, side: 1 | -1 (which side the straight wall is on) }
export function build(ctx, entry, opts = {}) {
  const gap = opts.gap ?? MARBLE.radius * 2.6;
  const side = opts.side ?? 1;
  const half = TRACK.width / 2, wide = 1.0, t = 0.04, h = 0.36;
  const open = 1.0, hold = 0.5, close = 1.3, throat = 0.35, release = 0.7;
  const d1 = open, d2 = d1 + hold, d3 = d2 + close, d4 = d3 + throat, d5 = d4 + release;

  const frames = tracePath(entry, [{ len: d5, pitch: opts.pitch ?? -deg(11) }]);
  // The track itself follows the same outline one wall thickness further
  // out, so there is no floor behind the walls for a marble to end up on.
  const throatX = half - gap;
  const w = (far) => (side > 0 ? { l: half + t, r: far + t } : { l: far + t, r: half + t });
  buildTrack(ctx, frames, {
    width: widthStops([[0, w(half + 0.03)], [d1, w(wide)], [d2, w(wide)], [d3, w(-throatX)], [d4, w(-throatX)], [d5, w(half)]]),
    rail: 0.3,
  });

  // Walls as boxes. Coordinates: x across (positive = straight-wall side),
  // z along the track from its start.
  const f0 = frames[0];
  const wall = (x1, z1, x2, z2, outward) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const angle = Math.atan2((x2 - x1) * side, z2 - z1);
    // Shift by half the thickness so the inner face lies on the given line.
    const nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
    const cx = (x1 + x2) / 2 + outward * nx * (t / 2), cz = (z1 + z2) / 2 + outward * nz * (t / 2);
    const quat = frameQuat(f0).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle));
    ctx.addBox(framePoint(f0, side * cx, h / 2 - 0.02, cz), quat, t / 2, h / 2, len / 2 + 0.01);
  };
  // Straight side. It starts a touch wide so its end is never a ledge.
  wall(half + 0.03, 0, half, 0.3, 1);
  wall(half, 0.3, half, d5, 1);
  // Angled side: out, hold, in to the throat, throat, back out.
  wall(-(half + 0.03), 0, -wide, d1, -1);
  wall(-wide, d1, -wide, d2, -1);
  wall(-wide, d2, throatX, d3, -1);
  wall(throatX, d3, throatX, d4, -1);
  wall(throatX, d4, -half, d5, -1);
  return lastFrame(frames);
}
