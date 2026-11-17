// Dev probe: report sudden speed gains (possible collision artifacts).
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const n = Number(process.argv[2] || 30);
const thresh = Number(process.argv[3] || 8);
for (let k = 1; k <= n; k++) {
  const race = new Race(RAPIER, `seed-${k}`);
  const prev = race.marbles.map(() => 0);
  while (!race.finished && race.time < 80) {
    race.step();
    race.marbles.forEach((m, i) => {
      const v = m.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      const p = race.course.path[m.pathIndex];
      if (sp - prev[i] > thresh && m.curr.y > 0.5) console.log(`seed-${k}`, race.time.toFixed(3), m.name, p.section, 's', p.s.toFixed(1), 'speed', prev[i].toFixed(1), '->', sp.toFixed(1), 'vel', v.x.toFixed(1), v.y.toFixed(1), v.z.toFixed(1));
      prev[i] = sp;
    });
  }
  race.dispose();
}
