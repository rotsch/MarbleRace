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
    this.hint = $('hint');
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
    window.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        this.debug.checked = !this.debug.checked;
        handlers.debug(this.debug.checked);
      } else if (e.key === 'c' || e.key === 'C') {
        this.free.checked = !this.free.checked;
        this.setFree(this.free.checked, handlers);
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

  update(race) {
    const done = race.finished;
    this.title.textContent = done ? 'Results' : 'Ranking';
    this.clock.textContent = done ? `Race over · seed ${race.seed}` : `${race.time.toFixed(2)} s`;
    const html = race
      .ranking()
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
