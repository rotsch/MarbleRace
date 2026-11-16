import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Follow camera (smoothly tracks the leading marble) and a free orbit camera.
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.enabled = false;
    this.free = false;
    this.focus = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.initialised = false;
  }

  setFree(on) {
    this.free = on;
    this.orbit.enabled = on;
    if (on) this.orbit.target.copy(this.focus);
  }

  reset() {
    this.initialised = false;
  }

  // target: world position to look at; tangent: course direction there.
  update(dt, target, tangent) {
    if (this.free) {
      this.orbit.update();
      this.focus.copy(this.orbit.target);
      return;
    }
    const flat = new THREE.Vector3(tangent.x, 0, tangent.z);
    if (flat.lengthSq() > 1e-4) flat.normalize(); else flat.copy(this.heading);
    if (!this.initialised) {
      this.focus.copy(target);
      this.heading.copy(flat);
    }
    const kFocus = 1 - Math.exp(-dt * 5);
    const kHead = 1 - Math.exp(-dt * 1.1);
    const kCam = 1 - Math.exp(-dt * 2.5);
    this.focus.lerp(target, kFocus);
    this.heading.lerp(flat, kHead).normalize();
    const desired = this.focus.clone().addScaledVector(this.heading, -3.4).add(new THREE.Vector3(0, 2.7, 0));
    // Sit a little to the side so the track ahead is not hidden by the marbles.
    desired.addScaledVector(new THREE.Vector3(this.heading.z, 0, -this.heading.x), 1.3);
    if (!this.initialised) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, kCam);
    this.camera.lookAt(this.focus);
    this.initialised = true;
  }
}
