import type { AnimMeta } from "../../registry";
import { params } from "./params";

export default {
  name: "Animation Engine Launch",
  poster: { at: 13800 },
  category: "Launch films",
  tech: ["React", "Geist", "Deterministic timeline", "three.js (the Studio's own scene)", "the Kit's title animations"],
  blurb:
    "A 57 s launch film for the engine itself: the usual way to make a launch video as a pile of windows, collapsing into the mark's easing curve; your animations live in the real device frames; the Studio's own three.js phone under a moving camera; the Kit's title animations; templates by kind and the canvas, as real screenshots; one sentence to Claude through the MCP; the lab learning your taste. Export it from the Studio as a component filling a 16:9 frame.",
  source: "the engine's own UI (screenshots), its Studio scene, its Kit, its MCP server's messages",
  behavior: { trigger: "sequence", frequency: "rare" },
  reducedMotion: "none",
  reducedMotionNote: "It's a film: it plays as cut. Export it as a video for places that respect reduced motion.",
  layout: "fill",
  deps: ["react", "three"],
  includes: ["_film"],
  load: () => import("./index"),
  params,
  schema: {},
} satisfies Omit<AnimMeta, "id">;
