import { MARBLE, COLORS } from './config.js';

// Creates the marble rigid bodies. Rendering attaches meshes separately.
export function createMarbles(RAPIER, world, spawnPoints, rng) {
  const slots = rng.shuffle(spawnPoints.map((_, i) => i));
  const marbles = [];
  for (let i = 0; i < MARBLE.count; i++) {
    const p = spawnPoints[slots[i]];
    const j = MARBLE.radius * 0.35;
    const x = p.x + rng.range(-j, j);
    const z = p.z + rng.range(-j, j);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, p.y, z)
        .setCcdEnabled(MARBLE.ccd)
        .setLinearDamping(MARBLE.linearDamping)
        .setAngularDamping(MARBLE.angularDamping)
        .setCanSleep(false)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(MARBLE.radius)
        .setDensity(MARBLE.density)
        .setRestitution(MARBLE.restitution)
        .setFriction(MARBLE.friction),
      body
    );
    const t = body.translation();
    const r = body.rotation();
    marbles.push({
      index: i,
      name: COLORS[i].name,
      color: COLORS[i].hex,
      body,
      collider,
      prev: { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w },
      curr: { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w },
      pathIndex: 0,
      progress: 0,
      maxProgress: 0,
      finished: false,
      finishTime: null,
      place: null,
      // watchdog state
      anchor: { x: t.x, y: t.y, z: t.z },
      anchorTime: 0,
      nudges: 0,
      rescues: 0,
      lastTouch: null, // path index where it last touched the course
      fallSpot: null, // path index of its last fall, and how often it fell there
      fallsHere: 0,
    });
  }
  return marbles;
}

export function snapshot(m) {
  const t = m.body.translation();
  const r = m.body.rotation();
  const p = m.prev;
  m.prev = m.curr;
  p.x = t.x; p.y = t.y; p.z = t.z;
  p.qx = r.x; p.qy = r.y; p.qz = r.z; p.qw = r.w;
  m.curr = p;
}
