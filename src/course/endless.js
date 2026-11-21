import { Vector3 } from 'three';
import { appendPiece, TYPES } from './pieces.js';
import { deg } from './frame.js';
import { createRng } from '../rng.js';

// Endless mode: a timed race on a course that builds itself while it is
// raced. Random pieces (no rules: any type may follow any other) are added
// at the end of the track and old ones go once every marble has left them,
// so only about WINDOW pieces exist at a time. When the track already laid
// ahead of the leader is about as long as the leader will roll in the time
// left, the finish comes next. Because the course only ever goes down, the
// whole world is shifted back to the origin now and then (rebase), so
// coordinates stay small for the physics.
//
// No DOM in here (it runs headless in scripts/sim.mjs). What the view needs
// to animate goes into `events`:
//   { type: 'spawn', ids }      pieces just built (drop them in)
//   { type: 'despawn', ids }    pieces just taken out (fade them out)
//   { type: 'rebase', offset }  everything moved by offset (Vector3)

export const WINDOW = 20; // pieces on screen
const MAX_LIVE = 45; // more than this: stragglers are moved up
const KEEP_BEHIND = 5; // units kept behind the last marble
const REBASE_DIST = 60; // units from the origin before shifting back
const TRIES = 6; // random picks before falling back to a plain drop
const INTRO_GAP = 0.15; // seconds between pieces dropping in on the start screen
const PAST = 1; // units every marble must be past a piece before it goes
// Units per second the leader is expected to cover along the course until
// there is a measurement (the first RATE_AFTER seconds). Measured over many
// endless races: 5 to 6.5.
const START_RATE = 6;
const RATE_AFTER = 10;
const EARLY = 10; // units from the start without a bottleneck

// Rough half-width of each type's footprint around its centre line, for the
// overlap check. Narrow track is 0.3 + rails.
const REACH = {
  pegField: 1.2, bumpers: 1.3, funnel: 1.6, halfPipe: 1.2, splitter: 1.0, splitter3: 1.8,
  bigJump: 1.5, wallRide: 0.9, fork: 0.7, merge: 0.7, finish: 1.2, chicane: 0.9,
  railRun: 0.6, dropCatch: 0.8, spiral: 0.6, start: 0.6,
};
const reach = (type) => REACH[type] ?? 0.45;
const CLEAR = 0.3; // gap between footprints
const CLEAR_Y = 1.0; // track this far above or below another never clashes

// Random options per type. Everything else uses the type's defaults.
const sign = (rng) => (rng.next() < 0.5 ? -1 : 1);
const RANDOM_OPTS = {
  straight: (r) => ({ len: r.range(1.2, 3), pitch: deg(-r.range(4, 12)) }),
  stairs: (r) => ({ steps: 3 + Math.floor(r.next() * 5) }),
  railRun: (r) => ({ len: r.range(2, 4) }),
  curve: (r) => ({ radius: r.range(1, 2), angle: sign(r) * deg(r.range(40, 120)), pitch: deg(-r.range(3, 6)) }),
  winding: (r) => {
    const s = sign(r);
    return { bends: Array.from({ length: 3 + Math.floor(r.next() * 3) }, (_, i) => [r.range(1.4, 1.8), (i % 2 ? -1 : 1) * s * r.range(60, 120)]) };
  },
  // Any piece may come before it, fast ones too: a taller wall and a gentler
  // run-in, or fast marbles fly over the top.
  wallRide: (r) => ({ angle: sign(r) * deg(r.range(120, 180)), height: 1.4, leadPitch: deg(-10) }),
  chicane: (r) => ({ side: sign(r) }),
  funnel: (r) => ({ side: sign(r), exitTurn: deg(r.range(-90, 90)) }),
  spiral: (r) => ({ side: sign(r), turns: 1 + Math.floor(r.next() * 7) * 0.25 }),
  corkscrew: (r) => ({ side: sign(r) }),
  halfPipe: (r) => ({ side: sign(r) }),
  tunnelDrop: (r) => ({ exitTurn: deg(r.range(-60, 60)) }),
  bottleneck: (r) => ({ side: sign(r) }),
  bigJump: (r) => ({ side: sign(r) }),
  splitter: (r) => ({ side: sign(r) }),
};
// Every type except the start and the finish (the fork comes with its merge).
const POOL = Object.keys(TYPES).filter((t) => t !== 'start' && t !== 'finish' && t !== 'merge');

