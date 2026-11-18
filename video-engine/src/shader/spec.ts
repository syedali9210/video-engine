// What a shader video is made of, as plain data: a spec renders the same on every frame of every machine (each frame
// is a function of its time), so the page that previews it is the page that exports it. Four kinds:
//   gradient  ShaderGradient's look (github.com/ruucm/shadergradient, MIT): a plane, a sphere or water, folded by noise,
//             coloured by where the folds go
//   shape     a gradient laid on 3D forms (stacked slabs, glass discs, pills, an orb, a ring, bento tiles), placed by
//             side, angle and density, and moved (stacking, twisting, turning, breathing); the rules are in SHADERS.md
//   liquid    a logo or a word filled with liquid metal (github.com/collidingScopes/liquid-logo, MIT), flowing along
//             its own contours
//   scene     React Three Fiber scenes: a showroom, a prism, floating candy
// Every video loops: time runs once round a circle, so the last frame runs into the first.
import { hex, lch } from "../theme"

type Base = {
  name: string
  /** seconds in one loop */
  duration: number
  /** the ground; "" is transparent (a ProRes with alpha) */
  bg: string
  /** film grain, 0 to 0.2 */
  grain: number
}
export type Vec3 = [number, number, number]

export type GradientSpec = Base & {
  kind: "gradient"
  mesh: "plane" | "sphere" | "water"
  colors: [string, string, string]
  /** how close the folds are, how deep they go, how fast they move */
  density: number
  strength: number
  speed: number
  /** the sphere's twist: how many turns along it and how far */
  frequency: number
  amplitude: number
  brightness: number
  /** 0: lit flat, the way ShaderGradient is; 1: the folds shaded by a key light */
  light: number
  /** the camera: around (°), down from above (°), how far, how close the lens */
  cam: { az: number; polar: number; dist: number; zoom: number }
  pos: Vec3
  rot: Vec3
  /** degrees the camera sways each way over the loop */
  orbit: number
}

export type ShapeForm = "slabs" | "discs" | "pills" | "orb" | "ring" | "tiles"
/** where the gradient runs: through the stack (each piece a step of it), across each piece at `angle`, out from the
    centre, by how a face turns from the camera (rims and glass), or round the piece like a clock hand */
export type ShapeAxis = "stack" | "across" | "radial" | "facing" | "around"
export type ShapeMotion = "stack" | "twist" | "turn" | "breathe" | "float" | "fan"
export type ShapeSpec = Base & {
  kind: "shape"
  form: ShapeForm
  /** pieces in the stack (or tiles) */
  count: number
  /** the space between pieces, as a share of a piece's thickness */
  gap: number
  /** corner rounding, 0 to 1 */
  round: number
  /** the ramp, 2 to 5 colours, darkest usually first */
  colors: string[]
  axis: ShapeAxis
  /** degrees: the direction `across` runs in (0 left to right, 90 front to back) */
  angle: number
  /** how many times the ramp runs over its span */
  density: number
  /** which faces carry it; the others take `base` */
  faces: "all" | "top" | "sides"
  base: string
  /** the gradient warped by noise (0 straight bands … 1 marbled), and how fast that moves */
  flow: number
  speed: number
  /** 0 solid … 1 glass (see-through, lit at the rims) */
  glass: number
  /** light the shapes give off, and the glow under them (a colour; "" none) */
  glow: number
  under: string
  motion: ShapeMotion
  /** the camera's height (° above the floor) and how far */
  tilt: number
  dist: number
  /** turns over one loop (turn, twist) */
  spin: number
}

export type LiquidSpec = Base & {
  kind: "liquid"
  /** a word set in a heavy face, a built-in mark, or a picture (its alpha is the shape) */
  logo: { type: "text"; text: string } | { type: "mark"; mark: Mark } | { type: "image"; src: string }
  /** the logo's height as a share of the frame */
  size: number
  speed: number
  iterations: number
  scale: number
  dot: number
  dotMul: number
  vOffset: number
  intensity: number
  exp: number
  noise: number
  rgb: Vec3
  shift: number
  /** how hard the flow bends at the logo's edge (liquid-logo's own), how far into the logo its contours carry the flow,
      and the bevel of light along the edge */
  edge: number
  contour: number
  rim: number
}
export type Mark = "sparkle" | "drop" | "ring" | "bolt"

