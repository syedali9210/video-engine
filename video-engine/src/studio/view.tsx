// Studio — draws a composition. Every scene is a layer of its own: its devices (one 3D scene, so they share one camera
// and one perspective) and its flat layers (component animations, exploded views, pictures, titles, callouts), stacked
// in the scene's order, over a ground the background director blends from one scene to the next. Time decides which
// scene shows and how the next one takes over. The engine's preview and the export page both draw with this; the clock
// is theirs (real in the engine, stepped by hand for an export).
import { createRef, forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { DEVICES, viewport, type Device, type ScreenInk } from "../devices"
import type { Values } from "../registry"
import { BreakdownBody, animateBreakdown } from "./breakdown"
import { focusOf, type PartsReport } from "./parts"
import { PROPS, VIEW, at, devicesOf, moving, type MovingLayer, type Prop, type View2D, type Brand, type BreakdownLayer, type ComponentLayer, type Comp, type Content, type DeviceLayer, type FlatLayer, type Scene, type ScreenFit, type TextLayer, type Transition } from "./comp"
import { direct } from "./director"
import { FINISHES, type Finish } from "./finishes"
import { Backdrop, HairlineDefs, hairline, isDark, labelInk, type PaintHandle } from "./look"
import { layersCss, moves, type Pt } from "./paint"
import { EffectsLayer, fxFor, fxNow, mixFx, type EffectsHandle } from "./fx"
import { angle, curve, mix, move, type Pose } from "./poses"
import { StudioScene } from "./scene"
import { velocity, type ShotMotion } from "./cuts"
import { pieces, playPieces } from "./Kit"
import { TEXT_ANIM } from "./textanim"
import { ScreenShell } from "./shell"

/** One live frame: an animation, its values, and on a built screen its box. */
export type FrameSpec = {
  key: string
  path: string
  query: Record<string, string>
  values: Values
  box?: CSSProperties
  bare: boolean
  hairline: boolean
  scheme: "light" | "dark"
  /** the hairline's ink and what its surfaces are filled with ("none" draws through them) */
  ink?: string
  fill?: string
}
/** What one device's screen shows. */
export type ScreenSpec = {
  frames: FrameSpec[]
  bg: string
  media?: { url: string; video: boolean }
  image?: string
}
/** How the view turns a composition's references into things it can load. The engine and the export page differ. */
export type Resolve = {
  screen: (content: Content, d: Device, key: string, hairline: boolean) => ScreenSpec
  component: (anim: string, key: string, hairline: boolean, scheme: "light" | "dark", values?: Values) => FrameSpec
  /** the screen a breakdown takes apart: whole ("full", reporting its components), only its grounds ("none"), or only
      component `which` */
  part: (anim: string, key: string, which: "full" | "none" | number, hairline: boolean, scheme: "light" | "dark") => FrameSpec
  image: (src: string) => string
  dark: boolean
  /** export: frames run on the bridge's hand-stepped clock */
  stepped: boolean
  /** the page's origin, that frames talk back to */
  origin: string
  /** where frames load from: a site of their own (studio.localhost), so Chrome runs them in another process and a film
      of live screens never takes the editor's main thread; the page's own origin when absent (an export steps them) */
  frames?: string
  /** the viewer asked for reduced motion: the frames are told so */
  reduce?: boolean
}
/** A camera gesture in progress: turning and zooming the 3D camera, panning (`px`, `py`, fractions of the frame) and
    zooming (`vz`) the flat one; `end`: on a "two framings" scene, the end framing is being set. */
export type Drag = { yaw: number; elev: number; zoom: number; px?: number; py?: number; vz?: number; end?: boolean; pitch?: number; roll?: number }

/** A flat camera with a gesture on it: dragging the content right moves what's in the middle left. */
export const viewWith = (v: View2D, d?: Drag): View2D => (d ? { x: v.x - (d.px ?? 0) / v.zoom, y: v.y - (d.py ?? 0) / v.zoom, zoom: Math.min(8, Math.max(0.25, v.zoom * (d.vz ?? 1))) } : v)
export type ViewHandle = {
  /** draw the composition at `t` seconds (with a drag on the current scene's camera, while one is in progress, and the
      pointer over the frame, for what follows it); true while something is still settling and wants another frame */
  render: (t: number, drag?: Drag, pointer?: Pt | null) => boolean
  /** every frame in the composition, for an export to step */
  frames: () => HTMLIFrameElement[]
}

export const finishFor = (l: DeviceLayer): Finish => {
  const f = FINISHES[l.device].find((x) => x.id === l.finish) ?? FINISHES[l.device][0]
  // in a case: its colour over the band and the back (the id changes with it, so the model is rebuilt)
  return l.case && /^#[0-9a-f]{6}$/i.test(l.case) ? { ...f, id: `${f.id}:${l.case}`, metal: l.case, back: l.case, rough: 0.62, case: true } : f
}
export const deviceOf = (l: DeviceLayer) => DEVICES.find((d) => d.id === l.device)!
export function cameraPose(s: Scene, drag?: Drag): Pose {
  const primary = devicesOf(s).find((l) => l.slot === "center") ?? devicesOf(s)[0]
  const c = s.camera
  const p = angle(c.angle, primary?.device ?? "iphone")
  const yaw = c.yaw + (drag?.yaw ?? 0)
  const elev = c.elev + (drag?.elev ?? 0)
  return {
    ...p,
    yaw: p.yaw + yaw,
    pitch: p.pitch + (c.pitch ?? 0) + (drag?.pitch ?? 0),
    roll: p.roll + (c.roll ?? 0) + (drag?.roll ?? 0),
    rise: p.rise + (c.rise ?? 0),
    pan: p.pan + (c.pan ?? 0),
    elev: Math.max(-30, Math.min(85, p.elev + elev)),
    zoom: p.zoom * c.zoom * (drag?.zoom ?? 1),
    fov: c.fov ?? p.fov,
  }
}

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const expoOut = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x)))
const inOut = (x: number) => {
  const k = clamp(x)
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
}

/** What a scene's camera does, for the cut planner's measure of how it moves at its ends. */
const sceneMotion = (s: Scene): ShotMotion => {
  const c = s.camera
  const f = (x: typeof c) => ({ angle: x.angle, yaw: x.yaw, elev: x.elev, zoom: x.zoom, fov: x.fov ?? undefined, pitch: x.pitch, roll: x.roll, rise: x.rise, pan: x.pan })
  const dev = devicesOf(s)
  return { dur: s.duration, device: (dev.find((l) => l.slot === "center") ?? dev[0])?.device, ...(dev.length ? { from: f(c), ...(s.move === "framings" ? { to: f(s.camera2 ?? c) } : { move: s.move }) } : {}), ease: s.ease, view: s.view, view2: s.view2 }
}
/** A carrier's geometry: the way the picture was going (+1 right), and where the subject is (fractions), so a whip
    swings on that way and an iris opens out of the subject. */
type Carry = { dir: number; cx: number; cy: number; w: number; h: number }
const CARRY: Carry = { dir: 1, cx: 0.5, cy: 0.5, w: 1, h: 1 }
/** a wipe's edge, leaning: its top `SLANT` ahead of its foot */
const SLANT = 0.12
const wipeAt = (e: number) => -SLANT + e * (1 + 2 * SLANT)
/** the hard swap in the middle of a whip or a push through, and how far each side is through its half */
const half = (k: number, incoming: boolean) => (incoming ? clamp((k - 0.5) / 0.5) : clamp(k / 0.5))

