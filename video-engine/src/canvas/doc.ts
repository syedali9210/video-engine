// Canvas — an interactive design: a frame (an artboard) with layers on it, the way a design tool draws one, except
// that its devices and components are live, and any layer can answer the visitor (it comes in as it's seen, lifts
// under the pointer, follows it, moves with the scroll, links somewhere). This is the JSON the editor writes and the
// runtime (public/canvas.js) draws in any page: plain data, every size in the frame's own pixels, with a phone layout
// beside the desktop one. `bake` adds the CSS the runtime draws fills with, so it needs nothing else.
import type { Values } from "../registry"
import { layersCss, type Paint } from "../studio/paint"
import { animOf, type TextAnim } from "../studio/textanim"
import { validateEffect, type Effect } from "./effects"
import { FACES, fontsUrl } from "../studio/faces"

export type Box = { x: number; y: number; w: number; h: number; rot?: number }
/** How a layer comes in, the first time the frame is seen: from where, after how long, for how long (seconds). */
export type Enter = { kind: "fade" | "rise" | "scale" | "blur"; delay: number; dur: number }
/** Under the pointer: lifts, grows, or tilts toward it (0–1). */
export type Hover = { kind: "lift" | "scale" | "tilt"; amount: number }
/** Wherever the pointer is over the frame: drifts toward it (parallax) or turns to face it (0–1). */
export type Follow = { kind: "parallax" | "tilt"; amount: number }
/** A page from the engine (a library animation): where it is, and the values of its properties. */
export type Live = { anim: string; path: string; query: Record<string, string>; values: Values }
export type DeviceKind = "iphone" | "ipad" | "macbook" | "duo"
/** How a layer moves along its path, by physics: spring and elastic overshoot and settle, glide arrives softly, slide
    is friction, float drifts, bounce and drop fall and bounce off the end (drop with a squash). */
export type MotionPreset = "spring" | "bounce" | "slide" | "drop" | "elastic" | "glide" | "float"
/** What sends it: being seen, the scroll, a loop back and forth, the pointer over it, a click. */
export type MotionTrigger = "enter" | "scroll" | "loop" | "hover" | "click"
export type Motion = {
  /** the path, in the frame's pixels, starting from the layer's own middle */
  d: string
  preset: MotionPreset
  trigger: MotionTrigger
  /** the preset's character, 0–1 (how bouncy) */
  strength: number
  /** how fast, 0.2–3 */
  speed: number
  /** seconds before it sets off, when it's seen */
  delay: number
  fade?: boolean
  /** turns to face the way it's going */
  orient?: boolean
  /** comes back along it instead: starts at the far end and ends where it's placed */
  reverse?: boolean
}
export const MOTION_PRESETS: { value: MotionPreset; label: string }[] = [
  { value: "spring", label: "Spring" },
  { value: "bounce", label: "Bounce" },
  { value: "slide", label: "Slide" },
  { value: "drop", label: "Drop" },
  { value: "elastic", label: "Elastic" },
  { value: "glide", label: "Glide" },
  { value: "float", label: "Float" },
]
export const MOTION_TRIGGERS: { value: MotionTrigger; label: string }[] = [
  { value: "enter", label: "Seen" },
  { value: "scroll", label: "Scroll" },
  { value: "loop", label: "Loop" },
  { value: "hover", label: "Hover" },
  { value: "click", label: "Click" },
]

