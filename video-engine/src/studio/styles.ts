// Motion styles: how a film moves, as numbers the generator (compose.ts) and the camera (camera.ts) take, measured off
// reference films (npm run measure; pace.ts: their bursts of motion, how long each lasts, how often, how many snap,
// how long the stills between are, their curves) and read off their frames. A style says how long a scene takes to
// become the next (T), how long a scene holds once its own animation is done before it starts to leave (hold), the
// curve of each kind of move, how the camera trails, how lines arrive, and which cuts it reaches for.
//   soft     the first reference (a 42 s launch film): ~1 s morphs, smooth through every key, a floating camera
//   kinetic  the 2×2 film's top left: a new idea every ~0.77 s, 57% snaps, ~0.2 s stills; frame-in-frame, word swaps
//   tour     its top right: the camera tours the product's UI: snap zooms (~0.2 s) between framings, slow drifts in
//            them, close-ups on what's pressed, a glow sweeping from one view to the next
//   orbit    its bottom left: long moves (~1.8 s) that spin up (ease-in), arrivals out of a glow, lines that come in
//            turned and settle straight, ~1.3 s stills
//   cta      its bottom right: changes of 0.1–0.37 s (in-out strong) between ~1.1 s reads; the full stop becomes a
//            dot that grows into a circle, a grey placeholder becomes the card, words one by one, a white wipe from
//            the corner
// Pure: no DOM.
import type { Ease } from "./graph.ts"
import type { Profile } from "./pace.ts"

export type Cut = "morph" | "iris" | "push" | "blur" | "slide" | "snap" | "dot" | "wipe" | "sweep"
export type Words = "wipe" | "word" | "swap" | "rotate"
export type MotionStyle = {
  id: string
  name: string
  /** what it was measured from */
  from: string
  /** a scene becoming the next (s) */
  T: number
  /** still, once a scene's own animation is done, before it starts to leave (s) */
  hold: number
  /** the curve of a thing arriving, leaving, a shape becoming another, a move inside a scene, the camera's */
  ease: { enter: Ease; exit: Ease; morph: Ease; move: Ease; cam: Ease }
  /** how far behind its path the camera trails (s) */
  lag: number
  /** how lines arrive, and (by word) how far apart the words */
  words: Words
  wordStep: number
  /** the cuts it reaches for, first most */
  cuts: Cut[]
  /** the camera: how much it creeps in a scene (zoom a second), a punch on a beat (zoom), a snap's length (s), how
      close it goes on what's pressed or typed into (zoom), and whether it goes through a cut (zoom at the cut) */
  camera: { drift: number; punch: number; snap: number; interact: number; through: number }
  /** how fast its scenes play their own animation (1: as built) */
  speed: number
}

