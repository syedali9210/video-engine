// Canvas — the arrangement inventor: new ways to set a product's devices and components on a frame, presented the way
// a design studio presents its work. Ten systems, each a principle of composition, not a fixed picture:
//   - a plate (one device on a seamless, captioned like a portfolio plate);
//   - a triptych (three screens on one baseline, numbered);
//   - an anatomy (the components lifted off the phone, each on a leader line);
//   - an isometric field (screens lying in a rotated grid that runs off the frame);
//   - a line-up (receding into depth, out of focus as they go);
//   - a pair (two overlapping, turned against each other);
//   - a specimen (the components in a strict grid, indexed like a type specimen);
//   - an editorial spread (a serif headline the phone breaks through);
//   - a fan (screens pivoting from one point);
//   - satellites (components on a golden spiral round the phone).
// The seed picks each one's variables (side, turn, count, depth, corners, the caption's corner), so every round is a new
// arrangement on the same principle. Each lays out for a tall frame too. Everything it makes is ordinary layers,
// matched to the look like the rest of Create.
import { MOCKUP, pathNode, shapeNode, type CNode, type TextNode } from "./doc"
import { below, dress, frameDoc, glow, phone, part, rise, fade, rng, scaleOf, stack, stackOn, tall, words, type Composition, type CreateCtx, type Rng } from "./create"

