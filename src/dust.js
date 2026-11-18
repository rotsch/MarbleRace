import * as THREE from 'three';

// Puffs of dust where a dropped-in piece lands on the track (endless mode).
// One preallocated point cloud: each puff drifts out and up, slows down,
// grows and fades away within a second.
const MAX = 700;
const DRAG = 3.2; // per second
const RISE = 0.6; // units/s² of gentle lift (warm dust)

export class Dust {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX).fill(1);
    this.life = new Float32Array(MAX).fill(1);
    this.size0 = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.next = 0;
    this.live = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uColor: { value: new THREE.Color(0xd2d2d2) }, uScale: { value: 500 } };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aAlpha;
          varying float vAlpha;
          uniform float uScale;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vAlpha = aAlpha;
            gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = vAlpha * smoothstep(1.0, 0.0, r) * (0.75 + 0.25 * (1.0 - r));
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor * (0.92 + 0.08 * r), a);
          }`,
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setColor(hex) {
    this.uniforms.uColor.value.set(hex);
  }

  // A cloud along a seam: the socket pose `pos` with across-track axis `L`
  // and forward axis `F`, `width` wide.
  burst(pos, L, F, width, count = 44) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const x = (Math.random() - 0.5) * (width + 0.2);
      const out = Math.sign(x || 1) * (0.4 + Math.random() * 1.3);
      const fwd = (Math.random() - 0.5) * 0.9;
      const j = i * 3;
      this.pos[j] = pos.x + L.x * x + F.x * fwd * 0.1;
      this.pos[j + 1] = pos.y + 0.03 + Math.random() * 0.05;
      this.pos[j + 2] = pos.z + L.z * x + F.z * fwd * 0.1;
      this.vel[j] = L.x * out + F.x * fwd;
      this.vel[j + 1] = 0.25 + Math.random() * 0.7;
      this.vel[j + 2] = L.z * out + F.z * fwd;
      this.age[i] = 0;
      this.life[i] = 0.55 + Math.random() * 0.4;
      this.size0[i] = 0.06 + Math.random() * 0.08;
    }
    this.live = MAX;
  }

  shift(offset) {
    for (let i = 0; i < MAX; i++) {
      this.pos[i * 3] += offset.x;
      this.pos[i * 3 + 1] += offset.y;
      this.pos[i * 3 + 2] += offset.z;
    }
  }

  clear() {
    this.age.fill(1);
    this.life.fill(1);
    this.alpha.fill(0);
    this.live = 0;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  update(dt, camera, height) {
    if (!this.live) return;
    // Point size in pixels for a puff 1 unit across, 1 unit away.
    this.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const drag = Math.exp(-DRAG * dt);
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      any = true;
      this.age[i] += dt;
      const u = Math.min(1, this.age[i] / this.life[i]);
      const j = i * 3;
      this.vel[j] *= drag;
      this.vel[j + 1] = this.vel[j + 1] * drag + RISE * dt;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.size0[i] * (1 + u * 3.5);
      // Quick to appear, slow to fade.
      this.alpha[i] = 0.75 * Math.min(1, u * 8) * (1 - u) ** 1.6;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
    if (!any) this.live = 0;
  }
}
