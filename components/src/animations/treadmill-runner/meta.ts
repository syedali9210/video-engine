import type { AnimMeta } from "../../registry";

// Imported from index.html: its values were found in the code and made params (see public/anim/treadmill-runner/index.html).
export default {
  name: "Treadmill Runner",
  category: "UI Patterns",
  tech: ["HTML","CSS"],
  blurb: "Imported from index.html, with 1 of its values to tune.",
  source: "Imported: index.html",
  behavior: { trigger: "ambient", frequency: "occasional" },
  reducedMotion: "none",
  reducedMotionNote: "Imported as it was written: check what it does under reduced motion.",
  html: true,
  layout: "fill",
  params: {
    "colour05040f": "#05040f",
  },
  schema: {
    "colour05040f": { type: "color", label: "Colour #05040f", group: "Colours" },
  },
} satisfies Omit<AnimMeta, "id">;
