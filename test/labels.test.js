import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../src/utils/${f}`, import.meta.url), "utf8"));

test("both label lists cover the 51 model classes", () => {
  assert.equal(read("labelsEnglish.json").length, 51);
  assert.equal(read("labelsHindi.json").length, 51);
});

test("labels carry no stray whitespace (it would be spoken and shown)", () => {
  for (const f of ["labelsEnglish.json", "labelsHindi.json"]) {
    for (const l of read(f)) assert.equal(l, l.trim(), `${f}: "${l}"`);
  }
});
