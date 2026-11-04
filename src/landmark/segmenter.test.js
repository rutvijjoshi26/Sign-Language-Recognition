import { test } from "node:test";
import assert from "node:assert/strict";
import { SignSegmenter } from "./segmenter.js";

const hand = { hands: [[{ x: 0, y: 0, z: 0 }], null], pose: null };
const rest = { hands: [null, null], pose: null };

test("emits one segment after hands rest for endGap frames", () => {
  const seg = new SignSegmenter({ startFrames: 2, endGap: 3, minFrames: 4, maxFrames: 100 });
  const out = [];
  for (const f of [rest, rest, hand, hand, hand, hand, hand, rest, rest, rest, rest]) {
    const s = seg.push(f);
    if (s) out.push(s);
  }
  assert.equal(out.length, 1);
  assert.equal(out[0].length, 2 + 5 + 3); // pre-roll, signing frames, rest frames that ended it
  assert.equal(seg.active, false);
});

test("a short blip of hands is ignored", () => {
  const seg = new SignSegmenter({ startFrames: 2, endGap: 2, minFrames: 6, maxFrames: 100 });
  const out = [rest, hand, hand, rest, rest, rest].map((f) => seg.push(f)).filter(Boolean);
  assert.equal(out.length, 0);
});

test("long signing is cut at maxFrames", () => {
  const seg = new SignSegmenter({ startFrames: 1, endGap: 3, minFrames: 2, maxFrames: 10 });
  const out = Array.from({ length: 25 }, () => seg.push(hand)).filter(Boolean);
  assert.equal(out.length, 2);
  assert.ok(out.every((s) => s.length === 10));
});

test("current() exposes the in-progress segment for live captions", () => {
  const seg = new SignSegmenter({ startFrames: 1, endGap: 3, minFrames: 2, maxFrames: 50 });
  [hand, hand, hand].forEach((f) => seg.push(f));
  assert.equal(seg.current().length, 3);
  seg.reset();
  assert.equal(seg.current().length, 0);
});

test("a custom activity test decides when a sign starts and ends", () => {
  const up = { up: true, hands: [[{ x: 0, y: 0, z: 0 }], null], pose: null };
  const down = { up: false, hands: [[{ x: 0, y: 1, z: 0 }], null], pose: null }; // hand visible but resting
  const seg = new SignSegmenter({ startFrames: 1, endGap: 2, minFrames: 2, maxFrames: 100, preRoll: 2, isActive: (f) => f.up });
  const out = [down, down, down, up, up, up, down, down].map((f) => seg.push(f)).filter(Boolean);
  assert.equal(out.length, 1);
  assert.equal(out[0].length, 2 + 3 + 2); // pre-roll rest frames, signing frames, closing rest frames
});
