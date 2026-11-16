// Studio — the Artist: a director that makes a whole launch film, not a reel of device angles. It works like a studio
// does:
//   1. It reads the brief: the product's words, its screens, its colour, the kind of film (a product launch, a feature
//      launch, a demo, a teaser, a brand film, a social cut), how long, what shape.
//   2. It picks an art direction: a palette in one harmony of the product's colour, gradient worlds for each part of the
//      story (gradients.ts), a type system (faces, weights, how each role's titles arrive), a card style, a tempo, effects,
//      the cuts it leans on. Your taste weights the choice, and it still explores.
//   3. It writes the story for that kind of film from set pieces: the hook slammed in, words cut on the beat, the name
//      revealed in a gradient, the device rising between parting words, the feature shown in the real interface with a
//      cursor clicking, three cards, a split, the screen taken apart, a collage, a montage, a breath, the number, the end
//      card with its button.
//   4. It times everything to the beat of its tempo, and gives every cut its carrier (cuts.ts).
// What it makes is a template script: every layer editable in the Studio, checked like any other, read by the critic.
// Pure: the app and the server both run it.
import { contrast, lch, readable, type Harmony, type Look } from "../theme.ts"
import { darkStack, gradient, groundOfStack, lookFor, paintOf, paletteOf, titleFill, type GradientKind, type TitleFill } from "./gradients.ts"
import { beatOf, rng, type Rng } from "./invent.ts"
import { smoothCuts } from "./cuts.ts"
import { TEXT_ANIMS } from "./textanim.ts"
import { profileOf, type Profile } from "./content.ts"
import { FACES } from "./faces.ts"
import type { Exit, TextEnter, Transition, Tween } from "./comp"
import type { SceneFx } from "./fx"
import type { Paint } from "./paint"
import type { Copy } from "./copy"
import type { ScriptLayer, ScriptShot, TemplateScript } from "./script"
import type { Taste } from "./taste"

/* ---------------- art directions ---------------- */

type Role = "hook" | "name" | "feature" | "line" | "label"
export type ArtDirection = {
  id: string
  name: string
  hint: string
  harmony: Harmony
  /** the gradient world for each part of the story */
  grounds: Record<"hook" | "reveal" | "feature" | "interlude" | "end", GradientKind>
  energy: number
  speed: number
  spread: number
  type: { display: "display" | "serif"; weight: number; label: "mono" | "text"; nameFill: TitleFill }
  /** how each role's titles arrive: one of the title animations (textanim.ts) or a built-in entrance */
  titles: Record<Role, string>
  cards: "glass" | "solid" | "outline"
  /** corners, % of the frame's width */
  radius: number
  fx: SceneFx
  /** beats a minute: every shot and every title is timed to it */
  tempo: number
  /** the carriers its cuts lean on, where two would do */
  prefer: Partial<Record<Transition, number>>
  /** how the device arrives in its hero shot */
  arrive: "rise" | "flip" | "spin" | "fall" | "crane"
  /** your own direction's colour, over the product's (one taken from your pictures, say) */
  anchor?: string
  /** your own direction's faces (Google Fonts families) */
  faces?: { display?: string; text?: string; fonts?: string[] }
  /** your own: made by you, maybe from a picture (a small still of it) */
  own?: { from?: string; picture?: string }
}

export const DIRECTIONS: ArtDirection[] = [
  { id: "keynote", name: "Keynote", hint: "A dark room, one light from above, chrome titles that track in, a ring of light at the end.", harmony: "deep", grounds: { hook: "noir", reveal: "spotlight", feature: "glow", interlude: "aurora", end: "swirl" }, energy: 0.7, speed: 0.8, spread: 50, type: { display: "display", weight: 650, label: "mono", nameFill: "chrome" }, titles: { hook: "slam", name: "tracking", feature: "mask-lines", line: "sweep", label: "fade" }, cards: "glass", radius: 1.6, fx: { bloom: 0.25, vignette: 0.35, grain: 0.1 }, tempo: 104, prefer: { through: 1.6, iris: 1.2 }, arrive: "spin" },
  { id: "pop", name: "Gradient pop", hint: "The colour itself, loud: moving meshes, heavy type that slams, quick whips on the beat.", harmony: "pop", grounds: { hook: "duotone", reveal: "mesh", feature: "mesh", interlude: "prism", end: "mesh" }, energy: 0.9, speed: 1.2, spread: 90, type: { display: "display", weight: 760, label: "mono", nameFill: "ink" }, titles: { hook: "slam", name: "letters", feature: "skew", line: "words", label: "fade" }, cards: "solid", radius: 2.4, fx: { grain: 0.08 }, tempo: 124, prefer: { whip: 1.6, wipe: 1.3 }, arrive: "fall" },
  { id: "editorial", name: "Editorial", hint: "Paper light, a serif that rises out of its lines, slow glides, wipes like turning a page.", harmony: "light", grounds: { hook: "glow", reveal: "dusk", feature: "glow", interlude: "horizon", end: "glow" }, energy: 0.45, speed: 0.6, spread: 40, type: { display: "serif", weight: 400, label: "mono", nameFill: "ink" }, titles: { hook: "mask-lines", name: "blur-up", feature: "mask-lines", line: "spotlight", label: "fade" }, cards: "outline", radius: 0.6, fx: { grain: 0.14, vignette: 0.12 }, tempo: 92, prefer: { wipe: 1.6, iris: 1.2 }, arrive: "crane" },
  { id: "neon", name: "Neon", hint: "Aurora and a turning prism, titles filled with the spectrum, irises and bloom.", harmony: "deep", grounds: { hook: "aurora", reveal: "swirl", feature: "aurora", interlude: "prism", end: "swirl" }, energy: 1, speed: 1.1, spread: 120, type: { display: "display", weight: 700, label: "mono", nameFill: "spectrum" }, titles: { hook: "scatter", name: "bloom", feature: "flip-up", line: "glint", label: "fade" }, cards: "glass", radius: 1.2, fx: { bloom: 0.5, vignette: 0.4, grain: 0.1, split: 0.12 }, tempo: 118, prefer: { iris: 1.5, whip: 1.2 }, arrive: "flip" },
  { id: "glass", name: "Soft glass", hint: "Pastel meshes, frosted cards, words that blur up, irises that open soft.", harmony: "analogous", grounds: { hook: "mesh", reveal: "mesh", feature: "mesh", interlude: "horizon", end: "prism" }, energy: 0.55, speed: 0.7, spread: 70, type: { display: "display", weight: 600, label: "text", nameFill: "accent" }, titles: { hook: "blur-up", name: "tracking", feature: "blur-up", line: "words", label: "fade" }, cards: "glass", radius: 2.2, fx: { bloom: 0.3 }, tempo: 100, prefer: { iris: 1.5, through: 1.3 }, arrive: "rise" },
  { id: "bold", name: "Mono bold", hint: "Black and white and one colour, the heaviest type, hard cuts and whips on a fast beat.", harmony: "studio", grounds: { hook: "noir", reveal: "spotlight", feature: "glow", interlude: "noir", end: "spotlight" }, energy: 0.3, speed: 0.5, spread: 0, type: { display: "display", weight: 820, label: "mono", nameFill: "ink" }, titles: { hook: "slam", name: "mask-letters", feature: "slide", line: "spotlight", label: "fade" }, cards: "outline", radius: 0, fx: { grain: 0.2, vignette: 0.3, grade: { exposure: 0, contrast: 0.2, saturation: 0, warmth: 0 } }, tempo: 128, prefer: { cut: 1.5, whip: 1.3 }, arrive: "rise" },
]

