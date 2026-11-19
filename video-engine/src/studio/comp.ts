// Studio — a composition: scenes played one after another, each a set of layers (devices with live screens, component
// animations outside any device, images, titles) over one background. Plain data: the engine edits it, keeps it
// between visits, and hands it to the export page, which draws it the same way.
import type { DeviceId, Posture } from "../devices"
import { fillSlots, type ProductKit } from "./product"
import { slotsFor } from "./library"
import { byId, type Values } from "../registry"
import type { Copy } from "./copy"
import type { SceneFx } from "./fx"
import type { Paint } from "./paint"
import type { AngleId, MotionId } from "./poses"
import type { TextAnim } from "./textanim"

/** What a device's screen shows: whatever is open in the engine, one animation from the library, or a picture. */
export type Content = { kind: "current" } | { kind: "anim"; id: string } | { kind: "image"; src: string; name: string }
/** A flat layer's place: centre and width as fractions of the frame. Its height follows its own aspect. */
export type Box = { x: number; y: number; w: number }
export type Enter = "none" | "fade" | "rise" | "scale" | "blur"
/** How a title comes in. Beyond the block entrances: words rising one by one, a light sweeping across the words (the
    launch films' feature lines), a typewriter with its caret, lines rising out of a mask, and words parting around
    the middle so a device can stand between them ("for smarter | group selfies": the bar marks the split). */
export type TextEnter = Enter | "words" | "sweep" | "type" | "mask" | "part" | "letters" | "settle" | "custom"
/** How the camera treats a component: flat on, tilted back and settling, a slow push, an extreme close-up gliding
    across one part of it, a gentle float, or an orbit. */
export type Shot = "flat" | "tilt" | "dolly" | "macro" | "float" | "orbit"
/** Where a device stands in a group: the primary in the middle, the others either side of it. */
export type Slot = "center" | "left" | "right"

type Base = { id: string; name?: string; hidden?: boolean }

/* ---------------- motion: Raylight's model — an In, an Out, and animation blocks on property lanes ---------------- */

/** A property a layer can animate. Values are offsets from the layer's own (opacity is absolute): position [dx, dy] in
    fractions of the frame, scale a factor, rotate degrees, opacity 0–1, blur in % of the frame's width, tilt [x°, y°]. */
export type Prop = "position" | "scale" | "rotate" | "opacity" | "blur" | "tilt"
/** One animation block: a property moving from one value to another, `at` seconds into the scene, for `dur`, on a
    curve. Before it starts the layer holds its `from` (if it's the property's first block); after, its `to`. */
export type Tween = { id: string; prop: Prop; at: number; dur: number; from: number[]; to: number[]; ease: string }
/** When an In or an Out plays (seconds into the scene) and on what curve (cubic-bezier; none: the preset's own). */
export type Timing = { at: number; dur: number; ease?: string }
export type Exit = Timing & { kind: Enter }
export const PROPS: { id: Prop; name: string; rest: number[]; labels: string[]; unit: string; min: number; max: number; step: number }[] = [
  { id: "position", name: "Position", rest: [0, 0], labels: ["X", "Y"], unit: "%", min: -120, max: 120, step: 1 },
  { id: "scale", name: "Scale", rest: [1], labels: ["Scale"], unit: "×", min: 0, max: 4, step: 0.01 },
  { id: "rotate", name: "Rotation", rest: [0], labels: ["Angle"], unit: "°", min: -360, max: 360, step: 1 },
  { id: "opacity", name: "Opacity", rest: [1], labels: ["Opacity"], unit: "%", min: 0, max: 100, step: 1 },
  { id: "blur", name: "Blur", rest: [0], labels: ["Blur"], unit: "", min: 0, max: 10, step: 0.1 },
  { id: "tilt", name: "Tilt", rest: [0, 0], labels: ["X", "Y"], unit: "°", min: -80, max: 80, step: 1 },
]
/** What every flat layer can carry beyond its kind: when its In plays, its Out, its animation blocks, and how it's
    turned, tilted, faded and blurred at rest (Raylight's Design tab). */
export type Motion = {
  /** its In: when and how long the `enter` preset plays (without it, a beat after the scene starts, one after another) */
  entry?: Timing
  exit?: Exit
  tweens?: Tween[]
  /** degrees */
  rot?: number
  /** leaned back into the frame: degrees about x and y (3D tilt) */
  tilt?: { x: number; y: number }
  /** 0–1 */
  opacity?: number
  /** % of the frame's width */
  blur?: number
}
/** A selection frame drawn round a picture or a component: an editor's blue outline with square handles. */
export type Frame = { frame?: "selection"; frameColor?: string }
/** How a picture or a video sits on a device's screen: filling it (cropped), whole (letterboxed), or turned to fill it
    when its shape doesn't match the screen's (a landscape film on a portrait phone). */
