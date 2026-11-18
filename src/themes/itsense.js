import * as THREE from 'three';
import logoUrl from './itsense-logo.svg';

// "ITSENSE": a theme in the style of itsense.ch. Their palette and shapes:
//   page grey #ECEEF0, brand red #D10007, dark slate #17262F, text grey
//   #4A5257, navy #25476D; a hero that runs into rose red, angled chevron
//   cuts between sections, skewed white cards with red accents.
// Their mountain illustration (flat low-poly peaks, a lit and a shaded half
// in #c4c4c4 / #a0a0a0, notched snow caps in #e0e0e0 / #c4c4c4 and a red
// Swiss flag on the highest summit) becomes a ring of real 3D peaks around
// the horizon, drawn flat and unlit in those greys, warmed where the
// evening sun falls on them.
//
// A sunny, warm late afternoon: soft blue above, peach and the hero's rose
// at the horizon, a low sun that shines (glow and slowly turning rays), and
// the ITSENSE logo (the white footer version) floating in the sky. The ground
// is the page grey with faint chevrons, warming towards the horizon. The
// track wears white floors with skewed card stripes and grey walls, with red
// caps along every rail and red pegs; gantries turn red.
// Everything here is visual only.

const PAGE = 0xeceef0;
const SLATE = 0x17262f;

// Where the sun stands: low in the sky, just clear of the highest peaks.
const SUN = new THREE.Vector3(-0.55, 0.36, -0.82).normalize();
// The logo floats above the mountains, to the right of the sun.
const LOGO = new THREE.Vector3(0.25, 0.2, -0.95).normalize();

// Mountain tones from the illustration: [lit, shaded] for rock and snow,
// and the warm colours the sun gives the faces turned towards it.
const ROCK = [new THREE.Color(0xc4c4c4), new THREE.Color(0xa0a0a0)];
const SNOW = [new THREE.Color(0xe0e0e0), new THREE.Color(0xc4c4c4)];
const WARM_ROCK = new THREE.Color(0xe2c2a8);
const WARM_SNOW = new THREE.Color(0xfff0e0);
const SHADE = new THREE.Color(0x98a0ad); // shaded faces cool down a little

export class ItsenseTheme {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.time = { value: 0 };

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMaterial(this.time));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
    // The logo hangs in the sky, so it travels with it.
    this.sky.add(skyLogo());

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), groundMaterial());
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    // The peaks stand on the horizon: they travel with the camera like the
    // sky does, so they are always a backdrop and never in the way.
    this.mountains = mountainRange();
    this.group.add(this.mountains);

    this.track = trackMaterial();
    this.fog = new THREE.Fog(0xf2e4da, 90, 340);
    this.savedSun = null;
  }

  setCourse() {}

  setEnabled(on, view) {
    this.enabled = on;
    this.group.visible = on;
    if (!on) {
      // The other themes leave the sun's strength alone: put it back.
      if (this.savedSun !== null) view.sun.intensity = this.savedSun;
      this.savedSun = null;
      return;
    }
    this.savedSun ??= view.sun.intensity;
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(PAGE);
    // Warm, golden light: a cosy late afternoon.
    view.hemi.color.set(0xfff1e0);
    view.hemi.groundColor.set(0xd9cfc6);
    view.hemi.intensity = 2.0;
    view.sun.color.set(0xffd6a0);
    view.sun.intensity = 2.3;
    view.materials.outline.color.set(SLATE);
  }

  update(dt, camera) {
    if (!this.enabled) return;
    this.time.value += dt;
    this.sky.position.copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);
    this.mountains.position.set(camera.position.x, 0, camera.position.z);
  }
}