/* ---------------- the brief and what a piece is made with ---------------- */

export type Brief = {
  /** a kind of film (refs.ts CATEGORIES.film) */
  category: string
  /** an art direction's id, or "auto" (your taste, then a little exploring) */
  style?: string
  length?: "short" | "standard" | "long"
  size?: "16x9" | "9x16" | "1x1" | "4x5"
  /** the product's colour (read off its screen) */
  accent: string
  copy: Copy
  /** how many of the product's screens there are (1 to 3) */
  screens?: number
  /** false when the screens are pictures (a captured app), not live pages: nothing that takes a live screen apart */
  live?: boolean
  /** how many components the product has (the content reader counts them), and their names */
  components?: number
  componentNames?: string[]
  /** your own art directions (made in the Artist, or from your pictures), beside the built-in ones */
  directions?: ArtDirection[]
  /** the faces the film's titles are set in, over the brand's */
  type?: { display?: string; text?: string; fonts?: string[] }
  seed?: number
  taste?: Taste
}
/** `k`: how much bigger type is set (sizes are a share of the frame's width); `ar`: width over height */
type Frame = { tall: boolean; k: number; ar: number }
const FRAMES: Record<string, Frame> = { "16x9": { tall: false, k: 1, ar: 16 / 9 }, "1x1": { tall: true, k: 1.3, ar: 1 }, "4x5": { tall: true, k: 1.42, ar: 0.8 }, "9x16": { tall: true, k: 1.75, ar: 9 / 16 } }
/** `n`: the piece being made (for its gradient's seed); `f`: the next feature to show (1, 2, 3) */
type Ctx = { ad: ArtDirection; look: Look; frame: Frame; b: number; r: Rng; copy: Copy; screens: number; seed: number; n: number; f: number; content?: Profile }

const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)"
const EMIL = "cubic-bezier(0.23, 1, 0.32, 1)"
const INOUT = "cubic-bezier(0.77, 0, 0.175, 1)"
const LINEAR = "cubic-bezier(0, 0, 1, 1)"
const r2 = (v: number) => Math.round(v * 100) / 100
const VIEW = { x: 0.5, y: 0.5, zoom: 1 }

/** The words a placeholder stands for, to size its title. */
function said(c: Ctx, text: string) {
  const f = c.copy.features.filter((x) => x.trim())
  const map: Record<string, string> = { name: c.copy.name, hook: c.copy.hook || c.copy.tagline, tagline: c.copy.tagline || c.copy.hook, cta: c.copy.cta || "Try it", kicker: c.copy.kicker || "Introducing", split: c.copy.split || c.copy.tagline, feature1: f[0] ?? c.copy.tagline, feature2: f[1] ?? f[0] ?? c.copy.tagline, feature3: f[2] ?? f[1] ?? c.copy.tagline, proof: c.copy.proof || c.copy.tagline }
  return text.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? k)
}
/** A title's size (% of the frame's width) for its role and the shape, shrunk until its words fit in `lines` lines of
    the box (a display face's letters average about 0.52 em, a serif's 0.46). */
function sizeFor(c: Ctx, base: number, text: string, w: number, lines = 2, em = 0.52) {
  const want = base * c.frame.k
  const len = Math.max(4, said(c, text).length)
  const fits = (w * 100 * lines) / (len * em)
  return r2(Math.max(1, Math.min(want, fits)))
}
/** The ink and the quieter ink that read on a gradient stack. */
function inks(c: Ctx, p: Paint[]) {
  const g = groundOfStack(p)
  const dark = darkStack(p)
  const same = dark === c.look.dark
  return { ink: readable(same ? c.look.ink : dark ? "#f5f5f7" : "#121214", g, 7), muted: readable(same ? c.look.muted : dark ? "#a1a1aa" : "#5b5b63", g, 4.5) }
}
const groundAt = (c: Ctx, kind: GradientKind, focus?: { x: number; y: number }) => gradient(kind, c.look, { energy: c.ad.energy, speed: c.ad.speed, spread: c.ad.spread, seed: c.seed * 13 + c.n * 7 + 1, focus })

/** A title in a role, arriving the art direction's way, at `at` seconds into the shot. */
function title(c: Ctx, role: Role, text: string, box: { x: number; y: number; w: number }, base: number, color: string, o: { at?: number; exit?: Exit; align?: "left" | "center" | "right"; paint?: Paint[]; lines?: number; font?: "text" | "display" | "mono" | "serif"; weight?: number; name?: string; enter?: string } = {}): ScriptLayer {
  const spec = o.enter ?? c.ad.titles[role]
  const custom = TEXT_ANIMS.find((a) => a.id === spec)
  const font = o.font ?? (role === "label" ? c.ad.type.label : role === "line" ? "text" : c.ad.type.display)
  const serif = font === "serif"
  const size = role === "label" ? r2(base * Math.min(1.4, c.frame.k)) : sizeFor(c, base, text, box.w, o.lines ?? (role === "line" ? 3 : 2), serif ? 0.46 : font === "mono" ? 0.62 : 0.52)
  return {
    kind: "text",
    name: o.name ?? `${role[0].toUpperCase()}${role.slice(1)}`,
    text,
    box,
    size,
    weight: o.weight ?? (font === "mono" ? 500 : role === "line" ? 450 : serif ? 400 : c.ad.type.weight),
    align: o.align ?? "center",
    enter: (custom ? "custom" : (spec as TextEnter)) ?? "words",
    ...(custom ? { animation: custom.anim } : {}),
    color,
    font,
    ...(o.paint ? { paint: o.paint } : {}),
    entry: { at: r2(o.at ?? 0.25), dur: 0.8 },
    ...(o.exit ? { exit: o.exit } : {}),
  } as ScriptLayer
}
/** How tall a title stands, as a share of the frame's height: its lines (its words wrapped in its box) times its
    line height. */