export type SceneSpec = Base & {
  kind: "scene"
  scene: "showroom" | "prism" | "candy"
  colors: string[]
  speed: number
}

export type ShaderSpec = GradientSpec | ShapeSpec | LiquidSpec | SceneSpec
export type ShaderKind = ShaderSpec["kind"]
export const KINDS: { id: ShaderKind; name: string; hint: string }[] = [
  { id: "gradient", name: "Gradients", hint: "Folded colour in motion: planes, water and spheres of light" },
  { id: "shape", name: "Shapes", hint: "A gradient laid on 3D forms: stacks, glass discs, tiles" },
  { id: "liquid", name: "Liquid logo", hint: "Your logo or a word, filled with flowing liquid metal" },
  { id: "scene", name: "3D scenes", hint: "React Three Fiber scenes: a showroom, a prism, floating candy" },
]

/* ---------------- presets ---------------- */

const G = (name: string, o: Partial<GradientSpec> & Pick<GradientSpec, "mesh" | "colors">): GradientSpec => ({
  kind: "gradient",
  name,
  duration: 10,
  bg: "#000000",
  grain: 0,
  density: 1.2,
  strength: 3,
  speed: 0.3,
  frequency: 5.5,
  amplitude: 0,
  brightness: 1.2,
  light: 0,
  cam: { az: 180, polar: 90, dist: 3.6, zoom: 1 },
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  orbit: 0,
  ...o,
})
const sphereCam = (az: number, polar: number, zoom: number) => ({ az, polar, dist: 14, zoom })

export const GRADIENT_PRESETS: GradientSpec[] = [
  // ShaderGradient's own presets, their numbers kept
  G("Halo", { mesh: "plane", colors: ["#ff5005", "#dbba95", "#d0bce1"], density: 1.3, strength: 4, speed: 0.4, amplitude: 1, brightness: 1.2, cam: { az: 180, polar: 90, dist: 3.6, zoom: 1 }, pos: [-1.4, 0, 0], rot: [0, 10, 50], grain: 0.07 }),
  G("Pensive", { mesh: "sphere", colors: ["#809bd6", "#910aff", "#af38ff"], density: 0.8, strength: 0.4, speed: 0.3, amplitude: 7, brightness: 1.5, cam: sphereCam(250, 140, 12.5), rot: [0, 0, 140], grain: 0.07 }),
  G("Mint", { mesh: "water", colors: ["#94ffd1", "#6bf5ff", "#ffffff"], density: 1.2, strength: 3.4, speed: 0.2, brightness: 1.2, cam: { az: 170, polar: 70, dist: 4.4, zoom: 1 }, pos: [0, 0.9, -0.3], rot: [45, 0, 0] }),
  G("Nighty night", { mesh: "water", colors: ["#606080", "#8d7dca", "#212121"], density: 1.5, strength: 1.5, speed: 0.3, brightness: 1, cam: { az: 180, polar: 80, dist: 2.8, zoom: 1 }, rot: [50, 0, -60], grain: 0.07 }),
  G("Viola", { mesh: "sphere", colors: ["#ffffff", "#ffbb00", "#0700ff"], density: 1.1, strength: 1, speed: 0.1, amplitude: 1.4, brightness: 1.1, cam: sphereCam(0, 140, 17.3) }),
  G("Universe", { mesh: "water", colors: ["#5606ff", "#fe8989", "#000000"], density: 1.1, strength: 2.4, speed: 0.1, brightness: 1.1, cam: { az: 180, polar: 115, dist: 3.9, zoom: 1 }, pos: [-0.5, 0.1, 0], rot: [0, 0, 235] }),
  G("Sunset", { mesh: "sphere", colors: ["#ff7a33", "#33a0ff", "#ffc53d"], density: 1.1, strength: 0.4, speed: 0.1, amplitude: 1.4, brightness: 1.5, cam: sphereCam(60, 90, 15.3), pos: [0, -0.15, 0] }),
  G("Mandarin", { mesh: "water", colors: ["#ff6a1a", "#c73c00", "#fd4912"], density: 1.8, strength: 3, speed: 0.2, brightness: 1.2, cam: { az: 180, polar: 95, dist: 2.4, zoom: 1 }, pos: [0, -2.1, 0], rot: [0, 0, 225] }),
  G("Cotton candy", { mesh: "water", colors: ["#ebedff", "#f3f2f8", "#dbf8ff"], density: 1, strength: 3, speed: 0.3, brightness: 1.2, cam: { az: 180, polar: 120, dist: 2.9, zoom: 1 }, pos: [0, 1.8, 0], rot: [0, 0, -90] }),
  // grainy colour fields: one hue, a deep and a lit side, heavy grain (the orange, ultramarine, butter, rust and
  // lagoon cards Syed sent, 2026-11-18)
  G("Ember", { mesh: "water", colors: ["#ff5a00", "#e22a00", "#ffae5c"], density: 0.75, strength: 1.5, speed: 0.22, brightness: 1.08, cam: { az: 180, polar: 100, dist: 2.6, zoom: 1 }, rot: [0, 0, 200], grain: 0.1 }),
  G("Ultramarine", { mesh: "water", colors: ["#3c2ff0", "#120e5c", "#7a6dff"], density: 0.7, strength: 1.4, speed: 0.18, brightness: 1, cam: { az: 180, polar: 108, dist: 3, zoom: 1 }, rot: [0, 0, 140], grain: 0.11 }),
  G("Butter", { mesh: "water", colors: ["#f4e2ad", "#e3c47f", "#fff8e2"], density: 0.7, strength: 1.4, speed: 0.2, brightness: 1.02, cam: { az: 180, polar: 104, dist: 3.2, zoom: 1 }, rot: [0, 0, -60], grain: 0.08 }),
  G("Rust", { mesh: "water", colors: ["#c8561e", "#7a2f10", "#e88446"], density: 0.8, strength: 1.5, speed: 0.2, brightness: 1.05, cam: { az: 180, polar: 98, dist: 2.7, zoom: 1 }, rot: [0, 0, 160], grain: 0.1 }),
  G("Lagoon", { mesh: "water", colors: ["#2fdcbd", "#14a596", "#ecfff9"], density: 0.75, strength: 1.6, speed: 0.2, brightness: 1.05, cam: { az: 180, polar: 104, dist: 2.9, zoom: 1 }, rot: [0, 0, -120], grain: 0.08 }),
]

