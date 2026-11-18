import { Vector3, BoxGeometry } from 'three';
import { tracePath, arc, makeFrame, framePoint, frameQuat, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';

// Ski jump: a steep in-run eases onto a short take-off table that points
// slightly down. The track ends there and the landing hill starts just
// below the edge and falls away more steeply than the marbles do, so they
// fly. Fast marbles fly far down the hill, slow ones barely leave the edge,
// and everyone lands on a slope that matches their fall, so nobody bounces
// out. The hill eases into a flat out-run, then two sharp unbanked bends
// take off most of the speed (radius 0 leaves them out). Stripes on the hill
// mark the distance.
// opts: { inLen, inPitch (in-run), table (take-off angle, negative = down),
//         hillLen, hillPitch (landing hill), brake (bend radius) }
export function build(ctx, entry, opts = {}) {
  const inPitch = opts.inPitch ?? -deg(28), table = opts.table ?? -deg(8);
  const inrun = tracePath(entry, [
    { len: 0.6, pitch: inPitch },
    { len: opts.inLen ?? 1.4 },
    { len: 0.8, pitch: table },
    { len: 0.3 },
  ]);
  ctx.setCamera({ type: 'offset', offset: framePoint(inrun[0], -3.2, 0, 0).sub(inrun[0].pos).add(new Vector3(0, 1.2, 0)) });
  buildTrack(ctx, inrun, { rail: 0.3 });
  const lip = lastFrame(inrun);

  // Landing hill: starts just below the edge, steepens quickly to the
  // landing slope, then eases out.
  const step = 0.12, hillPitch = opts.hillPitch ?? -deg(34);
  const start = makeFrame(lip.pos.clone().setY(lip.pos.y - step), lip.yaw, table);
  const hill = tracePath(start, [
    { len: 0.5, pitch: hillPitch },
    { len: opts.hillLen ?? 1.6 },
    { len: 1.4, pitch: -deg(3) },
    { len: 0.5 },
  ]);
  buildTrack(ctx, hill, { rail: 0.42 });
  ctx.setCamera(null);
  // Distance stripes across the hill floor (no collider).
  if (ctx.group) {
    const stripe = new BoxGeometry(0.58, 0.004, 0.025);
    for (let d = 0.5; d < 0.5 + (opts.hillLen ?? 1.6); d += 0.4) {
      const f = hill.find((x) => x.d - hill[0].d >= d);
      if (f) ctx.addVisual(stripe, framePoint(f, 0, 0.002, 0), frameQuat(f), 60);
    }
  }
  let end = lastFrame(hill);
  const brake = opts.brake ?? 0.55;
  if (brake > 0) {
    const bends = tracePath(end, [arc(brake, deg(75), { pitch: -deg(4) }), arc(brake, deg(-75))]);
    buildTrack(ctx, bends, { rail: 0.65 });
    end = lastFrame(bends);
  }
  return end;
}
