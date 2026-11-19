// Studio — the inspector: whatever is picked in the layers (a scene, a device, a component, a picture, a title, or the
// background) with its settings, plus the Export popover. All plain React, no three.js: the 3D stage is in Stage.tsx.
import { Making } from "../Thinking"
import { Problem } from "../States"
import { LIBRARY, retimed } from "./library"
import { analyseSong } from "./music"
import { cutFor, snapToBeats } from "./story"
import { cutdown, reframe, type Focus } from "./formats"
import FOCUS from "./lib/focus.json"
import { serverMedia } from "./export"
import { useRef, useState, type ReactNode } from "react"
import { ArrowCounterClockwise, BookOpen, CaretRight, Plus, CursorClick, DeviceMobile, DeviceTablet, DownloadSimple, Eyedropper, FilmSlate, FilmStrip, ImageSquare, Laptop, MagicWand, Palette, Sparkle, UploadSimple, WarningCircle, X } from "@phosphor-icons/react"
import { DEVICES, type DeviceId, type Posture } from "../devices"
import { EaseEditor, ParamRow, SliderField, field, groupSchema } from "../controls"
import { byId, withDefaults } from "../registry"
import { Button, Dialog, IconButton, Popover, Segmented, Switch, closePopover, rove, type Icon, Select } from "../ui"
import {
  EFFECTS,
  ENTERS,
  LIGHTS,
  SHOTS,
  TEXT_ENTERS,
  TRANSITIONS,
  type Transition,
  device as newDevice,
  devicesOf,
  total,
  VIEW,
  moving,
  type MovingLayer,
  type Box,
  type Comp,
  withValues,
  type ComponentLayer,
  type Brand,
  type CalloutLayer,
  type DeviceLayer,
  type Enter,
  type BreakdownLayer,
  type SceneLook,
  type Shot,
  type TextEnter,
  type ImageLayer,
  type Layer,
  type Scene,
  type Slot,
  type TextLayer,
} from "./comp"
import { BACKDROPS, SIZES } from "./config"
import { brandFrom, contrast } from "./brand"
import type { Copy } from "./copy"
import { direct, features, forget, learn, learnedCount } from "./director"
import type { ExportKind, ExportState } from "./export"
import { FINISHES } from "./finishes"
import { applyLookComp, useScreenAccents } from "./looks"
import { CaseSwatches, LookPicker } from "../LookPicker"
import { HARMONIES, type Look } from "../theme"
import { BG, Hint, kStyle, kindOf, layerIcon, layerName } from "./Layers"
import { fillCss, isDark } from "./look"
import { PaintStack } from "./PaintEditor"
import { GradientMaker } from "./GradientMaker"
import { FilmReview } from "./Review"
import { groundOfStack } from "./gradients"
import { AnimateSection, CursorPanel, DesignSection, ShapePanel } from "./Motion"
import { newPaint } from "./paint"
import { FxFields, anyFx } from "./fx"
import { ANGLES, MOTIONS, angle, type AngleId, type MotionId } from "./poses"
import type { Sel } from "./Stage"

/** Transparent, shown the way image editors show it. */
const CHECKER = "repeating-conic-gradient(#e4e4e8 0% 25%, #f6f6f8 0% 50%) 50% / 16px 16px"

const DEVICE_TILES: { id: DeviceId; label: string; icon: Icon }[] = [
  { id: "iphone", label: "iPhone", icon: DeviceMobile },
  { id: "duo", label: "Duo", icon: BookOpen },
  { id: "ipad", label: "iPad", icon: DeviceTablet },
  { id: "macbook", label: "MacBook", icon: Laptop },
]
// a choice among several: a soft chip in a recessed well, the picked one lit and raised (the pills' and switches' look)
// a tile that can be picked (a device in its place, a device kind): the picked one on a soft fill, the rest bare words
const ring = (on: boolean) => (on ? "bg-selected text-fg" : "text-fg-3 hover:bg-hover hover:text-fg")
const swatch = (on: boolean) => (on ? "outline-[1.5px] outline-offset-2 outline-fg outline" : "hover:scale-[1.06]")
const POSTURES: { value: Posture; label: string }[] = [
  { value: "folded", label: "Folded" },
  { value: "half", label: "Half open" },
  { value: "open", label: "Open" },
]
const SLOTS: { value: Slot; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Middle" },
  { value: "right", label: "Right" },
]
/** a component's shape, width over height */
const SHAPES: { value: string; label: string; aspect: number }[] = [
  { value: "square", label: "Square", aspect: 1 },
  { value: "wide", label: "4:3", aspect: 4 / 3 },
  { value: "tall", label: "3:4", aspect: 3 / 4 },
  { value: "phone", label: "Phone", aspect: 402 / 874 },
]

// which sections are open, by title, remembered: one closed stays closed, everywhere it shows
const FOLDS = "anim-engine:folds"
const folds: Record<string, boolean> = (() => {
  try {
    return JSON.parse(localStorage.getItem(FOLDS) ?? "{}")
  } catch {
    return {}
  }
})()

/** A titled group of settings that folds. `fold`: closed until it's opened (what fewer people need); the title opens
    and closes it, and it's remembered. */
export function Section({ title, aside, children, fold = false }: { title: string; aside?: ReactNode; children: ReactNode; fold?: boolean }) {
  const [open, setOpen] = useState(() => folds[title] ?? !fold)
  const toggle = () => {
    folds[title] = !open
    setOpen(!open)
    try {
      localStorage.setItem(FOLDS, JSON.stringify(folds))
    } catch {
      // private window: it just isn't remembered
    }
  }
  return (
    <section aria-label={title} className="insp-section break-inside-avoid px-4 [.cols_&]:shadow-none">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} onClick={toggle} className="press group -ml-1 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[12.5px] font-semibold text-fg-2 transition-colors duration-150 hover:text-fg">
            <span className="truncate">{title}</span>
            <CaretRight size={10} weight="bold" aria-hidden className={`shrink-0 text-fg-3 opacity-0 transition-[transform,opacity] duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none ${open ? "rotate-90" : "opacity-100"}`} />
          </button>
        </h3>
        {aside && <span className="flex shrink-0 items-center text-caption text-fg-3">{aside}</span>}
      </div>
      {open && <div className="rise-in space-y-1.5 pb-5">{children}</div>}
    </section>
  )
}

/** More of a section, behind one line: the fine-tuning most people never need. */
export function More({ label, children, open: start = false }: { label: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <div className="mt-2.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="press flex items-center gap-1.5 rounded text-caption font-medium text-fg-3 hover:text-fg">
        <CaretRight size={10} weight="bold" aria-hidden className={`transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`} />
        {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

/** A grid of named choices: angles, moves, transitions. With `show`, the first few (and the one picked), and the rest
    behind "N more". */
export function Choices<T extends string>({ label, value, options, set, cols = 4, show }: { label: string; value: T; options: { id: T; name: string; hint?: string }[]; set: (v: T) => void; cols?: number; show?: number }) {
  const [all, setAll] = useState(false)
  const at = options.findIndex((o) => o.id === value)
  const few = show && !all && options.length > show + 1 ? [...options.slice(0, show), ...(at >= show ? [options[at]] : [])] : null
  const list = few ?? options
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) =>
        rove(
          e,
          options.map((o) => o.id),
          value,
          set,
          "radio",
        )
      }
      className="choices"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {list.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          title={o.hint}
          onClick={() => set(o.id)}
          className="press choice pointer-coarse:h-10"
        >
          <span className="truncate">{o.name}</span>
        </button>
      ))}
      {show && options.length > show + 1 && (
        <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className="press choice choice-more pointer-coarse:h-10">
          {all ? "Fewer" : `${options.length - list.length} more`}
        </button>
      )}
    </div>
  )
}

export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <label htmlFor={htmlFor} className="min-w-24 max-w-[58%] shrink-0 truncate text-body text-fg-3">
        {label}
      </label>
      <span className="flex min-w-0 flex-1 items-center justify-end">{children}</span>
    </div>
  )
}

const Stack = ({ children }: { children: ReactNode }) => <div className="space-y-1.5">{children}</div>

/** The browser's eyedropper (Chrome, Edge): pick a colour from anywhere on the screen. */
const canPick = typeof window !== "undefined" && "EyeDropper" in window
async function pickColour() {
  try {
    const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open()
    return r.sRGBHex
  } catch {
    return null
  }
}

function ColourRow({ label, value, auto, set }: { label: string; value: string; auto: string; set: (v: string) => void }) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-1">
        {value && (
          <button type="button" onClick={() => set("")} className="press rounded px-1.5 text-caption text-fg-3 hover:text-fg">
            Auto
          </button>
        )}
        {canPick && (
          <button type="button" title="Pick a colour from the screen" aria-label="Pick a colour from the screen" onClick={() => pickColour().then((c) => c && set(c))} className="press grid h-7 w-7 place-items-center rounded-md text-fg-2 hover:bg-surface-2 hover:text-fg">
            <Eyedropper size={15} />
          </button>
        )}
        <label className="press relative h-7 w-7 cursor-pointer overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg" style={{ background: value || auto }}>
          <span className="sr-only">{label}: pick a colour</span>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{6}$/i.test(auto) ? auto : "#000000"} onChange={(e) => set(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </span>
    </Row>
  )
}

function Placement({ box, set, sizeLabel = "Size" }: { box: Box; set: (b: Box) => void; sizeLabel?: string }) {
  return (
    <Stack>
      <SliderField id="pl-w" label={sizeLabel} unit="%" min={4} max={100} step={1} value={Math.round(box.w * 100)} set={(v) => set({ ...box, w: v / 100 })} />
      <SliderField id="pl-x" label="Across" unit="%" min={0} max={100} step={1} value={Math.round(box.x * 100)} set={(v) => set({ ...box, x: v / 100 })} />
      <SliderField id="pl-y" label="Down" unit="%" min={0} max={100} step={1} value={Math.round(box.y * 100)} set={(v) => set({ ...box, y: v / 100 })} />
    </Stack>
  )
}

/* ---------------- the inspector ---------------- */

export type InspectorCtx = {
  comp: Comp
  setComp: (fn: (c: Comp) => Comp) => void
  sel: Sel
  setSel: (s: Sel) => void
  /** what "the live screen" is right now, for its label, and its id */
  liveName: string
  liveAnim: string
  pickAnim: (title: string, then: (id: string) => void) => void
  pickImage: (then: (src: string, file: string, aspect: number) => void) => void
  /** lines the copy writer wrote for what's open, and how to ask it */
  copy: Copy | null
  writing: boolean
  writeCopy: () => void
  openBrand: () => void
  cols?: boolean
  /** on a "two framings" scene, which framing the stage sets */
  framing: "start" | "end"
  setFraming: (f: "start" | "end") => void
  /** a big change (a look over the whole film) offers its Undo, as a template does */
  offerUndo?: (label: string, before: Comp) => void
  /** the cut into scene `i` rendered with each of these transitions (small, around the cut): the videos' addresses */
  previewCuts?: (i: number, ts: Transition[]) => Promise<string[]>
}

