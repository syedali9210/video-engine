// Engines: whole kinds of picture a film can show, each a generator (here: what to draw, from the brand, a subject and
// a seed) and a renderer (animations/_film/engines.tsx: drawn as a pure function of the clock).
//   dither    a subject (a butterfly flapping open, a flower unfolding, a lit orb turning, ripples) shaded and drawn in
//             ordered-dither pixels, two colours of the brand's
//   cartoon   flat colour with hand-drawn rings or wavy stripes on it (the lines boil, on eights), and a subject drawn
//             on: a flower in one white line, a blob icon popping with its arrow, doodled flowers and cards round
//             the middle; outlines thick, fills flat, pops squashing and stretching
//   mograph   motion graphics in panels: the frame split into upright panels (flat, a soft gradient, a picture) that
//             slide and resize from beat to beat, shapes in them (a flower, half moons, a square with a question, a
//             circle), a button pressed, a selection box drawn round one
//   embed     any of these (and the satin ground) in frames of a style (full, a card, side by side, a grid, a picture
//             in a picture), arriving one after another
// The colours come from the brand: dither and mograph in its own family; a cartoon's flat triad turns round the wheel
// from it (the way a cartoon's flat palette does). Pure: no DOM.
import { hex, lch } from "../theme.ts"

export type DitherSubject = "butterfly" | "flower" | "orb" | "ripple"
export type CartoonSubject = "flower" | "blob" | "doodles"
export type Shape = "flower" | "moons" | "question" | "circle" | "none"
export type DitherSpec = { engine: "dither"; subject: DitherSubject; ink: string; paper: string; cell: number; t0: number; dur: number; seed: number }
export type CartoonSpec = { engine: "cartoon"; subject: CartoonSubject; ground: string; lines: string; pattern: "rings" | "stripes"; ink: string; fills: string[]; t0: number; dur: number; seed: number }
export type MographPanel = { fill: string; to?: string; src?: string; shape: Shape; label?: string }
export type MographSpec = { engine: "mograph"; beats: { at: number; widths: number[]; panels: MographPanel[]; press?: number; select?: number }[]; shapeInk: string; t0: number; dur: number; seed: number }
export type SatinSpec = { engine: "satin"; accent: string; dark?: boolean }
export type EngineSpec = DitherSpec | CartoonSpec | MographSpec | SatinSpec | EmbedSpec
export type Slot = { spec: Exclude<EngineSpec, EmbedSpec>; x: number; y: number; w: number; h: number; at: number }
export type EmbedSpec = { engine: "embed"; layout: "full" | "card" | "split" | "grid" | "pip"; style: "glass" | "flat" | "device" | "polaroid"; slots: Slot[]; t0: number; dur: number }

const hueOf = (accent: string) => {
  const o = lch(accent)
  return o.c >= 0.03 ? o.h : 264
}
const pickOf = <X>(xs: readonly X[], seed: number) => xs[Math.abs(Math.floor(seed)) % xs.length]

/** a dither: its subject drawn in two of the brand's colours, the pixels a size that reads as dither at 1080p */
export function ditherFor(o: { accent: string; subject?: DitherSubject; dark?: boolean; seed: number; t0: number; dur: number }): DitherSpec {
  const h = hueOf(o.accent)
  const dark = o.dark ?? true
  return {
    engine: "dither",
    subject: o.subject ?? pickOf(["butterfly", "flower", "orb", "ripple"] as const, o.seed),
    ink: dark ? hex({ l: 0.86, c: 0.09, h }) : hex({ l: 0.32, c: 0.12, h }),
    paper: dark ? hex({ l: 0.17, c: 0.05, h }) : hex({ l: 0.96, c: 0.02, h }),
    cell: 6,
    t0: o.t0,
    dur: o.dur,
    seed: o.seed,
  }
}

/** a cartoon: a flat ground of a colour turned round from the brand's, tone-on-tone lines on it, the subject in
    white line, flat fills from the triad */
export function cartoonFor(o: { accent: string; subject?: CartoonSubject; seed: number; t0: number; dur: number }): CartoonSpec {
  const h = hueOf(o.accent)
  const turn = pickOf([0, 120, 240] as const, o.seed)
  const gh = h + turn
  return {
    engine: "cartoon",
    subject: o.subject ?? pickOf(["flower", "blob", "doodles"] as const, o.seed),
    ground: hex({ l: 0.6, c: 0.16, h: gh }),
    lines: hex({ l: 0.68, c: 0.15, h: gh + 4 }),
    pattern: o.seed % 2 ? "stripes" : "rings",
    ink: "#ffffff",
    fills: [hex({ l: 0.62, c: 0.1, h: h + 160 }), hex({ l: 0.56, c: 0.19, h: h + 230 }), hex({ l: 0.85, c: 0.15, h: h + 210 }), hex({ l: 0.3, c: 0.08, h: h + 150 }), hex({ l: 0.88, c: 0.07, h: h + 140 })],
    t0: o.t0,
    dur: o.dur,
    seed: o.seed,
  }
}