function heightOf(c: Ctx, l: ScriptLayer) {
  if (l.kind !== "text") return 0
  const em = l.font === "serif" ? 0.46 : l.font === "mono" ? 0.62 : 0.52
  const lines = Math.max(1, Math.ceil((said(c, l.text).length * em * l.size) / Math.max(1, l.box.w * 100)))
  const lh = l.font === "display" ? 0.98 : l.font === "mono" ? 1.3 : l.font === "serif" ? 1.05 : 1.1
  return (lines * lh * l.size * c.frame.ar) / 100
}
/** Titles stacked down a column centred on `cy`, each under the last by its own height and a gap: a name that wraps
    pushes the line under it down instead of running into it. */
function stacked(c: Ctx, cy: number, layers: ScriptLayer[], gap = 0.022): ScriptLayer[] {
  const hs = layers.map((l) => heightOf(c, l))
  let y = cy - (hs.reduce((a, h) => a + h, 0) + gap * (layers.length - 1)) / 2
  return layers.map((l, i) => {
    const at = y + hs[i] / 2
    y += hs[i] + gap
    return l.kind === "text" ? ({ ...l, box: { ...l.box, y: r2(at) } } as ScriptLayer) : l
  })
}
const exitAt = (dur: number, kind: Exit["kind"] = "blur", len = 0.32): Exit => ({ at: r2(Math.max(0.2, dur - len - 0.04)), dur: len, kind, ease: "cubic-bezier(0.55, 0, 1, 0.45)" })
const tween = (prop: Tween["prop"], at: number, dur: number, from: number[], to: number[], ease = EMIL) => ({ prop, at: r2(at), dur: r2(dur), from, to, ease })
/** a soft light behind a title, breathing */
const orb = (c: Ctx, x: number, y: number, w: number, color: string, alpha: number, dur: number): ScriptLayer => ({ kind: "shape", name: "Light", shape: "ellipse", box: { x, y, w }, aspect: 1, radius: 0, paint: [paintOf("radial", [[color, alpha, 0], [color, alpha * 0.35, 0.45], [color, 0, 1]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })], enter: "fade", entry: { at: 0, dur: 0.9 }, tweens: [tween("scale", 0, dur, [0.92], [1.12], INOUT)] }) as ScriptLayer
/** a card in the art direction's style */
function card(c: Ctx, dark: boolean, box: { x: number; y: number; w: number }, aspect: number, at: number, name = "Card"): ScriptLayer {
  const fill: Paint[] =
    c.ad.cards === "glass" ? [paintOf("linear", [["#ffffff", dark ? 0.12 : 0.75, 0], ["#ffffff", dark ? 0.04 : 0.45, 1]], { x: 0.5, y: 0 }, { x: 0.5, y: 1 })] : c.ad.cards === "solid" ? [paintOf("solid", [[dark ? "#ffffff" : "#000000", dark ? 0.1 : 0.06, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })] : [paintOf("solid", [["#000000", 0, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })]
  return { kind: "shape", name, shape: "rect", box, aspect, radius: c.ad.radius, paint: fill, stroke: { color: dark ? "#ffffff2e" : "#0000001c", width: c.ad.cards === "outline" ? 2 : 1 }, enter: "rise", entry: { at: r2(at), dur: 0.7, ease: EXPO }, tweens: [tween("position", at, 0.9, [0, 0.03], [0, 0], EXPO)] } as ScriptLayer
}
/** the product's screen as a card in the frame, `h` of the frame's height tall (a phone screen is about 0.46 as wide
    as it's tall), tilted back and settling, a soft shadow under it */
function screenCard(c: Ctx, which: string, x: number, y: number, h: number, at: number, dur: number, turn = -10): ScriptLayer[] {
  const w = r2((h * 0.46) / c.frame.ar)
  return [
    { kind: "shape", name: "Shadow", shape: "ellipse", box: { x, y: r2(y + h * 0.5), w: r2(w * 1.1) }, aspect: 4, radius: 0, paint: [paintOf("radial", [["#000000", 0.45, 0], ["#000000", 0, 1]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })], enter: "fade", entry: { at: r2(at), dur: 0.8 }, blur: 1.2 } as ScriptLayer,
    { kind: "component", name: "The screen", anim: which, box: { x, y, w }, aspect: 0.46, enter: "rise", fit: true, entry: { at: r2(at), dur: 0.9, ease: EXPO }, tilt: { x: 0, y: 0 }, tweens: [tween("tilt", at, dur - at, [16, turn], [5, turn / 3], EMIL), tween("position", at, 0.9, [0, 0.06], [0, 0], EXPO)] } as ScriptLayer,
  ]
}

/* ---------------- set pieces ---------------- */

type Piece = { id: string; name: string; why: string; make: (c: Ctx) => ScriptShot | ScriptShot[] | null }
const shotOf = (c: Ctx, name: string, why: string, beats: number, p: Paint[], layers: ScriptLayer[], more: Partial<ScriptShot> = {}): ScriptShot => ({ name, dur: r2(beats * c.b), why, ground: groundOfStack(p), paints: p, fx: c.ad.fx, view: { from: VIEW, to: { x: 0.5, y: 0.5, zoom: 1.05 }, ease: LINEAR }, layers, ...more })

export const PIECES: Piece[] = [
  {
    id: "slam",
    name: "The hook, slammed in",
    why: "The hook in the first second, big, arriving hard on the beat over moving light: it grabs before anything is shown.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.hook)
      const { ink } = inks(c, p)
      const dur = 4 * c.b
      return shotOf(c, "The hook", PIECES[0].why, 4, p, [orb(c, 0.5, 0.52, c.frame.tall ? 1.1 : 0.62, c.look.accent, 0.45, dur), title(c, "hook", "{hook}", { x: 0.5, y: 0.5, w: c.frame.tall ? 0.86 : 0.8 }, 9, ink, { at: 0.18, exit: exitAt(dur, "rise") })])
    },
  },
  {
    id: "beats",
    name: "Words on the beat",
    why: "The line cut word by word on the beat: each word owns the frame for a moment, the rhythm is the hook.",
    make: (c) => {
      const words = (c.copy.hook || c.copy.tagline || c.copy.name).replace(/[.!?]+$/, "").split(/\s+/).filter(Boolean)
      // two words a beat when there are many, so it never outstays the beat
      const chunks: string[] = []
      for (let i = 0; i < words.length; ) {
        const take = words.length > 5 && words[i].length + (words[i + 1]?.length ?? 99) < 12 ? 2 : 1
        chunks.push(words.slice(i, i + take).join(" "))
        i += take
      }
      const list = chunks.slice(0, 5)
      const p = groundAt(c, c.ad.grounds.hook)
      const { ink } = inks(c, p)
      const layers = list.map((w, i) => {
        const at = 0.15 + i * c.b
        const last = i === list.length - 1
        return title(c, "hook", w, { x: 0.5, y: 0.5, w: 0.9 }, 12, ink, { at, lines: 1, enter: "slam", name: `Word ${i + 1}`, ...(last ? {} : { exit: { at: r2(at + c.b - 0.08), dur: 0.06, kind: "fade" as const } }) })
      })
      return shotOf(c, "On the beat", PIECES[1].why, list.length + 2, p, layers, { view: { from: VIEW, to: { x: 0.5, y: 0.5, zoom: 1.08 }, ease: LINEAR } })
    },
  },
  {
    id: "meet",
    name: "Meet the name",
    why: "The name revealed on its own, filled with the film's light, a soft orb breathing behind it: the moment the product has a name.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.reveal, { x: 0.5, y: 0.4 })
      const { ink, muted } = inks(c, p)
      const dur = 5 * c.b
      const fill = titleFill(c.ad.type.nameFill, c.look, groundOfStack(p))
      return shotOf(c, "Meet the name", PIECES[2].why, 5, p, [orb(c, 0.5, 0.5, c.frame.tall ? 1 : 0.55, c.look.glow, 0.55, dur), ...stacked(c, 0.48, [title(c, "label", "{kicker}", { x: 0.5, y: 0, w: 0.6 }, 1.4, muted, { at: 0.15 }), title(c, "name", "{name}", { x: 0.5, y: 0, w: 0.86 }, 12.5, ink, { at: 0.4, paint: fill, lines: 1 })], 0.03)])
    },
  },
  {
    id: "hero",
    name: "The device, between parting words",
    why: "The device arrives on its own move and the line parts round it: the product and its promise in one frame.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.reveal, { x: 0.5, y: 0.5 })
      const { ink } = inks(c, p)
      const words = c.frame.tall ? title(c, "feature", "{tagline}", { x: 0.5, y: 0.12, w: 0.86 }, 5.6, ink, { at: 0.5 }) : ({ kind: "text", name: "The line, parting", text: "{split}", box: { x: 0.5, y: 0.5, w: 0.96 }, size: sizeFor(c, 5.4, "{split}", 0.58, 1), weight: c.ad.type.display === "serif" ? 400 : c.ad.type.weight, align: "center", enter: "part", gap: 30, color: ink, font: c.ad.type.display, entry: { at: 0.6, dur: 1 } } as ScriptLayer)
      return { ...shotOf(c, "The hero", PIECES[3].why, 6, p, [words]), view: undefined, device: { id: "{device}", from: { angle: c.ad.arrive === "spin" ? "front" : "hero", zoom: c.frame.tall ? 0.78 : 0.86, ...(c.frame.tall ? { rise: -0.12 } : {}) }, move: c.ad.arrive } }
    },
  },
  {
    id: "ui",
    name: "The feature in the interface",
    why: "A feature said in a few words beside the real interface, tilting up to face us while a cursor finds the thing and clicks: it shows, it doesn't claim.",
    make: (c) => {
      const i = c.f++ % 3
      const p = groundAt(c, c.ad.grounds.feature, { x: c.frame.tall ? 0.5 : 0.68, y: 0.5 })
      const { ink, muted } = inks(c, p)
      const dur = 7 * c.b
      const screen = i && c.screens > i ? `{screen${i + 1}}` : "{screen}"
      const [sx, sy, sh] = c.frame.tall ? [0.5, 0.62, 0.5] : [0.68, 0.5, 0.72]
      const sw = (sh * 0.46) / c.frame.ar
      const tx = c.frame.tall ? 0.5 : 0.08
      const align = c.frame.tall ? "center" : "left"
      const tw = c.frame.tall ? 0.86 : 0.4
      const box = (y: number) => ({ x: c.frame.tall ? 0.5 : tx + tw / 2, y, w: tw })
      const target = { x: r2(sx + sw * 0.18), y: r2(sy - sh * 0.18) }
      const click = 3.2 * c.b
      return shotOf(c, `Feature ${i + 1}`, PIECES[4].why, 7, p, [
        ...stacked(c, c.frame.tall ? 0.15 : 0.47, [title(c, "label", `0${i + 1}`, box(0), 1.3, muted, { at: 0.2, align }), title(c, "feature", `{feature${i + 1}}`, box(0), 5.2, ink, { at: 0.35, align, lines: 3 })]),
        ...screenCard(c, screen, sx, sy, sh, 0.3, dur, c.frame.tall ? -6 : -14),
        { kind: "cursor", name: "Cursor", label: "You", color: c.look.accent, box: { x: target.x, y: target.y, w: 0.08 }, enter: "fade", entry: { at: r2(1.4 * c.b), dur: 0.3 }, tweens: [tween("position", 1.4 * c.b, click - 1.4 * c.b, [0.16, 0.22], [0, 0], INOUT), tween("scale", click, 0.18, [1], [0.86], EMIL), tween("scale", click + 0.18, 0.25, [0.86], [1], EMIL)] } as ScriptLayer,
        // the click: a ring that opens and fades where the cursor pressed
        { kind: "shape", name: "Click", shape: "ellipse", box: { x: target.x, y: target.y, w: 0.05 }, aspect: 1, radius: 0, paint: [paintOf("solid", [["#000000", 0, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })], stroke: { color: c.look.accent, width: 3 }, enter: "none", tweens: [tween("opacity", 0, 0.01, [0], [0]), tween("opacity", click, 0.5, [0.9], [0], EMIL), tween("scale", click, 0.5, [0.3], [1.6], EXPO)] } as ScriptLayer,
      ])
    },
  },
  {
    id: "split",
    name: "Words beside the device",
    why: "A feature in a few words on one side, the device turning slowly on the other: type and product share the frame without competing.",
    make: (c) => {
      const i = c.f++ % 3
      const p = groundAt(c, c.ad.grounds.feature, { x: c.frame.tall ? 0.5 : 0.7, y: 0.5 })
      const { ink, muted } = inks(c, p)
      const tall = c.frame.tall
      const box = (y: number) => (tall ? { x: 0.5, y, w: 0.86 } : { x: 0.27, y, w: 0.4 })
      return {
        ...shotOf(c, `Feature ${i + 1}, beside it`, PIECES[5].why, 7, p, stacked(c, tall ? 0.15 : 0.48, [title(c, "label", "{kicker}", box(0), 1.3, muted, { at: 0.2, align: tall ? "center" : "left" }), title(c, "feature", `{feature${i + 1}}`, box(0), 5.2, ink, { at: 0.35, align: tall ? "center" : "left", lines: 3 })])),
        view: undefined,
        device: { id: "{device}", from: { angle: "hero", zoom: tall ? 0.7 : 0.88, yaw: -8, ...(tall ? { rise: -0.2 } : { pan: 0.2 }) }, to: { yaw: 8, zoom: tall ? 0.74 : 0.92 }, ease: LINEAR },
      }
    },
  },
  {
    id: "trio",
    name: "Three things",
    why: "Three features on three cards, numbered, arriving one after another: what it does, at a glance.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.feature)
      const { ink, muted } = inks(c, p)
      const dark = darkStack(p)
      const tall = c.frame.tall
      const layers: ScriptLayer[] = []
      for (let i = 0; i < 3; i++) {
        const at = 0.25 + i * (c.b / 2)
        const pos = tall ? { x: 0.5, y: 0.27 + i * 0.23, w: 0.84 } : { x: 0.2 + i * 0.3, y: 0.5, w: 0.27 }
        const aspect = tall ? 3.2 : 0.82
        layers.push(card(c, dark, pos, aspect, at, `Card ${i + 1}`))
        layers.push(...stacked(c, pos.y, [title(c, "label", `0${i + 1}`, { x: pos.x, y: 0, w: pos.w * 0.84 }, 1.2, muted, { at: at + 0.15, align: "left" }), title(c, "feature", `{feature${i + 1}}`, { x: pos.x, y: 0, w: pos.w * 0.84 }, tall ? 3.4 : 2.6, ink, { at: at + 0.25, align: "left", lines: 3 })], 0.03))
      }
      return shotOf(c, "Three things", PIECES[6].why, 7, p, layers)
    },
  },
  {
    id: "breakdown",
    name: "Taken apart",
    why: "The screen taken apart into its components, each named: how it's made, the craft a screen recording hides.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.feature)
      const { muted } = inks(c, p)
      return shotOf(c, "Taken apart", PIECES[7].why, 7, p, [{ kind: "breakdown", anim: "{screen}", mockup: "phone", view: "stack", focus: 0, max: 5, lines: false, labels: true, box: { x: 0.5, y: 0.5, w: 1 }, enter: "fade" } as ScriptLayer, title(c, "label", "{kicker}", { x: 0.5, y: 0.08, w: 0.6 }, 1.3, muted, { at: 0.2 })], { view: undefined })
    },
  },
  {
    id: "collage",
    name: "Every screen",
    why: "Its screens together, fanned and floating, the line under them: the product as a whole.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.interlude)
      const { ink } = inks(c, p)
      const tall = c.frame.tall
      const cards: ScriptLayer[] = [0, 1, 2].flatMap((i) => {
        const which = i === 0 || c.screens <= i ? "{screen}" : `{screen${i + 1}}`
        const x = tall ? 0.5 + (i - 1) * 0.28 : 0.5 + (i - 1) * 0.17
        const at = 0.2 + Math.abs(i - 1) * 0.25
        return screenCard(c, which, x, tall ? 0.44 : 0.44, tall ? 0.42 : 0.66, at, 6 * c.b, (i - 1) * 12).map((l, j) => (j === 1 ? ({ ...l, rot: (i - 1) * 7 } as ScriptLayer) : l))
      })
      return shotOf(c, "Every screen", PIECES[8].why, 6, p, [...cards, title(c, "line", "{tagline}", { x: 0.5, y: tall ? 0.84 : 0.88, w: 0.8 }, 2.6, ink, { at: 1.2, lines: 2 })])
    },
  },
  {
    id: "montage",
    name: "Montage",
    why: "Quick looks from new sides, each swinging into the next on the beat: energy before the close.",
    make: (c) => {
      const p = groundAt(c, "glow")
      const sides = c.r() < 0.5 ? ["swing:worm:From below", "swing:over:Over it", "swing:profile:Edge on"] : ["swing:dutch:Off the level", "swing:top:From above", "swing:heroLeft:From the left"]
      return sides.slice(0, c.frame.tall ? 2 : 3).map((s) => ({ ...beatOf(s)!(c.r), dur: r2(3 * c.b), ground: groundOfStack(p), paints: p }))
    },
  },
  {
    id: "detail",
    name: "A detail, close",
    why: "Open close on a detail of the product, the camera already moving: curiosity before the reveal.",
    make: (c) => {
      const p = groundAt(c, "noir")
      const s = beatOf("detail-top")!(c.r)
      return { ...s, dur: r2(5 * c.b), ground: groundOfStack(p), paints: p }
    },
  },
  {
    id: "breath",
    name: "A breath",
    why: "The line alone on moving light, lit word by word: a breath between the busier shots.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.interlude)
      const { ink } = inks(c, p)
      return shotOf(c, "A breath", PIECES[11].why, 5, p, [title(c, "line", "{tagline}", { x: 0.5, y: 0.5, w: c.frame.tall ? 0.84 : 0.66 }, 4.4, ink, { at: 0.3, font: c.ad.type.display, weight: c.ad.type.display === "serif" ? 400 : 560, lines: 3 })], { view: { from: VIEW, to: { x: 0.5, y: 0.47, zoom: 1.1 }, ease: LINEAR } })
    },
  },
  {
    id: "number",
    name: "The proof",
    why: "The one number or proof the product has, huge and filled with light: a claim people remember.",
    make: (c) => {
      // the copy's proof line, or a number the content reader found in the product's own words
      const stat = c.content?.stats[0]
      if (!c.copy.proof?.trim() && !stat) return null
      const p = groundAt(c, c.ad.grounds.reveal)
      const { ink, muted } = inks(c, p)
      const big = c.copy.proof?.trim() ? "{proof}" : stat!.value
      const under = c.copy.proof?.trim() ? "{name}" : stat!.label || "{name}"
      return shotOf(c, "The proof", PIECES[12].why, 4, p, stacked(c, 0.5, [title(c, "name", big, { x: 0.5, y: 0, w: 0.86 }, 8, ink, { at: 0.25, paint: titleFill(c.ad.type.nameFill === "ink" ? "accent" : c.ad.type.nameFill, c.look, groundOfStack(p)) }), title(c, "label", under, { x: 0.5, y: 0, w: 0.5 }, 1.3, muted, { at: 0.8 })], 0.04))
    },
  },
  {
    id: "end",
    name: "The end card",
    why: "The name, the line under it and a button: what the viewer keeps, and what to do next.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.end, { x: 0.5, y: 0.45 })
      const { ink, muted } = inks(c, p)
      const tall = c.frame.tall
      const cta = said(c, "{cta}")
      const pillW = r2(Math.min(0.5, ((cta.length * 0.62 + 3.2) * 1.5 * Math.min(1.4, c.frame.k)) / 100))
      // the button in the palette's own vivid colour (a muted accent made a grey button), its label reading on it
      const pill = paletteOf(c.look, Math.max(30, c.ad.spread), Math.max(0.75, c.ad.energy)).a
      // white when it reads at 4.5:1, else near black (which then always does): measured, since readable() can't
      // lighten white and hands it back unchanged
      const on = contrast("#ffffff", pill) >= 4.5 ? "#ffffff" : "#111113"
      const words = stacked(c, tall ? 0.44 : 0.42, [title(c, "name", "{name}", { x: 0.5, y: 0, w: 0.8 }, 8.4, ink, { at: 0.2, paint: titleFill(c.ad.type.nameFill, c.look, groundOfStack(p)), lines: 1 }), title(c, "line", "{tagline}", { x: 0.5, y: 0, w: 0.62 }, 2.2, muted, { at: 0.8, lines: 2, enter: "words" })], 0.03)
      const under = Math.max(...words.map((l) => (l.kind === "text" ? l.box.y + heightOf(c, l) / 2 : 0)))
      const pillH = (pillW / 3.4) * c.frame.ar
      const by = r2(Math.min(0.9, under + 0.05 + pillH / 2))
      return shotOf(c, "The end card", PIECES[13].why, 6, p, [
        ...words,
        { kind: "shape", name: "Button", shape: "rect", box: { x: 0.5, y: by, w: pillW }, aspect: 3.4, radius: 10, paint: [paintOf("solid", [[pill, 1, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 })], enter: "scale", entry: { at: r2(1.2), dur: 0.6, ease: EXPO } } as ScriptLayer,
        { ...title(c, "line", "{cta}", { x: 0.5, y: by, w: pillW }, 1.5, on, { at: 1.35, lines: 1, enter: "fade", weight: 600 }), name: "Button label" } as ScriptLayer,
      ], { view: { from: { x: 0.5, y: 0.5, zoom: 1.04 }, to: VIEW, ease: EXPO } })
    },
  },
  {
    id: "type-cta",
    name: "The call, typed",
    why: "The call to action typed out with its caret, the name small above: an ending that asks for one thing.",
    make: (c) => {
      const p = groundAt(c, c.ad.grounds.end)
      const { ink, muted } = inks(c, p)
      return shotOf(c, "The call", PIECES[14].why, 5, p, stacked(c, 0.48, [title(c, "label", "{name}", { x: 0.5, y: 0, w: 0.6 }, 1.4, muted, { at: 0.15 }), title(c, "feature", "{cta}", { x: 0.5, y: 0, w: 0.86 }, 6.4, ink, { at: 0.4, enter: "type", lines: 1, font: "mono", weight: 500 })], 0.03))
    },
  },
]
PIECES.push({
  id: "counts",
  name: "What's in it, counted",
  why: "The product's own counts, one a beat (its screens, its components), then its name: real numbers, the scale of the thing.",
  make: (c) => {
    const n = c.content
    if (!n || n.screens + n.components < 4) return null
    const beats = [n.screens > 1 && `${n.screens} screens.`, n.components > 1 && `${n.components} components.`, "One {name}."].filter(Boolean) as string[]
    const p = groundAt(c, c.ad.grounds.hook)
    const { ink } = inks(c, p)
    const layers = beats.map((w, i) => {
      const at = 0.15 + i * c.b
      const last = i === beats.length - 1
      return title(c, "hook", w, { x: 0.5, y: 0.5, w: 0.9 }, 10, ink, { at, lines: 1, enter: "slam", name: `Count ${i + 1}`, ...(last ? { paint: titleFill(c.ad.type.nameFill === "ink" ? "accent" : c.ad.type.nameFill, c.look, groundOfStack(p)) } : { exit: { at: r2(at + c.b - 0.08), dur: 0.06, kind: "fade" as const } }) })
    })
    return shotOf(c, "Counted", "The product's own counts, one a beat, then its name.", beats.length + 2, p, layers)
  },
})
const piece = (id: string) => PIECES.find((p) => p.id === id)!