type Base = Box & {
  id: string
  name?: string
  hidden?: boolean
  /** 0–1 */
  opacity?: number
  /** the phone layout's own place and size (and a title's type size), and whether it shows there, where they differ
      from the desktop's */
  phone?: Partial<Box> & { hidden?: boolean; size?: number }
  enter?: Enter
  hover?: Hover
  follow?: Follow
  /** moves with the page's scroll: how far, −1 to 1 (a share of the frame's height across the pass) */
  scroll?: number
  /** a click opens this (http or https) */
  link?: string
  /** blurred, in the frame's pixels */
  blur?: number
  /** a soft light around it: text glows by its letters, anything else by its outline */
  glow?: { color: string; size: number }
  /** frosted glass behind it: how much it blurs what's behind, its tint (and how much of it), corners, and how far
      it reaches past the layer */
  backdrop?: { blur: number; tint: string; opacity: number; radius: number; pad: number }
  /** a path it moves along */
  motion?: Motion
  /** seen only through another layer's box and corners (its id): a phone's corner in a card, a photo in a window */
  clip?: string
}
export type ShapeNode = Base & { kind: "rect" | "ellipse"; radius: number; paint: Paint[]; fill?: string; stroke?: { color: string; width: number }; shadow?: boolean }
/** `animation`: the Studio's title animations (textanim.ts), played when it's seen or as the page scrolls past */
export type TextNode = Base & { kind: "text"; text: string; size: number; weight: number; color: string; align: "left" | "center" | "right"; font: "text" | "display" | "mono" | "serif"; /** a face from faces.ts set over the font's own */ face?: string; animation?: TextAnim & { on?: "enter" | "scroll" } }
export type ImageNode = Base & { kind: "image"; src: string; radius: number }
/** a drawn line: its path in its own box's coordinates (vw × vh), stretched with the box */
export type PathNode = Base & { kind: "path"; d: string; vw: number; vh: number; stroke: string; width: number; fill?: string }
/** a device: its screen is a live page from the engine, or a picture of a product's own screen (captured) over it */
export type DeviceNode = Base & {
  kind: "device"
  device: DeviceKind
  open?: boolean
  screen: Live
  picture?: string
  scheme: "light" | "dark"
  /** turned in 3D, degrees: x tilts it back (positive) or forward, y turns it (its roll is the layer's own rotation);
      p: how far away it's seen from, in lengths of its box (low is a wide lens, strong perspective) */
  rot3d?: { x: number; y: number; p?: number }
  /** one of the device's real finishes: its band and its back */
  finish?: { id: string; metal: string; back: string }
  /** in a case: its one matte colour over the band and the back, a lip round the glass */
  case?: string
  /** false: no shadow under it */
  shadow?: boolean
  /** turns with the page's scroll (degrees either side of straight on), or on its own (y degrees a second, x a nod) */
  spin?: { kind: "scroll" | "loop"; x: number; y: number }
}
/** `view`: a page-filling component's own page (w × h CSS px) and the part of it shown (from x, y), so a search bar
    from an app screen comes without the screen round it */
export type ComponentNode = Base & { kind: "component"; live: Live; scheme: "light" | "dark"; view?: { w: number; h: number; x: number; y: number; k?: number } }
/** an animated raster artwork (see effects.ts), usually the whole frame's background; `radius` rounds it into a card */
export type EffectNode = Base & { kind: "effect"; effect: Effect; radius?: number }
export type CNode = ShapeNode | TextNode | ImageNode | PathNode | DeviceNode | ComponentNode | EffectNode
export type Frame = { w: number; h: number; paint: Paint[]; fill?: string; /** titles' colour when they have none */ ink?: string; radius: number; phone: { w: number; h: number }; /** the Google Fonts stylesheet its texts' faces need (baked) */ fonts?: string }
export type CanvasDoc = { v: 1; name: string; /** where the engine is deployed: the live pages come from there */ origin?: string; frame: Frame; layers: CNode[] }
export type View = "desktop" | "phone"

export const uid = () => Math.random().toString(36).slice(2, 9)

/** The device mockups' outer size in points, the engine's own geometry (devices.tsx): what a device layer keeps the
    shape of. */
export const MOCKUP: Record<DeviceKind | "duo-open", { w: number; h: number; vw: number; vh: number }> = {
  iphone: { w: 440, h: 912, vw: 402, vh: 874 },
  ipad: { w: 928, h: 1304, vw: 834, vh: 1210 },
  macbook: { w: 1640, h: 1063, vw: 1512, vh: 950 },
  duo: { w: 504, h: 716, vw: 466, vh: 678 },
  "duo-open": { w: 989, h: 707, vw: 951, vh: 669 },
}
export const mockupOf = (n: DeviceNode) => MOCKUP[n.device === "duo" && n.open ? "duo-open" : n.device]

export const FRAMES: { id: string; name: string; w: number; h: number }[] = [
  { id: "desktop", name: "Desktop", w: 1440, h: 900 },
  { id: "laptop", name: "Laptop", w: 1280, h: 800 },
  { id: "tablet", name: "Tablet", w: 1194, h: 834 },
  { id: "square", name: "Square", w: 1080, h: 1080 },
  { id: "portrait", name: "Portrait", w: 1080, h: 1350 },
]

/* ---------------- making layers ---------------- */

