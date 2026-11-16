// Studio — paints: Figma's fills, a stack drawn back to front over the background. Each is solid, or a linear, radial,
// angular or diamond gradient, with its stops, its handles in the frame, an opacity and a blend mode. A paint can drift on
// its own (a video sees that) and follow the pointer through a spring (an interactive page sees that). One plain-canvas
// renderer draws them in the engine, the export and the web player; CSS is written out where CSS can say it.

export type Pt = { x: number; y: number }
export type Stop = { at: number; color: string; alpha: number }
export type PaintKind = "solid" | "linear" | "radial" | "angular" | "diamond"
export type Blend = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" | "color-dodge" | "color-burn" | "darken" | "lighten" | "difference" | "plus-lighter" | "hue" | "saturation" | "color" | "luminosity"
export type DriftKind = "none" | "orbit" | "breathe" | "spin" | "wave"
export type Paint = {
  id: string
  kind: PaintKind
  stops: Stop[]
  /** the handles, as fractions of the frame: a linear gradient runs from `from` to `to`; the others are centred on
      `from`, and `to` sets their main radius and which way it points */
  from: Pt
  to: Pt
  /** the cross radius against the main one: 1 is a circle (a square diamond) */
  ratio: number
  opacity: number
  blend: Blend
  hidden?: boolean
  /** follows the pointer: how far (0 to 1), and how: towards it, or turning to face it */
  follow?: { amount: number; how: "move" | "turn" }
  /** moves by itself, once every `period` seconds, so a video of a whole number of periods loops */
  drift?: { kind: DriftKind; period: number; amount: number }
}

export const PAINT_KINDS: { id: PaintKind; name: string }[] = [
  { id: "solid", name: "Solid" },
  { id: "linear", name: "Linear" },
  { id: "radial", name: "Radial" },
  { id: "angular", name: "Angular" },
  { id: "diamond", name: "Diamond" },
]
export const BLENDS: Blend[] = ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "color-dodge", "color-burn", "darken", "lighten", "difference", "plus-lighter", "hue", "saturation", "color", "luminosity"]
export const DRIFTS: { id: DriftKind; name: string; hint: string }[] = [
  { id: "none", name: "Still", hint: "Stays where it's put." },
  { id: "orbit", name: "Orbit", hint: "Circles slowly around where it's put." },
  { id: "breathe", name: "Breathe", hint: "Grows and shrinks a little." },
  { id: "spin", name: "Spin", hint: "Turns a full circle every period." },
  { id: "wave", name: "Wave", hint: "Drifts in a figure eight." },
]

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const rid = () => Math.random().toString(36).slice(2, 9)
const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join("")}` : "#000000")
export const rgba = (color: string, alpha: number) => {
  const n = parseInt(hex(color).slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+clamp(alpha).toFixed(3)})`
}
const sorted = (stops: Stop[]) => [...stops].sort((a, b) => a.at - b.at)

/** The colour a gradient has at `at` (0 to 1), for a stop added there. */
export function colourAt(stops: Stop[], at: number): Stop {
  const s = sorted(stops)
  if (!s.length) return { at, color: "#000000", alpha: 1 }
  if (at <= s[0].at) return { ...s[0], at }
  const j = s.findIndex((x) => x.at >= at)
  if (j < 0) return { ...s[s.length - 1], at }
  const a = s[j - 1]
  const b = s[j]
  const k = (at - a.at) / Math.max(1e-6, b.at - a.at)
  const [x, y] = [a, b].map((q) => parseInt(hex(q.color).slice(1), 16))
  const ch = (sh: number) => Math.round(((x >> sh) & 255) + (((y >> sh) & 255) - ((x >> sh) & 255)) * k)
  return { at, color: `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`, alpha: a.alpha + (b.alpha - a.alpha) * k }
}