export class Endless {
  // duration: seconds the race should last.
  constructor(race, { duration = 300, seed = '1' } = {}) {
    this.race = race;
    this.course = race.course;
    this.duration = duration;
    this.rng = createRng(`endless:${seed}`);
    this.events = [];
    this.units = []; // live units, oldest first: { ids, sMax, path0 }
    this.unitOf = new Map(); // piece id -> unit
    this.links = [];
    this.count = 0; // pieces made, for ids
    this.done = false; // the finish is built
    this.introTimer = 0;
    this.stats = { units: 0, rebases: 0, fallbacks: 0, maxLive: 0, retries: 0 };
    // The start and a run-in are there at once; the rest drops in.
    this.next = { pos: new Vector3(0, 0, 0), yaw: 0, pitch: deg(-8), from: null };
    this._addUnit([{ type: 'start', opts: { len: 2.6 } }], false);
    this._addUnit([{ type: 'straight', opts: { len: 1.5, pitch: deg(-6) } }], false);
    this.events.length = 0;
  }

  get finishDue() {
    if (this.done) return false;
    const race = this.race, lead = race.leader();
    if (!lead) return false;
    const left = this.duration - race.time;
    if (left <= 0) return true;
    const rate = race.time > RATE_AFTER ? lead.progress / race.time : START_RATE;
    return this._lastS() - lead.progress >= rate * left;
  }

  // For the progress line: `before` the start is gone, `after` the finish
  // is not built yet.
  get openEnds() {
    return { before: !!this.units[0] && this.units[0].path0 > 0, after: !this.done };
  }

  _lastS() {
    const c = this.course;
    const last = c.pieces.get(this.next.from)?.lastPath;
    return last != null ? c.path[last].s : 0;
  }

  // Real-time tick (also while the race waits on the start line): the
  // opening window drops in piece by piece.
  tick(dt) {
    if (this.race.time > 0 || this.done || this.units.length >= WINDOW) return;
    this.introTimer -= dt;
    if (this.introTimer > 0) return;
    this.introTimer = INTRO_GAP;
    this.spawn();
  }

  // Build the whole opening window at once (headless).
  fill() {
    while (!this.done && this.units.length < WINDOW) this.spawn();
    this.events.length = 0;
  }

  // After every physics step: keep WINDOW / 2 units ahead of the leader,
  // drop what everyone has left behind, and rebase when far out.
  update() {
    const race = this.race;
    const lead = race.leader();
    if (!lead) return;
    if (!this.done) {
      const at = this._unitIndex(lead);
      if (this.units.length - 1 - at < WINDOW / 2 || this.finishDue) this.spawn();
    }
    this._despawn();
    const c = lead.curr;
    if (c.x * c.x + c.y * c.y + c.z * c.z > REBASE_DIST * REBASE_DIST) this._rebase(lead);
  }

  _unitIndex(m) {
    const u = this.unitOf.get(this.course.path[m.pathIndex]?.piece);
    return u ? this.units.indexOf(u) : 0;
  }

  // Add the next unit: the finish when due, otherwise a random one that
  // does not cross the live track (or, after TRIES, a plain steep drop).
  spawn() {
    if (this.done) return;
    if (this.finishDue) {
      this._addUnit([{ type: 'finish', opts: {} }]);
      this.done = true;
      return;
    }
    for (let t = 0; t < TRIES; t++) {
      if (this._addUnit(this._pick(), true)) return;
      this.stats.retries++;
    }
    this.stats.fallbacks++;
    // Not much steeper than this: whatever comes next must cope with the speed.
    this._addUnit([{ type: 'straight', opts: { len: 3, pitch: deg(-18) } }]);
  }

  _pick() {
    let type = POOL[Math.floor(this.rng.next() * POOL.length)];
    // The bottleneck lets one marble through at a time: while the pack is
    // still bunched up from the start it would hold everyone up for long.
    while (type === 'bottleneck' && this.stats.units < EARLY) type = POOL[Math.floor(this.rng.next() * POOL.length)];
    if (type === 'fork') {
      // Two equal routes out of the fork into a merge, as in the default course.
      const route = { len: 1.6, pitch: deg(-5) };
      return [
        { type: 'fork', opts: {} },
        { type: 'straight', opts: route, name: 'Left route', from: [0, 0] },
        { type: 'straight', opts: route, name: 'Right route', from: [0, 1] },
        { type: 'merge', opts: {}, from: [1, 0], in1: 2 },
      ];
    }
    return [{ type, opts: RANDOM_OPTS[type]?.(this.rng) ?? {} }];
  }

