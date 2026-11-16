// Dev experiment: rolling marble quality vs solver settings (sink, speed retention).
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
function run({ it = 4, pgs = 1, cf = 30, v0 = 20, R = 0.08, erp, slope = 0 }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = 1 / 120;
  const ip = world.integrationParameters;
  ip.numSolverIterations = it; ip.numInternalPgsIterations = pgs; ip.contact_natural_frequency = cf;
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 0, 400, -1, 0, 400]), new Uint32Array([0, 2, 1, 0, 3, 2]), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.35).setRestitution(0.45));
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, R, 0.5).setCcdEnabled(true).setCanSleep(false).setLinvel(0, 0, v0).setAngvel({ x: v0 / R, y: 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(2.5).setRestitution(0.55).setFriction(0.35), b);
  let min = 0, max = -1;
  for (let i = 0; i < 120; i++) { world.step(); const h = b.translation().y - R; min = Math.min(min, h); if (i > 10) max = Math.max(max, h); }
  return `sink ${(-min).toFixed(4)} hop ${max.toFixed(4)} v ${b.linvel().z.toFixed(2)} w*R ${(b.angvel().x * R).toFixed(2)}`;
}
for (const cfg of [{ it: 4 }, { it: 1 }, { it: 1, pgs: 4 }, { it: 1, cf: 60 }, { it: 1, pgs: 4, cf: 60 }, { it: 2, cf: 60 }, { it: 4, cf: 60 }, { it: 4, cf: 120 }, { it: 1, cf: 120, pgs: 4 }])
  console.log(JSON.stringify(cfg).padEnd(26), 'v0=20:', run(cfg), ' | v0=6:', run({ ...cfg, v0: 6 }));
