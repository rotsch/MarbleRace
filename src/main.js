import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Race } from './race.js';
import { FixedStepper, initPhysics } from './physics.js';
import { View } from './render.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';
import { loadStored } from './tuning.js';
import { MARBLE } from './config.js';

loadStored(); // physics values the player set last time

await initPhysics(RAPIER);

const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('scene'));
const rig = new CameraRig(view.camera, view.renderer.domElement);
const stepper = new FixedStepper();
let race = null;
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

function startCountdown() {
  phase = 'countdown';
  countdownEnd = performance.now() + COUNTDOWN * 1000;
  ui.hideStart();
}

// countdown: false only for the very first race, which waits for Start.
function restart(seed, countdown = true) {
  if (race) race.dispose();
  race = new Race(RAPIER, seed, view.materials, params.get('layout') || 'full');
  view.setRace(race);
  stepper.accumulator = 0;
  rig.reset();
  povIndex = null;
  window.race = race; // handy for inspection from the console
  if (countdown) startCountdown();
  else {
    phase = 'ready';
    ui.showStart(startCountdown);
  }
}

const handlers = {
  restart,
  // R: back to the start line and wait; R again (or Start) starts it.
  resetKey: (seed) => (phase === 'ready' ? startCountdown() : restart(seed, false)),
  speed: (v) => (speed = v),
  debug: (on) => view.setDebug(on),
  camera: (mode) => rig.setMode(mode),
  texture: (on) => view.trackTexture.setEnabled(on),
};
const ui = new UI(handlers);
rig.onRequestFree = () => ui.enterFree(handlers);
ui.seed.value = params.get('seed') || '1';
restart(ui.seed.value, false);

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
const pov = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), up: new THREE.Vector3(), tangent: new THREE.Vector3(), radius: MARBLE.radius };
let last = performance.now();

function frame(now) {
  const frameDt = (now - last) / 1000;
  last = now;
  if (phase === 'countdown') {
    const left = (countdownEnd - now) / 1000;
    if (left > 0) ui.showCountdown(String(Math.min(COUNTDOWN, Math.ceil(left))));
    else {
      phase = 'running';
      stepper.accumulator = 0;
      ui.showCountdown('Go!', 700);
    }
  }
  const alpha = phase === 'running' ? stepper.advance(frameDt, speed, () => race.step()) : 1;
  view.updateMarbles(race.marbles, alpha);

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
    pov.vel.copy(m.body.linvel());
    pov.up.copy(point.up);
    pov.tangent.copy(point.tangent);
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
