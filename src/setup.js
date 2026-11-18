import { COLORS, MARBLE, MAX_MARBLES } from './config.js';
import { BUILTIN, designById, designColor, designTexture, listDesigns, loadDesign } from './designs.js';

// Race setup, shown while a race waits on the start line: the mode (the
// track, or an endless course of random pieces for a set time), how many
// marbles race, and each one's name and design. Remembered in this browser.
//   mode, minutes    'track' | 'endless', and the endless race's length
//   entries()        the racers for a new Race: [{ name, color, design }]
//   onRebuild()      the number of marbles or the mode changed (the race must be rebuilt)
//   onEntry(i)       racer i got another name or design (no rebuild needed)
//   onPaint(i)       paint a design for racer i (null: a new design)
const KEY = 'marble-race-setup';
const MIN = 2;
const MINUTES = { min: 0.5, max: 60, def: 5 };
const clampMinutes = (m) => Math.min(MINUTES.max, Math.max(MINUTES.min, Math.round((Number(m) || MINUTES.def) * 2) / 2));
const $ = (id) => document.getElementById(id);

const defaultEntry = (i) => ({ name: COLORS[i % COLORS.length].name, design: `color:${COLORS[i % COLORS.length].name}` });

export class RaceSetup {
  constructor({ onRebuild, onEntry, onPaint }) {
    this.onRebuild = onRebuild;
    this.onEntry = onEntry;
    this.onPaint = onPaint;
    this.count = MARBLE.count;
    this.mode = 'track';
    this.minutes = MINUTES.def;
    // Always MAX_MARBLES entries, so names survive lowering and raising the count.
    this.list = Array.from({ length: MAX_MARBLES }, (_, i) => defaultEntry(i));
    this.library = []; // design names in the marbles/ folder
    this._load();

    this.box = $('setup-entries');
    this.countInput = $('setup-count');
    this.countInput.max = String(MAX_MARBLES);
    this.countInput.min = String(MIN);
    this.countInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.countInput.addEventListener('change', () => this.setCount(Number(this.countInput.value)));
    $('setup-minus').addEventListener('click', () => this.setCount(this.count - 1));
    $('setup-plus').addEventListener('click', () => this.setCount(this.count + 1));
    $('setup-paint').addEventListener('click', () => this.onPaint(null));
    $('setup-defaults').addEventListener('click', () => {
      for (let i = 0; i < this.count; i++) {
        this.list[i] = defaultEntry(i);
        this.onEntry(i);
      }
      this._save();
      this.render();
    });
    $('setup-shuffle').addEventListener('click', () => this.shuffleDesigns());
    $('mode-track').addEventListener('click', (e) => (e.currentTarget.blur(), this.setMode('track')));
    $('mode-endless').addEventListener('click', (e) => (e.currentTarget.blur(), this.setMode('endless')));
    this.minutesInput = $('setup-minutes');
    Object.assign(this.minutesInput, { min: String(MINUTES.min), max: String(MINUTES.max) });
    this.minutesInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.minutesInput.addEventListener('change', () => this.setMinutes(this.minutesInput.value));
  }

  // 'track' or 'endless'. A different mode is a different course: rebuild.
  setMode(mode, rebuild = true) {
    if (mode !== 'track' && mode !== 'endless') return;
    const changed = mode !== this.mode;
    this.mode = mode;
    this._save();
    this._renderMode();
    if (changed && rebuild) this.onRebuild();
  }

  // Length of an endless race. The course decides when the finish comes
  // from it, so it needs a new race too (only in endless mode).
  setMinutes(m, rebuild = true) {
    const v = clampMinutes(m);
    const changed = v !== this.minutes;
    this.minutes = v;
    this._save();
    this._renderMode();
    if (changed && rebuild && this.mode === 'endless') this.onRebuild();
  }

  // What Race gets as its course for the endless mode.
  endlessLayout() {
    return { endless: { duration: this.minutes * 60 } };
  }

  _renderMode() {
    $('mode-track').classList.toggle('on', this.mode === 'track');
    $('mode-endless').classList.toggle('on', this.mode === 'endless');
    $('mode-track').setAttribute('aria-pressed', String(this.mode === 'track'));
    $('mode-endless').setAttribute('aria-pressed', String(this.mode === 'endless'));
    $('mode-time').hidden = this.mode !== 'endless';
    this.minutesInput.value = String(this.minutes);
  }

  // Load the library and every design the racers use. Call before the first race.
  async init() {
    await this.refreshLibrary();
  }

  async refreshLibrary() {
    try {
      this.library = await listDesigns();
    } catch (err) {
      console.error('Marble designs could not be listed:', err);
      this.library = [];
    }
    await Promise.all(
      this.list.map(async (e, i) => {
        if (!e.design?.startsWith('design:')) return;
        try {
          await loadDesign(e.design.slice(7));
        } catch (err) {
          console.error(err);
          this.list[i].design = defaultEntry(i).design; // gone from the folder
        }
      })
    );
    this.render();
  }

