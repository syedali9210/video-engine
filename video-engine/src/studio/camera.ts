// The camera generator: where a flow film's camera goes, in three parts, each from the film's motion style
// (styles.ts) and laid over the framing each scene asks for (compose.ts):
//   inScene   in a scene: a slow creep closer while it's read, and a punch (a quick zoom, settling back) on a beat
//   atCut     between scenes: through the cut (closing in on it and coming out of it into the next), or a snap
//             (the next framing at once, the way a cut would)
//   onFocus   on what's interacted with: a little before a thing is typed into or pressed, the camera goes close on
//             it (as close as the style likes, never past filling most of the frame), holds while it happens, then
//             comes back to where the scene was
//   shots     the angle a scene is seen from and how the camera moves through it (a library: three-quarter, low,
//             high, dutch, over the shoulder; push, pull, truck, orbit, crane, roll), chosen per scene by its kind,
//             the style and a seed, inside the guardrails' bounds (guardrails.ts)
// `layer` puts one generator's keys over another's: inside the stretch its keys cover, they decide the properties
// they set. Pure: no DOM.
import type { CamKey, Ease } from "./graph.ts"
import type { MotionStyle } from "./styles.ts"
import { TASTE } from "./guardrails.ts"

const W = 1920
const H = 1080
export type Framing = { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }
/** a thing interacted with: when (`t`, until `until`), where (world px), and what happens to it */
export type Focus = { t: number; until: number; x: number; y: number; w: number; h: number; kind: "type" | "press" | "reveal" | "read" }

const curveOf = (st: MotionStyle, soft: Ease): Ease => (st.ease.cam === "smooth" ? "smooth" : soft)

/** In a scene, from `a` to `b`, framed at `f`: creeping closer as it's read; a punch on each beat. */
export function inScene(st: MotionStyle, a: number, b: number, f: Framing, beats: number[] = []): CamKey[] {
  if (b - a < 0.3) return []
  const z1 = f.z * (1 + st.camera.drift * (b - a))
  const keys: CamKey[] = [{ t: a, x: f.x, y: f.y, z: f.z }, { t: b, z: z1, e: curveOf(st, "linear") }]
  if (st.camera.punch > 0)
    for (const t of beats.filter((x) => x > a + 0.15 && x < b - 0.4)) {
      const z = f.z + ((z1 - f.z) * (t - a)) / (b - a)
      keys.push({ t: t - 0.001, z }, { t: t + st.camera.snap * 0.6, z: z * (1 + st.camera.punch), e: "snap" }, { t: t + st.camera.snap * 0.6 + 0.5, z, e: "out" })
    }
  return keys
}

/** Between two scenes at the cut `C`: from the first's last framing to the next's first. */
export function atCut(st: MotionStyle, how: string, C: number, from: Framing, to: Framing): CamKey[] {
  if (how === "push" || how === "sweep") return [{ t: C, z: ((from.z + to.z) / 2) * st.camera.through, e: curveOf(st, "in") }]
  // a snap is a cut: the camera is where the next scene wants it the instant it starts
  if (how === "snap") return [{ t: C - 0.001, x: from.x, y: from.y, z: from.z, rx: from.rx ?? 0, ry: from.ry ?? 0, rz: from.rz ?? 0, e: "hold" }, { t: C, x: to.x, y: to.y, z: to.z * 1.04, rx: to.rx ?? 0, ry: to.ry ?? 0, rz: to.rz ?? 0, e: "hold" }, { t: C + st.T, z: to.z, e: "out" }]
  return []
}

/** On a thing interacted with, back to `rest` after. */
export function onFocus(st: MotionStyle, f: Focus, rest: Framing): CamKey[] {
  const z = Math.min(rest.z * st.camera.interact, (0.72 * W) / Math.max(40, f.w))
  const lead = Math.max(0.2, st.camera.snap)
  const go = curveOf(st, "out")
  return [
    { t: f.t - lead, x: rest.x, y: rest.y, z: rest.z },
    { t: f.t, x: f.x, y: f.y, z, e: go },
    { t: f.until, x: f.x, y: f.y, z: z * 1.02 },
    { t: f.until + lead * 1.6, x: rest.x, y: rest.y, z: rest.z, e: go },
  ]
}

const PROPS = ["x", "y", "z", "rx", "ry", "rz"] as const
/** `extra`'s keys over `base`'s: inside the stretch `extra` covers, a property it sets is its alone. */
export function layer(base: CamKey[], extra: CamKey[]): CamKey[] {
  if (!extra.length) return base
  const a = Math.min(...extra.map((k) => k.t))
  const b = Math.max(...extra.map((k) => k.t))
  const sets = PROPS.filter((p) => extra.some((k) => k[p] !== undefined))
  const kept = base
    .map((k) => {
      if (k.t <= a || k.t >= b) return k
      const c: CamKey = { ...k }
      for (const p of sets) delete c[p]
      return c
    })
    .filter((k) => PROPS.some((p) => k[p] !== undefined) || k.follow)
  return [...kept, ...extra]
}

