import { Vector3 } from 'three';
import { deg } from './frame.js';
import { MARBLE, TRACK } from '../config.js';
import * as start from './sections/start.js';
import * as straight from './sections/straight.js';
import * as curve from './sections/curve.js';
import * as pegField from './sections/pegField.js';
import * as funnel from './sections/funnel.js';
import * as splitter from './sections/splitter.js';
import * as dropCatch from './sections/dropCatch.js';
import * as bumpyRoad from './sections/bumpyRoad.js';
import * as loop from './sections/loop.js';
import * as halfPipe from './sections/halfPipe.js';
import * as spiral from './sections/spiral.js';
import * as bouncyPads from './sections/bouncyPads.js';
import * as bottleneck from './sections/bottleneck.js';
import * as finish from './sections/finish.js';
import * as winding from './sections/winding.js';
import * as valley from './sections/valley.js';
import * as bigJump from './sections/bigJump.js';
import * as fork from './sections/fork.js';
import * as merge from './sections/merge.js';
import * as stairs from './sections/stairs.js';
import * as bumpers from './sections/bumpers.js';
import * as waves from './sections/waves.js';
import * as splitter3 from './sections/splitter3.js';
import * as wallRide from './sections/wallRide.js';
import * as railRun from './sections/railRun.js';
import * as chicane from './sections/chicane.js';
import * as skiJump from './sections/skiJump.js';
import * as corkscrew from './sections/corkscrew.js';
import * as tunnelDrop from './sections/tunnelDrop.js';

// The course as data: placed pieces and the links between their sockets.
//
//  { version: 1,
//    pieces: [{ id, type, name, opts, pose? }],
//    links:  [{ from: [pieceId, outIndex], to: [pieceId, inIndex] }] }
//
// A piece whose first input (in 0) is linked starts where the linked output
// ends, so moving or retuning a piece carries everything linked after it.
// A piece with no link into in 0 is free and starts at its `pose`
// ({ pos: [x, y, z], yaw, pitch }, course coordinates before the course is
// lifted onto the floor).
//
// Sockets are poses on the track floor, on the centre line: in 0 is the
// piece's entry, outputs are the pose(s) its build returns (one frame, or
// { exits: [...] }); extra inputs come from ctx.addSocket('in', frame).

export const COURSE_VERSION = 1;

// Editable options. kind: 'len' (course units), 'deg' (stored in radians,
// shown in degrees), 'num' (plain number; the valley's slopes are in
// degrees), 'side' (1 = left, -1 = right), 'bool' (on / off).
const f = (key, label, kind, min, max, step, def) => ({ key, label, kind, min, max, step, def });
const SIDE = (def = 1) => f('side', 'Side', 'side', -1, 1, 2, def);

// Each type sits in a group of the editor's piece list (`group`).
export const GROUPS = ['Track', 'Bends', 'Hills and drops', 'Obstacles', 'Jumps', 'Splits and catches', 'Start and finish'];

