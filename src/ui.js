import { TUNABLES, DEFAULTS, applyValues, currentValues, store } from './tuning.js';
import { OPTIONS, PRESETS, presetOf, storeGraphics } from './graphics.js';

// Minimal DOM overlay: ranking / results, seed, restart, speed, toggles,
// physics settings.
const $ = (id) => document.getElementById(id);
const CAMERA_HINTS = {
  follow: 'Follow camera tracks the leader.',
  free: 'Free camera: click to steer with the mouse (Esc releases), WASD move, Q/E up/down, Shift faster.',
  pov: "Leader's view: riding on the leading marble.",
};
// Endless-mode progress line.
const DOTS = 4; // % drawn dotted at an open end
const PAD = 1.5; // % kept free inside the solid line at each end
const MIN_SPAN = 3; // units the line covers at least
const EASE = 2.5; // per second: how fast the line follows the field
const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class UI {
  constructor(handlers) {
    this.list = $('ranking-list');
    this.title = $('ranking-title');
    this.clock = $('clock');
    this.seed = $('seed');
    this.speed = $('speed');
    this.debug = $('debug');
    this.camera = $('camera');
    this.theme = $('theme');
    this.hint = $('hint');
    this.leader = $('leader');
    this.markers = $('progress-markers');
    this.line = $('progress-line');
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
    this.theme.addEventListener('change', () => {
      this.setTheme(this.theme.value, handlers);
      this.theme.blur();
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
      // Track editor keys: G on / off; while on, 1 / 2 move / rotate, Del
      // deletes, Ctrl+Z / Ctrl+Y undo / redo, Esc deselects. Keys that would
      // change the camera or restart the race are off while editing.
      if ((e.key === 'g' || e.key === 'G') && !typing) {
        handlers.edit();
        return;
      }
      if (handlers.editing() && !typing) {
        const ed = handlers.editor;
        if (e.key === '1') ed.setMode('translate');
        else if (e.key === '2') ed.setMode('rotate');
        else if (e.key === '3') ed.setMode('shape');
        else if (e.key === 'Delete' || e.key === 'Backspace') this._try(() => ed.deletePiece());
        else if (e.key === 'Escape') ed.select(null);
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          this._try(() => (e.shiftKey ? ed.redoStep() : ed.undoStep()));
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
          e.preventDefault();
          this._try(() => ed.redoStep());
        }
        if (/^[cCfFrR]$/.test(e.key)) return;
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
        // Cycle white -> neon dusk -> ITSENSE -> picture mosaic -> white.
        const themes = [...this.theme.options].filter((o) => !o.disabled).map((o) => o.value);
        this.setTheme(themes[(themes.indexOf(this.theme.value) + 1) % themes.length], handlers);
      } else if (e.key === 'r' || e.key === 'R') {
        handlers.resetKey(this.seed.value.trim() || '1');
      }
    });
  }

  _try(fn) {
    try {
      fn();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
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

  // Graphics section: a preset menu plus every option on its own.
  // settings: from loadGraphics(); onChange(settings) applies them.
  // antialiasAtStart: what the renderer was made with (it changes on reload).
  bindGraphics(settings, onChange, antialiasAtStart) {
    const box = $('graphics-options');
    const note = $('graphics-note');
    const baseNote = note.textContent;
    const selects = {};
    const checks = {};
    const select = (key, label, title) => {
      const el = document.createElement('select');
      for (const [v, text] of OPTIONS[key]) el.add(new Option(text, v));
      const l = document.createElement('label');
      if (title) l.title = title;
      if (key === 'preset') l.className = 'preset';
      l.append(label, el);
      box.append(l);
      selects[key] = el;
      el.addEventListener('change', () => {
        if (key === 'preset') {
          if (el.value === 'custom') return;
          Object.assign(settings, PRESETS[el.value]);
        } else settings[key] = el.value;
        apply();
        el.blur();
      });
    };
    const check = (key, label, title) => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      const l = document.createElement('label');
      l.className = 'check';
      if (title) l.title = title;
      l.append(el, ` ${label}`);
      box.append(l);
      checks[key] = el;
      el.addEventListener('change', () => {
        settings[key] = el.checked;
        apply();
        el.blur();
      });
    };
    select('preset', 'Quality');
    select('shadows', 'Shadows', 'Sun shadows of the track, decoration and marbles. "Under marbles only" keeps just the soft spot under each marble, which costs almost nothing.');
    select('ao', 'Ambient occlusion', 'Darkens corners and seams, where the rails meet the floor. An extra pass over the whole picture: costly on weak graphics.');
    select('tone', 'Tone mapping', 'How bright light turns into screen colours. Filmic and Natural show soft shading from light to dark instead of flat white.');
    select('reflections', 'Reflections', 'What glossy marbles mirror: a neutral studio, or the theme\'s own sky (Neon dusk, ITSENSE).');
    select('resolution', 'Resolution', 'Pixels drawn, compared with the screen. Lower is much faster and a little blurrier.');
    select('marbles', 'Marble detail', 'Rounder marbles or fewer triangles.');
    check('antialias', 'Smooth edges (antialiasing)', 'Takes effect after reloading the page.');
    check('decorations', 'Decoration', 'Start and finish gantries, grandstands and spectators.');
    check('dust', 'Dust');
    check('fps', 'Show frame rate');
    const show = () => {
      for (const [k, el] of Object.entries(selects)) el.value = k === 'preset' ? presetOf(settings) : settings[k];
      for (const [k, el] of Object.entries(checks)) el.checked = settings[k];
      note.textContent = settings.antialias !== antialiasAtStart
        ? 'Smooth edges changes when the page is reloaded.'
        : baseNote;
    };
    const apply = () => {
      storeGraphics(settings);
      onChange(settings);
      show();
    };
    show();
  }

  // Frames per second, shown when the graphics settings ask for it.
  showFps(on, fps = null) {
    const el = $('fps');
    el.hidden = !on;
    if (on && fps !== null) el.textContent = `${Math.round(fps)} fps`;
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

  async setTheme(theme, handlers) {
    this.theme.value = theme;
    document.body.dataset.theme = theme; // panels restyle for some themes (style.css)
    const shown = await handlers.theme(theme);
    if (!shown) {
      // No pictures in textures/: take that theme out of the cycle.
      this.theme.querySelector('option[value="pictures"]').disabled = true;
      this.hint.textContent = 'No track textures: add pictures to the textures/ folder.';
      this.setTheme('white', handlers);
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
    const finishS = course.finishIndex != null ? course.path[course.finishIndex].s : null;
    let s0 = 0, s1, a = 0, b = 100, pad = 0;
    const ends = race.endless?.openEnds;
    if (ends) {
      // Endless mode: the line spans the field, from the last marble (or the
      // start while it is still there) to the leader (or the finish once it
      // is built), eased so it glides; dotted ends stand for more track.
      const racing = race.marbles.filter((m) => !m.finished);
      let lo = 0, hi = 0;
      if (racing.length) {
        lo = Math.min(...racing.map((m) => m.progress));
        hi = Math.max(...racing.map((m) => m.progress));
      }
      let t0 = ends.before ? lo : 0;
      let t1 = ends.after || finishS == null ? hi : finishS;
      t1 = Math.max(t1, t0 + MIN_SPAN);
      const now = performance.now();
      const fresh = !this.span || this.span.race !== race;
      const k = fresh ? 1 : 1 - Math.exp(-Math.min(0.25, (now - this.span.at) / 1000) * EASE);
      const prev = fresh ? { s0: t0, s1: t1 } : this.span;
      this.span = { race, at: now, s0: prev.s0 + (t0 - prev.s0) * k, s1: prev.s1 + (t1 - prev.s1) * k };
      ({ s0, s1 } = this.span);
      if (ends.before) a = DOTS;
      if (ends.after) b = 100 - DOTS;
      pad = PAD;
    } else {
      s1 = finishS ?? course.path[course.path.length - 1].s;
    }
    this.line.classList.toggle('more-before', a > 0);
    this.line.classList.toggle('more-after', b < 100);
    this.line.style.setProperty('--a', `${a}%`);
    this.line.style.setProperty('--b', `${b}%`);
    const els = this.markers.children;
    ranking.forEach((m, rank) => {
      const f = m.finished ? 1 : Math.min(1, Math.max(0, (m.progress - s0) / Math.max(1e-6, s1 - s0)));
      const el = els[m.index];
      el.style.left = `${(a + pad + f * (b - a - 2 * pad)).toFixed(2)}%`;
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
    let clock = done ? `Race over · seed ${race.seed}` : `${race.time.toFixed(2)} s`;
    // Endless mode: the time left until the finish is due, then that it is coming.
    if (race.endless && !done) {
      const left = Math.max(0, race.endless.duration - race.time);
      clock += race.endless.done ? ' · finish ahead' : ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`;
    }
    this.clock.textContent = clock;
    const html = ranking
      .map(
        (m, i) =>
          `<li class="${m.finished ? 'done' : ''}"><span class="pos">${i + 1}</span>` +
          `<span class="dot" style="background:${hex(m.color)}"></span>` +
          `<span class="name">${esc(m.name)}</span>` +
          `<span class="time">${m.finished ? m.finishTime.toFixed(2) + ' s' : ''}</span></li>`
      )
      .join('');
    if (html !== this.lastHtml) {
      this.list.innerHTML = html;
      this.lastHtml = html;
    }
  }
}
