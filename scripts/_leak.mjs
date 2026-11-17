import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
import { initPhysics } from '../src/physics.js';
await initPhysics(RAPIER);
for (const k of process.argv.slice(2)) {
  const race = new Race(RAPIER, `seed-${k}`);
  // remember each marble's last on-track state
  const last = race.marbles.map(() => null);
  let seen = 0;
  while (!race.finished && race.time < 120) {
    race.step();
    race.marbles.forEach((m, i) => {
      const p = race.course.path[m.pathIndex];
      const dy = m.curr.y - p.pos.y;
      const v = m.body.linvel();
      if (Math.abs(dy - 0.08) < 0.05) last[i] = { t: race.time, sec: p.section, d: p.s - race.course.sections.findLast((s) => s.name === p.section).s0, speed: Math.hypot(v.x, v.y, v.z) };
    });
    while (seen < race.log.length) {
      const e = race.log[seen++];
      const i = race.marbles.findIndex((m) => m.name === e.marble);
      const l = last[i];
      console.log(`seed-${k} ${e.type} ${e.marble} at t=${e.time.toFixed(2)}; last on track: ${l.sec} +${l.d.toFixed(1)} at t=${l.t.toFixed(2)}, speed ${l.speed.toFixed(1)}`);
    }
  }
}
