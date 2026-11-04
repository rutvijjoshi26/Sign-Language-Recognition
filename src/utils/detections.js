// Pure helpers shared by the app and the benchmark page (no TensorFlow.js imports here).

/**
 * Turn the model's flat output arrays into a list of detections above `threshold`, best first.
 * Boxes stay normalized to the padded square input: [x1, y1, x2, y2].
 */
export const toDetections = (boxes, scores, classes, threshold) => {
  const out = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > threshold) {
      out.push({ classId: classes[i], score: scores[i], box: Array.from(boxes.slice(i * 4, i * 4 + 4)) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
};

/** Short text summary of detections, e.g. "hello 92%, yes 31%". */
export const describeDetections = (detections, labels) =>
  detections.length
    ? detections.map((d) => `${labels[d.classId]} ${Math.round(d.score * 100)}%`).join(", ")
    : "No sign detected";

/** Model URL relative to the deploy base (import.meta.env.BASE_URL), so the app works under a subpath. */
export const modelUrl = (base, name) => `${base.endsWith("/") ? base : base + "/"}${name}_web_model/model.json`;

/** Human readable message for a getUserMedia failure. */
export const cameraErrorMessage = (err) => {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in your browser settings and try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is in use by another application or could not be started.";
    default:
      return "The camera could not be opened in this browser.";
  }
};
