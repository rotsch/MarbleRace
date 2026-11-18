// Sticker shapes for the paint editor. Each is drawn on a 2D canvas context
// already scaled to a -1..1 square (y down), in one colour (the context's
// fillStyle / strokeStyle): the editor uses only the alpha and stamps it in
// the paint colour. Holes are cut with cut(). Stickers marked `colours` keep
// the colours they are drawn in (like a picture).
//
// To add one: an entry in STICKERS and a drawing function in DRAW.

export const STICKERS = [
  { group: 'Shapes', items: [
    ['circle', 'Circle'], ['ring', 'Ring'], ['square', 'Square'], ['triangle', 'Triangle'], ['diamond', 'Diamond'],
    ['hexagon', 'Hexagon'], ['star', 'Star'], ['star6', 'Six-point star'], ['sparkle', 'Sparkle'], ['heart', 'Heart'],
    ['plus', 'Plus'], ['cross', 'Cross (X)'], ['target', 'Target'], ['spiral', 'Spiral'], ['infinity', 'Infinity'],
  ] },
  { group: 'Symbols', items: [
    ['bolt', 'Lightning'], ['arrow', 'Arrow'], ['check', 'Tick'], ['note', 'Music note'], ['spade', 'Spade'],
    ['club', 'Club'], ['gem', 'Gem'], ['crown', 'Crown'], ['shield', 'Shield'], ['anchor', 'Anchor'],
    ['peace', 'Peace'], ['dice', 'Dice'], ['badge', 'Number badge (uses Text)'], ['flag', 'Flag'], ['rocket', 'Rocket'],
  ] },
  { group: 'Nature', items: [
    ['sun', 'Sun'], ['moon', 'Moon'], ['cloud', 'Cloud'], ['snowflake', 'Snowflake'], ['droplet', 'Droplet'],
    ['flame', 'Flame'], ['leaf', 'Leaf'], ['clover', 'Four-leaf clover'], ['flower', 'Flower'], ['tree', 'Pine tree'],
    ['wave', 'Waves'], ['planet', 'Planet'], ['mushroom', 'Mushroom'],
  ] },
  { group: 'Creatures and faces', items: [
    ['paw', 'Paw print'], ['fish', 'Fish'], ['bone', 'Bone'], ['butterfly', 'Butterfly'], ['cat', 'Cat'],
    ['ghost', 'Ghost'], ['skull', 'Skull'], ['smile', 'Smiley'], ['wink', 'Wink'], ['sad', 'Sad face'],
    ['cool', 'Sunglasses face'], ['eye', 'Eye (own colours)'],
  ] },
  { group: 'Your own', items: [['text', 'Text'], ['image', 'Picture…']] },
];

// Stickers that keep their own colours instead of the paint colour.
export const OWN_COLOURS = new Set(['eye', 'image']);

const TAU = Math.PI * 2;

function poly(g, pts) {
  g.beginPath();
  pts.forEach(([x, y]) => g.lineTo(x, y));
  g.closePath();
  g.fill();
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

function starPts(n, rOut, rIn, dy = 0, start = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = start + (i * Math.PI) / n;
    const r = i % 2 ? rIn : rOut;
    pts.push([Math.cos(a) * r, Math.sin(a) * r + dy]);
  }
  return pts;
}

function regular(n, r, start = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => [Math.cos(start + (i * TAU) / n) * r, Math.sin(start + (i * TAU) / n) * r]);
}

// Draw with fn, then the next drawing cuts holes instead of painting.
function cut(g, fn) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.strokeStyle = '#000';
  fn();
  g.restore();
}