export const TYPES = {
  // Track
  straight: {
    label: 'Straight', group: 'Track', module: straight,
    fields: [f('len', 'Length', 'len', 0.3, 8, 0.1, 2), f('pitch', 'Slope', 'deg', -30, 5, 0.5, null)],
  },
  stairs: {
    label: 'Stairs', group: 'Track', module: stairs,
    fields: [
      f('steps', 'Steps', 'num', 1, 12, 1, 6),
      f('tread', 'Tread length', 'len', 0.3, 1.5, 0.05, 0.6),
      f('rise', 'Step height', 'len', 0.05, 0.4, 0.01, 0.15),
      f('pitch', 'Tread slope', 'deg', -20, -3, 0.5, -8),
    ],
  },
  railRun: {
    label: 'Gutter rails', group: 'Track', module: railRun,
    fields: [
      f('len', 'Rail length', 'len', 1, 6, 0.1, 3),
      f('pitch', 'Slope', 'deg', -15, -2, 0.5, -6),
      f('gap', 'Rail spacing', 'len', 0.08, 0.17, 0.005, 0.12),
      f('drop', 'Catch tray below', 'len', 0.4, 1, 0.05, 0.5),
      f('entryWidth', 'Entry width', 'len', +(MARBLE.radius * 2 + 0.02).toFixed(2), TRACK.width, 0.01, +(MARBLE.radius * 2 + 0.06).toFixed(2)),
    ],
  },
  // Bends
  curve: {
    label: 'Curve', group: 'Bends', module: curve,
    fields: [
      f('radius', 'Radius', 'len', 0.4, 4, 0.05, 1.5),
      f('angle', 'Angle (+ left)', 'deg', -270, 270, 5, 90),
      f('pitch', 'Slope', 'deg', -20, 5, 0.5, null),
    ],
  },
  winding: { label: 'Winding', group: 'Bends', module: winding, fields: [f('pitch', 'Slope', 'deg', -10, 0, 0.5, -3.5), f('straight', 'Straights', 'len', 0, 2, 0.05, 0.5)] },
  wallRide: {
    label: 'Wall ride', group: 'Bends', module: wallRide,
    fields: [
      f('angle', 'Angle (+ left)', 'deg', -240, 240, 5, 150),
      f('radius', 'Radius', 'len', 0.5, 2.5, 0.05, 0.9),
      f('wall', 'Wall curve radius', 'len', 0.15, 0.8, 0.05, 0.45),
      f('height', 'Wall height', 'len', 0.4, 1.4, 0.05, 0.8),
      f('pitch', 'Slope', 'deg', -12, 0, 0.5, -5),
      f('leadLen', 'Run-in length', 'len', 0.4, 3, 0.1, 1.4),
      f('leadPitch', 'Run-in slope', 'deg', -30, -3, 0.5, -18),
    ],
  },
  chicane: {
    label: 'Chicane', group: 'Bends', module: chicane,
    fields: [
      SIDE(),
      f('radius', 'Radius', 'len', 0.4, 1.2, 0.05, 0.6),
      f('angle', 'Bend angle', 'deg', 30, 80, 5, 60),
      f('gap', 'Wall opening', 'len', 0, 1.5, 0.05, 0.5),
      f('drop', 'Catch tray below', 'len', 0.4, 1, 0.05, 0.55),
    ],
  },
  funnel: { label: 'Funnel', group: 'Bends', module: funnel, fields: [SIDE(), f('exitTurn', 'Exit turn', 'deg', -180, 180, 5, 0), f('rim', 'Rim radius', 'len', 1, 2.5, 0.05, 1.5)] },
  spiral: {
    label: 'Spiral', group: 'Bends', module: spiral,
    fields: [
      SIDE(), f('turns', 'Turns', 'num', 0.5, 5, 0.25, 2.75), f('radius', 'Radius', 'len', 0.7, 2, 0.05, 1.0),
      f('pitch', 'Steepness', 'deg', -20, -3, 0.5, -8.5),
      f('tunnel', 'Tunnel (closed)', 'bool'),
    ],
  },
  corkscrew: {
    label: 'Corkscrew', group: 'Bends', module: corkscrew,
    fields: [
      SIDE(),
      f('turns', 'Turns', 'num', 0.5, 3, 0.5, 1),
      f('radius', 'Winding radius', 'len', 0.1, 0.5, 0.05, 0.25),
      f('turnLen', 'Length per turn', 'len', 1.2, 4, 0.1, 2.0),
      f('brake', 'Brake bend radius (0 = none)', 'len', 0, 1, 0.05, 0.55),
    ],
  },
  halfPipe: {
    label: 'Half-pipe', group: 'Bends', module: halfPipe,
    fields: [
      SIDE(), f('len', 'Length', 'len', 3, 10, 0.1, 7), f('radius', 'Radius', 'len', 0.6, 1.6, 0.05, 1.1),
      f('angle', 'Entry angle', 'deg', 0, 60, 1, 30),
      f('leadLen', 'Lead-in length', 'len', 0.4, 3, 0.05, 1.0),
      f('leadPitch', 'Lead-in slope', 'deg', -25, 5, 0.5, -2.86),
      f('leadTurn', 'Lead-in turn (+ left)', 'deg', -90, 90, 5, 0),
    ],
  },
  // Hills and drops
  valley: {
    label: 'Valley', group: 'Hills and drops', module: valley,
    fields: [
      f('steep', 'Drop slope', 'num', 20, 70, 1, 48),
      f('climb', 'Climb slope', 'num', 10, 50, 1, 34),
      f('bottom', 'Middle length', 'len', 0.2, 5, 0.1, 1.0),
      f('rise', 'Crest rise', 'len', 0.8, 4, 0.05, null),
    ],
  },
  waves: {
    label: 'Wave track', group: 'Hills and drops', module: waves,
    fields: [
      f('waves', 'Waves', 'num', 1, 8, 1, 3),
      f('depth', 'Dip depth', 'len', 0.15, 1, 0.05, 0.45),
      f('drop', 'Each crest lower by', 'len', 0.05, 0.5, 0.01, 0.15),
      f('down', 'Fall slope', 'num', 10, 50, 1, 30),
      f('up', 'Climb slope', 'num', 10, 45, 1, 25),
    ],
  },
  tunnelDrop: {
    label: 'Tunnel drop', group: 'Hills and drops', module: tunnelDrop,
    fields: [f('depth', 'Drop depth', 'len', 0.3, 4, 0.1, 1.2), f('exitTurn', 'Exit turn (+ left)', 'deg', -180, 180, 5, 0)],
  },
  // Obstacles
  pegField: { label: 'Peg field', group: 'Obstacles', module: pegField, fields: [f('len', 'Length', 'len', 1.5, 6, 0.1, 3.2), f('width', 'Width', 'len', 1, 3, 0.1, 2.2)] },
  bumpers: {
    label: 'Pinball bumpers', group: 'Obstacles', module: bumpers,
    fields: [
      f('len', 'Table length', 'len', 1.5, 6, 0.1, 3.2),
      f('width', 'Table width', 'len', 1.4, 3.5, 0.1, 2.4),
      f('radius', 'Bumper radius', 'len', 0.06, 0.3, 0.01, 0.14),
      f('pitch', 'Slope', 'deg', -20, -5, 0.5, -11),
    ],
  },
  bumpyRoad: { label: 'Bumpy road', group: 'Obstacles', module: bumpyRoad, fields: [f('len', 'Length', 'len', 1.5, 6, 0.1, 3.4)] },
  bottleneck: {
    label: 'Bottleneck', group: 'Obstacles', module: bottleneck,
    fields: [SIDE(), f('gap', 'Throat width', 'len', +(MARBLE.radius * 2.15).toFixed(3), 0.6, 0.01, +(MARBLE.radius * 2.6).toFixed(3))],
  },
  loop: { label: 'Loop', group: 'Obstacles', module: loop, fields: [f('radius', 'Radius', 'len', 0.4, 0.8, 0.01, 0.55), f('gap', 'Bypass gap', 'len', 0.2, 0.5, 0.01, 0.34)] },
  // Jumps
  skiJump: {
    label: 'Ski jump', group: 'Jumps', module: skiJump,
    fields: [
      f('inLen', 'In-run length', 'len', 0.5, 3, 0.1, 1.4),
      f('inPitch', 'In-run slope', 'deg', -40, -10, 0.5, -28),
      f('table', 'Take-off angle', 'deg', -20, 5, 0.5, -8),
      f('hillLen', 'Landing hill length', 'len', 0.8, 3.5, 0.1, 1.6),
      f('hillPitch', 'Landing hill slope', 'deg', -45, -20, 0.5, -34),
      f('brake', 'Brake bend radius (0 = none)', 'len', 0, 1, 0.05, 0.55),
    ],
  },
  bigJump: { label: 'Big jump', group: 'Jumps', module: bigJump, fields: [SIDE(), f('kick', 'Kicker angle', 'num', 10, 35, 1, 22)] },
  dropCatch: { label: 'Drop and catch', group: 'Jumps', module: dropCatch, fields: [f('gap', 'Gap', 'len', 0.5, 1.4, 0.01, 0.91), f('drop', 'Drop', 'len', 0.3, 1, 0.01, 0.6)] },
  bouncyPads: { label: 'Bouncy pads', group: 'Jumps', module: bouncyPads, fields: [] },
  // Splits and catches
  fork: { label: 'Fork (2 outputs)', group: 'Splits and catches', module: fork, fields: [f('len', 'Length', 'len', 1, 3, 0.1, 1.5)] },
  merge: { label: 'Merge (2 inputs)', group: 'Splits and catches', module: merge, fields: [f('len', 'Length', 'len', 1, 3, 0.1, 1.7)] },
  splitter: { label: 'Splitter', group: 'Splits and catches', module: splitter, fields: [SIDE(-1), f('leg', 'Detour leg', 'len', 0.3, 2, 0.05, 0.8)] },
  splitter3: {
    label: 'Three-way splitter', group: 'Splits and catches', module: splitter3,
    fields: [
      f('radius', 'Loop radius', 'len', 0.8, 1.6, 0.05, 1.0),
      f('leftLeg', 'Left loop leg', 'len', 0, 2.5, 0.05, 0.5),
      f('rightLeg', 'Right loop leg', 'len', 0, 2.5, 0.05, 1.2),
      f('tipGap', 'Divider point spacing', 'len', 0.1, 1.3, 0.05, 0.6),
    ],
  },
  // Start and finish
  start: { label: 'Start ramp', group: 'Start and finish', module: start, noInput: true, fields: [f('len', 'Length', 'len', 1.5, 5, 0.1, 3)] },
  finish: { label: 'Finish', group: 'Start and finish', module: finish, noOutput: true, fields: [] },
};

