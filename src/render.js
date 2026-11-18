import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MARBLE } from './config.js';
import { applyTrackTexture } from './trackTexture.js';
import { NeonTheme } from './theme.js';
import { setDecorLook } from './course/decor.js';
import { colorDesign, marbleMaterial } from './designs.js';

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
      envMap: this.envMap, // for glossy decoration (spectator marbles)
    };
    // Pictures from the textures/ folder as a random mosaic on every course
    // surface. Off (plain white) until switched on with T.
    this.trackTexture = applyTrackTexture(this.materials.surface);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 2.2);
    this.scene.add(this.hemi);
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

    // Mesh structure overlay (M): every triangle edge of the course meshes.
    this.wireframe = false;
    this.wireMaterials = {
      track: new THREE.LineBasicMaterial({ color: 0x1e63e9, transparent: true, opacity: 0.55 }),
      decor: new THREE.LineBasicMaterial({ color: 0xe0201b, transparent: true, opacity: 0.45 }),
    };
    this.meshStats = null;

    // Looks (T): 'white' (default), 'neon' (see theme.js), 'pictures'.
    this.look = 'white';
    this.theme = new NeonTheme(this.scene);
    this.clock = new THREE.Clock();

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
      m.material.dispose(); // the design's texture is shared and stays
    }
    for (const mesh of this.shotMeshes?.values() ?? []) this.scene.remove(mesh);
    this.shotMeshes?.clear();
    this.courseGroup = race.course.group;
    this.scene.add(this.courseGroup);
    this.theme.setCourse(race.course);
    this._applyTrackMaterial();
    this.meshStats = null;
    if (this.wireframe) this._addWireframe();
    if (!this.sphere || this.sphere.parameters.radius !== MARBLE.radius) {
      this.sphere?.dispose();
      this.sphere = new THREE.SphereGeometry(MARBLE.radius, 40, 28);
    }
    this.marbleMeshes = race.marbles.map((m) => {
      const mesh = new THREE.Mesh(this.sphere, this._marbleMaterial(m.design ?? m.color));
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

  // Material for a marble design (see designs.js), or a plain colour: glossy
  // glass with a soft lighter swirl so rolling is visible.
  _marbleMaterial(design) {
    return marbleMaterial(typeof design === 'number' ? colorDesign(design) : design, this.envMap);
  }

  // Give marble i another look (the race setup changed its design).
  setMarbleDesign(i, design) {
    const mesh = this.marbleMeshes[i];
    if (!mesh) return;
    mesh.material.dispose();
    mesh.material = this._marbleMaterial(design);
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

  // Meshes for marbles shot from the camera: added for new shots, dropped for
  // removed ones, placed straight from the physics state.
  updateShots(race) {
    this.shotMeshes ??= new Map();
    this.shotMaterials ??= new Map();
    for (const [shot, mesh] of this.shotMeshes) {
      if (race.shots.get(shot.collider.handle) !== shot) {
        this.scene.remove(mesh);
        this.shotMeshes.delete(shot);
      }
    }
    for (const shot of race.shots.values()) {
      let mesh = this.shotMeshes.get(shot);
      if (!mesh) {
        let mat = this.shotMaterials.get(shot.color);
        if (!mat) this.shotMaterials.set(shot.color, (mat = this._marbleMaterial(shot.color)));
        mesh = new THREE.Mesh(this.sphere, mat);
        this.scene.add(mesh);
        this.shotMeshes.set(shot, mesh);
      }
      const t = shot.body.translation(), r = shot.body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  setDebug(on) {
    this.debugLines.visible = on;
  }

  // Show the triangles of every course mesh (track pieces blue, decoration
  // red). Returns { meshes, triangles, vertices } of the course.
  setWireframe(on) {
    this.wireframe = on;
    if (on) this._addWireframe();
    else this.courseGroup?.traverse((o) => o.userData.wire && (o.visible = false));
    return this.meshStats;
  }

  _addWireframe() {
    const stats = { meshes: 0, triangles: 0, vertices: 0 };
    const meshes = [];
    this.courseGroup.traverse((o) => o.isMesh && meshes.push(o));
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const copies = mesh.isInstancedMesh ? mesh.count : 1;
      stats.meshes++;
      stats.vertices += g.attributes.position.count * copies;
      stats.triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * copies;
      // An instanced mesh draws its one geometry many times; a wireframe
      // child would show only a single copy at the origin, so leave it out.
      if (mesh.isInstancedMesh) continue;
      let wire = mesh.children.find((c) => c.userData.wire);
      if (!wire) {
        wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), mesh.userData.decor ? this.wireMaterials.decor : this.wireMaterials.track);
        wire.userData.wire = true;
        wire.renderOrder = 5;
        mesh.add(wire);
      }
      wire.visible = true;
    }
    this.meshStats = stats;
  }

  updateDebug(world) {
    if (!this.debugLines.visible) return;
    const { vertices, colors } = world.debugRender();
    const g = this.debugLines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }

  // Switch the look. Resolves to false when the pictures look was asked for
  // but there are no pictures.
  async setLook(look) {
    this.look = look;
    const neon = look === 'neon';
    this.theme.setEnabled(neon, this);
    setDecorLook(neon ? 'neon' : 'white');
    this._applyTrackMaterial();
    const shown = await this.trackTexture.setEnabled(look === 'pictures');
    return look !== 'pictures' || shown > 0;
  }

  // Course surfaces (not decoration) wear the neon material in the neon look.
  _applyTrackMaterial() {
    const mat = this.look === 'neon' ? this.theme.track : this.materials.surface;
    this.courseGroup?.traverse((o) => {
      if (o.isMesh && !o.userData.decor && !o.isInstancedMesh) o.material = mat;
    });
  }

  render(focus) {
    this.theme.update(Math.min(this.clock.getDelta(), 0.1), this.camera);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.renderer.render(this.scene, this.camera);
  }
}
