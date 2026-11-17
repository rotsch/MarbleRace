import { MARBLE, TRACK, RUBBER, WORLD_SCALE } from './config.js';

// Physics values the player can change in the UI. Each one edits the shared
// config objects; a restart then builds the course and marbles with them.
// Sizes are shown at real scale (the world is 10x real, see config.js).
export const TUNABLES = [
  {
    id: 'size', label: 'Marble size', min: 10, max: 22, step: 1,
    get: () => (MARBLE.radius * 2 * 1000) / WORLD_SCALE,
    set: (v) => (MARBLE.radius = (v / 2 / 1000) * WORLD_SCALE),
    fmt: (v) => `${v.toFixed(0)} mm`,
  },
  {
    id: 'marbleBounce', label: 'Marble bounciness', min: 0, max: 1, step: 0.05,
    get: () => MARBLE.restitution, set: (v) => (MARBLE.restitution = v), fmt: (v) => v.toFixed(2),
  },
  {
    id: 'marbleGrip', label: 'Marble grip', min: 0, max: 1, step: 0.05,
    get: () => MARBLE.friction, set: (v) => (MARBLE.friction = v), fmt: (v) => v.toFixed(2),
  },
  {
    id: 'rolling', label: 'Rolling resistance', min: 0, max: 0.5, step: 0.01,
    get: () => MARBLE.angularDamping, set: (v) => (MARBLE.angularDamping = v), fmt: (v) => v.toFixed(2),
  },
  {
    id: 'trackBounce', label: 'Track bounciness', min: 0, max: 1, step: 0.05,
    get: () => TRACK.restitution, set: (v) => (TRACK.restitution = v), fmt: (v) => v.toFixed(2),
  },
  {
    id: 'trackGrip', label: 'Track grip', min: 0, max: 1, step: 0.05,
    get: () => TRACK.friction, set: (v) => (TRACK.friction = v), fmt: (v) => v.toFixed(2),
  },
  {
    id: 'padBounce', label: 'Rubber pad bounciness', min: 0, max: 1, step: 0.05,
    get: () => RUBBER.restitution, set: (v) => (RUBBER.restitution = v), fmt: (v) => v.toFixed(2),
  },
];

export const DEFAULTS = Object.fromEntries(TUNABLES.map((t) => [t.id, t.get()]));

const KEY = 'marble-race-physics';

export function applyValues(values) {
  for (const t of TUNABLES) {
    const v = Number(values[t.id]);
    if (Number.isFinite(v)) t.set(Math.min(t.max, Math.max(t.min, v)));
  }
}

export function currentValues() {
  return Object.fromEntries(TUNABLES.map((t) => [t.id, t.get()]));
}

// Remembered per browser; a missing or blocked storage just means defaults.
export function loadStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) applyValues(JSON.parse(raw));
  } catch {
    /* ignore */
  }
}

export function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(currentValues()));
  } catch {
    /* ignore */
  }
}
