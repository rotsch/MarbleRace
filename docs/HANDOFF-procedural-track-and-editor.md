# Handoff: Procedural track generation & track-piece editor

Status: **the editor for placed pieces is implemented** (see "Track editor" in
README.md): course as data with sockets and links (`src/course/pieces.js`),
gizmo move/rotate with socket snapping, fork/merge pieces with link-aware race
progress, undo/redo, localStorage + JSON export/import, `sim --course`.
Not done yet: streaming/procedural generation (section 2), headless
validation from the editor, preview chain, spline editing, glTF import.
Purpose: capture the direction discussed so a later session can pick it up.

---

## 1. Current state of the code (what pieces are made of)

The course is built in `src/course/`. Every piece ends up as one of four Rapier
collider kinds, each paired with a Three.js mesh (meshes only when rendering, so
the same code runs headless for `npm run sim` / `npm run physics-check`).

| Kind | Where | Rapier collider | Used for |
|---|---|---|---|
| Swept track | `trackBuilder.js` → `buildTrack` / `runTrack` | `trimesh` + `FIX_INTERNAL_EDGES` | all rolling surfaces: straights, slopes, curves, banked turns |
| Lathe solid | `geometry.js` → `lathe` | `trimesh` (via `addSolid`) | funnels, catch bowls (`funnel`, `bigJump`) |
| Box / cylinder | `context.js` → `addBox(At)`, `addCylinder` | `cuboid`, `cylinder` | walls, pads, gates, pegs, bumps |
| Convex hull | `context.js` → `addHull` | `convexHull` | splitter wedge |

### How slopes / curves are built
1. **Path** — `frame.js` `tracePath(entry, segments)`: turtle-style; each segment is
   `{ len, turn, pitch, bank }`. Produces frames (pos + F/L/U axes) every `TRACK.step`.
   Helpers: `arc`, `sShift`, `deg`.
2. **Profile** — `trackBuilder.js` `uProfile`: 2D U-channel (floor + two rails).
   Width / rail height can vary along the path (`widthStops`, function-valued opts).
3. **Sweep** — `geometry.js` `sweepRings`: profile placed at each frame, rings
   stitched into a closed, capped solid.
4. **Physics** — `CourseContext.addSolid` → trimesh collider.

### Tuning that must be preserved by any refactor
- **Joint relief** (`JOINT_RELIEF` in `trackBuilder.js`): each piece starts a few mm
  lower/wider and eases back → no ghost collisions at seams.
- **Bank-rate limit** in `tracePath`: banking never twists faster than the slope
  allows (avoids edge pockets where slow marbles stall).
- `FIX_INTERNAL_EDGES` on trimeshes; per-collider friction/restitution via `material`.
- Path recording (`addPath` / `addPathPoint`, `solid` flag) drives ranking, camera,
  and rescue points; camera hints and zones hang off it.

Each piece already has an implicit **entry pose** and returns an **exit pose**
(`runTrack` returns the last frame) — effectively the “sockets” needed below.

---

## 2. Continuous procedural track generation

Approach: **chunk-based streaming of modular pieces.**

1. **Modular pieces with sockets.** Each piece declares an entry socket and one or
   more exit sockets (transform + width/profile type). New pieces snap their entry
   to the previous exit → seamless track.
2. **Generation window.** Keep N pieces ahead of the leader; when the leader passes a
   threshold, append one. Remove pieces once the last marble is well past them
   (pool meshes/colliders). Memory and physics cost stay flat.
3. **Seeded RNG** (`src/rng.js` already exists) → same seed, same track
   (replays, multiplayer sync, debugging).
4. **Selection rules** (weighted random):
   - compatibility: only pieces whose entry matches the current exit type;
   - net downhill trend (gravity is the engine) unless a piece adds a boost/lift;
   - difficulty ramps over time (tighter curves, more obstacles, gaps);
   - occasional set pieces (big drop, splitter with alternate routes).
5. **No self-intersection.** Either track bounding volumes of recent pieces and reject
   overlapping candidates, or bias heading so the track always drifts down/away
   (descending spiral/slope makes crossings impossible).

Alternatives / additions:
- **Spline-based**: noise-driven control points → Catmull-Rom/Bézier → sweep the
  profile. Smoother look; same sweep code works.