/** The transition designer: the cut into a scene rendered three ways, side by side, to pick from by eye. The three: the
    one it has, the one the shots' moves call for, and one that's different from both. */
function TryCuts({ x, scene, i }: { x: InspectorCtx; scene: Scene; i: number }) {
  const [clips, setClips] = useState<{ t: Transition; url: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (!x.previewCuts) return null
  const shotOf = (sc: Scene | undefined) => {
    const l = sc?.layers.find((y) => y.kind === "component" && y.from !== undefined)
    return l && l.kind === "component" ? LIBRARY.find((s) => s.film === l.anim && Math.abs(s.at - (l.from ?? 0)) < 0.05) : undefined
  }
  const a = shotOf(x.comp.scenes[i - 1])
  const b = shotOf(scene)
  const called = a && b ? (cutFor(a.exit, b.enter) as Transition) : "whip"
  const options = [...new Set([scene.transition, called, ...(["whip", "zoom", "dissolve", "push", "flash", "cut"] as Transition[])])].slice(0, 3) as Transition[]
  const run = async () => {
    setBusy(true)
    setError("")
    try {
      const urls = await x.previewCuts!(i, options)
      setClips(options.map((t, j) => ({ t, url: urls[j] })))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-2">
      <Button size="sm" className="w-full" disabled={busy} onClick={() => void run()}>
        {busy ? "Rendering three cuts…" : "Try three cuts, side by side"}
      </Button>
      {error && <p role="alert" className="mt-1 text-caption text-fg-2">{error}</p>}
      {clips && (
        <ul className="mt-2 grid grid-cols-3 gap-1.5">
          {clips.map((c) => (
            <li key={c.t}>
              <video src={c.url} muted autoPlay loop playsInline className={`w-full rounded-md ${scene.transition === c.t ? "ring-2 ring-[var(--sel)]" : ""}`} />
              <button type="button" onClick={() => x.setComp((cp) => ({ ...cp, scenes: cp.scenes.map((sc) => (sc.id === scene.id ? { ...sc, transition: c.t } : sc)) }))} className="press mt-1 block w-full rounded-md py-1 text-center text-caption capitalize hover:bg-surface-2">
                {c.t}
                {c.t === called ? " · called for" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// which tab a layer opens on: the last one picked (Raylight keeps it as you go from layer to layer)
let lastTab: "design" | "animate" = "design"

export function StudioInspector(x: InspectorCtx) {
  const { comp, sel } = x
  const [tab, setTabState] = useState(lastTab)
  const setTab = (t: "design" | "animate") => {
    lastTab = t
    setTabState(t)
  }
  const scene = comp.scenes.find((s) => s.id === sel.scene) ?? comp.scenes[0]
  const l = sel.layer === BG ? undefined : scene.layers.find((y) => y.id === sel.layer)
  const body =
    sel.layer === BG ? (
      <BackgroundPanel {...x} />
    ) : !l ? (
      <ScenePanel {...x} scene={scene} />
    ) : l.kind === "device" ? (
      <DevicePanel {...x} scene={scene} l={l} />
    ) : l.kind === "breakdown" ? (
      <BreakdownPanel {...x} scene={scene} l={l} />
    ) : l.kind === "callout" ? (
      <CalloutPanel {...x} scene={scene} l={l} />
    ) : moving(l) ? (
      <LayerTabs {...x} scene={scene} l={l} tab={tab} setTab={setTab} />
    ) : null
  return <div className={x.cols ? "cols columns-2 gap-0 [column-rule:1px_solid_var(--line)]" : ""}>{body}</div>
}

/** A moving layer's two tabs: Design (what it is, where, how it looks) and Animate (its In, Out and animations). */
function LayerTabs(x: InspectorCtx & { scene: Scene; l: MovingLayer; tab: "design" | "animate"; setTab: (t: "design" | "animate") => void }) {
  const { l, scene } = x
  const set = layerSetter(x, scene, l)
  // when its In plays without its own timing: a beat after the scene starts, one after another
  const auto = 0.25 + 0.12 * scene.layers.filter((y) => y.kind !== "device" && !y.hidden).indexOf(l)
  const content =
    l.kind === "component" ? (
      <ComponentPanel {...x} scene={scene} l={l} />
    ) : l.kind === "image" ? (
      <ImagePanel {...x} scene={scene} l={l} />
    ) : l.kind === "text" ? (
      <TextPanel {...x} scene={scene} l={l} />
    ) : l.kind === "shape" ? (
      <ShapePanel l={l} set={set} size={x.comp.size} accent={x.comp.brand?.accent ?? ""} />
    ) : (
      <CursorPanel l={l} set={set} />
    )
  return (
    <>
      <div className="sticky top-0 z-10 border-b bg-surface px-3 py-2 [.cols_&]:static">
        <Segmented
          full
          size="sm"
          label="Panel"
          value={x.tab}
          onChange={x.setTab}
          options={[
            { value: "design", label: "Design" },
            { value: "animate", label: "Animate" },
          ]}
        />
      </div>
      {x.tab === "design" ? (
        <>
          {content}
          <DesignSection l={l} set={set} size={x.comp.size} />
        </>
      ) : (
        <>
          <AnimateSection
            l={l}
            scene={scene}
            auto={auto}
            set={(patch) =>
              // a title that parts round a device needs the bar that says where
              set(l.kind === "text" && (patch as Partial<TextLayer>).enter === "part" && !l.text.includes("|") ? { ...patch, text: splitHalf(l.text) } : patch)
            }
          />
          {l.kind === "text" && l.enter === "part" && (
            <Section title="Parting">
              <SliderField id="tx-gap" label="Room between" unit="%" min={4} max={60} step={1} value={l.gap ?? 22} def={22} set={(v) => set({ gap: v } as Partial<MovingLayer>)} hint="As wide as the device standing between the words." />
            </Section>
          )}
        </>
      )}
    </>
  )
}

/** The title the inspector shows for what's picked. */
/** The picked thing's icon on its kind's tint, beside its name over the inspector (the background has none). */
export function inspectorIcon(comp: Comp, sel: Sel) {
  if (sel.layer === BG) return null
  const l = comp.scenes.find((x) => x.id === sel.scene)?.layers.find((y) => y.id === sel.layer)
  const I = l ? layerIcon(l) : FilmSlate
  return (
    <span aria-hidden className="k-tint k-ink grid h-6 w-6 shrink-0 place-items-center rounded-md" style={kStyle(l ? kindOf(l) : "scene")}>
      <I size={14} />
    </span>
  )
}

export function inspectorTitle(comp: Comp, sel: Sel) {
  if (sel.layer === BG) return "Background"
  const s = comp.scenes.find((x) => x.id === sel.scene)
  const l = s?.layers.find((y) => y.id === sel.layer)
  return l ? layerName(l) : (s?.name ?? "Scene")
}

/** Devices to one side of the frame: the components and pictures move over to the other side, so they sit beside it. */
function frameTo(scene: Scene, frame: Slot): Partial<Scene> {
  const away = (x: number) => (frame === "left" ? x < 0.5 : frame === "right" ? x > 0.5 : false)
  return { frame, layers: scene.layers.map((l) => (l.kind !== "device" && l.kind !== "text" && away(l.box.x) ? { ...l, box: { ...l.box, x: 1 - l.box.x } } : l)) }
}

const sceneSetter = (x: InspectorCtx, scene: Scene) => (patch: Partial<Scene>) => x.setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)) }))
const layerSetter =
  <L extends Layer>(x: InspectorCtx, scene: Scene, l: L) =>
  (patch: Partial<L>) =>
    x.setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === scene.id ? { ...s, layers: s.layers.map((y) => (y.id === l.id ? ({ ...y, ...patch } as Layer) : y)) } : s)) }))

/* ---------------- scene ---------------- */

