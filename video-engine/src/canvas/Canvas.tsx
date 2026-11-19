// Canvas — the editor of an interactive design, a design tool's way: one frame on an endless canvas, tools along the
// bottom, layers and assets on the left, the picked layer's design and interactions on the right. Devices and
// components dragged in are live pages from the library, so a screen in a phone can be scrolled and tapped.
// The frame is drawn by the very runtime a site draws it with (public/canvas.js), so what's here is what ships; the
// editor draws its selection, guides and tools over it. Export hands over the JSON and one script.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowArcLeft,
  ArrowArcRight,
  ArrowSquareOut,
  BookOpen,
  Circle,
  Copy as CopyIcon,
  Cursor,
  DeviceMobile,
  DeviceTablet,
  Devices,
  DownloadSimple,
  Eye,
  EyeSlash,
  FrameCorners,
  Hand,
  Image as ImageIcon,
  Laptop,
  MagicWand,
  MagnifyingGlass,
  Monitor,
  Path,
  PencilSimple,
  Play,
  Scribble,
  Sparkle,
  Square,
  SquaresFour,
  Stack,
  TextT,
  SidebarSimple,
  CornersIn,
  CornersOut,
} from "@phosphor-icons/react"
import { field } from "../controls"
import { ANIMS, byId, htmlUrl, withDefaults, type Values } from "../registry"
import { Button, IconButton, MenuItem, Popover, Segmented, Tip, closePopover, useMedia, type Icon } from "../ui"
import { AnimPicker, kStyle, tone } from "../studio/Layers"
import { pack } from "../studio/web"
import { CanvasInspector, backgroundEffect } from "./CanvasInspector"
import { EffectGallery, useEffectPresets } from "./EffectViews"
import type { EffectPreset } from "./effects"
import { loadRuntime, paletteOf, pictureOf, type Mounted } from "./runtime"
import { TurnBall, TurnReadout, type Axis } from "./TurnBall"
import { applyLook } from "./looks"
import { CreateDialog } from "./CreateDialog"
import { BarBack, BrandRow, KindTile, PanelFoot } from "../shell"
import { blob, glass, glow, gradient, ring, type CreateCtx } from "./create"
import { accentsOf, type Look } from "../theme"
import {
  MOCKUP,
  autoPhone,
  bake,
  blankDoc,
  boxOf,
  componentNode,
  deviceNode,
  effectNode,
  frameSize,
  imageNode,
  mockupOf,
  pathNode,
  shapeNode,
  sizeOf,
  textNode,
  uid,
  validateDoc,
  withBox,
  type Box,
  type CNode,
  type CanvasDoc,
  type DeviceKind,
  type DeviceNode,
  type Live,
  type TextNode,
  type View,
} from "./doc"

type Pt = { x: number; y: number }
type Tool = "move" | "hand" | "rect" | "ellipse" | "text" | "pen" | "path"
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
type Gesture =
  | { kind: "pan"; cx: number; cy: number; x: number; y: number }
  | { kind: "move"; start: Pt; before: CanvasDoc; from: Map<string, Box>; at: { x: number; y: number }; id: string }
  | { kind: "resize"; start: Pt; before: CanvasDoc; id: string; box: Box; handle: Handle }
  | { kind: "rotate"; before: CanvasDoc; id: string; c: Pt; a0: number; rot0: number }
  | { kind: "orbit"; before: CanvasDoc; id: string; cx: number; cy: number; r0: { x: number; y: number; p?: number }; axis: Axis; bx: number; by: number; a0: number; rot0: number }
  | { kind: "draw"; start: Pt; cur: Pt; shape: "rect" | "ellipse" }
  | { kind: "pen"; points: Pt[] }
  | { kind: "path"; id: string; c: Pt; points: Pt[] }
  | { kind: "marquee"; start: Pt; cur: Pt }

/** A path's last point (where a layer on it ends up), from its drawn d. */
const pathEnd = (d: string) => {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  return n.length >= 2 ? { x: n[n.length - 2], y: n[n.length - 1] } : { x: 0, y: 0 }
}

const KEY = "anim-engine:canvas-doc"
const DPR: Record<DeviceKind, number> = { iphone: 3, ipad: 2, macbook: 2, duo: 3 }
const DEVICE_LIST: { id: DeviceKind; name: string; icon: Icon }[] = [
  { id: "iphone", name: "iPhone", icon: DeviceMobile },
  { id: "ipad", name: "iPad", icon: DeviceTablet },
  { id: "macbook", name: "MacBook", icon: Laptop },
  { id: "duo", name: "iPhone Duo", icon: BookOpen },
]
const KIND_ICON: Record<CNode["kind"], Icon> = { rect: Square, ellipse: Circle, text: TextT, image: ImageIcon, path: Scribble, device: DeviceMobile, component: SquaresFour, effect: Sparkle }
const KIND_TONE: Record<CNode["kind"], string> = { rect: "shape", ellipse: "shape", text: "text", image: "image", path: "callout", device: "device", component: "component", effect: "effect" }

/** What a component's page measured of itself: its painted size, and for a page-filling one where it paints. */
type Measured = { w: number; h: number; x?: number; y?: number; vw?: number; vh?: number }

/** A library animation as a live page: in a device it runs at the device's pixel ratio; on its own, bare. */
export function liveFor(id: string, overrides: Record<string, Values>, device?: DeviceKind): Live | null {
  const a = byId(id)
  if (!a) return null
  return { anim: a.id, path: a.html ? htmlUrl(a) : "/stage.html", query: { ...(a.html ? {} : { a: a.id }), ...(device ? { dpr: String(DPR[device]) } : { layer: "1" }) }, values: withDefaults(a, overrides[a.id]) }
}

export const nodeName = (n: CNode) =>
  n.name ||
  (n.kind === "text" ? n.text.split("\n")[0] || "Text" : n.kind === "device" ? `${DEVICE_LIST.find((d) => d.id === n.device)!.name} · ${byId(n.screen.anim)?.name ?? "screen"}` : n.kind === "component" ? (byId(n.live.anim)?.name ?? "Component") : n.kind === "rect" ? "Rectangle" : n.kind === "ellipse" ? "Ellipse" : n.kind === "image" ? "Picture" : n.kind === "effect" ? "Effect" : "Line")

/** A product's first canvas: a soft frame, its screen in a phone that turns to the pointer, and its name coming in.
    The screen is a library page, or a picture of the product's own (`picture`, captured from it). */
export function productCanvas(o: { anim: string; overrides: Record<string, Values>; name?: string; kicker?: string; tagline?: string; picture?: string }): CanvasDoc {
  const a = byId(o.anim) ?? ANIMS.find((x) => x.layout === "fill") ?? ANIMS[0]
  const name = o.name?.trim() || a.brand || a.name
  const d = blankDoc()
  d.name = name
  d.frame.paint = [
    { id: uid(), kind: "solid", stops: [{ at: 0, color: "#f4f4f6", alpha: 1 }], from: { x: 0.5, y: 0.5 }, to: { x: 1, y: 0.5 }, ratio: 1, opacity: 1, blend: "normal" },
    { id: uid(), kind: "radial", stops: [{ at: 0, color: "#dfe9ff", alpha: 1 }, { at: 1, color: "#dfe9ff", alpha: 0 }], from: { x: 0.72, y: 0.42 }, to: { x: 1.15, y: 0.42 }, ratio: 1, opacity: 1, blend: "normal" },
  ]
  const live = liveFor(a.id, o.overrides, "iphone")
  const phone = live && deviceNode("iphone", live, 1010, 455, 740, "light")
  if (phone) {
    phone.enter = { kind: "rise", delay: 0.2, dur: 0.9 }
    phone.follow = { kind: "tilt", amount: 0.6 }
    if (o.picture) phone.picture = o.picture
  }
  const kicker: TextNode = { ...textNode(132, 318, o.kicker?.trim() || "Introducing", 18), font: "mono", weight: 500, color: "#6b6b74", w: 320, h: 24, enter: { kind: "fade", delay: 0, dur: 0.6 } }
  // the name as big as fits beside the phone; the line under it wraps in its column
  const big: TextNode = { ...textNode(128, 352, name, 88), enter: { kind: "rise", delay: 0.06, dur: 0.8 } }
  const size = Math.max(40, Math.min(88, Math.floor((88 * 640) / fitText(big, 88).w)))
  const title: TextNode = { ...big, size, ...fitText(big, size) }
  const text = o.tagline?.trim() || "Made to move. Try it on the phone."
  const line: TextNode = { ...textNode(132, title.y + title.h + 14, text, 26), weight: 400, font: "text", color: "#52525b", enter: { kind: "rise", delay: 0.14, dur: 0.8 } }
  const lines = Math.max(1, Math.ceil(fitText(line, 26).w / 520))
  d.layers = [...(phone ? [phone] : []), kicker, title, { ...line, w: 520, h: Math.ceil(lines * 26 * 1.15) + 4 }]
  return d
}

export function loadDoc(): CanvasDoc | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? validateDoc(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** Drawn points to a smooth path: thinned (Ramer–Douglas–Peucker), then a quadratic through the midpoints. */
function smooth(points: Pt[], tolerance: number) {
  const keep = (a: number, b: number, out: Set<number>) => {
    let worst = -1
    let far = 0
    const [p, q] = [points[a], points[b]]
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((q.y - p.y) * points[i].x - (q.x - p.x) * points[i].y + q.x * p.y - q.y * p.x) / L
      if (d > far) {
        far = d
        worst = i
      }
    }
    if (far > tolerance && worst > 0) {
      out.add(worst)
      keep(a, worst, out)
      keep(worst, b, out)
    }
  }
  const out = new Set([0, points.length - 1])
  if (points.length > 2) keep(0, points.length - 1, out)
  return [...out].sort((a, b) => a - b).map((i) => points[i])
}
function pathOf(points: Pt[], ox: number, oy: number) {
  const p = points.map((q) => ({ x: +(q.x - ox).toFixed(1), y: +(q.y - oy).toFixed(1) }))
  if (p.length < 3) return `M${p[0].x} ${p[0].y}${p[1] ? ` L${p[1].x} ${p[1].y}` : ""}`
  let d = `M${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i].x} ${p[i].y} ${((p[i].x + p[i + 1].x) / 2).toFixed(1)} ${((p[i].y + p[i + 1].y) / 2).toFixed(1)}`
  return `${d} L${p.at(-1)!.x} ${p.at(-1)!.y}`
}

