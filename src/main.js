import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Race } from './race.js';
import { FixedStepper } from './physics.js';
import { View } from './render.js';
import { CameraRig } from './camera.js';
import { UI } from './ui.js';

await RAPIER.init();

const params = new URLSearchParams(location.search);
const view = new View(document.getElementById('scene'));
const rig = new CameraRig(view.camera, view.renderer.domElement);
const stepper = new FixedStepper();
let race = null;
let speed = 1;

function restart(seed) {
  if (race) race.dispose();
  race = new Race(RAPIER, seed, view.materials);
  view.setRace(race);
  stepper.accumulator = 0;
  rig.reset();
  window.race = race; // handy for inspection from the console
}

const ui = new UI({
  restart,
  speed: (v) => (speed = v),
  debug: (on) => view.setDebug(on),
  free: (on) => rig.setFree(on),
});
ui.seed.value = params.get('seed') || '1';
restart(ui.seed.value);

const target = new THREE.Vector3();
const tangent = new THREE.Vector3(0, 0, 1);
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
    tangent.copy(race.course.path[lead.pathIndex].tangent);
  } else {
    const end = race.course.path[race.course.path.length - 1];
    target.copy(end.pos);
    tangent.copy(end.tangent);
  }
  rig.update(Math.min(frameDt, 0.1), target, tangent);
  view.updateDebug(race.world);
  ui.update(race);
  view.render(rig.focus);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
