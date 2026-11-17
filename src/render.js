import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MARBLE } from './config.js';
import { applyTrackTexture } from './trackTexture.js';

// Renderer, the boundless white space, lighting, marble meshes and the debug overlay.
export class View {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.materials = {
      surface: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
      outline: new THREE.LineBasicMaterial({ color: 0x000000 }),
    };
    // Pictures from the textures/ folder as a random mosaic on every course
    // surface. Off (plain white) until switched on with T.
    this.trackTexture = applyTrackTexture(this.materials.surface);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 2.2));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.scene.add(this.sun, this.sun.target);
    this.sunOffset = new THREE.Vector3(7, 26, 5);
    // Marble shadows: no shadow map (the course casts no shadow, so a shadow
    // map would let marble shadows fall through onto every track below).
    // Instead a soft blob sits where a ray from the marble along the sunlight
    // first hits the course: only on the track the marble is on or above.
    this.sunDir = this.sunOffset.clone().negate().normalize();
    this.shadowTexture = this._shadowTexture();
    this.shadows = [];

    this.courseGroup = null;
    this.marbleMeshes = [];
    this.sphere = null; // built in setRace, since the marble size can change

    this.debugLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })
    );
    this.debugLines.frustumCulled = false;
    this.debugLines.renderOrder = 10;
    this.debugLines.visible = false;
    this.scene.add(this.debugLines);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Swap in a freshly built race (course meshes + marbles + a room sized to fit).
  setRace(race) {
    if (this.courseGroup) this._disposeGroup(this.courseGroup);
    for (const m of this.marbleMeshes) {
      this.scene.remove(m);
      m.material.map?.dispose();
      m.material.dispose();
    }
    this.courseGroup = race.course.group;
    this.scene.add(this.courseGroup);
    if (!this.sphere || this.sphere.parameters.radius !== MARBLE.radius) {
      this.sphere?.dispose();
      this.sphere = new THREE.SphereGeometry(MARBLE.radius, 40, 28);
    }
    this.marbleMeshes = race.marbles.map((m) => {
      const mesh = new THREE.Mesh(this.sphere, this._marbleMaterial(m.color));
      this.scene.add(mesh);
      return mesh;
    });
    for (const s of this.shadows) this.scene.remove(s);
    this.shadows = race.marbles.map(() => {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: this.shadowTexture, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        })
      );
      s.renderOrder = 1;
      s.visible = false;
      this.scene.add(s);
      return s;
    });
  }

  // Soft round shadow, dark in the middle and fading out.
  _shadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  // Place each marble's shadow on the first course surface along the
  // sunlight below it. Other marbles, sensors and the invisible room floor
  // are ignored. The shadow grows and fades the higher the marble is.
  updateShadows(race) {
    const R = race.RAPIER, r = MARBLE.radius;
    const course = race.course.body.handle;
    const flags = R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS;
    const maxDist = 3;
    const n = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    race.marbles.forEach((m, i) => {
      const s = this.shadows[i], p = this.marbleMeshes[i].position;
      if (!this.marbleMeshes[i].visible) return (s.visible = false); // ridden in the leader's view
      const ray = new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: this.sunDir.x, y: this.sunDir.y, z: this.sunDir.z });
      const hit = race.world.castRayAndGetNormal(ray, maxDist, true, flags, undefined, undefined, undefined,
        (c) => c.parent()?.handle === course);
      if (!hit) return (s.visible = false);
      const dist = Math.max(0, hit.timeOfImpact - r);
      const fade = 1 - dist / maxDist;
      n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (n.dot(this.sunDir) > 0) n.negate(); // face back towards the marble
      s.position.set(p.x + this.sunDir.x * hit.timeOfImpact, p.y + this.sunDir.y * hit.timeOfImpact, p.z + this.sunDir.z * hit.timeOfImpact)
        .addScaledVector(n, 0.002);
      s.quaternion.copy(q.setFromUnitVectors(z, n));
      s.scale.setScalar(r * (2.6 + dist * 1.5));
      s.material.opacity = fade * fade;
      s.visible = true;
    });
  }

  _disposeGroup(group) {
    this.scene.remove(group);
    group.traverse((o) => o.geometry?.dispose());
  }

  // Glossy glass look, with a soft lighter swirl so rolling is visible.
  _marbleMaterial(hex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    const base = new THREE.Color(hex);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, 256, 128);
    const light = base.clone().lerp(new THREE.Color(0xffffff), 0.35);
    g.strokeStyle = `#${light.getHexString()}`;
    g.lineWidth = 7;
    for (const phase of [0]) {
      g.beginPath();
      for (let x = -8; x <= 264; x += 4) {
        const y = 64 + Math.sin((x / 256) * Math.PI * 2 + phase) * 34;
        x === -8 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({
      map, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
      envMap: this.envMap, envMapIntensity: 0.9,
    });
  }

  // Interpolate marbles between the two latest physics states.
  updateMarbles(marbles, alpha) {
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
    for (let i = 0; i < marbles.length; i++) {
      const { prev: a, curr: b } = marbles[i];
      const mesh = this.marbleMeshes[i];
      mesh.position.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
      q0.set(a.qx, a.qy, a.qz, a.qw);
      q1.set(b.qx, b.qy, b.qz, b.qw);
      mesh.quaternion.slerpQuaternions(q0, q1, alpha);
    }
  }

  setDebug(on) {
    this.debugLines.visible = on;
  }

  updateDebug(world) {
    if (!this.debugLines.visible) return;
    const { vertices, colors } = world.debugRender();
    const g = this.debugLines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  render(focus) {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.renderer.render(this.scene, this.camera);
  }
}
