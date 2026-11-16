import { Quaternion, Vector3 } from 'three';
import { tracePath, framePoint, frameQuat, lastFrame } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

// Washboard: a row of low rounded speed bumps (cylinders lying across the
// track, mostly sunk into the floor) that make marbles hop.
export function build(ctx, entry, opts = {}) {
  const len = opts.len ?? 4.2;
  const frames = tracePath(entry, [{ len, pitch: opts.pitch ?? -0.24 }]);
  buildTrack(ctx, frames, { rail: 0.3 });
  const radius = 0.11, height = opts.bump ?? 0.036, spacing = opts.spacing ?? 0.38;
  const across = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  for (let d = 0.6; d < len - 0.4; d += spacing) {
    const f = frames.find((fr) => fr.d >= d);
    ctx.addCylinder(framePoint(f, 0, height - radius, 0), frameQuat(f).multiply(across), TRACK.width / 2, radius);
  }
  return lastFrame(frames);
}
