import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
import { initPhysics } from '../src/physics.js';
await initPhysics(RAPIER);
const [seed, name, t0, t1, dt = 0.05] = process.argv.slice(2);
const race = new Race(RAPIER, seed);
const m = race.marbles.find((x) => x.name === name);
let next = Number(t0);
while (race.time < Number(t1)) {
  race.step();
  if (race.time >= next) {
    next += Number(dt);
    const p = race.course.path[m.pathIndex];
    const v = m.body.linvel();
    const t = p.tangent, n = Math.hypot(t.x, t.z) || 1;
    const lat = ((m.curr.x - p.pos.x) * t.z - (m.curr.z - p.pos.z) * t.x) / n;
    const sec = race.course.sections.findLast((s) => s.name === p.section);
    console.log(race.time.toFixed(2), p.section.padEnd(12), 'd', (p.s - sec.s0).toFixed(2), 'lat', lat.toFixed(2), 'dy', (m.curr.y - p.pos.y).toFixed(2), 'y', m.curr.y.toFixed(2), 'speed', Math.hypot(v.x, v.y, v.z).toFixed(1), 'vy', v.y.toFixed(1), m.finished ? 'FIN' : '');
  }
}
