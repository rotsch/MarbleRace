import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Race } from './race.js';
import { FixedStepper, initPhysics } from './physics.js';
import { View } from './render.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';
import { loadStored } from './tuning.js';

loadStored(); // physics values the player set last time

await initPhysics(RAPIER);

const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('scene'));
const rig = new CameraRig(view.camera, view.renderer.domElement);
const stepper = new FixedStepper();
let race = null;
let speed = 1;

function restart(seed) {
  if (race) race.dispose();
  race = new Race(RAPIER, seed, view.materials, params.get('layout') || 'full');
  view.setRace(race);
  stepper.accumulator = 0;
  rig.reset();
  window.race = race; // handy for inspection from the console
}

const handlers = {
  restart,
  speed: (v) => (speed = v),
  debug: (on) => view.setDebug(on),
  free: (on) => rig.setFree(on),
  texture: (on) => view.trackTexture.setEnabled(on),
};
const ui = new UI(handlers);
rig.onRequestFree = () => ui.enterFree(handlers);
ui.seed.value = params.get('seed') || '1';
restart(ui.seed.value);

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
let last = performance.now();

function frame(now) {
  const frameDt = (now - last) / 1000;
  last = now;
  const alpha = stepper.advance(frameDt, speed, () => race.step());
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
  rig.update(Math.min(frameDt, 0.5), target, tangent, hint);
  view.updateDebug(race.world);
  ui.update(race);
  view.render(rig.focus);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
