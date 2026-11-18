import { Vector3 } from 'three';
import { tracePath, sShift, pathLength, lastFrame } from '../frame.js';
import { buildTrack, widthStops } from '../trackBuilder.js';
import { TRACK } from '../../config.js';

export const BRANCH_OFFSET = 0.5; // side-by-side branches sit this far from the merge centre line
const MERGE_WIDTH = 2 * BRANCH_OFFSET + TRACK.width;

// Y-merge: two parallel tracks at +-BRANCH_OFFSET flow into one.
export function merge(ctx, center, opts = {}) {
  const len = opts.len ?? 1.7;
  const frames = tracePath(center, [{ len, pitch: opts.pitch ?? -0.08 }]);
  buildTrack(ctx, frames, { width: widthStops([[0, MERGE_WIDTH], [len, TRACK.width]]), rail: 0.5, path: opts.path });
  return lastFrame(frames);
}

// Brings a main track and a lower, slower side path back together.
//  main: { pos, yaw, width }   start of the main (higher) track
//  low:  { pos, width, wideLen } start of the low path (same heading as main)
//  len:  forward distance from main.pos to the merge
// Both descend to the same height: the low path at a gentle fixed slope, the
// main track as steep as needed. Returns the exit pose after the merge.
export function rejoin(ctx, { main, low, len, lowPitch = 0.05, mainSide }) {
  const yaw = main.yaw;
  const F = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const L = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const rel = low.pos.clone().sub(main.pos);
  const lowLat = rel.dot(L), lowFwd = rel.dot(F);
  const side = mainSide ?? (lowLat > 0.01 ? -1 : 1);
  const c = lowLat / 2;

  const mainShiftLen = Math.min(len, 2.4);
  const mainSegs = [...sShift(c + side * BRANCH_OFFSET, mainShiftLen), { len: len - mainShiftLen }];
  const lowAdvance = len - lowFwd;
  const lowLead = low.lead ?? 0; // straight run before the low path starts moving sideways
  const lowShiftLen = Math.min(lowAdvance - lowLead, 2.8);
  const lowSegs = [
    { len: lowLead },
    ...sShift(c - side * BRANCH_OFFSET - lowLat, lowShiftLen),
    { len: lowAdvance - lowLead - lowShiftLen },
  ].filter((s) => s.len > 1e-6);

  const lowLen = pathLength(lowSegs), mainLen = pathLength(mainSegs);
  const yMerge = low.pos.y - Math.tan(lowPitch) * lowLen;
  let mainPitch = Math.atan((main.pos.y - yMerge) / mainLen);

  const lowWide = low.wideLen ?? 0;
  const lowFrames = tracePath({ pos: low.pos, yaw, pitch: -lowPitch }, lowSegs);
  buildTrack(ctx, lowFrames, {
    width: low.widthFn ?? widthStops([[0, low.width ?? TRACK.width], [lowWide, low.width ?? TRACK.width], [lowWide + (low.taper ?? 1.3), TRACK.width]]),
    rail: typeof low.rail === 'function' ? low.rail : (d) => (d < lowWide + 0.6 ? low.rail ?? 0.3 : 0.3),
    path: false,
  });
  let mainFrames;
  if (main.pitch0 === undefined) {
    mainFrames = tracePath({ pos: main.pos, yaw, pitch: -mainPitch }, mainSegs);
  } else {
    // The main track starts at main.pitch0 (level after the loop, say) and
    // eases into its slope over its first segment. That drops less early on,
    // so find the slope that still meets the low path at the merge height.
    const trace = (p) => tracePath({ pos: main.pos, yaw, pitch: main.pitch0 }, mainSegs.map((s, i) => (i === 0 ? { ...s, pitch: -p } : s)));
    const lead = mainSegs[0].len / 2; // roughly how much horizontal run the easing costs
    for (let k = 0; k < 8; k++) {
      mainFrames = trace(mainPitch);
      const err = lastFrame(mainFrames).pos.y - yMerge; // > 0: still too high
      if (Math.abs(err) < 1e-5) break;
      mainPitch = Math.atan(Math.tan(mainPitch) + err / Math.max(0.5, mainLen - lead));
    }
  }
  buildTrack(ctx, mainFrames, {
    width: widthStops([[0, main.width ?? TRACK.width], [main.wideLen ?? 0, main.width ?? TRACK.width], [(main.wideLen ?? 0) + 1.2, TRACK.width]]),
    rail: typeof main.rail === 'function' ? main.rail : main.rail ?? 0.3,
  });
  const center = {
    pos: main.pos.clone().addScaledVector(F, len).addScaledVector(L, c).setY(yMerge),
    yaw,
    pitch: -0.08,
  };
  return { exit: merge(ctx, center), lowFrames, mainFrames, mainPitch };
}

// Back wall at the upstream end of a catch tray, so marbles thrown onto the
// tray can't roll off its back. The entry track passes over the tray there,
// so the wall stops short of that track's underside instead of poking up
// through its floor (which left a step across the entry). `over` is the
// frames of the track above.
export function trayBackWall(ctx, trayFrame, halfWidth, over) {
  const F = new Vector3(Math.sin(trayFrame.yaw), 0, Math.cos(trayFrame.yaw));
  let top = 0.64, best = Infinity;
  for (const f of over) {
    const along = Math.abs(f.pos.clone().sub(trayFrame.pos).dot(F));
    if (along < best) { best = along; if (along < 0.15) top = Math.min(0.64, f.pos.y - trayFrame.pos.y - TRACK.floorThickness - 0.03); }
  }
  if (top < 0.1) return;
  ctx.addBoxAt(trayFrame, { x: 0, y: (top - 0.04) / 2, z: -0.02 }, halfWidth + TRACK.railThickness, (top + 0.04) / 2, 0.02);
}
