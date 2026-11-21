// The motion graph: a whole film as elements on one timeline, each a set of keyframed properties, under one camera,
// over grounds that change. What the flow generator (compose.ts) writes and the flow film (animations/film-flow)
// draws, with nothing about any one scene baked into the drawing.
// Smoothness is the point:
//   - every number between its keys follows one monotone cubic (Fritsch–Carlson): speed carries through a key, so a
//     move that goes on through several keys never stops at them; it stops only where it holds (two keys alike) or
//     turns back, and never overshoots a key;
//   - the camera is one path over the whole film, then followed with a little lag (where it wanted to be over the last
//     quarter second, the nearest weighing most), so a change of plan is never a jolt;
//   - a shape one scene hands the next is the same element going on (or two identical at the hand-off instant).
// Pure: no DOM.

export const NUM = ["x", "y", "w", "h", "r", "o", "co", "blur", "s", "rot", "tx", "ty", "reveal", "typed", "build", "lift", "gl", "cx"] as const
export type Num = (typeof NUM)[number]
/** an element's state: centre and size (world px), corner, opacity (and its contents' alone: co), blur (px), scale,
    turn and tilt (deg), how much of its words are wiped on (0–1) or typed (letters), a panel's build (0–1), shadow,
    glass (0–1), a left clip (world x; 0 = none), its colour */
export type P = Record<Num, number> & { fill: string }
export const BASE: P = { x: 960, y: 540, w: 100, h: 100, r: 0, o: 1, co: 1, blur: 0, s: 1, rot: 0, tx: 0, ty: 0, reveal: 1, typed: 1e6, build: 0, lift: 0, gl: 0, cx: 0, fill: "#ffffff" }
/** how a property gets to a key from the one before: `smooth` (the default: one monotone cubic through all the keys,
    speed carrying through), or a curve of its own for that stretch, the way the reference films move: `out` (fast,
    then settling: expo), `in` (slow, then fast), `inOut` (strong both ends), `snap` (there almost at once, then a
    long settle), `back` (past it and back), `linear`, `hold` (stays, then jumps at the key) */
export type Ease = "smooth" | "out" | "in" | "inOut" | "snap" | "back" | "linear" | "hold"
/** `amb`: an ambient key (a drift that lasts until the scene leaves, a spin carrying into the cut), not a step of the
    scene's choreography: what a scene must finish before it leaves never counts it (compose.ts doneOf) */
export type Key = { t: number; e?: Ease; amb?: boolean } & Partial<P>

export type Text = { text: string; size: number; weight?: number; color?: string; align?: "left" | "center" | "right"; top?: boolean; width?: number; tail?: string }
export type ElKind = "box" | "text" | "mark" | "icon" | "media" | "card" | "panel" | "send" | "cursor" | "chip" | "ring" | "glow" | "assembly"
export type El = {
  id: string
  kind: ElKind
  /** when it exists (s) */
  a: number
  b: number
  /** drawn in order of z, then of creation */
  z: number
  keys: Key[]
  /** what it shows: words, a picture or video, a card, a panel, a mark */
  c?: Record<string, unknown> & Partial<Text>
  /** in screen px rather than under the camera */
  screen?: boolean
}
/** where the camera looks (world px), how close, how it's turned; `follow`: from this key to the next it follows an
    element (a panel being built: its growing edge), `lag`: how far behind it trails (s) */
export type CamKey = { t: number; x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; follow?: string; e?: Ease }
export const BACKDROPS = ["orbs", "ribbons", "grid", "rings", "streaks", "dust", "contours"] as const
export type BackdropKind = (typeof BACKDROPS)[number]
/** moving graphics behind words alone (backdrop.ts chooses them, _film/backdrop.tsx draws them): which, in what
    colours, how fast, the moments the words land (`beats`), where the words are (`quiet`: a fraction of the frame),
    how strong, from when */
export type Backdrop = { kind: BackdropKind; colors: string[]; dark: boolean; speed: number; seed: number; beats: number[]; quiet: { x: number; y: number; w: number; h: number }; amount: number; t0: number }
/** `motion`: moving graphics over a ground under words alone */
/** a field's `finish`: satin (the default: folds, sheen and a weave) or matte (the plain composed field) */
export type Ground = ({ tone: "field"; variant: string; grain?: number; finish?: "satin" | "matte" } | { tone: "white" } | { tone: "dark" } | { tone: "light" } | { tone: "image"; src: string; ink?: string; focus?: { x: number; y: number } }) & { motion?: Backdrop }
/** a ground from `t`, blended in over `blend` s (0: at once: under an iris that already covers the frame) */
export type GroundKey = { t: number; g: Ground; blend: number }
export type Cut = { t: number; name: string; kind: string; transition: string; meaning?: unknown }
/** depth of field at the frame's edges, by time (0–1) */
export type DofKey = { t: number; k: number }
/** `lag`: how far behind its path the camera trails (s): a soft film floats, a snappy one doesn't */
export type Graph = { dur: number; els: El[]; cam: CamKey[]; grounds: GroundKey[]; dof: DofKey[]; cuts: Cut[]; accent: string; ink: string; quiet: string; name: string; lag?: number }

