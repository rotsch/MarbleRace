// Dev probe: world position of each section start.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const race = new Race(RAPIER, '1');
for (const s of race.course.sections) {
  const p = race.course.path.find((q) => q.s >= s.s0);
  console.log(s.name.padEnd(16), 's0', s.s0.toFixed(1), 'pos', p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'dir', p.tangent.x.toFixed(2), p.tangent.z.toFixed(2));
}
