// Dev probe: floor height under the centre line between two path distances.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const [s0, s1, lat = 0] = process.argv.slice(2).map(Number);
const race = new Race(RAPIER, '1');
race.world.step();
let prev = null;
for (const p of race.course.path) {
  if (p.s < s0 || p.s > s1) continue;
  const t = p.tangent;
  const n = Math.hypot(t.x, t.z) || 1;
  const o = { x: p.pos.x + (t.z / n) * lat, y: p.pos.y + 0.6, z: p.pos.z - (t.x / n) * lat };
  const hit = race.world.castRay(new RAPIER.Ray(o, { x: 0, y: -1, z: 0 }), 5, true);
  const y = hit ? o.y - hit.timeOfImpact : NaN;
  console.log(p.section.padEnd(15), 's', p.s.toFixed(2), 'pathY', p.pos.y.toFixed(3), 'floorY', y.toFixed(3), 'diff', (y - p.pos.y).toFixed(3), prev !== null ? 'step ' + (y - prev).toFixed(3) : '');
  prev = y;
}