/** How a scene looks while it hands over: `k` runs 0 → 1 across the transition. */
function handover(tr: Transition, k: number, incoming: boolean, c: Carry = CARRY): CSSProperties {
  const e = inOut(k)
  switch (tr) {
    case "whip": {
      // the outgoing shot accelerates away the way the camera was going, the incoming one decelerates in behind it;
      // they swap at the fastest moment, where the blur (an SVG filter, set per frame) hides it
      if (incoming ? k < 0.5 : k >= 0.5) return { opacity: 0 }
      const u = half(k, incoming)
      return { transform: `translateX(${incoming ? -c.dir * (1 - u) ** 3 * 46 : c.dir * u ** 3 * 46}%)` }
    }
    case "through": {
      // one push: the old shot rushes past the lens, the new one comes up out of the blur still moving, settling
      if (incoming ? k < 0.5 : k >= 0.5) return { opacity: 0 }
      const u = half(k, incoming)
      return incoming ? { transform: `scale(${0.78 + 0.22 * expoOut(u)})`, filter: `blur(${(1 - u) ** 2 * 1.1}cqw)` } : { transform: `scale(${1 + 0.55 * u ** 2.6})`, filter: `blur(${u ** 2 * 1.1}cqw)` }
    }
    case "iris": {
      if (!incoming) return { transform: `scale(${1 + 0.05 * e})` }
      const r = e * Math.hypot(Math.max(c.cx, 1 - c.cx) * c.w, Math.max(c.cy, 1 - c.cy) * c.h)
      return { clipPath: `circle(${r.toFixed(1)}px at ${(c.cx * 100).toFixed(2)}% ${(c.cy * 100).toFixed(2)}%)` }
    }
    case "wipe": {
      if (!incoming) return { transform: `translateX(${c.dir * 3 * e}%)` }
      const p = wipeAt(e)
      const pc = (v: number) => `${(v * 100).toFixed(2)}%`
      return {
        clipPath: c.dir > 0 ? `polygon(0 0, ${pc(p + SLANT)} 0, ${pc(p - SLANT)} 100%, 0 100%)` : `polygon(100% 0, ${pc(1 - p - SLANT)} 0, ${pc(1 - p + SLANT)} 100%, 100% 100%)`,
        transform: `translateX(${-c.dir * 3 * (1 - e)}%)`,
      }
    }
    case "dissolve":
      return incoming ? { opacity: e } : {}
    case "fade":
      return incoming ? { opacity: clamp(e * 2 - 1) } : { opacity: clamp(1 - e * 2) }
    case "push":
      return {
        transform: `translateX(${incoming ? (1 - e) * 100 : -e * 100}%)`,
      }
    case "zoom":
      return incoming ? { opacity: e, transform: `scale(${0.86 + 0.14 * e})` } : { opacity: 1 - e, transform: `scale(${1 + 0.22 * e})` }
    case "blur":
      return incoming ? { opacity: e, filter: `blur(${(1 - e) * 1.4}cqw)` } : { opacity: 1 - e, filter: `blur(${e * 1.4}cqw)` }
    case "flash":
      // a hard cut in the middle; the false colour is drawn over both (see the composition)
      return incoming ? (k < 0.5 ? { opacity: 0 } : {}) : k < 0.5 ? {} : { opacity: 0 }
    default:
      return incoming ? {} : { opacity: 0 }
  }
}

/** A preset's state: opacity, a rise (cqh), a scale, a blur (cqw). */
type Look = { opacity: number; y: number; scale: number; blur: number }
const REST: Look = { opacity: 1, y: 0, scale: 1, blur: 0 }
/** A flat layer's way in, `k` 0 → 1, on the preset's own curve or the one given. Titles that animate word by word come
    in as a block with "none" (or a fade). */
function entering(enter: string, k: number, ease?: string): Look {
  const e = ease ? curve(ease)(clamp(k)) : expoOut(k)
  switch (enter) {
    case "rise":
      return { opacity: clamp(k * 2.2), y: (1 - e) * 4, scale: 1, blur: 0 }
    case "scale":
      return { opacity: clamp(k * 2.2), y: 0, scale: 0.94 + 0.06 * e, blur: 0 }
    case "blur":
      return { opacity: clamp(k * 1.8), y: (1 - e) * 1.5, scale: 1, blur: (1 - e) * 0.8 }
    case "fade":
    case "sweep":
      return { opacity: clamp(k * 1.6), y: 0, scale: 1, blur: 0 }
    default:
      return REST
  }
}
/** A flat layer's way out, `k` 0 → 1: the same presets played away (a rise leaves upwards). */
function leaving(kind: string, k: number, ease?: string): Look {
  if (k <= 0 || kind === "none") return REST
  const e = ease ? curve(ease)(clamp(k)) : inOut(k)
  const o = 1 - e
  switch (kind) {
    case "rise":
      return { opacity: o, y: -e * 4, scale: 1, blur: 0 }
    case "scale":
      return { opacity: o, y: 0, scale: 1 - 0.08 * e, blur: 0 }
    case "blur":
      return { opacity: o, y: -e * 1.5, scale: 1, blur: e * 0.8 }
    default:
      return { opacity: o, y: 0, scale: 1, blur: 0 }
  }
}
const lookCss = (e: Look) => ({ transform: `${e.y ? `translateY(${e.y}cqh)` : ""} ${e.scale !== 1 ? `scale(${e.scale})` : ""}`.trim(), filter: e.blur > 0.001 ? `blur(${e.blur}cqw)` : "" })

/** Titles whose In plays piece by piece (their box stays put while words, letters or lines come in). */
const PIECEWISE = ["words", "type", "part", "mask", "letters", "settle", "custom"]

/** A property's value `t` seconds into the scene, from its animation blocks: before the first, its `from`; inside one,
    between its two values on its curve; after, its `to`. Without blocks, its rest. */
function valueAt(l: MovingLayer, prop: Prop, t: number): number[] {
  const list = (l.tweens ?? []).filter((x) => x.prop === prop).sort((a, b) => a.at - b.at)
  const rest = PROPS.find((p) => p.id === prop)!.rest
  if (!list.length) return rest
  if (t < list[0].at) return list[0].from
  let cur = list[0]
  for (const x of list) if (x.at <= t) cur = x
  const k = clamp((t - cur.at) / Math.max(0.01, cur.dur))
  const e = curve(cur.ease)(k)
  return rest.map((_, i) => (cur.from[i] ?? rest[i]) + ((cur.to[i] ?? rest[i]) - (cur.from[i] ?? rest[i])) * e)
}

/** Where a moving layer is `t` seconds into its scene: its In (from `auto` unless it has its own timing), its
    animation blocks, its Out and its resting design. The box's opacity, transform after its centring, and filter, and
    how far into its In it is (for titles animated piece by piece). */
function motionOf(l: MovingLayer, t: number, auto: number, wPx: number) {
  const piecewise = l.kind === "text" && PIECEWISE.includes(l.enter)
  const inAt = l.entry?.at ?? auto
  const into = t - inAt
  const a = entering(piecewise ? "none" : l.enter, into / Math.max(0.05, l.entry?.dur ?? 0.9), l.entry?.ease)
  const b = l.exit ? leaving(l.exit.kind, (t - l.exit.at) / Math.max(0.05, l.exit.dur), l.exit.ease) : REST
  const [dx, dy] = valueAt(l, "position", t)
  const [s] = valueAt(l, "scale", t)
  const [r] = valueAt(l, "rotate", t)
  const [op] = valueAt(l, "opacity", t)
  const [bl] = valueAt(l, "blur", t)
  const [tx, ty] = valueAt(l, "tilt", t)
  const rot = (l.rot ?? 0) + r
  const tiltX = (l.tilt?.x ?? 0) + tx
  const tiltY = (l.tilt?.y ?? 0) + ty
  const blur = Math.max(0, (l.blur ?? 0) + bl + a.blur + b.blur)
  const y = a.y + b.y
  const scale = a.scale * b.scale * s
  const parts = [
    "translate(-50%, -50%)",
    dx || dy ? `translate(calc(${(dx * 100).toFixed(3)}cqw * var(--vz, 1)), calc(${(dy * 100).toFixed(3)}cqh * var(--vz, 1)))` : "",
    tiltX || tiltY ? `perspective(${Math.round(Math.max(200, wPx * 2.4))}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)` : "",
    rot ? `rotate(${rot}deg)` : "",
    y ? `translateY(${y}cqh)` : "",
    scale !== 1 ? `scale(${scale})` : "",
  ]
  return {
    opacity: clamp(a.opacity * b.opacity * (l.opacity ?? 1) * op),
    transform: parts.filter(Boolean).join(" "),
    filter: blur > 0.001 ? `blur(${blur.toFixed(3)}cqw)` : "",
    into,
  }
}

/** How far a scene's devices are taken apart at `t`. */
function apartAt(mode: Scene["teardown"], t: number) {
  if (mode === "apart") return inOut((t - 0.5) / 2)
  if (mode === "hold") return 1
  if (mode === "assemble") return 1 - inOut((t - 0.6) / 2.2)
  return 0
}

/* ---------------- labels: a title, a note, and a leader line to the point they name ---------------- */

type LabelItem = {
  key: string
  name: string
  note?: string
  /** the point named, px in the scene */
  ax: number
  ay: number
  /** which side of the subject the label sits on */
  side: -1 | 1
  /** 0 → 1: drawn in */
  p: number
  /** a fixed place for the label (a callout's); otherwise they're laid out in a column on their side */
  lx?: number
  ly?: number
  /** a caption under its subject, without a line */
  caption?: boolean
}

/** The labels of one scene, drawn by hand each frame (they follow things that move). Lines run from the label a
    short way out, then at an angle to the point, the way a technical drawing's leaders do; each draws in from its
    label, the text first, a dot where it lands. */
class Labels {
  private root = document.createElement("div")
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  private slots: {
    line: SVGPolylineElement
    dot: SVGCircleElement
    box: HTMLDivElement
    title: HTMLSpanElement
    note: HTMLSpanElement
  }[] = []

