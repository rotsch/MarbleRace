import {
  Group, Mesh, LineSegments, EdgesGeometry, BoxGeometry, CylinderGeometry, Vector3, Quaternion,
  MeshStandardMaterial, DoubleSide, BufferAttribute,
} from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { TRACK } from '../config.js';
import { frameQuat, framePoint } from './frame.js';

// Everything a section needs to add itself to the course. Colliders are always
// created; meshes and outlines only when `materials` is given (browser), so the
// same course code runs headless for testing.
export class CourseContext {
  constructor(RAPIER, world, materials = null) {
    this.RAPIER = RAPIER;
    this.world = world;
    this.materials = materials;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.group = materials ? new Group() : null;
    this.path = []; // centre line: { pos, up, tangent, s, section, solid }
    this.sections = []; // { name, s0 }
    this.sectionName = 'start';
    this.cameraHint = null; // applied to path points recorded while set
    this.minY = Infinity;
    this.bounds = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
    this.sensors = new Map(); // collider handle -> name
    this.cameraHints = [];
    this.zones = []; // see addZone
    this.spawn = null;
    this.marbleCount = 8; // racers the start grid makes room for (set by Race)
    // Placed pieces (see pieces.js): id -> { id, type, name, group, entry,
    // ins, outs, path0, path1 }. Sockets: { pieceId, kind, index, pos, yaw, pitch, up }.
    this.pieces = new Map();
    this.piece = null; // piece being built
    this.pathFrom = null; // path index the next point carries on from (see addPathPoint)
    this.lift = 0; // how far finalize() raised the course
  }

  // Start building a piece: its meshes go into a group of their own and its
  // entry is socket in 0 (unless the piece type has no input).
  beginPiece(piece, entry, type = {}) {
    const n = this.path.length;
    const p = {
      id: piece.id, type: piece.type, name: piece.name, group: null, entry, ins: [], outs: [], path0: n, path1: n,
      // Shape stops (see trackBuilder.js), sorted, and how far the main
      // route has got; samples: wall positions along it, for the editor.
      shape: (piece.shape ?? []).slice().sort((a, b) => a.d - b.d), mainD: 0, samples: [],
    };
    if (this.group) {
      p.group = new Group();
      p.group.userData.pieceId = piece.id;
      this.group.add(p.group);
    }
    this.pieces.set(piece.id, p);
    this.piece = p;
    if (!type.noInput) this.addSocket('in', entry);
    p.pathFrom = this.pathFrom;
  }

  endPiece(exits) {
    const p = this.piece;
    exits.forEach((f) => this.addSocket('out', f));
    p.path1 = this.path.length;
    // Last centre-line point of the route through this piece (or, for a piece
    // without one, the point it carried on from).
    p.lastPath = p.path1 > p.path0 ? p.path1 - 1 : p.pathFrom;
    this.piece = null;
    this.pathFrom = null;
  }

  // Links between built pieces (from pieces.js): piece id -> ids after / before.
  setLinks(links) {
    for (const p of this.pieces.values()) {
      p.next = [];
      p.prev = [];
    }
    for (const l of links) {
      const a = this.pieces.get(l.from[0]), b = this.pieces.get(l.to[0]);
      if (!a || !b) continue;
      a.next.push(b);
      b.prev.push(a);
    }
  }

  // Next / previous centre-line point along the course. Within a piece and
  // along a plain chain that is i + 1 / i - 1; at the end of a piece whose
  // successor was recorded elsewhere (routes out of a fork, a merge's second
  // input) it jumps to that piece.
  nextIndex(i) {
    const p = this.pieces.get(this.path[i]?.piece);
    if (p && i === p.path1 - 1 && p.next?.length && !p.next.some((n) => n.path0 === p.path1)) {
      const n = p.next.find((n) => n.path1 > n.path0);
      if (n) return n.path0;
    }
    return Math.min(i + 1, this.path.length - 1);
  }

  prevIndex(i) {
    const p = this.pieces.get(this.path[i]?.piece);
    if (p && i === p.path0 && p.prev?.length && !p.prev.some((q) => q.path1 === p.path0)) {
      const q = p.prev.find((q) => q.lastPath != null);
      if (q) return q.lastPath;
    }
    return Math.max(i - 1, 0);
  }

  // Extra index ranges the nearest-point search must look at from point i,
  // beyond i - back .. i + ahead in the array: the starts of pieces after
  // this one and the ends of pieces before it that were recorded elsewhere.
  searchRanges(i, back, ahead) {
    const p = this.pieces.get(this.path[i]?.piece);
    const out = [];
    if (!p) return out;
    const toEnd = p.path1 - 1 - i;
    if (toEnd < ahead) {
      for (const n of p.next ?? []) if (n.path0 !== p.path1) out.push([n.path0, Math.min(n.path1 - 1, n.path0 + ahead - toEnd)]);
    }
    const fromStart = i - p.path0;
    if (fromStart < back) {
      for (const q of p.prev ?? []) {
        if (q.path1 !== p.path0 && q.lastPath != null) out.push([Math.max(q.path0, q.lastPath - (back - fromStart)), q.lastPath]);
      }
    }
    return out;
  }

