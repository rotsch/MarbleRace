import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { marbleMaterial } from './designs.js';

// The racers down the left side: each marble as a big, slowly spinning 3D
// rendering with its name above it, its place once it has finished and a
// ring on the current leader. One WebGL canvas over the whole panel draws
// every marble into its own card (scissored viewports), so any number of
// racers costs one context.
const SPIN = 0.55; // rad/s
const MAX_SIZE = 104; // px, marble diameter
const MIN_SIZE = 46;
const LABEL = 18; // px, name line above each marble

export class Lineup {
  constructor(panel) {
    this.panel = panel;
    this.cards = panel.querySelector('.cards');
    this.canvas = panel.querySelector('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(-2, 3, 4);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 0, 4.3);
    this.sphere = new THREE.SphereGeometry(1, 48, 32);
    this.items = []; // { card, slot, name, place, mesh, phase }
    this.race = null;
    this.visible = true;
    this.time = 0;
    window.addEventListener('resize', () => this.layout());
  }

  // Graphics setting: share of the screen's pixels drawn (see graphics.js).
  setResolution(scale) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
    this.layout();
  }

  setRace(race) {
    this.race = race;
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      it.mesh.material.dispose();
    }
    this.items = race.marbles.map((m, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      const head = document.createElement('div');
      head.className = 'head';
      const place = document.createElement('span');
      place.className = 'place';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = m.name;
      head.append(place, name);
      const slot = document.createElement('div');
      slot.className = 'slot';
      card.append(head, slot);
      const mesh = new THREE.Mesh(this.sphere, marbleMaterial(m.design, this.envMap));
      mesh.material.userData.design = m.design;
      mesh.visible = false;
      this.scene.add(mesh);
      return { card, slot, name, place, mesh, phase: i * 0.9, state: '' };
    });
    this.cards.replaceChildren(...this.items.map((it) => it.card));
    this.layout();
  }

  // Racer i changed its name or design in the race setup.
  refresh(i) {
    const m = this.race?.marbles[i], it = this.items[i];
    if (!m || !it) return;
    it.name.textContent = m.name;
    if (it.mesh.material.userData.design !== m.design) {
      it.mesh.material.dispose();
      it.mesh.material = marbleMaterial(m.design, this.envMap);
      it.mesh.material.userData.design = m.design;
    }
  }

  setVisible(on) {
    this.visible = on;
    this.panel.hidden = !on;
    if (on) this.layout();
    else document.getElementById('ui').style.setProperty('--lineup-w', '0px');
  }

  // Columns and marble size so that every racer fits the window height.
  layout() {
    const n = this.items.length;
    if (!n || !this.visible) return;
    const avail = window.innerHeight - 14 - 70 - 20; // top margin, sound panel, padding
    let best = null;
    for (let cols = 1; cols <= 4; cols++) {
      const rows = Math.ceil(n / cols);
      const size = Math.min(MAX_SIZE, Math.floor(avail / rows) - LABEL - 8);
      if (!best || size > best.size) best = { cols, size };
      if (size >= 72) break; // big enough: prefer fewer columns
    }
    const size = Math.max(MIN_SIZE, best.size);
    this.panel.style.setProperty('--size', `${size}px`);
    this.panel.style.setProperty('--cols', String(best.cols));
    // Lets the ranking and progress panels sit beside the lineup.
    requestAnimationFrame(() => {
      if (this.visible) document.getElementById('ui').style.setProperty('--lineup-w', `${this.panel.offsetWidth}px`);
    });
  }

  update(race, dt) {
    if (!this.visible || race !== this.race) return;
    this.time += dt;
    // Places and the leader's ring.
    const lead = race.leader();
    const ranking = race.ranking();
    ranking.forEach((m, rank) => {
      const it = this.items[m.index];
      const state = `${m.finished ? m.place : ''}|${m === lead}|${rank}`;
      if (state === it.state) return;
      it.state = state;
      it.place.textContent = m.finished ? ordinal(m.place) : String(rank + 1);
      it.card.classList.toggle('done', m.finished);
      it.card.classList.toggle('lead', m === lead && race.time > 0);
      it.card.classList.toggle('first', m.finished && m.place === 1);
    });

    const pr = this.panel.getBoundingClientRect();
    const w = Math.round(pr.width), h = Math.round(pr.height);
    if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) this.renderer.setSize(w, h, false);
    const r = this.renderer;
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    for (const it of this.items) {
      const sr = it.slot.getBoundingClientRect();
      const x = sr.left - pr.left, y = sr.top - pr.top, s = sr.width;
      if (s < 2 || y + s < 0 || y > h) continue;
      const bottom = h - y - s;
      r.setViewport(x, bottom, s, s);
      r.setScissor(x, bottom, s, s);
      it.mesh.visible = true;
      it.mesh.rotation.set(0.38, this.time * SPIN + it.phase, 0.12);
      r.render(this.scene, this.camera);
      it.mesh.visible = false;
    }
    r.setScissorTest(false);
  }
}

function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${s}`;
}
