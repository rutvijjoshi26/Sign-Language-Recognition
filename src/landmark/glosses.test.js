import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GLOSSES } from "./glosses.js";

const labels = JSON.parse(readFileSync(new URL("../../public/landmark/models/include50/labels.json", import.meta.url)));

test("every classifier label has an English and a Hindi caption", () => {
  assert.equal(labels.length, 50);
  for (const l of labels) {
    assert.ok(GLOSSES[l], `missing gloss for ${l}`);
    assert.ok(GLOSSES[l].en && GLOSSES[l].hi, `empty gloss for ${l}`);
    assert.match(GLOSSES[l].hi, /[ऀ-ॿ]/, `Hindi caption for ${l} is not in Devanagari`);
  }
});
