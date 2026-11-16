// Canvas — the creative engine. Graphics made to order (a soft light, an organic blob, a ring, a frosted glass card,
// a moving gradient) and whole compositions (spotlight, split, cascade, bento, poster, orbit, aurora): the product's
// own screens and components laid out by an art direction, on a look matched to the product's colour (theme.ts), each
// with its entrances. Everything it makes is ordinary layers, so all of it stays editable. Seeded, so "another" is
// a variation, not a reshuffle of the same thing.
import type { Look } from "../theme"
import { readable } from "../theme"
import type { Paint } from "../studio/paint"
import { EFFECT_SEEDS, type Effect } from "./effects"
import { applyLook, effectColours } from "./looks"
import { TEXT_ANIMS } from "../studio/textanim"
import { componentNode, deviceNode, effectNode, pathNode, shapeNode, textNode, uid, type CanvasDoc, type CNode, type ComponentNode, type DeviceKind, type DeviceNode, type Live, type TextNode } from "./doc"

/* ---------------- graphics ---------------- */

export type Rng = () => number
export function rng(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0 || 7
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n2 = (v: number) => Math.round(v * 10) / 10
const radial = (color: string, alpha: number, edge = 1): Paint => ({ id: uid(), kind: "radial", stops: [{ at: 0, color, alpha }, { at: edge, color, alpha: 0 }], from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 }, ratio: 1, opacity: 1, blend: "normal" })

