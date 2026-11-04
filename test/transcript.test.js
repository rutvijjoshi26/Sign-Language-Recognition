import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranscript } from "../src/utils/transcript.js";

test("add appends words in order and text() joins them", () => {
  const t = createTranscript();
  assert.equal(t.add("I", 0), true);
  assert.equal(t.add("love", 2000), true);
  assert.deepEqual(t.items().map((i) => i.label), ["I", "love"]);
  assert.equal(t.text(), "I love");
});

test("an immediate repeat of the last word inside the gap is ignored", () => {
  const t = createTranscript({ repeatGapMs: 1500 });
  t.add("hello", 0);
  assert.equal(t.add("hello", 1000), false);
  assert.equal(t.add("hello", 2600), true);
  assert.equal(t.text(), "hello hello");
});

test("a different word is accepted even inside the gap", () => {
  const t = createTranscript({ repeatGapMs: 1500 });
  t.add("yes", 0);
  assert.equal(t.add("no", 100), true);
});

test("only the newest maxItems words are kept", () => {
  const t = createTranscript({ maxItems: 3, repeatGapMs: 0 });
  ["a", "b", "c", "d"].forEach((w, i) => t.add(w, i * 10));
  assert.equal(t.text(), "b c d");
});

test("clear empties the transcript and forgets the last word", () => {
  const t = createTranscript({ repeatGapMs: 1500 });
  t.add("sorry", 0);
  t.clear();
  assert.equal(t.text(), "");
  assert.equal(t.add("sorry", 10), true);
});

test("empty labels are ignored", () => {
  const t = createTranscript();
  assert.equal(t.add(null, 0), false);
  assert.equal(t.add("", 0), false);
  assert.equal(t.items().length, 0);
});
