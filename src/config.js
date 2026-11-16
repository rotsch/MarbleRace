// All tunable numbers live here.

// World is modelled at 10x real marble scale for numerical stability:
// a real 16 mm marble (radius 0.008 m) becomes radius 0.08 world units,
// and gravity is scaled by the same factor so motion looks real-size.
export const WORLD_SCALE = 10;

export const PHYSICS = {
  gravity: -9.81 * WORLD_SCALE,
  timestep: 1 / 120,
  maxSubsteps: 8, // per rendered frame, avoids the spiral of death
  maxFrameTime: 0.1,
};

export const MARBLE = {
  count: 8,
  radius: 0.008 * WORLD_SCALE,
  density: 2.5,
  restitution: 0.55,
  friction: 0.35,
  angularDamping: 0.08, // stands in for rolling resistance
  linearDamping: 0.0,
  ccd: true,
};

export const TRACK = {
  width: 0.6, // inner width between rails
  railHeight: 0.2,
  railThickness: 0.04,
  floorThickness: 0.04,
  friction: 0.35,
  restitution: 0.45,
  step: 0.06, // sampling distance along swept tracks
};

export const BOUNCY = {
  restitution: 1.22, // > 1 so pads add energy and lift marbles to a higher track
  friction: 0.05,
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