  constructor(host: HTMLElement) {
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:50"
    this.svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible"
    this.root.appendChild(this.svg)
    host.appendChild(this.root)
  }

  private slot(i: number) {
    while (this.slots.length <= i) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
      line.setAttribute("fill", "none")
      line.setAttribute("stroke-linecap", "round")
      line.setAttribute("stroke-linejoin", "round")
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle")
      this.svg.append(line, dot)
      const box = document.createElement("div")
      box.style.cssText = "position:absolute;left:0;top:0;white-space:nowrap;line-height:1.15"
      const title = document.createElement("span")
      title.style.cssText = "display:block;font-weight:550;letter-spacing:-0.01em"
      const note = document.createElement("span")
      note.style.cssText = "display:block;text-transform:uppercase;letter-spacing:0.12em;opacity:0.58;margin-top:0.35em"
      box.append(title, note)
      this.root.appendChild(box)
      this.slots.push({ line, dot, box, title, note })
    }
    return this.slots[i]
  }

  draw(items: LabelItem[], W: number, H: number, ink: string, font: string) {
    const u = W / 100 // one cqw
    this.svg.setAttribute("width", String(W))
    this.svg.setAttribute("height", String(H))
    // a column either side, each label level with its point unless they'd collide
    for (const side of [-1, 1] as const) {
      const list = items.filter((it) => it.lx == null && !it.caption && it.side === side).sort((a, b) => a.ay - b.ay)
      if (!list.length) continue
      const col = side < 0 ? Math.max(u * 15, Math.min(...list.map((i) => i.ax)) - u * 8) : Math.min(W - u * 15, Math.max(...list.map((i) => i.ax)) + u * 8)
      let y = -Infinity
      for (const it of list) {
        it.lx = col
        it.ly = Math.max(it.ay, y + u * 4.2)
        y = it.ly
      }
      const over = y - (H - u * 3.5)
      if (over > 0) for (const it of list) it.ly! -= over
      const under = u * 3.5 - list[0].ly!
      if (under > 0) for (const it of list) it.ly! += under
    }
    items.forEach((it, i) => {
      const s = this.slot(i)
      const lx = it.lx ?? it.ax
      const ly = it.ly ?? it.ay
      const shown = it.p > 0.001
      s.box.style.display = shown ? "" : "none"
      s.line.style.display = shown && !it.caption ? "" : "none"
      s.dot.style.display = shown && !it.caption ? "" : "none"
      if (!shown) return
      const textIn = clamp(it.p / 0.35)
      s.title.textContent = it.name
      s.note.textContent = it.note ?? ""
      s.note.style.display = it.note ? "" : "none"
      s.box.style.fontFamily = font
      s.box.style.color = ink
      s.title.style.fontSize = `${u * (it.caption ? 1.15 : 1.3)}px`
      s.note.style.fontSize = `${u * 0.72}px`
      s.box.style.opacity = String(textIn)
      if (it.caption) {
        s.box.style.textAlign = "center"
        s.box.style.transform = `translate(${lx}px, ${ly + (1 - textIn) * u * 0.6}px) translate(-50%, 0)`
        return
      }
      s.box.style.textAlign = it.side < 0 ? "right" : "left"
      s.box.style.transform = `translate(${lx + it.side * (1 - textIn) * u * 0.8}px, ${ly}px) translate(${it.side < 0 ? "-100%" : "0"}, -50%)`
      // the leader: out from the label, then to the point
      const sx = lx - it.side * u * 0.7
      const ex = sx - it.side * u * 2.2
      const pts = [
        [sx, ly],
        [ex, ly],
        [it.ax, it.ay],
      ]
      const len = Math.hypot(ex - sx, 0) + Math.hypot(it.ax - ex, it.ay - ly)
      const lp = clamp((it.p - 0.15) / 0.85)
      s.line.setAttribute("points", pts.map((p) => p.join(",")).join(" "))
      s.line.setAttribute("stroke", ink)
      s.line.setAttribute("stroke-opacity", "0.8")
      s.line.setAttribute("stroke-width", String(Math.max(1, u * 0.085)))
      s.line.style.strokeDasharray = `${len} ${len}`
      s.line.style.strokeDashoffset = String(len * (1 - lp))
      s.dot.setAttribute("cx", String(it.ax))
      s.dot.setAttribute("cy", String(it.ay))
      s.dot.setAttribute("r", String(u * 0.3 * clamp((lp - 0.85) / 0.15)))
      s.dot.setAttribute("fill", ink)
    })
    for (let i = items.length; i < this.slots.length; i++) {
      const s = this.slots[i]
      s.box.style.display = "none"
      s.line.style.display = "none"
      s.dot.style.display = "none"
    }
  }

  dispose() {
    this.root.remove()
  }
}

/* ---------------- frames: one iframe per live animation, talked to by the view ---------------- */

type Registry = {
  add: (key: string, el: HTMLIFrameElement) => void
  update: (key: string, spec: FrameSpec) => void
  remove: (key: string, el: HTMLIFrameElement | null) => void
}

function Frame({ spec, reg, resolve }: { spec: FrameSpec; reg: Registry; resolve: Resolve }) {
  const el = useRef<HTMLIFrameElement>(null)
  // the address is set once per frame: theme, values and hairline change by message, so the animation keeps playing
  const src = useMemo(() => {
    const q = new URLSearchParams({
      ...spec.query,
      frame: spec.key,
      rm: resolve.reduce ? "1" : "0",
      cs: spec.scheme,
      host: resolve.origin,
    })
    if (resolve.stepped) q.set("vt", "1")
    if (spec.hairline) q.set("hl", "1")
    if (spec.ink) q.set("ink", spec.ink)
    if (spec.fill) q.set("fill", spec.fill)
    return `${resolve.frames ?? ""}${spec.path}?${q}`
  }, [spec.key, spec.path, JSON.stringify(spec.query), resolve.stepped, resolve.origin, resolve.frames]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const x = el.current!
    reg.add(spec.key, x)
    return () => reg.remove(spec.key, x)
  }, [reg, spec.key])
  const said = JSON.stringify([spec.values, spec.scheme, spec.bare, spec.hairline, spec.ink, spec.fill])
  useEffect(() => reg.update(spec.key, spec), [reg, said]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={spec.box ?? { position: "absolute", inset: 0 }}>
      {/* its own layer: a camera moving it by fractions of a pixel would otherwise resize it every frame, and the page waits on it */}
      <iframe ref={el} title={spec.key} src={src} tabIndex={-1} className="pointer-events-none block h-full w-full border-0" style={{ background: "transparent", willChange: "transform" }} />
    </div>
  )
}

/* ---------------- titles ---------------- */

const FAMILY = {
  text: (b?: Brand) => `${b?.font ? `"${b.font}", ` : ""}Geist, Inter, system-ui, sans-serif`,
  display: (b?: Brand) => `${b?.display ? `"${b.display}", ` : b?.font ? `"${b.font}", ` : ""}Geist, Inter, system-ui, sans-serif`,
  mono: (b?: Brand) => `${b?.mono ? `"${b.mono}", ` : ""}"Geist Mono", ui-monospace, monospace`,
  serif: () => `"Instrument Serif", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`,
}

/** A title's words (or letters, or lines, or halves), as spans the view animates one by one. */
function textBody(l: TextLayer): ReactNode {
  if (l.enter === "custom") return pieces(l.text, l.animation ?? TEXT_ANIM)
  // letters, but each word kept whole so a line never breaks inside one
  if (l.enter === "letters")
    return l.text.split(/(\s+)/).map((w, i) =>
      /^\s+$/.test(w) ? (
        w.includes("\n") ? <br key={i} /> : w
      ) : (
        <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {[...w].map((c, j) => (
            <span key={j} data-l="" style={{ display: "inline-block", transformOrigin: "50% 100%" }}>
              {c}
            </span>
          ))}
        </span>
      ),
    )
  if (l.enter === "type")
    return (
      <>
        {[...l.text].map((c, i) => (
          <span key={i} data-c="">
            {c}
          </span>
        ))}
        <span
          data-caret=""
          style={{
            display: "inline-block",
            width: "0.06em",
            height: "0.95em",
            marginLeft: "0.04em",
            verticalAlign: "-0.1em",
            background: "currentColor",
          }}
        />
      </>
    )
  if (l.enter === "words" || l.enter === "sweep")
    return l.text.split(/(\s+)/).map((w, i) =>
      /^\s+$/.test(w) ? (
        w.includes("\n") ? (
          <br key={i} />
        ) : (
          w
        )
      ) : (
        <span key={i} data-w="" style={{ display: "inline-block" }}>
          {w}
        </span>
      ),
    )
  if (l.enter === "part") {
    const [a, b = ""] = l.text.split("|")
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          justifyContent: "center",
          whiteSpace: "nowrap",
        }}
      >
        <span data-half="0">{a.trim()}</span>
        <span data-gap="" style={{ display: "inline-block", width: 0 }} />
        <span data-half="1">{b.trim()}</span>
      </span>
    )
  }
  if (l.enter === "mask")
    return l.text.split("\n").map((line, i) => (
      <span
        key={i}
        style={{
          display: "block",
          overflow: "hidden",
          paddingBottom: "0.08em",
        }}
      >
        <span data-line="" style={{ display: "block" }}>
          {line}
        </span>
      </span>
    ))
  return l.text
}

