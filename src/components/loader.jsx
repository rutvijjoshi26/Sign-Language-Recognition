import "../style/loader.css";

const Loader = ({ progress }) => {
  const percent = Math.round(progress * 100);
  return (
    <div className="wrapper" role="status" data-loading="true">
      <div className="spinner" aria-hidden="true"></div>
      <p>Loading the sign detection model... <span aria-hidden="true">{percent}%</span></p>
      <progress max="100" value={percent} aria-label="Model download" />
    </div>
  );
};

export default Loader;
