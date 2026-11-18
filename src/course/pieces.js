import { Vector3 } from 'three';
import { deg } from './frame.js';
import { MARBLE } from '../config.js';
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

export const TYPES = {
  start: { label: 'Start ramp', module: start, noInput: true, fields: [f('len', 'Length', 'len', 1.5, 5, 0.1, 3)] },
  straight: {
    label: 'Straight', module: straight,
    fields: [f('len', 'Length', 'len', 0.3, 8, 0.1, 2), f('pitch', 'Slope', 'deg', -30, 5, 0.5, null)],
  },
  curve: {
    label: 'Curve', module: curve,
    fields: [
      f('radius', 'Radius', 'len', 0.4, 4, 0.05, 1.5),
      f('angle', 'Angle (+ left)', 'deg', -270, 270, 5, 90),
      f('pitch', 'Slope', 'deg', -20, 5, 0.5, null),
    ],
  },
  pegField: { label: 'Peg field', module: pegField, fields: [f('len', 'Length', 'len', 1.5, 6, 0.1, 3.2), f('width', 'Width', 'len', 1, 3, 0.1, 2.2)] },
  funnel: { label: 'Funnel', module: funnel, fields: [SIDE(), f('exitTurn', 'Exit turn', 'deg', -180, 180, 5, 0), f('rim', 'Rim radius', 'len', 1, 2.5, 0.05, 1.5)] },
  loop: { label: 'Loop', module: loop, fields: [f('radius', 'Radius', 'len', 0.4, 0.8, 0.01, 0.55), f('gap', 'Bypass gap', 'len', 0.2, 0.5, 0.01, 0.34)] },
  halfPipe: {
    label: 'Half-pipe', module: halfPipe,
    fields: [
      SIDE(), f('len', 'Length', 'len', 3, 10, 0.1, 7), f('radius', 'Radius', 'len', 0.6, 1.6, 0.05, 1.1),
      f('angle', 'Entry angle', 'deg', 0, 60, 1, 30),
      f('leadLen', 'Lead-in length', 'len', 0.4, 3, 0.05, 1.0),
      f('leadPitch', 'Lead-in slope', 'deg', -25, 5, 0.5, -2.86),
      f('leadTurn', 'Lead-in turn (+ left)', 'deg', -90, 90, 5, 0),
    ],
  },
  splitter: { label: 'Splitter', module: splitter, fields: [SIDE(-1), f('leg', 'Detour leg', 'len', 0.3, 2, 0.05, 0.8)] },
  winding: { label: 'Winding', module: winding, fields: [f('pitch', 'Slope', 'deg', -10, 0, 0.5, -3.5), f('straight', 'Straights', 'len', 0, 2, 0.05, 0.5)] },
  valley: {
    label: 'Valley', module: valley,
    fields: [
      f('steep', 'Drop slope', 'num', 20, 70, 1, 48),
      f('climb', 'Climb slope', 'num', 10, 50, 1, 34),
      f('bottom', 'Middle length', 'len', 0.2, 5, 0.1, 1.0),
      f('rise', 'Crest rise', 'len', 0.8, 4, 0.05, null),
    ],
  },
  dropCatch: { label: 'Drop and catch', module: dropCatch, fields: [f('gap', 'Gap', 'len', 0.5, 1.4, 0.01, 0.91), f('drop', 'Drop', 'len', 0.3, 1, 0.01, 0.6)] },
  bumpyRoad: { label: 'Bumpy road', module: bumpyRoad, fields: [f('len', 'Length', 'len', 1.5, 6, 0.1, 3.4)] },
  spiral: {
    label: 'Spiral', module: spiral,
    fields: [
      SIDE(), f('turns', 'Turns', 'num', 0.5, 5, 0.25, 2.75), f('radius', 'Radius', 'len', 0.7, 2, 0.05, 1.0),
      f('pitch', 'Steepness', 'deg', -20, -3, 0.5, -8.5),
      f('tunnel', 'Tunnel (closed)', 'bool'),
    ],
  },
  bouncyPads: { label: 'Bouncy pads', module: bouncyPads, fields: [] },
  bigJump: { label: 'Big jump', module: bigJump, fields: [SIDE(), f('kick', 'Kicker angle', 'num', 10, 35, 1, 22)] },
  bottleneck: {
    label: 'Bottleneck', module: bottleneck,
    fields: [SIDE(), f('gap', 'Throat width', 'len', +(MARBLE.radius * 2.15).toFixed(3), 0.6, 0.01, +(MARBLE.radius * 2.6).toFixed(3))],
  },
  fork: { label: 'Fork (2 outputs)', module: fork, fields: [f('len', 'Length', 'len', 1, 3, 0.1, 1.5)] },
  merge: { label: 'Merge (2 inputs)', module: merge, fields: [f('len', 'Length', 'len', 1, 3, 0.1, 1.7)] },
  finish: { label: 'Finish', module: finish, noOutput: true, fields: [] },
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
};
export const LAYOUTS = ['full', ...Object.keys(SINGLE)];

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