const S = (name: string, o: Partial<ShapeSpec> & Pick<ShapeSpec, "form" | "colors">): ShapeSpec => ({
  kind: "shape",
  name,
  duration: 8,
  bg: "#050506",
  grain: 0.05,
  count: 4,
  gap: 0.35,
  round: 0.3,
  axis: "across",
  angle: 45,
  density: 1,
  faces: "all",
  base: "#101012",
  flow: 0.3,
  speed: 0.25,
  glass: 0,
  glow: 0,
  under: "",
  motion: "turn",
  tilt: 28,
  dist: 7,
  spin: 0.25,
  ...o,
})

export const SHAPE_PRESETS: ShapeSpec[] = [
  // the green stack: rounded slabs, the ramp diagonal across every top, the sides deep, each slab turned a little more
  S("Green stack", { form: "slabs", count: 5, gap: 0.42, round: 0.32, colors: ["#04473f", "#0f9b78", "#3fe08f", "#c8f56a", "#f5ffc4"], axis: "across", angle: 40, density: 1, faces: "all", base: "#06362f", flow: 0.35, motion: "twist", spin: 0.12, tilt: 30, dist: 10.5, bg: "#030605" }),
  // the glass discs: three see-through discs, lit at the rims, a warm light under them
  S("Glass discs", { form: "discs", count: 3, gap: 0.9, round: 1, colors: ["#5a1bff", "#c04dff", "#ff6fd8", "#ffe0f6"], axis: "facing", density: 1, glass: 0.85, glow: 0.75, under: "#ff6a2a", flow: 0.4, motion: "breathe", tilt: 22, dist: 6.4, bg: "#05040a" }),
  S("Bento tiles", { form: "tiles", count: 5, round: 0.5, colors: ["#ff4d0a", "#2a1fc4", "#f1dcaa", "#b8501f", "#36e3c0"], axis: "across", angle: 70, density: 1, flow: 0.55, speed: 0.2, motion: "float", tilt: 0, dist: 9.6, grain: 0.11, bg: "#000000" }),
  S("Pill stack", { form: "pills", count: 5, gap: 0.25, colors: ["#ff8a00", "#ff3d6e", "#9b4dff", "#3d7bff", "#25d0ff"], axis: "stack", density: 1, flow: 0.2, motion: "stack", tilt: 24, dist: 9.5, bg: "#f2efe9", grain: 0.04 }),
  S("Chrome orb", { form: "orb", count: 1, colors: ["#0e1a2f", "#3b6cff", "#9fd2ff", "#ffffff"], axis: "across", angle: 35, density: 1.2, flow: 0.7, speed: 0.3, motion: "turn", tilt: 12, dist: 5, bg: "#04060b" }),
  S("Halo ring", { form: "ring", count: 1, colors: ["#ff2e63", "#ff9a3c", "#ffe66d", "#ff2e63"], axis: "around", density: 1, flow: 0.25, speed: 0.3, glow: 0.4, motion: "turn", tilt: 34, dist: 6, bg: "#080406" }),
  S("Fanned slabs", { form: "slabs", count: 6, gap: 0.3, round: 0.4, colors: ["#1a1446", "#4c3bff", "#9d8cff", "#e9e4ff"], axis: "stack", density: 1, faces: "all", base: "#120f2e", flow: 0.2, motion: "fan", tilt: 34, dist: 9.5, bg: "#efeef6", grain: 0.04 }),
]

