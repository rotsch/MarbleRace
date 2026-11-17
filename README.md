# Marble Race

Eight glass marbles race down one long 3D course in an empty white room.
Three.js for rendering, Rapier for physics, Vite, plain JavaScript.

## Run

```
npm install
npm run dev              # open the URL it prints (http://localhost:5173)
```

Other commands:

```
npm run build            # production build into dist/
npm run preview          # serve the production build
npm run sim              # headless course check over 10 seeds (no browser)
npm run physics-check    # single-marble rolling / bounce / collision checks
```

Node 18 or newer.

## Controls

| | |
|---|---|
| Seed field + Restart (or Enter in the field) | replay a race; the same seed gives exactly the same race |
| `R` | back to the start line and wait; `R` again starts the race (with the countdown) |
| New seed | restart with a random seed |
| Speed slider, `←` / `→` | simulation speed 0.1x to 4x; the arrow keys step through 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4; `←` at 0.1x pauses, and while paused either arrow resumes one step slower / faster than before |
| `Space` or Pause button | pause / resume: physics, race clock and countdown stop, the camera still moves |
| `B` or checkbox | debug: physics colliders (draws every collider) |
| `M` or checkbox | debug: mesh wireframe, every triangle of the course meshes (track blue, decoration red), with mesh / triangle / vertex counts |
| `F`, click, or checkbox | debug: shoot marbles from the camera (click aims at the cursor, at the screen centre while the mouse steers the free camera; `F` aims at the last cursor position). Shot marbles are white, black, grey or brown, are not ranked or rescued, fly only while the race runs, and vanish on the room floor or at the finish line |
| `C` or Camera menu | cycle the camera: follow the leader → free fly → leader's view (rides on the leading marble, looking along the track a little ahead; it switches marbles once a new leader is 2.5 cm ahead) |
| click scene | enter free camera and steer with the mouse (pointer lock, `Esc` releases) |
| `W` `A` `S` `D` | fly forward / left / back / right (enters free camera) |
| `Q` / `E` | fly up / down |
| `Shift` | fly faster |
| Speaker button / volume slider (bottom left), `N` | sound on / off and volume (remembered by the browser). All sounds are synthesised with Web Audio: rolling (louder and brighter with speed, silent in the air), hits on the track, glass clicks between marbles, boings on the rubber pads, start-light beeps, a bell per finisher with a cheering crowd and a fanfare for the winner, a crowd of babbling voices at the finish (it wakes as the leader nears the line and falls silent once the last marble is home), safety-net nudges and rescues, shots, clicks and pause. World sounds come from where they happen, heard from the camera |
| `T` or Look menu | cycle the look: White (default) → Neon dusk (evening sky with a striped sun and stars, an endless glowing grid floor with light pulses, a rainbow track whose colour follows height, candy-striped floors, neon gantries and stands, low-poly shapes drifting around the course) → Picture mosaic (every picture in `textures/` as a random mosaic; skipped if the folder has none) |
| Start race (button) | the page opens with the marbles waiting on the start line; every start (this button, a second `R`, Restart, New seed, physics Apply) counts down 3, 2, 1 first |
| Progress line (top) | every marble at its distance along the course; marbles further ahead are drawn over those behind; shows the leader (the winner once someone finishes) |
| Physics panel | marble size, bounciness, grip and rolling resistance; track bounciness and grip; rubber pad bounciness. Apply restarts the race; values are remembered in this browser |

URL parameters: `?seed=42` picks the starting seed; `?layout=loop` loads one
section on its own (`pegField`, `funnel`, `loop`, `halfPipe`, `splitter`,
`dropCatch`, `bumpyRoad`, `spiral`, `bouncyPads`, `bottleneck`, `winding`,
`valley`, `bigJump`).

## The course

Top to bottom, linked by sloped, curving track:

1. **Start ramp**: 8 seeded spawn slots on a painted grid, under a gantry whose five lights count down and turn green on "Go!".
2. **Peg field**: tilted Plinko board of cylinders.
3. **Funnel**: marbles enter tangentially, circle, drop through the centre hole.
4. **Loop-the-loop** after a steep drop, with a bypass (see below).
5. **Half-pipe**: marbles enter at an angle, swing wall to wall, leave through a slot.
6. **Splitter**: a wedge sends marbles down a short path or a long detour; they merge again.
7. **Winding 1**: a long run of gentle banked bends, left and right.
8. **Valley**: a sharp double bend as a brake, a steep fall that eases out into a flat middle, then a long climb to a crest a little lower than the top (see below).
9. **Drop and catch**: a jump across a gap; short jumps land in a slower recovery path that rejoins.
10. **Bumpy road**: washboard of speed bumps.
11. **Spiral**: 2.75-turn banked corkscrew.
12. **Bouncy pads**: a tilted rubber pad throws marbles up onto a higher track; misses take a lower path.
13. **Big jump**: a long steep run that widens, a short upward kicker, and a big funnel that catches the marbles in the air. The funnel drains into a closed pipe that goes straight down, bends level, turns sideways and comes out on ordinary track.
14. **Winding 2**: another long run of banked bends.
15. **Bottleneck**: narrows to a single-marble throat.
16. **Finish**: chequered line and finish gantry over the sensor, red and white kerbs, grandstands of spectator marbles either side, then a walled basin. Start and finish dressing is decoration only (no colliders, skipped headless), so it changes no race result.

