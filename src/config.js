// All tunable numbers live here.

// World is modelled at 10x real marble scale for numerical stability:
// a real 16 mm marble (radius 0.008 m) becomes radius 0.08 world units,
// and gravity is scaled by the same factor so motion looks real-size.
export const WORLD_SCALE = 10;

export const PHYSICS = {
  gravity: -9.81 * WORLD_SCALE,
  // Small enough that a marble moves less than its radius per step even at
  // 30 units/s, so it cannot pass through the track without CCD (see below).
  timestep: 1 / 480,
  maxSubsteps: 48, // per rendered frame, avoids the spiral of death
  maxFrameTime: 0.1,
  // Solver settings chosen from measurements (see README, "Physics notes"):
  // with more than one solver substep Rapier lets a fast-spinning ball sink
  // into the surface it rolls on, so use one substep and a few PGS sweeps.
  solverIterations: 1,
  pgsIterations: 4,
};

export const MARBLE = {
  count: 8,
  radius: 0.008 * WORLD_SCALE,
  density: 2.5,
  restitution: 0.55,
  friction: 0.35,
  angularDamping: 0.08, // stands in for rolling resistance
  linearDamping: 0.0,
  // No CCD: on trimesh tracks Rapier's CCD halts a rolling marble at internal
  // triangle edges while its velocity keeps growing, which invents energy
  // (marbles shot into the loop at 2.4x the energy physics allows). The small
  // timestep keeps marbles from tunnelling instead. See README.
  ccd: false,
};

export const TRACK = {
  width: 0.6, // inner width between rails
  railHeight: 0.26,
  railThickness: 0.04,
  floorThickness: 0.04,
  friction: 0.35,
  restitution: 0.45,
  step: 0.06, // sampling distance along swept tracks
};

// Every surface uses TRACK, except the bouncy pad, which is rubber. All
// contacts combine the two surfaces' values the same way (Rapier's default
// average), so a marble behaves the same wherever it is; only what it touches
// differs.
export const RUBBER = {
  restitution: 0.85,
  friction: 0.8,
};

export const RACE = {
  floorClearance: 1.2, // height of the lowest course point above the room floor
  stuckSeconds: 3.5, // watchdog: no movement for this long counts as stuck
  stuckDistance: 0.12,
  nudgesBeforeRescue: 2,
};

export const COLORS = [
  { name: 'Red', hex: 0xe53935 },
  { name: 'Orange', hex: 0xfb8c00 },
  { name: 'Yellow', hex: 0xfdd835 },
  { name: 'Green', hex: 0x43a047 },
  { name: 'Cyan', hex: 0x00acc1 },
  { name: 'Blue', hex: 0x1e63e9 },
  { name: 'Purple', hex: 0x8e24aa },
  { name: 'Pink', hex: 0xec5fa4 },
];
