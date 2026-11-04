/**
 * Temporal smoothing for per-frame sign predictions.
 *
 * Keeps the last `window` top-1 predictions. A label becomes the stable label once it
 * appears at least `enter` times in the window (majority vote), and it stays stable until
 * its count drops below `exit` (hysteresis), so single-frame flicker never reaches the UI.
 *
 * @param {{ window?: number, enter?: number, exit?: number }} options
 * @returns {{ push(pred: {label: string, score: number} | null): { stable: string | null, entered: string | null, confidence: number }, reset(): void }}
 */
export const createSmoother = ({ window = 8, enter = 5, exit = 3 } = {}) => {
  if (!(enter >= 1 && enter <= window)) throw new RangeError("enter must be between 1 and window");
  if (!(exit >= 1 && exit <= enter)) throw new RangeError("exit must be between 1 and enter");

  let frames = [];
  let stable = null;

  const countOf = (label) => frames.reduce((n, f) => n + (f && f.label === label ? 1 : 0), 0);

  const confidenceOf = (label) => {
    const hits = frames.filter((f) => f && f.label === label);
    return hits.length ? hits.reduce((s, f) => s + f.score, 0) / hits.length : 0;
  };

  const push = (pred) => {
    frames.push(pred && pred.label ? pred : null);
    if (frames.length > window) frames.shift();

    // most frequent label in the window (ties go to the most recent one)
    let best = null;
    let bestCount = 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (!f) continue;
      const c = countOf(f.label);
      if (c > bestCount) { best = f.label; bestCount = c; }
    }

    let entered = null;
    if (best !== null && best !== stable && bestCount >= enter) {
      stable = best;
      entered = best;
    } else if (stable !== null && countOf(stable) < exit) {
      stable = null;
    }
    return { stable, entered, confidence: stable === null ? 0 : confidenceOf(stable) };
  };

  const reset = () => { frames = []; stable = null; };

  return { push, reset };
};