function ScenePanel(x: InspectorCtx & { scene: Scene }) {
  const { scene, comp } = x
  const set = sceneSetter(x, scene)
  const i = comp.scenes.indexOf(scene)
  const devs = devicesOf(scene)
  const primary = devs.find((d) => d.slot === "center") ?? devs[0]
  // with two framings, the camera fields set the one being framed: the start, or the end
  const two = scene.move === "framings"
  const atEnd = two && x.framing === "end"
  const cam = atEnd ? (scene.camera2 ?? scene.camera) : scene.camera
  const setCam = (patch: Partial<Scene["camera"]>) => set(atEnd ? { camera2: { ...cam, ...patch } } : { camera: { ...scene.camera, ...patch } })
  const lens = cam.fov ?? angle(cam.angle, primary?.device ?? "iphone").fov
  const moved = cam.yaw || cam.elev || cam.zoom !== 1 || cam.fov !== null || cam.pitch || cam.roll
  // how the device turns across the shot: the end framing against the start
  const turnBy = two && scene.camera2 ? { yaw: scene.camera2.yaw - scene.camera.yaw, pitch: (scene.camera2.pitch ?? 0) - (scene.camera.pitch ?? 0), roll: (scene.camera2.roll ?? 0) - (scene.camera.roll ?? 0) } : null
  const rotate = (by: { yaw?: number; pitch?: number; roll?: number }) => {
    const c = scene.camera
    set({ move: "framings", camera2: { ...c, yaw: c.yaw + (by.yaw ?? 0), pitch: (c.pitch ?? 0) + (by.pitch ?? 0), roll: (c.roll ?? 0) + (by.roll ?? 0) }, ease: scene.ease ?? "cubic-bezier(0.65, 0, 0.35, 1)" })
  }
  // what stands in a slot: change it, empty it, or fill it
  const putIn = (slot: Slot, id: DeviceId | null) => {
    const has = scene.layers.find((l): l is DeviceLayer => l.kind === "device" && l.slot === slot)
    if (!id) return set({ layers: scene.layers.filter((l) => !(l.kind === "device" && l.slot === slot)) })
    if (has) return set({ layers: scene.layers.map((l) => (l === has ? { ...has, device: id, finish: undefined } : l)) })
    // a new device goes in under the flat layers, with the others
    const at = scene.layers.findIndex((l) => l.kind !== "device")
    const layers = [...scene.layers]
    layers.splice(at < 0 ? layers.length : at, 0, newDevice(id, slot))
    set({ layers })
  }
  const move = MOTIONS.find((m) => m.id === scene.move)
  // a scene of a film cut into scenes: its film is what's edited
  const cut = scene.layers.find((l): l is ComponentLayer => l.kind === "component" && l.from !== undefined && !l.hidden)
  return (
    <>
      <Section title="Scene" aside={`${i + 1} of ${comp.scenes.length} · ${total(comp).toFixed(1)}s in all`}>
        <Stack>
          <input aria-label="Scene name" value={scene.name} onChange={(e) => set({ name: e.target.value })} className={`${field} h-8 w-full px-2.5 text-body`} />
          <SliderField id="sc-len" label="Length" unit="s" min={0.3} max={60} step={0.1} value={scene.duration} def={4} set={(v) => x.setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === scene.id ? retimed(s, v) : s)) }))} />
          {/* a template's shot plays its own motion over the new length: slower to fill a longer scene, quicker in a shorter one */}
          {(() => {
            const film = scene.layers.find((l) => l.kind === "component" && l.from !== undefined && l.rate && Math.abs(l.rate - 1) > 0.01)
            return film && film.kind === "component" ? <Hint>Its motion plays at {Math.round((film.rate ?? 1) * 100)}% speed to fill {scene.duration.toFixed(1)} s.</Hint> : null
          })()}
        </Stack>
        {i > 0 && (
          <>
            <p className="pb-1.5 pt-3 text-caption text-fg-3">Into this scene</p>
            <Choices label="Transition" value={scene.transition} options={TRANSITIONS} set={(t) => set({ transition: t })} cols={3} show={5} />
            <TryCuts x={x} scene={scene} i={i} />
          </>
        )}
        {cut && (
          <>
            <button type="button" onClick={() => x.setSel({ scene: scene.id, layer: cut.id })} className="press mt-3 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-body font-medium shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2">
              Your words and screens
              <span className="text-caption font-normal text-fg-3">{byId(cut.anim)?.name}</span>
            </button>
            <Hint>They change in every scene of the film. This scene plays it from {(cut.from ?? 0).toFixed(2)} s.</Hint>
          </>
        )}
      </Section>

      <Section title="Devices" aside="matched in scale">
        <div className="grid grid-cols-3 gap-1">
          {SLOTS.map(({ value: slot, label }) => {
            const l = scene.layers.find((y): y is DeviceLayer => y.kind === "device" && y.slot === slot)
            const T = l ? DEVICE_TILES.find((t) => t.id === l.device)! : null
            const id = `slot-${scene.id}-${slot}`
            return (
              <div
                key={slot}
                onDragOver={(e) => e.dataTransfer.types.includes("text/x-device") && e.preventDefault()}
                onDrop={(e) => {
                  const d = e.dataTransfer.getData("text/x-device") as DeviceId
                  if (d) putIn(slot, d)
                }}
              >
                <button
                  type="button"
                  popoverTarget={id}
                  className={`press flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-lg text-caption transition-[color,background-color] duration-150 ${l ? ring(slot === "center") : "border border-dashed border-[var(--border-3)] text-fg-3 hover:bg-hover hover:text-fg"}`}
                >
                  {T ? <T.icon size={20} aria-hidden /> : <Plus size={16} aria-hidden />}
                  <span className="font-medium">{T ? T.label : label}</span>
                  <span className="text-micro text-fg-3">{slot === "center" ? "Primary" : l ? label : "Empty"}</span>
                </button>
                <Popover id={id} align={slot === "right" ? "end" : slot === "left" ? "start" : "center"} label={`${label} device`}>
                  <div className="w-[200px] p-1.5">
                    {DEVICE_TILES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => {
                          putIn(slot, t.id)
                          closePopover(e.currentTarget)
                        }}
                        className={`press flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body hover:bg-surface-2 ${l?.device === t.id ? "font-medium" : ""}`}
                      >
                        <t.icon size={16} aria-hidden className="text-fg-2" />
                        {DEVICES.find((d) => d.id === t.id)!.name}
                      </button>
                    ))}
                    {l && (
                      <button
                        type="button"
                        onClick={(e) => {
                          putIn(slot, null)
                          closePopover(e.currentTarget)
                        }}
                        className="press mt-1 flex w-full items-center gap-2.5 rounded-md border-t px-2.5 py-2 text-body text-fg-2 hover:bg-surface-2"
                      >
                        Leave empty
                      </button>
                    )}
                  </div>
                </Popover>
              </div>
            )
          })}
        </div>
        <Hint>Pick what stands in each place. Each device stands at its real size, under one camera.</Hint>
        <div className="mt-3 space-y-1.5">
          <Row label="Devices sit">
            <Segmented size="sm" label="Where the devices sit in the frame" value={scene.frame} onChange={(v) => set(frameTo(scene, v))} options={SLOTS} />
          </Row>
          <Row label="Arrive">
            <Segmented
              size="sm"
              label="How the devices come in"
              value={scene.arrival}
              onChange={(v) => set({ arrival: v })}
              options={[
                { value: "none", label: "In place" },
                { value: "drop", label: "Drop in" },
                { value: "slide", label: "Slide in" },
              ]}
            />
          </Row>
        </div>
      </Section>

      <Section
        title="Camera"
        aside={
          moved ? (
            <button type="button" onClick={() => setCam({ yaw: 0, elev: 0, zoom: 1, fov: null, pitch: undefined, roll: undefined })} className="press flex items-center gap-1 rounded text-caption font-medium text-fg-2 hover:text-fg">
              <ArrowCounterClockwise size={12} aria-hidden /> Reset
            </button>
          ) : undefined
        }
      >
        {two && (
          <div className="mb-2.5">
            <Segmented
              full
              size="sm"
              label="The framing these set"
              value={x.framing}
              onChange={x.setFraming}
              options={[
                { value: "start", label: "Start of the shot" },
                { value: "end", label: "End of the shot" },
              ]}
            />
          </div>
        )}
        <Choices<AngleId> label="Angle" value={cam.angle} options={ANGLES} set={(a) => setCam({ angle: a, yaw: 0, elev: 0, zoom: 1 })} cols={3} show={5} />
        <More label="Lens, zoom, turn, tilt, roll" open={!!moved}>
          <Stack>
            <SliderField id="sc-lens" label="Lens" unit="°" min={12} max={50} step={1} value={Math.round(lens)} def={Math.round(angle(cam.angle, primary?.device ?? "iphone").fov)} set={(v) => setCam({ fov: v })} hint="The perspective: low is a long lens, flatter, closer to a product photo; high is wide and dramatic." />
            <SliderField id="sc-zoom" label="Zoom" unit="×" min={0.35} max={3} step={0.05} value={Number(cam.zoom.toFixed(2))} def={1} set={(v) => setCam({ zoom: v })} />
            <SliderField id="sc-yaw" label="Turn" unit="°" min={-180} max={180} step={1} value={Math.round(cam.yaw)} def={0} set={(v) => setCam({ yaw: v })} />
            <SliderField id="sc-pitch" label="Tilt" unit="°" min={-90} max={90} step={1} value={Math.round(cam.pitch ?? 0)} def={0} set={(v) => setCam({ pitch: v || undefined })} hint="Negative leans its top away, the way a phone lies back on a table." />
            <SliderField id="sc-roll" label="Roll" unit="°" min={-180} max={180} step={1} value={Math.round(cam.roll ?? 0)} def={0} set={(v) => setCam({ roll: v || undefined })} />
          </Stack>
        </More>
        <Hint>On the stage: drag to turn it, Alt-drag to tilt and roll it, scroll to come closer.</Hint>
      </Section>

      <Section title="Move">
        <Choices<MotionId> label="Camera move" value={scene.move} options={MOTIONS} set={(m) => set({ move: m })} cols={3} show={5} />
        <Hint>{move?.hint}</Hint>
        <More label="Turns during the shot" open={!!(turnBy && (turnBy.yaw || turnBy.pitch || turnBy.roll))}>
        <div role="group" aria-label="Turns during the shot" className="grid grid-cols-3 gap-1">
          {(
            [
              ["A quarter turn", { yaw: 90 }],
              ["A half turn", { yaw: 180 }],
              ["A full spin", { yaw: 360 }],
              ["Tilts back", { pitch: -35 }],
              ["Rolls in", { roll: -25 }],
              ["Turn and tilt", { yaw: 40, pitch: -20 }],
            ] as const
          ).map(([label, by]) => (
            <button key={label} type="button" onClick={() => rotate(by)} className="press h-7 truncate rounded-md bg-subtle px-1 text-caption font-medium text-fg-2 hover:bg-hover hover:text-fg">
              {label}
            </button>
          ))}
        </div>
        </More>
        {turnBy && (turnBy.yaw || turnBy.pitch || turnBy.roll) ? (
          <p className="pt-1.5 text-caption tabular-nums text-fg-3">
            Across {scene.duration.toFixed(1)} s it {[turnBy.yaw ? `turns ${Math.round(turnBy.yaw)}°` : "", turnBy.pitch ? `tilts ${Math.round(turnBy.pitch)}°` : "", turnBy.roll ? `rolls ${Math.round(turnBy.roll)}°` : ""].filter(Boolean).join(", ")}.
          </p>
        ) : null}
        {scene.move === "framings" && (
          <div className="mt-3 space-y-2.5">
            <p className="hint text-caption text-fg-3">
              Frame the {x.framing} on the stage: drag to turn the devices, Alt-drag to tilt and roll, scroll to come closer, Shift-drag to move the flat layers (on a scene without devices, just drag). Double-click resets it.
            </p>
            <p className="pt-1 text-caption font-medium text-fg-3">The curve it travels on</p>
            <EaseEditor id={`sc-ease-${scene.id}`} value={scene.ease ?? "cubic-bezier(0.65, 0, 0.35, 1)"} set={(ease) => set({ ease })} />
          </div>
        )}
      </Section>

      <FlatCamera {...x} scene={scene} />

      {devs.some((d) => d.device !== "duo") && (
        <Section title="Teardown" aside="the device in parts" fold>
          <Segmented
            full
            size="sm"
            label="Take the devices apart"
            value={scene.teardown ?? "none"}
            onChange={(v) => set({ teardown: v })}
            options={[
              { value: "none", label: "Whole" },
              { value: "apart", label: "Comes apart" },
              { value: "hold", label: "In parts" },
              { value: "assemble", label: "Assembles" },
            ]}
          />
          <Hint>Display, board, battery, frame, back and cameras stand apart along the device, each labelled with a leader line. Use a ¾ angle to see between them.</Hint>
        </Section>
      )}

      <SceneLookSection {...x} scene={scene} />

      <Section title="Scene effects" aside={anyFx(scene.fx) ? "this scene's own" : undefined} fold>
        <FxFields fx={scene.fx ?? {}} set={(fx) => set({ fx: anyFx(fx) ? fx : undefined })} idp={`sfx-${scene.id}`} />
        <Hint>Over the finished shot, live screens included. They go on top of the effects every scene has (Background).</Hint>
      </Section>
    </>
  )
}