  _load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return;
      this.count = Math.min(MAX_MARBLES, Math.max(MIN, Number(s.count) || MARBLE.count));
      if (s.mode === 'endless') this.mode = 'endless';
      if (s.minutes != null) this.minutes = clampMinutes(s.minutes);
      (s.entries ?? []).slice(0, MAX_MARBLES).forEach((e, i) => {
        if (typeof e?.name === 'string') this.list[i].name = e.name.slice(0, 24);
        if (typeof e?.design === 'string') this.list[i].design = e.design;
      });
    } catch {
      // ignore: defaults
    }
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ count: this.count, mode: this.mode, minutes: this.minutes, entries: this.list }));
    } catch {
      // ignore
    }
  }

  design(i) {
    return designById(this.list[i].design) ?? designById(defaultEntry(i).design);
  }

  name(i) {
    return this.list[i].name.trim() || `Marble ${i + 1}`;
  }

  entries() {
    return Array.from({ length: this.count }, (_, i) => {
      const design = this.design(i);
      return { name: this.name(i), color: designColor(design), design };
    });
  }

  setCount(n) {
    n = Math.min(MAX_MARBLES, Math.max(MIN, Math.round(n) || MIN));
    if (n === this.count) {
      this.countInput.value = String(n);
      return;
    }
    this.count = n;
    this._save();
    this.render();
    this.onRebuild();
  }

  async setDesign(i, id) {
    if (id.startsWith('design:') && !designById(id)) {
      try {
        await loadDesign(id.slice(7));
      } catch (err) {
        alert(err.message);
        this.render();
        return;
      }
    }
    this.list[i].design = id;
    this._save();
    this._updateRow(i);
    this.onEntry(i);
  }

  // Every racer gets a different design, in random order: the painted
  // designs first, then plain colours.
  async shuffleDesigns() {
    const painted = this.library.map((n) => `design:${n}`);
    const plain = BUILTIN.map((b) => b.id);
    const pool = [...shuffle(painted), ...shuffle(plain)].slice(0, this.count);
    await Promise.all(pool.filter((id) => id.startsWith('design:')).map((id) => loadDesign(id.slice(7)).catch(() => null)));
    shuffle(pool).forEach((id, i) => {
      this.list[i].design = designById(id) ? id : defaultEntry(i).design;
      this.onEntry(i);
    });
    this._save();
    this.render();
  }

  // One row per racer: preview, name, design, paint button.
  render() {
    this._renderMode();
    this.countInput.value = String(this.count);
    $('setup-minus').disabled = this.count <= MIN;
    $('setup-plus').disabled = this.count >= MAX_MARBLES;
    this.box.classList.toggle('wide', this.count > 8);
    this.rows = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.count; i++) {
      const row = document.createElement('div');
      row.className = 'entry';
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const thumb = document.createElement('canvas');
      thumb.width = thumb.height = 44;
      thumb.className = 'thumb';
      const name = document.createElement('input');
      Object.assign(name, { type: 'text', value: this.list[i].name, maxLength: 24, spellcheck: false, placeholder: `Marble ${i + 1}` });
      name.setAttribute('aria-label', `Name of marble ${i + 1}`);
      name.addEventListener('keydown', (e) => e.stopPropagation());
      name.addEventListener('input', () => {
        this.list[i].name = name.value;
        this._save();
        this.onEntry(i);
      });
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Design of marble ${i + 1}`);
      select.append(this._options());
      select.value = this.list[i].design;
      if (select.value !== this.list[i].design) select.value = defaultEntry(i).design;
      select.addEventListener('change', () => {
        this.setDesign(i, select.value);
        select.blur();
      });
      const paint = document.createElement('button');
      paint.textContent = '✎';
      paint.title = 'Paint this marble';
      paint.addEventListener('click', () => this.onPaint(i));
      row.append(num, thumb, name, select, paint);
      frag.append(row);
      this.rows.push({ thumb, select });
    }
    this.box.replaceChildren(frag);
    for (let i = 0; i < this.count; i++) this._updateRow(i);
  }

  _options() {
    const frag = document.createDocumentFragment();
    if (this.library.length) {
      const g = document.createElement('optgroup');
      g.label = 'Painted (marbles folder)';
      for (const n of this.library) g.append(new Option(n, `design:${n}`));
      frag.append(g);
    }
    const g = document.createElement('optgroup');
    g.label = 'Plain colours';
    for (const b of BUILTIN) g.append(new Option(b.name, b.id));
    frag.append(g);
    return frag;
  }

  _updateRow(i) {
    const r = this.rows?.[i];
    if (!r) return;
    r.select.value = this.list[i].design;
    drawThumb(r.thumb, this.design(i));
  }
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A flat little marble: the front half of the design in a circle, shaded.
// Redrawn once the design's paint has loaded.
export function drawThumb(canvas, design) {
  const tex = designTexture(design);
  const draw = () => {
    const g = canvas.getContext('2d');
    const s = canvas.width;
    const src = tex.image;
    g.clearRect(0, 0, s, s);
    g.save();
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    g.clip();
    // Seen from the front (+z) a three.js sphere shows u = 0 .. 0.5.
    g.drawImage(src, 0, src.height * 0.05, src.width / 2, src.height * 0.9, 0, 0, s, s);
    const shade = g.createRadialGradient(s * 0.36, s * 0.32, s * 0.05, s / 2, s / 2, s / 2);
    shade.addColorStop(0, 'rgba(255,255,255,0.55)');
    shade.addColorStop(0.35, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shade;
    g.fillRect(0, 0, s, s);
    g.restore();
    g.strokeStyle = '#111';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 0.5, 0, Math.PI * 2);
    g.stroke();
  };
  draw();
  if (design.paint) tex.userData.ready.then(draw); // paint decodes asynchronously
}
