import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Feature unfold",
  poster: { at: 4600 },
  category: "Launch films",
  tech: ["React", "Deterministic timeline", "A camera that follows the container", "The product's own DOM", "Composed OKLCH fields"],
  blurb:
    "One feature's panel, built in front of you (6.4 s): a blob lands, stretches into a pill hugging its title as it's typed (the camera riding along), holds, then drops open, the properties arriving as the edge passes them, the camera following it down to the buttons forming at the bottom, one pressed; then it pulls back to the whole panel. The product's own panel when it's been captured from the running app; seen from an angle, with a soft depth of field, on a composed field of the brand's colour.",
  source: "Built for the engine: how the director shows a feature that is a panel in the product's code",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react"],
  includes: ["_film"],
  load: () => import("./index"),
  params,
  // no `film` shot list: it isn't a template to cast whole into other films. The director places it (screenplay.ts),
  // with the panel's own words as its values; a scene plays it from 0 at the scene's rate.
  schema: {
    src: { type: "text", label: "Captured panel", group: "Panel", hint: "The product's own panel, captured from the running app (/__film/panel-capture). Empty: drawn from the words below." },
    title: { type: "text", label: "Title", group: "Panel", hint: "Typed into the pill, the camera riding along." },
    rows: { type: "text", label: "Properties", group: "Panel", hint: "Split by |; “Label: value” or a line of text. Up to six." },
    ctas: { type: "text", label: "Buttons", group: "Panel", hint: "Split by |; the first is the main one. Up to three." },
    panel: { type: "select", label: "Drawn panel", group: "Look", options: ["light", "dark", "glass"] },
    accent: { type: "color", label: "Brand colour", group: "Look" },
    variant: { type: "select", label: "Ground", group: "Look", options: ["diagonal", "mirror", "horizon", "spot"] },
    ground: { type: "select", label: "Ground drawn", group: "Look", options: ["field", "none"] },
    angle: { type: "number", label: "Camera angle", group: "Camera", min: 0, max: 35, step: 1, unit: "°" },
    blur: { type: "number", label: "Depth blur", group: "Camera", min: 0, max: 1, step: 0.05 },
    grain: { type: "number", label: "Grain (this scene)", group: "Look", min: 0, max: 1, step: 0.05 },
    press: { type: "boolean", label: "Press the main button", group: "Panel" },
    font: { type: "text", label: "Font", group: "Look", hint: "A family already loaded (the brand's); empty: Geist." },
  },
} satisfies Omit<AnimMeta, "id">;
