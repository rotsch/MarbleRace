# Marble Race

Two to 24 glass marbles race down one long 3D course in an empty white room.
Every racer has a name and a look: a plain colour or a design painted in the
built-in marble paint editor.
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
| click scene | enter free camera and steer with the mouse (pointer lock, `Esc` releases); holding the right mouse button also steers it |
| `W` `A` `S` `D` | fly forward / left / back / right (enters free camera) |
| `Q` / `E` | fly up / down |
| `Shift` | fly faster |
| Speaker button / volume slider (bottom left), `N` | sound on / off and volume (remembered by the browser). All sounds are synthesised with Web Audio: rolling (louder and brighter with speed, silent in the air), hits on the track, glass clicks between marbles, boings on the rubber pads, start-light beeps, a bell per finisher with a cheering crowd and a fanfare for the winner, a crowd of babbling voices at the finish (it wakes as the leader nears the line and falls silent once the last marble is home), safety-net nudges and rescues, shots, clicks and pause. World sounds come from where they happen, heard from the camera |
| `T` or Theme menu | cycle the theme: White (default) → Neon dusk (evening sky with a striped sun and stars, an endless glowing grid floor with light pulses, a rainbow track whose colour follows height, candy-striped floors, neon gantries and stands, low-poly shapes drifting around the course) → ITSENSE (in the style of itsense.ch: a grey-to-rose hero-gradient sky, a ring of flat low-poly grey peaks with notched snow caps and a red Swiss flag on the highest, light page-grey ground with faint chevrons, white track floors with grey walls, red gantries, and the panels in Inter with red accents and red outlined buttons) → Picture mosaic (every picture in `textures/` as a random mosaic; skipped if the folder has none) |
| Race setup (on the start line) | number of marbles (2 to 24; the start grid grows to fit them), each racer's name and design (plain colours, or painted designs from `marbles/`), ✎ paints a design for that racer, Shuffle designs, Defaults. Remembered in this browser. The Race setup button (right panel) or `R` goes back to the start line |
| Start race (button) | the page opens with the marbles waiting on the start line; every start (this button, a second `R`, Restart, New seed, physics Apply) counts down 3, 2, 1 first |
| Racers (left) | every racer as a slowly spinning 3D marble with its name, its current place (its final place once finished), and a ring on the leader |
| `P` or Paint | marble paint editor (see below) |
| Progress line (top) | every marble at its distance along the course; marbles further ahead are drawn over those behind; shows the leader (the winner once someone finishes) |
| `G` or Edit track | track editor (see below): the race waits on the start line; click a piece to select it, drag the gizmo to move it (`1`) or turn it (`2`), snap sockets together, change its options, add / delete pieces, `Ctrl+Z` / `Ctrl+Y` undo / redo, `Del` deletes, `Esc` deselects; `3` shape (widen, raise / lower walls); Test race leaves the editor and starts a race on the edited course |
| Physics panel | marble size, bounciness, grip and rolling resistance; track bounciness and grip; rubber pad bounciness. Apply restarts the race; values are remembered in this browser |

URL parameters: `?seed=42` picks the starting seed; `?layout=loop` loads one
section on its own (`pegField`, `funnel`, `loop`, `halfPipe`, `splitter`,
`dropCatch`, `bumpyRoad`, `spiral`, `bouncyPads`, `bottleneck`, `winding`,
`valley`, `bigJump`, `classic` (the course before the newer pieces), and the newer pieces `stairs`, `bumpers`, `waves`,
`splitter3`, `wallRide`, `railRun`, `chicane`, `skiJump`, `corkscrew`,
`tunnelDrop`); `?course=default` ignores the course saved by the editor.

## Marble paint editor

`P`, Paint, or ✎ next to a racer in the race setup opens the paint editor:
one big marble in the middle, tools on the left, colours and the design on
the right. Left mouse paints; right mouse (or the Turn tool, or dragging
beside the marble) turns it; the wheel zooms.

| Tool | |
|---|---|
| Brush `B` | round brush; size, opacity and softness |
| Spray `S` | spray paint: hold to fill the circle with dots |
| Eraser `E` | removes paint, the base shows again |
| Fill `F` | fills an area of about one colour (a stripe of the pattern, a painted shape) |
| Ring `R` | a band right round the marble: drag across it (the band runs through both points), or click for one across the view; Size sets its width |
| Sticker `T` | stamps a sticker with size and rotation; a preview shows where it goes. 57 stickers in five groups: **Shapes** (circle, ring, square, triangle, diamond, hexagon, star, six-point star, sparkle, heart, plus, cross, target, spiral, infinity), **Symbols** (lightning, arrow, tick, music note, spade, club, gem, crown, shield, anchor, peace, dice, number badge, flag, rocket), **Nature** (sun, moon, cloud, snowflake, droplet, flame, leaf, four-leaf clover, flower, pine tree, waves, planet, mushroom), **Creatures and faces** (paw print, fish, bone, butterfly, cat, ghost, skull, smiley, wink, sad face, sunglasses face, eye) and **Your own** (text, emoji included, and Picture…, any image). Stickers take the paint colour; the eye and pictures keep their own colours. The number badge shows what is in the Text field. Add more in `src/stickers.js` |
| Pick colour `I` | takes the colour under the cursor |
| Turn `H` | turns the marble |

