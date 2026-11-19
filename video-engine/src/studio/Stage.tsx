// Studio — the engine's stage: the composition in its export frame, played on the real clock, with the timeline under
// it. It waits for Play (the button on the frame, the timeline's, or Space). Things are edited where they are: drag a
// component, picture or title to move it (its corner resizes it), drag anywhere else to turn the camera of the scene
// that's showing, scroll or pinch to zoom, double-click to reset. Inside a film, point at a part (a screen, the logo, a
// line) and click it to edit it on the film: words are typed over themselves, a screen gets its chooser on it (or takes a
// file dropped on it).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { ArrowArcLeft, ArrowArcRight, ArrowClockwise, ArrowCounterClockwise, ArrowDown, ArrowUp, CaretDown, ClipboardText, Copy, CopySimple, Scissors, Trash, CaretUp, Circle, Cursor as CursorIcon, DeviceMobile, FileCode, Image as ImageIcon, Eye, EyeSlash, Lightbulb, Minus, Pause, Play, Plus, Square, SquaresFour, TextT, Timer } from "@phosphor-icons/react"
import { CODE, MEDIA, importCode, uploadMedia } from "../controls"
import { ANIMS, CATEGORIES, byId, withDefaults, type Value } from "../registry"
import { DEVICES, type DeviceId } from "../devices"
import type { KitItem } from "../refs"
import { IconButton, MenuItem, Popover, closePopover } from "../ui"

import { VIEW, addDevice, at, devicesOf, starts, total, withValues, type Comp, type ComponentLayer, type FlatLayer, type Layer, type MovingLayer, type Scene } from "./comp"
import { Lanes } from "./Lanes"
import { kStyle, tone, type AddKind } from "./Layers"
import { SIZES } from "./config"
import { CompositionView, viewWith, type Drag, type Resolve, type ViewHandle } from "./view"

