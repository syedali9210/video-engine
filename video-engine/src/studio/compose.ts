// The flow generator's second half: a flow (flow.ts: which scenes, what's in them) composed into a motion graph
// (graph.ts: elements with keyframes under one camera), every choice made here, by rule, for this product, in its
// motion style (styles.ts: the timings and curves measured off reference films):
//   - each scene kind has a builder with variants: lines thrown in huge and pulled back from, wiped on, risen, word by
//     word, or turned and settling straight; a prompt typed into a box that opens between two words; the mark out of a
//     dot and an iris of white; the product's panel built from a blob; its app opened from its icon; a tour of its UI
//     (the camera snapping from part to part, drifting in each, going close on what's pressed); logos arriving out of
//     a glow to orbit the mark and spinning up; cards becoming each other (from a grey placeholder); a stack going by;
//     the call round the mark's pill;
//   - each cut takes a transition: morph (the shape one scene ends on IS the shape the next starts from), iris, push,
//     blur, slide, snap (a cut, the next arriving at once and settling), dot (the line's full stop grows into a circle
//     that becomes the next ground), wipe (a disc of the next ground sweeping in from the corner), sweep (a glow
//     crossing the frame as one view becomes the next);
//   - the camera from the camera generator (camera.ts): creeping in a scene, going close on what's typed into or
//     pressed, through or snapping at the cuts;
//   - which variant and which cut: from what the two scenes can hand each other, the style's own preferences, the
//     product's tone and a seed from its name; any can be set by hand (Style).
// Every builder says when its own animation is done; `fit` makes each scene long enough to finish it, hold (the
// style's hold) and only then start to leave, so a scene never goes before it's played. Pure: no DOM.
import { composedField } from "./field.ts"
import type { Card, Flow, FlowScene, Ground } from "./flow.ts"
import type { CamKey, Cut, DofKey, Ease, El, Graph, GroundKey, Key } from "./graph.ts"
import { STYLES, styleFor, type Cut as CutKind, type MotionStyle } from "./styles.ts"
import { ANGLES, angleFor, atCut, inScene, layer, onFocus, shotEnd, shotFor, shotKeys, shotStart, type Angle, type Focus, type Framing, type Shot } from "./camera.ts"
import { assemble } from "./assemble.ts"
import { backdropFor, type BackdropKind } from "./backdrop.ts"
import { TASTE, judge, type Verdict } from "./guardrails.ts"

export type Transition = CutKind
export const TRANSITIONS: Transition[] = ["morph", "iris", "push", "blur", "slide", "snap", "dot", "wipe", "sweep"]
export type Tone = "calm" | "bright" | "bold"
/** the choices, any set by hand: the motion style, per scene a variant, per cut (index of the scene it goes into) a
    transition */
export type Style = { tone?: Tone; seed?: number; motion?: string; variants?: (string | null)[]; transitions?: (Transition | null)[] }
export const VARIANTS: Record<FlowScene["kind"], string[]> = {
  words: ["pullback", "wipe", "rise", "word", "rotate"],
  prompt: ["between", "center"],
  brand: ["dot", "rise"],
  panel: ["unfold"],
  component: ["assemble"],
  app: ["icon", "fly"],
  tour: ["tour"],
  orbit: ["orbit"],
  cards: ["morph", "skeleton"],
  stack: ["scroll"],
  end: ["pill"],
}

const W = 1920
const H = 1080
const CX = W / 2
const CY = H / 2
const WHITE = "#ffffff"
const INK = "#111114"
/** a rounded box handed from one scene to the next (world px) */
export type Shape = { x: number; y: number; w: number; h: number; r: number; fill: string; gl?: number }