export function newPaint(kind: PaintKind, color = "#3b82f6"): Paint {
  const base = { id: rid(), kind, opacity: 1, blend: "normal" as Blend, ratio: 1 }
  const fade = [
    { at: 0, color, alpha: 1 },
    { at: 1, color, alpha: 0 },
  ]
  if (kind === "solid") return { ...base, stops: [{ at: 0, color, alpha: 1 }], from: { x: 0.5, y: 0.5 }, to: { x: 0.8, y: 0.5 } }
  if (kind === "linear") return { ...base, stops: fade, from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 } }
  if (kind === "angular")
    return {
      ...base,
      stops: [
        { at: 0, color, alpha: 1 },
        { at: 0.5, color: "#ffffff", alpha: 1 },
        { at: 1, color, alpha: 1 },
      ],
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.8, y: 0.5 },
    }
  return { ...base, stops: fade, from: { x: 0.5, y: 0.5 }, to: { x: 0.8, y: 0.5 } }
}

/* ---------------- where a paint is, this frame ---------------- */

/** The pointer as paints feel it: smoothed through a spring, and `w`, how present it is (it fades out when it leaves). */
export type Pointer = { x: number; y: number; w: number }

/** A spring that eases the pointer in (TASTE §2.1: stiffness 90, damping 16, so it settles in ~0.5 s without a bounce).
    `step` it every frame with the real pointer (fractions of the frame) or null. */
export function pointerSpring() {
  const s = { x: 0.5, y: 0.5, vx: 0, vy: 0, w: 0, vw: 0, seen: false }
  const K = 90
  const D = 16
  return {
    step(dt: number, at: Pt | null): Pointer {
      const h = Math.min(1 / 30, Math.max(0, dt))
      if (at && !s.seen) {
        // first sight: start where it is, so it doesn't fly in from the middle
        s.x = at.x
        s.y = at.y
        s.seen = true
      }
      const tx = at?.x ?? s.x
      const ty = at?.y ?? s.y
      const tw = at ? 1 : 0
      s.vx += (K * (tx - s.x) - D * s.vx) * h
      s.vy += (K * (ty - s.y) - D * s.vy) * h
      s.vw += (K * (tw - s.w) - D * s.vw) * h
      s.x += s.vx * h
      s.y += s.vy * h
      s.w = clamp(s.w + s.vw * h)
      return { x: s.x, y: s.y, w: s.w }
    },
    /** still moving: keep drawing frames */
    get busy() {
      return Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vw) > 1e-3 || (s.w > 1e-3 && s.w < 0.999)
    },
  }
}

/** The handles in px this frame, after its drift (`t` seconds in) and the pointer. */
export function placed(p: Paint, W: number, H: number, t: number, ptr: Pointer | null) {
  let from = { x: p.from.x * W, y: p.from.y * H }
  let to = { x: p.to.x * W, y: p.to.y * H }
  const rot = (q: Pt, c: Pt, a: number) => ({ x: c.x + (q.x - c.x) * Math.cos(a) - (q.y - c.y) * Math.sin(a), y: c.y + (q.x - c.x) * Math.sin(a) + (q.y - c.y) * Math.cos(a) })
  const shift = (dx: number, dy: number) => {
    from = { x: from.x + dx, y: from.y + dy }
    to = { x: to.x + dx, y: to.y + dy }
  }
  const d = p.drift
  if (d && d.kind !== "none" && d.period > 0) {
    const ph = (2 * Math.PI * t) / d.period
    const reach = Math.min(W, H) * 0.14 * d.amount
    if (d.kind === "orbit") shift(Math.cos(ph) * reach, Math.sin(ph) * reach)
    else if (d.kind === "wave") shift(Math.sin(ph) * reach * 1.3, Math.sin(2 * ph) * reach * 0.6)
    else if (d.kind === "breathe") {
      const k = 1 + 0.28 * d.amount * Math.sin(ph)
      to = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
    } else if (d.kind === "spin") to = rot(to, from, ph)
  }
  const f = p.follow
  if (f && f.amount > 0 && ptr && ptr.w > 0) {
    const at = { x: ptr.x * W, y: ptr.y * H }
    const k = f.amount * ptr.w
    if (f.how === "move") shift((at.x - from.x) * k, (at.y - from.y) * k)
    else {
      const a0 = Math.atan2(to.y - from.y, to.x - from.x)
      const a1 = Math.atan2(at.y - from.y, at.x - from.x)
      const turn = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))
      to = rot(to, from, turn * k)
    }
  }
  return { from, to, ratio: Math.max(0.01, p.ratio) }
}

