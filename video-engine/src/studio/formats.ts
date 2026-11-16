// Other shapes and lengths of a film. Re-framed, not cropped: each template shot is scaled to cover the new frame and
// moved so the part of it where the action is (measured in its golden frame by the template probe: focus.json) stays
// in view; a shot whose titles wouldn't fit shrinks until they do, centred on them, its scene taking its ground to
// fill around it; titles narrow to the new frame. Cut down to 6, 15 or 30 s: the scenes that matter most kept in order (the
// hook first, the name or the call last, then the product, its features, its proof), each retimed within what it reads
// at, the whole brought to the length. Plain data: `npm run check` runs it.
import type { LibShot } from "./shots.ts"

type Size = "16x9" | "1x1" | "9x16"
type Box = { x: number; y: number; w: number }
type Layer = { id: string; kind: string; anim?: string; from?: number; rate?: number; aspect?: number; box?: Box; hidden?: boolean }
type Scene = { id: string; name: string; duration: number; look?: { fill?: string }; layers: Layer[] }
type Comp = { size: string; scenes: Scene[] }
type Spot = { x?: number; y?: number; w?: number; h?: number }
/** per shot: where its action is for each frame shape, `words` the box its titles take (fractions of its frame), and
    its ground colour */
export type Focus = Record<string, Partial<Record<Size | "words", Spot>> & { ground?: string }>

export const ASPECT: Record<string, number> = { "16x9": 16 / 9, "16x9-4k": 16 / 9, "4x3": 4 / 3, "1x1": 1, "4x5": 0.8, "9x16": 9 / 16, "app-store": 886 / 1920 }
/** the measured shape (focus.json has these three) nearest a size */
const nearest = (a: number): Size => (a > 1.3 ? "16x9" : a > 0.7 ? "1x1" : "9x16")
const r3 = (x: number) => Math.round(x * 1000) / 1000
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** room kept around titles that are fitted in */
const MARGIN = 0.06
const shotOf = (l: Layer, lib: LibShot[]) => (l.kind === "component" && l.from !== undefined ? lib.find((s) => s.film === l.anim && Math.abs(s.at - (l.from ?? 0)) < 0.05) : undefined)

/** The film in another frame shape: each template shot covering it, its action kept in view; titles narrowed. */
export function reframe<C extends Comp>(comp: C, size: string, lib: LibShot[], focus: Focus = {}): C {
  const A = ASPECT[size] ?? 16 / 9
  return {
    ...comp,
    size,
    scenes: comp.scenes.map((sc) => {
      let ground: string | undefined
      const layers = sc.layers.map((l) => {
        if (l.kind === "component" && l.from !== undefined && l.aspect) {
          const shot = focus[shotOf(l, lib)?.id ?? ""]
          const f = shot?.[nearest(A)] ?? {}
          const words = shot?.words
          if (l.aspect > A) {
            // wider than the frame: it fills the height and slides so its action sits in the middle; titles wider than
            // that leaves in view shrink it until they fit
            const fit = words?.w ? Math.max(1, 1 / (words.w + MARGIN)) : Infinity
            const w = Math.min(l.aspect / A, fit)
            if (w < l.aspect / A) ground = shot?.ground
            const fx = w < l.aspect / A ? words!.x! + words!.w! / 2 : (f.x ?? 0.5)
            return { ...l, box: { x: r3(clamp(0.5 + (0.5 - fx) * w, 1 - w / 2, w / 2)), y: 0.5, w: r3(w) } }
          }
          if (l.aspect < A) {
            // taller than the frame: it fills the width and slides up or down to its action; titles taller than that
            // leaves in view shrink it until they fit
            const fit = words?.h ? Math.max(l.aspect / A, l.aspect / (A * (words.h + MARGIN))) : Infinity
            const w = Math.min(1, fit)
            if (w < 1) ground = shot?.ground
            const h = (w * A) / l.aspect
            const fy = w < 1 ? words!.y! + words!.h! / 2 : (f.y ?? 0.5)
            return { ...l, box: { x: 0.5, y: r3(clamp(0.5 + (0.5 - fy) * h, 1 - h / 2, h / 2)), w: r3(w) } }
          }
          return { ...l, box: { x: 0.5, y: 0.5, w: 1 } }
        }
        // a title in a narrower frame keeps inside it
        if (l.kind === "text" && l.box && A < 1.2) return { ...l, box: { ...l.box, x: Math.min(0.94 - Math.min(l.box.w, 0.86) / 2, Math.max(0.06 + Math.min(l.box.w, 0.86) / 2, l.box.x)), w: Math.min(l.box.w, 0.86) } }
        return l
      })
      return { ...sc, ...(ground ? { look: { ...sc.look, fill: ground } } : {}), layers }
    }),
  }
}

const PRIORITY = ["hook", "logo", "cta", "product", "feature", "proof", "intro", "detail", "bridge"]
/** The film cut down to about `target` s: which scenes stay (in order) and each one's new length. Scenes that aren't a
    template's shot read between 1 s and twice their length. */
export function cutdown(comp: Comp, target: number, lib: LibShot[]): { keep: number[]; durations: number[] } {
  const info = comp.scenes.map((sc, i) => {
    const shot = sc.layers.map((l) => shotOf(l, lib)).find(Boolean)
    const role = shot?.role[0] ?? (i === 0 ? "hook" : i === comp.scenes.length - 1 ? "logo" : "feature")
    const range: [number, number] = shot ? shot.stretch : [Math.min(1, sc.duration), sc.duration * 2]
    return { i, role, range, dur: sc.duration, rank: PRIORITY.indexOf(role) < 0 ? 9 : PRIORITY.indexOf(role) }
  })
  // the first and the last always, then by what matters most, while the shortest each can be still fits
  const must = new Set([0, comp.scenes.length - 1])
  const order = [...info].sort((a, b) => Number(must.has(b.i)) - Number(must.has(a.i)) || a.rank - b.rank || a.i - b.i)
  const keep: number[] = []
  let least = 0
  for (const s of order) {
    if (least + s.range[0] > target && keep.length >= 2) continue
    keep.push(s.i)
    least += s.range[0]
  }
  keep.sort((a, b) => a - b)
  // their lengths scaled together to the target, each held within its range
  const kept = keep.map((i) => info[i])
  const base = kept.reduce((a, s) => a + s.dur, 0)
  let durations = kept.map((s) => Math.min(s.range[1], Math.max(s.range[0], (s.dur * target) / base)))
  // what the ranges held back, shared by the scenes with room left
  for (let pass = 0; pass < 4; pass++) {
    const gap = target - durations.reduce((a, b) => a + b, 0)
    if (Math.abs(gap) < 0.05) break
    const room = kept.map((s, j) => (gap > 0 ? s.range[1] - durations[j] : durations[j] - s.range[0]))
    const total = room.reduce((a, b) => a + Math.max(0, b), 0)
    if (total <= 0) break
    durations = durations.map((d, j) => d + (gap * Math.max(0, room[j])) / total)
  }
  return { keep, durations: durations.map((d) => Math.round(d * 100) / 100) }
}
