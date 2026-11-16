// Canvas — animated raster effects: a moving field (a flow, waves, rings, an orb, a beam of light, or a picture) drawn
// as cells on a grid (pixels, halftone dots, cross-stitches, characters, scanlines, glowing blocks), in a palette, with
// glow, grain and a fade; or a scene drawn whole (a sky over the sea, a painted coast, 1970s swirls, circles, Bauhaus
// tiles, a tunnel of light, blocks of stepped colour); either one on a CRT's curved glass or on paper. The look of
// dithered posters, ASCII heroes, halftone prints and old televisions, alive. The runtime (public/canvas.js)
// draws them on the GPU; this is their data, the presets they start from, and the check on anything that claims to be
// one (the template lab's proposals pass through it). Plain data and no DOM: the dev server runs this too.

export type EffectSource = "flow" | "waves" | "rings" | "orb" | "picture" | "clouds" | "beam" | "cumulus" | "horizon" | "coast" | "swirl" | "circles" | "tiles" | "tunnel" | "blocks"
export type EffectCell = "pixel" | "dot" | "cross" | "char" | "line" | "block" | "smooth"
export type EffectFade = "none" | "bottom" | "top" | "edges" | "radial"
export type Effect = {
  /** what moves under the grid */
  source: EffectSource
  /** for source "picture": the picture (data: or https:), drifting slowly */
  picture?: string
  /** what each cell draws */
  cell: EffectCell
  /** for cell "char": the characters, lightest to densest */
  chars?: string
  /** a cell's size in the frame's pixels */
  size: number
  /** the share of each cell left empty, 0–0.9 */
  gap: number
  /** how much the field sizes the shapes: 0 every shape the same, 1 halftone (dense places, big shapes) */
  sizeBy: number
  /** 0 smooth; 1 ordered two-tone dither, every shape on or off */
  dither: number
  /** soft edges, 0–1 (blocks that glow, dots that bleed) */
  soft: number
  /** the field's contrast (0.2–3) and its level (−1 to 1: less or more ink) */
  contrast: number
  level: number
  invert?: boolean
  /** how big the field's shapes are (0.2–5), how fast it moves (0 still, to 3), which way (degrees) */
  scale: number
  speed: number
  angle: number
  /** the ground, then one to three inks the field runs through ("transparent" ground: the frame shows through) */
  colors: string[]
  /** for a picture: each cell takes the picture's own colour */
  tint?: boolean
  /** for a picture: the picture itself, soft, under the cells, 0–1 (characters over a blurred photo) */
  under?: number
  /** soft light from the field behind the cells, 0–1; film grain, 0–1 */
  glow: number
  grain: number
  /** where it fades into its ground */
  fade: EffectFade
  /** a different field, same settings */
  seed: number
  /** a CRT, 0–1: the glass bulging inside its bezel, a phosphor mask and scanlines, its falloff to the edges */
  screen?: number
  /** paper, 0–1: fibres and blotches that stay still under the ink */
  paper?: number
}
/** A named effect: what the gallery shows, and what the template lab proposes and improves. */
export type EffectPreset = { id: string; name: string; version: number; summary: string; why: string[]; effect: Effect }

export const SOURCES: { value: EffectSource; label: string }[] = [
  { value: "flow", label: "Flow" },
  { value: "waves", label: "Waves" },
  { value: "rings", label: "Rings" },
  { value: "orb", label: "Orbs" },
  { value: "picture", label: "Picture" },
  { value: "clouds", label: "Clouds" },
  { value: "beam", label: "Beam" },
  { value: "cumulus", label: "Cumulus" },
  { value: "horizon", label: "Horizon" },
  { value: "coast", label: "Coast" },
  { value: "swirl", label: "Swirls" },
  { value: "circles", label: "Circles" },
  { value: "tiles", label: "Tiles" },
  { value: "tunnel", label: "Tunnel" },
  { value: "blocks", label: "Blocks" },
]
/** The sources drawn whole, with no cells: their palette is the ground and up to six inks (effects.md says what each
    colour paints). */
