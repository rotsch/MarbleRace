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
      .setAngvel({ x: spin, y: 0, z: 0 }).setCcdEnabled(MARBLE.ccd).setAngularDamping(MARBLE.angularDamping).setCanSleep(false)
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
  // With angular damping c (our rolling resistance) the rolling ball obeys
  // a = (5/7) g sin - (2/7) c v, so v(t) = (5 g sin / 2c) (1 - e^(-2ct/7)).
  const gs = g * Math.sin(Math.atan(slope)), c = MARBLE.angularDamping;
  const vExpected = c > 0 ? ((5 * gs) / (2 * c)) * (1 - Math.exp((-2 * c * 1.5) / 7)) : (5 / 7) * gs * 1.5;
  report('incline 10 deg: speed after 1.5 s', Math.hypot(v.y, v.z), vExpected, 0.5, ' u/s');
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
// 5. A fast marble must not pass through a thin wall.
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
// 6. No invented energy: a marble landing at speed on a steep track built
// from many thin triangles (like every swept track piece) must only lose
// energy as it rolls on. With CCD on, Rapier halts the marble at internal
// triangle edges while its velocity keeps growing: +190% here at 1/120 s.
{
  const world = createWorld(RAPIER);
  const th = (40 * Math.PI) / 180, seg = TRACK.step, n = Math.ceil(20 / seg);
  const verts = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const y = -i * seg * Math.sin(th), z = i * seg * Math.cos(th);
    verts.push(-0.5, y, z, 0.5, y, z);
    if (i < n) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  }
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(TRACK.friction).setRestitution(TRACK.restitution)
  );
  const nrm = { y: Math.cos(th), z: Math.sin(th) }, s0 = 0.3, h = R + 0.02;
  const b = marble(
    world,
    { x: 0, y: -s0 * Math.sin(th) + h * nrm.y, z: s0 * Math.cos(th) + h * nrm.z },
    { x: 0, y: -14 * Math.sin(th) - 3 * nrm.y, z: 14 * Math.cos(th) - 3 * nrm.z },
    (0.7 * 14) / R
  );
  const energy = () => {
    const lv = b.linvel(), w = b.angvel();
    return 0.5 * (lv.x ** 2 + lv.y ** 2 + lv.z ** 2) + 0.2 * R * R * (w.x ** 2 + w.y ** 2 + w.z ** 2) + g * b.translation().y;
  };
  let e0 = null, eMax = 0;
  steps(world, 0.3, () => {
    const e = energy();
    if (e0 === null && b.translation().z > 0.6) e0 = e; // after the landing
    if (e0 !== null) eMax = Math.max(eMax, e);
  });
  report('steep fine-mesh slope: energy gain after landing', Math.max(0, eMax - e0) / e0, 0, 0.02);
}
console.log(ok ? '\nall checks passed' : '\nsome checks FAILED');
process.exit(ok ? 0 : 1);