/** about how wide a line is in a geometric sans at `size` px (the renderer measures exactly; layout only needs near) */
export function textW(s: string, size: number, weight = 500) {
  const narrow = "ijlt.,:;'!|fr ()[]"
  const wide = "mwMW@%"
  let u = 0
  for (const ch of s) u += narrow.includes(ch) ? 0.3 : wide.includes(ch) ? 0.82 : /[A-Z0-9]/.test(ch) ? 0.64 : 0.54
  return u * size * (weight >= 600 ? 1.04 : 1) * 0.97
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

/** the film's motion style: asked for (style.motion, flow.motion), or the one its tone and what it has call for */
export function styleOf(f: Flow): MotionStyle {
  const id = f.style?.motion ?? f.motion
  if (id && STYLES[id]) return STYLES[id]
  return styleFor(f.style?.tone ?? f.tone, { screens: f.scenes.some((s) => s.kind === "app" || s.kind === "tour") })
}
/** the transition window: the style's */
export const windowOf = (f: Flow) => styleOf(f).T

/* ---------------- what a scene starts from and ends on ---------------- */

const cardH = (c: Card) => (c.src ? (c.h ?? 300) : 64 + 52 + c.lines.length * 38 + (c.tag ? 46 : 0) + 28)
/** the shape a scene can be arrived at through (null: it arrives on its own) */
export function entryOf(s: FlowScene, v: string): Shape | null {
  if (s.kind === "brand" && v === "dot") return { x: CX, y: CY, w: 70, h: 70, r: 35, fill: WHITE }
  if (s.kind === "panel") return { x: CX, y: CY, w: 236, h: 236, r: 118, fill: s.panel.surface ?? WHITE }
  if (s.kind === "app" && v === "icon") return { x: CX, y: CY, w: 220, h: 220, r: 50, fill: WHITE }
  if (s.kind === "cards" || s.kind === "stack") return { x: CX, y: CY, w: v === "skeleton" ? 520 : 900, h: v === "skeleton" ? cardH(s.cards[0]) * 0.62 : cardH(s.cards[0]), r: 24, fill: v === "skeleton" ? "#8b8f8d" : WHITE }
  if (s.kind === "end") return { x: CX, y: CY, w: 560, h: 170, r: 34, fill: WHITE, gl: 1 }
  if (s.kind === "orbit") return { x: CX, y: CY, w: 128, h: 128, r: 64, fill: INK }
  return null
}
/** whether a scene ends on a shape it can hand on */
export const handsOn = (s: FlowScene, v: string) => s.kind === "prompt" || (s.kind === "brand" && v === "dot") || (s.kind === "app" && v === "icon") || s.kind === "cards" || s.kind === "stack"
/** whether a scene ends on a line (a dot can grow out of its full stop) */
const endsOnWords = (s: FlowScene) => s.kind === "words" || s.kind === "end" || s.kind === "brand"
const groundFill = (g: Ground, field: string) => (g.tone === "white" ? WHITE : g.tone === "dark" ? "#08080a" : g.tone === "light" ? "#f2f2f5" : g.tone === "image" ? "#0b0b0d" : field)
const sameGround = (a: Ground, b: Ground) => JSON.stringify(a) === JSON.stringify(b)

/* ---------------- the choices ---------------- */

/** Every scene's variant and every cut's transition, chosen: what was set by hand where it can be done, else by rule
    for this product: what two scenes can hand each other, its style's own cuts first, its tone, a seed from its name. */
export function choose(f: Flow, st: Style = f.style ?? {}) {
  const ms = styleOf({ ...f, style: st })
  const tone: Tone = st.tone ?? f.tone ?? "bright"
  let seed = st.seed ?? hash(f.name)
  const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000
  const variants = f.scenes.map((s, i) => {
    const want = st.variants?.[i]
    if (want && VARIANTS[s.kind].includes(want)) return want
    if (s.kind === "words") {
      if ((s.big || i === 0) && ms.id !== "cta" && tone !== "calm") return "pullback"
      if (ms.words === "word") return "word"
      if (ms.words === "rotate") return f.scenes[i - 1]?.kind === "words" || rnd() < 0.5 ? "rotate" : "word"
      return f.scenes[i - 1]?.kind === "words" ? (rnd() < 0.5 ? "rise" : "wipe") : "wipe"
    }
    if (s.kind === "app") return "icon"
    if (s.kind === "brand") return f.scenes[i - 1]?.kind === "prompt" || tone !== "calm" ? "dot" : "rise"
    if (s.kind === "prompt") return f.scenes[i - 1]?.kind === "words" ? "between" : "center"
    if (s.kind === "cards") return ms.id === "cta" || ms.id === "tour" ? "skeleton" : "morph"
    return VARIANTS[s.kind][0]
  })
  const used: (Transition | null)[] = []
  const transitions = f.scenes.map((s, i): Transition | null => {
    const t = pickCut(s, i)
    used.push(t)
    return t
  })
  function pickCut(s: FlowScene, i: number): Transition | null {
    if (i === 0) return null
    const a = f.scenes[i - 1]
    const differ = !sameGround(a.ground as Ground, s.ground as Ground)
    const can: Record<Transition, boolean> = { morph: handsOn(a, variants[i - 1]) && !!entryOf(s, variants[i]), dot: endsOnWords(a) && differ, iris: differ, wipe: differ, snap: true, push: true, blur: true, slide: true, sweep: true }
    const want = st.transitions?.[i]
    if (want && can[want]) return want
    // a shape handed on is taken (most of the time in a style of cuts); a word swapped in place stays a blur
    if (can.morph && ms.cuts.includes("morph") && (ms.cuts.indexOf("morph") < 3 || rnd() < 0.5)) return "morph"
    if (a.kind === "words" && s.kind === "words" && ms.words === "swap") return "blur"
    // (into the mark's own white the brand opens its iris itself: arrive at it plainly)
    const order = ms.cuts.filter((c) => can[c] && c !== "morph" && !(s.kind === "brand" && (c === "dot" || c === "iris" || c === "wipe")))
    if (!order.length) return tone === "calm" ? "blur" : "push"
    // the first the style reaches for; its second only after the first was just used, and then by the seed (a film
    // keeps its signature cut, products don't all cut alike, and the same cut doesn't come three times running)
    const last = used[i - 1]
    return order.length > 1 && last === order[0] && (used[i - 2] === order[0] || rnd() < 0.5) ? order[1] : order[0]
  }
  return { tone, motion: ms.id, variants, transitions }
}

/* ---------------- building ---------------- */

type Out = {
  els: El[]
  cam: CamKey[]
  dof: DofKey[]
  ground?: GroundKey
  out?: { id: string; shape: Shape }
  enter: string[]
  leave: string[]
  /** when its own animation is done (s) */
  done: number
  /** where its camera rests, and whether it's a still scene the camera creeps in */
  frame: Framing
  /** where its camera is when it leaves, when that isn't where it rests (a tour ends pulled back, square on) */
  exit?: Framing
  still?: boolean
  focus?: Focus[]
  /** where its last line ends (a dot can grow from there) */
  lineEnd?: { x: number; y: number }
}
/** `angle`: the angle a product scene's own camera takes (camera.ts angleFor: none the film has used) */
type Ctx = { i: number; S: number; E: number; T: number; v: string; f: Flow; st: MotionStyle; ink: string; quiet: string; tin: Transition | null; tout: Transition | null; angle?: Angle }
const el = (id: string, kind: El["kind"], a: number, b: number, z: number, keys: Key[], c?: El["c"]): El => ({ id, kind, a, b, z, keys, ...(c ? { c } : {}) })
const REST: Framing = { x: CX, y: CY, z: 1, rx: 0, ry: 0 }
const inkOn = (g: Ground, ink: string) => (g.tone === "image" ? (g.ink ?? WHITE) : g.tone === "white" || g.tone === "light" ? INK : ink)
const soft = (st: MotionStyle, e: Ease): Ease | undefined => (st.ease.move === "smooth" ? undefined : e)

/** a line: thrown in huge and pulled back from, wiped on, risen out of a blur, word by word (the second half in the
    accent), or turned a quarter and settling straight as its words arrive; then creeping closer */
function words(s: Extract<FlowScene, { kind: "words" }>, x: Ctx): Out {
  const { S, E, T, f, st } = x
  const id = `w${x.i}`
  const size = 68
  const len = Math.max(4, s.text.length)
  const cps = f.pace.revealCps * st.speed
  const w = textW(s.text, size)
  const n = s.text.split(/\s+/).filter(Boolean).length
  const ink = inkOn(s.ground as Ground, x.ink)
  const keys: Key[] = [{ t: S - T / 2, x: CX, y: CY }]
  let done = S + len / cps
  const c: NonNullable<El["c"]> = { text: s.text, size, color: ink, align: "center" }
  if (x.v === "pullback") {
    const big = 4.2
    const b0 = x.i === 0 ? 0.15 : S
    keys.push({ t: b0 - T / 2, x: CX + (big * w) / 2 - 300, s: big, reveal: 0, blur: 2 }, { t: b0 + 0.55, x: CX + (big * w) / 2 - 300, s: big, reveal: 0.42, blur: 1.2 }, { t: b0 + 0.95, x: CX, s: 1, reveal: 0.47, blur: 0, ...(soft(st, "out") ? { e: "out" as Ease } : {}) }, { t: b0 + 0.95 + (len * 0.55) / cps, reveal: 1 })
    done = b0 + 0.95 + (len * 0.55) / cps
  } else if (x.v === "rise") {
    keys.push({ t: S - T / 2, y: CY + 34, blur: 9, reveal: 1 }, { t: S + T / 2, y: CY, blur: 0, ...(soft(st, st.ease.enter) ? { e: st.ease.enter } : {}) })
    done = S + T / 2
  } else if (x.v === "word" || x.v === "rotate") {
    // the words one by one (each there almost at once), the second half in the accent
    const step = st.wordStep / st.speed
    const a0 = S + (x.tin === "snap" ? 0.04 : 0)
    keys.push({ t: a0 - 0.01, reveal: 0 }, ...Array.from({ length: n }, (_, k) => ({ t: a0 + (k + 1) * step, reveal: (k + 1) / n, e: "linear" as Ease })))
    c.mode = "words"
    c.accentFrom = n >= 3 ? Math.ceil(n / 2) : n
    c.accent = f.accent
    done = a0 + n * step
    if (x.v === "rotate") {
      // turned a quarter at its left end, settling straight
      c.align = "left"
      keys[0] = { t: S - T / 2, x: CX - w / 2, y: CY }
      keys.push({ t: a0 - 0.01, rot: -90 }, { t: a0 + 0.62 / st.speed, rot: 0, e: "out" })
      done = Math.max(done, a0 + 0.62 / st.speed)
    }
  } else {
    keys.push({ t: S - T / 4, reveal: 0 }, { t: S - T / 4 + len / cps, reveal: 1 })
  }
  const settled = x.v === "pullback" ? (x.i === 0 ? 0.15 : S) + 0.95 : S + T / 2
  keys.push({ t: settled, s: 1 }, { t: E + T / 2, s: 1.03, amb: true })
  return { els: [el(id, "text", S - T / 2, E + T / 2, 10, keys, c)], cam: [{ t: S + T / 2, ...REST }], dof: [{ t: S, k: 0 }], enter: [id], leave: [id], done, frame: REST, still: true, lineEnd: { x: CX - w / 2 + w + 18, y: CY - 4 } }
}

/** a prompt: a box opens between two words (a line, a glass pill, a white box) and pushes them apart; the camera goes
    close on it while it's typed into (the camera generator's), the words out of focus. Hands on its box. */
function prompt(s: Extract<FlowScene, { kind: "prompt" }>, x: Ctx): Out {
  const { S, E, T, f, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const bw = 680
  const bh = 200
  const between = x.v === "between"
  const box = `p${x.i}box`
  const steps: [number, number, number, number, number][] = between
    ? [
        [o - 0.05, 8, 3, 1.5, 1],
        [o + 0.45 * k, 250, 60, 30, 1],
        [o + 0.9 * k, bw, bh, 38, 0],
      ]
    : [
        [o - 0.05, 120, 60, 30, 1],
        [o + 0.6 * k, bw, bh, 38, 0],
      ]
  const ease = soft(st, st.ease.move)
  const els: El[] = [el(box, "box", S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: CX, y: CY, o: 0, w: steps[0][1], h: steps[0][2], r: steps[0][3], gl: steps[0][4] }, { t: o + 0.1, o: 1 }, ...steps.map(([t, w, h, r, g]) => ({ t, w, h, r, gl: g, lift: g ? 0 : 1, fill: WHITE, ...(ease ? { e: ease } : {}) }))])]
  const enter: string[] = []
  const t0 = o + 1.15 * k
  const t1 = t0 + s.typed.length / (f.pace.typeCps * st.speed)
  if (between) {
    const gap = (w: number) => w / 2 + 28
    const lead = `p${x.i}l`
    const tail = `p${x.i}t`
    const at = (side: number) => steps.map(([t, w]) => ({ t, x: CX + side * gap(w), ...(ease ? { e: ease } : {}) }))
    // out of focus as the camera goes close on the box
    const fog: Key[] = [{ t: t0 - 0.35, blur: 0, o: 1 }, { t: t0 + 0.3, blur: 10, o: 0.45 }]
    els.push(el(lead, "text", S - T / 2, E + T / 2, 10, [{ t: S - T / 2, x: CX - gap(8), y: CY }, ...at(-1), ...fog], { text: s.lead, size: 68, color: x.ink, align: "right" }))
    els.push(el(tail, "text", S - T / 2, E + T / 2, 10, [{ t: S - T / 2, x: CX + gap(8), y: CY }, ...at(1), ...fog], { text: s.tail, size: 68, color: x.ink, align: "left" }))
    enter.push(lead, tail)
  }
  const send = `p${x.i}send`
  els.push(el(send, "send", o + 0.6 * k, E + T / 2, 30, [{ t: o + 0.7 * k, x: CX + bw / 2 - 46, y: CY + bh / 2 - 46, w: 48, s: 0 }, { t: o + 1.0 * k, s: 1, e: "back" }]))
  const ty = `p${x.i}ty`
  const typed = [0, 0.25, 0.5, 0.75, 1].map((q) => ({ t: t0 + (t1 - t0) * q, typed: s.typed.length * q, e: "linear" as Ease }))
  els.push(el(ty, "text", o + 1 * k, E + T / 2, 30, [{ t: o + 1 * k, x: CX - bw / 2 + 34, y: CY - bh / 2 + 28 }, ...typed], { text: s.typed, size: 27, weight: 450, color: INK, align: "left", top: true, width: bw - 120, tail: f.accent }))
  return {
    els,
    cam: [{ t: o, ...REST }],
    dof: [{ t: t0 - 0.3, k: 0 }, { t: t0 + 0.3, k: 0.35 }],
    out: { id: box, shape: { x: CX, y: CY, w: bw, h: bh, r: 38, fill: WHITE } },
    enter,
    leave: [send, ty, ...enter],
    // (the newest letters settle a few letters' time after the last is typed)
    done: t1 + 9 / (f.pace.typeCps * st.speed),
    frame: REST,
    // (seen from an angle of its own, as a shot, the close-up on the typing over it)
    still: true,
    focus: [{ t: t0, until: t1 + 0.25, x: CX, y: CY, w: bw + 180, h: bh, kind: "type" }],
  }
}

