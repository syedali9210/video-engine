// Guardrails: the rules a film is held to (taste, written down; src/studio/taste.ts is a different thing: what the
// Lab learns from your verdicts). What the reference films measured (npm run measure: the motion styles in
// styles.ts are their timings and curves) and what looked wrong when it was broken, written down as numbers: the
// generator (compose.ts, camera.ts, backdrop.ts, assemble.ts) builds inside them, and `judge` reads every film against
// them before it's rendered (POST /__film/flow, npm run film, npm run check). A film that breaks an error isn't made.
//
// The rules, in words:
//   complete   a scene plays all of its own animation, holds, and only then leaves: nothing is cut off mid-move
//   read       words stay up long enough to read
//   still      something is always moving: a frame never sits dead for more than a second
//   camera     angles a camera would take, never a spin: tilt, turn and roll within bounds, zoom within bounds; and no
//              angle twice in a film (every scene seen from its own: camera.ts shotFor and angleFor keep to it); the
//              opening never turned
//   blur       soft, never smeared: motion blur and depth of field capped, what the camera follows stays sharp
//   colour     one hue family, the brand's: no rainbow meshes, no grey-on-grey; grain per scene, light
//   cuts       a film keeps its signature cut, and never the same cut three times running
//   product    the product is shown as itself: its own captured components and screens, never a drawn stand-in
//   type       words big enough to read at 1080p
// Pure: no DOM.
import type { Graph } from "./graph.ts"
import { alive, camAt, sample, tracks } from "./graph.ts"

export const TASTE = {
  /** the camera's bounds: tilt (rx), turn (ry), roll (rz) in degrees; zoom */
  camera: { rx: 14, ry: 20, rz: 6, zMin: 0.5, zMax: 8 },
  /** motion blur (px) and depth of field (0–1) at most */
  blur: { motion: 5, dof: 0.6 },
  /** the longest a frame may sit with nothing moving (s) */
  still: 1.0,
  /** words stay up at least `base` + words / `wps` seconds from when they start to show */
  read: { base: 0.35, wps: 3.4 },
  /** how far (deg) any colour of a ground or a backdrop may turn from the brand's hue */
  hues: 40,
  /** a backdrop's strength at most, and under the words (its quiet zone) */
  backdrop: { alpha: 0.5, quiet: 0.28 },
  /** the same cut at most this many times running */
  repeat: 2,
  /** grain (a scene's own) at most */
  grain: 0.3,
  /** the smallest words (px at 1080p) and the shortest scene (s) */
  text: 26,
  scene: 1.2,
  /** a film's length (s) */
  length: { min: 5, max: 120 },
} as const

export type Finding = { rule: string; level: "error" | "warn"; at?: number; scene?: number; text: string }
export type Verdict = { pass: boolean; findings: Finding[] }

/** what the judge needs besides the graph: each scene's start, length, kind, when its own animation is done, the
    lead its way out takes, the style's hold, the cuts, and what each product scene shows */
export type Plan = { at: number[]; dur: number[]; kinds: string[]; done: number[]; lead: number[]; hold: number; transitions: (string | null)[]; words: (string | null)[]; product: (string | null | undefined)[]; brandHue?: number; angles?: (string | null)[]; fields?: { at: number; colors: string[] }[] }

