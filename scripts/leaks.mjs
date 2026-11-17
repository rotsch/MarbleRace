// Dev probe: where do marbles leave the course? Lists rescue put-back points
// (the furthest point the marble had reached) grouped by section.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const n = Number(process.argv[2] || 20), from = Number(process.argv[3] || 1);
const bySection = {};
let marbles = 0;
for (let k = from; k < from + n; k++) {
  const race = new Race(RAPIER, `seed-${k}`);
  while (!race.finished && race.time < 120) race.step();
  marbles += 8;
  for (const e of race.log) {
    const sec = race.course.sections.findLast((x) => x.s0 <= e.s + 1e-6) ?? { name: '?', s0: 0 };
    (bySection[`${e.type} ${e.section}`] ??= []).push(`${(e.s - (race.course.sections.find((x) => x.name === e.section)?.s0 ?? 0)).toFixed(1)}`);
  }
  if (!race.finished) console.log(`seed-${k} did not finish`);
  race.dispose();
}
console.log(`${marbles} marbles`);
for (const [k, v] of Object.entries(bySection)) console.log(k.padEnd(28), String(v.length).padStart(3), ' at +', v.sort((a, b) => a - b).join(' '));
