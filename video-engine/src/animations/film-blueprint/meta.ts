import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Blueprint",
  poster: { at: 9200 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "SVG diagrams", "CSS perspective"],
  blurb:
    "A 31 s brand film drawn as a diagram on light grey: a boxed headline growing among thin connector lines, a photo zooming out into the diagram, a post beside each rule in a line-drawn room, a phone, the numbers counting up on sliding rails, the close with its three chips, the mark in orbit, and back to the start.",
  source: "Built for the engine, replicating a 'Start Building Beautiful Ads' brand film (measured cut by cut)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  assets: ["/anim/swiggy-home/img/photo-1497034825429-c343d7c6a68f.jpg"],
  load: () => import("./index"),
  params,
  // its cuts, each tagged with what it does in a film (studio/shots.ts)
  film: {
    size: "16x9",
    end: 31,
    look: "blueprint",
    shots: [
      { name: "Opening", at: 0, role: ["hook", "intro"], energy: 1, enter: "cut", exit: "pull-out" },
      { name: "Picture", at: 2.6, role: ["product"], energy: 1, enter: "pull-out", exit: "cut" },
      { name: "Rules", at: 6.83, role: ["feature"], energy: 1, enter: "cut", exit: "cut" },
      { name: "Phone", at: 14.83, role: ["product"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Proof", at: 17.12, role: ["proof"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Close", at: 24.4, role: ["cta"], energy: 1, enter: "cut", exit: "cut" },
      { name: "Again", at: 29.6, role: ["logo"], energy: 1, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product", hint: "Its first letter is the mark in the orbit." },
    start: { type: "text", label: "Opening", group: "Story", hint: "Two lines, split by |." },
    account: { type: "text", label: "Account", group: "Post" },
    handle: { type: "text", label: "Handle", group: "Post" },
    post: { type: "text", label: "Post", group: "Post" },
    overlay: { type: "text", label: "On the picture", group: "Post", hint: "Two lines, split by |." },
    tips: { type: "text", label: "Rules", group: "Story", hint: "Five, split by |." },
    proof: { type: "text", label: "Proof line", group: "Story" },
    stats: { type: "text", label: "Numbers", group: "Story", hint: "Number|what it counts, three times." },
    close: { type: "text", label: "Close", group: "Ending" },
    chips: { type: "text", label: "Chips", group: "Ending", hint: "Three, split by |." },
    photo: { type: "screen", label: "The picture", group: "Post", hint: "The ad's picture (square works best)." },
  },
} satisfies Omit<AnimMeta, "id">;
