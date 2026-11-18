import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Pop blue",
  poster: { at: 7400 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "Rolling digits", "CSS clouds"],
  blurb:
    "An 11.3 s brand film in one loud blue: a word over angular shards, digits rolling into a giant amount, a yellow flash, the amount split into pills, a sky of clouds with pictures and a line, the mark, a wall of pills with words and arrows, cards that count up, and the wordmark with a trail of faces flying in.",
  source: "Built for the engine, replicating the Venmo splitting ad (measured cut by cut)",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  assets: ["photo-1512621776951-a57141f2eefd.jpg", "photo-1578985545062-69928b1d9587.jpg", "photo-1589301760014-d929f3979dbc.jpg", "photo-1694849789325-914b71ab4075.jpg", "photo-1742281257687-092746ad6021.jpg"].map((f) => `/anim/swiggy-home/img/${f}`),
  load: () => import("./index"),
  params,
  // its cuts, each tagged with what it does in a film (studio/shots.ts)
  film: {
    size: "16x9",
    end: 11.27,
    look: "pop",
    tone: { ground: "#ffffff", ink: "#0e2a55", accent: "#0a8ff0" },
    shots: [
      { name: "Hook", at: 0, role: ["hook"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Amount", at: 1.0, role: ["proof"], energy: 3, enter: "cut", exit: "flash" },
      { name: "Sky", at: 3.23, role: ["intro"], energy: 2, enter: "flash", exit: "cut" },
      { name: "Mark", at: 5.0, role: ["logo"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Cards", at: 6.8, role: ["proof", "feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "End card", at: 8.3, role: ["logo", "cta"], energy: 2, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product", hint: "Set as the wordmark at the end." },
    accent: { type: "color", label: "Blue", group: "Product" },
    hook: { type: "text", label: "Hook", group: "Story", hint: "A word|a line." },
    amount: { type: "text", label: "Amount", group: "Story" },
    share: { type: "text", label: "Each share", group: "Story" },
    skip: { type: "text", label: "Over the clouds", group: "Story", hint: "Two lines, split by |." },
    words: { type: "text", label: "In the pills", group: "Story", hint: "Three, split by |." },
    social: { type: "text", label: "Over the cards", group: "Ending" },
    photo1: { type: "screen", label: "Picture 1", group: "Pictures", hint: "Your pictures in place of the engine's (people, products)." },
    photo2: { type: "screen", label: "Picture 2", group: "Pictures" },
    photo3: { type: "screen", label: "Picture 3", group: "Pictures" },
    photo4: { type: "screen", label: "Picture 4", group: "Pictures" },
    screen1: { type: "screen", label: "Card 1", group: "Screens", hint: "Your screen in place of the budget card, top left (16:9)." },
    screen2: { type: "screen", label: "Card 2", group: "Screens", hint: "In place of the installments card, top right (2:1)." },
    screen3: { type: "screen", label: "Card 3", group: "Screens", hint: "In place of the split-the-bill card, bottom left (16:9)." },
    screen4: { type: "screen", label: "Card 4", group: "Screens", hint: "In place of the spending card, bottom right (3:2)." },
  },
} satisfies Omit<AnimMeta, "id">;
