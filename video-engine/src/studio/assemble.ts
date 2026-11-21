// The assembly: a component of the product's own (captured whole: public/panel-capture.js marks its parts) built in
// front of the camera one piece at a time, every piece landing exactly where it is in the product, until it's the
// component itself. The order is the one a reader takes: row by row from the top (a row: the pieces that share a line),
// left to right in a row, a surface just before what sits on it. Each kind of piece arrives its own way:
//   surface   drawn: it opens down from its top edge, settling
//   divider   drawn across from its left end
//   text      the title (the biggest words near the top) typed, letter by letter with a caret; the rest word by
//             word, each rising out of a little blur
//   icon      popped in, past its size and back
//   image     faded up, settling from a little closer
//   button    formed: a dot stretching to its width, then its label
//   control   slid in from the left
// The component itself grows as it's built: from a pill round its first row to its full size, its height following the
// lowest row built. The camera (compose.ts) looks at each row as it builds, then pulls back to the whole. Then the
// primary button is pressed. Its tempo is the motion style's; it fits the time it's given. Pure: no DOM.
import type { MotionStyle } from "./styles.ts"

export type PartKind = "surface" | "divider" | "text" | "icon" | "image" | "button" | "control"
/** a piece of a captured component (px inside it): what it is, where, inside which (`up`), its words */
export type Part = { id: number; kind: PartKind; x: number; y: number; w: number; h: number; depth: number; up: number; text?: string; size?: number; weight?: number; primary?: boolean; on?: boolean }
export type How = "draw" | "line" | "type" | "words" | "pop" | "fade" | "form" | "slide"
/** a piece's arrival: when, how long, how; `step` the gap between its words (s), `n` how many it has */
export type Step = { id: number; at: number; len: number; how: How; n?: number; step?: number }
/** a row as it's built: when, and its box (px inside the component) */
export type Row = { at: number; until: number; x: number; y: number; w: number; h: number }
export type Assembly = {
  w: number
  h: number
  /** the component's outline as it grows: [t, width, height] (px), and its corner */
  grow: [number, number, number][]
  r: number
  steps: Step[]
  rows: Row[]
  /** letters a second, for typed words */
  cps: number
  /** when it's all built, and the press (the part pressed, when, where) */
  end: number
  press?: { id: number; at: number; x: number; y: number }
}

/** a row's gap and a piece's within it, by the style: a style of cuts builds briskly, a soft one unhurried */
const TEMPO: Record<string, number> = { soft: 0.34, kinetic: 0.17, tour: 0.21, orbit: 0.27, cta: 0.23 }

/** The rows a reader takes: pieces whose lines overlap, top to bottom; surfaces apart (they go just before the first
    row on them). */
export function rowsOf(parts: Part[]) {
  const content = parts.filter((p) => p.kind !== "surface").sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: { top: number; bottom: number; parts: Part[] }[] = []
  for (const p of content) {
    const cur = rows.at(-1)
    if (cur && p.y < cur.bottom - Math.min(8, p.h * 0.4)) {
      cur.parts.push(p)
      cur.bottom = Math.max(cur.bottom, p.y + p.h)
    } else rows.push({ top: p.y, bottom: p.y + p.h, parts: [p] })
  }
  for (const r of rows) r.parts.sort((a, b) => a.x - b.x)
  return rows
}

