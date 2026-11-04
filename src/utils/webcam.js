import { cameraErrorMessage } from "./detections";

/**
 * Open a camera and stream it into a video element.
 * @param {HTMLVideoElement} videoEl
 * @param {"user" | "environment"} facingMode "user" is the front camera (default), "environment" the rear one
 * @returns {Promise<void>} rejects with an Error whose message is safe to show to the user
 */
export const openCamera = async (videoEl, facingMode = "user") => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("This browser does not support camera access. Try a recent version of Chrome, Edge, Firefox or Safari over HTTPS.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode } } });
    videoEl.srcObject = stream;
  } catch (err) {
    throw new Error(cameraErrorMessage(err));
  }
};

/** Stop every track of the camera stream attached to the video element. Safe to call when nothing is open. */
export const closeCamera = (videoEl) => {
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach((track) => track.stop());
    videoEl.srcObject = null;
  }
};
