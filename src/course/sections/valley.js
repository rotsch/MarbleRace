import { Vector3 } from 'three';
import { tracePath, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Valley: a straight lead-in, a steep fall that eases out into a flat middle,
// then a climb to a crest a little lower than where the fall started. A
// marble on its own makes the crest; in a pack, marbles that lose speed in
// collisions can fall back into the middle and roll to and fro. The race puts
// a marble that stays in the valley too long back at the start of the
// lead-in, and the second time past the crest (see Race._zones).
//
// The crest sits CREST_BELOW under the top of the fall whatever the slopes
// and the middle length are: the length of the climb is worked out to match
// (unless climbLen is given). With the original slopes that is the climb
// length (2.95) measured to work: 3.0 sent 13 of 96 marbles back, 3.1 most.
// opts: { steep (deg), climb (deg), bottom (middle length), drop, lead, climbLen, seconds }

function segments(opts, steep, climb, climbLen) {
  return [
    // Lead-in: a marble sent back here from rest still gets up to speed.
    { len: 0.5, pitch: deg(-10) },
    { len: opts.lead ?? 1.4 },
    { len: 0.8, pitch: -steep },
    { len: opts.drop ?? 1.4 },
    { len: 1.2, pitch: 0 }, // eases out
    { len: opts.bottom ?? 1.0 }, // flat middle
    { len: 1.0, pitch: climb },
    { len: climbLen },
    { len: 1.0, pitch: deg(-4) }, // over the crest
    { len: 0.8 },
  ];
}

// Height of the crest (the highest point after the lowest) below the top of
// the fall (the start of the steep part).
function crestBelow(frames, opts) {
  let low = 0;
  frames.forEach((f, i) => f.pos.y < frames[low].pos.y && (low = i));
  let crest = low;
  for (let i = low; i < frames.length; i++) if (frames[i].pos.y >= frames[crest].pos.y) crest = i;
  const top = frames.find((f) => f.d >= 0.5 + (opts.lead ?? 1.4) - 1e-6);
  return top.pos.y - frames[crest].pos.y;
}

const ORIGINAL = { steep: deg(48), climb: deg(34), climbLen: 2.95 };
const START = { pos: new Vector3(), yaw: 0, pitch: deg(-4) };
const CREST_BELOW = crestBelow(tracePath(START, segments({}, ORIGINAL.steep, ORIGINAL.climb, ORIGINAL.climbLen)), {});

export function build(ctx, entry, opts = {}) {
  const steep = deg(opts.steep ?? 48), climb = deg(opts.climb ?? 34);
  // Climb length for the crest height: the crest rises in step with it, so
  // two tries give the line to solve.
  let climbLen = opts.climbLen;
  if (climbLen === undefined) {
    const at = (L) => crestBelow(tracePath(entry, segments(opts, steep, climb, L)), opts);
    const a = at(1), b = at(3);
    climbLen = Math.max(0.3, 1 + ((CREST_BELOW - a) * 2) / (b - a || 1));
  }
  const frames = tracePath(entry, segments(opts, steep, climb, climbLen));
  const i0 = ctx.path.length;
  // Watch from the side, moving along with the leader, so the fall and the
  // climb show in profile.
  let low = frames[0];
  for (const f of frames) if (f.pos.y < low.pos.y) low = f;
  ctx.setCamera({ type: 'offset', offset: low.L.clone().setY(0).normalize().multiplyScalar(4).add(new Vector3(0, 1.8, 0)) });
  buildTrack(ctx, frames, { rail: 0.32 });
  ctx.setCamera(null);
  const pts = ctx.path.slice(i0);
  // Crest: the highest point after the bottom.
  const iLow = pts.findIndex((p) => p.pos.equals(low.pos));
  let crest = iLow;
  for (let i = iLow; i < pts.length; i++) if (pts[i].pos.y >= pts[crest].pos.y) crest = i;
  ctx.addZone({
    name: ctx.sectionName,
    s0: pts[0].s,
    s1: pts[crest].s,
    restart: i0, // the start of the lead-in
    skip: ctx.path.length - 1, // past the crest
    seconds: opts.seconds ?? 6,
  });
  return lastFrame(frames);
}
