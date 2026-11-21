import * as THREE from 'three';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const MAX_PITCH = THREE.MathUtils.degToRad(89);

export const CAMERA_MODES = ['follow', 'free', 'pov'];
const NEAR = { follow: 0.05, free: 0.05, pov: 0.01 };

// Three camera modes:
//  follow  smoothly tracks the leading marble
//  free    fly camera: drag (mouse or finger) or hold the right button to
//          steer, click to steer with the pointer locked, mouse wheel or
//          pinch to fly, WASD to move, Q/E up/down, Shift to move faster
//  pov     rides on the leading marble, looking where it is going
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 'follow';
    this.povDir = new THREE.Vector3(0, 0, 1);
    this.povUp = new THREE.Vector3(0, 1, 0);
    this.povInit = false;
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

    // Mouse and touch steering, without needing pointer lock (embedded pages
    // often may not lock the pointer):
    //  - drag with the left mouse button or one finger: steer (enters free)
    //  - hold the right mouse button: steer without moving the mouse away
    //  - mouse wheel: fly forward / back (enters free)
    //  - two fingers: pinch to fly forward / back, move both to slide
    //  - a click without dragging: enter free and lock the pointer (mouse)
    this.isBusy = null; // set by the editor: true while a gizmo is dragged
    this.touchSensitivity = 0.006;
    this.pointers = new Map(); // pointerId -> { x, y, type }
    this.dragged = false;
    this.dragDist = 0;
    this.pinch = null; // { dist, mx, my }
    this.lastPointerType = 'mouse';
    dom.style.touchAction = 'none';

    dom.addEventListener('click', (e) => {
      if (this.dragged) {
        this.dragged = false;
        return; // the end of a drag, not a click
      }
      if (this.onClick?.(e)) return; // handled elsewhere (shooting marbles, editor)
      if (this.lastPointerType !== 'mouse') return; // taps do not grab the camera
      if (!this.free) this._requestFree();
      if (document.pointerLockElement !== dom) {
        try {
          dom.requestPointerLock?.()?.catch?.(() => {});
        } catch {
          // not allowed here: dragging steers instead
        }
      }
    });
    this.looking = false;
    dom.addEventListener('pointerdown', (e) => {
      this.lastPointerType = e.pointerType || 'mouse';
      if (e.pointerType === 'mouse' && e.button === 2) {
        if (this.free) this.looking = true;
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (this.pointers.size === 1) {
        this.dragged = false;
        this.dragDist = 0;
      }
      this.pinch = this.pointers.size === 2 ? this._pinchState() : null;
    });
    window.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.isBusy?.()) {
        this.dragged = true; // dragging a gizmo: neither steer nor click
        return;
      }
      if (document.pointerLockElement === dom || this.looking) return;
      this.dragDist += Math.abs(dx) + Math.abs(dy);
      if (this.dragDist < 6 && !this.dragged) return;
      if (!this.dragged) {
        this.dragged = true;
        if (!this.free) this._requestFree();
      }
      if (this.pointers.size === 1) {
        const k = p.type === 'mouse' ? this.sensitivity * 1.4 : this.touchSensitivity;
        this._turn(dx * k, dy * k);
      } else if (this.pointers.size === 2 && this.pinch) {
        const now = this._pinchState();
        const cam = this.camera;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        cam.position.addScaledVector(forward, (now.dist - this.pinch.dist) * 0.03);
        cam.position.addScaledVector(right, -(now.mx - this.pinch.mx) * 0.012);
        cam.position.addScaledVector(up, (now.my - this.pinch.my) * 0.012);
        this.pinch = now;
      }
    });
    const release = (e) => {
      if (e.pointerType === 'mouse' && e.button === 2) this.looking = false;
      this.pointers.delete(e.pointerId);
      this.pinch = this.pointers.size === 2 ? this._pinchState() : null;
      // A touch has no click after a drag to swallow the flag.
      if (e.pointerType !== 'mouse' && this.pointers.size === 0) setTimeout(() => (this.dragged = false), 50);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.free || (document.pointerLockElement !== dom && !this.looking)) return;
      this._turn(e.movementX * this.sensitivity, e.movementY * this.sensitivity);
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.isBusy?.()) return;
        e.preventDefault();
        if (!this.free) this._requestFree();
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        const boost = e.shiftKey ? this.boost : 1;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.camera.position.addScaledVector(forward, -THREE.MathUtils.clamp(px, -200, 200) * 0.01 * boost);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (MOVE_KEYS.has(e.code) && !this.free) this._requestFree();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _turn(dYaw, dPitch) {
    this.yaw -= dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dPitch, -MAX_PITCH, MAX_PITCH);
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  _requestFree() {
    if (this.onRequestFree) this.onRequestFree();
    else this.setMode('free');
  }

  get free() {
    return this.mode === 'free';
  }

  setMode(mode) {
    this.mode = mode;
    this.camera.near = NEAR[mode];
    this.camera.updateProjectionMatrix();
    this.povInit = false;
    if (mode === 'free') {
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
    this.povInit = false;
  }

  // Eye just above the marble, looking along the course (pov.dir), with the
  // track's up as up so the view turns over with the marble through the loop.
  _updatePov(dt, pov) {
    const cam = this.camera;
    const want = pov.dir.clone().normalize();
    const kDir = this.povInit ? 1 - Math.exp(-dt * 5) : 1;
    const kUp = this.povInit ? 1 - Math.exp(-dt * 4) : 1;
    this.povDir.lerp(want, kDir).normalize();
    this.povUp.lerp(pov.up, kUp).normalize();
    // Up must not be parallel to the view direction (e.g. dropping straight down).
    const up = this.povUp.clone().addScaledVector(this.povDir, -this.povUp.dot(this.povDir));
    if (up.lengthSq() > 0.01) cam.up.copy(up.normalize());
    cam.position.copy(pov.pos).addScaledVector(cam.up, pov.radius * 1.1);
    this.focus.copy(cam.position).addScaledVector(this.povDir, 6);
    cam.lookAt(this.focus);
    this.povInit = true;
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
    if (k.has('KeyQ')) move.y += 1;
    if (k.has('KeyE')) move.y -= 1;
    if (move.lengthSq() > 0) {
      const speed = this.baseSpeed * (k.has('ShiftLeft') || k.has('ShiftRight') ? this.boost : 1);
      cam.position.addScaledVector(move.normalize(), speed * dt);
    }
    this.focus.copy(cam.position).addScaledVector(forward, 6);
  }

  // target: world position to look at; tangent: course direction there;
  // hint: optional per-section camera placement (see CourseContext.setCamera);
  // pov: { pos, dir, up, radius } of the marble to ride on.
  update(dt, target, tangent, hint = null, pov = null) {
    if (this.free) {
      this._updateFree(dt);
      return;
    }
    if (this.mode === 'pov' && pov) {
      this._updatePov(dt, pov);
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
