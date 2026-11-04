import { useRef } from "react";

/**
 * Source controls: image upload, video upload and camera. Opening a source closes the current one,
 * so there is never more than one stream running.
 */
const ButtonHandler = ({ source, disabled, facingMode, onFacingModeChange, onOpenImage, onOpenVideo, onToggleCamera, onClose }) => {
  const inputImageRef = useRef(null);
  const inputVideoRef = useRef(null);

  const pick = (ref) => {
    ref.current.value = "";
    ref.current.click();
  };

  return (
    <div className="btn-container" role="group" aria-label="Input source">
      <input
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        ref={inputImageRef}
        onChange={(e) => e.target.files[0] && onOpenImage(e.target.files[0])}
      />
      <button type="button" disabled={disabled} onClick={() => (source === "image" ? onClose() : pick(inputImageRef))}>
        {source === "image" ? "Close image" : "Open image"}
      </button>

      <input
        type="file"
        accept="video/*"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        ref={inputVideoRef}
        onChange={(e) => e.target.files[0] && onOpenVideo(e.target.files[0])}
      />
      <button type="button" disabled={disabled} onClick={() => (source === "video" ? onClose() : pick(inputVideoRef))}>
        {source === "video" ? "Close video" : "Open video"}
      </button>

      <button type="button" disabled={disabled} aria-pressed={source === "camera"} onClick={onToggleCamera}>
        {source === "camera" ? "Stop camera" : "Start camera"}
      </button>

      <label className="inline-field">
        Camera
        <select value={facingMode} onChange={(e) => onFacingModeChange(e.target.value)}>
          <option value="user">Front</option>
          <option value="environment">Back</option>
        </select>
      </label>
    </div>
  );
};

export default ButtonHandler;