const solid = (color: string): Paint => ({ id: uid(), kind: "solid", stops: [{ at: 0, color, alpha: 1 }], from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 }, ratio: 1, opacity: 1, blend: "normal" })
// boxes in whole pixels: what the inspector shows, and what a site gets
const whole = (b: Box): Box => ({ ...b, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })
export const shapeNode = (kind: "rect" | "ellipse", b: Box, color = "#d4d4d8"): ShapeNode => ({ id: uid(), kind, ...whole(b), radius: kind === "rect" ? 16 : 0, paint: [solid(color)] })
export const textNode = (x: number, y: number, text = "Text", size = 48): TextNode => ({ id: uid(), kind: "text", ...whole({ x, y, w: Math.max(120, text.length * size * 0.55), h: size * 1.2 }), text, size, weight: 600, color: "", align: "left", font: "display" })
export const imageNode = (src: string, b: Box): ImageNode => ({ id: uid(), kind: "image", ...whole(b), src, radius: 12 })
export const pathNode = (d: string, b: Box, stroke = "#18181b", width = 4): PathNode => ({ id: uid(), kind: "path", ...b, d, vw: b.w, vh: b.h, stroke, width })
export function deviceNode(device: DeviceKind, screen: Live, cx: number, cy: number, height: number, scheme: "light" | "dark"): DeviceNode {
  const m = MOCKUP[device]
  const h = height
  const w = (h * m.w) / m.h
  return { id: uid(), kind: "device", device, ...whole({ x: cx - w / 2, y: cy - h / 2, w, h }), screen, scheme, follow: { kind: "tilt", amount: 0.5 } }
}
export const componentNode = (live: Live, b: Box, scheme: "light" | "dark"): ComponentNode => ({ id: uid(), kind: "component", ...whole(b), live, scheme, hover: { kind: "lift", amount: 0.6 } })
export const effectNode = (effect: Effect, b: Box, name?: string): EffectNode => ({ id: uid(), kind: "effect", ...whole(b), effect, ...(name ? { name } : {}) })

export function blankDoc(): CanvasDoc {
  return { v: 1, name: "Canvas", frame: { w: 1440, h: 900, paint: [solid("#f4f4f6")], radius: 0, phone: { w: 402, h: 874 } }, layers: [] }
}

/* ---------------- where things are, per view ---------------- */

export const frameSize = (doc: CanvasDoc, view: View) => (view === "phone" ? doc.frame.phone : doc.frame)
export function boxOf(n: CNode, view: View): Box & { hidden: boolean } {
  const p = view === "phone" ? n.phone : undefined
  return { x: p?.x ?? n.x, y: p?.y ?? n.y, w: p?.w ?? n.w, h: p?.h ?? n.h, rot: p?.rot ?? n.rot, hidden: !!(n.hidden || p?.hidden) }
}
/** A title's type size on a view. */
export const sizeOf = (n: TextNode, view: View) => (view === "phone" ? (n.phone?.size ?? n.size) : n.size)
/** A change of place or size: on the phone view it goes into the phone layout, otherwise into the layer itself. */
export function withBox(n: CNode, b: Partial<Box>, view: View): CNode {
  if (view === "phone") return { ...n, phone: { ...n.phone, ...b } }
  return { ...n, ...b } as CNode
}

/** The phone layout, made from the desktop one: everything stacked down a phone-wide column in reading order (top to
    bottom, then left to right), each scaled to the column, devices and pictures a little narrower so they read as
    objects, titles kept at a size a phone can read. The frame grows to hold it. A starting point: anything can be
    moved after. */
