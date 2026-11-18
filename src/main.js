import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Race } from './race.js';
import { FixedStepper, initPhysics } from './physics.js';
import { View } from './render.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';
import { loadStored } from './tuning.js';
import { MARBLE, PHYSICS } from './config.js';
import { START_LIGHTS } from './course/decor.js';
import { Sound } from './audio.js';
import { Editor, loadStoredCourse } from './editor.js';
import { EditorPanel } from './editorPanel.js';
import { defaultCourse } from './course/pieces.js';

loadStored(); // physics values the player set last time

await initPhysics(RAPIER);

const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('scene'));
const rig = new CameraRig(view.camera, view.renderer.domElement);
const stepper = new FixedStepper();
let race = null;
// The course as data (see course/pieces.js): ?layout=... for one section on
// its own, otherwise the course last edited in this browser (?course=default
// ignores it), otherwise the original course.
const layout = params.get('layout') || 'full';
let course = params.get('layout') || params.get('course') === 'default'
  ? defaultCourse(layout)
  : loadStoredCourse() ?? defaultCourse(layout);
// Marble the leader's view rides on: the leader, or once everyone has
// finished, whoever led last.
let povIndex = null;
let speed = 1;

// Race phases: 'ready' (marbles wait on the start line until Start is
// pressed), 'countdown' (3, 2, 1 on screen), 'running'. Physics only steps
// while running; the camera and rendering always run.
const COUNTDOWN = 3; // seconds
let phase = 'ready';
let countdownEnd = 0;
let goTime = 0; // when the start lights turned green
// Space pauses: physics, the race clock and the countdown stand still; the
// camera keeps working so the scene can be looked around.
let paused = false;

function startCountdown() {
  phase = 'countdown';
  countdownEnd = performance.now() + COUNTDOWN * 1000;
  ui.hideStart();
}

function setPaused(on) {
  if (on !== paused) sound.pause(on);
  paused = on;
  ui.showPaused(on);
}

// Start lights follow the countdown: they come on one by one, turn green on
// "Go!" and switch off a moment later.
function updateStartLights(now) {
  const lights = race.course.startLights;
  if (!lights) return;
  let lit = 0, go = false;
  if (phase === 'countdown') {
    const elapsed = COUNTDOWN - (countdownEnd - now) / 1000;
    lit = Math.min(START_LIGHTS, 1 + Math.floor((elapsed / COUNTDOWN) * START_LIGHTS));
  } else if (phase === 'running') go = now - goTime < 2000;
  lights(lit, go);
  // A beep for every light coming on, a higher one for green.
  if (lit > heard.lit) sound.beep();
  if (go && !heard.go) sound.beep(true);
  heard.lit = lit;
  heard.go = go;
}

// Sound: what the race did since the last frame, turned into sound.
const sound = new Sound();
// Counters of what has already been played, reset with every race.
const heard = { lit: 0, go: false, results: 0, log: 0, over: false, overAt: 0 };
// The crowd wakes when the leader is this close to the finish line (units of
// course length, about 1 m real) and goes quiet this long after the last
// marble crossed it, so the last cheer can ring out.
const CROWD_NEAR = 10;
const CROWD_LINGER = 2500; // ms

function playRaceSounds() {
  // Hits: the strongest few of this frame (a fast-forwarded frame can hold
  // dozens of steps' worth).
  const hits = race.impacts.sort((a, b) => b.strength - a.strength).slice(0, 8);
  for (const h of hits) sound.impact(h.key, h.pos, h.strength, h.kind);
  race.impacts.length = 0;
  // Finishers: a bell each, the crowd cheers, a fanfare for the winner.
  while (heard.results < race.results.length) {
    const m = race.results[heard.results++];
    sound.finish(view.marbleMeshes[m.index].position, m.place);
  }
  if (race.finished && !heard.over) {
    heard.over = true;
    heard.overAt = performance.now();
    setTimeout(() => sound.raceOver(), 1200);
  }
  // Crowd: on once the leader nears the finish, off after the last is home.
  const finishS = race.course.path[race.course.finishIndex].s;
  const near = race.marbles.some((m) => m.finished || m.progress > finishS - CROWD_NEAR);
  sound.setCrowdActive(phase === 'running' && near && !(heard.over && performance.now() - heard.overAt > CROWD_LINGER));
  // Safety net: nudges puff, rescues and zone resets bloop.
  while (heard.log < race.log.length) {
    const e = race.log[heard.log++];
    const m = race.marbles.find((x) => x.name === e.marble);
    if (!m) continue;
    const t = m.body.translation();
    if (e.type === 'nudge') sound.nudge(t);
    else sound.rescue(t);
  }
  // Rolling: loud and bright with speed, silent in the air.
  const active = phase === 'running' && !paused;
  sound.updateRolling(
    race.marbles.map((m, i) => {
      const v = m.body.linvel();
      return { pos: view.marbleMeshes[i].position, speed: Math.hypot(v.x, v.y, v.z), touching: m.touching };
    }),
    active
  );
}