export type ScreenFit = "fill" | "whole" | "auto"
/** `case`: in a case of that colour (matte, over the band and the back); `fit` and `turn`: how its picture or video
    sits on the screen, and turned by a quarter, a half or three quarters */
export type DeviceLayer = Base & { kind: "device"; device: DeviceId; slot: Slot; finish?: string; case?: string; posture: Posture; landscape: boolean; content: Content; hairline?: boolean; fit?: ScreenFit; turn?: 0 | 90 | 180 | 270 }
export type ComponentLayer = Base &
  Motion &
  Frame & {
  kind: "component"
  anim: string
  box: Box
  aspect: number
  enter: Enter
  hairline?: boolean
  shot?: Shot
  focus?: { x: number; y: number }
  /** this layer's own values for the component's properties (its words, its screen, its colours), over the library's */
  values?: Values
  /** sized to the component: its shape follows what it measures, and swapping it for another grows or shrinks the box */
  fit?: boolean
  /** what it last measured, px (a centred component's own box) */
  natural?: { w: number; h: number }
  /** a launch film cut into scenes: where in the film this scene starts (s); the playhead drives its clock from there */
  from?: number
  /** a launch film's speed in this scene (its shot retimed: 0.8 plays its motion slower, to fill a longer scene) */
  rate?: number
}
/** `blend: "screen"`: its black drops away (a shader video on black, laid over the film's world) */
export type ImageLayer = Base & Motion & Frame & { kind: "image"; src: string; file: string; aspect: number; box: Box; radius: number; enter: Enter; hairline?: boolean; blend?: "screen" | "lighten" | "multiply" }
export type TextLayer = Base &
  Motion & {
  kind: "text"
  text: string
  box: Box
  size: number
  weight: number
  align: "left" | "center" | "right"
  enter: TextEnter
  color: string
  /** display: the brand's display face, set tight; mono: small spaced caps, for labels */
  font?: "text" | "display" | "mono" | "serif"
  /** "part": how far the two halves open, in % of the frame's width */
  gap?: number
  /** a gradient fill instead of a colour (a stack, back to front, drawn across the whole title) */
  paint?: Paint[]
  /** "custom": its own animation, piece by piece (textanim.ts) */
  animation?: TextAnim
}
/** A screen taken apart into its components (a header, a search bar, tabs, cards, a tab bar), each a live plate cut
    from the running screen. The screen sits in its device, drawn flat; the components lift out onto the table beside
    it, fly back in, float above it in a stack, or one is shown on its own, close. See breakdown.tsx. */
export type BreakdownLayer = Base & {
  kind: "breakdown"
  anim: string
  /** the device the screen sits in, drawn flat and front on */
  mockup: "phone" | "tablet" | "none"
  /** table: out of the screen onto the table; assemble: back in; stack: floating above it; focus: one, close */
  view: "table" | "assemble" | "stack" | "focus"
  /** focus: which component, by interest (0 is the most interesting) */
  focus: number
  /** at most this many components, top of the screen first */
  max: number
  /** the screen and its components drawn as hairlines */
  lines: boolean
  labels: boolean
  /** a label per component, where the names it reports won't do */
  names?: string[]
  /** unused (it fills the frame), kept so every flat layer has one */
  box: Box
  enter: Enter
}
/** A label with a leader line, like a technical drawing's: a title, a smaller line under it, and a thin line that
    runs from the label to the point it names. */
export type CalloutLayer = Base & { kind: "callout"; text: string; sub: string; box: Box; at: { x: number; y: number }; enter: Enter; color: string }
/** A plain shape filled with a paint stack (a colour or gradients): a card, a frame, a dot, a glossy orb. */
export type ShapeLayer = Base &
  Motion & {
    kind: "shape"
    shape: "rect" | "ellipse"
    box: Box
    aspect: number
    /** corners, % of the frame's width */
    radius: number
    paint: Paint[]
    stroke?: { color: string; width: number }
    /** a soft drop shadow under it */
    shadow?: boolean
    enter: Enter
  }
