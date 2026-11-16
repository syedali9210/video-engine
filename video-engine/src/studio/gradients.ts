// Studio — the gradient engine. A launch film's grounds are moving light, not flat colour: a mesh of soft blobs
// drifting, an aurora's ribbons, a spotlight from above, a ring of light turning, a horizon at dusk, a prism. Each is
// built from one look (theme.ts: the product's colour, matched in a harmony). Its hues are spread round the accent in
// OKLCH, so the colours belong together, and it's controlled by a few named knobs:
//   - energy: how much colour and contrast;
//   - speed: how fast it drifts (a whole number of loops a film, so it loops);
//   - spread: how far the hues reach either side of the accent;
//   - focus: where the light sits;
//   - seed: another arrangement of the same.
// The output is an ordinary paint stack (paint.ts), editable layer by layer. Titles get gradient fills from the same
// palette. Pure: the Artist, the Studio's Background panel and the server all use it.
import { hex, lch, matchLook, readable, type Harmony, type Look } from "../theme.ts"
import type { Blend, DriftKind, Paint, Pt } from "./paint.ts"

export type GradientKind = "mesh" | "aurora" | "spotlight" | "swirl" | "horizon" | "duotone" | "prism" | "glow" | "dusk" | "noir"
export const GRADIENTS: { id: GradientKind; name: string; hint: string }[] = [
  { id: "mesh", name: "Mesh", hint: "Soft blobs of the palette drifting over the ground." },
  { id: "aurora", name: "Aurora", hint: "Ribbons of light swaying across a dark sky." },
  { id: "spotlight", name: "Spotlight", hint: "One light from above, a pool on the floor, the edges falling to dark." },
  { id: "swirl", name: "Swirl", hint: "A ring of light turning round a dark core: a keynote's end card." },
  { id: "horizon", name: "Horizon", hint: "Light rising from a low horizon, the sky deepening above it." },
  { id: "duotone", name: "Duotone", hint: "Two colours across the frame, a soft light between them." },
  { id: "prism", name: "Prism", hint: "A wheel of the palette's hues around a bright core, turning slowly." },
  { id: "glow", name: "Glow", hint: "The look's own ground: one light behind the subject, a haze opposite." },
  { id: "dusk", name: "Dusk", hint: "Warm below, cool above, a low sun in between." },
  { id: "noir", name: "Noir", hint: "Near black, one cold sheen, the edges falling away." },
]
export type GradientOpts = { energy?: number; speed?: number; spread?: number; focus?: Pt; seed?: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
let n = 0
const id = () => `g${(++n).toString(36)}${Math.random().toString(36).slice(2, 6)}`
type S = [color: string, alpha: number, at: number]
const P = (kind: Paint["kind"], stops: S[], from: Pt, to: Pt, o: { ratio?: number; opacity?: number; blend?: Blend; drift?: { kind: DriftKind; period: number; amount: number } } = {}): Paint => ({
  id: id(),
  kind,
  stops: stops.map(([color, alpha, at]) => ({ color, alpha: clamp(alpha), at: clamp(at) })),
  from,
  to,
  ratio: o.ratio ?? 1,
  opacity: o.opacity ?? 1,
  blend: o.blend ?? "normal",
  ...(o.drift && o.drift.kind !== "none" ? { drift: o.drift } : {}),
})
/** One paint, the short way: its kind, its stops as [colour, alpha, at], its handles, and what else it takes. */
export const paintOf = P
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 3
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The palette a gradient draws with: the look's ground, its light and haze, the accent, and two hues either side of
    it, as far as `spread` reaches, as vivid as `energy` asks (darker or lighter to sit on the ground). */
export function paletteOf(look: Look, spread = 60, energy = 0.7) {
  const a = lch(look.accent)
  // energy sets how vivid, whatever the colour came in as: a pale accent still makes a loud gradient at full energy
  const chroma = Math.max(a.c, 0.05 + 0.13 * energy) * (0.6 + 0.55 * energy)
  const l = look.dark ? 0.52 + 0.12 * energy : 0.74 - 0.08 * energy
  const at = (dh: number, dl = 0) => hex({ l: clamp(l + dl), c: chroma, h: (a.h + dh + 360) % 360 })
  return { ground: look.ground, glow: look.glow, haze: look.haze, ink: look.ink, accent: look.accent, a: at(0), b: at(spread / 2, 0.04), c: at(-spread / 2, -0.04), d: at(spread, 0.08), dark: look.dark }
}

/** A moving gradient of `kind` on `look`. */
export function gradient(kind: GradientKind, look: Look, o: GradientOpts = {}): Paint[] {
  const energy = clamp(o.energy ?? 0.7)
  const speed = Math.max(0, Math.min(2, o.speed ?? 1))
  const C = paletteOf(look, o.spread ?? 60, energy)
  const r = rng(o.seed ?? 1)
  const f = o.focus ?? { x: 0.5, y: 0.45 }
  // a drift's period, longer for a slower film; none when it's still
  const drift = (kind: DriftKind, base: number, amount: number) => (speed > 0 ? { kind, period: Math.max(4, Math.round(base / speed)), amount } : undefined)
  const solid = (c: string) => P("solid", [[c, 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })
  const vignette = (a: number) => P("radial", [["#000000", 0, 0.5], ["#000000", a, 1]], { x: 0.5, y: 0.5 }, { x: 1.06, y: 0.5 }, { ratio: 1.1 })
  const blob = (c: string, x: number, y: number, rad: number, alpha: number, d?: Paint["drift"], blend: Blend = "normal") => P("radial", [[c, alpha, 0], [c, alpha * 0.4, 0.45], [c, 0, 1]], { x, y }, { x: x + rad, y }, { ratio: 0.8 + r() * 0.4, blend, drift: d })
  const k = C.dark ? 1 : 0.8
  switch (kind) {
    case "mesh": {
      const spots = [0, 1, 2, 3].map(() => ({ x: 0.1 + r() * 0.8, y: 0.1 + r() * 0.8 }))
      return [
        solid(C.ground),
        blob(C.a, spots[0].x, spots[0].y, 0.55, 0.85 * k * energy + 0.15, drift("wave", 16, 0.6)),
        blob(C.b, spots[1].x, spots[1].y, 0.5, 0.75 * k * energy + 0.12, drift("orbit", 18, 0.6)),
        blob(C.c, spots[2].x, spots[2].y, 0.45, 0.7 * k * energy + 0.1, drift("breathe", 14, 0.7)),
        blob(C.d, spots[3].x, spots[3].y, 0.4, 0.5 * k * energy + 0.08, drift("wave", 20, 0.5)),
        ...(C.dark ? [vignette(0.55)] : []),
      ]
    }
    case "aurora":
      return [
        solid(C.dark ? C.ground : hex({ ...lch(C.ground), l: 0.16 })),
        P("radial", [[C.a, 0.85 * energy + 0.15, 0], [C.a, 0, 1]], { x: 0.3, y: 0.32 }, { x: 0.95, y: 0.32 }, { ratio: 0.32, blend: "screen", drift: drift("wave", 14, 0.7) }),
        P("radial", [[C.b, 0.7 * energy + 0.12, 0], [C.b, 0, 1]], { x: 0.68, y: 0.42 }, { x: 1.3, y: 0.42 }, { ratio: 0.28, blend: "screen", drift: drift("wave", 18, 0.6) }),
        P("radial", [[C.c, 0.55 * energy + 0.1, 0], [C.c, 0, 1]], { x: 0.5, y: 0.2 }, { x: 1.1, y: 0.2 }, { ratio: 0.22, blend: "screen", drift: drift("orbit", 22, 0.5) }),
        P("linear", [["#000000", 0, 0.45], ["#000000", 0.6, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 }),
      ]
    case "spotlight":
      return [
        solid(C.dark ? C.ground : "#0b0b0e"),
        P("radial", [["#ffffff", 0.2 + 0.12 * energy, 0], [C.glow, 0.12, 0.4], ["#ffffff", 0, 1]], { x: f.x, y: 0.08 }, { x: f.x + 0.5, y: 0.08 }, { ratio: 0.7, drift: drift("breathe", 12, 0.4) }),
        P("radial", [[C.a, 0.35 * energy, 0], [C.a, 0, 1]], { x: f.x, y: 0.86 }, { x: f.x + 0.42, y: 0.86 }, { ratio: 0.3 }),
        vignette(0.7),
      ]
    case "swirl":
      return [
        solid(C.dark ? C.ground : "#05060f"),
        P("angular", [[C.a, 1, 0], [C.ground, 1, 0.22], [C.b, 1, 0.46], [C.c, 1, 0.72], [C.a, 1, 1]], { x: f.x + 0.1, y: f.y - 0.05 }, { x: f.x + 0.45, y: f.y - 0.05 }, { opacity: 0.55 + 0.4 * energy, drift: drift("spin", 10, 1) }),
        P("radial", [[C.dark ? C.ground : "#05060f", 1, 0], [C.dark ? C.ground : "#05060f", 0.9, 0.42], [C.ground, 0, 1]], { x: f.x - 0.06, y: f.y + 0.15 }, { x: f.x + 0.34, y: f.y + 0.15 }, { ratio: 0.9, drift: drift("orbit", 10, 0.25) }),
        vignette(0.75),
      ]
    case "horizon":
      return [
        P("linear", [[C.dark ? hex({ ...lch(C.a), l: 0.12, c: 0.05 }) : C.haze, 1, 0], [C.a, 0.9, 0.62], [C.glow, 1, 0.8], [C.dark ? C.ground : "#ffffff", 1, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 }),
        P("radial", [["#ffffff", 0.55 * energy, 0], [C.glow, 0.25, 0.35], [C.glow, 0, 1]], { x: f.x, y: 0.74 }, { x: f.x + 0.4, y: 0.74 }, { ratio: 0.45, drift: drift("breathe", 14, 0.5) }),
      ]
    case "duotone":
      return [
        P("linear", [[C.a, 1, 0], [C.c, 1, 1]], { x: 0, y: 0 }, { x: 1, y: 1 }),
        P("radial", [["#ffffff", 0.3 * energy, 0], ["#ffffff", 0, 1]], { x: f.x, y: f.y }, { x: f.x + 0.5, y: f.y }, { blend: "soft-light", drift: drift("orbit", 16, 0.5) }),
        P("linear", [["#000000", 0, 0.5], ["#000000", C.dark ? 0.45 : 0.15, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 }),
      ]
    case "prism":
      return [
        solid(C.dark ? C.ground : "#ffffff"),
        P("angular", [[C.a, 1, 0], [C.b, 1, 0.2], [C.d, 1, 0.4], [C.c, 1, 0.62], [C.b, 1, 0.82], [C.a, 1, 1]], { x: f.x, y: f.y + 0.1 }, { x: f.x + 0.4, y: f.y + 0.1 }, { opacity: 0.45 + 0.45 * energy, drift: drift("spin", 24, 1) }),
        P("radial", [[C.dark ? C.ground : "#ffffff", 0.95, 0], [C.dark ? C.ground : "#ffffff", 0, 1]], { x: f.x, y: f.y + 0.1 }, { x: f.x + 0.3, y: f.y + 0.1 }),
        ...(C.dark ? [vignette(0.5)] : []),
      ]
    case "dusk":
      return [
        P("linear", [[hex({ ...lch(C.c), l: C.dark ? 0.2 : 0.8 }), 1, 0], [hex({ ...lch(C.b), l: C.dark ? 0.36 : 0.86 }), 1, 0.6], [hex({ ...lch(C.d), h: 40, l: C.dark ? 0.55 : 0.88 }), 1, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 }),
        P("radial", [["#ffe8c8", 0.6 * energy, 0], ["#ffe8c8", 0, 1]], { x: f.x + 0.15, y: 0.78 }, { x: f.x + 0.5, y: 0.78 }, { ratio: 0.6, drift: drift("breathe", 16, 0.4) }),
      ]
    case "noir":
      return [solid("#060608"), P("linear", [["#ffffff", 0, 0.38], ["#ffffff", 0.07 + 0.06 * energy, 0.5], ["#ffffff", 0, 0.62]], { x: 0, y: 0 }, { x: 1, y: 1 }, { drift: drift("wave", 18, 0.4) }), vignette(0.8)]
    default: {
      // the look's own ground, as theme.ts lays it
      return [solid(C.ground), blob(C.glow, f.x, f.y, 0.46, look.dark ? 0.85 : 0.9, drift("orbit", 12, 0.35)), blob(C.haze, f.x > 0.5 ? 0.12 : 0.88, Math.min(0.92, f.y + 0.4), 0.55, 0.75, drift("wave", 16, 0.3))]
    }
  }
}

/** The ground colour a gradient starts from (its first solid, or the top of its first linear), for the type over it. */
export const groundOfStack = (p: Paint[]) => p[0]?.stops[0]?.color ?? "#000000"
/** Whether a gradient reads as dark (light type on it). */
export const darkStack = (p: Paint[]) => lch(groundOfStack(p)).l < 0.55

export type TitleFill = "accent" | "spectrum" | "chrome" | "ink"
/** A title's gradient fill from the same palette, readable on the ground it sits on. */
export function titleFill(kind: TitleFill, look: Look, on = look.ground): Paint[] {
  const C = paletteOf(look, 70, 0.8)
  const ink = readable(look.ink, on, 7)
  const lift = (c: string) => readable(c, on, 3)
  const across = (stops: S[]) => [P("linear", stops, { x: 0, y: 0.5 }, { x: 1, y: 0.5 })]
  if (kind === "spectrum") return across([[lift(C.c), 1, 0], [lift(C.a), 1, 0.5], [lift(C.b), 1, 1]])
  if (kind === "chrome") return [P("linear", [[ink, 1, 0], [readable("#9ca3af", on, 3), 1, 0.55], [ink, 1, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })]
  if (kind === "accent") return across([[ink, 1, 0], [ink, 1, 0.35], [lift(C.a), 1, 1]])
  return across([[ink, 1, 0], [ink, 1, 1]])
}

/** A look for a harmony on a colour (theme.ts), the way the Artist and the Background panel take one. */
export const lookFor = (anchor: string, harmony: Harmony, seed = 0) => matchLook(anchor, harmony, seed)
