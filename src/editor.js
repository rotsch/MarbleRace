import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { makeFrame, frameQuat } from './course/frame.js';
import { TYPES, defaultCourse, clone, linkMaps, validate, COURSE_VERSION, clampOption } from './course/pieces.js';
import { shapeAt } from './course/trackBuilder.js';
import { TRACK } from './config.js';

// Track editor (G): move and rotate placed pieces, snap their sockets
// together, change their options, add and delete pieces.
//
// The course is data (see course/pieces.js). Dragging only moves the meshes
// of the dragged piece (and the pieces linked after it) as a preview; on
// release the data changes and the course is rebuilt from it.
//
// Sockets are drawn on the track floor, on the centre line: inputs green,
// outputs orange, both with an arrow in the direction marbles travel. Open
// sockets stand out with a pin and pulse; linked ones shrink to a grey dot.

const STORE = 'marble-race-course';
const SNAP_DIST = 0.3; // units: a dragged socket this close to an open one snaps
const MAX_UNDO = 100;
const COLORS = { in: 0x16a34a, out: 0xf97316, linked: 0x8a8f98, bad: 0xdc2626, snap: 0x2563eb, shape: 0x7c3aed, shapeOn: 0xfacc15 };
const round = (v) => Math.round(v * 1000) / 1000;
const R2D = 180 / Math.PI, D2R = Math.PI / 180;

export function loadStoredCourse() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || 'null');
    return data?.version === COURSE_VERSION && Array.isArray(data.pieces) ? data : null;
  } catch {
    return null;
  }
}

