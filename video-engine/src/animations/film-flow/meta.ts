import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Flow film",
  poster: { at: 9000 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "Shared-shape morphs", "The product's own DOM", "Composed OKLCH fields"],
  blurb:
    "A launch film with no cuts: every scene becomes the next through a shape they share (a prompt box shrinking to a dot, the dot opening into a white world and becoming the mark, the name's pill growing into the product's panel, a card becoming the next). Words wiped on, prompts streaming in, the camera pushing in with the rest out of focus, grounds changing with the morphs. Written by the director (src/studio/flow.ts), at a measured reference film's pace.",
  source: "Built for the engine, from a reference launch film measured with motiscope's method (npm run measure)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  load: () => import("./index"),
  params,
  schema: {
    spec: { type: "text", label: "The flow", group: "Film", hint: "Its scenes, as the director writes them (src/studio/flow.ts), JSON. Empty: the demo." },
  },
} satisfies Omit<AnimMeta, "id">;