export function autoPhone(doc: CanvasDoc, width = 402): CanvasDoc {
  const pad = 24
  const col = width - pad * 2
  const k = width / doc.frame.w
  const order = doc.layers
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !n.hidden)
    .sort((a, b) => a.n.y + a.n.h / 2 - (b.n.y + b.n.h / 2) || a.n.x - b.n.x)
  // things that sit behind others (a big shape the size of the frame) stay behind, scaled, not stacked
  const backdrop = (n: CNode) => n.kind !== "text" && n.w * n.h > doc.frame.w * doc.frame.h * 0.4
  let y = pad * 2
  const place = new Map<string, Partial<Box>>()
  for (const { n } of order) {
    if (backdrop(n)) continue
    const share = n.kind === "text" ? 1 : n.kind === "device" ? 0.72 : 0.86
    let w = Math.min(col * share, Math.max(n.w * k * 2.2, n.kind === "text" ? col : 120))
    let h = n.kind === "text" ? n.h : (n.h / n.w) * w
    if (n.kind === "text") {
      const t = n as TextNode
      const size = Math.max(16, Math.min(t.size, t.size * k * 2.4))
      h = size * 1.25 * Math.max(1, Math.ceil((t.text.length * size * 0.55) / col))
      w = col
    }
    if (n.kind === "device") {
      h = Math.min(h, 560)
      w = (n.w / n.h) * h
    }
    place.set(n.id, { x: Math.round((width - w) / 2), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0 })
    y += h + 24
  }
  const height = Math.round(Math.max(640, y + pad))
  return {
    ...doc,
    frame: { ...doc.frame, phone: { w: width, h: height } },
    layers: doc.layers.map((n) => {
      if (backdrop(n)) return { ...n, phone: { x: 0, y: 0, w: width, h: height, rot: 0 } }
      const p = place.get(n.id)
      if (!p) return n
      // a title gets a type size a phone can read, with its place
      return n.kind === "text" ? { ...n, phone: { ...p, size: Math.round(Math.max(16, Math.min(n.size, n.size * k * 2.4))) } } : { ...n, phone: p }
    }),
  }
}

/* ---------------- what the runtime draws with ---------------- */

/** Light or dark, by the colour at the back of a paint stack: what reads on it. */
export function inkOn(paint: Paint[]) {
  const c = paint.find((p) => !p.hidden)?.stops[0]?.color ?? "#ffffff"
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c)
  const [r, g, b] = m ? [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255) : [1, 1, 1]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#18181b" : "#fafafa"
}

/** Adds the CSS of every fill (from its paint stack) and the frame's ink, so the runtime draws without the paint code. */
export function bake(canvas: CanvasDoc): CanvasDoc {
  // responsive without anyone making it so: a canvas with no phone layout gets the automatic one
  const doc = canvas.layers.length && !canvas.layers.some((n) => n.phone) ? autoPhone(canvas) : canvas
  const fill = (paint: Paint[], w: number, h: number) => layersCss(paint, Math.max(1, w), Math.max(1, h)) || "transparent"
  const fonts = fontsUrl(doc.layers.map((n) => (n.kind === "text" ? n.face : undefined)))
  return {
    ...doc,
    frame: { ...doc.frame, fill: fill(doc.frame.paint, doc.frame.w, doc.frame.h), ink: inkOn(doc.frame.paint), ...(fonts ? { fonts } : {}) },
    layers: doc.layers.map((n) => (n.kind === "rect" || n.kind === "ellipse" ? { ...n, fill: fill(n.paint, n.w, n.h) } : n)),
  }
}