/** The flat camera over a scene's flat layers (components, pictures, titles): where it looks and how close. With two
    framings, the one being set. */
function FlatCamera(x: InspectorCtx & { scene: Scene }) {
  const { scene } = x
  const set = sceneSetter(x, scene)
  const end = scene.move === "framings" && x.framing === "end"
  const v = (end ? (scene.view2 ?? scene.view) : scene.view) ?? VIEW
  const put = (patch: Partial<typeof v>) => set(end ? { view2: { ...v, ...patch } } : { view: { ...v, ...patch } })
  const moved = v.zoom !== 1 || v.x !== 0.5 || v.y !== 0.5
  return (
    <Section
      title="Flat camera"
      fold
      aside={
        moved ? (
          <button type="button" onClick={() => set(end ? { view2: undefined } : { view: undefined })} className="press flex items-center gap-1 rounded text-caption font-medium text-fg-2 hover:text-fg">
            <ArrowCounterClockwise size={12} aria-hidden /> Reset
          </button>
        ) : end ? (
          "the end framing"
        ) : undefined
      }
    >
      <Stack>
        <SliderField id={`fc-z-${scene.id}`} label="Closer" unit="%" min={25} max={800} step={1} value={Math.round(v.zoom * 100)} def={100} set={(z) => put({ zoom: z / 100 })} />
        <SliderField id={`fc-x-${scene.id}`} label="Looks across" unit="%" min={0} max={100} step={1} value={Math.round(v.x * 100)} def={50} set={(n) => put({ x: n / 100 })} />
        <SliderField id={`fc-y-${scene.id}`} label="Looks down" unit="%" min={0} max={100} step={1} value={Math.round(v.y * 100)} def={50} set={(n) => put({ y: n / 100 })} />
      </Stack>
      <Hint>Zooms and pans the components, pictures and titles together, sharp at any size: a flat zoom into one part of the frame.</Hint>
    </Section>
  )
}

/** A scene's own background, or the one it inherits (the director's, when Auto is on). Choosing one here, with Auto on,
    teaches the director. */
function SceneLookSection(x: InspectorCtx & { scene: Scene }) {
  const { comp, scene } = x
  const i = comp.scenes.indexOf(scene)
  const looks = direct(comp)
  const now = looks[i]
  const own = !!scene.look && Object.keys(scene.look).length > 0
  const set = (look: Partial<SceneLook> | undefined) => {
    x.setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === scene.id ? { ...s, look } : s)) }))
    if (look && comp.auto) learn(features(scene, i, comp.scenes.length), { ...now, ...look })
  }
  return (
    <Section title="Scene background" aside={own ? "its own" : comp.auto ? "the director's" : "the film's"} fold>
      <div className="grid grid-cols-6 gap-2">
        {BACKDROPS.filter((b) => b.id !== "transparent").map((b) => (
          <button
            key={b.id}
            type="button"
            aria-label={`This scene on ${b.name}`}
            title={b.name}
            onClick={() => set({ ...(scene.look ?? {}), fill: b.id })}
            className={`press aspect-square rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] ${swatch(now.fill === b.id)}`}
            style={{ background: b.css }}
          />
        ))}
      </div>
      <div className="mt-2.5">
        <Choices label="Effect for this scene" value={now.effect} options={EFFECTS} set={(effect) => set({ ...(scene.look ?? {}), fill: now.fill, effect })} show={7} />
      </div>
      <div className="mt-3 flex min-h-8 items-center justify-between gap-3 pl-2.5">
        <span id={`sc-gr-${scene.id}`} className="text-body text-fg-2">
          Gradients
        </span>
        <Segmented
          size="sm"
          labelledBy={`sc-gr-${scene.id}`}
          value={scene.look?.paint ? "own" : "comp"}
          onChange={(v) => set(v === "own" ? { ...(scene.look ?? {}), fill: now.fill, paint: comp.paint ?? [] } : (({ paint: _, ...rest }) => (Object.keys(rest).length ? rest : undefined))(scene.look ?? {}))}
          options={[
            { value: "comp", label: "The composition's" },
            { value: "own", label: "Its own" },
          ]}
        />
      </div>
      {scene.look?.paint && (
        <div className="mt-2">
          <GradientMaker idp={`sgm-${scene.id}`} accent={comp.brand?.accent ?? ""} onMake={(paint) => set({ ...scene.look, fill: groundOfStack(paint), paint })} />
          <div className="mt-3" />
          <PaintStack paints={scene.look.paint} set={(paint) => set({ ...scene.look, paint })} aspect={(SIZES.find((x) => x.id === comp.size) ?? SIZES[0]).w / (SIZES.find((x) => x.id === comp.size) ?? SIZES[0]).h} accent={comp.brand?.accent ?? ""} base={fillCss(now.fill)} />
        </div>
      )}
      <Hint keep>
        {own ? "Set by hand. " : `${now.why[0].toUpperCase()}${now.why.slice(1)}. `}
        {own ? (
          <button type="button" onClick={() => set(undefined)} className="press font-medium text-fg underline decoration-fg-3 underline-offset-4">
            {comp.auto ? "Let the director choose" : "Use the composition's"}
          </button>
        ) : comp.auto ? (
          "Pick one and the director learns it for scenes like this."
        ) : (
          ""
        )}
      </Hint>
    </Section>
  )
}

/* ---------------- device ---------------- */

function DevicePanel(x: InspectorCtx & { scene: Scene; l: DeviceLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  // a film shows the same picture on each scene's device: how it fits goes with it, on every one
  const fitAll = (patch: Partial<DeviceLayer>) => x.setComp((c) => ({ ...c, scenes: c.scenes.map((s) => ({ ...s, layers: s.layers.map((y) => (y.id === l.id || (y.kind === "device" && y.content.kind === "image" && l.content.kind === "image" && y.content.src === l.content.src) ? ({ ...y, ...patch } as Layer) : y)) })) }))
  const d = DEVICES.find((y) => y.id === l.device)!
  const finish = FINISHES[l.device].find((f) => f.id === l.finish) ?? FINISHES[l.device][0]
  const c = l.content
  return (
    <>
      <Section title="Device">
        <div
          role="radiogroup"
          aria-label="Device"
          onKeyDown={(e) =>
            rove(
              e,
              DEVICE_TILES.map((t) => t.id),
              l.device,
              (id) => set({ device: id, finish: undefined }),
              "radio",
            )
          }
          className="grid grid-cols-4 gap-1"
        >
          {DEVICE_TILES.map(({ id, label, icon: I }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === l.device}
              tabIndex={id === l.device ? 0 : -1}
              onClick={() => set({ device: id, finish: undefined })}
              className={`press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-caption font-medium ${ring(id === l.device)}`}
            >
              <I size={18} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Row label="Stands">
            <Segmented size="sm" label="Where it stands in the group" value={l.slot} onChange={(v) => set({ slot: v })} options={SLOTS} />
          </Row>
          {d.fold && (
            <Row label="Posture">
              <Segmented size="sm" label="iPhone Duo posture" value={l.posture} onChange={(v) => set({ posture: v })} options={POSTURES} />
            </Row>
          )}
          {d.rotates && (
            <Row label="Turned" htmlFor="dv-land">
              <Switch id="dv-land" on={l.landscape} onChange={(v) => set({ landscape: v })} />
            </Row>
          )}
          {/* a picture or a video on the screen: how it fits, and turned inside the screen (only then) */}
          {c.kind === "image" && (
          <>
          <Row label="Screen fit">
            <Segmented
              size="sm"
              label="How a picture or a video fits the screen"
              value={l.fit ?? "fill"}
              onChange={(v) => fitAll({ fit: v })}
              options={[
                { value: "fill", label: "Fill" },
                { value: "whole", label: "Whole" },
                { value: "auto", label: "Auto-turn" },
              ]}
            />
          </Row>
          <Row label="Picture turned">
            <Segmented
              size="sm"
              label="Turn the picture or video inside the screen"
              value={String(l.turn ?? 0)}
              onChange={(v) => fitAll({ turn: Number(v) as 0 | 90 | 180 | 270 })}
              options={[
                { value: "0", label: "0°" },
                { value: "90", label: "90°" },
                { value: "180", label: "180°" },
                { value: "270", label: "270°" },
              ]}
            />
          </Row>
          <Hint>For a picture or a video on the screen (a film you exported, say). Fill crops it to the screen; Whole shows all of it; Auto-turn turns a landscape film to fill a portrait phone (or the other way round). Or turn the device itself. It goes for every scene showing this picture.</Hint>
          </>
          )}
        </div>
      </Section>
      <Section title="Finish" aside={finish.name}>
        <div role="radiogroup" aria-label="Finish" className="flex flex-wrap gap-2.5">
          {FINISHES[l.device].map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === finish.id}
              aria-label={f.name}
              title={f.name}
              onClick={() => set({ finish: f.id })}
              className={`press h-7 w-7 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] ${swatch(f.id === finish.id)}`}
              style={{ background: `radial-gradient(circle at 32% 28%, #ffffff70, transparent 46%), linear-gradient(145deg, ${f.metal}, ${f.back})` }}
            />
          ))}
        </div>
        <p className="pb-1.5 pt-3 text-caption font-medium text-fg-3">Case</p>
        <CaseSwatches value={l.case} set={(c) => set({ case: c })} extra={lastLook?.look.case} />
      </Section>
      <Section title="Screen">
        <Segmented
          full
          size="sm"
          label="What the screen shows"
          value={c.kind}
          onChange={(k) => {
            if (k === "current") set({ content: { kind: "current" } })
            else if (k === "anim") x.pickAnim("Show on the screen", (id) => set({ content: { kind: "anim", id } }))
            else x.pickImage((src, file) => set({ content: { kind: "image", src, name: file } }))
          }}
          options={[
            { value: "current", label: "Live" },
            { value: "anim", label: "Animation" },
            { value: "image", label: "Picture" },
          ]}
        />
        <p className="mt-2 text-caption text-fg-3">
          {c.kind === "current" ? (
            <>
              Whatever's open in the engine: <span className="text-fg-2">{x.liveName}</span>.
            </>
          ) : c.kind === "anim" ? (
            <button type="button" onClick={() => x.pickAnim("Show on the screen", (id) => set({ content: { kind: "anim", id } }))} className="press font-medium text-fg underline decoration-fg-3 underline-offset-4">
              {byId(c.id)?.name ?? c.id} · change
            </button>
          ) : (
            <button type="button" onClick={() => x.pickImage((src, file) => set({ content: { kind: "image", src, name: file } }))} className="press font-medium text-fg underline decoration-fg-3 underline-offset-4">
              {c.name} · replace
            </button>
          )}
        </p>
        <div className="mt-2.5">
          <Row label="Hairline" htmlFor="dv-hl">
            <Switch id="dv-hl" on={!!l.hairline} onChange={(v) => set({ hairline: v })} />
          </Row>
          <Hint>Redraws the screen as thin ink lines.</Hint>
        </div>
      </Section>
    </>
  )
}

