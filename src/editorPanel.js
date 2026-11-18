import { TYPES, GROUPS } from './course/pieces.js';
import { Editor } from './editor.js';

// The track editor's panel: piece list, the selected piece's options,
// add / delete, undo / redo, export / import, reset, problems.
const $ = (id) => document.getElementById(id);
const UNITS = { len: 'u', deg: '°', num: '', side: '' };

export class EditorPanel {
  constructor(editor, { onTest }) {
    this.editor = editor;
    this.box = $('editor');
    this.list = $('ed-pieces');
    this.pieceBox = $('ed-piece');
    this.fields = $('ed-fields');
    this.name = $('ed-name');
    this.problems = $('ed-problems');
    this.shownPiece = null;

    // Piece types by group, in the order of GROUPS.
    $('ed-type').replaceChildren(
      ...GROUPS.map((g) => {
        const og = document.createElement('optgroup');
        og.label = g;
        og.append(...Object.entries(TYPES).filter(([, t]) => t.group === g).map(([key, t]) => new Option(t.label, key)));
        return og;
      })
    );
    $('ed-type').value = 'straight';
    const act = (id, fn) => $(id).addEventListener('click', (e) => {
      e.currentTarget.blur();
      this._try(fn);
    });
    act('ed-move', () => editor.setMode('translate'));
    act('ed-rotate', () => editor.setMode('rotate'));
    act('ed-shape', () => editor.setMode('shape'));
    act('ed-add-stop', () => {
      if (editor.mode !== 'shape') editor.setMode('shape');
      editor.addStop();
    });
    act('ed-add', () => editor.addPiece($('ed-type').value));
    act('ed-delete', () => editor.deletePiece());
    act('ed-detach', () => editor.detach());
    act('ed-undo', () => editor.undoStep());
    act('ed-redo', () => editor.redoStep());
    act('ed-export', () => editor.exportJson());
    act('ed-import', () => $('ed-file').click());
    act('ed-reset', () => {
      if (confirm('Throw away all edits and go back to the original course?')) editor.resetCourse();
    });
    act('ed-test', onTest);
    $('ed-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await this._try(() => editor.importJson(file));
    });
    this.list.addEventListener('change', () => {
      editor.select(this.list.value || null);
      this.list.blur();
    });
    this.name.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.name.blur();
    });
    this.name.addEventListener('change', () => this._try(() => editor.rename(this.name.value.trim())));
    editor.onChange = () => this.show();
  }

  async _try(fn) {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  show() {
    const ed = this.editor;
    this.box.hidden = !ed.active;
    document.body.classList.toggle('editing', ed.active);
    if (!ed.active) return;
    $('ed-move').classList.toggle('on', ed.mode === 'translate');
    $('ed-rotate').classList.toggle('on', ed.mode === 'rotate');
    $('ed-shape').classList.toggle('on', ed.mode === 'shape');
    $('ed-undo').disabled = !ed.undo.length;
    $('ed-redo').disabled = !ed.redo.length;
    const data = ed.data;
    const opts = data.pieces.map((p) => new Option(`${p.name} · ${TYPES[p.type]?.label ?? p.type}${p.pose ? ' (free)' : ''}`, p.id));
    const sig = opts.map((o) => o.value + o.text).join('|');
    if (sig !== this.listSig) {
      this.list.replaceChildren(...opts);
      this.listSig = sig;
    }
    this.list.value = ed.selected ?? '';
    this.problems.replaceChildren(...(ed.problems ?? []).map((t) => Object.assign(document.createElement('li'), { textContent: t })));

    const piece = data.pieces.find((p) => p.id === ed.selected);
    this.pieceBox.hidden = !piece;
    this._showConnect();
    if (!piece) return;
    const key = JSON.stringify([piece, ed.stop, ed.mode, ed.shapeInfo()?.length]);
    if (key === this.shownPiece) return;
    this.shownPiece = key;
    this.name.value = piece.name;
    const type = TYPES[piece.type];
    $('ed-type-label').textContent = `${type?.label ?? piece.type} · ${piece.id}`;
    this.fields.replaceChildren(...(type?.fields ?? []).map((f) => this._field(f, piece)));
    this._showStops();
  }

  // Shape stops of the selected piece: one row each, values in course units
  // (track width 0.6, walls 0.26 high), added to what the piece has anyway.
  _showStops() {
    const info = this.editor.shapeInfo();
    $('ed-shape-box').hidden = !info?.hasTrack;
    if (!info?.hasTrack) return;
    $('ed-shape-length').textContent = `· piece ${info.length.toFixed(2)} long`;
    const num = (v, step, onChange) => {
      const input = Object.assign(document.createElement('input'), { type: 'number', step, value: String(+v.toFixed(3)) });
      input.addEventListener('keydown', (e) => e.stopPropagation());
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('change', () => input.value.trim() !== '' && this._try(() => onChange(Number(input.value))));
      return input;
    };
    $('ed-stops').tBodies[0].replaceChildren(
      ...info.stops.map((s, i) => {
        const tr = document.createElement('tr');
        if (this.editor.stop?.index === i) tr.className = 'on';
        const cells = [
          num(s.d, 0.05, (v) => this.editor.setStop(i, 'd', v)),
          num(s.width ?? 0, 0.02, (v) => this.editor.setStop(i, 'width', v)),
          num(s.left ?? 0, 0.02, (v) => this.editor.setStop(i, 'left', v)),
          num(s.right ?? 0, 0.02, (v) => this.editor.setStop(i, 'right', v)),
        ];
        const del = Object.assign(document.createElement('button'), { textContent: '×', title: 'Remove this stop' });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this._try(() => this.editor.removeStop(i));
        });
        for (const c of [...cells, del]) {
          const td = document.createElement('td');
          td.append(c);
          tr.append(td);
        }
        tr.addEventListener('click', () => {
          if (this.editor.mode !== 'shape') this.editor.setMode('shape');
          this.editor.selectStop({ index: i, side: this.editor.stop?.side ?? 'left' });
        });
        return tr;
      })
    );
  }

  // Connect buttons for the selected piece's open sockets.
  _showConnect() {
    const options = this.editor.active ? this.editor.connectOptions().slice(0, 8) : [];
    $('ed-connect').hidden = !options.length;
    $('ed-connect-list').replaceChildren(
      ...options.map((o) => {
        const b = document.createElement('button');
        b.textContent = o.text;
        b.title = `Move this piece so its ${o.mine.kind === 'in' ? 'input' : 'output'} meets that ${o.other.kind === 'in' ? 'input' : 'output'} (${o.dist.toFixed(1)} units away), and link them`;
        b.addEventListener('click', () => {
          b.blur();
          this._try(() => this.editor.connect(o));
        });
        return b;
      })
    );
  }

  _field(f, piece) {
    const label = document.createElement('label');
    const value = piece.opts?.[f.key];
    if (f.kind === 'bool') {
      label.className = 'check';
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!value });
      box.addEventListener('change', () => this._try(() => this.editor.setOption(f.key, box.checked || null)));
      label.append(box, f.label);
      return label;
    }
    if (f.kind === 'side') {
      const sel = document.createElement('select');
      sel.append(new Option('Left', '1'), new Option('Right', '-1'));
      sel.value = String(value ?? f.def);
      sel.addEventListener('change', () => this._try(() => this.editor.setOption(f.key, Number(sel.value))));
      label.append(f.label, sel);
      return label;
    }
    const input = document.createElement('input');
    const scale = f.kind === 'deg';
    Object.assign(input, { type: 'number', min: f.min, max: f.max, step: f.step });
    input.value = Editor.show(f, value);
    input.placeholder = f.def === null ? 'auto' : String(f.def);
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      const v = input.value.trim();
      this._try(() => this.editor.setOption(f.key, v === '' ? null : Editor.store(f, Number(v))));
    });
    const unit = Object.assign(document.createElement('span'), { className: 'unit', textContent: scale ? '°' : UNITS[f.kind] });
    const right = document.createElement('span');
    right.append(input, unit);
    label.append(f.label, right);
    return label;
  }
}
