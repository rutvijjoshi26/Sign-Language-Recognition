// Parity test: the browser feature builder must match the Python training features.
// Run with: npm run test:landmark
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFeatures, sampleIndices, trimRange, T, F, FRAME_F } from "./features.js";

const cases = JSON.parse(readFileSync(new URL("./__fixtures__/features.json", import.meta.url)));

// Fixture arrays are flat with null for missing values; rebuild per-frame frames.
const toFrames = (c) => {
  const frames = [];
  for (let t = 0; t < c.frames; t++) {
    const hands = [0, 1].map((s) => {
      const pts = [];
      for (let k = 0; k < 21; k++) {
        const o = ((t * 2 + s) * 21 + k) * 3;
        const x = c.hands[o];
        if (x === null) return null;
        pts.push({ x, y: c.hands[o + 1], z: c.hands[o + 2] });
      }
      return pts;
    });
    let pose = [];
    for (let k = 0; k < 33; k++) {
      const o = (t * 33 + k) * 4;
      if (c.pose[o] === null) { pose = null; break; }
      pose.push({ x: c.pose[o], y: c.pose[o + 1], z: c.pose[o + 2] });
    }
    frames.push({ hands, pose });
  }
  return frames;
};

test("dimensions match the training code", () => {
  assert.equal(T, 48);
  assert.equal(FRAME_F, 204);
  assert.equal(F, 322);
});

test("sampleIndices matches the Python rounding", () => {
  assert.deepEqual(Array.from(sampleIndices(0, 3, 6)), [0, 0, 1, 1, 2, 2]);
});

test("trimRange falls back to the full clip when no hands are seen", () => {
  const frames = [{ hands: [null, null], pose: null }, { hands: [null, null], pose: null }];
  assert.deepEqual(trimRange(frames), [0, 2]);
});

for (const c of cases) {
  test(`features match Python for ${c.name}`, () => {
    const x = buildFeatures(toFrames(c), c.width, c.height);
    assert.equal(x.length, T * F);
    c.rows.forEach((r, i) => {
      for (let j = 0; j < F; j++) {
        const want = c.expected[i][j];
        const got = x[r * F + j];
        assert.ok(Math.abs(got - want) < 1e-3, `${c.name} row ${r} col ${j}: ${got} vs ${want}`);
      }
    });
  });
}

test("empty input gives a zero matrix", () => {
  const x = buildFeatures([], 640, 480);
  assert.equal(x.length, T * F);
  assert.ok(x.every((v) => v === 0));
});

test("isSigning: raised wrist counts, resting hands at the waist do not", async () => {
  const { isSigning } = await import("./features.js");
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  pose[11] = { x: 0.6, y: 0.4, z: 0 };
  pose[12] = { x: 0.4, y: 0.4, z: 0 }; // shoulder width 0.2 * 1000 px = 200 px
  const hand = (y) => Array.from({ length: 21 }, () => ({ x: 0.5, y, z: 0 }));
  // resting wrist 1.6 shoulder widths below the shoulders, raised wrist level with them
  assert.equal(isSigning({ hands: [hand(0.4 + (1.6 * 200) / 1000), null], pose }, 1000, 1000), false);
  assert.equal(isSigning({ hands: [null, hand(0.45)], pose }, 1000, 1000), true);
  assert.equal(isSigning({ hands: [null, null], pose }, 1000, 1000), false);
  // without a pose, any visible hand counts
  assert.equal(isSigning({ hands: [hand(0.9), null], pose: null }, 1000, 1000), true);
});
