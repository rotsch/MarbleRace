import { TUNABLES, DEFAULTS, applyValues, currentValues, store } from './tuning.js';

// Minimal DOM overlay: ranking / results, seed, restart, speed, toggles,
// physics settings.
const $ = (id) => document.getElementById(id);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export class UI {
  constructor(handlers) {
    this.list = $('ranking-list');
    this.title = $('ranking-title');
    this.clock = $('clock');
    this.seed = $('seed');
    this.speed = $('speed');
    this.debug = $('debug');
    this.free = $('free');
    this.texture = $('texture');
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
    this.speed.addEventListener('input', () => {
      const v = Number(this.speed.value);
      $('speed-value').textContent = `${v.toFixed(2)}x`;
      handlers.speed(v);
    });
    this.debug.addEventListener('change', () => handlers.debug(this.debug.checked));
    this.free.addEventListener('change', () => this.setFree(this.free.checked, handlers));
    this._buildPhysics(handlers);
    this.texture.addEventListener('change', () => this.setTexture(this.texture.checked, handlers));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        this.debug.checked = !this.debug.checked;
        handlers.debug(this.debug.checked);
      } else if (e.key === 'c' || e.key === 'C') {
        this.free.checked = !this.free.checked;
        this.setFree(this.free.checked, handlers);
      } else if (e.key === 't' || e.key === 'T') {
        this.texture.checked = !this.texture.checked;
        this.setTexture(this.texture.checked, handlers);
      } else if (e.key === 'r' || e.key === 'R') {
        handlers.restart(this.seed.value.trim() || '1');
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

  async setTexture(on, handlers) {
    const shown = await handlers.texture(on);
    if (on && !shown) {
      this.texture.checked = false;
      this.hint.textContent = 'No track textures: add pictures to the textures/ folder.';
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
    this.free.checked = true;
    this.setFree(true, handlers);
  }

  setFree(on, handlers) {
    this.hint.textContent = on
      ? 'Free camera: click to steer with the mouse (Esc releases), WASD move, E/Q up/down, Shift faster.'
      : 'Follow camera tracks the leader.';
    handlers.free(on);
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
