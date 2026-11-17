// Headless course check: races several seeds without rendering and reports
// whether every marble finishes, how long each section takes, and whether the
// safety net (nudge / rescue) ever had to step in.
//   node scripts/sim.mjs [--seeds 10] [--max 240] [--verbose]
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
import { PHYSICS } from '../src/config.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1] ?? true;
};
const seeds = Number(arg('seeds', 10));
const maxTime = Number(arg('max', 240));
const verbose = process.argv.includes('--verbose');
const quiet = process.argv.includes('--quiet');
const only = arg('seed', null);

await RAPIER.init();

function run(seed) {
  const race = new Race(RAPIER, seed);
  const sectionTime = {};
  const speedSum = {}, speedN = {}, speedMax = {};
  let maxSpeed = 0;
  while (!race.finished && race.time < maxTime) {
    race.step();
    for (const m of race.marbles) {
      if (m.finished) continue;
      const s = race.course.path[m.pathIndex].section;
      sectionTime[s] = (sectionTime[s] || 0) + PHYSICS.timestep / race.marbles.length;
      const v = m.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      maxSpeed = Math.max(maxSpeed, sp);
      speedSum[s] = (speedSum[s] || 0) + sp;
      speedN[s] = (speedN[s] || 0) + 1;
      if (m.curr.y > 0.5) speedMax[s] = Math.max(speedMax[s] || 0, sp);
    }
  }
  const out = {
    seed,
    finished: race.results.length,
    order: race.results.map((m) => m.name),
    times: race.results.map((m) => +m.finishTime.toFixed(4)),
    log: race.log,
    sectionTime,
    speedSum, speedN, speedMax,
    maxSpeed,
    unfinished: race.marbles.filter((m) => !m.finished).map((m) => `${m.name}@${race.course.path[m.pathIndex].section}`),
    sections: race.course.sections,
    counters: Object.fromEntries(Object.entries(race.counters).map(([k, v]) => [k, v.size])),
    length: race.course.length,
  };
  race.dispose();
  return out;
}

const list = only !== null ? [only] : Array.from({ length: seeds }, (_, i) => `seed-${i + 1}`);
let ok = true;
const totals = {};
const incidents = {};
const counters = {};
const spSum = {}, spN = {}, spMax = {};
let first = null;
for (const seed of list) {
  const r = run(seed);
  first ??= r;
  const pass = r.finished === 8;
  ok &&= pass;
  for (const [k, v] of Object.entries(r.sectionTime)) totals[k] = (totals[k] || 0) + v / list.length;
  for (const k of Object.keys(r.speedN)) {
    spSum[k] = (spSum[k] || 0) + r.speedSum[k];
    spN[k] = (spN[k] || 0) + r.speedN[k];
    spMax[k] = Math.max(spMax[k] || 0, r.speedMax[k] || 0);
  }
  for (const [k, v] of Object.entries(r.counters)) counters[k] = (counters[k] || 0) + v;
  for (const e of r.log) {
    const k = `${e.type} @ ${e.section}`;
    incidents[k] = (incidents[k] || 0) + 1;
  }
  if (quiet && pass && !r.log.length) continue;
  console.log(
    `${pass ? 'ok  ' : 'FAIL'} ${seed.padEnd(8)} finished ${r.finished}/8  last ${r.times.at(-1) ?? '-'}s  ` +
      `vmax ${r.maxSpeed.toFixed(1)}  nudges ${r.log.filter((e) => e.type === 'nudge').length}  ` +
      `rescues ${r.log.filter((e) => e.type === 'rescue').length}` +
      (r.unfinished.length ? `  stuck: ${r.unfinished.join(', ')}` : '')
  );
  if (verbose) console.log('   ', r.order.join(' > '), r.log);
}

console.log(`\ncourse length ${first.length.toFixed(1)} units`);
console.log('section            mean time   mean speed   max speed');
for (const s of first.sections)
  console.log(`  ${s.name.padEnd(16)} ${(totals[s.name] || 0).toFixed(2).padStart(7)} s ${((spSum[s.name] || 0) / (spN[s.name] || 1)).toFixed(1).padStart(10)} ${(spMax[s.name] || 0).toFixed(1).padStart(11)}`);
console.log(`route counts over ${list.length * 8} marbles:`, counters);
console.log('safety-net incidents:', Object.keys(incidents).length ? incidents : 'none');

// Determinism: the same seed must reproduce the same result exactly.
const again = run(list[0]);
const same = JSON.stringify(again.order) === JSON.stringify(first.order) && JSON.stringify(again.times) === JSON.stringify(first.times);
console.log(`determinism (${list[0]} run twice): ${same ? 'identical' : 'DIFFERENT'}`);
ok &&= same;
process.exit(ok ? 0 : 1);
