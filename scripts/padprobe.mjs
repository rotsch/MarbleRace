// Dev probe: speeds at the end of the pad approach and what happens next.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const sp = [];
for (let k = 1; k <= Number(process.argv[2] || 6); k++) {
  const race = new Race(RAPIER, `seed-${k}`);
  const sec = race.course.sections.find((s) => s.name === 'Bouncy pads');
  const s1 = sec.s0 + 1.3;
  const done = new Set();
  while (!race.finished && race.time < 60) {
    race.step();
    for (const m of race.marbles) {
      if (done.has(m.index) || m.progress < s1) continue;
      done.add(m.index);
      const v = m.body.linvel();
      sp.push(Math.hypot(v.x, v.z));
    }
  }
  race.dispose();
}
sp.sort((a, b) => a - b);
console.log('n', sp.length, 'min', sp[0].toFixed(1), 'p10', sp[Math.floor(sp.length * 0.1)].toFixed(1), 'median', sp[Math.floor(sp.length / 2)].toFixed(1), 'p90', sp[Math.floor(sp.length * 0.9)].toFixed(1), 'max', sp.at(-1).toFixed(1));
