// Minimal DOM overlay: ranking / results, seed, restart, speed, toggles.
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
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
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

  setFree(on, handlers) {
    this.hint.textContent = on
      ? 'Free camera: drag to orbit, right-drag to pan, wheel to zoom.'
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