/** Transparent, shown the way image editors show it. */
const CHECKER = "repeating-conic-gradient(#e4e4e8 0% 25%, #f6f6f8 0% 50%) 50% / 16px 16px"
const fine = typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches
const clampZoom = (z: number) => Math.min(3, Math.max(0.35, z))
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`

export type Sel = { scene: string; layer?: string }
export type Ops = { jumps: number; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; copy: () => void; cut: () => void; paste: () => void; canPaste: boolean; duplicate: () => void; remove: () => void }
/** a part's style, copied to put on another part (its colour, fill, size, turn) */
let styleClip: Look | null = null
/** when the clipboard's own event last came (the keys copy for windows that don't send it) */
let styleEventAt = 0
/** a part of a film: the params it shows, and where it is on the stage (px in the stage's area) */
type Rect = { left: number; top: number; width: number; height: number }
/** a part of a film: the params it shows, where it is and where each of them is (px in the stage's area; for a list
    param, which piece), and where it was clicked */
type Part = { scene: string; layer: string; keys: string[]; box: Rect; at: Record<string, { box: Rect; piece?: number }>; click: { x: number; y: number }; bits: Bit[]; bit: number }
/** one part of a film under a click (kit.tsx Bit): `unit`, area px per one of its own px */
type Bit = { k: string; name: string; kind: string; count: number; box: Rect; unit: number; color: string; fill: string }
/** a change to a part's look (kit.tsx Look), kept in the film's `looks` value */
type Look = { color?: string; fill?: string; scale?: number; x?: number; y?: number; rotate?: number; hide?: boolean; src?: string }
/** to a tenth of a film's px: in a close-up a screen pixel is less than one of the film's */
const tenth = (v: number) => Math.round(v * 10) / 10
const looksOf = (l: ComponentLayer): Record<string, Look> => {
  try {
    return JSON.parse(String(l.values?.looks ?? "{}")) as Record<string, Look>
  } catch {
    return {}
  }
}
/** the film's looks with one part's changed (null: put back), in every scene of the film */
const withLook = (c: Comp, scene: string, layer: string, k: string, patch: Partial<Look> | null): Comp => {
  const cur = c.scenes.find((s) => s.id === scene)?.layers.find((x) => x.id === layer)
  if (cur?.kind !== "component") return c
  const all = looksOf(cur)
  const next = patch ? { ...all[k], ...patch } : null
  const looks = { ...all }
  if (next && Object.values(next).some((v) => v !== undefined && v !== 0 && v !== false && v !== "" && v !== 1)) looks[k] = next
  else delete looks[k]
  return withValues(c, cur, { ...cur.values, looks: JSON.stringify(looks) })
}
const isFilm = (l?: Layer): l is ComponentLayer => l?.kind === "component" && byId(l.anim)?.category === "Launch films"
/** what a part is called: its params' labels */
const partName = (comp: Comp, p: Part) => {
  const l = comp.scenes.find((s) => s.id === p.scene)?.layers.find((x) => x.id === p.layer)
  const a = l?.kind === "component" ? byId(l.anim) : undefined
  return p.keys.map((k) => a?.schema[k]?.label ?? k).join(" · ")
}

export default function StudioStage({
  comp,
  setComp,
  resolve,
  sel,
  setSel,
  playing,
  setPlaying,
  onAddScene,
  compact,
  framing = "start",
  onSize,
  onMatch,
  onIdeas,
  onAdd,
  onKit,
  ops,
}: {
  comp: Comp
  setComp: (fn: (c: Comp) => Comp) => void
  resolve: Resolve
  sel: Sel
  setSel: (s: Sel) => void
  playing: boolean
  setPlaying: (on: boolean) => void
  onAddScene: () => void
  /** phones and short windows: tighter margins */
  compact?: boolean
  /** on a "two framings" scene, which framing the stage's gestures set */
  framing?: "start" | "end"
  /** a component layer measured itself (its frame's key, px) */
  onSize?: (key: string, w: number, h: number) => void
  /** time the composition to a video */
  onMatch?: () => void
  /** new scenes that continue the film, by the rules or by Gemini */
  onIdeas?: () => void
  /** the canvas toolbar: put something new in the scene */
  onAdd?: (kind: AddKind, d?: DeviceId) => void
  /** a piece of the kit dropped on the stage, where it landed (fractions of the frame) */
  onKit?: (item: KitItem, at: { x: number; y: number }) => void
  /** the Studio's edits, for the stage's menu: history, and copies of what's picked (a layer, or the scene) */
  ops?: Ops
}) {
  const PAD = compact ? 12 : 16
  // a strip under the frame for the add-toolbar, so it never sits on the film (on a compact stage too)
  const FOOT = !onAdd ? PAD : compact ? 58 : 68
  const area = useRef<HTMLDivElement>(null)
  const shield = useRef<HTMLDivElement>(null)
  const view = useRef<ViewHandle>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const size = SIZES.find((x) => x.id === comp.size) ?? SIZES[0]
  const k = Math.max(0, Math.min((box.w - PAD * 2) / size.w, (box.h - PAD - FOOT) / size.h))
  const fw = Math.round(size.w * k)
  const fh = Math.round(size.h * k)
  useEffect(() => {
    const el = area.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---------- click to edit: what's under the pointer inside a film ---------- */
  // a film opened shows a play button over it: it plays when asked
  const [cue, setCue] = useState(true)
  const opened = comp.scenes[0]?.id
  useEffect(() => setCue(true), [opened])
  const [part, setPart] = useState<Part | null>(null)
  const partRef = useRef(part)
  partRef.current = part
  // an undo or redo: the part picked may have moved, so it's let go
  useEffect(() => {
    setPart(null)
    setHover(null)
  }, [ops?.jumps])
  // the stage's menu (right click), where it opened (px in the area)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<Part | null>(null)
  const asking = useRef<{ id: number; hover: boolean; scene: string; layer: string; win: Window; r: DOMRect; at: number; cx: number; cy: number; then?: (p: Part | null) => void } | null>(null)
  const askId = useRef(0)
  /** asks the film under the pointer what's there (its frame answers "picked": kit.tsx pickAt); `then` takes the answer
      instead of it being picked */
  const ask = (scene: string, layer: string, cx: number, cy: number, hovering: boolean, then?: (p: Part | null) => void) => {
    const f = area.current?.querySelector<HTMLIFrameElement>(`[data-scene="${scene}"] [data-layer="${layer}"] iframe`)
    if (!f?.contentWindow) return
    const r = f.getBoundingClientRect()
    const x = (cx - r.left) / r.width
    const y = (cy - r.top) / r.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    // pointing asks a few times a second; a click always asks
    if (hovering && asking.current && performance.now() - asking.current.at < 90) return
    const id = ++askId.current
    asking.current = { id, hover: hovering, scene, layer, win: f.contentWindow, r, at: performance.now(), cx, cy, then }
    f.contentWindow.postMessage({ source: "anim-engine-host", type: "pick", id, x, y, hover: hovering }, resolve.frames ?? resolve.origin)
  }
  useEffect(() => {
    type FBox = { x: number; y: number; w: number; h: number }
    const on = (e: MessageEvent) => {
      const d = e.data
      const q = asking.current
      if (e.origin !== (resolve.frames ?? resolve.origin) || d?.source !== "anim-engine-stage" || d.type !== "picked" || !q || d.id !== q.id || e.source !== q.win) return
      asking.current = null
      const a = area.current!.getBoundingClientRect()
      // the frame's fractions as px in the stage's area
      const rect = (b: FBox): Rect => ({ left: q.r.left - a.left + b.x * q.r.width, top: q.r.top - a.top + b.y * q.r.height, width: b.w * q.r.width, height: b.h * q.r.height })
      const keys: string[] = Array.isArray(d.keys) ? d.keys.map(String) : []
      const bits: Bit[] = (Array.isArray(d.bits) ? (d.bits as (Omit<Bit, "box"> & { box: FBox })[]) : []).map((b) => ({ ...b, box: rect(b.box), unit: b.unit * q.r.width }))
      const box = keys.length ? rect(d.box) : bits[0]?.box
      const p: Part | null =
        keys.length || bits.length
          ? {
              scene: q.scene,
              layer: q.layer,
              keys,
              box,
              at: Object.fromEntries(Object.entries((d.at ?? {}) as Record<string, { box: FBox; piece?: number }>).map(([k, v]) => [k, { box: rect(v.box), piece: v.piece }])),
              click: { x: q.cx - a.left, y: q.cy - a.top },
              bits,
              bit: 0,
            }
          : null
      if (q.then) q.then(p)
      else if (q.hover) setHover(p)
      else {
        setPart(p)
        setHover(null)
      }
    }
    addEventListener("message", on)
    return () => removeEventListener("message", on)
  }, [resolve.frames, resolve.origin])
  /** a part grown or turned is asked for again where it was clicked, once it's drawn, so its outline fits it */
  const repick = (p: Part) =>
    window.setTimeout(() => {
      const a = area.current?.getBoundingClientRect()
      if (a) ask(p.scene, p.layer, a.left + p.click.x, a.top + p.click.y, false, (q) => q && setPart((cur) => (cur && cur.layer === p.layer ? { ...q, bit: Math.min(cur.bit, q.bits.length - 1) } : cur)))
    }, 600)
  /** tells a film's frame something (a part being moved) */
  const postTo = (scene: string, layer: string, msg: object) =>
    area.current?.querySelector<HTMLIFrameElement>(`[data-scene="${scene}"] [data-layer="${layer}"] iframe`)?.contentWindow?.postMessage({ source: "anim-engine-host", ...msg }, resolve.frames ?? resolve.origin)
  // how far the part being dragged has gone (its outline goes with it)
  const [drift, setDrift] = useState<{ x: number; y: number } | null>(null)
  /** the part picked and its film layer, now */
  const pickedPart = () => {
    const p = partRef.current
    const b = p?.bits[p.bit]
    const l = p ? comp.scenes.find((s) => s.id === p.scene)?.layers.find((x) => x.id === p.layer) : undefined
    return p && b && l?.kind === "component" ? { p, b, l, look: looksOf(l)[b.k] ?? {} } : null
  }
  const copyStyle = () => {
    const x = pickedPart()
    if (!x) return
    styleClip = { color: x.look.color ?? (x.b.color || undefined), fill: x.look.fill ?? (x.b.fill || undefined), scale: x.look.scale, rotate: x.look.rotate }
  }
  const pasteStyle = (style = styleClip) => {
    const x = pickedPart()
    if (x && style) setComp((c) => withLook(c, x.p.scene, x.p.layer, x.b.k, { color: style.color, fill: style.fill, scale: style.scale, rotate: style.rotate }))
  }
  const toggleHide = () => {
    const x = pickedPart()
    if (x) setComp((c) => withLook(c, x.p.scene, x.p.layer, x.b.k, { hide: !x.look.hide }))
  }
  const putBack = () => {
    const x = pickedPart()
    if (x) setComp((c) => withLook(c, x.p.scene, x.p.layer, x.b.k, null))
  }
  const opsRef = useRef({ pickedPart, copyStyle, pasteStyle, toggleHide })
  opsRef.current = { pickedPart, copyStyle, pasteStyle, toggleHide }
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable], dialog")
    const key = (e: KeyboardEvent) => {
      const x = opsRef.current.pickedPart()
      if (!x || typing(e.target)) return
      const step = e.shiftKey ? 10 : 1
      const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key]
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      // copy, cut, paste on a part are its style's (the clipboard's events do it; the keys, a moment later, where a
      // window doesn't send them); not the Studio's copies of the whole film layer
      if (mod && (k === "c" || k === "x" || k === "v")) {
        e.stopImmediatePropagation()
        const at = performance.now()
        setTimeout(() => {
          if (styleEventAt >= at) return
          if (k === "v") return opsRef.current.pasteStyle()
          opsRef.current.copyStyle()
          if (k === "x") opsRef.current.toggleHide()
        }, 80)
        return
      }
      if (!by && e.key !== "Delete" && e.key !== "Backspace" && !(mod && k === "d")) return
      // the part's own: not the film layer it's in (Delete would take the whole film out of the scene)
      e.preventDefault()
      e.stopImmediatePropagation()
      if (mod) return
      if (!by) return opsRef.current.toggleHide()
      // a screen pixel at a time (ten with Shift), and the outline with it
      setComp((c) => withLook(c, x.p.scene, x.p.layer, x.b.k, { x: tenth((x.look.x ?? 0) + by[0] / x.b.unit), y: tenth((x.look.y ?? 0) + by[1] / x.b.unit) }))
      setPart((p) => (p ? { ...p, bits: p.bits.map((b, i) => (i === p.bit ? { ...b, box: { ...b.box, left: b.box.left + by[0], top: b.box.top + by[1] } } : b)) } : p))
    }
    const copy = (e: ClipboardEvent, cut: boolean) => {
      if (!opsRef.current.pickedPart() || typing(e.target)) return
      styleEventAt = performance.now()
      e.preventDefault()
      e.stopImmediatePropagation()
      opsRef.current.copyStyle()
      e.clipboardData?.setData("text/plain", JSON.stringify({ animEngine: "style", data: styleClip }))
      if (cut) opsRef.current.toggleHide()
    }
    const paste = (e: ClipboardEvent) => {
      const x = opsRef.current.pickedPart()
      if (!x || typing(e.target)) return
      styleEventAt = performance.now()
      // a picture from the clipboard: into the screen this part is on
      const pic = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"))
      const screen = pic && byId(x.l.anim) ? x.p.keys.find((k) => byId(x.l.anim)!.schema[k]?.type === "screen") : undefined
      if (pic && screen) {
        e.preventDefault()
        e.stopImmediatePropagation()
        void uploadMedia(pic).then((v) => setComp((c) => setParam(c, x.p, screen, v)))
        return
      }
      let style: Look | null = null
      try {
        const j = JSON.parse(e.clipboardData?.getData("text/plain") || "null")
        if (j?.animEngine === "style") style = j.data
      } catch {
        /* not a style */
      }
      style ??= styleClip
      if (!style) return
      e.preventDefault()
      e.stopImmediatePropagation()
      opsRef.current.pasteStyle(style)
    }
    const onCopy = (e: ClipboardEvent) => copy(e, false)
    const onCut = (e: ClipboardEvent) => copy(e, true)
    addEventListener("keydown", key, true)
    addEventListener("copy", onCopy, true)
    addEventListener("cut", onCut, true)
    addEventListener("paste", paste, true)
    return () => {
      removeEventListener("keydown", key, true)
      removeEventListener("copy", onCopy, true)
      removeEventListener("cut", onCut, true)
      removeEventListener("paste", paste, true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // the menu goes when anything else is pressed, or Escape
  useEffect(() => {
    if (!menu) return
    const away = (e: Event) => !(e.target as Element).closest?.("[data-stage-menu]") && setMenu(null)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null)
    addEventListener("pointerdown", away, true)
    addEventListener("keydown", esc)
    return () => {
      removeEventListener("pointerdown", away, true)
      removeEventListener("keydown", esc)
    }
  }, [menu])
  /** the film under a point of the stage, in the scene that's showing */
  const filmUnder = (cx: number, cy: number) => {
    const s = current()
    const hit = s && document.elementsFromPoint(cx, cy).find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.layer && n.closest<HTMLElement>("[data-scene]")?.dataset.scene === s.id)
    const l = hit ? s.layers.find((x) => x.id === hit.dataset.layer) : undefined
    return s && isFilm(l) ? { scene: s.id, layer: l.id } : null
  }
  // files dropped on a screen, handed to its chooser to put in
  const [dropped, setDropped] = useState<{ part: Part; key: string; files: File[] } | null>(null)
  // Space plays and pauses (not while typing, or on a button, which Space presses); Escape lets go of a part
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setPart(null)
      const t = e.target as HTMLElement
      if (e.key !== " " || e.repeat || t.closest("input, textarea, select, button, [contenteditable=true], [role=listbox], [role=dialog]")) return
      e.preventDefault()
      setPlaying(!live.current.playing)
    }
    addEventListener("keydown", on)
    return () => removeEventListener("keydown", on)
  }, [setPlaying])

  /* ---------- the clock ---------- */
  const len = total(comp)
  const time = useRef(0)
  const t0 = useRef(performance.now())
  const drag = useRef<Drag>({ yaw: 0, elev: 0, zoom: 1 })
  // where the pointer is over the frame (fractions of it), for gradients and anything else that follows it
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const lanesIndex = comp.scenes.findIndex((s) => s.id === sel.scene)
  const live = useRef({ playing, len, comp, lanes: lanesIndex })
  live.current = { playing, len, comp, lanes: lanesIndex }
  const lanesHead = useRef<HTMLDivElement | null>(null)
  const [lanesOpen, setLanesOpen] = useState(() => {
    try {
      return localStorage.getItem("anim-engine:lanes") !== "0"
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem("anim-engine:lanes", lanesOpen ? "1" : "0")
    } catch {
      /* private mode */
    }
  }, [lanesOpen])
  // smart guides while a layer is dragged: where it snapped, as fractions of the frame
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const head = useRef<HTMLDivElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const outline = useRef<HTMLDivElement>(null)
  const selRef = useRef(sel)
  selRef.current = sel
  const req = useRef(0)
  const song = useRef<HTMLAudioElement>(null)
  const voices = useRef<Record<string, HTMLAudioElement>>({})
  const draw = useCallback(() => {
    if (req.current) return
    req.current = requestAnimationFrame(() => {
      req.current = 0
      const { playing: on, len: L } = live.current
      if (on) time.current = ((performance.now() - t0.current) / 1000) % Math.max(0.1, L)
      const t = Math.min(time.current, Math.max(0, L - 0.001))
      const busy = view.current?.render(t, drag.current, pointer.current)
      if (head.current) head.current.style.left = `${(t / Math.max(0.1, L)) * 100}%`
      const lh = lanesHead.current
      if (lh) {
        const i = live.current.lanes
        const sc = i >= 0 ? live.current.comp.scenes[i] : null
        const f = sc ? (t - starts(live.current.comp)[i]) / Math.max(0.1, sc.duration) : -1
        lh.style.display = f >= 0 && f <= 1 ? "block" : "none"
        lh.style.left = `calc(${(172 * (1 - f)).toFixed(2)}px + ${(f * 100).toFixed(3)}%)`
      }
      if (clock.current) clock.current.textContent = `${fmt(t)} / ${fmt(L)}`
      // its voiceover: each line plays while the playhead is in it
      const v = live.current.comp.voice
      if (v?.lines.length) {
        const st = starts(live.current.comp)
        for (const l of v.lines) {
          const el = (voices.current[l.url] ??= Object.assign(new Audio(l.url), { preload: "auto" }))
          const i = live.current.comp.scenes.findIndex((x) => x.id === l.scene)
          const from = (st[i] ?? -99) + 0.15
          if (on && i >= 0 && t >= from && t < from + l.dur) {
            if (el.paused) void el.play().catch(() => {})
            if (Math.abs(el.currentTime - (t - from)) > 0.2) el.currentTime = t - from
          } else if (!el.paused) el.pause()
        }
      }
      // the film's song plays with it, kept within a few frames of the playhead
      const a = song.current
      const m = live.current.comp.music
      if (a && m) {
        const want = (m.offset ?? 0) + t
        if (on) {
          if (a.paused) void a.play().catch(() => {})
          if (Math.abs(a.currentTime - want) > 0.15) a.currentTime = want
        } else if (!a.paused) a.pause()
      }
      // the picked flat layer gets an outline and a corner to resize it by, wherever it has moved to
      const o = outline.current
      if (o) {
        const s = selRef.current
        const el = s.layer ? area.current?.querySelector<HTMLElement>(`[data-scene="${s.scene}"] [data-layer="${s.layer}"]`) : null
        const vis = el && el.closest<HTMLElement>("[data-scene]")?.style.visibility === "visible"
        if (el && vis) {
          const r = el.getBoundingClientRect()
          const a = area.current!.getBoundingClientRect()
          Object.assign(o.style, { display: "block", left: `${r.left - a.left}px`, top: `${r.top - a.top}px`, width: `${r.width}px`, height: `${r.height}px` })
        } else o.style.display = "none"
      }
      if (on || busy) draw()
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(req.current), [])
  useEffect(() => {
    if (playing) {
      t0.current = performance.now() - time.current * 1000
      setCue(false)
      setPart(null)
      setHover(null)
    }
    draw()
  }, [playing, draw])
  useEffect(draw, [comp, sel, fw, fh, draw])
  const seek = (t: number) => {
    setPart(null)
    time.current = Math.max(0, Math.min(len, t))
    if (live.current.playing) t0.current = performance.now() - time.current * 1000
    draw()
  }
  // for scripted checks: pause and show the composition at `t` seconds
  useEffect(() => {
    ;(window as unknown as { __studioSeek?: (t: number) => void }).__studioSeek = (t: number) => {
      setPlaying(false)
      seek(t)
    }
  })
  // picking a scene (in the layers or the timeline) shows it settled: its layers in, its camera on the shot
  useEffect(() => {
    if (live.current.playing) return
    const i = comp.scenes.findIndex((s) => s.id === sel.scene)
    if (i < 0 || at(comp, time.current).i === i) return
    const st = comp.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0)
    seek(st + Math.min(1.8, comp.scenes[i].duration * 0.6))
  }, [sel.scene]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- editing on the stage ---------- */
  const current = (): Scene | undefined => comp.scenes[at(comp, time.current).i]
  const [hint, setHint] = useState(() => {
    try {
      return !localStorage.getItem("anim-engine:orbited")
    } catch {
      return false
    }
  })
  // it says how to turn the device, so only where there is one, and only for a few seconds
  const [hintGone, setHintGone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHintGone(true), 6000)
    return () => clearTimeout(t)
  }, [])
  const learned = () => {
    if (!hint) return
    setHint(false)
    try {
      localStorage.setItem("anim-engine:orbited", "1")
    } catch {
      /* private mode: the hint just comes back next time */
    }
  }
  const updateScene = (id: string, fn: (s: Scene) => Scene) => setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === id ? fn(s) : s)) }))
  const framingRef = useRef(framing)
  framingRef.current = framing
  /** the gesture sets the end framing of a "two framings" scene */
  const atEnd = (s: Scene) => s.move === "framings" && framingRef.current === "end"
  /** a camera gesture, landed on the framing it was setting */
  const commit = (s: Scene, d: Drag): Scene => {
    const cam = d.end ? (s.camera2 ?? s.camera) : s.camera
    const turned =
      d.yaw || d.elev || d.zoom !== 1 || d.pitch || d.roll
        ? { ...cam, yaw: cam.yaw + d.yaw, elev: cam.elev + d.elev, zoom: clampZoom(cam.zoom * d.zoom), ...(d.pitch ? { pitch: Math.round((cam.pitch ?? 0) + d.pitch) } : {}), ...(d.roll ? { roll: Math.round((cam.roll ?? 0) + d.roll) } : {}) }
        : cam
    const panned = d.px || d.py || (d.vz ?? 1) !== 1
    const view = viewWith(d.end ? (s.view2 ?? s.view ?? VIEW) : (s.view ?? VIEW), d)
    return { ...s, ...(d.end ? { camera2: turned } : { camera: turned }), ...(panned ? (d.end ? { view2: view } : { view }) : {}) }
  }
  // choosing which framing to set shows it: the start of the scene, or its end
  useEffect(() => {
    const i = comp.scenes.findIndex((s) => s.id === sel.scene)
    const s = comp.scenes[i]
    if (!s || s.move !== "framings") return
    setPlaying(false)
    const st = comp.scenes.slice(0, i).reduce((a, x) => a + x.duration, 0)
    seek(framing === "end" ? st + s.duration - 0.001 : st)
  }, [framing]) // eslint-disable-line react-hooks/exhaustive-deps
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  type Gesture =
    | { kind: "orbit"; x: number; y: number; scene: string; end: boolean }
    | { kind: "tilt"; x: number; y: number; scene: string; end: boolean }
    | { kind: "pan"; x: number; y: number; scene: string; end: boolean }
    | { kind: "move" | "size"; x: number; y: number; scene: string; layer: FlatLayer; el: HTMLElement; moved: boolean; at?: { x: number; y: number } }
    | { kind: "pinch"; d: number; scene: string; end: boolean }
    | { kind: "part"; x: number; y: number; scene: string; layer: ComponentLayer; moved: boolean; bit?: { k: string; base: { x: number; y: number }; unit: number } }
  const gesture = useRef<Gesture | null>(null)
  const spread = () => {
    const [a, b] = [...fingers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const begin = (e: PointerEvent<HTMLElement>, sizer: boolean) => {
    if (e.button !== 0) return
    const s = current()
    if (!s) return
    shield.current!.setPointerCapture(e.pointerId)
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.current.size === 2) {
      gesture.current = { kind: "pinch", d: spread(), scene: s.id, end: atEnd(s) }
      drag.current = { yaw: 0, elev: 0, zoom: 1, end: atEnd(s) }
      return
    }
    // a flat layer under the pointer (the shield sits over the frame, so look through it)
    const hit = sizer
      ? area.current?.querySelector<HTMLElement>(`[data-scene="${s.id}"] [data-layer="${selRef.current.layer}"]`)
      : document.elementsFromPoint(e.clientX, e.clientY).find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.layer && n.closest<HTMLElement>("[data-scene]")?.dataset.scene === s.id)
    const layer = hit ? s.layers.find((l) => l.id === hit.dataset.layer) : undefined
    // a film: a click picks a part of it, and the part picked is dragged to move it (the film itself stays put)
    if (!sizer && isFilm(layer)) {
      setSel({ scene: s.id, layer: layer.id })
      const b = part && part.layer === layer.id ? part.bits[part.bit] : undefined
      const a = area.current!.getBoundingClientRect()
      const [px, py] = [e.clientX - a.left, e.clientY - a.top]
      const inside = b && px >= b.box.left && px <= b.box.left + b.box.width && py >= b.box.top && py <= b.box.top + b.box.height
      const look = b ? (looksOf(layer)[b.k] ?? {}) : {}
      gesture.current = { kind: "part", x: e.clientX, y: e.clientY, scene: s.id, layer, moved: false, bit: inside && b ? { k: b.k, base: { x: look.x ?? 0, y: look.y ?? 0 }, unit: b.unit || 1 } : undefined }
      return
    }
    if (hit && layer && layer.kind !== "device") {
      setSel({ scene: s.id, layer: layer.id })
      gesture.current = { kind: sizer ? "size" : "move", x: e.clientX, y: e.clientY, scene: s.id, layer, el: hit, moved: false }
      return
    }
    if (selRef.current.scene !== s.id || selRef.current.layer) setSel({ scene: s.id })
    // no devices to turn, or Shift held: the drag pans the flat camera instead; Alt held, it tilts and rolls the device
    const pan = e.shiftKey || !devicesOf(s).length
    gesture.current = pan
      ? { kind: "pan", x: e.clientX, y: e.clientY, scene: s.id, end: atEnd(s) }
      : { kind: e.altKey ? "tilt" : "orbit", x: e.clientX, y: e.clientY, scene: s.id, end: atEnd(s) }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      const r = e.currentTarget.getBoundingClientRect()
      pointer.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
      if (!live.current.playing) draw()
    }
    if (!fingers.current.has(e.pointerId)) {
      // pointing at a film, paused: the part a click would edit is outlined and named
      const s = current()
      if (!fine || live.current.playing || !s) return
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.layer && n.closest<HTMLElement>("[data-scene]")?.dataset.scene === s.id)
      const l = hit ? s.layers.find((x) => x.id === hit.dataset.layer) : undefined
      if (isFilm(l)) ask(s.id, l.id, e.clientX, e.clientY, true)
      else if (hover) setHover(null)
      return
    }
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === "pinch") {
      if (fingers.current.size === 2) drag.current = { yaw: 0, elev: 0, zoom: spread() / g.d, end: g.end }
    } else if (g.kind === "orbit") drag.current = { yaw: (e.clientX - g.x) * 0.3, elev: (e.clientY - g.y) * 0.2, zoom: 1, end: g.end }
    else if (g.kind === "tilt") drag.current = { yaw: 0, elev: 0, zoom: 1, pitch: (e.clientY - g.y) * 0.3, roll: (e.clientX - g.x) * 0.3, end: g.end }
    else if (g.kind === "pan") drag.current = { yaw: 0, elev: 0, zoom: 1, px: (e.clientX - g.x) / fw, py: (e.clientY - g.y) / fh, end: g.end }
    else if (g.kind === "part") {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return
      g.moved = true
      if (!g.bit) return
      // the part follows the pointer: moved in the film at once, kept when it's let go
      const dx = (e.clientX - g.x) / g.bit.unit
      const dy = (e.clientY - g.y) / g.bit.unit
      postTo(g.scene, g.layer.id, { type: "nudge", k: g.bit.k, x: g.bit.base.x + dx, y: g.bit.base.y + dy })
      setDrift({ x: e.clientX - g.x, y: e.clientY - g.y })
    } else if (g.kind === "move") {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return
      g.moved = true
      const p = snapped(g.scene, g.layer, g.layer.box.x + (e.clientX - g.x) / fw, g.layer.box.y + (e.clientY - g.y) / fh, !e.altKey)
      g.el.style.left = `${p.x * 100}%`
      g.el.style.top = `${p.y * 100}%`
      g.at = p
    } else if (g.kind === "size") {
      g.moved = true
      g.el.style.width = `${Math.max(0.04, g.layer.box.w + (2 * (e.clientX - g.x)) / fw) * 100}%`
    }
    draw()
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId)
    if (fingers.current.size) return
    const g = gesture.current
    gesture.current = null
    const d = drag.current
    drag.current = { yaw: 0, elev: 0, zoom: 1 }
    if (!g) return
    const turned = d.yaw || d.elev || d.zoom !== 1 || d.px || d.py || d.pitch || d.roll
    // a click (no drag) on the frame pauses it, the way a video does, so what was clicked holds still to be edited
    if (!(g.kind === "move" || g.kind === "size" || g.kind === "part" ? g.moved : turned)) {
      if (live.current.playing) setPlaying(false)
      setCue(false)
    }
    if (g.kind === "orbit" || g.kind === "tilt" || g.kind === "pinch" || g.kind === "pan") {
      if (turned) {
        updateScene(g.scene, (s) => commit(s, d))
        learned()
      } else setPart(null)
    } else if (g.kind === "part") {
      // a click inside a film: the part under it (a word, a screen, any shape) opens to edit on the film
      if (!g.moved) ask(g.scene, g.layer.id, e.clientX, e.clientY, false)
      else if (g.bit) {
        const b = g.bit
        setComp((c) => withLook(c, g.scene, g.layer.id, b.k, { x: tenth(b.base.x + (e.clientX - g.x) / b.unit), y: tenth(b.base.y + (e.clientY - g.y) / b.unit) }))
        // the part's outline follows it to where it was let go
        setPart((p) => (p ? { ...p, bits: p.bits.map((x, i) => (i === p.bit ? { ...x, box: { ...x.box, left: x.box.left + e.clientX - g.x, top: x.box.top + e.clientY - g.y } } : x)) } : p))
      }
      setDrift(null)
    } else if (!g.moved && g.kind === "move") setPart(null)
    else if (g.moved) {
      const dx = (e.clientX - g.x) / fw
      const nb = g.kind === "move" ? { ...g.layer.box, x: g.at?.x ?? g.layer.box.x, y: g.at?.y ?? g.layer.box.y } : { ...g.layer.box, w: Math.max(0.04, g.layer.box.w + 2 * dx) }
      updateScene(g.scene, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === g.layer.id ? { ...l, box: nb } : l)) }))
    }
    if (guides.x.length || guides.y.length) setGuides({ x: [], y: [] })
    draw()
  }
  /** Smart guides: a dragged layer snaps its centre or edges to the frame's middle and thirds and to the centres and
      edges of the other layers in its scene, within 6 px. Alt drags freely. */
  const snapped = (sid: string, layer: FlatLayer, x: number, y: number, on: boolean) => {
    if (!on) {
      if (guides.x.length || guides.y.length) setGuides({ x: [], y: [] })
      return { x, y }
    }
    const s = comp.scenes.find((q) => q.id === sid)
    const aspect = fw / Math.max(1, fh)
    const half = (l: FlatLayer) => ({ w: l.box.w / 2, h: "aspect" in l && l.aspect ? (l.box.w * aspect) / l.aspect / 2 : 0 })
    const me = half(layer)
    const xs = [0.5, 1 / 3, 2 / 3]
    const ys = [0.5, 1 / 3, 2 / 3]
    for (const o of s?.layers ?? []) {
      if (o.kind === "device" || o.kind === "breakdown" || o.id === layer.id || o.hidden) continue
      const h = half(o)
      xs.push(o.box.x, o.box.x - h.w, o.box.x + h.w)
      if (h.h) ys.push(o.box.y, o.box.y - h.h, o.box.y + h.h)
      else ys.push(o.box.y)
    }
    const near = (v: number, list: number[], offs: number[], px: number) => {
      let best: { v: number; line: number } | null = null
      for (const off of offs)
        for (const c of list) {
          const d = Math.abs(v + off - c) * px
          if (d < 6 && (!best || d < Math.abs(v - best.v) * px)) best = { v: c - off, line: c }
        }
      return best
    }
    const bx = near(x, xs, [0, -me.w, me.w], fw)
    const by = near(y, ys, me.h ? [0, -me.h, me.h] : [0], fh)
    const next = { x: bx ? [bx.line] : [], y: by ? [by.line] : [] }
    if (next.x.join() !== guides.x.join() || next.y.join() !== guides.y.join()) setGuides(next)
    return { x: bx ? bx.v : x, y: by ? by.v : y }
  }
  /** a layer's edit from the lanes */
  const updateLayer = (sid: string, lid: string, patch: Partial<MovingLayer>) => updateScene(sid, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === lid ? ({ ...l, ...patch } as typeof l) : l)) }))
  const laneScene = comp.scenes[lanesIndex]

  /* ---------- the timeline ---------- */
  const scrub = useRef<{ x: number; moved: boolean } | null>(null)
  const track = useRef<HTMLDivElement>(null)
  const tAt = (x: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.max(0, Math.min(len - 0.001, ((x - r.left) / r.width) * len))
  }
  const frameStyle = { left: (box.w - fw) / 2, top: PAD + (box.h - PAD - FOOT - fh) / 2, width: fw, height: fh }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {comp.music && <audio ref={song} src={comp.music.url} preload="auto" />}
      <div
        ref={area}
        className="relative min-h-0 flex-1 overflow-hidden"
        // a background swatch or a device dragged in from the inspector, or a piece of the kit
        onDragOver={(e) => {
          if (["text/x-fill", "text/x-device", "text/x-kit"].some((t) => e.dataTransfer.types.includes(t))) e.preventDefault()
          // a file over a film: the screen it would go into is outlined
          else if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault()
            const f = filmUnder(e.clientX, e.clientY)
            if (f) ask(f.scene, f.layer, e.clientX, e.clientY, true)
          }
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(null)}
        onDrop={(e) => {
          const files = [...e.dataTransfer.files]
          const film = files.length ? filmUnder(e.clientX, e.clientY) : null
          if (film) {
            e.preventDefault()
            setHover(null)
            if (live.current.playing) setPlaying(false)
            setCue(false)
            // the screen under the drop, asked of the film: a picture or video goes in as it is, code through the importer
            return ask(film.scene, film.layer, e.clientX, e.clientY, false, (p) => {
              const l = comp.scenes.find((s) => s.id === p?.scene)?.layers.find((x) => x.id === p?.layer)
              const screen = p && isFilm(l) ? p.keys.find((k) => byId(l.anim)?.schema[k]?.type === "screen") : undefined
              if (!p || !screen) return
              setPart(p)
              setDropped({ part: p, key: screen, files })
            })
          }
          const fill = e.dataTransfer.getData("text/x-fill")
          const d = e.dataTransfer.getData("text/x-device") as DeviceId
          const kit = e.dataTransfer.getData("text/x-kit")
          const s = current()
          if (kit && onKit) {
            e.preventDefault()
            const r = area.current!.getBoundingClientRect()
            const x = (e.clientX - r.left - frameStyle.left) / fw
            const y = (e.clientY - r.top - frameStyle.top) / fh
            onKit(JSON.parse(kit) as KitItem, { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) })
          } else if (fill) setComp((c) => ({ ...c, fill }))
          else if (d && s) updateScene(s.id, (x) => addDevice(x, d) ?? x)
        }}
      >
        <div className="isolate absolute overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--line),var(--sh-md)]" style={{ ...frameStyle, background: comp.fill === "transparent" ? CHECKER : undefined }}>
          {fw > 0 && <CompositionView ref={view} comp={comp} resolve={resolve} onSize={onSize} />}
        </div>
        {/* over the live screens too: on the stage the pointer edits the shot, it doesn't use the app */}
        <div
          ref={shield}
          aria-hidden
          title={fine && !hover ? "Click a part of a film to edit it · drag to turn · Alt-drag to tilt and roll · drag a layer to move it · scroll to zoom · double-click to reset" : undefined}
          className={`absolute touch-none ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
          style={frameStyle}
          onPointerDown={(e) => begin(e, false)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => {
            e.preventDefault()
            const s = current()
            const a = area.current!.getBoundingClientRect()
            setMenu({ x: e.clientX - a.left, y: e.clientY - a.top })
            if (!s) return
            if (live.current.playing) setPlaying(false)
            setCue(false)
            const f = filmUnder(e.clientX, e.clientY)
            if (f) {
              setSel({ scene: s.id, layer: f.layer })
              ask(f.scene, f.layer, e.clientX, e.clientY, false)
              return
            }
            const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.layer && n.closest<HTMLElement>("[data-scene]")?.dataset.scene === s.id)
            const l = hit ? s.layers.find((x) => x.id === hit.dataset.layer) : undefined
            setPart(null)
            setSel(l && l.kind !== "device" ? { scene: s.id, layer: l.id } : { scene: s.id })
          }}
          onPointerLeave={() => {
            setHover(null)
            pointer.current = null
            if (!live.current.playing) draw()
          }}
          onWheel={(e) => {
            const s = current()
            if (!s) return
            const k = Math.exp(-e.deltaY * 0.0012)
            // no devices, or Shift/Alt: the wheel zooms the flat camera
            const flat = e.shiftKey || e.altKey || !devicesOf(s).length
            updateScene(s.id, (x) => commit(x, { yaw: 0, elev: 0, zoom: flat ? 1 : k, vz: flat ? k : 1, end: atEnd(x) }))
            learned()
          }}
          onDoubleClick={() => {
            const s = current()
            if (!s || selRef.current.layer) return
            const end = atEnd(s)
            const reset = { ...(end ? (s.camera2 ?? s.camera) : s.camera), yaw: 0, elev: 0, zoom: 1 }
            updateScene(s.id, (x) => ({ ...x, ...(end ? { camera2: reset, view2: undefined } : { camera: reset, view: undefined }) }))
          }}
        />
        <div ref={outline} className="pointer-events-none absolute hidden rounded-[3px] shadow-[0_0_0_1.5px_var(--sel)]">
          <span
            data-sizer="1"
            aria-hidden
            className="pointer-events-auto absolute -bottom-[7px] -right-[7px] h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-full bg-surface shadow-[0_0_0_1.5px_var(--sel)]"
            onPointerDown={(e) => begin(e, true)}
          />
        </div>
        {hover && !(part && part.keys.join() === hover.keys.join() && part.bits[0]?.k === hover.bits[0]?.k) && (
          <div aria-hidden className="pointer-events-none absolute z-10 rounded-[4px] shadow-[0_0_0_1px_var(--sel)]" style={hover.keys.length ? hover.box : hover.bits[0]?.box}>
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-sel px-1.5 py-0.5 text-micro font-medium text-white">{hover.keys.length ? partName(comp, hover) : hover.bits[0]?.name}</span>
          </div>
        )}
        {part && (
          <div aria-hidden className="pointer-events-none absolute z-10 rounded-[4px] shadow-[0_0_0_2px_var(--sel)]" style={{ ...(part.bits[part.bit]?.box ?? part.box), transform: drift ? `translate(${drift.x}px, ${drift.y}px)` : undefined }} />
        )}
        {part && !drift && <PartTools part={part} comp={comp} setComp={setComp} setBit={(bit) => setPart({ ...part, bit })} area={box} dropped={dropped?.part === part ? dropped : null} refresh={() => repick(part)} />}
        {part && part.keys.length > 0 && !drift && <OnFilm key={`${part.layer}:${part.keys.join()}:${part.click.x},${part.click.y}`} part={part} comp={comp} setComp={setComp} close={() => setPart(null)} area={box} />}
        {menu && (
          <StageMenu
            at={menu}
            area={box}
            close={() => setMenu(null)}
            ops={ops}
            what={sel.layer ? "layer" : "scene"}
            part={pickedPart() ? { name: pickedPart()!.b.name, hidden: !!pickedPart()!.look.hide, changed: Object.keys(pickedPart()!.look).length > 0 } : null}
            style={{ copy: copyStyle, paste: () => pasteStyle(), can: !!styleClip, hide: toggleHide, back: putBack }}
          />
        )}
        {cue && !playing && fw > 0 && (
          <button
            type="button"
            aria-label="Play"
            onClick={() => setPlaying(true)}
            className="press fade-in absolute z-20 flex h-10 items-center gap-2 rounded-full bg-overlay pl-3.5 pr-4 text-ui font-medium text-fg shadow-[var(--sh-lg)] backdrop-blur-md"
            style={{ left: frameStyle.left + 12, top: frameStyle.top + fh - 52 }}
          >
            <Play size={16} weight="fill" aria-hidden />
            Play
            <kbd className="rounded bg-surface-2 px-1.5 text-micro text-fg-3">Space</kbd>
          </button>
        )}
        {guides.x.map((g) => (
          <span key={`gx${g}`} aria-hidden className="pointer-events-none absolute z-20 w-px bg-[#ff3d7f]" style={{ left: frameStyle.left + g * fw, top: frameStyle.top, height: fh }} />
        ))}
        {guides.y.map((g) => (
          <span key={`gy${g}`} aria-hidden className="pointer-events-none absolute z-20 h-px bg-[#ff3d7f]" style={{ top: frameStyle.top + g * fh, left: frameStyle.left, width: fw }} />
        ))}
        {onAdd && (
          // the canvas toolbar, Raylight's: what goes into the scene, one click away
          <div role="toolbar" aria-label="Add to the scene" className="absolute inset-x-0 bottom-2 z-20 flex justify-center px-3">
            <div className="dock">
              {(
                [
                  ["text", "Title", TextT, "text"],
                  ["rect", "Rectangle", Square, "shape"],
                  ["ellipse", "Ellipse", Circle, "shape"],
                  ["image", "Picture", ImageIcon, "image"],
                  ["component", "Component", SquaresFour, "component"],
                  ["cursor", "Cursor", CursorIcon, "cursor"],
                ] as const
              ).map(([kind, label, I, k]) => (
                <IconButton key={kind} label={`Add a ${label.toLowerCase()}`} tipSide="top" onClick={() => onAdd(kind)}>
                  <I size={16} />
                </IconButton>
              ))}
              <IconButton label="Add a device" tipSide="top" popover="stage-add-device">
                <DeviceMobile size={16} />
              </IconButton>
              <Popover id="stage-add-device" side="top" align="center" label="Add a device">
                <div className="w-[220px] p-1.5">
                  {DEVICES.map((d) => (
                    <MenuItem
                      key={d.id}
                      onSelect={() => {
                        onAdd("device", d.id)
                        closePopover(document.getElementById("stage-add-device"))
                      }}
                    >
                      {d.name}
                    </MenuItem>
                  ))}
                </div>
              </Popover>
            </div>
          </div>
        )}
        {hint && !hintGone && fw > 0 && comp.scenes.find((s) => s.id === sel.scene)?.layers.some((l) => l.kind === "device") && (
          <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-6" style={{ top: frameStyle.top + 12 }}>
            <p className="fade-in rounded-full bg-overlay px-3 py-1.5 text-caption text-fg-2 shadow-md">{fine ? "Drag to turn it · Alt-drag to tilt and roll · scroll to zoom" : "Drag to turn it · pinch to zoom"}</p>
          </div>
        )}
      </div>

      {/* the timeline (and the layers' lanes under it) on its own card, floating on the ground */}
      <div className={compact ? "" : "shrink-0 overflow-hidden bg-panel"}>
      <div role="group" aria-label="Timeline" className={`flex shrink-0 items-center gap-2 px-2 ${compact ? "h-14 bg-panel" : "h-[60px]"}`}>
        <IconButton label={playing ? "Pause" : "Play"} tipSide="top" tipAlign="start" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <span ref={clock} className="hidden w-[84px] shrink-0 text-caption tabular-nums text-fg-3 sm:block" />
        <div
          ref={track}
          className="relative flex h-10 min-w-0 flex-1 cursor-pointer touch-none select-none gap-1"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            scrub.current = { x: e.clientX, moved: false }
          }}
          onPointerMove={(e) => {
            const s = scrub.current
            if (!s || (!s.moved && Math.abs(e.clientX - s.x) < 4)) return
            s.moved = true
            if (playing) setPlaying(false)
            seek(tAt(e.clientX))
          }}
          onPointerUp={(e) => {
            const s = scrub.current
            scrub.current = null
            if (!s || s.moved) return
            // a click picks the scene under it and shows that moment
            const t = tAt(e.clientX)
            setSel({ scene: comp.scenes[at(comp, t).i].id })
            seek(t)
          }}
        >
          {comp.scenes.map((s, i) => {
            const on = sel.scene === s.id
            return (
              <div
                key={s.id}
                // a shot on the timeline, Raylight's way: a tinted track in the scenes' azure, firmer when picked
                className={`relative flex min-w-0 flex-col justify-center rounded-md px-2 ${on ? "k-track-on" : "k-track"}`}
                style={{ ...kStyle("scene"), flexGrow: s.duration, flexBasis: 0 }}
              >
                <span className={`truncate text-caption font-medium ${on ? "text-fg" : "text-fg-2"}`}>
                  <span className="tabular-nums text-k-scene">{i + 1}</span> {s.name}
                </span>
                <span className="truncate text-micro tabular-nums text-fg-3">
                  {s.duration.toFixed(1)}s{i > 0 && s.transition !== "cut" ? ` · ${s.transition}` : ""}
                </span>
              </div>
            )
          })}
          <div ref={head} aria-hidden className="pointer-events-none absolute -bottom-1 -top-1 left-0 w-[2px] -translate-x-1/2 rounded-full bg-sel" />
        </div>
        {onMatch && (
          <IconButton label="Match a video's timing" tipSide="top" tipAlign="end" onClick={onMatch}>
            <Timer size={16} />
          </IconButton>
        )}
        {!compact && (
          <IconButton label={lanesOpen ? "Hide the layers' lanes" : "Show the layers' lanes"} expanded={lanesOpen} tipSide="top" tipAlign="end" onClick={() => setLanesOpen(!lanesOpen)}>
            {lanesOpen ? <CaretDown size={16} /> : <CaretUp size={16} />}
          </IconButton>
        )}
        {onIdeas && (
          <IconButton label="New scenes: ideas that continue the film" tipSide="top" tipAlign="end" onClick={onIdeas}>
            <Lightbulb size={16} />
          </IconButton>
        )}
        <IconButton label="Add a scene" tipSide="top" tipAlign="end" onClick={onAddScene}>
          <Plus size={16} />
        </IconButton>
      </div>
      {lanesOpen && !compact && laneScene && (
        <Lanes
          scene={laneScene}
          start={starts(comp)[lanesIndex]}
          sel={sel.scene === laneScene.id ? sel.layer : undefined}
          setSel={(layer) => setSel({ scene: laneScene.id, layer })}
          update={(lid, patch) => updateLayer(laneScene.id, lid, patch)}
          seek={(t) => {
            if (playing) setPlaying(false)
            seek(t)
          }}
          headRef={(el) => {
            lanesHead.current = el
            draw()
          }}
        />
      )}
      </div>
    </div>
  )
}