// countdown: false only for the very first race, which waits for Start.
function restart(seed, countdown = true) {
  if (race) race.dispose();
  race = new Race(RAPIER, seed, view.materials, course);
  view.setRace(race);
  stepper.accumulator = 0;
  rig.reset();
  povIndex = null;
  window.race = race; // handy for inspection from the console
  race.impacts = [];
  Object.assign(heard, { lit: 0, go: false, results: 0, log: 0, over: false, overAt: 0 });
  sound.setCrowdActive(false);
  sound.setCrowd(race.course.path[race.course.finishIndex].pos);
  if (view.wireframe) ui.showMeshStats(view.meshStats);
  setPaused(false);
  if (countdown) startCountdown();
  else {
    phase = 'ready';
    if (editor?.active) ui.hideStart();
    else ui.showStart(startCountdown);
  }
}

const handlers = {
  restart,
  // R: back to the start line and wait; R again (or Start) starts it.
  resetKey: (seed) => (phase === 'ready' ? startCountdown() : restart(seed, false)),
  speed: (v) => {
    if (v !== speed) sound.click(0.8 + Math.log2(v / 0.1) * 0.12);
    speed = v;
  },
  pause: () => setPaused(!paused),
  isPaused: () => paused,
  setPaused,
  debug: (on) => (sound.click(on ? 1.2 : 0.9), view.setDebug(on)),
  wireframe: (on) => (sound.click(on ? 1.2 : 0.9), view.setWireframe(on)),
  camera: (mode) => (sound.click(), rig.setMode(mode)),
  look: (look) => (sound.click(look === 'white' ? 0.9 : 1.2), view.setLook(look)),
  editing: () => editor.active,
  edit: () => setEditing(!editor.active),
};
const ui = new UI(handlers);
ui.bindSound(sound);
window.sound = sound; // console access, like window.race
rig.onRequestFree = () => ui.enterFree(handlers);

// Debug: shoot marbles from the camera. A click shoots towards the cursor
// (towards the crosshair while the mouse steers the free camera), F shoots
// towards the last cursor position. In the free camera the first click still
// grabs the mouse. Shots only fly while the race runs.
const SHOT_SPEED = 12; // units/s, a little below the racers' top speed
const SHOT_COLORS = [0xffffff, 0x222222, 0x9e9e9e, 0x8d5a3b];
let shooting = false;
let shotCount = 0;
const mouse = new THREE.Vector2(0, 0); // normalised device coordinates
const raycaster = new THREE.Raycaster();
const canvas = view.renderer.domElement;
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
});
function shoot() {
  const locked = document.pointerLockElement === canvas;
  raycaster.setFromCamera(locked ? new THREE.Vector2(0, 0) : mouse, view.camera);
  const { origin, direction } = raycaster.ray;
  const start = origin.clone().addScaledVector(direction, MARBLE.radius * 3);
  race.shoot(start, direction, SHOT_SPEED, SHOT_COLORS[shotCount++ % SHOT_COLORS.length]);
  sound.shot();
}
rig.onClick = (e) => {
  if (editor.click(e)) return true;
  if (!shooting) return false;
  if (rig.mode === 'free' && document.pointerLockElement !== canvas) return false;
  shoot();
  return true;
};
// Aim: the mouse cursor turns into a crosshair; while the mouse steers the
// free camera (no cursor) a crosshair marks the screen centre.
function showAim() {
  canvas.style.cursor = shooting ? 'crosshair' : '';
  document.getElementById('crosshair').hidden = !(shooting && document.pointerLockElement === canvas);
}
document.addEventListener('pointerlockchange', showAim);
handlers.shooting = (on) => {
  sound.click(on ? 1.2 : 0.9);
  shooting = on;
  showAim();
};
handlers.shoot = () => shooting && shoot();
// Track editor (G): the race waits on the start line while pieces are edited;
// every edit rebuilds the course from its data.
let editor = null;
editor = new Editor(view, rig, {
  race: () => race,
  course: () => course,
  layout,
  rebuild: (data) => {
    course = data;
    restart(ui.seed.value.trim() || '1', false);
  },
});
handlers.editor = editor;
window.editor = editor; // console access, like window.race
const editorPanel = new EditorPanel(editor, { onTest: () => setEditing(false, true) });
function setEditing(on, test = false) {
  if (on) {
    if (phase !== 'ready') restart(ui.seed.value.trim() || '1', false);
    ui.hideStart();
    ui.setCamera('free', handlers);
  }
  editor.setActive(on);
  if (!on) {
    if (test) {
      ui.setCamera('follow', handlers);
      restart(ui.seed.value.trim() || '1', true);
    } else if (phase === 'ready') ui.showStart(startCountdown);
  }
  editorPanel.show();
}
document.getElementById('edit-track').addEventListener('click', (e) => {
  e.currentTarget.blur();
  setEditing(!editor.active);
});

