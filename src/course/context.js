import {
  Group, Mesh, LineSegments, EdgesGeometry, BoxGeometry, CylinderGeometry, Vector3, Quaternion,
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
    this.path = []; // centre line: { pos, up, tangent, s, section }
    this.sections = []; // { name, s0 }
    this.sectionName = 'start';
    this.minY = Infinity;
    this.bounds = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
    this.sensors = new Map(); // collider handle -> name
    this.spawn = null;
  }

  section(name) {
    this.sectionName = name;
    const s0 = this.path.length ? this.path[this.path.length - 1].s : 0;
    this.sections.push({ name, s0 });
  }

  _grow(x, y, z) {
    this.bounds.min.min({ x, y, z });
    this.bounds.max.max({ x, y, z });
  }

  _physics(desc, m = {}) {
    desc.setFriction(m.friction ?? TRACK.friction).setRestitution(m.restitution ?? TRACK.restitution);
    if (m.restitutionMax) desc.setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Max);
    if (m.restitutionMin) desc.setRestitutionCombineRule(this.RAPIER.CoefficientCombineRule.Min);
    if (m.frictionMin) desc.setFrictionCombineRule(this.RAPIER.CoefficientCombineRule.Min);
    return this.world.createCollider(desc, this.body);
  }

  _visual(geometry, position, quaternion, edgeAngle = 25) {
    if (!this.group) return;
    const mesh = new Mesh(geometry, this.materials.surface);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const lines = new LineSegments(new EdgesGeometry(geometry, edgeAngle), this.materials.outline);
    mesh.add(lines);
    if (position) mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    this.group.add(mesh);
  }

  // Indexed BufferGeometry in course coordinates -> trimesh collider.
  addSolid(geometry, material) {
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
      this._visual(flat);
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
    if (material?.visual !== false) this._visual(new CylinderGeometry(radius, radius, halfHeight * 2, 20), center, quat);
    return this._physics(desc, material);
  }

  // Mesh + outline only, no collider.
  addVisual(geometry, position, quaternion, edgeAngle) {
    this._visual(geometry, position, quaternion, edgeAngle);
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
  addPath(frames) {
    for (const f of frames) this.addPathPoint(f.pos, f.U, f.F);
  }

  addPathPoint(pos, up = new Vector3(0, 1, 0), tangent = null) {
    const prev = this.path[this.path.length - 1];
    const dist = prev ? prev.pos.distanceTo(pos) : 0;
    if (prev && dist < 1e-4) return;
    // Bridge jumps between sections with intermediate points so the nearest
    // point search always has something close by.
    if (prev && dist > 0.2) {
      const n = Math.ceil(dist / 0.1);
      for (let i = 1; i < n; i++) {
        const p = prev.pos.clone().lerp(pos, i / n);
        this.path.push({ pos: p, up: new Vector3(0, 1, 0), tangent: null, s: prev.s + (dist * i) / n, section: this.sectionName });
      }
    }
    this.path.push({ pos: pos.clone(), up: up.clone(), tangent: tangent && tangent.clone(), s: (prev ? prev.s : 0) + dist, section: this.sectionName });
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
    this.bounds.min.y += dy;
    this.bounds.max.y += dy;
    this.length = this.path[this.path.length - 1].s;
  }
}

export { Vector3, Quaternion };
