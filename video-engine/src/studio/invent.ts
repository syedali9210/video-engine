// Studio — the inventor: new films, not new arrangements of the old ones. A film is written from a grammar of beats
// (a close detail, a view from over the top or from below, a reveal, a turn, a dive into the screen, a title card,
// the name) drawn from the engine's whole vocabulary of angles and moves, in one of a few shapes (a night reveal, a
// tonal tour, a pop cut, a paper calm, a keynote, a blend), on a look matched to the product's own colour, with its
// timings and curves by the guidelines. What it writes is a script, so the checker reads it, the lab can improve it,
// and the Studio edits it like any other. Seeded: the same seed writes the same film.
import type { Harmony } from "../theme"
import type { TextEnter, Transition } from "./comp"
import type { AngleId, MotionId } from "./poses"
import type { ScriptLayer, ScriptShot, TemplateScript } from "./script"
import { smoothCuts } from "./cuts.ts"

export type Rng = () => number
/** mulberry32: small, fast, and the same numbers for the same seed everywhere */
export function rng(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const pick = <T,>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const jit = (r: Rng, v: number, by: number) => +(v + (r() * 2 - 1) * by).toFixed(2)

// the guidelines' curves (§3): glides at a constant speed, into a cut accelerating
const LINEAR = "cubic-bezier(0, 0, 1, 1)"
const INTO_CUT = "cubic-bezier(0.42, 0, 1, 1)"
// a close shot keeps one band in focus, tilted with the device (§4)
const focus = (at: number, to: number | null, angle = -8) => ({ focus: { at, to, size: 0.28, blur: 0.62, angle }, vignette: 0.45, bloom: 0.22 })

type TitleOpts = { y?: number; size?: number; enter?: TextEnter; font?: "text" | "display" | "mono"; weight?: number; w?: number }
const title = (text: string, o: TitleOpts = {}): ScriptLayer => ({ kind: "text", text, box: { x: 0.5, y: o.y ?? 0.5, w: o.w ?? 0.72 }, size: o.size ?? 9, weight: o.weight ?? 600, align: "center", enter: o.enter ?? "words", color: "", font: o.font ?? "display" })

export type Beat = (r: Rng) => ScriptShot
const D = "{device}" as const

/* ---------------- beats ---------------- */

const detailTop: Beat = (r) => {
  const roll = jit(r, -10, 3)
  const yaw = jit(r, -14, 4)
  const z = jit(r, 2.5, 0.15)
  return {
    name: "The top, close",
    dur: jit(r, 3.4, 0.3),
    why: "Open close on the part everyone knows (the time, the island, the first row), new because it's this near; it speeds up into the cut. (2.1, 3.3, 4.1)",
    device: { id: D, from: { angle: "front", zoom: z, rise: -0.62, roll, yaw, elev: 14 }, to: { zoom: z + 0.25, rise: -0.7, roll: roll - 1, yaw: yaw - 2, elev: 14 }, ease: INTO_CUT },
    fx: focus(0.36, null, roll),
  }
}
const detailEdge: Beat = (r) => ({
  name: "Along the edge",
  dur: jit(r, 3.6, 0.3),
  why: "The band in the foreground and the screen falling away from it: how thin it is, then the light on the glass. (3.7, 4.1)",
  device: { id: D, from: { angle: "edge" }, move: "drift" },
  fx: focus(0.5, null, -4),
})
const overTop: Beat = (r) => ({
  name: "Over the top",
  dur: jit(r, 3.4, 0.3),
  why: "Looking down over its top edge, the screen falling away below: a view a phone is rarely shown from, so it reads as new. (3.1)",
  device: { id: D, from: { angle: "over" }, move: pick(r, ["push", "drift"] as const) },
  fx: { focus: { at: 0.58, to: 0.72, size: 0.32, blur: 0.5, angle: 0 }, vignette: 0.4, bloom: 0.18 },
})
const topDown: Beat = (r) => ({
  name: "From above",
  dur: jit(r, 3.6, 0.3),
  why: "Straight down onto it lying on the table, turned off square: the screen whole and flat, a calm opening. (3.1)",
  device: { id: D, from: { angle: "top" }, move: pick(r, ["push", "drift"] as const) },
})
const lying: Beat = (r) => ({
  name: "Lying back",
  dur: jit(r, 3.8, 0.3),
  why: "It lies back on the table and the camera glides along it at an even speed, one long dolly. (3.2)",
  device: { id: D, from: { angle: "lying", rise: 0.08, pan: -0.04 }, to: { rise: -0.08, pan: 0.04 }, ease: LINEAR },
})
const REVEAL: Partial<Record<MotionId, { name: string; why: string }>> = {
  fall: { name: "It drops in", why: "It falls into the light under gravity and bounces once, twice, settles: the reveal has weight. (3.4)" },
  crane: { name: "From high above", why: "The camera lowers from high above onto the whole phone: the detail shots earn this wide view. (2, 3.5)" },
  flip: { name: "Edge to face", why: "Edge on, it turns to face the camera and glides on: a product film's reveal. (3.5)" },
  roll: { name: "Rolls in", why: "It rolls in a quarter turn and settles: a reveal with a twist in it. (3.5)" },
  spin: { name: "Back to front", why: "From its back, a full turn round to the screen: the keynote's reveal. (3.5)" },
  rise: { name: "Rises in", why: "It rises into the frame and settles, small, in the middle: the whole thing, at last. (2, 3.5)" },
}
const reveal =
  (kind: MotionId): Beat =>
  (r) => ({
    name: REVEAL[kind]?.name ?? "The reveal",
    dur: jit(r, 3.8, 0.3),
    why: REVEAL[kind]?.why ?? "The whole device, earned after the details. (2)",
    device: { id: D, from: { angle: pick(r, ["hero", "heroLeft", "worm"] as const) }, move: kind },
  })
const TURN: Partial<Record<MotionId, { name: string; why: string }>> = {
  turntable: { name: "One whole turn", why: "One turn at an even speed, as on a stand: every side of it in one take. (3.1)" },
  arc: { name: "Around it", why: "The camera travels round it in a wide arc, closing in: the space around it, not just the face. (3.1)" },
  vertigo: { name: "Dolly zoom", why: "It stays the same size while the space around it stretches: one strange, memorable moment. (3.1)" },
  turn: { name: "The hero turn", why: "One slow turn past the shot, the camera drifting closer. (3.1)" },
}
const turn =
  (kind: MotionId): Beat =>
  (r) => ({
    name: TURN[kind]?.name ?? "The turn",
    dur: jit(r, kind === "turntable" ? 4.6 : 3.8, 0.3),
    why: TURN[kind]?.why ?? "A turn, so the take never freezes. (3.1)",
    device: { id: D, from: { angle: pick(r, ["hero", "front", "heroLeft"] as const), zoom: 0.92 }, move: kind },
  })
const profile: Beat = (r) => ({
  name: "Edge on",
  dur: jit(r, 3.2, 0.3),
  why: "Side on: the band, the buttons, how thin it is, the one view a screen recording can't give. (3.1)",
  device: { id: D, from: { angle: "profile" }, move: pick(r, ["drift", "sway"] as const) },
})
const dutch: Beat = (r) => ({
  name: "Off the level",
  dur: jit(r, 2.4, 0.2),
  why: "Rolled off the level and swinging away fast at the end: energy, and a cut hidden in the swing. (3.3, 5.1)",
  device: { id: D, from: { angle: "dutch" }, move: "whip" },
})
const worm: Beat = (r) => ({
  name: "From below",
  dur: jit(r, 3.2, 0.3),
  why: "From below on a wide lens it towers: the product as a monument, for one shot. (3.1)",
  device: { id: D, from: { angle: "worm" }, move: pick(r, ["push", "turn"] as const) },
})
const swing =
  (from: AngleId, name: string): Beat =>
  (r) => ({
    name,
    dur: jit(r, 1.7, 0.2),
    why: "A short look from a new side that swings away at its end: in a montage, every shot hands the next its speed. (3.3, 5.3)",
    device: { id: D, from: { angle: from, zoom: jit(r, 1.05, 0.08) }, move: "whip" },
  })
const dive: Beat = (r) => ({
  name: "Into the screen",
  dur: jit(r, 3, 0.25),
  why: "It turns to face us and the camera pushes in until the screen fills the frame: the cut lands inside the interface. (3.3, 5.2)",
  device: { id: D, from: { angle: pick(r, ["hero", "heroLeft", "front"] as const) }, move: "dive" },
})
const card =
  (text: string, enter: TextEnter, look?: Harmony): Beat =>
  (r) => ({
    name: text === "{hook}" ? "The hook" : text === "{tagline}" ? "The line" : "A feature",
    dur: jit(r, 2.2, 0.2),
    why: "One idea, on its own, big, arriving piece by piece; the device rests a beat so the words land. (6.1, 6.3, 6.4)",
    ...(look ? { look } : {}),
    layers: [title(text, { enter, size: text === "{hook}" ? 10 : 8.5 })],
  })
const feature =
  (text: string): Beat =>
  (r) => ({
    name: "The feature",
    dur: jit(r, 3.8, 0.3),
    why: "One feature in a few small words above the device as the camera pushes in: type rare and small over a device. (6.1, 6.2, 3.1)",
    device: { id: D, from: { angle: pick(r, ["hero", "heroLeft"] as const), zoom: 0.82, rise: -0.12 }, to: { zoom: 0.92, rise: -0.12 }, ease: LINEAR },
    layers: [title(text, { y: 0.11, size: 3.2, enter: "sweep", font: "text", weight: 500, w: 0.6 })],
  })
const end: Beat = (r) => ({
  name: "The name",
  dur: jit(r, 3.4, 0.2),
  why: "End on the name, small, its letters landing, the device settling under it. (2.4, 6.5)",
  device: { id: D, from: { angle: "front", zoom: 0.7, rise: -0.15 }, move: pick(r, ["rise", "reveal"] as const) },
  layers: [title("{name}", { y: 0.13, size: 4, enter: "letters" })],
})

/** A beat by its name in the grammar, the way an idea writes one down: "detail-top", "edge", "over", "top", "lying",
    "profile", "dutch", "worm", "dive", "end", "reveal:fall", "turn:arc", "swing:worm", "card:{hook}:letters[:light]",
    "feature:{feature1}". */
export function beatOf(id: string): Beat | null {
  const [k, a, b, c] = id.split(":")
  const simple: Record<string, Beat> = { "detail-top": detailTop, edge: detailEdge, over: overTop, top: topDown, lying, profile, dutch, worm, dive, end }
  if (simple[k]) return simple[k]
  if (k === "reveal" && REVEAL[a as MotionId]) return reveal(a as MotionId)
  if (k === "turn" && TURN[a as MotionId]) return turn(a as MotionId)
  if (k === "swing") return swing((a || "hero") as AngleId, b || "Swing past")
  if (k === "card") return card(a || "{tagline}", (b || "words") as TextEnter, (c || undefined) as Harmony | undefined)
  if (k === "feature") return feature(a || "{feature1}")
  return null
}
export const BEAT_NAMES = ["detail-top", "edge", "over", "top", "lying", "profile", "dutch", "worm", "dive", "end", ...Object.keys(REVEAL).map((m) => `reveal:${m}`), ...Object.keys(TURN).map((m) => `turn:${m}`)]

/* ---------------- shapes ---------------- */

type Step = { beat: Beat; cut?: Transition }
type Shape = { id: string; name: string; category: string; harmonies: Harmony[]; summary: string; why: string[]; steps: (r: Rng) => Step[] }

const SHAPES: Shape[] = [
  {
    id: "night",
    category: "teaser",
    name: "Night reveal",
    harmonies: ["deep", "tonal"],
    summary: "Two close details in a dark room, then the phone arrives in the light and turns; one line on a light card; the name.",
    why: ["Details before the whole: the reveal is earned.", "One dark room and one coloured light behind the device.", "A single light card is the only rest from the dark."],
    steps: (r) => [{ beat: detailTop }, { beat: pick(r, [detailEdge, overTop]) }, { beat: reveal(pick(r, ["fall", "crane", "flip"] as const)), cut: "flash" }, { beat: turn(pick(r, ["turntable", "arc"] as const)) }, { beat: card("{tagline}", "sweep", "light"), cut: "fade" }, { beat: end, cut: "fade" }],
  },
  {
    id: "tonal",
    category: "product-demo",
    name: "Tonal tour",
    harmonies: ["tonal"],
    summary: "Over the top, close on the screen, then into it; a feature card; the phone rolls in and turns edge on; the name. The device in the product's own colour.",
    why: ["Everything in one hue: the ground, the light, the case.", "The dive lands the cut inside the interface.", "Edge on, the one view a screen recording can't give."],
    steps: (r) => [{ beat: overTop }, { beat: detailTop }, { beat: dive }, { beat: card("{feature1}", "mask"), cut: "zoom" }, { beat: reveal("roll"), cut: "cut" }, { beat: profile }, { beat: end }],
  },
  {
    id: "pop",
    category: "feature-launch",
    name: "Pop cut",
    harmonies: ["pop", "complement"],
    summary: "A hook in big letters, then quick, rolled shots that whip into each other, a feature card, an arc, the name. Saturated, fast.",
    why: ["Short shots and whip pans: the cut hides in the swing.", "The colour itself as the ground, edge to edge.", "Big type only on cards, never over the device."],
    steps: (r) => [{ beat: card("{hook}", "letters") }, { beat: dutch, cut: "cut" }, { beat: worm }, { beat: reveal("spin"), cut: "flash" }, { beat: card("{feature1}", "settle"), cut: "cut" }, { beat: turn("arc"), cut: "cut" }, { beat: end }],
  },
  {
    id: "paper",
    category: "brand",
    name: "Paper calm",
    harmonies: ["light", "analogous"],
    summary: "From above, then lying back on a pale table, slow and even; a feature card; it rises in; a dolly zoom; the name. Bright and quiet.",
    why: ["Slow, even glides: calm is a pace.", "A pale ground and dark type.", "One strange moment (the dolly zoom) in an otherwise still film."],
    steps: (r) => [{ beat: topDown }, { beat: lying }, { beat: card("{feature1}", "mask"), cut: "cut" }, { beat: reveal(pick(r, ["rise", "crane"] as const)) }, { beat: turn("vertigo") }, { beat: end }],
  },
  {
    id: "keynote",
    category: "product-launch",
    name: "Keynote",
    harmonies: ["deep"],
    summary: "A line swept by light, the phone spinning round from its back, edge on, one whole turn, the line, the name. A keynote reveal.",
    why: ["The spin from the back is the keynote's reveal.", "The turntable shows every side in one take.", "Dark room, rims of light on the edges."],
    steps: (r) => [{ beat: card("{hook}", "sweep") }, { beat: reveal("spin"), cut: "flash" }, { beat: profile }, { beat: turn("turntable") }, { beat: card("{tagline}", "fade", "tonal"), cut: "fade" }, { beat: end, cut: "fade" }],
  },
  {
    id: "blend",
    category: "feature-launch",
    name: "Blend",
    harmonies: ["analogous", "tonal"],
    summary: "Edge to face, close on the top and along the edge, into the screen, a feature, the feature in context, the name. Soft, blended colour.",
    why: ["Close details after the reveal, then into the interface.", "A soft gradient through neighbouring hues.", "The feature said twice: alone, then over the device."],
    steps: (r) => [{ beat: reveal("flip") }, { beat: detailTop }, { beat: detailEdge }, { beat: dive }, { beat: card("{feature2}", "words"), cut: "zoom" }, { beat: feature("{feature1}"), cut: "cut" }, { beat: end }],
  },
  {
    id: "dive",
    category: "product-demo",
    name: "Through the screen",
    harmonies: ["deep", "tonal"],
    summary: "Close on the top, then into the screen; out the other side on a feature; it flips round, dives again, and lands on the line; the name. One continuous push, chapter after chapter.",
    why: ["Every dive goes on through the frame: the film is one push, cut in places.", "Each chapter lands inside the interface, then pulls back out to the device.", "The words arrive on the far side of a push, never on a dip."],
    steps: (r) => [{ beat: detailTop }, { beat: dive }, { beat: card("{feature1}", pick(r, ["mask", "settle"] as const)) }, { beat: reveal("flip") }, { beat: dive }, { beat: card("{tagline}", "sweep") }, { beat: end }],
  },
  {
    id: "whips",
    category: "social",
    name: "Whip montage",
    harmonies: ["pop", "deep"],
    summary: "A hook, then short looks from new sides, each swinging away into the next (below, over the top, edge on, off the level); it spins in; the name. Fast, and every cut carried by the swing.",
    why: ["Each shot ends in a swing the next one catches: speed handed on, never a jolt.", "Short shots (about 1.7 s) for a feed; the reveal gets twice as long.", "The colour is the ground, edge to edge."],
    steps: (r) => [{ beat: card("{hook}", "letters") }, { beat: swing("worm", "From below") }, { beat: swing(pick(r, ["over", "top"] as const), "Over it") }, { beat: swing("profile", "Edge on") }, { beat: swing("dutch", "Off the level") }, { beat: reveal("spin") }, { beat: end }],
  },
]

/** A new film for `seed`: one of the shapes (consecutive seeds take different ones), its beats varied by the seed,
    on a look in one of the shape's harmonies. */
export function invent(seed: number): TemplateScript {
  const shape = SHAPES[((seed % SHAPES.length) + SHAPES.length) % SHAPES.length]
  const r = rng(seed + 17)
  const harmony = pick(r, shape.harmonies)
  const shots = shape.steps(r).map((s, i) => {
    const shot = s.beat(r)
    return i ? { ...shot, cut: s.cut ?? "cut" } : shot
  })
  const named = shots.find((s) => s.device?.move && REVEAL[s.device.move])?.name
  // every cut given what carries it, read from how the shots either side move (cuts.ts)
  return smoothCuts({
    id: `invented-${shape.id}-${seed}`,
    name: shape.name,
    version: 1,
    source: `invented by the engine (shape “${shape.name}”, seed ${seed})`,
    category: shape.category,
    summary: `${shape.summary}${named ? ` (${named.toLowerCase()}.)` : ""}`,
    size: "16x9",
    ground: harmony === "light" || harmony === "analogous" || harmony === "studio" ? "white" : "black",
    look: { harmony, seed },
    why: shape.why,
    avoid: ["A centred device held still while titles animate around it.", "Dissolves between two device shots.", "Big type over the device.", "A cut with nothing to carry it: a dip to a flat colour, a jump between alike framings, a move reversing."],
    shots,
  }).script
}

/** A film from beats named in the grammar (beatOf), the way an idea is developed: its cuts planned, its look matched. */
export function filmOf(o: { id: string; name: string; source: string; category: string; harmony: Harmony; summary: string; why: string[]; beats: string[]; seed: number; pace?: number; prefer?: Partial<Record<Transition, number>> }): TemplateScript {
  const r = rng(o.seed + 31)
  const k = Math.min(1.4, Math.max(0.7, o.pace ?? 1))
  const shots = o.beats.flatMap((id) => {
    const b = beatOf(id)
    if (!b) return []
    const sh = b(r)
    return [{ ...sh, dur: Math.round(sh.dur * k * 100) / 100 }]
  })
  return smoothCuts({
    id: o.id,
    name: o.name,
    version: 1,
    source: o.source,
    category: o.category,
    summary: o.summary,
    size: "16x9",
    ground: o.harmony === "light" || o.harmony === "analogous" || o.harmony === "studio" ? "white" : "black",
    look: { harmony: o.harmony, seed: o.seed },
    why: o.why,
    avoid: ["A cut with nothing to carry it.", "Big type over the device.", "A centred device held still while titles animate around it."],
    shots,
  }, o.prefer).script
}

export const SHAPE_COUNT = SHAPES.length
