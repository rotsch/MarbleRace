import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { STICKERS, OWN_COLOURS, drawSticker } from './stickers.js';
import { COLORS } from './config.js';
import {
  TEX_W, TEX_H, DESIGN_VERSION, PATTERNS, FINISHES, drawBase, finishParams, loadImage, newDesign,
  listDesigns, loadDesign, saveDesign, downloadDesign, readDesignFile, checkDesignName,
} from './designs.js';

// Marble paint editor: one big marble to paint on, turned with the mouse.
//
// Everything is painted straight onto the sphere, not onto the flat picture
// wrapped around it: a brush dab covers every texel within an angle of the
// point under the cursor, so brushes stay round all over the marble, also at
// the poles and across the seam. The picture is 1024 x 512 (see designs.js):
// a base layer (colour + pattern, kept as settings so it can be changed any
// time) under a paint layer (pixels, saved as a PNG).
//
// Tools: brush, spray, eraser, fill, ring (a band right round the marble),
// sticker (shapes, text or a picture of your own, projected onto the
// surface), colour picker and turn. Symmetry repeats every stroke mirrored or
// 2 to 8 times around the marble.
const W = TEX_W, H = TEX_H;
const TEXEL = Math.PI / H; // angle of one texel (at the equator)
const UNDO_MAX = 30;

const TOOLS = [
  { id: 'brush', label: 'Brush', key: 'b', hint: 'Paint with a round brush. Softness blurs its edge.' },
  { id: 'spray', label: 'Spray', key: 's', hint: 'Spray paint: hold to fill the circle with dots.' },
  { id: 'eraser', label: 'Eraser', key: 'e', hint: 'Remove paint and show the base underneath.' },
  { id: 'fill', label: 'Fill', key: 'f', hint: 'Fill an area of one colour (a stripe, a dot, the base).' },
  { id: 'ring', label: 'Ring', key: 'r', hint: 'Drag across the marble: a band right round it, through both points. Click for one across the view. Size sets its width.' },
  { id: 'sticker', label: 'Sticker', key: 't', hint: 'Click to stick a shape, text or picture onto the marble.' },
  { id: 'picker', label: 'Pick colour', key: 'i', hint: 'Click the marble to take its colour.' },
  { id: 'turn', label: 'Turn', key: 'h', hint: 'Drag to turn the marble.' },
];


const SWATCHES = ['#ffffff', '#d0d0d0', '#808080', '#3a3a3a', '#000000', ...COLORS.map((c) => `#${c.hex.toString(16).padStart(6, '0')}`)];

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => t * t * (3 - 2 * t);
// Brush size slider (1..100) to the brush's angular radius on the marble.
const brushAngle = (s) => 0.008 + (s / 100) ** 2 * 0.9;
const stickerAngle = (s) => 0.04 + (s / 100) * 0.95;

// Texel direction tables (see texelDir in designs.js).
const COS_P = new Float32Array(W), SIN_P = new Float32Array(W), COS_T = new Float32Array(H), SIN_T = new Float32Array(H);
for (let x = 0; x < W; x++) {
  const p = ((x + 0.5) / W) * Math.PI * 2;
  COS_P[x] = Math.cos(p);
  SIN_P[x] = Math.sin(p);
}
for (let y = 0; y < H; y++) {
  const t = ((y + 0.5) / H) * Math.PI;
  COS_T[y] = Math.cos(t);
  SIN_T[y] = Math.sin(t);
}
const texel = (d) => {
  // Texel under unit direction d.
  const theta = Math.acos(clamp(d.y, -1, 1));
  let phi = Math.atan2(d.z, -d.x);
  if (phi < 0) phi += Math.PI * 2;
  return [clamp(Math.floor((phi / (Math.PI * 2)) * W), 0, W - 1), clamp(Math.floor((theta / Math.PI) * H), 0, H - 1)];
};

export class Painter {
  constructor({ onSaved, onClose }) {
    this.onSaved = onSaved;
    this.onClose = onClose;
    this.root = $('painter');
    this.isOpen = false;
    this.tool = 'brush';
    this.color = '#ffffff';
    this.recent = [];
    this.size = 22;
    this.opacity = 100;
    this.softness = 15;
    this.symmetry = 'off';
    this.sticker = { shape: 'star', text: '7', size: 35, rot: 0, image: null };
    this.base = { pattern: 'solid', color: '#e53935', color2: '#ffffff' };
    this.finish = 'glossy';
    this.name = '';
    this.entry = null; // racer the design is for (index), or null
    this.dirty = false;
    this.undo = [];
    this.redo = [];

    // Layers: base (drawn from settings), paint (pixels), composite (texture).
    const canvas = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return [c, c.getContext('2d', { willReadFrequently: true })];
    };
    [this.baseCanvas, this.baseCtx] = canvas();
    [this.paintCanvas, this.paintCtx] = canvas();
    [this.compCanvas, this.compCtx] = canvas();
    this.paintData = new ImageData(W, H);
    this.px = this.paintData.data;
    this.cov = new Float32Array(W * H); // coverage of the current stroke
    this.base0 = null; // paint layer when the current stroke began
    this.dirtyRows = null; // [y0, y1] waiting to be shown
    this.texture = new THREE.CanvasTexture(this.compCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;

    this._buildUI();
    this._keys = this._keys.bind(this);
  }