/** The words of a part of a film, typed over themselves (each on its word; words found in a drawing that holds many, where
    it was clicked). A film cut into scenes changes in every scene of it. */
function OnFilm({ part, comp, setComp, close, area }: { part: Part; comp: Comp; setComp: (fn: (c: Comp) => Comp) => void; close: () => void; area: { w: number; h: number } }) {
  const l = comp.scenes.find((s) => s.id === part.scene)?.layers.find((x) => x.id === part.layer)
  const a = l?.kind === "component" ? byId(l.anim) : undefined
  if (!l || l.kind !== "component" || !a) return null
  const values = withDefaults(a, l.values)
  const set = (k: string, v: Value) => setComp((c) => setParam(c, part, k, v))
  const H = 44
  let next = part.click.y + 16
  const fields = part.keys
    .filter((k) => a.schema[k]?.type === "text")
    .map((k) => {
      const b = part.at[k]?.box ?? part.box
      const own = b.height < 180 && b.width < area.w * 0.9
      const width = Math.min(560, Math.max(240, own ? b.width + 24 : 300))
      const h = own ? Math.round(Math.min(64, Math.max(H, b.height * 0.7))) : H
      const top = own ? b.top + b.height / 2 - h / 2 : next
      if (!own) next += h + 6
      const left = own ? b.left + b.width / 2 - width / 2 : part.click.x - width / 2
      return { k, h, width, top: Math.min(Math.max(8, top), area.h - h - 8), left: Math.min(Math.max(8, left), area.w - width - 8) }
    })
  return (
    <>
      {fields.map((f, i) => (
        <WordOn key={f.k} label={a.schema[f.k].label} value={String(values[f.k] ?? "")} piece={part.at[f.k]?.piece} first={i === 0} set={(v) => set(f.k, v)} done={close} style={{ left: f.left, top: f.top, width: f.width, height: f.h, fontSize: Math.round(f.h * 0.42) }} />
      ))}
    </>
  )
}

