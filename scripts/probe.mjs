// Dev probe: print where safety-net incidents happen for one seed.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const race = new Race(RAPIER, process.argv[2] || 'seed-1');
const maxT = Number(process.argv[3] || 80);
let seen = 0;
const fin = race.course.path.at(-1);
console.log('path end', fin.pos.toArray().map((v) => v.toFixed(2)).join(' '), 'bounds', race.course.bounds.min.toArray().map((v) => v.toFixed(1)), race.course.bounds.max.toArray().map((v) => v.toFixed(1)));
while (!race.finished && race.time < maxT) {
  race.step();
  while (seen < race.log.length) {
    const e = race.log[seen++];
    const m = race.marbles.find((x) => x.name === e.marble);
    const p = race.course.path[m.pathIndex];
    console.log(e.time.toFixed(2), e.type, e.marble, e.section, 'prev pos', m.prev.x.toFixed(2), m.prev.y.toFixed(2), m.prev.z.toFixed(2), 'path pt', p.pos.x.toFixed(2), p.pos.y.toFixed(2), p.pos.z.toFixed(2), 's', p.s.toFixed(1));
  }
}
console.log('finished', race.results.length, 't', race.time.toFixed(1));