/** the mark: from a dot an iris of white opens; the dot becomes the mark, the name slides out from behind it; a pill
    grows behind both and darkens (what it hands on). Or (rise) the mark and name rise out of a blur together. */
function brand(s: Extract<FlowScene, { kind: "brand" }>, x: Ctx, prev?: FlowScene): Out {
  const { S, E, T, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const d = 104
  const fs = 56
  const nw = textW(s.name, fs, 600)
  const total = d + 26 + nw
  const mx = CX - total / 2 + d / 2
  const els: El[] = []
  const enter: string[] = []
  let ground: GroundKey | undefined
  const dot = `b${x.i}dot`
  const mv: Ease = st.ease.move === "smooth" ? "smooth" : "inOut"
  if (x.v === "dot") {
    const iris = !!prev && prev.ground.tone !== "white" && s.ground.tone === "white" && !["dot", "wipe", "iris"].includes(x.tin ?? "")
    els.push(el(dot, "box", x.tin === "morph" ? o : S - T / 2, iris ? o + 0.62 * k : o + 0.4, 5, [{ t: S - T / 2, x: CX, y: CY, w: 70, h: 70, r: 35, fill: WHITE, o: x.tin === "morph" ? 1 : 0 }, { t: o, o: 1, w: 70, h: 70, r: 35 }, ...(iris ? [{ t: o + 0.6 * k, w: 2400, h: 2400, r: 1200, e: (st.ease.morph === "smooth" ? "smooth" : "in") as Ease }] : [{ t: o + 0.4, o: 0 }])]))
    if (iris) ground = { t: o + 0.6 * k, g: s.ground as Ground, blend: 0 }
    if (x.tin !== "morph") enter.push(dot)
  }
  const m = `b${x.i}m`
  const nm = `b${x.i}n`
  const rise = x.v === "rise"
  const pop: Ease = st.ease.enter === "smooth" ? "smooth" : "back"
  els.push(el(m, "mark", rise ? S - T / 2 : o + 0.25 * k, E + T / 2, 20, rise ? [{ t: S - T / 2, x: mx, y: CY + 30, w: d, blur: 8, o: 0 }, { t: o + 0.2, y: CY, blur: 0, o: 1 }] : [{ t: o + 0.25 * k, x: CX, y: CY, w: 0 }, { t: o + 0.6 * k, w: d, e: pop }, { t: o + 0.75 * k, x: CX }, { t: o + 1.3 * k, x: mx, e: mv }], { name: s.name, logo: s.logo }))
  const nx0 = CX + d / 2 + 26 - nw * 0.9
  const nx1 = mx + d / 2 + 26
  els.push(el(nm, "text", rise ? S - T / 2 : o + 0.7 * k, E + T / 2, 21, rise ? [{ t: S - T / 2, x: nx1, y: CY + 30, blur: 8, o: 0, fill: INK }, { t: o + 0.3, y: CY, blur: 0, o: 1 }] : [{ t: o + 0.75 * k, x: nx0, y: CY, cx: CX + d / 2, fill: INK }, { t: o + 1.3 * k, x: nx1, cx: mx + d / 2, e: mv }, { t: o + 1.65 * k, fill: INK }, { t: o + 1.95 * k, fill: WHITE }], { text: s.name, size: fs, weight: 600, color: INK, align: "left" }))
  if (rise) enter.push(m, nm)
  const pill = `b${x.i}p`
  const pw = total + 64
  els.push(el(pill, "box", o + 1.2 * k, E + T / 2, 15, [{ t: o + 1.2 * k, x: mx, y: CY, w: d + 14, h: 140, r: 70, fill: "#e4e4e7", o: 0 }, { t: o + 1.32 * k, o: 1 }, { t: o + 1.7 * k, x: CX, w: pw, fill: "#e4e4e7", ...(soft(st, "out") ? { e: "out" as Ease } : {}) }, { t: o + 1.95 * k, fill: INK }]))
  return { els, cam: [{ t: o, ...REST }], dof: [{ t: o, k: 0 }], ground, out: { id: pill, shape: { x: CX, y: CY, w: pw, h: 140, r: 70, fill: INK } }, enter, leave: [m, nm], done: o + 1.95 * k, frame: REST, still: true, lineEnd: { x: mx + d / 2 + 26 + nw + 16, y: CY } }
}

/** the product's panel, built from a blob (the unfold, the app's own when captured): the camera follows its growing
    edge at an angle */
function panel(s: Extract<FlowScene, { kind: "panel" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const o = S + T / 2
  const id = `pn${x.i}`
  const bd = 5.4 / Math.max(0.9, st.speed)
  const build = [0, 0.25, 0.5, 0.75, 1].map((q) => ({ t: o + bd * q, build: q, e: "linear" as Ease }))
  const carried = x.tin === "morph"
  return {
    els: [el(id, "panel", carried ? o : S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: CX, y: CY, w: 236, o: carried ? 1 : 0, blur: carried ? 0 : 8 }, { t: o, o: 1, blur: 0 }, ...build], { panel: s.panel })],
    cam: [{ t: o, ...REST, follow: id }, { t: o + 0.8, rx: (x.angle?.rx ?? 5) + 2, ry: x.angle?.ry ?? -12 }, { t: o + bd, rx: (x.angle?.rx ?? 5) + 1, ry: (x.angle?.ry ?? -12) * 0.85 }],
    dof: [{ t: o, k: 0 }, { t: o + 1.5, k: 0.55 }, { t: o + bd, k: 0.55 }, { t: E + T / 2, k: 0 }],
    enter: carried ? [] : [id],
    leave: [id],
    done: o + bd,
    frame: REST,
  }
}

/** a component of the product's own built piece by piece (assemble.ts), the camera on each row as it builds (at an
    angle, the way it follows a panel), then back to the whole of it; then its button pressed */