/** A collaborator's cursor, the way multiplayer editors draw one: an arrow and a name pill. Position tweens move it. */
export type CursorLayer = Base & Motion & { kind: "cursor"; label: string; color: string; box: Box; enter: Enter }
export type Layer = DeviceLayer | ComponentLayer | ImageLayer | TextLayer | BreakdownLayer | CalloutLayer | ShapeLayer | CursorLayer
export type FlatLayer = ComponentLayer | ImageLayer | TextLayer | BreakdownLayer | CalloutLayer | ShapeLayer | CursorLayer
/** The flat layers that move with Raylight's motion model (a breakdown and a callout keep their own). */
export type MovingLayer = ComponentLayer | ImageLayer | TextLayer | ShapeLayer | CursorLayer
export const moving = (l: Layer): l is MovingLayer => l.kind === "component" || l.kind === "image" || l.kind === "text" || l.kind === "shape" || l.kind === "cursor"

/** flash: a colour flash, the picture going to false colour around a hard cut (Raylight's signature transition).
    The carriers (studio/cuts.ts): whip, a swing with motion blur the way the camera was going; through, a push that
    goes on through the frame; iris, the next shot opening out of the subject; wipe, a line carrying it across. */
export type Transition = "cut" | "fade" | "dissolve" | "push" | "zoom" | "blur" | "flash" | "whip" | "through" | "iris" | "wipe"
/** The 3D camera: an angle to start from, then turned (yaw), raised (elev), brought closer (zoom) and through a lens
    (fov); the device itself pitched and rolled; the subject shifted up (rise) or right (pan) in the frame, in
    fractions of it — at a close zoom, which part of the device fills the shot. */
export type Camera = { angle: AngleId; yaw: number; elev: number; zoom: number; fov: number | null; pitch?: number; roll?: number; rise?: number; pan?: number }
/** A flat camera over the scene's flat layers: the point of the frame that sits in the middle (fractions) and how close. */
export type View2D = { x: number; y: number; zoom: number }
export const VIEW: View2D = { x: 0.5, y: 0.5, zoom: 1 }
export type Scene = {
  id: string
  name: string
  /** what the shot is for, as its director meant it (screenplay.ts Meaning): its role in the story (hook, turn, proof,
      cta), the one belief it buys, the words on it, what carries it, what it shows. The cross-checker reads it. */
  meaning?: { role: string; buys: string; says: string; carrier: string; shows: string }
  /** seconds */
  duration: number
  /** how this scene takes over from the one before it */
  transition: Transition
  camera: Camera
  move: MotionId
  /** "Two framings": where the shot ends (the 3D camera, and the flat camera over the flat layers), and the curve it
      travels on from the start (cubic-bezier) */
  camera2?: Camera
  view?: View2D
  view2?: View2D
  ease?: string
  /** where the devices sit in the frame: the middle, or one side, leaving the other for a component or a title */
  frame: Slot
  /** how the devices come into the scene */
  arrival: "none" | "drop" | "slide"
  /** the devices taken apart: coming apart into their parts (labelled), held apart, or assembling from them */
  teardown?: "none" | "apart" | "hold" | "assemble"
  /** this scene's own background; without it the composition's (or, with Auto on, the director's choice) */
  look?: Partial<SceneLook>
  /** effects over the finished shot (depth of field, bloom, a grade…), over the composition's own */
  fx?: SceneFx
  /** back to front */
  layers: Layer[]
}
/** `paint`: gradients over the fill (back to front), Figma's fills */
export type SceneLook = { fill: string; effect: Effect; ink: string; amount: number; paint?: Paint[] }