/** A soft light: a round glow, blurred, `r` px across its radius. */
export function glow(cx: number, cy: number, r: number, color: string, alpha = 0.85): CNode {
  const n = shapeNode("ellipse", { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, color)
  return { ...n, name: "Light", paint: [radial(color, alpha)], blur: Math.round(r * 0.18) }
}

/** An organic blob: a closed curve through points round a circle, each pushed in or out a little (smooth: each
    stretch a cubic through its neighbours). */
export function blob(cx: number, cy: number, r: number, color: string, seed: number): CNode {
  const R = rng(seed)
  const k = 8
  const pts = Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2
    const rr = r * (0.78 + R() * 0.36)
    return [r + Math.cos(a) * rr, r + Math.sin(a) * rr]
  })
  const at = (i: number) => pts[(i + k) % k]
  let d = `M${n2(at(0)[0])} ${n2(at(0)[1])}`
  for (let i = 0; i < k; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${n2(c1[0])} ${n2(c1[1])} ${n2(c2[0])} ${n2(c2[1])} ${n2(p2[0])} ${n2(p2[1])}`
  }
  const n = pathNode(`${d} Z`, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, "transparent", 0)
  return { ...n, name: "Blob", fill: color }
}

/** A ring: a circle drawn as four cubics (no arcs: a site's path check allows lines and curves only). */
export function ring(cx: number, cy: number, r: number, color: string, width = 2): CNode {
  const c = r * 0.5523
  const o = r + width
  const d = `M${n2(o + r)} ${n2(o)} C${n2(o + r)} ${n2(o + c)} ${n2(o + c)} ${n2(o + r)} ${n2(o)} ${n2(o + r)} C${n2(o - c)} ${n2(o + r)} ${n2(o - r)} ${n2(o + c)} ${n2(o - r)} ${n2(o)} C${n2(o - r)} ${n2(o - c)} ${n2(o - c)} ${n2(o - r)} ${n2(o)} ${n2(o - r)} C${n2(o + c)} ${n2(o - r)} ${n2(o + r)} ${n2(o - c)} ${n2(o + r)} ${n2(o)} Z`
  return { ...pathNode(d, { x: cx - o, y: cy - o, w: 2 * o, h: 2 * o }, color, width), name: "Ring" }
}

/** A frosted glass card: it blurs whatever is behind it, a hairline at its edge. */
export function glass(x: number, y: number, w: number, h: number, tint = "#ffffff", radius = 28): CNode {
  const n = shapeNode("rect", { x, y, w, h }, tint)
  const veil: Paint = { id: uid(), kind: "solid", stops: [{ at: 0, color: tint, alpha: 0.06 }], from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 }, ratio: 1, opacity: 1, blend: "normal" }
  return { ...n, name: "Glass card", radius, paint: [veil], stroke: { color: "rgba(255,255,255,0.18)", width: 1 }, backdrop: { blur: 28, tint, opacity: 0.08, radius, pad: 0 } }
}

/** A moving gradient (an effect with no cells), in a look's colours when there's one. */
export function gradient(id: "aurora" | "mesh" | "silk" | "lava", b: { x: number; y: number; w: number; h: number }, look?: Look): CNode {
  const p = EFFECT_SEEDS.find((x) => x.id === id) ?? EFFECT_SEEDS[0]
  const effect: Effect = look ? { ...p.effect, colors: effectColours(4, look) } : p.effect
  return effectNode(effect, b, p.name)
}

/* ---------------- compositions ---------------- */

export type CreateCtx = {
  frame: { w: number; h: number }
  look: Look
  inCase: boolean
  name: string
  kicker: string
  tagline: string
  cta: string
  /** the product's screen: live, or a picture of it */
  screen: { live: Live; picture?: string; device: DeviceKind; scheme: "light" | "dark" }
  /** more of the product: its other screens and its components, live (`fill`: a page-filling one) */
  more: { live: Live; fill: boolean; device?: Live }[]
  seed: number
  /** what the content reader works from (studio/content.ts): its features, a proof line, the names of its parts */
  features?: string[]
  proof?: string
  names?: string[]
}
/** `needs`: how many of the product's components it takes (fewer, and it's shown but can't be picked); `category`:
    a canvas's or a creative's kind (refs.ts CATEGORIES) */
export type Composition = { id: string; name: string; hint: string; category: string; needs?: number; make: (c: CreateCtx) => CanvasDoc }
/** a frame taller than it's wide: words go over the device, not beside it */
export const tall = (c: CreateCtx) => c.frame.h > c.frame.w * 1.1
/** type set for a 1440-wide frame, scaled down on a narrower one (a square, a portrait) */
export const scaleOf = (c: CreateCtx) => Math.min(1, Math.max(0.55, c.frame.w / 1440))

export type TextOpts = { font?: TextNode["font"]; weight?: number; align?: TextNode["align"]; w?: number; color?: string; enter?: TextNode["enter"]; name?: string }
/** How many lines a block of type wraps to in `w` px: a line takes whole words (an estimate of the face's widths). */
function linesOf(text: string, size: number, w: number, font: TextNode["font"]) {
  const em = font === "mono" ? 0.62 : font === "display" ? 0.56 : 0.52
  let lines = 1
  let at = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ww = word.length * size * em
    const space = at ? size * em * 0.5 : 0
    if (at && at + space + ww > w) {
      lines++
      at = ww
    } else at += space + ww
  }
  return lines
}
/** Blocks of type one under another from `y`, each under the last by its own height and a gap: a name that wraps to
    two lines pushes the line under it down instead of running into it. */
export function stack(y: number, blocks: TextNode[]): TextNode[] {
  let at = y
  return blocks.map((b) => {
    const t = { ...b, y: Math.round(at) }
    at += b.h + Math.max(10, b.size * 0.42)
    return t
  })
}
/** The same, centred on `cy`. */
export const stackOn = (cy: number, blocks: TextNode[]) => stack(cy - (blocks.reduce((a, b) => a + b.h + Math.max(10, b.size * 0.42), 0) - Math.max(10, (blocks.at(-1)?.size ?? 0) * 0.42)) / 2, blocks)
export const below = (ts: TextNode[], gap = 24) => Math.max(...ts.map((t) => t.y + t.h)) + gap

export function words(x: number, y: number, text: string, size: number, o: TextOpts = {}): TextNode {
  const t = textNode(x, y, text, size)
  const w = o.w ?? Math.max(t.w, Math.min(1400, text.length * size * 0.56))
  const lines = linesOf(text, size, w, o.font === "serif" ? "display" : (o.font ?? "display"))
  return { ...t, w: Math.round(w), h: Math.round(size * 1.18 * lines), x: Math.round(o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x), font: o.font ?? "display", weight: o.weight ?? 600, align: o.align ?? "left", color: o.color ?? "", ...(o.enter ? { enter: o.enter } : {}), ...(o.name ? { name: o.name } : {}) }
}
export const fade = (delay: number, dur = 0.6) => ({ kind: "fade" as const, delay, dur })
export const rise = (delay: number, dur = 0.8) => ({ kind: "rise" as const, delay, dur })
export function phone(c: CreateCtx, live: Live, cx: number, cy: number, h: number, picture?: string): DeviceNode {
  const d = deviceNode(c.screen.device, live, cx, cy, h, c.screen.scheme)
  return { ...d, ...(picture ? { picture } : {}), enter: rise(0.25, 0.9) }
}
/** a button: an ink pill with the ground's colour for its label (both kept when the look recolours the type) */
export function button(c: CreateCtx, x: number, y: number, label: string): CNode[] {
  const w = Math.max(150, label.length * 11 + 56)
  const pill = { ...shapeNode("rect", { x, y, w, h: 52 }, c.look.ink), name: "Button", radius: 26, enter: fade(0.5) }
  const t = words(x + w / 2, y + 14, label, 18, { font: "text", weight: 600, align: "center", w: w - 24, color: readable(c.look.ground, c.look.ink, 4.5), name: "Button label", enter: fade(0.55) })
  return [pill, t]
}
/** what fills a card (a component of the product, cut to what it paints once it's measured) */
export const part = (live: Live, cx: number, cy: number, w: number, h: number, scheme: "light" | "dark", fill: boolean): ComponentNode => ({ ...componentNode(live, { x: cx - w / 2, y: cy - h / 2, w, h }, scheme), ...(fill ? { view: { w: 402, h: 874, x: 0, y: 0 } } : {}), enter: rise(0.45, 0.8) })

/** The look on a made composition, keeping the type a composition coloured on purpose (a button's label, words on a
    dark notice). */
export function dress(c: CreateCtx, doc: CanvasDoc): CanvasDoc {
  const keep = new Map(doc.layers.filter((n) => n.kind === "text" && n.color).map((n) => [n.id, n]))
  const d = applyLook(doc, c.look, { inCase: c.inCase })
  return { ...d, layers: d.layers.map((n) => keep.get(n.id) ?? n) }
}
export const frameDoc = (c: CreateCtx, name: string, layers: CNode[]): CanvasDoc => ({ v: 1, name: c.name ? `${c.name} · ${name}` : name, frame: { w: c.frame.w, h: c.frame.h, paint: [], radius: 0, phone: { w: 402, h: 874 } }, layers })

export const COMPOSITIONS: Composition[] = [
  {
    id: "spotlight",
    category: "hero",
    name: "Spotlight",
    hint: "The phone centre stage in a pool of its own light, tilted back; the name above it.",
    make: (c) => {
      const { w, h } = c.frame
      const r = rng(c.seed)
      const k = scaleOf(c)
      const tilt = Math.round(8 + r() * 8)
      const turn = Math.round((r() - 0.5) * 24)
      return dress(
        c,
        frameDoc(c, "Spotlight", [
          glow(w / 2, h * 0.66, Math.min(w, h) * 0.46, c.look.glow),
          { ...phone(c, c.screen.live, w / 2, h * 0.67, h * 0.64, c.screen.picture), rot3d: { x: tilt, y: turn } },
          ...stack(h * 0.06, [
            words(w / 2, 0, c.kicker, 16 * k, { font: "mono", weight: 500, align: "center", w: w * 0.8, enter: fade(0) }),
            words(w / 2, 0, c.name, 84 * k, { align: "center", w: w * 0.86, enter: rise(0.06) }),
            words(w / 2, 0, c.tagline, 22 * k, { font: "text", weight: 400, align: "center", w: Math.min(640, w * 0.8), enter: fade(0.2) }),
          ]),
        ]),
      )
    },
  },
  {
    id: "split",
    category: "hero",
    name: "Split",
    hint: "Words on one side (a kicker, the name, a line, a button), the phone turned towards them on the other; stacked on a tall frame.",
    make: (c) => {
      const { w, h } = c.frame
      const r = rng(c.seed)
      const k = scaleOf(c)
      if (tall(c)) {
        // words on top, centred; the phone under them, turned a little
        return dress(
          c,
          frameDoc(c, "Split", [
            glow(w / 2, h * 0.7, w * 0.5, c.look.glow),
            { ...phone(c, c.screen.live, w / 2, h * 0.7, h * 0.52, c.screen.picture), rot3d: { x: 6, y: -Math.round(14 + r() * 10) } },
            ...stack(h * 0.06, [
              words(w / 2, 0, c.kicker, 16 * k, { font: "mono", weight: 500, align: "center", w: w * 0.8, enter: fade(0) }),
              words(w / 2, 0, c.name, 92 * k, { align: "center", w: w * 0.86, enter: rise(0.06) }),
              words(w / 2, 0, c.tagline, 22 * k, { font: "text", weight: 400, align: "center", w: w * 0.72, enter: fade(0.2) }),
            ]),
          ]),
        )
      }
      const x = w * 0.085
      const block = stackOn(h * 0.44, [
        words(x, 0, c.kicker, 16 * k, { font: "mono", weight: 500, w: w * 0.36, enter: fade(0) }),
        words(x, 0, c.name, 92 * k, { w: w * 0.44, enter: rise(0.06) }),
        words(x, 0, c.tagline, 22 * k, { font: "text", weight: 400, w: w * 0.34, enter: fade(0.2) }),
      ])
      return dress(
        c,
        frameDoc(c, "Split", [
          glow(w * 0.7, h * 0.46, h * 0.5, c.look.glow),
          { ...phone(c, c.screen.live, w * 0.7, h * 0.53, h * 0.82, c.screen.picture), rot3d: { x: 4, y: -Math.round(20 + r() * 12) } },
          ...block,
          ...button(c, x, below(block, 28), c.cta),
        ]),
      )
    },
  },
  {
    id: "cascade",
    category: "showcase",
    name: "Cascade",
    hint: "Three of its screens stepping back into the frame, all turned the same way; the name over them.",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const screens = [c.screen.live, ...c.more.filter((m) => m.device).map((m) => m.device!)].slice(0, 3)
      while (screens.length < 3) screens.push(c.screen.live)
      const turn = -18
      // a tall frame steps them across the lower part, smaller; a wide one along the right
      const at = tall(c)
        ? [
            [0.68, 0.66, 0.42],
            [0.5, 0.68, 0.48],
            [0.32, 0.7, 0.54],
          ]
        : [
            [0.84, 0.5, 0.6],
            [0.66, 0.54, 0.7],
            [0.45, 0.58, 0.8],
          ]
      return dress(
        c,
        frameDoc(c, "Cascade", [
          glow(w * (tall(c) ? 0.5 : 0.62), h * 0.58, Math.min(w, h) * 0.55, c.look.glow),
          ...at.map(([fx, fy, fh], i) => ({ ...phone(c, screens[2 - i], w * fx, h * fy, h * fh, i === 2 ? c.screen.picture : undefined), rot3d: { x: 6, y: turn }, enter: rise(0.45 - i * 0.1, 0.9) })),
          ...stack(h * 0.07, [
            words(w * 0.07, 0, c.kicker, 16 * k, { font: "mono", weight: 500, w: w * 0.5, enter: fade(0) }),
            words(w * 0.07, 0, c.name, 72 * k, { w: w * (tall(c) ? 0.86 : 0.4), enter: rise(0.06) }),
            words(w * 0.07, 0, c.tagline, 20 * k, { font: "text", weight: 400, w: w * (tall(c) ? 0.7 : 0.26), enter: fade(0.2) }),
          ]),
        ]),
      )
    },
  },
  {
    id: "bento",
    category: "bento",
    name: "Bento",
    hint: "Frosted cards on a moving gradient: the words in one, the phone in another, its components in the rest (fewer cards when it has fewer).",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const parts = c.more.slice(0, 2)
      const m = 0.045 * Math.min(w, h)
      const g = 0.02 * Math.min(w, h)
      const tint = "#ffffff"
      const ids = c.seed % 2 ? ["aurora", "mesh"] : ["mesh", "silk"]
      const ground = gradient((c.look.dark ? ids[0] : "silk") as "aurora" | "mesh" | "silk", { x: 0, y: 0, w, h }, c.look)
      // the cards: words, phone, and one per component; laid in three columns, or (tall) a row of words over two columns
      type Card = { x: number; y: number; w: number; h: number }
      let words_: Card, device: Card
      const slots: Card[] = []
      if (tall(c)) {
        const colW = (w - 2 * m - g) / 2
        const top = m
        const wordsH = (h - 2 * m) * 0.3
        const restH = h - 2 * m - wordsH - g
        words_ = { x: m, y: top, w: w - 2 * m, h: wordsH }
        device = parts.length ? { x: m, y: top + wordsH + g, w: colW, h: restH } : { x: m, y: top + wordsH + g, w: w - 2 * m, h: restH }
        parts.forEach((_, i) => slots.push({ x: m + colW + g, y: top + wordsH + g + (i * (restH + g)) / parts.length, w: colW, h: (restH - (parts.length - 1) * g) / parts.length }))
      } else {
        const cols = parts.length ? 3 : 2
        const colW = (w - 2 * m - (cols - 1) * g) / cols
        const top = 0.08 * h
        const H = h - 2 * top
        words_ = { x: m, y: top, w: colW, h: H }
        device = { x: m + colW + g, y: top, w: colW, h: H }
        parts.forEach((_, i) => slots.push({ x: m + 2 * (colW + g), y: top + (i * (H + g)) / parts.length, w: colW, h: (H - (parts.length - 1) * g) / parts.length }))
      }
      const pad = 40 * k
      return dress(
        c,
        frameDoc(c, "Bento", [
          ground,
          glass(words_.x, words_.y, words_.w, words_.h, tint),
          glass(device.x, device.y, device.w, device.h, tint),
          ...slots.map((s) => glass(s.x, s.y, s.w, s.h, tint)),
          ...stack(words_.y + pad, [
            words(words_.x + pad, 0, c.kicker, 15 * k, { font: "mono", weight: 500, w: words_.w - 2 * pad, enter: fade(0) }),
            words(words_.x + pad, 0, c.name, 64 * k, { w: words_.w - 2 * pad, enter: rise(0.06) }),
            words(words_.x + pad, 0, c.tagline, 20 * k, { font: "text", weight: 400, w: words_.w - 2 * pad, enter: fade(0.2) }),
          ]),
          ...(tall(c) ? [] : button(c, words_.x + pad, words_.y + words_.h - pad - 52, c.cta)),
          { ...phone(c, c.screen.live, device.x + device.w / 2, device.y + device.h / 2 + 10, Math.min(device.h * 0.86, ((device.w * 0.9) / 440) * 912), c.screen.picture), rot3d: { x: 0, y: 0 } },
          ...parts.map((p, i) => part(p.live, slots[i].x + slots[i].w / 2, slots[i].y + slots[i].h / 2, slots[i].w - 48, slots[i].h - 48, c.screen.scheme, p.fill)),
        ]),
      )
    },
  },
  {
    id: "poster",
    category: "poster",
    name: "Poster",
    hint: "The name huge, edge to edge, and the phone standing in front of it, cutting through the letters.",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const size = Math.round(Math.min(380 * Math.max(0.6, k), (w * 0.92) / Math.max(3, c.name.length * 0.56)))
      return dress(
        c,
        frameDoc(c, "Poster", [
          words(w / 2, h * 0.5 - size * 0.62, c.name, size, { align: "center", w: w * 0.96, weight: 700, enter: rise(0, 1) }),
          glow(w / 2, h * 0.6, Math.min(w, h) * 0.42, c.look.glow, 0.7),
          { ...phone(c, c.screen.live, w / 2, h * 0.58, h * (tall(c) ? 0.66 : 0.86), c.screen.picture), rot3d: { x: 6, y: 16 } },
          words(w * 0.05, h * 0.06, c.kicker, 16 * k, { font: "mono", weight: 500, w: w * 0.5, enter: fade(0.1) }),
          words(w * 0.95, h * 0.9, c.tagline, 20 * k, { font: "text", weight: 400, align: "right", w: w * 0.5, enter: fade(0.3) }),
        ]),
      )
    },
  },
  {
    id: "orbit",
    category: "showcase",
    name: "Orbit",
    hint: "The phone in the middle and its components floating round it, each coming in along a curve on a spring.",
    needs: 2,
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const spots = tall(c)
        ? [
            [0.27, 0.22],
            [0.73, 0.22],
            [0.27, 0.86],
            [0.73, 0.86],
          ]
        : [
            [0.2, 0.3],
            [0.8, 0.3],
            [0.21, 0.74],
            [0.79, 0.74],
          ]
      const cw = Math.min(330, w * 0.36)
      const parts = c.more.slice(0, 4).map((p, i) => {
        const [fx, fy] = spots[i]
        const n = part(p.live, w * fx, h * fy, cw, cw * 0.6, c.screen.scheme, p.fill)
        // it comes in from further out, along a curve, to where it floats
        const dx = (fx - 0.5) * w * 0.7
        const dy = (fy - 0.5) * h * 0.7
        return { ...n, enter: undefined, motion: { d: `M0 0 Q${Math.round(dx * 0.5)} ${Math.round(dy * 0.1)} ${Math.round(dx)} ${Math.round(dy)}`, preset: "spring" as const, trigger: "enter" as const, strength: 0.55, speed: 0.9, delay: 0.2 + i * 0.12, fade: true, reverse: true } }
      })
      return dress(
        c,
        frameDoc(c, "Orbit", [
          glow(w / 2, h * 0.55, Math.min(w, h) * 0.5, c.look.glow),
          ring(w / 2, h * 0.55, Math.min(w, h) * 0.4, c.look.muted, 1.5),
          { ...phone(c, c.screen.live, w / 2, h * 0.56, Math.min(h * 0.7, w * 0.9 * (912 / 440)), c.screen.picture), rot3d: { x: 6, y: -10 } },
          ...parts,
          words(w / 2, h * 0.05, c.name, 44 * k, { align: "center", w: w * 0.7, enter: fade(0) }),
        ]),
      )
    },
  },
  {
    id: "aurora",
    category: "hero",
    name: "Aurora",
    hint: "A gradient that moves behind the phone lying back in its light; the words beside it (above it on a tall frame).",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const ground = gradient(c.look.dark ? "aurora" : "silk", { x: 0, y: 0, w, h }, c.look)
      if (tall(c))
        return dress(
          c,
          frameDoc(c, "Aurora", [
            ground,
            { ...phone(c, c.screen.live, w / 2, h * 0.68, h * 0.6, c.screen.picture), rot3d: { x: 40, y: -20 } },
            ...stack(h * 0.07, [
              words(w / 2, 0, c.kicker, 16 * k, { font: "mono", weight: 500, align: "center", w: w * 0.8, enter: fade(0) }),
              words(w / 2, 0, c.name, 88 * k, { align: "center", w: w * 0.86, enter: rise(0.06) }),
              words(w / 2, 0, c.tagline, 22 * k, { font: "text", weight: 400, align: "center", w: w * 0.72, enter: fade(0.2) }),
            ]),
          ]),
        )
      const x = w * 0.085
      return dress(
        c,
        frameDoc(c, "Aurora", [
          ground,
          { ...phone(c, c.screen.live, w * 0.66, h * 0.55, h * 0.92, c.screen.picture), rot3d: { x: 40, y: -20 } },
          ...stackOn(h * 0.44, [
            words(x, 0, c.kicker, 16 * k, { font: "mono", weight: 500, w: w * 0.36, enter: fade(0) }),
            words(x, 0, c.name, 88 * k, { w: w * 0.4, enter: rise(0.06) }),
            words(x, 0, c.tagline, 22 * k, { font: "text", weight: 400, w: w * 0.32, enter: fade(0.2) }),
          ]),
        ]),
      )
    },
  },
]

/* ---------------- after the reference films and pages the lab studied ---------------- */

/** A folder, the desktop kind: its back with the tab, a darker front tipped forward, a label on it, a soft shadow. */
export function folder(x: number, y: number, w: number, accent: string): CNode[] {
  const h = w * 0.8
  const back = "M6 16 C6 10 9 7 15 7 L38 7 C41 7 43 8 45 10 L50 16 L85 16 C91 16 94 19 94 25 L94 72 C94 78 91 81 85 81 L15 81 C9 81 6 78 6 72 Z"
  const front = "M4 32 C4 27 7 25 12 25 L88 25 C93 25 96 27 96 32 L93 76 C92 81 89 83 84 83 L16 83 C11 83 8 81 7 76 Z"
  const box = { x, y, w, h }
  return [
    { ...glow(x + w / 2, y + h * 0.95, w * 0.42, "#000000", 0.22), name: "Folder shadow" },
    { ...pathNode(back, box, "transparent", 0), vw: 100, vh: 88, fill: "#2c2c31", name: "Folder back", rot: -5, enter: rise(0.45, 0.9) },
    { ...pathNode(front, box, "transparent", 0), vw: 100, vh: 88, fill: "#111113", name: "Folder", rot: -5, enter: rise(0.5, 0.9) },
    { ...shapeNode("rect", { x: x + w * 0.62, y: y + h * 0.36, w: w * 0.22, h: h * 0.14 }, accent), name: "Folder label", radius: Math.round(w * 0.025), rot: -5, enter: fade(0.8) },
  ]
}

const anim = (id: string) => TEXT_ANIMS.find((a) => a.id === id)!.anim
const seedFx = (id: string) => EFFECT_SEEDS.find((p) => p.id === id)!.effect

COMPOSITIONS.push(
  {
    id: "mission",
    category: "story",
    name: "Mission",
    hint: "A huge serif word behind a card of drifting clouds, a bank of clouds along the foot, and your line lighting up word by word as the page scrolls.",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const t = tall(c)
      const card = t ? { w: w * 0.84, h: h * 0.34 } : { w: w * 0.4, h: h * 0.44 }
      const cx = (w - card.w) / 2
      const size = Math.round(Math.min(220 * Math.max(0.62, k), (w * 0.9) / Math.max(4, c.name.length * 0.5)))
      const top = h * 0.05
      const cardY = top + size * 0.78
      const head = { ...words(w / 2, top, c.name, size, { font: "serif", weight: 400, align: "center", w: w * 0.94, name: "Heading" }), animation: { ...anim("tracking"), dur: 1.8 } }
      const body = { ...words(cx, cardY + card.h + 36 * k, c.tagline, Math.round(26 * Math.max(0.7, k)), { font: "text", weight: 400, w: card.w, name: "Line" }), animation: { ...anim("spotlight"), stagger: 0.05, on: "scroll" as const } }
      const doc = frameDoc(c, "Mission", [
        { ...effectNode(seedFx("night-clouds"), { x: 0, y: h * 0.56, w, h: h * 0.44 }, "Cloud bank"), opacity: 0.85 },
        head,
        { ...effectNode(seedFx("dusk-clouds"), { x: cx, y: cardY, w: card.w, h: card.h }, "Clouds"), radius: Math.round(28 * k), enter: rise(0.35, 1) },
        body,
      ])
      // its own night, on the look's ground: the type takes the look's ink, the skies keep their colours
      return dress(c, doc)
    },
  },
  {
    id: "paper-bento",
    category: "bento",
    name: "Paper bento",
    hint: "White cards on pale grey: a mood picture with a notice on it, your screen, the phone's corner up close, a number, and your line.",
    make: (c) => {
      const { w, h } = c.frame
      const k = scaleOf(c)
      const m = 0.03 * Math.min(w, h)
      const g = 0.016 * Math.min(w, h)
      const r = Math.round(22 * Math.max(0.7, k))
      const cols = tall(c) ? 2 : 3
      const colW = (w - 2 * m - (cols - 1) * g) / cols
      const H = h - 2 * m
      type Card = { x: number; y: number; w: number; h: number }
      const at = (col: number, y0: number, hh: number): Card => ({ x: m + col * (colW + g), y: m + y0, w: colW, h: hh })
      const top = H * 0.62
      const cards = tall(c)
        ? { mood: at(0, 0, top * 0.62), words: at(0, top * 0.62 + g, H - top * 0.62 - g), screen: at(1, 0, top), corner: at(1, top + g, (H - top - g) * 0.5 - g / 2), count: at(1, top + g + (H - top - g) * 0.5 + g / 2, (H - top - g) * 0.5 - g / 2) }
        : { mood: at(0, 0, top), words: at(0, top + g, H - top - g), screen: at(1, 0, H), corner: at(2, 0, H * 0.46), count: at(2, H * 0.46 + g, H * 0.54 - g) }
      const white = (b: Card, name: string): CNode => ({ ...shapeNode("rect", b, "#ffffff"), name, radius: r, enter: rise(0.05, 0.8) })
      const pad = 26 * k
      // the phone, big and turned, so only its top corner shows in its card
      const ph = Math.max(cards.corner.h * 2.4, cards.corner.w * 2.6)
      const corner = { ...phone(c, c.screen.live, cards.corner.x + cards.corner.w * 0.42 + ph * 0.24, cards.corner.y + cards.corner.h * 0.18 + ph * 0.5, ph, c.screen.picture), rot3d: { x: 0, y: -8 }, follow: undefined, name: "Phone, close", clip: "card-corner" }
      const moodFx = seedFx(c.look.dark ? "mesh" : "silk")
      const noticeW = Math.min(cards.mood.w - 2 * pad, 320 * k)
      const noticeY = cards.mood.y + cards.mood.h - pad - 64 * k
      const doc: CanvasDoc = frameDoc(c, "Paper bento", [
        white(cards.mood, "Mood card"),
        { ...effectNode(moodFx, cards.mood, "Mood"), radius: r, enter: rise(0.05, 0.8) },
        { ...shapeNode("rect", { x: cards.mood.x + pad, y: noticeY, w: noticeW, h: 64 * k }, "#141416"), name: "Notice", radius: Math.round(14 * k), shadow: true, enter: rise(0.6, 0.7) },
        { ...shapeNode("rect", { x: cards.mood.x + pad + 12 * k, y: noticeY + 14 * k, w: 36 * k, h: 36 * k }, c.look.accent), name: "Notice icon", radius: Math.round(9 * k), enter: fade(0.7) },
        words(cards.mood.x + pad + 60 * k, noticeY + 12 * k, c.name, 15 * k, { font: "text", weight: 600, w: noticeW - 72 * k, color: "#ffffff", name: "Notice title", enter: fade(0.7) }),
        words(cards.mood.x + pad + 60 * k, noticeY + 34 * k, c.tagline, 13 * k, { font: "text", weight: 400, w: noticeW - 72 * k, color: "#a1a1aa", name: "Notice line", enter: fade(0.75) }),
        white(cards.screen, "Screen card"),
        { ...shapeNode("rect", { x: cards.screen.x + pad * 0.6, y: cards.screen.y + pad * 0.6, w: cards.screen.w - pad * 1.2, h: cards.screen.h - pad * 1.2 }, c.look.haze), name: "Screen tint", radius: Math.round(r * 0.7) },
        { ...phone(c, c.screen.live, cards.screen.x + cards.screen.w / 2, cards.screen.y + cards.screen.h / 2, Math.min(cards.screen.h * 0.86, ((cards.screen.w * 0.78) / 440) * 912), c.screen.picture), rot3d: { x: 0, y: 0 }, name: "Phone" },
        { ...white(cards.corner, "Corner card"), id: "card-corner" },
        corner,
        white(cards.count, "Count card"),
        words(cards.count.x + pad, cards.count.y + pad, `[${c.kicker}]`, 18 * k, { font: "mono", weight: 500, w: cards.count.w - 2 * pad, name: "Count", enter: fade(0.3) }),
        ...folder(cards.count.x + cards.count.w * 0.36, cards.count.y + cards.count.h * 0.38, Math.min(cards.count.w * 0.56, cards.count.h * 0.62 * 1.25), c.look.accent),
        white(cards.words, "Words card"),
        { ...shapeNode("rect", { x: cards.words.x + pad, y: cards.words.y + pad, w: Math.max(84, c.kicker.length * 9 + 36) * k, h: 32 * k }, c.look.haze), name: "Chip", radius: Math.round(16 * k), enter: fade(0.2) },
        words(cards.words.x + pad + 16 * k, cards.words.y + pad + 8 * k, c.kicker, 13 * k, { font: "text", weight: 500, w: 200 * k, name: "Chip label", enter: fade(0.25) }),
        words(cards.words.x + cards.words.w - pad, cards.words.y + pad + 8 * k, c.cta, 13 * k, { font: "text", weight: 500, align: "right", w: cards.words.w * 0.45, name: "Link", enter: fade(0.25) }),
        { ...words(cards.words.x + pad, cards.words.y + cards.words.h - pad - Math.min(cards.words.h * 0.6, 40 * k * 2.4), c.tagline, Math.round(34 * k), { font: "display", weight: 600, w: cards.words.w - 2 * pad, name: "Line" }), animation: anim("blur-up") },
      ])
      const d = dress(c, { ...doc, frame: { ...doc.frame } })
      // paper: a pale ground under white cards, whatever the look's own ground (its colour lives in the cards' tints)
      return { ...d, frame: { ...d.frame, paint: [], fill: c.look.dark ? "#1b1b1f" : "#ebebee", ink: c.look.dark ? "#f4f4f5" : "#18181b" }, layers: d.layers.map((n) => (n.kind === "rect" && n.name?.endsWith("card") && c.look.dark ? { ...n, paint: [{ ...n.paint[0], stops: n.paint[0].stops.map((s) => ({ ...s, color: "#26262b" })) }] } : n)) }
    },
  },
)