function component(s: Extract<FlowScene, { kind: "component" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const o = S + T / 2
  const id = `cp${x.i}`
  // its size in the world: as big as fits comfortably at rest
  const ws = Math.min(1080 / s.w, 760 / s.h, 2.6)
  const cw = s.w * ws
  const chh = s.h * ws
  const budget = Math.max(2, E - o - 1.2)
  const a = assemble(s.parts, { w: s.w, h: s.h, t0: o + 0.05, style: st, cps: x.f.pace.typeCps * st.speed, budget, press: s.press, radius: s.radius })
  const wx = (px: number) => CX - cw / 2 + px * ws
  const wy = (py: number) => CY - chh / 2 + py * ws
  const fit = (w: number, h: number) => Math.max(1, Math.min(TASTE.camera.zMax * 0.5, (0.6 * W) / Math.max(1, w * ws), (0.42 * H) / Math.max(1, h * ws)))
  const out: Ease = st.ease.cam === "smooth" ? "smooth" : "out"
  // the camera: on each row as it starts (every other one when there are many), turned a little, alternating sides
  const rows = a.rows.length > 7 ? a.rows.filter((_, i) => i % 2 === 0 || i === a.rows.length - 1) : a.rows
  const ang = x.angle ?? ANGLES.threeQuarterL
  const cam: CamKey[] = []
  rows.forEach((r, i) => {
    const z = Math.min(fit(Math.max(r.w, s.w * 0.55), r.h), 3.2)
    cam.push({ t: r.at + (i ? 0.05 : -0.05), x: wx(r.x + r.w / 2), y: wy(r.y + r.h / 2), z, rx: ang.rx + 1, ry: ang.ry + (i % 2 ? 4 : -4), rz: 0, ...(i ? { e: out } : {}) })
  })
  const zAll = Math.min((0.82 * H) / chh, (0.8 * W) / cw, 1.6)
  const built = Math.max(...a.steps.map((p) => p.at + p.len))
  cam.push({ t: built + 0.55, x: CX, y: CY, z: zAll, rx: ang.rx, ry: ang.ry * 0.8, rz: 0, e: out })
  // then drifting in on the whole of it, turning a touch, until the cut takes it
  if (E - 0.02 > built + 0.9) cam.push({ t: E - 0.02, x: CX, y: CY - 6, z: zAll * 1.05, rx: ang.rx * 0.8, ry: ang.ry * 0.55, e: "linear" })
  const els: El[] = [el(id, "assembly", S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: CX, y: CY, w: cw, h: chh, o: 0 }, { t: o - 0.12, o: 1 }], { src: s.src, a, cw: s.w, ch: s.h })]
  // the press: the hand coming in on the button, a ring of the accent as it goes down
  if (a.press) {
    const p = { x: wx(a.press.x), y: wy(a.press.y) }
    const tp = a.press.at
    els.push(
      el(`${id}c`, "cursor", tp - 0.6, tp + 0.5, 40, [{ t: tp - 0.6, x: p.x + 110, y: p.y + 80, o: 0, s: 1 }, { t: tp - 0.45, o: 1 }, { t: tp, x: p.x, y: p.y, e: "out" }, { t: tp + 0.08, s: 0.85, e: "out" }, { t: tp + 0.25, s: 1, e: "out" }, { t: tp + 0.35, o: 1 }, { t: tp + 0.5, o: 0 }]),
      el(`${id}g`, "glow", tp + 0.05, tp + 0.7, 35, [{ t: tp + 0.05, x: p.x, y: p.y, w: 30, o: 0.8, fill: x.f.accent }, { t: tp + 0.65, w: 220, o: 0, e: "out" }]),
    )
  }
  const rest: Framing = { x: CX, y: CY, z: zAll, rx: ang.rx * 0.8, ry: ang.ry * 0.55 }
  return { els, cam, dof: [{ t: o, k: 0 }, { t: o + 0.6, k: 0.22 }, { t: built + 0.5, k: 0.15 }], enter: [id], leave: [id], done: a.end, frame: rows.length ? { x: cam[0].x!, y: cam[0].y!, z: cam[0].z!, rx: cam[0].rx, ry: cam[0].ry } : rest, exit: rest }
}

/** the product's screen opened from its icon (lifted and tilted, the window swinging in from its corner) or flown in;
    the camera down a tall screen or in towards where to look. Hands on its window. */
function app(s: Extract<FlowScene, { kind: "app" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const aspect = s.aspect ?? 1.6
  const ww = 1500
  const wh = ww / aspect
  const tall = wh > H * 1.15
  const wx = CX
  const wy = tall ? H * 0.08 + wh / 2 : CY
  const win = `ap${x.i}w`
  const icon = `ap${x.i}i`
  const els: El[] = []
  const enter: string[] = []
  const carried = x.tin === "morph"
  const out: Ease = st.ease.move === "smooth" ? "smooth" : "out"
  if (x.v === "icon") {
    els.push(el(icon, "icon", carried ? o : S - T / 2, o + 2.3 * k, 30, [{ t: S - T / 2, x: CX, y: CY, w: 220, o: carried ? 1 : 0, s: carried ? 1 : 0.7 }, { t: o, o: 1, s: 1, w: 220, rot: 0, tx: 0, ty: 0 }, { t: o + 0.55 * k, w: 262, rot: -9, tx: 12, ty: -14, e: out }, { t: o + 0.85 * k, w: 250, x: CX, y: CY }, { t: o + 1.35 * k, w: 92, x: wx - ww / 2 + 70, y: wy - wh / 2 + 70, rot: 0, tx: 0, ty: 0, e: st.ease.morph === "smooth" ? "smooth" : "inOut" }, { t: o + 1.8 * k, o: 1 }, { t: o + 2.2 * k, o: 0 }], { name: x.f.name, logo: s.icon }))
    if (!carried) enter.push(icon)
    els.push(el(win, "media", o + 0.9 * k, E + T / 2, 20, [{ t: o + 0.9 * k, x: wx + 160, y: wy + 220, w: ww, h: wh, r: 26, o: 0, tx: 30, ty: -40, rot: 6, lift: 1, fill: WHITE }, { t: o + 1.15 * k, o: 1 }, { t: o + 2.0 * k, x: wx, y: wy, tx: 0, ty: 0, rot: 0, e: out }], { src: s.media, aspect }))
  } else {
    els.push(el(win, "media", S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: wx, y: wy + 120, w: ww, h: wh, r: 26, o: 0, s: 0.6, tx: 24, blur: 10, lift: 1, fill: WHITE }, { t: o + 0.9 * k, y: wy, s: 1, tx: 0, o: 1, blur: 0, e: out }], { src: s.media, aspect }))
    enter.push(win)
  }
  const f = s.focus ?? { x: 0.5, y: 0.4 }
  const settle = o + 2.1 * k
  const moved = settle + 1.6 * k
  const end: Framing = tall ? { x: CX, y: wy + wh / 2 - H * 0.45, z: 1 } : { x: wx - ww / 2 + ww * f.x, y: wy - wh / 2 + wh * f.y, z: 1.25 }
  return { els, cam: [{ t: o, ...REST }, { t: settle, x: CX, y: CY, z: 1 }, { t: moved, x: end.x, y: end.y, z: end.z, e: out }], dof: [{ t: o + 1.6 * k, k: 0 }, { t: o + 2.4 * k, k: 0.7 }], out: { id: win, shape: { x: end.x, y: end.y, w: ww, h: wh, r: 26, fill: WHITE } }, enter, leave: [], done: moved, frame: end }
}

/** a tour of the product's UI: the whole screen, then the camera snapping to each part in turn (drifting while it's
    read), the hand coming in on the last and pressing it, and the camera pulling back out */