export const SCENE_SOURCES: EffectSource[] = ["horizon", "coast", "swirl", "circles", "tiles", "tunnel", "blocks"]
export const isScene = (e: Pick<Effect, "source">) => SCENE_SOURCES.includes(e.source)
export const CELLS: { value: EffectCell; label: string }[] = [
  { value: "pixel", label: "Pixels" },
  { value: "dot", label: "Dots" },
  { value: "cross", label: "Crosses" },
  { value: "char", label: "Characters" },
  { value: "line", label: "Lines" },
  { value: "block", label: "Blocks" },
  { value: "smooth", label: "Smooth" },
]
export const FADES: { value: EffectFade; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
  { value: "edges", label: "Edges" },
  { value: "radial", label: "Round" },
]

export const EFFECT_DEFAULTS: Effect = {
  source: "flow",
  cell: "dot",
  chars: " .:-=+*#",
  size: 12,
  gap: 0.1,
  sizeBy: 1,
  dither: 0,
  soft: 0,
  contrast: 1.3,
  level: 0,
  scale: 1.2,
  speed: 0.3,
  angle: 0,
  colors: ["#ffffff", "#2f8ff0"],
  glow: 0,
  grain: 0,
  fade: "none",
  seed: 0,
}

const fx = (e: Partial<Effect>): Effect => ({ ...EFFECT_DEFAULTS, ...e })
/** The starting effects: the looks of dithered and halftone posters, ASCII heroes and LED walls. */
export const EFFECT_SEEDS: EffectPreset[] = [
  {
    id: "characters",
    name: "Characters",
    version: 1,
    summary: "Towers of glowing characters drifting in a dark room, ember to orange to cream.",
    why: ["Characters read as data and make a hero feel alive behind a big title.", "A dark ground keeps white type over it legible."],
    effect: fx({ source: "flow", cell: "char", chars: " .:-=+xX0", size: 13, gap: 0, sizeBy: 0, dither: 0.15, contrast: 1.3, level: 0.25, scale: 1.4, speed: 0.35, angle: 90, colors: ["#040305", "#b8380a", "#ff6a1a", "#ffc48f"], glow: 0.3, grain: 0.2 }),
  },
  {
    id: "lime-dither",
    name: "Lime dither",
    version: 1,
    summary: "A two-tone ordered dither, lime on deep green, like a Game Boy screen breathing.",
    why: ["Hard on-or-off pixels in two greens: a retro print that stays calm."],
    effect: fx({ source: "flow", cell: "pixel", size: 9, gap: 0.18, sizeBy: 0, dither: 1, contrast: 1.3, scale: 1.2, speed: 0.3, colors: ["#0d6e10", "#1f9a1d", "#c8ff1e"] }),
  },
  {
    id: "halftone-flow",
    name: "Halftone flow",
    version: 1,
    summary: "Blue halftone dots swelling and shrinking with a slow flow, fading out at the bottom.",
    why: ["Halftone on white is light and friendly; the fade gives the content below room."],
    effect: fx({ source: "flow", cell: "dot", size: 14, gap: 0.08, sizeBy: 1, dither: 0, contrast: 1.5, level: 0.12, scale: 1.5, speed: 0.3, colors: ["#ffffff", "#8cc6ff", "#1d7fe0"], glow: 0.12, fade: "bottom" }),
  },
  {
    id: "cross-stitch",
    name: "Cross-stitch rings",
    version: 1,
    summary: "Concentric rings stitched in two blues, rippling outward.",
    why: ["Crosses of one size coloured by the field read as embroidery: craft, not tech."],
    effect: fx({ source: "rings", cell: "cross", size: 16, gap: 0.1, sizeBy: 0, dither: 0, contrast: 1.2, scale: 1, speed: 0.45, colors: ["#e3ebf7", "#a9c3ee", "#1d4fd6"] }),
  },
  {
    id: "dot-globe",
    name: "Dot globe",
    version: 1,
    summary: "A grey halftone sphere turning slowly on black.",
    why: ["Black with one soft form of dots: a quiet stage for a statement in white."],
    effect: fx({ source: "orb", cell: "dot", size: 10, gap: 0.12, sizeBy: 1, dither: 0, contrast: 1.3, scale: 0.9, speed: 0.15, colors: ["#060606", "#5a5a5a", "#f2f2f2"], glow: 0.1 }),
  },
  {
    id: "pink-wave",
    name: "Pink wave",
    version: 1,
    summary: "A magenta wave rising out of navy in squares that grow as it gets dense.",
    why: ["One loud colour on a dark ground, dithered at the edge: a wordmark sits on it."],
    effect: fx({ source: "waves", cell: "pixel", size: 12, gap: 0.12, sizeBy: 1, dither: 0.35, contrast: 1.2, scale: 1, speed: 0.3, colors: ["#0a0f26", "#ff1e8c"] }),
  },
  {
    id: "scanline-mosaic",
    name: "Scanline mosaic",
    version: 1,
    summary: "Big pixels of blue and gold drawn in vertical scanlines, like a 1970s screen.",
    why: ["Scanlines turn a soft form into a technical print; gold warms the blues."],
    effect: fx({ source: "orb", cell: "line", size: 28, gap: 0.2, sizeBy: 0.6, dither: 0, contrast: 1.2, scale: 1.4, speed: 0.2, colors: ["#02152f", "#0a4f9e", "#38b6ff", "#ffe27a"], glow: 0.2, grain: 0.15 }),
  },
  {
    id: "glow-blocks",
    name: "Glow blocks",
    version: 1,
    summary: "Huge soft pixels in indigo and violet with a bloom and grain, an LED wall out of focus.",
    why: ["Blocks this big stop being pixels and become light: atmosphere behind small type."],
    effect: fx({ source: "orb", cell: "block", size: 44, gap: 0.03, sizeBy: 0, dither: 0, soft: 0.6, contrast: 1.5, level: -0.12, scale: 1.1, speed: 0.25, colors: ["#04030f", "#1b1466", "#5b3cf5", "#b9dcff"], glow: 0.5, grain: 0.35 }),
  },
  // smooth: no cells at all, the moving field itself as a gradient (grain keeps its long blends from banding)
  {
    id: "dusk-clouds",
    name: "Dusk clouds",
    version: 1,
    summary: "Stippled clouds at dusk, lavender through peach to white, drifting: a sky to hold in a card.",
    why: ["Fine dots, a little dither and grain make soft clouds read as print, never as a stock photo.", "Slow: the page's words move, the sky behind them barely does."],
    effect: fx({ source: "clouds", cell: "dot", size: 3, gap: 0, sizeBy: 0.3, dither: 0.3, soft: 0.45, contrast: 1.05, level: 0.2, scale: 0.85, speed: 0.12, angle: 0, colors: ["#6c74c4", "#d2aee2", "#ffa58f", "#fff8f2"], glow: 0.22, grain: 0.45 }),
  },
  {
    id: "night-clouds",
    name: "Night clouds",
    version: 1,
    summary: "A bank of dim clouds along the foot of a dark page, fading up into it.",
    why: ["The page's ground shows through above it, so it sits under type without fighting it."],
    effect: fx({ source: "clouds", cell: "smooth", size: 10, gap: 0, sizeBy: 0, dither: 0, contrast: 1.15, level: -0.14, scale: 0.7, speed: 0.08, angle: 0, colors: ["transparent", "#1b1e33", "#3a4263", "#8e9ac4"], glow: 0.08, grain: 0.5, fade: "top" }),
  },
  {
    id: "aurora",
    name: "Aurora",
    version: 1,
    summary: "Curtains of teal light drifting across a night sky: a gradient that moves.",
    why: ["A smooth field, slow, on a dark ground: the light behind a device in a launch film."],
    effect: fx({ source: "flow", cell: "smooth", size: 22, gap: 0, sizeBy: 0, dither: 0, contrast: 1.15, level: -0.05, scale: 1.1, speed: 0.22, angle: 30, colors: ["#050816", "#123a6b", "#25c9b0", "#b8f5ff"], glow: 0.2, grain: 0.25 }),
  },
  {
    id: "mesh",
    name: "Mesh",
    version: 1,
    summary: "Two soft lights, violet and coral, circling each other on ink: a mesh gradient that breathes.",
    why: ["Colour with no edges at all: the product brings the detail."],
    effect: fx({ source: "orb", cell: "smooth", size: 24, gap: 0, sizeBy: 0, dither: 0, contrast: 1.2, level: 0, scale: 1.2, speed: 0.2, colors: ["#0b0b1a", "#3b2ce0", "#ff4fa3", "#ffd28a"], glow: 0.25, grain: 0.25 }),
  },
  {
    id: "silk",
    name: "Silk",
    version: 1,
    summary: "Warm folds of light on paper, rose to plum: a soft ground for dark type.",
    why: ["A light ground that still moves; the folds are slow enough to read over."],
    effect: fx({ source: "waves", cell: "smooth", size: 20, gap: 0, sizeBy: 0, dither: 0, contrast: 1, level: -0.1, scale: 0.9, speed: 0.18, angle: 20, colors: ["#f6f1ea", "#ecd3c4", "#cf9a8f", "#8c5a74"], glow: 0.05, grain: 0.2 }),
  },
  {
    id: "lava",
    name: "Lava",
    version: 1,
    summary: "Molten orange shapes rising through near black: heat, slowly.",
    why: ["Sharper edges (more contrast) turn a gradient into shapes, still with no cells."],
    effect: fx({ source: "flow", cell: "smooth", size: 18, gap: 0, sizeBy: 0, dither: 0, contrast: 1.7, level: -0.08, scale: 1.5, speed: 0.3, colors: ["#120400", "#ff4d00", "#ffb300"], glow: 0.35, grain: 0.3 }),
  },
  // from Syed's Figma references (2026-10-24): old televisions, painted coasts, 1970s prints, light in colour
  {
    id: "crt-mesh",
    name: "CRT mesh",
    version: 1,
    summary: "A blue television screen up close: a fine grid of lit pixels on curved glass, breathing brighter in the middle.",
    why: ["One hue and a grid of small pixels: the screen itself is the picture, a ground for white type.", "The glass curves and darkens to its edges, so the frame reads as an object."],
    effect: fx({ source: "orb", cell: "pixel", size: 5, gap: 0.25, sizeBy: 0, dither: 0, contrast: 0.6, level: 0.65, scale: 0.7, speed: 0.15, colors: ["#020a1a", "#0058e0", "#1499ff", "#5cc6ff"], glow: 0.25, grain: 0.1, screen: 0.5 }),
  },
  {
    id: "electric-cloud",
    name: "Electric cloud",
    version: 1,
    summary: "Cumulus clouds in cyan dots on deep navy, as an old screen would show them, billowing slowly.",
    why: ["Fine dots in a ramp of one blue: a picture that stays a texture behind the words."],
    effect: fx({ source: "cumulus", cell: "dot", size: 4.5, gap: 0, sizeBy: 0.45, dither: 0.25, soft: 0.15, contrast: 1.6, level: 0.05, scale: 1, speed: 0.15, colors: ["#04091f", "#0f2a6e", "#2a6fcf", "#8fe6f2"], glow: 0.25, grain: 0.3, screen: 0.2 }),
  },
  {
    id: "quiet-horizon",
    name: "Quiet horizon",
    version: 1,
    summary: "A periwinkle sky over a still sea: cirrus drifting, mist breathing along the horizon.",
    why: ["Almost nothing moves and nothing has an edge: a calm ground for a serif title."],
    effect: fx({ source: "horizon", cell: "smooth", scale: 1, speed: 0.2, contrast: 1, level: 0, colors: ["#8d99d5", "#c9cee8", "#aebbdb", "#e4e7f6"], grain: 0.15 }),
  },
  {
    id: "ink-coast",
    name: "Ink coast",
    version: 1,
    summary: "An ink-and-wash coast at sunset: a red sun, boats rocking, gulls, a pine leaning over the cliff, on paper.",
    why: ["A painting that moves only where water and wind would: the scene stays a picture."],
    effect: fx({ source: "coast", cell: "smooth", scale: 1, speed: 0.3, contrast: 1, level: 0, colors: ["#f1e3ca", "#f4b48a", "#7d97a6", "#2b2b2d", "#e2482d", "#8e9097", "#4a5a46"], grain: 0.2, paper: 0.6 }),
  },
  {
    id: "oil-coast",
    name: "Oil coast",
    version: 1,
    summary: "A sunlit Mediterranean coast in oils: cream clouds, white gulls, sails, daisies on the cliff, an olive tree.",
    why: ["Warm light and a soft sea: a summer ground, best with dark type in a card over it."],
    effect: fx({ source: "coast", cell: "smooth", scale: 1, speed: 0.3, contrast: 1.3, level: -1, colors: ["#7e9bc9", "#efe2c2", "#5d86b6", "#5a4a35", "#f6d77a", "#fbf1dc", "#7c8a4d"], grain: 0.25, paper: 0.45 }),
  },
  {
    id: "blue-signal",
    name: "Blue signal",
    version: 1,
    summary: "A television showing only blue light, a band of glare sweeping slowly across its glass.",
    why: ["The screen as the subject: empty, lit, waiting for the product to appear on it."],
    effect: fx({ source: "beam", cell: "smooth", size: 16, gap: 0, sizeBy: 0, dither: 0, contrast: 1.1, level: 0, scale: 0.9, speed: 0.25, angle: -52, colors: ["#020814", "#0a3fae", "#1f6fe0", "#7fd0f5"], glow: 0.15, grain: 0.25, screen: 0.8 }),
  },
  {
    id: "crt-coast",
    name: "CRT coast",
    version: 1,
    summary: "The painted coast on an old television, in electric blue: clouds, sails and the sea glowing on curved glass.",
    why: ["A picture inside an object: a memory on a screen, for a story about the past."],
    effect: fx({ source: "coast", cell: "smooth", scale: 1, speed: 0.3, contrast: 1, level: -1, colors: ["#2c5fc4", "#9cc8f0", "#1f4fa8", "#06163f", "#cfe9ff", "#e6f4ff", "#123a7a"], grain: 0.3, screen: 1 }),
  },
  {
    id: "soft-afterglow",
    name: "Soft afterglow",
    version: 1,
    summary: "A television glowing pastel, lavender at its corners and mint at its heart, slowly shifting.",
    why: ["Light, low contrast and nearly empty: a calm screen for dark type."],
    effect: fx({ source: "orb", cell: "smooth", size: 24, gap: 0, sizeBy: 0, dither: 0, contrast: 0.8, level: -0.3, scale: 0.55, speed: 0.15, colors: ["#d9cfe6", "#e0d0ea", "#b9d0e8", "#9fd8be"], grain: 0.15, screen: 0.7 }),
  },
  {
    id: "groovy",
    name: "Groovy",
    version: 1,
    summary: "1970s swirls: ribbons of olive, mustard, orange and brown folding slowly on cream paper.",
    why: ["A print, not a gradient: flat inks with paper under them, warm and loud, for a playful brand."],
    effect: fx({ source: "swirl", cell: "smooth", scale: 1, speed: 0.15, contrast: 1, colors: ["#f3e6c8", "#7a8b3a", "#d98c2b", "#d9662a", "#a8452a", "#6b3a22"], grain: 0.2, paper: 0.6 }),
  },
  {
    id: "retro-circles",
    name: "Retro circles",
    version: 1,
    summary: "Overlapping circles in olive, mustard, orange and brown, darker where they cross, floating on cream.",
    why: ["Simple shapes and a 1970s palette; the overlaps do the work, so they hardly need to move."],
    effect: fx({ source: "circles", cell: "smooth", scale: 1, speed: 0.2, contrast: 1, colors: ["#f3e8cf", "#8a9447", "#e3a43a", "#d4632c", "#7a3b23"], grain: 0.15, paper: 0.6 }),
  },
  {
    id: "bauhaus-tiles",
    name: "Bauhaus tiles",
    version: 1,
    summary: "A grid of Bauhaus tiles (half discs, triangles, rings of dots, stripes) in rust, mustard and greens, one turning now and then.",
    why: ["Geometry with a rhythm: one tile turns at a time, so the grid stays calm."],
    effect: fx({ source: "tiles", cell: "smooth", scale: 1, speed: 0.3, contrast: 1, colors: ["#f2e6cc", "#c95f2e", "#dba83a", "#7f9443", "#2f5232"], grain: 0.15, paper: 0.5 }),
  },
  {
    id: "neon-tunnel",
    name: "Neon tunnel",
    version: 1,
    summary: "Rounded rectangles of light rising from the foot, white at the heart through orange and magenta to blue, flowing outward.",
    why: ["Bands of one ramp, each a step: depth and motion from colour alone, a stage for a single word."],
    effect: fx({ source: "tunnel", cell: "smooth", scale: 1, speed: 0.3, contrast: 1, colors: ["#1a12d8", "#ffe9f5", "#ff9ad0", "#ff7a2a", "#ff2a1a", "#ff2ad8", "#8a1cff"], grain: 0.15 }),
  },
  {
    id: "contour-blocks",
    name: "Contour blocks",
    version: 1,
    summary: "Squares, dominoes and L shapes fitted together, each one vivid hue stepping from light at its edge to deep at its heart, or back.",
    why: ["Loud, but ordered: every block is the same idea, so the eye reads one pattern."],
    effect: fx({ source: "blocks", cell: "smooth", scale: 1, speed: 0.25, contrast: 1, colors: ["#05060c", "#1b3cff", "#ff3fa4", "#ff3b1a", "#ff9d1a", "#16c94a", "#a020ff"], grain: 0.1 }),
  },
]

