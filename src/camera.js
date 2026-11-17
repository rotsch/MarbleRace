import * as THREE from 'three';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const MAX_PITCH = THREE.MathUtils.degToRad(89);

// Follow camera (smoothly tracks the leading marble) and a free fly camera:
// click to steer with the mouse (pointer lock), WASD to move, E/Q up/down,
// Shift to move faster.
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.free = false;
    this.focus = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.initialised = false;

    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.baseSpeed = 6;
    this.boost = 4;
    this.sensitivity = 0.0022;
    this.onRequestFree = null; // set by the UI so the checkbox stays in sync

    dom.addEventListener('click', () => {
      if (!this.free) this._requestFree();
      if (document.pointerLockElement !== dom) dom.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.free || document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.sensitivity, -MAX_PITCH, MAX_PITCH);
    });
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (MOVE_KEYS.has(e.code) && !this.free) this._requestFree();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _requestFree() {
    if (this.onRequestFree) this.onRequestFree();
    else this.setFree(true);
  }

  setFree(on) {
    this.free = on;
    if (on) {
      // Start from the current view direction so nothing jumps.
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.yaw = Math.atan2(-dir.x, -dir.z);
      this.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -MAX_PITCH, MAX_PITCH);
    } else {
      if (document.pointerLockElement === this.dom) document.exitPointerLock();
      this.initialised = false;
    }
  }

  reset() {
    this.initialised = false;
  }

  _updateFree(dt) {
    const cam = this.camera;
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(cam.rotation);
    const move = new THREE.Vector3();
    const k = this.keys;
    if (k.has('KeyW')) move.add(forward);
    if (k.has('KeyS')) move.sub(forward);
    if (k.has('KeyD')) move.add(right);
    if (k.has('KeyA')) move.sub(right);
    if (k.has('KeyE')) move.y += 1;
    if (k.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() > 0) {
      const speed = this.baseSpeed * (k.has('ShiftLeft') || k.has('ShiftRight') ? this.boost : 1);
      cam.position.addScaledVector(move.normalize(), speed * dt);
    }
    this.focus.copy(cam.position).addScaledVector(forward, 6);
  }

  // target: world position to look at; tangent: course direction there;
  // hint: optional per-section camera placement (see CourseContext.setCamera).
  update(dt, target, tangent, hint = null) {
    if (this.free) {
      this._updateFree(dt);
      return;
    }
    const flat = new THREE.Vector3(tangent.x, 0, tangent.z);
    if (flat.lengthSq() > 1e-4) flat.normalize(); else flat.copy(this.heading);
    if (!this.initialised) {
      this.focus.copy(target);
      this.heading.copy(flat);
    }
    const kFocus = 1 - Math.exp(-dt * 8);
    const kHead = 1 - Math.exp(-dt * 1.1);
    const kCam = 1 - Math.exp(-dt * 3);
    this.focus.lerp(target, kFocus);
    this.heading.lerp(flat, kHead).normalize();

    const desired = new THREE.Vector3();
    if (hint?.type === 'fixed') {
      desired.copy(hint.pos);
    } else if (hint?.type === 'axis') {
      desired.set(hint.pos.x, this.focus.y + hint.up, hint.pos.z);
    } else if (hint?.type === 'offset') {
      desired.copy(this.focus).add(hint.offset);
    } else {
      // Chase view: behind and above, a little to the side so the track
      // ahead is not hidden by the marbles.
      desired.copy(this.focus).addScaledVector(this.heading, -3.4);
      desired.y += 2.7;
      desired.addScaledVector(new THREE.Vector3(this.heading.z, 0, -this.heading.x), 1.3);
    }
    if (!this.initialised) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, kCam);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.focus);
    this.initialised = true;
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
