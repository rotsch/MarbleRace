// Sound effects, all synthesised with the Web Audio API (no sound files).
//
// Positional sounds (impacts, rolling, the crowd, the finish) go through a
// panner placed in the world, so they are louder near the camera and pan
// left/right with it. Interface sounds (countdown, clicks, pause) are not
// positional.
//
// Browsers only let audio start after a click or key press, so the context
// is resumed on the first one. Volume and mute are remembered per browser.

const STORE = 'marble-race-sound';
const MAX_VOICES = 40; // one-shot sounds playing at once
const IMPACT_GAP = 0.04; // s, per marble: fewer, cleaner clicks in a pack

export class Sound {
  constructor() {
    this.volume = 0.6;
    this.muted = false;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s) {
        this.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
        this.muted = !!s.muted;
      }
    } catch {
      // no storage: defaults
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    this.voices = 0;
    this.rolling = [];
    this.lastImpact = new Map(); // marble/shot key -> context time
    if (!this.ctx) return;

    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); // world sounds
    this.ui = c.createGain(); // interface sounds
    this.ui.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this._applyVolume();

    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const resume = () => {
      if (c.state !== 'running') c.resume();
    };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, resume, { capture: true });
  }

  get on() {
    return !!this.ctx && !this.muted && this.volume > 0 && this.ctx.state === 'running';
  }

  setVolume(v) {
    this.volume = v;
    if (v > 0) this.muted = false;
    this._applyVolume();
  }

  setMuted(m) {
    this.muted = m;
    this._applyVolume();
  }

  _applyVolume() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      // not stored, still works
    }
    if (!this.ctx) return;
    // Squared: the slider then feels even across its range.
    const g = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }

  // Ear on the camera.
  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const p = { x: e[12], y: e[13], z: e[14] };
    const f = { x: -e[8], y: -e[9], z: -e[10] };
    const u = { x: e[4], y: e[5], z: e[6] };
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setValueAtTime(f.x, t);
      l.forwardY.setValueAtTime(f.y, t);
      l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t);
      l.upY.setValueAtTime(u.y, t);
      l.upZ.setValueAtTime(u.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // ---- building blocks ----

  _panner(pos, ref = 1.5) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 200;
    p.rolloffFactor = 1;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  // Output for a one-shot: positional when `pos` is given, else the UI bus.
  // Returns null when the voice limit is reached.
  _out(pos, life) {
    if (this.voices >= MAX_VOICES) return null;
    this.voices++;
    setTimeout(() => this.voices--, life * 1000 + 50);
    return pos ? this._panner(pos) : this.ui;
  }

  _osc(type, freq, t, dur, out, peak, { attack = 0.002, to = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(t, dur, out, peak, { type = 'bandpass', freq = 1000, to = null, q = 1, attack = 0.002 } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  // ---- world sounds ----

  // A marble hitting something. kind: 'track' | 'marble' | 'pad'.
  // strength: the sudden change in speed (units/s).
  impact(key, pos, strength, kind) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    if (t - (this.lastImpact.get(key) ?? -1) < IMPACT_GAP) return;
    this.lastImpact.set(key, t);
    const a = Math.min(1, Math.max(0.04, (strength - 0.8) / 9));
    const out = this._out(pos, kind === 'pad' ? 0.4 : 0.15);
    if (!out) return;
    const r = 0.9 + Math.random() * 0.2;
    if (kind === 'marble') {
      // Glass on glass: bright, short, a little ring.
      this._osc('sine', 3100 * r, t, 0.06, out, 0.5 * a);
      this._osc('sine', 4700 * r, t, 0.04, out, 0.3 * a);
      this._noise(t, 0.02, out, 0.25 * a, { type: 'highpass', freq: 5000 });
    } else if (kind === 'pad') {
      // Rubber: a springy boing.
      this._osc('sine', 300 * r, t, 0.35, out, 0.7 * a, { to: 110 });
      this._osc('triangle', 600 * r, t, 0.12, out, 0.2 * a, { to: 220 });
    } else {
      // Glass on the track: a tick plus a body thud for hard hits.
      this._noise(t, 0.05, out, 0.5 * a, { freq: 1800 + 2500 * a, q: 1.4 });
      this._osc('sine', 1900 * r, t, 0.035, out, 0.25 * a);
      if (a > 0.25) this._osc('sine', 160 * r, t, 0.12, out, 0.6 * a, { to: 90 });
    }
  }

  // Continuous rolling noise, one voice per racing marble. marbles: array of
  // { pos, speed, touching }. active: false silences them (paused, waiting).
  updateRolling(marbles, active) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    while (this.rolling.length < marbles.length) {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.9;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const g = c.createGain();
      g.gain.value = 0;
      const p = this._panner({ x: 0, y: 0, z: 0 }, 1.2);
      s.connect(f).connect(lp).connect(g).connect(p);
      s.start(t, Math.random() * 1.5);
      this.rolling.push({ f, g, p });
    }
    this.rolling.forEach((v, i) => {
      const m = marbles[i];
      let gain = 0;
      if (m && active && m.touching) gain = 0.32 * Math.min(1, m.speed / 14) ** 1.3;
      v.g.gain.setTargetAtTime(gain, t, 0.04);
      if (!m) return;
      v.f.frequency.setTargetAtTime(220 + m.speed * 55, t, 0.05);
      if (v.p.positionX) {
        v.p.positionX.setTargetAtTime(m.pos.x, t, 0.02);
        v.p.positionY.setTargetAtTime(m.pos.y, t, 0.02);
        v.p.positionZ.setTargetAtTime(m.pos.z, t, 0.02);
      } else v.p.setPosition(m.pos.x, m.pos.y, m.pos.z);
    });
  }

  // Crowd in the finish grandstands: babbling voices, always running.
  setCrowd(pos) {
    if (!this.ctx) return;
    this.crowd ??= new Crowd(this, pos);
    this.crowd.moveTo(pos);
  }

  // The crowd only makes noise while the race is at the finish: from when
  // the leader comes near until the last marble is home. Fades in and out.
  setCrowdActive(on) {
    this.crowd?.setActive(on);
  }

  // The crowd cheers: voices rise and shout, and people clap. big: winner.
  cheer(pos, big = false) {
    if (this.crowd) this.crowd.excite(big ? 1 : 0.6);
  }

  // Bell as a marble crosses the line; higher for better places.
  finish(pos, place) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 1.6);
    if (!out) return;
    const f = 1320 / Math.pow(1.06, place - 1);
    this._osc('sine', f, t, 1.5, out, 0.5);
    this._osc('sine', f * 2.76, t, 0.6, out, 0.15);
    this._osc('sine', f * 5.4, t, 0.25, out, 0.06);
    this.cheer(pos, place === 1);
    if (place === 1) this.fanfare();
  }

  // Winner fanfare (interface bus, so it is heard from anywhere).
  fanfare() {
    if (!this.on) return;
    const t = this.ctx.currentTime + 0.15;
    const out = this._out(null, 1.6);
    if (!out) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const at = t + i * 0.13;
      const len = i === 3 ? 0.9 : 0.16;
      this._osc('triangle', f, at, len, out, 0.35);
      this._osc('square', f, at, len * 0.7, out, 0.05);
    });
  }

  // Everyone is home: a closing chord.
  raceOver() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 1.8);
    if (!out) return;
    for (const f of [392, 523.25, 659.25, 783.99]) this._osc('triangle', f, t, 1.7, out, 0.16, { attack: 0.03 });
  }

  // A marble put back on the track by the safety net.
  rescue(pos) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.3);
    if (out) this._osc('sine', 330, t, 0.25, out, 0.4, { to: 990 });
  }

  // A stuck marble getting a nudge.
  nudge(pos) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.2);
    if (out) this._noise(t, 0.18, out, 0.4, { freq: 400, to: 1500, q: 1 });
  }

  // Endless mode: a dropped-in piece touching down on the track: a low thud
  // and a short dusty hiss.
  land(pos) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, 0.5);
    if (!out) return;
    this._osc('sine', 150, t, 0.16, out, 0.45, { to: 55 });
    this._noise(t, 0.3, out, 0.22, { freq: 900, to: 300, q: 0.7 });
  }

  // Marble fired from the camera.
  shot() {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    if (!out) return;
    this._noise(t, 0.25, out, 0.6, { freq: 2500, to: 500, q: 1.2 });
    this._osc('sine', 220, t, 0.08, out, 0.5, { to: 80 });
  }

  // ---- interface sounds ----

  // Start-light beep; go = the green light.
  beep(go = false) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.7);
    if (!out) return;
    this._osc('square', go ? 1046.5 : 523.25, t, go ? 0.6 : 0.22, out, 0.18, { attack: 0.005 });
    this._osc('sine', go ? 1046.5 : 523.25, t, go ? 0.6 : 0.22, out, 0.3, { attack: 0.005 });
  }

  // Soft click for buttons and switches; pitch > 1 is higher.
  click(pitch = 1) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    if (t - (this.lastClick ?? -1) < 0.03) return; // dragging a slider
    this.lastClick = t;
    const out = this._out(null, 0.05);
    if (out) this._osc('sine', 1400 * pitch, t, 0.04, out, 0.25);
  }

  // Pause: two falling notes; resume: two rising ones.
  pause(paused) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const out = this._out(null, 0.3);
    if (!out) return;
    const [a, b] = paused ? [660, 440] : [440, 660];
    this._osc('triangle', a, t, 0.1, out, 0.3);
    this._osc('triangle', b, t + 0.09, 0.14, out, 0.3);
  }
}

