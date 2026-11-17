// Dev probe: list every surface under/around a world point.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const [x, y, z] = process.argv.slice(2).map(Number);
const race = new Race(RAPIER, '1');
race.world.step();
for (const [dx, dz] of [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]]) {
  const hits = [];
  race.world.intersectionsWithRay(new RAPIER.Ray({ x: x + dx, y: y + 0.5, z: z + dz }, { x: 0, y: -1, z: 0 }), 1.2, false, (h) => {
    hits.push(`y=${(y + 0.5 - h.timeOfImpact ?? h.toi).toFixed(3)} n=(${h.normal.x.toFixed(2)},${h.normal.y.toFixed(2)},${h.normal.z.toFixed(2)}) col#${h.collider.handle}`);
    return true;
  });
  console.log(`at +(${dx},${dz}):`, hits.join(' | '));
}
