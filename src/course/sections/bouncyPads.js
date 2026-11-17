import { Vector3, Quaternion } from 'three';
import { tracePath, makeFrame, framePoint, frameQuat, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { rejoin } from './rejoin.js';
import { BOUNCY, TRACK } from '../../config.js';

// Bouncy pads: the track ends over a springy pad that is tilted back towards
// the incoming marbles. They drop onto it and the bounce turns their forward
// speed into height, throwing them up onto a track section that is higher
// than the one they came from. Marbles that arrive too slow fall short and
// land on a wide floor underneath, which is the slow way round and rejoins
// the course later.
// opts: { fall, rise, reach, tilt }
export function build(ctx, entry, opts = {}) {
  const fall = opts.fall ?? 0.5; // approach track down to the pad
  const rise = opts.rise ?? 0.22; // upper track above the approach track
  const reach = opts.reach ?? 2.1; // forward distance from approach end to upper track
  const padLen = opts.padLen ?? 1.5, padWidth = 1.3, padStart = opts.padStart ?? 0.6;

  const approach = tracePath(entry, [{ len: 1.3, pitch: -deg(2) }]);
  buildTrack(ctx, approach);
  const a = makeFrame(lastFrame(approach).pos, entry.yaw, 0);
  const F = a.F;

  // Thin bouncy skin on an ordinary base, so only the top face is springy.
  const bouncy = { restitution: BOUNCY.restitution, restitutionMax: true, friction: BOUNCY.friction, frictionMin: true };
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -(opts.tilt ?? deg(12)));
  const quat = frameQuat(a).multiply(tilt);
  const up = new Vector3(0, 1, 0).applyQuaternion(quat);
  const top = framePoint(a, 0, -fall, padStart + padLen / 2);
  ctx.addBox(top.clone().addScaledVector(up, -0.015), quat, padWidth / 2, 0.015, padLen / 2, bouncy);
  ctx.addBox(top.clone().addScaledVector(up, -0.075), quat, padWidth / 2, 0.045, padLen / 2);

  // Floor underneath that catches every miss.
  const floorDrop = fall + 0.55;
  // It starts well behind the pad: slow marbles are bounced backwards.
  const back = 1.9;
  const lowStart = a.pos.clone().addScaledVector(F, -back).setY(a.pos.y - floorDrop);
  const upper = a.pos.clone().addScaledVector(F, reach).setY(a.pos.y + rise);
  // Side-on view of the jump.
  const L = makeFrame(a.pos, a.yaw, 0).L;
  const side = { type: 'offset', offset: L.clone().multiplyScalar(-4.2).add(new Vector3(0, 1.6, 0)).addScaledVector(F, -1.0) };
  ctx.setCamera(side);
  ctx.addPathPoint(a.pos.clone().addScaledVector(F, 0.1));
  ctx.addPathPoint(upper.clone().addScaledVector(F, -0.1));
  ctx.setCamera(null);
  const { exit, lowFrames, mainFrames } = rejoin(ctx, {
    main: { pos: upper, yaw: a.yaw, width: 1.5, wideLen: 2.6, rail: 0.5 },
    low: { pos: lowStart, dead: true, width: 3.0, wideLen: back + reach + 1.8, lead: back + reach + 0.8, rail: 0.7 },
    len: opts.len ?? 9,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.31, z: -0.02 }, 1.5 + TRACK.railThickness, 0.35, 0.02);
  ctx.addSensorAt('pads: reached upper track', mainFrames[0], { x: 0, y: 0.3, z: 1.9 }, 0.5, 0.35, 0.05);
  const mid = lowFrames[Math.floor(lowFrames.length * 0.8)];
  ctx.addSensorAt('pads: lower path', mid, { x: 0, y: 0.2, z: 0 }, 0.4, 0.25, 0.05);
  return exit;
}