/* ---------------- shots: angles and moves ---------------- */

/** an angle: tilt (rx: + looks down on it, − up at it), turn (ry), roll (rz), how close, and where the subject sits
    off centre (a fraction of the frame) */
export type Angle = { rx: number; ry: number; rz: number; z: number; dx: number; dy: number }
export const ANGLES = {
  front: { rx: 0, ry: 0, rz: 0, z: 1, dx: 0, dy: 0 },
  threeQuarterL: { rx: 5, ry: 12, rz: 0, z: 1.04, dx: 0.02, dy: 0 },
  threeQuarterR: { rx: 5, ry: -12, rz: 0, z: 1.04, dx: -0.02, dy: 0 },
  low: { rx: -8, ry: 4, rz: 0, z: 1.06, dx: 0, dy: -0.02 },
  high: { rx: 11, ry: -5, rz: 0, z: 0.98, dx: 0, dy: 0.02 },
  dutchL: { rx: 3, ry: 6, rz: -3.5, z: 1.05, dx: 0, dy: 0 },
  dutchR: { rx: 3, ry: -6, rz: 3.5, z: 1.05, dx: 0, dy: 0 },
  shoulderL: { rx: 4, ry: 16, rz: 0, z: 1.12, dx: 0.1, dy: 0 },
  shoulderR: { rx: 4, ry: -16, rz: 0, z: 1.12, dx: -0.1, dy: 0 },
  close: { rx: 2, ry: -4, rz: 0, z: 1.35, dx: 0, dy: 0 },
  wide: { rx: 4, ry: 0, rz: 0, z: 0.86, dx: 0, dy: 0 },
} satisfies Record<string, Angle>
export type AngleName = keyof typeof ANGLES
/** a move through the scene: in or out, across (truck), round it (orbit), rising over it (crane), a roll settling */
export type Move = "push" | "pull" | "truck" | "orbit" | "crane" | "roll" | "drift"
export type Shot = { angle: AngleName; move: Move }

/** the shots each kind of scene can take, the first the most like it; a style of cuts reaches for the bolder ones */
const SHOTS: Record<string, Shot[]> = {
  words: [{ angle: "threeQuarterR", move: "orbit" }, { angle: "front", move: "push" }, { angle: "low", move: "crane" }, { angle: "threeQuarterL", move: "truck" }, { angle: "dutchL", move: "roll" }],
  prompt: [{ angle: "threeQuarterR", move: "push" }, { angle: "high", move: "push" }, { angle: "threeQuarterL", move: "drift" }],
  brand: [{ angle: "low", move: "push" }, { angle: "front", move: "push" }, { angle: "dutchR", move: "roll" }],
  cards: [{ angle: "threeQuarterL", move: "orbit" }, { angle: "shoulderR", move: "truck" }, { angle: "high", move: "push" }],
  stack: [{ angle: "high", move: "crane" }, { angle: "threeQuarterR", move: "push" }],
  orbit: [{ angle: "high", move: "roll" }, { angle: "low", move: "orbit" }],
  end: [{ angle: "front", move: "pull" }, { angle: "low", move: "push" }, { angle: "dutchL", move: "roll" }],
}
const BOLD: AngleName[] = ["dutchL", "dutchR", "shoulderL", "shoulderR", "low"]

/** The shot a scene takes: from what its kind can take, by the style (a style of cuts likes bolder angles, a soft one
    the quieter), a seed (products don't all look alike). The rule: never an angle the film has already used (`used`:
    every scene's so far); only when every angle has been used does one come round again, and then never the one just
    before. */
export function shotFor(kind: string, st: MotionStyle, seed: number, before?: Shot, used: string[] = []): Shot | null {
  const all = SHOTS[kind]
  if (!all) return null
  const snappy = st.cuts[0] === "snap" || st.cuts[0] === "iris" || st.cuts[0] === "dot"
  const fits = (x: Shot) => snappy || !BOLD.includes(x.angle) || x.move === "roll"
  // what it can take that the film hasn't used; else any angle the film hasn't used, with the kind's first move
  const fresh = all.filter((x) => fits(x) && !used.includes(x.angle))
  const spare = (Object.keys(ANGLES) as AngleName[]).filter((a) => !used.includes(a) && (snappy || !BOLD.includes(a)))
  const from = fresh.length ? fresh : spare.length ? spare.map((angle) => ({ angle, move: all[0].move })) : all.filter((x) => !(before && x.angle === before.angle))
  return (from.length ? from : all)[Math.abs(Math.floor(seed)) % (from.length || all.length)]
}

