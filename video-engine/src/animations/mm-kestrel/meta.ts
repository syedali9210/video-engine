import type { AnimMeta } from "../../registry";

// motionmaxxing's demo film (public/motionmaxxing: Tejas Makwana's skill, Apache-2.0, on its bundled GSAP 3.12.5):
// Kestrel is the skill's own invented brand. It plays through motion.js's seek contract (public/motionmaxxing-driver.js),
// so the engine's stepped clock renders it frame for frame. A sample of the runtime, not a model film.
export default {
  name: "Motion runtime demo",
  category: "Launch films",
  tech: ["HTML", "GSAP", "motion.js"],
  blurb: "motionmaxxing's 9 s mechanics demo on its seek-safe GSAP runtime: words at speech rhythm, a typed prompt, a count, a cut to a dark close. Rendered frame-exact by the engine.",
  source: "github.com/Tejashmakwana/motionmaxxing examples/demo (Apache-2.0)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut.",
  html: true,
  layout: "fill",
  params: {},
  schema: {},
} satisfies Omit<AnimMeta, "id">;