/** How a component is built, from `t0`, in at most `budget` seconds (the rows close up to fit). */
export function assemble(parts: Part[], o: { w: number; h: number; t0: number; style: MotionStyle; cps: number; budget?: number; press?: string; radius?: number }): Assembly {
  const st = o.style
  const rows = rowsOf(parts)
  const surfaces = parts.filter((p) => p.kind === "surface" && !(p.x <= 1 && p.y <= 1 && p.w >= o.w - 2 && p.h >= o.h - 2))
  // the title: the biggest words in the first rows
  const texts = parts.filter((p) => p.kind === "text" && p.text)
  const top = rows.slice(0, 3).flatMap((r) => r.parts).filter((p) => p.kind === "text" && p.text)
  const title = [...top].sort((a, b) => (b.size ?? 0) - (a.size ?? 0) || a.y - b.y)[0]
  const k = 1 / st.speed
  const wordStep = Math.max(0.03, Math.min(0.07, st.wordStep * 0.5)) * k
  const lenOf = (p: Part): number => {
    const n = p.text ? p.text.split(/\s+/).length : 0
    if (p === title) return Math.max(0.3, (p.text ?? "").length / o.cps)
    switch (p.kind) {
      case "text":
        return 0.3 * k + Math.min(12, n) * wordStep
      case "button":
        return 0.48 * k
      case "divider":
        return 0.42 * k
      case "image":
        return 0.5 * k
      case "icon":
        return 0.36 * k
      default:
        return 0.34 * k
    }
  }
  // the gaps: the style's, closed up when the rows wouldn't fit the time they have
  let gap = (TEMPO[st.id] ?? 0.26) * k
  const inRow = 0.24
  const titleLen = title ? lenOf(title) : 0
  if (o.budget) {
    const need = 0.55 + titleLen + rows.length * gap + 0.6
    if (need > o.budget) gap = Math.max(0.08, (o.budget - 0.55 - titleLen - 0.6) / Math.max(1, rows.length))
  }
  const steps: Step[] = []
  const rowsOut: Row[] = []
  // the outline forms first: a pill round the first row, out to the full width
  const first = rows[0]
  const pillH = first ? Math.min(o.h, first.bottom + Math.max(14, first.top)) : Math.min(o.h, 64)
  const formAt = o.t0
  const wide = formAt + 0.42 * k
  let t = wide - 0.06
  const grow: [number, number, number][] = [[formAt, Math.min(o.w, pillH * 1.4), pillH], [wide, o.w, pillH]]
  const placed = new Set<number>()
  rows.forEach((row, i) => {
    const at = t
    // the surfaces this row sits on, just before it
    for (const s of surfaces)
      if (!placed.has(s.id) && s.y <= row.top + 2 && s.y + s.h >= row.top) {
        steps.push({ id: s.id, at: Math.max(formAt, at - 0.1), len: 0.4 * k, how: "draw" })
        placed.add(s.id)
      }
    row.parts.forEach((p, j) => {
      const a = at + j * gap * inRow
      const how: How = p === title ? "type" : p.kind === "text" ? "words" : p.kind === "divider" ? "line" : p.kind === "icon" ? "pop" : p.kind === "image" ? "fade" : p.kind === "button" ? "form" : "slide"
      const n = p.text ? p.text.split(/\s+/).length : undefined
      steps.push({ id: p.id, at: a, len: lenOf(p), how, ...(n ? { n } : {}), ...(how === "words" || how === "form" ? { step: wordStep } : {}) })
    })
    const x0 = Math.min(...row.parts.map((p) => p.x))
    const x1 = Math.max(...row.parts.map((p) => p.x + p.w))
    const until = Math.max(...steps.filter((s) => row.parts.some((p) => p.id === s.id)).map((s) => s.at + s.len))
    rowsOut.push({ at, until, x: x0, y: row.top, w: x1 - x0, h: row.bottom - row.top })
    // the outline down to this row (and what's under it up to the next)
    const next = rows[i + 1]
    grow.push([Math.max(at + 0.05, grow[grow.length - 1][0] + 0.04), o.w, Math.max(grow[grow.length - 1][2], Math.min(o.h, next ? next.top - 2 : o.h))])
    // a typed title takes the row its time before the next row starts
    t = at + (row.parts.includes(title as Part) ? Math.max(gap, titleLen * 0.7) : gap)
  })
  // surfaces no row claimed
  for (const s of surfaces) if (!placed.has(s.id)) steps.push({ id: s.id, at: formAt + 0.1, len: 0.4 * k, how: "draw" })
  // words no row claimed (none should be: every text part is in a row)
  for (const p of texts) if (!steps.some((s) => s.id === p.id)) steps.push({ id: p.id, at: t, len: lenOf(p), how: "words", n: p.text!.split(/\s+/).length, step: wordStep })
  grow.push([Math.max(t, grow[grow.length - 1][0] + 0.2), o.w, o.h])
  let end = Math.max(t, ...steps.map((s) => s.at + s.len))
  // the press: the button asked for, else the primary one, else the last
  const buttons = parts.filter((p) => p.kind === "button")
  const want = o.press?.toLowerCase()
  const btn = (want && buttons.find((b) => b.text?.toLowerCase().includes(want))) || buttons.find((b) => b.primary) || buttons.at(-1)
  let press: Assembly["press"]
  if (btn) {
    const b = steps.find((s) => s.id === btn.id)
    const at = Math.max(end + 0.35 * k, (b ? b.at + b.len : end) + 0.3)
    press = { id: btn.id, at, x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 }
    end = at + 0.45
  }
  return { w: o.w, h: o.h, grow, r: o.radius ?? 16, steps, rows: rowsOut, cps: o.cps, end, ...(press ? { press } : {}) }
}

/** where a piece is at t, as its arrival makes it: 0 not yet, 1 there (and its words', by index) */
export const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3)
export const back = (u: number) => {
  const x = Math.max(0, Math.min(1, u))
  const s = 1.7
  return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
}
/** the outline at t: width, height */
export function outlineAt(a: Assembly, t: number): [number, number] {
  const g = a.grow
  if (t <= g[0][0]) return [g[0][1], g[0][2]]
  for (let i = 1; i < g.length; i++) {
    if (t <= g[i][0]) {
      const u = ease((t - g[i - 1][0]) / Math.max(1e-6, g[i][0] - g[i - 1][0]))
      return [g[i - 1][1] + (g[i][1] - g[i - 1][1]) * u, g[i - 1][2] + (g[i][2] - g[i - 1][2]) * u]
    }
  }
  const last = g[g.length - 1]
  return [last[1], last[2]]
}
