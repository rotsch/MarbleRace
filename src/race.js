import { PHYSICS, RACE, MARBLE } from './config.js';
import { createRng } from './rng.js';
import { createWorld, addRoomFloor } from './physics.js';
import { CourseContext } from './course/context.js';
import { buildCourse } from './course/course.js';
import { createMarbles, snapshot } from './marbles.js';

// One race: world + course + marbles + ranking. No DOM or rendering in here,
// so it also runs headless (scripts/sim.mjs).
export class Race {
  constructor(RAPIER, seed, materials = null) {
    this.RAPIER = RAPIER;
    this.seed = seed;
    this.world = createWorld(RAPIER);
    this.events = new RAPIER.EventQueue(true);
    addRoomFloor(RAPIER, this.world);
    this.course = new CourseContext(RAPIER, this.world, materials);
    buildCourse(this.course);
    this.course.finalize(RACE.floorClearance);
    this.marbles = createMarbles(RAPIER, this.world, this.course.spawn, createRng(seed));
    this.byHandle = new Map(this.marbles.map((m) => [m.collider.handle, m]));
    this.time = 0;
    this.steps = 0;
    this.results = [];
    this.counters = {}; // sensor name -> set of marble indices that crossed it
    this.log = []; // { time, marble, type: 'nudge' | 'rescue', section }
  }

  get finished() {
    return this.results.length === this.marbles.length;
  }

  step() {
    this.world.step(this.events);
    this.time += PHYSICS.timestep;
    this.steps++;
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const sensors = this.course.sensors;
      const name = sensors.get(h1) ?? sensors.get(h2);
      const m = this.byHandle.get(h1) ?? this.byHandle.get(h2);
      if (!name || !m) return;
      if (name === 'finish') {
        if (m.finished) return;
        m.finished = true;
        m.finishTime = this.time;
        m.place = this.results.length + 1;
        this.results.push(m);
      } else {
        const seen = (this.counters[name] ??= new Set());
        seen.add(m.index);
      }
    });
    for (const m of this.marbles) {
      snapshot(m);
      this._track(m);
      if (!m.finished) this._watchdog(m);
    }
  }

  // Nearest centre-line point, searched in a window around the last one.
  _track(m) {
    const path = this.course.path;
    const c = m.curr;
    const d2 = (i) => {
      const p = path[i].pos;
      return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
    };
    let best = m.pathIndex, bestD = d2(best);
    const lo = Math.max(0, m.pathIndex - 30), hi = Math.min(path.length - 1, m.pathIndex + 90);
    for (let i = lo; i <= hi; i++) {
      const d = d2(i);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > 9 && this.steps % 30 === 0) {
      for (let i = 0; i < path.length; i += 2) {
        const d = d2(i);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    m.pathIndex = best;
    m.progress = path[best].s;
    if (m.progress > m.maxProgress) m.maxProgress = m.progress;
  }

  // Last-resort safety net: nudge a marble that has not moved for a while,
  // and put it back on the track if it left the course or nudging failed.
  _watchdog(m) {
    const c = m.curr;
    if (c.y < MARBLE.radius * 2.5) return this._rescue(m);
    const a = m.anchor;
    const moved = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    if (moved > RACE.stuckDistance) {
      a.x = c.x; a.y = c.y; a.z = c.z;
      m.anchorTime = this.time;
      return;
    }
    if (this.time - m.anchorTime < RACE.stuckSeconds) return;
    m.anchorTime = this.time;
    if (m.nudges >= RACE.nudgesBeforeRescue) return this._rescue(m);
    m.nudges++;
    const p = this.course.path[m.pathIndex];
    const k = m.body.mass() * 3;
    m.body.applyImpulse({ x: p.tangent.x * k, y: k * 0.6, z: p.tangent.z * k }, true);
    this.log.push({ time: this.time, marble: m.name, type: 'nudge', section: p.section });
  }

  _rescue(m) {
    const path = this.course.path;
    // Each rescue places the marble a little further along, so it cannot loop.
    let i = m.pathIndex;
    const target = Math.max(m.progress, m.maxProgress - 1) + 0.5 + m.rescues * 0.5;
    const cap = this.course.finishIndex - 8; // never drop a marble past the finish line
    while (i < cap && path[i].s < target) i++;
    i = Math.min(i, cap);
    const p = path[i];
    const pos = p.pos.clone().addScaledVector(p.up, MARBLE.radius * 2.5);
    m.body.setTranslation(pos, true);
    m.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    m.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    m.pathIndex = i;
    m.nudges = 0;
    m.rescues++;
    m.anchor = { x: pos.x, y: pos.y, z: pos.z };
    m.anchorTime = this.time;
    this.log.push({ time: this.time, marble: m.name, type: 'rescue', section: p.section, s: p.s });
  }

  // Finished marbles first (by place), then by progress along the course.
  ranking() {
    return [...this.marbles].sort((a, b) => {
      if (a.finished || b.finished) {
        if (a.finished && b.finished) return a.place - b.place;
        return a.finished ? -1 : 1;
      }
      return b.progress - a.progress;
    });
  }

  leader() {
    let best = null;
    for (const m of this.marbles) if (!m.finished && (!best || m.progress > best.progress)) best = m;
    return best;
  }

  dispose() {
    this.events.free();
    this.world.free();
  }
}
