import { Vector3 } from 'three';
import { deg } from './frame.js';
import * as start from './sections/start.js';
import * as straight from './sections/straight.js';
import * as curve from './sections/curve.js';
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
  add('Track', straight, { len: 4, pitch: deg(-10) });
  add('Finish', finish);
}
