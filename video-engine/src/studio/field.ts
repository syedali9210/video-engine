// Composed gradients: the ground a launch film's words and product sit on, laid out the way a designer lays one out,
// not scattered. One hue family (the brand's), held across a wide range of light, each colour with a job and a place:
//   mass   the brand at its most saturated, the biggest shape, filling one side
//   glow   a lighter, slightly cooler brand, where the mass thins out
//   light  a near-white, cooled a little, the highlight opposite the mass
//   sheen  near-white at an edge, softening it
//   band   a mid tone turned a step round the wheel, a long soft streak
//   haze   a pale tint well round the wheel (blue's is a lilac-pink), low and wide at the bottom
//   dark   the brand at its deepest, anchoring a corner (what gives the field its depth)
// Several compositions place them differently (a diagonal, its mirror, a horizon, a spotlight); the director gives
// each act its own, so the film changes as it goes without leaving its family. Worked in OKLCH, so lightness and
// chroma mean what they look like. The text that sits on it (ink) is read off the middle, where titles go.
// Pure: the films draw it (animations/_film/field.tsx), the director and `npm run check` read it.
import { hex, lch } from "../theme.ts"

export type Role = "mass" | "glow" | "light" | "sheen" | "band" | "haze" | "dark"
/** one soft shape: its centre and radii (fractions of the frame), its turn (degrees), its colour and strength */
export type Blob = { role: Role; x: number; y: number; rx: number; ry: number; rot: number; color: string; a: number }
export type Field = { base: string; ink: string; quiet: string; blobs: Blob[]; variant: Composition }
export const COMPOSITIONS = ["diagonal", "mirror", "horizon", "spot"] as const
export type Composition = (typeof COMPOSITIONS)[number]

/** each role's light, chroma and turn from the brand's hue, on a light field and on a dark one */
const TONES: Record<Role, { l: number; c: number; dh: number; dl: number; dc: number }> = {
  mass: { l: 0.53, c: 0.22, dh: 2, dl: 0.4, dc: 0.18 },
  glow: { l: 0.67, c: 0.15, dh: -12, dl: 0.52, dc: 0.15 },
  light: { l: 0.93, c: 0.045, dh: -28, dl: 0.78, dc: 0.08 },
  sheen: { l: 0.96, c: 0.02, dh: 8, dl: 0.66, dc: 0.06 },
  band: { l: 0.7, c: 0.12, dh: 14, dl: 0.48, dc: 0.13 },
  haze: { l: 0.9, c: 0.05, dh: 52, dl: 0.55, dc: 0.09 },
  dark: { l: 0.34, c: 0.1, dh: -3, dl: 0.13, dc: 0.06 },
}
/** where each composition puts them (x, y, rx, ry, turn), back to front */
const LAYOUTS: Record<Composition, [Role, number, number, number, number, number, number][]> = {
  // saturated top left falling to light top right; a dark corner bottom right; the tint low in the middle
  diagonal: [
    ["glow", 0.04, 0.66, 0.36, 0.42, 0, 0.9],
    ["mass", 0.2, 0.2, 0.62, 0.62, -12, 1],
    ["band", 0.8, 0.8, 0.34, 0.16, -14, 0.9],
    ["haze", 0.42, 1.02, 0.42, 0.3, 0, 0.95],
    ["light", 0.94, 0.1, 0.56, 0.6, 12, 1],
    ["sheen", 1.02, 0.46, 0.34, 0.36, 0, 0.85],
    ["dark", 1.02, 1.06, 0.38, 0.42, 0, 1],
  ],
  mirror: [
    ["glow", 0.96, 0.66, 0.36, 0.42, 0, 0.9],
    ["mass", 0.8, 0.2, 0.62, 0.62, 12, 1],
    ["band", 0.2, 0.8, 0.34, 0.16, 14, 0.9],
    ["haze", 0.58, 1.02, 0.42, 0.3, 0, 0.95],
    ["light", 0.06, 0.1, 0.56, 0.6, -12, 1],
    ["sheen", -0.02, 0.46, 0.34, 0.36, 0, 0.85],
    ["dark", -0.02, 1.06, 0.38, 0.42, 0, 1],
  ],
  // light along the top, the brand's mass across the middle, deep at both bottom corners, the tint between them
  horizon: [
    ["mass", 0.5, 0.64, 0.8, 0.5, 0, 1],
    ["glow", 0.12, 0.4, 0.4, 0.34, -8, 0.85],
    ["band", 0.82, 0.5, 0.36, 0.14, 8, 0.85],
    ["light", 0.5, -0.04, 0.78, 0.46, 0, 1],
    ["haze", 0.5, 1.06, 0.34, 0.24, 0, 0.9],
    ["dark", -0.06, 1.08, 0.4, 0.44, 0, 1],
    ["dark", 1.06, 1.08, 0.4, 0.44, 0, 1],
  ],
  // deep all round, the brand lit in the middle, a soft highlight above it: where a mark lands
  spot: [
    ["mass", 0.5, 0.54, 0.62, 0.62, 0, 1],
    ["glow", 0.5, 0.48, 0.34, 0.36, 0, 0.85],
    ["light", 0.56, 0.2, 0.4, 0.26, -6, 0.55],
    ["haze", 0.36, 1.04, 0.44, 0.24, 8, 0.5],
    ["dark", -0.06, -0.06, 0.4, 0.46, 0, 0.9],
    ["dark", 1.06, 1.06, 0.42, 0.48, 0, 1],
  ],
}

/** the brand's hue, or (a grey brand has none) a royal blue: the hue the reference films sit in */
export const fieldHue = (accent?: string) => {
  const o = accent && /^#[0-9a-f]{6}$/i.test(accent) ? lch(accent) : null
  return o && o.c >= 0.03 ? o.h : 264
}

/** The field for a brand colour: its ground (what shows under the shapes), its shapes, and the ink that reads on it. */
export function composedField(accent?: string, o: { dark?: boolean; variant?: Composition; hue?: number } = {}): Field {
  const h = o.hue ?? fieldHue(accent)
  const variant = o.variant && COMPOSITIONS.includes(o.variant) ? o.variant : "diagonal"
  const tone = (r: Role) => {
    const t = TONES[r]
    return hex({ l: o.dark ? t.dl : t.l, c: o.dark ? t.dc : t.c, h: h + t.dh })
  }
  const blobs = LAYOUTS[variant].map(([role, x, y, rx, ry, rot, a]) => ({ role, x, y, rx, ry, rot, a, color: tone(role) }))
  const base = hex({ l: o.dark ? 0.2 : variant === "spot" ? 0.3 : 0.6, c: o.dark ? 0.09 : 0.17, h: h - 5 })
  // the titles sit in the middle, on the brand's mid tones: a cool near-white, a little see-through like the
  // reference's; the quiet line under it more so
  return { base, ink: hex({ l: 0.97, c: 0.015, h }), quiet: hex({ l: 0.88, c: 0.04, h }), blobs, variant }
}

/** Which composition an act sits in: the hook on the diagonal, the turn (the mark) in the spotlight, the proofs on
    the horizon and its mirror in turn, the call back on the diagonal, the end card in the spotlight. */
export function compositionFor(role: string, i: number, last: boolean): Composition {
  if (last) return "spot"
  if (role === "turn") return "spot"
  if (role === "proof") return i % 2 ? "mirror" : "horizon"
  return "diagonal"
}