/** a param of the film a part belongs to, set in every scene of it */
const setParam = (c: Comp, part: Part, k: string, v: Value) => {
  const cur = c.scenes.find((s) => s.id === part.scene)?.layers.find((x) => x.id === part.layer)
  return cur?.kind === "component" ? withValues(c, cur, { ...cur.values, [k]: v }) : c
}

/** A word of the film, typed over itself. A list param (pieces split by |) edits the piece that was clicked. It writes as
    you pause, Enter keeps it, Escape puts back what was there. */
function WordOn({ label, value, piece, first, set, done, style }: { label: string; value: string; piece?: number; first: boolean; set: (v: string) => void; done: () => void; style: CSSProperties }) {
  const was = useRef(value)
  const pieces = was.current.split("|")
  const one = piece !== undefined && pieces.length > 1
  const start = one ? pieces[piece] : was.current
  const [text, setText] = useState(start)
  const wait = useRef(0)
  const write = (t: string) => {
    clearTimeout(wait.current)
    set(one ? pieces.map((x, i) => (i === piece ? t : x)).join("|") : t)
  }
  // the first field takes the keys with the word picked, so typing replaces it
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (first) input.current?.select()
    return () => clearTimeout(wait.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="pop-in absolute z-30 block" style={style}>
      <span className="absolute -top-5 left-1 whitespace-nowrap text-micro font-medium text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
        {label}
        {one ? ` · ${piece + 1} of ${pieces.length}` : ""}
      </span>
      <input
        ref={input}
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          clearTimeout(wait.current)
          wait.current = window.setTimeout(() => write(t), 300)
        }}
        onBlur={() => text !== start && write(text)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") {
            write(text)
            done()
          } else if (e.key === "Escape") {
            clearTimeout(wait.current)
            set(was.current)
            done()
          }
        }}
        className="h-full w-full rounded-xl bg-overlay/90 px-3 font-medium text-fg shadow-[0_0_0_2px_var(--sel),var(--sh-md)] outline-none backdrop-blur-md"
        style={{ fontSize: style.fontSize }}
      />
    </label>
  )
}

