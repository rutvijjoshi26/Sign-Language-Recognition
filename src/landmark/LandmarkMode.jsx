import React, { useEffect, useRef, useState } from "react";
import { LandmarkRecognizer, summarize } from "./recognizer";
import { SignSegmenter } from "./segmenter";
import { isSigning } from "./features";
import { gloss } from "./glosses";
import "./landmark.css";

const FILE_FPS = 25; // uploaded videos are analysed frame by frame at the INCLUDE frame rate
const LIVE_EVERY = 6; // classify the in-progress segment every N frames
const MIN_P = 0.35; // below this the caption is shown as uncertain

// Segments run from a few rest frames before the hands rise to a few after they drop.
const segmenterFor = (v) =>
  new SignSegmenter({
    startFrames: 2,
    preRoll: 6,
    endGap: 6,
    minFrames: 6,
    maxFrames: 150,
    isActive: (f) => isSigning(f, v.videoWidth, v.videoHeight),
  });

const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
  [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
const POSE_EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

function draw(canvas, frame) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;
  const line = (pts, edges, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, w / 400);
    edges.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(pts[a].x * w, pts[a].y * h);
      ctx.lineTo(pts[b].x * w, pts[b].y * h);
      ctx.stroke();
    });
  };
  if (frame.pose) line(frame.pose, POSE_EDGES, "#7aa2ff");
  frame.hands.forEach((pts, s) => pts && line(pts, HAND_EDGES, s === 0 ? "#3ddb86" : "#ffb21d"));
}

const Caption = ({ result, title }) => {
  if (!result) return null;
  const best = result.top[0];
  const g = gloss(best.label);
  const unsure = best.p < MIN_P;
  return (
    <div
      className={`lm-caption${unsure ? " lm-unsure" : ""}`}
      data-testid="lm-caption"
      data-label={best.label}
      data-top={JSON.stringify(result.top)}
    >
      <div className="lm-caption-title">{title}</div>
      <div className="lm-caption-en" lang="en">{g.en}</div>
      <div className="lm-caption-hi" lang="hi">{g.hi}</div>
      <div className="lm-caption-p">
        {(best.p * 100).toFixed(0)}% {unsure && "(low confidence)"}
      </div>
      <ol className="lm-alts">
        {result.top.slice(1, 3).map((t) => (
          <li key={t.label}>
            {gloss(t.label).en} / <span lang="hi">{gloss(t.label).hi}</span> ({(t.p * 100).toFixed(0)}%)
          </li>
        ))}
      </ol>
    </div>
  );
};

