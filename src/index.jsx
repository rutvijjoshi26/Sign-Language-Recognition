import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style/index.css";

// "?mode=landmark" opens the on-device ISL landmark recognizer; the default is the YOLOv5 app.
// The recognizer is loaded as a separate chunk so the YOLOv5 page does not download it.
const LandmarkMode = lazy(() => import("./landmark/LandmarkMode"));
const landmark = new URLSearchParams(window.location.search).get("mode") === "landmark";
const nav = { display: "flex", gap: "12px", justifyContent: "center", padding: "6px", fontSize: "0.9rem" };

const root = createRoot(document.getElementById("root"));
root.render(
  <>
    <nav style={nav}>
      <a href="?">YOLOv5 gesture detector</a>
      <a href="?mode=landmark">ISL landmark recognizer (INCLUDE-50)</a>
    </nav>
    {landmark ? (
      <Suspense fallback={<p style={{ textAlign: "center" }}>Loading...</p>}>
        <LandmarkMode />
      </Suspense>
    ) : (
      <App />
    )}
  </>
);
