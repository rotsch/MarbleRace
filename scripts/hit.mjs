// Dev probe: at time t, shape-cast a marble along its velocity and report what it would hit.
import RAPIER from '@dimforge/rapier3d-compat';
import { Race } from '../src/race.js';
await RAPIER.init();
const [seed, name, t] = process.argv.slice(2);
const race = new Race(RAPIER, seed);
const m = race.marbles.find((x) => x.name === name);
while (race.time < Number(t)) race.step();
for (let k = 0; k < 4; k++) {
  const p = m.body.translation(), v = m.body.linvel();
  console.log('t', race.time.toFixed(4), 'pos', p.x.toFixed(4), p.y.toFixed(4), p.z.toFixed(4), 'vel', v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2));
  race.world.contactPairsWith(m.collider, (other) => {
    race.world.contactPair(m.collider, other, (manifold, flipped) => {
      const n = manifold.normal();
      const par = other.parent();
      console.log('   contact with', other.shape.type, par.isFixed() ? 'static' : 'marble', 'n', n.x.toFixed(3), n.y.toFixed(3), n.z.toFixed(3), 'flipped', flipped, 'pts', manifold.numContacts(), 'dist', manifold.numContacts() ? manifold.contactDist(0).toFixed(4) : '');
    });
  });
  race.step();
}