ui.seed.value = params.get('seed') || '1';
try {
  restart(ui.seed.value, false);
} catch (err) {
  // The course saved by the editor does not build: start on the original
  // one instead, and forget the broken one.
  console.error('Saved course does not build, using the original course:', err);
  try {
    localStorage.removeItem('marble-race-course');
  } catch {
    // ignore
  }
  course = defaultCourse(layout);
  restart(ui.seed.value, false);
}
// ?look=neon (or pictures) starts in that look.
if (params.get('look')) ui.setLook(params.get('look'), handlers);

// Dev aid: ?cam=x,y,z,tx,ty,tz starts in free camera at a fixed viewpoint.
if (params.get('cam')) {
  const c = params.get('cam').split(',').map(Number);
  view.camera.position.set(c[0], c[1], c[2]);
  view.camera.lookAt(c[3], c[4], c[5]);
  ui.enterFree(handlers);
}

const target = new THREE.Vector3();
const tangent = new THREE.Vector3(0, 0, 1);
let hint = null;
const POV_AHEAD = 0.5; // units (5 cm real)
const POV_OFF_ROUTE = 0.45; // further than this from the centre line: on a side route
const pov = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), radius: MARBLE.radius };
let last = performance.now();

function frame(now) {
  const frameDt = (now - last) / 1000;
  last = now;
  if (paused) {
    // Hold the countdown and the green light where they are.
    countdownEnd += frameDt * 1000;
    goTime += frameDt * 1000;
  } else if (phase === 'countdown') {
    const left = (countdownEnd - now) / 1000;
    if (left > 0) ui.showCountdown(String(Math.min(COUNTDOWN, Math.ceil(left))));
    else {
      phase = 'running';
      goTime = now;
      stepper.accumulator = 0;
      ui.showCountdown('Go!', 700);
    }
  }
  updateStartLights(now);
  let alpha = 1;
  if (phase === 'running') {
    alpha = paused ? stepper.accumulator / PHYSICS.timestep : stepper.advance(frameDt, speed, () => race.step());
  }
  editor.update(now);
  view.updateMarbles(race.marbles, alpha);
  view.updateShots(race);
  playRaceSounds();

  // Follow the leader; once everyone is home, rest on the finish basin.
  const lead = race.leader();
  if (lead) {
    target.copy(view.marbleMeshes[lead.index].position);
    const point = race.course.path[lead.pathIndex];
    tangent.copy(point.tangent);
    hint = point.cam;
  } else {
    const end = race.course.path[race.course.path.length - 1];
    target.copy(end.pos);
    tangent.copy(end.tangent);
    hint = end.cam;
  }
  // Switch rides only once the new leader is clearly ahead (0.25 units, 2.5 cm
  // real), so marbles trading the lead in a pack do not flick the view about.
  const riding = povIndex === null ? null : race.marbles[povIndex];
  if (lead && lead.index !== povIndex && (!riding || riding.finished || lead.progress > riding.progress + 0.25)) {
    povIndex = lead.index;
    rig.povInit = false; // jump straight to the new leader's view
  }
  let ride = null;
  if (rig.mode === 'pov' && povIndex !== null) {
    const m = race.marbles[povIndex];
    const point = race.course.path[m.pathIndex];
    pov.pos.copy(view.marbleMeshes[povIndex].position);
    // Look along the course: from the marble's centre-line point towards the
    // point POV_AHEAD further on, so the view leads into bends instead of
    // facing whatever wall the marble happens to be rolling or bouncing at.
    // On a side route (splitter detour, recovery paths, the loop's bypass)
    // the centre line runs elsewhere, so look along the marble's own motion.
    const path = race.course.path;
    const off = pov.pos.distanceTo(point.pos);
    const vel = m.body.linvel();
    if (off > POV_OFF_ROUTE && vel.x * vel.x + vel.y * vel.y + vel.z * vel.z > 0.25) {
      pov.dir.set(vel.x, vel.y, vel.z);
    } else {
      let j = m.pathIndex;
      while (j < path.length - 1 && path[j].s < point.s + POV_AHEAD) j++;
      if (j > m.pathIndex) pov.dir.subVectors(path[j].pos, point.pos);
      else pov.dir.copy(point.tangent);
    }
    pov.up.copy(point.up);
    pov.radius = MARBLE.radius;
    ride = pov;
  }
  // The marble being ridden on is hidden, so it does not fill the view.
  view.marbleMeshes.forEach((mesh, i) => (mesh.visible = !ride || i !== povIndex));
  view.updateShadows(race);
  rig.update(Math.min(frameDt, 0.5), target, tangent, hint, ride);
  view.updateDebug(race.world);
  ui.update(race);
  view.render(rig.focus);
  sound.setListener(view.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
