import { test } from "node:test";
import assert from "node:assert/strict";
import { toDetections, describeDetections, modelUrl, cameraErrorMessage } from "../src/utils/detections.js";

test("toDetections keeps scores above the threshold, sorted best first", () => {
  const boxes = [0, 0, 0.5, 0.5, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.9, 0.9];
  const scores = [0.3, 0.1, 0.95];
  const classes = [14, 3, 50];
  const d = toDetections(boxes, scores, classes, 0.2);
  assert.deepEqual(d.map((x) => x.classId), [50, 14]);
  assert.deepEqual(d[0].box, [0.3, 0.3, 0.9, 0.9]);
  assert.equal(d[0].score, 0.95);
});

test("toDetections returns an empty list when nothing passes", () => {
  assert.deepEqual(toDetections([0, 0, 1, 1], [0.1], [0], 0.2), []);
});

test("describeDetections gives a readable summary with whole-number percentages", () => {
  const labels = ["I", "Play"];
  assert.equal(describeDetections([{ classId: 1, score: 0.924 }, { classId: 0, score: 0.31 }], labels), "Play 92%, I 31%");
  assert.equal(describeDetections([], labels), "No sign detected");
});

test("modelUrl resolves against the deploy base path", () => {
  assert.equal(modelUrl("/", "english"), "/english_web_model/model.json");
  assert.equal(modelUrl("/sign-app/", "hindi"), "/sign-app/hindi_web_model/model.json");
  assert.equal(modelUrl("/sign-app", "hindi"), "/sign-app/hindi_web_model/model.json");
  assert.equal(modelUrl("./", "english"), "./english_web_model/model.json");
});

test("cameraErrorMessage explains the common getUserMedia failures", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /permission/i);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /no camera/i);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /in use/i);
  assert.match(cameraErrorMessage(undefined), /camera/i);
});