  // ---------------------------------------------------------------------
  // 3D view

  _initView() {
    if (this.renderer) return;
    const canvas = $('pt-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(-2, 3, 4);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.zoom = 4.2;
    this.material = new THREE.MeshPhysicalMaterial({ map: this.texture, envMap: this.envMap, envMapIntensity: 0.9, iridescenceThicknessRange: [200, 600] });
    this.marble = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.material);
    this.scene.add(this.marble);

    // Brush outline: the edge of the brush's circle on the surface.
    const loop = (color) => {
      const pts = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      }
      return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    };
    this.cursor = new THREE.Group();
    this.cursorOuter = loop(0x111111);
    this.cursorInner = loop(0xffffff);
    this.cursorInner.scale.setScalar(0.96);
    this.cursor.add(this.cursorOuter, this.cursorInner);
    this.cursor.visible = false;
    this.marble.add(this.cursor);
    // Sticker preview: the sticker on the plane touching the marble, which
    // is exactly what the projection puts on the surface.
    this.stickerTex = new THREE.CanvasTexture(this.stampCanvas);
    this.stickerTex.colorSpace = THREE.SRGBColorSpace;
    this.stickerPreview = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.stickerTex, transparent: true, opacity: 0.75, depthWrite: false })
    );
    this.stickerPreview.visible = false;
    this.marble.add(this.stickerPreview);

    this.raycaster = new THREE.Raycaster();
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this._showCursor();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.001), 2.4, 9);
    }, { passive: false });
  }

  _resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth, h = c.clientHeight;
    const s = this.renderer.getSize(new THREE.Vector2());
    if (w && h && (s.x !== w || s.y !== h)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.1, (now - (this.last ?? now)) / 1000);
    this.last = now;
    this._resize();
    this.camera.position.set(0, 0, this.zoom);
    this.camera.lookAt(0, 0, 0);
    if (this.spin && !this.drag) this.marble.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dt * 0.8);
    if (this.drag?.kind === 'spray') this._spray(this.drag.p);
    this._flush();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this._frame(t));
  }

  // Unit point on the marble (marble's own coordinates) under the pointer.
  _hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.marble, false)[0];
    if (!hit) return null;
    return this.marble.worldToLocal(hit.point.clone()).normalize();
  }

  // The view's right and up directions in the marble's coordinates.
  _viewAxes() {
    const inv = this.marble.quaternion.clone().invert();
    return { right: new THREE.Vector3(1, 0, 0).applyQuaternion(inv), up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv) };
  }

  _down(e) {
    if (this.drag) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    const p = this._hit(e);
    const turn = e.button !== 0 || this.tool === 'turn' || !p;
    if (turn) {
      this.drag = { kind: 'turn', x: e.clientX, y: e.clientY };
      return;
    }
    switch (this.tool) {
      case 'picker': {
        this._flush();
        const [x, y] = texel(p);
        const d = this.compCtx.getImageData(x, y, 1, 1).data;
        this.setColor(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
        this.setTool(this.prevTool ?? 'brush');
        return;
      }
      case 'fill':
        this._begin();
        this._fill(p);
        this._end();
        return;
      case 'sticker':
        this._begin();
        this._stamp(p);
        this._end();
        return;
      case 'ring':
        this._begin();
        this.drag = { kind: 'ring', p0: p, p };
        this._ring(p, p);
        return;
      default:
        this._begin();
        this.drag = { kind: this.tool === 'spray' ? 'spray' : 'stroke', p };
        if (this.tool === 'spray') this._spray(p);
        else this._dab(p);
    }
  }

  _move(e) {
    const d = this.drag;
    if (d?.kind === 'turn') {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      this.marble.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), dx * 0.008);
      this.marble.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), dy * 0.008);
      return;
    }
    const p = this._hit(e);
    this.hover = p;
    this._showCursor();
    if (!d || !p) return;
    if (d.kind === 'stroke') {
      // Dabs along the arc from the last point, a quarter brush apart.
      const step = Math.max(TEXEL, brushAngle(this.size) * 0.25);
      const ang = d.p.angleTo(p);
      const n = Math.ceil(ang / step);
      const q = new THREE.Vector3();
      for (let i = 1; i <= n; i++) {
        q.copy(d.p).lerp(p, i / n).normalize();
        this._dab(q);
      }
      d.p = p;
    } else if (d.kind === 'spray') d.p = p;
    else if (d.kind === 'ring') {
      d.p = p;
      this._ring(d.p0, p);
    }
  }

  _up(e) {
    if (!this.drag) return;
    this.renderer.domElement.releasePointerCapture?.(e.pointerId);
    const kind = this.drag.kind;
    this.drag = null;
    if (kind !== 'turn') this._end();
  }

  _showCursor() {
    if (!this.cursor) return;
    const p = this.hover;
    const showRing = p && ['brush', 'spray', 'eraser', 'ring'].includes(this.tool) && this.drag?.kind !== 'turn';
    this.cursor.visible = !!showRing;
    if (showRing) {
      const a = brushAngle(this.size);
      this.cursor.position.copy(p).multiplyScalar(Math.cos(a) * 1.004);
      this.cursor.scale.setScalar(Math.sin(a) * 1.004);
      this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p);
    }
    const showSticker = p && this.tool === 'sticker' && !this.drag;
    this.stickerPreview.visible = !!showSticker;
    if (showSticker) {
      const { r, u } = this._stickerAxes(p);
      const h = Math.tan(stickerAngle(this.sticker.size));
      const m = new THREE.Matrix4().makeBasis(r, u, p);
      this.stickerPreview.quaternion.setFromRotationMatrix(m);
      this.stickerPreview.position.copy(p).multiplyScalar(1.003);
      this.stickerPreview.scale.setScalar(h);
    }
  }

  // ---------------------------------------------------------------------
  // Painting

  _begin() {
    this._pushUndo();
    this.base0 = this.px.slice();
    this.cov.fill(0);
  }

  _end() {
    this.base0 = null;
    this.dirty = true;
    this._addRecent(this.color);
  }

  // Symmetric copies of a direction (and of extra directions with it).
  _copies(...vs) {
    const sym = this.symmetry;
    const out = [vs];
    if (sym === 'mirror') out.push(vs.map((v) => new THREE.Vector3(-v.x, v.y, v.z)));
    else if (sym !== 'off') {
      const n = Number(sym);
      const axis = new THREE.Vector3(0, 1, 0);
      for (let k = 1; k < n; k++) out.push(vs.map((v) => v.clone().applyAxisAngle(axis, (k / n) * Math.PI * 2)));
    }
    return out;
  }

  _rgb() {
    const c = new THREE.Color(this.color);
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  }

  // Paint (or erase) texel i with coverage a (0..1) this stroke. Coverage
  // only grows within a stroke, so overlapping dabs do not build up.
  _merge(i, a, r, g, b, erase) {
    if (a <= this.cov[i]) return;
    this.cov[i] = a;
    const o = i * 4, s = this.base0, px = this.px;
    const dA = s[o + 3] / 255;
    if (erase) {
      px[o] = s[o];
      px[o + 1] = s[o + 1];
      px[o + 2] = s[o + 2];
      px[o + 3] = Math.round(dA * (1 - a) * 255);
      return;
    }
    const outA = a + dA * (1 - a);
    const k = dA * (1 - a);
    px[o] = (r * a + s[o] * k) / outA;
    px[o + 1] = (g * a + s[o + 1] * k) / outA;
    px[o + 2] = (b * a + s[o + 2] * k) / outA;
    px[o + 3] = Math.round(outA * 255);
  }

  _markRows(y0, y1) {
    if (!this.dirtyRows) this.dirtyRows = [y0, y1];
    else {
      this.dirtyRows[0] = Math.min(this.dirtyRows[0], y0);
      this.dirtyRows[1] = Math.max(this.dirtyRows[1], y1);
    }
  }

  // Calls fn(dot, i) for every texel within angle `ang` of unit point p,
  // dot being the cosine of the angle between the texel and p.
  _cap(p, ang, fn) {
    const cosA = Math.cos(Math.min(Math.PI, ang + TEXEL * 1.5));
    const thetaP = Math.acos(clamp(p.y, -1, 1));
    let phiP = Math.atan2(p.z, -p.x);
    if (phiP < 0) phiP += Math.PI * 2;
    const sTP = Math.sin(thetaP), cTP = Math.cos(thetaP);
    const y0 = clamp(Math.floor(((thetaP - ang) / Math.PI) * H) - 2, 0, H - 1);
    const y1 = clamp(Math.ceil(((thetaP + ang) / Math.PI) * H) + 2, 0, H - 1);
    for (let y = y0; y <= y1; y++) {
      const st = SIN_T[y], ct = COS_T[y];
      const den = st * sTP;
      let dphi = Math.PI;
      if (den > 1e-6) {
        const rhs = (cosA - ct * cTP) / den;
        if (rhs > 1) continue;
        if (rhs > -1) dphi = Math.acos(rhs) + (2 * Math.PI) / W;
      }
      let xa = 0, xb = W - 1;
      if (dphi < Math.PI) {
        xa = Math.floor(((phiP - dphi) / (Math.PI * 2)) * W);
        xb = Math.ceil(((phiP + dphi) / (Math.PI * 2)) * W);
      }
      const row = y * W;
      const ax = -st * p.x, az = st * p.z, ay = ct * p.y;
      for (let xr = xa; xr <= xb; xr++) {
        const x = ((xr % W) + W) % W;
        const dot = COS_P[x] * ax + ay + SIN_P[x] * az;
        if (dot >= cosA) fn(dot, row + x);
      }
    }
    this._markRows(y0, y1);
  }

  // Coverage of a round brush at angle `dist` from its centre.
  _falloff(dist, ang) {
    const t = dist / ang;
    if (t >= 1) return 0;
    const edge = Math.max(this.softness / 100, Math.min(1, (TEXEL * 1.2) / ang));
    if (t <= 1 - edge) return 1;
    return smooth((1 - t) / edge);
  }

  _dab(p) {
    const ang = brushAngle(this.size);
    const op = this.opacity / 100;
    const [r, g, b] = this._rgb();
    const erase = this.tool === 'eraser';
    for (const [q] of this._copies(p)) {
      this._cap(q, ang, (dot, i) => {
        const a = this._falloff(Math.acos(Math.min(1, dot)), ang) * op;
        if (a > 0) this._merge(i, a, r, g, b, erase);
      });
    }
  }

  _spray(p) {
    if (!p) return;
    const ang = brushAngle(this.size);
    const dotAng = Math.max(TEXEL * 1.3, ang * 0.05);
    const op = this.opacity / 100;
    const [r, g, b] = this._rgb();
    const n = 3 + Math.round(this.size / 8);
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      // A random point in the circle, spread evenly over its area.
      t1.set(Math.abs(p.y) < 0.9 ? 0 : 1, Math.abs(p.y) < 0.9 ? 1 : 0, 0).cross(p).normalize();
      t2.crossVectors(p, t1);
      const rr = ang * Math.sqrt(Math.random()), bb = Math.random() * Math.PI * 2;
      q.copy(p).multiplyScalar(Math.cos(rr))
        .addScaledVector(t1, Math.cos(bb) * Math.sin(rr))
        .addScaledVector(t2, Math.sin(bb) * Math.sin(rr))
        .normalize();
      for (const [c] of this._copies(q)) {
        this._cap(c, dotAng, (dot, i) => {
          const dist = Math.acos(Math.min(1, dot));
          const a = clamp((dotAng - dist) / TEXEL + 0.5, 0, 1) * op;
          if (a > 0) this._merge(i, a, r, g, b, false);
        });
      }
    }
  }

  // A band right round the marble through p0 and p1 (a great circle); for a
  // click (p0 = p1), across the view through that point.
  _ring(p0, p1) {
    let axis = new THREE.Vector3().crossVectors(p0, p1);
    if (axis.length() < 0.02) axis.crossVectors(p0, this._viewAxes().right);
    if (axis.length() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    // Start again from the paint as it was, so the band follows the drag.
    this.px.set(this.base0);
    this.cov.fill(0);
    const half = brushAngle(this.size);
    const op = this.opacity / 100;
    const [r, g, b] = this._rgb();
    const sinH = Math.sin(Math.min(Math.PI / 2, half + TEXEL * 1.5));
    for (const [ax] of this._copies(axis)) {
      for (let y = 0; y < H; y++) {
        const st = SIN_T[y], ct = COS_T[y];
        const bx = -st * ax.x, bz = st * ax.z, by = ct * ax.y;
        const row = y * W;
        for (let x = 0; x < W; x++) {
          const s = COS_P[x] * bx + by + SIN_P[x] * bz;
          if (Math.abs(s) > sinH) continue;
          const a = this._falloff(Math.abs(Math.asin(s)), half) * op;
          if (a > 0) this._merge(row + x, a, r, g, b, false);
        }
      }
    }
    this._markRows(0, H - 1);
  }

  // Flood fill on what the marble shows (base and paint), from p, over
  // texels of about the same colour. Wraps round the marble and over the poles.
  _fill(p) {
    this._flush();
    const comp = this.compCtx.getImageData(0, 0, W, H).data;
    const [sx, sy] = texel(p);
    const s0 = (sy * W + sx) * 4;
    const tr = comp[s0], tg = comp[s0 + 1], tb = comp[s0 + 2];
    const TOL = 48;
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let top = 0;
    stack[top++] = sy * W + sx;
    seen[sy * W + sx] = 1;
    const [r, g, b] = this._rgb();
    const op = this.opacity / 100;
    const push = (x, y) => {
      const i = y * W + x;
      if (seen[i]) return;
      seen[i] = 1;
      const o = i * 4;
      if (Math.abs(comp[o] - tr) + Math.abs(comp[o + 1] - tg) + Math.abs(comp[o + 2] - tb) > TOL) return;
      stack[top++] = i;
    };
    while (top) {
      const i = stack[--top];
      this._merge(i, op, r, g, b, false);
      const x = i % W, y = (i - x) / W;
      push((x + 1) % W, y);
      push((x + W - 1) % W, y);
      if (y > 0) push(x, y - 1);
      else push((x + W / 2) % W, 0);
      if (y < H - 1) push(x, y + 1);
      else push((x + W / 2) % W, H - 1);
    }
    this._markRows(0, H - 1);
  }

  // Sticker axes at p: the view's right and up, laid onto the surface and
  // turned by the sticker's rotation.
  _stickerAxes(p) {
    const { right, up } = this._viewAxes();
    const u = up.clone().addScaledVector(p, -up.dot(p));
    if (u.lengthSq() < 1e-6) u.copy(right).addScaledVector(p, -right.dot(p));
    u.normalize();
    const r = new THREE.Vector3().crossVectors(u, p).normalize();
    const rot = (this.sticker.rot * Math.PI) / 180;
    const r2 = r.clone().multiplyScalar(Math.cos(rot)).addScaledVector(u, -Math.sin(rot));
    const u2 = u.clone().multiplyScalar(Math.cos(rot)).addScaledVector(r, Math.sin(rot));
    return { r: r2, u: u2 };
  }

  // Project the sticker onto the marble around p (from the marble's centre,
  // so it looks just like the flat sticker held against the marble).
  _stamp(p) {
    const st = this.stampData;
    if (!st) return;
    const half = stickerAngle(this.sticker.size);
    const h = Math.tan(half);
    const S = this.stampCanvas.width;
    const { r, u } = this._stickerAxes(p);
    const op = this.opacity / 100;
    const tinted = this.stampTinted;
    const [cr, cg, cb] = this._rgb();
    const reach = Math.min(Math.PI / 2 - 0.01, Math.atan(h * Math.SQRT2));
    for (const [q, rr, uu] of this._copies(p, r, u)) {
      this._cap(q, reach, (dot, i) => {
        const x = i % W, y = (i - x) / W;
        const st2 = SIN_T[y];
        const dx = -COS_P[x] * st2, dy = COS_T[y], dz = SIN_P[x] * st2;
        const px = (dx * rr.x + dy * rr.y + dz * rr.z) / dot / h;
        const py = (dx * uu.x + dy * uu.y + dz * uu.z) / dot / h;
        if (px <= -1 || px >= 1 || py <= -1 || py >= 1) return;
        // Bilinear sample (colour weighted by alpha), for smooth edges.
        const fx = ((px + 1) / 2) * S - 0.5, fy = ((1 - py) / 2) * S - 0.5;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        let sa = 0, sr = 0, sg = 0, sb = 0;
        for (let k = 0; k < 4; k++) {
          const xx = x0 + (k & 1), yy = y0 + (k >> 1);
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          const w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
          const o = (yy * S + xx) * 4;
          const wa = (w * st[o + 3]) / 255;
          sa += wa;
          sr += wa * st[o];
          sg += wa * st[o + 1];
          sb += wa * st[o + 2];
        }
        const a = sa * op;
        if (a <= 0.002) return;
        if (tinted) this._merge(i, a, cr, cg, cb, false);
        else this._merge(i, a, sr / sa, sg / sa, sb / sa, false);
      });
    }
  }

  // Show changed paint rows on the marble.
  _flush() {
    if (!this.dirtyRows) return;
    const [y0, y1] = this.dirtyRows;
    this.dirtyRows = null;
    const h = y1 - y0 + 1;
    this.paintCtx.putImageData(this.paintData, 0, 0, 0, y0, W, h);
    this.compCtx.clearRect(0, y0, W, h);
    this.compCtx.drawImage(this.baseCanvas, 0, y0, W, h, 0, y0, W, h);
    this.compCtx.drawImage(this.paintCanvas, 0, y0, W, h, 0, y0, W, h);
    this.texture.needsUpdate = true;
  }

  _redrawBase() {
    drawBase(this.baseCtx, this.base);
    this._markRows(0, H - 1);
  }

  _applyFinish() {
    if (this.material) {
      Object.assign(this.material, finishParams(this.finish));
      this.material.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------
  // Undo

  _snapshot() {
    return { px: this.px.slice(), base: { ...this.base }, finish: this.finish };
  }

  _restore(s) {
    this.px.set(s.px);
    const baseChanged = JSON.stringify(s.base) !== JSON.stringify(this.base);
    this.base = { ...s.base };
    this.finish = s.finish;
    if (baseChanged) this._redrawBase();
    this._markRows(0, H - 1);
    this._applyFinish();
    this._showSettings();
    this.dirty = true;
  }

  _pushUndo() {
    this.undo.push(this._snapshot());
    if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.redo.length = 0;
  }

  undoStep() {
    if (!this.undo.length) return;
    this.redo.push(this._snapshot());
    this._restore(this.undo.pop());
  }

  redoStep() {
    if (!this.redo.length) return;
    this.undo.push(this._snapshot());
    this._restore(this.redo.pop());
  }

  // ---------------------------------------------------------------------
  // Opening, closing, saving

  // design: a design to edit (a plain colour starts a new design based on
  // it), or null. entry: the racer it is for, or null.
  async open(design = null, entry = null, suggestedName = '') {
    this._initView();
    this.entry = entry;
    await this._load(design ?? newDesign(), suggestedName);
    this.loadedName = design && !design.builtin ? design.name : null;
    this.undo.length = 0;
    this.redo.length = 0;
    this.dirty = false;
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('painting');
    if (document.pointerLockElement) document.exitPointerLock();
    window.addEventListener('keydown', this._keys, true);
    this._note(entry !== null ? `Painting for racer ${entry + 1}. Save to use it in the race.` : '');
    this._refreshLibrary();
    this.last = undefined;
    requestAnimationFrame((t) => this._frame(t));
  }

  async _load(design, suggestedName = '') {
    this.marble?.rotation.set(0.25, 0, 0); // the side the race setup's thumbnails show
    this.base = { ...design.base };
    this.finish = design.finish ?? 'glossy';
    this.name = design.builtin ? suggestedName : design.name || suggestedName;
    this.px.fill(0);
    if (design.paint) {
      try {
        const img = await loadImage(design.paint);
        this.paintCtx.clearRect(0, 0, W, H);
        this.paintCtx.drawImage(img, 0, 0, W, H);
        this.px.set(this.paintCtx.getImageData(0, 0, W, H).data);
      } catch (err) {
        alert(`The design's paint did not load: ${err.message}`);
      }
    }
    this._redrawBase();
    this._applyFinish();
    this._showSettings();
  }

  close(force = false) {
    if (!this.isOpen) return;
    if (!force && this.dirty && !confirm('Close the paint editor? Unsaved changes are lost.')) return;
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('painting');
    window.removeEventListener('keydown', this._keys, true);
    this.drag = null;
    this.onClose?.();
  }

  design() {
    this._flush();
    let empty = true;
    for (let i = 3; i < this.px.length; i += 4) {
      if (this.px[i]) {
        empty = false;
        break;
      }
    }
    return {
      kind: 'marble-design', version: DESIGN_VERSION, name: this.name.trim(),
      finish: this.finish, base: { ...this.base },
      paint: empty ? null : this.paintCanvas.toDataURL('image/png'),
    };
  }

  async save() {
    let name;
    try {
      name = checkDesignName(this.name);
    } catch (err) {
      this._note(err.message, true);
      $('pt-name').focus();
      return;
    }
    const library = await listDesigns().catch(() => []);
    if (library.includes(name) && name !== this.loadedName && !confirm(`There is already a design called "${name}". Replace it?`)) return;
    try {
      const { how, design } = await saveDesign({ ...this.design(), name });
      this.loadedName = name;
      this.dirty = false;
      this._note(how === 'saved' ? `Saved to marbles/${name}.json.` : `Saved in this browser and downloaded ${name}.json (put it in the marbles folder to share it).`);
      await this.onSaved?.(design, this.entry);
      this._refreshLibrary();
    } catch (err) {
      this._note(err.message, true);
    }
  }

  async _refreshLibrary() {
    const sel = $('pt-library');
    const names = await listDesigns().catch(() => []);
    sel.replaceChildren(new Option(names.length ? 'Open a saved design…' : 'No saved designs yet', ''), ...names.map((n) => new Option(n, n)));
  }

  _note(text, bad = false) {
    const n = $('pt-note');
    n.textContent = text;
    n.classList.toggle('bad', bad);
  }

  // ---------------------------------------------------------------------
  // Controls

  setTool(id) {
    if (id === 'picker' && this.tool !== 'picker') this.prevTool = this.tool;
    this.tool = id;
    for (const b of this.toolButtons) b.classList.toggle('on', b.dataset.tool === id);
    $('pt-tool-hint').textContent = TOOLS.find((t) => t.id === id)?.hint ?? '';
    $('pt-sticker-box').hidden = id !== 'sticker';
    $('pt-canvas').style.cursor = id === 'turn' ? 'grab' : id === 'picker' ? 'copy' : 'crosshair';
    this._showCursor();
  }

  setColor(c) {
    this.color = c;
    $('pt-color').value = c;
    if (this.stampCanvas) this._makeStamp();
  }

  _addRecent(c) {
    this.recent = [c, ...this.recent.filter((x) => x !== c)].slice(0, 10);
    const box = $('pt-recent');
    box.replaceChildren(...this.recent.map((x) => this._swatch(x)));
  }

  _swatch(c) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => this.setColor(c));
    return b;
  }

  _buildUI() {
    // Tools
    const tools = $('pt-tools');
    this.toolButtons = TOOLS.map((t) => {
      const b = document.createElement('button');
      b.dataset.tool = t.id;
      b.className = 'tool';
      b.innerHTML = `${t.label} <kbd>${t.key.toUpperCase()}</kbd>`;
      b.title = t.hint;
      b.addEventListener('click', () => this.setTool(t.id));
      tools.append(b);
      return b;
    });
    const slider = (id, key, fmt) => {
      const input = $(id);
      const out = $(`${id}-v`);
      const show = () => (out.textContent = fmt(this[key]));
      input.addEventListener('input', () => {
        this[key] = Number(input.value);
        show();
        this._showCursor();
      });
      return () => {
        input.value = String(this[key]);
        show();
      };
    };
    this._showSliders = [
      slider('pt-size', 'size', (v) => String(v)),
      slider('pt-opacity', 'opacity', (v) => `${v}%`),
      slider('pt-softness', 'softness', (v) => `${v}%`),
    ];
    $('pt-symmetry').addEventListener('change', (e) => (this.symmetry = e.target.value));
    $('pt-undo').addEventListener('click', () => this.undoStep());
    $('pt-redo').addEventListener('click', () => this.redoStep());
    $('pt-clear').addEventListener('click', () => {
      this._pushUndo();
      this.px.fill(0);
      this._markRows(0, H - 1);
      this.dirty = true;
    });
    $('pt-spin').addEventListener('change', (e) => (this.spin = e.target.checked));

    // Colour
    $('pt-color').addEventListener('input', (e) => this.setColor(e.target.value));
    $('pt-swatches').append(...SWATCHES.map((c) => this._swatch(c)));

    // Sticker
    const shape = $('pt-shape');
    for (const grp of STICKERS) {
      const og = document.createElement('optgroup');
      og.label = grp.group;
      og.append(...grp.items.map(([id, label]) => new Option(label, id)));
      shape.append(og);
    }
    shape.addEventListener('change', () => {
      if (shape.value === 'image') {
        $('pt-image-file').click();
        return;
      }
      this.sticker.shape = shape.value;
      this._makeStamp();
    });
    $('pt-image-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) {
        shape.value = this.sticker.shape;
        return;
      }
      try {
        this.sticker.image = await loadImage(URL.createObjectURL(file));
        this.sticker.shape = 'image';
        this._makeStamp();
      } catch (err) {
        alert(err.message);
        shape.value = this.sticker.shape;
      }
    });
    $('pt-text').addEventListener('input', (e) => {
      this.sticker.text = e.target.value;
      if (this.sticker.shape !== 'text' && this.sticker.shape !== 'badge') {
        this.sticker.shape = 'text';
        shape.value = 'text';
      }
      this._makeStamp();
    });
    for (const [id, key] of [['pt-sticker-size', 'size'], ['pt-sticker-rot', 'rot']]) {
      $(id).addEventListener('input', (e) => {
        this.sticker[key] = Number(e.target.value);
        $(`${id}-v`).textContent = key === 'rot' ? `${e.target.value}°` : e.target.value;
        this._showCursor();
      });
    }
    this.stampCanvas = document.createElement('canvas');
    this.stampCanvas.width = this.stampCanvas.height = 512;
    this._makeStamp();

    // Base and finish. Undo takes one step per change (not per drag of a
    // colour picker).
    $('pt-pattern').append(...PATTERNS.map((p) => new Option(p.label, p.id)));
    $('pt-finish').append(...FINISHES.map((f) => new Option(f.label, f.id)));
    const baseInput = (id, key, event) => {
      const el = $(id);
      let editing = false;
      el.addEventListener(event, () => {
        if (!editing) this._pushUndo();
        editing = event === 'input';
        this.base[key] = el.value;
        this._redrawBase();
        this.dirty = true;
      });
      el.addEventListener('change', () => (editing = false));
    };
    baseInput('pt-pattern', 'pattern', 'change');
    baseInput('pt-base1', 'color', 'input');
    baseInput('pt-base2', 'color2', 'input');
    $('pt-swap').addEventListener('click', () => {
      this._pushUndo();
      [this.base.color, this.base.color2] = [this.base.color2, this.base.color];
      this._redrawBase();
      this._showSettings();
      this.dirty = true;
    });
    $('pt-finish').addEventListener('change', (e) => {
      this._pushUndo();
      this.finish = e.target.value;
      this._applyFinish();
      this.dirty = true;
    });

    // Design
    const name = $('pt-name');
    name.addEventListener('input', () => (this.name = name.value));
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.save();
    });
    $('pt-save').addEventListener('click', () => this.save());
    $('pt-export').addEventListener('click', () => {
      const d = this.design();
      downloadDesign({ ...d, name: d.name || 'marble' });
    });
    $('pt-import').addEventListener('click', () => $('pt-file').click());
    $('pt-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const d = await readDesignFile(file);
        this._pushUndo();
        await this._load(d);
        this.loadedName = null;
        this.dirty = true;
        this._note(`Imported "${d.name}". Save it to add it to the marbles folder.`);
      } catch (err) {
        this._note(err.message, true);
      }
    });
    $('pt-library').addEventListener('change', async (e) => {
      const n = e.target.value;
      e.target.value = '';
      if (!n) return;
      if (this.dirty && !confirm(`Open "${n}"? Unsaved changes are lost.`)) return;
      try {
        await this._load(await loadDesign(n));
        this.loadedName = n;
        this.undo.length = 0;
        this.redo.length = 0;
        this.dirty = false;
        this._note(`Opened "${n}".`);
      } catch (err) {
        this._note(err.message, true);
      }
    });
    $('pt-new').addEventListener('click', async () => {
      if (this.dirty && !confirm('Start a new design? Unsaved changes are lost.')) return;
      await this._load(newDesign());
      this.loadedName = null;
      this.undo.length = 0;
      this.redo.length = 0;
      this.dirty = false;
    });
    $('pt-close').addEventListener('click', () => this.close());
    this.setTool('brush');
    this.setColor(this.color);
  }

  _showSettings() {
    for (const f of this._showSliders) f();
    $('pt-pattern').value = this.base.pattern;
    $('pt-base1').value = this.base.color;
    $('pt-base2').value = this.base.color2;
    $('pt-finish').value = this.finish;
    $('pt-name').value = this.name;
    $('pt-symmetry').value = this.symmetry;
    $('pt-text').value = this.sticker.text;
    $('pt-sticker-size').value = String(this.sticker.size);
    $('pt-sticker-size-v').textContent = String(this.sticker.size);
    $('pt-sticker-rot').value = String(this.sticker.rot);
    $('pt-sticker-rot-v').textContent = `${this.sticker.rot}°`;
  }

  // Draw the sticker (white, tinted when stamped; a picture keeps its colours).
  _makeStamp() {
    const c = this.stampCanvas;
    const S = c.width;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, S, S);
    const shape = this.sticker.shape;
    const fill = shape === 'image' ? '#ffffff' : this.color;
    g.fillStyle = fill;
    g.strokeStyle = fill;
    g.save();
    g.translate(S / 2, S / 2);
    g.scale(S / 2, S / 2); // drawing space: -1..1
    if (shape === 'text') {
      g.restore();
      g.save();
      const text = this.sticker.text || ' ';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let px = 400;
      g.font = `bold ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
      const w = g.measureText(text).width;
      if (w > S * 0.94) px = Math.floor((px * S * 0.94) / w);
      g.font = `bold ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
      g.fillText(text, S / 2, S / 2 + px * 0.04);
    } else if (shape === 'image') {
      g.restore();
      g.save();
      const img = this.sticker.image;
      if (img) {
        const k = Math.min(S / img.width, S / img.height);
        g.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k);
      }
    } else {
      drawSticker(g, shape, this.sticker.text); // see stickers.js
    }
    g.restore();
    this.stampData = g.getImageData(0, 0, S, S).data;
    this.stampTinted = !OWN_COLOURS.has(shape); // the eye and pictures keep their colours
    if (this.stickerTex) this.stickerTex.needsUpdate = true;
  }

  _keys(e) {
    e.stopPropagation(); // the race's keys are off while painting
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && t.type !== 'range') {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) this.redoStep();
      else this.undoStep();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      this.redoStep();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this.save();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return this.close();
    if (e.key === '[' || e.key === ']') {
      this.size = clamp(this.size + (e.key === ']' ? 3 : -3), 1, 100);
      this._showSettings();
      this._showCursor();
      return;
    }
    const tool = TOOLS.find((x) => x.key === e.key.toLowerCase());
    if (tool) this.setTool(tool.id);
  }
}
