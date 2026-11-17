import { Quaternion, Vector3, CylinderGeometry } from 'three';
import { tracePath, framePoint, frameQuat, lastFrame } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

// Washboard: a row of low rounded speed bumps (cylinders lying across the
// track, mostly sunk into the floor) that make marbles hop.
export function build(ctx, entry, opts = {}) {
  const len = opts.len ?? 3.4;
  const frames = tracePath(entry, [{ len, pitch: opts.pitch ?? -0.3 }]);
  buildTrack(ctx, frames, { rail: 0.36 });
  // Each bump is the top of a large cylinder poking 15 mm through the floor.
  // Its faces are shallower than the slope of the road, so there is no pocket
  // in front of a bump where a slow marble could come to rest.
  const radius = 0.4, height = opts.bump ?? 0.015, spacing = opts.spacing ?? 0.42;
  const across = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  // Only the part of each cylinder above the floor is drawn.
  const edge = Math.acos(1 - height / radius);
  const cap = new CylinderGeometry(radius, radius, TRACK.width, 10, 1, true, Math.PI / 2 - edge, 2 * edge);
  for (let d = 0.6; d < len - 0.4; d += spacing) {
    const f = frames.find((fr) => fr.d >= d);
    const pos = framePoint(f, 0, height - radius, 0), quat = frameQuat(f).multiply(across);
    ctx.addCylinder(pos, quat, TRACK.width / 2, radius, { visual: false });
    ctx.addVisual(cap, pos, quat, 60);
  }
  return lastFrame(frames);
}