// Today's course and the single-section test layouts, as data. Every piece
// is linked to the one before it.
function chain(list, pose) {
  const pieces = list.map(([name, type, opts = {}], i) => ({ id: `p${i + 1}`, type, name, opts }));
  pieces[0].pose = pose;
  const links = pieces.slice(1).map((p, i) => ({ from: [pieces[i].id, 0], to: [p.id, 0] }));
  return { version: COURSE_VERSION, pieces, links };
}

const SINGLE = {
  pegField: ['pegField'],
  funnel: ['funnel', { side: 1 }],
  loop: ['loop'],
  halfPipe: ['halfPipe', { side: 1 }],
  splitter: ['splitter', { side: -1 }],
  dropCatch: ['dropCatch'],
  bumpyRoad: ['bumpyRoad'],
  spiral: ['spiral', { side: 1 }],
  bouncyPads: ['bouncyPads'],
  bottleneck: ['bottleneck'],
  winding: ['winding'],
  valley: ['valley'],
  bigJump: ['bigJump'],
  stairs: ['stairs'],
  bumpers: ['bumpers'],
  waves: ['waves'],
  splitter3: ['splitter3'],
  wallRide: ['wallRide'],
  railRun: ['railRun'],
  chicane: ['chicane'],
  skiJump: ['skiJump'],
  corkscrew: ['corkscrew'],
  tunnelDrop: ['tunnelDrop'],
};
export const LAYOUTS = ['full', 'classic', ...Object.keys(SINGLE)];