export type Effect = "none" | "glow" | "dots" | "grid" | "lines" | "noise" | "dither" | "sheet"
export type Light = "studio" | "dramatic" | "soft"
export type Comp = {
  v: 2
  size: string
  fps: 30 | 60
  /** what Export makes: a still, a video, or a page that plays by itself (the web player) */
  kind: "png" | "video" | "web"
  /** a BACKDROPS id or a CSS colour */
  fill: string
  effect: Effect
  /** the effect's colour; "" picks black or white against the fill */
  ink: string
  /** how strong the effect is, 0 to 1 */
  amount: number
  /** gradients over the fill, back to front (Figma's fills); a scene can have its own */
  paint?: Paint[]
  /** effects over every finished shot; a scene's own go over these */
  fx?: SceneFx
  /** a video's motion blur (four moments per frame, a 180° shutter) and ghost trails (0 to 1), made in the export */
  blur?: boolean
  ghost?: number
  /** its song (kept by the dev server), where in the song the film starts, and the song's beats and loudest hits (s, in
      the song: the scenes are cut on them, the song ends on a bar) */
  music?: { url: string; name: string; offset?: number; gain?: number; bpm?: number; beats?: number[]; hits?: number[] }
  /** sound design on its cuts, made in the export (server/sound.ts) */
  sfx?: boolean
  /** its voiceover: a spoken line a scene (kept by the dev server, server/voice.ts), each from a moment into its scene */
  voice?: { lines: { scene: string; text: string; url: string; dur: number }[]; voice: string; language?: string }
  light: Light
  shadow: boolean
  reflections: number
  /** the background director: picks each scene's background from what's in it, and blends between them */
  auto?: boolean
  /** colours and type taken from the product's own design system */
  brand?: Brand
  /** how the Artist directed it (artist.ts), kept so what you do with it teaches the taste */
  artist?: { style: string; story: string; pieces: string[] }
  scenes: Scene[]
}

/** A product's look, read from its design system: its grounds, ink, accent and type. */
export type Brand = {
  name: string
  bg: string
  surface: string
  ink: string
  muted: string
  accent: string
  /** text on the accent */
  onAccent: string
  font: string
  display: string
  mono: string
  radius: number
  /** the product lives on a dark ground */
  dark: boolean
  /** stylesheets that load its fonts (Google Fonts) */
  fonts: string[]
}

export const TRANSITIONS: { id: Transition; name: string; hint: string }[] = [
  { id: "cut", name: "Cut", hint: "Straight to the next scene, the way an edit cuts on a beat. Smoothest when the camera keeps moving the same way across it." },
  { id: "whip", name: "Whip", hint: "A fast swing with motion blur, the way the camera was going: the cut hides in the swing." },
  { id: "through", name: "Push through", hint: "The camera pushes on through the frame and lands in the next scene: one continuous push." },
  { id: "iris", name: "Iris", hint: "The next scene opens out of the subject in a growing circle, a thin ring at its edge." },
  { id: "wipe", name: "Light wipe", hint: "A line of light sweeps across and carries the next scene (and its colour) in behind it." },
  { id: "dissolve", name: "Dissolve", hint: "The two scenes cross for a moment." },
  { id: "fade", name: "Dip", hint: "Out to the background and back in: a new chapter." },
  { id: "push", name: "Push", hint: "The new scene slides the old one out." },
  { id: "zoom", name: "Zoom", hint: "Through the old scene into the new one." },
  { id: "blur", name: "Blur", hint: "A soft focus pull between the two." },
  { id: "flash", name: "Colour flash", hint: "A hard cut inside a flash of false colour, the way Raylight's films cut." },
]
export const ENTERS: { id: Enter; name: string }[] = [
  { id: "rise", name: "Rise" },
  { id: "fade", name: "Fade" },
  { id: "scale", name: "Scale" },
  { id: "blur", name: "Blur in" },
  { id: "none", name: "None" },
]
export const EFFECTS: { id: Effect; name: string }[] = [
  { id: "none", name: "None" },
  { id: "glow", name: "Glow" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Grid" },
  { id: "lines", name: "Lines" },
  { id: "noise", name: "Grain" },
  { id: "dither", name: "Dither" },
  { id: "sheet", name: "Drawing" },
]
export const LIGHTS: { id: Light; name: string; hint: string }[] = [
  { id: "studio", name: "Studio", hint: "Big soft boxes: true colours, clean edges." },
  { id: "dramatic", name: "Keynote", hint: "A dark room and bright rims along every edge, the way launch films light a device." },
  { id: "soft", name: "Soft", hint: "Bright and low-contrast, for light backgrounds." },
]

/** How long a scene's transition in takes, seconds (it overlaps the start of the scene; nothing is added). */
export const XFADE = 0.7
/** Each transition's own length: a whip is over in a blink, an iris takes its time to open. */
export const CUT_DUR: Record<Transition, number> = { cut: 0, fade: XFADE, dissolve: XFADE, push: XFADE, zoom: XFADE, blur: XFADE, flash: XFADE, whip: 0.42, through: 0.56, iris: 0.8, wipe: 0.75 }

export const uid = () => Math.random().toString(36).slice(2, 9)
export const total = (c: Comp) => c.scenes.reduce((s, x) => s + x.duration, 0)
export const starts = (c: Comp) => c.scenes.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + c.scenes[i - 1].duration : 0], [])