Symmetry repeats every stroke mirrored (left / right) or 2, 3, 4, 6 or 8 times
around the marble. Undo / redo (`Ctrl+Z` / `Ctrl+Y`, 30 steps), `[` / `]`
size, Clear paint, Spin (turns the marble slowly to look at it).

Each design has a **base**, a colour with an optional pattern in a second
colour (plain, swirl, stripes, beach ball, two halves, checker, spiral, dots),
which can be changed at any time under the paint, and a **finish** (glossy,
matte, metal, pearl).

Paint goes onto the sphere itself, not onto the flat picture wrapped around
it: a brush dab covers every texel within an angle of the point under the
cursor, and stickers are projected from the marble's centre, so shapes keep
their form everywhere, also at the poles and across the seam.

**Saving and sharing.** Save writes `marbles/<name>.json` (under `npm run dev`
or `npm run preview`); the design then appears in every racer's design menu.
Put design files in `marbles/` (and commit them) to share them with everyone.
Export downloads the design as a file; Import loads one; the menu below opens
a saved design. A static build has the designs that were in `marbles/` when it
was built; saving there keeps the design in the browser and downloads the file.

A design file is JSON:

```
{
  "kind": "marble-design", "version": 1, "name": "Bumblebee",
  "finish": "glossy",                                   // glossy | matte | metal | pearl
  "base": { "pattern": "stripes", "color": "#fdd835", "color2": "#1b1b1b" },
  "paint": "data:image/png;base64,..."                  // or null
}
```

`paint` is a 1024 x 512 PNG with transparency, wrapped around the marble the
way three.js maps a sphere (longitude across, latitude down, the top row at
the north pole). See `src/designs.js`.

The 19 sample designs in `marbles/` were all painted with the editor's tools:
Basketball, Beach Ball, Bumblebee, Camo, Earth, Eight Ball, Eyeball, Flower
Power, Football, Galaxy, Gold Medal, Ladybug, Lava, Lucky Seven, Moon,
Pumpkin, Rainbow, Tennis Ball, Zebra. The editor is also reachable from the
browser console as `window.painter` (like `window.race`), so designs can be
painted by script: its `_dab`, `_ring`, `_fill`, `_stamp` and `_spray`
methods take a unit direction on the marble.

## Track editor

`G` opens the editor. The course is data: placed pieces and the links
between their **sockets** (`src/course/pieces.js`). Each piece has inputs and
outputs, drawn on the track floor on the centre line, with an arrow in the
direction marbles travel: **green** inputs, **orange** outputs, a pin on each
open one; linked sockets shrink to a grey dot, and a linked input that no
longer lines up turns **red**.

- Drag a piece by its gizmo (it sits on the piece's input). The pieces linked
  after it come along; **Alt-drag** moves only the piece and leaves the rest
  where it is. Moving unlinks the piece from the one before it.
- Drop a socket within 0.3 units of an open socket of the opposite kind and it
  **snaps**: position and heading line up and the two are linked. A linked
  piece starts exactly where the output before it ends, slope included.
- Rotate turns the piece about its input, in 15° steps (moves snap to 0.1).
- **Shape** (`3`): widen the track and raise or lower its walls along a
  piece. A piece gets *shape stops* (Add shape stop); each stop sits at a
  distance along the piece and adds to the piece's own design: **Width**
  (both walls move apart equally), **Left** / **Right** (that wall's height;
  taking a wall down to 0 leaves that side open, so marbles can roll off).
  Between stops the track eases smoothly; before the first stop and after
  the last it eases back to normal over 0.5 units. Every stop has a purple
  handle on top of each wall: click one, then drag its arrows up / down for
  that wall's height, sideways for the width, along the track to move the
  stop. The panel's table shows the same values (in course units; the track
  is 0.6 wide, walls 0.26 high) for typing. It shapes the piece's main
  route only (not funnel bowls, the loop ring, pipes or side routes), and the
  problems list warns when a change reaches a piece's start or end, where it
  no longer matches the piece next to it.