function tour(s: Extract<FlowScene, { kind: "tour" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const aspect = s.aspect ?? 1.6
  const ww = 1720
  const wh = ww / aspect
  const z0 = Math.min(1, (0.9 * H) / wh)
  const win = `tu${x.i}w`
  const stops = s.stops?.length ? s.stops : [{ x: 0.28, y: 0.3, z: 2.1 }, { x: 0.66, y: 0.42, z: 1.8 }, { x: 0.5, y: 0.72, z: 2.2 }]
  const pt = (p: { x: number; y: number }) => ({ x: CX - ww / 2 + ww * p.x, y: CY - wh / 2 + wh * p.y })
  const snapE: Ease = st.ease.cam === "smooth" ? "smooth" : "snap"
  // the whole screen seen at an angle, turning square as it's taken in; each part seen leaning towards the side of
  // the screen it's on (a part on the left, from the left), as a camera moved round to it would
  const lean = (p: { x: number; y: number }) => ({ rx: 4 + (0.5 - p.y) * 10, ry: (0.5 - p.x) * 26 })
  const ang = x.angle ?? ANGLES.high
  const view: Framing = { x: CX, y: CY, z: z0 * 0.94, rx: ang.rx + 3, ry: ang.ry * 1.1, rz: ang.rz }
  const cam: CamKey[] = [{ t: o, ...view }, { t: o + 0.45 * k, x: CX, y: CY, z: z0 * 1.02, rx: ang.rx * 0.45 + 1, ry: ang.ry * 0.45, rz: 0 }]
  stops.forEach((p, j) => {
    const t = o + 0.45 * k + j * 1.25 * k
    const q = pt(p)
    const z = p.z ?? 2
    const a = lean(p)
    cam.push({ t: t + st.camera.snap, x: q.x, y: q.y, z, ...a, e: snapE }, { t: t + 1.25 * k - 0.02, x: q.x + 26, y: q.y + 6, z: z * 1.04, rx: a.rx * 0.8, ry: a.ry * 0.8, e: "linear" })
  })
  const last = o + 0.45 * k + stops.length * 1.25 * k
  cam.push({ t: last + st.camera.snap, x: CX, y: CY, z: z0, rx: 0, ry: 0, e: snapE })
  // pulled back, it drifts in on the whole screen until the cut takes it (a held screen never sits dead still)
  const rest = E - 0.02 - (last + st.camera.snap)
  const zEnd = z0 * (1 + Math.max(0.025, st.camera.drift) * rest)
  if (rest > 0.3) cam.push({ t: E - 0.02, x: CX, y: CY - 8, z: zEnd, e: "linear" })
  const press = s.press ?? stops.at(-1)!
  const pp = pt(press)
  const tp = last - 0.55 * k
  const cur = `tu${x.i}c`
  const els: El[] = [
    el(win, "media", S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: CX, y: CY, w: ww, h: wh, r: 18, lift: 0.6, fill: WHITE }], { src: s.media, aspect }),
    el(cur, "cursor", tp - 0.6 * k, last + 0.2, 40, [{ t: tp - 0.6 * k, x: pp.x + 120, y: pp.y + 90, o: 0, s: 1 }, { t: tp - 0.45 * k, o: 1 }, { t: tp, x: pp.x, y: pp.y, e: "out" }, { t: tp + 0.08, s: 0.85, e: "out" }, { t: tp + 0.25, s: 1, e: "out" }, { t: last, o: 1 }, { t: last + 0.15, o: 0 }]),
    el(`tu${x.i}p`, "glow", tp + 0.05, tp + 0.7, 35, [{ t: tp + 0.05, x: pp.x, y: pp.y, w: 30, o: 0.8, fill: x.f.accent }, { t: tp + 0.65, w: 220, o: 0, e: "out" }]),
  ]
  return { els, cam, dof: [{ t: o, k: 0.35 }], enter: [win], leave: [win], done: last + st.camera.snap, frame: view, exit: { x: CX, y: rest > 0.3 ? CY - 8 : CY, z: rest > 0.3 ? zEnd : z0, rx: 0, ry: 0 } }
}