const ruler = document.createElement("canvas").getContext("2d")
/** A text's box at its size: as wide as its longest line, as tall as its lines (the runtime's line height, 1.15). */
function fitText(t: TextNode, size: number) {
  const lines = (t.text || " ").split("\n")
  let w = size
  if (ruler) {
    ruler.font = `${t.weight} ${size}px ${t.face ? `"${t.face}", ` : ""}${t.font === "mono" ? '"Geist Mono"' : "Geist"}, sans-serif`
    const track = t.font === "mono" ? 0.06 : t.font === "display" ? -0.025 : 0
    w = Math.max(...lines.map((l) => ruler.measureText(t.font === "mono" ? l.toUpperCase() : l).width + l.length * track * size))
  }
  return { w: Math.ceil(w + size * 0.15), h: Math.ceil(lines.length * size * 1.15) }
}

export function CanvasWorkspace({ dark, anim, overrides, switcher, compact, say, foot, create, onCreateShown }: { dark: boolean; anim: string; overrides: Record<string, Values>; switcher?: ReactNode; compact?: boolean; say: (m: string) => void; /** the app's foot under the left panel */ foot?: ReactNode; /** open Create at a kind ("" for all), asked from outside (Home) */ create?: string | null; onCreateShown?: () => void }) {
  /* ---- the document, with undo ---- */
  const [doc, setDocRaw] = useState<CanvasDoc>(() => loadDoc() ?? productCanvas({ anim, overrides }))
  const docRef = useRef(doc)
  docRef.current = doc
  const past = useRef<CanvasDoc[]>([])
  const future = useRef<CanvasDoc[]>([])
  const commit = useCallback((next: CanvasDoc, before = docRef.current) => {
    if (next === before) return
    past.current = [...past.current.slice(-99), before]
    future.current = []
    setDocRaw(next)
  }, [])
  const setDoc = useCallback((fn: (d: CanvasDoc) => CanvasDoc) => commit(fn(docRef.current)), [commit])
  const undo = () => {
    const p = past.current.pop()
    if (!p) return
    future.current.push(docRef.current)
    setDocRaw(p)
  }
  const redo = () => {
    const f = future.current.pop()
    if (!f) return
    past.current.push(docRef.current)
    setDocRaw(f)
  }
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(doc))
      } catch {
        say("The canvas is too big to keep in this browser: export its JSON to keep it")
      }
    }, 400)
    return () => clearTimeout(t)
  }, [doc, say])

  const [sel, setSel] = useState<string[]>([])
  const [tool, setTool] = useState<Tool>("move")
  // the left panel: shown on a roomy window unless hidden, folded on a narrow one unless shown
  const roomy = useMedia("(min-width: 1280px)")
  const [left, setLeft] = useState<boolean | null>(null)
  // focus: both side panels away, the frame as big as the window allows
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault()
        setFocus((f) => !f)
      }
    }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [])
  const leftShown = !focus && (left ?? roomy)
  const [view, setView] = useState<View>("desktop")
  const [play, setPlay] = useState(!!compact)
  const [onDevices, setOnDevices] = useState(false)
  const [side, setSide] = useState<"layers" | "assets">("layers")
  const [picker, setPicker] = useState<null | { what: "screen" | "component" | "add"; at?: Pt }>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const editBefore = useRef<CanvasDoc | null>(null)
  const fresh = useRef(false)
  const startEdit = (id: string, before: CanvasDoc, isNew: boolean) => {
    editBefore.current = before
    fresh.current = isNew
    setEditing(id)
  }
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const g = useRef<Gesture | null>(null)
  const space = useRef(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const dropAt = useRef<Pt | null>(null)
  const presets = useEffectPresets()
  // holding a layer still for a moment turns the press into drawing its path
  const hold = useRef(0)
  const [holdAt, setHoldAt] = useState<Pt | null>(null)

  const f = frameSize(doc, view)
  const picked = doc.layers.filter((n) => sel.includes(n.id))
  const single = picked.length === 1 ? picked[0] : null
  const scheme: "dark" | "light" = dark ? "dark" : "light"

  /* ---- the viewport ---- */
  const vpEl = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ zoom: 0.5, x: 60, y: 60 })
  const fit = useCallback(() => {
    const el = vpEl.current
    if (!el) return
    const W = el.clientWidth
    const H = el.clientHeight
    const z = Math.min((W - 96) / f.w, (H - 150) / f.h, 1)
    setVp({ zoom: z, x: (W - f.w * z) / 2, y: Math.max(44, (H - f.h * z) / 2 - 18) })
  }, [f.w, f.h])
  useEffect(() => {
    fit()
  }, [view, onDevices, compact]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = vpEl.current
    if (!el) return
    const ro = new ResizeObserver(() => compact && fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact, fit])
  const toDesign = (cx: number, cy: number): Pt => {
    const r = vpEl.current!.getBoundingClientRect()
    return { x: (cx - r.left - vp.x) / vp.zoom, y: (cy - r.top - vp.y) / vp.zoom }
  }
  const zoomAt = (k: number, cx?: number, cy?: number) =>
    setVp((v) => {
      const r = vpEl.current?.getBoundingClientRect()
      const px = cx === undefined || !r ? (r?.width ?? 0) / 2 : cx - r.left
      const py = cy === undefined || !r ? (r?.height ?? 0) / 2 : cy - r.top
      const zoom = Math.min(4, Math.max(0.05, v.zoom * k))
      return { zoom, x: px - ((px - v.x) * zoom) / v.zoom, y: py - ((py - v.y) * zoom) / v.zoom }
    })

  /* ---- the frame, drawn by the runtime ---- */
  const host = useRef<HTMLDivElement>(null)
  // the runtime couldn't load (the engine's server is down): said where the frame would be, with a way to try again
  const [runtimeFailed, setRuntimeFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const mounted = useRef<Mounted | null>(null)
  const shown = useMemo(() => bake(editing ? { ...doc, layers: doc.layers.map((n) => (n.id === editing ? { ...n, opacity: 0 } : n)) } : doc), [doc, editing])
  const shownRef = useRef(shown)
  shownRef.current = shown
  useEffect(() => {
    if (onDevices) return
    let alive = true
    setRuntimeFailed(false)
    loadRuntime().then(
      (rt) => {
        if (!alive || !host.current) return
        mounted.current = rt.mount(host.current, shownRef.current, { origin: location.origin, mode: play ? "live" : "edit", view: compact ? undefined : view, onSize: (id: string, m: Measured) => sized.current(id, m) })
      },
      () => alive && setRuntimeFailed(true),
    )
    return () => {
      alive = false
      mounted.current?.destroy()
      mounted.current = null
    }
  }, [play, view, onDevices, compact, retry])
  useEffect(() => {
    mounted.current?.update(shown, { mode: play ? "live" : "edit", view: compact ? undefined : view })
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- components fit what they paint ---- */
  // a component just added takes the size its page measures (the page adds 64 px of room round what it paints; 12 a
  // side stays, for its shadows), about its middle, once, without a step of history of its own
  // id -> whether it also moves to free room once fitted (one added by hand does; a composition's keep their places)
  const fitting = useRef(new Map<string, { settle: boolean; slot?: { w: number; h: number; cx: number; cy: number } }>())
  const sized = useRef((id: string, m: Measured) => {})
  sized.current = (id, m) => {
    if (!fitting.current.has(id)) return
    const d = docRef.current
    const n = d.layers.find((x) => x.id === id)
    if (!n || n.kind !== "component") return
    // a page-filling component (an app's search bar) keeps its own page and shows only the part that paints, 12 px
    // round it; a centred one is sized to what it paints
    const part = m.x !== undefined
    const f = fitting.current.get(id)!
    let W = Math.min(d.frame.w * 0.9, Math.max(40, part ? m.w + 24 : m.w - 40))
    let H = Math.min(d.frame.h * 0.9, Math.max(24, part ? m.h + 24 : m.h - 40))
    // a composition's component keeps to its slot (a card): scaled down to fit it if it's bigger
    const k = part && f.slot ? Math.min(1, f.slot.w / W, f.slot.h / H) : 1
    W = Math.round(W * k)
    H = Math.round(H * k)
    const view = part ? { w: m.vw || n.view?.w || 402, h: m.vh || n.view?.h || 874, x: Math.round(m.x! - 12), y: Math.round(m.y! - 12), ...(k < 1 ? { k: +k.toFixed(3) } : {}) } : n.view
    if (Math.abs(W - n.w) < 2 && Math.abs(H - n.h) < 2 && view?.x === n.view?.x && view?.y === n.view?.y && view?.k === n.view?.k) return
    const cx = f.slot?.cx ?? n.x + n.w / 2
    const cy = f.slot?.cy ?? n.y + n.h / 2
    // its new size, about its middle; then every component still fitting moves, oldest first, to the nearest place
    // where it covers nothing (one that grew can push into one placed before it)
    let next: CanvasDoc = { ...d, layers: d.layers.map((x) => (x.id === id ? { ...x, x: Math.round(cx - W / 2), y: Math.round(cy - H / 2), w: W, h: H, ...(view ? { view } : {}) } : x)) }
    for (const [fid, { settle }] of fitting.current) {
      if (!settle) continue
      const m = next.layers.find((x) => x.id === fid)
      if (!m) continue
      const c = roomFor(m.w, m.h, { x: m.x + m.w / 2, y: m.y + m.h / 2 }, fid, next)
      next = { ...next, layers: next.layers.map((x) => (x.id === fid ? { ...x, x: Math.round(c.x - m.w / 2), y: Math.round(c.y - m.h / 2) } : x)) }
    }
    setDocRaw(next)
  }
  /** Where a layer of `w` × `h` goes so it covers nothing: the free place nearest `near` (the middle, for one added by
      a click), 24 px in from the frame's edges; else a step down and right of the middle. Backgrounds don't count,
      nor the layer itself (`skip`). */
  const roomFor = (w: number, h: number, near?: Pt, skip?: string, d = docRef.current): Pt => {
    const fw = d.frame.w
    const fh = d.frame.h
    const at = near ?? { x: fw / 2, y: fh / 2 }
    const solid = d.layers.filter((n) => n.id !== skip && !n.hidden && !(n.kind === "effect" && n.w >= fw - 1) && !(n.kind === "rect" && n.w >= fw - 1 && n.h >= fh - 1))
    const overlap = (cx: number, cy: number) => {
      const a = { x: cx - w / 2, y: cy - h / 2 }
      return solid.reduce((m, n) => Math.max(m, (Math.max(0, Math.min(a.x + w, n.x + n.w) - Math.max(a.x, n.x)) * Math.max(0, Math.min(a.y + h, n.y + n.h) - Math.max(a.y, n.y))) / (w * h)), 0)
    }
    const spots: Pt[] = []
    for (let y = 24 + h / 2; y <= fh - 24 - h / 2; y += 16) for (let x = 24 + w / 2; x <= fw - 24 - w / 2; x += 16) spots.push({ x, y })
    spots.sort((p, q) => Math.hypot(p.x - at.x, p.y - at.y) - Math.hypot(q.x - at.x, q.y - at.y))
    const free = spots.find((p) => overlap(p.x, p.y) < 0.02)
    if (free) return free
    const step = 32 * (solid.length % 8)
    return { x: at.x + step, y: at.y + step }
  }

  /* ---- the look: matched to what the screens show ---- */
  const [anchors, setAnchors] = useState<string[]>([])
  const [look, setLook] = useState<{ anchor: string; harmony: string; seed: number; case: string } | null>(null)
  const lastLook = useRef<Look | null>(null)
  const [inCase, setInCaseState] = useState(false)
  const screensKey = doc.layers.map((n) => (n.kind === "device" ? (n.picture ? `p${n.picture.length}` : JSON.stringify(n.screen)) : "")).join("|")
  useEffect(() => {
    let gone = false
    // once the screens have loaded: each one's colours, its accents first
    const t = window.setTimeout(async () => {
      const found: string[] = []
      for (const n of docRef.current.layers) {
        if (n.kind !== "device" && n.kind !== "component") continue
        const colors = n.kind === "device" && n.picture ? await paletteOf(n.picture).catch(() => [] as string[]) : await (mounted.current?.describe(n.id) ?? Promise.resolve([] as string[]))
        found.push(...accentsOf(colors, 2))
      }
      if (!gone) setAnchors(found)
    }, 2600)
    return () => {
      gone = true
      clearTimeout(t)
    }
  }, [screensKey, play, view])
  /* ---- Create: whole compositions from the product's own screens and components ---- */
  const [creating, setCreating] = useState(false)
  const [createKind, setCreateKind] = useState<string | undefined>()
  useEffect(() => {
    if (create == null) return
    setCreateKind(create || undefined)
    setCreating(true)
    onCreateShown?.()
  }, [create]) // eslint-disable-line react-hooks/exhaustive-deps
  const createCtx = useMemo((): Omit<CreateCtx, "look" | "inCase" | "seed"> => {
    const main = doc.layers.find((n): n is DeviceNode => n.kind === "device")
    const a = byId(main?.screen.anim ?? anim) ?? byId(anim)
    const device: DeviceKind = main?.device ?? "iphone"
    const screen = main ? { live: main.screen, picture: main.picture, device, scheme: main.scheme } : { live: liveFor(a?.layout === "fill" ? a.id : (ANIMS.find((x) => x.layout === "fill")?.id ?? anim), overrides, "iphone")!, device, scheme }
    // the same product's other pieces: its screens can stand in phones, its components in cards
    const kin = ANIMS.filter((x) => x.load && x.category !== "Launch films" && x.id !== screen.live.anim && (a?.brand ? x.brand === a.brand : x.category === a?.category))
    const more = kin.slice(0, 6).map((x) => ({ live: liveFor(x.id, overrides)!, fill: x.layout === "fill" && !x.html, ...(x.layout === "fill" && /screen|feed|home|page|store/i.test(x.name) ? { device: liveFor(x.id, overrides, device)! } : {}) }))
    const texts = doc.layers.filter((n): n is TextNode => n.kind === "text").sort((p, q) => q.size - p.size)
    const name = a?.brand || texts[0]?.text || a?.name || doc.name
    const line = texts.find((t) => t.text.length > 24 && t.text !== name)?.text
    // what the content reader works from: the product's own parts, by name (its features, as the library knows them)
    const parts = kin.slice(0, 6)
    return { frame: { w: doc.frame.w, h: doc.frame.h }, name, kicker: "Introducing", tagline: line ?? "Made to move. Try it on the phone.", cta: "Get the app", screen, more, features: parts.slice(0, 3).map((x) => x.name), names: parts.filter((x) => !(x.layout === "fill" && /screen|feed|home|page|store/i.test(x.name))).map((x) => x.name) }
  }, [doc, anim, overrides, scheme])
  const onCreate = (made: CanvasDoc) => {
    commit({ ...made, name: doc.name })
    // its components cut themselves to what they paint, where the composition put them
    for (const n of made.layers) if (n.kind === "component") fitting.current.set(n.id, { settle: false, slot: { w: n.w, h: n.h, cx: n.x + n.w / 2, cy: n.y + n.h / 2 } })
    window.setTimeout(() => made.layers.forEach((n) => fitting.current.delete(n.id)), 9000)
    setSel([])
    setCreating(false)
    say("Made. Undo puts back what you had")
  }

  const onLook = (k: Look, seed: number) => {
    lastLook.current = k
    setLook({ anchor: k.anchor, harmony: k.harmony, seed, case: k.case })
    commit(applyLook(docRef.current, k, { inCase }))
  }
  const setInCase = (v: boolean) => {
    setInCaseState(v)
    if (lastLook.current) commit(applyLook(docRef.current, lastLook.current, { inCase: v }))
  }

  /* ---- changing things ---- */
  const nodes = (fn: (l: CNode[]) => CNode[]) => setDoc((d) => ({ ...d, layers: fn(d.layers) }))
  const setNode = (patch: Partial<CNode>, box?: boolean) => {
    if (!single) return
    nodes((ls) =>
      ls.map((n) => {
        if (n.id !== single.id) return n
        if (box) return withBox(n, patch as Partial<Box>, view)
        let next = { ...n, ...patch } as CNode
        // a device turned into another keeps its height and its middle, and takes the new one's shape
        if (next.kind === "device" && n.kind === "device" && ("device" in patch || "open" in patch)) {
          const m = mockupOf(next)
          const w = (n.h * m.w) / m.h
          next = { ...next, x: n.x + n.w / 2 - w / 2, w, ...(n.phone?.h ? { phone: { ...n.phone, w: (n.phone.h * m.w) / m.h } } : {}) }
        }
        return next
      }),
    )
  }
  const add = (n: CNode) => {
    nodes((ls) => [...ls, n])
    setSel([n.id])
    setTool("move")
  }
  const addAt = (what: { kind: string; id?: string }, at: Pt, free = false) => {
    if (what.kind === "device") {
      const d = what.id as DeviceKind
      const live = liveFor(byId(anim)?.layout === "fill" ? anim : (ANIMS.find((a) => a.layout === "fill")?.id ?? anim), overrides, d)
      if (!live) return
      const h = d === "macbook" ? f.h * 0.5 : d === "ipad" ? f.h * 0.62 : f.h * 0.72
      add(deviceNode(d, live, at.x, at.y, h, scheme))
    } else if (what.kind === "component" && what.id) {
      const live = liveFor(what.id, overrides)
      if (!live) return
      const c = free ? roomFor(360, 260) : at
      const n = componentNode(live, { x: c.x - 180, y: c.y - 130, w: 360, h: 260 }, scheme)
      // a page-filling one lays itself out on a phone's page; it's cut down to what it paints once that's measured
      if (byId(what.id)?.layout === "fill" && !byId(what.id)?.html) n.view = { w: 402, h: 874, x: 0, y: 0 }
      fitting.current.set(n.id, { settle: true })
      window.setTimeout(() => fitting.current.delete(n.id), 9000)
      add(n)
    } else if (what.kind === "effect" && what.id) {
      const p = presets.find((x) => x.id === what.id)
      if (p) add(effectNode(p.effect, { x: at.x - 280, y: at.y - 180, w: 560, h: 360 }, p.name))
    }
  }
  /** An effect as the frame's background: the one there takes it, or a new one goes behind everything. */
  const addBackground = (p: EffectPreset) => {
    const bg = backgroundEffect(doc)
    if (bg) {
      nodes((ls) => ls.map((n) => (n.id === bg.id ? { ...n, effect: p.effect, name: p.name } : n)))
      setSel([bg.id])
      return
    }
    const n = effectNode(p.effect, { x: 0, y: 0, w: doc.frame.w, h: doc.frame.h }, p.name)
    nodes((ls) => [n, ...ls])
    setSel([n.id])
  }
  const remove = () => {
    if (!sel.length) return
    nodes((ls) => ls.filter((n) => !sel.includes(n.id)))
    setSel([])
  }
  const duplicate = () => {
    if (!picked.length) return
    const copies = picked.map((n) => ({ ...n, id: uid(), x: n.x + 24, y: n.y + 24 }) as CNode)
    nodes((ls) => [...ls, ...copies])
    setSel(copies.map((c) => c.id))
  }
  const arrange = (by: 1 | -1) =>
    single &&
    nodes((ls) => {
      const i = ls.findIndex((n) => n.id === single.id)
      const j = i + by
      if (j < 0 || j >= ls.length) return ls
      const out = [...ls]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  const nudge = (dx: number, dy: number) => nodes((ls) => ls.map((n) => (sel.includes(n.id) ? withBox(n, { x: boxOf(n, view).x + dx, y: boxOf(n, view).y + dy }, view) : n)))

  /* ---- the keyboard ---- */
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, select, [contenteditable=true]") || compact || onDevices) return
    const mod = e.metaKey || e.ctrlKey
    if (e.key === " ") {
      space.current = true
      return
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault()
      redo()
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault()
      duplicate()
    } else if (mod && (e.key === "]" || e.key === "[")) {
      e.preventDefault()
      arrange(e.key === "]" ? 1 : -1)
    } else if (mod && e.key === "0") {
      e.preventDefault()
      setVp((v) => ({ ...v, zoom: 1 }))
    } else if (e.shiftKey && e.key === "!") fit()
    else if (e.key === "Delete" || e.key === "Backspace") remove()
    else if (e.key === "Escape") {
      setSel([])
      setTool("move")
    } else if (e.key.startsWith("Arrow") && sel.length) {
      e.preventDefault()
      const s = e.shiftKey ? 10 : 1
      nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0, e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0)
    } else if (!mod && !e.altKey) {
      const k = e.key.toLowerCase()
      const to: Record<string, Tool> = { v: "move", h: "hand", r: "rect", o: "ellipse", t: "text", p: "pen", m: "path" }
      if (to[k]) setTool(to[k])
      else if (k === "=" || k === "+") zoomAt(1.25)
      else if (k === "-") zoomAt(0.8)
    }
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e)
    const up = (e: KeyboardEvent) => e.key === " " && (space.current = false)
    addEventListener("keydown", down)
    addEventListener("keyup", up)
    return () => {
      removeEventListener("keydown", down)
      removeEventListener("keyup", up)
    }
  }, [])

  /* ---- pointer: pick, move, size, turn, draw ---- */
  const hit = (p: Pt) =>
    [...doc.layers].reverse().find((n) => {
      const b = boxOf(n, view)
      return !b.hidden && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
    })
  const centre = (n: CNode): Pt => {
    const b = boxOf(n, view)
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return
    // a field being typed in lets go (and keeps what was typed); the canvas's keys are the canvas's again
    ;(document.activeElement as HTMLElement | null)?.blur()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toDesign(e.clientX, e.clientY)
    const handle = (e.target as HTMLElement).dataset.handle as Handle | "rot" | "orbit" | undefined
    let next: Gesture | null = null
    if (e.button === 1 || space.current || tool === "hand") next = { kind: "pan", cx: e.clientX, cy: e.clientY, x: vp.x, y: vp.y }
    else if (handle === "orbit" && single?.kind === "device") {
      // the ball's rings turn it about one axis; inside them, freely
      const t = e.target as SVGElement
      const ball = t.closest("[data-ball]")!.getBoundingClientRect()
      const bx = ball.left + ball.width / 2
      const by = ball.top + ball.height / 2
      next = { kind: "orbit", before: doc, id: single.id, cx: e.clientX, cy: e.clientY, r0: single.rot3d ?? { x: 0, y: 0 }, axis: (t.dataset.axis as Axis) || "free", bx, by, a0: Math.atan2(e.clientY - by, e.clientX - bx), rot0: boxOf(single, view).rot ?? 0 }
    }
    else if (handle === "rot" && single) {
      const b = boxOf(single, view)
      const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      next = { kind: "rotate", before: doc, id: single.id, c, a0: Math.atan2(p.y - c.y, p.x - c.x), rot0: b.rot ?? 0 }
    } else if (handle && handle !== "rot" && handle !== "orbit" && single) {
      fitting.current.delete(single.id)
      next = { kind: "resize", start: p, before: doc, id: single.id, box: boxOf(single, view), handle }
    }
    else if (tool === "path") {
      // the layer pressed on (or the one picked) gets a path, drawn from its middle
      const n = hit(p) ?? single
      if (n) {
        setSel([n.id])
        const c = centre(n)
        next = { kind: "path", id: n.id, c, points: [c, p] }
      }
    } else if (tool === "rect" || tool === "ellipse") next = { kind: "draw", start: p, cur: p, shape: tool }
    else if (tool === "pen") next = { kind: "pen", points: [p] }
    else if (tool === "text") {
      // a new text starts empty, with the caret in it; it's kept only if something is typed
      const t = textNode(p.x, p.y - 24, "", Math.round(f.w / 24))
      setDocRaw({ ...doc, layers: [...doc.layers, t] })
      setSel([t.id])
      setTool("move")
      startEdit(t.id, doc, true)
      return
    } else {
      const n = hit(p)
      if (n) {
        const ids = e.shiftKey ? (sel.includes(n.id) ? sel.filter((x) => x !== n.id) : [...sel, n.id]) : sel.includes(n.id) ? sel : [n.id]
        setSel(ids)
        next = { kind: "move", start: p, before: doc, from: new Map(doc.layers.filter((x) => ids.includes(x.id)).map((x) => [x.id, boxOf(x, view)])), at: { x: e.clientX, y: e.clientY }, id: n.id }
        // held still for a moment, the press becomes drawing the layer's path
        clearTimeout(hold.current)
        hold.current = window.setTimeout(() => {
          const cur = g.current
          if (cur?.kind !== "move" || cur.id !== n.id) return
          setDocRaw(cur.before)
          const c = centre(n)
          const drawing: Gesture = { kind: "path", id: n.id, c, points: [c] }
          g.current = drawing
          setGesture(drawing)
          setSel([n.id])
          const r = vpEl.current!.getBoundingClientRect()
          setHoldAt({ x: cur.at.x - r.left, y: cur.at.y - r.top })
          say("Now draw where it goes")
        }, 380)
      } else {
        if (!e.shiftKey) setSel([])
        next = { kind: "marquee", start: p, cur: p }
      }
    }
    g.current = next
    setGesture(next)
  }

  /** Where a moving box snaps: the frame's edges and middle, the other layers' edges and middles, within 6 px. */
  const snap = (b: Box, skip: Set<string>) => {
    const th = 6 / vp.zoom
    const xs = [0, f.w / 2, f.w]
    const ys = [0, f.h / 2, f.h]
    for (const n of doc.layers) {
      if (skip.has(n.id)) continue
      const o = boxOf(n, view)
      if (o.hidden) continue
      xs.push(o.x, o.x + o.w / 2, o.x + o.w)
      ys.push(o.y, o.y + o.h / 2, o.y + o.h)
    }
    const best = (mine: number[], lines: number[]) => {
      let out: { d: number; line: number } | null = null
      for (const m of mine)
        for (const l of lines) {
          const d = l - m
          if (Math.abs(d) < th && (!out || Math.abs(d) < Math.abs(out.d))) out = { d, line: l }
        }
      return out
    }
    const bx = best([b.x, b.x + b.w / 2, b.x + b.w], xs)
    const by = best([b.y, b.y + b.h / 2, b.y + b.h], ys)
    return { dx: bx?.d ?? 0, dy: by?.d ?? 0, gx: bx ? [bx.line] : [], gy: by ? [by.line] : [] }
  }

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const cur = g.current
    if (!cur) {
      if (tool === "move" && !space.current) setHoverId(hit(toDesign(e.clientX, e.clientY))?.id ?? null)
      return
    }
    const p = toDesign(e.clientX, e.clientY)
    if (cur.kind === "pan") return setVp((v) => ({ ...v, x: cur.x + e.clientX - cur.cx, y: cur.y + e.clientY - cur.cy }))
    if (cur.kind === "orbit") {
      // across turns it (Y), up and down tilts it (X), round the ball rolls it (Z); Shift steps by 15°
      const snap = (v: number) => (e.shiftKey ? Math.round(v / 15) * 15 : Math.round(v))
      const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180
      const ry = cur.axis === "free" || cur.axis === "y" ? wrap(snap(cur.r0.y + (e.clientX - cur.cx) * 0.6)) : cur.r0.y
      const rx = cur.axis === "free" || cur.axis === "x" ? wrap(snap(cur.r0.x - (e.clientY - cur.cy) * 0.6)) : cur.r0.x
      const rot = wrap(snap(cur.rot0 + ((Math.atan2(e.clientY - cur.by, e.clientX - cur.bx) - cur.a0) * 180) / Math.PI))
      setDocRaw({
        ...cur.before,
        layers: cur.before.layers.map((n) => {
          if (n.id !== cur.id) return n
          if (cur.axis === "z") return withBox(n, { rot }, view)
          const r3 = { ...cur.r0, x: rx, y: ry }
          return { ...n, rot3d: r3.x || r3.y || r3.p ? r3 : undefined } as CNode
        }),
      })
      return
    }
    if (cur.kind === "path") {
      const last = cur.points.at(-1)!
      if (Math.hypot(p.x - last.x, p.y - last.y) * vp.zoom < 2) return
      const next = { ...cur, points: [...cur.points, p] }
      g.current = next
      setGesture(next)
      return
    }
    if (cur.kind === "move") {
      if (Math.hypot(e.clientX - cur.at.x, e.clientY - cur.at.y) > 4) clearTimeout(hold.current)
      let dx = p.x - cur.start.x
      let dy = p.y - cur.start.y
      // snap the whole selection by its outer box
      const all = [...cur.from.values()]
      const ub = { x: Math.min(...all.map((b) => b.x)) + dx, y: Math.min(...all.map((b) => b.y)) + dy, w: 0, h: 0 }
      ub.w = Math.max(...all.map((b) => b.x + b.w)) + dx - ub.x
      ub.h = Math.max(...all.map((b) => b.y + b.h)) + dy - ub.y
      const s = e.altKey ? { dx: 0, dy: 0, gx: [], gy: [] } : snap(ub, new Set(cur.from.keys()))
      dx += s.dx
      dy += s.dy
      setGuides({ x: s.gx, y: s.gy })
      setDocRaw({ ...cur.before, layers: cur.before.layers.map((n) => (cur.from.has(n.id) ? withBox(n, { x: Math.round(cur.from.get(n.id)!.x + dx), y: Math.round(cur.from.get(n.id)!.y + dy) }, view) : n)) })
    } else if (cur.kind === "resize") {
      const n0 = cur.before.layers.find((n) => n.id === cur.id)!
      const b = cur.box
      let { x, y, w, h } = b
      const dx = p.x - cur.start.x
      const dy = p.y - cur.start.y
      if (cur.handle.includes("e")) w = b.w + dx
      if (cur.handle.includes("w")) {
        x = b.x + dx
        w = b.w - dx
      }
      if (cur.handle.includes("s")) h = b.h + dy
      if (cur.handle.includes("n")) {
        y = b.y + dy
        h = b.h - dy
      }
      // devices, pictures and Shift keep their shape
      if (e.shiftKey || n0.kind === "device" || n0.kind === "image") {
        const a = b.w / b.h
        if (cur.handle === "n" || cur.handle === "s") {
          w = h * a
          x = b.x + (b.w - w) / 2
        } else if (cur.handle === "e" || cur.handle === "w") {
          h = w / a
          y = b.y + (b.h - h) / 2
        } else {
          if (Math.abs(w / b.w) > Math.abs(h / b.h)) h = w / a
          else w = h * a
          if (cur.handle.includes("w")) x = b.x + b.w - w
          if (cur.handle.includes("n")) y = b.y + b.h - h
        }
      }
      w = Math.max(4, w)
      h = Math.max(4, h)
      setDocRaw({ ...cur.before, layers: cur.before.layers.map((n) => (n.id === cur.id ? withBox(n, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, view) : n)) })
    } else if (cur.kind === "rotate") {
      let rot = cur.rot0 + ((Math.atan2(p.y - cur.c.y, p.x - cur.c.x) - cur.a0) * 180) / Math.PI
      if (e.shiftKey) rot = Math.round(rot / 15) * 15
      rot = Math.round(((((rot + 180) % 360) + 360) % 360) - 180)
      setDocRaw({ ...cur.before, layers: cur.before.layers.map((n) => (n.id === cur.id ? withBox(n, { rot }, view) : n)) })
    } else if (cur.kind === "draw" || cur.kind === "marquee") {
      let q = p
      if (cur.kind === "draw" && e.shiftKey) {
        const s = Math.max(Math.abs(p.x - cur.start.x), Math.abs(p.y - cur.start.y))
        q = { x: cur.start.x + Math.sign(p.x - cur.start.x) * s, y: cur.start.y + Math.sign(p.y - cur.start.y) * s }
      }
      const next = { ...cur, cur: q }
      g.current = next
      setGesture(next)
    } else if (cur.kind === "pen") {
      const last = cur.points.at(-1)!
      if (Math.hypot(p.x - last.x, p.y - last.y) * vp.zoom < 2) return
      const next = { ...cur, points: [...cur.points, p] }
      g.current = next
      setGesture(next)
    }
  }

  const end = () => {
    const cur = g.current
    g.current = null
    clearTimeout(hold.current)
    setHoldAt(null)
    setGesture(null)
    setGuides({ x: [], y: [] })
    if (!cur) return
    if (cur.kind === "move" || cur.kind === "resize" || cur.kind === "rotate" || cur.kind === "orbit") {
      // the gesture drew as it went: one step of history for the whole of it
      if (docRef.current !== cur.before) commit(docRef.current, cur.before)
    } else if (cur.kind === "path") {
      if (Math.max(...cur.points.map((q) => Math.hypot(q.x - cur.c.x, q.y - cur.c.y))) < 12) return
      // paths are kept in the desktop frame's pixels, so one drawn on the phone layout is scaled up to them
      const k = view === "phone" ? doc.frame.w / doc.frame.phone.w : 1
      const pts = smooth(cur.points, 1.2 / vp.zoom).map((q) => ({ x: cur.c.x + (q.x - cur.c.x) * k, y: cur.c.y + (q.y - cur.c.y) * k }))
      const d = pathOf(pts, cur.c.x, cur.c.y)
      commit({ ...doc, layers: doc.layers.map((n) => (n.id === cur.id ? ({ ...n, motion: { preset: "spring", trigger: "enter", strength: 0.5, speed: 1, delay: 0, ...n.motion, d } } as CNode) : n)) })
      setTool("move")
      // and see it go, once the frame has it
      window.setTimeout(() => mounted.current?.preview(cur.id), 80)
    } else if (cur.kind === "draw") {
      let x = Math.min(cur.start.x, cur.cur.x)
      let y = Math.min(cur.start.y, cur.cur.y)
      let w = Math.abs(cur.cur.x - cur.start.x)
      let h = Math.abs(cur.cur.y - cur.start.y)
      if (w * vp.zoom < 4 && h * vp.zoom < 4) {
        // a click, not a drag: a shape of a good size, centred there
        w = h = Math.round(f.w / 7)
        x = cur.start.x - w / 2
        y = cur.start.y - h / 2
      }
      add(shapeNode(cur.shape, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, cur.shape === "ellipse" ? "#a5b4fc" : "#d4d4d8"))
    } else if (cur.kind === "pen") {
      if (cur.points.length < 2) return
      const pts = smooth(cur.points, 1.2 / vp.zoom)
      const pad = 4
      const x0 = Math.min(...pts.map((q) => q.x)) - pad
      const y0 = Math.min(...pts.map((q) => q.y)) - pad
      const w = Math.max(...pts.map((q) => q.x)) + pad - x0
      const h = Math.max(...pts.map((q) => q.y)) + pad - y0
      add(pathNode(pathOf(pts, x0, y0), { x: Math.round(x0), y: Math.round(y0), w: Math.max(8, Math.round(w)), h: Math.max(8, Math.round(h)) }, doc.frame.ink && doc.frame.ink !== "#18181b" ? "#fafafa" : "#18181b", 4))
      setTool("pen")
    } else if (cur.kind === "marquee") {
      const x0 = Math.min(cur.start.x, cur.cur.x)
      const x1 = Math.max(cur.start.x, cur.cur.x)
      const y0 = Math.min(cur.start.y, cur.cur.y)
      const y1 = Math.max(cur.start.y, cur.cur.y)
      if ((x1 - x0) * vp.zoom < 3 && (y1 - y0) * vp.zoom < 3) return
      setSel(
        doc.layers
          .filter((n) => {
            const b = boxOf(n, view)
            return !b.hidden && b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0
          })
          .map((n) => n.id),
      )
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (play && !e.ctrlKey && !e.metaKey) return
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
    else setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
  }
  // the browser's own pinch-zoom of the page stays out of the canvas
  useEffect(() => {
    const el = vpEl.current
    if (!el) return
    const stop = (e: WheelEvent) => (e.ctrlKey || e.metaKey) && e.preventDefault()
    el.addEventListener("wheel", stop, { passive: false })
    return () => el.removeEventListener("wheel", stop)
  }, [onDevices])

  /* ---- screen coordinates for the overlay ---- */
  const sx = (x: number) => vp.x + x * vp.zoom
  const sy = (y: number) => vp.y + y * vp.zoom
  const boxStyle = (b: Box) => ({ left: sx(b.x), top: sy(b.y), width: b.w * vp.zoom, height: b.h * vp.zoom, rotate: b.rot ? `${b.rot}deg` : undefined })
  const editNode = editing ? (doc.layers.find((n) => n.id === editing) as TextNode | undefined) : undefined

  const layerRows = [...doc.layers].reverse()
  const [q, setQ] = useState("")
  const components = ANIMS.filter((a) => a.load && a.category !== "Launch films" && (!q || `${a.name} ${a.category}`.toLowerCase().includes(q.toLowerCase())))

  if (compact)
    return (
      <div className="flex h-full flex-col bg-canvas">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-surface px-3">
          <span className="truncate text-ui font-semibold">Canvas</span>
          {switcher}
        </div>
        <div ref={vpEl} className="relative min-h-0 flex-1 overflow-auto p-3">
          <div ref={host} className="w-full overflow-hidden rounded-xl shadow-md" />
        </div>
        <p className="shrink-0 border-t bg-surface px-4 py-3 text-caption text-fg-3">It plays here: scroll and tap the screens. Edit it on a computer, or a tablet held sideways.</p>
      </div>
    )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-app">
      {/* the editor's bar, full width on the ground */}
        <header className="editor-bar @container @max-[44rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="flex h-10 min-w-0 items-center gap-2 justify-self-start">
            <span className="flex items-center">
              <BarBack />
            </span>
            <IconButton label={leftShown ? "Hide the panel" : "Show the panel"} expanded={leftShown} onClick={() => (setFocus(false), setLeft(!leftShown))}>
              <SidebarSimple size={17} />
            </IconButton>
            <span className="truncate text-body font-medium">{doc.name}</span>
            <Segmented<View>
              size="sm"
              label="Layout"
              value={view}
              onChange={(v) => {
                setView(v)
                // the first time on the phone view, a layout to start from
                if (v === "phone" && !doc.layers.some((n) => n.phone) && doc.layers.length) commit(autoPhone(doc))
              }}
              options={[
                { value: "desktop", label: "Desktop", icon: Monitor },
                { value: "phone", label: "Phone", icon: DeviceMobile },
              ]}
              hideLabels="always"
            />
            <span className="hidden items-center @min-[44rem]:flex">
              <IconButton size="sm" label="Undo" kbd="Ctrl Z" disabled={!past.current.length} onClick={undo}>
                <ArrowArcLeft size={15} />
              </IconButton>
              <IconButton size="sm" label="Redo" kbd="Ctrl Shift Z" disabled={!future.current.length} onClick={redo}>
                <ArrowArcRight size={15} />
              </IconButton>
            </span>
          </div>
          {switcher ?? <span />}
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <span className="flex h-10 items-center gap-1">
            <Segmented<"edit" | "play">
              size="sm"
              label="Mode"
              value={onDevices ? "play" : play ? "play" : "edit"}
              onChange={(m) => {
                setOnDevices(false)
                setPlay(m === "play")
                setSel([])
              }}
              options={[
                { value: "edit", label: "Edit", icon: PencilSimple },
                { value: "play", label: "Play", icon: Play },
              ]}
              hideLabels="always"
            />
            <IconButton label={onDevices ? "Back to the canvas" : "On every device"} active={onDevices} onClick={() => setOnDevices(!onDevices)}>
              <Devices size={17} />
            </IconButton>
            <IconButton label={focus ? "Show the panels" : "Focus: hide the panels"} kbd="Ctrl ." active={focus} onClick={() => setFocus(!focus)} tipAlign="end">
              {focus ? <CornersIn size={17} /> : <CornersOut size={17} />}
            </IconButton>
            </span>
            <Button onClick={() => setCreating(true)} label="Create">
              <MagicWand size={15} aria-hidden />
              <span className="hidden @min-[30rem]:inline">Create</span>
            </Button>
            <Button variant="primary" popover="cv-export" label="Export">
              <DownloadSimple size={15} aria-hidden />
              <span className="hidden @min-[38rem]:inline">Export</span>
            </Button>
            <Popover id="cv-export" align="end" label="Export the canvas">
              <ExportPanel
                doc={doc}
                onOpen={(d) => {
                  commit(d)
                  setSel([])
                  closePopover(document.getElementById("cv-export"))
                }}
              />
            </Popover>
          </div>
        </header>
      <div className="flex min-h-0 flex-1">
      {/* ---- left: the layers, and the assets to drag in, as drawers on a rail (folded away on a narrow window) ---- */}
      {leftShown && (
      <aside className="flex w-[300px] shrink-0 overflow-hidden">
        <nav aria-label="Panels" role="tablist" aria-orientation="vertical" className="rail">
          {(
            [
              { value: "layers", label: "Layers", icon: Stack },
              { value: "assets", label: "Assets: devices, components, graphics", icon: SquaresFour },
            ] as const
          ).map((d) => (
            <Tip key={d.value} label={d.label} side="right">
              <button type="button" role="tab" aria-selected={side === d.value} aria-label={d.label} onClick={() => setSide(d.value)} className="rail-item">
                <d.icon aria-hidden />
              </button>
            </Tip>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col bg-panel">
        <BrandRow />
        <div className="flex h-14 shrink-0 items-center px-4">
          <h2 className="panel-title">{side === "layers" ? "Layers" : "Assets"}</h2>
        </div>
        {side === "layers" ? (
          <>
            <ul role="listbox" aria-label="Layers" aria-multiselectable className="scroll-thin min-h-0 flex-1 space-y-px overflow-y-auto p-2">
              {!layerRows.length && <li className="px-2 py-3 text-caption text-fg-3">Empty. Draw with the tools below, drag a device or a component in from Assets, or make a whole composition with Create.</li>}
              {layerRows.map((n) => {
                const I = KIND_ICON[n.kind]
                const on = sel.includes(n.id)
                const hidden = boxOf(n, view).hidden
                return (
                  <li key={n.id} role="option" aria-selected={on} className={`group flex h-8 items-center gap-2 rounded-md pl-2 pr-1 ${on ? "bg-sel/15" : hoverId === n.id ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                    <button type="button" onClick={(e) => setSel(e.shiftKey ? (on ? sel.filter((x) => x !== n.id) : [...sel, n.id]) : [n.id])} onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <I size={15} aria-hidden className={hidden ? "shrink-0 text-fg-3" : "k-ink shrink-0"} style={kStyle(KIND_TONE[n.kind])} />
                      <span className={`truncate text-body ${hidden ? "text-fg-3 line-through" : on ? "font-medium text-fg" : "text-fg-2"}`}>{nodeName(n)}</span>
                    </button>
                    <span className={on || hidden ? "" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"}>
                      <IconButton
                        size="sm"
                        label={hidden ? `Show ${nodeName(n)}` : `Hide ${nodeName(n)}${view === "phone" ? " on phones" : ""}`}
                        onClick={() => nodes((ls) => ls.map((x) => (x.id !== n.id ? x : view === "phone" ? { ...x, phone: { ...x.phone, hidden: !boxOf(x, "phone").hidden } } : { ...x, hidden: !x.hidden })))}
                      >
                        {hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </IconButton>
                    </span>
                  </li>
                )
              })}
            </ul>
            <button type="button" onClick={() => setSel([])} aria-pressed={!sel.length} className={`press flex h-12 shrink-0 items-center gap-2.5 border-t px-4 text-left ${!sel.length ? "bg-sel/15" : "hover:bg-surface-2"}`}>
              <span aria-hidden className="h-5 w-5 shrink-0 rounded shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style={{ background: bake(doc).frame.fill }} />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium">Frame</span>
                <span className="block truncate text-micro text-fg-3">
                  {view === "phone" ? "Phone" : "Desktop"} · {f.w} × {Math.round(f.h)}
                </span>
              </span>
            </button>
          </>
        ) : (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
            <p className="pb-2 text-caption font-medium text-fg-3">Devices · drag one onto the frame</p>
            <div className="grid grid-cols-2 gap-2">
              {DEVICE_LIST.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-canvas", JSON.stringify({ kind: "device", id: d.id }))}
                  onClick={() => addAt({ kind: "device", id: d.id }, { x: f.w / 2, y: f.h / 2 })}
                  className="press flex h-16 cursor-grab flex-col items-center justify-center gap-1 rounded-lg text-caption text-fg-2 hover:bg-surface-2 active:cursor-grabbing"
                >
                  <d.icon size={20} aria-hidden className="text-k-device" />
                  {d.name}
                </button>
              ))}
            </div>
            <p className="pb-2 pt-4 text-caption font-medium text-fg-3">Graphics · made in the canvas's look</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["Light", () => glow(0, 0, 220, lastLook.current?.glow ?? "#8fb8ff")],
                  ["Blob", () => blob(0, 0, 180, lastLook.current?.haze ?? "#c7b8ff", Date.now() % 997)],
                  ["Ring", () => ring(0, 0, 200, lastLook.current?.muted ?? "#71717a", 2)],
                  ["Glass card", () => glass(0, 0, 380, 260, "#ffffff")],
                  ["Aurora", () => gradient("aurora", { x: 0, y: 0, w: 640, h: 400 }, lastLook.current ?? undefined)],
                  ["Mesh", () => gradient("mesh", { x: 0, y: 0, w: 640, h: 400 }, lastLook.current ?? undefined)],
                ] as const
              ).map(([label, make]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const n = make()
                    const c = roomFor(n.w, n.h)
                    add({ ...n, x: Math.round(c.x - n.w / 2), y: Math.round(c.y - n.h / 2) } as CNode)
                  }}
                  className="press h-9 rounded-md text-caption font-medium text-fg-2 hover:bg-surface-2 hover:text-fg"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="pt-1.5 text-micro text-fg-3">Coloured by the look you put on last. For whole layouts, Create.</p>
            <p className="pb-2 pt-4 text-caption font-medium text-fg-3">Effects · animated artwork</p>
            <EffectGallery drag onPick={addBackground} />
            <p className="pt-1.5 text-micro text-fg-3">A click sets the frame's background; drag one to place it.</p>
            <p className="pb-2 pt-4 text-caption font-medium text-fg-3">Components · live, from the library</p>
            <label className={`${field} mb-2 flex h-8 items-center gap-2 px-2.5`}>
              <MagnifyingGlass size={14} aria-hidden className="text-fg-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search components" className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-fg-3" />
            </label>
            <ul className="grid grid-cols-2 gap-2">
              {components.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-canvas", JSON.stringify({ kind: "component", id: a.id }))}
                    onClick={() => addAt({ kind: "component", id: a.id }, { x: f.w / 2, y: f.h / 2 }, true)}
                    title={a.name}
                    className="press block w-full cursor-grab text-left active:cursor-grabbing"
                  >
                    <span className="block aspect-[4/3] overflow-hidden rounded-md bg-canvas shadow-[0_0_0_1px_var(--line)]">
                      <img src={`/thumbs/${a.id}-${dark ? "dark" : "light"}.webp`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                    </span>
                    <span className="mt-1 block truncate text-caption text-fg-2">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <PanelFoot info={`${doc.layers.length} ${doc.layers.length === 1 ? "layer" : "layers"}`}>{foot}</PanelFoot>
        </div>
      </aside>
      )}

      {/* ---- middle: the canvas ---- */}
      <main aria-label="Canvas" className="@container relative flex min-w-0 flex-1 flex-col">

        <div
          ref={vpEl}
          className={`stage-ground relative min-h-0 flex-1 overflow-hidden ${tool === "hand" || gesture?.kind === "pan" ? "cursor-grab" : tool === "move" ? "" : "cursor-crosshair"}`}
          onWheel={onWheel}
          onDragOver={(e) => e.dataTransfer.types.includes("application/x-canvas") && e.preventDefault()}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData("application/x-canvas")
            if (!raw) return
            e.preventDefault()
            addAt(JSON.parse(raw), toDesign(e.clientX, e.clientY))
          }}
        >
          {onDevices ? (
            <OnDevices doc={doc} />
          ) : (
            <>
              <p className="pointer-events-none absolute text-caption text-fg-3" style={{ left: vp.x, top: vp.y - 22 }}>
                {doc.name} · {view === "phone" ? "Phone" : "Desktop"} · {f.w} × {Math.round(f.h)}
              </p>
              <div ref={host} className="absolute shadow-[0_0_0_1px_var(--line),var(--sh-md)]" style={{ left: vp.x, top: vp.y, width: f.w * vp.zoom }} />
              {runtimeFailed && (
                <div role="alert" className="absolute grid place-items-center bg-surface text-center shadow-[0_0_0_1px_var(--line)]" style={{ left: vp.x, top: vp.y, width: f.w * vp.zoom, height: f.h * vp.zoom }}>
                  <div className="max-w-[360px] px-6">
                    <p className="text-body font-medium">The canvas couldn't load what draws it</p>
                    <p className="mt-1 text-caption text-fg-3">Its runtime (canvas.js) comes from the engine's dev server, which didn't answer. Your canvas is safe: it's kept in this browser.</p>
                    <Button size="sm" className="mt-3" onClick={() => setRetry((r) => r + 1)}>
                      Try again
                    </Button>
                  </div>
                </div>
              )}
              {!play && (
                <div className={`absolute inset-0 touch-none ${tool === "path" || gesture?.kind === "path" ? "cursor-crosshair" : ""}`} onMouseDown={(e) => !(e.target as HTMLElement).closest("textarea") && e.preventDefault()} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerLeave={() => !g.current && setHoverId(null)} onDoubleClick={(e) => {
                  // a ring of the 3D ball, twice: straight on again about that axis (inside it, about both)
                  const t = e.target as HTMLElement
                  if (t.dataset.handle === "orbit" && single?.kind === "device") {
                    const r = single.rot3d ?? { x: 0, y: 0 }
                    const axis = t.dataset.axis as Axis
                    if (axis === "z") return commit({ ...doc, layers: doc.layers.map((n) => (n.id === single.id ? withBox(n, { rot: 0 }, view) : n)) })
                    const r3 = { ...r, x: axis === "y" ? r.x : 0, y: axis === "x" ? r.y : 0 }
                    return setNode({ rot3d: r3.x || r3.y || r3.p ? r3 : undefined } as Partial<CNode>)
                  }
                  const n = hit(toDesign(e.clientX, e.clientY))
                  if (n?.kind === "text") startEdit(n.id, doc, false)
                  else if (n?.kind === "device") setPicker({ what: "screen" })
                }}>
                  {hoverId && !sel.includes(hoverId) && !gesture && (() => {
                    const n = doc.layers.find((x) => x.id === hoverId)
                    return n ? <span aria-hidden className="pointer-events-none absolute shadow-[0_0_0_1px_var(--sel)]" style={boxStyle(boxOf(n, view))} /> : null
                  })()}
                  {picked.map((n) => (
                    <span key={n.id} aria-hidden className="pointer-events-none absolute shadow-[0_0_0_1.5px_var(--sel)]" style={boxStyle(boxOf(n, view))} />
                  ))}
                  {single && !editing && !gesture && (() => {
                    const b = boxOf(single, view)
                    const hs: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
                    const at = (h: Handle) => ({ x: h.includes("w") ? 0 : h.includes("e") ? 1 : 0.5, y: h.includes("n") ? 0 : h.includes("s") ? 1 : 0.5 })
                    const cursor: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" }
                    return (
                      <span className="absolute" style={boxStyle(b)}>
                        {hs.map((h) => (
                          <span key={h} data-handle={h} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white shadow-[0_0_0_1.5px_var(--sel)]" style={{ left: `${at(h).x * 100}%`, top: `${at(h).y * 100}%`, cursor: cursor[h] }} />
                        ))}
                        <span data-handle="rot" title="Rotate" className="absolute left-1/2 -top-6 h-2.5 w-2.5 -translate-x-1/2 cursor-grab rounded-full bg-white shadow-[0_0_0_1.5px_var(--sel)]" />
                      </span>
                    )
                  })()}
                  {/* a device's 3D ball, beside it (or on its left, near the edge), and its angles while it turns */}
                  {single?.kind === "device" && !editing && !boxOf(single, view).hidden && (!gesture || gesture.kind === "orbit") && (() => {
                    const st = boxStyle({ ...boxOf(single, view), rot: 0 })
                    const W = vpEl.current?.clientWidth ?? 1200
                    // beside it on the right; on its left when the right is out of room; inside the stage either way
                    const left = Math.max(8, Math.min(W - 92, st.left + st.width + 14 + 84 > W - 8 ? st.left - 98 : st.left + st.width + 14))
                    const top = Math.max(8, st.top - 4)
                    const r = single.rot3d ?? { x: 0, y: 0 }
                    const rz = boxOf(single, view).rot ?? 0
                    return (
                      <>
                        <TurnBall rx={r.x} ry={r.y} rz={rz} active={gesture?.kind === "orbit" ? gesture.axis : null} style={{ left, top }} />
                        {gesture?.kind === "orbit" && <TurnReadout rx={r.x} ry={r.y} rz={rz} style={{ left: left + 42, top: top + 92 }} />}
                      </>
                    )
                  })()}
                  {/* the picked layer's path: where it goes, and where it ends up */}
                  {single?.motion && gesture?.kind !== "path" && (() => {
                    const c = centre(single)
                    const k = (view === "phone" ? doc.frame.phone.w / doc.frame.w : 1) * vp.zoom
                    const e = pathEnd(single.motion.d)
                    const b = boxOf(single, view)
                    return (
                      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                        <g transform={`translate(${sx(c.x)} ${sy(c.y)}) scale(${k})`}>
                          <path d={single.motion.d} fill="none" stroke="var(--k-motion)" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                        </g>
                        <rect x={sx(c.x) + e.x * k - (b.w * vp.zoom) / 2} y={sy(c.y) + e.y * k - (b.h * vp.zoom) / 2} width={b.w * vp.zoom} height={b.h * vp.zoom} fill="none" stroke="var(--k-motion)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" />
                        <circle cx={sx(c.x) + e.x * k} cy={sy(c.y) + e.y * k} r={4} fill="var(--k-motion)" />
                      </svg>
                    )
                  })()}
                  {gesture?.kind === "path" && (
                    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                      <polyline points={gesture.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke="var(--k-motion)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={sx(gesture.c.x)} cy={sy(gesture.c.y)} r={5} fill="var(--k-motion)" />
                    </svg>
                  )}
                  {holdAt && <span aria-hidden className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-[var(--k-motion)] motion-reduce:animate-none" style={{ left: holdAt.x, top: holdAt.y }} />}
                  {guides.x.map((x) => (
                    <span key={`gx${x}`} aria-hidden className="pointer-events-none absolute w-px bg-[#ff3d7f]" style={{ left: sx(x), top: sy(0), height: f.h * vp.zoom }} />
                  ))}
                  {guides.y.map((y) => (
                    <span key={`gy${y}`} aria-hidden className="pointer-events-none absolute h-px bg-[#ff3d7f]" style={{ top: sy(y), left: sx(0), width: f.w * vp.zoom }} />
                  ))}
                  {(gesture?.kind === "draw" || gesture?.kind === "marquee") && (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute ${gesture.kind === "marquee" ? "bg-sel/10 shadow-[0_0_0_1px_var(--sel)]" : "shadow-[0_0_0_1.5px_var(--sel)]"} ${gesture.kind === "draw" && gesture.shape === "ellipse" ? "rounded-full" : ""}`}
                      style={boxStyle({ x: Math.min(gesture.start.x, gesture.cur.x), y: Math.min(gesture.start.y, gesture.cur.y), w: Math.abs(gesture.cur.x - gesture.start.x), h: Math.abs(gesture.cur.y - gesture.start.y) })}
                    />
                  )}
                  {gesture?.kind === "pen" && (
                    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                      <polyline points={gesture.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} fill="none" stroke="var(--sel)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {editNode && (
                    <textarea
                      autoFocus
                      aria-label="Text"
                      value={editNode.text}
                      onChange={(e) => {
                        const text = e.target.value
                        setDocRaw({
                          ...docRef.current,
                          layers: docRef.current.layers.map((n) => {
                            if (n.id !== editNode.id || n.kind !== "text") return n
                            const next = { ...n, text }
                            // a new text grows with what's typed (auto width); one already sized keeps its width
                            return fresh.current ? withBox(next, fitText(next, sizeOf(next, view)), view) : next
                          }),
                        })
                      }}
                      onBlur={() => {
                        const before = editBefore.current ?? docRef.current
                        const n = docRef.current.layers.find((x) => x.id === editNode.id) as TextNode | undefined
                        if (n && !n.text.trim()) {
                          // a new text left empty is as if it was never made; an old one emptied is removed
                          if (fresh.current) setDocRaw(before)
                          else commit({ ...docRef.current, layers: docRef.current.layers.filter((x) => x.id !== n.id) }, before)
                        } else commit(docRef.current, before)
                        editBefore.current = null
                        setEditing(null)
                      }}
                      onKeyDown={(e) => e.key === "Escape" && (e.currentTarget as HTMLTextAreaElement).blur()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none [field-sizing:content]"
                      style={{
                        ...boxStyle(boxOf(editNode, view)),
                        height: undefined,
                        minHeight: boxOf(editNode, view).h * vp.zoom,
                        fontSize: sizeOf(editNode, view) * vp.zoom,
                        lineHeight: 1.15,
                        fontWeight: editNode.weight,
                        textAlign: editNode.align,
                        color: editNode.color || bake(doc).frame.ink,
                        fontSynthesisWeight: editNode.face ? "none" : undefined,
                        fontFamily: (editNode.face ? `"${editNode.face}", ` : "") + (editNode.font === "mono" ? '"Geist Mono", monospace' : "Geist, sans-serif"),
                        letterSpacing: editNode.font === "display" ? "-0.025em" : editNode.font === "mono" ? "0.06em" : undefined,
                        textTransform: editNode.font === "mono" ? "uppercase" : undefined,
                        boxShadow: "0 0 0 1.5px var(--sel)",
                      }}
                    />
                  )}
                </div>
              )}

              {/* the tools, Raylight's way: along the bottom, each kind in its colour */}
              {!play && (
                <div role="toolbar" aria-label="Tools" className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
                  <div className="dock">
                    {(
                      [
                        ["move", "Move", Cursor, "V", ""],
                        ["hand", "Hand", Hand, "H", ""],
                      ] as const
                    ).map(([t, label, I, k]) => (
                      <IconButton key={t} label={label} kbd={k} tipSide="top" active={tool === t} onClick={() => setTool(t)}>
                        <I size={16} />
                      </IconButton>
                    ))}
                    <span aria-hidden className="dock-sep" />
                    {(
                      [
                        ["rect", "Rectangle", Square, "R", "shape"],
                        ["ellipse", "Ellipse", Circle, "O", "shape"],
                        ["text", "Text", TextT, "T", "text"],
                        ["pen", "Pencil", Scribble, "P", "callout"],
                        ["path", "Path: draw where a layer goes (or hold the layer)", Path, "M", "motion"],
                      ] as const
                    ).map(([t, label, I, k, kind]) => (
                      <IconButton key={t} label={label} kbd={k} tipSide="top" active={tool === t} onClick={() => setTool(t)}>
                        <I size={16} />
                      </IconButton>
                    ))}
                    <span aria-hidden className="dock-sep" />
                    <IconButton label="Picture" tipSide="top" onClick={() => imageInput.current?.click()}>
                      <ImageIcon size={16} />
                    </IconButton>
                    <IconButton
                      label="Component"
                      tipSide="top"
                      onClick={() => {
                        dropAt.current = { x: f.w / 2, y: f.h / 2 }
                        setPicker({ what: "add" })
                      }}
                    >
                      <SquaresFour size={16} />
                    </IconButton>
                    <IconButton label="Device" tipSide="top" popover="cv-add-device">
                      <DeviceMobile size={16} />
                    </IconButton>
                    <Popover id="cv-add-device" side="top" align="center" label="Add a device">
                      <div className="w-[220px] p-1.5">
                        {DEVICE_LIST.map((d) => (
                          <MenuItem
                            key={d.id}
                            icon={d.icon}
                            tone={tone("device")}
                            onSelect={() => {
                              addAt({ kind: "device", id: d.id }, { x: f.w / 2, y: f.h / 2 })
                              closePopover(document.getElementById("cv-add-device"))
                            }}
                          >
                            {d.name}
                          </MenuItem>
                        ))}
                      </div>
                    </Popover>
                    <IconButton label="Effect" tipSide="top" popover="cv-add-effect">
                      <Sparkle size={16} />
                    </IconButton>
                    <Popover id="cv-add-effect" side="top" align="center" label="An effect for the background">
                      <div className="max-h-[60vh] w-[320px] overflow-y-auto p-2.5">
                        <p className="pb-2 text-caption text-fg-3">The frame's background: it moves behind everything.</p>
                        <EffectGallery
                          current={backgroundEffect(doc)?.name ? presets.find((p) => p.name === backgroundEffect(doc)?.name)?.id : undefined}
                          onPick={(p) => {
                            addBackground(p)
                            closePopover(document.getElementById("cv-add-effect"))
                          }}
                        />
                      </div>
                    </Popover>
                    <span aria-hidden className="dock-sep" />
                    <button type="button" onClick={fit} title="Fit (Shift 1)" className="press h-8 min-w-[52px] rounded-md px-2 text-caption font-medium tabular-nums text-fg-2 hover:bg-surface-2 hover:text-fg">
                      {Math.round(vp.zoom * 100)}%
                    </button>
                  </div>
                </div>
              )}
              {play && (
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
                  <p className="text-caption text-fg-3">Playing: everything answers as it will on a site.</p>
                  <Button size="sm" onClick={() => mounted.current?.replay()}>
                    <Play size={13} aria-hidden />
                    Again
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            try {
              const p = await pictureOf(file)
              const w = Math.min(f.w * 0.4, p.w)
              const h = (w * p.h) / p.w
              add(imageNode(p.src, { x: Math.round(f.w / 2 - w / 2), y: Math.round(f.h / 2 - h / 2), w: Math.round(w), h: Math.round(h) }))
            } catch {
              say("That picture couldn't be read")
            }
          }}
        />
      </main>

      {/* ---- right: the picked layer, or the frame ---- */}
      {!focus && (
      <aside aria-label="Inspector" className="flex w-[272px] shrink-0 flex-col overflow-hidden bg-panel xl:w-[var(--inspector-w)]">
        <div className="flex h-14 shrink-0 items-center gap-2 pl-4 pr-2.5">
          {single && (() => {
            const I = KIND_ICON[single.kind]
            return (
              <span aria-hidden className="k-tint k-ink grid h-6 w-6 shrink-0 place-items-center rounded-md" style={kStyle(KIND_TONE[single.kind])}>
                <I size={14} />
              </span>
            )
          })()}
          {!picked.length && <KindTile icon={FrameCorners} tone="var(--fg-2)" />}
          <h2 className="mr-auto truncate text-body font-semibold">{single ? nodeName(single) : picked.length ? `${picked.length} layers` : "Frame"}</h2>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {picked.length > 1 ? (
            <p className="px-4 py-4 text-caption text-fg-3">{picked.length} layers picked: drag to move them together, Delete to remove them, Ctrl D to duplicate.</p>
          ) : (
            <CanvasInspector
              doc={doc}
              view={view}
              node={single}
              set={setNode}
              setDoc={setDoc}
              pick={(what) => setPicker({ what })}
              arrange={arrange}
              remove={remove}
              layoutPhone={() => commit(autoPhone({ ...doc, layers: doc.layers.map((n) => ({ ...n, phone: undefined })) }))}
              preview={() => single && mounted.current?.preview(single.id)}
              drawPath={() => {
                setTool("path")
                say("Draw where it goes, from the layer")
              }}
              select={(id) => setSel([id])}
              addBackground={addBackground}
              anchors={anchors}
              look={look}
              onLook={onLook}
              inCase={inCase}
              setInCase={setInCase}
              removeLayer={(id) => {
                nodes((ls) => ls.filter((n) => n.id !== id))
                setSel([])
              }}
            />
          )}
        </div>
      </aside>
      )}
      </div>

      <CreateDialog
        open={creating}
        kind={createKind}
        onClose={() => {
          setCreating(false)
          setCreateKind(undefined)
        }}
        ctx={createCtx}
        anchors={anchors}
        onPick={(d) => onCreate(d)}
      />
      <AnimPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        dark={dark}
        title={picker?.what === "screen" ? "Pick the screen" : "Pick a component"}
        onPick={(id) => {
          const p = picker
          setPicker(null)
          if (!p) return
          if (p.what === "add") addAt({ kind: "component", id }, dropAt.current ?? { x: f.w / 2, y: f.h / 2 })
          else if (p.what === "screen" && single?.kind === "device") {
            const live = liveFor(id, overrides, single.device)
            if (live) setNode({ screen: live, picture: undefined })
          } else if (p.what === "component" && single?.kind === "component") {
            const live = liveFor(id, overrides)
            if (live) setNode({ live })
          }
        }}
      />
    </div>
  )
}

/* ---------------- on every device ---------------- */

/** The canvas embedded in a page on a Mac, an iPad, an iPhone and a Duo at once, each at its real size against the
    others, so its layouts (desktop, and phone under 744 px) are seen where they're for. */
function OnDevices({ doc }: { doc: CanvasDoc }) {
  const z = usePacked(doc, location.origin)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 700 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const list: { key: keyof typeof MOCKUP; name: string; r: number }[] = [
    { key: "macbook", name: "MacBook", r: 10 },
    { key: "ipad", name: "iPad", r: 18 },
    { key: "iphone", name: "iPhone", r: 55 },
    { key: "duo", name: "iPhone Duo", r: 50 },
  ]
  const gap = 48
  const k = Math.min((size.w - 96 - gap * 3) / list.reduce((s, d) => s + MOCKUP[d.key].w, 0), (size.h - 120) / Math.max(...list.map((d) => MOCKUP[d.key].h)))
  // every canvas has a phone layout on a site: its own, or the automatic one
  const phones = doc.layers.length > 0
  return (
    // the devices stand on one line, in the middle of the space
    <div ref={box} className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-end" style={{ gap }}>
      {list.map((d) => {
        const m = MOCKUP[d.key]
        const inset = (m.w - m.vw) / 2
        return (
          <figure key={d.key} className="flex flex-col items-center gap-3">
            <div className="relative bg-[#1c1c1f] shadow-[0_0_0_1px_var(--line-strong),var(--sh-md)]" style={{ width: m.w * k, height: m.h * k, borderRadius: (d.r + inset) * k }}>
              <div className="absolute overflow-hidden bg-white" style={{ left: inset * k, top: (d.key === "macbook" ? 57 : inset) * k, width: m.vw * k, height: m.vh * k, borderRadius: d.r * k }}>
                {z && <iframe title={`The canvas on ${d.name}`} src={`/canvas-demo.html#z=${z}`} className="absolute left-0 top-0 origin-top-left border-0" style={{ width: m.vw, height: m.vh, transform: `scale(${k})` }} />}
              </div>
            </div>
            <figcaption className="text-caption text-fg-3">
              {d.name}
              {phones && m.vw < 744 ? " · phone layout" : ""}
            </figcaption>
          </figure>
        )
      })}
      </div>
    </div>
  )
}

/** The canvas baked and packed for a link, again a moment after it changes. */
function usePacked(doc: CanvasDoc, origin: string) {
  const [z, setZ] = useState("")
  useEffect(() => {
    let on = true
    const t = setTimeout(() => void pack(bake({ ...doc, origin }) as never).then((x) => on && setZ(x)), 250)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [doc, origin])
  return z
}

/* ---------------- export ---------------- */

function ExportPanel({ doc, onOpen }: { doc: CanvasDoc; onOpen: (d: CanvasDoc) => void }) {
  const [bad, setBad] = useState("")
  const [origin, setOrigin] = useState(() => {
    try {
      return localStorage.getItem("anim-engine:player") || location.origin
    } catch {
      return location.origin
    }
  })
  const [as, setAs] = useState<"html" | "react" | "json">("html")
  const [copied, setCopied] = useState(false)
  const o = origin.trim().replace(/\/+$/, "")
  const z = usePacked(doc, o)
  const json = useMemo(() => JSON.stringify(bake({ ...doc, origin: o }), null, 2), [doc, o])
  const code =
    as === "html"
      ? `<div data-engine-canvas="#z=${z}"></div>\n<script type="module" src="${o}/canvas.js"></script>`
      : as === "react"
        ? `// save the canvas's JSON next to this file as canvas.json\nimport { useEffect, useRef } from "react"\nimport doc from "./canvas.json"\n\nexport function EngineCanvas() {\n  const ref = useRef(null)\n  useEffect(() => {\n    let canvas\n    import(/* @vite-ignore */ /* webpackIgnore: true */ "${o}/canvas.js").then(({ mount }) => {\n      canvas = mount(ref.current, doc)\n    })\n    return () => canvas?.destroy()\n  }, [])\n  return <div ref={ref} />\n}`
        : json
  const save = () => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([json], { type: "application/json" })), download: `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "canvas"}.json` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const kb = Math.round(new Blob([json]).size / 1024)
  return (
    <div className="w-[360px] max-w-[calc(100vw-16px)] space-y-2.5 p-3">
      <Segmented<"html" | "react" | "json">
        full
        size="sm"
        label="As"
        value={as}
        onChange={(v) => {
          setAs(v)
          setCopied(false)
        }}
        options={[
          { value: "html", label: "HTML" },
          { value: "react", label: "React" },
          { value: "json", label: "JSON" },
        ]}
      />
      <p className="text-caption text-fg-3">
        {as === "json"
          ? `The canvas itself, ${kb} KB: every layer, its layouts and interactions. canvas.js draws it.`
          : "One script for every canvas on the page: each loads as it comes near the screen and rests when it leaves it."}
      </p>
      <textarea readOnly rows={as === "html" ? 4 : 9} value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Code" className={`${field} mono block w-full resize-none px-2 py-1.5 text-micro`} />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" disabled={as === "html" && !z} onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}>
          <CopyIcon size={14} aria-hidden />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" onClick={save}>
          <DownloadSimple size={14} aria-hidden />
          JSON
        </Button>
        <Button size="sm" variant="ghost" disabled={!z} onClick={() => window.open(`${o}/canvas-demo.html#z=${z}`, "_blank", "noopener")}>
          <ArrowSquareOut size={14} aria-hidden />
          Open
        </Button>
        <label className="press ml-auto inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-caption font-medium text-fg-2 hover:bg-surface-2 hover:text-fg">
          Open a JSON…
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              try {
                const d = validateDoc(JSON.parse(await file.text()))
                if (!d) throw new Error()
                setBad("")
                onOpen(d)
              } catch {
                setBad("That file isn't a canvas.")
              }
            }}
          />
        </label>
      </div>
      {bad && (
        <p role="alert" className="text-caption text-fg-2">
          {bad}
        </p>
      )}
      <label htmlFor="cv-origin" className="block pt-1 text-caption text-fg-2">
        Plays from
      </label>
      <input
        id="cv-origin"
        value={origin}
        spellCheck={false}
        onChange={(e) => {
          setOrigin(e.target.value)
          setCopied(false)
        }}
        onBlur={() => {
          try {
            localStorage.setItem("anim-engine:player", origin.trim())
          } catch {
            /* private mode */
          }
        }}
        className={`${field} mono h-7 w-full px-2 text-caption`}
      />
      {/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(o) && <p className="text-caption text-fg-3">That's this machine. On a site, put the address the engine is deployed at: the live screens come from there.</p>}
    </div>
  )
}