const LandmarkMode = () => {
  const [status, setStatus] = useState("Loading");
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState(null); // "camera" | "file" | null
  const [live, setLive] = useState(null);
  const [clip, setClip] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const recRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const runRef = useRef(0); // increments to cancel a running loop
  const timings = useRef({ detect: [], classify: [], frameGap: [] });

  useEffect(() => {
    let cancelled = false;
    LandmarkRecognizer.create({ onStatus: (s) => !cancelled && setStatus(s) })
      .then((r) => {
        if (cancelled) return;
        recRef.current = r;
        setReady(true);
      })
      .catch((e) => setStatus(`Failed to load: ${e.message}`));
    return () => {
      cancelled = true;
      runRef.current++;
    };
  }, []);

  const resetTimings = () => (timings.current = { detect: [], classify: [], frameGap: [] });
  const publishStats = (frames) => {
    const t = timings.current;
    const gap = summarize(t.frameGap);
    setStats({
      frames,
      detectMs: summarize(t.detect),
      classifyMs: summarize(t.classify),
      loopFps: gap.n ? 1000 / gap.median : 0,
    });
  };

  const sizeCanvas = () => {
    const v = videoRef.current;
    canvasRef.current.width = v.videoWidth;
    canvasRef.current.height = v.videoHeight;
  };

  const addHistory = (res) => {
    if (res.top[0].p >= MIN_P) setHistory((h) => [res.top[0].label, ...h].slice(0, 8));
  };

  const fail = (e) => setStatus(`Error: ${e.message}`);

  const stop = () => {
    runRef.current++;
    const v = videoRef.current;
    if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
    v.srcObject = null;
    if (v.src) URL.revokeObjectURL(v.src);
    v.removeAttribute("src");
    draw(canvasRef.current, null);
    setSource(null);
  };

  const startCamera = async () => {
    const rec = recRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    });
    const v = videoRef.current;
    v.srcObject = stream;
    await v.play();
    sizeCanvas();
    await rec.reset();
    resetTimings();
    setSource("camera");
    setClip(null);
    setLive(null);
    const run = ++runRef.current;
    const seg = segmenterFor(v);
    let n = 0;
    let last = 0;
    const step = () => {
      if (run !== runRef.current) return;
      const now = performance.now();
      const { frame, ms } = rec.detect(v, now);
      if (last) timings.current.frameGap.push(now - last);
      last = now;
      timings.current.detect.push(ms);
      draw(canvasRef.current, frame);
      n++;
      const done = seg.push(frame);
      const W = v.videoWidth, H = v.videoHeight;
      if (done) {
        const res = rec.classify(done, W, H);
        timings.current.classify.push(res.ms);
        setLive(res);
        addHistory(res);
      } else if (seg.active && seg.current().length >= 12 && n % LIVE_EVERY === 0) {
        const res = rec.classify(seg.current(), W, H);
        timings.current.classify.push(res.ms);
        setLive(res);
      }
      if (n % 30 === 0) publishStats(n);
      v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
  };

  const seek = (v, t) =>
    new Promise((resolve) => {
      v.addEventListener("seeked", resolve, { once: true });
      v.currentTime = t;
    });

  const analyseFile = async (file) => {
    const rec = recRef.current;
    const v = videoRef.current;
    v.srcObject = null;
    v.src = URL.createObjectURL(file);
    v.muted = true;
    await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
    v.pause();
    sizeCanvas();
    await rec.reset();
    resetTimings();
    setSource("file");
    setLive(null);
    setClip(null);
    setStatus(`Analysing ${file.name}`);
    const run = ++runRef.current;
    const seg = segmenterFor(v);
    const frames = [];
    const W = v.videoWidth, H = v.videoHeight;
    const total = Math.max(1, Math.floor(v.duration * FILE_FPS));
    for (let i = 0; i < total; i++) {
      if (run !== runRef.current) return;
      await seek(v, (i + 0.5) / FILE_FPS);
      const { frame, ms } = rec.detect(v, (i * 1000) / FILE_FPS);
      timings.current.detect.push(ms);
      frames.push(frame);
      draw(canvasRef.current, frame);
      const done = seg.push(frame);
      if (done) {
        const res = rec.classify(done, W, H);
        timings.current.classify.push(res.ms);
        setLive(res);
      }
    }
    const res = rec.classify(frames, W, H);
    timings.current.classify.push(res.ms);
    setClip({ ...res, file: file.name });
    addHistory(res);
    publishStats(frames.length);
    setStatus("Ready");
  };

  return (
    <div className="lm-root">
      <div className="header">
        <h1>Indian Sign Language recognition</h1>
        <p>
          On-device recognition of 50 ISL signs (INCLUDE-50) from MediaPipe hand and body landmarks, with
          English and Hindi captions. Video never leaves this device.
        </p>
        <p className="lm-status" data-testid="lm-status" data-ready={ready}>{status}</p>
      </div>

      <div className="lm-stage">
        <video ref={videoRef} playsInline muted className={source ? "" : "lm-hidden"} />
        <canvas ref={canvasRef} className={source ? "" : "lm-hidden"} />
      </div>

      <div className="btn-container">
        <input
          type="file"
          accept="video/*"
          hidden
          ref={fileRef}
          data-testid="lm-file"
          onChange={(e) => e.target.files[0] && analyseFile(e.target.files[0]).catch(fail)}
        />
        <button disabled={!ready} onClick={() => (source ? stop() : fileRef.current.click())}>
          {source === "file" ? "Close" : "Open"} Video
        </button>
        <button disabled={!ready || source === "file"} onClick={() => (source ? stop() : startCamera().catch(fail))}>
          {source === "camera" ? "Close" : "Open"} Webcam
        </button>
      </div>

      <div className="lm-panels" aria-live="polite">
        <Caption result={clip} title={clip ? `Whole clip: ${clip.file}` : ""} />
        <Caption result={live} title="Latest sign" />
      </div>

      {history.length > 0 && (
        <p className="lm-history" data-testid="lm-history">
          {history.map((l, i) => (
            <span key={i}>
              {gloss(l).en} / <span lang="hi">{gloss(l).hi}</span>
            </span>
          ))}
        </p>
      )}

      {stats && (
        <details className="lm-stats" data-testid="lm-stats" data-stats={JSON.stringify(stats)}>
          <summary>Performance on this device</summary>
          <p>
            Landmarks per frame: median {stats.detectMs.median.toFixed(1)} ms, p95 {stats.detectMs.p95.toFixed(1)} ms
            ({stats.frames} frames)
          </p>
          <p>
            Classifier per sequence: median {stats.classifyMs.median.toFixed(1)} ms, p95{" "}
            {stats.classifyMs.p95.toFixed(1)} ms
          </p>
          {stats.loopFps > 0 && <p>Live loop: {stats.loopFps.toFixed(1)} FPS</p>}
        </details>
      )}
    </div>
  );
};

export default LandmarkMode;
