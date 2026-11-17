import { TUNABLES, DEFAULTS, applyValues, currentValues, store } from './tuning.js';

// Minimal DOM overlay: ranking / results, seed, restart, speed, toggles,
// physics settings.
const $ = (id) => document.getElementById(id);
const CAMERA_HINTS = {
  follow: 'Follow camera tracks the leader.',
  free: 'Free camera: click to steer with the mouse (Esc releases), WASD move, Q/E up/down, Shift faster.',
  pov: "Leader's view: riding on the leading marble.",
};
const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export class UI {
  constructor(handlers) {
    this.list = $('ranking-list');
    this.title = $('ranking-title');
    this.clock = $('clock');
    this.seed = $('seed');
    this.speed = $('speed');
    this.debug = $('debug');
    this.camera = $('camera');
    this.look = $('look');
    this.hint = $('hint');
    this.leader = $('leader');
    this.markers = $('progress-markers');
    this.markerRace = null;
    this.startOverlay = $('start-overlay');
    this.countdown = $('countdown');
    this.countdownText = '';
    this.countdownTimer = null;
    $('start-race').addEventListener('click', () => this.onStart?.());
    this.lastHtml = '';

    $('restart').addEventListener('click', () => handlers.restart(this.seed.value.trim() || '1'));
    $('random').addEventListener('click', () => {
      this.seed.value = String(Math.floor(Math.random() * 1e6));
      handlers.restart(this.seed.value);
    });
    this.seed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') handlers.restart(this.seed.value.trim() || '1');
    });
    this.speed.addEventListener('input', () => this.setSpeed(Number(this.speed.value), handlers));
    this.pauseButton = $('pause');
    this.pauseBadge = $('paused');
    this.pauseButton.addEventListener('click', () => {
      handlers.pause();
      this.pauseButton.blur(); // so Space does not click it again
    });
    this.debug.addEventListener('change', () => handlers.debug(this.debug.checked));
    this.wireframe = $('wireframe');
    this.meshStats = $('mesh-stats');
    this.wireframe.addEventListener('change', () => this.setWireframe(this.wireframe.checked, handlers));
    this.shooting = $('shooting');
    this.shooting.addEventListener('change', () => {
      handlers.shooting(this.shooting.checked);
      this.shooting.blur();
    });
    this.camera.addEventListener('change', () => {
      this.setCamera(this.camera.value, handlers);
      this.camera.blur(); // so the game keys work again right away
    });
    this._buildPhysics(handlers);
    this.look.addEventListener('change', () => {
      this.setLook(this.look.value, handlers);
      this.look.blur();
    });
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (e.code === 'Space' && !(typing && t.type === 'text')) {
        e.preventDefault(); // no page scroll, no clicking a focused button
        if (!e.repeat) handlers.pause();
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing) {
        e.preventDefault();
        this.stepSpeed(e.key === 'ArrowRight' ? 1 : -1, handlers);
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && !typing) {
        handlers.shoot();
      } else if (e.key === 'm' || e.key === 'M') {
        this.wireframe.checked = !this.wireframe.checked;
        this.setWireframe(this.wireframe.checked, handlers);
      } else if (e.key === 'b' || e.key === 'B') {
        this.debug.checked = !this.debug.checked;
        handlers.debug(this.debug.checked);
      } else if (e.key === 'c' || e.key === 'C') {
        // Cycle follow -> free -> leader's view -> follow.
        const modes = [...this.camera.options].map((o) => o.value);
        this.setCamera(modes[(modes.indexOf(this.camera.value) + 1) % modes.length], handlers);
      } else if (e.key === 't' || e.key === 'T') {
        // Cycle white -> neon dusk -> picture mosaic -> white.
        const looks = [...this.look.options].filter((o) => !o.disabled).map((o) => o.value);
        this.setLook(looks[(looks.indexOf(this.look.value) + 1) % looks.length], handlers);
      } else if (e.key === 'r' || e.key === 'R') {
        handlers.resetKey(this.seed.value.trim() || '1');
      }
    });
  }

  // One slider per tunable value. Values take effect on Apply (a restart).
  _buildPhysics(handlers) {
    const box = $('tunables');
    this.sliders = TUNABLES.map((t) => {
      const label = document.createElement('label');
      const value = document.createElement('span');
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: t.min, max: t.max, step: t.step });
      label.append(t.label, value, input);
      box.append(label);
      const show = () => {
        const v = Number(input.value);
        value.textContent = t.fmt(v);
        label.classList.toggle('changed', Math.abs(v - DEFAULTS[t.id]) > 1e-9);
      };
      input.addEventListener('input', show);
      return { t, input, show };
    });
    this._showPhysics(currentValues());
    const restart = () => handlers.restart(this.seed.value.trim() || '1');
    $('physics-apply').addEventListener('click', () => {
      applyValues(Object.fromEntries(this.sliders.map((s) => [s.t.id, s.input.value])));
      store();
      restart();
    });
    $('physics-reset').addEventListener('click', () => {
      applyValues(DEFAULTS);
      store();
      this._showPhysics(DEFAULTS);
      restart();
    });
  }

  _showPhysics(values) {
    for (const s of this.sliders) {
      s.input.value = values[s.t.id];
      s.show();
    }
  }

  // Speaker button (mute on/off, also N) and volume slider.
  bindSound(sound) {
    const box = $('sound');
    const toggle = $('sound-toggle');
    const slider = $('volume');
    const show = () => {
      const muted = sound.muted || sound.volume === 0;
      box.classList.toggle('muted', muted);
      box.classList.toggle('low', !muted && sound.volume < 0.4);
      slider.value = String(sound.volume);
      toggle.title = muted ? 'Sound off: click to turn on (N)' : 'Sound on: click to turn off (N)';
    };
    const flip = () => {
      if (sound.volume === 0) sound.setVolume(0.6);
      else sound.setMuted(!sound.muted);
      show();
      sound.click();
    };
    toggle.addEventListener('click', () => {
      flip();
      toggle.blur();
    });
    slider.addEventListener('input', () => {
      sound.setVolume(Number(slider.value));
      show();
      sound.click(0.6 + Number(slider.value) * 0.8);
    });
    slider.addEventListener('change', () => slider.blur());
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'n' || e.key === 'N') && e.target?.type !== 'text') flip();
    });
    // Plain buttons click audibly (Pause has its own sound).
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('button');
      if (b && b.id !== 'pause' && b.id !== 'sound-toggle') sound.click();
    });
    show();
  }

  setSpeed(v, handlers) {
    this.speed.value = String(v);
    $('speed-value').textContent = `${v.toFixed(2)}x`;
    handlers.speed(v);
  }

  // Arrow keys: next slower / faster preset speed. Going slower than the
  // slowest speed pauses; while paused either arrow resumes, one step slower
  // or faster than the speed it was paused at (or at that speed when there
  // is nothing slower).
  stepSpeed(dir, handlers) {
    const v = Number(this.speed.value);
    const next = dir > 0 ? SPEEDS.find((s) => s > v + 1e-6) : [...SPEEDS].reverse().find((s) => s < v - 1e-6);
    if (handlers.isPaused()) {
      if (next !== undefined) this.setSpeed(next, handlers);
      handlers.setPaused(false);
    } else if (next !== undefined) this.setSpeed(next, handlers);
    else if (dir < 0) handlers.setPaused(true);
  }

  showPaused(paused) {
    this.pauseBadge.hidden = !paused;
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }

  setWireframe(on, handlers) {
    const s = handlers.wireframe(on);
    this.showMeshStats(on ? s : null);
  }

  showMeshStats(s) {
    this.meshStats.hidden = !s;
    if (s) {
      const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
      this.meshStats.textContent = `${s.meshes} meshes · ${k(s.triangles)} triangles · ${k(s.vertices)} vertices. Blue: track, red: decoration.`;
    }
  }

  async setLook(look, handlers) {
    this.look.value = look;
    const shown = await handlers.look(look);
    if (!shown) {
      // No pictures in textures/: take that look out of the cycle.
      this.look.querySelector('option[value="pictures"]').disabled = true;
      this.hint.textContent = 'No track textures: add pictures to the textures/ folder.';
      this.setLook('white', handlers);
    }
  }

  // Big 'Start race' button for a race that waits on the start line.
  showStart(onStart) {
    this.onStart = onStart;
    this.startOverlay.hidden = false;
    this.showCountdown(null);
  }

  hideStart() {
    this.startOverlay.hidden = true;
    this.onStart = null;
  }

  // Countdown text in the middle of the screen; null hides it. With
  // `hideAfter` (ms) it disappears by itself.
  showCountdown(text, hideAfter = 0) {
    clearTimeout(this.countdownTimer);
    if (text === null) {
      this.countdown.hidden = true;
      this.countdownText = '';
      return;
    }
    if (text !== this.countdownText) {
      this.countdownText = text;
      this.countdown.textContent = text;
      this.countdown.hidden = false;
      this.countdown.classList.remove('pop');
      void this.countdown.offsetWidth; // restart the animation
      this.countdown.classList.add('pop');
    }
    if (hideAfter) this.countdownTimer = setTimeout(() => this.showCountdown(null), hideAfter);
  }

  // Entering free mode from the camera itself (click or a movement key).
  enterFree(handlers) {
    this.setCamera('free', handlers);
  }

  setCamera(mode, handlers) {
    this.camera.value = mode;
    this.hint.textContent = CAMERA_HINTS[mode];
    handlers.camera(mode);
  }

  // Progress line: one marker per marble at progress / course length.
  // Markers further ahead are stacked above the ones behind.
  _updateProgress(race, ranking) {
    if (this.markerRace !== race) {
      this.markerRace = race;
      this.markers.replaceChildren(
        ...race.marbles.map((m) => {
          const el = document.createElement('div');
          el.className = 'marble';
          el.style.background = hex(m.color);
          el.title = m.name;
          return el;
        })
      );
    }
    const course = race.course;
    const length = course.path[course.finishIndex ?? course.path.length - 1].s;
    const els = this.markers.children;
    ranking.forEach((m, rank) => {
      const f = m.finished ? 1 : Math.min(1, Math.max(0, m.progress / length));
      const el = els[m.index];
      el.style.left = `${(f * 100).toFixed(2)}%`;
      el.style.zIndex = String(ranking.length - rank);
    });
    const lead = ranking[0];
    this.leader.querySelector('.label').textContent = race.finished || lead.finished ? 'Winner' : 'Leading';
    this.leader.querySelector('.dot').style.background = hex(lead.color);
    this.leader.querySelector('.name').textContent = lead.name;
  }

  update(race) {
    const done = race.finished;
    const ranking = race.ranking();
    this._updateProgress(race, ranking);
    this.title.textContent = done ? 'Results' : 'Ranking';
    this.clock.textContent = done ? `Race over · seed ${race.seed}` : `${race.time.toFixed(2)} s`;
    const html = ranking
      .map(
        (m, i) =>
          `<li class="${m.finished ? 'done' : ''}"><span class="pos">${i + 1}</span>` +
          `<span class="dot" style="background:${hex(m.color)}"></span>` +
          `<span class="name">${m.name}</span>` +
          `<span class="time">${m.finished ? m.finishTime.toFixed(2) + ' s' : ''}</span></li>`
      )
      .join('');
    if (html !== this.lastHtml) {
      this.list.innerHTML = html;
      this.lastHtml = html;
    }
  }
}