export function defaultCourse(layout = 'full') {
  const pose = { pos: [0, 0, 0], yaw: 0, pitch: deg(-8) };
  if (SINGLE[layout]) {
    const [type, opts] = SINGLE[layout];
    return chain([
      ['Start', 'start', { len: 2.6 }],
      ['Run-in', 'straight', { len: 1.5, pitch: deg(-6) }],
      [layout, type, opts],
      ['Finish', 'finish'],
    ], pose);
  }
  // Two sharp unbanked bends back to back. Marbles bounce off the outer
  // walls, which is the main way speed is shed between the fast sections.
  const sBend = (name, dir, pitch = -4) => [
    [name, 'curve', { radius: 0.55, angle: deg(75 * dir), pitch: deg(pitch), bank: 0, rail: 0.65 }],
    [name, 'curve', { radius: 0.55, angle: deg(-75 * dir), pitch: deg(pitch), bank: 0, rail: 0.65 }],
  ];
  if (layout === 'classic') return classicCourse(pose, sBend);
  // Every piece type once (fork and merge as a pair), the fast ones followed
  // by brake bends. Bends alternate left and right so the course stays in a
  // band instead of curling back over itself.
  const data = chain([
    ['Start', 'start', { len: 2.6 }],
    ['Peg field', 'pegField'],
    ['Curve 1', 'curve', { radius: 1.6, angle: deg(-70), pitch: deg(-4) }],
    ['Stairs', 'stairs'],
    ['Funnel', 'funnel', { side: 1, exitTurn: deg(50) }],
    ['Pinball bumpers', 'bumpers'],
    ['Loop', 'loop'],
    ...sBend('S-bend 1', 1),
    ['Half-pipe', 'halfPipe', { side: 1 }],
    ['Splitter', 'splitter', { side: -1 }],
    ['Gutter rails', 'railRun'],
    ['Winding 1', 'winding', { bends: [[1.7, 80], [1.4, -130], [1.5, 120], [1.6, -90], [1.8, 60]] }],
    ['Valley', 'valley'],
    ['Curve 2', 'curve', { radius: 1.6, angle: deg(60), pitch: deg(-4) }],
    ['Wave track', 'waves'],
    ['Drop and catch', 'dropCatch'],
    ...sBend('S-bend 2', -1),
    ['Chicane', 'chicane', { side: 1 }],
    ['Bumpy road', 'bumpyRoad'],
    ...sBend('S-bend 3', 1),
    ['Spiral', 'spiral', { side: 1 }],
    ['Wall ride', 'wallRide', { angle: deg(-150) }],
    ['Bouncy pads', 'bouncyPads'],
    ...sBend('S-bend 4', 1),
    ['Three-way splitter', 'splitter3'],
    ['Ski jump', 'skiJump'],
    ['Curve 3', 'curve', { radius: 1.5, angle: deg(70), pitch: deg(-4) }],
    ['Corkscrew', 'corkscrew', { side: -1 }],
    ['Fork', 'fork'],
    ['Left route', 'straight', { len: 1.6, pitch: deg(-5) }],
    ['Merge', 'merge'],
    ['Big jump', 'bigJump', { side: -1 }],
    ...sBend('S-bend 5', -1),
    ['Tunnel drop', 'tunnelDrop', { exitTurn: deg(-60) }],
    ['Winding 2', 'winding', { bends: [[1.5, -100], [1.6, 120], [1.4, -110], [1.7, 90]] }],
    ['Curve 4', 'curve', { radius: 1.4, angle: deg(-50), pitch: deg(-4), rail: 0.6 }],
    ['Bottleneck', 'bottleneck'],
    ['Finish', 'finish'],
  ], pose);
  // The fork's second output: a matching straight into the merge's second input.
  const id = (name) => data.pieces.find((p) => p.name === name).id;
  const right = { id: `p${data.pieces.length + 1}`, type: 'straight', name: 'Right route', opts: { len: 1.6, pitch: deg(-5) } };
  data.pieces.splice(data.pieces.findIndex((p) => p.name === 'Left route') + 1, 0, right);
  data.links.push({ from: [id('Fork'), 1], to: [right.id, 0] }, { from: [right.id, 0], to: [id('Merge'), 1] });
  return data;
}

