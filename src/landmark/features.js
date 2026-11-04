// Landmark sequence -> fixed-length feature matrix for the INCLUDE-50 classifier.
// This must stay identical to the Python training features (see the parity test).
//
// A frame is { hands: [slot0, slot1], pose }, where each hand slot is an array of 21
// normalized {x, y, z} points or null, and pose is an array of 33 points or null.
// Slot 0 holds the hand MediaPipe labels "Left", slot 1 the hand labelled "Right".
//
// Per frame (FRAME_F = 204):
//   [0, 34)    pose points 0..16 (face, shoulders, elbows, wrists), xy, body frame
//   [34, 118)  both hand slots, 21 points xy each, body frame
//   [118, 202) both hand slots, hand frame (wrist origin, wrist to middle knuckle = 1)
//   [202, 204) hand presence flags
// Body frame: pixel coordinates centred on the clip-median shoulder midpoint and divided by
// the clip-median shoulder width. After sampling T frames, the frame-to-frame difference of
// the 118 body-frame values is appended, giving F = 322 values per time step.

export const T = 48;
const POSE_IDX = 17;
export const FRAME_F = POSE_IDX * 2 + 84 + 84 + 2;
const BODY_F = POSE_IDX * 2 + 84;
export const F = FRAME_F + BODY_F;

const hasHand = (frame) => frame.hands[0] !== null || frame.hands[1] !== null;

export function trimRange(frames) {
  let start = -1;
  let end = -1;
  frames.forEach((f, i) => {
    if (hasHand(f)) {
      if (start < 0) start = i;
      end = i + 1;
    }
  });
  return start < 0 ? [0, frames.length] : [start, end];
}

export function sampleIndices(start, end, t = T) {
  const n = end - start;
  const out = new Int32Array(t);
  if (n <= 0) return out.fill(start);
  if (t === 1) return out.fill(start);
  for (let i = 0; i < t; i++) out[i] = start + Math.floor((i * (n - 1)) / (t - 1) + 0.5);
  return out;
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function clipFrameRef(frames, width, height) {
  const mx = [];
  const my = [];
  const dist = [];
  for (const f of frames) {
    if (!f.pose) continue;
    const l = f.pose[11];
    const r = f.pose[12];
    const lx = l.x * width, ly = l.y * height, rx = r.x * width, ry = r.y * height;
    mx.push((lx + rx) / 2);
    my.push((ly + ry) / 2);
    dist.push(Math.sqrt((lx - rx) ** 2 + (ly - ry) ** 2));
  }
  if (!mx.length) return [width / 2, height / 2, height / 3];
  let sc = median(dist);
  if (!(sc > 1e-6)) sc = height / 3;
  return [median(mx), median(my), sc];
}

const finite = (v) => (Number.isFinite(v) ? v : 0);

export function frameFeatures(frame, width, height, [cx, cy, sc], out = new Float64Array(FRAME_F)) {
  out.fill(0);
  if (frame.pose) {
    for (let k = 0; k < POSE_IDX; k++) {
      out[2 * k] = finite((frame.pose[k].x * width - cx) / sc);
      out[2 * k + 1] = finite((frame.pose[k].y * height - cy) / sc);
    }
  }
  for (let s = 0; s < 2; s++) {
    const pts = frame.hands[s];
    if (!pts) continue;
    const wx = pts[0].x * width, wy = pts[0].y * height;
    let hs = Math.sqrt((pts[9].x * width - wx) ** 2 + (pts[9].y * height - wy) ** 2);
    if (!(hs > 1e-6)) hs = 1;
    for (let k = 0; k < 21; k++) {
      const px = pts[k].x * width, py = pts[k].y * height;
      out[34 + 42 * s + 2 * k] = finite((px - cx) / sc);
      out[34 + 42 * s + 2 * k + 1] = finite((py - cy) / sc);
      out[118 + 42 * s + 2 * k] = finite((px - wx) / hs);
      out[118 + 42 * s + 2 * k + 1] = finite((py - wy) / hs);
    }
    out[202 + s] = 1;
  }
  return out;
}

// Returns a Float32Array of length T * F (row-major, T rows of F values).
export function buildFeatures(frames, width, height, t = T) {
  const x = new Float32Array(t * F);
  if (!frames.length) return x;
  const [s, e] = trimRange(frames);
  const ref = clipFrameRef(frames.slice(s, e), width, height);
  const idx = sampleIndices(s, e, t);
  const row = new Float64Array(FRAME_F);
  const prev = new Float64Array(BODY_F);
  for (let i = 0; i < t; i++) {
    frameFeatures(frames[idx[i]], width, height, ref, row);
    const o = i * F;
    for (let j = 0; j < FRAME_F; j++) x[o + j] = row[j];
    for (let j = 0; j < BODY_F; j++) {
      x[o + FRAME_F + j] = i === 0 ? 0 : row[j] - prev[j];
      prev[j] = row[j];
    }
  }
  return x;
}

// True when a hand is raised into signing space. Resting hands are often still visible at
// the bottom of the frame; in INCLUDE the resting wrist sits about 1.6 shoulder widths below
// the shoulder line, against about 0.1 in the middle of a sign.
export const REST_WRIST_Y = 1.35;

export function isSigning(frame, width, height) {
  if (!frame.pose) return frame.hands[0] !== null || frame.hands[1] !== null;
  const l = frame.pose[11];
  const r = frame.pose[12];
  const cy = ((l.y + r.y) / 2) * height;
  const sc = Math.hypot((l.x - r.x) * width, (l.y - r.y) * height) || height / 3;
  return frame.hands.some((pts) => pts !== null && (pts[0].y * height - cy) / sc < REST_WRIST_Y);
}
