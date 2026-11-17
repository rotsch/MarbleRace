import { tracePath, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

// Final run-out, the finish sensor, and a walled basin that collects marbles.
export function build(ctx, entry) {
  const run = tracePath(entry, [{ len: 1.5, pitch: -0.06 }]);
  buildTrack(ctx, run);
  const gate = lastFrame(run);
  ctx.addSensorAt('finish', gate, { x: 0, y: 0.25, z: 0 }, TRACK.width / 2 + 0.1, 0.3, 0.06);
  ctx.finishIndex = ctx.path.length - 1;

  const basin = tracePath(gate, [{ len: 1.2, pitch: -0.04 }, { len: 2.6, pitch: -0.02 }]);
  buildTrack(ctx, basin, { width: widthStops([[0, TRACK.width], [1.2, 2.0]]), rail: 0.6 });
  const end = lastFrame(basin);
  // Tall end wall: a rolling marble that hits a wall climbs it (its spin
  // grips the wall), so a low wall would let fast finishers hop out.
  ctx.addBoxAt(end, { x: 0, y: 0.56, z: 0.02 }, 1.0 + TRACK.railThickness, 0.6, 0.02);
  return end;
}