/** the angles a product scene (its own camera: a tour, a component built, a panel) can be seen from, most like it first */
const PRODUCT: Record<string, AngleName[]> = {
  tour: ["high", "threeQuarterR", "threeQuarterL", "low", "shoulderL"],
  component: ["threeQuarterL", "shoulderR", "high", "threeQuarterR", "low"],
  panel: ["threeQuarterR", "threeQuarterL", "high", "shoulderL", "low"],
}
/** The angle a product scene's own camera takes, by the same rule: none the film has used, while any is left. */
export function angleFor(kind: string, seed: number, used: string[] = []): AngleName | null {
  const pref = PRODUCT[kind]
  if (!pref) return null
  const fresh = pref.filter((a) => !used.includes(a))
  const spare = (Object.keys(ANGLES) as AngleName[]).filter((a) => !used.includes(a) && a !== "front" && a !== "wide")
  const from = fresh.length ? fresh : spare.length ? spare : pref
  return from[Math.abs(Math.floor(seed)) % Math.min(2, from.length)]
}

const clampA = (f: Framing): Framing => ({ ...f, rx: Math.max(-TASTE.camera.rx, Math.min(TASTE.camera.rx, f.rx ?? 0)), ry: Math.max(-TASTE.camera.ry, Math.min(TASTE.camera.ry, f.ry ?? 0)), rz: Math.max(-TASTE.camera.rz, Math.min(TASTE.camera.rz, f.rz ?? 0)), z: Math.max(TASTE.camera.zMin, Math.min(TASTE.camera.zMax, f.z)) })
/** where a shot starts: the scene's framing seen from the shot's angle */
export function shotStart(f: Framing, s: Shot): Framing {
  const a = ANGLES[s.angle]
  return clampA({ x: f.x - a.dx * W, y: f.y - a.dy * H, z: f.z * a.z, rx: (f.rx ?? 0) + a.rx, ry: (f.ry ?? 0) + a.ry, rz: (f.rz ?? 0) + a.rz })
}
/** where it ends, `d` seconds of the move later (the move's size grows with the style's drift and the time it has) */
export function shotEnd(f: Framing, s: Shot, st: MotionStyle, d: number): Framing {
  const a = shotStart(f, s)
  const k = Math.min(1.4, (0.5 + st.camera.drift * 14) * Math.min(1, d / 2.2))
  switch (s.move) {
    case "push":
      return clampA({ ...a, z: a.z * (1 + 0.1 * k), rx: (a.rx ?? 0) * 0.7 })
    case "pull":
      return clampA({ ...a, z: a.z * (1 - 0.08 * k), ry: (a.ry ?? 0) * 0.5 })
    case "truck":
      return clampA({ ...a, x: a.x + 70 * k * Math.sign(a.ry || 1), ry: (a.ry ?? 0) - 5 * k * Math.sign(a.ry || 1), z: a.z * (1 + 0.03 * k) })
    case "orbit":
      return clampA({ ...a, ry: -(a.ry ?? 0) * 0.6, rx: (a.rx ?? 0) * 0.8, z: a.z * (1 + 0.04 * k) })
    case "crane":
      return clampA({ ...a, y: a.y - 40 * k, rx: (a.rx ?? 0) + 7 * k, z: a.z * (1 + 0.03 * k) })
    case "roll":
      return clampA({ ...a, rz: (a.rz ?? 0) * 0.15, z: a.z * (1 + 0.05 * k) })
    default:
      return clampA({ ...a, z: a.z * (1 + 0.025 * k), ry: (a.ry ?? 0) * 0.85 })
  }
}
/** A shot's keys from `a` (the scene settled) to `b` (it starts to leave): the angle, and the move through it on a
    curve the style's camera likes (a soft one eases all the way; one of cuts glides, evenly) */
export function shotKeys(st: MotionStyle, a: number, b: number, f: Framing, s: Shot): CamKey[] {
  if (b - a < 0.3) return []
  const from = shotStart(f, s)
  const to = shotEnd(f, s, st, b - a)
  const e: Ease = st.ease.cam === "smooth" ? "inOut" : "linear"
  return [{ t: a, x: from.x, y: from.y, z: from.z, rx: from.rx, ry: from.ry, rz: from.rz }, { t: b, x: to.x, y: to.y, z: to.z, rx: to.rx, ry: to.ry, rz: to.rz, e }]
}
