import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
function run({ ccd = true, v0 = 20, R = 0.08, floor = true, fr = 0.35, dt = 1 / 120, tri = true, dens = 2.5, g = -98.1 }) {
  const world = new RAPIER.World({ x: 0, y: g, z: 0 });
  world.timestep = dt;
  if (floor) {
    if (tri) world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 0, 400, -1, 0, 400]), new Uint32Array([0, 2, 1, 0, 3, 2])).setFriction(fr));
    else world.createCollider(RAPIER.ColliderDesc.cuboid(5, 1, 400).setTranslation(0, -1, 0).setFriction(fr));
  }
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, R, 0.5).setCcdEnabled(ccd).setCanSleep(false).setLinvel(0, 0, v0).setAngvel({ x: v0 / R, y: 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(dens).setRestitution(0.55).setFriction(fr), b);
  const out = [];
  for (let i = 0; i < 0.5 / dt; i++) { world.step(); if (i % Math.round(0.1 / dt) === 0) out.push(`v=${b.linvel().z.toFixed(2)},w=${b.angvel().x.toFixed(0)}`); }
  return out.join('  ');
}
console.log('ccd      ', run({}));
console.log('no ccd   ', run({ ccd: false }));
console.log('no floor ', run({ floor: false, g: 0 }));
console.log('cuboid   ', run({ tri: false }));
console.log('fr 0     ', run({ fr: 0 }));
console.log('dt 1/240 ', run({ dt: 1 / 240 }));
console.log('dt 1/480 ', run({ dt: 1 / 480 }));
console.log('R=0.8    ', run({ R: 0.8 }));
console.log('g=-9.81  ', run({ g: -9.81 }));
