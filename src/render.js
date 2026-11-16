import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MARBLE } from './config.js';

// Renderer, the white room, lighting, marble meshes and the debug overlay.
export class View {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e9e9, 1.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 5;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 1;
    sc.far = 90;
    this.scene.add(this.sun, this.sun.target);
    this.sunOffset = new THREE.Vector3(7, 26, 5);

    this.room = null;
    this.courseGroup = null;
    this.marbleMeshes = [];
    this.sphere = new THREE.SphereGeometry(MARBLE.radius, 40, 28);

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
    if (this.room) this._disposeGroup(this.room);
    for (const m of this.marbleMeshes) {
      this.scene.remove(m);
      m.material.map?.dispose();
      m.material.dispose();
    }
    this.courseGroup = race.course.group;
    this.scene.add(this.courseGroup);
    this.room = this._buildRoom(race.course.bounds);
    this.scene.add(this.room);
    this.marbleMeshes = race.marbles.map((m) => {
      const mesh = new THREE.Mesh(this.sphere, this._marbleMaterial(m.color));
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    });
  }

  _disposeGroup(group) {
    this.scene.remove(group);
    group.traverse((o) => o.geometry?.dispose());
  }

  // Empty white room: floor and four walls around the course.
  _buildRoom(bounds) {
    const room = new THREE.Group();
    const pad = 14;
    const min = bounds.min, max = bounds.max;
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const sx = max.x - min.x + pad * 2, sz = max.z - min.z + pad * 2;
    const h = max.y + 12;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    room.add(floor);
    const wall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      room.add(m);
    };
    wall(sx, cx, cz - sz / 2, 0);
    wall(sx, cx, cz + sz / 2, Math.PI);
    wall(sz, cx - sx / 2, cz, Math.PI / 2);
    wall(sz, cx + sx / 2, cz, -Math.PI / 2);
    // Thin outlines where floor meets walls, so the room reads as a room.
    const box = new THREE.BoxGeometry(sx, h, sz);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xbbbbbb }));
    edges.position.set(cx, h / 2, cz);
    room.add(edges);
    return room;
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
    const light = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
    g.strokeStyle = `#${light.getHexString()}`;
    g.lineWidth = 9;
    for (const phase of [0, 2.1]) {
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
    // Keep the shadow frustum centred on what the camera looks at.
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.renderer.render(this.scene, this.camera);
  }
}