/* ---------------- anything that claims to be an effect ---------------- */

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const COLOUR = /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i
const PICTURE = /^(data:image\/(png|jpe?g|webp|gif);|https:\/\/)/
const pick = <T extends string>(v: unknown, list: readonly { value: T }[], d: T): T => (list.some((x) => x.value === v) ? (v as T) : d)

/** Every field checked and held to its range; anything unknown dropped. Errors only for what makes it unusable. */
export function validateEffect(raw: unknown): { effect?: Effect; errors: string[] } {
  const r = raw as Partial<Effect> | null
  if (!r || typeof r !== "object") return { errors: ["Not an effect."] }
  const errors: string[] = []
  const colors = Array.isArray(r.colors) ? r.colors.filter((c): c is string => typeof c === "string" && COLOUR.test(c.trim())).map((c) => c.trim()).slice(0, 7) : []
  if (colors.length < 2) errors.push("An effect needs a ground and at least one ink (colors).")
  const source = pick(r.source, SOURCES, "flow")
  const picture = typeof r.picture === "string" && PICTURE.test(r.picture) ? r.picture : undefined
  const chars = typeof r.chars === "string" && r.chars.length >= 2 ? [...r.chars].slice(0, 16).join("") : EFFECT_DEFAULTS.chars
  const effect: Effect = {
    source: source === "picture" && !picture ? "flow" : source,
    ...(picture ? { picture } : {}),
    cell: pick(r.cell, CELLS, "dot"),
    chars,
    size: num(r.size, 3, 120, 12),
    gap: num(r.gap, 0, 0.9, 0.1),
    sizeBy: num(r.sizeBy, 0, 1, 1),
    dither: num(r.dither, 0, 1, 0),
    soft: num(r.soft, 0, 1, 0),
    contrast: num(r.contrast, 0.2, 3, 1.3),
    level: num(r.level, -1, 1, 0),
    ...(r.invert ? { invert: true } : {}),
    scale: num(r.scale, 0.2, 5, 1.2),
    speed: num(r.speed, 0, 3, 0.3),
    angle: num(r.angle, -360, 360, 0),
    colors: colors.length >= 2 ? colors : EFFECT_DEFAULTS.colors,
    ...(r.tint ? { tint: true } : {}),
    ...(typeof r.under === "number" && r.under > 0 ? { under: num(r.under, 0, 1, 0) } : {}),
    glow: num(r.glow, 0, 1, 0),
    grain: num(r.grain, 0, 1, 0),
    fade: pick(r.fade, FADES, "none"),
    seed: num(r.seed, 0, 1000, 0),
    ...(typeof r.screen === "number" && r.screen > 0 ? { screen: num(r.screen, 0, 1, 0) } : {}),
    ...(typeof r.paper === "number" && r.paper > 0 ? { paper: num(r.paper, 0, 1, 0) } : {}),
  }
  return errors.length ? { errors } : { effect, errors }
}