/** Whether a stack changes by itself or with the pointer (else it's drawn once). */
export const moves = (paints: Paint[] | undefined) => !!paints?.some((p) => !p.hidden && ((p.drift && p.drift.kind !== "none") || (p.follow && p.follow.amount > 0)))
export const follows = (paints: Paint[] | undefined) => !!paints?.some((p) => !p.hidden && p.follow && p.follow.amount > 0)

/* ---------------- drawing ---------------- */

const COMPOSITE: Record<Blend, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
  "plus-lighter": "lighter",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
}

function stopsInto(g: CanvasGradient, stops: Stop[]) {
  for (const s of sorted(stops)) g.addColorStop(clamp(s.at), rgba(s.color, s.alpha))
}

/** Draws a stack, back to front, onto a W×H canvas (in its own px). */
export function drawPaints(ctx: CanvasRenderingContext2D, W: number, H: number, paints: Paint[], t: number, ptr: Pointer | null) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
  for (const p of paints) {
    if (p.hidden || p.opacity <= 0 || !p.stops.length) continue
    ctx.save()
    ctx.globalAlpha = clamp(p.opacity)
    ctx.globalCompositeOperation = COMPOSITE[p.blend] ?? "source-over"
    if (p.kind === "solid") {
      ctx.fillStyle = rgba(p.stops[0].color, p.stops[0].alpha)
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
      continue
    }
    const { from, to, ratio } = placed(p, W, H, t, ptr)
    if (p.kind === "linear") {
      const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
      stopsInto(g, p.stops)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
      continue
    }
    const r = Math.max(0.5, Math.hypot(to.x - from.x, to.y - from.y))
    ctx.translate(from.x, from.y)
    ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x))
    ctx.scale(1, ratio)
    // big enough to cover the whole frame in this (turned, squashed) space
    const big = (Math.hypot(W, H) + 2 * Math.hypot(from.x - W / 2, from.y - H / 2)) / Math.min(1, ratio)
    if (p.kind === "radial") {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
      stopsInto(g, p.stops)
      ctx.fillStyle = g
      ctx.fillRect(-big, -big, 2 * big, 2 * big)
    } else if (p.kind === "angular") {
      const g = ctx.createConicGradient(0, 0, 0)
      stopsInto(g, p.stops)
      ctx.fillStyle = g
      ctx.fillRect(-big, -big, 2 * big, 2 * big)
    } else {
      // a diamond is four linear gradients, one per quarter, each running out from the middle towards its corner: in
      // the quarter (sx, sy) a gradient from 0 to (sx, sy)·r/2 is at (|x| + |y|) / r, so it reaches 1 at the tips
      for (const [sx, sy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const g = ctx.createLinearGradient(0, 0, (sx * r) / 2, (sy * r) / 2)
        stopsInto(g, p.stops)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, sx * big, sy * big)
      }
    }
    ctx.restore()
  }
}

/* ---------------- CSS ---------------- */

const pct = (x: number) => `${+(x * 100).toFixed(2)}%`
/** One paint as a CSS background layer for a W×H box (its opacity folded into the stops). CSS can't turn an ellipse, or
    draw a diamond: those come out as the nearest radial. */