/** What's on screen at `t`: the scene it's in, how far into it, and the scene it's taking over from, if it's still
    mid-transition (with the transition's progress, 0 to 1). */
export function at(c: Comp, t: number) {
  const s = starts(c)
  let i = s.findIndex((x, j) => t < x + c.scenes[j].duration)
  if (i < 0) i = c.scenes.length - 1
  const local = t - s[i]
  const sc = c.scenes[i]
  const T = sc.transition === "cut" || i === 0 ? 0 : Math.min(CUT_DUR[sc.transition] ?? XFADE, sc.duration / 2)
  const prev = T && local < T ? { i: i - 1, local: c.scenes[i - 1].duration + local, k: local / T } : null
  return { i, local, prev }
}

export const devicesOf = (s: Scene) => s.layers.filter((l): l is DeviceLayer => l.kind === "device" && !l.hidden)
export const isAnimated = (l: Layer) =>
  l.kind === "device" ? l.content.kind !== "image" : l.kind === "component" || l.kind === "breakdown" || ("enter" in l && l.enter !== "none") || (moving(l) && (!!l.tweens?.length || !!l.exit))
export const TEXT_ENTERS: { id: TextEnter; name: string; hint: string }[] = [
  { id: "custom", name: "Custom", hint: "Its own: what moves (lines, words, letters), from where, how fast, in what order, and how it keeps moving." },
  { id: "letters", name: "Letters", hint: "Letter by letter, each dropping in stretched and settling: kinetic type." },
  { id: "settle", name: "Settle", hint: "Starts huge and soft, and settles into place." },
  { id: "sweep", name: "Sweep", hint: "Every word dim, then a light runs across them: the launch films' feature lines." },
  { id: "words", name: "Words", hint: "Word by word, each rising into place." },
  { id: "part", name: "Part", hint: "The words part around the middle to make room for a device. A | marks where they split." },
  { id: "type", name: "Type", hint: "Typed out, with a caret." },
  { id: "mask", name: "Mask", hint: "Each line rises out of a mask." },
  { id: "blur", name: "Blur in", hint: "Comes into focus as it rises." },
  { id: "rise", name: "Rise", hint: "Rises into place." },
  { id: "fade", name: "Fade", hint: "Fades in." },
  { id: "none", name: "None", hint: "Already there." },
]
export const SHOTS: { id: Shot; name: string; hint: string }[] = [
  { id: "flat", name: "Flat", hint: "Square on to the camera." },
  { id: "tilt", name: "Tilt", hint: "Tilted back in perspective, settling towards the camera." },
  { id: "dolly", name: "Dolly", hint: "A slow push in, a little turned." },
  { id: "macro", name: "Macro", hint: "An extreme close-up gliding across one part of it." },
  { id: "float", name: "Float", hint: "A gentle turn either way, as if held in the air." },
  { id: "orbit", name: "Orbit", hint: "The camera swings round it." },
]

export const CAMERA: Camera = { angle: "hero", yaw: 0, elev: 0, zoom: 1, fov: null }

export const device = (d: DeviceId, slot: Slot = "center", posture: Posture = "open", content: Content = { kind: "current" }): DeviceLayer => ({
  id: uid(),
  kind: "device",
  device: d,
  slot,
  posture,
  landscape: false,
  content,
})
export const component = (anim: string, box: Box = { x: 0.72, y: 0.5, w: 0.3 }): ComponentLayer => ({ id: uid(), kind: "component", anim, box, aspect: 0.75, enter: "rise", fit: true })
export const text = (t: string, box: Box = { x: 0.5, y: 0.5, w: 0.8 }, size = 6, weight = 650, enter: TextEnter = "rise", o: Partial<TextLayer> = {}): TextLayer => ({
  id: uid(),
  kind: "text",
  text: t,
  box,
  size,
  weight,
  align: "center",
  enter,
  color: "",
  ...o,
})
export const breakdown = (anim: string, view: BreakdownLayer["view"], o: Partial<BreakdownLayer> = {}): BreakdownLayer => ({
  id: uid(),
  kind: "breakdown",
  anim,
  mockup: "phone",
  view,
  focus: 0,
  max: 6,
  lines: false,
  labels: true,
  box: { x: 0.5, y: 0.5, w: 1 },
  enter: "none",
  ...o,
})
export const callout = (t: string, sub: string, at: { x: number; y: number }, box: Box): CalloutLayer => ({ id: uid(), kind: "callout", text: t, sub, at, box, enter: "fade", color: "" })
export const shape = (kind: ShapeLayer["shape"], paint: Paint[], box: Box = { x: 0.5, y: 0.5, w: 0.3 }, o: Partial<ShapeLayer> = {}): ShapeLayer => ({
  id: uid(),
  kind: "shape",
  shape: kind,
  box,
  aspect: kind === "ellipse" ? 1 : 1.6,
  radius: kind === "ellipse" ? 0 : 1.2,
  paint,
  enter: "scale",
  ...o,
})
export const cursor = (label: string, color: string, box: Box = { x: 0.6, y: 0.6, w: 0.08 }, o: Partial<CursorLayer> = {}): CursorLayer => ({ id: uid(), kind: "cursor", label, color, box, enter: "fade", ...o })
export const tween = (prop: Prop, at: number, dur: number, from: number[], to: number[], ease = "cubic-bezier(0.23, 1, 0.32, 1)"): Tween => ({ id: uid(), prop, at, dur, from, to, ease })
export const scene = (name: string, layers: Layer[], o: Partial<Scene> = {}): Scene => ({
  id: uid(),
  name,
  duration: 4,
  transition: "dissolve",
  camera: { ...CAMERA },
  move: "reveal",
  frame: "center",
  arrival: "none",
  layers,
  ...o,
})

