import * as THREE from 'three';
import { WORLD_ORIGIN, ORIGIN_UNIFORM } from '../worldOrigin.js';

// "Neon dusk": the coloured theme (T). The white room becomes an evening sky
// over an endless glowing grid: a gradient from deep indigo to a hot pink
// horizon, a big striped sun sinking ahead of the course, twinkling stars,
// and low-poly shapes drifting around the course. The track runs through a
// rainbow from top to bottom (its colour follows height, so the start is a
// different colour from the finish and every level of the course stands
// apart), with candy stripes on the floors, brighter rails and dark
// undersides. Gantries and grandstands turn neon.
//
// Everything here is visual only; the white theme stays the default.

const HORIZON = new THREE.Color(0xff6f61);
const SUN_DIR = new THREE.Vector3(0.35, 0.07, 1).normalize();

export class NeonTheme {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.time = { value: 0 };

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), this._skyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.center = { value: new THREE.Vector2() };
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), this._groundMaterial());
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    this.floaters = new THREE.Group();
    this.group.add(this.floaters);

    this.track = trackMaterial(this.time);
    this.fog = new THREE.Fog(HORIZON, 70, 290);
  }

  // Scatter the drifting shapes around this course, clear of the track.
  setCourse(course) {
    for (const f of this.floaters.children) f.geometry.dispose();
    this.floaters.clear();
    // Endless mode: the course is built while it is raced and keeps going
    // down, so the shapes are scattered around the start and then travel
    // along with the camera, slowly, as a backdrop.
    this.follow = course.streaming;
    this.floaters.position.set(0, 0, 0);
    const b = course.streaming
      ? { min: new THREE.Vector3(-30, -30, -30), max: new THREE.Vector3(30, 0, 30) }
      : course.bounds;
    this.center.value.set((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
    let seed = 99991;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const shapes = [
      () => new THREE.IcosahedronGeometry(1, 0),
      () => new THREE.OctahedronGeometry(1, 0),
      () => new THREE.TorusGeometry(1, 0.32, 8, 20),
      () => new THREE.TetrahedronGeometry(1.2, 0),
      () => new THREE.TorusKnotGeometry(0.8, 0.25, 64, 8),
      () => new THREE.DodecahedronGeometry(1, 0),
    ];
    const colors = [0xff2a6d, 0x05d9e8, 0xd1f7ff, 0xffd319, 0xff901f, 0x9d4edd, 0x39ff14, 0xff00c8];
    const path = course.path;
    const margin = 14;
    for (let tries = 0, made = 0; made < 45 && tries < 2000; tries++) {
      const size = 0.6 + rnd() ** 2 * 3.2;
      const p = new THREE.Vector3(
        b.min.x - margin + rnd() * (b.max.x - b.min.x + margin * 2),
        b.min.y + rnd() * (b.max.y - b.min.y + 14),
        b.min.z - margin + rnd() * (b.max.z - b.min.z + margin * 2)
      );
      // Keep clear of the track and of the follow camera above it.
      const clear = 3.5 + size * 1.6;
      let ok = true;
      for (let i = 0; i < path.length && ok; i += 4) if (path[i].pos.distanceToSquared(p) < clear * clear) ok = false;
      if (!ok) continue;
      const color = colors[Math.floor(rnd() * colors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.2, flatShading: true,
      });
      const mesh = new THREE.Mesh(shapes[Math.floor(rnd() * shapes.length)](), mat);
      mesh.scale.setScalar(size);
      mesh.position.copy(p);
      mesh.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
      mesh.userData = { y: p.y, phase: rnd() * 6.28, spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.6) };
      this.floaters.add(mesh);
      made++;
    }
  }

  setEnabled(on, view) {
    this.enabled = on;
    this.group.visible = on;
    this.scene.fog = on ? this.fog : null;
    this.scene.background = on ? HORIZON : new THREE.Color(0xffffff);
    view.hemi.color.set(on ? 0xffd6f5 : 0xffffff);
    view.hemi.groundColor.set(on ? 0x3a1d6e : 0xdcdcdc);
    view.hemi.intensity = 1.3;
    view.sun.color.set(on ? 0xffc29a : 0xffffff);
    view.materials.outline.color.set(on ? 0x1a0a33 : 0x000000);
  }

  // Per frame: time for the shaders, the sky and grid stay around the camera,
  // shapes drift.
  // Endless mode: the world moved by offset; the shapes move with it.
  shift(offset) {
    if (this.follow) this.floaters.position.add(offset);
  }

  update(dt, camera, floorY = 0) {
    if (!this.enabled) return;
    this.time.value += dt;
    const t = this.time.value;
    this.sky.position.copy(camera.position);
    // floorY: where the ground lies (endless mode lowers it with the track).
    this.ground.position.set(camera.position.x, floorY, camera.position.z);
    if (this.follow) {
      const f = this.floaters.position, k = 1 - Math.exp(-dt * 0.25);
      f.x += (camera.position.x - f.x) * k;
      f.y += (camera.position.y - f.y) * k;
      f.z += (camera.position.z - f.z) * k;
      this.center.value.set(f.x, f.z);
    }
    for (const f of this.floaters.children) {
      const u = f.userData;
      f.rotation.x += u.spin.x * dt;
      f.rotation.y += u.spin.y * dt;
      f.rotation.z += u.spin.z * dt;
      f.position.y = u.y + Math.sin(t * 0.45 + u.phase) * 0.8;
    }
  }

  _skyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: this.time, uSun: { value: SUN_DIR } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSun;
        varying vec3 vDir;
        float hash(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 horizon = vec3(1.0, 0.435, 0.38);
          vec3 glow = vec3(1.0, 0.25, 0.55);
          vec3 mid = vec3(0.42, 0.07, 0.5);
          vec3 zenith = vec3(0.035, 0.015, 0.11);
          vec3 col = mix(horizon, glow, smoothstep(0.0, 0.08, h));
          col = mix(col, mid, smoothstep(0.06, 0.3, h));
          col = mix(col, zenith, smoothstep(0.25, 0.8, h));
          col = mix(col, vec3(0.16, 0.03, 0.22), smoothstep(0.0, -0.25, h));

          // The sun: a disc fading from gold to pink, sliced by horizontal
          // gaps in its lower half that slowly sink.
          float a = acos(clamp(dot(d, uSun), -1.0, 1.0));
          float r = 0.17;
          float v = (h - uSun.y) / r; // -1 bottom .. 1 top of the disc
          vec3 sun = mix(vec3(1.0, 0.16, 0.55), vec3(1.0, 0.86, 0.3), smoothstep(-0.9, 0.8, v));
          float gaps = v < 0.25 ? step(0.32 + (0.25 - v) * 0.35, fract(v * 7.0 + uTime * 0.12)) : 1.0;
          float disc = smoothstep(r, r - 0.004, a) * gaps * step(0.0, h);
          col += vec3(1.0, 0.35, 0.45) * 0.45 * exp(-a * a * 10.0) * step(-0.02, h);
          col = mix(col, sun, disc);

          // Stars in the upper sky, twinkling.
          if (h > 0.12) {
            vec3 q = floor(d * 260.0);
            float s = hash(q);
            if (s > 0.9965) {
              float tw = 0.55 + 0.45 * sin(uTime * (1.5 + s * 3.0) + s * 80.0);
              col += vec3(0.9, 0.9, 1.0) * tw * smoothstep(0.12, 0.45, h);
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }

  _groundMaterial() {
    return new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uTime: this.time, uCenter: this.center, uFog: { value: new THREE.Vector3(1.0, 0.435, 0.38) }, uWorldOrigin: WORLD_ORIGIN },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uCenter;
        uniform vec3 uFog;
        uniform vec3 uWorldOrigin;
        varying vec3 vW;
        float grid(vec2 p, float cell, float width) {
          vec2 q = p / cell;
          vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          return 1.0 - min(min(g.x, g.y) / width, 1.0);
        }
        void main() {
          vec2 p = vW.xz - uWorldOrigin.xz;
          float minor = grid(p, 2.0, 1.0);
          float major = grid(p, 10.0, 1.6);
          // Rings of light pulse outwards from under the course.
          float d0 = length(p - uCenter);
          float pulse = pow(0.5 + 0.5 * sin(d0 * 0.18 - uTime * 1.6), 6.0);
          vec3 base = mix(vec3(0.09, 0.012, 0.17), vec3(0.2, 0.02, 0.28), pulse * 0.6);
          vec3 col = base;
          col += vec3(0.0, 0.85, 1.0) * minor * (0.3 + 0.7 * pulse);
          col += vec3(1.0, 0.16, 0.75) * major;
          float dist = length(vW.xz - cameraPosition.xz);
          col = mix(col, uFog, smoothstep(25.0, 240.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }
}

// Track surface: a standard (lit) material whose colour comes from the world
// position and the surface direction.
function trackMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uWorldOrigin = WORLD_ORIGIN;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vNeonPos;\nvarying vec3 vNeonNormal;\n${ORIGIN_UNIFORM}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vNeonPos = (modelMatrix * vec4(transformed, 1.0)).xyz - uWorldOrigin;\n' +
          'vNeonNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NEON_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + NEON_COLOR)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += neonGlow;');
  };
  m.customProgramCacheKey = () => 'neon-track';
  return m;
}

const NEON_HEAD = /* glsl */ `
uniform float uTime;
varying vec3 vNeonPos;
varying vec3 vNeonNormal;
vec3 neonGlow = vec3(0.0);
// Cosine rainbow (Inigo Quilez), pushed towards saturated colours.
vec3 neonPalette(float t) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
  c = pow(c, vec3(1.6));
  // Lift the brightest channel to full: every hue vivid, none muddy.
  return c / max(max(c.r, c.g), max(c.b, 0.001)) * 0.95;
}
`;

const NEON_COLOR = /* glsl */ `
{
  vec3 n = normalize(vNeonNormal);
  vec3 p = vNeonPos;
  float hue = p.y * 0.028 + (p.x + p.z) * 0.004;
  vec3 col;
  if (n.y > 0.55) {
    // Floors: candy stripes across the world, two shades of the hue.
    vec3 a = neonPalette(hue);
    vec3 b = mix(a, vec3(1.0), 0.45);
    float s = smoothstep(0.45, 0.55, fract((p.x - p.z) * 1.6));
    col = mix(a, b, s);
    neonGlow = col * 0.12;
  } else if (n.y < -0.4) {
    // Undersides: dark, so the levels of the course read apart.
    col = neonPalette(hue + 0.5) * 0.28;
  } else {
    // Rails and walls: the next colour round, with glowing bands.
    vec3 a = neonPalette(hue + 0.18);
    float band = smoothstep(0.85, 0.95, fract(p.y * 2.2));
    col = mix(a, vec3(1.0, 0.95, 1.0), band * 0.6);
    neonGlow = a * 0.22 + band * vec3(0.4);
  }
  diffuseColor.rgb = col;
}
`;
