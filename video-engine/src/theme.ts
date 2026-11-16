// Theme matching: one colour in, a whole look out. The colour is the brand's, the app screen's own, a device's finish
// or a ground picked by hand. The look is the ground and its gradient, the light behind the device, the type's ink, an
// accent, the device's real finish and a case, chosen to belong together the way a launch film's frames do: Apple puts
// a Deep Blue phone on a deep blue sweep, a Desert Titanium one on sand, a black one in a dark room with one coloured
// light. Worked in OKLCH, so lightness and chroma mean what they look like; contrast is WCAG's, checked, not hoped for.
// Plain data and maths (no DOM): the Studio, the Canvas and the export all use it.
import type { DeviceId } from "./devices"
import type { Paint } from "./studio/paint"
import { FINISHES, type Finish } from "./studio/finishes.ts"

/* ---------------- colour ---------------- */

export type Lch = { l: number; c: number; h: number }
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** A CSS colour (#rgb, #rrggbb, rgb(), rgba()) as sRGB 0–1, or null. */
export function rgbOf(css: string): [number, number, number] | null {
  const s = css.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16) / 255) as [number, number, number]
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as [number, number, number]
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s)
  if (m) return [m[1], m[2], m[3]].map((x) => clamp(Number(x) / 255)) as [number, number, number]
  return null
}
const hex2 = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")
const toHexRgb = ([r, g, b]: number[]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

function toLab([r, g, b]: number[]) {
  const [R, G, B] = [r, g, b].map(lin)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromLab([L, a, b]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam)
}
export function lch(css: string): Lch {
  const rgb = rgbOf(css) ?? [0.5, 0.5, 0.5]
  const [L, a, b] = toLab(rgb)
  return { l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}
/** OKLCH to #rrggbb, its chroma lowered until it fits in sRGB (the hue and lightness kept). */
export function hex(o: Lch): string {
  const at = (c: number) => fromLab([clamp(o.l), c * Math.cos((o.h * Math.PI) / 180), c * Math.sin((o.h * Math.PI) / 180)])
  const fits = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)
  let c = Math.max(0, o.c)
  if (!fits(at(c))) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (fits(at(mid))) lo = mid
      else hi = mid
    }
    c = lo
  }
  return toHexRgb(at(c))
}
export const luminance = (css: string) => {
  const [r, g, b] = (rgbOf(css) ?? [0, 0, 0]).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** WCAG contrast, 1 to 21. */
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** The colour moved in lightness, as little as it takes, until it reads at `min` against `on`. */
export function readable(css: string, on: string, min: number): string {
  if (contrast(css, on) >= min) return css
  const o = lch(css)
  const up = luminance(on) < 0.25
  for (let i = 1; i <= 40; i++) {
    const c = hex({ ...o, l: clamp(o.l + (up ? 1 : -1) * i * 0.025) })
    if (contrast(c, on) >= min) return c
  }
  return up ? "#ffffff" : "#000000"
}
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** The colour of a palette that says the most about it: the most saturated one that isn't a near-grey, earlier ones
    (bigger, more used) winning ties. What an app screen's `describe` returns goes in; its accent comes out. */
export function accentOf(colors: string[]): string | null {
  let best: { css: string; score: number } | null = null
  colors.forEach((css, i) => {
    if (!rgbOf(css)) return
    const o = lch(css)
    if (o.c < 0.045 || o.l < 0.18 || o.l > 0.97) return
    const score = o.c * (1 - i * 0.06)
    if (!best || score > best.score) best = { css: hex(o), score }
  })
  return best ? (best as { css: string }).css : null
}

/** A palette's characterful colours, a few, each a different hue: what a screen offers to be matched to. */
export function accentsOf(colors: string[], max = 3): string[] {
  const out: Lch[] = []
  const scored = colors
    .map((css, i) => ({ o: rgbOf(css) ? lch(css) : null, i }))
    .filter((x): x is { o: Lch; i: number } => !!x.o && x.o.c >= 0.045 && x.o.l >= 0.18 && x.o.l <= 0.97)
    .sort((a, b) => b.o.c * (1 - b.i * 0.06) - a.o.c * (1 - a.i * 0.06))
  for (const { o } of scored) if (out.length < max && out.every((p) => hueGap(p.h, o.h) > 25)) out.push(o)
  return out.map(hex)
}

/* ---------------- looks ---------------- */

export type Harmony = "tonal" | "deep" | "light" | "pop" | "complement" | "analogous" | "studio"
export const HARMONIES: { id: Harmony; name: string; hint: string }[] = [
  { id: "tonal", name: "Tonal", hint: "Its own colour, deep: the device in a matching case, on a sweep of the same hue." },
  { id: "deep", name: "Night", hint: "A dark room and one coloured light behind the device: a keynote reveal." },
  { id: "light", name: "Paper", hint: "A warm, bright ground with a whisper of the colour; dark type." },
  { id: "pop", name: "Pop", hint: "The colour itself, saturated, edge to edge; the device in black or white against it." },
  { id: "complement", name: "Contrast", hint: "The opposite hue as the ground, so the colour (and the case) pops on it." },
  { id: "analogous", name: "Blend", hint: "A soft gradient through the hues either side of it, like a sunset or an aurora." },
  { id: "studio", name: "Studio", hint: "Neutral greys, the colour only as an accent: let the screen be the colour." },
]

export type Look = {
  harmony: Harmony
  /** the colour it was matched to */
  anchor: string
  dark: boolean
  /** the ground, and its gradient: the light behind the device, then a second, softer one */
  ground: string
  glow: string
  haze: string
  /** titles, and smaller type (kickers, captions) */
  ink: string
  muted: string
  accent: string
  /** the device's real finish that suits the ground, by device */
  finish: Partial<Record<DeviceId, string>>
  /** a case colour that belongs */
  case: string
}

/** Deterministic jitter, so "another" gives a new look and the same seed the same one. */
const jitter = (seed: number, i: number) => {
  const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453
  return x - Math.floor(x) - 0.5
}

/** The finish of `device` that suits a ground: "match" picks the one nearest the light's hue and lightness (a Desert
    phone on sand), "contrast" the one furthest from the ground in lightness (a white phone in a dark room). */
export function finishFor(device: DeviceId, ground: string, glow: string, how: "match" | "contrast"): Finish {
  const list = FINISHES[device]
  const g = lch(ground)
  const w = lch(glow)
  const score = (f: Finish) => {
    const m = lch(f.metal)
    if (how === "contrast") return -Math.abs(m.l - g.l)
    const hue = m.c > 0.02 && w.c > 0.02 ? hueGap(m.h, w.h) / 180 : 0.5
    return hue * 0.6 + Math.abs(m.l - w.l) * 0.8
  }
  return [...list].sort((a, b) => score(a) - score(b))[0]
}

/** One look for one harmony of the anchor colour. */
export function matchLook(anchor: string, harmony: Harmony, seed = 0): Look {
  const a0 = lch(hex(lch(anchor)))
  // a grey, a white or a black has no hue to speak of (its angle is noise): a cool neutral stands in, faintly
  const a = a0.c < 0.025 ? { l: a0.l, c: 0.03, h: 255 } : a0
  const h = (a.h + jitter(seed, 1) * 16 + 360) % 360
  const c = Math.max(0.04, a.c)
  const dl = jitter(seed, 2) * 0.05
  let ground: string, glow: string, haze: string, kase: string, accent: string
  let how: "match" | "contrast" = "match"
  switch (harmony) {
    case "tonal":
      ground = hex({ l: 0.22 + dl, c: Math.min(c, 0.09) * 0.75, h })
      glow = hex({ l: 0.56 + dl, c: Math.min(c, 0.16), h })
      haze = hex({ l: 0.34 + dl, c: Math.min(c, 0.12) * 0.7, h: h + 14 })
      kase = hex({ l: 0.6, c: Math.min(c, 0.13), h })
      accent = hex({ l: 0.8, c: Math.min(c, 0.14), h })
      break
    case "deep":
      ground = hex({ l: 0.13 + dl * 0.4, c: 0.018, h })
      glow = hex({ l: 0.5 + dl, c: Math.min(Math.max(c, 0.12), 0.2), h })
      haze = hex({ l: 0.24, c: 0.05, h: h - 24 })
      kase = hex({ l: 0.3, c: Math.min(c, 0.07), h })
      accent = hex({ l: 0.78, c: Math.min(c, 0.17), h })
      how = "contrast"
      break
    case "light":
      ground = hex({ l: 0.965 + dl * 0.2, c: Math.min(c, 0.018), h })
      glow = hex({ l: 0.9, c: Math.min(c, 0.06), h })
      haze = hex({ l: 0.93, c: Math.min(c, 0.04), h: h + 30 })
      kase = hex({ l: 0.8, c: Math.min(c, 0.07), h })
      accent = hex({ l: 0.55, c: Math.min(c, 0.18), h })
      break
    case "pop":
      ground = hex({ l: 0.64 + dl, c: Math.max(c, 0.16), h })
      glow = hex({ l: 0.8, c: Math.max(c, 0.12) * 0.8, h: h + 18 })
      haze = hex({ l: 0.52, c: Math.max(c, 0.14), h: h - 14 })
      kase = hex({ l: 0.32, c: Math.min(c, 0.1), h })
      accent = hex({ l: 0.95, c: 0.03, h })
      how = "contrast"
      break
    case "complement":
      ground = hex({ l: 0.24 + dl, c: Math.min(c, 0.08) * 0.8, h: h + 180 })
      glow = hex({ l: 0.5, c: Math.min(c, 0.12), h: h + 180 })
      haze = hex({ l: 0.62, c: Math.min(c, 0.16), h })
      kase = hex({ l: 0.66, c: Math.min(Math.max(c, 0.12), 0.18), h })
      accent = hex({ l: 0.74, c: Math.min(Math.max(c, 0.12), 0.18), h })
      how = "contrast"
      break
    case "analogous":
      ground = hex({ l: 0.93 + dl * 0.3, c: Math.min(c, 0.04), h: h - 30 })
      glow = hex({ l: 0.8, c: Math.min(c, 0.12), h: h + 28 })
      haze = hex({ l: 0.82, c: Math.min(c, 0.11), h: h - 34 })
      kase = hex({ l: 0.68, c: Math.min(c, 0.12), h: h + 28 })
      accent = hex({ l: 0.5, c: Math.min(c, 0.17), h })
      break
    default:
      ground = hex({ l: 0.94 + dl * 0.3, c: 0.004, h })
      glow = "#ffffff"
      haze = hex({ l: 0.86, c: 0.006, h })
      kase = hex({ l: 0.24, c: 0.01, h })
      accent = hex({ l: 0.55, c: Math.min(c, 0.18), h })
      how = "contrast"
  }
  // the type is near white or near black, whichever reads better; a ground between the two that neither reads on
  // (a mid orange) moves, as little as it takes, until one does
  let g = lch(ground)
  for (let i = 0; i < 24 && Math.max(contrast("#ffffff", hex(g)), contrast("#141414", hex(g))) < 7.5; i++) g = { ...g, l: g.l + (g.l > 0.6 ? 0.02 : -0.02) }
  ground = hex(g)
  const dark = contrast("#ffffff", ground) > contrast("#141414", ground)
  const ink = readable(dark ? hex({ l: 0.985, c: 0.008, h }) : hex({ l: 0.2, c: 0.015, h }), ground, 7)
  const muted = readable(dark ? hex({ l: 0.78, c: 0.02, h }) : hex({ l: 0.48, c: 0.02, h }), ground, 4.5)
  const finish = Object.fromEntries((Object.keys(FINISHES) as DeviceId[]).map((d) => [d, finishFor(d, ground, glow, how).id]))
  return { harmony, anchor: hex(a0), dark, ground, glow, haze, ink, muted, accent: readable(accent, ground, 3), finish, case: kase }
}

/** Every harmony of one colour, for a row to pick from. */
export const looksFor = (anchor: string, seed = 0) => HARMONIES.map((x) => matchLook(anchor, x.id, seed))

const rid = () => Math.random().toString(36).slice(2, 9)
/** A look's ground as paints (Figma's fills, the engine's paint stack): the ground, the light behind where the device
    stands (`at`, fractions of the frame), and a second softer light across from it. In a video they drift slowly. */
export function groundPaints(look: Look, at = { x: 0.62, y: 0.42 }, drift = true): Paint[] {
  const solid: Paint = { id: rid(), kind: "solid", stops: [{ at: 0, color: look.ground, alpha: 1 }], from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 }, ratio: 1, opacity: 1, blend: "normal" }
  const light: Paint = {
    id: rid(),
    kind: "radial",
    stops: [
      { at: 0, color: look.glow, alpha: look.dark ? 0.85 : 0.9 },
      { at: 1, color: look.glow, alpha: 0 },
    ],
    from: at,
    to: { x: at.x + 0.46, y: at.y },
    ratio: 0.9,
    opacity: 1,
    blend: "normal",
    ...(drift ? { drift: { kind: "orbit" as const, period: 12, amount: 0.35 } } : {}),
  }
  const away = { x: at.x > 0.5 ? 0.12 : 0.88, y: Math.min(0.92, at.y + 0.4) }
  const haze: Paint = {
    id: rid(),
    kind: "radial",
    stops: [
      { at: 0, color: look.haze, alpha: 0.75 },
      { at: 1, color: look.haze, alpha: 0 },
    ],
    from: away,
    to: { x: away.x + 0.55, y: away.y },
    ratio: 0.7,
    opacity: 1,
    blend: "normal",
    ...(drift ? { drift: { kind: "wave" as const, period: 16, amount: 0.3 } } : {}),
  }
  return [solid, haze, light]
}
