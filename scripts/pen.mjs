// Dev probe: deepest marble/track penetration over a race.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const race = new Race(RAPIER, process.argv[2] || 'seed-8');
let worst = 0, sum = 0, n = 0;
const hist = [0, 0, 0, 0, 0];
while (!race.finished && race.time < 40) {
  race.step();
  for (const m of race.marbles) {
    race.world.contactPairsWith(m.collider, (other) => {
      if (!other.parent().isFixed()) return;
      race.world.contactPair(m.collider, other, (mf) => {
        for (let i = 0; i < mf.numContacts(); i++) {
          const d = -mf.contactDist(i);
          if (d <= 0) continue;
          worst = Math.max(worst, d); sum += d; n++;
          hist[Math.min(4, Math.floor(d / 0.004))]++;
        }
      });
    });
  }
}
console.log('worst penetration', worst.toFixed(4), 'mean', (sum / n).toFixed(4), 'hist(0.004 bins)', hist.join(' '), 'finished', race.results.length, 't', race.time.toFixed(1));
