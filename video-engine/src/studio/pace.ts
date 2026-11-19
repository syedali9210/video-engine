// Motion profiles: how a reference film moves, measured, so the flow generator (flow.ts) cuts a new film to the same
// pace. The measuring is motiscope's (github.com/KumarSashank/motiscope, MIT): a dense per-frame motion-energy curve
// (scripts/motion/measure.swift on macOS, ffmpeg elsewhere: scripts/measure.mjs) is the source of truth for time. Here
// it's segmented (the hold threshold anchored to the 75th percentile, short runs merged), each move's easing is fitted
// from the integral of its energy against a small library of real cubic-beziers, hard cuts are found as whole-frame
// spikes, and each stretch's ground is named from its colour (a field of colour, white, dark, light). What a curve
// can't measure (how fast text is typed, how fast words are revealed) a profile states, read off its frames.
// Pure: no DOM, no node.

export type Frame = { t: number; energy: number; local: number; y: number; r: number; g: number; b: number }
export type Tone = "field" | "white" | "dark" | "light"
export type Segment = { from: number; to: number; kind: "move" | "hold"; peak: number; ease?: string; tone: Tone; color: string }
/** one burst of motion: a thing entering, leaving, or a scene becoming the next. `front`: where its peak falls (0 at
    its start: a snap, the change all at once and then settling; 0.5: in and out alike; near 1: building to the end);
    `shape`: snap, out (fast then settling), inOut, in (slow then fast) */
export type Event = { at: number; dur: number; peak: number; front: number; shape: "snap" | "out" | "inOut" | "in"; ease: string }
export type Profile = {
  name: string
  source?: string
  /** seconds */
  duration: number
  /** a move's and a hold's typical length (medians), s */
  move: number
  hold: number
  /** how long one scene takes to become the next (a shared shape morphing), s */
  morph: number
  /** the easing most of its moves have, and its curve */
  ease: string
  bezier: [number, number, number, number]
  /** hard cuts in it (0: every change is a morph) */
  cuts: number
  /** letters a second, typed (a prompt streaming in) and revealed (a line wiped on) */
  typeCps: number
  revealCps: number
  /** its grounds in order, merged (field → white → dark → field…) */
  grounds: Tone[]
  segments: Segment[]
  /** its bursts of motion, and what they share: how often one comes (beat, s), how long one lasts (trans, s), how
      many are snaps (0–1), how long the stills between them are (gap, s), their commonest curve */
  events?: Event[]
  beat?: number
  trans?: number
  snaps?: number
  gap?: number
  eventEase?: string
}

export const EASE_LIB: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-in-strong": [0.7, 0, 0.84, 0],
  "ease-out": [0, 0, 0.58, 1],
  "ease-out-strong": [0.16, 1, 0.3, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  "ease-in-out-strong": [0.65, 0, 0.35, 1],
}
/** a cubic-bezier's y at x (bisection on its x) */
export function bezierAt([x1, y1, x2, y2]: number[], x: number) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    const bx = 3 * (1 - m) ** 2 * m * x1 + 3 * (1 - m) * m * m * x2 + m ** 3
    if (bx < x) lo = m
    else hi = m
  }
  const m = (lo + hi) / 2
  return 3 * (1 - m) ** 2 * m * y1 + 3 * (1 - m) * m * m * y2 + m ** 3
}

/** frames.csv (t,energy,local,yavg,r,g,b,grid) as frames */
export function parseFrames(csv: string): Frame[] {
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","))
    .filter((c) => c.length >= 7 && Number.isFinite(+c[0]))
    .map((c) => ({ t: +c[0], energy: +c[1], local: +c[2], y: +c[3], r: +c[4], g: +c[5], b: +c[6] }))
}

const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0
}
const median = (a: number[]) => pct(a, 0.5)
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
/** a colour's ground: white, dark, a field of colour (saturated), or light grey */
export function toneOf(r: number, g: number, b: number): Tone {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const sat = mx ? (mx - mn) / mx : 0
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y < 70) return "dark"
  if (sat > 0.22) return "field"
  return y > 200 ? "white" : "light"
}

/** The profile of a measured film: its segments, their easings, its cuts, its grounds, its pace. */
/** A source at half the recording's rate (a 30 fps film screen-recorded at 60) repeats every other frame: those carry
    no change, and split every move in two. Seen, each frame takes the larger of itself and the one before. */
export function undouble(e: number[]) {
  let low = 0
  let n = 0
  for (let i = 1; i < e.length - 1; i++) {
    const m = Math.max(e[i - 1], e[i + 1])
    if (m > 1) {
      n++
      if (e[i] < 0.08 * m) low++
    }
  }
  return n > 10 && low / n > 0.25 ? e.map((v, i) => Math.max(v, e[i - 1] ?? 0)) : e
}

