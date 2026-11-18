import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Lit desk",
  poster: { at: 13200 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "CSS 3D laptop", "Canvas terrain and halftone", "Screen light on the desk"],
  blurb:
    "A 29 s vertical reel shot like a phone filming a laptop in the dark: the screen plays the story and its light washes the keys and the desk. A prompt typed and dived into, a wireframe land flown over while it thinks, a halftone prompt, a word drum that edits a picture (remove, create, enhance, 3D), arcs, a ring of fire, a typed line, a recap, a sun, a last dot of light.",
  source: "Built for the engine, from a 'this is what AI can't do' reel (studied with motiscope, shot by shot)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  assets: ["dishes/biryani-cutout.png", "dishes/tea-cutout.png", "photo-1742281257687-092746ad6021.jpg"].map((f) => `/anim/swiggy-home/img/${f}`),
  load: () => import("./index"),
  params,
  // its cuts, each tagged with what it does in a film (studio/shots.ts)
  film: {
    size: "9x16",
    end: 29.1,
    look: "night",
    tone: { ground: "#07060a", ink: "#ffffff", accent: "#f05a1c" },
    shots: [
      { name: "Opening", at: 0, role: ["hook", "intro"], energy: 1, enter: "cut", exit: "push-in" },
      { name: "The prompt", at: 3.02, role: ["product", "feature"], energy: 2, enter: "push-in", exit: "cut" },
      { name: "While it thinks", at: 5.71, role: ["detail"], energy: 1, enter: "cut", exit: "cut" },
      { name: "Word drum", at: 12.0, role: ["feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "The product", at: 19.84, role: ["product"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Ring of fire", at: 22.64, role: ["hook"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Sunset", at: 24.4, role: ["cta"], energy: 1, enter: "cut", exit: "cut" },
      { name: "The sun", at: 27.33, role: ["logo"], energy: 1, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    accent: { type: "color", label: "Heat", group: "Look", hint: "The screen's hot colour; its yellows and deep reds come from it." },
    caption: { type: "text", label: "Caption", group: "Story" },
    ask: { type: "text", label: "Heading", group: "Story" },
    prompt: { type: "text", label: "Prompt", group: "Story" },
    model: { type: "text", label: "Model", group: "Story" },
    effort: { type: "text", label: "Effort", group: "Story" },
    edit: { type: "text", label: "Second prompt", group: "Story" },
    thinking: { type: "text", label: "Thinking words", group: "Story", hint: "Split by |." },
    verbs: { type: "text", label: "Word drum", group: "Story", hint: "Split by |. The 5th, 6th, 7th and 1st are the edits shown." },
    together: { type: "text", label: "Words on the arcs", group: "Ending", hint: "Split by |." },
    everything: { type: "text", label: "In the ring", group: "Ending" },
    line: { type: "text", label: "Typed line", group: "Ending" },
  },
} satisfies Omit<AnimMeta, "id">;