/* ---------------- stories ---------------- */

/** A kind of film's story: its pieces in order, each with how much it matters (the short cut keeps the 3s, the
    standard the 2s and up, the long all of them). */
type Story = { id: string; name: string; tempo?: number; steps: [piece: string, keep: 1 | 2 | 3][] }
export const STORIES: Story[] = [
  { id: "product-launch", name: "Product launch", steps: [["slam", 3], ["detail", 1], ["meet", 3], ["hero", 3], ["ui", 3], ["split", 2], ["trio", 2], ["ui", 1], ["counts", 2], ["montage", 1], ["collage", 2], ["number", 1], ["breath", 1], ["end", 3]] },
  { id: "feature-launch", name: "Feature launch", steps: [["beats", 3], ["meet", 3], ["ui", 3], ["breakdown", 2], ["split", 2], ["ui", 1], ["trio", 1], ["breath", 1], ["end", 3]] },
  { id: "product-demo", name: "Product demo", steps: [["slam", 2], ["ui", 3], ["ui", 3], ["ui", 2], ["breakdown", 2], ["counts", 1], ["collage", 1], ["split", 1], ["end", 3]] },
  { id: "teaser", name: "Teaser", tempo: 0.9, steps: [["detail", 3], ["beats", 3], ["montage", 1], ["breath", 2], ["meet", 3], ["type-cta", 1]] },
  { id: "brand", name: "Brand film", tempo: 0.85, steps: [["breath", 3], ["hero", 3], ["beats", 2], ["montage", 1], ["collage", 1], ["meet", 3], ["end", 2]] },
  { id: "social", name: "Social", tempo: 1.12, steps: [["slam", 3], ["hero", 3], ["ui", 2], ["trio", 1], ["number", 1], ["type-cta", 3]] },
]

