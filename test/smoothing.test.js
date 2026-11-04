import { test } from "node:test";
import assert from "node:assert/strict";
import { createSmoother } from "../src/utils/smoothing.js";

const feed = (s, seq) => seq.map((l) => s.push(l === null ? null : { label: l, score: 0.9 }));

test("a single noisy frame never becomes stable", () => {
  const s = createSmoother({ window: 8, enter: 5, exit: 3 });
  const out = feed(s, ["hello", null, null, null, null, null]);
  assert.ok(out.every((r) => r.stable === null && r.entered === null));
});

test("a label held for `enter` frames becomes stable on that frame and is entered once", () => {
  const s = createSmoother({ window: 8, enter: 5, exit: 3 });
  const out = feed(s, ["hello", "hello", "hello", "hello", "hello", "hello", "hello"]);
  assert.deepEqual(out.map((r) => r.stable), [null, null, null, null, "hello", "hello", "hello"]);
  assert.deepEqual(out.map((r) => r.entered).filter(Boolean), ["hello"]);
  assert.equal(out[4].entered, "hello");
});

test("brief dropouts above the exit count keep the label without re-entering it", () => {
  const s = createSmoother({ window: 8, enter: 5, exit: 3 });
  const out = feed(s, ["yes", "yes", "yes", "yes", "yes", null, null, "no", "yes", null]);
  assert.ok(out.slice(4).every((r) => r.stable === "yes"));
  assert.equal(out.filter((r) => r.entered).length, 1);
});

test("the label is released once its count falls below exit, and a new hold enters it again", () => {
  const s = createSmoother({ window: 8, enter: 5, exit: 3 });
  feed(s, Array(8).fill("stop"));
  const gap = feed(s, Array(8).fill(null));
  assert.equal(gap[gap.length - 1].stable, null);
  // count in window goes 7,6,5,4,3,2 -> released when it drops to 2 (< exit 3), on the 6th null
  assert.deepEqual(gap.map((r) => r.stable), ["stop", "stop", "stop", "stop", "stop", null, null, null]);
  const again = feed(s, Array(5).fill("stop"));
  assert.equal(again[4].entered, "stop");
});

test("switching signs enters the new label once it reaches the enter count", () => {
  const s = createSmoother({ window: 8, enter: 5, exit: 3 });
  feed(s, Array(8).fill("eat"));
  const out = feed(s, Array(6).fill("drink"));
  assert.equal(out.find((r) => r.entered)?.entered, "drink");
  assert.equal(out[out.length - 1].stable, "drink");
});

test("confidence is the mean score of the stable label inside the window", () => {
  const s = createSmoother({ window: 4, enter: 3, exit: 2 });
  s.push({ label: "I", score: 0.5 });
  s.push({ label: "I", score: 0.7 });
  const r = s.push({ label: "I", score: 0.9 });
  assert.equal(r.stable, "I");
  assert.ok(Math.abs(r.confidence - 0.7) < 1e-9);
  assert.equal(s.push(null).confidence > 0, true);
});

test("reset clears the window and the stable label", () => {
  const s = createSmoother({ window: 4, enter: 3, exit: 2 });
  feed(s, ["you", "you", "you"]);
  s.reset();
  assert.equal(s.push(null).stable, null);
});

test("invalid parameters are rejected", () => {
  assert.throws(() => createSmoother({ window: 4, enter: 5, exit: 2 }), RangeError);
  assert.throws(() => createSmoother({ window: 8, enter: 3, exit: 4 }), RangeError);
});