/** Moves a title's pieces for `t` seconds into its own entrance. */
function animateText(box: HTMLElement, l: TextLayer, t: number) {
  if (l.enter === "custom") playPieces(box, l.animation ?? TEXT_ANIM, t)
  else if (l.enter === "letters") {
    // each letter drops in stretched along its fall and settles: a smear without a blur's softness
    box.querySelectorAll<HTMLElement>("[data-l]").forEach((c, i) => {
      const k = clamp((t - i * 0.03) / 0.6)
      const e = expoOut(k)
      c.style.opacity = String(clamp(k * 3))
      c.style.transform = k < 1 ? `translateY(${(1 - e) * -0.55}em) scaleY(${1 + (1 - e) * 0.9})` : ""
    })
  } else if (l.enter === "settle") {
    const p = box.firstElementChild as HTMLElement | null
    if (p) {
      const k = clamp(t / 1.1)
      const e = expoOut(k)
      p.style.opacity = String(clamp(k * 2.5))
      p.style.transform = k < 1 ? `scale(${1 + (1 - e) * 0.9})` : ""
      p.style.filter = k < 1 ? `blur(${(1 - e) * 0.12}em)` : ""
    }
  } else if (l.enter === "type") {
    const chars = box.querySelectorAll<HTMLElement>("[data-c]")
    const shown = Math.max(0, Math.floor(t / 0.045))
    chars.forEach((c, i) => (c.style.display = i < shown ? "" : "none"))
    const caret = box.querySelector<HTMLElement>("[data-caret]")
    if (caret) {
      const typing = shown < chars.length
      const after = t - chars.length * 0.045
      caret.style.opacity = t < 0 ? "0" : typing || Math.floor(after * 2) % 2 === 0 ? "1" : "0"
      if (after > 2.2) caret.style.opacity = "0"
    }
  } else if (l.enter === "words") {
    box.querySelectorAll<HTMLElement>("[data-w]").forEach((w, i) => {
      const k = clamp((t - i * 0.07) / 0.55)
      const e = expoOut(k)
      w.style.opacity = String(clamp(k * 2))
      w.style.transform = `translateY(${(1 - e) * 0.45}em)`
      w.style.filter = k < 1 ? `blur(${(1 - e) * 0.18}em)` : ""
    })
  } else if (l.enter === "sweep") {
    const words = box.querySelectorAll<HTMLElement>("[data-w]")
    // a light runs across the words, each brightening as it passes and staying lit
    const head = (t / 1.5) * (words.length + 1.5) - 0.5
    words.forEach((w, i) => {
      const lit = clamp(head - i)
      w.style.opacity = String(0.24 + 0.76 * inOut(lit))
    })
  } else if (l.enter === "part") {
    const k = expoOut(t / 1.1)
    const gap = box.querySelector<HTMLElement>("[data-gap]")
    if (gap) gap.style.width = `${(l.gap ?? 22) * k}cqw`
    box.querySelectorAll<HTMLElement>("[data-half]").forEach((h, i) => {
      h.style.opacity = String(clamp(t / 0.5))
      h.style.transform = `translateX(${(1 - k) * (i ? -1 : 1) * 1.2}cqw)`
    })
  } else if (l.enter === "mask") {
    box.querySelectorAll<HTMLElement>("[data-line]").forEach((line, i) => {
      const e = expoOut((t - i * 0.1) / 0.75)
      line.style.transform = `translateY(${(1 - e) * 110}%)`
    })
  }
}

/** A title filled with its gradient. A title animated in pieces gets the gradient on every piece, sized to the whole
    title and shifted to where the piece sits, so it reads as one fill. Redone only when the title's size changes. */
const filled = new WeakMap<HTMLElement, string>()
function paintText(box: HTMLElement, l: TextLayer) {
  const p = box.querySelector<HTMLElement>("p")
  if (!p) return
  const parts = [...p.querySelectorAll<HTMLElement>("[data-w], [data-c], [data-l], [data-half], [data-line], [data-p]")]
  if (!l.paint?.length) {
    // back to a plain colour: take the gradient off whatever had it
    if (filled.has(p)) {
      filled.delete(p)
      for (const s of [p, ...parts]) for (const k of ["background-image", "background-size", "background-repeat", "background-position", "background-clip", "-webkit-background-clip", "color"]) if (s !== p || k !== "color") s.style.removeProperty(k)
      for (const s of parts) s.style.removeProperty("color")
      p.style.color = ""
    }
    return
  }
  const W = p.offsetWidth
  const H = p.offsetHeight
  const key = `${W}x${H}|${JSON.stringify(l.paint)}|${l.text}|${l.enter}|${l.animation?.by}${l.animation?.mask}`
  if (!W || filled.get(p) === key) return
  filled.set(p, key)
  const css = layersCss(l.paint, W, H)
  for (const s of parts.length ? parts : [p]) {
    s.style.backgroundImage = css
    s.style.backgroundSize = `${W}px ${H}px`
    s.style.backgroundRepeat = "no-repeat"
    s.style.backgroundPosition = s === p ? "0 0" : `${p.offsetLeft - s.offsetLeft}px ${p.offsetTop - s.offsetTop}px`
    s.style.backgroundClip = "text"
    s.style.setProperty("-webkit-background-clip", "text")
    s.style.color = "transparent"
  }
}

/* ---------------- component shots ---------------- */

/** The camera on a component at `t` seconds into a `dur`-second scene. */
function shotTransform(l: ComponentLayer, t: number, dur: number, footW: number): { transform: string; origin: string } {
  const u = clamp(t / Math.max(0.1, dur))
  const persp = `perspective(${Math.round(footW * 2.4)}px)`
  switch (l.shot) {
    case "tilt": {
      const k = expoOut(t / 2.4)
      const ry = -20 * (1 - k) - 5 + 2 * Math.sin(t * 0.6)
      return {
        transform: `${persp} rotateX(${26 * (1 - k) + 7}deg) rotateY(${ry}deg) rotateZ(${3 * (1 - k)}deg) scale(${0.9 + 0.1 * k})`,
        origin: "50% 50%",
      }
    }
    case "dolly":
      return {
        transform: `${persp} rotateX(${12 - 4 * u}deg) rotateY(${-12 + 7 * inOut(u)}deg) scale(${0.93 + 0.16 * inOut(u)})`,
        origin: "50% 50%",
      }
    case "macro":
      // the magnification itself is done with zoom, so the close-up is drawn at its size, not blown up
      return {
        transform: `${persp} rotateX(6deg) rotateY(${-5 + 6 * u}deg)`,
        origin: "50% 50%",
      }
    case "float":
      return {
        transform: `${persp} rotateX(${4 + 4 * Math.sin((2 * Math.PI * t) / 7)}deg) rotateY(${9 * Math.sin((2 * Math.PI * t) / 6)}deg) translateY(${Math.sin((2 * Math.PI * t) / 6.5) * 0.8}%)`,
        origin: "50% 50%",
      }
    case "orbit":
      return {
        transform: `${persp} rotateX(8deg) rotateY(${-28 + 56 * inOut(u)}deg)`,
        origin: "50% 50%",
      }
    default:
      return { transform: "", origin: "50% 50%" }
  }
}

/* ---------------- one scene ---------------- */

type SceneHandle = {
  el: HTMLDivElement | null
  render: (local: number, drag?: Drag) => void
}

const SceneView = forwardRef<
  SceneHandle,
  {
    scene: Scene
    comp: Comp
    size: { w: number; h: number }
    resolve: Resolve
    reg: Registry
    inks: Record<string, ScreenInk>
    parts: Record<string, PartsReport>
    fill: string
    preserve: boolean
    /** near the playhead: its live frames are loaded (far scenes keep only their layout) */
    live: boolean
  }
