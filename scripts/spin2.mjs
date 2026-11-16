import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
function run({ axis = 'x', w = 150, dt = 1 / 120, it = 4, ccd = true, erp, shape = 'ball', sub = 1 }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = dt / sub;
  world.integrationParameters.numSolverIterations = it;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5, 1, 5).setTranslation(0, -1, 0).setFriction(0));
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.08, 0).setCcdEnabled(ccd).setCanSleep(false).setAngvel({ x: axis === 'x' ? w : 0, y: axis === 'y' ? w : 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(0.08).setDensity(2.5).setFriction(0), b);
  let min = 0; const ys = [];
  for (let i = 0; i < 120 * sub; i++) { world.step(); min = Math.min(min, b.translation().y - 0.08); if (i < 6) ys.push((b.translation().y - 0.08).toFixed(4)); }
  return `sink ${(-min).toFixed(4)}  first ${ys.join(' ')} w=${b.angvel().x.toFixed(0)}`;
}
console.log('spin x 150 ', run({}));
console.log('spin y 150 ', run({ axis: 'y' }));
console.log('spin x 0   ', run({ w: 0 }));
console.log('spin x 300 ', run({ w: 300 }));
console.log('spin x 150 no ccd', run({ ccd: false }));
