import { tracePath, arc, framePoint, lastFrame, deg } from '../frame.js';
import { buildTrack } from '../trackBuilder.js';
import { sweepRings, v2 } from '../geometry.js';
import { TRACK } from '../../config.js';

const BANK = 0.42; // held bank of the helix

// Corkscrew: several tight turns of banked track stacked on top of each other.
// opts: { turns, radius, side: 1 | -1 (left / right hand), pitch (steepness),
//        tunnel: true closes it over with a see-through roof }
export function build(ctx, entry, opts = {}) {
  const turns = opts.turns ?? 2.75, radius = opts.radius ?? 1.0, side = opts.side ?? 1;
  const pitch = opts.pitch ?? -deg(8.5);
  // Ease into the descent first so the bank can build up, then hold the helix.
  const frames = tracePath(entry, [
    arc(radius, side * Math.PI * 0.25, { pitch, bank: side * 0.2 }),
    arc(radius, side * Math.PI * 2 * (turns - 0.25), { bank: side * BANK }),
    { len: 0.8, pitch: -0.07 },
  ]);
  // Watch from the axis of the helix, where no turn of track is in the way.
  ctx.setCamera({ type: 'axis', pos: framePoint(frames[0], side * radius, 0, 0), up: 0.9 });
  // Tall rail on the outside of the turn, where the marbles ride.
  if (!opts.tunnel) {
    buildTrack(ctx, frames, { rail: side > 0 ? { l: 0.24, r: 0.5 } : { l: 0.5, r: 0.24 } });
  } else {
    // Tunnel: walls on both sides and a see-through arched roof on top. It
    // has to fit under the turn above: the turns are one helix pitch apart
    // (measured across the banked track), less the floor above and a margin.
    const R = TRACK.width / 2 + TRACK.railThickness, t = TRACK.railThickness, n = 16;
    const spacing = 2 * Math.PI * radius * Math.tan(Math.abs(pitch)) * Math.cos(BANK);
    const room = spacing - TRACK.floorThickness - 0.05;
    const wall = Math.min(0.5, Math.max(0.2, room - R));
    const rise = Math.min(R, Math.max(0.04, room - wall));
    buildTrack(ctx, frames, { rail: wall });
    // Half an ellipse: outer edge on the outside of the walls, inner edge on
    // their inside, `rise` high at the top.
    const roof = [];
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * i) / n;
      roof.push(v2(R * Math.cos(a), wall + rise * Math.sin(a)));
    }
    for (let i = n; i >= 0; i--) {
      const a = (Math.PI * i) / n;
      roof.push(v2((R - t) * Math.cos(a), wall + Math.max(0.02, rise - t) * Math.sin(a)));
    }
    ctx.addSolid(sweepRings(frames.map((f) => roof.map((p) => framePoint(f, p.x, p.y, 0))), roof), undefined, 'glass');
  }
  ctx.setCamera(null);
  return lastFrame(frames);
}