/* ---------------- directing ---------------- */

/** The art directions for a brief, best first: your taste's lean on each (and on the kind of film), a little exploring
    so it doesn't only ever make what it made before. */
export function rankDirections(b: Brief): ArtDirection[] {
  const r = rng((b.seed ?? 1) * 31 + 7)
  const lean = (f: string) => b.taste?.weights.find((w) => w.feature === f)?.lean ?? 0
  return [...DIRECTIONS, ...(b.directions ?? [])].map((ad) => ({ ad, s: 1 + lean(`style:${ad.id}`) + 0.35 * lean(`look:${ad.harmony}`) + r() * 0.6 })).sort((x, y) => y.s - x.s).map((x) => x.ad)
}

/** A whole film for the brief, directed in one art direction. */
/** An art direction by id, built in or your own. */
export const directionOf = (b: Brief, id?: string) => [...DIRECTIONS, ...(b.directions ?? [])].find((d) => d.id === id)

export function direct(b: Brief, ad: ArtDirection = directionOf(b, b.style) ?? rankDirections(b)[0]): TemplateScript {
  const seed = b.seed ?? 1
  const story = STORIES.find((s) => s.id === b.category) ?? STORIES[0]
  const size = b.size ?? (story.id === "social" ? "9x16" : "16x9")
  const frame = FRAMES[size] ?? FRAMES["16x9"]
  const tempo = Math.round(ad.tempo * (story.tempo ?? 1) * (b.taste ? 1 / Math.max(0.85, Math.min(1.15, b.taste.prefer.pace)) : 1))
  const keep = b.length === "short" ? 3 : b.length === "long" ? 1 : 2
  const look = lookFor(ad.anchor ?? b.accent, ad.harmony, seed)
  const content = profileOf({ name: b.copy.name, kicker: b.copy.kicker, hook: b.copy.hook, tagline: b.copy.tagline, cta: b.copy.cta, features: b.copy.features, proof: b.copy.proof, screens: Math.max(1, b.screens ?? 1), components: b.components ?? 0, componentNames: b.componentNames })
  const c: Ctx = { ad, look, frame, b: 60 / tempo, r: rng(seed * 97 + 13), copy: b.copy, screens: Math.max(1, Math.min(3, b.screens ?? 1)), seed, n: 0, f: 0, content }
  const shots: ScriptShot[] = []
  const used: string[] = []
  for (const [id, k] of story.steps) {
    if (k < keep) continue
    if (id === "breakdown" && b.live === false) continue
    // what the product has decides what can be shown: three cards need features, a collage more than one screen
    if (id === "trio" && content.features.length < 2) continue
    if (id === "collage" && content.screens < 2 && keep > 1) continue
    const made = piece(id).make(c)
    c.n++
    if (!made) continue
    const list = Array.isArray(made) ? made : [made]
    shots.push(...list.map((s) => ({ ...s, why: `${s.why}` })))
    used.push(id)
  }
  const film: TemplateScript = {
    id: `artist-${story.id}-${ad.id}-${seed}`,
    name: `${story.name} · ${ad.name}`,
    version: 1,
    source: `directed by the Artist: ${story.name.toLowerCase()} in ${ad.name} (seed ${seed}, ${tempo} bpm)`,
    category: story.id,
    summary: `${used.map((u) => piece(u).name).join(" → ")}. ${ad.hint}`,
    size,
    ground: groundOfStack(shots[0]?.paints ?? []) || look.ground,
    light: look.dark ? "dramatic" : "studio",
    look: { harmony: ad.harmony, seed, anchor: b.accent },
    why: [ad.hint, `Timed to ${tempo} beats a minute: every shot is a whole number of beats, every title lands on one.`, "Every cut has a carrier (§5): the move going on, a whip, a push through, an iris, a wipe."],
    avoid: ["A dip to a flat colour.", "Two titles fighting in one frame.", "A device held still while words animate round it."],
    shots,
    artist: { style: ad.id, story: story.id, pieces: used },
    ...(b.type?.display || b.type?.text ? { type: b.type } : ad.faces ? { type: ad.faces } : {}),
  }
  return smoothCuts(film, ad.prefer).script
}

