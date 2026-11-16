import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
for (const cfg of [{}, { cf: 60 }, { len: 10 }, { dt: 1 / 240 }, {dens: 25}]) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = cfg.dt ?? 1 / 120;
  if (cfg.cf) world.integrationParameters.contact_natural_frequency = cfg.cf;
  if (cfg.len) world.integrationParameters.lengthUnit = cfg.len;
  const v = new Float32Array([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5]);
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, new Uint32Array([0, 2, 1, 0, 3, 2]), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.09, 0).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.ball(0.08).setDensity(cfg.dens ?? 2.5).setRestitution(0.55), b);
  for (let i = 0; i < 600; i++) world.step();
  console.log(JSON.stringify(cfg), 'rest penetration', (0.08 - b.translation().y).toFixed(5));
}