// The course before the newer pieces: ?layout=classic.
function classicCourse(pose, sBend) {
  return chain([
    ['Start', 'start', { len: 2.6 }],
    ['Peg field', 'pegField'],
    ['Curve 1', 'curve', { radius: 1.6, angle: deg(-70), pitch: deg(-4) }],
    ['Funnel', 'funnel', { side: 1, exitTurn: deg(50) }],
    ['Loop', 'loop'],
    ...sBend('S-bend 1', 1),
    ['Half-pipe', 'halfPipe', { side: 1 }],
    ['Splitter', 'splitter', { side: -1 }],
    ['Winding 1', 'winding', { bends: [[1.7, 80], [1.4, -130], [1.5, 120], [1.6, -90], [1.8, 60]] }],
    ['Valley', 'valley'],
    ['Curve 2', 'curve', { radius: 1.6, angle: deg(60), pitch: deg(-4) }],
    ['Drop and catch', 'dropCatch'],
    ...sBend('S-bend 2', -1),
    ['Bumpy road', 'bumpyRoad'],
    ...sBend('S-bend 3', 1),
    ['Spiral', 'spiral', { side: 1 }],
    ['Bouncy pads', 'bouncyPads'],
    ...sBend('S-bend 4', 1),
    ['Big jump', 'bigJump', { side: -1 }],
    ...sBend('S-bend 5', -1),
    ['Winding 2', 'winding', { bends: [[1.5, -100], [1.6, 120], [1.4, -110], [1.7, 90]] }],
    ['Curve 3', 'curve', { radius: 1.4, angle: deg(-50), pitch: deg(-4), rail: 0.6 }],
    ['Bottleneck', 'bottleneck'],
    ['Finish', 'finish'],
  ], pose);
}

