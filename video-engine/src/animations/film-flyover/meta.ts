import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Site flyover",
  poster: { at: 11500 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "CSS 3D", "Depth of field by mask", "Screen slots"],
  blurb:
    "A 14.6 s product demo of a website: the page tilts back and the camera flies along it in shallow focus, past the hero and its app window, the features (cards rising off the page as it passes), a dark AI section, the story, pricing and questions, whips back to the whole page standing, then dives into the app window for the closing line.",
  source: "Built for the engine, replicating a newsletter product's site film (measured cut by cut)",
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
    end: 14.56,
    look: "studio",
    shots: [
      { name: "The hero", at: 0, role: ["hook", "product"], energy: 2, enter: "cut", exit: "pan" },
      { name: "Down the page", at: 2.2, role: ["feature", "product"], energy: 2, enter: "pan", exit: "whip" },
      { name: "The whole page", at: 8.03, role: ["product"], energy: 2, enter: "whip", exit: "push-in" },
      { name: "Into the app", at: 9.3, role: ["product"], energy: 2, enter: "push-in", exit: "cut" },
      { name: "The closing line", at: 9.93, role: ["cta", "logo"], energy: 1, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    mark: { type: "screen", label: "Logo", group: "Product", hint: "Your logo, in place of the paper plane." },
    accent: { type: "color", label: "Accent", group: "Product" },
    page: { type: "screen", label: "Your site", group: "Screens", hint: "A full-page screenshot of your site: the camera flies over it instead of the page drawn here." },
    screen: { type: "screen", label: "App screen", group: "Screens", hint: "What shows in the app window, on the page and in the closing shot (16:9 or so)." },
    url: { type: "text", label: "Address", group: "Screens" },
    hero: { type: "text", label: "Hero", group: "Page", hint: "Two lines, split by |." },
    sub: { type: "text", label: "Under the hero", group: "Page", hint: "Two lines, split by |." },
    features: { type: "text", label: "Features title", group: "Page", hint: "Two lines, split by |." },
    ai: { type: "text", label: "Dark section", group: "Page", hint: "Two lines, split by |." },
    aiLine: { type: "text", label: "Dark section, under", group: "Page" },
    why: { type: "text", label: "Story title", group: "Page", hint: "The name follows it." },
    plans: { type: "text", label: "Pricing title", group: "Page" },
    price: { type: "text", label: "Price", group: "Page" },
    faq: { type: "text", label: "Questions title", group: "Page" },
    campaign: { type: "text", label: "In the editor", group: "Page" },
    subject: { type: "text", label: "Subject line", group: "Page" },
    close: { type: "text", label: "Closing line", group: "Ending", hint: "Two lines, split by |; the second in italic." },
  },
} satisfies Omit<AnimMeta, "id">;