/** Takes: the same brief directed `n` ways (different art directions, best first by your taste; one direction asked
    for: that one, with different seeds). */
export function takes(b: Brief, n = 3): TemplateScript[] {
  const fixed = directionOf(b, b.style)
  if (fixed) return Array.from({ length: n }, (_, i) => direct({ ...b, seed: (b.seed ?? 1) + i * 101 }, fixed))
  return rankDirections(b)
    .slice(0, n)
    .map((ad, i) => direct({ ...b, seed: (b.seed ?? 1) + i * 101 }, ad))
}

/** A set of mockup stills on the art direction's grounds: the product on its device from the angles a studio shoots,
    each a scene to export as a picture. */
export function mockups(b: Brief, ad: ArtDirection = directionOf(b, b.style) ?? rankDirections(b)[0]): TemplateScript {
  const seed = b.seed ?? 1
  const look = lookFor(b.accent, ad.harmony, seed)
  const size = b.size ?? "4x5"
  const frame = FRAMES[size] ?? FRAMES["4x5"]
  const c: Ctx = { ad, look, frame, b: 0.6, r: rng(seed * 53 + 5), copy: b.copy, screens: b.screens ?? 1, seed, n: 0, f: 0 }
  const SET: { name: string; ground: GradientKind; from: Record<string, unknown>; title?: boolean }[] = [
    { name: "Hero, ¾", ground: ad.grounds.reveal, from: { angle: "hero", zoom: 0.9 }, title: true },
    { name: "From above", ground: ad.grounds.feature, from: { angle: "top", zoom: 0.95 } },
    { name: "Close on the top", ground: "noir", from: { angle: "front", zoom: 2.5, rise: -0.62, roll: -8, yaw: -12, elev: 14 } },
    { name: "From below", ground: ad.grounds.interlude, from: { angle: "worm", zoom: 0.9 } },
    { name: "Edge on", ground: ad.grounds.end, from: { angle: "profile", zoom: 1 } },
    { name: "Over the top", ground: ad.grounds.hook, from: { angle: "over", zoom: 1.2 } },
  ]
  const shots: ScriptShot[] = SET.map((m, i) => {
    c.n = i
    const p = groundAt(c, m.ground, { x: 0.5, y: 0.5 })
    const { ink } = inks(c, p)
    return { name: m.name, dur: 2.5, why: "A still: the product on its device, lit and framed the way a studio shoots it.", ground: groundOfStack(p), paints: p, fx: { ...ad.fx, ...((m.from.zoom as number) >= 1.8 ? { focus: { at: 0.36, to: null, size: 0.28, blur: 0.6, angle: -8 } } : {}) }, device: { id: "{device}", from: m.from, to: { zoom: r2((m.from.zoom as number) * 1.01) }, ease: LINEAR }, ...(m.title ? { layers: [title(c, "name", "{name}", { x: 0.5, y: frame.tall ? 0.09 : 0.1, w: 0.7 }, 3.6, ink, { at: 0, enter: "none", lines: 1 })] } : {}) } as ScriptShot
  })
  return { id: `mockups-${ad.id}-${seed}`, name: `Mockups · ${ad.name}`, version: 1, source: `mockup stills by the Artist in ${ad.name}`, category: "brand", summary: "Six stills of the product on its device: hero, from above, close on the top, from below, edge on, over the top.", size, ground: shots[0].ground ?? look.ground, light: look.dark ? "dramatic" : "studio", look: { harmony: ad.harmony, seed, anchor: b.accent }, why: ["Each scene is a still: export it as a picture."], avoid: [], shots: shots.map((s, i) => (i ? { ...s, cut: "cut" } : s)), artist: { style: ad.id, story: "mockups", pieces: SET.map((m) => m.name.toLowerCase().replace(/[^a-z]+/g, "-")) } }
}

