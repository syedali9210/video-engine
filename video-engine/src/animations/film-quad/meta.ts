import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Quad grid",
  poster: { at: 3700 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "Four loops at once", "CSS coins"],
  blurb:
    "A 4.37 s feature launch (it loops) as four little ads cutting together: the feature's name on periwinkle rings and the app's trading screen; the product's name bold among flying coins, its token list and keyboard; a Deposit button and a balance raining coins; a black terminal of routes and what you received.",
  source: "Built for the engine, replicating an 'instant / replay share cards' feature film (measured cut by cut)",
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
    end: 4.37,
    look: "pop",
    tone: { ground: "#000000", ink: "#ffffff", accent: "#3138f0" },
    shots: [
      { name: "The feature", at: 0, role: ["hook", "feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Your name", at: 1.58, role: ["logo", "product"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Deposit", at: 2.5, role: ["feature"], energy: 3, enter: "cut", exit: "cut" },
      { name: "Received", at: 3.35, role: ["proof"], energy: 2, enter: "cut", exit: "cut" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product", hint: "Set bold among the coins." },
    app: { type: "text", label: "App", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    feature: { type: "text", label: "Feature", group: "Story" },
    intro: { type: "text", label: "Introducing", group: "Story" },
    action: { type: "text", label: "Button", group: "Story" },
    received: { type: "text", label: "Received", group: "Story", hint: "Two lines, split by |." },
    than: { type: "text", label: "Compared with", group: "Story" },
    would: { type: "text", label: "Would have", group: "Story" },
    balances: { type: "text", label: "Balances", group: "Story", hint: "Three, split by |." },
    screen1: { type: "screen", label: "Phone 1", group: "Screens", hint: "The dark phone, top left (a phone screen, 9:19.5)." },
    screen2: { type: "screen", label: "Phone 2", group: "Screens", hint: "The list, top right." },
    screen3: { type: "screen", label: "Phone 3", group: "Screens", hint: "The wallet, bottom left." },
  },
} satisfies Omit<AnimMeta, "id">;
