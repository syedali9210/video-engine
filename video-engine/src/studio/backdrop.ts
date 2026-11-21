// Backdrops: moving graphics behind words alone, so a scene of only text is never a still. One per such scene, chosen
// for the product and the film, drawn by animations/_film/backdrop.tsx as a pure function of the clock:
//   orbs      a few large soft lights drifting on slow loops at different depths
//   ribbons   wide soft bands of light flowing across the frame
//   grid      a floor of fine lines receding to a horizon, coming towards the camera
//   rings     thin circles opening out from behind the words, one as each word lands
//   streaks   long thin streaks of light crossing on a diagonal
//   dust      fine particles and a few out-of-focus ones rising slowly, with depth
//   contours  a handful of contour lines round a point off the words, slowly reshaping
// Held to the guardrails (guardrails.ts): one hue family, the brand's (light and chroma vary, the hue barely turns);
// never stronger than `TASTE.backdrop.alpha`, and quiet (`quiet`) behind the words themselves; its tempo the motion
// style's; it answers the words (`beats`: when each lands); it moves against the camera with depth (the renderer).
// Pure: no DOM.
import { hex, lch } from "../theme.ts"
import { TASTE } from "./guardrails.ts"

import { BACKDROPS, type Backdrop, type BackdropKind } from "./graph.ts"
export { BACKDROPS, type Backdrop, type BackdropKind }

/** what a product's own words point at, as the backdrops that suit it */
const BY_WORDS: [RegExp, BackdropKind[]][] = [
  [/\b(ai|agent|model|code|dev|api|data|infra|security|terminal|database|observab|trace|log|engine|render|pipeline|cloud)/i, ["grid", "streaks", "contours"]],
  [/\b(design|creative|music|art|video|film|photo|studio|brand|motion|animation)/i, ["ribbons", "rings", "orbs"]],
  [/\b(calm|mind|sleep|meditat|wellness|focus|journal|health)/i, ["dust", "contours", "orbs"]],
  [/\b(finance|bank|pay|money|invest|account|tax|legal|insur)/i, ["contours", "grid", "orbs"]],
  [/\b(game|sport|bet|fitness|run|win|social|chat|message)/i, ["streaks", "rings", "ribbons"]],
]
/** what a motion style moves like, as the backdrops that keep its tempo */
const BY_STYLE: Record<string, BackdropKind[]> = {
  soft: ["orbs", "ribbons", "dust", "contours"],
  kinetic: ["streaks", "rings", "grid"],
  tour: ["grid", "streaks", "ribbons"],
  orbit: ["rings", "orbs", "contours"],
  cta: ["ribbons", "rings", "orbs"],
}
const TEMPO: Record<string, number> = { soft: 0.7, kinetic: 1.45, tour: 1.15, orbit: 0.9, cta: 1 }

/** the backdrop's colours: the brand's hue held, light and chroma spread (a deep, a mid, a light), turned at most a
    few degrees either way so it stays one family */
export function backdropColors(accent: string, dark: boolean): string[] {
  const o = lch(accent)
  const h = o.c >= 0.03 ? o.h : 264
  const turn = Math.min(14, TASTE.hues / 3)
  return dark
    ? [hex({ l: 0.62, c: 0.17, h }), hex({ l: 0.74, c: 0.12, h: h - turn }), hex({ l: 0.86, c: 0.06, h: h + turn }), hex({ l: 0.5, c: 0.19, h: h + turn / 2 })]
    : [hex({ l: 0.97, c: 0.02, h }), hex({ l: 0.88, c: 0.07, h: h - turn }), hex({ l: 0.78, c: 0.11, h: h + turn }), hex({ l: 0.66, c: 0.15, h })]
}

/** The backdrop for a scene of words: what suits the product's words and the film's style, never the kind the scene
    before had (or any used already, while there are others), its colours the brand's, its beats the words landing. */
export function backdropFor(o: { accent: string; dark: boolean; style: string; words?: string; seed: number; used?: BackdropKind[]; beats?: number[]; quiet?: Backdrop["quiet"]; t0?: number }): Backdrop {
  const fromWords = BY_WORDS.find(([re]) => o.words && re.test(o.words))?.[1] ?? []
  const fromStyle = BY_STYLE[o.style] ?? BY_STYLE.soft
  // the ones both point at first, then the product's, then the style's
  const ranked = [...fromWords.filter((k) => fromStyle.includes(k)), ...fromWords, ...fromStyle, ...BACKDROPS].filter((k, i, a) => a.indexOf(k) === i)
  const fresh = ranked.filter((k) => !(o.used ?? []).includes(k))
  const pool = (fresh.length ? fresh : ranked).slice(0, 3)
  const kind = pool[Math.abs(Math.floor(o.seed)) % pool.length]
  return {
    kind,
    colors: backdropColors(o.accent, o.dark),
    dark: o.dark,
    speed: TEMPO[o.style] ?? 1,
    seed: Math.abs(Math.floor(o.seed)) % 997,
    beats: o.beats ?? [],
    quiet: o.quiet ?? { x: 0.5, y: 0.5, w: 0.3, h: 0.08 },
    amount: Math.min(TASTE.backdrop.alpha, o.dark ? 0.5 : 0.42),
    t0: o.t0 ?? 0,
  }
}