function line(g, w, ...pts) {
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function heartPath(g, s = 1, dx = 0, dy = 0) {
  g.beginPath();
  g.moveTo(dx, dy + 0.9 * s);
  g.bezierCurveTo(dx - 1.25 * s, dy + 0.05 * s, dx - 0.75 * s, dy - 1.05 * s, dx, dy - 0.42 * s);
  g.bezierCurveTo(dx + 0.75 * s, dy - 1.05 * s, dx + 1.25 * s, dy + 0.05 * s, dx, dy + 0.9 * s);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

// Text fitted into a box of width w, centred on (x, y), in -1..1 units.
function fitText(g, text, x, y, w, h) {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = h;
  g.font = `bold ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > w) px = (px * w) / tw;
  g.font = `bold ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
  g.fillText(text, x, y + px * 0.05);
}

const DRAW = {
  // Shapes
  circle: (g) => circle(g, 0, 0, 0.95),
  ring: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.95, 0, TAU);
    g.arc(0, 0, 0.62, 0, TAU, true);
    g.fill();
  },
  square: (g) => roundRect(g, -0.85, -0.85, 1.7, 1.7, 0.16),
  triangle: (g) => poly(g, [[0, -0.95], [0.95, 0.75], [-0.95, 0.75]]),
  diamond: (g) => poly(g, [[0, -0.97], [0.66, 0], [0, 0.97], [-0.66, 0]]),
  hexagon: (g) => poly(g, regular(6, 0.95, 0)),
  star: (g) => poly(g, starPts(5, 0.98, 0.42, 0.06)),
  star6: (g) => poly(g, starPts(6, 0.98, 0.56)),
  sparkle: (g) => {
    g.beginPath();
    g.moveTo(0, -0.97);
    g.quadraticCurveTo(0.1, -0.1, 0.97, 0);
    g.quadraticCurveTo(0.1, 0.1, 0, 0.97);
    g.quadraticCurveTo(-0.1, 0.1, -0.97, 0);
    g.quadraticCurveTo(-0.1, -0.1, 0, -0.97);
    g.fill();
  },
  heart: (g) => {
    heartPath(g);
    g.fill();
  },
  plus: (g) => {
    roundRect(g, -0.3, -0.92, 0.6, 1.84, 0.08);
    roundRect(g, -0.92, -0.3, 1.84, 0.6, 0.08);
  },
  cross: (g) => {
    g.rotate(Math.PI / 4);
    roundRect(g, -0.2, -1.05, 0.4, 2.1, 0.08);
    roundRect(g, -1.05, -0.2, 2.1, 0.4, 0.08);
  },
  target: (g) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => circle(g, 0, 0, 0.76));
    circle(g, 0, 0, 0.57);
    cut(g, () => circle(g, 0, 0, 0.38));
    circle(g, 0, 0, 0.19);
  },
  spiral: (g) => {
    const pts = [];
    for (let t = 0; t <= 3 * TAU; t += 0.08) pts.push([Math.cos(t) * t * 0.047, Math.sin(t) * t * 0.047]);
    line(g, 0.13, ...pts);
  },
  infinity: (g) => {
    const pts = [];
    for (let t = 0; t <= TAU + 0.01; t += 0.05) {
      const d = 1 + Math.sin(t) ** 2;
      pts.push([(0.85 * Math.cos(t)) / d, (0.85 * Math.sin(t) * Math.cos(t)) / d]);
    }
    line(g, 0.2, ...pts);
  },

  // Symbols
  bolt: (g) => poly(g, [[0.18, -0.98], [-0.55, 0.12], [-0.05, 0.12], [-0.22, 0.98], [0.58, -0.18], [0.07, -0.18], [0.32, -0.98]]),
  arrow: (g) => poly(g, [[-0.92, -0.24], [0.12, -0.24], [0.12, -0.62], [0.95, 0], [0.12, 0.62], [0.12, 0.24], [-0.92, 0.24]]),
  check: (g) => line(g, 0.3, [-0.72, 0.02], [-0.22, 0.52], [0.75, -0.55]),
  note: (g) => {
    ellipse(g, -0.28, 0.6, 0.32, 0.23, -0.4);
    g.fillRect(-0.03, -0.9, 0.13, 1.5);
    line(g, 0.13, [0.035, -0.85], [0.3, -0.62], [0.62, -0.42], [0.52, 0.05]);
  },
  spade: (g) => {
    g.save();
    g.scale(1, -1);
    heartPath(g, 0.95, 0, 0.18);
    g.fill();
    g.restore();
    poly(g, [[0, 0.2], [0.3, 0.95], [-0.3, 0.95]]);
  },
  club: (g) => {
    circle(g, 0, -0.48, 0.34);
    circle(g, -0.44, 0.08, 0.34);
    circle(g, 0.44, 0.08, 0.34);
    circle(g, 0, -0.05, 0.25);
    poly(g, [[0, -0.05], [0.28, 0.95], [-0.28, 0.95]]);
  },
  gem: (g) => {
    poly(g, [[-0.55, -0.62], [0.55, -0.62], [0.95, -0.12], [0, 0.92], [-0.95, -0.12]]);
    cut(g, () => {
      line(g, 0.06, [-0.95, -0.12], [0.95, -0.12]);
      line(g, 0.06, [-0.55, -0.62], [-0.3, -0.12], [0, 0.92], [0.3, -0.12], [0.55, -0.62]);
      line(g, 0.06, [-0.3, -0.12], [0, -0.62], [0.3, -0.12]);
    });
  },
  crown: (g) => poly(g, [[-0.95, 0.6], [-0.95, -0.55], [-0.5, -0.05], [0, -0.75], [0.5, -0.05], [0.95, -0.55], [0.95, 0.6]]),
  shield: (g) => {
    const path = (s) => {
      g.beginPath();
      g.moveTo(0, -0.95 * s);
      g.lineTo(0.82 * s, -0.66 * s);
      g.lineTo(0.76 * s, 0.1 * s);
      g.quadraticCurveTo(0.62 * s, 0.7 * s, 0, 0.97 * s);
      g.quadraticCurveTo(-0.62 * s, 0.7 * s, -0.76 * s, 0.1 * s);
      g.lineTo(-0.82 * s, -0.66 * s);
      g.closePath();
    };
    path(1);
    g.fill();
    cut(g, () => {
      g.lineWidth = 0.07;
      path(0.78);
      g.stroke();
    });
  },
  anchor: (g) => {
    g.lineWidth = 0.13;
    g.beginPath();
    g.arc(0, -0.74, 0.16, 0, TAU);
    g.stroke();
    line(g, 0.14, [0, -0.58], [0, 0.85]);
    line(g, 0.13, [-0.42, -0.34], [0.42, -0.34]);
    g.lineWidth = 0.14;
    g.beginPath();
    g.arc(0, 0.2, 0.68, 0.12 * Math.PI, 0.88 * Math.PI);
    g.stroke();
    poly(g, [[-0.82, 0.12], [-0.5, 0.3], [-0.84, 0.45]]);
    poly(g, [[0.82, 0.12], [0.5, 0.3], [0.84, 0.45]]);
  },
  peace: (g) => {
    g.lineWidth = 0.15;
    g.beginPath();
    g.arc(0, 0, 0.84, 0, TAU);
    g.stroke();
    line(g, 0.15, [0, -0.84], [0, 0.84]);
    line(g, 0.15, [0, 0.05], [-0.6, 0.6]);
    line(g, 0.15, [0, 0.05], [0.6, 0.6]);
  },
  dice: (g) => {
    roundRect(g, -0.88, -0.88, 1.76, 1.76, 0.28);
    cut(g, () => [[-0.45, -0.45], [0.45, -0.45], [0, 0], [-0.45, 0.45], [0.45, 0.45]].forEach(([x, y]) => circle(g, x, y, 0.16)));
  },
  badge: (g, text) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => {
      g.lineWidth = 0.06;
      g.beginPath();
      g.arc(0, 0, 0.82, 0, TAU);
      g.stroke();
      fitText(g, text || '1', 0, 0, 1.2, 1.05);
    });
  },
  flag: (g) => {
    g.fillRect(-0.8, -0.95, 0.12, 1.9);
    g.beginPath();
    g.moveTo(-0.68, -0.9);
    g.bezierCurveTo(-0.25, -1.1, 0.2, -0.6, 0.9, -0.85);
    g.lineTo(0.9, 0.05);
    g.bezierCurveTo(0.2, 0.3, -0.25, -0.2, -0.68, 0);
    g.closePath();
    g.fill();
  },
  rocket: (g) => {
    g.beginPath();
    g.moveTo(0, -0.97);
    g.bezierCurveTo(0.42, -0.6, 0.38, 0.1, 0.28, 0.45);
    g.lineTo(-0.28, 0.45);
    g.bezierCurveTo(-0.38, 0.1, -0.42, -0.6, 0, -0.97);
    g.fill();
    poly(g, [[0.26, 0.05], [0.62, 0.55], [0.6, 0.78], [0.28, 0.45]]);
    poly(g, [[-0.26, 0.05], [-0.62, 0.55], [-0.6, 0.78], [-0.28, 0.45]]);
    poly(g, [[-0.18, 0.52], [0.18, 0.52], [0, 0.97]]);
    cut(g, () => circle(g, 0, -0.28, 0.15));
  },

  // Nature
  sun: (g) => {
    circle(g, 0, 0, 0.46);
    for (let k = 0; k < 12; k++) {
      g.save();
      g.rotate((k * TAU) / 12);
      poly(g, [[-0.1, -0.58], [0.1, -0.58], [0, -0.97]]);
      g.restore();
    }
  },
  moon: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.95, 0, TAU);
    g.moveTo(0.38 + 0.75, -0.22);
    g.arc(0.38, -0.22, 0.75, 0, TAU, true);
    g.fill('evenodd');
  },
  cloud: (g) => {
    circle(g, -0.48, 0.18, 0.38);
    circle(g, -0.05, -0.12, 0.5);
    circle(g, 0.45, 0.12, 0.4);
    roundRect(g, -0.48, 0.1, 0.95, 0.46, 0.05);
  },
  snowflake: (g) => {
    for (let k = 0; k < 6; k++) {
      g.save();
      g.rotate((k * TAU) / 6);
      line(g, 0.1, [0, 0], [0, -0.92]);
      line(g, 0.09, [-0.24, -0.76], [0, -0.52], [0.24, -0.76]);
      line(g, 0.08, [-0.16, -0.42], [0, -0.28], [0.16, -0.42]);
      g.restore();
    }
  },
  droplet: (g) => {
    g.beginPath();
    g.moveTo(0, -0.97);
    g.quadraticCurveTo(0.72, -0.1, 0.68, 0.28);
    g.arc(0, 0.28, 0.68, 0, Math.PI);
    g.quadraticCurveTo(-0.72, -0.1, 0, -0.97);
    g.fill();
  },
  flame: (g) => {
    g.beginPath();
    g.moveTo(0, 0.96);
    g.bezierCurveTo(-0.75, 0.96, -0.85, 0.2, -0.45, -0.25);
    g.bezierCurveTo(-0.4, 0.1, -0.2, 0.15, -0.15, 0.05);
    g.bezierCurveTo(-0.3, -0.4, 0, -0.7, 0.1, -0.96);
    g.bezierCurveTo(0.2, -0.5, 0.85, -0.3, 0.7, 0.35);
    g.bezierCurveTo(0.6, 0.8, 0.3, 0.96, 0, 0.96);
    g.fill();
  },
  leaf: (g) => {
    g.beginPath();
    g.moveTo(-0.85, 0.85);
    g.bezierCurveTo(-0.9, -0.3, -0.1, -0.95, 0.92, -0.92);
    g.bezierCurveTo(0.92, 0.1, 0.3, 0.9, -0.85, 0.85);
    g.fill();
    cut(g, () => line(g, 0.06, [-0.7, 0.7], [0.65, -0.65]));
  },
  clover: (g) => {
    for (let k = 0; k < 4; k++) {
      g.save();
      g.rotate((k * TAU) / 4);
      circle(g, -0.2, -0.47, 0.27);
      circle(g, 0.2, -0.47, 0.27);
      poly(g, [[-0.44, -0.38], [0.44, -0.38], [0, 0]]);
      g.restore();
    }
    g.lineWidth = 0.1;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(0.1, 0.6, 0.45, 0.95);
    g.stroke();
  },
  flower: (g) => {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ellipse(g, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.45, 0.3, a);
    }
    circle(g, 0, 0, 0.3);
  },
  tree: (g) => {
    poly(g, [[0, -0.97], [0.45, -0.38], [-0.45, -0.38]]);
    poly(g, [[0, -0.66], [0.66, 0.12], [-0.66, 0.12]]);
    poly(g, [[0, -0.24], [0.86, 0.64], [-0.86, 0.64]]);
    g.fillRect(-0.13, 0.62, 0.26, 0.34);
  },
  wave: (g) => {
    for (const y of [-0.5, 0, 0.5]) {
      const pts = [];
      for (let x = -0.9; x <= 0.9; x += 0.05) pts.push([x, y + Math.sin(x * 5.2) * 0.14]);
      line(g, 0.15, ...pts);
    }
  },
  planet: (g) => {
    circle(g, 0, 0, 0.52);
    g.save();
    g.rotate(-0.35);
    cut(g, () => {
      g.lineWidth = 0.22;
      g.beginPath();
      g.ellipse(0, 0, 0.9, 0.27, 0, 0.05 * Math.PI, 0.95 * Math.PI);
      g.stroke();
    });
    g.lineWidth = 0.1;
    g.beginPath();
    g.ellipse(0, 0, 0.92, 0.28, 0, 0, TAU);
    g.stroke();
    // The top of the planet covers the back of the ring.
    g.beginPath();
    g.rect(-1.5, -1.5, 3, 1.5);
    g.clip();
    circle(g, 0, 0, 0.52);
    g.restore();
  },
  mushroom: (g) => {
    g.beginPath();
    g.moveTo(-0.95, 0.05);
    g.bezierCurveTo(-0.95, -0.95, 0.95, -0.95, 0.95, 0.05);
    g.closePath();
    g.fill();
    roundRect(g, -0.3, 0.05, 0.6, 0.9, 0.12);
    cut(g, () => {
      circle(g, -0.45, -0.28, 0.14);
      circle(g, 0.1, -0.5, 0.17);
      circle(g, 0.55, -0.2, 0.12);
      g.fillRect(-0.95, 0.04, 1.9, 0.07);
    });
  },

  // Creatures and faces
  paw: (g) => {
    ellipse(g, 0, 0.38, 0.46, 0.38);
    circle(g, -0.62, -0.12, 0.19);
    circle(g, -0.24, -0.54, 0.2);
    circle(g, 0.24, -0.54, 0.2);
    circle(g, 0.62, -0.12, 0.19);
  },
  fish: (g) => {
    ellipse(g, -0.12, 0, 0.62, 0.42);
    poly(g, [[0.38, 0], [0.95, -0.48], [0.95, 0.48]]);
    cut(g, () => {
      circle(g, -0.42, -0.08, 0.08);
      line(g, 0.05, [0.08, -0.32], [0.18, 0], [0.08, 0.32]);
    });
  },
  bone: (g) => {
    g.fillRect(-0.62, -0.16, 1.24, 0.32);
    for (const x of [-0.66, 0.66]) for (const y of [-0.19, 0.19]) circle(g, x, y, 0.23);
  },
  butterfly: (g) => {
    ellipse(g, -0.45, -0.3, 0.45, 0.36, -0.5);
    ellipse(g, 0.45, -0.3, 0.45, 0.36, 0.5);
    ellipse(g, -0.36, 0.4, 0.3, 0.28, 0.4);
    ellipse(g, 0.36, 0.4, 0.3, 0.28, -0.4);
    cut(g, () => ellipse(g, 0, 0, 0.13, 0.75));
    ellipse(g, 0, 0, 0.07, 0.65);
    line(g, 0.05, [-0.03, -0.6], [-0.28, -0.92]);
    line(g, 0.05, [0.03, -0.6], [0.28, -0.92]);
  },
  cat: (g) => {
    circle(g, 0, 0.12, 0.76);
    poly(g, [[-0.76, -0.12], [-0.72, -0.96], [-0.18, -0.56]]);
    poly(g, [[0.76, -0.12], [0.72, -0.96], [0.18, -0.56]]);
    cut(g, () => {
      ellipse(g, -0.3, 0.02, 0.11, 0.17);
      ellipse(g, 0.3, 0.02, 0.11, 0.17);
      poly(g, [[-0.1, 0.26], [0.1, 0.26], [0, 0.38]]);
      for (const s of [-1, 1]) {
        line(g, 0.035, [s * 0.2, 0.42], [s * 0.72, 0.32]);
        line(g, 0.035, [s * 0.2, 0.48], [s * 0.72, 0.52]);
      }
    });
  },
  ghost: (g) => {
    g.beginPath();
    g.moveTo(-0.72, 0.95);
    g.lineTo(-0.72, -0.2);
    g.arc(0, -0.2, 0.72, Math.PI, 0);
    g.lineTo(0.72, 0.95);
    for (let i = 0; i < 4; i++) {
      const x0 = 0.72 - i * 0.36;
      g.quadraticCurveTo(x0 - 0.09, 0.7, x0 - 0.18, 0.82);
      g.quadraticCurveTo(x0 - 0.27, 0.95, x0 - 0.36, 0.95);
    }
    g.closePath();
    g.fill();
    cut(g, () => {
      ellipse(g, -0.26, -0.22, 0.12, 0.18);
      ellipse(g, 0.26, -0.22, 0.12, 0.18);
      ellipse(g, 0, 0.18, 0.12, 0.14);
    });
  },
  skull: (g) => {
    circle(g, 0, -0.18, 0.78);
    roundRect(g, -0.46, 0.3, 0.92, 0.62, 0.12);
    cut(g, () => {
      circle(g, -0.3, -0.12, 0.2);
      circle(g, 0.3, -0.12, 0.2);
      poly(g, [[0, 0.12], [0.11, 0.34], [-0.11, 0.34]]);
      for (const x of [-0.22, 0, 0.22]) g.fillRect(x - 0.03, 0.6, 0.06, 0.32);
    });
  },
  smile: (g) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => {
      ellipse(g, -0.32, -0.26, 0.11, 0.17);
      ellipse(g, 0.32, -0.26, 0.11, 0.17);
      g.lineWidth = 0.13;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0.02, 0.55, 0.18 * Math.PI, 0.82 * Math.PI);
      g.stroke();
    });
  },
  wink: (g) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => {
      line(g, 0.11, [-0.46, -0.24], [-0.32, -0.3], [-0.18, -0.24]);
      ellipse(g, 0.32, -0.26, 0.11, 0.17);
      g.lineWidth = 0.13;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0.02, 0.55, 0.18 * Math.PI, 0.82 * Math.PI);
      g.stroke();
    });
  },
  sad: (g) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => {
      ellipse(g, -0.32, -0.26, 0.11, 0.17);
      ellipse(g, 0.32, -0.26, 0.11, 0.17);
      g.lineWidth = 0.13;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0.8, 0.45, 1.22 * Math.PI, 1.78 * Math.PI);
      g.stroke();
    });
  },
  cool: (g) => {
    circle(g, 0, 0, 0.95);
    cut(g, () => {
      ellipse(g, -0.35, -0.2, 0.3, 0.2);
      ellipse(g, 0.35, -0.2, 0.3, 0.2);
      g.fillRect(-0.85, -0.3, 1.7, 0.08);
      g.lineWidth = 0.12;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-0.3, 0.42);
      g.quadraticCurveTo(0.15, 0.55, 0.42, 0.3);
      g.stroke();
    });
    // Glints on the lenses.
    line(g, 0.05, [-0.5, -0.27], [-0.42, -0.2]);
    line(g, 0.05, [0.2, -0.27], [0.28, -0.2]);
  },
  eye: (g) => {
    g.fillStyle = '#ffffff';
    circle(g, 0, 0, 0.95);
    g.fillStyle = '#111111';
    circle(g, 0.12, 0.08, 0.5);
    g.fillStyle = '#ffffff';
    circle(g, 0.3, -0.12, 0.13);
  },
};

// Draw sticker `id` (in -1..1 space). Returns false for an unknown id.
export function drawSticker(g, id, text = '') {
  const fn = DRAW[id];
  if (!fn) return false;
  g.save();
  fn(g, text);
  g.restore();
  return true;
}

export const STICKER_IDS = STICKERS.flatMap((s) => s.items.map(([id]) => id));