export function profileOf(frames: Frame[], o: { name: string; source?: string; typeCps?: number; revealCps?: number }): Profile {
  const t = frames.map((f) => f.t)
  const e = undouble(frames.map((f) => f.local))
  const g = undouble(frames.map((f) => f.energy))
  const NOISE = 0.05
  const ref = Math.max(pct(e, 0.75), NOISE)
  const th = Math.max(NOISE, 0.18 * ref)
  // hard cuts: the whole frame changing at once, far above the frames just before
  const gm = median(g)
  const cuts: number[] = []
  for (let i = 1; i < g.length; i++) if (g[i] > Math.max(12, 6 * gm) && g[i] > 2.5 * Math.max(0.01, ...g.slice(Math.max(0, i - 3), i)) && (!cuts.length || t[i] - t[cuts.at(-1)!] > 0.15)) cuts.push(i)
  // moving or still, in runs; runs under 0.1 s merged into their neighbours
  type Run = { a: number; b: number; m: boolean }
  let runs: Run[] = []
  for (let i = 0, s = 0; i <= e.length; i++) if (i === e.length || (e[i] > th) !== (e[s] > th)) (runs.push({ a: s, b: i - 1, m: e[s] > th }), (s = i))
  for (let changed = true; changed && runs.length > 1; ) {
    changed = false
    const k = runs.findIndex((r) => t[r.b] - t[r.a] < 0.1)
    if (k >= 0) {
      const j = k > 0 ? k - 1 : k + 1
      runs[j] = { ...runs[j], a: Math.min(runs[j].a, runs[k].a), b: Math.max(runs[j].b, runs[k].b) }
      runs.splice(k, 1)
      changed = true
    }
    runs = runs.reduce<Run[]>((a, r) => (a.length && a.at(-1)!.m === r.m ? (a.at(-1)!.b = r.b, a) : [...a, { ...r }]), [])
  }
  // a move's easing: the running integral of its energy is its displacement over time; the closest real curve wins
  const easing = (a: number, b: number) => {
    const seg = e.slice(a, b + 1)
    const tot = seg.reduce((x, y) => x + y, 0)
    if (seg.length < 5 || tot <= 0) return undefined
    let c = 0
    const cum = seg.map((v) => (c += v) / tot)
    let best = ["linear", Infinity] as [string, number]
    for (const [name, p] of Object.entries(EASE_LIB)) {
      const err = Math.sqrt(cum.reduce((s, v, i) => s + (v - bezierAt(p, i / (seg.length - 1))) ** 2, 0) / cum.length)
      if (err < best[1]) best = [name, err]
    }
    return best[0]
  }
  const segments: Segment[] = runs.map((r) => {
    const mid = frames[(r.a + r.b) >> 1]
    return { from: round(t[r.a]), to: round(t[r.b]), kind: r.m ? "move" : "hold", peak: round(Math.max(...e.slice(r.a, r.b + 1))), ...(r.m ? { ease: easing(r.a, r.b) } : {}), tone: toneOf(mid.r, mid.g, mid.b), color: hex(mid.r, mid.g, mid.b) }
  })
  // the opening and closing stills (a player before it starts, after it ends) don't set the pace
  const inner = segments.slice(1, -1)
  const moves = inner.filter((s) => s.kind === "move")
  const holds = inner.filter((s) => s.kind === "hold")
  const count = new Map<string, number>()
  for (const s of moves) count.set(s.ease!, (count.get(s.ease!) ?? 0) + (s.to - s.from))
  const ease = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "ease-out"
  const grounds = segments.filter((s) => s.to - s.from > 0.25).map((s) => s.tone).filter((x, i, a) => i === 0 || a[i - 1] !== x)
  // a morph: about the short moves' typical length (the long ones are scenes moving inside themselves)
  const short = moves.map((s) => s.to - s.from).filter((d) => d < 1.6)
  // the bursts: above a threshold (a quarter of the busiest frames' level), gaps under 0.08 s joined
  const busy = Math.max(th, pct(e, 0.9) * 0.22)
  const bursts: [number, number][] = []
  for (let i = 0; i < e.length; i++) {
    if (e[i] <= busy) continue
    const last = bursts.at(-1)
    if (last && t[i] - t[last[1]] < 0.08) last[1] = i
    else bursts.push([i, i])
  }
  const events: Event[] = bursts
    .filter(([a, b]) => t[b] - t[a] >= 0.05)
    .map(([a, b]) => {
      const seg = e.slice(a, b + 1)
      const pk = seg.indexOf(Math.max(...seg))
      const front = seg.length > 1 ? pk / (seg.length - 1) : 0
      const ease = easing(a, b) ?? "linear"
      const shape: Event["shape"] = front < 0.12 && seg[pk] > 3 * ref ? "snap" : front < 0.38 ? "out" : front < 0.65 ? "inOut" : "in"
      return { at: round(t[a]), dur: round(t[b] - t[a] + 1 / 60), peak: round(seg[pk]), front: round(front), shape, ease }
    })
  const gaps = events.slice(1).map((x, i) => x.at - (events[i].at + events[i].dur)).filter((x) => x > 0)
  const evEase = new Map<string, number>()
  for (const x of events) evEase.set(x.ease, (evEase.get(x.ease) ?? 0) + x.dur)
  return {
    name: o.name,
    ...(o.source ? { source: o.source } : {}),
    duration: round(t.at(-1) ?? 0),
    move: round(median(moves.map((s) => s.to - s.from)) || 1.4),
    hold: round(median(holds.map((s) => s.to - s.from)) || 0.4),
    morph: round(Math.min(0.9, Math.max(0.4, median(short) || 0.6))),
    ease,
    bezier: EASE_LIB[ease],
    cuts: cuts.length,
    typeCps: o.typeCps ?? 75,
    revealCps: o.revealCps ?? 40,
    grounds,
    segments,
    events,
    beat: round(median(events.slice(1).map((x, i) => x.at - events[i].at)) || 0),
    trans: round(median(events.map((x) => x.dur)) || 0),
    snaps: round(events.length ? events.filter((x) => x.shape === "snap").length / events.length : 0),
    gap: round(median(gaps) || 0),
    eventEase: [...evEase.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  }
}
const round = (x: number) => Math.round(x * 100) / 100
