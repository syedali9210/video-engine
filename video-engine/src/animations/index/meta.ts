import type { AnimMeta } from "../../registry";

// Imported from index.html: its values were found in the code and made params (see public/anim/index/index.html).
export default {
  name: "Index",
  category: "UI Patterns",
  tech: ["HTML","CSS"],
  blurb: "Imported from index.html, with 0 of its values to tune.",
  source: "Imported: index.html",
  behavior: { trigger: "ambient", frequency: "occasional" },
  reducedMotion: "none",
  reducedMotionNote: "Imported as it was written: check what it does under reduced motion.",
  html: true,
  layout: "fill",
  params: {

  },
  schema: {

  },
} satisfies Omit<AnimMeta, "id">;
