// On-device ISL recognizer: MediaPipe hand + pose landmarks per frame, then a small
// TensorFlow.js classifier over a fixed-length landmark sequence. All assets are served
// from this app (public/landmark), so no video frame leaves the browser.
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import { buildFeatures, T, F } from "./features";

const BASE = `${import.meta.env.BASE_URL}landmark`;
export const ASSETS = {
  wasm: `${BASE}/mediapipe`,
  hand: `${BASE}/models/hand_landmarker.task`,
  pose: `${BASE}/models/pose_landmarker_lite.task`,
  classifier: `${BASE}/models/include50/model.json`,
  labels: `${BASE}/models/include50/labels.json`,
};

// Same thresholds as the Python extraction used for training.
const HAND_OPTS = {
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
const POSE_OPTS = {
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

const fetchBuffer = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

export class LandmarkRecognizer {
  static async create({ delegate = "GPU", onStatus = () => {} } = {}) {
    const r = new LandmarkRecognizer();
    onStatus("Loading MediaPipe runtime");
    r.fileset = await FilesetResolver.forVisionTasks(ASSETS.wasm);
    onStatus("Loading hand and pose models");
    [r.handBuf, r.poseBuf] = await Promise.all([fetchBuffer(ASSETS.hand), fetchBuffer(ASSETS.pose)]);
    r.delegate = delegate;
    await r.reset();
    onStatus("Loading sign classifier");
    await tf.ready();
    r.labels = await (await fetch(ASSETS.labels)).json();
    r.model = await tf.loadLayersModel(ASSETS.classifier);
    tf.tidy(() => r.model.predict(tf.zeros([1, T, F])).dataSync()); // warm up
    onStatus("Ready");
    return r;
  }

  // Recreate the landmarkers so tracking state from a previous video does not carry over.
  async reset() {
    this.hand?.close();
    this.pose?.close();
    const base = (buf) => ({ modelAssetBuffer: buf, delegate: this.delegate });
    [this.hand, this.pose] = await Promise.all([
      HandLandmarker.createFromOptions(this.fileset, { baseOptions: base(this.handBuf), runningMode: "VIDEO", ...HAND_OPTS }),
      PoseLandmarker.createFromOptions(this.fileset, { baseOptions: base(this.poseBuf), runningMode: "VIDEO", ...POSE_OPTS }),
    ]);
    this.lastTs = -1;
  }

  // Run both landmarkers on one frame. Returns { frame, ms } where frame matches features.js.
  detect(source, timestampMs) {
    const ts = Math.max(Math.round(timestampMs), this.lastTs + 1);
    this.lastTs = ts;
    const t0 = performance.now();
    const hr = this.hand.detectForVideo(source, ts);
    const pr = this.pose.detectForVideo(source, ts);
    const ms = performance.now() - t0;
    const hands = [null, null];
    const best = [-1, -1];
    hr.landmarks.forEach((pts, i) => {
      const c = hr.handedness[i][0];
      const slot = c.categoryName === "Left" ? 0 : 1;
      if (c.score > best[slot]) {
        best[slot] = c.score;
        hands[slot] = pts.map(({ x, y, z }) => ({ x, y, z }));
      }
    });
    const pose = pr.landmarks.length ? pr.landmarks[0].map(({ x, y, z }) => ({ x, y, z })) : null;
    return { frame: { hands, pose }, ms };
  }

  // Classify a list of frames. Returns { top: [{label, p}], ms }.
  classify(frames, width, height, k = 5) {
    const t0 = performance.now();
    const x = buildFeatures(frames, width, height);
    const probs = tf.tidy(() => this.model.predict(tf.tensor3d(x, [1, T, F])).dataSync());
    const ms = performance.now() - t0;
    const top = Array.from(probs, (p, i) => ({ label: this.labels[i], p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, k);
    return { top, ms };
  }
}

// Median and 95th percentile of a list of numbers.
export function summarize(values) {
  if (!values.length) return { n: 0, median: 0, p95: 0, mean: 0 };
  const s = [...values].sort((a, b) => a - b);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1) + 0.5))];
  return { n: s.length, median: q(0.5), p95: q(0.95), mean: s.reduce((a, b) => a + b, 0) / s.length };
}