export class Editor {
  //  view, rig: the renderer and camera rig
  //  host: { race(), course(), rebuild(data), test(), layout }
  constructor(view, rig, host) {
    this.view = view;
    this.rig = rig;
    this.host = host;
    this.active = false;
    this.selected = null; // piece id
    this.mode = 'translate';
    this.undo = [];
    this.redo = [];
    this.root = new THREE.Group(); // socket markers, lifted like the course
    this.root.visible = false;
    view.scene.add(this.root);
    this.markers = new Map(); // piece id -> Group of that piece's markers
    this.highlight = [];
    this._materials();

    this.handle = new THREE.Object3D(); // what the gizmo moves: the selected piece's entry
    view.scene.add(this.handle);
    const tc = (this.gizmo = new TransformControls(view.camera, view.renderer.domElement));
    tc.setTranslationSnap(0.1);
    tc.setRotationSnap(15 * D2R);
    tc.setSize(0.9);
    this.gizmoHelper = tc.getHelper();
    this.gizmoHelper.visible = false;
    tc.enabled = false;
    view.scene.add(this.gizmoHelper);
    tc.addEventListener('mouseDown', () => this._dragStart());
    tc.addEventListener('objectChange', () => this._dragMove());
    tc.addEventListener('mouseUp', () => this._dragEnd());

    this.snapRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 40).rotateX(-Math.PI / 2), this.mat.snap);
    this.snapRing.visible = false;
    this.snapRing.renderOrder = 12;
    this.root.add(this.snapRing);

    // Shape mode (3): a handle on top of each wall at every shape stop of the
    // selected piece. Drag one up / down for that wall's height, sideways
    // for the track width, along the track to move the stop.
    this.shapeRoot = new THREE.Group();
    this.root.add(this.shapeRoot);
    this.stop = null; // { index, side: 'left' | 'right' }
    this.shapeProxy = new THREE.Object3D();
    view.scene.add(this.shapeProxy);
    const sc = (this.shapeGizmo = new TransformControls(view.camera, view.renderer.domElement));
    sc.setSpace('local');
    sc.setTranslationSnap(0.02);
    sc.setSize(0.7);
    sc.enabled = false;
    this.shapeGizmoHelper = sc.getHelper();
    this.shapeGizmoHelper.visible = false;
    view.scene.add(this.shapeGizmoHelper);
    sc.addEventListener('mouseDown', () => (this.shapeDrag = this.shapeProxy.position.clone()));
    sc.addEventListener('objectChange', () => this.shapeDrag && this.stopMesh?.position.copy(this.shapeProxy.position).setY(this.shapeProxy.position.y - this.root.position.y));
    sc.addEventListener('mouseUp', () => this._shapeDragEnd());

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 0;
    this.altKey = false;
    this.gizmoUp = -Infinity;
    window.addEventListener('keydown', (e) => (this.altKey = e.altKey));
    window.addEventListener('keyup', (e) => (this.altKey = e.altKey));
    window.addEventListener('pointerdown', (e) => (this.altKey = e.altKey), true);
  }

  _materials() {
    const basic = (color, extra = {}) =>
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, ...extra });
    this.mat = {
      in: basic(COLORS.in),
      out: basic(COLORS.out),
      linked: basic(COLORS.linked),
      bad: basic(COLORS.bad),
      snap: basic(COLORS.snap, { depthTest: false, transparent: true, opacity: 0.9 }),
      arrow: basic(0xffffff),
      shape: new THREE.MeshBasicMaterial({ color: COLORS.shape, depthTest: false, transparent: true }),
      shapeOn: new THREE.MeshBasicMaterial({ color: COLORS.shapeOn, depthTest: false, transparent: true }),
      shapeLine: new THREE.LineBasicMaterial({ color: COLORS.shape, depthTest: false, transparent: true }),
      highlight: new THREE.MeshBasicMaterial({
        color: 0x3b82f6, transparent: true, opacity: 0.28, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
    };
    this.geo = {
      disc: new THREE.CircleGeometry(0.11, 32).rotateX(-Math.PI / 2),
      dot: new THREE.CircleGeometry(0.035, 16).rotateX(-Math.PI / 2),
      arrow: new THREE.ShapeGeometry(new THREE.Shape([
        new THREE.Vector2(0, 0.075), new THREE.Vector2(0.055, -0.02), new THREE.Vector2(0.02, -0.02),
        new THREE.Vector2(0.02, -0.06), new THREE.Vector2(-0.02, -0.06), new THREE.Vector2(-0.02, -0.02),
        new THREE.Vector2(-0.055, -0.02),
      ])).rotateX(-Math.PI / 2).rotateY(Math.PI),
      pin: new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6).translate(0, 0.2, 0),
      head: new THREE.SphereGeometry(0.035, 12, 8).translate(0, 0.42, 0),
      knob: new THREE.SphereGeometry(0.045, 16, 10),
    };
    // The shape's tip points to -Z after rotateX; rotateY(PI) turns it to +Z
    // (forward, the way marbles travel).
  }

  // ---- data -------------------------------------------------------------

  get data() {
    return this.host.course();
  }

  _commit(data, { keepSelection = true } = {}) {
    const count = (t) => data.pieces.filter((p) => p.type === t).length;
    if (!count('start') || !count('finish')) throw new Error('A course needs a start and a finish.');
    const before = JSON.stringify(this.data);
    this.undo.push(before);
    if (this.undo.length > MAX_UNDO) this.undo.shift();
    this.redo.length = 0;
    try {
      this._apply(data, keepSelection);
    } catch (err) {
      // The course would not build: go back to how it was.
      this.undo.pop();
      this._apply(JSON.parse(before), keepSelection);
      throw new Error(`That edit does not build: ${err.message}`);
    }
  }

  _apply(data, keepSelection = true) {
    const before = this.host.race().course.lift;
    this.host.rebuild(data);
    // Saved only once it has built, so a broken course never comes back on
    // the next page load.
    try {
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch {
      // no storage: the edit still applies for this session
    }
    // The course is lifted so its lowest point sits on the floor; keep the
    // view where it was when that lift changes.
    this.view.camera.position.y += this.host.race().course.lift - before;
    if (!keepSelection || !data.pieces.some((p) => p.id === this.selected)) this.selected = null;
    this.refresh();
  }

  undoStep() {
    if (!this.undo.length) return;
    this.redo.push(JSON.stringify(this.data));
    this._apply(JSON.parse(this.undo.pop()));
  }

  redoStep() {
    if (!this.redo.length) return;
    this.undo.push(JSON.stringify(this.data));
    this._apply(JSON.parse(this.redo.pop()));
  }

  resetCourse() {
    this._commit(defaultCourse(this.host.layout), { keepSelection: false });
    try {
      localStorage.removeItem(STORE);
    } catch {
      // ignore
    }
  }

  exportJson() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marble-course.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async importJson(file) {
    const data = JSON.parse(await file.text());
    if (data?.version !== COURSE_VERSION || !Array.isArray(data.pieces) || !Array.isArray(data.links)) {
      throw new Error('not a marble course file');
    }
    this._commit(data, { keepSelection: false });
  }

  // ---- mode -------------------------------------------------------------

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    if (on) {
      if (this.rig.mode !== 'free') this.rig.setMode('free');
      if (document.pointerLockElement) document.exitPointerLock();
      this.refresh();
    } else {
      this.select(null);
    }
    this.onChange?.();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'shape') {
      this.gizmo.setMode(mode);
      const rotate = mode === 'rotate';
      this.gizmo.showX = !rotate;
      this.gizmo.showZ = !rotate;
    }
    this.stop = null;
    this._placeHandle();
    this._showShape();
    this.onChange?.();
  }

  // ---- selection ----------------------------------------------------------

  // Click on the scene: select the piece under the cursor. Returns true when
  // the click was used (always, in editor mode).
  click(e) {
    if (!this.active) return false;
    // The click that ends a gizmo drag is not a selection.
    if (performance.now() - this.gizmoUp < 300) return true;
    const canvas = this.view.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.view.camera);
    // Shape mode: a click on a wall handle picks that stop and wall.
    if (this.mode === 'shape') {
      const knob = this.raycaster.intersectObjects(this.shapeRoot.children, false).find((h) => h.object.userData.stop);
      if (knob) {
        this.selectStop(knob.object.userData.stop);
        return true;
      }
    }
    const group = this.host.race().course.group;
    const hits = this.raycaster.intersectObject(group, true).filter((h) => h.object.isMesh && !h.object.userData.editor);
    let id = null;
    for (let o = hits[0]?.object; o; o = o.parent) {
      if (o.userData.pieceId) {
        id = o.userData.pieceId;
        break;
      }
    }
    this.select(id);
    return true;
  }

  select(id) {
    if (id !== this.selected) this.stop = null;
    this.selected = id;
    this._showHighlight();
    this._placeHandle();
    this._showShape();
    this.onChange?.();
  }

  _builtPiece(id) {
    return this.host.race().course.pieces.get(id);
  }

  _showHighlight() {
    for (const m of this.highlight) m.parent?.remove(m);
    this.highlight = [];
    const p = this.selected && this._builtPiece(this.selected);
    if (!p?.group) return;
    p.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.editor || o.userData.decor) return;
      const h = new THREE.Mesh(o.geometry, this.mat.highlight);
      h.userData.editor = true;
      h.userData.decor = true; // keeps the look switch from changing its material
      h.renderOrder = 3;
      o.add(h);
      this.highlight.push(h);
    });
  }

  // The gizmo sits on the selected piece's entry socket (or, for a piece
  // without inputs, its first output).
  _placeHandle() {
    const p = this.selected && this._builtPiece(this.selected);
    const pivot = p && (p.ins[0] ?? p.outs[0]);
    if (!this.active || !pivot || this.mode === 'shape') {
      this.gizmo.detach();
      this.gizmo.enabled = false;
      this.gizmoHelper.visible = false;
      return;
    }
    this.pivot = pivot;
    this.handle.position.copy(pivot.pos);
    this.handle.rotation.set(0, pivot.yaw, 0);
    this.handle.updateMatrixWorld();
    this.gizmo.attach(this.handle);
    this.gizmo.enabled = true;
    this.gizmoHelper.visible = true;
  }

  // ---- markers ------------------------------------------------------------

  // Rebuild the socket markers and the panel after the course changed.
  refresh() {
    const course = this.host.race().course;
    for (const g of this.markers.values()) this.root.remove(g);
    this.markers.clear();
    this.root.position.y = course.lift;
    const { into, from } = linkMaps(this.data);
    this.problems = validate(this.data);
    let open = 0, off = 0;
    for (const p of course.pieces.values()) {
      const g = new THREE.Group();
      g.userData.pieceId = p.id;
      for (const k of [...p.ins, ...p.outs]) {
        const key = `${k.pieceId}:${k.index}`;
        const linked = k.kind === 'in' ? into.has(key) : from.has(key);
        const aligned = k.kind !== 'in' || k.index === 0 || !linked || this._aligned(k, into.get(key));
        if (!linked && k.kind === 'out') open++;
        if (!aligned) off++;
        g.add(this._marker(k, linked, aligned));
      }
      this.root.add(g);
      this.markers.set(p.id, g);
    }
    for (const p of course.pieces.values()) {
      if (!p.shape.length) continue;
      const big = (s) => s && (Math.abs(s.width) > 0.005 || Math.abs(s.left) > 0.005 || Math.abs(s.right) > 0.005);
      const ends = [big(shapeAt(p.shape, 0)) && 'start', big(shapeAt(p.shape, p.mainD)) && 'end'].filter(Boolean);
      if (ends.length) this.problems.push(`${p.name}: shape reaches its ${ends.join(' and ')}, so it no longer matches the piece next to it`);
    }
    if (off) this.problems.push(`${off} linked input${off > 1 ? 's do' : ' does'} not line up (red): snap the pieces together again`);
    if (open) this.problems.push(`${open} open output${open > 1 ? 's' : ''}: marbles run off the end there`);
    this._showHighlight();
    this._placeHandle();
    this._showShape();
    this.onChange?.();
  }

  // ---- shape --------------------------------------------------------------

  // The selected piece's shape stops (sorted) and the length of its main
  // route, for the panel.
  shapeInfo() {
    const piece = this.data.pieces.find((p) => p.id === this.selected);
    const built = this.selected && this._builtPiece(this.selected);
    if (!piece || !built) return null;
    const stops = (piece.shape ?? []).slice().sort((a, b) => a.d - b.d);
    return { stops, length: built.mainD, hasTrack: built.samples.length > 0 };
  }

  // Change the selected piece's stops: fn gets a sorted copy to edit.
  _editShape(fn) {
    const data = clone(this.data);
    const piece = data.pieces.find((p) => p.id === this.selected);
    if (!piece) return;
    const stops = (piece.shape ?? []).slice().sort((a, b) => a.d - b.d);
    fn(stops);
    const clean = stops
      .map((s) => ({ d: round(Math.max(0, s.d)), width: round(s.width ?? 0), left: round(s.left ?? 0), right: round(s.right ?? 0) }))
      .sort((a, b) => a.d - b.d);
    if (clean.length) piece.shape = clean;
    else delete piece.shape;
    this._commit(data);
  }

  addStop() {
    const info = this.shapeInfo();
    if (!info) return;
    const { stops, length } = info;
    // In the middle of the piece, or halfway between the last stop and the end.
    const d = stops.length ? (stops[stops.length - 1].d + length) / 2 : length / 2;
    this._editShape((s) => s.push({ d, width: 0, left: 0, right: 0 }));
    this.stop = { index: this.shapeInfo().stops.findIndex((s) => Math.abs(s.d - round(d)) < 1e-6), side: 'left' };
    this._showShape();
    this.onChange?.();
  }

  setStop(index, key, value) {
    this._editShape((s) => {
      if (s[index]) s[index][key] = value;
    });
  }

  removeStop(index) {
    this.stop = null;
    this._editShape((s) => s.splice(index, 1));
  }

  selectStop(stop) {
    this.stop = stop;
    this._showShape();
    this.onChange?.();
  }

  // Wall position at distance d along the selected piece's main route.
  _wallAt(built, d, side) {
    const smp = built.samples;
    let best = smp[0];
    for (const s of smp) if (Math.abs(s.d - d) < Math.abs(best.d - d)) best = s;
    const { frame: f, w, h } = best;
    const t = TRACK.railThickness / 2;
    const x = side === 'left' ? w.l + t : -(w.r + t);
    const y = side === 'left' ? h.l : h.r;
    const pos = f.pos.clone().addScaledVector(f.L, x).addScaledVector(f.U, Math.max(y, 0.02));
    return { pos, frame: f };
  }

  _showShape() {
    for (const c of [...this.shapeRoot.children]) {
      this.shapeRoot.remove(c);
      if (c.isLine) c.geometry.dispose();
    }
    this.stopMesh = null;
    const info = this.active && this.mode === 'shape' && this.shapeInfo();
    const built = info && this._builtPiece(this.selected);
    const show = !!(info && info.hasTrack);
    this.shapeGizmo.enabled = false;
    this.shapeGizmoHelper.visible = false;
    this.shapeGizmo.detach();
    if (!show) return;
    info.stops.forEach((s, index) => {
      const L = this._wallAt(built, s.d, 'left'), R = this._wallAt(built, s.d, 'right');
      for (const [side, at] of [['left', L], ['right', R]]) {
        const on = this.stop?.index === index && this.stop.side === side;
        const knob = new THREE.Mesh(this.geo.knob, on ? this.mat.shapeOn : this.mat.shape);
        knob.position.copy(at.pos);
        knob.renderOrder = 13;
        knob.userData = { editor: true, stop: { index, side } };
        this.shapeRoot.add(knob);
        if (on) {
          this.stopMesh = knob;
          this.shapeProxy.position.copy(at.pos).setY(at.pos.y + this.root.position.y);
          this.shapeProxy.quaternion.copy(frameQuat(at.frame));
          this.shapeProxy.updateMatrixWorld();
          this.shapeGizmo.attach(this.shapeProxy);
          this.shapeGizmo.enabled = true;
          this.shapeGizmoHelper.visible = true;
        }
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([L.pos, R.pos]), this.mat.shapeLine);
      line.renderOrder = 13;
      line.userData.editor = true;
      this.shapeRoot.add(line);
    });
  }

  // A wall handle was dragged: up / down is that wall's height, sideways the
  // width (both walls move apart), along the track the stop's position.
  _shapeDragEnd() {
    const start = this.shapeDrag;
    this.shapeDrag = null;
    this.gizmoUp = performance.now();
    if (!start || !this.stop) return;
    const local = this.shapeProxy.position.clone().sub(start).applyQuaternion(this.shapeProxy.quaternion.clone().invert());
    if (local.lengthSq() < 1e-8) return;
    const { index, side } = this.stop;
    let d = null;
    this._editShape((stops) => {
      const s = stops[index];
      if (!s) return;
      s.d += local.z;
      s.width = (s.width ?? 0) + (side === 'left' ? 2 * local.x : -2 * local.x);
      s[side] = (s[side] ?? 0) + local.y;
      d = round(Math.max(0, s.d));
    });
    // Keep the same stop picked: moving it along may have re-sorted the stops.
    const i = this.shapeInfo()?.stops.findIndex((s) => Math.abs(s.d - d) < 1e-6) ?? -1;
    this.stop = i >= 0 ? { index: i, side } : null;
    this._showShape();
    this.onChange?.();
  }

  _aligned(socket, [fromId, out]) {
    const s = this._builtPiece(fromId)?.outs[out];
    if (!s) return false;
    const dyaw = Math.abs(Math.atan2(Math.sin(s.yaw - socket.yaw), Math.cos(s.yaw - socket.yaw)));
    return s.pos.distanceTo(socket.pos) < 0.03 && dyaw < 2 * D2R;
  }

  // One socket marker in course coordinates (the root carries the lift).
  _marker(k, linked, aligned) {
    const m = new THREE.Group();
    m.position.copy(k.pos).addScaledVector(k.up, 0.004);
    m.position.y -= this.host.race().course.lift;
    m.quaternion.copy(frameQuat(makeFrame(k.pos, k.yaw, k.pitch)));
    const add = (geo, mat, order = 11) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = order;
      mesh.userData.editor = true;
      m.add(mesh);
      return mesh;
    };
    if (linked && aligned) {
      add(this.geo.dot, this.mat.linked);
    } else {
      const mat = !aligned ? this.mat.bad : this.mat[k.kind];
      m.userData.pulse = add(this.geo.disc, mat);
      add(this.geo.arrow, this.mat.arrow, 12).position.y = 0.001;
      add(this.geo.pin, mat);
      add(this.geo.head, mat);
      // The pin stands straight up whatever the slope.
      for (const o of m.children.slice(-2)) o.quaternion.copy(m.quaternion.clone().invert());
    }
    m.userData.socket = k;
    return m;
  }

  update(time) {
    if (!this.active) return;
    const s = 1 + 0.18 * Math.sin(time * 0.006);
    for (const g of this.markers.values()) for (const m of g.children) m.userData.pulse?.scale.setScalar(s);
  }

  // ---- dragging -----------------------------------------------------------

  // Pieces that move with the selected one: everything linked after it
  // through in 0 (their start follows it), unless Alt is held.
  _carried(id, alone) {
    const set = new Set([id]);
    if (alone) return set;
    const { from } = linkMaps(this.data);
    const stack = [id];
    while (stack.length) {
      const p = this._builtPiece(stack.pop());
      if (!p) continue;
      for (const o of p.outs) {
        for (const [to, inIdx] of from.get(`${p.id}:${o.index}`) ?? []) {
          if (inIdx === 0 && !set.has(to)) {
            set.add(to);
            stack.push(to);
          }
        }
      }
    }
    return set;
  }

  _dragStart() {
    if (!this.selected) return;
    this.drag = {
      p0: this.pivot.pos.clone(),
      yaw0: this.pivot.yaw,
      alone: this.altKey,
      moved: this._carried(this.selected, this.altKey),
      snap: null,
      delta: { yaw: 0, pos: this.pivot.pos.clone() },
    };
  }

  // Course point x moved by the drag: rotated about the pivot by `yaw`, the
  // pivot itself moved to `pos`.
  _move(x, { yaw, pos }, p0 = this.drag.p0) {
    return x.clone().sub(p0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(pos);
  }

  _dragMove() {
    const d = this.drag;
    if (!d) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.handle.quaternion);
    const delta = { yaw: Math.atan2(fwd.x, fwd.z) - d.yaw0, pos: this.handle.position.clone() };
    // Snap: the nearest open socket of the opposite kind on a piece that is
    // not moving, measured from each socket of the selected piece.
    const { into, from } = linkMaps(this.data);
    const mine = this._builtPiece(this.selected);
    let best = null;
    for (const s of [...mine.ins, ...mine.outs]) {
      const key = `${s.pieceId}:${s.index}`;
      // Turning: the piece turns about this socket, so it stays where it is
      // and would only snap straight back to its old heading.
      if (this.mode === 'rotate' && s === this.pivot) continue;
      // An output already feeding a carried piece is not free to snap.
      if (s.kind === 'out' && (from.get(key) ?? []).some(([to]) => d.moved.has(to))) continue;
      const at = this._move(s.pos, delta);
      for (const p of this.host.race().course.pieces.values()) {
        if (d.moved.has(p.id)) continue;
        for (const t of s.kind === 'in' ? p.outs : p.ins) {
          if (!this._free(t, into, from)) continue;
          const dist = at.distanceTo(t.pos);
          if (dist < SNAP_DIST && (!best || dist < best.dist)) best = { dist, mine: s, other: t };
        }
      }
    }
    if (best) {
      // Turn so the two sockets face the same way, then move them together.
      const yaw = delta.yaw + (best.other.yaw - (best.mine.yaw + delta.yaw));
      const rel = best.mine.pos.clone().sub(d.p0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      delta.yaw = yaw;
      delta.pos = best.other.pos.clone().sub(rel);
      this.snapRing.position.copy(best.other.pos).addScaledVector(best.other.up, 0.006);
      this.snapRing.position.y -= this.host.race().course.lift;
    }
    this.snapRing.visible = !!best;
    d.snap = best;
    d.delta = delta;
    // Preview: move the meshes and markers of every carried piece.
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), delta.yaw);
    const lift = this.host.race().course.lift;
    const p0 = d.p0.clone().setY(d.p0.y - lift), p1 = delta.pos.clone().setY(delta.pos.y - lift);
    const offset = p1.sub(p0.applyQuaternion(q));
    for (const id of d.moved) {
      for (const g of [this._builtPiece(id)?.group, this.markers.get(id)]) {
        if (!g) continue;
        g.position.copy(offset);
        g.quaternion.copy(q);
      }
    }
  }

  // A socket of another piece the selected piece may link to: nothing linked
  // to it, or only the selected piece.
  _free(t, into, from) {
    const key = `${t.pieceId}:${t.index}`;
    return t.kind === 'out'
      ? !(from.get(key) ?? []).some(([to]) => to !== this.selected)
      : !into.has(key) || into.get(key)[0] === this.selected;
  }

  // Connect buttons: every open socket of the selected piece paired with
  // every open socket of the opposite kind on a piece it could move to (not
  // one that moves along with it), nearest first.
  connectOptions() {
    const sel = this.selected && this._builtPiece(this.selected);
    if (!sel) return [];
    const { into, from } = linkMaps(this.data);
    const carried = this._carried(sel.id, false);
    const names = new Map(this.data.pieces.map((p) => [p.id, p.name]));
    const label = (k, p) => (k.kind === 'in' ? (p.ins.length > 1 ? `input ${k.index + 1}` : 'input') : p.outs.length > 1 ? `output ${k.index + 1}` : 'output');
    const out = [];
    for (const s of [...sel.ins, ...sel.outs]) {
      const key = `${s.pieceId}:${s.index}`;
      if (s.kind === 'in' ? into.has(key) : from.has(key)) continue;
      for (const p of this.host.race().course.pieces.values()) {
        if (carried.has(p.id)) continue;
        for (const t of s.kind === 'in' ? p.outs : p.ins) {
          if (!this._free(t, into, from)) continue;
          out.push({
            mine: s, other: t, dist: s.pos.distanceTo(t.pos),
            text: `${label(s, sel)} → ${names.get(p.id)} (${label(t, p)})`,
          });
        }
      }
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  // Move the selected piece (and the pieces linked after it) so its socket
  // `mine` sits on `other`, facing the same way, and link the two.
  connect({ mine, other }) {
    const sel = this._builtPiece(this.selected);
    const pivot = sel && (sel.ins[0] ?? sel.outs[0]);
    if (!pivot) return;
    const p0 = pivot.pos.clone();
    const yaw = other.yaw - mine.yaw;
    const rel = mine.pos.clone().sub(p0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.drag = {
      p0, yaw0: pivot.yaw, alone: false, moved: this._carried(sel.id, false),
      snap: { mine, other, dist: 0 },
      delta: { yaw, pos: other.pos.clone().sub(rel) },
    };
    this._dragEnd();
  }

  _dragEnd() {
    const d = this.drag;
    this.drag = null;
    this.snapRing.visible = false;
    this.gizmoUp = performance.now();
    if (!d) return;
    const { yaw, pos } = d.delta;
    if (!d.snap && Math.abs(yaw) < 1e-6 && pos.distanceTo(d.p0) < 1e-6) return;

    const data = clone(this.data);
    const lift = this.host.race().course.lift;
    const id = this.selected;
    const piece = data.pieces.find((p) => p.id === id);
    const built = this._builtPiece(id);
    const unlinkInto = (pid, idx) => (data.links = data.links.filter((l) => !(l.to[0] === pid && l.to[1] === idx)));
    const poseOf = (b) => ({
      pos: [b.entry.pos.x, b.entry.pos.y, b.entry.pos.z], yaw: b.entry.yaw, pitch: b.entry.pitch ?? 0,
    });

    // Alt: pieces linked after this one stay where they are.
    if (d.alone) {
      for (const l of data.links.filter((l) => l.from[0] === id && l.to[1] === 0)) {
        const q = data.pieces.find((p) => p.id === l.to[0]);
        const b = this._builtPiece(l.to[0]);
        if (q && b) q.pose = poseOf(b);
      }
      data.links = data.links.filter((l) => !(l.from[0] === id && l.to[1] === 0));
    }

    // The moved piece is free now, at its new start. Its entry is in course
    // coordinates before the lift, like every pose.
    const entry = built.entry;
    const moved = this._move(new THREE.Vector3(entry.pos.x, entry.pos.y + lift, entry.pos.z), { yaw, pos }, d.p0);
    piece.pose = { pos: [moved.x, moved.y - lift, moved.z], yaw: entry.yaw + yaw, pitch: entry.pitch ?? 0 };
    unlinkInto(id, 0);
    // Links into the piece's other inputs no longer line up either.
    for (let i = 1; i < built.ins.length; i++) unlinkInto(id, i);

    if (d.snap) {
      const { mine, other } = d.snap;
      if (mine.kind === 'in') {
        unlinkInto(id, mine.index);
        data.links.push({ from: [other.pieceId, other.index], to: [id, mine.index] });
        if (mine.index === 0) delete piece.pose;
      } else {
        unlinkInto(other.pieceId, other.index);
        data.links = data.links.filter((l) => !(l.from[0] === id && l.from[1] === mine.index));
        data.links.push({ from: [id, mine.index], to: [other.pieceId, other.index] });
        const q = data.pieces.find((p) => p.id === other.pieceId);
        if (q && other.index === 0) delete q.pose;
      }
    }
    this._commit(data);
  }

  // ---- panel actions --------------------------------------------------------

  setOption(key, value) {
    const data = clone(this.data);
    const piece = data.pieces.find((p) => p.id === this.selected);
    if (!piece) return;
    piece.opts ??= {};
    const field = TYPES[piece.type]?.fields.find((f) => f.key === key);
    if (value === null) delete piece.opts[key];
    else piece.opts[key] = field ? clampOption(field, value) : value;
    // A fixed exit heading would ignore turning the piece; use the exit turn.
    if (key === 'exitTurn') delete piece.opts.exitYaw;
    this._commit(data);
  }

  rename(name) {
    const data = clone(this.data);
    const piece = data.pieces.find((p) => p.id === this.selected);
    if (!piece || !name) return;
    piece.name = name;
    this._commit(data);
  }

  // New piece: after the selected piece's first free output (inserted in the
  // chain if that output already feeds something), or free in front of the
  // camera.
  addPiece(type) {
    const data = clone(this.data);
    let n = data.pieces.length + 1;
    while (data.pieces.some((p) => p.id === `p${n}`)) n++;
    const id = `p${n}`;
    const piece = { id, type, name: TYPES[type].label.replace(/ \(.*\)$/, ''), opts: {} };
    const sel = this.selected && this._builtPiece(this.selected);
    const out = sel?.outs[0];
    if (out && !TYPES[type].noInput) {
      const next = data.links.find((l) => l.from[0] === sel.id && l.from[1] === out.index);
      if (next) next.from = [id, 0];
      data.links.push({ from: [sel.id, out.index], to: [id, 0] });
      if (next && TYPES[type].noOutput) data.links = data.links.filter((l) => l !== next);
    } else {
      const cam = this.view.camera;
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const at = cam.position.clone().addScaledVector(dir, 3);
      piece.pose = { pos: [at.x, at.y - this.host.race().course.lift, at.z], yaw: Math.atan2(dir.x, dir.z), pitch: -0.1 };
    }
    data.pieces.splice(sel ? data.pieces.findIndex((p) => p.id === sel.id) + 1 : data.pieces.length, 0, piece);
    this.selected = id;
    this._commit(data);
  }

  // Delete the selected piece. Pieces linked after it stay where they are.
  deletePiece() {
    const id = this.selected;
    if (!id) return;
    const data = clone(this.data);
    for (const l of data.links.filter((l) => l.from[0] === id && l.to[1] === 0)) {
      const q = data.pieces.find((p) => p.id === l.to[0]);
      const b = this._builtPiece(l.to[0]);
      if (q && b) q.pose = { pos: [b.entry.pos.x, b.entry.pos.y, b.entry.pos.z], yaw: b.entry.yaw, pitch: b.entry.pitch ?? 0 };
    }
    data.pieces = data.pieces.filter((p) => p.id !== id);
    data.links = data.links.filter((l) => l.from[0] !== id && l.to[0] !== id);
    this.selected = null;
    this._commit(data);
  }

  // Unlink the selected piece from the piece before it, keeping it in place.
  detach() {
    const id = this.selected;
    const b = id && this._builtPiece(id);
    if (!b) return;
    const data = clone(this.data);
    const piece = data.pieces.find((p) => p.id === id);
    piece.pose = { pos: [b.entry.pos.x, b.entry.pos.y, b.entry.pos.z], yaw: b.entry.yaw, pitch: b.entry.pitch ?? 0 };
    data.links = data.links.filter((l) => l.to[0] !== id);
    this._commit(data);
  }

  // Field value as shown in the panel, and back.
  static show(field, v) {
    if (v === undefined || v === null) return '';
    return field.kind === 'deg' ? +(v * R2D).toFixed(2) : v;
  }

  static store(field, v) {
    return field.kind === 'deg' ? v * D2R : v;
  }
}