/* ---------------- the curve ---------------- */

const bez = ([x1, y1, x2, y2]: number[], x: number) => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (3 * (1 - m) ** 2 * m * x1 + 3 * (1 - m) * m * m * x2 + m ** 3 < x) lo = m
    else hi = m
  }
  const m = (lo + hi) / 2
  return 3 * (1 - m) ** 2 * m * y1 + 3 * (1 - m) * m * m * y2 + m ** 3
}
/** a stretch's own curve, 0 → 1 */
export const EASES: Record<Exclude<Ease, "smooth">, (u: number) => number> = {
  out: (u) => bez([0.16, 1, 0.3, 1], u),
  in: (u) => bez([0.7, 0, 0.84, 0], u),
  inOut: (u) => bez([0.65, 0, 0.35, 1], u),
  snap: (u) => 1 - (1 - u) ** 7,
  back: (u) => {
    const s = 1.6
    const k = u - 1
    return 1 + (s + 1) * k ** 3 + s * k ** 2
  },
  linear: (u) => u,
  hold: (u) => (u < 1 ? 0 : 1),
}

/** A monotone cubic through keys [t, v] (Fritsch–Carlson): continuous speed through every key, flat at holds and at
    the ends, never past a key. A key with its own ease (`e`, third) takes the stretch into it on that curve instead. */
export function curve(t: number, k: [number, number, Ease?][]): number {
  const n = k.length
  if (!n) return 0
  if (n === 1 || t <= k[0][0]) return k[0][1]
  if (t >= k[n - 1][0]) return k[n - 1][1]
  let i = 1
  while (t > k[i][0]) i++
  const [a, b] = [k[i - 1], k[i]]
  const h = b[0] - a[0]
  if (h <= 1e-9) return b[1]
  const u = (t - a[0]) / h
  const own = b[2]
  if (own && own !== "smooth") return a[1] + (b[1] - a[1]) * EASES[own](u)
  const slope = (j: number) => {
    if (j === 0 || j === n - 1) return 0
    const d0 = (k[j][1] - k[j - 1][1]) / Math.max(1e-9, k[j][0] - k[j - 1][0])
    const d1 = (k[j + 1][1] - k[j][1]) / Math.max(1e-9, k[j + 1][0] - k[j][0])
    return d0 * d1 <= 0 ? 0 : Math.sign(d0) * Math.min(Math.abs(d0 + d1) / 2, 3 * Math.min(Math.abs(d0), Math.abs(d1)))
  }
  const [m0, m1] = [slope(i - 1) * h, slope(i) * h]
  const [u2, u3] = [u * u, u * u * u]
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * m1
}
const hexN = (c: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim())
  const n = m ? parseInt(m[1], 16) : 0xffffff
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
/** colours between keys: mixed on a smooth step */
function colourAt(t: number, k: [number, string][]) {
  if (!k.length) return BASE.fill
  if (t <= k[0][0]) return k[0][1]
  if (t >= k[k.length - 1][0]) return k[k.length - 1][1]
  let i = 1
  while (t > k[i][0]) i++
  const u = (t - k[i - 1][0]) / Math.max(1e-9, k[i][0] - k[i - 1][0])
  const e = u * u * (3 - 2 * u)
  const [x, y] = [hexN(k[i - 1][1]), hexN(k[i][1])]
  return toHex(x.map((v, j) => v + (y[j] - v) * e))
}

/** An element's tracks, gathered once: per property, the keys that set it, in time. */
export type Tracks = { num: Partial<Record<Num, [number, number, Ease?][]>>; fill: [number, string][] }
export function tracks(el: El): Tracks {
  const keys = [...el.keys].sort((a, b) => a.t - b.t)
  const num: Tracks["num"] = {}
  for (const p of NUM) {
    const k = keys.filter((x) => x[p] !== undefined).map((x) => [x.t, x[p] as number, x.e] as [number, number, Ease?])
    if (k.length) num[p] = k
  }
  return { num, fill: keys.filter((x) => x.fill !== undefined).map((x) => [x.t, x.fill!] as [number, string]) }
}
/** an element's state at t */
export function sample(tr: Tracks, t: number): P {
  const p = { ...BASE }
  for (const n of NUM) {
    const k = tr.num[n]
    if (k) p[n] = curve(t, k)
  }
  if (tr.fill.length) p.fill = colourAt(t, tr.fill)
  return p
}

