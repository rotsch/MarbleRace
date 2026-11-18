import { BufferGeometry, BufferAttribute, ShapeUtils, Vector2 } from 'three';

// Signed volume of an indexed triangle mesh; positive when faces wind outward.
export function signedVolume(pos, idx) {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v +=
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}

// Sweep a closed 2D profile through space.
//  rings: array of rings, each an array of Vector3 (same count, same order)
//  profile2D: Vector2[] of one ring's cross-section, used to triangulate end caps
//  loop: connect the last ring back to the first (lathe-style), no caps
// Returns an indexed BufferGeometry forming a closed solid with outward winding.
export function sweepRings(rings, profile2D, { loop = false, endProfile } = {}) {
  const n = rings[0].length;
  const m = rings.length;
  const pos = new Float32Array(m * n * 3);
  rings.forEach((ring, i) =>
    ring.forEach((p, j) => {
      pos[(i * n + j) * 3] = p.x;
      pos[(i * n + j) * 3 + 1] = p.y;
      pos[(i * n + j) * 3 + 2] = p.z;
    })
  );
  // Profile local axes are (x, y) with x cross y = sweep direction, so a
  // counter-clockwise profile needs the winding below to face outward.
  const ccw = ShapeUtils.area(profile2D) > 0;
  const idx = [];
  const tri = (a, b, c) => (ccw ? idx.push(a, c, b) : idx.push(a, b, c));
  const spans = loop ? m : m - 1;
  for (let i = 0; i < spans; i++) {
    const a = i * n;
    const b = ((i + 1) % m) * n;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(a + j, b + j, b + k);
      tri(a + j, b + k, a + k);
    }
  }
  if (!loop) {
    // Each cap is cut from its own outline: rings may change shape along the
    // sweep (same point count), and endProfile is the last ring's shape.
    const last = (m - 1) * n;
    const cap = (profile, base, back) => {
      for (const t of ShapeUtils.triangulateShape(profile, [])) {
        const [p, q, r] = t.map((k) => profile[k]);
        const area = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const [a, b, c] = area > 0 ? t : [t[0], t[2], t[1]]; // a,b,c is CCW => faces +sweep
        if (back) idx.push(base + a, base + c, base + b); // start cap faces backwards
        else idx.push(base + a, base + b, base + c);
      }
    };
    cap(profile2D, 0, true);
    cap(endProfile ?? profile2D, last, false);
  }
  if (signedVolume(pos, idx) < 0) console.warn('sweepRings: inward-facing solid');
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Revolve a closed (r, y) polygon around the vertical axis through `center`.
export function lathe(center, profile, segments = 48) {
  const rings = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    rings.push(profile.map((p) => center.clone().add({ x: p.x * c, y: p.y, z: p.x * s })));
  }
  return sweepRings(rings, profile, { loop: true });
}

export const v2 = (x, y) => new Vector2(x, y);