const hueOf = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  if (d < 0.08) return null // a grey has no hue to break the family with
  const h = mx === r ? 60 * (((g - b) / d + 6) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return h
}
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** A film read against the rules. */
export function judge(g: Graph, p: Plan): Verdict {
  const out: Finding[] = []
  const add = (f: Finding) => out.push(f)
  // complete: its own animation, the hold, then the way out
  p.kinds.forEach((k, i) => {
    const end = p.at[i] + p.dur[i]
    const leaves = end - p.lead[i]
    if (p.done[i] > leaves + 1e-3) add({ rule: "complete", level: "error", scene: i, at: p.done[i], text: `${k} (scene ${i + 1}) is still animating at ${p.done[i].toFixed(2)} s but starts leaving at ${leaves.toFixed(2)} s` })
    else if (p.done[i] + p.hold > leaves + 0.02) add({ rule: "complete", level: "error", scene: i, at: p.done[i], text: `${k} (scene ${i + 1}) finishes at ${p.done[i].toFixed(2)} s and leaves at ${leaves.toFixed(2)} s: no hold` })
    if (p.dur[i] < TASTE.scene) add({ rule: "complete", level: "warn", scene: i, text: `${k} (scene ${i + 1}) lasts ${p.dur[i].toFixed(2)} s` })
  })
  // read: words up long enough once they're all there
  p.words.forEach((w, i) => {
    if (!w) return
    const n = w.split(/\s+/).filter(Boolean).length
    const need = TASTE.read.base + n / TASTE.read.wps
    // (from when it starts to show, a moment into the scene, to when it starts to leave)
    const up = p.dur[i] - p.lead[i] - 0.25
    if (up + 0.05 < need) add({ rule: "read", level: "warn", scene: i, text: `“${w.slice(0, 40)}” is up for ${up.toFixed(2)} s; it needs ~${need.toFixed(1)} s to read` })
  })
  // the camera, and what's still, sampled through the film
  const trs = new Map(g.els.map((e) => [e.id, tracks(e)]))
  const step = 1 / 20
  let stillFrom: number | null = null
  let prev: string | null = null
  const hasMotion = g.grounds.some((x) => x.g.motion)
  for (let t = 0; t <= g.dur + 1e-6; t += step) {
    const v = camAt(g.cam, t, undefined, g.lag)
    if (Math.abs(v.rx) > TASTE.camera.rx + 0.5 || Math.abs(v.ry) > TASTE.camera.ry + 0.5 || Math.abs(v.rz) > TASTE.camera.rz + 0.5) {
      add({ rule: "camera", level: "error", at: t, text: `the camera is turned ${v.rx.toFixed(1)}°, ${v.ry.toFixed(1)}°, rolled ${v.rz.toFixed(1)}° at ${t.toFixed(2)} s (at most ${TASTE.camera.rx}°, ${TASTE.camera.ry}°, ${TASTE.camera.rz}°)` })
      break
    }
    if (v.z < TASTE.camera.zMin - 1e-3 || v.z > TASTE.camera.zMax + 1e-3) {
      add({ rule: "camera", level: "error", at: t, text: `the camera's zoom is ${v.z.toFixed(2)} at ${t.toFixed(2)} s` })
      break
    }
    // a frame's fingerprint: the camera and every live element, rounded to what shows
    const sig = [v.x, v.y, v.z * 100, v.rx * 10, v.ry * 10, v.rz * 10].map((n) => Math.round(n)).join(",") + "|" + alive(g, t).map((e) => {
      const s = sample(trs.get(e.id)!, t)
      return [s.x, s.y, s.w, s.h, s.o * 50, s.s * 200, s.rot * 4, s.reveal * 60, s.typed, s.build * 200, s.blur * 4, s.tx * 4, s.ty * 4].map((n) => Math.round(n)).join(",")
    }).join(";")
    // (a ground with moving graphics is never still; a component being built moves on its own clock)
    const building = alive(g, t).some((e) => {
      const a = e.c?.a as { grow?: [number, number, number][]; end?: number } | undefined
      return e.kind === "assembly" && !!a?.grow && t >= a.grow[0][0] && t <= (a.end ?? 0)
    })
    const moving = building || (hasMotion && g.grounds.some((x) => x.g.motion && x.t <= t && (g.grounds.find((y) => y.t > x.t)?.t ?? Infinity) > t))
    if (sig === prev && !moving) stillFrom ??= t - step
    else {
      if (stillFrom !== null && t - stillFrom > TASTE.still) add({ rule: "still", level: "warn", at: stillFrom, text: `nothing moves for ${(t - stillFrom).toFixed(2)} s from ${stillFrom.toFixed(2)} s` })
      stillFrom = null
    }
    prev = sig
  }
  // the opening is never turned: square on all through its own stretch
  if (p.at.length > 1) {
    for (let t = 0; t < p.at[1] - p.lead[0]; t += 0.1) {
      const v = camAt(g.cam, t, undefined, g.lag)
      if (Math.abs(v.rx) > 0.3 || Math.abs(v.ry) > 0.3 || Math.abs(v.rz) > 0.3) {
        add({ rule: "camera", level: "error", scene: 0, at: t, text: `the opening is turned (${v.rx.toFixed(1)}°, ${v.ry.toFixed(1)}°, rolled ${v.rz.toFixed(1)}°) at ${t.toFixed(2)} s: it stays square on` })
        break
      }
    }
  }
  // no angle twice (while the film has scenes enough for every one to differ)
  const seen = new Map<string, number>()
  ;(p.angles ?? []).forEach((a, i) => {
    if (!a) return
    if (seen.has(a)) add({ rule: "camera", level: (p.angles ?? []).filter(Boolean).length > 11 ? "warn" : "error", scene: i, text: `scene ${i + 1} is seen from the ${a} angle again (scene ${seen.get(a)! + 1} was)` })
    else seen.set(a, i)
  })
  // blur
  for (const d of g.dof) if (d.k > TASTE.blur.dof + 1e-3) add({ rule: "blur", level: "error", at: d.t, text: `depth of field ${d.k} at ${d.t.toFixed(2)} s (at most ${TASTE.blur.dof})` })
  // colour: one family, the brand's
  if (p.brandHue !== undefined)
    for (const fl of p.fields ?? [])
      for (const c of fl.colors) {
        const h = hueOf(c)
        if (h !== null && gap(h, p.brandHue) > TASTE.hues) add({ rule: "colour", level: "error", at: fl.at, text: `a gradient colour ${c} is ${gap(h, p.brandHue).toFixed(0)}° from the brand's hue (a rainbow, not one family)` })
      }
  if (p.brandHue !== undefined)
    for (const gk of g.grounds) {
      const cols = gk.g.motion?.colors ?? []
      for (const c of cols) {
        const h = hueOf(c)
        if (h !== null && gap(h, p.brandHue) > TASTE.hues) add({ rule: "colour", level: "error", at: gk.t, text: `a backdrop colour ${c} is ${gap(h, p.brandHue).toFixed(0)}° from the brand's hue` })
      }
      if (gk.g.tone === "field" && (gk.g.grain ?? 0) > TASTE.grain) add({ rule: "colour", level: "warn", at: gk.t, text: `grain ${gk.g.grain} (at most ${TASTE.grain})` })
    }
  // cuts: never three alike running
  for (let i = 2; i < p.transitions.length; i++) {
    const [a, b, c] = [p.transitions[i - 2], p.transitions[i - 1], p.transitions[i]]
    if (a && a === b && b === c) add({ rule: "cuts", level: "warn", scene: i, text: `three ${c} cuts running into scene ${i + 1}` })
  }
  // the product as itself
  p.kinds.forEach((k, i) => {
    if (["panel", "component", "tour", "app"].includes(k) && !p.product[i]) add({ rule: "product", level: "error", scene: i, text: `${k} (scene ${i + 1}) shows no captured component or screen of the product` })
  })
  // type
  for (const e of g.els) if (e.kind === "text" && typeof e.c?.size === "number" && e.c.size < TASTE.text) add({ rule: "type", level: "warn", at: e.a, text: `words at ${e.c.size}px: “${String(e.c.text ?? "").slice(0, 30)}”` })
  // length
  if (g.dur < TASTE.length.min || g.dur > TASTE.length.max) add({ rule: "complete", level: "warn", text: `the film is ${g.dur.toFixed(1)} s` })
  return { pass: !out.some((f) => f.level === "error"), findings: out }
}
