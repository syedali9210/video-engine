import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Feature spotlight",
  poster: { at: 2900 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "A camera over a flat world"],
  blurb:
    "An 8.3 s square feature film (it loops) on warm paper: the app's window, a click on +, a new tab that grows into the frame and says “Introducing…”, the feature's name huge among its tags, a whip to four words typed over the app as it slides by switching pages, a selection closing on the mark, the mark opening into an artboard and gathering into the app icon, clicked: back to the start.",
  source: "Built for the engine, replicating a design tool's 'Tabs' feature film (measured cut by cut)",
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
    size: "1x1",
    end: 8.3,
    look: "paper",
    shots: [
      { name: "Your app", at: 0, role: ["intro", "product"], energy: 1, enter: "cut", exit: "push-in" },
      { name: "Introducing", at: 1.75, role: ["intro"], energy: 2, enter: "push-in", exit: "cut" },
      { name: "The feature", at: 2.58, role: ["hook", "feature"], energy: 3, enter: "cut", exit: "whip" },
      { name: "Four words", at: 3.66, role: ["feature", "product"], energy: 2, enter: "whip", exit: "push-in" },
      { name: "The mark", at: 5.9, role: ["logo"], energy: 2, enter: "push-in", exit: "pull-out" },
      { name: "The icon", at: 7.6, role: ["logo", "cta"], energy: 2, enter: "pull-out", exit: "cut" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    user: { type: "text", label: "Signed in as", group: "Product" },
    feature: { type: "text", label: "Feature", group: "Story", hint: "One word, shown huge." },
    tags: { type: "text", label: "Tags around it", group: "Story", hint: "Split by |: four rows of five, top to bottom." },
    words: { type: "text", label: "Typed words", group: "Story", hint: "Four, split by |, one after another." },
    tabs: { type: "text", label: "Tabs", group: "App", hint: "Split by |." },
    pages: { type: "text", label: "Pages", group: "App", hint: "Split by |." },
    headline: { type: "text", label: "A page's headline", group: "App" },
    dashboard: { type: "screen", label: "Home screen", group: "Screens", hint: "Below the tabs in the opening window (about 1400×850)." },
    screen1: { type: "screen", label: "Page 1", group: "Screens", hint: "The canvas under the 2nd word (3:2)." },
    screen2: { type: "screen", label: "Page 2", group: "Screens", hint: "The canvas under the 3rd word (3:2)." },
    screen3: { type: "screen", label: "Page 3", group: "Screens", hint: "The canvas under the 4th word (3:2)." },
    mark: { type: "screen", label: "Logo", group: "Product", hint: "In place of the drawn mark." },
    icon: { type: "screen", label: "App icon", group: "Product", hint: "In place of the squares, in the icon that's clicked." },
  },
} satisfies Omit<AnimMeta, "id">;