const L = (name: string, o: Partial<LiquidSpec> & Pick<LiquidSpec, "speed" | "iterations" | "scale" | "dot" | "dotMul" | "vOffset" | "intensity" | "exp" | "rgb" | "shift" | "edge">): LiquidSpec => ({
  kind: "liquid",
  name,
  duration: 8,
  bg: "#000000",
  grain: 0.05,
  logo: { type: "mark", mark: "sparkle" },
  size: 0.7,
  // liquid-logo's own default (a preset without it keeps 4)
  noise: 4,
  contour: 0.6,
  rim: 0.35,
  ...o,
})

// liquid-logo's presets, their numbers kept (contour and rim are this engine's: how far the shape bends the flow)
export const LIQUID_PRESETS: LiquidSpec[] = [
  L("Chrome", { speed: 0.4, iterations: 15, scale: 3.12, dot: 0.04, dotMul: 0.21, vOffset: 5.1, intensity: 0.07, exp: 0.2, rgb: [1.1, 0.7, 0.9], shift: 0.9, edge: 0.4, logo: { type: "mark", mark: "drop" } }),
  L("Oil slick", { speed: 0.67, iterations: 8, scale: 0.22, dot: 0.15, dotMul: 0.79, vOffset: 6.3, intensity: 0.2, exp: 0.1, rgb: [-0.9, -1.9, -0.2], shift: 2, edge: 0.35, logo: { type: "mark", mark: "ring" } }),
  L("Glow", { speed: 0.34, iterations: 15, scale: 3.11, dot: 0.66, dotMul: 0.36, vOffset: 6, intensity: 0.1, exp: 1.8, rgb: [0.2, 0, -0.2], shift: 0.5, edge: 0.66, logo: { type: "mark", mark: "sparkle" } }),
  L("Rainbow", { speed: 0.56, iterations: 11, scale: 1.2, dot: 0.699, dotMul: 0.56, vOffset: 6.1, intensity: 0.258, exp: 3, rgb: [-0.2, 1.1, -1.7], shift: 0, edge: 0.38, logo: { type: "text", text: "S" } }),
  L("Liquid", { speed: 0.33, iterations: 14, scale: 1.49, dot: 0.03, dotMul: 0.66, vOffset: 0.1, intensity: 0.07, exp: 3.5, rgb: [-1.2, 0.6, 0.6], shift: 0.2, edge: 0.39, logo: { type: "mark", mark: "bolt" } }),
  L("Magic", { speed: 0.5, iterations: 5, scale: 1.05, dot: 0.269, dotMul: 0.79, vOffset: 6.5, intensity: 0.315, exp: 4, noise: 1.7, rgb: [-0.1, 1.9, 0.2], shift: 0.3, edge: 0.5, logo: { type: "mark", mark: "ring" } }),
  L("Dusk", { speed: 0.45, iterations: 15, scale: 2.8, dot: 0.02, dotMul: 0.56, vOffset: 6.1, intensity: 0.2, exp: 0.5, rgb: [1.9, 0.3, 0.4], shift: 0.9, edge: 0.52, logo: { type: "text", text: "D" } }),
  L("Galaxy", { speed: 0.44, iterations: 8, scale: 2.63, dot: 0.03, dotMul: 0.61, vOffset: 0, intensity: 0.37, exp: 0.5, rgb: [1, -0.3, 1.6], shift: 0.1, edge: 0.1, logo: { type: "mark", mark: "sparkle" } }),
  L("Smoke", { speed: 1.42, iterations: 6, scale: 0.17, dot: 0.27, dotMul: 0, vOffset: 4.8, intensity: 0.16, exp: 4.9, rgb: [-0.4, -0.3, 0.1], shift: 0, edge: 0.25, logo: { type: "mark", mark: "drop" } }),
  L("Wisp", { speed: 0.7, iterations: 11, scale: 0.112, dot: 0.28, dotMul: 0, vOffset: 0, intensity: 0.12, exp: 0.1, rgb: [1.5, 1.1, 1], shift: 0.8, edge: 0.5, logo: { type: "text", text: "W" } }),
]