/** A device into the next free place in the scene (the middle, then left, then right), under its flat layers; null when
    all three are taken. */
export function addDevice(s: Scene, d: DeviceId): Scene | null {
  const used = s.layers.flatMap((l) => (l.kind === "device" ? [l.slot] : []))
  const slot = (["center", "left", "right"] as Slot[]).find((x) => !used.includes(x))
  if (!slot) return null
  const at = s.layers.findIndex((l) => l.kind !== "device")
  const layers = [...s.layers]
  layers.splice(at < 0 ? layers.length : at, 0, device(d, slot))
  return { ...s, layers }
}

export const defaultComp =(d: DeviceId, posture: Posture = "open"): Comp => ({
  v: 2,
  size: "16x9",
  fps: 30,
  kind: "video",
  fill: "studio",
  effect: "none",
  ink: "",
  amount: 0.5,
  light: "studio",
  shadow: true,
  reflections: 1,
  scenes: [scene("Hero", [device(d, "center", posture)], { duration: 6, transition: "cut" })],
})

/* ---------------- templates ---------------- */

/** `accent`: the product's colour, read off its screen (a template's look is matched to it) */
export type TemplateCtx = { device: DeviceId; posture: Posture; name: string; anim: string; copy: Copy; brand?: Brand; accent?: string; /** a product kit (studio/product.ts): its words and screens go into the film's slots */ kit?: ProductKit }
export type Template = {
  id: string
  name: string
  hint: string
  scenes: number
  film?: boolean
  make: (x: TemplateCtx) => Comp
  /** a launch film's own params, set from what's open (its product screen, name, accent) */
  values?: (x: TemplateCtx) => { anim: string; values: Record<string, string> }
  /** drawn for one frame: the composition takes this size, not the one it had */
  size?: Comp["size"]
  /** the kind of film (refs.ts CATEGORIES.film): product launch, feature launch, demo… */
  category?: string
}

/** Lines to draw a template with before the copy writer has read the component. */
export const SAMPLE_COPY: Copy = {
  kicker: "Introducing",
  hook: "Meet what's next.",
  name: "Product",
  tagline: "Made to move",
  features: ["Built in motion", "Every state, designed", "Live, in your app"],
  split: "Built for | every screen",
  proof: "",
  cta: "Try it now",
  by: "rules",
}

const base = (x: TemplateCtx, o: Partial<Comp>): Comp => ({ ...defaultComp(x.device, x.posture), brand: x.brand, ...o })
const phoneOr = (d: DeviceId): DeviceId => (d === "macbook" || d === "ipad" ? "iphone" : d)
/** A component layer's own values. A film cut into scenes is one film: its words and screens change in every scene of it. */
export const withValues = (c: Comp, l: ComponentLayer, values: Values | undefined): Comp => ({
  ...c,
  scenes: c.scenes.map((s) => ({ ...s, layers: s.layers.map((y) => (y.kind === "component" && (y.id === l.id || (l.from !== undefined && y.anim === l.anim && y.from !== undefined)) ? { ...y, values } : y)) })),
})
/** A launch film filling the frame (drawn at 16:9, or 9:16 for a reel), showing the film from `from` seconds on. Its box
    is the frame, never what it paints: a scene can open on one small thing (a pill), and a fitted box would shrink to it. */