/* ---------------- the camera ---------------- */

/** `rz`: the camera's roll (deg) */
export type View = { x: number; y: number; z: number; rx: number; ry: number; rz: number }
/** Where the camera wants to be at t: its keys, one curve each; between a `follow` key and the next, the followed
    element's focus (`focus(id, t)`, the renderer's: it knows a panel's measured edges), eased in and out of. */
export function camTarget(cam: CamKey[], t: number, focus?: (id: string, t: number) => View | null): View {
  const ks = [...cam].sort((a, b) => a.t - b.t)
  const pick = (p: keyof View, d: number) => {
    const k = ks.filter((x) => x[p] !== undefined).map((x) => [x.t, x[p] as number, x.e] as [number, number, Ease?])
    return k.length ? curve(t, k) : d
  }
  const v: View = { x: pick("x", 960), y: pick("y", 540), z: pick("z", 1), rx: pick("rx", 0), ry: pick("ry", 0), rz: pick("rz", 0) }
  // a follow lasts until the next key that places the camera (one that only turns it doesn't end it)
  const placing = ks.filter((x) => x.x !== undefined || x.y !== undefined || x.follow)
  for (let j = 0; j < placing.length; j++) {
    const k = placing[j]
    if (!k.follow || !focus) continue
    const end = placing[j + 1]?.t ?? Infinity
    if (t < k.t - 0.01 || t > end + 0.01) continue
    const ramp = 0.45
    const w = Math.min(Math.max(0, (t - k.t) / ramp), Math.max(0, (end - t) / ramp), 1)
    if (w <= 0) continue
    const f = focus(k.follow, Math.max(k.t, Math.min(t, end)))
    if (!f) continue
    const e = w * w * (3 - 2 * w)
    v.x += (f.x - v.x) * e
    v.y += (f.y - v.y) * e
    v.z += (f.z - v.z) * e
  }
  return v
}
/** What the camera is following at t (an element's id), if anything: what the eye tracks, so it stays sharp. */
export function followed(cam: CamKey[], t: number): string | null {
  const placing = [...cam].sort((a, b) => a.t - b.t).filter((x) => x.x !== undefined || x.y !== undefined || x.follow)
  for (let j = 0; j < placing.length; j++) {
    const k = placing[j]
    if (k.follow && t >= k.t - 0.01 && t <= (placing[j + 1]?.t ?? Infinity) + 0.01) return k.follow
  }
  return null
}
/** The camera: its target, followed with a little lag (`lag` s: a quarter second by default, the nearest weighing
    most; 0: on its path exactly, every snap a snap). Pure in t. */
export function camAt(cam: CamKey[], t: number, focus?: (id: string, t: number) => View | null, lag = 0.26): View {
  if (lag <= 0.005) return camTarget(cam, t, focus)
  const acc: View = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
  let sw = 0
  const step = lag / 11
  for (let i = 0; i < 12; i++) {
    const w = Math.exp(-i / 3.6)
    const v = camTarget(cam, Math.max(0, t - i * step), focus)
    for (const k of Object.keys(acc) as (keyof View)[]) acc[k] += v[k] * w
    sw += w
  }
  for (const k of Object.keys(acc) as (keyof View)[]) acc[k] /= sw
  return acc
}

/* ---------------- grounds and depth ---------------- */

/** the grounds showing at t, back to front, each with how much of it shows */
export function groundsAt(gs: GroundKey[], t: number): { g: Ground; k: number }[] {
  const ks = [...gs].sort((a, b) => a.t - b.t)
  const i = Math.max(0, ks.findLastIndex((x) => x.t - x.blend / 2 <= t))
  const cur = ks[i]
  if (!cur) return []
  const k = cur.blend <= 0 ? 1 : Math.min(1, Math.max(0, (t - (cur.t - cur.blend / 2)) / cur.blend))
  const e = k * k * (3 - 2 * k)
  return i > 0 && e < 1 ? [{ g: ks[i - 1].g, k: 1 }, { g: cur.g, k: e }] : [{ g: cur.g, k: 1 }]
}
export const dofAt = (d: DofKey[], t: number) => (d.length ? curve(t, [...d].sort((a, b) => a.t - b.t).map((x) => [x.t, x.k])) : 0)

/** Elements alive at t, in the order they're drawn. */
export const alive = (g: Graph, t: number) => g.els.filter((e) => t >= e.a && t <= e.b).sort((a, b) => a.z - b.z)