/** A preset as the lab proposes it: an id, a name, what it is and why, and a valid effect. */
export function validatePreset(raw: unknown): { preset?: EffectPreset; errors: string[] } {
  const r = raw as Partial<EffectPreset> | null
  if (!r || typeof r !== "object") return { errors: ["Not an effect preset."] }
  const v = validateEffect(r.effect)
  const errors = [...v.errors]
  const id = typeof r.id === "string" ? r.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) : ""
  if (!id) errors.push("It needs an id.")
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : ""
  if (!name) errors.push("It needs a name.")
  if (errors.length || !v.effect) return { errors }
  return {
    preset: {
      id,
      name,
      version: typeof r.version === "number" && r.version >= 1 ? Math.round(r.version) : 1,
      summary: typeof r.summary === "string" ? r.summary.slice(0, 300) : "",
      why: Array.isArray(r.why) ? r.why.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 6) : [],
      effect: v.effect,
    },
    errors,
  }
}

/** What a machine can say about an effect against the effects rulebook (effects.md): it reads under type, it moves
    gently, it isn't heavier than it needs to be. */
export function lintEffect(e: Effect): { level: "error" | "warn" | "info"; rule: string; text: string }[] {
  const out: { level: "error" | "warn" | "info"; rule: string; text: string }[] = []
  if (e.speed > 1.5) out.push({ level: "warn", rule: "motion.calm", text: `Speed ${e.speed}: a background drifts; above 1.5 it competes with what's on it.` })
  if (!isScene(e) && e.size < 5 && e.cell !== "pixel") out.push({ level: "warn", rule: "cell.readable", text: `Cells of ${e.size} px blur into a texture: shapes read from about 6 px.` })
  if (e.glow > 0.85 && e.grain < 0.05) out.push({ level: "info", rule: "glow.grain", text: "Strong glow without grain bands on screens: a little grain breaks the steps up." })
  if (e.cell === "char" && e.size > 28) out.push({ level: "info", rule: "cell.char", text: "Characters this big stop reading as a texture and start being read." })
  if (e.colors.length > 7) out.push({ level: "error", rule: "palette.size", text: "A ground and six inks at most." })
  if (!isScene(e) && e.colors.length > 4) out.push({ level: "info", rule: "palette.one", text: "Four or more inks on a moving field read as a rainbow: a ramp of one hue, or a hue and one accent. Scenes take a palette." })
  if ((e.screen ?? 0) > 0 && (e.paper ?? 0) > 0) out.push({ level: "warn", rule: "finish.one", text: "A screen and paper at once: light on glass, or ink on paper, not both." })
  return out
}