export function paintCss(p: Paint, W: number, H: number): string {
  const st = (pos: (s: Stop) => string) =>
    sorted(p.stops)
      .map((s) => `${rgba(s.color, s.alpha * p.opacity)} ${pos(s)}`)
      .join(", ")
  if (p.kind === "solid") {
    const c = rgba(p.stops[0]?.color ?? "#000000", (p.stops[0]?.alpha ?? 1) * p.opacity)
    return `linear-gradient(${c}, ${c})`
  }
  const { from, to, ratio } = placed({ ...p, drift: undefined, follow: undefined }, W, H, 0, null)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const r = Math.max(0.5, Math.hypot(dx, dy))
  if (p.kind === "linear") {
    // CSS runs its line through the box's centre, as long as the box's corners need: map each stop onto it
    const th = Math.atan2(dy, dx)
    const ux = Math.cos(th)
    const uy = Math.sin(th)
    const L = Math.abs(W * ux) + Math.abs(H * uy)
    const off = (from.x - W / 2) * ux + (from.y - H / 2) * uy
    return `linear-gradient(${+((th * 180) / Math.PI + 90).toFixed(2)}deg, ${st((s) => pct((off + s.at * r) / L + 0.5))})`
  }
  const at = `at ${pct(from.x / W)} ${pct(from.y / H)}`
  if (p.kind === "angular") return `conic-gradient(from ${+((Math.atan2(dy, dx) * 180) / Math.PI + 90).toFixed(2)}deg ${at}, ${st((s) => `${+(s.at * 360).toFixed(2)}deg`)})`
  // radial (and the diamond's stand-in): axis-aligned, its radii as shares of the box
  const flat = Math.abs(dy) > Math.abs(dx)
  const rx = flat ? r * ratio : r
  const ry = flat ? r : r * ratio
  return `radial-gradient(${pct(rx / W)} ${pct(ry / H)} ${at}, ${st((s) => pct(s.at))})`
}

/** A stack's layers as one CSS background-image list (front first), opacity folded in, blend modes left out. */
export const layersCss = (paints: Paint[], W: number, H: number) =>
  paints
    .filter((p) => !p.hidden)
    .reverse()
    .map((p) => paintCss(p, W, H))
    .join(", ")

/** A whole stack as one CSS `background` (CSS lists the front layer first) with its blend modes. */
export function stackCss(paints: Paint[], W: number, H: number, base = "") {
  const shown = paints.filter((p) => !p.hidden).reverse()
  const bg = [...shown.map((p) => paintCss(p, W, H)), base].filter(Boolean).join(",\n    ")
  const blends = shown.map((p) => p.blend)
  return `background:\n    ${bg};${blends.some((b) => b !== "normal") ? `\nbackground-blend-mode: ${blends.join(", ")};` : ""}`
}

/* ---------------- presets ---------------- */

