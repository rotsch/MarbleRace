import { Vector3, Quaternion, Matrix4 } from 'three';
import { TRACK } from '../config.js';

// A frame is a pose on the course: position + heading (yaw), slope (pitch,
// negative = downhill) and sideways tilt (bank, positive = left side lower).
// F = forward, L = left, U = up (surface normal). Local coords are (x=L, y=U, z=F).
export function makeFrame(pos, yaw, pitch = 0, bank = 0) {
  const cp = Math.cos(pitch);
  const F = new Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  const L0 = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const U0 = new Vector3().crossVectors(F, L0);
  const cb = Math.cos(bank), sb = Math.sin(bank);
  const L = L0.clone().multiplyScalar(cb).addScaledVector(U0, -sb);
  const U = U0.clone().multiplyScalar(cb).addScaledVector(L0, sb);
  return { pos: pos.clone(), yaw, pitch, bank, F, L, U, d: 0 };
}

export function framePoint(f, x = 0, y = 0, z = 0) {
  return f.pos.clone().addScaledVector(f.L, x).addScaledVector(f.U, y).addScaledVector(f.F, z);
}

export function frameQuat(f) {
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(f.L, f.U, f.F));
}

// Same position/heading, different pitch (and no bank).
export function reframe(f, { pitch = f.pitch, yaw = f.yaw, pos = f.pos } = {}) {
  return makeFrame(pos, yaw, pitch, 0);
}

const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

// Turtle-style path tracing. Each segment: { len, turn, pitch, bank }.
//  len   horizontal length
//  turn  total yaw change over the segment (positive = left)
//  pitch slope angle reached at the end of the segment (blended smoothly)
//  bank  peak bank angle, eased in and out
// Returns frames sampled every ~step, including the start frame. frame.d is
// the horizontal distance travelled from the start.
export function tracePath(start, segments, step = TRACK.step) {
  const frames = [makeFrame(start.pos, start.yaw, start.pitch, 0)];
  const pos = start.pos.clone();
  let yaw = start.yaw;
  let pitch = start.pitch;
  let d = 0;
  for (const seg of segments) {
    const turn = seg.turn || 0;
    const p0 = pitch;
    const p1 = seg.pitch === undefined ? pitch : seg.pitch;
    const bank = seg.bank || 0;
    const slope = p0 < 0 && p1 < 0 ? Math.tan(Math.min(-p0, -p1)) : 0;
    const bankRate = (0.8 * slope) / (TRACK.width / 2);
    const n = Math.max(1, Math.ceil(seg.len / step));
    const ds = seg.len / n;
    for (let i = 1; i <= n; i++) {
      const um = (i - 0.5) / n;
      const u = i / n;
      const ym = yaw + turn * um;
      const pm = lerp(p0, p1, smooth(um));
      pos.x += Math.sin(ym) * ds;
      pos.y += Math.tan(pm) * ds;
      pos.z += Math.cos(ym) * ds;
      d += ds;
      // Bank ramps in and out linearly, no faster than the slope allows:
      // twisting the floor tips one edge uphill by (half width * twist rate),
      // and that must stay below the downhill slope or slow marbles would
      // find a pocket at the edge of the track.
      const b = Math.sign(bank) * Math.min(Math.abs(bank), bankRate * u * seg.len, bankRate * (1 - u) * seg.len);
      const f = makeFrame(pos, yaw + turn * u, lerp(p0, p1, smooth(u)), b);
      f.d = d;
      frames.push(f);
    }
    yaw += turn;
    pitch = p1;
  }
  return frames;
}

export const arc = (radius, angle, extra = {}) => ({ len: radius * Math.abs(angle), turn: angle, ...extra });

// Two opposite arcs that move the path sideways by `shift` (positive = left)
// while advancing `advance`, ending on the original heading.
export function sShift(shift, advance, extra = {}) {
  if (Math.abs(shift) < 1e-6) return [{ len: advance, ...extra }];
  const theta = 2 * Math.atan(Math.abs(shift) / advance);
  const r = advance / (2 * Math.sin(theta));
  const s = Math.sign(shift);
  return [
    { len: r * theta, turn: s * theta, ...extra },
    { len: r * theta, turn: -s * theta, ...extra },
  ];
}

export const pathLength = (segments) => segments.reduce((a, s) => a + s.len, 0);
export const lastFrame = (frames) => frames[frames.length - 1];
export const deg = (a) => (a * Math.PI) / 180;
