import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Macro glide",
  poster: { at: 9000 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "CSS 3D", "Depth of field by mask", "Baked layers", "Screen slot"],
  blurb:
    "A 12.35 s product demo (it loops) of an editor laid flat in the dark: its clips grow onto the timeline, the playhead sets off and the panel's edge lights up; a macro glide along the timeline in shallow focus; the play button in close-up, lit, its light rising, pressed into pause as a halo opens round it.",
  source: "Built for the engine, replicating a timeline editor's macro film (measured cut by cut)",
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
    end: 12.35,
    look: "night",
    shots: [
      { name: "Wide", at: 0, role: ["intro", "product"], energy: 1, enter: "cut", exit: "push-in" },
      { name: "Macro", at: 4.35, role: ["detail", "product"], energy: 1, enter: "push-in", exit: "cut" },
      { name: "Play", at: 7.55, role: ["detail", "cta"], energy: 2, enter: "cut", exit: "hold" },
    ],
  },
  schema: {
    accent: { type: "color", label: "Accent", group: "Product" },
    tracks: { type: "text", label: "Layers", group: "App", hint: "Six, split by |." },
    sections: { type: "text", label: "Sections", group: "App", hint: "Five, split by |." },
    clips: { type: "text", label: "Clips", group: "App", hint: "Four, split by |." },
    screen: { type: "screen", label: "Your app", group: "Screens", hint: "Your editor in place of the drawn one (about 2.4:1): the camera glides over it; the play button stays." },
  },
} satisfies Omit<AnimMeta, "id">;