/** what a screen shows now, in a word */
const showing = (v: string) => (!v ? "the film's own" : v.startsWith("image:") ? "your picture" : v.startsWith("video:") ? "your video" : v.startsWith("anim:") ? (byId(v.slice(5))?.name ?? "your code") : v)

/** What a screen of the film shows, chosen: a picture or video, a code file, a library animation, or the film's own.
    A file dropped on the screen goes straight in. */
function ScreenChoices({ label, value, set, dropped, busy, setBusy }: { label: string; value: string; set: (v: string) => void; dropped: File[] | null; busy: string; setBusy: (s: string) => void }) {
  const pic = useRef<HTMLInputElement>(null)
  const code = useRef<HTMLInputElement>(null)
  const run = async (job: () => Promise<string>, doing: string) => {
    setBusy(doing)
    try {
      set(await job())
      setBusy("")
    } catch (e) {
      setBusy((e as Error).message)
    }
  }
  const take = (files: File[]) => {
    const media = files.find((f) => MEDIA.test(f.type))
    if (media) return run(() => uploadMedia(media), "Putting it in…")
    const src = files.filter((f) => CODE.test(f.name))
    if (src.length) return run(() => importCode(src), "Reading the code…")
    setBusy("A picture, a video or code (.tsx, .jsx, .js, .html)")
  }
  useEffect(() => {
    if (dropped) take(dropped)
  }, [dropped]) // eslint-disable-line react-hooks/exhaustive-deps
  const tile = "press flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-micro font-medium text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40"
  return (
    <div className="w-[300px] p-2">
      <p className="truncate px-1.5 pb-1.5 text-caption" aria-live="polite">
        <span className="font-medium text-fg">{label}</span> <span className="text-fg-3">· {busy || showing(value)}</span>
      </p>
      <div className="grid grid-cols-3 gap-1">
        <button type="button" className={tile} onClick={() => pic.current?.click()}>
          <ImageIcon size={18} aria-hidden />
          Picture, video
        </button>
        <button type="button" className={tile} onClick={() => code.current?.click()}>
          <FileCode size={18} aria-hidden />
          Code file
        </button>
        <button type="button" className={tile} disabled={!value} onClick={() => set("")}>
          <ArrowCounterClockwise size={18} aria-hidden />
          Film's own
        </button>
      </div>
      <p className="px-1.5 pb-1 pt-2.5 text-micro text-fg-3">Or one of your animations</p>
      <div className="scroll-thin max-h-[200px] overflow-y-auto">
        {CATEGORIES.filter((c) => c !== "Launch films").map((c) => {
          const list = ANIMS.filter((x) => x.category === c && (x.load || x.html))
          return list.length ? (
            <div key={c}>
              <p className="px-2 pb-0.5 pt-1.5 text-micro text-fg-3">{c}</p>
              {list.map((x) => (
                <MenuItem key={x.id} onSelect={() => set(`anim:${x.id}`)}>
                  {x.name}
                </MenuItem>
              ))}
            </div>
          ) : null
        })}
      </div>
      <p className="px-1.5 pt-2 text-micro text-fg-3">Or drop a file on the screen.</p>
      <input ref={pic} type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files?.[0] && take([e.target.files[0]])} />
      <input ref={code} type="file" accept=".tsx,.jsx,.ts,.js,.mjs,.css,.html,.htm,.json,.svg" multiple hidden onChange={(e) => e.target.files?.length && take([...e.target.files])} />
    </div>
  )
}