// ---- the crowd ----
//
// A crowd is many people talking, so it is built from voices, not noise:
// each voice is a buzzing tone (the vocal cords) through two resonant filters
// set to a vowel's formants (the mouth). It speaks in syllables, a few to a
// word and a pause between words, its pitch drifting like speech. A dozen of
// these talking over each other, softened by a short reverb, blur into the
// murmur of a grandstand. Excitement (a finisher) raises pitch and loudness,
// stretches syllables into shouts and adds applause, then settles again.

// First two formants (Hz) of a few vowels.
const VOWELS = [[800, 1200], [500, 1900], [320, 2300], [500, 900], [360, 800], [560, 1500], [650, 1700]];
const CROWD_VOICES = 14;
const LOOKAHEAD = 0.35; // s of speech scheduled ahead

class Crowd {
  constructor(sound, pos) {
    this.sound = sound;
    const c = (this.ctx = sound.ctx);
    this.excitement = 0; // 0 murmur .. 1 roaring
    this.out = sound._panner(pos, 2.5);
    // Blend the voices: a soft lowpass and a short, dark room reverb.
    this.bus = c.createGain();
    this.bus.gain.value = 0; // silent until setActive(true)
    this.active = false;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const verb = c.createConvolver();
    verb.buffer = this._impulse(1.4);
    const wet = c.createGain();
    wet.gain.value = 0.5;
    this.bus.connect(lp);
    lp.connect(this.out);
    lp.connect(verb).connect(wet).connect(this.out);

    this.voices = Array.from({ length: CROWD_VOICES }, (_, i) => this._voice(i));
    this.nextClap = 0;
    this.timer = setInterval(() => this._schedule(), 60);
  }

