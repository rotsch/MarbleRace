import { Vector3 } from 'three';
import { deg } from './frame.js';
import * as start from './sections/start.js';
import * as straight from './sections/straight.js';
import * as curve from './sections/curve.js';
import * as pegField from './sections/pegField.js';
import * as funnel from './sections/funnel.js';
import * as splitter from './sections/splitter.js';
import * as dropCatch from './sections/dropCatch.js';
import * as bumpyRoad from './sections/bumpyRoad.js';
import * as loop from './sections/loop.js';
import * as halfPipe from './sections/halfPipe.js';
import * as spiral from './sections/spiral.js';
import * as bouncyPads from './sections/bouncyPads.js';
import * as bottleneck from './sections/bottleneck.js';
import * as finish from './sections/finish.js';

// The course layout: an ordered chain of sections. Each section takes the exit
// pose of the previous one, so sections can be reordered or retuned here.
export function buildCourse(ctx) {
  let f = { pos: new Vector3(0, 0, 0), yaw: 0, pitch: deg(-8) };
  const add = (name, mod, opts) => {
    if (ctx.sectionName !== name) ctx.section(name);
    f = mod.build(ctx, f, opts);
  };

  // Two sharp unbanked bends back to back. Marbles bounce off the outer
  // walls, which is the main way speed is shed between the fast sections.
  const sBend = (name, dir, pitch = -4) => {
    add(name, curve, { radius: 0.55, angle: deg(75 * dir), pitch: deg(pitch), bank: 0, rail: 0.65 });
    add(name, curve, { radius: 0.55, angle: deg(-75 * dir), pitch: deg(pitch), bank: 0, rail: 0.65 });
  };

  add('Start', start, { len: 2.6 });
  add('Peg field', pegField);
  add('Curve 1', curve, { radius: 1.6, angle: deg(-70), pitch: deg(-4) });
  add('Funnel', funnel, { side: 1, exitYaw: deg(-20) });
  add('Loop', loop);
  sBend('S-bend 1', 1);
  add('Half-pipe', halfPipe, { side: 1 });
  add('Splitter', splitter, { side: -1 });
  add('Curve 2', curve, { radius: 1.6, angle: deg(60), pitch: deg(-4) });
  add('Drop and catch', dropCatch);
  sBend('S-bend 2', -1);
  add('Bumpy road', bumpyRoad);
  sBend('S-bend 3', 1);
  add('Spiral', spiral, { side: 1 });
  add('Bouncy pads', bouncyPads);
  sBend('S-bend 4', 1);
  add('Curve 3', curve, { radius: 1.4, angle: deg(-50), pitch: deg(-4) });
  add('Bottleneck', bottleneck);
  add('Finish', finish);
}
