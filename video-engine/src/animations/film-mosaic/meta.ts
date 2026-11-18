import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Prompt to page",
  poster: { at: 9800 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "A 2×2 mosaic, each cell on its own clock", "CSS 3D phone"],
  blurb:
    "A 14 s product demo as a mosaic of four: each quarter cuts through the same story on its own clock (the logo, the model picked, the prompt typed, the agent's log, the page on a monitor and a turning phone, the tools connected, the integrations, “ready”), so the whole making is on screen at once.",
  source: "Built for the engine, replicating the Alpaca demo film (measured cut by cut)",
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
    end: 13,
    look: "night",
    tone: { ground: "#efefef", ink: "#151515", accent: "#2d8cff" },
    chrome: ["Edited company.md", "Connect it in one click", "Home Product Pricing"],
    shots: [
      { name: "The prompt", at: 0, role: ["intro", "product"], energy: 2, enter: "cut", exit: "cut" },
      { name: "The making", at: 4.17, role: ["product", "feature"], energy: 2, enter: "cut", exit: "cut" },
      { name: "The page", at: 8.2, role: ["product", "proof"], energy: 2, enter: "cut", exit: "cut" },
      { name: "Ready", at: 11.77, role: ["cta"], energy: 1, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    model: { type: "text", label: "Model", group: "Product" },
    begin: { type: "text", label: "The question", group: "Story" },
    prompt: { type: "text", label: "Prompt", group: "Story" },
    log: { type: "text", label: "Agent's summary", group: "Story" },
    made: { type: "text", label: "What it made", group: "Story" },
    ready: { type: "text", label: "Done", group: "Story" },
    connect: { type: "text", label: "Connect", group: "Story" },
    team: { type: "text", label: "In the rings", group: "Story" },
    tools: { type: "text", label: "Integrations", group: "Story", hint: "Eight, split by |." },
    page: { type: "screen", label: "The page that was made", group: "Screens", hint: "Your product's screen, in place of the drawn page (16:10)." },
    mark: { type: "screen", label: "Logo", group: "Product", hint: "In place of the asterisk." },
  },
} satisfies Omit<AnimMeta, "id">;