const R = (name: string, scene: SceneSpec["scene"], colors: string[], bg: string): SceneSpec => ({ kind: "scene", name, scene, colors, speed: 1, duration: 8, bg, grain: 0.03 })
export const SCENE_PRESETS: SceneSpec[] = [
  R("Showroom", "showroom", ["#16161a", "#ffffff", "#7aa2ff"], "#020203"),
  R("Prism", "prism", ["#ffffff"], "#000000"),
  R("Candy", "candy", ["#ff8fc8", "#ffd36e", "#8fd4ff", "#b69bff", "#ff6f8f"], "#ffd9ea"),
]

export const PRESETS: Record<ShaderKind, ShaderSpec[]> = { gradient: GRADIENT_PRESETS, shape: SHAPE_PRESETS, liquid: LIQUID_PRESETS, scene: SCENE_PRESETS }

/* ---------------- the generator: good gradients by rule, not at random ---------------- */

/** A seeded random (mulberry32): the same seed makes the same video. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, range: (a: number, b: number) => a + (b - a) * next(), pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)] }
}
type Rng = ReturnType<typeof rng>
const H = (l: number, c: number, h: number) => hex({ l, c, h: ((h % 360) + 360) % 360 })

export type Mood = "any" | "warm" | "cool" | "pastel" | "dark" | "vivid" | "mono"
export const MOODS: { id: Mood; name: string }[] = [
  { id: "any", name: "Any" },
  { id: "warm", name: "Warm" },
  { id: "cool", name: "Cool" },
  { id: "vivid", name: "Vivid" },
  { id: "pastel", name: "Pastel" },
  { id: "dark", name: "Dark" },
  { id: "mono", name: "One hue" },
]

/** The families of palette that work, each as lightness / chroma / hue offsets from one hue (OKLCH). Learned from the
    references: one dominant hue, neighbours within ~80° so mixes never pass through grey, one lit stop, and a
    complementary hue only where it shows as a highlight (the third colour lands on the folds' peaks). */
const FAMILIES: Record<"mono" | "analogous" | "pastel" | "night" | "pop", (h: number, r: Rng) => string[]> = {
  mono: (h, r) => [H(0.64, 0.2, h), H(r.range(0.42, 0.5), 0.18, h + 8), H(0.82, 0.12, h - 14), H(0.3, 0.12, h + 4), H(0.92, 0.06, h - 20)],
  analogous: (h, r) => { const d = r.range(28, 42); return [H(0.68, 0.17, h), H(0.72, 0.13, h + d), H(0.86, 0.08, h + 2 * d), H(0.45, 0.15, h - d / 2), H(0.94, 0.04, h + d)] },
  pastel: (h, r) => { const d = r.range(25, 55); return [H(0.92, 0.06, h), H(0.95, 0.035, h + d), H(0.9, 0.075, h - d), H(0.8, 0.09, h), H(0.98, 0.015, h)] },
  night: (h, r) => [H(0.34, 0.13, h), H(r.range(0.5, 0.6), 0.18, h + 22), H(0.1, 0.025, h), H(0.2, 0.08, h - 15), H(0.75, 0.12, h + 30)],
  pop: (h, r) => [H(0.97, 0.012, h), H(0.8, 0.17, h), H(0.45, 0.24, h + r.range(160, 200)), H(0.6, 0.2, h + 20), H(0.3, 0.15, h + 180)],
}
const familiesFor = (m: Mood): (keyof typeof FAMILIES)[] =>
  m === "pastel" ? ["pastel"] : m === "dark" ? ["night"] : m === "mono" ? ["mono"] : m === "vivid" ? ["mono", "analogous", "pop"] : ["mono", "analogous", "pastel", "night", "pop"]