export const STYLES: Record<string, MotionStyle> = {
  soft: {
    id: "soft",
    name: "Soft morph",
    from: "the first reference: 46 s, no cuts, ~1.4 s moves easing out, ~0.64 s morphs",
    T: 0.96,
    hold: 0.4,
    ease: { enter: "smooth", exit: "smooth", morph: "smooth", move: "smooth", cam: "smooth" },
    lag: 0.26,
    words: "wipe",
    wordStep: 0.12,
    cuts: ["morph", "blur", "push", "slide"],
    camera: { drift: 0.015, punch: 0, snap: 0.6, interact: 1.5, through: 1.16 },
    speed: 1,
  },
  kinetic: {
    id: "kinetic",
    name: "Kinetic type",
    from: "2×2 top left: a burst every 0.77 s lasting 0.57 s, 57% snaps, 0.19 s stills, ease-out",
    T: 0.45,
    hold: 0.3,
    ease: { enter: "out", exit: "in", morph: "inOut", move: "out", cam: "out" },
    lag: 0.06,
    words: "swap",
    wordStep: 0.1,
    cuts: ["snap", "morph", "iris", "push"],
    camera: { drift: 0.03, punch: 0.06, snap: 0.25, interact: 1.4, through: 1.12 },
    speed: 1.25,
  },
  tour: {
    id: "tour",
    name: "UI tour",
    from: "2×2 top right: a burst every 1.33 s lasting 0.75 s, 57% snaps (snap zooms), 0.52 s stills, ease-out",
    T: 0.5,
    hold: 0.5,
    ease: { enter: "out", exit: "in", morph: "inOut", move: "out", cam: "out" },
    lag: 0.08,
    words: "wipe",
    wordStep: 0.1,
    cuts: ["snap", "sweep", "morph", "push"],
    camera: { drift: 0.04, punch: 0.1, snap: 0.22, interact: 1.7, through: 1.2 },
    speed: 1.1,
  },
  orbit: {
    id: "orbit",
    name: "Orbit",
    from: "2×2 bottom left: a burst every 2.18 s lasting 1.78 s (spin-ups, ease-in), 1.27 s stills",
    T: 0.6,
    hold: 0.8,
    ease: { enter: "out", exit: "in", morph: "inOut", move: "in", cam: "smooth" },
    lag: 0.18,
    words: "rotate",
    wordStep: 0.12,
    cuts: ["iris", "dot", "snap", "morph"],
    camera: { drift: 0.02, punch: 0, snap: 0.4, interact: 1.4, through: 1.1 },
    speed: 1,
  },
  cta: {
    id: "cta",
    name: "Call to action",
    from: "2×2 bottom right: changes of 0.1–0.37 s (in-out strong, snaps) between 1.1 s reads, ease-out",
    T: 0.3,
    hold: 1.0,
    ease: { enter: "out", exit: "in", morph: "inOut", move: "out", cam: "out" },
    lag: 0.07,
    words: "word",
    wordStep: 0.1,
    cuts: ["dot", "wipe", "morph", "snap"],
    camera: { drift: 0.02, punch: 0.05, snap: 0.2, interact: 1.5, through: 1.1 },
    speed: 1.2,
  },
}
export const STYLE_IDS = Object.keys(STYLES)

/** A style from any measured film (npm run measure): its transition window its bursts' length, its hold its stills,
    its curves from its commonest one, snappy where most of its bursts are snaps. */
export function styleFromProfile(p: Profile, base: MotionStyle = STYLES.soft): MotionStyle {
  const T = Math.min(1.1, Math.max(0.2, p.trans || p.morph))
  const snappy = (p.snaps ?? 0) >= 0.4
  const curve: Ease = /in-out/.test(p.eventEase ?? "") ? "inOut" : /ease-in/.test(p.eventEase ?? "") ? "in" : /out/.test(p.eventEase ?? p.ease) ? "out" : "smooth"
  return {
    ...base,
    id: p.name,
    name: p.name,
    from: `measured: ${p.source ?? p.name}`,
    T,
    hold: Math.min(1.4, Math.max(0.2, p.gap ?? p.hold)),
    ease: { enter: curve === "in" ? "out" : curve, exit: "in", morph: curve === "smooth" ? "smooth" : "inOut", move: curve, cam: snappy ? "out" : "smooth" },
    lag: snappy ? 0.07 : 0.2,
    cuts: snappy ? ["snap", "morph", "iris", "push"] : base.cuts,
    camera: { ...base.camera, snap: snappy ? 0.22 : 0.5 },
    speed: Math.min(1.4, Math.max(0.8, 0.96 / Math.max(0.3, T))),
  }
}

/** The style a product's film takes when none is asked for: by its tone (bold: kinetic; bright: a tour of its UI when
    it has screens, else the call-to-action style; calm: soft), so different products don't move alike. */
export function styleFor(tone: "calm" | "bright" | "bold" | undefined, has: { screens?: boolean }) {
  if (tone === "bold") return STYLES.kinetic
  if (tone === "bright") return has.screens ? STYLES.tour : STYLES.cta
  return STYLES.soft
}
