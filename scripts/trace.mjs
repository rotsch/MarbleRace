// Dev probe: print one marble's trajectory.  node scripts/trace.mjs seed name t0 t1 [dt]
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const [seed, name, t0, t1, dt = 0.1] = process.argv.slice(2);
const race = new Race(RAPIER, seed);
const m = race.marbles.find((x) => x.name === name);
let next = Number(t0);
while (race.time < Number(t1)) {
  race.step();
  if (race.time >= next) {
    next += Number(dt);
    const p = race.course.path[m.pathIndex];
    const v = m.body.linvel();
    const rel = { x: m.curr.x - p.pos.x, y: m.curr.y - p.pos.y, z: m.curr.z - p.pos.z };
    const lat = rel.x * Math.cos(Math.atan2(p.tangent.x, p.tangent.z)) - rel.z * Math.sin(Math.atan2(p.tangent.x, p.tangent.z));
    console.log(race.time.toFixed(2), p.section.padEnd(14), 's', p.s.toFixed(2), 'lat', lat.toFixed(2), 'dy', rel.y.toFixed(2), 'speed', Math.hypot(v.x, v.y, v.z).toFixed(1), 'vy', v.y.toFixed(1));
  }
}