/** Any part of a film, picked: its tools on the film, over it. Its colour and fill, its size, its turn, hidden or not,
    a picture swapped; drag it on the film to move it; the part that holds it, a click away. A change goes to every copy
    one line of the film made (the tags in a row), in every scene of the film. */
function PartTools({ part, comp, setComp, setBit, area, dropped, refresh }: { part: Part; comp: Comp; setComp: (fn: (c: Comp) => Comp) => void; setBit: (i: number) => void; area: { w: number; h: number }; dropped: { key: string; files: File[] } | null; refresh: () => void }) {
  const b: Bit = part.bits[part.bit] ?? { k: "", name: "", kind: "box", count: 0, box: part.box, unit: 1, color: "", fill: "" }
  const l = comp.scenes.find((s) => s.id === part.scene)?.layers.find((x) => x.id === part.layer)
  const pic = useRef<HTMLInputElement>(null)
  const wait = useRef(0)
  const [busy, setBusy] = useState("")
  if (l?.kind !== "component") return null
  const a = byId(l.anim)
  const values = a ? withDefaults(a, l.values) : {}
  // the screens of the film this part is on (a click inside the app window is on the "Home screen")
  const screens = a ? part.keys.filter((k) => a.schema[k]?.type === "screen") : []
  const look = looksOf(l)[b.k] ?? {}
  const put = (patch: Partial<Look> | null) => setComp((c) => withLook(c, part.scene, part.layer, b.k, patch))
  // colours as they're dragged through: kept a moment after the last
  const soon = (patch: Partial<Look>) => {
    clearTimeout(wait.current)
    wait.current = window.setTimeout(() => put(patch), 120)
  }
  const scale = look.scale ?? 1
  const W = 440 + screens.length * 140
  const above = b.box.top - 52
  const top = above >= 8 ? above : Math.min(area.h - 52, b.box.top + b.box.height + 8)
  const btn = "press grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-caption font-medium text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40"
  const swatch = (label: string, value: string, set: (v: string) => void) => (
    <label title={label} className="press relative grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2">
      <span className="h-4.5 w-4.5 rounded-full shadow-[0_0_0_1px_var(--line-strong)]" style={{ background: value || "transparent", width: 18, height: 18 }} />
      <input type="color" aria-label={label} value={value || "#000000"} onChange={(e) => set(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  )
  return (
    <div
      role="toolbar"
      aria-label={`${b.name}: change it`}
      className="pop-in absolute z-30 flex items-center gap-0.5 rounded-xl bg-overlay p-1 shadow-[0_0_0_1px_var(--line),var(--sh-lg)]"
      style={{ left: Math.min(Math.max(8, b.box.left), area.w - W - 8), top }}
      title="Drag it on the film to move it"
    >
      {screens.map((k) => (
        <span key={k} className="contents">
          <button type="button" popoverTarget={`scr-${l.id}-${k}`} className="press flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-caption font-medium text-fg hover:bg-surface-3" title="What this screen shows">
            <SquaresFour size={14} aria-hidden />
            {busy || a!.schema[k].label}
            <CaretDown size={11} aria-hidden className="text-fg-3" />
          </button>
          <Popover id={`scr-${l.id}-${k}`} side="bottom" align="start" label={`${a!.schema[k].label}: what it shows`}>
            <ScreenChoices label={a!.schema[k].label} value={String(values[k] ?? "")} set={(v) => setComp((c) => setParam(c, part, k, v))} dropped={dropped?.key === k ? dropped.files : null} busy={busy} setBusy={setBusy} />
          </Popover>
        </span>
      ))}
      {b.k && (
        <>
      <span className="max-w-[120px] truncate px-2 text-caption font-medium text-fg">{b.name}</span>
      {b.count > 1 && <span className="pr-1 text-micro text-fg-3" title={`The film draws ${b.count} like it; they change together`}>×{b.count}</span>}
      {part.bit + 1 < part.bits.length && (
        <button type="button" className={btn} title="Pick what holds it" onClick={() => setBit(part.bit + 1)}>
          <ArrowUp size={15} aria-hidden />
        </button>
      )}
      {part.bit > 0 && (
        <button type="button" className={btn} title="Back to the smaller part" onClick={() => setBit(part.bit - 1)}>
          <ArrowDown size={15} aria-hidden />
        </button>
      )}
      <span className="mx-0.5 h-5 w-px bg-[var(--line)]" />
      {swatch("Colour", look.color ?? b.color, (v) => soon({ color: v }))}
      {b.kind !== "text" && swatch("Fill", look.fill ?? b.fill, (v) => soon({ fill: v }))}
      <span className="mx-0.5 h-5 w-px bg-[var(--line)]" />
      <button type="button" className={btn} title="Smaller" onClick={() => (put({ scale: Math.round(scale * 0.9 * 100) / 100 }), refresh())}>
        <Minus size={14} aria-hidden />
      </button>
      <span className="w-10 text-center text-caption tabular-nums text-fg-2">{Math.round(scale * 100)}%</span>
      <button type="button" className={btn} title="Bigger" onClick={() => (put({ scale: Math.round(scale * 1.1 * 100) / 100 }), refresh())}>
        <Plus size={14} aria-hidden />
      </button>
      <button type="button" className={btn} title="Turn it" onClick={() => (put({ rotate: ((look.rotate ?? 0) + 15) % 360 }), refresh())}>
        <ArrowClockwise size={15} aria-hidden />
      </button>
      <button type="button" className={btn} title={look.hide ? "Show it" : "Hide it"} onClick={() => put({ hide: !look.hide })}>
        {look.hide ? <Eye size={15} aria-hidden /> : <EyeSlash size={15} aria-hidden />}
      </button>
      {b.kind === "picture" && (
        <button type="button" className={btn} title="Another picture" onClick={() => pic.current?.click()}>
          <ImageIcon size={15} aria-hidden />
        </button>
      )}
      {Object.keys(look).length > 0 && (
        <button type="button" className={btn} title="Put it back as the film had it" onClick={() => put(null)}>
          <ArrowCounterClockwise size={15} aria-hidden />
        </button>
      )}
        </>
      )}
      <input
        ref={pic}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) put({ src: (await uploadMedia(f)).replace(/^image:/, "") })
        }}
      />
    </div>
  )
}