>(function SceneView({ scene, comp, size, resolve, reg, inks, parts, fill, preserve, live }, ref) {
  const el = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [studio, setStudio] = useState<StudioScene | null>(null)
  const devices = devicesOf(scene)
  const flats = useRef(new Map<string, HTMLDivElement>())
  const labels = useRef<Labels | null>(null)
  const has3d = devices.length > 0
  const brand = comp.brand
  const onDark = isDark(fill)
  const ink = labelInk(fill)

  // a 3D scene is a WebGL context of its own (and its shaders, and its lighting): only the scenes near the playhead
  // keep one (an export keeps them all). A film of eight scenes built eight at once, and the editor froze for seconds.
  const want3d = has3d && (live || preserve)
  useEffect(() => {
    if (!want3d) return
    const s = StudioScene.take(host.current!, { preserve })
    setStudio(s)
    return () => {
      s.release()
      setStudio(null)
    }
  }, [want3d, preserve])
  useEffect(() => {
    labels.current = new Labels(el.current!)
    return () => labels.current?.dispose()
  }, [])

  const placed = devices.map((l) => ({
    key: l.id,
    id: l.device,
    posture: l.posture,
    landscape: l.landscape && deviceOf(l).rotates,
    finish: finishFor(l),
    screenBg: resolve.screen(l.content, deviceOf(l), l.id, false).bg,
    slot: l.slot,
  }))
  const sig = JSON.stringify(placed.map((p) => [p.key, p.id, p.posture, p.landscape, p.finish.id, p.screenBg, p.slot]))
  useEffect(() => {
    studio?.setDevices(placed)
  }, [studio, sig]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () =>
      studio?.setLook({
        shadow: comp.shadow,
        reflections: comp.reflections,
        light: comp.light,
      }),
    [studio, comp.shadow, comp.reflections, comp.light],
  )
  useEffect(() => {
    if (size.w && size.h) studio?.resize(size.w, size.h, preserve ? devicePixelRatio : Math.min(devicePixelRatio, 2))
  }, [studio, size.w, size.h, preserve])

  /** the components a breakdown's whole screen reported; until it has, what the same screen said in another scene (so a
      close-up can load its component straight away, not after its screen) */
  const partsFor = (l: BreakdownLayer) =>
    parts[`${scene.id}:${l.id}:full`] ??
    comp.scenes
      .flatMap((s) => s.layers.map((x) => (x.kind === "breakdown" && x.anim === l.anim && (x.mockup === "tablet") === (l.mockup === "tablet") ? parts[`${s.id}:${x.id}:full`] : undefined)))
      .find(Boolean)
  const font = FAMILY.text(brand)
  /** a title's "{part}" is the name of the component this scene's close-up shows, "{note}" what's in it */
  const fillText = (s: string) => {
    if (!s.includes("{")) return s
    const bd = scene.layers.find((x): x is BreakdownLayer => x.kind === "breakdown" && x.view === "focus" && !x.hidden)
    const f = bd ? focusOf(bd, partsFor(bd)) : null
    return s.replace(/\{part\}/g, f?.name ?? "").replace(/\{note\}/g, f?.it.note ?? "")
  }

  useImperativeHandle(
    ref,
    () => ({
      get el() {
        return el.current
      },
      render(local, drag) {
        const items: LabelItem[] = []
        const root = el.current
        const R = root?.getBoundingClientRect()
        const k = R && R.width ? size.w / R.width : 1
        const inScene = (r: DOMRect) => ({
          x: (r.left + r.width / 2 - (R?.left ?? 0)) * k,
          y: (r.top + r.height / 2 - (R?.top ?? 0)) * k,
        })
        // "two framings": the camera (3D and flat) glides from the start framing to the end one on the scene's curve; a
        // gesture lands on whichever framing is being set
        const two = scene.move === "framings"
        const u = two ? curve(scene.ease)(clamp(local / Math.max(0.1, scene.duration))) : 0
        const start = drag?.end ? undefined : drag
        const end = drag?.end ? drag : undefined
        const v0 = viewWith(scene.view ?? VIEW, start)
        const v1 = two ? viewWith(scene.view2 ?? scene.view ?? VIEW, end) : v0
        const v = { x: v0.x + (v1.x - v0.x) * u, y: v0.y + (v1.y - v0.y) * u, zoom: v0.zoom * (v1.zoom / v0.zoom) ** u }
        if (root) {
          root.style.setProperty("--vx", `${(v.x * 100).toFixed(4)}%`)
          root.style.setProperty("--vy", `${(v.y * 100).toFixed(4)}%`)
          root.style.setProperty("--vz", v.zoom.toFixed(5))
        }
        const sx = (x: number) => (0.5 + (x - v.x) * v.zoom) * size.w
        const sy = (y: number) => (0.5 + (y - v.y) * v.zoom) * size.h
        if (studio && has3d) {
          const apart = apartAt(scene.teardown, local)
          const pose = two ? mix(cameraPose(scene, start), cameraPose({ ...scene, camera: scene.camera2 ?? scene.camera }, end), u) : move(scene.move, cameraPose(scene, drag), local, scene.duration)
          studio.setPose(pose, { at: scene.frame, arrival: scene.arrival, t: local, apart })
          studio.render()
          studio.partMarks().forEach((m, i) =>
            items.push({
              key: m.key,
              name: m.name,
              ax: m.x,
              ay: m.y,
              side: m.side,
              p: clamp((apart - 0.5) / 0.4 - i * 0.08),
            }),
          )
        }
        // flat layers come in one after another, a beat after the scene starts, unless they have their own timing
        let n = 0
        for (const l of scene.layers) {
          if (l.kind === "device" || l.hidden) continue
          const box = flats.current.get(l.id)
          if (!box) continue
          const auto = 0.25 + n * 0.12
          const t0 = local - auto
          n++
          if (moving(l)) {
            const m = motionOf(l, local, auto, l.box.w * size.w)
            box.style.opacity = String(m.opacity)
            box.style.transform = m.transform
            box.style.filter = m.filter
            if (l.kind === "text") {
              animateText(box, l, m.into)
              paintText(box, l)
            }
          } else {
            const e = lookCss(entering(l.enter, t0 / 0.9))
            box.style.opacity = String(entering(l.enter, t0 / 0.9).opacity)
            box.style.transform = l.kind === "breakdown" ? e.transform : `translate(-50%, -50%) ${e.transform}`
            box.style.filter = e.filter
          }
          if (l.kind === "text") continue
          else if (l.kind === "component" && l.shot && l.shot !== "flat") {
            const card = box.querySelector<HTMLElement>("[data-shot]")
            if (card) {
              const s = shotTransform(l, local, scene.duration, l.box.w * size.w)
              card.style.transform = s.transform
              card.style.transformOrigin = s.origin
            }
            if (l.shot === "macro") {
              // an extreme close-up gliding across one part of it: zoomed in, the focus held near the middle
              const u = clamp(local / Math.max(0.1, scene.duration))
              const W = l.natural?.w ?? 420
              const H = W / l.aspect
              const k = (l.box.w * size.w) / W
              const mz = 2.35 + 0.2 * u
              const f = l.focus ?? { x: 0.5, y: 0.35 }
              const fx = f.x + (u - 0.5) * 0.16
              const bw = l.box.w * size.w
              const zoomEl = box.querySelector<HTMLElement>("[data-zoom]")
              const pan = box.querySelector<HTMLElement>("[data-pan]")
              if (zoomEl) zoomEl.style.zoom = String(k * mz * v.zoom)
              if (pan) pan.style.transform = `translate(${0.5 * bw - fx * W * k * mz}px, ${0.5 * (bw / l.aspect) - f.y * H * k * mz}px)`
            }
          } else if (l.kind === "callout") {
            items.push({
              key: l.id,
              name: l.text,
              note: l.sub,
              ax: sx(l.at.x),
              ay: sy(l.at.y),
              side: l.at.x >= l.box.x ? -1 : 1,
              lx: sx(l.box.x),
              ly: sy(l.box.y),
              p: clamp(t0 / 1.1),
            })
            box.style.opacity = "0" // the label itself is drawn with the leader
          } else if (l.kind === "breakdown") {
            const marks = animateBreakdown(box, l, partsFor(l), local, scene, size, inScene)
            if (l.labels) items.push(...marks)
          }
        }
        labels.current?.draw(items, size.w, size.h, ink, font)
      },
    }),
    [studio, has3d, scene, size.w, size.h, ink, font, parts], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const first3d = scene.layers.findIndex((l) => l.kind === "device" && !l.hidden)
  const textColor = (c: string) => c || (onDark ? "#fafafa" : brand && !brand.dark ? brand.ink : "#0a0a0b")
  const scheme = onDark ? "dark" : "light"
  const flat = (l: FlatLayer) => {
    const style: CSSProperties =
      l.kind === "breakdown"
        ? { position: "absolute", inset: 0 }
        : {
            // through the flat camera (--vx/--vy: the point in the middle, --vz: how close), set each frame
            position: "absolute",
            left: `calc(50% + (${l.box.x * 100}% - var(--vx, 50%)) * var(--vz, 1))`,
            top: `calc(50% + (${l.box.y * 100}% - var(--vy, 50%)) * var(--vz, 1))`,
            width: `calc(${l.box.w * 100}% * var(--vz, 1))`,
            transform: "translate(-50%, -50%)",
          }
    // a component runs at its own width (what it measured, else a phone's) and is zoomed to the box
    const W = l.kind === "component" ? (l.natural?.w ?? 420) : 420
    const k = (l.box.w * size.w) / W
    const selection = (l.kind === "image" || l.kind === "component") && l.frame === "selection" ? <SelectionFrame color={l.frameColor || "#1d8cf8"} /> : null
    let inner: ReactNode
    if (l.kind === "shape") {
      const pw = l.box.w * size.w || 100
      const shown = l.paint.filter((p) => !p.hidden)
      inner = (
        <div
          style={{
            width: "100%",
            aspectRatio: l.aspect,
            borderRadius: l.shape === "ellipse" ? "50%" : `calc(${l.radius}cqw * var(--vz, 1))`,
            backgroundImage: layersCss(l.paint, pw, pw / l.aspect) || undefined,
            backgroundBlendMode: shown.some((p) => p.blend !== "normal") ? [...shown].reverse().map((p) => p.blend).join(", ") : undefined,
            boxShadow: [l.stroke && l.stroke.width > 0 ? `inset 0 0 0 calc(${l.stroke.width / 10}cqw * var(--vz, 1)) ${l.stroke.color}` : "", l.shadow ? "0 2cqw 4cqw -1.6cqw rgb(0 0 0 / 0.38)" : ""].filter(Boolean).join(", ") || undefined,
          }}
        />
      )
    } else if (l.kind === "cursor") {
      // the arrow's tip is the layer's point; the name sits below and right of it
      inner = (
        <span className="relative block h-0 w-0">
          <svg aria-hidden viewBox="0 0 24 24" className="absolute" style={{ left: "-0.1cqw", top: "-0.1cqw", width: "calc(1.7cqw * var(--vz, 1))", height: "calc(1.7cqw * var(--vz, 1))", filter: "drop-shadow(0 0.12cqw 0.25cqw rgb(0 0 0 / 0.3))" }}>
            <path d="M3 2.6 20.4 9.9 12.6 12.6 9.9 20.4Z" fill={l.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span
            className="absolute whitespace-nowrap"
            style={{
              left: "calc(1.45cqw * var(--vz, 1))",
              top: "calc(1.55cqw * var(--vz, 1))",
              background: l.color,
              color: "#fff",
              font: `600 calc(1.05cqw * var(--vz, 1))/1 ${FAMILY.text(brand)}`,
              padding: "0.48em 0.72em",
              borderRadius: "0.55em",
              boxShadow: "0 0.15cqw 0.5cqw rgb(0 0 0 / 0.22)",
            }}
          >
            {l.label}
          </span>
        </span>
      )
    } else if (l.kind === "text") {
      const display = l.font === "display"
      const mono = l.font === "mono"
      const serif = l.font === "serif"
      inner = (
        <p
          className="m-0 whitespace-pre-wrap text-balance"
          style={{
            fontSize: `calc(${l.size}cqw * var(--vz, 1))`,
            fontWeight: l.weight,
            textAlign: l.align,
            lineHeight: display ? 0.92 : mono ? 1.3 : serif ? 1 : 1.04,
            // through a variable, so a title animation's tracking can widen it from where it rests
            ["--ls" as string]: display ? "-0.05em" : mono ? "0.16em" : serif ? "-0.02em" : "-0.035em",
            letterSpacing: "var(--ls)",
            textTransform: mono ? "uppercase" : undefined,
            color: textColor(l.color),
            fontFamily: display ? FAMILY.display(brand) : mono ? FAMILY.mono(brand) : serif ? FAMILY.serif() : FAMILY.text(brand),
            // a face without the weight asked for shows its nearest, never a smeared fake bold
            fontSynthesisWeight: "none",
          }}
        >
          {textBody({ ...l, text: fillText(l.text) })}
        </p>
      )
    } else if (l.kind === "image") {
      const css: CSSProperties = { aspectRatio: l.aspect, objectFit: "cover", borderRadius: `calc(${l.radius}cqw * var(--vz, 1))`, ...(l.hairline ? hairline(onDark) : {}) }
      // a video (a shader video, a clip) plays looped; an export seeks it to each frame's time
      inner = (
        <div className="relative">
          {/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(l.src) ? (
            <video src={resolve.image(l.src)} autoPlay={!resolve.stepped} muted loop playsInline preload="auto" className="block w-full" style={css} />
          ) : (
            <img src={resolve.image(l.src)} alt="" draggable={false} className="block w-full" style={css} />
          )}
          {selection}
        </div>
      )
    }
    else if (l.kind === "callout")
      // the label and its line are drawn by the scene's labels; this box is what the stage picks and drags
      inner = <div style={{ height: "2.4cqw" }} />
    else if (l.kind === "breakdown") {
      const key = (w: "full" | "none" | number) => `${scene.id}:${l.id}:${w}`
      inner = (
        <BreakdownBody
          l={l}
          report={partsFor(l)}
          size={size}
          dark={resolve.dark}
          ink={ink}
          font={font}
          frame={(w) => (live ? <Frame spec={resolve.part(l.anim, key(w), w, l.lines, scheme)} reg={reg} resolve={resolve} /> : null)}
        />
      )
    } else {
      // the animation runs at a phone-like width and is scaled to the box, so it lays out the same at any frame size
      const spec = resolve.component(l.anim, `${scene.id}:${l.id}`, !!l.hairline, scheme, l.values)
      const macro = l.shot === "macro"
      const frame = live ? <Frame spec={spec} reg={reg} resolve={resolve} /> : null
      inner = (
        <div className={`relative w-full ${macro ? "overflow-hidden" : ""}`} style={{ aspectRatio: l.aspect, borderRadius: "1.2cqw" }}>
          <div data-shot="" className="absolute inset-0 overflow-hidden" style={{ borderRadius: "1.2cqw" }}>
            {/* zoom, not a scale: the frame is drawn at the size it's shown, so it stays sharp at 4K and in a close-up */}
            <div data-pan="" className="absolute left-0 top-0">
              <div data-zoom="" style={{ width: W, height: W / l.aspect, zoom: `calc(${k || 0.0001} * var(--vz, 1))` }}>
                {frame}
              </div>
            </div>
          </div>
          {selection}
        </div>
      )
    }
    return (
      <div
        key={l.id}
        data-layer={l.id}
        ref={(x) => {
          if (x) flats.current.set(l.id, x)
          else flats.current.delete(l.id)
        }}
        style={l.kind === "cursor" ? { ...style, width: 0 } : style}
      >
        {inner}
      </div>
    )
  }

  return (
    <div ref={el} data-scene={scene.id} className="absolute inset-0" style={{ visibility: "hidden" }}>
      {scene.layers.map((l, i) => {
        if (l.hidden) return null
        if (l.kind !== "device") return flat(l)
        if (i !== first3d) return null
        return <div key="3d" ref={host} className="absolute inset-0" />
      })}
      {studio &&
        devices.map((l) => {
          const d = deviceOf(l)
          const screen = resolve.screen(l.content, d, l.id, !!l.hairline)
          const ink = screen.frames
            .map((f) => inks[f.key])
            .filter((x) => x?.top || x?.bottom)
            .at(-1)
          return createPortal(
            <ScreenShell d={d} landscape={l.landscape && d.rotates} posture={l.posture} dark={resolve.dark} ink={ink} bg={screen.bg}>
              {screen.image && <ScreenMedia src={resolve.image(screen.image)} video={/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(screen.image)} fit={l.fit} turn={l.turn} sw={viewport(d, l.landscape, l.posture).w} sh={viewport(d, l.landscape, l.posture).h} stepped={!!resolve.stepped} style={l.hairline ? hairline(resolve.dark) : undefined} />}
              {screen.media && <ScreenMedia src={screen.media.url} video={!!screen.media.video} fit={l.fit} turn={l.turn} sw={viewport(d, l.landscape, l.posture).w} sh={viewport(d, l.landscape, l.posture).h} stepped={!!resolve.stepped} />}
              {live && screen.frames.map((f) => <Frame key={f.key} spec={f} reg={reg} resolve={resolve} />)}
            </ScreenShell>,
            studio.slotOf(l.id),
            l.id,
          )
        })}
    </div>
  )
})

/* ---------------- a picture or a video on a device's screen ---------------- */

/** What a screen shows when it's a picture or a video: filled (cropped), whole (letterboxed on the screen's own
    ground), or turned. "Auto" turns it a quarter when its shape and the screen's don't match, so a landscape film
    fills a portrait phone instead of losing its sides; a turn set by hand adds to that. `sw`×`sh`: the screen, pt. */
function ScreenMedia({ src, video, fit = "fill", turn = 0, sw, sh, stepped, style }: { src: string; video: boolean; fit?: ScreenFit; turn?: number; sw: number; sh: number; stepped: boolean; style?: CSSProperties }) {
  const [ar, setAr] = useState(0)
  const quarter = (fit === "auto" && ar > 0 && ar > 1 !== sw / sh > 1 ? 90 : 0) + turn
  const sideways = quarter % 180 !== 0
  const box: CSSProperties = sideways
    ? { position: "absolute", left: "50%", top: "50%", width: `${(sh / sw) * 100}%`, height: `${(sw / sh) * 100}%`, transform: `translate(-50%, -50%) rotate(${quarter}deg)` }
    : { position: "absolute", inset: 0, width: "100%", height: "100%", ...(quarter ? { transform: `rotate(${quarter}deg)` } : {}) }
  // the base styles cap a picture at its box's width; turned, it's wider than the screen on purpose
  const css: CSSProperties = { ...box, maxWidth: "none", maxHeight: "none", objectFit: fit === "whole" ? "contain" : "cover", ...style }
  return video ? (
    <video src={src} autoPlay={!stepped} muted loop playsInline preload="auto" style={css} onLoadedMetadata={(e) => setAr(e.currentTarget.videoWidth / Math.max(1, e.currentTarget.videoHeight))} />
  ) : (
    <img src={src} alt="" style={css} onLoad={(e) => setAr(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))} />
  )
}

/* ---------------- the composition ---------------- */

export const CompositionView = forwardRef<
  ViewHandle,
  {
    comp: Comp
    resolve: Resolve
    preserve?: boolean
    className?: string
    /** a component said how big it is (its frame's key, px) */
    onSize?: (key: string, w: number, h: number) => void
  }
>(function CompositionView(
  { comp, resolve, preserve = false, className = "", onSize },
  ref,
) {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = root.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // the brand's fonts, once each
  const fonts = comp.brand?.fonts ?? []
  useEffect(() => {
    for (const href of fonts) {
      if ([...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => l.href === href)) continue
      document.head.appendChild(
        Object.assign(document.createElement("link"), {
          rel: "stylesheet",
          href,
        }),
      )
    }
  }, [fonts.join("|")]) // eslint-disable-line react-hooks/exhaustive-deps

  // every frame, by key: what it should show, and whether it has said it's ready to be told
  type Entry = { el: HTMLIFrameElement; spec?: FrameSpec; ready: boolean }
  const frames = useRef(new Map<string, Entry>())
  const [inks, setInks] = useState<Record<string, ScreenInk>>({})
  const [parts, setParts] = useState<Record<string, PartsReport>>({})
  // the scene at the playhead and its neighbours load their frames; the rest wait
  const [near, setNear] = useState(0)
  const nearRef = useRef(0)
  // the scene before and the next two load (a short scene is over before a film in the one after it could load), going
  // round at the end, so a looping film's first scenes are ready when it starts again. A film cut into scenes loads
  // them all and keeps them: one loading while another plays takes the film frames' process for a moment (a stall
  // mid-shot), and a scene that isn't on costs nothing (its clock is still).
  // ponytail: one frame per scene; a film of eight scenes holds eight copies of its drawing (~200 MB each for the
  // flyover). An export steps every frame it holds and never stalls, so it keeps to the scenes either side.
  const slices = useMemo(() => comp.scenes.map((s) => s.layers.some((l) => l.kind === "component" && l.from !== undefined && !l.hidden)), [comp.scenes])
  const nearby = (j: number) => {
    if (preserve) return Math.abs(j - near) <= 1
    const d = (j - near + comp.scenes.length) % comp.scenes.length
    return d <= 2 || d === comp.scenes.length - 1 || slices[j]
  }
  const tell = (f: Entry) => {
    if (!f.ready || !f.spec) return
    const post = (msg: object) => f.el.contentWindow?.postMessage({ source: "anim-engine-host", ...msg }, resolve.frames ?? resolve.origin)
    post({ type: "theme", scheme: f.spec.scheme })
    post({ type: "params", values: f.spec.values })
    post({ type: "bare", on: f.spec.bare })
    post({
      type: "hairline",
      on: f.spec.hairline,
      ink: f.spec.ink ?? "",
      fill: f.spec.fill ?? "ground",
    })
  }
  // the moment each film frame was last sent, so a still playhead sends nothing
  const clocks = useRef(new Map<string, number>())
  const clockTo = (key: string, t: number) => {
    const f = frames.current.get(key)
    if (!f || clocks.current.get(key) === t) return
    clocks.current.set(key, t)
    f.el.contentWindow?.postMessage({ source: "anim-engine-host", type: "clock", t }, resolve.frames ?? resolve.origin)
  }
  const sized = useRef(onSize)
  sized.current = onSize
  const reg: Registry = useMemo(
    () => ({
      add(key, el) {
        frames.current.set(key, {
          el,
          ready: false,
          spec: frames.current.get(key)?.spec,
        })
      },
      update(key, spec) {
        const f = frames.current.get(key)
        if (!f) return
        f.spec = spec
        tell(f)
      },
      remove(key, el) {
        if (frames.current.get(key)?.el === el) frames.current.delete(key)
      },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data
      if (e.origin !== (resolve.frames ?? resolve.origin) || d?.source !== "anim-engine-stage" || typeof d.frame !== "string") return
      const f = frames.current.get(d.frame)
      if (!f || e.source !== f.el.contentWindow) return
      if (d.type === "ready") {
        setInks(({ [d.frame]: _, ...rest }) => rest)
        f.ready = true
        tell(f)
      } else if (d.type === "status") {
        const ink = (k: string) => (d[k] === "light" || d[k] === "dark" ? d[k] : undefined)
        setInks((x) => ({
          ...x,
          [d.frame]: { top: ink("top"), bottom: ink("bottom") },
        }))
      } else if (d.type === "parts" && Array.isArray(d.items))
        setParts((x) => ({
          ...x,
          [d.frame]: { w: d.w, h: d.h, ground: d.ground, items: d.items },
        }))
      else if (d.type === "size" && Number(d.w) > 0 && Number(d.h) > 0) sized.current?.(d.frame, Number(d.w), Number(d.h))
      else if (d.type === "clock?") {
        // a film just started listening: send it where the playhead is
        clocks.current.delete(d.frame)
        if (last.current) handle.current?.render(last.current.t, last.current.drag)
      }
    }
    addEventListener("message", onMessage)
    return () => removeEventListener("message", onMessage)
  }, [resolve.origin]) // eslint-disable-line react-hooks/exhaustive-deps

  const scenes = useMemo(() => comp.scenes.map(() => createRef<SceneHandle>()), [comp.scenes])
  // what a frame reports (its components) can change the picture: draw the last moment again when it arrives
  const last = useRef<{ t: number; drag?: Drag } | null>(null)
  const handle = useRef<ViewHandle | null>(null)
  useEffect(() => {
    if (last.current) handle.current?.render(last.current.t, last.current.drag)
  }, [parts])
  const looks = useMemo(() => direct(comp), [comp])
  const grounds = useRef<(HTMLDivElement | null)[]>([])
  const paints = useRef<(PaintHandle | null)[]>([])
  const effects = useRef<EffectsHandle>(null)
  // the colour flash: one false-colour layer over the frame, up only around a "flash" cut
  const flashId = `cvflash${useId().replace(/[^a-z0-9]/gi, "")}`
  const flash = useRef<HTMLDivElement>(null)
  // the carriers: a whip's blur along the swing; an iris's ring and a wipe's line, drawn over the frame
  const whipId = `${flashId}w`
  const whip = useRef<SVGFEGaussianBlurElement>(null)
  const carrier = useRef<HTMLDivElement>(null)
  // for each scene, how it's carried in: the way the scene before was moving as it ended, where its subject was
  const carries = useMemo(
    () =>
      comp.scenes.map((_, i): Carry => {
        const before = comp.scenes[i - 1]
        if (!before) return CARRY
        const v = velocity(sceneMotion(before), "out")
        const lead = devicesOf(before).find((l) => l.slot === "center") ?? devicesOf(before)[0]
        return { ...CARRY, dir: v.x < -0.01 ? -1 : 1, cx: lead ? (lead.slot === "left" ? 0.3 : lead.slot === "right" ? 0.7 : 0.5) : 0.5 }
      }),
    [comp.scenes],
  )

  useImperativeHandle(
    ref,
    () =>
      (handle.current = {
        render(t, drag, pointer) {
          last.current = { t, drag }
          const { i, local, prev } = at(comp, t)
          const tr = comp.scenes[i].transition
          const carry: Carry = prev ? { ...carries[i], w: size.w, h: size.h } : CARRY
          // an iris or a wipe brings the next scene in whole, its ground with it, over the scene before
          const shaped = !!prev && (tr === "iris" || tr === "wipe")
          const swap = !!prev && (tr === "whip" || tr === "through")
          if (whip.current) whip.current.setAttribute("stdDeviation", prev && tr === "whip" ? `${(size.w * 0.05 * (1 - Math.abs(2 * prev.k - 1)) ** 2).toFixed(1)} 0` : "0 0")
          if (i !== nearRef.current) {
            nearRef.current = i
            setNear(i)
          }
          comp.scenes.forEach((s, j) => {
            const h = scenes[j].current
            const el = h?.el
            if (!h || !el) return
            const on = j === i || (prev && j === prev.i)
            // the scene after this one is drawn too, all but invisibly, under it: a hidden frame isn't drawn, so it would
            // come on a few frames late (drawing every scene of a film this way took a heavy one's GPU time five times over)
            const next = !on && !preserve && j === (i + 1) % comp.scenes.length
            el.style.visibility = on || next ? "visible" : "hidden"
            el.style.pointerEvents = next ? "none" : ""
            if (next) Object.assign(el.style, { opacity: "0.001", transform: "", filter: "", clipPath: "", zIndex: "0" })
            if (!on) return
            const css = prev ? handover(tr, prev.k, j === i, carry) : {}
            el.style.opacity = String(css.opacity ?? 1)
            el.style.transform = String(css.transform ?? "")
            el.style.filter = prev && tr === "whip" ? `url(#${whipId})` : String(css.filter ?? "")
            el.style.clipPath = String(css.clipPath ?? "")
            el.style.zIndex = j === i ? (shaped ? "3" : "2") : "1"
            h.render(j === i ? local : prev!.local, j === i ? drag : undefined)
          })
          // a film plays on the playhead: each scene of one cut into scenes shows its slice (from `from`), one gone
          // waits on its last frame, one not on yet a frame into its first (frames answer a frame late, so that's what
          // the cut shows first; the slice's very first instant can be a blank between two beats)
          comp.scenes.forEach((s, j) => {
            const lt = j === i ? local : j === prev?.i ? prev.local : j < i ? s.duration : 1 / 60
            for (const l of s.layers) if (l.kind === "component" && !l.hidden) clockTo(`${s.id}:${l.id}`, (l.from ?? 0) + lt * (l.rate ?? 1))
          })
          // the grounds blend into each other a little longer than the scenes hand over (a cut is a cut)
          const cur = comp.scenes[i]
          const same = i > 0 && JSON.stringify(looks[i - 1]) === JSON.stringify(looks[i])
          // a whip or a push through swaps the grounds round the middle, under the blur; an iris or a wipe brings the new
          // one in whole, inside its shape
          const kb = i === 0 || cur.transition === "cut" || same || shaped ? 1 : swap ? (prev ? inOut((prev.k - 0.3) / 0.4) : 1) : inOut(local / 0.9)
          if (carrier.current) {
            const [ring, line] = carrier.current.children as unknown as HTMLElement[]
            const e = prev ? inOut(prev.k) : 0
            ring.style.opacity = prev && tr === "iris" ? String(0.9 * (1 - e ** 3) * clamp(e * 6)) : "0"
            line.style.opacity = prev && tr === "wipe" ? String(Math.sin(Math.PI * clamp(e))) : "0"
            if (prev && tr === "iris") {
              const r = e * Math.hypot(Math.max(carry.cx, 1 - carry.cx) * size.w, Math.max(carry.cy, 1 - carry.cy) * size.h)
              Object.assign(ring.style, { left: `${carry.cx * size.w - r}px`, top: `${carry.cy * size.h - r}px`, width: `${2 * r}px`, height: `${2 * r}px` })
            }
            if (prev && tr === "wipe") {
              const p = wipeAt(e)
              const x = carry.dir > 0 ? p : 1 - p
              line.style.transform = `translateX(${(x * size.w).toFixed(1)}px) rotate(${((carry.dir * Math.atan2(2 * SLANT * size.w, size.h) * 180) / Math.PI).toFixed(2)}deg)`
            }
          }
          if (flash.current) flash.current.style.opacity = prev && comp.scenes[i].transition === "flash" ? String(clamp(1 - Math.abs(2 * prev.k - 1) * 1.15)) : "0"
          // the effects over the frame: this scene's, blending from the last one's across the handover
          const fxOf = (j: number, at: number) => fxNow(fxFor(comp.fx, comp.scenes[j].fx), at, comp.scenes[j].duration)
          const fx = prev ? mixFx(fxOf(prev.i, prev.local), fxOf(i, local), inOut(prev.k)) : fxOf(i, local)
          effects.current?.set(fx, t, size.w)
          let busy = false
          grounds.current.forEach((g, j) => {
            if (!g) return
            // the ground before stays under a fading-in one, and outside an iris or a wipe until it's done
            const shown = j === i || (j === i - 1 && (kb < 1 || shaped))
            g.style.visibility = shown ? "visible" : "hidden"
            g.style.opacity = j === i ? String(kb) : "1"
            g.style.zIndex = j === i ? (shaped ? "2" : "1") : "0"
            g.style.clipPath = j === i && shaped && prev ? String(handover(tr, prev.k, true, carry).clipPath ?? "") : ""
            // gradients that drift run on the film's clock; ones that follow the pointer, on the pointer's spring
            if (shown && moves(looks[j].paint)) busy = paints.current[j]?.draw(t, pointer ?? null) || busy
          })
          return busy
        },
        frames: () => [...frames.current.values()].map((f) => f.el),
      }),
    [comp, scenes, looks, size.w, size.h, carries],
  )

  return (
    <div ref={root} className={`absolute inset-0 overflow-hidden [container-type:size] ${className}`}>
      {comp.scenes.map((s, j) => (
        <div
          key={`bg-${s.id}`}
          ref={(x) => {
            grounds.current[j] = x
          }}
          className="absolute inset-0"
          style={{ visibility: j === 0 ? "visible" : "hidden" }}
        >
          <Backdrop
            fill={looks[j].fill}
            effect={looks[j].effect}
            ink={looks[j].ink}
            amount={looks[j].amount}
            title={comp.brand?.name}
            paint={looks[j].paint}
            paintRef={(h) => {
              paints.current[j] = h
            }}
            size={size}
            dpr={preserve ? devicePixelRatio : Math.min(devicePixelRatio, 2)}
          />
        </div>
      ))}
      {comp.scenes.map((s, j) => (
        <SceneView
          key={s.id}
          ref={scenes[j] as RefObject<SceneHandle>}
          scene={s}
          comp={comp}
          size={size}
          resolve={resolve}
          reg={reg}
          inks={inks}
          parts={parts}
          fill={looks[j].fill}
          preserve={preserve}
          live={nearby(j)}
        />
      ))}
      <EffectsLayer ref={effects} />
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        {/* false colour, the way a thermal camera sees: shadows navy, mids blue and teal, highlights orange, whites stay white */}
        <filter id={whipId} x="-20%" y="0" width="140%" height="100%">
          <feGaussianBlur ref={whip} stdDeviation="0 0" />
        </filter>
        <filter id={flashId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.03 0.04 0.06 0.93 1 1 1" />
            <feFuncG type="table" tableValues="0.05 0.27 0.6 0.52 0.86 1 1" />
            <feFuncB type="table" tableValues="0.24 0.78 0.66 0.2 0.46 1 1" />
          </feComponentTransfer>
        </filter>
      </svg>
      <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: 0, zIndex: 58, backdropFilter: `url(#${flashId})` }} />
      {/* the carriers' marks, in difference so they read on any ground: the iris's ring, the wipe's line */}
      <div ref={carrier} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 57, mixBlendMode: "difference" }}>
        <div className="absolute rounded-full" style={{ opacity: 0, boxShadow: "inset 0 0 0 0.14cqw rgb(255 255 255 / 0.9), 0 0 1.2cqw 0.1cqw rgb(255 255 255 / 0.35)" }} />
        <div className="absolute left-0" style={{ opacity: 0, top: "-20%", height: "140%", width: "0.16cqw", background: "rgb(255 255 255 / 0.95)", boxShadow: "0 0 1.4cqw 0.3cqw rgb(255 255 255 / 0.4)", transformOrigin: "50% 50%" }} />
      </div>
      <HairlineDefs />
    </div>
  )
})

/** An editor's selection round a layer: a thin outline in its colour with square handles at the corners. */
function SelectionFrame({ color }: { color: string }) {
  const handle = (pos: CSSProperties, i: number) => (
    <span key={i} className="absolute" style={{ ...pos, width: "0.62cqw", height: "0.62cqw", background: "#fff", boxShadow: `0 0 0 0.09cqw ${color}`, transform: "translate(-50%, -50%)" }} />
  )
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ boxShadow: `0 0 0 0.1cqw ${color}` }}>
      {[
        { left: 0, top: 0 },
        { left: "100%", top: 0 },
        { left: 0, top: "100%" },
        { left: "100%", top: "100%" },
      ].map(handle)}
    </span>
  )
}
