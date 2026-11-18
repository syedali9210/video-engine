import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Sketch to screen",
  poster: { at: 13600 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "SVG sketches", "Canvas-free particles"],
  blurb:
    "A 17 s vertical reel: a hand-drawn wireframe on a white card beside the finished screen, cut together on every new sketch. An icon tapped and burst, the mark spun and shattered, a search typed in the rain, a playlist, a wall of covers, a word roller, a poster slammed in, all of it swirling back into the mark.",
  source: "Built for the engine, from a 'Claude turns sketches into an app' reel (studied with motiscope, shot by shot)",
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
    size: "9x16",
    end: 17.4,
    look: "paper",
    tone: { ground: "#101011", ink: "#ffffff", accent: "#1ed760" },
    fit: { query: 1, poster: 1 }, // cut off at a quarter longer (npm run templates)
    shots: [
      { name: "Sketch", at: 0, role: ["hook"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Your mark", at: 1.15, role: ["logo"], energy: 3, enter: "cut", exit: "spin" },
      { name: "Search in the rain", at: 2.95, role: ["feature", "product"], energy: 2, enter: "type", exit: "cut" },
      { name: "Playlist", at: 6.41, role: ["feature"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Covers", at: 7.71, role: ["product"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Roller", at: 10.44, role: ["feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Poster", at: 12.21, role: ["hook", "product"], energy: 3, enter: "cut", exit: "spin" },
      { name: "Back to the mark", at: 14.65, role: ["logo", "cta"], energy: 2, enter: "spin", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    made: { type: "text", label: "Made with", group: "Product", hint: "The label over the screen." },
    query: { type: "text", label: "Search", group: "Story", hint: "Typed into the search; *words* take the accent." },
    playlist: { type: "text", label: "Playlist", group: "Story" },
    moods: { type: "text", label: "Roller words", group: "Story", hint: "Split by |. The last one is boxed and leads the poster." },
    poster: { type: "text", label: "Poster", group: "Story", hint: "Two parts split by |: a small italic word, then the huge one." },
    line: { type: "text", label: "End line", group: "Ending" },
    cta: { type: "text", label: "Call to action", group: "Ending", hint: "Under everything; *words* in coral." },
    screen: { type: "screen", label: "Your app", group: "Screens", hint: "A phone screen: what the sketch becomes, in place of the drawn music app (9:16)." },
  },
} satisfies Omit<AnimMeta, "id">;
