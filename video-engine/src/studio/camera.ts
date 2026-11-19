// The camera generator: where a flow film's camera goes, in three parts, each from the film's motion style
// (styles.ts) and laid over the framing each scene asks for (compose.ts):
//   inScene   in a scene: a slow creep closer while it's read, and a punch (a quick zoom, settling back) on a beat
//   atCut     between scenes: through the cut (closing in on it and coming out of it into the next), or a snap
//             (the next framing at once, the way a cut would)
//   onFocus   on what's interacted with: a little before a thing is typed into or pressed, the camera goes close on
//             it (as close as the style likes, never past filling most of the frame), holds while it happens, then
//             comes back to where the scene was
// `layer` puts one generator's keys over another's: inside the stretch its keys cover, they decide the properties
// they set. Pure: no DOM.
import type { CamKey, Ease } from "./graph.ts"
import type { MotionStyle } from "./styles.ts"

const W = 1920
export type Framing = { x: number; y: number; z: number; rx?: number; ry?: number }
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
  if (how === "snap") return [{ t: C - 0.001, x: from.x, y: from.y, z: from.z, rx: from.rx ?? 0, ry: from.ry ?? 0, e: "hold" }, { t: C, x: to.x, y: to.y, z: to.z * 1.04, rx: to.rx ?? 0, ry: to.ry ?? 0, e: "hold" }, { t: C + st.T, z: to.z, e: "out" }]
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

const PROPS = ["x", "y", "z", "rx", "ry"] as const
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