S-bends (two sharp unbanked corners) sit between the fast sections and act
as brakes.

How "nothing gets stuck" is handled, section by section:

- **Valley**: a marble alone always makes the crest (at about 4 units/s,
  whatever speed it came in with, because the brake bends at the top even
  that out). In a pack, marbles that lose speed in collisions can fall back
  and roll to and fro in the middle. A marble that is still in the valley
  after 6 s goes back to the top of the fall, at rest; if that happens to it
  a second time, it is put just past the crest. In 20 races on
  `--layout valley` (160 marbles), 8 fell back and were sent to the top, and
  all of them made it the second time. The crest height (`climbLen` in
  `sections/valley.js`) is sensitive: 2.9 sends none back, 3.0 about one in
  seven, 3.1 most.
- **Loop**: there is a short gap in the floor at the foot of the loop. Fast
  marbles fly across; slow ones, and any that roll back out of the loop, drop
  through into a channel underneath that rejoins after the loop.
- **Drop and catch / bouncy pads**: a wide catch floor with tall walls under
  the jump feeds a gentler path that merges back in.
- **Peg field**: every gap (peg to peg, peg to wall) is wider than two
  marbles, so pairs cannot wedge.
- **Bottleneck**: asymmetric walls, so two marbles arriving together meet
  the narrowing at different points.
- **Banked curves**: the bank is eased in no faster than the slope allows, so
  no edge of the track ever runs uphill.
- **Safety net**: outside the valley, if a marble has not moved for 3.5 s it gets a nudge, and
  after two nudges it is moved a little further on. A marble that falls to
  the room floor is put back 0.5 units behind the last place it touched the
  track; if it falls at the same spot a third time, just past that spot
  instead. Marbles that fall onto a lower part of the course carry on from
  there. `npm run sim` counts how often this happens (see "Testing").