/* ---------------- anything that claims to be a canvas ---------------- */

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, d = "", max = 4000) => (typeof v === "string" ? v.slice(0, max) : d)
// pictures travel inside the JSON (data:) or come from a site (https:)
const PICTURE = /^(data:image\/(png|jpe?g|webp|gif|svg\+xml);|https:\/\/)/
// a colour as CSS writes one, and nothing that could be more than a colour
const colour = (v: unknown, d: string) => (typeof v === "string" && /^(#[0-9a-f]{3,8}|transparent|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(v.trim()) ? v.trim() : d)
const PRESET_IDS = MOTION_PRESETS.map((x) => x.value)
const TRIGGER_IDS = MOTION_TRIGGERS.map((x) => x.value)
/** A path to move along: drawn lines only (no arcs, no anything else), with its preset and what sends it. */
function motionOf(raw: unknown): Motion | undefined {
  const m = raw as Partial<Motion> | null
  if (!m || typeof m !== "object" || typeof m.d !== "string" || m.d.length < 4 || m.d.length > 20000 || !/^[MLCQZmlcqz0-9.,\s-]*$/.test(m.d)) return undefined
  return {
    d: m.d,
    preset: PRESET_IDS.includes(m.preset as MotionPreset) ? (m.preset as MotionPreset) : "spring",
    trigger: TRIGGER_IDS.includes(m.trigger as MotionTrigger) ? (m.trigger as MotionTrigger) : "enter",
    strength: num(m.strength, 0, 1, 0.5),
    speed: num(m.speed, 0.2, 3, 1),
    delay: num(m.delay, 0, 10, 0),
    ...(m.fade ? { fade: true } : {}),
    ...(m.orient ? { orient: true } : {}),
    ...(m.reverse ? { reverse: true } : {}),
  }
}
const ownPath = (p: unknown) => typeof p === "string" && /^\/(stage\.html|anim\/[\w-]+\/[\w.-]+\.html)$/.test(p)
const live = (v: unknown): Live | null => {
  const l = v as Live
  if (!l || typeof l !== "object" || !ownPath(l.path)) return null
  const query: Record<string, string> = {}
  for (const [k, x] of Object.entries(l.query ?? {})) if (/^[a-z]+$/i.test(k) && typeof x === "string") query[k] = x.slice(0, 200)
  return { anim: str(l.anim, "", 80), path: l.path, query, values: l.values && typeof l.values === "object" ? l.values : {} }
}

/** Opens a canvas from outside (a file someone hands over): known kinds only, numbers in range, live pages only from
    the engine itself, links only to the web. */
export function validateDoc(raw: unknown): CanvasDoc | null {
  const r = raw as Partial<CanvasDoc>
  if (!r || typeof r !== "object" || r.v !== 1 || !r.frame || !Array.isArray(r.layers)) return null
  const f = r.frame
  const box = (n: Partial<Box>): Box => ({ x: num(n.x, -20000, 20000, 0), y: num(n.y, -20000, 20000, 0), w: num(n.w, 1, 20000, 100), h: num(n.h, 1, 20000, 100), rot: num(n.rot, -360, 360, 0) })
  const layers: CNode[] = []
  for (const x of r.layers.slice(0, 400)) {
    const n = x as CNode
    if (!n || typeof n !== "object") continue
    const common = {
      id: str(n.id, uid(), 40),
      name: n.name ? str(n.name, "", 80) : undefined,
      hidden: !!n.hidden,
      opacity: num(n.opacity, 0, 1, 1),
      ...box(n),
      phone: n.phone && typeof n.phone === "object" ? { ...box({ ...n, ...n.phone }), hidden: !!n.phone.hidden, ...(typeof n.phone.size === "number" ? { size: num(n.phone.size, 4, 800, 32) } : {}) } : undefined,
      enter: n.enter && ["fade", "rise", "scale", "blur"].includes(n.enter.kind) ? { kind: n.enter.kind, delay: num(n.enter.delay, 0, 10, 0), dur: num(n.enter.dur, 0.05, 5, 0.6) } : undefined,
      hover: n.hover && ["lift", "scale", "tilt"].includes(n.hover.kind) ? { kind: n.hover.kind, amount: num(n.hover.amount, 0, 1, 0.5) } : undefined,
      follow: n.follow && ["parallax", "tilt"].includes(n.follow.kind) ? { kind: n.follow.kind, amount: num(n.follow.amount, 0, 1, 0.5) } : undefined,
      scroll: typeof n.scroll === "number" ? num(n.scroll, -1, 1, 0) : undefined,
      link: typeof n.link === "string" && /^https?:\/\//.test(n.link) ? n.link.slice(0, 500) : undefined,
      blur: typeof n.blur === "number" && n.blur > 0 ? num(n.blur, 0, 200, 0) : undefined,
      glow: n.glow && typeof n.glow === "object" && num(n.glow.size, 0, 300, 0) > 0 ? { color: colour(n.glow.color, "#ffffff"), size: num(n.glow.size, 0, 300, 24) } : undefined,
      backdrop:
        n.backdrop && typeof n.backdrop === "object"
          ? { blur: num(n.backdrop.blur, 0, 200, 20), tint: colour(n.backdrop.tint, "#ffffff"), opacity: num(n.backdrop.opacity, 0, 1, 0.2), radius: num(n.backdrop.radius, 0, 1000, 16), pad: num(n.backdrop.pad, 0, 400, 16) }
          : undefined,
      motion: motionOf(n.motion),
      clip: typeof n.clip === "string" && n.clip ? str(n.clip, "", 40) : undefined,
    }
    if (n.kind === "rect" || n.kind === "ellipse") layers.push({ ...common, kind: n.kind, radius: num(n.radius, 0, 10000, 0), paint: Array.isArray(n.paint) ? n.paint.slice(0, 8) : [], stroke: n.stroke && typeof n.stroke.color === "string" ? { color: str(n.stroke.color, "#000", 40), width: num(n.stroke.width, 0, 100, 1) } : undefined, shadow: !!n.shadow })
    else if (n.kind === "text") {
      const a = animOf(n.animation)
      layers.push({ ...common, kind: "text", text: str(n.text, "", 2000), size: num(n.size, 4, 800, 32), weight: num(n.weight, 100, 900, 500), color: str(n.color, "", 40), align: (["left", "center", "right"] as const).includes(n.align) ? n.align : "left", font: (["text", "display", "mono", "serif"] as const).includes(n.font) ? n.font : "text", ...(FACES.some((x) => x.name === n.face) ? { face: n.face } : {}), ...(a ? { animation: { ...a, ...(n.animation?.on === "scroll" ? { on: "scroll" as const } : {}) } } : {}) })
    }
    else if (n.kind === "image" && typeof n.src === "string" && PICTURE.test(n.src)) layers.push({ ...common, kind: "image", src: n.src, radius: num(n.radius, 0, 10000, 0) })
    else if (n.kind === "path" && typeof n.d === "string" && /^[MLCQZmlcqz0-9.,\s-]*$/.test(n.d)) layers.push({ ...common, kind: "path", d: n.d.slice(0, 50000), vw: num(n.vw, 1, 20000, n.w), vh: num(n.vh, 1, 20000, n.h), stroke: str(n.stroke, "#000", 40), width: num(n.width, 0, 200, 4), fill: n.fill ? str(n.fill, "", 40) : undefined })
    else if (n.kind === "device" && (["iphone", "ipad", "macbook", "duo"] as const).includes(n.device)) {
      const s = live(n.screen)
      const picture = typeof n.picture === "string" && PICTURE.test(n.picture) ? n.picture : undefined
      const rot3d = n.rot3d && typeof n.rot3d === "object" ? { x: num(n.rot3d.x, -180, 180, 0), y: num(n.rot3d.y, -360, 360, 0), ...(typeof n.rot3d.p === "number" ? { p: num(n.rot3d.p, 1.4, 8, 3.2) } : {}) } : undefined
      const hex6 = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined)
      const finish = n.finish && typeof n.finish === "object" && hex6(n.finish.metal) && hex6(n.finish.back) ? { id: str(n.finish.id, "", 40), metal: hex6(n.finish.metal)!, back: hex6(n.finish.back)! } : undefined
      const kase = hex6(n.case)
      const spin = n.spin && (n.spin.kind === "scroll" || n.spin.kind === "loop") ? { kind: n.spin.kind, x: num(n.spin.x, -90, 90, 0), y: num(n.spin.y, -360, 360, 0) } : undefined
      if (s) layers.push({ ...common, kind: "device", device: n.device, open: !!n.open, screen: s, ...(picture ? { picture } : {}), scheme: n.scheme === "dark" ? "dark" : "light", ...(rot3d ? { rot3d } : {}), ...(spin ? { spin } : {}), ...(finish ? { finish } : {}), ...(kase ? { case: kase } : {}), ...(n.shadow === false ? { shadow: false as const } : {}) })
    } else if (n.kind === "component") {
      const l = live(n.live)
      const v = n.view && typeof n.view === "object" ? { w: num(n.view.w, 80, 4000, 402), h: num(n.view.h, 80, 8000, 874), x: num(n.view.x, -4000, 4000, 0), y: num(n.view.y, -8000, 8000, 0), ...(typeof n.view.k === "number" ? { k: num(n.view.k, 0.2, 1, 1) } : {}) } : undefined
      if (l) layers.push({ ...common, kind: "component", live: l, scheme: n.scheme === "dark" ? "dark" : "light", ...(v ? { view: v } : {}) })
    } else if (n.kind === "effect") {
      const v = validateEffect(n.effect)
      if (v.effect) layers.push({ ...common, kind: "effect", effect: v.effect, ...(typeof n.radius === "number" && n.radius > 0 ? { radius: num(n.radius, 0, 2000, 0) } : {}) })
    }
  }
  return {
    v: 1,
    name: str(r.name, "Canvas", 80),
    origin: typeof r.origin === "string" && /^https?:\/\//.test(r.origin) ? r.origin : undefined,
    frame: { w: num(f.w, 100, 8000, 1440), h: num(f.h, 100, 8000, 900), paint: Array.isArray(f.paint) ? f.paint.slice(0, 8) : [], radius: num(f.radius, 0, 1000, 0), phone: { w: num(f.phone?.w, 200, 2000, 402), h: num(f.phone?.h, 200, 20000, 874) } },
    layers,
  }
}