  // A socket of the piece being built: a pose on the track floor, on the
  // centre line, facing the way marbles travel.
  addSocket(kind, frame) {
    const p = this.piece;
    if (!p) return;
    const list = kind === 'in' ? p.ins : p.outs;
    list.push({
      pieceId: p.id, kind, index: list.length, pos: frame.pos.clone(), yaw: frame.yaw, pitch: frame.pitch ?? 0,
      up: frame.U ? frame.U.clone() : new Vector3(0, 1, 0),
    });
  }

  // Group the current piece's meshes go into.
  get target() {
    return this.piece?.group ?? this.group;
  }

  // Add a ready-made object (decoration) to the current piece.
  addObject(obj) {
    if (this.group) this.target.add(obj);
  }

  section(name) {
    this.sectionName = name;
    this.cameraHint = null;
    const s0 = this.path.length ? this.path[this.pathFrom ?? this.path.length - 1].s : 0;
    this.sections.push({ name, s0 });
  }

  // Camera hint for the follow camera while the leader is on the path points
  // recorded from now on (until the next section, or setCamera(null)).
  //  { type: 'fixed', pos }        camera sits at pos
  //  { type: 'axis', pos, up }     camera on the vertical line through pos, `up` above the marble
  //  { type: 'offset', offset }    camera at marble + offset
  setCamera(hint) {
    this.cameraHint = hint;
    if (hint && !this.cameraHints.includes(hint)) this.cameraHints.push(hint);
  }

  // A stretch of course a marble must not linger in (the valley). While its
  // progress is between s0 and s1 the race times it; after `seconds` it goes
  // back to path index `restart`, the second time to `skip`.
  addZone(zone) {
    this.zones.push(zone);
  }

  _grow(x, y, z) {
    this.bounds.min.min({ x, y, z });
    this.bounds.max.max({ x, y, z });
  }