/** logos arriving out of a glow to orbit the mark, then spinning up (ease-in), tilting along their way */
function orbit(s: Extract<FlowScene, { kind: "orbit" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const R = 320
  const n = Math.min(8, s.items.length)
  const carried = x.tin === "morph"
  const els: El[] = [
    el(`or${x.i}m`, "mark", carried ? o : S - T / 2, E + T / 2, 30, carried ? [{ t: o, x: CX, y: CY, w: 128 }] : [{ t: S - T / 2, x: CX, y: CY, w: 0 }, { t: o + 0.4 * k, w: 128, e: "back" }], { name: s.name, logo: s.logo }),
    el(`or${x.i}r`, "ring", S - T / 2, E + T / 2, 5, [{ t: S - T / 2, x: CX, y: CY, w: R * 2, o: 0 }, { t: o + 0.5 * k, o: 0.5 }]),
  ]
  const arrive = o + 0.5 * k
  const spin0 = arrive + 0.9 * k
  const spin1 = spin0 + 2.0 * k
  const turn = 150
  s.items.slice(0, n).forEach((name, j) => {
    const a0 = -90 + (j * 360) / n
    const at = (deg: number, r: number) => ({ x: CX + r * Math.cos((deg * Math.PI) / 180), y: CY + r * Math.sin((deg * Math.PI) / 180) })
    const from = at(a0 + 40, 980)
    const ta = arrive + j * 0.07 * k
    const keys: Key[] = [{ t: S - T / 2, ...from, o: 0, blur: 16, s: 0.7 }, { t: ta - 0.45 * k, ...from, o: 0 }, { t: ta, ...at(a0, R), o: 1, blur: 0, s: 1, e: "out" }]
    // the spin: an even time grid, the angle eased in (slow, then faster), the chip tilting along the turn
    for (let q = 1; q <= 10; q++) {
      const t = spin0 + ((spin1 - spin0) * q) / 10
      const u = (q / 10) ** 2.6
      keys.push({ t, ...at(a0 + turn * u, R), rot: u > 0.5 ? (u - 0.5) * 70 : 0, e: "linear" })
    }
    // spun up, it keeps going at the speed it reached until the cut takes it (it never stops dead in a hold)
    const w = (turn * 2.6) / (spin1 - spin0)
    for (let t = spin1 + 15 / w; t < E + T / 2 + 15 / w; t += 15 / w) keys.push({ t, ...at(a0 + turn + w * (t - spin1), R), e: "linear", amb: true })
    els.push(el(`or${x.i}c${j}`, "chip", S - T / 2, E + T / 2, 20 + j, keys, { text: name, dark: j % 2 === 0, accent: x.f.accent }))
  })
  return { els, cam: [{ t: o, ...REST }], dof: [{ t: o, k: 0 }], enter: carried ? [`or${x.i}r`] : [`or${x.i}m`, `or${x.i}r`], leave: els.map((e) => e.id), done: spin1, frame: REST, still: true }
}

/** cards becoming each other: one box resizing from each card to the next (from a grey placeholder, the call to
    action's way), the words passing through a blur; tilting a little as it settles. Hands on its box. */
function cards(s: Extract<FlowScene, { kind: "cards" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const o = S + T / 2
  const n = s.cards.length
  const per = 1.5 / st.speed
  const box = `cd${x.i}b`
  const skel = x.v === "skeleton"
  const h0 = cardH(s.cards[0])
  const keys: Key[] = [{ t: S - T / 2, x: CX, y: CY, w: skel ? 520 : 900, h: skel ? h0 * 0.62 : h0, r: 24, fill: skel ? "#8b8f8d" : WHITE, lift: 1, o: x.tin === "morph" ? 1 : 0 }, { t: o, o: 1 }]
  if (skel) keys.push({ t: o + 0.16, w: 900, h: h0, fill: WHITE, e: "snap" }, { t: o + 0.5, rot: -2.5, ty: 6, e: "out" }, { t: o + n * per, rot: -1, ty: 3 })
  const lead = skel ? 0.12 : 0
  const els: El[] = []
  s.cards.forEach((c, j) => {
    const a = o + lead + j * per
    const b = a + per
    keys.push({ t: a + (j ? 0.1 : 0), h: cardH(c) }, { t: b - 0.55, h: cardH(c) })
    const id = `cd${x.i}c${j}`
    const fadeIn = j === 0 ? [{ t: S - T / 2, co: 0 }, { t: o + 0.15 + lead, co: 1 }] : [{ t: a - 0.45, co: 0, blur: 10 }, { t: a + 0.1, co: 1, blur: 0 }]
    const fadeOut = j < n - 1 ? [{ t: b - 0.55, co: 1, blur: 0 }, { t: b - 0.15, co: 0, blur: 10 }] : []
    els.push(el(id, "card", j === 0 ? S - T / 2 : a - 0.5, j < n - 1 ? b : E + T / 2, 25, [{ t: S - T / 2, x: CX, y: CY, w: 900, h: cardH(c) }, ...fadeIn, ...fadeOut], { card: c, bare: true }))
  })
  els.unshift(el(box, "box", x.tin === "morph" ? o : S - T / 2, E + T / 2, 20, keys))
  const last = s.cards[n - 1]
  return { els, cam: [{ t: o, ...REST }], dof: [{ t: o, k: 0.3 }], out: { id: box, shape: { x: CX, y: CY, w: 900, h: cardH(last), r: 24, fill: WHITE } }, enter: [`cd${x.i}c0`], leave: [`cd${x.i}c${n - 1}`], done: o + lead + n * per, frame: REST, still: true }
}

/** a stack of cards going by: the camera rises through them, the ones away from the middle out of focus. Hands on its
    last card. */
function stack(s: Extract<FlowScene, { kind: "stack" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const o = S + T / 2
  const hs = s.cards.map(cardH)
  const ys = hs.reduce<number[]>((a, h, i) => [...a, i ? a[i - 1] + hs[i - 1] / 2 + 30 + h / 2 : 0], [])
  const rise0 = o + 0.3
  const rise1 = rise0 + (s.cards.length * 0.8) / st.speed
  const camY = (t: number) => {
    const u = Math.min(1, Math.max(0, (t - rise0) / (rise1 - rise0)))
    return CY + ys.at(-1)! * (u * u * (3 - 2 * u))
  }
  const els: El[] = s.cards.map((c, j) => {
    const id = `st${x.i}c${j}`
    const y = CY + ys[j]
    const focus: Key[] = []
    for (let t = o; t <= rise1 + 1e-6; t += 0.25) {
      const far = Math.min(1, Math.max(0, (Math.abs(y - camY(t)) - 160) / 420))
      focus.push({ t, blur: far * 6, co: 1 - far * 0.45 })
    }
    const first = j === 0 && x.tin === "morph"
    return el(id, "card", first ? o : S - T / 2, E + T / 2, 20 + j, [{ t: S - T / 2, x: CX, y, w: 900, h: hs[j], r: 24, fill: WHITE, lift: 1, o: first ? 1 : 0 }, { t: o + (first ? 0 : j * 0.08), o: 1 }, ...focus], { card: c })
  })
  const n = s.cards.length
  const yEnd = CY + ys.at(-1)!
  return {
    els,
    cam: [{ t: o, ...REST }, { t: rise0, y: CY }, { t: rise1, y: yEnd, ...(soft(st, "inOut") ? { e: "inOut" as Ease } : {}) }],
    dof: [{ t: o, k: 0.8 }],
    out: { id: `st${x.i}c${n - 1}`, shape: { x: CX, y: yEnd, w: 900, h: hs[n - 1], r: 24, fill: WHITE } },
    enter: s.cards.slice(x.tin === "morph" ? 1 : 0).map((_, j) => `st${x.i}c${j + (x.tin === "morph" ? 1 : 0)}`),
    leave: s.cards.slice(0, -1).map((_, j) => `st${x.i}c${j}`),
    done: rise1,
    frame: { x: CX, y: yEnd, z: 1 },
  }
}

/** the call: a glass box shrinks into a pill between two halves of the line, the mark arriving in it; the words swap
    through a blur (to “using” and the name), the pill moving to stay between them */
function end(s: Extract<FlowScene, { kind: "end" }>, x: Ctx): Out {
  const { S, E, T, st } = x
  const k = 1 / st.speed
  const o = S + T / 2
  const fs = 66
  const pw = 156
  const ph = 78
  const gap = 30
  const ink = inkOn(s.ground as Ground, x.ink)
  const centre = (l: string, r: string) => CX - (textW(l, fs) + gap + pw + gap + textW(r, fs)) / 2 + textW(l, fs) + gap + pw / 2
  const p1 = centre(s.lead, s.tail)
  const swapAt = o + 1.5 * k
  const p2 = s.swap ? centre(s.swap[0], s.swap[1]) : p1
  const pill = `en${x.i}p`
  const carried = x.tin === "morph"
  const mv: Ease = st.ease.morph === "smooth" ? "smooth" : "inOut"
  const els: El[] = [
    el(pill, "box", carried ? o : S - T / 2, E + T / 2, 20, [{ t: S - T / 2, x: CX, y: CY, w: 560, h: 170, r: 34, gl: 1, fill: WHITE, o: carried ? 1 : 0 }, { t: o, o: 1 }, { t: o + 0.1, x: CX, w: 560, h: 170 }, { t: o + 0.75 * k, x: p1, w: pw, h: ph, r: ph / 2, e: mv }, { t: swapAt, x: p1 }, { t: swapAt + 0.55 * k, x: p2, e: mv }]),
    el(`en${x.i}m`, "mark", o + 0.5 * k, E + T / 2, 21, [{ t: o + 0.5 * k, x: p1, y: CY, w: ph * 0.62, o: 0, s: 0.7 }, { t: o + 0.75 * k, x: p1, e: mv }, { t: o + 0.9 * k, o: 1, s: 1 }, { t: swapAt, x: p1 }, { t: swapAt + 0.55 * k, x: p2, e: mv }], { name: s.name, logo: s.logo, plain: true }),
  ]
  const word = (id: string, text: string, side: number, px: number, a: number, b: number, inK: [number, number], outK?: [number, number]) =>
    el(id, "text", a, b, 22, [{ t: a, x: px + side * (pw / 2 + gap), y: CY, o: 0, blur: 10 }, { t: inK[0], o: 0, blur: 10 }, { t: inK[1], o: 1, blur: 0 }, ...(outK ? [{ t: outK[0], o: 1, blur: 0 }, { t: outK[1], o: 0, blur: 10 }] : [])], { text, size: fs, color: ink, align: side < 0 ? "right" : "left" })
  const swapOut: [number, number] | undefined = s.swap ? [swapAt - 0.05, swapAt + 0.3 * k] : undefined
  els.push(word(`en${x.i}l`, s.lead, -1, p1, o + 0.2, s.swap ? swapAt + 0.35 * k : E + T / 2, [o + 0.35 * k, o + 0.85 * k], swapOut), word(`en${x.i}r`, s.tail, 1, p1, o + 0.2, s.swap ? swapAt + 0.35 * k : E + T / 2, [o + 0.35 * k, o + 0.85 * k], swapOut))
  if (s.swap) els.push(word(`en${x.i}l2`, s.swap[0], -1, p2, swapAt, E + T / 2, [swapAt + 0.2 * k, swapAt + 0.6 * k]), word(`en${x.i}r2`, s.swap[1], 1, p2, swapAt, E + T / 2, [swapAt + 0.2 * k, swapAt + 0.6 * k]))
  return { els, cam: [{ t: o, ...REST }], dof: [{ t: o, k: 0 }], enter: carried ? [] : [pill], leave: [], done: s.swap ? swapAt + 0.6 * k : o + 0.9 * k, frame: REST, still: true }
}

/* ---------------- the transitions ---------------- */

const without = (k: Key, ps: (keyof Key)[]): Key | null => {
  const c = { ...k }
  for (const p of ps) delete c[p]
  return Object.keys(c).filter((p) => p !== "e").length > 1 ? c : null
}
/** A scene's things arrive between `a` and `b` (out of a blur; a push: from a little smaller; a slide: from the right;
    a snap: at once, settling from a touch larger), on the style's arriving curve. */
function arrive(els: El[], ids: string[], a: number, b: number, how: Transition, e: Ease) {
  for (const x of els.filter((x) => ids.includes(x.id))) {
    const base = x.keys.find((k) => k.s !== undefined)?.s ?? 1
    const x0 = x.keys.find((k) => k.x !== undefined)?.x
    const y0 = x.keys.find((k) => k.y !== undefined)?.y
    const rise = how === "blur" && x.kind === "text" && y0 !== undefined
    const scale = how === "push" || how === "snap"
    const take: (keyof Key)[] = ["o", "blur", ...(scale ? (["s"] as const) : []), ...(how === "slide" ? (["x"] as const) : []), ...(rise ? (["y"] as const) : [])]
    const ks: Key[] = how === "snap" ? [{ t: a, o: 0, blur: 5, s: base * 1.05 }, { t: a + 0.05, o: 1, e: "linear" }, { t: b, blur: 0, s: base, e }] : [{ t: a, o: 0, blur: 10 }, { t: b, o: 1, blur: 0, e }]
    if (how === "push") ks.push({ t: a, s: base * 0.9 }, { t: b, s: base, e })
    if (how === "slide" && x0 !== undefined) ks.push({ t: a, x: x0 + 240 }, { t: b, x: x0, e })
    if (rise) ks.push({ t: a, y: y0! + 26 }, { t: b, y: y0!, e })
    x.keys = [...x.keys.map((k) => (k.t <= b ? without(k, take) : k)).filter((k): k is Key => !!k), ...ks]
    x.a = Math.min(x.a, a)
  }
}
/** A scene's things leave between `a` and `b` (into a blur; a push: growing past the camera; a slide: to the left; a
    snap: gone at the cut), holding everything until then, on the style's leaving curve. */
function depart(els: El[], ids: string[], a: number, b: number, how: Transition, e: Ease) {
  for (const x of els.filter((x) => ids.includes(x.id))) {
    const lastS = [...x.keys].reverse().find((k) => k.t <= a && k.s !== undefined)?.s ?? 1
    const lastX = [...x.keys].reverse().find((k) => k.t <= a && k.x !== undefined)?.x
    const lastY = [...x.keys].reverse().find((k) => k.t <= a && k.y !== undefined)?.y
    const rise = how === "blur" && x.kind === "text" && lastY !== undefined
    const take: (keyof Key)[] = ["o", "blur", ...(how === "push" ? (["s"] as const) : []), ...(how === "slide" ? (["x"] as const) : []), ...(rise ? (["y"] as const) : [])]
    const ks: Key[] = how === "snap" ? [{ t: a, o: 1 }, { t: b, o: 0, e: "hold" }] : [{ t: a, o: 1, blur: 0 }, { t: b, o: 0, blur: 10, e }]
    if (how === "push") ks.push({ t: a, s: lastS }, { t: b, s: lastS * 1.12, e })
    if (how === "slide" && lastX !== undefined) ks.push({ t: a, x: lastX }, { t: b, x: lastX - 240, e })
    if (rise) ks.push({ t: a, y: lastY! }, { t: b, y: lastY! - 26, e })
    x.keys = [...x.keys.map((k) => (k.t >= a ? without(k, take) : k)).filter((k): k is Key => !!k), ...ks]
    x.b = Math.max(b + 0.02, Math.min(x.b, b + 0.4))
  }
}
/** how long before a cut the scene before starts to leave, for each transition (what `fit` leaves room for) */
/** When a scene's own animation is really done: the last key of its elements that stays put when the scene is made
    longer (`again`: the same scene built 30 s longer; a key that moves with its end is a drift lasting until it
    leaves, not a step of its choreography, and one marked ambient never counts), and never before its builder says. */
export function doneOf(o: Out, again: Out): number {
  let d = o.done
  for (const e of o.els) {
    const e2 = again.els.find((y) => y.id === e.id)
    if (!e2) continue
    const ts = new Set(e2.keys.filter((k) => !k.amb).map((k) => k.t.toFixed(4)))
    for (const k of e.keys) if (!k.amb && k.t > d && ts.has(k.t.toFixed(4))) d = k.t
  }
  return d
}

export const leadOf = (how: Transition | null, T: number) => (how === "morph" ? T / 2 + 0.25 : how === "snap" ? 0.03 : how === "dot" ? T / 2 + 0.3 : how === "wipe" || how === "sweep" || how === "iris" ? T / 2 + 0.1 : how ? 0.42 * T : 0)

/** The motion graph of a flow: its scenes built in their variants, joined by their transitions, under the camera the
    camera generator gives it. `needs`: how long each scene has to be to finish its own animation, hold and leave. */
export function compose(f: Flow, st?: Style): Graph & { choices: ReturnType<typeof choose>; needs: number[]; style: MotionStyle; angles: (string | null)[] } {
  const ms = styleOf({ ...f, style: st ?? f.style })
  const T = ms.T
  const ch = choose(f, st)
  const field = composedField(f.accent, { dark: f.dark })
  const at = f.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + f.scenes[i - 1].dur : 0], [])
  const dur = at.at(-1)! + f.scenes.at(-1)!.dur
  const els: El[] = []
  let cam: CamKey[] = []
  const dof: DofKey[] = []
  const grounds: GroundKey[] = []
  const cuts: Cut[] = []
  const built: Out[] = []
  const build = (s: FlowScene, x: Ctx, i: number): Out =>
    s.kind === "words" ? words(s, x)
    : s.kind === "prompt" ? prompt(s, x)
    : s.kind === "brand" ? brand(s, x, f.scenes[i - 1])
    : s.kind === "panel" ? panel(s, x)
    : s.kind === "component" ? component(s, x)
    : s.kind === "app" ? app(s, x)
    : s.kind === "tour" ? tour(s, x)
    : s.kind === "orbit" ? orbit(s, x)
    : s.kind === "cards" ? cards(s, x)
    : s.kind === "stack" ? stack(s, x)
    : end(s, x)
  const seed = (f.style?.seed ?? hash(f.name)) % 100000
  const shots: (Shot | null)[] = []
  const usedBackdrops: BackdropKind[] = []
  const productWords = [f.name, ...f.scenes.map((s) => (s.kind === "words" ? s.text : ""))].join(" ")
  const groundOf: Ground[] = []
  const frames: Framing[] = []
  const usedAngles: string[] = []
  const angles: (string | null)[] = []
  f.scenes.forEach((s, i) => {
    // a product scene's own camera takes an angle the film hasn't used yet
    const pa = angleFor(s.kind, seed + i * 7, usedAngles)
    const x: Ctx = { i, S: at[i], E: at[i] + s.dur, T, v: ch.variants[i], f, st: ms, ink: field.ink, quiet: field.quiet, tin: ch.transitions[i], tout: ch.transitions[i + 1] ?? null, ...(pa ? { angle: ANGLES[pa] } : {}) }
    const o = build(s, x, i)
    // when it's really done: what its builder says, or the last key of its own that stays put when it's made longer
    o.done = doneOf(o, build(s, { ...x, E: x.E + 30 }, i))
    // words want reading time from when they start to show
    const said = s.kind === "words" ? s.text : s.kind === "end" ? `${s.lead} ${s.tail} ${s.swap?.join(" ") ?? ""}` : ""
    if (said) o.done = Math.max(o.done, at[i] + T / 2 + TASTE.read.base + said.split(/\s+/).filter(Boolean).length / TASTE.read.wps - ms.hold)
    // a still scene is seen from an angle, the camera moving through it (a shot: camera.ts)
    const shot = o.still ? shotFor(s.kind, ms, seed + i * 13, shots[i - 1] ?? undefined, usedAngles) : null
    shots.push(shot)
    // the angle this scene is seen from (a scene that keeps the camera square on is seen from the front)
    const seen = pa ?? shot?.angle ?? (s.kind === "app" ? null : "front")
    angles.push(seen)
    if (seen) usedAngles.push(seen)
    frames.push(o.frame)
    if (shot) {
      const span = Math.max(0.3, at[i] + s.dur - leadOf(ch.transitions[i + 1] ?? null, T) - (at[i] + T / 2))
      o.exit = shotEnd(o.frame, shot, ms, span)
      o.frame = shotStart(o.frame, shot)
    }
    // words alone stand on moving graphics (backdrop.ts), quiet where the words are, lifted as each lands
    let g = s.ground as Ground
    if ((s.kind === "words" || s.kind === "end") && g.tone !== "image") {
      const beats = o.els.filter((e) => e.kind === "text").flatMap((e) => e.keys.filter((k) => k.reveal !== undefined && k.reveal > 0 && !k.amb).map((k) => k.t)).filter((t, j, a) => a.indexOf(t) === j)
      const dark = g.tone === "dark" || (g.tone === "field" && field.ink.toLowerCase() === "#ffffff")
      const tw = said ? Math.min(0.46, textW(said, 68) / 2 / W) : 0.3
      const motion = backdropFor({ accent: f.accent, dark, style: ms.id, words: productWords, seed: seed + i * 31, used: usedBackdrops, beats, quiet: { x: 0.5, y: 0.5, w: tw, h: 0.06 }, t0: at[i] })
      usedBackdrops.push(motion.kind)
      g = { ...g, motion }
    }
    groundOf.push(g)
    built.push(o)
    els.push(...o.els)
    if (!shot) cam.push(...o.cam)
    dof.push(...o.dof)
    grounds.push(o.ground ? { ...o.ground, g } : { t: at[i], g, blend: i ? T : 0 })
    if (o.ground && i) grounds.push({ t: at[i], g: groundOf[i - 1], blend: 0 })
    cuts.push({ t: at[i], name: s.kind, kind: s.kind, transition: ch.transitions[i] ?? "start", meaning: s.meaning })
  })
  // the camera generator: each still scene's shot, close-ups on what's typed into or pressed
  built.forEach((o, i) => {
    const s0 = at[i] + T / 2
    const e0 = at[i] + f.scenes[i].dur - leadOf(ch.transitions[i + 1] ?? null, T)
    const shot = shots[i]
    if (shot) cam = layer(cam, shotKeys(ms, s0, e0, frames[i], shot))
    else if (o.still) cam = layer(cam, inScene(ms, s0, e0, o.frame))
    for (const fc of o.focus ?? []) cam = layer(cam, onFocus(ms, fc, o.frame))
  })
  // the joins
  const plainAt = (C: number) => grounds.findIndex((g) => g.t === C && g.blend === T)
  const cover = (i: number, C: number, from: { x: number; y: number; w: number }, a: number, b: number, e: Ease) => {
    const s = f.scenes[i]
    const fill = groundFill(groundOf[i], field.base)
    // over everything of the scene it covers (the next scene's arrive as it finishes)
    els.push(el(`cover${i}`, "box", a, b + 0.03, 90, [{ t: a, x: from.x, y: from.y, w: from.w, h: from.w, r: from.w / 2, fill }, { t: b, x: from.x, y: from.y, w: 4800, h: 4800, r: 2400, e }]))
    const plain = plainAt(C)
    if (plain >= 0) grounds.splice(plain, 1)
    grounds.push({ t: b, g: groundOf[i], blend: 0 })
  }
  f.scenes.forEach((s, i) => {
    if (!i) return
    const C = at[i]
    const how = ch.transitions[i]!
    const A = built[i - 1]
    const B = built[i]
    const entry = entryOf(s, ch.variants[i])
    const eIn = ms.ease.enter
    const eOut = ms.ease.exit
    const allA = [...A.leave, ...(A.out ? [A.out.id] : [])]
    if (how === "morph" && A.out && entry) {
      const e = els.find((x) => x.id === A.out!.id)!
      const sh = A.out.shape
      e.keys = e.keys.filter((k) => k.t <= C - T / 2)
      e.keys.push({ t: C - T / 2, x: sh.x, y: sh.y, w: sh.w, h: sh.h, r: sh.r, fill: sh.fill, gl: sh.gl ?? 0, co: 1 }, { t: C - T * 0.1, co: 0 }, { t: C + T / 2, x: entry.x, y: entry.y, w: entry.w, h: entry.h, r: entry.r, fill: entry.fill, gl: entry.gl ?? 0, rot: 0, tx: 0, ty: 0, s: 1, o: 1, blur: 0, e: ms.ease.morph })
      e.b = C + T / 2 + 0.03
      depart(els, A.leave, C - T / 2 - 0.25, C - T * 0.1, "blur", eOut)
      arrive(els, B.enter, C + T * 0.1, C + T / 2 + 0.2, "blur", eIn)
    } else if (how === "iris" || how === "wipe" || how === "dot") {
      // a disc of the next ground: from the middle (iris), the corner (wipe), or the line's full stop (dot: a dot that
      // swells to a circle, then fills the frame)
      const into: Ease = ms.ease.morph === "smooth" ? "smooth" : "in"
      if (how === "dot") {
        const p = A.lineEnd ?? { x: CX, y: CY }
        els.push(el(`dot${i}`, "box", C - T / 2 - 0.3, C - T * 0.1 + 0.03, 91, [{ t: C - T / 2 - 0.3, x: p.x, y: p.y, w: 0, h: 0, r: 0, fill: WHITE }, { t: C - T / 2 - 0.1, w: 22, h: 22, r: 11, e: "out" }, { t: C - T * 0.1, x: p.x + 60, w: 340, h: 340, r: 170, e: ms.ease.morph === "smooth" ? "smooth" : "inOut" }]))
        cover(i, C, { x: p.x + 60, y: p.y, w: 340 }, C - T * 0.1, C + T / 2, into)
      } else if (how === "wipe") cover(i, C, { x: W + 380, y: H + 380, w: 300 }, C - T / 2, C + T / 2, ms.ease.morph === "smooth" ? "smooth" : "inOut")
      else cover(i, C, A.out ? { x: A.out.shape.x, y: A.out.shape.y, w: Math.min(A.out.shape.w, A.out.shape.h) } : { x: CX, y: CY, w: 60 }, C - T / 2, C + T / 2, into)
      depart(els, allA, C - T / 2, C + T / 2, "blur", "hold")
      arrive(els, B.enter, C + T / 2 - 0.05, C + T / 2 + Math.max(0.25, T * 0.6), how === "dot" ? "snap" : "blur", eIn === "smooth" ? "out" : eIn)
    } else if (how === "snap") {
      depart(els, allA, C - 0.03, C, "snap", "hold")
      arrive(els, B.enter, C, C + T, "snap", eIn === "smooth" ? "out" : eIn)
      const plain = plainAt(C)
      if (plain >= 0) grounds[plain] = { ...grounds[plain], blend: 0 }
    } else if (how === "sweep") {
      // a glow crosses the frame; under it one view becomes the next
      els.push(el(`sweep${i}`, "glow", C - T, C + T, 60, [{ t: C - T, x: -700, y: CY, w: 1300, o: 0.85, fill: f.accent }, { t: C + T, x: W + 700, y: CY, w: 1300, e: "inOut" }]))
      depart(els, allA, C - 0.22, C + 0.1, "blur", eOut)
      arrive(els, B.enter, C - 0.1, C + 0.25, "blur", eIn)
      const plain = plainAt(C)
      if (plain >= 0) grounds[plain] = { ...grounds[plain], blend: 0.4 }
    } else {
      depart(els, allA, C - T * 0.42, C + T * 0.28, how, eOut)
      arrive(els, B.enter, C - T * 0.28, C + T * 0.42, how, eIn)
    }
    // the camera across the cut
    cam = layer(cam, atCut(ms, how, C, A.exit ?? A.frame, B.frame))
  })
  grounds.sort((a, b) => a.t - b.t)
  // how long each scene must be: its own animation, the style's hold, then the lead its way out needs
  const needs = built.map((o, i) => Math.round((o.done - at[i] + ms.hold + leadOf(ch.transitions[i + 1] ?? null, T) + (i === 0 ? 0 : 0)) * 100) / 100)
  return { dur, els, cam, dof, grounds, cuts, accent: f.accent, ink: field.ink, quiet: field.quiet, name: f.name, lag: ms.lag, choices: ch, needs, style: ms, angles }
}

/** A film composed and read against the guardrails (guardrails.ts): the graph, and the verdict. What the server, the
    film script and the checks call before anything is rendered. */
export function review(f: Flow): { graph: ReturnType<typeof compose>; verdict: Verdict } {
  const g = compose(f)
  const at = f.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + f.scenes[i - 1].dur : 0], [])
  const lead = f.scenes.map((_, i) => leadOf(g.choices.transitions[i + 1] ?? null, g.style.T))
  const done = g.needs.map((n, i) => at[i] + n - g.style.hold - lead[i])
  const verdict = judge(g, {
    at,
    dur: f.scenes.map((s) => s.dur),
    kinds: f.scenes.map((s) => s.kind),
    done,
    lead,
    hold: g.style.hold,
    transitions: g.choices.transitions,
    words: f.scenes.map((s) => (s.kind === "words" ? s.text : null)),
    angles: g.angles,
    fields: f.scenes.map((s, i) => (s.ground.tone === "field" ? { at: at[i], colors: composedField(f.accent, { variant: s.ground.variant, dark: f.dark }).blobs.filter((b) => b.a > 0.15).map((b) => b.color) } : null)).filter((x): x is { at: number; colors: string[] } => !!x),
    product: f.scenes.map((s) => (s.kind === "panel" ? s.panel.src : s.kind === "component" ? s.src : s.kind === "tour" || s.kind === "app" ? s.media : "n/a")),
    brandHue: hueOfHex(f.accent),
  })
  return { graph: g, verdict }
}
const hueOfHex = (c: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const d = mx - Math.min(r, g, b)
  if (d < 0.08) return undefined
  return mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
}

/** A flow with every scene long enough to play all of itself, hold, and only then leave (composed again until it
    settles: a scene grown moves the ones after it, never what they need). */
export function fit(f: Flow): Flow {
  let cur = f
  for (let pass = 0; pass < 4; pass++) {
    const { needs } = compose(cur)
    if (!cur.scenes.some((s, i) => s.dur + 1e-6 < needs[i])) break
    cur = { ...cur, scenes: cur.scenes.map((s, i) => ({ ...s, dur: Math.max(s.dur, needs[i]) })) }
  }
  return cur
}