  // Build a unit's pieces. With `check`, undo it and return false when it
  // comes too close to live track.
  _addUnit(plan, check = false) {
    const c = this.course;
    const path0 = c.path.length;
    const built = []; // [{ id, exits }]
    const links = [];
    for (const [k, step] of plan.entries()) {
      const id = `e${++this.count}`;
      const piece = { id, type: step.type, name: step.name ?? TYPES[step.type].label, opts: step.opts };
      let entry, upId, out;
      if (step.from) {
        const src = built[step.from[0]];
        entry = src.exits[step.from[1]];
        upId = src.id;
        out = step.from[1];
      } else if (k === 0) {
        entry = this.next;
        upId = this.next.from;
        out = 0;
      }
      const exits = appendPiece(c, piece, entry, upId);
      if (upId) links.push({ from: [upId, out], to: [id, 0] });
      if (step.in1 != null) links.push({ from: [built[step.in1].id, 0], to: [id, 1] });
      built.push({ id, exits });
    }
    const ids = built.map((b) => b.id);
    if (check && this._clashes(ids)) {
      for (const id of ids.reverse()) c.undoLastPiece(id);
      return false;
    }
    this.links.push(...links);
    c.setLinks(this.links);
    c.fillTangents(path0);
    let sMax = 0;
    for (let i = path0; i < c.path.length; i++) sMax = Math.max(sMax, c.path[i].s);
    const unit = { ids, sMax, path0 };
    this.units.push(unit);
    for (const id of ids) this.unitOf.set(id, unit);
    const last = built[built.length - 1];
    if (last.exits.length) {
      const e = last.exits[0];
      this.next = { pos: e.pos.clone(), yaw: e.yaw, pitch: e.pitch ?? 0, from: last.id };
    }
    this.stats.units++;
    this.stats.maxLive = Math.max(this.stats.maxLive, this.units.length);
    this.events.push({ type: 'spawn', ids });
    return true;
  }

  // Too close to live track: any centre-line point of the new pieces within
  // both footprints of a point on another live piece (and less than CLEAR_Y
  // above or below it). Near the seam the piece it joins does not count.
  _clashes(ids) {
    const c = this.course;
    const fresh = ids.map((id) => c.pieces.get(id));
    const prevId = this.next.from;
    const seam = c.pieces.get(prevId);
    const seamPos = seam?.outs[0]?.pos ?? this.next.pos;
    const others = [];
    for (const u of this.units) {
      for (const id of u.ids) {
        const p = c.pieces.get(id);
        if (p && !p.removed) others.push(p);
      }
    }
    for (const p of fresh) {
      const rp = reach(p.type);
      for (let i = p.path0; i < p.path1; i += 2) {
        const a = c.path[i].pos;
        const nearSeam = a.distanceTo(seamPos) < 2.5;
        for (const q of others) {
          if (nearSeam && q.id === prevId) continue;
          const lim = rp + reach(q.type) + CLEAR;
          const b = q.bounds;
          if (a.x < b.min.x - lim || a.x > b.max.x + lim || a.z < b.min.z - lim || a.z > b.max.z + lim) continue;
          if (a.y < b.min.y - CLEAR_Y - 1 || a.y > b.max.y + CLEAR_Y + 1) continue;
          for (let j = q.path0; j < q.path1; j += 2) {
            const o = c.path[j].pos;
            if (Math.abs(o.y - a.y) >= CLEAR_Y) continue;
            const dx = o.x - a.x, dz = o.z - a.z;
            if (dx * dx + dz * dz < lim * lim) {
              if (q.id === prevId && o.distanceTo(seamPos) < 2.5) continue;
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // Take out the oldest unit once every marble still racing is KEEP_BEHIND
  // units past it. With too many units live, marbles still on the oldest
  // are moved up instead.
  _despawn() {
    const race = this.race;
    if (race.time <= 0 || this.units.length < 3) return;
    const u = this.units[0];
    const racing = race.marbles.filter((m) => !m.finished);
    const past = (m) => this._unitIndex(m) > 0 && m.progress > u.sMax + PAST;
    const far = (m) => this._unitIndex(m) >= KEEP_BEHIND;
    if (!racing.every((m) => past(m) && far(m))) {
      if (this.units.length <= MAX_LIVE) return;
      for (const m of racing) if (!past(m)) race.moveUp(m, this._firstSolid(this.units[1]));
    }
    this.units.shift();
    for (const id of u.ids) {
      this.course.removePiece(id);
      this.unitOf.delete(id);
    }
    this.course.liveFrom = this.units[0].path0;
    this.events.push({ type: 'despawn', ids: u.ids });
  }

  _firstSolid(unit) {
    const path = this.course.path;
    for (let i = unit.path0; i < path.length; i++) if (path[i].solid && path[i].up.y > 0.6) return i;
    return unit.path0;
  }

  // Move everything so the leader's unit starts at the origin.
  _rebase(lead) {
    const c = this.course;
    const unit = this.unitOf.get(c.path[lead.pathIndex]?.piece) ?? this.units[0];
    const p = c.path[unit.path0].pos;
    const offset = new Vector3(-p.x, -p.y, -p.z);
    c.shift(offset);
    this.next.pos.add(offset);
    this.race.shiftBodies(offset);
    this.stats.rebases++;
    this.events.push({ type: 'rebase', offset });
  }
}
