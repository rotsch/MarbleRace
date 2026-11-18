import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { MARBLE, TRACK } from './config.js';
import { applyTrackTexture } from './trackTexture.js';
import { NeonTheme } from './themes/neon.js';
import { ItsenseTheme } from './themes/itsense.js';
import { setDecorTheme } from './course/decor.js';
import { colorDesign, marbleMaterial } from './designs.js';
import { DropIns } from './dropIn.js';
import { Dust } from './dust.js';
import { WORLD_ORIGIN } from './worldOrigin.js';

// Dust colour per theme.
const DUST = { white: 0xd0d0d0, neon: 0xffb8ea, itsense: 0xe6dccf, pictures: 0xd8d2c8 };

// Tone mapping per graphics setting, with the exposure that keeps a lit
// white track about as bright as it is without.
const TONE = {
  off: { mapping: THREE.NoToneMapping, exposure: 1 },
  aces: { mapping: THREE.ACESFilmicToneMapping, exposure: 1.25 },
  agx: { mapping: THREE.AgXToneMapping, exposure: 1.35 },
};
// ITSENSE has a stronger sun: a little less exposure keeps its cream track
// from turning grey.
const THEME_EXPOSURE = { itsense: 0.88 };

// Renderer, the boundless white space, lighting, marble meshes and the debug overlay.
export class View {
  // graphics: the settings from graphics.js. Antialiasing is fixed when the
  // renderer is made; everything else can change later (setGraphics).
  constructor(canvas, graphics) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: graphics.antialias });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);

    // Reflections: a neutral studio room, or the theme's own sky (see
    // _updateReflections).
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.roomEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.envMap = this.roomEnv;
    this.themeEnv = null; // render target of the theme's reflections

    this.materials = {
      surface: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
      outline: new THREE.LineBasicMaterial({ color: 0x000000 }),
      envMap: this.envMap, // for glossy decoration (spectator marbles)
    };
    // Pictures from the textures/ folder as a random mosaic on every course
    // surface. Off (plain white) until switched on with T.
    this.trackTexture = applyTrackTexture(this.materials.surface);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 1.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.scene.add(this.sun, this.sun.target);
    this.sunOffset = new THREE.Vector3(7, 26, 5);
    this.sunDir = this.sunOffset.clone().negate().normalize();
    // Real shadows from the sun: track surfaces, decoration and marbles cast
    // and receive them; the theme's ground and sky do not (see
    // CourseContext._visual and addDecor). The shadow box follows the camera
    // focus (see _placeSun); its resolution is a graphics setting.
    const sh = this.sun.shadow;
    sh.bias = -0.0004;
    sh.normalBias = 0.02;
    sh.camera.near = 1;
    sh.camera.far = 160;
    this.shadowHalf = 0;
    // Light-space axes for snapping the shadow box to whole texels, so the
    // shadow edges do not shimmer while the camera moves.
    this.sunRight = new THREE.Vector3().crossVectors(this.sunDir, new THREE.Vector3(0, 1, 0)).normalize();
    this.sunUp = new THREE.Vector3().crossVectors(this.sunRight, this.sunDir).normalize();
    // Contact shadows: a small soft blob right under each marble that is on
    // or just above the track, the darkening where it touches.
    this.shadowTexture = this._shadowTexture();
    this.shadows = [];

    this.courseGroup = null;
    this.marbleMeshes = [];
    this.sphere = null; // built in setRace, since the marble size can change
    this.sphereKey = null;
    this.ao = null; // ambient occlusion pass, made when first switched on

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

    // Themes (T): 'white' (default), 'neon' and 'itsense' (see themes/),
    // 'pictures'.
    this.themeName = 'white';
    this.themes = { neon: new NeonTheme(this.scene), itsense: new ItsenseTheme(this.scene) };
    this.clock = new THREE.Clock();

    // Endless mode: pieces dropping in, dust where they land, and the level
    // the themes' ground lies at (it goes down with the track).
    this.dropIns = new DropIns(() => this.themes[this.themeName]?.track ?? this.materials.surface);
    this.dust = new Dust();
    this.scene.add(this.dust.points);
    this.floorY = 0;
    this.floorSet = false;

    window.addEventListener('resize', () => this.resize());
    this.setGraphics(graphics);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._sizeAo();
  }

  // Apply graphics settings (see graphics.js), all but antialiasing.
  setGraphics(g) {
    this.graphics = { ...g };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * Number(g.resolution));
    this._applyTone();
    // Sun shadows: shadow map size per level, off for 'off' and 'contact'.
    // Turning castShadow on or off recompiles the materials by itself.
    const size = { low: 1024, high: 2048, ultra: 4096 }[g.shadows] ?? 0;
    const sh = this.sun.shadow;
    this.sun.castShadow = size > 0;
    if (size && sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null; // made again at the new size
      this.shadowHalf = 0;
    }
    sh.radius = g.shadows === 'low' ? 1 : 1.5;
    this.contactShadows = g.shadows !== 'off';
    if (!this.contactShadows) for (const s of this.shadows) s.visible = false;
    // Marbles: rounder spheres or fewer triangles.
    if (this.sphere) this._buildSphere();
    // Decoration lives on layer 1 (see CourseContext.addDecor); the shadow
    // map follows the camera's layers, so hidden decoration casts nothing.
    this.camera.layers.set(0);
    if (g.decorations) this.camera.layers.enable(1);
    this.dust.points.visible = g.dust;
    if (g.ao !== 'off') this._makeAo();
    this.resize();
    this._updateReflections();
  }

  // Tone mapping: bright light rolls off smoothly instead of clipping to
  // flat white. The exposure keeps lit white surfaces about as bright as
  // without it. Marbles are left out (see _marbleMaterial).
  _applyTone() {
    const tone = TONE[this.graphics.tone] ?? TONE.off;
    this.renderer.toneMapping = tone.mapping;
    this.renderer.toneMappingExposure = tone.exposure * (THEME_EXPOSURE[this.themeName] ?? 1);
  }

  // The marble sphere for the current size and detail, given to every marble.
  _buildSphere() {
    const [w, h] = this.graphics.marbles === 'low' ? [18, 12] : [40, 28];
    const key = `${MARBLE.radius}:${w}`;
    if (this.sphere && this.sphereKey === key) return;
    this.sphere?.dispose();
    this.sphere = new THREE.SphereGeometry(MARBLE.radius, w, h);
    this.sphereKey = key;
    for (const m of this.marbleMeshes) m.geometry = this.sphere;
    for (const m of this.shotMeshes?.values() ?? []) m.geometry = this.sphere;
  }

  // Ambient occlusion (GTAO): darkens corners and seams where little of the
  // sky gets in. The scene is drawn as usual and the occlusion multiplied
  // on top, so tone mapping, the background and antialiasing stay as they
  // are. Low runs it at half resolution with fewer samples.
  _makeAo() {
    if (this.ao) return;
    this.ao = new GTAOPass(this.scene, this.camera, 2, 2);
    this.ao.output = GTAOPass.OUTPUT.Off; // only compute; blended in render()
    this.ao.updateGtaoMaterial({ radius: 0.14, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 12, rings: 3 });
    this.ao.blendIntensity = 1;
  }

  _sizeAo() {
    if (!this.ao || !this.graphics) return;
    const low = this.graphics.ao === 'low';
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(low ? 0.5 : 1);
    this.ao.setSize(Math.max(1, Math.floor(size.x)), Math.max(1, Math.floor(size.y)));
    this.ao.updateGtaoMaterial({ samples: low ? 8 : 16 });
    this.ao.updatePdMaterial({ samples: low ? 12 : 24 });
  }

  // Reflections on the marbles and other glossy things: the theme's own
  // sky and ground (captured once when the theme is switched on), or the
  // neutral studio room. The white themes have nothing around them, so they
  // keep the room.
  _updateReflections() {
    const theme = this.themes?.[this.themeName];
    let env = this.roomEnv;
    if (this.graphics.reflections === 'scene' && theme) {
      this.themeEnv?.dispose();
      theme.update(0, this.camera, this.floorY); // sky and ground around the camera
      // Only the theme's own surroundings: hide everything else meanwhile.
      const hidden = this.scene.children.filter((o) => o !== theme.group && !o.isLight && o.visible);
      for (const o of hidden) o.visible = false;
      const tone = this.renderer.toneMapping;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.themeEnv = this.pmrem.fromScene(this.scene, 0.02, 0.1, 1000, { position: this.camera.position });
      this.renderer.toneMapping = tone;
      for (const o of hidden) o.visible = true;
      env = this.themeEnv.texture;
    }
    this._setEnvMap(env);
    if (env === this.roomEnv && this.themeEnv) {
      this.themeEnv.dispose();
      this.themeEnv = null;
    }
  }

  // Give every glossy material in the scene the new reflections.
  _setEnvMap(env) {
    const old = this.envMap;
    this.envMap = this.materials.envMap = env;
    if (old === env) return;
    const mats = new Set([...(this.shotMaterials?.values() ?? [])]);
    this.scene.traverse((o) => o.material && mats.add(o.material));
    for (const m of mats) {
      if (m.envMap === old) {
        m.envMap = env;
        m.needsUpdate = true;
      }
    }
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
    this.dropIns.clear();
    this.dust.clear();
    WORLD_ORIGIN.value.set(0, 0, 0);
    this.floorY = 0;
    this.floorSet = false;
    for (const t of Object.values(this.themes)) t.setCourse(race.course);
    this._applyTrackMaterial();
    this.meshStats = null;
    if (this.wireframe) this._addWireframe();
    this._buildSphere();
    this.marbleMeshes = race.marbles.map((m) => {
      const mesh = new THREE.Mesh(this.sphere, this._marbleMaterial(m.design ?? m.color));
      mesh.castShadow = mesh.receiveShadow = true;
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

  // Contact shadow: a small blob on the course surface straight below each
  // marble. Other marbles, sensors and the invisible room floor are ignored.
  // It is darkest where the marble touches and gone a little above (the
  // sun's shadow map does the rest).
  updateShadows(race) {
    const R = race.RAPIER, r = MARBLE.radius;
    const course = race.course;
    const flags = R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS;
    const maxDist = r * 3;
    const n = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    race.marbles.forEach((m, i) => {
      const s = this.shadows[i], p = this.marbleMeshes[i].position;
      // Off, or the marble is ridden in the leader's view.
      if (!this.contactShadows || !this.marbleMeshes[i].visible) return (s.visible = false);
      const ray = new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
      const hit = race.world.castRayAndGetNormal(ray, r + maxDist, true, flags, undefined, undefined, undefined,
        (c) => course.isCourse(c.parent()?.handle));
      if (!hit) return (s.visible = false);
      const dist = Math.max(0, hit.timeOfImpact - r);
      const fade = 1 - dist / maxDist;
      n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (n.y < 0) n.negate(); // face back up towards the marble
      s.position.set(p.x, p.y - hit.timeOfImpact, p.z).addScaledVector(n, 0.002);
      s.quaternion.copy(q.setFromUnitVectors(z, n));
      s.scale.setScalar(r * (1.7 + dist * 1.2));
      s.material.opacity = 0.75 * fade * fade;
      s.visible = true;
    });
  }

  // Sun and its shadow box around the camera focus: wider the further the
  // camera is, in steps, and snapped to whole shadow texels.
  _placeSun(focus) {
    const want = THREE.MathUtils.clamp(this.camera.position.distanceTo(focus) * 1.2 + 4, 8, 40);
    const half = Math.ceil(want / 4) * 4;
    const cam = this.sun.shadow.camera;
    if (half !== this.shadowHalf) {
      this.shadowHalf = half;
      cam.left = cam.bottom = -half;
      cam.right = cam.top = half;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    const a = Math.round(focus.dot(this.sunRight) / texel) * texel;
    const b = Math.round(focus.dot(this.sunUp) / texel) * texel;
    const c = focus.dot(this.sunDir);
    const center = new THREE.Vector3()
      .addScaledVector(this.sunRight, a).addScaledVector(this.sunUp, b).addScaledVector(this.sunDir, c);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(this.sunDir, -80);
  }

  _disposeGroup(group) {
    this.scene.remove(group);
    group.traverse((o) => o.geometry?.dispose());
  }

  // Material for a marble design (see designs.js), or a plain colour: glossy
  // glass with a soft lighter swirl so rolling is visible.
  _marbleMaterial(design) {
    const m = marbleMaterial(typeof design === 'number' ? colorDesign(design) : design, this.envMap);
    // Tone mapping would wash out their bright colours: the marbles keep the
    // exact colours of their designs (and of the lineup beside the race).
    m.toneMapped = false;
    return m;
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
        mesh.castShadow = mesh.receiveShadow = true;
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
        wire.layers.mask = mesh.layers.mask; // hidden with hidden decoration
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

  // Switch the theme. Resolves to false when the pictures theme was asked for
  // but there are no pictures.
  async setTheme(name) {
    this.themeName = name;
    // Switch the others off first (neon's switch-off restores the white
    // room), then the chosen one on.
    for (const [key, t] of Object.entries(this.themes)) if (key !== name) t.setEnabled(false, this);
    this.themes[name]?.setEnabled(true, this);
    setDecorTheme(name);
    this._applyTrackMaterial();
    this._applyTone();
    this._updateReflections();
    this.dust.setColor(DUST[name] ?? DUST.white);
    const shown = await this.trackTexture.setEnabled(name === 'pictures');
    return name !== 'pictures' || shown > 0;
  }

  // Course surfaces (not decoration) wear the theme's track material.
  _applyTrackMaterial() {
    const mat = this.themes[this.themeName]?.track ?? this.materials.surface;
    this.courseGroup?.traverse((o) => {
      // Pieces still fading in or out get it when they are done.
      if (o.isMesh && !o.userData.decor && !o.isInstancedMesh && !this.dropIns.isFading(o)) o.material = mat;
    });
  }

  // Endless mode: act on what the course generator did since the last
  // frame (see course/endless.js). onLand(pos): a piece touched down there.
  endlessEvents(race, onLand) {
    const course = race.course;
    let delay = 0;
    for (const e of race.endless.events) {
      if (e.type === 'spawn') {
        const first = course.pieces.get(e.ids[0]);
        e.ids.forEach((id) => {
          const p = course.pieces.get(id);
          if (!p?.group) return;
          // Only the first piece of a unit lands on the track: the dust
          // goes where it joins the track that was already there.
          this.dropIns.drop(p.group, delay, p === first ? () => {
            const s = first.ins[0];
            if (!s) return;
            const L = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
            const F = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
            const pos = s.pos.clone().add(course.group.position);
            this.dust.burst(pos, L, F, TRACK.width + 2 * TRACK.railThickness);
            onLand?.(pos);
          } : null);
        });
        delay += 0.08; // several at once (catching up): one after the other
      } else if (e.type === 'despawn') {
        for (const id of e.ids) {
          const p = course.pieces.get(id);
          if (p?.group) this.dropIns.remove(p.group, () => course.removeGroup(id));
        }
      } else if (e.type === 'rebase') {
        this.shift(e.offset);
      }
    }
    race.endless.events.length = 0;
  }

  // Endless mode: everything moved by offset (floating origin). What the
  // course and the bodies do not carry along moves here.
  shift(offset) {
    WORLD_ORIGIN.value.add(offset);
    this.dust.shift(offset);
    this.floorY += offset.y;
    for (const t of Object.values(this.themes)) t.shift?.(offset);
  }

  // Endless mode: the ground sits a little below the lowest piece on screen
  // and follows it down smoothly.
  updateFloor(race, dt) {
    if (!race.endless) {
      this.floorY = 0;
      return;
    }
    let low = Infinity;
    for (const u of race.endless.units) {
      for (const id of u.ids) low = Math.min(low, race.course.pieces.get(id)?.bounds.min.y ?? Infinity);
    }
    if (!Number.isFinite(low)) return;
    const want = low - 3;
    if (!this.floorSet) {
      this.floorY = want;
      this.floorSet = true;
    } else this.floorY += (want - this.floorY) * (1 - Math.exp(-dt * 0.6));
  }

  render(focus) {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.dropIns.update(dt);
    this.dust.update(dt, this.camera, this.renderer.domElement.height);
    for (const t of Object.values(this.themes)) t.update(dt, this.camera, this.floorY);
    this._placeSun(focus);
    this.renderer.render(this.scene, this.camera);
    if (this.graphics.ao !== 'off' && this.ao) {
      // Occlusion from depth and normals, multiplied onto the frame. Only
      // the course and the marbles: the theme's sky, ground and mountains
      // (some without normals) are left out, as if far away.
      const backdrop = Object.values(this.themes).filter((t) => t.group.visible);
      for (const t of backdrop) t.group.visible = false;
      this.ao.render(this.renderer, null, null);
      for (const t of backdrop) t.group.visible = true;
      this.ao.blendMaterial.uniforms.intensity.value = this.ao.blendIntensity;
      this.ao.blendMaterial.uniforms.tDiffuse.value = this.ao.pdRenderTarget.texture;
      this.ao._renderPass(this.renderer, this.ao.blendMaterial, null);
    }
  }
}