/** New shots for a film in the Studio, by the Artist, after a shot: set pieces that aren't another angle (words on the
    beat, the feature in the interface, three cards, a breath, the end card), on the film's own colour. */
export function artistShots(o: { accent: string; copy: Copy; style?: string; size?: string; seed?: number }): { shot: ScriptShot; piece: string }[] {
  const ad = DIRECTIONS.find((d) => d.id === o.style) ?? DIRECTIONS[0]
  const frame = FRAMES[o.size ?? "16x9"] ?? FRAMES["16x9"]
  const seed = o.seed ?? 1
  const c: Ctx = { ad, look: lookFor(o.accent, ad.harmony, seed), frame, b: 60 / ad.tempo, r: rng(seed), copy: o.copy, screens: 1, seed, n: 0, f: 0 }
  return ["beats", "ui", "trio", "breath", "end"].flatMap((id) => {
    const made = piece(id).make(c)
    c.n++
    const s = Array.isArray(made) ? made[0] : made
    return s ? [{ shot: s, piece: piece(id).name }] : []
  })
}

/* ---------------- your own art directions ---------------- */

const KINDS: GradientKind[] = ["mesh", "aurora", "spotlight", "swirl", "horizon", "duotone", "prism", "glow", "dusk", "noir"]
const HARMS: Harmony[] = ["tonal", "deep", "light", "pop", "complement", "analogous", "studio"]
const ENTERS_OK = ["words", "sweep", "type", "mask", "letters", "settle", "fade", "rise", "blur", ...TEXT_ANIMS.map((a) => a.id)]
const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const oneOfS = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)