/* ---------------- flat layers ---------------- */

function EnterSection({ value, set }: { value: Enter; set: (e: Enter) => void }) {
  return (
    <Section title="Comes in">
      <Choices<Enter> label="How it comes in" value={value} options={ENTERS} set={set} cols={5} />
    </Section>
  )
}

function ComponentPanel(x: InspectorCtx & { scene: Scene; l: ComponentLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  const shape = l.fit ? "auto" : (SHAPES.find((s) => Math.abs(s.aspect - l.aspect) < 0.02)?.value ?? "square")
  const a = byId(l.anim)
  const groups = a ? groupSchema(a) : []
  const values = a ? withDefaults(a, l.values) : {}
  const own = Object.keys(l.values ?? {}).length
  // a film cut into scenes is one film: its words and screens change in every scene of it
  const film = l.from !== undefined
  const slices = (c: Comp) => c.scenes.flatMap((s) => s.layers.filter((y): y is ComponentLayer => y.kind === "component" && y.anim === l.anim && y.from !== undefined).map((y) => ({ s, y })))
  const setValues = (v: ComponentLayer["values"]) => x.setComp((c) => withValues(c, l, v))
  const filmEnd = Math.max(1, ...slices(x.comp).map(({ s, y }) => (y.from ?? 0) + s.duration))
  return (
    <>
      <Section title="Component">
        <button type="button" onClick={() => x.pickAnim("Pick a component", (id) => set({ anim: id }))} className="press flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2">
          <img src={`/thumbs/${l.anim}-light.webp`} alt="" className="h-10 w-[54px] shrink-0 rounded-md object-cover shadow-[0_0_0_1px_var(--line)]" />
          <span className="min-w-0">
            <span className="block truncate text-body font-medium">{byId(l.anim)?.name ?? l.anim}</span>
            <span className="block text-caption text-fg-3">Change</span>
          </span>
        </button>
        <div className="mt-2.5 space-y-1.5">
          <Row label="Shape">
            <Segmented
              size="sm"
              label="Shape"
              value={shape}
              onChange={(v) => set(v === "auto" ? { fit: true } : { fit: false, aspect: SHAPES.find((s) => s.value === v)!.aspect })}
              options={[{ value: "auto", label: "Auto", aspect: 0 }, ...SHAPES]}
            />
          </Row>
          <Row label="Hairline" htmlFor="cp-hl">
            <Switch id="cp-hl" on={!!l.hairline} onChange={(v) => set({ hairline: v })} />
          </Row>
        </div>
        {shape === "auto" && <Hint>The box takes the component's own shape. Swap in another and the box grows or shrinks to match, at the same scale.</Hint>}
        {film && (
          <div className="mt-2.5">
            <SliderField id="cp-from" label="Starts at" unit="s" min={0} max={Math.round(filmEnd * 100) / 100} step={0.01} value={l.from ?? 0} set={(v) => set({ from: v })} />
            <Hint>Where in the film this scene starts. The scene's length decides how much of it plays.</Hint>
          </div>
        )}
      </Section>
      {groups.length > 0 && (
        <Section
          title="Content"
          aside={
            own ? (
              <button type="button" onClick={() => setValues(undefined)} className="press flex items-center gap-1 rounded text-caption font-medium text-fg-2 hover:text-fg">
                <ArrowCounterClockwise size={12} aria-hidden /> Reset {own}
              </button>
            ) : film ? (
              "every scene of the film"
            ) : (
              "this layer's own"
            )
          }
        >
          {groups.map(([g, list]) => (
            <div key={g} className="pb-2">
              <p className="pb-1 pt-1.5 text-caption text-fg-3">{g}</p>
              {list.map(([k, s]) => (
                <ParamRow key={k} k={`${l.id}-${k}`} s={s} value={values[k]} def={a!.params[k]} set={(v) => setValues({ ...l.values, [k]: v })} />
              ))}
            </div>
          ))}
        </Section>
      )}
      <Section title="Camera">
        <Choices<Shot> label="Shot" value={l.shot ?? "flat"} options={SHOTS} set={(shot) => set({ shot })} cols={3} />
        <Hint>{SHOTS.find((s) => s.id === (l.shot ?? "flat"))?.hint}</Hint>
        {l.shot === "macro" && (
          <div className="mt-2.5 space-y-1.5">
            <SliderField id="cp-fx" label="Close on, across" unit="%" min={0} max={100} step={1} value={Math.round((l.focus?.x ?? 0.5) * 100)} def={50} set={(v) => set({ focus: { x: v / 100, y: l.focus?.y ?? 0.35 } })} />
            <SliderField id="cp-fy" label="Close on, down" unit="%" min={0} max={100} step={1} value={Math.round((l.focus?.y ?? 0.35) * 100)} def={35} set={(v) => set({ focus: { x: l.focus?.x ?? 0.5, y: v / 100 } })} />
          </div>
        )}
      </Section>
    </>
  )
}

/* ---------------- breakdown ---------------- */

const VIEWS_BD: { id: BreakdownLayer["view"]; name: string; hint: string }[] = [
  { id: "table", name: "On the table", hint: "The components lift out of the screen and are laid out beside the device, numbered, each leaving its socket." },
  { id: "stack", name: "In layers", hint: "The device lies flat and its components float above it, lit one at a time, each labelled." },
  { id: "focus", name: "Close up", hint: "One component on its own, large and sharp, the camera closing in on what matters in it." },
  { id: "assemble", name: "Assemble", hint: "From the table back into the screen, one after another." },
]

function BreakdownPanel(x: InspectorCtx & { scene: Scene; l: BreakdownLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  return (
    <>
      <Section title="Screen">
        <button type="button" onClick={() => x.pickAnim("Take apart", (id) => set({ anim: id, names: undefined }))} className="press flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2">
          <img src={`/thumbs/${l.anim}-light.webp`} alt="" className="h-10 w-[54px] shrink-0 rounded-md object-cover shadow-[0_0_0_1px_var(--line)]" />
          <span className="min-w-0">
            <span className="block truncate text-body font-medium">{byId(l.anim)?.name ?? l.anim}</span>
            <span className="block text-caption text-fg-3">Change</span>
          </span>
        </button>
        <div className="mt-2.5 space-y-1.5">
          <Row label="In">
            <Segmented
              size="sm"
              label="The device it sits in"
              value={l.mockup}
              onChange={(v) => set({ mockup: v })}
              options={[
                { value: "phone", label: "iPhone" },
                { value: "tablet", label: "iPad" },
                { value: "none", label: "Screen" },
              ]}
            />
          </Row>
          <SliderField id="bd-max" label="Components" unit="" min={2} max={8} step={1} value={l.max} def={6} set={(v) => set({ max: Math.round(v) })} hint="Top of the screen first." />
          <Row label="Hairline" htmlFor="bd-hl">
            <Switch id="bd-hl" on={l.lines} onChange={(v) => set({ lines: v })} />
          </Row>
          <Row label="Labels" htmlFor="bd-lb">
            <Switch id="bd-lb" on={l.labels} onChange={(v) => set({ labels: v })} />
          </Row>
        </div>
      </Section>
      <Section title="Shot">
        <Choices label="How it's shown" value={l.view} options={VIEWS_BD} set={(view) => set({ view })} cols={2} />
        <Hint>{VIEWS_BD.find((v) => v.id === l.view)?.hint}</Hint>
        {l.view === "focus" && (
          <div className="mt-2.5">
            <SliderField id="bd-focus" label="Which one" unit="" min={1} max={8} step={1} value={l.focus + 1} def={1} set={(v) => set({ focus: Math.round(v) - 1 })} hint="1 is the most interesting component, 2 the next…" />
          </div>
        )}
      </Section>
      {l.labels && (
        <Section title="Names" aside="top of the screen first">
          <Stack>
            {Array.from({ length: l.max }, (_, i) => (
              <input
                key={i}
                aria-label={`Name of component ${i + 1}`}
                placeholder={`${i + 1}: the name the screen gives it`}
                value={l.names?.[i] ?? ""}
                onChange={(e) => {
                  const names = Array.from({ length: l.max }, (_, j) => l.names?.[j] ?? "")
                  names[i] = e.target.value
                  set({ names })
                }}
                className={`${field} h-8 w-full px-2.5 text-body`}
              />
            ))}
          </Stack>
          <Hint>Empty uses the component's own name (data-component in its code), or one guessed from what it is.</Hint>
        </Section>
      )}
    </>
  )
}

/* ---------------- callout ---------------- */

function CalloutPanel(x: InspectorCtx & { scene: Scene; l: CalloutLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  return (
    <>
      <Section title="Callout">
        <Stack>
          <input aria-label="Label" value={l.text} onChange={(e) => set({ text: e.target.value })} className={`${field} h-8 w-full px-2.5 text-body`} />
          <input aria-label="The line under it" placeholder="A smaller line under it" value={l.sub} onChange={(e) => set({ sub: e.target.value })} className={`${field} h-8 w-full px-2.5 text-body`} />
        </Stack>
        <Hint>Drag the label on the stage. The line runs from it to the point below.</Hint>
      </Section>
      <Section title="Points at">
        <Stack>
          <SliderField id="co-ax" label="Across" unit="%" min={0} max={100} step={1} value={Math.round(l.at.x * 100)} set={(v) => set({ at: { ...l.at, x: v / 100 } })} />
          <SliderField id="co-ay" label="Down" unit="%" min={0} max={100} step={1} value={Math.round(l.at.y * 100)} set={(v) => set({ at: { ...l.at, y: v / 100 } })} />
        </Stack>
      </Section>
    </>
  )
}

function ImagePanel(x: InspectorCtx & { scene: Scene; l: ImageLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  return (
    <>
      <Section title="Picture">
        <Button className="w-full" onClick={() => x.pickImage((src, file, aspect) => set({ src, file, aspect }))}>
          <UploadSimple size={15} aria-hidden />
          Replace {l.file}
        </Button>
        <div className="mt-2.5 space-y-1.5">
          <SliderField id="im-r" label="Corners" unit="" min={0} max={6} step={0.1} value={l.radius} def={1.2} set={(v) => set({ radius: v })} />
          <Row label="Hairline" htmlFor="im-hl">
            <Switch id="im-hl" on={!!l.hairline} onChange={(v) => set({ hairline: v })} />
          </Row>
        </div>
      </Section>
    </>
  )
}

function TextPanel(x: InspectorCtx & { scene: Scene; l: TextLayer }) {
  const { l } = x
  const set = layerSetter(x, x.scene, l)
  return (
    <>
      <Section title="Title">
        <textarea aria-label="Text" value={l.text} rows={2} onChange={(e) => set({ text: e.target.value })} className={`${field} block w-full resize-y px-2.5 py-2 text-body`} />
        <CopyLines {...x} pick={(text) => set({ text })} part={l.enter === "part"} />
        {x.scene.layers.some((b) => b.kind === "breakdown" && b.view === "focus") && <Hint>{"{part}"} is the name of the component in close-up, {"{note}"} what's in it.</Hint>}
        <div className="mt-2 space-y-1.5">
          <Row label="Face">
            <Segmented
              size="sm"
              label="Face"
              value={l.font ?? "text"}
              onChange={(v) => set({ font: v })}
              options={[
                { value: "text", label: "Text" },
                { value: "display", label: "Display" },
                { value: "serif", label: "Serif" },
                { value: "mono", label: "Label" },
              ]}
            />
          </Row>
          <SliderField id="tx-size" label="Size" unit="" min={0.8} max={20} step={0.1} value={l.size} def={6} set={(v) => set({ size: v })} />
          <Row label="Weight">
            <Segmented
              size="sm"
              label="Weight"
              value={String(l.weight)}
              onChange={(v) => set({ weight: Number(v) })}
              options={[
                { value: "450", label: "Regular" },
                { value: "550", label: "Medium" },
                { value: "650", label: "Bold" },
              ]}
            />
          </Row>
          <Row label="Align">
            <Segmented
              size="sm"
              label="Align"
              value={l.align}
              onChange={(v) => set({ align: v })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Centre" },
                { value: "right", label: "Right" },
              ]}
            />
          </Row>
          <Row label="Fill">
            <Segmented
              size="sm"
              label="Fill"
              value={l.paint ? "gradient" : "colour"}
              onChange={(v) => set({ paint: v === "gradient" ? [newPaint("linear", /^#[0-9a-f]{6}$/i.test(x.comp.brand?.accent ?? "") ? x.comp.brand!.accent : "#2563eb")].map((p) => ({ ...p, from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 }, stops: [{ at: 0, color: p.stops[0].color, alpha: 1 }, { at: 1, color: "#a855f7", alpha: 1 }] })) : undefined })}
              options={[
                { value: "colour", label: "Colour" },
                { value: "gradient", label: "Gradient" },
              ]}
            />
          </Row>
          {!l.paint && <ColourRow label="Colour" value={l.color} auto={isDark(x.comp.fill) ? "#fafafa" : "#0a0a0b"} set={(color) => set({ color })} />}
        </div>
        {l.paint && (
          <div className="mt-2.5">
            <PaintStack paints={l.paint} set={(paint) => set({ paint: paint.length ? paint : undefined })} aspect={4} accent={x.comp.brand?.accent ?? ""} base="" />
          </div>
        )}
      </Section>
    </>
  )
}

/** "for smarter group selfies" → "for smarter | group selfies" */
const splitHalf = (t: string) => {
  const w = t.trim().split(/\s+/)
  return w.length < 2 ? `${t} |` : `${w.slice(0, Math.ceil(w.length / 2)).join(" ")} | ${w.slice(Math.ceil(w.length / 2)).join(" ")}`
}

/** The copy writer's lines, to pick from. */
function CopyLines(x: InspectorCtx & { pick: (t: string) => void; part: boolean }) {
  const c = x.copy
  const lines = c ? [...new Set([x.part ? c.split : "", c.hook, c.name, ...c.features, c.tagline, x.part ? "" : c.split.replace(" | ", " "), c.proof, c.cta, c.kicker].filter(Boolean))] : []
  return (
    <div className="mt-2">
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {lines.map((t) => (
            <button key={t} type="button" onClick={() => x.pick(t)} className="press max-w-full truncate rounded-full px-2.5 py-1 text-caption text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg">
              {t}
            </button>
          ))}
        </div>
      )}
      <button type="button" disabled={x.writing} onClick={x.writeCopy} className="press flex items-center gap-1.5 text-caption font-medium text-fg-2 hover:text-fg disabled:opacity-60">
        <Sparkle size={13} aria-hidden />
        {x.writing ? "Reading the component…" : c ? `Write again${c.by === "claude" ? " (Claude)" : ""}` : "Write copy from the component"}
      </button>
    </div>
  )
}

/* ---------------- background ---------------- */

/** Every word in the film in one place (titles, labels, collaborators' names), scene by scene: a template is made
    yours here without finding each layer. Clicking a scene's name selects it. */
function WordsSection({ comp, setComp, setSel }: Pick<InspectorCtx, "comp" | "setComp" | "setSel">) {
  type Words = { layer: Layer; key: "text" | "sub" | "label"; label: string }
  const of = (l: Layer): Words[] =>
    l.kind === "text" ? [{ layer: l, key: "text", label: l.name ?? "Title" }] : l.kind === "callout" ? [{ layer: l, key: "text", label: "Callout" }, { layer: l, key: "sub", label: "Callout, the line under it" }] : l.kind === "cursor" ? [{ layer: l, key: "label", label: "Cursor's name" }] : []
  const scenes = comp.scenes.map((s) => ({ s, words: s.layers.flatMap(of) })).filter((x) => x.words.length)
  if (!scenes.length) return null
  const put = (sid: string, lid: string, key: Words["key"], v: string) =>
    setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id !== sid ? s : { ...s, layers: s.layers.map((l) => (l.id !== lid ? l : ({ ...l, [key]: v } as Layer))) })) }))
  return (
    <Section title="Words" aside={`${scenes.reduce((a, x) => a + x.words.length, 0)} in the film`}>
      <div className="space-y-3">
        {scenes.map(({ s, words }) => (
          <div key={s.id} className="space-y-1.5">
            <button type="button" onClick={() => setSel({ scene: s.id })} className="press block max-w-full truncate text-caption font-medium text-fg-3 hover:text-fg">
              {comp.scenes.indexOf(s) + 1} · {s.name}
            </button>
            {words.map((w) => (
              <textarea
                key={w.layer.id + w.key}
                rows={1}
                aria-label={`${s.name}: ${w.label}`}
                value={(w.layer as unknown as Record<string, string>)[w.key]}
                onChange={(e) => put(s.id, w.layer.id, w.key, e.target.value)}
                className={`${field} block w-full resize-none px-2.5 py-1.5 text-body [field-sizing:content]`}
              />
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

/** The look put on last, kept across visits to the panel, so it's marked and "In a case" can put it on again. */
let lastLook: { look: Look; seed: number } | null = null

function LookSection(x: InspectorCtx) {
  const { comp, setComp } = x
  // the screen in the first scene's primary device: what the film is about
  const first = comp.scenes.flatMap((s) => s.layers).find((l): l is DeviceLayer => l.kind === "device")
  const screen = first?.content.kind === "anim" ? first.content.id : x.liveAnim
  const found = useScreenAccents(screen)
  const anchors = [...(comp.brand?.accent ? [comp.brand.accent] : []), ...found]
  const [inCase, setInCase] = useState(() => comp.scenes.some((s) => s.layers.some((l) => l.kind === "device" && !!l.case)))
  const [cur, setCur] = useState(lastLook)
  const put = (look: Look, seed: number, withCase = inCase) => {
    lastLook = { look, seed }
    setCur(lastLook)
    const before = comp
    setComp((c) => applyLookComp(c, look, { inCase: withCase }))
    x.offerUndo?.(`Put on the ${HARMONIES.find((h) => h.id === look.harmony)?.name ?? ""} look`, before)
  }
  return (
    <Section title="Look" aside={found.length ? "matched to the screen" : undefined}>
      <LookPicker
        anchors={anchors}
        device={first?.device ?? "iphone"}
        current={cur ? { anchor: cur.look.anchor, harmony: cur.look.harmony, seed: cur.seed } : null}
        onApply={(k, seed) => put(k, seed)}
        inCase={inCase}
        setInCase={(v) => {
          setInCase(v)
          if (cur) put(cur.look, cur.seed, v)
        }}
        hint="One look sets the ground and its drifting lights, the light on the devices, each device's finish (or a case) and the titles' colours, for every scene. Undo puts it back."
      />
    </Section>
  )
}

function BackgroundPanel(x: InspectorCtx) {
  const { comp, setComp } = x
  const set = (patch: Partial<Comp>) => setComp((c) => ({ ...c, ...patch }))
  const custom = !BACKDROPS.some((b) => b.id === comp.fill)
  const light = LIGHTS.find((l) => l.id === comp.light)
  const learned = learnedCount()
  return (
    <>
      <LookSection {...x} />
      <WordsSection comp={comp} setComp={setComp} setSel={x.setSel} />
      <Section title="Director" aside={comp.auto ? "on" : "off"}>
        <Row label="Pick each scene's background" htmlFor="bg-auto">
          <Switch id="bg-auto" on={!!comp.auto} onChange={(v) => set({ auto: v })} />
        </Row>
        <Hint keep={learned > 0}>
          Reads what's in each scene and chooses its ground (a dark room for a reveal, paper for a feature, a drawing for a teardown, the brand for the end), then blends one into the next.
          {learned > 0 && (
            <>
              {" "}
              It has learned from {learned} of your picks.{" "}
              <button type="button" onClick={() => (forget(), set({}))} className="press font-medium text-fg underline decoration-fg-3 underline-offset-4">
                Forget them
              </button>
            </>
          )}
        </Hint>
      </Section>
      <Section title="Brand" aside={comp.brand?.name || (comp.brand ? "set" : "none")}>
        {comp.brand ? (
          <>
            <div className="flex items-center gap-1.5">
              {(["bg", "surface", "ink", "muted", "accent"] as const).map((k) => (
                <span key={k} title={`${k}: ${comp.brand![k]}`} className="h-7 flex-1 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: comp.brand![k] }} />
              ))}
            </div>
            <p className="mt-2 truncate text-caption text-fg-3">
              {comp.brand.font || "Geist"}
              {comp.brand.display && comp.brand.display !== comp.brand.font ? ` · ${comp.brand.display}` : ""} · {comp.brand.dark ? "dark" : "light"} ground
            </p>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" onClick={x.openBrand}>
                <Palette size={14} aria-hidden />
                Change
              </Button>
              <Button size="sm" variant="ghost" onClick={() => set({ brand: undefined })}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button className="w-full" onClick={x.openBrand}>
              <Palette size={15} aria-hidden />
              Use your design system
            </Button>
            <Hint>Drop its CSS, Tailwind config, tokens or a screenshot: the film takes its colours and type.</Hint>
          </>
        )}
      </Section>
      <Section title="Background" aside={custom ? "Custom" : BACKDROPS.find((b) => b.id === comp.fill)?.name}>
        <div role="radiogroup" aria-label="Background" className="grid grid-cols-6 gap-2">
          {BACKDROPS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={comp.fill === b.id}
              aria-label={b.name}
              title={`${b.name} · drag it onto the stage too`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/x-fill", b.id)}
              onClick={() => set({ fill: b.id })}
              className={`press aspect-square rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] ${swatch(comp.fill === b.id)}`}
              style={{ background: b.id === "transparent" ? CHECKER : b.css }}
            />
          ))}
        </div>
        <div className="mt-2.5">
          <ColourRow label="Your own colour" value={custom ? comp.fill : ""} auto={fillCss(comp.fill).startsWith("#") ? fillCss(comp.fill) : "#e8e8ec"} set={(v) => set({ fill: v || "studio" })} />
        </div>
      </Section>
      <Section title="Gradients" aside={comp.paint?.length ? "over the background" : undefined}>
        <GradientMaker idp="cgm" accent={comp.brand?.accent ?? ""} onMake={(paint) => set({ fill: groundOfStack(paint), paint })} />
        <div className="mt-3" />
        <PaintStack
          paints={comp.paint ?? []}
          set={(paint) => set({ paint: paint.length ? paint : undefined })}
          aspect={(SIZES.find((x) => x.id === comp.size) ?? SIZES[0]).w / (SIZES.find((x) => x.id === comp.size) ?? SIZES[0]).h}
          accent={comp.brand?.accent ?? ""}
          base={fillCss(comp.fill)}
        />
      </Section>
      <Section title="Effect">
        <Choices label="Effect" value={comp.effect} options={EFFECTS} set={(effect) => set({ effect })} show={7} />
        {comp.effect !== "none" && (
          <div className="mt-2.5 space-y-1.5">
            <SliderField id="bg-amt" label="Amount" unit="%" min={0} max={100} step={1} value={Math.round(comp.amount * 100)} def={50} set={(v) => set({ amount: v / 100 })} />
            <ColourRow label="Effect colour" value={comp.ink} auto={isDark(comp.fill) ? "#ffffff" : "#000000"} set={(ink) => set({ ink })} />
          </div>
        )}
      </Section>
      <Section title="Effects on every scene" aside={anyFx(comp.fx) ? "on" : undefined}>
        <FxFields fx={comp.fx ?? {}} set={(fx) => set({ fx: anyFx(fx) ? fx : undefined })} idp="cfx" />
      </Section>
      <Section title="Light">
        <Choices label="Light" value={comp.light} options={LIGHTS} set={(l) => set({ light: l })} cols={3} />
        <Hint>{light?.hint}</Hint>
        <div className="mt-2.5 space-y-1.5">
          <Row label="Shadow" htmlFor="bg-shadow">
            <Switch id="bg-shadow" on={comp.shadow} onChange={(v) => set({ shadow: v })} />
          </Row>
          <SliderField id="bg-refl" label="Glass reflections" unit="×" min={0} max={2} step={0.05} value={comp.reflections} def={1} set={(v) => set({ reflections: v })} />
        </div>
      </Section>
    </>
  )
}

/* ---------------- the brand ---------------- */

const BRAND_KEYS: { k: keyof Brand; name: string }[] = [
  { k: "bg", name: "Ground" },
  { k: "surface", name: "Surface" },
  { k: "ink", name: "Ink" },
  { k: "muted", name: "Muted" },
  { k: "accent", name: "Accent" },
  { k: "onAccent", name: "On accent" },
]

/** Drop a design system (or paste it): what it reads, to check and adjust, then use. */
export function BrandDialog({ open, onClose, brand, onUse }: { open: boolean; onClose: () => void; brand?: Brand; onUse: (b: Brand) => void }) {
  const [draft, setDraft] = useState<Brand | null>(brand ?? null)
  const [files, setFiles] = useState<string[]>([])
  const [paste, setPaste] = useState("")
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const take = async (list: File[], text = paste) => {
    setBusy(true)
    try {
      setDraft(await brandFrom(list, text))
      if (list.length) setFiles(list.map((f) => f.name))
    } finally {
      setBusy(false)
    }
  }
  const up = (k: keyof Brand, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  return (
    <Dialog open={open} onClose={onClose} label="Your design system" className="modal">
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between border-b py-3 pl-5 pr-3">
          <div>
            <h2 className="text-ui font-semibold">Your design system</h2>
            <p className="text-caption text-fg-3">The film takes its colours and type: grounds, ink, the accent for names and labels, its fonts.</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="scroll-thin min-h-0 space-y-3 overflow-y-auto p-4">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void take([...e.dataTransfer.files])
            }}
            className={`press flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center ${over ? "border-fg bg-surface-2" : "border-line-strong hover:bg-surface-2"}`}
          >
            <UploadSimple size={22} aria-hidden className="text-fg-2" />
            <span className="text-body font-medium">{busy ? "Reading…" : files.length ? files.join(", ") : "Drop files, or choose them"}</span>
            <span className="text-caption text-fg-3">globals.css · tailwind.config · tokens.json · theme.ts · a page's HTML · a screenshot</span>
            <input type="file" multiple accept=".css,.scss,.json,.js,.ts,.mjs,.cjs,.html,.txt,image/*" className="sr-only" onChange={(e) => void take([...(e.target.files ?? [])])} />
          </label>
          <textarea
            aria-label="Or paste it"
            placeholder="…or paste CSS variables, a Tailwind theme or tokens"
            rows={3}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onBlur={() => paste.trim() && void take([], paste)}
            className={`${field} block w-full resize-y px-2.5 py-2 text-body`}
          />
          {draft && (
            <div className="space-y-2.5 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line-strong)]">
              <div className="grid grid-cols-3 gap-2">
                {BRAND_KEYS.map(({ k, name }) => (
                  <label key={k} className="flex items-center gap-2 text-caption text-fg-2">
                    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style={{ background: String(draft[k]) }}>
                      <input type="color" value={String(draft[k])} onChange={(e) => up(k, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={name} />
                    </span>
                    {name}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["font", "display", "mono"] as const).map((k) => (
                  <input key={k} aria-label={`${k} font`} placeholder={k === "font" ? "Text font" : k === "display" ? "Display font" : "Mono font"} value={draft[k]} onChange={(e) => up(k, e.target.value)} className={`${field} h-8 w-full px-2 text-caption`} />
                ))}
              </div>
              <input aria-label="Product name" placeholder="Product name" value={draft.name} onChange={(e) => up("name", e.target.value)} className={`${field} h-8 w-full px-2.5 text-body`} />
              {/* how it reads: the name in the display face, a line, the accent as a button */}
              <div className="rounded-lg p-4" style={{ background: draft.bg, color: draft.ink }}>
                <p className="m-0 text-[26px] font-bold leading-none" style={{ fontFamily: `"${draft.display || draft.font}", Geist, sans-serif`, letterSpacing: "-0.04em" }}>
                  {draft.name || "Your product"}
                </p>
                <p className="m-0 mt-1.5 text-[13px]" style={{ color: draft.muted, fontFamily: `"${draft.font}", Geist, sans-serif` }}>
                  Feature lines, labels and the end card take these.
                </p>
                <span className="mt-3 inline-block rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: draft.accent, color: draft.onAccent }}>
                  Try it now
                </span>
              </div>
              {contrast(draft.ink, draft.bg) < 4.5 && (
                <p className="flex items-center gap-1.5 text-caption text-fg-2">
                  <WarningCircle size={14} aria-hidden className="text-bad-ink" />
                  Ink on ground is {contrast(draft.ink, draft.bg).toFixed(1)}:1; titles want 4.5:1 or more.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!draft} onClick={() => draft && (onUse(draft), onClose())}>
            <MagicWand size={14} aria-hidden />
            Use it
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------- the Export popover ---------------- */

/** The film's sound: a song (its tempo and beats read here, in the browser), where in it the film starts, the scenes
    cut on its beats, and sound design on the cuts. Made into the export; the song plays with the film in the Studio. */
function Sound({ comp, set }: { comp: Comp; set: (patch: Partial<Comp>) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pick = useRef<HTMLInputElement>(null)
  const m = comp.music
  const add = async (f: File) => {
    setBusy(true)
    setError("")
    try {
      const read = await analyseSong(f)
      const url = await serverMedia(URL.createObjectURL(f))
      set({ music: { url, name: f.name.replace(/\.[^.]+$/, ""), offset: 0, bpm: read.bpm, beats: read.beats, hits: read.hits } })
    } catch (e) {
      setError(`Couldn't read that song: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  // every cut onto the nearest beat, each scene within what it can be retimed to
  const snap = () => {
    if (!m?.beats?.length) return
    const beats = m.beats.map((b) => b - (m.offset ?? 0)).filter((b) => b > 0)
    const range = (i: number): [number, number] => {
      const l = comp.scenes[i].layers.find((x) => x.kind === "component" && x.from !== undefined)
      const shot = l && l.kind === "component" ? LIBRARY.find((x) => x.film === l.anim && Math.abs(x.at - (l.from ?? 0)) < 0.05) : undefined
      return shot ? shot.stretch : [0.5, 60]
    }
    const durs = snapToBeats(comp.scenes.map((x) => x.duration), beats, range)
    set({ scenes: comp.scenes.map((x, i) => retimed(x, durs[i])) })
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-fg-2">Song</span>
        {m ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-caption text-fg-2" title={m.name}>
              {m.name}
              {m.bpm ? ` · ${m.bpm} bpm` : ""}
            </span>
            <IconButton size="sm" label="Take the song out" onClick={() => set({ music: undefined })}>
              <X size={13} />
            </IconButton>
          </span>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => pick.current?.click()}>
            {busy ? "Reading its beats…" : "Add a song"}
          </Button>
        )}
        <input ref={pick} type="file" accept="audio/*" hidden onChange={(e) => (e.target.files?.[0] && void add(e.target.files[0]), (e.target.value = ""))} />
      </div>
      {m && (
        <>
          <SliderField id="song-offset" label="The film starts at" unit="s" min={0} max={120} step={0.1} value={m.offset ?? 0} def={0} set={(v) => set({ music: { ...m, offset: v } })} hint="Where in the song the film begins." />
          <Button size="sm" className="w-full" disabled={!m.beats?.length} onClick={snap}>
            Cut the scenes on its beats
          </Button>
        </>
      )}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="export-sfx" className="text-body text-fg-2">
          Sound on the cuts
        </label>
        <Switch id="export-sfx" on={!!comp.sfx} onChange={(v) => set({ sfx: v || undefined })} />
      </div>
      {comp.sfx && <p className="text-caption text-fg-3">A whoosh on a whip, a riser into a zoom or flash, a low knock on a hard cut: made for the film, nothing licensed.</p>}
      {error && <p role="alert" className="text-caption text-fg-2">{error}</p>}
    </div>
  )
}

/** The film in another shape (re-framed: each shot slides to its action) or cut down to a length (what matters most
    kept, each retimed). Both are ordinary changes: Undo takes them back. */
/** Where the film is going: each place's frame, frame rate and longest length (re-framed to fit, and cut down when
    it runs over). */
const PLATFORMS = [
  { id: "reels", name: "Reels, TikTok, Shorts", size: "9x16", max: 60 },
  { id: "linkedin", name: "LinkedIn", size: "1x1", max: 600 },
  { id: "instagram", name: "Instagram feed", size: "4x5", max: 60 },
  { id: "x", name: "X", size: "16x9", max: 140 },
  { id: "youtube", name: "YouTube, Product Hunt", size: "16x9", max: 600 },
  { id: "app-store", name: "App Store preview", size: "app-store", max: 30 },
]
function Platform({ comp, set }: { comp: Comp; set: (patch: Partial<Comp>) => void }) {
  const [pick, setPick] = useState("")
  const p = PLATFORMS.find((x) => x.id === pick)
  const long = p && total(comp) > p.max
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="export-for" className="text-body text-fg-2">
          For
        </label>
        <Select
          id="export-for"
          value={pick}
          onChange={(e) => {
            const next = PLATFORMS.find((x) => x.id === e.target.value)
            setPick(e.target.value)
            if (next) set({ ...(next.size !== comp.size ? reframe(comp, next.size, LIBRARY, FOCUS as Focus) : {}), fps: 30 })
          }}
          className={`${field} h-7 w-[188px] cursor-pointer px-2 text-body`}
        >
          <option value="">Anywhere</option>
          {PLATFORMS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </div>
      {long && (
        <p className="flex items-center justify-between gap-2 text-caption text-fg-2">
          {p.name} takes up to {p.max} s; this runs {total(comp).toFixed(1)}.
          <Button
            size="sm"
            onClick={() => {
              const { keep, durations } = cutdown(comp, p.max, LIBRARY)
              set({ scenes: keep.map((i, j) => retimed(comp.scenes[i], durations[j])) })
            }}
          >
            Cut to {p.max} s
          </Button>
        </p>
      )}
    </div>
  )
}

function Versions2({ comp, set }: { comp: Comp; set: (patch: Partial<Comp>) => void }) {
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-fg-2">Re-frame it</span>
        <span className="flex gap-1">
          {(["16x9", "1x1", "9x16"] as const).map((sz) => (
            <Button key={sz} size="sm" variant={comp.size === sz ? "secondary" : "ghost"} disabled={comp.size === sz} onClick={() => set(reframe(comp, sz, LIBRARY, FOCUS as Focus))}>
              {sz.replace("x", ":")}
            </Button>
          ))}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-fg-2">Cut it down</span>
        <span className="flex gap-1">
          {[6, 15, 30].map((sec) => (
            <Button
              key={sec}
              size="sm"
              variant="ghost"
              disabled={total(comp) <= sec + 0.5}
              onClick={() => {
                const { keep, durations } = cutdown(comp, sec, LIBRARY)
                set({ scenes: keep.map((i, j) => retimed(comp.scenes[i], durations[j])) })
              }}
            >
              {sec} s
            </Button>
          ))}
        </span>
      </div>
    </div>
  )
}

export function StudioExport({ comp, set, scene, exporting, onExport, onWeb }: { comp: Comp; set: (patch: Partial<Comp>) => void; scene: Scene; exporting: ExportState; onExport: (kind: ExportKind, draft?: boolean) => void; /** the film as a page on a site: its embed settings and code */ onWeb: () => void }) {
  const size = SIZES.find((x) => x.id === comp.size) ?? SIZES[0]
  const busy = exporting.phase === "working"
  const alpha = comp.fill === "transparent"
  // (a film saved while Export also made web pages is a video)
  const kind: ExportKind = comp.kind === "png" ? "png" : "video"
  const video = kind === "video"
  const len = total(comp)
  return (
    <div className="scroll-thin max-h-[calc(100dvh-72px)] w-[320px] max-w-[calc(100vw-16px)] overflow-y-auto p-3">
      <Segmented<ExportKind>
        full
        label="Format"
        value={kind}
        onChange={(k) => set({ kind: k })}
        options={[
          { value: "png", label: "Image", icon: ImageSquare },
          { value: "video", label: "Video", icon: FilmStrip },
        ]}
      />
      <div className="mt-3.5 space-y-3">
        {video && <Platform comp={comp} set={set} />}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="export-size" className="text-body text-fg-2">
            Size
          </label>
          <Select id="export-size" value={comp.size} onChange={(e) => set({ size: e.target.value })} className={`${field} h-7 w-[188px] cursor-pointer px-2 text-body`}>
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.w}×{s.h}
              </option>
            ))}
          </Select>
        </div>
        {video && (
          <>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="export-blur" className="text-body text-fg-2">
                Motion blur
              </label>
              <Switch id="export-blur" on={!!comp.blur} onChange={(v) => set({ blur: v || undefined })} />
            </div>
            <SliderField id="export-ghost" label="Ghost trails" unit="%" min={0} max={100} step={1} value={Math.round((comp.ghost ?? 0) * 100)} def={0} set={(v) => set({ ghost: v / 100 || undefined })} hint="Bright things leave fading trails." />
          </>
        )}
        {video && <Versions2 comp={comp} set={set} />}
        {video && <Sound comp={comp} set={set} />}
        {video && (
          <div className="flex items-center justify-between gap-3">
            <span id="export-fps" className="text-body text-fg-2">
              Frame rate
            </span>
            <Segmented<number> size="sm" labelledBy="export-fps" value={comp.fps} onChange={(v) => set({ fps: v === 60 ? 60 : 30 })} options={[{ value: 30, label: "30 fps" }, { value: 60, label: "60 fps" }]} />
          </div>
        )}
      </div>
      <p className="mt-3 text-caption text-fg-3">
        {size.hint}.{" "}
        {video
          ? `All ${comp.scenes.length} scene${comp.scenes.length > 1 ? "s" : ""}, ${len.toFixed(1)} s at ${comp.fps} fps, ${alpha ? "ProRes 4444 with alpha (.mov)" : "H.264 (.mp4)"}.${comp.blur ? " Motion blur films each frame four times, so it takes four times as long." : ""}`
          : `“${scene.name}”, settled, as a PNG${alpha ? " with a transparent background" : ""}.`}
      </p>
      <Button variant="primary" className="mt-3 w-full" disabled={busy} onClick={() => onExport(kind)}>
        {video ? <FilmStrip size={15} aria-hidden /> : <ImageSquare size={15} aria-hidden />}
        {busy ? "Rendering…" : video ? "Export video" : "Export image"}
      </Button>
      {/* the film as it will render, quickly: the same renderer, half the size, no blur, a fast encode */}
      {video && (
        <Button variant="ghost" className="mt-1.5 w-full" disabled={busy} onClick={() => onExport(kind, true)}>
          Quick draft, half size
        </Button>
      )}
      <ExportStatus state={exporting} />
      {video && <FilmReview key={exporting.phase === "done" ? `done-${exporting.file}` : "idle"} comp={comp} done={exporting.phase === "done"} />}
      <button type="button" onClick={onWeb} className="press mt-3 flex w-full items-center gap-2 rounded-md border-t pt-3 text-left text-caption text-fg-2 hover:text-fg">
        <CursorClick size={15} aria-hidden className="shrink-0 text-k-motion" />
        <span className="flex-1">For a site: a page that plays by itself, on every screen</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  )
}

/** The film's best three stills for a thumbnail (sharp, full of detail, away from a cut), each to download. */
function Thumbs({ id }: { id: string }) {
  const [list, setList] = useState<{ t: number; url: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (!list)
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => (setBusy(true), void fetch(`/__studio/jobs/${id}/thumbs`).then((r) => r.json()).then(setList, () => setBusy(false)))}>
        {busy ? "Finding its best frames…" : "Best thumbnails"}
      </Button>
    )
  return (
    <div className="grid w-full grid-cols-3 gap-1.5">
      {list.map((x, i) => (
        <a key={i} href={x.url} download={`thumbnail-${i + 1}.png`} title={`${x.t} s · download`} className="press block overflow-hidden rounded-md">
          <img src={x.url} alt={`A still at ${x.t} s`} className="block max-h-32 w-full bg-black object-contain" />
        </a>
      ))}
    </div>
  )
}

/** A review link for the exported film: others watch it and leave notes at a moment and a spot (review.html). */
function ShareReview({ id, name }: { id: string; name: string }) {
  const [link, setLink] = useState("")
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  if (link)
    return (
      <a href={link} target="_blank" rel="noreferrer" title={link} className="press inline-flex h-7 items-center rounded-md px-2 text-caption text-sel-ink hover:bg-surface-2">
        {copied ? "Review link copied · open it" : "Open the review link"}
      </a>
    )
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void fetch("/__review/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job: id, name: name.replace(/\.[^.]+$/, "") }) })
          .then((r) => r.json() as Promise<{ id?: string }>)
          .then((r) => {
            if (!r.id) return setBusy(false)
            const url = `${location.origin}/review.html#${r.id}`
            void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})
            setLink(url)
          }, () => setBusy(false))
      }}
    >
      {busy ? "Making a link…" : "Share for review"}
    </Button>
  )
}

function ExportStatus({ state }: { state: ExportState }) {
  if (state.phase === "idle") return null
  if (state.phase === "error") return <Problem compact error={state.message} className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5" />
  if (state.phase === "done")
    return (
      <div className="mt-2.5 space-y-1">
        <p role="status" className="flex items-center gap-1.5 text-caption text-fg-2">
          <DownloadSimple size={14} aria-hidden /> Downloaded {state.file}
          {state.checks && <span className="text-fg-3">· {state.checks.pass ? "the file checks out" : "the file has problems"}</span>}
        </p>
        {state.kind === "video" && state.id && (
          <div className="flex flex-wrap gap-1.5">
            <Thumbs id={state.id} />
            <ShareReview id={state.id} name={state.file} />
          </div>
        )}
        {/* the file itself, checked: frame rate and count, colour tags, black or frozen stretches, flashes, loudness */}
        {state.checks?.findings.filter((f) => f.level !== "info").map((f, i) => (
          <p key={i} className="flex items-start gap-1.5 text-caption text-fg-2">
            <WarningCircle size={14} aria-hidden className={`mt-px shrink-0 ${f.level === "error" ? "text-bad-ink" : "text-warn-ink"}`} />
            {f.text}
          </p>
        ))}
      </div>
    )
  const pct = state.total > 1 ? state.done / state.total : undefined
  return (
    <div className="mt-3 rounded-xl bg-subtle p-3">
      <Making size="sm" progress={pct} quotes={false} detail={state.total > 1 ? `${Math.round((pct ?? 0) * 100)}% · frame ${state.done} of ${state.total}` : state.label} />
    </div>
  )
}