/** motion graphics in panels: beats of upright panels in the brand's family (its deep, a soft gradient, its palest,
    the product's pictures), each beat changing how they split, what's in them, what's pressed or selected */
export function mographFor(o: { accent: string; seed: number; t0: number; dur: number; words?: string[]; images?: string[] }): MographSpec {
  const h = hueOf(o.accent)
  const deep = hex({ l: 0.3, c: 0.04, h: h + 10 })
  const soft = hex({ l: 0.78, c: 0.1, h })
  const softer = hex({ l: 0.9, c: 0.05, h: h + 8 })
  const pale = hex({ l: 0.84, c: 0.04, h: h - 12 })
  const mid = hex({ l: 0.58, c: 0.17, h })
  const img = o.images ?? []
  const word = o.words?.[0] ?? "Make it"
  const n = Math.max(3, Math.min(5, Math.round(o.dur / 1.25)))
  const step = o.dur / n
  const B = (i: number) => o.t0 + i * step
  const beats: MographSpec["beats"] = [
    { at: B(0), widths: [0.12, 0.62, 0.26], panels: [{ fill: deep, shape: "flower" }, { fill: soft, to: softer, shape: "none", label: word }, { fill: pale, shape: "moons" }], press: 1 },
    { at: B(1), widths: [0.34, 0.33, 0.33], panels: [{ fill: img[0] ? deep : mid, src: img[0], shape: img[0] ? "none" : "circle" }, { fill: mid, to: soft, shape: "question" }, { fill: pale, shape: "question" }] },
    { at: B(2), widths: [0.22, 0.56, 0.22], panels: [{ fill: deep, shape: "flower" }, { fill: soft, to: softer, src: img[1], shape: img[1] ? "none" : "circle", label: o.words?.[1] }, { fill: pale, shape: "moons" }], select: 1 },
  ]
  if (n > 3) beats.push({ at: B(3), widths: [0.5, 0.5], panels: [{ fill: mid, to: soft, shape: "circle" }, { fill: deep, shape: "flower" }] })
  if (n > 4) beats.push({ at: B(4), widths: [1], panels: [{ fill: soft, to: softer, shape: "none", label: o.words?.[2] ?? word }] })
  return { engine: "mograph", beats, shapeInk: hex({ l: 0.95, c: 0.03, h: h + 30 }), t0: o.t0, dur: o.dur, seed: o.seed }
}

/** engines in frames of a style: laid out by how many there are, arriving one after another */
export function embedFor(o: { slots: Exclude<EngineSpec, EmbedSpec>[]; layout?: EmbedSpec["layout"]; style?: EmbedSpec["style"]; t0: number; dur: number }): EmbedSpec {
  const n = o.slots.length
  const layout = o.layout ?? (n === 1 ? "card" : n === 2 ? "split" : "grid")
  const gap = 0.025
  const boxes: [number, number, number, number][] =
    layout === "full" ? [[0, 0, 1, 1]]
    : layout === "card" ? [[0.17, 0.14, 0.66, 0.72]]
    : layout === "split" ? [[0.06, 0.16, 0.43, 0.68], [0.51, 0.16, 0.43, 0.68]]
    : layout === "pip" ? [[0.06, 0.08, 0.88, 0.84], [0.62, 0.52, 0.28, 0.3]]
    : Array.from({ length: n }, (_, i) => {
        const cols = n <= 4 ? 2 : 3
        const rows = Math.ceil(n / cols)
        const w = (0.88 - gap * (cols - 1)) / cols
        const hh = (0.84 - gap * (rows - 1)) / rows
        return [0.06 + (i % cols) * (w + gap), 0.08 + Math.floor(i / cols) * (hh + gap), w, hh] as [number, number, number, number]
      })
  const slots = o.slots.slice(0, boxes.length).map((spec, i) => ({ spec, x: boxes[i][0], y: boxes[i][1], w: boxes[i][2], h: boxes[i][3], at: o.t0 + i * 0.22 }))
  return { engine: "embed", layout, style: o.style ?? "glass", slots, t0: o.t0, dur: o.dur }
}

/** how long an engine takes to play its own animation (s) */
export const lengthOf = (s: EngineSpec): number => (s.engine === "satin" ? 0 : s.engine === "mograph" ? s.beats.length * 1.1 + 0.6 : s.engine === "embed" ? 0.22 * s.slots.length + Math.max(0, ...s.slots.map((x) => lengthOf(x.spec))) : s.engine === "dither" ? 2.6 : 2.8)
