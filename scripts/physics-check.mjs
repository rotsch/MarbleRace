// Checks that a single marble behaves like a real rolling ball with the
// project's physics settings. Run: npm run physics-check
import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS, MARBLE, TRACK } from '../src/config.js';
import { initPhysics, createWorld } from '../src/physics.js';

await initPhysics(RAPIER);
const g = -PHYSICS.gravity, R = MARBLE.radius;
let ok = true;
const report = (name, value, expected, tol, unit = '') => {
  const pass = Math.abs(value - expected) <= tol;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} ${value.toFixed(3)}${unit}  (expected ${expected.toFixed(3)} +- ${tol})`);
};

function plane(world, slope) {
  // Big sloped quad as a trimesh, like the track surfaces.
  const y = (z) => -slope * z;
  const v = new Float32Array([-5, y(-5), -5, 5, y(-5), -5, 5, y(400), 400, -5, y(400), 400]);
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 2, 1, 0, 3, 2]), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(TRACK.friction).setRestitution(TRACK.restitution)
  );
}
function marble(world, pos, vel = { x: 0, y: 0, z: 0 }, spin = 0) {
  const b = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinvel(vel.x, vel.y, vel.z)
      .setAngvel({ x: spin, y: 0, z: 0 }).setCcdEnabled(true).setAngularDamping(MARBLE.angularDamping).setCanSleep(false)
  );
  world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(MARBLE.density).setRestitution(MARBLE.restitution).setFriction(MARBLE.friction), b);
  return b;
}
const steps = (world, seconds, each) => { for (let i = 0; i < Math.round(seconds / PHYSICS.timestep); i++) { world.step(); each?.(); } };

// 1. Rolling from rest down an incline: a solid sphere accelerates at (5/7) g sin(theta).
{
  const slope = Math.tan((10 * Math.PI) / 180), n = Math.hypot(1, slope);
  const world = createWorld(RAPIER);
  plane(world, slope);
  const b = marble(world, { x: 0, y: R * n, z: 0 });
  steps(world, 1.5);
  const v = b.linvel();
  report('incline 10 deg: speed after 1.5 s', Math.hypot(v.y, v.z), (5 / 7) * g * Math.sin(Math.atan(slope)) * 1.5, 0.5, ' u/s');
  report('incline: rolls without slipping (v / (w R))', Math.hypot(v.y, v.z) / (b.angvel().x * R), 1, 0.03);
}
// 2. Fast rolling on the flat keeps its speed and does not sink into the floor.
{
  const world = createWorld(RAPIER);
  plane(world, 0);
  const b = marble(world, { x: 0, y: R, z: 0 }, { x: 0, y: 0, z: 20 }, 20 / R);
  let sink = 0;
  steps(world, 1, () => (sink = Math.max(sink, R - b.translation().y)));
  report('flat, 20 u/s: speed after 1 s', b.linvel().z, 20, 0.6, ' u/s');
  report('flat, 20 u/s: deepest sink into floor', sink, 0, 0.004, ' u');
}
// 3. Drop from 1 unit: rebound height is e^2 with the combined restitution.
{
  const world = createWorld(RAPIER);
  plane(world, 0);
  const b = marble(world, { x: 0, y: R + 1, z: 0 });
  let low = false, peak = 0;
  steps(world, 1.2, () => {
    const y = b.translation().y - R;
    if (y < 0.01) low = true;
    else if (low) peak = Math.max(peak, y);
  });
  const e = (MARBLE.restitution + TRACK.restitution) / 2;
  report('drop from 1 u: rebound height', peak, e * e, 0.05, ' u');
}
// 4. Head-on collision of two equal marbles, one at rest.
{
  const world = createWorld(RAPIER);
  world.gravity = { x: 0, y: 0, z: 0 };
  const a = marble(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 });
  const b = marble(world, { x: 0, y: 0, z: 1 });
  steps(world, 0.5);
  const e = MARBLE.restitution;
  report('head-on hit: struck marble speed', b.linvel().z, (6 * (1 + e)) / 2, 0.1, ' u/s');
  report('head-on hit: striking marble speed', a.linvel().z, (6 * (1 - e)) / 2, 0.1, ' u/s');
}
// 5. CCD: a fast marble must not pass through a thin wall.
{
  const world = createWorld(RAPIER);
  world.gravity = { x: 0, y: 0, z: 0 };
  world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 0.01).setTranslation(0, 0, 2));
  const b = marble(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 120 });
  steps(world, 0.2);
  const z = b.translation().z;
  const pass = z < 2;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${'thin wall hit at 120 u/s: no tunnelling'.padEnd(46)} marble ended at z = ${z.toFixed(2)}, wall at z = 2`);
}
console.log(ok ? '\nall checks passed' : '\nsome checks FAILED');
process.exit(ok ? 0 : 1);
