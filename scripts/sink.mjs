import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
function run({ flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, slope = 0.25, v0 = 12, ccd = true, rest = 0.55, cf, soft, spin = true, erp }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = 1 / 120;
  if (cf) world.integrationParameters.contact_natural_frequency = cf;
  const y = (z) => -slope * z;
  const v = new Float32Array([-1, y(0), 0, 1, y(0), 0, 1, y(40), 40, -1, y(40), 40]);
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 2, 1, 0, 3, 2]), flags).setFriction(0.35).setRestitution(0.45));
  const n = Math.hypot(1, slope);
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.08 * n - slope * 0.5, 0.5).setCcdEnabled(ccd).setCanSleep(false)
    .setLinvel(0, -slope * v0 / n, v0 / n).setAngvel({ x: spin ? v0 / 0.08 : 0, y: 0, z: 0 }));
  const c = world.createCollider(RAPIER.ColliderDesc.ball(0.08).setDensity(2.5).setRestitution(rest).setFriction(0.35), b);
  if (soft !== undefined) c.setContactSkin?.(soft);
  const hs = [];
  for (let i = 0; i < 200; i++) {
    world.step();
    const p = b.translation();
    if (p.z > 39) break;
    hs.push((p.y - y(p.z)) / n - 0.08);
  }
  return `min ${Math.min(...hs).toFixed(4)} max ${Math.max(...hs).toFixed(4)} first: ${hs.slice(0, 8).map((h) => h.toFixed(4)).join(' ')}`;
}
console.log('default      ', run({}));
console.log('v0=0 start   ', run({ v0: 0.01 }));
console.log('no ccd       ', run({ ccd: false }));
console.log('rest 0       ', run({ rest: 0 }));
console.log('flags 0      ', run({ flags: 0 }));
console.log('cf 60        ', run({ cf: 60 }));
console.log('flat v12     ', run({ slope: 0 }));
function run2({ fr = 0.35, spin = 150, v0 = 12, dt = 1 / 120, R = 0.08, box = false, len }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = dt;
  if (len) world.integrationParameters.lengthUnit = len;
  if (box) world.createCollider(RAPIER.ColliderDesc.cuboid(5, 1, 100).setTranslation(0, -1, 0).setFriction(fr));
  else world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 0, 400, -1, 0, 400]), new Uint32Array([0, 2, 1, 0, 3, 2])).setFriction(fr));
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, R, 0.5).setCcdEnabled(true).setCanSleep(false).setLinvel(0, 0, v0).setAngvel({ x: spin, y: 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(2.5).setRestitution(0.55).setFriction(fr), b);
  let min = 0;
  for (let i = 0; i < 1 / dt; i++) { world.step(); min = Math.min(min, b.translation().y - R); }
  return `sink ${(-min).toFixed(4)} v ${b.linvel().z.toFixed(2)}`;
}
console.log('rolling 12       ', run2({}));
console.log('frictionless slide', run2({ fr: 0, spin: 0 }));
console.log('frictionless spin ', run2({ fr: 0, spin: 150 }));
console.log('rolling 6        ', run2({ v0: 6, spin: 75 }));
console.log('rolling 3        ', run2({ v0: 3, spin: 37.5 }));
console.log('rolling 12 dt240 ', run2({ dt: 1 / 240 }));
console.log('rolling 12 box   ', run2({ box: true }));
console.log('static spin only ', run2({ fr: 0, v0: 0, spin: 150 }));
console.log('rolling len 0.1  ', run2({ len: 0.1 }));
function run3({ it = 4, pgs = 1, v0 = 12, R = 0.08, slope = 0 }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = 1 / 120;
  world.integrationParameters.numSolverIterations = it;
  world.integrationParameters.numInternalPgsIterations = pgs;
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 0, 400, -1, 0, 400]), new Uint32Array([0, 2, 1, 0, 3, 2])).setFriction(0.35));
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, R, 0.5).setCcdEnabled(true).setCanSleep(false).setLinvel(0, 0, v0).setAngvel({ x: v0 / R, y: 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(2.5).setRestitution(0.55).setFriction(0.35), b);
  let min = 0;
  const t0 = performance.now();
  for (let i = 0; i < 120; i++) { world.step(); min = Math.min(min, b.translation().y - R); }
  return `sink ${(-min).toFixed(4)} v after 1s ${b.linvel().z.toFixed(2)}  (${(performance.now() - t0).toFixed(1)} ms)`;
}
console.log('--- solver iterations, v0=12');
for (const it of [1, 2, 4, 8, 12, 16, 24]) console.log('iters', it, run3({ it }));
console.log('--- iters 8'); for (const v0 of [3, 6, 12, 20, 30]) console.log('v0', v0, run3({ it: 8, v0 }));
console.log('--- iters 16'); for (const v0 of [3, 6, 12, 20, 30]) console.log('v0', v0, run3({ it: 16, v0 }));
