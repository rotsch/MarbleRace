import * as THREE from 'three';

// "ITSENSE": a theme in the style of itsense.ch. Their palette and shapes:
//   page grey #ECEEF0, brand red #D10007, dark slate #17262F, text grey
//   #4A5257, navy #25476D; a hero that runs from dark grey into red, angled
//   chevron cuts between sections, skewed white cards with red accents.
// Their mountain illustration (flat low-poly peaks, a lit and a shaded half
// in #c4c4c4 / #a0a0a0, notched snow caps in #e0e0e0 / #c4c4c4 and a red
// Swiss flag on the highest summit) becomes a ring of real 3D peaks around
// the horizon, drawn flat and unlit in exactly those greys.
//
// The sky is the hero gradient (grey above, rose red at the horizon), the
// ground the light page grey with faint chevrons. The track wears white
// floors with skewed card stripes, grey walls and undersides; gantries turn
// red. Everything here is visual only.

const PAGE = 0xeceef0;
const RED = 0xd10007;
const SLATE = 0x17262f;

// Mountain tones from the illustration: [lit, shaded] for rock and snow.
const ROCK = [new THREE.Color(0xc4c4c4), new THREE.Color(0xa0a0a0)];
const SNOW = [new THREE.Color(0xe0e0e0), new THREE.Color(0xc4c4c4)];
// The light comes from the left of the picture, as in the illustration.
const LIGHT = new THREE.Vector3(-1, 0.6, 0.35).normalize();

export class ItsenseTheme {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), groundMaterial());
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    // The peaks stand on the horizon: they travel with the camera like the
    // sky does, so they are always a backdrop and never in the way.
    this.mountains = mountainRange();
    this.group.add(this.mountains);

    this.track = trackMaterial();
    this.fog = new THREE.Fog(0xe4e6e9, 90, 330);
  }

  setCourse() {}

  setEnabled(on, view) {
    this.enabled = on;
    this.group.visible = on;
    if (!on) return;
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(PAGE);
    view.hemi.color.set(0xffffff);
    view.hemi.groundColor.set(0xd6dade);
    view.hemi.intensity = 2.2;
    view.sun.color.set(0xffffff);
    view.materials.outline.color.set(SLATE);
  }

  update(dt, camera) {
    if (!this.enabled) return;
    this.sky.position.copy(camera.position);
    this.ground.position.set(camera.position.x, 0, camera.position.z);
    this.mountains.position.set(camera.position.x, 0, camera.position.z);
  }
}

// The hero section's gradient: dark grey above, through a warm grey, to the
// rose red the hero ends in, right down at the horizon. Below the horizon the
// page grey (the light section cutting into the hero).
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 rose = vec3(0.878, 0.478, 0.486);   // #e07a7c, bottom of the hero
        vec3 mauve = vec3(0.604, 0.443, 0.451);  // half way
        vec3 grey = vec3(0.404, 0.408, 0.416);   // #67686a, top of the hero
        vec3 zenith = vec3(0.31, 0.318, 0.329);
        vec3 col = mix(rose, mauve, smoothstep(0.0, 0.22, h));
        col = mix(col, grey, smoothstep(0.18, 0.5, h));
        col = mix(col, zenith, smoothstep(0.5, 0.95, h));
        col = mix(col, vec3(0.925, 0.933, 0.941), step(h, 0.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The light page grey with wide, faint chevrons pointing along the course
// (the angled section cuts of the site), fading to plain grey far away.
function groundMaterial() {
  return new THREE.ShaderMaterial({
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec3 page = vec3(0.925, 0.933, 0.941);
        vec3 band = vec3(0.886, 0.898, 0.91);
        float v = vW.z + abs(vW.x) * 0.45;
        float q = fract(v / 18.0);
        float w = fwidth(v / 18.0);
        float s = smoothstep(0.62 - w, 0.62 + w, q) - smoothstep(1.0 - w, 1.0, q);
        float dist = length(vW.xz - cameraPosition.xz);
        vec3 col = mix(page, band, s * (1.0 - smoothstep(60.0, 260.0, dist)));
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
  const haze = new THREE.Color(0xd9b7b8);
  let top = null;
  const rings = [
    { radius: 285, count: 22, height: [42, 78], tint: 0.38 },
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
      if (ring.tint === 0 && (!top || h > top.h)) top = { h, apex };
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
    const lit = n.dot(LIGHT) > 0 ? 0 : 1;
    const rock = ROCK[lit].clone().lerp(haze, tint);
    const ice = SNOW[lit].clone().lerp(haze, tint);
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

// Track surface, coloured by its direction: white floors with faint skewed
// stripes (the site's slanted cards), walls in the mountains' grey, darker
// grey undersides so the levels of the course read apart. Red stays an
// accent, as on the site: gantries, kerbs, flags.
function trackMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vItsPos;\nvarying vec3 vItsNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vItsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vItsNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vItsPos;\nvarying vec3 vItsNormal;')
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
  if (n.y > 0.55) {
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
