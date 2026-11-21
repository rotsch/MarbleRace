// Headless course check: races several seeds without rendering and reports
// whether every marble finishes, how long each section takes, and whether the
// safety net (nudge / rescue) ever had to step in. Also audits energy: one
// marble alone on the course may only ever lose energy.
//   node scripts/sim.mjs [--seeds 10] [--max 240] [--layout full|loop|bottleneck|...] [--course edited.json] [--track name] [--quiet] [--verbose]
import RAPIER from '@dimforge/rapier3d-compat';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';
import { PHYSICS, MARBLE } from '../src/config.js';
import { initPhysics } from '../src/physics.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1] ?? true;
};
const seeds = Number(arg('seeds', 10));
// --endless <seconds>: endless mode, a course that builds itself for a race
// of about that long (see src/course/endless.js).
const endlessTime = arg('endless', null);
const maxTime = Number(arg('max', endlessTime ? Number(endlessTime) + 180 : 240));
const verbose = process.argv.includes('--verbose');
const quiet = process.argv.includes('--quiet');
const only = arg('seed', null);
// --course: a course exported from the editor (JSON), instead of a layout.
// --track: a track saved in the tracks folder, by name.
const track = arg('track', null);
const courseFile = track ? new URL(`../tracks/${track}.json`, import.meta.url) : arg('course', null);
const layout = endlessTime
  ? { endless: { duration: Number(endlessTime) } }
  : courseFile ? JSON.parse(readFileSync(courseFile, 'utf8')) : arg('layout', 'full');

await initPhysics(RAPIER);

function run(seed) {
  const race = new Race(RAPIER, seed, null, layout);
  race.endless?.fill();
  const sectionTime = {};
  const speedSum = {}, speedN = {}, speedMax = {};
  let maxSpeed = 0, maxCoord = 0, maxLiveBodies = 0;
  while (!race.finished && race.time < maxTime) {
    race.step();
    if (race.endless) {
      race.endless.events.length = 0;
      for (const m of race.marbles) maxCoord = Math.max(maxCoord, Math.abs(m.curr.x), Math.abs(m.curr.y), Math.abs(m.curr.z));
      maxLiveBodies = Math.max(maxLiveBodies, race.course.courseBodies.size);
    }
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
    endless: race.endless && { ...race.endless.stats, maxCoord: +maxCoord.toFixed(1), maxLiveBodies, finishBuilt: race.endless.done },
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
  if (r.endless) console.log('    endless:', JSON.stringify(r.endless));
  if (verbose) console.log('   ', r.order.join(' > '), r.log);
}

console.log(`\ncourse length ${first.length.toFixed(1)} units`);
console.log('section            mean time   mean speed   max speed');
for (const s of first.sections)
  console.log(`  ${s.name.padEnd(16)} ${(totals[s.name] || 0).toFixed(2).padStart(7)} s ${((spSum[s.name] || 0) / (spN[s.name] || 1)).toFixed(1).padStart(10)} ${(spMax[s.name] || 0).toFixed(1).padStart(11)}`);
console.log(`route counts over ${list.length * 8} marbles:`, counters);
console.log('safety-net incidents:', Object.keys(incidents).length ? incidents : 'none');

// Energy audit: run one marble alone (no marble-to-marble hits) and sum every
// step in which its energy (motion + spin + height) goes up. A real ball only
// loses energy; the threshold allows for integration noise. Before the CCD fix
// this was ~1500 J/kg, mostly on the ramp into the loop and the bouncy pads.
function energyAudit(seed, keep) {
  const race = new Race(RAPIER, seed, null, layout);
  race.marbles.forEach((m, i) => {
    if (i === keep) return;
    m.finished = true;
    m.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
    m.body.setTranslation({ x: 1000 + i, y: 500, z: 1000 }, false);
  });
  const m = race.marbles[keep], g = -PHYSICS.gravity, R = MARBLE.radius;
  const energy = () => {
    const v = m.body.linvel(), w = m.body.angvel();
    return 0.5 * (v.x ** 2 + v.y ** 2 + v.z ** 2) + 0.2 * R * R * (w.x ** 2 + w.y ** 2 + w.z ** 2) + g * m.body.translation().y;
  };
  const bySection = {};
  let prev = energy(), total = 0;
  while (!m.finished && race.time < maxTime) {
    const incidents = race.log.length;
    const rebases = race.endless?.stats.rebases;
    race.step();
    if (race.endless) race.endless.events.length = 0;
    const e = energy(), d = e - prev;
    prev = e;
    // Safety-net moves are not physics, nor is the endless course shifting
    // everything (height included) back towards the origin.
    if (race.log.length > incidents || race.endless?.stats.rebases !== rebases || d <= 0.5) continue;
    const s = race.course.path[m.pathIndex].section;
    bySection[s] = (bySection[s] || 0) + d;
    total += d;
  }
  race.dispose();
  return { total, bySection };
}
let worst = { total: -1 };
for (const keep of [0, 3, 6]) {
  const r = energyAudit(list[0], keep);
  if (r.total > worst.total) worst = r;
}
const top = Object.entries(worst.bySection).sort((a, b) => b[1] - a[1]).slice(0, 3);
const energyOk = worst.total < 50;
console.log(
  `energy audit (single marble, ${list[0]}): invented ${worst.total.toFixed(1)} J/kg ${energyOk ? '(ok, < 50)' : '(FAIL, >= 50)'}` +
    (top.length ? `  worst: ${top.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}` : '')
);
ok &&= energyOk;

// Determinism: the same seed must reproduce the same result exactly.
const again = run(list[0]);
const same = JSON.stringify(again.order) === JSON.stringify(first.order) && JSON.stringify(again.times) === JSON.stringify(first.times);
console.log(`determinism (${list[0]} run twice): ${same ? 'identical' : 'DIFFERENT'}`);
ok &&= same;
process.exit(ok ? 0 : 1);
