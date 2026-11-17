import * as THREE from 'three';

// Covers every course surface with a random mosaic of the pictures in the
// project's `textures/` folder. Vite lists the folder at build time, so adding
// or removing images needs no code change. The track starts plain white; the
// mosaic is switched on and off in game (T). With no images it stays white.
//
// The surfaces have no texture coordinates, so the mosaic is projected from
// world space along the three axes and blended by the surface normal
// ("triplanar"). Space is cut into square tiles; each tile shows one picture,
// picked and turned by a fixed hash of its position, so the pattern is the
// same on every load.

const FILES = import.meta.glob('../textures/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const TILE = 0.6; // tile edge in world units (one track width, about 6 cm real)
const LAYER = 1024; // every picture is cropped to a square and scaled to this

export function trackTextureUrls() {
  return Object.keys(FILES).sort().map((k) => FILES[k]);
}

// Patches `material` (a MeshStandardMaterial) so it can show the mosaic.
// Returns a controller; the pictures are only loaded the first time the
// mosaic is switched on.
export function applyTrackTexture(material) {
  const uniforms = {
    trackTex: { value: placeholder() },
    trackTexCount: { value: 0 },
    trackTile: { value: TILE },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTexPos;\nvarying vec3 vTexNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vTexPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vTexNormal = normalize(mat3(modelMatrix) * objectNormal);'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAGMENT_APPLY);
  };
  material.customProgramCacheKey = () => 'track-mosaic';

  const urls = trackTextureUrls();
  let loading = null, count = 0, on = false;
  const load = () =>
    (loading ??= Promise.all(urls.map(loadImage)).then((images) => {
      const ok = images.filter(Boolean);
      if (ok.length) uniforms.trackTex.value = buildArray(ok);
      count = ok.length;
    }));
  return {
    available: urls.length,
    get enabled() {
      return on;
    },
    // Resolves to the number of pictures shown (0 when off or none exist).
    async setEnabled(want) {
      on = want && urls.length > 0;
      if (on) await load();
      uniforms.trackTexCount.value = on ? count : 0;
      return uniforms.trackTexCount.value;
    },
  };
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`track texture could not be loaded: ${url}`);
      resolve(null);
    };
    img.src = url;
  });
}

// All pictures in one texture array: centre-cropped to a square, scaled to
// LAYER x LAYER, one layer each.
function buildArray(images) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAYER;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(LAYER * LAYER * 4 * images.length);
  images.forEach((img, i) => {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    g.clearRect(0, 0, LAYER, LAYER);
    g.drawImage(img, sx, sy, side, side, 0, 0, LAYER, LAYER);
    data.set(g.getImageData(0, 0, LAYER, LAYER).data, i * LAYER * LAYER * 4);
  });
  const tex = new THREE.DataArrayTexture(data, LAYER, LAYER, images.length);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function placeholder() {
  const tex = new THREE.DataArrayTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

const FRAGMENT_HEAD = /* glsl */ `
uniform highp sampler2DArray trackTex;
uniform float trackTexCount;
uniform float trackTile;
varying vec3 vTexPos;
varying vec3 vTexNormal;

float trackHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

// One projection plane: which tile we are in picks the picture and a turn of
// 0, 90, 180 or 270 degrees. Gradients come from the continuous coordinate,
// so mipmapping does not draw seams at the tile edges.
vec3 trackSample(vec2 q, float axis) {
  vec2 cell = floor(q);
  vec2 uv = q - cell;
  vec2 dx = dFdx(q), dy = dFdy(q);
  float h1 = trackHash(vec3(cell, axis));
  float h2 = trackHash(vec3(cell + 17.0, axis + 5.0));
  float layer = min(floor(h1 * trackTexCount), trackTexCount - 1.0);
  int turn = int(floor(h2 * 4.0));
  if (turn == 1) { uv = vec2(1.0 - uv.y, uv.x); dx = vec2(-dx.y, dx.x); dy = vec2(-dy.y, dy.x); }
  else if (turn == 2) { uv = 1.0 - uv; dx = -dx; dy = -dy; }
  else if (turn == 3) { uv = vec2(uv.y, 1.0 - uv.x); dx = vec2(dx.y, -dx.x); dy = vec2(dy.y, -dy.x); }
  return textureGrad(trackTex, vec3(uv, layer), dx, dy).rgb;
}
`;

const FRAGMENT_APPLY = /* glsl */ `
if (trackTexCount > 0.5) {
  vec3 q = vTexPos / trackTile;
  vec3 w = pow(abs(normalize(vTexNormal)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 c = vec3(0.0);
  if (w.x > 0.01) c += w.x * trackSample(q.zy, 0.0);
  if (w.y > 0.01) c += w.y * trackSample(q.xz, 1.0);
  if (w.z > 0.01) c += w.z * trackSample(q.xy, 2.0);
  diffuseColor.rgb *= c;
}
`;
