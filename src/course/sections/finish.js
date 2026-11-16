import { tracePath, framePoint, frameQuat, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

// Final run-out, the finish sensor, and a walled basin that collects marbles.
export function build(ctx, entry) {
  const run = tracePath(entry, [{ len: 1.5, pitch: -0.12 }]);
  buildTrack(ctx, run);
  const gate = lastFrame(run);
  ctx.addFinishSensor(framePoint(gate, 0, 0.25, 0), frameQuat(gate), TRACK.width / 2 + 0.1, 0.3, 0.06);
  ctx.finishFrame = gate;

  const basin = tracePath(gate, [{ len: 1.2, pitch: -0.06 }, { len: 2.0, pitch: -0.03 }]);
  buildTrack(ctx, basin, { width: widthStops([[0, TRACK.width], [1.2, 2.0]]), rail: 0.32 });
  const end = lastFrame(basin);
  ctx.addBoxAt(end, { x: 0, y: 0.14, z: 0.02 }, 1.0 + TRACK.railThickness, 0.18, 0.02);
  return end;
}
