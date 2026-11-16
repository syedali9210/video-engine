import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Verb drop",
  poster: { at: 6700 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "Per-letter styles", "SVG paths drawn on"],
  blurb:
    "An 11.8 s launch film on warm paper: eight huge verbs, each wearing what it does (strokes, shapes, a gradient, type on a path, a warp, an extrusion, a repeat, a trace), a line typed and taken apart with its shortcuts showing, its glyph built into an app icon, the app tilting in to meet you, and its pen tool drawing a leaf.",
  source: "Built for the engine, replicating the Vector Studio launch film (measured cut by cut)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  load: () => import("./index"),
  params,
  // its cuts, each tagged with what it does in a film (studio/shots.ts)
  film: {
    size: "16x9",
    end: 11.77,
    look: "paper",
    chrome: ["Stroke", "Pathfinder", "Fill", "Text on path", "Bend", "Extrude", "Copies", "Threshold"],
    shots: [
      { name: "Verbs", at: 0, role: ["hook", "feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Line", at: 3.0, role: ["feature", "detail"], energy: 2, enter: "type", exit: "cut" },
      { name: "Meet", at: 7.0, role: ["logo", "product"], energy: 2, enter: "rise", exit: "cut" },
      { name: "Pen", at: 9.2, role: ["detail", "cta"], energy: 1, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    verbs: { type: "text", label: "Verbs", group: "Story", hint: "Eight, split by |." },
    glyph: { type: "text", label: "On the icon", group: "Story", hint: "A shortcut or a short word." },
    line: { type: "text", label: "Beside it", group: "Story" },
    tool: { type: "text", label: "The tool shown", group: "Ending" },
    how: { type: "text", label: "How it works", group: "Ending" },
  },
} satisfies Omit<AnimMeta, "id">;