export const ASPECTS = { "16x9": 16 / 9, "1x1": 1, "9x16": 9 / 16 } as const
export const launchFilm = (anim: string, aspect = 16 / 9, from = 0): ComponentLayer => ({ ...component(anim, { x: 0.5, y: 0.5, w: 1 }), name: "Film", aspect, fit: false, enter: "none", shot: "flat", from })
/** A launch film as its own scenes, cut where the film cuts (its meta's `film`: each shot's name and where in the film
    it starts, and the film's length). Played in order they're the whole film; each can be retimed, moved, dropped, or
    have your own scenes put between them. */
const cutFilm = (x: TemplateCtx, anim: string): Comp => {
  const f = byId(anim)!.film!
  return base(x, {
    size: f.size,
    fill: "black",
    effect: "none",
    auto: false,
    scenes: f.shots.map((s, i) => scene(s.name, [launchFilm(anim, ASPECTS[f.size], s.at)], { duration: Math.round(((f.shots[i + 1]?.at ?? f.end) - s.at) * 100) / 100, transition: "cut", move: "still" })),
  })
}
/** What a launch film takes from what's open: the product's screen (when it's one a film can show), its name, the brand's accent. */
const launchValues = (anim: string, x: TemplateCtx) => {
  // a product kit fills every slot it has something for
  if (x.kit) return { anim, values: fillSlots(x.kit, slotsFor(anim)).values }
  const values: Record<string, string> = {}
  // any of the library's React animations can run in a film, except a film
  const open = byId(x.anim)
  if (open?.load && open.category !== "Launch films" && byId(anim)?.schema.screen) values.screen = byId(anim)?.schema.screen?.type === "screen" ? `anim:${x.anim}` : x.anim
  if (x.copy.name) values.name = x.copy.name
  if (x.brand?.accent) values.accent = x.brand.accent
  return { anim, values }
}