const P = (kind: PaintKind, stops: [string, number, number][], from: Pt, to: Pt, o: Partial<Paint> = {}): Paint => ({
  id: rid(),
  kind,
  stops: stops.map(([color, alpha, at]) => ({ color, alpha, at })),
  from,
  to,
  ratio: 1,
  opacity: 1,
  blend: "normal",
  ...o,
})
/** Grounds in the launch-film style: a blue glow in the dark, a sky, a pastel mesh, a spotlight that follows the pointer… */
export const PAINT_PRESETS: { id: string; name: string; dark: boolean; make: () => Paint[] }[] = [
  {
    id: "night-glow",
    name: "Night glow",
    dark: true,
    make: () => [
      P("solid", [["#020308", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("radial", [["#1d4ed8", 1, 0], ["#1e3a8a", 0.55, 0.45], ["#020308", 0, 1]], { x: 0.22, y: 0.42 }, { x: 0.78, y: 0.42 }, { ratio: 0.9, drift: { kind: "orbit", period: 12, amount: 0.5 } }),
      P("radial", [["#000000", 0, 0.55], ["#000000", 0.75, 1]], { x: 0.5, y: 0.5 }, { x: 1.05, y: 0.5 }, { ratio: 1.1 }),
    ],
  },
  {
    id: "sky",
    name: "Sky",
    dark: false,
    make: () => [P("linear", [["#1d5fe0", 1, 0], ["#5b9bf5", 1, 0.5], ["#eaf3ff", 1, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })],
  },
  {
    id: "pastel-mesh",
    name: "Pastel mesh",
    dark: false,
    make: () => [
      P("solid", [["#f4f4f7", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("radial", [["#b9f0dc", 1, 0], ["#b9f0dc", 0, 1]], { x: 0.18, y: 0.22 }, { x: 0.6, y: 0.22 }, { drift: { kind: "wave", period: 16, amount: 0.6 } }),
      P("radial", [["#d6cbff", 1, 0], ["#d6cbff", 0, 1]], { x: 0.84, y: 0.18 }, { x: 1.24, y: 0.18 }, { drift: { kind: "orbit", period: 18, amount: 0.6 } }),
      P("radial", [["#ffd9c2", 1, 0], ["#ffd9c2", 0, 1]], { x: 0.62, y: 0.95 }, { x: 1.1, y: 0.95 }, { drift: { kind: "breathe", period: 14, amount: 0.8 } }),
    ],
  },
  {
    id: "spotlight",
    name: "Spotlight",
    dark: true,
    make: () => [
      P("solid", [["#09090b", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("radial", [["#ffffff", 0.16, 0], ["#ffffff", 0.05, 0.45], ["#ffffff", 0, 1]], { x: 0.5, y: 0.25 }, { x: 0.85, y: 0.25 }, { ratio: 0.75, follow: { amount: 0.75, how: "move" } }),
    ],
  },
  {
    id: "sunrise",
    name: "Sunrise",
    dark: false,
    make: () => [
      P("angular", [["#ff9a62", 1, 0], ["#ffd36e", 1, 0.25], ["#ff7aa8", 1, 0.55], ["#8f7bff", 1, 0.8], ["#ff9a62", 1, 1]], { x: 0.5, y: 0.62 }, { x: 0.9, y: 0.62 }, { drift: { kind: "spin", period: 24, amount: 1 } }),
      P("radial", [["#ffffff", 0.85, 0], ["#ffffff", 0, 1]], { x: 0.5, y: 0.62 }, { x: 0.82, y: 0.62 }),
    ],
  },
  {
    id: "diamond",
    name: "Diamond",
    dark: true,
    make: () => [
      P("solid", [["#07060d", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("diamond", [["#a78bfa", 0.9, 0], ["#6d28d9", 0.45, 0.4], ["#07060d", 0, 1]], { x: 0.5, y: 0.5 }, { x: 0.86, y: 0.5 }, { ratio: 0.6, follow: { amount: 0.35, how: "move" } }),
    ],
  },
  {
    // Raylight's end card: a ring of blue light turning round a dark core
    id: "swirl",
    name: "Swirl",
    dark: true,
    make: () => [
      P("solid", [["#03051a", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("angular", [["#1d4ed8", 1, 0], ["#0a1036", 1, 0.24], ["#2f4bff", 1, 0.46], ["#6d28d9", 1, 0.72], ["#1d4ed8", 1, 1]], { x: 0.6, y: 0.38 }, { x: 0.95, y: 0.38 }, { opacity: 0.9, drift: { kind: "spin", period: 9, amount: 1 } }),
      P("radial", [["#03051a", 1, 0], ["#03051a", 0.9, 0.42], ["#03051a", 0, 1]], { x: 0.44, y: 0.6 }, { x: 0.84, y: 0.6 }, { ratio: 0.9, drift: { kind: "orbit", period: 9, amount: 0.25 } }),
      P("radial", [["#000000", 0, 0.5], ["#000000", 0.75, 1]], { x: 0.5, y: 0.5 }, { x: 1.06, y: 0.5 }, { ratio: 1.1 }),
    ],
  },
  {
    id: "glass",
    name: "Glass",
    dark: false,
    make: () => [
      P("solid", [["#eef2fb", 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }),
      P("radial", [["#7cc4ff", 0.9, 0], ["#7cc4ff", 0, 1]], { x: 0.3, y: 0.35 }, { x: 0.62, y: 0.35 }, { ratio: 0.8, blend: "multiply", drift: { kind: "orbit", period: 20, amount: 0.7 } }),
      P("radial", [["#ff9ecb", 0.85, 0], ["#ff9ecb", 0, 1]], { x: 0.72, y: 0.62 }, { x: 1.02, y: 0.62 }, { ratio: 0.8, blend: "multiply", drift: { kind: "wave", period: 20, amount: 0.7 } }),
    ],
  },
]
