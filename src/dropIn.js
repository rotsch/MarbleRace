// Endless mode: new pieces fall into place from above, fading in; they come
// down fast, slow towards the end, touch the track they join (onLand: the
// dust puff) and settle with a tiny dip. Pieces taken away sink and fade
// out. Only the meshes move: the colliders are in place from the start
// (marbles are far behind the end of the track anyway).
//
// While a piece fades, its meshes wear see-through copies of their
// materials; afterwards they get the theme's track material (or their own
// decoration material) back.
const HEIGHT = 6; // units above its place a piece starts
const DROP = 0.8; // seconds for the whole drop
const CONTACT = 0.82; // part of DROP at which it touches down
const FADE = 0.55; // part of DROP over which it fades in
const DIP = 0.03; // settle below its place after touching down
const OUT = 0.4; // seconds to sink and fade out

const easeOut = (u) => 1 - (1 - u) ** 3;

export class DropIns {
  // trackMaterial(): the material course surfaces wear in the current theme.
  constructor(trackMaterial) {
    this.trackMaterial = trackMaterial;
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  // Drop `group` in after `delay` seconds.
  drop(group, delay = 0, onLand = null) {
    const item = { group, t: -delay, lift: HEIGHT, kind: 'in', onLand, landed: false, swaps: fade(group) };
    group.position.y += HEIGHT;
    group.visible = delay <= 0;
    this._setOpacity(item, 0);
    this.items.push(item);
  }

  // Sink and fade `group` out, then call onDone.
  remove(group, onDone) {
    // Still dropping in: stop that where it is.
    const i = this.items.findIndex((it) => it.group === group);
    let swaps, lift = 0;
    if (i >= 0) {
      ({ swaps, lift } = this.items[i]);
      this.items.splice(i, 1);
    } else swaps = fade(group);
    this.items.push({ group, t: 0, lift, kind: 'out', onDone, swaps });
  }

  // Theme switch: pieces still fading keep their copies, and get the new
  // theme's material when they are done.
  isFading(mesh) {
    return this.items.some((it) => it.swaps.has(mesh));
  }

  update(dt) {
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      it.t += dt;
      if (it.kind === 'in') {
        if (it.t < 0) continue;
        it.group.visible = true;
        const u = Math.min(1, it.t / DROP);
        let h;
        if (u < CONTACT) h = HEIGHT * (1 - easeOut(u / CONTACT));
        else h = -DIP * Math.sin((Math.PI * (u - CONTACT)) / (1 - CONTACT));
        it.group.position.y += h - it.lift;
        it.lift = h;
        this._setOpacity(it, Math.min(1, u / FADE));
        if (u >= CONTACT && !it.landed) {
          it.landed = true;
          it.onLand?.();
        }
        if (u >= 1) {
          it.group.position.y -= it.lift;
          this._restore(it);
          this.items.splice(k, 1);
        }
      } else {
        const u = Math.min(1, it.t / OUT);
        const h = -1.5 * u * u;
        it.group.position.y += h - it.lift;
        it.lift = h;
        this._setOpacity(it, 1 - u);
        if (u >= 1) {
          for (const m of new Set(it.swaps.values())) m.copy?.dispose();
          this.items.splice(k, 1);
          it.onDone?.();
        }
      }
    }
  }

  _setOpacity(it, a) {
    for (const s of it.swaps.values()) s.copy.opacity = s.opacity * a;
  }

  _restore(it) {
    const copies = new Set();
    for (const [obj, s] of it.swaps) {
      // Course surfaces wear whatever the theme is now; decoration, outlines
      // and see-through roofs their own material.
      obj.material = obj.isMesh && !obj.userData.decor && !obj.isInstancedMesh ? this.trackMaterial() : s.original;
      copies.add(s.copy);
    }
    for (const c of copies) c.dispose();
    it.swaps.clear();
  }
}

// Give every mesh and outline in `group` a see-through copy of its material
// (one copy per material). Returns mesh -> { original, copy, opacity }.
function fade(group) {
  const copies = new Map();
  const swaps = new Map();
  group.traverse((o) => {
    if (!o.material || o.userData.wire || Array.isArray(o.material)) return;
    const original = o.material;
    let s = copies.get(original);
    if (!s) {
      const copy = original.clone();
      // Shader tweaks (theme colours, picture mosaic) are not part of a clone.
      copy.onBeforeCompile = original.onBeforeCompile;
      copy.customProgramCacheKey = original.customProgramCacheKey;
      copy.transparent = true;
      s = { original, copy, opacity: original.transparent ? original.opacity : 1 };
      copies.set(original, s);
    }
    o.material = s.copy;
    swaps.set(o, s);
  });
  return swaps;
}
