import * as tf from "@tensorflow/tfjs";
import { toDetections } from "./detections";

// ultralytics color palette https://ultralytics.com/
const PALETTE = [
  "#FF3838", "#FF9D97", "#FF701F", "#FFB21D", "#CFD231", "#48F90A", "#92CC17", "#3DDB86", "#1A9334", "#00D4BB",
  "#2C99A8", "#00C2FF", "#344593", "#6473FF", "#0018EC", "#8438FF", "#520085", "#CB38FF", "#FF95C8", "#FF37C7",
];
const colorFor = (i) => PALETTE[Math.floor(i) % PALETTE.length];
const hexToRgba = (hex, alpha) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})` : null;
};

// Read each weight shard as soon as its headers arrive. TF.js otherwise waits for all 45
// responses before reading any body, which can stall on HTTP/1.1 servers (6 connections per host).
const bufferedFetch = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request for ${url} failed with status ${res.status}`);
  const body = await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};

/**
 * Load a YOLOv5 graph model and run one warm-up pass so the first real frame is fast.
 * @param {string} url model.json URL
 * @param {(fraction: number) => void} [onProgress]
 */
export const loadModel = async (url, onProgress) => {
  const net = await tf.loadGraphModel(url, { onProgress, fetchFunc: bufferedFetch });
  const dummy = tf.ones(net.inputs[0].shape);
  const warm = await net.executeAsync(dummy);
  tf.dispose([warm, dummy]);
  return net;
};

/**
 * Pad the frame to a square (bottom/right), resize to the model input and scale to [0, 1].
 * @returns {[tf.Tensor, number, number]} input tensor, xRatio, yRatio
 */
const preprocess = (source, modelWidth, modelHeight) => {
  let xRatio;
  let yRatio;
  const input = tf.tidy(() => {
    const img = tf.browser.fromPixels(source);
    const [h, w] = img.shape.slice(0, 2);
    const maxSize = Math.max(w, h);
    const padded = img.pad([[0, maxSize - h], [0, maxSize - w], [0, 0]]);
    xRatio = maxSize / w;
    yRatio = maxSize / h;
    return tf.image.resizeBilinear(padded, [modelWidth, modelHeight]).div(255.0).expandDims(0);
  });
  return [input, xRatio, yRatio];
};

/**
 * Run the model on one image or video frame. Every tensor created here is disposed before returning.
 * @returns {Promise<{ detections: Array<{classId: number, score: number, box: number[]}>, ratios: [number, number] }>}
 */
export const detectFrame = async (net, source, threshold) => {
  const [modelWidth, modelHeight] = net.inputs[0].shape.slice(1, 3);
  const [input, xRatio, yRatio] = preprocess(source, modelWidth, modelHeight);
  let res;
  try {
    res = await net.executeAsync(input);
    const [boxes, scores, classes] = res.slice(0, 3);
    const [boxesData, scoresData, classesData] = await Promise.all([boxes.data(), scores.data(), classes.data()]);
    return { detections: toDetections(boxesData, scoresData, classesData, threshold), ratios: [xRatio, yRatio] };
  } finally {
    tf.dispose(input);
    if (res) tf.dispose(res);
  }
};

/** Draw boxes and "label - NN.N%" tags on the overlay canvas. */
export const renderDetections = (canvas, detections, ratios, labels) => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(Math.round(Math.max(canvas.width, canvas.height) / 40), 14);
  ctx.font = `${fontSize}px Arial`;
  ctx.textBaseline = "top";
  const lineWidth = Math.max(Math.min(canvas.width, canvas.height) / 200, 2.5);

  for (const d of detections) {
    const color = colorFor(d.classId);
    const text = `${labels[d.classId]} - ${(d.score * 100).toFixed(1)}%`;
    let [x1, y1, x2, y2] = d.box;
    x1 *= canvas.width * ratios[0];
    x2 *= canvas.width * ratios[0];
    y1 *= canvas.height * ratios[1];
    y2 *= canvas.height * ratios[1];

    ctx.fillStyle = hexToRgba(color, 0.2);
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // dark tag with white text keeps contrast high for every palette color
    const yText = Math.max(0, y1 - (fontSize + lineWidth));
    ctx.fillStyle = "#111111";
    ctx.fillRect(x1 - 1, yText, ctx.measureText(text).width + lineWidth, fontSize + lineWidth);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x1 - 1, yText);
  }
};

export const clearCanvas = (canvas) => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};
