// Plays a motionmaxxing film (public/motionmaxxing/runtime/motion.js, on its bundled GSAP) inside the engine. Such a
// film only moves when window.__seek(t) is called, so this calls it every frame from the page's own clock: on screen it
// loops in real time, and in an export the engine steps that clock (engine-bridge.js ?vt=1), so every frame is the
// film's exact pose at the film's time.
(() => {
  // (stepped, the clock starts at 0 with the page: the film starts there too, frame for frame)
  const t0 = window.__now ? 0 : performance.now();
  const go = () => {
    if (window.__seek && window.__duration) window.__seek(((performance.now() - t0) / 1000) % window.__duration);
    requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
  // its stage is drawn at its own size (data-width × data-height on #main), fitted to whatever frame it plays in
  const fit = () => {
    const m = document.getElementById("main");
    const w = +(m?.dataset.width || 1920), h = +(m?.dataset.height || 1080);
    document.body.style.zoom = String(Math.min(innerWidth / w, innerHeight / h));
  };
  addEventListener("resize", fit);
  addEventListener("DOMContentLoaded", fit);
  fit();
})();
