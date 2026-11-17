import { PHYSICS, RACE, MARBLE, RUBBER } from './config.js';
import { createRng } from './rng.js';
import { createWorld, addRoomFloor } from './physics.js';
import { CourseContext } from './course/context.js';
import { buildCourse } from './course/course.js';
import { createMarbles, snapshot } from './marbles.js';

const MAX_SHOTS = 80; // the oldest shot marble goes when another is fired
// Smallest velocity change in one step that counts as a hit (units/s). Rolling
// through the tightest bends at top speed changes velocity by about 1 per step.
const IMPACT_MIN = 1.4;

// One race: world + course + marbles + ranking. No DOM or rendering in here,
// so it also runs headless (scripts/sim.mjs).
export class Race {
  constructor(RAPIER, seed, materials = null, layout = 'full') {
    this.RAPIER = RAPIER;
    this.seed = seed;
    this.world = createWorld(RAPIER);
    this.events = new RAPIER.EventQueue(true);
    addRoomFloor(RAPIER, this.world);
    this.course = new CourseContext(RAPIER, this.world, materials);
    buildCourse(this.course, layout);
    this.course.finalize(RACE.floorClearance);
    this.marbles = createMarbles(RAPIER, this.world, this.course.spawn, createRng(seed));
    this.byHandle = new Map(this.marbles.map((m) => [m.collider.handle, m]));
    this.time = 0;
    this.steps = 0;
    this.results = [];
    this.counters = {}; // sensor name -> set of marble indices that crossed it
    this.log = []; // { time, marble, type: 'nudge' | 'rescue', section }
    // Debug: marbles shot from the camera. Collider handle -> { body, color }.
    // They are not ranked, timed or rescued, and disappear on the room floor
    // or at the finish line.
    this.shots = new Map();
    this.impacts = null; // set to [] to collect hits for sound (see _impact)
  }

