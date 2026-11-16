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
import * as finish from './sections/finish.js';

// The course layout: an ordered chain of sections. Each section takes the exit
// pose of the previous one, so sections can be reordered or retuned here.
export function buildCourse(ctx) {
  let f = { pos: new Vector3(0, 0, 0), yaw: 0, pitch: deg(-12) };
  const add = (name, mod, opts) => {
    ctx.section(name);
    f = mod.build(ctx, f, opts);
  };

  add('Start', start, { len: 3 });
  add('Peg field', pegField);
  add('Curve 1', curve, { radius: 1.6, angle: deg(-70), pitch: deg(-8) });
  add('Funnel', funnel, { side: 1, exitYaw: deg(-20) });
  add('Splitter', splitter, { side: -1 });
  add('Curve 2', curve, { radius: 1.6, angle: deg(60), pitch: deg(-7) });
  add('Drop and catch', dropCatch);
  add('Finish', finish);
}
