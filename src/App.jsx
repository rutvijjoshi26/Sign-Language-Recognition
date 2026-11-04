import React, { useState, useEffect, useRef, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl"; // set backend to webgl
import Loader from "./components/loader";
import ButtonHandler from "./components/btn-handler";
import "./style/App.css";
import labelsEnglish from "./utils/labelsEnglish.json";
import labelsHindi from "./utils/labelsHindi.json";
import { loadModel, detectFrame, renderDetections, clearCanvas } from "./utils/detect";
import { describeDetections, modelUrl } from "./utils/detections";
import { openCamera, closeCamera } from "./utils/webcam";
import { createSmoother } from "./utils/smoothing";
import { createTranscript } from "./utils/transcript";

// Both languages share one network: public/hindi_web_model is a second export of the same weights
// (same topology, tensors equal to within 2.4e-7), so switching language only swaps the label list.
const MODEL_NAME = "english";
const LANGUAGES = {
  english: { name: "English", labels: labelsEnglish, speechLang: "en-US", htmlLang: "en" },
  hindi: { name: "Hindi", labels: labelsHindi, speechLang: "hi-IN", htmlLang: "hi" },
};

// Boxes are drawn for every detection above DRAW_THRESHOLD (the original class threshold).
// Only predictions above SIGN_THRESHOLD count as votes, and a sign enters the transcript after
// it wins SMOOTHING.enter of the last SMOOTHING.window frames (released below SMOOTHING.exit).
const DRAW_THRESHOLD = 0.2;
const SIGN_THRESHOLD = 0.5;
const SMOOTHING = { window: 8, enter: 5, exit: 3 };

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

const App = () => {
  const [loading, setLoading] = useState({ loading: true, progress: 0 });
  const [inputShape, setInputShape] = useState([1, 640, 640, 3]);
  const [language, setLanguage] = useState("english");
  const [source, setSource] = useState(null); // null | "image" | "video" | "camera"
  const [facingMode, setFacingMode] = useState("user");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null); // { label, confidence } shown as text
  const [imageResult, setImageResult] = useState("");
  const [transcriptItems, setTranscriptItems] = useState([]);
  const [speak, setSpeak] = useState(false);

  const imageRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const netRef = useRef(null);
  const loopGen = useRef(0);
  const objectUrl = useRef(null);
  const smoother = useRef(createSmoother(SMOOTHING));
  const transcript = useRef(createTranscript());
  const langRef = useRef(LANGUAGES.english);
  const speakRef = useRef(false);
  const langByTime = useRef(new Map()); // transcript entry time -> lang attribute

  langRef.current = LANGUAGES[language];
  speakRef.current = speak;

  // load the model once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tf.ready();
        const net = await loadModel(modelUrl(import.meta.env.BASE_URL, MODEL_NAME), (fraction) => {
          if (!cancelled) setLoading({ loading: true, progress: fraction });
        });
        if (cancelled) {
          net.dispose();
          return;
        }
        netRef.current = net;
        setInputShape(net.inputs[0].shape);
        setLoading({ loading: false, progress: 1 });
      } catch (err) {
        if (cancelled) return;
        setLoading({ loading: false, progress: 0 });
        setError(`The sign detection model could not be loaded (${err.message}). Check your connection and reload the page.`);
      }
    })();
    return () => {
      cancelled = true;
      if (netRef.current) netRef.current.dispose();
      netRef.current = null;
    };
  }, []);

  // switching language relabels results; the running stream keeps going
  useEffect(() => {
    smoother.current.reset();
    setCurrent(null);
    if (imageRef.current && !imageRef.current.hidden && imageRef.current.complete) runImage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const addToTranscript = useCallback((label) => {
    const t = performance.now();
    if (!transcript.current.add(label, t)) return;
    langByTime.current.set(t, langRef.current.htmlLang);
    setTranscriptItems(transcript.current.items());
    if (speakRef.current && speechSupported) {
      const u = new SpeechSynthesisUtterance(label);
      u.lang = langRef.current.speechLang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }, []);

  const handleFrame = useCallback(
    (detections) => {
      const top = detections[0];
      const vote = top && top.score >= SIGN_THRESHOLD ? { label: langRef.current.labels[top.classId], score: top.score } : null;
      const r = smoother.current.push(vote);
      const next = r.stable ? { label: r.stable, confidence: Math.round(r.confidence * 100) } : null;
      setCurrent((prev) =>
        prev === next || (prev && next && prev.label === next.label && prev.confidence === next.confidence) ? prev : next
      );
      if (r.entered) addToTranscript(r.entered);
    },
    [addToTranscript]
  );

  // record=false re-labels the current image without adding it to the transcript again
  const runImage = async (record = true) => {
    const net = netRef.current;
    const img = imageRef.current;
    if (!net || !img || img.hidden || !img.naturalWidth) return;
    try {
      const { detections, ratios } = await detectFrame(net, img, DRAW_THRESHOLD);
      renderDetections(canvasRef.current, detections, ratios, langRef.current.labels);
      setImageResult(describeDetections(detections, langRef.current.labels));
      const top = detections[0];
      if (record && top && top.score >= SIGN_THRESHOLD) addToTranscript(langRef.current.labels[top.classId]);
    } catch (err) {
      setError(`Detection failed: ${err.message}`);
    }
  };

  // one loop per play event; bumping loopGen stops it
  const runVideo = () => {
    const videoEl = videoRef.current;
    const gen = ++loopGen.current;
    smoother.current.reset();
    const step = async () => {
      if (gen !== loopGen.current || videoEl.paused || videoEl.ended) return;
      const net = netRef.current;
      if (net && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        try {
          const { detections, ratios } = await detectFrame(net, videoEl, DRAW_THRESHOLD);
          if (gen !== loopGen.current) return;
          renderDetections(canvasRef.current, detections, ratios, langRef.current.labels);
          handleFrame(detections);
        } catch (err) {
          if (gen === loopGen.current) setError(`Detection failed: ${err.message}`);
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const stopLoop = () => {
    loopGen.current++;
  };

  const closeSource = () => {
    stopLoop();
    const video = videoRef.current;
    closeCamera(video);
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    imageRef.current.removeAttribute("src");
    imageRef.current.hidden = true;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    clearCanvas(canvasRef.current);
    smoother.current.reset();
    setCurrent(null);
    setImageResult("");
    setSource(null);
  };

  const openImage = (file) => {
    closeSource();
    setError("");
    objectUrl.current = URL.createObjectURL(file);
    imageRef.current.hidden = false;
    imageRef.current.src = objectUrl.current;
    setSource("image");
  };

  const openVideo = (file) => {
    closeSource();
    setError("");
    objectUrl.current = URL.createObjectURL(file);
    videoRef.current.hidden = false;
    videoRef.current.src = objectUrl.current;
    setSource("video");
  };

  const startCamera = async (mode) => {
    closeSource();
    setError("");
    try {
      await openCamera(videoRef.current, mode);
      videoRef.current.hidden = false;
      setSource("camera");
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCamera = () => (source === "camera" ? closeSource() : startCamera(facingMode));

  const changeFacingMode = (mode) => {
    setFacingMode(mode);
    if (source === "camera") startCamera(mode);
  };

  const clearTranscript = () => {
    transcript.current.clear();
    langByTime.current.clear();
    setTranscriptItems([]);
  };

  const lang = LANGUAGES[language];

  return (
    <div className="App">
      {loading.loading && <Loader progress={loading.progress} />}
      <header className="header">
        <h1>
          <span aria-hidden="true">📷 </span>Multilingual Sign Language Detection
        </h1>
        <p>Detects hand signs in images, videos or your camera with YOLOv5, entirely in your browser.</p>
      </header>

      <main className="main">
        <div className="toolbar">
          <label className="inline-field">
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.entries(LANGUAGES).map(([key, l]) => (
                <option key={key} value={key}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ButtonHandler
          source={source}
          disabled={loading.loading}
          facingMode={facingMode}
          onFacingModeChange={changeFacingMode}
          onOpenImage={openImage}
          onOpenVideo={openVideo}
          onToggleCamera={toggleCamera}
          onClose={closeSource}
        />

        <div className="error" role="alert">
          {error && (
            <>
              <p>{error}</p>
              <button type="button" className="secondary" onClick={() => setError("")}>
                Dismiss
              </button>
            </>
          )}
        </div>

        <div className="content">
          <img hidden ref={imageRef} alt="Uploaded image being checked for signs" onLoad={() => runImage(true)} />
          <video
            hidden
            autoPlay
            muted
            playsInline
            controls={source === "video"}
            ref={videoRef}
            aria-label={source === "camera" ? "Camera preview" : "Uploaded video"}
            onPlay={runVideo}
            onPause={stopLoop}
            onEnded={stopLoop}
          />
          <canvas width={inputShape[1]} height={inputShape[2]} ref={canvasRef} aria-hidden="true" />
        </div>

        <section className="results" aria-labelledby="results-heading">
          <h2 id="results-heading">Recognized signs</h2>
          <p className="current">
            {source === "image" ? (
              <>Detected: <strong>{imageResult || "checking..."}</strong></>
            ) : current ? (
              <>
                Current sign: <strong lang={lang.htmlLang}>{current.label}</strong>{" "}
                <span className="confidence">({current.confidence}% confidence)</span>
              </>
            ) : (
              <>Current sign: <strong>none</strong></>
            )}
          </p>
          {transcriptItems.length === 0 && <p className="hint">Signs you hold steady for about a second appear here.</p>}
          {/* role="log" announces only newly added words, so the live region never re-reads the whole list */}
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Transcript">
            <ol className="transcript">
              {transcriptItems.map((item, i) => (
                <li key={`${item.t}-${i}`} lang={langByTime.current.get(item.t)}>
                  {item.label}
                </li>
              ))}
            </ol>
          </div>
          <div className="transcript-actions">
            <button type="button" className="secondary" onClick={clearTranscript} disabled={transcriptItems.length === 0}>
              Clear transcript
            </button>
            <label className="inline-field">
              <input type="checkbox" checked={speak} disabled={!speechSupported} onChange={(e) => setSpeak(e.target.checked)} />
              Speak signs aloud{speechSupported ? "" : " (not supported in this browser)"}
            </label>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
