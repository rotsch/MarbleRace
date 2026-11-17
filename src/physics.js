import { PHYSICS } from './config.js';

// Rapier 0.19's loader triggers a harmless wasm-bindgen deprecation warning
// on init; keep the console clean by filtering just that message.
export async function initPhysics(RAPIER) {
  const warn = console.warn;
  console.warn = (...args) => {
    if (!String(args[0]).includes('deprecated parameters for the initialization function')) warn(...args);
  };
  try {
    await RAPIER.init();
  } finally {
    console.warn = warn;
  }
}

export function createWorld(RAPIER) {
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
  world.timestep = PHYSICS.timestep;
  world.integrationParameters.numSolverIterations = PHYSICS.solverIterations;
  world.integrationParameters.numInternalPgsIterations = PHYSICS.pgsIterations;
  world.integrationParameters.contact_natural_frequency = PHYSICS.contactFrequency;
  return world;
}

// Room floor as a thick static slab whose top is at y = 0.
export function addRoomFloor(RAPIER, world, halfSize = 200) {
  const desc = RAPIER.ColliderDesc.cuboid(halfSize, 1, halfSize)
    .setTranslation(0, -1, 0)
    .setFriction(0.5)
    .setRestitution(0.4);
  return world.createCollider(desc);
}

// Fixed-timestep accumulator, decoupled from the render frame rate.
export class FixedStepper {
  constructor() {
    this.accumulator = 0;
  }

  // Advances by frameDt * speed in fixed steps. Returns the interpolation
  // factor (0..1) between the previous and the current physics state.
  advance(frameDt, speed, stepFn) {
    const dt = PHYSICS.timestep;
    this.accumulator += Math.min(frameDt, PHYSICS.maxFrameTime) * speed;
    let steps = 0;
    while (this.accumulator >= dt && steps < PHYSICS.maxSubsteps) {
      stepFn(dt);
      this.accumulator -= dt;
      steps++;
    }
    // Still behind after the cap: drop the backlog instead of spiralling.
    if (this.accumulator >= dt) this.accumulator = 0;
    return this.accumulator / dt;
  }
}