const hueFor = (m: Mood, r: Rng) => (m === "warm" ? r.range(15, 75) : m === "cool" ? r.range(180, 290) : r.range(0, 360))

/** Mixing two colours in sRGB (as the gradient shader does): is the middle as colourful as the ends, or does it go
    grey? A palette whose first two colours mix muddy is thrown away. */
export function muddy(a: string, b: string) {
  const x = lch(a), y = lch(b)
  const mid = lch(`#${[1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0")).join("")}`)
  return Math.min(x.c, y.c) > 0.06 && mid.c < 0.55 * ((x.c + y.c) / 2)
}

/** The palette for a mood (or from a brand colour), checked: not muddy, not flat. */
export function palette(seed: number, mood: Mood = "any", brand?: string): string[] {
  const r = rng(seed)
  for (let tries = 0; tries < 24; tries++) {
    let fam = r.pick(familiesFor(mood))
    let h = hueFor(mood, r)
    if (brand && /^#[0-9a-f]{6}$/i.test(brand)) {
      const b = lch(brand)
      h = b.h
      // a pale brand colour makes pastels, a deep one a night, a vivid one its own hue
      if (mood === "any") fam = b.l > 0.86 ? "pastel" : b.l < 0.35 ? "night" : b.c > 0.12 ? r.pick(["mono", "analogous"] as const) : "pastel"
    }
    const p = FAMILIES[fam](h, r)
    const ls = p.slice(0, 3).map((c) => lch(c).l)
    const spread = Math.max(...ls) - Math.min(...ls)
    if (muddy(p[0], p[1])) continue
    if (fam !== "pastel" && spread < 0.1) continue
    if (spread > 0.8) continue
    return p
  }
  return GRADIENT_PRESETS[0].colors.slice()
}

/** The framings that work, ShaderGradient's own: water filling the frame, the halo plane across it, a sphere seen
    close. Each with the ranges its numbers looked good in. */
const FRAMINGS: ((r: Rng) => Partial<GradientSpec>)[] = [
  (r) => ({ mesh: "water", density: r.range(1.05, 1.8), strength: r.range(1.6, 3.4), speed: r.range(0.15, 0.3), cam: { az: 180, polar: r.range(92, 118), dist: r.range(2.4, 3.6), zoom: 1 }, pos: [0, r.range(-1.6, 1.6), 0], rot: [0, 0, r.range(0, 360)] }),
  (r) => ({ mesh: "water", density: r.range(1.2, 1.6), strength: r.range(1.4, 2.2), speed: r.range(0.2, 0.32), cam: { az: 180, polar: r.range(70, 85), dist: r.range(2.6, 4.2), zoom: 1 }, rot: [r.range(35, 55), 0, r.range(-90, 0)] }),
  (r) => ({ mesh: "plane", density: r.range(1.1, 1.5), strength: r.range(3.2, 4.2), speed: r.range(0.3, 0.45), amplitude: 1, cam: { az: 180, polar: 90, dist: r.range(3.2, 4), zoom: 1 }, pos: [r.range(-1.6, -0.8), 0, 0], rot: [0, r.range(0, 15), r.range(35, 60)] }),
  (r) => ({ mesh: "sphere", density: r.range(0.8, 1.1), strength: r.range(0.3, 0.45), speed: r.range(0.1, 0.3), amplitude: r.range(1.4, 6), frequency: 5.5, cam: { az: r.range(0, 360), polar: r.range(90, 150), dist: 14, zoom: r.range(9, 16) }, rot: [0, 0, r.range(0, 360)] }),
]