- **Connect** buttons (in the panel, under the selected piece's options) list
  every open socket of the selected piece paired with each open socket of the
  opposite kind on another piece, nearest first. A click moves and turns the
  selected piece (with the pieces linked after it) so the two sockets meet,
  and links them. The same pair is offered from either piece; the one that
  is selected is the one that moves.
- The panel lists every piece, edits the selected piece's options (blank =
  the piece's default), adds a piece after the selected one (inserted into the
  chain) or in front of the camera, detaches or deletes it, and lists problems
  (open outputs, inputs out of line).
- The piece list is grouped (Track, Bends, Hills and drops, Obstacles,
  Jumps, Splits and catches, Start and finish).
- **Fork** has two outputs and **Merge** two inputs, for routes that split and
  meet again. Race progress follows the links, so marbles are ranked and
  rescued correctly on either route.
- **Tracks** (panel): saved tracks are JSON files in the `tracks/` folder,
  and the file name is the track's name (`tracks/My track.json` is "My
  track"). Pick one and **Load** it (Undo brings back the course you had), or
  type a name and **Save** the current course as `tracks/<name>.json` (asks
  before replacing one). Names are 1 to 60 letters, digits, spaces, `-` or
  `_`. Saving writes the file through the dev server (`npm run dev` or
  `npm run preview`); a static build has no server, so it lists the tracks
  that were in the folder when it was built and Save downloads the file
  instead (put it in `tracks/` to keep it). `?track=<name>` opens a saved
  track, and `npm run sim -- --track <name>` races one headless.
  `tracks/Default.json` and `tracks/Classic.json` are the two built-in
  courses.
- Every edit rebuilds the course (about 60 ms) and is saved in this browser.
  Export / Import save and load the course as JSON from anywhere;
  `npm run sim -- --course marble-course.json` races an exported course headless.
  Reset course goes back to the original.

## The course

The default course uses every piece type once, in this order: start, peg
field, stairs, funnel, pinball bumpers, loop, half-pipe, splitter, gutter
rails, winding, valley, wave track, drop and catch, chicane, bumpy road,
spiral, wall ride, bouncy pads, three-way splitter, ski jump, corkscrew, a
fork into two matching straights and a merge, big jump, tunnel drop,
winding, bottleneck, finish, with curves and S-bends between them. It has
not been raced headless yet. The course before the newer pieces is
`?layout=classic`, described below. A course saved by the editor still loads
in place of the default: use Reset course in the editor, or
`?course=default`.

The classic course, top to bottom, linked by sloped, curving track:

1. **Start ramp**: a painted starting grid with two marbles per row, as many rows as the race has marbles (seeded slots), under a gantry whose five lights count down and turn green on "Go!". Up to four rows fit on the ramp as laid out; for more, the ramp reaches further back uphill, so the start line and the rest of the course stay where they are.
2. **Peg field**: tilted Plinko board of cylinders.
3. **Funnel**: marbles enter tangentially, circle, drop through the centre hole.
4. **Loop-the-loop** after a steep drop, with a bypass (see below).
5. **Half-pipe**: marbles enter at an angle, swing wall to wall, leave through a slot. The lead-in's length, slope and turn and the entry angle are options.
6. **Splitter**: a wedge sends marbles down a short path or a long detour; they merge again.
7. **Winding 1**: a long run of gentle banked bends, left and right.
8. **Valley**: a straight lead-in, a steep fall that eases out into a flat middle, then a long climb to a crest a little lower than the top (see below). Drop slope, climb slope and middle length are options.
9. **Drop and catch**: a jump across a gap; short jumps land in a slower recovery path that rejoins.
10. **Bumpy road**: washboard of speed bumps.
11. **Spiral**: 2.75-turn banked corkscrew. Steepness is an option, and **Tunnel** closes it over with a see-through roof (its walls and roof fit under the turn above, so a shallow spiral gets a lower tunnel).
12. **Bouncy pads**: a tilted rubber pad throws marbles up onto a higher track; misses take a lower path.
13. **Big jump**: a long steep run that widens, a short upward kicker, and a big funnel that catches the marbles in the air. The funnel drains into a closed pipe that goes straight down, bends level, turns sideways and comes out on ordinary track.
14. **Winding 2**: another long run of banked bends.
15. **Bottleneck**: narrows to a single-marble throat; the throat width is an option.
16. **Finish**: chequered line and finish gantry over the sensor, red and white kerbs, grandstands of spectator marbles either side, then a walled basin. Start and finish dressing is decoration only (no colliders, skipped headless), so it changes no race result.

S-bends (two sharp unbanked corners) sit between the fast sections and act
as brakes.

How "nothing gets stuck" is handled, section by section:

- **Valley**: the crest always sits the same height below the top of the
  fall (the height measured to work with the original slopes); the climb's
  length is worked out from the slopes and the middle length to keep it
  there. In a pack, marbles that lose speed in collisions can fall back and
  roll to and fro in the middle. A marble that is still in the valley after
  6 s goes back to the start of the lead-in; if that happens to it a second
  time, it is put just past the crest. The crest height is sensitive (with
  the original slopes, a climb of 3.0 instead of 2.95 sent one marble in
  seven back), and extreme settings can make it unreachable: a 62° drop
  with a 26° climb and a 2.5 long middle sent every marble back twice.
  The crest can instead be set as a height above the valley bottom with
  `rise` (positive only; about 2.60 with the original slopes, and the
  editor's "Crest rise" field). Each 0.1 of climb length is about 0.07 of
  rise, so small changes matter.
- **Loop**: there is a short gap in the floor at the foot of the loop. Fast
  marbles fly across; slow ones, and any that roll back out of the loop, drop
  through into a channel underneath that rejoins after the loop. The channel
  sits 0.55 below the foot (`bypassDepth`), so the track coming down from
  the loop clears its walls by at least 13 cm; that track starts level, like
  the end of the loop, and eases into its slope.
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

### Pieces for the editor

These are in the editor's piece list (and `?layout=`), not in the default course.
Their numbers are first settings and have not been measured in races yet.

- **Stairs** (Track): treads that each end in a small drop onto the next;
  steps, tread length, step height and tread slope are set in the editor.
- **Gutter rails** (Track): the track narrows to single file onto two thin
  round rails with open sides. Marbles knocked off land on a catch tray that
  rejoins after the rails.
- **Wall ride** (Bends): a steep run-in, then a tight bend whose outer wall
  curves up into a tall quarter-pipe, so faster marbles ride higher.
- **Chicane** (Bends): left, right twice as far, left again, unbanked, with
  openings in the outer walls. Marbles too fast to hold the bend drop onto a
  catch tray that rejoins after it.
- **Corkscrew** (Bends): a see-through tube winding round a line that runs
  ahead and down, steep enough that the tube is downhill everywhere, so
  nothing can stop in it; brake bends after it.
- **Wave track** (Hills and drops): small valleys in a row, each crest lower
  than the one before; like the valley, a marble that lingers is sent back to
  the start of the piece, the second time past it.
- **Tunnel drop** (Hills and drops): the track ends over a cone that drops the
  marbles into a see-through tube: straight down, a bend to level, an
  optional sideways turn, then out onto track.
- **Pinball bumpers** (Obstacles): a wide table with large rubber bumpers.
- **Ski jump** (Jumps): in-run, a take-off table, a landing hill that falls
  away faster than the marbles do, distance stripes, brake bends after.
- **Three-way splitter** (Splits and catches): a straight middle lane and a
  short and a long loop either side, all meeting again.

## Code layout

```
src/
  config.js            every tunable: WORLD_SCALE, marble material, track sizes, solver
  rng.js               seeded random numbers
  tracks.js            list / load / save the tracks in tracks/ (via the dev server, see vite.config.js)
  designs.js           marble designs: base patterns, textures, finishes, the marbles/ folder
  painter.js           marble paint editor
  stickers.js          the paint editor's sticker shapes
  setup.js             race setup: number of marbles, names, designs
  lineup.js            the racers down the left, spinning 3D marbles
  physics.js           world setup, fixed-timestep accumulator
  marbles.js           marble bodies and their interpolation state
  race.js              spawn, ranking, finish sensor, safety net (no DOM, runs headless);
                       new Race(RAPIER, seed, materials, layout, entries) races the given entries
  render.js            renderer, boundless white space, lights, marble shadows, marble meshes, debug lines
  camera.js            follow camera, free fly camera, leader's view
  ui.js                overlay
  editor.js            track editor: selection, gizmo, socket markers, snapping, undo, save
  editorPanel.js       the editor's panel
  main.js              wires it together, main loop
  course/
    pieces.js          THE LAYOUT as data: piece types, the default course, building from data
    course.js          builds a layout name or course data
    frame.js           poses and turtle-style path tracing (length / turn / pitch / bank)
    trackBuilder.js    sweeps a railed U channel along a path
    geometry.js        sweep and lathe mesh helpers
    context.js         what sections use to add colliders, meshes, sensors
    sections/          one file per obstacle or track type
scripts/
  sim.mjs              headless multi-seed race runner
  physics-check.mjs    single-marble physics checks
```

Each section exports `build(ctx, entryPose, opts)` and returns its exit pose
(or `{ exits: [...] }` for several outputs; extra inputs come from
`ctx.addSocket('in', frame)`). The default course in `course/pieces.js` is a
chain of pieces, each linked to the one before it: reorder or retune it there,
or in the editor.

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
all 8 marbles arriving together. `npm run sim -- --course file.json` races a
course exported from the editor.

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