  _physics(desc, m = {}) {
    desc.setFriction(m.friction ?? TRACK.friction).setRestitution(m.restitution ?? TRACK.restitution);
    if (m.bounceMax) desc.setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Max);
    return this.world.createCollider(desc, this.body);
  }

  _visual(geometry, position, quaternion, edgeAngle = 25, look = null) {
    if (!this.group) return;
    // Every course surface carries an `accent` value per vertex (see
    // buildTrack); surfaces that have none get 0, plain.
    if (!geometry.attributes.accent) {
      geometry.setAttribute('accent', new BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
    }
    const mesh = new Mesh(geometry, look ?? this.materials.surface);
    // Its own look (glass): kept through theme switches, like decoration.
    if (look) mesh.userData.decor = true;
    const lines = new LineSegments(new EdgesGeometry(geometry, edgeAngle), this.materials.outline);
    mesh.add(lines);
    if (position) mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    this.target.add(mesh);
  }

  // Indexed BufferGeometry in course coordinates -> trimesh collider.
  // look: 'glass' for a see-through solid (tunnel roofs), so the marbles
  // inside stay visible.
  addSolid(geometry, material, look = null) {
    const R = this.RAPIER;
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) this._grow(pos[i], pos[i + 1], pos[i + 2]);
    const desc = R.ColliderDesc.trimesh(
      new Float32Array(pos), new Uint32Array(geometry.index.array), R.TriMeshFlags.FIX_INTERNAL_EDGES
    );
    this._physics(desc, material);
    if (this.group) {
      const flat = geometry.toNonIndexed();
      flat.computeVertexNormals();
      this._visual(flat, null, null, 25, look === 'glass' ? glass() : null);
    }
  }

  _place(desc, center, quat) {
    desc.setTranslation(center.x, center.y, center.z);
    if (quat) desc.setRotation(quat);
    const r = 0; // bounds: centre is enough for primitives sitting on tracks
    this._grow(center.x - r, center.y - r, center.z - r);
    return desc;
  }

  addBox(center, quat, hx, hy, hz, material) {
    const desc = this._place(this.RAPIER.ColliderDesc.cuboid(hx, hy, hz), center, quat);
    if (material?.visual !== false) this._visual(new BoxGeometry(hx * 2, hy * 2, hz * 2), center, quat);
    return this._physics(desc, material);
  }

  // Box given in a frame's local coordinates (x left, y up, z forward).
  addBoxAt(frame, local, hx, hy, hz, material) {
    const c = framePoint(frame, local.x, local.y, local.z);
    return this.addBox(c, frameQuat(frame), hx, hy, hz, material);
  }

  // Cylinder with its axis along the local Y of `quat`.
  addCylinder(center, quat, halfHeight, radius, material) {
    const desc = this._place(this.RAPIER.ColliderDesc.cylinder(halfHeight, radius), center, quat);
    if (material?.visual !== false) {
      // Pegs and posts count as accents (red in the ITSENSE theme).
      const g = new CylinderGeometry(radius, radius, halfHeight * 2, 20);
      g.setAttribute('accent', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
      this._visual(g, center, quat);
    }
    return this._physics(desc, material);
  }

  // Mesh + outline only, no collider.
  addVisual(geometry, position, quaternion, edgeAngle) {
    this._visual(geometry, position, quaternion, edgeAngle);
  }

  // Decoration (banners, gantries, grandstands): a mesh with its own
  // material and no collider, outlined only when `outline` is an edge angle.
  // Returns the mesh, or null when running headless.
  addDecor(geometry, position, quaternion, { material, outline = null } = {}) {
    if (!this.group) {
      geometry.dispose();
      return null;
    }
    const mesh = new Mesh(geometry, material ?? this.materials.surface);
    if (outline !== null) mesh.add(new LineSegments(new EdgesGeometry(geometry, outline), this.materials.outline));
    if (position) mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    mesh.userData.decor = true;
    this.target.add(mesh);
    return mesh;
  }

  addHull(points, material) {
    const flat = new Float32Array(points.length * 3);
    points.forEach((p, i) => { flat.set([p.x, p.y, p.z], i * 3); this._grow(p.x, p.y, p.z); });
    const desc = this.RAPIER.ColliderDesc.convexHull(flat);
    this._visual(new ConvexGeometry(points), null, null, 10);
    return this._physics(desc, material);
  }

  // Invisible sensor box. 'finish' ends the race for a marble; other names
  // are just counted (used to measure which route marbles take).
  addSensor(name, center, quat, hx, hy, hz) {
    const R = this.RAPIER;
    const desc = this.RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(center.x, center.y, center.z)
      .setRotation(quat)
      .setSensor(true)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    this.sensors.set(this.world.createCollider(desc, this.body).handle, name);
  }

  addSensorAt(name, frame, local, hx, hy, hz) {
    this.addSensor(name, framePoint(frame, local.x, local.y, local.z), frameQuat(frame), hx, hy, hz);
  }

  // Record centre-line frames for ranking, camera heading and rescue points.
  // Frames of a built track have a track floor right under them: `solid`.
  addPath(frames) {
    for (const f of frames) this.addPathPoint(f.pos, f.U, f.F, true);
  }

  // Points added directly (jumps, the funnel's hole) and the points bridging
  // gaps between them are in the air: not `solid`, so never a rescue spot.
  addPathPoint(pos, up = new Vector3(0, 1, 0), tangent = null, solid = false) {
    // A piece's first point carries on from the end of the piece it is
    // linked to (pathFrom), which is not always the last point recorded:
    // the second route out of a fork starts at the fork, not at the finish.
    const prev = this.path[this.pathFrom ?? this.path.length - 1];
    const dist = prev ? prev.pos.distanceTo(pos) : 0;
    if (prev && dist < 1e-4) return;
    this.pathFrom = null;
    // Bridge jumps between sections with intermediate points so the nearest
    // point search always has something close by.
    // A course this big is a broken edit, not a track: stop before filling
    // the gap with millions of points.
    if (!(dist < 1000)) throw new Error('the course runs off too far (a slope or length is far too big)');
    if (prev && dist > 0.2) {
      const n = Math.ceil(dist / 0.1);
      for (let i = 1; i < n; i++) {
        const p = prev.pos.clone().lerp(pos, i / n);
        this.path.push({ pos: p, up: new Vector3(0, 1, 0), tangent: null, s: prev.s + (dist * i) / n, section: this.sectionName, piece: this.piece?.id, cam: this.cameraHint, solid: false });
      }
    }
    this.path.push({ pos: pos.clone(), up: up.clone(), tangent: tangent && tangent.clone(), s: (prev ? prev.s : 0) + dist, section: this.sectionName, piece: this.piece?.id, cam: this.cameraHint, solid });
  }

  // Lift the whole course so its lowest point sits `clearance` above the floor.
  finalize(clearance) {
    const dy = clearance - this.bounds.min.y;
    this.body.setTranslation({ x: 0, y: dy, z: 0 }, false);
    if (this.group) this.group.position.y = dy;
    for (const p of this.path) p.pos.y += dy;
    for (let i = 0; i < this.path.length; i++) {
      const p = this.path[i];
      if (!p.tangent) {
        const a = this.path[Math.max(0, i - 1)].pos, b = this.path[Math.min(this.path.length - 1, i + 1)].pos;
        p.tangent = b.clone().sub(a).normalize();
      }
    }
    if (this.spawn) this.spawn.forEach((p) => (p.y += dy));
    this.lift = dy;
    for (const piece of this.pieces.values()) for (const k of [...piece.ins, ...piece.outs]) k.pos.y += dy;
    for (const h of this.cameraHints) if (h.pos) h.pos.y += dy;
    this.bounds.min.y += dy;
    this.bounds.max.y += dy;
    this.length = this.path.reduce((a, p) => Math.max(a, p.s), 0); // the furthest point (routes may be recorded after the finish)
  }
}

// See-through material for tunnel roofs, shared by every race.
let GLASS = null;
function glass() {
  GLASS ??= new MeshStandardMaterial({
    color: 0xd7ecff, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0, depthWrite: false, side: DoubleSide,
  });
  return GLASS;
}

export { Vector3, Quaternion };