/** A new gradient by the rules: a checked palette, a framing that works, grain on most. */
export function makeGradient(seed: number, mood: Mood = "any", brand?: string): GradientSpec {
  const r = rng(seed * 7919 + 13)
  const p = palette(seed, mood, brand)
  const frame = r.pick(FRAMINGS)(r)
  const dark = lch(p[0]).l < 0.4
  return G(`Gradient ${seed % 1000}`, { mesh: "water", colors: [p[0], p[1], p[2]], brightness: dark ? 1.1 : r.range(1.0, 1.15), grain: r.next() < 0.75 ? r.range(0.05, 0.1) : 0, light: r.next() < 0.3 ? 0.3 : 0, orbit: r.next() < 0.4 ? r.range(4, 10) : 0, ...frame })
}

/** The placements that work on each form (SHADERS.md has the why): where the ramp runs, its angle, its density, which
    faces carry it, and the motion that suits the form. */
const PLACEMENTS: ((r: Rng) => Partial<ShapeSpec> & Pick<ShapeSpec, "form">)[] = [
  (r) => ({ form: "slabs", count: Math.round(r.range(4, 6)), gap: r.range(0.32, 0.5), round: r.range(0.25, 0.45), axis: "across", angle: r.range(30, 55), density: 1, faces: "all", flow: r.range(0.25, 0.45), motion: r.pick(["twist", "stack", "turn"] as const), spin: 0.12, tilt: r.range(24, 34), dist: r.range(10, 11) }),
  (r) => ({ form: "slabs", count: Math.round(r.range(5, 7)), gap: r.range(0.25, 0.35), round: r.range(0.35, 0.5), axis: "stack", density: 1, faces: "top", flow: 0.2, motion: r.pick(["fan", "stack"] as const), tilt: r.range(30, 40), dist: 10.5 }),
  (r) => ({ form: "discs", count: 3, gap: r.range(0.7, 1), axis: "facing", density: 1, glass: r.range(0.75, 0.9), glow: r.range(0.6, 0.85), flow: 0.4, motion: "breathe", tilt: r.range(18, 26), dist: 6.4 }),
  (r) => ({ form: "pills", count: Math.round(r.range(4, 6)), gap: 0.25, axis: "stack", density: 1, flow: 0.2, motion: r.pick(["stack", "float"] as const), tilt: 24, dist: 9.5 }),
  (r) => ({ form: "orb", count: 1, axis: r.pick(["radial", "facing"] as const), density: r.range(1, 1.4), flow: r.range(0.5, 0.8), motion: "turn", tilt: 12, dist: 5 }),
  (r) => ({ form: "ring", count: 1, axis: "around", density: 1, flow: 0.25, glow: r.range(0.2, 0.5), motion: "turn", tilt: r.range(28, 40), dist: 6 }),
]

/** A new shape video by the rules: a placement that works for its form, a ramp from a checked palette, a ground that
    sets it off (deep under vivid, paper under deep). */
export function makeShape(seed: number, mood: Mood = "any", brand?: string): ShapeSpec {
  const r = rng(seed * 104729 + 7)
  const p = palette(seed, mood, brand)
  const place = r.pick(PLACEMENTS)(r)
  // the ramp darkest to lightest, so `stack` and `across` read as light falling on it
  const ramp = [...p].sort((a, b) => lch(a).l - lch(b).l).slice(0, place.form === "discs" ? 4 : 5)
  const deep = lch(ramp[0])
  const light = r.next() < 0.3 && deep.l < 0.5
  return S(`Shape ${seed % 1000}`, {
    colors: ramp,
    base: hex({ l: Math.max(0.12, deep.l * 0.8), c: deep.c * 0.8, h: deep.h }),
    bg: light ? hex({ l: 0.95, c: 0.01, h: deep.h }) : hex({ l: 0.06, c: 0.015, h: deep.h }),
    under: place.form === "discs" ? hex({ l: 0.7, c: 0.18, h: deep.h + 160 }) : "",
    ...place,
  })
}

export function generate(kind: ShaderKind, seed: number, mood: Mood = "any", brand?: string): ShaderSpec {
  if (kind === "gradient") return makeGradient(seed, mood, brand)
  if (kind === "shape") return makeShape(seed, mood, brand)
  // liquid and scenes: a preset, its colours from the palette where it has any
  const r = rng(seed)
  const base = r.pick(PRESETS[kind])
  if (base.kind === "scene" && base.scene === "candy") return { ...base, colors: palette(seed, mood, brand).slice(0, base.colors.length) }
  return { ...base }
}

/** The same spec always makes the same key (the render cache's name for it). */
export const specKey = (s: ShaderSpec) => JSON.stringify(s, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))
