import { Vector3 } from 'three';
import { tracePath, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Wave track: a row of small valleys, each crest a little lower than the one
// before, so a marble always has height in hand for the next climb. Fast
// marbles skim the crests (and can take off over them), slow ones roll
// through each dip. Like the valley, a marble that stays too long goes back
// to the start of the piece, and the second time past the last crest.
// opts: { waves, depth (dip below the crest before it), drop (each crest
//        below the one before), down / up (slopes in degrees), seconds }
const CREST = deg(-4);

function wave(down, up, dLen, uLen) {
  return [
    { len: 0.5, pitch: -down },
    { len: dLen },
    { len: 0.6, pitch: 0 }, // eases out at the bottom
    { len: 0.2 },
    { len: 0.6, pitch: up },
    { len: uLen },
    { len: 0.6, pitch: CREST }, // over the crest
  ];
}

// Height of the lowest point and of the end of one wave, starting at 0 on a crest.
function measure(segs) {
  const frames = tracePath({ pos: new Vector3(), yaw: 0, pitch: CREST }, segs);
  return { bottom: Math.min(...frames.map((f) => f.pos.y)), end: lastFrame(frames).pos.y };
}

export function build(ctx, entry, opts = {}) {
  const n = Math.max(1, Math.round(opts.waves ?? 3));
  const depth = opts.depth ?? 0.45, drop = opts.drop ?? 0.15;
  const down = deg(opts.down ?? 30), up = deg(opts.up ?? 25);
  // The straight parts of the fall and of the climb set the depth and the
  // crest height; heights grow in step with their lengths, so two tries each
  // give the lengths.
  const b0 = measure(wave(down, up, 0, 0)), b1 = measure(wave(down, up, 1, 0));
  const dLen = Math.max(0, (-depth - b0.bottom) / (b1.bottom - b0.bottom));
  const e0 = measure(wave(down, up, dLen, 0)), e1 = measure(wave(down, up, dLen, 1));
  const uLen = Math.max(0, (-drop - e0.end) / (e1.end - e0.end));

  const segs = [{ len: 0.5, pitch: CREST }];
  for (let i = 0; i < n; i++) segs.push(...wave(down, up, dLen, uLen));
  segs.push({ len: 0.4 });
  const frames = tracePath(entry, segs);
  const i0 = ctx.path.length;
  // Side view, so the waves show in profile.
  const f0 = frames[Math.floor(frames.length / 2)];
  ctx.setCamera({ type: 'offset', offset: f0.L.clone().setY(0).normalize().multiplyScalar(4.5).add(new Vector3(0, 1.6, 0)) });
  buildTrack(ctx, frames, { rail: 0.32 });
  ctx.setCamera(null);
  const pts = ctx.path.slice(i0);
  if (pts.length > 1) {
    ctx.addZone({
      name: ctx.sectionName,
      s0: pts[0].s,
      s1: pts[pts.length - 2].s,
      restart: i0,
      skip: ctx.path.length - 1,
      seconds: opts.seconds ?? 4 + 2.5 * n,
    });
  }
  return lastFrame(frames);
}