  moveTo(pos) {
    const p = this.out;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(on ? 0.9 : 0, t, on ? 0.5 : 0.7);
    if (on) this.excitedAt = undefined; // start as a murmur
    if (on) this.excitement = 0;
    if (!on) this.offAt = t;
  }

  excite(level) {
    this.peak = Math.max(this.excitement, level);
    this.excitedAt = this.ctx.currentTime;
  }

  _impulse(seconds) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return buf;
  }

  _voice(i) {
    const c = this.ctx;
    // Mixed crowd: lower and higher voices.
    const base = i % 3 === 0 ? 190 + Math.random() * 50 : 100 + Math.random() * 45;
    const src = c.createOscillator();
    src.type = 'sawtooth';
    src.frequency.value = base;
    // A little vibrato/jitter so no voice is a steady tone.
    const vib = c.createOscillator();
    vib.frequency.value = 4 + Math.random() * 2;
    const vibDepth = c.createGain();
    vibDepth.gain.value = base * 0.015;
    vib.connect(vibDepth).connect(src.frequency);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 7;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 9;
    const f2g = c.createGain();
    f2g.gain.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f1).connect(g);
    src.connect(f2).connect(f2g).connect(g);
    g.connect(this.bus);
    src.start();
    vib.start();
    // Start each voice somewhere in its own sentence.
    return { src, f1, f2, g, base, next: c.currentTime + Math.random() * 1.5, left: 0 };
  }

  _schedule() {
    const c = this.ctx;
    if (!this.sound.on) return;
    const now = c.currentTime;
    // Off: keep talking only while the fade-out lasts, then fall silent.
    if (!this.active && !(now - (this.offAt ?? -10) < 3)) return;
    // Excitement: full for a moment, then fades back to a murmur over a
    // few seconds (longer after a big cheer).
    if (this.excitedAt !== undefined) {
      const hold = 1 + this.peak;
      const since = now - this.excitedAt;
      this.excitement = since < hold ? this.peak : this.peak * Math.exp(-(since - hold) / (1.5 + this.peak * 1.5));
      if (this.excitement < 0.01) this.excitement = 0;
    }
    const e = this.excitement;
    for (const v of this.voices) {
      v.next = Math.max(v.next, now);
      while (v.next < now + LOOKAHEAD) this._syllable(v, e);
    }
    this._applause(now, e);
  }

  _syllable(v, e) {
    const t = v.next;
    const rnd = Math.random;
    if (v.left <= 0) {
      // Between words: a pause, shorter when the crowd is excited.
      v.left = 1 + Math.floor(rnd() * 4);
      v.pitch = v.base * (1 + e * 0.7) * (0.9 + rnd() * 0.25);
      v.next = t + (0.25 + rnd() * 1.4) * (1 - e * 0.75);
      return;
    }
    v.left--;
    // Shouting stretches syllables ("woo", "yeah").
    const shout = e > 0.3 && rnd() < e * 0.6;
    const dur = shout ? 0.35 + rnd() * 0.5 : 0.09 + rnd() * 0.14;
    const [a, b] = VOWELS[Math.floor(rnd() * VOWELS.length)];
    const k = 1 + (v.base > 170 ? 0.15 : 0); // higher voices, higher formants
    v.f1.frequency.setTargetAtTime(a * k, t, 0.02);
    v.f2.frequency.setTargetAtTime(b * k, t, 0.02);
    // Speech melody: each syllable a little off the word's pitch, falling at
    // the end of a word; a shout glides up.
    const p = v.pitch * (v.left === 0 ? 0.88 : 0.95 + rnd() * 0.12);
    v.src.frequency.setTargetAtTime(p, t, 0.03);
    if (shout) v.src.frequency.setTargetAtTime(p * 1.25, t + dur * 0.3, dur * 0.3);
    const level = (0.05 + 0.13 * e) * (0.5 + rnd() * 0.5);
    const g = v.g.gain;
    g.setTargetAtTime(level, t, 0.015);
    g.setTargetAtTime(0, t + dur, 0.03);
    v.next = t + dur + 0.03 + rnd() * 0.05;
  }

  // Clapping: many short, slightly different claps. Only when excited.
  _applause(now, e) {
    if (e < 0.15) return;
    const rate = 40 * e; // claps per second across the crowd
    this.nextClap = Math.max(this.nextClap, now);
    const c = this.ctx;
    while (this.nextClap < now + LOOKAHEAD) {
      const t = this.nextClap;
      const s = c.createBufferSource();
      s.buffer = this.sound.noise;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900 + Math.random() * 1600;
      f.Q.value = 2.5;
      const g = c.createGain();
      // Kept under the voices, short and sharp, so claps stay separate
      // clicks instead of merging into a hiss.
      const peak = (0.08 + Math.random() * 0.1) * Math.min(1, e * 1.4);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.015 + Math.random() * 0.012);
      s.connect(f).connect(g).connect(this.bus);
      s.start(t, Math.random() * 1.5);
      s.stop(t + 0.08);
      this.nextClap += (-Math.log(1 - Math.random()) / rate);
    }
  }
}