- **Floating origin**: on an endless descent, periodically shift the world back
  toward (0,0,0) to avoid float precision issues.

Pitfalls:
- Generate far enough ahead that colliders exist before marbles arrive.
- Tunnelling at seams for fast marbles → overlapping colliders / CCD (joint relief
  already helps).
- Camera must follow leader/pack; “finish line” becomes distance-based scoring,
  laps, or elimination (last marble out).

---

## 3. Track-piece editor

Goal: pieces become **data**, not code; generator picks from a library of authored
pieces.

### Piece data format (JSON, versioned)
```jsonc
{
  "version": 1,
  "name": "banked-s-curve",
  "track": {                       // swept part
    "segments": [{ "len": 2, "turn": 0.6, "pitch": -0.12, "bank": 0.2 }],
    "width":  [[0, 0.3], [2, 0.25]],   // widthStops
    "rail":   0.06
  },
  "lathes":     [{ "center": [0,0,0], "profile": [[r,y], ...] }],
  "primitives": [{ "type": "box|cylinder|hull", "frame": "end", "local": [x,y,z], "size": [...], "material": {...} }],
  "sockets": { "entry": {...}, "exits": [{...}] },   // pose + width/profile type
  "meta": { "difficulty": 2, "weight": 1, "netDrop": -0.25, "tags": ["fast"], "follows": [] }
}
```
Rationale: segments + profile are compact, readable, and snap naturally; they
reuse `tracePath` / `buildTrack` unchanged, keeping all physics tuning.

### Editor features
- 3D viewport, orbit camera, grid + snapping (position steps, 15° rotation).
- Parameter panel (lil-gui or Tweakpane) for segments, width/rail stops, lathe
  outlines → live rebuild of the piece.
- TransformControls (three/examples) to place/rotate/scale boxes, cylinders, hulls.
- Visible, editable socket markers.
- **Test mode**: drop marbles at the entry socket, run physics live.
- **Auto-validation** (headless, reuse `CourseContext` + `scripts/sim.mjs` ideas):
  N marbles → % reaching exit within time limit, exit speed / net drop, stuck
  detection (≈0 velocity).
- Undo/redo via command pattern from day one.
- Save/load/export JSON (localStorage or files; backend later if shared).
- “Preview chain”: show the piece between random others from the library.

### Harder parts
- Arbitrary meshes as colliders are less stable → prefer primitives + swept/lathe
  trimeshes.
- Spline handles for smooth freeform tubes are significantly more work than
  parameter sliders.

---

## 4. Tooling decision

- **Rapier itself has no modelling tools** (physics only).
- Surveyed options (from memory, verify before use): Three.js Editor (no physics),
  Blender → glTF (best freeform modelling; tag colliders via names/custom props),
  Needle Engine (Unity/Blender → web, uses Rapier), `@react-three/rapier` + Triplex
  (React-only), lil-gui / Tweakpane / TransformControls / three-bvh-csg (fit current
  code), Godot + Rapier plugin + Path3D/CSGPolygon3D (different engine).
- **Needle Engine: not recommended** as the base. Its strength is visual
  hand-authoring; this game is code/procedural. Migrating would rewrite ~1.5k
  working lines, risk losing the low-level Rapier tuning, complicate headless
  testing, and add a heavy dependency (check its commercial licence tiers).
  Reconsider only if the project shifts to many hand-made sculptural pieces or
  non-programmer content authors.
- **Recommended:** stay on plain Three.js + Rapier; build a custom lightweight editor
  on the existing segment/profile system. Optionally add glTF import from Blender
  (collider naming convention) for one-off freeform pieces.

---

## 5. Suggested implementation order

1. Define the piece JSON format + loader that builds a piece via existing
   `tracePath` / `buildTrack` / `lathe` / `addBox…` into a `CourseContext`.
2. Port 2–3 existing sections (`straight`, `curve`, `funnel`) to data to prove it.
3. Socket-based chaining + seeded generator producing a fixed-length random course.
4. Streaming window (spawn ahead / despawn behind), collider pooling, scoring change.
5. Editor v1: parameter panel, primitives with gizmos, sockets, test-drop button.
6. Headless validation of pieces (reuse sim scripts), then preview-chain, undo/redo.
7. Optional: spline editing, glTF/Blender import, shared piece library.
