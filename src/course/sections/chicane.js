import { Vector3 } from 'three';
import { tracePath, arc, makeFrame, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { rejoin } from './rejoin.js';
import { TRACK } from '../../config.js';

// Chicane: three tight unbanked bends, one way, back the other way twice as
// far, and one way again, so the track ends up on its starting heading. Part
// of the outer wall of the first two bends is missing. A marble slow enough
// to hold the bend on grip alone gets round; a faster one slides wide and
// drops off onto a wide catch tray underneath, which is the slow way round
// and rejoins the course after the chicane.
// opts: { side (first bend: 1 left, -1 right), radius, angle (of the first bend,
//         the middle one turns twice that), gap (length of each opening), drop (tray below) }
export function build(ctx, entry, opts = {}) {
  const side = opts.side ?? 1;
  const r = opts.radius ?? 0.6, angle = opts.angle ?? deg(60), gap = opts.gap ?? 0.8;
  const pitch = opts.pitch ?? -deg(4);
  const lead = tracePath(entry, [{ len: 0.6, pitch }]);
  buildTrack(ctx, lead, { rail: 0.3 });
  const a = lastFrame(lead);
  const b1 = r * angle, b2 = 2 * r * angle, b3 = r * angle;
  const frames = tracePath(a, [
    arc(r, side * angle, { bank: 0 }),
    arc(r, -side * 2 * angle, { bank: 0 }),
    arc(r, side * angle, { bank: 0 }),
    { len: 0.3 },
  ]);
  // Openings: the outside of bend 1 is on the far side from its turn, and
  // the outside of bend 2 the other way. Each opening ends where its bend
  // ends, which is where a marble going too fast meets the wall.
  const hi = TRACK.railHeight + 0.1;
  const open1 = [b1 - Math.min(gap, b1), b1], open2 = [b1 + b2 - Math.min(gap, b2), b1 + b2];
  const inside = (d, [s, e]) => d > s && d < e;
  const rail = (d) => {
    const o1 = inside(d, open1), o2 = inside(d, open2);
    // Bend 1 turns `side`: its outside is -side (right for a left turn).
    const left = (side > 0 ? o2 : o1) ? 0 : hi;
    const right = (side > 0 ? o1 : o2) ? 0 : hi;
    return { l: left, r: right };
  };
  buildTrack(ctx, frames, { rail });
  const e = lastFrame(frames);

  // Catch tray: straight along the starting heading, under the whole chicane
  // and wide enough to take a marble thrown off on either side.
  const L = makeFrame(a.pos, a.yaw, 0).L;
  const F = new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  let minX = 0, maxX = 0, fwd = 0;
  for (const f of frames) {
    const rel = f.pos.clone().sub(a.pos);
    minX = Math.min(minX, rel.dot(L));
    maxX = Math.max(maxX, rel.dot(L));
    fwd = Math.max(fwd, rel.dot(F));
  }
  const margin = 0.9;
  const width = maxX - minX + 2 * margin;
  const drop = opts.drop ?? 0.55, back = 0.4;
  const trayPos = a.pos.clone().addScaledVector(L, (minX + maxX) / 2).addScaledVector(F, -back).setY(a.pos.y - drop);
  // The main track leaves the chicane on the starting heading.
  const mainStart = makeFrame(e.pos, a.yaw, e.pitch);
  const { exit, lowFrames } = rejoin(ctx, {
    main: { pos: mainStart.pos, yaw: a.yaw, pitch0: e.pitch },
    low: {
      pos: trayPos, width, wideLen: fwd + back + 0.6, taper: 2.0, lead: fwd + back + 0.4,
      // Tall walls only beside the chicane; after it the main track
      // crosses over the tray's edge.
      rail: (d) => (d < fwd + back + 0.2 ? 0.45 : 0.2),
    },
    len: opts.rejoinLen ?? 6,
  });
  ctx.addBoxAt(lowFrames[0], { x: 0, y: 0.3, z: -0.02 }, width / 2 + TRACK.railThickness, 0.34, 0.02);
  ctx.addSensorAt('chicane: made it', mainStart, { x: 0, y: 0.15, z: 0.4 }, 0.35, 0.2, 0.05);
  return exit;
}