const pick = <T,>(r: Rng, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
/** a device's width for a height, by its mockup's shape */
const widthOf = (c: CreateCtx, h: number) => (h * MOCKUP[c.screen.device].w) / MOCKUP[c.screen.device].h
/** a margin: 6% of the frame's short side */
const marginOf = (c: CreateCtx) => Math.round(Math.min(c.frame.w, c.frame.h) * 0.06)
/** the product's screens for `n` devices: the one open, then its other screens, repeated if it has fewer */
function screens(c: CreateCtx, n: number) {
  const list = [c.screen.live, ...c.more.filter((m) => m.device).map((m) => m.device!)]
  while (list.length < n) list.push(...list)
  return list.slice(0, n)
}
/** a component's library name, as a caption: "chat-quiz" is "Chat quiz" */
const nameOf = (anim: string) => {
  const t = anim.replace(/[-_]+/g, " ").trim()
  return t ? t[0].toUpperCase() + t.slice(1) : "Component"
}
const idx = (i: number) => String(i + 1).padStart(2, "0")
/** a hairline rule */
const rule = (c: CreateCtx, x: number, y: number, w: number): CNode => ({ ...shapeNode("rect", { x, y, w, h: 1 }, c.look.muted), name: "Rule", radius: 0, opacity: 0.45, enter: fade(0.3, 0.8) })
/** a leader line from a point on the device to a label, with a dot where it starts */
function leader(c: CreateCtx, x1: number, y1: number, x2: number, y2: number): CNode[] {
  const bx = Math.min(x1, x2)
  const by = Math.min(y1, y2) - 1
  const b = { x: bx, y: by, w: Math.max(2, Math.abs(x2 - x1)), h: Math.max(2, Math.abs(y2 - y1) + 2) }
  return [
    { ...pathNode(`M${Math.round(x1 - bx)} ${Math.round(y1 - by)} L${Math.round(x2 - bx)} ${Math.round(y2 - by)}`, b, c.look.muted, 1.25), name: "Leader line", enter: fade(0.75, 0.5) },
    { ...shapeNode("ellipse", { x: x1 - 4, y: y1 - 4, w: 8, h: 8 }, c.look.ink), name: "Leader dot", enter: fade(0.7, 0.4) },
  ]
}
/** a caption block: an index, a title, a line; `x` is its left edge (its right edge when it's set right) */
function caption(c: CreateCtx, x: number, y: number, w: number, index: string, title: string, line: string, align: "left" | "right" = "left"): TextNode[] {
  const k = scaleOf(c)
  return stack(y, [
    words(x, 0, index, 13 * k, { font: "mono", weight: 500, align, w, enter: fade(0.45), name: "Index" }),
    words(x, 0, title, 32 * k, { weight: 600, align, w, enter: rise(0.5), name: "Title" }),
    words(x, 0, line, 15 * k, { font: "text", weight: 400, align, w, enter: fade(0.6), name: "Line" }),
  ])
}
/** blocks of type moved so their foot sits at `y` */
const footAt = (blocks: TextNode[], y: number) => {
  const dy = y - below(blocks, 0)
  return blocks.map((b) => ({ ...b, y: Math.round(b.y + dy) }))
}
/** the corner marks of a studio plate: what it is, top left; where it sits in the set, top right */
const marks = (c: CreateCtx, m: number, of: string): CNode[] => {
  const k = scaleOf(c)
  return [words(m, m, c.kicker, 12 * k, { font: "mono", weight: 500, w: c.frame.w * 0.4, enter: fade(0.2), name: "Kicker" }), words(c.frame.w - m, m, of, 12 * k, { font: "mono", weight: 500, align: "right", w: c.frame.w * 0.3, enter: fade(0.25), name: "Plate number" })]
}
const shadowUnder = (cx: number, y: number, w: number): CNode => ({ ...glow(cx, y, w * 0.55, "#000000", 0.22), name: "Floor shadow" })

type Variant = { label: string; [k: string]: string | number }
type System = { id: string; name: string; hint: string; needs?: number; vary: (r: Rng) => Variant; layout: (c: CreateCtx, v: Variant) => CNode[] }

const SYSTEMS: System[] = [
  {
    id: "plate",
    name: "Plate",
    hint: "One device on a seamless, as a studio's portfolio plate: a soft light, a floor shadow, a caption in its corner under a hairline.",
    vary: (r) => {
      const side = pick(r, ["centre", "left", "right"])
      const turn = pick(r, [0, -16, 16, -26])
      return { label: `${side === "centre" ? "centred" : `on the ${side} third`}, ${turn ? `turned ${Math.abs(turn)}°` : "square on"}`, side, turn }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const t = tall(c)
      const side = t ? "centre" : String(v.side)
      const dh = t ? h * 0.58 : h * 0.76
      const cx = side === "centre" ? w / 2 : side === "left" ? w * 0.36 : w * 0.64
      const cy = t ? h * 0.42 : h * 0.49
      const cw = Math.min(w * (t ? 0.8 : 0.28), 420)
      const right = !t && side === "left"
      const cap = footAt(caption(c, right ? w - m : m, 0, cw, "01", c.name, c.tagline, right ? "right" : "left"), h - m)
      return [
        glow(cx, cy, dh * 0.62, c.look.glow, 0.75),
        shadowUnder(cx, cy + dh * 0.5, widthOf(c, dh)),
        { ...phone(c, c.screen.live, cx, cy, dh, c.screen.picture), rot3d: { x: 4, y: Number(v.turn) } },
        rule(c, right ? w - m - cw : m, cap[0].y - 16, cw),
        ...cap,
        ...marks(c, m, "01 / 03"),
      ]
    },
  },
  {
    id: "triptych",
    name: "Triptych",
    hint: "Three of its screens on one baseline, evenly spaced on the grid, numbered under each: a case study's spread.",
    vary: (r) => {
      const turn = pick(r, ["flat", "same", "fan"])
      return { label: turn === "flat" ? "square on" : turn === "same" ? "all turned one way" : "fanned out from the middle", turn }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const head = stack(m, [words(m, 0, c.kicker, 12 * k, { font: "mono", weight: 500, w: w * 0.5, enter: fade(0), name: "Kicker" }), words(m, 0, c.name, (t ? 44 : 40) * k, { weight: 600, w: w - 2 * m, enter: rise(0.06), name: "Title" })])
      const top = below(head, 28 * k)
      const gap = (w - 2 * m) * 0.06
      const dh = Math.min(h - top - m - 60 * k, (((w - 2 * m - 2 * gap) / 3) * MOCKUP[c.screen.device].h) / MOCKUP[c.screen.device].w)
      const dw = widthOf(c, dh)
      const span = 3 * dw + 2 * gap
      const cy = top + dh / 2
      const turns = v.turn === "flat" ? [0, 0, 0] : v.turn === "same" ? [-14, -14, -14] : [16, 0, -16]
      return [
        ...head,
        ...screens(c, 3).flatMap((live, i) => {
          const cx = (w - span) / 2 + dw / 2 + i * (dw + gap)
          return [{ ...phone(c, live, cx, cy, dh, i === 0 ? c.screen.picture : undefined), rot3d: { x: 0, y: turns[i] }, enter: rise(0.3 + i * 0.1, 0.9) }, words(cx - dw / 2, cy + dh / 2 + 18 * k, idx(i), 12 * k, { font: "mono", weight: 500, w: dw, enter: fade(0.6 + i * 0.1), name: `Number ${i + 1}` })]
        }),
      ]
    },
  },
  {
    id: "anatomy",
    name: "Anatomy",
    hint: "The phone turned a little, its components lifted off it beside it, each on a leader line from where it sits, numbered.",
    needs: 1,
    vary: (r) => {
      const side = pick(r, ["right", "left"])
      const zig = pick(r, [0, 1])
      return { label: `parts to the ${side}${zig ? ", stepped" : ", in a column"}`, side, zig }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const parts = c.more.slice(0, 3)
      const left = v.side === "left" && !t
      const dh = t ? h * 0.46 : h * 0.8
      const cx = t ? w / 2 : left ? w * 0.68 : w * 0.32
      const cy = t ? m + 90 * k + dh / 2 : h * 0.54
      const dw = widthOf(c, dh)
      const head = stack(m, [words(left ? w - m : m, 0, c.kicker, 12 * k, { font: "mono", weight: 500, align: left ? "right" : "left", w: w * 0.4, enter: fade(0), name: "Kicker" }), words(left ? w - m : m, 0, c.name, 36 * k, { weight: 600, align: left ? "right" : "left", w: w * 0.4, enter: rise(0.06), name: "Title" })])
      const out: CNode[] = [glow(cx, cy, dh * 0.55, c.look.glow, 0.6), { ...phone(c, c.screen.live, cx, cy, dh, c.screen.picture), rot3d: { x: 6, y: left ? 20 : -20 } }, ...(t ? [] : head)]
      parts.forEach((p, i) => {
        if (t) {
          // a row under the phone, the leaders dropping to it
          const cw = (w - 2 * m - (parts.length - 1) * 16) / parts.length
          const ch = Math.min(cw * 0.7, h - (cy + dh / 2) - m - 80 * k)
          const x = m + i * (cw + 16)
          const y = cy + dh / 2 + 60 * k
          out.push(...leader(c, cx - dw * 0.25 + (i * dw * 0.5) / Math.max(1, parts.length - 1), cy + dh * (0.1 + i * 0.1), x + cw / 2, y - 8), words(x, y - 30 * k, idx(i), 12 * k, { font: "mono", weight: 500, w: cw, enter: fade(0.8), name: `Number ${i + 1}` }), part(p.live, x + cw / 2, y + ch / 2, cw, ch, c.screen.scheme, p.fill))
          return
        }
        const cw = Math.min(w * 0.26, 360 * k)
        const ch = cw * 0.62
        const slot = (h - 2 * m) / Math.max(parts.length, 2)
        const x = (left ? w * 0.08 : w * 0.6) + (Number(v.zig) ? (i % 2) * w * 0.05 : 0)
        const y = m + 70 * k + i * slot + (slot - ch) / 2
        const ax = cx + (left ? -1 : 1) * dw * 0.18
        const ay = cy - dh * 0.3 + i * dh * 0.28
        out.push(...leader(c, ax, ay, left ? x + cw + 10 : x - 10, y + ch / 2), words(x, y - 26 * k, `${idx(i)}  ${nameOf(p.live.anim)}`, 12 * k, { font: "mono", weight: 500, w: cw, enter: fade(0.8), name: `Label ${i + 1}` }), part(p.live, x + cw / 2, y + ch / 2, cw, ch, c.screen.scheme, p.fill))
      })
      if (t) out.push(...head)
      return out
    },
  },
  {
    id: "field",
    name: "Isometric field",
    hint: "Its screens lying back in a rotated grid that runs off the frame, the way a studio shows a whole flow at once.",
    vary: (r) => {
      const turn = pick(r, [-28, 28, -20])
      const cols = pick(r, [3, 4])
      return { label: `${cols} across, turned ${turn > 0 ? "right" : "left"}`, turn, cols }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const cols = Number(v.cols)
      const dh = Math.min(h * 0.62, w * 0.36)
      const sx = (w * 1.25) / cols
      const sy = dh * 0.62
      const list = screens(c, cols * 2)
      const out: CNode[] = []
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < cols; col++) {
          const cx = -w * 0.08 + col * sx + (row % 2) * sx * 0.5
          const cy = h * 0.42 + row * sy
          out.push({ ...phone(c, list[row * cols + col], cx, cy, dh), rot3d: { x: 54, y: 0 }, rot: Number(v.turn), shadow: false, follow: undefined, enter: rise(0.2 + (row * cols + col) * 0.06, 0.9) })
        }
      return [...out, ...stack(m, [words(m, 0, c.kicker, 12 * k, { font: "mono", weight: 500, w: w * 0.4, enter: fade(0), name: "Kicker" }), words(m, 0, c.name, 44 * k, { weight: 600, w: w * 0.5, enter: rise(0.06), name: "Title" })])]
    },
  },
  {
    id: "lineup",
    name: "Line-up",
    hint: "Its screens receding into depth on one floor, each further one smaller and softer: a line-up from the dark.",
    vary: (r) => {
      const n = pick(r, [3, 4, 5])
      const from = pick(r, ["left", "right"])
      return { label: `${n} deep, from the ${from}`, n, from }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const n = Number(v.n)
      const dir = v.from === "left" ? 1 : -1
      const dh0 = t ? h * 0.5 : h * 0.74
      const floor = t ? h - m * 1.5 : h * 0.9
      const x0 = t ? w * (dir > 0 ? 0.3 : 0.7) : w * (dir > 0 ? 0.22 : 0.78)
      const list = screens(c, n)
      const devs: CNode[] = []
      let x = x0
      for (let i = 0; i < n; i++) {
        const s = 0.82 ** i
        const dh = dh0 * s
        devs.push({ ...phone(c, list[i], x, floor - dh / 2 - i * h * 0.02, dh, i === 0 ? c.screen.picture : undefined), rot3d: { x: 2, y: dir * -22 }, blur: Math.round(i * 2.2), opacity: Math.round((1 - i * 0.1) * 100) / 100, enter: rise(0.2 + i * 0.12, 0.9) })
        x += dir * widthOf(c, dh) * 0.78
      }
      const textX = dir > 0 ? w - m : m
      const block = stack(m, [words(textX, 0, c.kicker, 12 * k, { font: "mono", weight: 500, align: dir > 0 ? "right" : "left", w: w * 0.42, enter: fade(0), name: "Kicker" }), words(textX, 0, c.name, 48 * k, { weight: 600, align: dir > 0 ? "right" : "left", w: w * 0.42, enter: rise(0.06), name: "Title" }), words(textX, 0, c.tagline, 17 * k, { font: "text", weight: 400, align: dir > 0 ? "right" : "left", w: w * 0.32, enter: fade(0.2), name: "Line" })])
      return [glow(x0, floor - dh0 * 0.5, dh0 * 0.6, c.look.glow, 0.6), rule(c, m, floor + 1, w - 2 * m), ...devs.reverse(), ...block]
    },
  },
  {
    id: "pair",
    name: "Pair",
    hint: "Two phones overlapping, turned against each other, the one behind a little out of focus; the words on the free side.",
    vary: (r) => {
      const side = pick(r, ["right", "left"])
      return { label: `the pair on the ${side}`, side }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const right = v.side === "right"
      const [a, b] = screens(c, 2)
      const dh = t ? h * 0.52 : h * 0.8
      const base = t ? { x: w * 0.5, y: h * 0.66 } : { x: right ? w * 0.66 : w * 0.34, y: h * 0.54 }
      const off = widthOf(c, dh) * 0.42
      const textX = t ? w / 2 : right ? m : w - m
      const align = t ? "center" : right ? "left" : "right"
      const lines = [words(textX, 0, c.kicker, 13 * k, { font: "mono", weight: 500, align, w: w * (t ? 0.8 : 0.34), enter: fade(0), name: "Kicker" }), words(textX, 0, c.name, 64 * k, { weight: 600, align, w: w * (t ? 0.86 : 0.36), enter: rise(0.06), name: "Title" }), words(textX, 0, c.tagline, 19 * k, { font: "text", weight: 400, align, w: w * (t ? 0.7 : 0.3), enter: fade(0.2), name: "Line" })]
      const block = t ? stack(m, lines) : stackOn(h * 0.46, lines)
      return [
        glow(base.x, base.y, dh * 0.6, c.look.glow, 0.7),
        { ...phone(c, b, base.x + (right ? off : -off), base.y - dh * 0.08, dh * 0.86), rot3d: { x: 6, y: right ? 22 : -22 }, blur: 3, opacity: 0.92, enter: rise(0.25, 0.9) },
        { ...phone(c, a, base.x - (right ? off : -off) * 0.4, base.y + dh * 0.04, dh, c.screen.picture), rot3d: { x: 4, y: right ? -18 : 18 }, enter: rise(0.4, 0.9) },
        ...block,
      ]
    },
  },
  {
    id: "specimen",
    name: "Specimen",
    hint: "Its components in a strict grid of cells, each indexed and named, like a type specimen; the name across the top, the line at the foot.",
    vary: (r) => {
      const corners = pick(r, [0, 14])
      return { label: corners ? "soft cells" : "square cells", corners }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      // its components, and its screens on phones to make up three cells at least: one lonely cell isn't a specimen
      const parts = c.more.slice(0, 6).map((p) => ({ live: p.live, fill: p.fill, name: nameOf(p.live.anim), phone: false }))
      const items = [...parts, ...screens(c, Math.max(0, 3 - parts.length)).map((live) => ({ live, fill: false, name: "Screen", phone: true }))]
      const cols = tall(c) ? Math.min(2, items.length) : Math.min(3, items.length)
      const rows = Math.ceil(items.length / cols)
      const head = [words(m, m, c.name, 34 * k, { weight: 600, w: w * 0.6, enter: rise(0.06), name: "Title" }), words(w - m, m + 12 * k, c.kicker, 12 * k, { font: "mono", weight: 500, align: "right", w: w * 0.3, enter: fade(0), name: "Kicker" })]
      const top = m + 64 * k
      const foot = footAt([words(m, 0, c.tagline, 15 * k, { font: "text", weight: 400, w: w * 0.6, enter: fade(0.3), name: "Line" })], h - m)
      const bottom = foot[0].y - 18 * k
      const gap = 12
      const cw = (w - 2 * m - (cols - 1) * gap) / cols
      const ch = (bottom - top - (rows - 1) * gap) / rows
      const cells = items.flatMap((it, i): CNode[] => {
        const x = m + (i % cols) * (cw + gap)
        const y = top + Math.floor(i / cols) * (ch + gap)
        const cell: CNode = { ...shapeNode("rect", { x, y, w: cw, h: ch }, c.look.dark ? "#ffffff" : "#000000"), name: `Cell ${i + 1}`, radius: Number(v.corners), opacity: c.look.dark ? 0.04 : 0.03, stroke: { color: "rgba(127,127,127,0.4)", width: 1 }, enter: fade(0.1 + i * 0.05) }
        const label = words(x + 14, y + 12, `${idx(i)}  ${it.name}`, 11 * k, { font: "mono", weight: 500, w: cw - 28, enter: fade(0.4 + i * 0.05), name: `Label ${i + 1}` })
        const inner = { w: cw * 0.72, h: (ch - 40 * k) * 0.78 }
        const body = it.phone ? { ...phone(c, it.live, x + cw / 2, y + ch / 2 + 12 * k, Math.min(inner.h, ((inner.w * MOCKUP[c.screen.device].h) / MOCKUP[c.screen.device].w) * 0.9)), rot3d: { x: 0, y: 0 }, shadow: false } : part(it.live, x + cw / 2, y + ch / 2 + 12 * k, inner.w, inner.h, c.screen.scheme, it.fill)
        return [cell, body, label]
      })
      return [...head, ...cells, ...foot]
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    hint: "A magazine spread: the name huge in a serif, the phone breaking through it, a narrow column of words and page marks in the corners.",
    vary: (r) => {
      const turn = pick(r, [-10, 10, 0])
      return { label: turn ? `the phone turned ${turn < 0 ? "in" : "out"}` : "the phone square on", turn }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      // a serif's letters average about half an em: the name fits its measure, and the phone overlaps only its end
      const size = Math.round(Math.min(190 * Math.max(0.6, k), (t ? w * 0.9 : w * 0.62) / Math.max(4, c.name.length * 0.5)))
      const head = words(m, m * 0.6, c.name, size, { font: "serif", weight: 400, w: t ? w - 2 * m : w * 0.66, enter: rise(0, 1.1), name: "Headline" })
      const dh = t ? h * 0.56 : h * 0.9
      const cx = t ? w * 0.62 : w * 0.72
      const cy = t ? h - m - dh / 2 : h * 0.55
      const colW = t ? w * 0.4 : w * 0.24
      const column = footAt(stack(0, [words(m, 0, c.kicker, 12 * k, { font: "mono", weight: 500, w: colW, enter: fade(0.3), name: "Kicker" }), words(m, 0, c.tagline, 18 * k, { font: "text", weight: 400, w: colW, enter: fade(0.4), name: "Column" })]), h - m - 30 * k)
      return [head, { ...phone(c, c.screen.live, cx, cy, dh, c.screen.picture), rot3d: { x: 0, y: Number(v.turn) } }, ...column, words(m, h - m - 12 * k, "01", 11 * k, { font: "mono", weight: 500, w: 60, enter: fade(0.5), name: "Page" }), words(w - m, h - m - 12 * k, c.cta, 11 * k, { font: "mono", weight: 500, align: "right", w: w * 0.3, enter: fade(0.5), name: "Mark" })]
    },
  },
  {
    id: "fan",
    name: "Fan",
    hint: "Three screens pivoting out from one point below the frame, like cards fanned in a hand; the name above them.",
    vary: (r) => {
      const spread = pick(r, [10, 14, 18])
      return { label: `fanned ${spread}°`, spread }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const block = stack(m, [words(w / 2, 0, c.kicker, 13 * k, { font: "mono", weight: 500, align: "center", w: w * 0.8, enter: fade(0), name: "Kicker" }), words(w / 2, 0, c.name, (t ? 60 : 56) * k, { weight: 600, align: "center", w: w * 0.86, enter: rise(0.06), name: "Title" })])
      const top = below(block, 24 * k)
      const dh = Math.min(h - top - m * 0.4, t ? h * 0.52 : h * 0.66)
      const pivot = { x: w / 2, y: top + dh * 2.1 }
      const R = pivot.y - (top + dh / 2)
      const a = Number(v.spread)
      const list = screens(c, 3)
      const at = (deg: number) => ({ x: pivot.x + Math.sin((deg * Math.PI) / 180) * R, y: pivot.y - Math.cos((deg * Math.PI) / 180) * R })
      const order = [-a, a, 0]
      return [glow(w / 2, top + dh * 0.55, dh * 0.6, c.look.glow, 0.65), ...order.map((deg, i) => ({ ...phone(c, list[[1, 2, 0][i]], at(deg).x, at(deg).y, dh, deg === 0 ? c.screen.picture : undefined), rot: deg, rot3d: { x: 0, y: 0 }, enter: rise(0.3 + i * 0.1, 0.9) })), ...block]
    },
  },
  {
    id: "satellites",
    name: "Satellites",
    hint: "The phone on a third, its components set round it on a golden spiral, each smaller than the last, coming in along it.",
    needs: 2,
    vary: (r) => {
      const side = pick(r, ["left", "right"])
      const turn = pick(r, [137.5, -137.5])
      return { label: `the phone on the ${side} third, the spiral turning ${turn > 0 ? "clockwise" : "anticlockwise"}`, side, turn }
    },
    layout: (c, v) => {
      const { w, h } = c.frame
      const m = marginOf(c)
      const k = scaleOf(c)
      const t = tall(c)
      const left = v.side === "left"
      const dh = t ? h * 0.5 : h * 0.78
      const cx = t ? w / 2 : left ? w * 0.36 : w * 0.64
      const cy = t ? h * 0.5 : h * 0.53
      const dw = widthOf(c, dh)
      const box = { x0: cx - dw / 2 - 12, x1: cx + dw / 2 + 12, y0: cy - dh / 2, y1: cy + dh / 2 }
      const parts = c.more.slice(0, 4).map((p, i) => {
        const size = Math.min(w, h) * (0.3 - i * 0.04)
        const cw = size
        const ch = size * 0.62
        // walk out along this arm of the spiral until the card clears the phone and fits the frame
        const ang = ((Number(v.turn) * (i + 1) + (left ? 0 : 180)) * Math.PI) / 180
        let r = dw * 0.6
        let x = cx
        let y = cy
        for (let s = 0; s < 40; s++) {
          x = cx + Math.cos(ang) * r
          y = cy + Math.sin(ang) * r * 0.8
          const clear = x + cw / 2 < box.x0 || x - cw / 2 > box.x1 || y + ch / 2 < box.y0 || y - ch / 2 > box.y1
          if (clear) break
          r += 14
        }
        x = Math.min(w - m - cw / 2, Math.max(m + cw / 2, x))
        y = Math.min(h - m - ch / 2, Math.max(m + ch / 2, y))
        const n = part(p.live, x, y, cw, ch, c.screen.scheme, p.fill)
        return { ...n, enter: undefined, motion: { d: `M0 0 Q${Math.round((x - cx) * 0.3)} ${Math.round((y - cy) * 0.6)} ${Math.round((x - cx) * 0.55)} ${Math.round((y - cy) * 0.55)}`, preset: "spring" as const, trigger: "enter" as const, strength: 0.5, speed: 0.9, delay: 0.25 + i * 0.12, fade: true, reverse: true } }
      })
      const textX = t ? w / 2 : left ? w - m : m
      const align = t ? "center" : left ? "right" : "left"
      const block = footAt(stack(0, [words(textX, 0, c.kicker, 12 * k, { font: "mono", weight: 500, align, w: w * 0.3, enter: fade(0.1), name: "Kicker" }), words(textX, 0, c.name, 30 * k, { weight: 600, align, w: w * 0.3, enter: fade(0.15), name: "Title" })]), h - m)
      return [glow(cx, cy, dh * 0.6, c.look.glow, 0.7), { ...phone(c, c.screen.live, cx, cy, dh, c.screen.picture), rot3d: { x: 5, y: left ? -14 : 14 } }, ...parts, ...block]
    },
  },
]

/** This round's arrangements: every system once, its variables drawn from `seed`, so "Another round" gives each a
    new arrangement on its principle. */
export function arrangements(seed: number): Composition[] {
  return SYSTEMS.map((s, i) => {
    const v = s.vary(rng(seed * 101 + i * 7 + 3))
    return { id: `arr-${s.id}-${seed}`, category: "studio", name: s.name, hint: `${s.hint} This round: ${v.label}.`, ...(s.needs ? { needs: s.needs } : {}), make: (c: CreateCtx) => dress(c, frameDoc(c, s.name, s.layout(c, v))) }
  })
}
export const SYSTEM_COUNT = SYSTEMS.length
