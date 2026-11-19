import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Composed field",
  poster: { at: 2000 },
  category: "Launch films",
  tech: ["React", "OKLCH", "Deterministic timeline"],
  blurb:
    "The ground a directed film sits on: one brand-hue family laid out by role (a saturated mass, a highlight, a tint haze, a dark corner for depth), in a diagonal, its mirror, a horizon or a spotlight, drifting slowly. Grain only where a scene asks for it.",
  source: "Built for the engine: the director's world (src/studio/field.ts)",
  behavior: { trigger: "ambient", frequency: "frequent" },
  reducedMotion: "none",
  reducedMotionNote: "It drifts a little; a film plays as cut.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  load: () => import("./index"),
  params,
  schema: {
    accent: { type: "color", label: "Brand colour", group: "Field" },
    variant: { type: "select", label: "Composition", group: "Field", options: ["diagonal", "mirror", "horizon", "spot"] },
    dark: { type: "boolean", label: "Deep", group: "Field" },
    grain: { type: "number", label: "Grain (this scene)", group: "Field", min: 0, max: 1, step: 0.05 },
    at: { type: "number", label: "Starts at", group: "Field", min: 0, max: 600, step: 0.1, unit: "s", hint: "Where in the film it is, so it drifts on through the cuts." },
  },
} satisfies Omit<AnimMeta, "id">;