/** The stage's menu (right click): what can be done to the part of a film picked, then the history, then copies of the
    layer or scene picked. Each says its key. */
function StageMenu({ at, area, close, ops, what, part, style }: { at: { x: number; y: number }; area: { w: number; h: number }; close: () => void; ops?: Ops; what: "layer" | "scene"; part: { name: string; hidden: boolean; changed: boolean } | null; style: { copy: () => void; paste: () => void; can: boolean; hide: () => void; back: () => void } }) {
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
  const item = (label: string, keys: string, run: (() => void) | undefined, Icon: typeof Copy, disabled = false) => (
    <MenuItem
      icon={Icon}
      disabled={disabled || !run}
      onSelect={() => {
        close()
        run?.()
      }}
    >
      <span className="flex w-full items-center justify-between gap-6">
        {label}
        {keys && <kbd className="font-sans text-micro text-fg-3">{keys}</kbd>}
      </span>
    </MenuItem>
  )
  // where it opened, moved up as far as it needs to stay on the stage (and scrolling if the stage is shorter)
  const el = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => setH(el.current?.offsetHeight ?? 0), [part])
  return (
    <div
      ref={el}
      data-stage-menu=""
      role="menu"
      aria-label="Edit"
      className="pop-in scroll-thin absolute z-40 w-[240px] overflow-y-auto rounded-xl bg-overlay p-1.5 shadow-[0_0_0_1px_var(--line),var(--sh-lg)]"
      style={{ left: Math.max(8, Math.min(at.x, area.w - 248)), top: Math.max(8, Math.min(at.y, area.h - h - 8)), maxHeight: area.h - 16 }}
    >
      {part && (
        <>
          <p className="truncate px-2 pb-1 pt-0.5 text-micro text-fg-3">{part.name}</p>
          {item("Copy style", `${MOD} C`, style.copy, Copy)}
          {item("Paste style", `${MOD} V`, style.paste, ClipboardText, !style.can)}
          {item(part.hidden ? "Show" : "Hide", "Del", style.hide, part.hidden ? Eye : EyeSlash)}
          {item("Put back as the film had it", "", style.back, ArrowCounterClockwise, !part.changed)}
          <div className="my-1 h-px bg-[var(--line)]" />
        </>
      )}
      {item("Undo", `${MOD} Z`, ops?.undo, ArrowArcLeft, !ops?.canUndo)}
      {item("Redo", `${MOD} ⇧ Z`, ops?.redo, ArrowArcRight, !ops?.canRedo)}
      <div className="my-1 h-px bg-[var(--line)]" />
      {item(`Copy the ${what}`, part ? "" : `${MOD} C`, ops?.copy, Copy)}
      {item(`Cut the ${what}`, part ? "" : `${MOD} X`, ops?.cut, Scissors)}
      {item("Paste", part ? "" : `${MOD} V`, ops?.paste, ClipboardText, !ops?.canPaste)}
      {item(`Duplicate the ${what}`, part ? "" : `${MOD} D`, ops?.duplicate, CopySimple)}
      {item(`Delete the ${what}`, part ? "" : "Del", ops?.remove, Trash)}
    </div>
  )
}
