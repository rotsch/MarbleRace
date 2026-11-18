import { MARBLE, COLORS } from './config.js';

// The racers when nobody chose any: the first `count` plain colours.
export function defaultEntries(count = MARBLE.count) {
  return COLORS.slice(0, count).map((c) => ({ name: c.name, color: c.hex, design: null }));
}

// Creates the marble rigid bodies, one per entry ({ name, color, design };
// design is the painted look, see designs.js, and only matters for
// rendering). Rendering attaches meshes separately.
export function createMarbles(RAPIER, world, spawnPoints, rng, entries = defaultEntries()) {
  const slots = rng.shuffle(spawnPoints.map((_, i) => i));
  const marbles = [];
  for (let i = 0; i < entries.length; i++) {
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
      name: entries[i].name,
      color: entries[i].color, // for dots in the UI
      design: entries[i].design ?? null,
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
      zoneTime: 0, // seconds spent in the current zone (see CourseContext.addZone)
      zoneTries: {}, // zone name -> how often it was sent back from there
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
