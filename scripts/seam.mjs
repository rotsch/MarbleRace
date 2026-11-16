// Dev experiment: ball rolling down a slope across a seam between two trimesh slabs.
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
function slab(world, z0, z1, yOff, slope, flags) {
  // closed box-like slab, top surface y = -slope*z + yOff
  const y = (z) => -slope * z + yOff;
  const t = 0.04;
  const v = new Float32Array([
    -1, y(z0), z0, 1, y(z0), z0, 1, y(z1), z1, -1, y(z1), z1,
    -1, y(z0) - t, z0, 1, y(z0) - t, z0, 1, y(z1) - t, z1, -1, y(z1) - t, z1,
  ]);
  const idx = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx, flags).setFriction(0.35).setRestitution(0.45));
}
function slab2(world, z0, z1, slope, flags, delta) {
  // slab with a lead-in tucked under the previous one: starts 0.12 early, delta lower, eases to nominal over 0.5
  const t = 0.04, zs = [z0 - 0.12, z0, z0 + 0.5, z1], dy = [delta, delta, 0, 0];
  const v = [], idx = [];
  zs.forEach((z, i) => { const y = -slope * z - dy[i]; v.push(-1, y, z, 1, y, z, 1, y - t, z, -1, y - t, z); });
  for (let i = 0; i < 3; i++) { const a = i * 4, b = a + 4; for (let j = 0; j < 4; j++) { const k = (j + 1) % 4; idx.push(a + j, b + j, b + k, a + j, b + k, a + k); } }
  idx.push(0, 1, 2, 0, 2, 3, 12, 14, 13, 12, 15, 14);
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(idx), flags).setFriction(0.35).setRestitution(0.45));
}
function run({ overlap = 0, relief = 0, slope = 0.25, v0 = 12, flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES, ccd = true, single = false, pred }) {
  const world = new RAPIER.World({ x: 0, y: -98.1, z: 0 });
  world.timestep = 1 / 120;
  world.integrationParameters.numSolverIterations = 1; world.integrationParameters.numInternalPgsIterations = 4; world.integrationParameters.contact_natural_frequency = 60;
  if (pred) world.integrationParameters.normalizedPredictionDistance = pred;
  if (single) slab(world, 0, 40, 0, slope, flags);
  else if (overlap) for (let k = 0; k < 20; k++) slab2(world, k * 2, k * 2 + 2, slope, flags, overlap);
  else for (let k = 0; k < 20; k++) slab(world, k * 2, k * 2 + 2, -relief * k, slope, flags);
  const n = Math.hypot(1, slope);
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0.013, 0.08 * n - slope * 0.5, 0.5).setCcdEnabled(ccd).setCanSleep(false)
    .setLinvel(0, -slope * v0 / n, v0 / n).setAngvel({ x: v0 / 0.08, y: 0, z: 0 }));
  world.createCollider(RAPIER.ColliderDesc.ball(0.08).setDensity(2.5).setRestitution(0.55).setFriction(0.35), b);
  let maxUp = 0, maxPen = 0, kicks = 0, prevVn = 0;
  for (let i = 0; i < 280; i++) {
    world.step();
    const p = b.translation(), v = b.linvel();
    if (p.z > 39) break;
    const k = single ? 0 : Math.floor(p.z / 2);
    const h = (p.y - (-slope * p.z - relief * k)) / n - 0.08; // height above local surface
    const vn = (v.y + slope * v.z) / n; // velocity normal to slope
    maxUp = Math.max(maxUp, h); maxPen = Math.max(maxPen, -h);
    if (vn - prevVn > 1.0) kicks++;
    prevVn = vn;
  }
  return `maxHop ${maxUp.toFixed(4)} maxPen ${maxPen.toFixed(4)} kicks ${kicks} endSpeed ${Math.hypot(b.linvel().y, b.linvel().z).toFixed(1)}`;
}
const F = RAPIER.TriMeshFlags;
console.log('single slab         ', run({ single: true }));
console.log('seams relief 0      ', run({}));
console.log('seams relief 0 noFix', run({ flags: 0 }));
console.log('seams relief .006   ', run({ relief: 0.006 }));
console.log('seams relief .015   ', run({ relief: 0.015 }));
console.log('seams relief .03    ', run({ relief: 0.03 }));
console.log('seams r0 no ccd     ', run({ ccd: false }));
console.log('seams r0 pred .0005 ', run({ pred: 0.0005 }));
console.log('seams r.006 slow v4 ', run({ relief: 0.006, v0: 4 }));
console.log('seams r0 slow v4    ', run({ v0: 4 }));

for (const o of [0.01, 0.02, 0.03]) for (const v0 of [3, 8, 14, 20]) console.log('overlap', o, 'v0', v0, run({ overlap: o, v0 }));
for (const o of [0.004, 0.006]) for (const v0 of [3, 8, 14, 20]) console.log('overlap', o, 'v0', v0, run({ overlap: o, v0 }));
for (const r of [0.003, 0.006, 0.01]) for (const v0 of [3, 14]) console.log('relief', r, 'v0', v0, run({ relief: r, v0 }));
