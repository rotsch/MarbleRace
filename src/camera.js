import * as THREE from 'three';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const MAX_PITCH = THREE.MathUtils.degToRad(89);

export const CAMERA_MODES = ['follow', 'free', 'pov'];
const NEAR = { follow: 0.05, free: 0.05, pov: 0.01 };

// Three camera modes:
//  follow  smoothly tracks the leading marble
//  free    fly camera: drag or hold the right button to steer, click to
//          steer with the pointer locked, mouse wheel to fly, WASD to move,
//          Q/E up/down, Shift to move faster; on touch screens a move stick
//          on the left half and look on the right half
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

    // Mouse steering, without needing pointer lock (embedded pages often may
    // not lock the pointer):
    //  - drag with the left mouse button: steer (enters free)
    //  - hold the right mouse button: steer without moving the mouse away
    //  - mouse wheel: fly forward / back (enters free)
    //  - a click without dragging: enter free and lock the pointer
    // Touch screens use twin sticks (see _touchDown): a floating move stick
    // on the left half of the screen, look on the right half.
    this.isBusy = null; // set by the editor: true while a gizmo is dragged
    this.mouse = null; // { id, x, y } while the left mouse button is down
    this.dragged = false;
    this.dragDist = 0;
    this.lastPointerType = 'mouse';
    this.vel = new THREE.Vector3(); // free camera velocity, eased (units/s)
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._want = new THREE.Vector3();
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
      if (e.pointerType !== 'mouse') return this._touchDown(e);
      if (e.button === 2) {
        if (this.free) this.looking = true;
        return;
      }
      if (e.button !== 0) return;
      this.mouse = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.dragged = false;
      this.dragDist = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return this._touchMove(e);
      const p = this.mouse;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.isBusy?.()) {
        this.dragged = true; // dragging a gizmo: neither steer nor click
        return;
      }
      if (document.pointerLockElement === dom || this.looking) return;
      if (!this._passedThreshold(dx, dy)) return;
      const k = this.sensitivity * 1.4;
      this._turn(dx * k, dy * k);
    });
    const release = (e) => {
      if (e.pointerType !== 'mouse') return this._touchUp(e);
      if (e.button === 2) this.looking = false;
      if (this.mouse?.id === e.pointerId) this.mouse = null;
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
        const forward = this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.camera.position.addScaledVector(forward, -THREE.MathUtils.clamp(px, -200, 200) * 0.01 * boost);
      },
      { passive: false },
    );

    // Touch: twin sticks. A finger that lands on the left half of the screen
    // is the move stick, one on the right half looks around; each keeps its
    // role until it lifts, even across the middle, and a second finger on a
    // side that already has one is ignored.
    //  stick  floating: where the finger landed is the centre; 40 px of
    //         drag is cruise speed (1), up to 4 (160 px, the Shift boost).
    //         Up flies forward along the view (looking down dives), right
    //         strafes right. Lifting it lets the camera coast to a stop.
    //  look   like a trackpad: 0.005 rad per px of movement.
    this.stick = { id: -1, x0: 0, y0: 0, fwd: 0, strafe: 0 };
    this.look = { id: -1, x: 0, y: 0 };
    this.touchSensitivity = 0.005;
    this.stickPx = 40;
    this.stickMax = 4;
    this.touches = 0; // fingers down on the scene
    // The stick shows where it is: a ring at its centre and a knob under the finger.
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick';
    this.stickEl.hidden = true;
    this.stickEl.innerHTML = '<div class="knob"></div>';
    document.body.appendChild(this.stickEl);

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (MOVE_KEYS.has(e.code) && !this.free) this._requestFree();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Drags under 6 px are clicks / taps; past that the camera goes free and
  // the click that ends the drag is swallowed.
  _passedThreshold(dx, dy) {
    if (this.dragged) return true;
    this.dragDist += Math.abs(dx) + Math.abs(dy);
    if (this.dragDist < 6) return false;
    this.dragged = true;
    if (!this.free) this._requestFree();
    return true;
  }

  _touchDown(e) {
    e.preventDefault();
    const r = this.dom.getBoundingClientRect();
    if (this.touches++ === 0) {
      this.dragged = false;
      this.dragDist = 0;
    }
    if (e.clientX - r.left < r.width / 2) {
      if (this.stick.id < 0) Object.assign(this.stick, { id: e.pointerId, x0: e.clientX, y0: e.clientY, fwd: 0, strafe: 0 });
    } else if (this.look.id < 0) Object.assign(this.look, { id: e.pointerId, x: e.clientX, y: e.clientY });
  }

  _touchMove(e) {
    const st = this.stick;
    const lk = this.look;
    if (e.pointerId !== st.id && e.pointerId !== lk.id) return;
    if (this.isBusy?.()) {
      this.dragged = true; // dragging a gizmo: neither move nor look
      st.fwd = st.strafe = 0;
      return;
    }
    if (e.pointerId === st.id) {
      const dx = e.clientX - st.x0;
      const dy = e.clientY - st.y0;
      if (!this.dragged && Math.abs(dx) + Math.abs(dy) < 6) return;
      this._passedThreshold(6, 0);
      const m = this.stickMax;
      st.fwd = THREE.MathUtils.clamp(-dy / this.stickPx, -m, m);
      st.strafe = THREE.MathUtils.clamp(dx / this.stickPx, -m, m);
      this._showStick(e.clientX, e.clientY);
    } else {
      const dx = e.clientX - lk.x;
      const dy = e.clientY - lk.y;
      lk.x = e.clientX;
      lk.y = e.clientY;
      if (!this._passedThreshold(dx, dy)) return;
      this._turn(dx * this.touchSensitivity, dy * this.touchSensitivity);
    }
  }

  _touchUp(e) {
    this.touches = Math.max(0, this.touches - 1);
    if (e.pointerId === this.stick.id) {
      this.stick.id = -1;
      this.stick.fwd = this.stick.strafe = 0;
      this.stickEl.hidden = true;
    } else if (e.pointerId === this.look.id) this.look.id = -1;
    // A touch has no click after a drag to swallow the flag.
    if (this.touches === 0) setTimeout(() => (this.dragged = false), 50);
  }

  _showStick(x, y) {
    const el = this.stickEl;
    const st = this.stick;
    el.hidden = false;
    el.style.left = `${st.x0}px`;
    el.style.top = `${st.y0}px`;
    // The knob follows the finger, held to the ring's edge (full speed).
    const max = this.stickPx * this.stickMax;
    let dx = x - st.x0;
    let dy = y - st.y0;
    const d = Math.hypot(dx, dy);
    const ring = 56; // ring radius in px, see .touch-stick
    const reach = Math.min(d, max) / max * ring;
    if (d > 0) {
      dx = (dx / d) * reach;
      dy = (dy / d) * reach;
    }
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _turn(dYaw, dPitch) {
    this.yaw -= dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dPitch, -MAX_PITCH, MAX_PITCH);
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
    this.vel.set(0, 0, 0);
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

  // Endless mode: the world moved by offset (floating origin). The camera
  // moves with it, so the view does not change at all.
  shift(offset) {
    this.camera.position.add(offset);
    this.focus.add(offset);
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

  // Keyboard and touch stick add up to a wanted velocity; the velocity eases
  // towards it (frame-rate independent), so lifting the stick coasts to a stop.
  _updateFree(dt) {
    const cam = this.camera;
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const forward = this._fwd.set(0, 0, -1).applyEuler(cam.rotation);
    const right = this._right.set(1, 0, 0).applyEuler(cam.rotation);
    const want = this._want.set(0, 0, 0);
    const k = this.keys;
    if (k.has('KeyW')) want.add(forward);
    if (k.has('KeyS')) want.sub(forward);
    if (k.has('KeyD')) want.add(right);
    if (k.has('KeyA')) want.sub(right);
    if (k.has('KeyQ')) want.y += 1;
    if (k.has('KeyE')) want.y -= 1;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(this.baseSpeed * (k.has('ShiftLeft') || k.has('ShiftRight') ? this.boost : 1));
    want.addScaledVector(forward, this.stick.fwd * this.baseSpeed);
    want.addScaledVector(right, this.stick.strafe * this.baseSpeed);
    this.vel.lerp(want, 1 - Math.exp(-dt * 7));
    if (this.vel.lengthSq() < 1e-6 && want.lengthSq() === 0) this.vel.set(0, 0, 0);
    cam.position.addScaledVector(this.vel, dt);
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