// Soft blue above, light blue, then peach and the rose of the site's hero at
// the horizon, golden towards the sun. The sun: a bright disc in a wide warm
// glow, with faint rays turning slowly round it. Below the horizon the page
// grey.
function skyMaterial(time) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: time, uSun: { value: SUN } },
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
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 rose = vec3(0.96, 0.66, 0.6);
        vec3 peach = vec3(0.99, 0.84, 0.7);
        vec3 light = vec3(0.72, 0.82, 0.9);
        vec3 zenith = vec3(0.42, 0.6, 0.79);
        vec3 col = mix(rose, peach, smoothstep(0.0, 0.12, h));
        col = mix(col, light, smoothstep(0.1, 0.38, h));
        col = mix(col, zenith, smoothstep(0.35, 0.95, h));

        // Towards the sun the low sky turns golden.
        vec2 az = normalize(d.xz + 1e-5);
        float toward = max(dot(az, normalize(uSun.xz)), 0.0);
        col = mix(col, vec3(1.0, 0.83, 0.55), pow(toward, 4.0) * (1.0 - smoothstep(0.0, 0.45, h)) * 0.6);

        // The sun: disc, glow and rays.
        float a = acos(clamp(dot(d, uSun), -1.0, 1.0));
        vec3 right = normalize(cross(uSun, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, uSun);
        float phi = atan(dot(d, up), dot(d, right));
        float rays = pow(max(sin(phi * 9.0 + uTime * 0.08), 0.0), 6.0)
                   + 0.6 * pow(max(sin(phi * 13.0 - uTime * 0.05 + 1.3), 0.0), 8.0);
        col += vec3(1.0, 0.75, 0.4) * rays * 0.3 * exp(-a * 2.6) * smoothstep(0.04, 0.1, a);
        col = mix(col, vec3(1.0, 0.8, 0.45), 0.5 * exp(-a * a * 14.0));
        col = mix(col, vec3(1.0, 0.86, 0.5), 0.75 * exp(-a * a * 260.0));
        // The disc: golden rim, near-white centre.
        vec3 disc = mix(vec3(1.0, 0.99, 0.9), vec3(1.0, 0.85, 0.4), smoothstep(0.0, 0.055, a));
        col = mix(col, disc, smoothstep(0.058, 0.052, a));

        col = mix(col, vec3(0.925, 0.933, 0.941), step(h, 0.0));
        gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
      }`,
  });
}

// The ITSENSE logo (white lettering, red bracket) on a transparent plane in
// the sky, facing the viewer, behind the mountains.
function skyLogo() {
  const W = 64, H = W * (14.39 / 70.96); // the logo's own proportions
  const material = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, fog: false, opacity: 0.95, side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), material);
  plane.position.copy(LOGO).multiplyScalar(270);
  plane.lookAt(0, 0, 0);
  plane.renderOrder = -9;
  plane.frustumCulled = false;
  plane.visible = false; // until the picture has loaded
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = Math.round(2048 * (H / W));
    const ctx = c.getContext('2d');
    // A soft warm shadow so the white lettering reads on the light sky.
    ctx.shadowColor = 'rgba(120, 60, 40, 0.35)';
    ctx.shadowBlur = 24;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    material.map = tex;
    material.needsUpdate = true;
    plane.visible = true;
  };
  img.src = logoUrl;
  return plane;
}

// The light page grey with wide, faint chevrons pointing along the course
// (the angled section cuts of the site); far away it warms into the haze of
// the horizon, and a warm sheen lies on it towards the sun.
function groundMaterial() {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vW;
      void main() {
        vec3 page = vec3(0.937, 0.933, 0.925);
        vec3 band = vec3(0.9, 0.895, 0.89);
        float v = vW.z + abs(vW.x) * 0.45;
        float q = fract(v / 18.0);
        float w = fwidth(v / 18.0);
        float s = smoothstep(0.62 - w, 0.62 + w, q) - smoothstep(1.0 - w, 1.0, q);
        vec2 off = vW.xz - cameraPosition.xz;
        float dist = length(off);
        vec3 col = mix(page, band, s * (1.0 - smoothstep(60.0, 260.0, dist)));
        float toward = max(dot(off / max(dist, 1e-3), normalize(uSun.xz)), 0.0);
        col = mix(col, vec3(1.0, 0.9, 0.78), pow(toward, 3.0) * smoothstep(20.0, 220.0, dist) * 0.55);
        col = mix(col, vec3(0.949, 0.894, 0.855), smoothstep(150.0, 330.0, dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// A ring of faceted peaks on the horizon, built like the illustration: each
// face of a peak is flat, lit or shaded, with a snow cap above a notched snow
// line. A far ring behind, lighter and tinted towards the sky (haze), gives
// depth. The highest peak carries the red flag.
function mountainRange() {
  const group = new THREE.Group();
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const positions = [];
  const colors = [];
  const haze = new THREE.Color(0xf0c9b6);
  let top = null;
  const rings = [
    { radius: 285, count: 22, height: [42, 78], tint: 0.4 },
    { radius: 245, count: 18, height: [34, 92], tint: 0 },
  ];
  for (const ring of rings) {
    const offset = rnd() * Math.PI * 2;
    for (let i = 0; i < ring.count; i++) {
      const angle = offset + ((i + (rnd() - 0.5) * 0.5) / ring.count) * Math.PI * 2;
      const r = ring.radius + (rnd() - 0.5) * 20;
      const h = ring.height[0] + rnd() ** 1.5 * (ring.height[1] - ring.height[0]);
      const base = new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      // Wide at the base like the illustration's peaks (about 1.1x the height).
      const width = h * (1.0 + rnd() * 0.35);
      const apex = base.clone().add(new THREE.Vector3((rnd() - 0.5) * width * 0.2, h, (rnd() - 0.5) * width * 0.2));
      peak(positions, colors, base, apex, width, 4 + Math.floor(rnd() * 3), rnd() * Math.PI, rnd, ring.tint, haze);
      // The flag goes on the highest near peak not right under the sun.
      const underSun = base.clone().normalize().dot(new THREE.Vector3(SUN.x, 0, SUN.z).normalize()) > 0.9;
      if (ring.tint === 0 && !underSun && (!top || h > top.h)) top = { h, apex };
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  group.add(mesh);
  if (top) group.add(summitFlag(top.apex, top.h));
  return group;
}

// One peak: `sides` faces round an apex, each split by a notched snow line.
// Faces turned to the sun are lit and warmed by it, the others shaded.
function peak(positions, colors, base, apex, width, sides, turn, rnd, tint, haze) {
  const ring = [];
  for (let k = 0; k < sides; k++) {
    const a = turn + ((k + (rnd() - 0.5) * 0.4) / sides) * Math.PI * 2;
    const rr = (width / 2) * (0.8 + rnd() * 0.4);
    ring.push(new THREE.Vector3(base.x + Math.cos(a) * rr, 0, base.z + Math.sin(a) * rr));
  }
  const snow = 0.3 + rnd() * 0.12; // snow line, as a fraction from the apex down
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let k = 0; k < sides; k++) {
    const b0 = ring[k], b1 = ring[(k + 1) % sides];
    // Outward normal of the face, to choose its tone (wound either way).
    e1.subVectors(b0, apex);
    e2.subVectors(b1, apex);
    n.crossVectors(e1, e2).normalize();
    const mid = b0.clone().add(b1).multiplyScalar(0.5);
    if (n.dot(mid.clone().sub(base)) < 0) n.negate();
    const sun = n.dot(SUN);
    let rock, ice;
    if (sun > 0) {
      const warm = Math.min(1, sun * 1.6) * 0.75;
      rock = ROCK[0].clone().lerp(WARM_ROCK, warm);
      ice = SNOW[0].clone().lerp(WARM_SNOW, warm);
    } else {
      rock = ROCK[1].clone().lerp(SHADE, 0.35);
      ice = SNOW[1].clone().lerp(SHADE, 0.2);
    }
    rock.lerp(haze, tint);
    ice.lerp(haze, tint);
    // Snow line: down each edge to `snow`, dipping lower in the face middle
    // for the notch of the illustration.
    const E0 = apex.clone().lerp(b0, snow);
    const E1 = apex.clone().lerp(b1, snow);
    const M = apex.clone().lerp(mid, snow + 0.14);
    tri(positions, colors, apex, E0, M, ice);
    tri(positions, colors, apex, M, E1, ice);
    tri(positions, colors, E0, b0, M, rock);
    tri(positions, colors, M, b0, b1, rock);
    tri(positions, colors, M, b1, E1, rock);
  }
}

function tri(positions, colors, a, b, c, color) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
}

// The red Swiss flag on the summit, like the one on the illustration's
// highest peak. It always turns to face the camera (a sprite).
function summitFlag(apex, h) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, h * 0.14, 6),
    new THREE.MeshBasicMaterial({ color: 0x8a8d90, fog: false })
  );
  pole.position.copy(apex).add(new THREE.Vector3(0, h * 0.07, 0));
  group.add(pole);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const ctx = c.getContext('2d');
  // Swallow-tail pennant pointing left, as on the illustration.
  ctx.fillStyle = '#d10007';
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(18, 40);
  ctx.lineTo(0, 80);
  ctx.lineTo(128, 80);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(66, 22, 14, 36);
  ctx.fillRect(55, 33, 36, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false }));
  const fw = h * 0.16;
  flag.scale.set(fw, fw * (80 / 128), 1);
  flag.center.set(1, 1); // hang from the top of the pole, flying left
  flag.position.copy(apex).add(new THREE.Vector3(0, h * 0.14, 0));
  group.add(flag);
  return group;
}

// Track surface: white floors with faint skewed stripes (the site's slanted
// cards), walls in the mountains' grey, darker grey undersides so the levels
// of the course read apart, and brand-red accents: a red cap along the top
// of every rail and red pegs. The per-vertex `accent` (see buildTrack) says
// how far up its rail a point is: 0 floor, 1 rail top, -1 underside.
function trackMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float accent;\nvarying float vItsAccent;\nvarying vec3 vItsPos;\nvarying vec3 vItsNormal;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vItsAccent = accent;\n' +
          'vItsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vItsNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vItsAccent;\nvarying vec3 vItsPos;\nvarying vec3 vItsNormal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + TRACK_COLOR);
  };
  m.customProgramCacheKey = () => 'itsense-track';
  return m;
}

const TRACK_COLOR = /* glsl */ `
{
  vec3 n = normalize(vItsNormal);
  vec3 p = vItsPos;
  vec3 col;
  if (vItsAccent > 0.55) {
    col = vec3(0.82, 0.0, 0.027); // #D10007: rail caps, pegs
  } else if (n.y > 0.55) {
    // Floors: white, with wide skewed stripes in the page grey.
    float s = smoothstep(0.47, 0.53, fract((p.x * 0.8 + p.z) * 0.9));
    col = mix(vec3(1.0), vec3(0.925, 0.933, 0.941), s * 0.7);
  } else if (n.y < -0.4) {
    col = vec3(0.29, 0.322, 0.341); // #4A5257
  } else {
    col = vec3(0.769); // #C4C4C4, the lit rock of the mountains
  }
  diffuseColor.rgb = pow(col, vec3(2.2)); // sRGB values to the linear working space
}
`;