/** An art direction as it came from outside (your editor, a file): every field checked, the rest from `base`. */
export function validDirection(raw: unknown, base: ArtDirection = DIRECTIONS[0]): ArtDirection | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  if (!o || typeof o.name !== "string" || !o.name.trim()) return null
  const g = (o.grounds && typeof o.grounds === "object" ? o.grounds : {}) as Record<string, unknown>
  const t = (o.type && typeof o.type === "object" ? o.type : {}) as Record<string, unknown>
  const ti = (o.titles && typeof o.titles === "object" ? o.titles : {}) as Record<string, unknown>
  const f = (o.faces && typeof o.faces === "object" ? o.faces : {}) as Record<string, unknown>
  const own = (o.own && typeof o.own === "object" ? o.own : {}) as Record<string, unknown>
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined)
  // only the curated faces: they're the ones a film knows how to load
  const face = (v: unknown) => (FACES.some((x) => x.name === v) ? (v as string) : undefined)
  const picture = typeof own.picture === "string" && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(own.picture) && own.picture.length < 60000 ? own.picture : undefined
  const id = typeof o.id === "string" && /^own-[a-z0-9-]{1,40}$/.test(o.id) ? o.id : `own-${o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "direction"}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name: o.name.trim().slice(0, 40),
    hint: typeof o.hint === "string" ? o.hint.slice(0, 200) : "Your own art direction.",
    harmony: oneOfS(o.harmony, HARMS, base.harmony),
    grounds: { hook: oneOfS(g.hook, KINDS, base.grounds.hook), reveal: oneOfS(g.reveal, KINDS, base.grounds.reveal), feature: oneOfS(g.feature, KINDS, base.grounds.feature), interlude: oneOfS(g.interlude, KINDS, base.grounds.interlude), end: oneOfS(g.end, KINDS, base.grounds.end) },
    energy: clampN(o.energy, 0, 1, base.energy),
    speed: clampN(o.speed, 0, 2, base.speed),
    spread: clampN(o.spread, 0, 180, base.spread),
    type: { display: oneOfS(t.display, ["display", "serif"] as const, base.type.display), weight: Math.round(clampN(t.weight, 300, 900, base.type.weight)), label: oneOfS(t.label, ["mono", "text"] as const, base.type.label), nameFill: oneOfS(t.nameFill, ["accent", "spectrum", "chrome", "ink"] as const, base.type.nameFill) },
    titles: { hook: oneOfS(ti.hook, ENTERS_OK, base.titles.hook), name: oneOfS(ti.name, ENTERS_OK, base.titles.name), feature: oneOfS(ti.feature, ENTERS_OK, base.titles.feature), line: oneOfS(ti.line, ENTERS_OK, base.titles.line), label: "fade" },
    cards: oneOfS(o.cards, ["glass", "solid", "outline"] as const, base.cards),
    radius: clampN(o.radius, 0, 4, base.radius),
    fx: base.fx,
    tempo: Math.round(clampN(o.tempo, 70, 150, base.tempo)),
    prefer: base.prefer,
    arrive: oneOfS(o.arrive, ["rise", "flip", "spin", "fall", "crane"] as const, base.arrive),
    ...(hex(o.anchor) ? { anchor: hex(o.anchor) } : {}),
    ...(face(f.display) || face(f.text) ? { faces: { ...(face(f.display) ? { display: face(f.display) } : {}), ...(face(f.text) ? { text: face(f.text) } : {}) } } : {}),
    own: { ...(typeof own.from === "string" ? { from: own.from.slice(0, 80) } : {}), ...(picture ? { picture } : {}) },
  }
}

/** An art direction read off your pictures' colours (most covered first): light or dark from the ground, vivid or calm
    from their chroma, how far the hues reach, the accent, and gradient worlds to match that mood. */
export function directionFromPalette(colors: string[], name: string, accent: string | null, base: ArtDirection = DIRECTIONS[0]): ArtDirection {
  const all = colors.map((c) => lch(c))
  const ground = all[0] ?? { l: 0.2, c: 0, h: 0 }
  const lit = all.slice(0, 6).reduce((a, x, i) => a + x.l * (6 - i), 0) / Math.max(1, all.slice(0, 6).reduce((a, _, i) => a + (6 - i), 0))
  const dark = lit < 0.48
  const vivid = all.filter((x) => x.c > 0.06)
  const chroma = vivid.length ? vivid.reduce((a, x) => a + x.c, 0) / vivid.length : 0
  const energy = Math.min(1, Math.max(0.2, chroma / 0.16))
  const hues = vivid.map((x) => x.h).sort((a, b) => a - b)
  let range = 0
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) range = Math.max(range, Math.min(360 - Math.abs(hues[i] - hues[j]), Math.abs(hues[i] - hues[j])))
  const harmony: Harmony = !vivid.length ? (dark ? "studio" : "light") : ground.c > 0.09 ? "pop" : range > 140 ? "complement" : range > 50 ? "analogous" : dark ? "deep" : energy > 0.6 ? "tonal" : "light"
  const grounds: ArtDirection["grounds"] = dark
    ? energy > 0.55
      ? { hook: "aurora", reveal: "swirl", feature: "glow", interlude: "prism", end: "swirl" }
      : { hook: "noir", reveal: "spotlight", feature: "glow", interlude: "aurora", end: "spotlight" }
    : energy > 0.55
      ? { hook: "duotone", reveal: "mesh", feature: "mesh", interlude: "prism", end: "mesh" }
      : { hook: "glow", reveal: "dusk", feature: "glow", interlude: "horizon", end: "glow" }
  return validDirection({ ...base, name, hint: `Read off your pictures: ${dark ? "dark" : "light"}, ${energy > 0.6 ? "vivid" : energy > 0.35 ? "measured" : "calm"} colour${range > 50 ? `, hues reaching ${Math.round(range)}°` : ""}.`, harmony, grounds, energy: Math.round(energy * 100) / 100, spread: Math.round(Math.min(150, Math.max(20, range || 40))), anchor: accent ?? undefined, own: { from: "your pictures" } }, base)!
}