export const TEMPLATES: Template[] = [
  // replicated from the reference films (Desktop/video), each its kind of film
  {
    id: "spotlight",
    category: "feature-launch",
    name: "Feature spotlight",
    hint: "Square, on warm paper: your app's window, a click on +, a new tab typed “Introducing…”, the feature's name huge among its tags, four words typed over your app as it slides by, your mark opening into an artboard that becomes the icon that's clicked. 8.3 s, loops. Your screens and logo go in Screens.",
    scenes: 6,
    film: true,
    size: "1x1",
    make: (x) => cutFilm(x, "film-spotlight"),
    values: (x) => launchValues("film-spotlight", x),
  },
  {
    id: "horizon",
    category: "product-launch",
    name: "Horizon launch",
    hint: "Deep space: blue squares round an icon in a selection, a planet's glowing horizon, your name introduced in light, glass panels of the product tilted in the dark, addresses scattered, words in pills, a comet through orbits, an aurora end card. 23.6 s.",
    scenes: 8,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-horizon"),
    values: (x) => launchValues("film-horizon", x),
  },
  {
    id: "glide",
    category: "product-demo",
    name: "Macro glide",
    hint: "Your editor laid flat in the dark, filmed with a macro lens: clips growing onto the timeline, the playhead off and the panel's edge lit; a macro glide in shallow focus; the play button lit, its light rising, pressed. 12.35 s, loops. Your app goes in Screens.",
    scenes: 3,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-glide"),
    values: (x) => launchValues("film-glide", x),
  },
  {
    id: "blueprint",
    category: "brand",
    name: "Blueprint",
    hint: "Drawn as a diagram on light grey: a boxed headline among connector lines, a picture pulling back into the diagram, a post beside each rule in a line-drawn room, a phone, numbers counting on sliding rails, the close, your mark in orbit. 31 s.",
    scenes: 7,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-blueprint"),
    values: (x) => launchValues("film-blueprint", x),
  },
  {
    id: "verbs",
    category: "product-launch",
    name: "Verb drop",
    hint: "Eight huge verbs, each wearing what it does; a line typed and taken apart with its shortcuts showing; its glyph built into an app icon; the app tilting in to meet you; its pen tool drawing a leaf. 11.8 s.",
    scenes: 4,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-verbs"),
    values: (x) => launchValues("film-verbs", x),
  },
  {
    id: "flyover",
    category: "product-demo",
    name: "Site flyover",
    hint: "Your website tilted back and flown over in shallow focus: the hero, cards rising off the page, a dark section, the story, pricing and questions; a whip back to the whole page standing, a dive into the app window for the closing line. 14.6 s. Your site, app screen and logo go in Screens.",
    scenes: 5,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-flyover"),
    values: (x) => launchValues("film-flyover", x),
  },
  {
    id: "liquid",
    category: "product-launch",
    name: "Liquid prompt",
    hint: "For an AI product, on near-black: a sphere pulled into liquid splits in a flash and rings up into your mark, collapses into a chat face; “Ask about anything” typed huge, ideas wheeling past, one typed on as the prompt, the send pressed, the agent thinking. 12.55 s, loops.",
    scenes: 4,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-liquid"),
    values: (x) => launchValues("film-liquid", x),
  },
  {
    id: "mosaic",
    category: "product-demo",
    name: "Prompt to page",
    hint: "A mosaic of four, each quarter cutting through the same story on its own clock: the model picked, the prompt typed, the agent's log, the page on a monitor and a phone, the tools connected, ready. 13 s, loops.",
    scenes: 4,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-mosaic"),
    values: (x) => launchValues("film-mosaic", x),
  },
  {
    id: "quad",
    category: "feature-launch",
    name: "Quad grid",
    hint: "Four little ads cutting together: the feature on periwinkle rings and the app's screen, your name among flying coins and its token list, a Deposit button raining coins, a black terminal of what you received. 4.37 s, loops. Your phone screens go in Screens.",
    scenes: 4,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-quad"),
    values: (x) => launchValues("film-quad", x),
  },
  {
    id: "pop",
    category: "brand",
    name: "Pop blue",
    hint: "One loud blue: a word over angular shards, digits rolling into a giant amount, a yellow flash, the amount split into pills, a sky of clouds, a wall of pills, cards counting up, your wordmark with a trail of faces. 11.3 s.",
    scenes: 6,
    film: true,
    size: "16x9",
    make: (x) => cutFilm(x, "film-pop"),
    values: (x) => launchValues("film-pop", x),
  },
  {
    id: "sketch-reel",
    category: "social",
    name: "Sketch to screen",
    hint: "A vertical reel: a hand-drawn wireframe beside the finished screen, cut on every new sketch. An icon burst, your mark spun and shattered, a search typed in the rain, a playlist, a wall of covers, a word roller, a poster slammed in, all of it swirling back into your mark. 17 s.",
    scenes: 8,
    film: true,
    size: "9x16",
    make: (x) => cutFilm(x, "reel-sketch"),
    values: (x) => launchValues("reel-sketch", x),
  },
  {
    id: "desk-reel",
    category: "social",
    name: "Lit desk",
    hint: "A vertical reel shot like a phone filming a laptop in the dark: the screen plays the story and its light washes the keys. A prompt dived into, a wireframe land while it thinks, a word drum editing a picture, arcs, a ring of fire, a typed line, a sun. 29 s.",
    scenes: 8,
    film: true,
    size: "9x16",
    make: (x) => cutFilm(x, "reel-desk"),
    values: (x) => launchValues("reel-desk", x),
  },
  {
    id: "hero",
    category: "mockup",
    name: "Hero shot",
    hint: "One device, turning in under studio light.",
    scenes: 1,
    make: (x) => base(x, { scenes: [scene("Hero", [device(x.device, "center", x.posture)], { duration: 6, transition: "cut" })] }),
  },
  {
    id: "beside",
    category: "mockup",
    name: "Device + component",
    hint: "The device on the left, a component animating beside it.",
    scenes: 1,
    make: (x) =>
      base(x, {
        fill: "white",
        scenes: [scene("Feature", [device(phoneOr(x.device)), component(x.anim)], { duration: 6, transition: "cut", frame: "left", camera: { ...CAMERA, angle: "heroLeft" }, move: "sway" })],
      }),
  },
  {
    id: "family",
    category: "mockup",
    name: "Family",
    hint: "MacBook in the middle, iPad and iPhone either side, matched in scale and perspective.",
    scenes: 1,
    make: (x) =>
      base(x, {
        scenes: [
          scene("Family", [device("macbook"), device("ipad", "left"), device("iphone", "right")], { duration: 6, transition: "cut", arrival: "drop", move: "push", camera: { ...CAMERA, angle: "front", elev: 6 } }),
        ],
      }),
  },
]