- **Centre line**: one invisible line runs along the main route (ranking,
  camera, rescues). Where the route jumps or drops through a hole, the line
  bridges the gap through the air; those points are marked as not solid, and
  a rescue only ever uses solid points that face up (never over a hole or on
  the loop's ceiling).

## Code layout

```
src/
  config.js            every tunable: WORLD_SCALE, marble material, track sizes, solver
  rng.js               seeded random numbers
  physics.js           world setup, fixed-timestep accumulator
  marbles.js           marble bodies and their interpolation state
  race.js              spawn, ranking, finish sensor, safety net (no DOM, runs headless)
  render.js            renderer, boundless white space, lights, marble shadows, marble meshes, debug lines
  camera.js            follow camera, free fly camera, leader's view
  ui.js                overlay
  main.js              wires it together, main loop
  course/
    course.js          THE LAYOUT: the ordered list of sections
    frame.js           poses and turtle-style path tracing (length / turn / pitch / bank)
    trackBuilder.js    sweeps a railed U channel along a path
    geometry.js        sweep and lathe mesh helpers
    context.js         what sections use to add colliders, meshes, sensors
    sections/          one file per obstacle or track type
scripts/
  sim.mjs              headless multi-seed race runner
  physics-check.mjs    single-marble physics checks
```

Each section exports `build(ctx, entryPose, opts)` and returns its exit pose,
so the course is a chain: reorder or retune sections in `course/course.js`.

## Track textures

Put pictures (png, jpg or webp) in `textures/` at the project root. The game
uses every picture there: press `T` and every course surface is covered with
a random mosaic, one picture per square tile (one track width across), each
tile turned by a random multiple of 90°. Add or remove pictures freely; no
code change is needed. Pictures are cropped to a centred square, so square
ones work best, and about 1024×1024 is plenty. The pattern is projected from
above and the sides, so it works on every piece; tile size is `TILE` in
`src/trackTexture.js`.

## Physics notes

All of this is in `src/config.js`.

- **Scale**: `WORLD_SCALE = 10`. A 16 mm marble has radius 0.08 units and
  gravity is 98.1, so motion has real-size timing.
- **Marbles**: dynamic balls without CCD (see below), density 2.5,
  restitution 0.55, friction 0.35, angular damping 0.08 (stand-in for
  rolling resistance).
- **Timestep**: fixed 1/480 s with an accumulator, at most 48 substeps per
  frame, render positions interpolated between the last two physics states.
  The speed slider only changes how fast the accumulator fills.
- **Track surfaces** are trimesh colliders (`FIX_INTERNAL_EDGES`); pegs,
  bumps, pads, wedge and bottleneck walls are cylinders, boxes and a convex hull.

Four things I found by measurement that you should know before changing them:

1. **Rapier is pinned to 0.19.3.** Versions 0.20 and later clamp angular
   velocity to a quarter turn per step. At 1/120 s that stops a marble of this
   size from rolling faster than about 7.5 units/s (0.75 m/s real); above
   that it skids and loses speed. 0.19.3 is the newest version without the
   clamp. At the current 1/480 s step the clamp would sit near 30 units/s,
   above the course's top speed, so upgrading may now be possible, but it is
   untested.
2. **`solverIterations` is 1** (with 4 PGS iterations). With more solver
   substeps, a fast-spinning ball sinks visibly into whatever it rolls on
   (about 20% of its radius at 12 units/s), which also made every joint
   between track pieces act as a bump.
3. **Track joints**: each track piece starts 5 mm lower and wider than
   nominal and eases back, so a marble crossing a joint steps down onto a
   face. Flush joints between separate trimesh colliders kick marbles upward.
4. **No CCD, small timestep.** With CCD on, Rapier halts a marble rolling
   over a trimesh at the internal triangle edges, but its velocity keeps
   growing under gravity, so the marble gains energy that later shows as
   sudden speed. At 1/120 s with CCD, a single marble picked up about
   2,000 J/kg on the course: it reached the foot of the loop at 26.5 units/s
   where physics allows about 17, and the jumps and the loop had been tuned
   on that free energy. Turning CCD off removes it. The timestep is 1/480 s so
   that marbles still cannot pass through the track: at 30 units/s a marble
   moves 0.06 units per step, under its 0.08 radius. (At 1/120 s without
   CCD, marbles fell through and needed 49 rescues in 64 races. Rapier's soft
   CCD avoided both problems, but it braked marbles so much that none made
   the loop.) `npm run physics-check` and `npm run sim` both fail if the
   energy gain comes back.

**One rule for every contact.** Marbles have one set of properties and are
never pushed or steered by the course (apart from the stuck-marble safety
net). Every surface is ordinary track material (restitution 0.45, friction
0.35) except the bouncy pad, which is rubber (0.85, 0.8). Every contact
combines the two surfaces' values with Rapier's default average; no surface
overrides the marble's own values.

## Testing

`npm run sim -- --seeds 30` races 30 seeds headless with the same course and
physics code the browser uses. It fails if any marble does not finish, prints
time and speed per section, how many marbles took each route, every safety-net
incident, audits that a single marble never gains energy, and checks that
running the same seed twice gives identical results.

`npm run sim -- --layout bottleneck --seeds 150` stress-tests one section with
all 8 marbles arriving together.

### Last measured results

The full-course figures below are from before the winding tracks, the valley
and the big jump were added; those three have not been raced as part of the
full course yet (only the valley on its own, see above).

Full course, seeds `seed-1` to `seed-100` (800 marbles):

- 800 of 800 finished; a race takes about 26 to 30 s.
- 0 stalls (the nudge never fired).
- 2 marbles (0.25%) left the track and were put back (one at the loop, one at the pads).
- Same seed run twice: identical order and times. Also checked in the browser.
- Routes: loop completed 789, bypass 11. Drop caught 676, recovery path 124.
  Pads reached the upper track 766, lower path 5. Splitter long 580, short 220.

Single sections with all 8 marbles arriving in a pack, which is harsher than
the real course:

| Section | Marbles | Stalls | Put back | Notes |
|---|---|---|---|---|
| Peg field | 1200 | 0 | 0 | |
| Funnel | 1200 | 0 | 0 | |
| Loop | 1200 | 0 | 1 | 1113 completed, 87 bypass |
| Half-pipe | 1200 | 0 | 0 | |
| Splitter | 1200 | 0 | 0 | 602 long, 598 short |
| Drop and catch | 800 | 0 | 0 | 783 caught, 16 recovery |
| Bumpy road | 800 | 0 | 0 | |
| Spiral | 800 | 0 | 0 | |
| Bouncy pads | 800 | 0 | 11 | 494 up, 263 lower path; the slow test run-in suits it less than the real approach |
| Bottleneck | 1200 | 0 | 0 | |

The pads figure is from before the last round of rail changes elsewhere; the
pads themselves were not changed after it.