  // Shoot a marble from `pos` along the unit vector `dir` at `speed`.
  shoot(pos, dir, speed, color) {
    const R = this.RAPIER;
    if (this.shots.size >= MAX_SHOTS) this._removeShot(this.shots.values().next().value);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(dir.x * speed, dir.y * speed, dir.z * speed)
        .setLinearDamping(MARBLE.linearDamping)
        .setAngularDamping(MARBLE.angularDamping)
        .setCanSleep(false)
    );
    const collider = this.world.createCollider(
      R.ColliderDesc.ball(MARBLE.radius).setDensity(MARBLE.density)
        .setRestitution(MARBLE.restitution).setFriction(MARBLE.friction),
      body
    );
    const shot = { body, collider, color, gone: false };
    this.shots.set(collider.handle, shot);
    return shot;
  }

  _removeShot(shot) {
    this.shots.delete(shot.collider.handle);
    this.world.removeRigidBody(shot.body);
    shot.removed = true;
  }

  _updateShots() {
    for (const shot of [...this.shots.values()]) {
      const t = shot.body.translation();
      // Resting on (or below) the room floor, or far out of the room.
      if (shot.gone || t.y < MARBLE.radius * 1.5 || Math.abs(t.x) > 200 || Math.abs(t.z) > 200) this._removeShot(shot);
    }
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
      const shot = this.shots.get(h1) ?? this.shots.get(h2);
      if (shot) {
        if (name === 'finish') shot.gone = true;
        return;
      }
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
    if (this.shots.size) this._updateShots();
    if (this.impacts) {
      for (const m of this.marbles) this._impact(m, m.index);
      for (const s of this.shots.values()) this._impact(s, `shot${s.collider.handle}`);
    }
    for (const m of this.marbles) {
      snapshot(m);
      this._track(m);
      // Finished marbles only need contact for the rolling sound.
      if (!m.finished || this.impacts) this._touch(m);
      if (!m.finished) this._watchdog(m, this._zones(m));
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

  // Remember where on the centre line a marble last touched the course
  // (any course collider; other marbles do not count).
  _touch(m) {
    const course = this.course.body.handle;
    let touching = false;
    this.world.contactPairsWith(m.collider, (other) => {
      if (touching || other.parent()?.handle !== course) return;
      this.world.contactPair(m.collider, other, (manifold) => {
        for (let k = 0; k < manifold.numContacts(); k++) if (manifold.contactDist(k) < 0.01) touching = true;
      });
    });
    m.touching = touching;
    if (touching && !m.finished) m.lastTouch = m.pathIndex;
  }

  // For sound: a sudden change of velocity in one step (beyond what gravity
  // does) is a hit. Records { key, pos, strength, kind } in this.impacts,
  // kind being what it hit: 'marble', 'pad' (rubber) or 'track'. Leaves
  // the simulation untouched.
  _impact(obj, key) {
    const v = obj.body.linvel();
    const last = obj.lastVel;
    obj.lastVel = { x: v.x, y: v.y, z: v.z };
    if (!last) return;
    const dt = PHYSICS.timestep;
    const d = { x: v.x - last.x, y: v.y - last.y - PHYSICS.gravity * dt, z: v.z - last.z };
    const dv = Math.hypot(d.x, d.y, d.z);
    // Below: rolling through bends; above: a teleport by the safety net.
    if (dv < IMPACT_MIN || dv > 60) return;
    const t = obj.body.translation();
    let kind = 'track';
    this.world.contactPairsWith(obj.collider, (other) => {
      if (kind === 'marble') return;
      const body = other.parent();
      if (body?.isDynamic()) {
        // A marble touching this one, and the kick came from its side (in a
        // pack, marbles touch all the time while the hit was the track).
        const o = body.translation();
        const n = { x: t.x - o.x, y: t.y - o.y, z: t.z - o.z };
        const dist = Math.hypot(n.x, n.y, n.z);
        if (dist < MARBLE.radius * 2 + 0.01 && (n.x * d.x + n.y * d.y + n.z * d.z) / (dist * dv) > 0.7) kind = 'marble';
      } else if (other.restitution() >= RUBBER.restitution - 1e-6) kind = 'pad';
    });
    if (this.impacts.length < 200) this.impacts.push({ key, pos: { x: t.x, y: t.y, z: t.z }, strength: dv, kind });
  }

  // Zones (the valley): a marble that stays in one too long goes back to its
  // start; if that happens to it a second time, it goes past the zone.
  // Returns whether the marble is in a zone.
  _zones(m) {
    const z = this.course.zones.find((z) => m.progress >= z.s0 && m.progress < z.s1);
    if (!z) {
      m.zoneTime = 0;
      return false;
    }
    m.zoneTime += PHYSICS.timestep;
    if (m.zoneTime < z.seconds) return true;
    const tries = (m.zoneTries[z.name] = (m.zoneTries[z.name] ?? 0) + 1);
    this._place(m, tries === 1 ? z.restart : z.skip);
    m.zoneTime = 0;
    const p = this.course.path[m.pathIndex];
    this.log.push({ time: this.time, marble: m.name, type: tries === 1 ? 'back to start' : 'skipped', section: p.section, s: p.s });
    return true;
  }

  // Last-resort safety net: nudge a marble that has not moved for a while,
  // and put it back on the track if it fell off the course or nudging failed.
  // In a zone only the fall check applies; the zone's own timer does the rest.
  _watchdog(m, inZone = false) {
    const c = m.curr;
    if (c.y < MARBLE.radius * 2.5) return this._rescue(m, 'fell');
    const a = m.anchor;
    if (inZone) {
      a.x = c.x; a.y = c.y; a.z = c.z;
      m.anchorTime = this.time;
      return;
    }
    const moved = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    if (moved > RACE.stuckDistance) {
      a.x = c.x; a.y = c.y; a.z = c.z;
      m.anchorTime = this.time;
      return;
    }
    if (this.time - m.anchorTime < RACE.stuckSeconds) return;
    m.anchorTime = this.time;
    if (m.nudges >= RACE.nudgesBeforeRescue) return this._rescue(m, 'stuck');
    m.nudges++;
    const p = this.course.path[m.pathIndex];
    const k = m.body.mass() * 3;
    m.body.applyImpulse({ x: p.tangent.x * k, y: k * 0.6, z: p.tangent.z * k }, true);
    this.log.push({ time: this.time, marble: m.name, type: 'nudge', section: p.section });
  }

  // Puts a marble back on the centre line, only ever on a point with track
  // floor under it that faces up (never over a hole, mid-jump or on the
  // ceiling of the loop).
  //  fell:  a little behind where it last touched the track. If it keeps
  //         falling at the same spot, past that spot instead.
  //  stuck: a little ahead of where it is, past whatever holds it.
  _rescue(m, why) {
    const path = this.course.path;
    const cap = this.course.finishIndex - 8; // never drop a marble past the finish line
    const safe = (i) => path[i].solid && path[i].up.y > 0.6; // up to ~53 deg slope
    const ahead = (from, dist) => {
      let i = from;
      while (i < cap && (path[i].s < path[from].s + dist || !safe(i))) i++;
      return Math.min(i, cap);
    };
    let i;
    if (why === 'fell') {
      const from = m.lastTouch ?? m.pathIndex;
      if (m.fallSpot !== null && Math.abs(path[from].s - path[m.fallSpot].s) < 1) m.fallsHere++;
      else { m.fallSpot = from; m.fallsHere = 1; }
      if (m.fallsHere <= RACE.fallsBeforeSkip) {
        i = from;
        while (i > 0 && (path[i].s > path[from].s - RACE.rescueBack || !safe(i))) i--;
        if (!safe(i)) i = ahead(from, 0);
      } else {
        i = ahead(from, 0.5);
      }
    } else {
      i = ahead(m.pathIndex, 0.5 + m.rescues * 0.5);
    }
    this._place(m, i);
    m.rescues++;
    const p = path[i];
    this.log.push({ time: this.time, marble: m.name, type: 'rescue', why, section: p.section, s: p.s });
  }

  // Put a marble at rest just above centre-line point i.
  _place(m, i) {
    const p = this.course.path[i];
    const pos = p.pos.clone().addScaledVector(p.up, MARBLE.radius * 2.5);
    m.body.setTranslation(pos, true);
    m.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    m.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    m.pathIndex = i;
    m.progress = p.s;
    m.lastTouch = i;
    m.nudges = 0;
    m.anchor = { x: pos.x, y: pos.y, z: pos.z };
    m.anchorTime = this.time;
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
