import { Vector3 } from 'three';
import { tracePath, arc, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Valley: a steep fall that eases out into a flat middle, then climbs again
// to a crest a little lower than where it started. A marble on its own makes
// the crest (at about 4 units/s); in a pack, marbles that lose speed in
// collisions can fall back into the middle and roll to and fro. The race puts
// a marble that stays in the valley too long back at the start of the
// lead-in, and the second time past the crest (see Race._zones).
//
// Measured on `--layout valley`: one marble alone crosses the crest at 3.4 to
// 4.5 units/s whatever its entry speed (0 to 16), thanks to the brake. In 20
// races of 8, 8 of 160 marbles fell back and were sent to the start; all made
// it the second time. The crest is sensitive: climbLen 3.0 sent 13 of 96
// back (2 skipped), 3.1 most of them, 2.9 none.
// opts: { steep, drop, bottom, climb, climbLen, lead, brake, side, seconds }
export function build(ctx, entry, opts = {}) {
  const steep = deg(opts.steep ?? 48), climb = deg(opts.climb ?? 34);
  // Brake first: two sharp unbanked bends (as in the S-bends). Fast marbles
  // lose speed bouncing off the outer walls, slow ones pass untouched, so
  // marbles reach the fall at much the same speed whatever came before.
  const brake = opts.brake ?? 0.55;
  const bends = brake ? [arc(brake, deg(75 * (opts.side ?? 1)), { pitch: deg(-4) }), arc(brake, deg(-75 * (opts.side ?? 1)))] : [];
  const frames = tracePath(entry, [
    ...bends,
    // Lead-in: a marble sent back here from rest still gets up to speed.
    { len: 0.5, pitch: deg(-10) },
    { len: opts.lead ?? 1.4 },
    { len: 0.8, pitch: -steep },
    { len: opts.drop ?? 1.4 },
    { len: 1.2, pitch: 0 }, // eases out
    { len: opts.bottom ?? 1.0 }, // flat middle
    { len: 1.0, pitch: climb },
    { len: opts.climbLen ?? 2.95 },
    { len: 1.0, pitch: deg(-4) }, // over the crest
    { len: 0.8 },
  ]);
  const i0 = ctx.path.length;
  // Watch from the side, moving along with the leader, so the fall and the
  // climb show in profile.
  let low = frames[0];
  for (const f of frames) if (f.pos.y < low.pos.y) low = f;
  const side = opts.side ?? 1;
  ctx.setCamera({ type: 'offset', offset: low.L.clone().setY(0).normalize().multiplyScalar(side * 4).add(new Vector3(0, 1.8, 0)) });
  buildTrack(ctx, frames, { rail: (d) => (d < (bends[0]?.len ?? 0) * 2 + 0.2 ? 0.65 : 0.32) });
  ctx.setCamera(null);
  const pts = ctx.path.slice(i0);
  const leadIn = frames.find((f) => f.d >= (bends[0]?.len ?? 0) * 2 - 1e-6);
  // Crest: the highest point after the bottom.
  const iLow = pts.findIndex((p) => p.pos.equals(low.pos));
  let crest = iLow;
  for (let i = iLow; i < pts.length; i++) if (pts[i].pos.y >= pts[crest].pos.y) crest = i;
  ctx.addZone({
    name: ctx.sectionName,
    s0: pts[0].s,
    s1: pts[crest].s,
    restart: i0 + pts.findIndex((p) => p.pos.equals(leadIn.pos)), // start of the lead-in, after the brake
    skip: ctx.path.length - 1, // past the crest
    seconds: opts.seconds ?? 6,
  });
  return lastFrame(frames);
}