export const clone = (data) => JSON.parse(JSON.stringify(data));

// An option value kept within its field's range (deg fields: the range is in
// degrees, the value in radians). Values out of range, from typing, an
// imported file or an older saved course, would otherwise build absurd or
// endless track (a 90 degree drop falls forever).
export function clampOption(field, v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || field.min === undefined || field.kind === 'side') return v;
  const k = field.kind === 'deg' ? Math.PI / 180 : 1;
  return Math.min(field.max * k, Math.max(field.min * k, v));
}

function safeOpts(type, opts = {}) {
  const out = { ...opts };
  for (const f of type.fields ?? []) if (f.key in out) out[f.key] = clampOption(f, out[f.key]);
  return out;
}

// Link lookups: which output feeds a piece's input, and which inputs an
// output feeds.
export function linkMaps(data) {
  const into = new Map(); // `${id}:${in}` -> [fromId, out]
  const from = new Map(); // `${id}:${out}` -> [[toId, in], ...]
  for (const l of data.links) {
    into.set(`${l.to[0]}:${l.to[1]}`, l.from);
    const k = `${l.from[0]}:${l.from[1]}`;
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(l.to);
  }
  return { into, from };
}

// Build every piece into the course context. Pieces are built from each
// free piece (no link into in 0) along the links, depth first and outputs in
// order, so the recorded centre line runs in race order.
export function buildFromData(ctx, data) {
  const byId = new Map(data.pieces.map((p) => [p.id, p]));
  const { into, from } = linkMaps(data);
  const built = new Set();
  const visit = (piece, entry) => {
    if (built.has(piece.id)) return;
    built.add(piece.id);
    const type = TYPES[piece.type];
    if (!type) throw new Error(`unknown piece type "${piece.type}"`);
    // The centre line carries on from the piece this one is linked to.
    const up = into.get(`${piece.id}:0`);
    ctx.pathFrom = up ? ctx.pieces.get(up[0])?.lastPath ?? null : null;
    if (ctx.sectionName !== piece.name) ctx.section(piece.name);
    ctx.beginPiece(piece, entry, type);
    const result = type.module.build(ctx, entry, safeOpts(type, piece.opts));
    const exits = type.noOutput ? [] : result?.exits ?? [result];
    ctx.endPiece(exits);
    exits.forEach((exit, i) => {
      for (const [toId, inIdx] of from.get(`${piece.id}:${i}`) ?? []) {
        const next = byId.get(toId);
        if (next && inIdx === 0) visit(next, exit);
      }
    });
  };
  for (const p of data.pieces) {
    if (into.has(`${p.id}:0`)) continue;
    visit(p, poseEntry(p.pose));
  }
  // Anything left belongs to a loop of links with no free piece: build it
  // where its pose says, so it at least shows up.
  for (const p of data.pieces) if (!built.has(p.id)) visit(p, poseEntry(p.pose));
  ctx.setLinks(data.links);
}

function poseEntry(pose = {}) {
  const [x = 0, y = 0, z = 0] = pose.pos ?? [];
  return { pos: new Vector3(x, y, z), yaw: pose.yaw ?? 0, pitch: pose.pitch ?? 0 };
}

// Problems an editor should show. Returns a list of messages.
export function validate(data) {
  const out = [];
  const starts = data.pieces.filter((p) => p.type === 'start');
  const finishes = data.pieces.filter((p) => p.type === 'finish');
  if (starts.length !== 1) out.push(`needs exactly one start (has ${starts.length})`);
  if (finishes.length !== 1) out.push(`needs exactly one finish (has ${finishes.length})`);
  for (const p of data.pieces) if (!TYPES[p.type]) out.push(`unknown piece type "${p.type}"`);
  return out;
}
