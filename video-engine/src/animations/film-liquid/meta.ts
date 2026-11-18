import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Liquid prompt",
  poster: { at: 2000 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "SVG goo (metaballs)", "Shimmer text"],
  blurb:
    "A 12.55 s launch film (it loops) for an AI product, on near-black: a dark sphere pulled into liquid splits in a flash of light and rings up in three pairs, collapses into a face that becomes a chat bubble; “Ask about anything”, huge, typed as the camera follows; ideas wheeling past, one picked and typed on as the prompt, the input it becomes, its send pressed, the agent thinking and starting to answer.",
  source: "Built for the engine, replicating the Runner launch film (measured cut by cut)",
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
    end: 12.55,
    look: "night",
    tone: { ground: "#141414", ink: "#d9d9d9", accent: "#3de8e4" },
    shots: [
      { name: "Liquid", at: 0, role: ["hook", "logo"], energy: 3, enter: "cut", exit: "flash" },
      { name: "Ask", at: 2.92, role: ["intro", "feature"], energy: 2, enter: "type", exit: "pan" },
      { name: "Prompt", at: 7.55, role: ["product", "feature"], energy: 2, enter: "pan", exit: "push-in" },
      { name: "Think", at: 11.06, role: ["product"], energy: 1, enter: "push-in", exit: "hold" },
    ],
  },
  schema: {
    name: { type: "text", label: "Name", group: "Product" },
    accent: { type: "color", label: "Accent", group: "Product" },
    ask: { type: "text", label: "The invitation", group: "Story" },
    ideas: { type: "text", label: "Ideas", group: "Story", hint: "Split by |; the last one is picked." },
    prompt: { type: "text", label: "Prompt", group: "Story" },
    thinking: { type: "text", label: "While it thinks", group: "Ending" },
    reply: { type: "text", label: "The answer begins", group: "Ending" },
    logo: { type: "screen", label: "Logo", group: "Product", hint: "Your mark, in place of the six-ball flower." },
  },
} satisfies Omit<AnimMeta, "id">;
