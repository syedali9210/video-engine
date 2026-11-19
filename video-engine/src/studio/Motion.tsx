// Studio — a layer's Design and Animate tabs, the way Raylight splits them. Design: where it is and how it looks at
// rest (aligned to the frame, placed, turned, tilted back into the frame, faded, blurred, a selection frame). Animate:
// its In (a preset, when, how long, on what curve), its Out, and its animation blocks — a property moving between two
// values at a time, for a while, on a curve. The same blocks sit on the timeline's lanes, where they drag and stretch.
import { useEffect, useState, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, X } from "@phosphor-icons/react"
import { EASINGS, EaseEditor, SliderField, field } from "../controls"
import { IconButton, MenuItem, Popover, Segmented, Switch, closePopover, Select } from "../ui"
import { ENTERS, PROPS, TEXT_ENTERS, tween, type Box, type CursorLayer, type Enter, type MovingLayer, type Prop, type Scene, type ShapeLayer, type TextEnter, type TextLayer, type Tween } from "./comp"
import { AnimSample } from "./Kit"
import { TEXT_ANIM, TEXT_ANIMS, type TextAnim } from "./textanim"
import { SIZES } from "./config"
import { PaintStack } from "./PaintEditor"

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const r2 = (x: number) => Math.round(x * 100) / 100

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="insp-section px-4 pb-5 pt-3.5">
      <h3 className="flex min-h-6 items-center justify-between pb-2 text-[12.5px] font-semibold text-fg-2">
        {title}
        {aside && <span className="font-normal">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}
const Row = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
  <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
    <label htmlFor={htmlFor} className="text-body text-fg-2">
      {label}
    </label>
    {children}
  </div>
)

/** A number typed in, with its unit: `scale` maps the stored value to the shown one (0.08 → 8 %). */
export function Num({ label, value, set, unit = "", scale = 1, step = 1, min = -Infinity, max = Infinity, w = 64 }: { label: string; value: number; set: (v: number) => void; unit?: string; scale?: number; step?: number; min?: number; max?: number; w?: number }) {
  const shown = r2(value * scale)
  const [draft, setDraft] = useState(String(shown))
  useEffect(() => setDraft(String(shown)), [shown])
  const put = (v: number) => set(clamp(v, min, max) / scale)
  return (
    <label className={`${field} flex h-7 items-center px-1.5 text-caption tabular-nums`} style={{ width: w }}>
      <span className="sr-only">{label}</span>
      <input
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() && Number.isFinite(n)) put(n)
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
          e.preventDefault()
          put(shown + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1))
        }}
        onBlur={() => setDraft(String(shown))}
        className="w-full min-w-0 bg-transparent text-right outline-none"
      />
      {unit && (
        <span aria-hidden className="pl-0.5 text-fg-3">
          {unit}
        </span>
      )}
    </label>
  )
}

/** A curve: the presets as a list, and your own drawn on a square under "Custom". */
export function EaseField({ id, value, set, fallback }: { id: string; value: string | undefined; set: (v: string | undefined) => void; fallback: string }) {
  const [open, setOpen] = useState(false)
  const name = value ? (EASINGS.find(([, v]) => v === value)?.[0] ?? "Custom") : fallback
  return (
    <div>
      <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
        <label htmlFor={id} className="text-body text-fg-2">
          Easing
        </label>
        <span className="flex items-center gap-1">
          <Select
            id={id}
            value={name}
            onChange={(e) => {
              const v = e.target.value
              if (v === fallback) set(undefined)
              else if (v === "Custom") setOpen(true)
              else set(EASINGS.find(([n]) => n === v)![1])
            }}
            className={`${field} h-7 w-[132px] cursor-pointer px-2 text-body`}
          >
            <option>{fallback}</option>
            {EASINGS.map(([n]) => (
              <option key={n}>{n}</option>
            ))}
            <option>Custom</option>
          </Select>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="press rounded px-1.5 text-caption font-medium text-fg-2 hover:text-fg">
            Curve
          </button>
        </span>
      </div>
      {open && (
        <div className="mt-2 pl-2.5">
          <EaseEditor id={`${id}-ed`} value={value ?? "cubic-bezier(0.23, 1, 0.32, 1)"} set={set} size={150} />
        </div>
      )}
    </div>
  )
}

/* ---------------- Design ---------------- */

type Setter<L> = (patch: Partial<L>) => void

/** The frame's shape (width over height) for aligning by height. */
const frameAspect = (size: string) => {
  const s = SIZES.find((x) => x.id === size) ?? SIZES[0]
  return s.w / s.h
}
/** How tall a layer is, as a share of the frame's height, where it knows (a title doesn't, before it's laid out). */
const heightOf = (l: MovingLayer, fa: number) => ("aspect" in l && l.aspect ? (l.box.w * fa) / l.aspect : l.kind === "text" ? 0.12 : 0.05)

export function DesignSection({ l, set, size }: { l: MovingLayer; set: Setter<MovingLayer>; size: string }) {
  const fa = frameAspect(size)
  const b = l.box
  const put = (patch: Partial<Box>) => set({ box: { ...b, ...patch } })
  const h = heightOf(l, fa)
  const align: [string, () => void][] = [
    ["Align left", () => put({ x: b.w / 2 })],
    ["Align centre", () => put({ x: 0.5 })],
    ["Align right", () => put({ x: 1 - b.w / 2 })],
    ["Align top", () => put({ y: h / 2 })],
    ["Align middle", () => put({ y: 0.5 })],
    ["Align bottom", () => put({ y: 1 - h / 2 })],
  ]
  const icon = (i: number) => {
    // a bar and a line: where it lands
    const v = i < 3
    const at = (i % 3) * 5 + 3
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
        {v ? <line x1={at} y1="2" x2={at} y2="14" stroke="currentColor" strokeWidth="1.4" /> : <line x1="2" y1={at} x2="14" y2={at} stroke="currentColor" strokeWidth="1.4" />}
        {v ? <rect x={i === 0 ? at : i === 1 ? at - 3 : at - 6} y="5" width="6" height="6" rx="1" fill="currentColor" opacity=".55" /> : <rect x="5" y={i === 3 ? at : i === 4 ? at - 3 : at - 6} width="6" height="6" rx="1" fill="currentColor" opacity=".55" />}
      </svg>
    )
  }
  const isCursor = l.kind === "cursor"
  return (
    <>
      <Section title="Position">
        <div role="group" aria-label="Align in the frame" className="mb-2 grid grid-cols-6 gap-1">
          {align.map(([label, run], i) => (
            <button key={label} type="button" title={label} aria-label={label} onClick={run} className="press grid h-7 place-items-center rounded-md text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg">
              {icon(i)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <SliderField id={`d-x-${l.id}`} label="Across" unit="%" min={-20} max={120} step={0.5} value={r2(b.x * 100)} def={50} set={(v) => put({ x: v / 100 })} />
          <SliderField id={`d-y-${l.id}`} label="Down" unit="%" min={-20} max={120} step={0.5} value={r2(b.y * 100)} def={50} set={(v) => put({ y: v / 100 })} />
          {!isCursor && <SliderField id={`d-w-${l.id}`} label={l.kind === "text" ? "Width" : "Size"} unit="%" min={2} max={200} step={0.5} value={r2(b.w * 100)} set={(v) => put({ w: v / 100 })} />}
          {!isCursor && <SliderField id={`d-r-${l.id}`} label="Rotation" unit="°" min={-180} max={180} step={1} value={Math.round(l.rot ?? 0)} def={0} set={(v) => set({ rot: v || undefined })} />}
        </div>
      </Section>
      {!isCursor && (
        <Section title="Tilt" aside="leans it back into the frame">
          <div className="space-y-1.5">
            <SliderField id={`d-tx-${l.id}`} label="Tilt X" unit="°" min={-80} max={80} step={1} value={Math.round(l.tilt?.x ?? 0)} def={0} set={(v) => set({ tilt: v || l.tilt?.y ? { x: v, y: l.tilt?.y ?? 0 } : undefined })} />
            <SliderField id={`d-ty-${l.id}`} label="Tilt Y" unit="°" min={-80} max={80} step={1} value={Math.round(l.tilt?.y ?? 0)} def={0} set={(v) => set({ tilt: v || l.tilt?.x ? { x: l.tilt?.x ?? 0, y: v } : undefined })} />
          </div>
        </Section>
      )}
      <Section title="Appearance">
        <div className="space-y-1.5">
          <SliderField id={`d-o-${l.id}`} label="Opacity" unit="%" min={0} max={100} step={1} value={Math.round((l.opacity ?? 1) * 100)} def={100} set={(v) => set({ opacity: v >= 100 ? undefined : v / 100 })} />
          <SliderField id={`d-b-${l.id}`} label="Blur" unit="" min={0} max={6} step={0.05} value={r2(l.blur ?? 0)} def={0} set={(v) => set({ blur: v || undefined })} hint="In hundredths of the frame's width." />
          {(l.kind === "image" || l.kind === "component") && (
            <Row label="Selection frame" htmlFor={`d-f-${l.id}`}>
              <Switch id={`d-f-${l.id}`} on={l.frame === "selection"} onChange={(v) => set({ frame: v ? "selection" : undefined } as Partial<MovingLayer>)} />
            </Row>
          )}
        </div>
      </Section>
    </>
  )
}

/* ---------------- Animate ---------------- */

const OUTS: { id: Enter; name: string }[] = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade" },
  { id: "rise", name: "Rise" },
  { id: "scale", name: "Scale" },
  { id: "blur", name: "Blur" },
]
/** A new block for a property: a sensible move into the layer's place, starting with its In. */
function fresh(prop: Prop, at: number): Tween {
  const from: Record<Prop, number[]> = { position: [0, 0.06], scale: [0.85], rotate: [-10], opacity: [0], blur: [1.5], tilt: [35, 0] }
  return tween(prop, r2(at), 0.8, from[prop], PROPS.find((p) => p.id === prop)!.rest)
}

export function AnimateSection({ l, set, scene, auto }: { l: MovingLayer; set: Setter<MovingLayer>; scene: Scene; auto: number }) {
  const D = scene.duration
  const inAt = l.entry?.at ?? auto
  const inDur = l.entry?.dur ?? 0.9
  const presets = l.kind === "text" ? TEXT_ENTERS : ENTERS
  const out = l.exit
  const tweens = l.tweens ?? []
  const putTween = (id: string, patch: Partial<Tween>) => set({ tweens: tweens.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  const menu = `add-anim-${l.id}`
  return (
    <>
      <Section title="In" aside={l.entry ? undefined : "auto timing"}>
        <Select
          aria-label="How it comes in"
          value={l.enter}
          onChange={(e) => set({ enter: e.target.value as Enter & TextEnter })}
          className={`${field} h-8 w-full cursor-pointer px-2.5 text-body`}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {l.kind === "text" && <TitleAnimPicker id={l.id} current={l.enter === "custom" ? (l.animation ?? TEXT_ANIM) : undefined} onPick={(animation) => (set as Setter<TextLayer>)({ enter: "custom", animation })} />}
        {l.enter !== "none" && (
          <div className="mt-2 space-y-1.5">
            <SliderField id={`a-in-at-${l.id}`} label="Starts at" unit="s" min={0} max={Math.max(0.1, D)} step={0.05} value={r2(inAt)} def={r2(auto)} set={(v) => set({ entry: { at: v, dur: inDur, ease: l.entry?.ease } })} />
            {!(l.kind === "text" && l.enter === "custom") && (
              <>
                <SliderField id={`a-in-dur-${l.id}`} label="Lasts" unit="s" min={0.05} max={6} step={0.05} value={r2(inDur)} def={0.9} set={(v) => set({ entry: { at: inAt, dur: v, ease: l.entry?.ease } })} />
                <EaseField id={`a-in-ease-${l.id}`} value={l.entry?.ease} set={(ease) => set({ entry: { at: inAt, dur: inDur, ease } })} fallback="The preset's" />
              </>
            )}
            {l.entry && (
              <button type="button" onClick={() => set({ entry: undefined })} className="press pl-2.5 text-caption font-medium text-fg-2 underline decoration-fg-3 underline-offset-4 hover:text-fg">
                Back to auto timing
              </button>
            )}
          </div>
        )}
      </Section>

      {l.kind === "text" && l.enter === "custom" && <TitleAnimSection l={l} set={set as Setter<TextLayer>} />}

      <Section title="Out">
        <Segmented
          full
          size="sm"
          label="How it goes"
          value={out?.kind ?? "none"}
          onChange={(kind) => set({ exit: kind === "none" ? undefined : { kind, at: out?.at ?? r2(Math.max(0, D - 0.6)), dur: out?.dur ?? 0.5, ease: out?.ease } })}
          options={OUTS.map((o) => ({ value: o.id, label: o.name }))}
        />
        {out && (
          <div className="mt-2 space-y-1.5">
            <SliderField id={`a-out-at-${l.id}`} label="Starts at" unit="s" min={0} max={Math.max(0.1, D)} step={0.05} value={r2(out.at)} set={(v) => set({ exit: { ...out, at: v } })} />
            <SliderField id={`a-out-dur-${l.id}`} label="Lasts" unit="s" min={0.05} max={4} step={0.05} value={r2(out.dur)} def={0.5} set={(v) => set({ exit: { ...out, dur: v } })} />
            <EaseField id={`a-out-ease-${l.id}`} value={out.ease} set={(ease) => set({ exit: { ...out, ease } })} fallback="Ease in-out" />
          </div>
        )}
      </Section>

      <Section
        title="Animations"
        aside={
          <>
            <IconButton size="sm" label="Add an animation" popover={menu}>
              <Plus size={14} />
            </IconButton>
            <Popover id={menu} align="end" label="Add an animation">
              <div className="w-[200px] p-1.5">
                {PROPS.filter((p) => !(l.kind === "cursor" && p.id === "tilt")).map((p) => (
                  <MenuItem key={p.id} onSelect={() => set({ tweens: [...tweens, fresh(p.id, inAt)] })}>
                    {p.name}
                  </MenuItem>
                ))}
              </div>
            </Popover>
          </>
        }
      >
        {!tweens.length && <p className="text-caption text-fg-3">None yet. Add one: a property moving between two values. It shows on the timeline as a block to drag and stretch.</p>}
        <div className="space-y-3">
          {tweens.map((t) => (
            <TweenCard key={t.id} t={t} put={(p) => putTween(t.id, p)} remove={() => set({ tweens: tweens.filter((x) => x.id !== t.id) })} D={D} />
          ))}
        </div>
      </Section>
    </>
  )
}

/** The kit's title animations, each playing on a word: the Studio's titles and the canvas's both pick from it. */
export function TitleAnimPicker({ id, current, onPick }: { id: string; current?: TextAnim; onPick: (a: TextAnim) => void }) {
  const menu = `title-anims-${id}`
  const key = (a: TextAnim) => JSON.stringify({ ...a, on: undefined })
  const now = current ? TEXT_ANIMS.find((p) => key(p.anim) === key(current)) : undefined
  return (
    <>
      <button type="button" popoverTarget={menu} className={`${field} press mt-2 flex h-8 w-full items-center justify-between px-2.5 text-body`}>
        <span className="text-fg-2">Title animations</span>
        <span className="truncate text-caption text-fg-3">{current ? (now?.name ?? "Your own") : `${TEXT_ANIMS.length} in the kit`}</span>
      </button>
      <Popover id={menu} align="end" label="Title animations">
        <ul className="scroll-thin grid max-h-[60vh] w-[328px] grid-cols-2 gap-2 overflow-y-auto p-2">
          {TEXT_ANIMS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={(e) => {
                  onPick(p.anim)
                  closePopover(e.currentTarget)
                }}
                aria-pressed={now?.id === p.id}
                title={p.hint}
                className="press block w-full rounded-lg text-left"
              >
                <span className={`grid aspect-[16/9] place-items-center overflow-hidden rounded-lg bg-canvas ${now?.id === p.id ? "shadow-[inset_0_0_0_1.5px_var(--sel)]" : "hover:shadow-[inset_0_0_0_1px_var(--line-strong)]"}`}>
                  <AnimSample anim={p.anim} text="Launch" className="text-[17px] font-semibold leading-none tracking-[-0.03em]" />
                </span>
                <span className="mt-1 block truncate px-0.5 text-caption font-medium text-fg-2">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}

const BY: { value: TextAnim["by"]; label: string }[] = [
  { value: "all", label: "Title" },
  { value: "line", label: "Lines" },
  { value: "word", label: "Words" },
  { value: "char", label: "Letters" },
]
const ORDER: { value: NonNullable<TextAnim["order"]>; label: string }[] = [
  { value: "first", label: "First to last" },
  { value: "last", label: "Last to first" },
  { value: "middle", label: "From the middle" },
  { value: "random", label: "In no order" },
]
const IDLE: { value: NonNullable<TextAnim["idle"]>; label: string }[] = [
  { value: "none", label: "Still" },
  { value: "wave", label: "Wave" },
  { value: "float", label: "Float" },
  { value: "shimmer", label: "Glint" },
]
/** A custom title animation, every value: what moves, where each piece starts, its timing, and what it does once in. */
function TitleAnimSection({ l, set }: { l: TextLayer; set: Setter<TextLayer> }) {
  const a = l.animation ?? TEXT_ANIM
  return (
    <Section title="Title animation" aside={a.by === "line" ? "lines split where you break them" : undefined}>
      <TitleAnimFields id={l.id} a={a} put={(p) => set({ animation: { ...a, ...p } })} />
    </Section>
  )
}
export function TitleAnimFields({ id: key, a, put }: { id: string; a: TextAnim; put: (p: Partial<TextAnim>) => void }) {
  const from = (k: keyof TextAnim["from"], v: number, rest: number) => {
    const f = { ...a.from }
    if (Math.abs(v - rest) < 1e-6) delete f[k]
    else f[k] = v
    put({ from: f })
  }
  const id = (k: string) => `ta-${k}-${key}`
  const f = a.from
  return (
    <>
      <Segmented full size="sm" label="What moves" value={a.by} onChange={(by) => put({ by })} options={BY} />
      <div className="mt-2 space-y-1.5">
        {a.by !== "all" && (
          <>
            <Row label="Order" htmlFor={id("order")}>
              <Select id={id("order")} value={a.order ?? "first"} onChange={(e) => put({ order: e.target.value as TextAnim["order"] })} className={`${field} h-7 w-[132px] cursor-pointer px-2 text-body`}>
                {ORDER.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Row>
            <SliderField id={id("stagger")} label="Between pieces" unit="s" min={0} max={0.5} step={0.005} value={a.stagger} def={0.06} set={(stagger) => put({ stagger })} />
          </>
        )}
        <SliderField id={id("dur")} label={a.by === "all" ? "Lasts" : "Each lasts"} unit="s" min={0.05} max={3} step={0.05} value={a.dur} def={0.7} set={(dur) => put({ dur })} />
        <EaseField id={id("ease")} value={a.ease} set={(ease) => put({ ease: ease ?? TEXT_ANIM.ease })} fallback="Expo out" />
      </div>
      <h4 className="pb-1.5 pl-2.5 pt-3 text-caption font-medium text-fg-3">Each piece starts</h4>
      <div className="space-y-1.5">
        <SliderField id={id("y")} label="Lower by" unit="em" min={-3} max={3} step={0.05} value={f.y ?? 0} def={0} set={(v) => from("y", v, 0)} />
        <SliderField id={id("x")} label="Right by" unit="em" min={-3} max={3} step={0.05} value={f.x ?? 0} def={0} set={(v) => from("x", v, 0)} />
        <SliderField id={id("scale")} label="Scaled" unit="×" min={0} max={4} step={0.05} value={f.scale ?? 1} def={1} set={(v) => from("scale", v, 1)} />
        <SliderField id={id("rotate")} label="Turned" unit="°" min={-90} max={90} step={1} value={f.rotate ?? 0} def={0} set={(v) => from("rotate", v, 0)} />
        <SliderField id={id("flip")} label="Tipped back" unit="°" min={-120} max={120} step={1} value={f.flip ?? 0} def={0} set={(v) => from("flip", v, 0)} />
        <SliderField id={id("skew")} label="Leaning" unit="°" min={-40} max={40} step={1} value={f.skew ?? 0} def={0} set={(v) => from("skew", v, 0)} />
        <SliderField id={id("blur")} label="Blurred" unit="em" min={0} max={0.6} step={0.01} value={f.blur ?? 0} def={0} set={(v) => from("blur", v, 0)} />
        <SliderField id={id("opacity")} label="Opacity" unit="%" min={0} max={100} step={1} value={Math.round((f.opacity ?? 1) * 100)} def={100} set={(v) => from("opacity", v / 100, 1)} />
        <SliderField id={id("spacing")} label="Spaced out" unit="em" min={0} max={1.5} step={0.01} value={f.spacing ?? 0} def={0} set={(v) => from("spacing", v, 0)} />
        <Row label="Behind its line" htmlFor={id("mask")}>
          <Switch id={id("mask")} on={!!a.mask} onChange={(mask) => put({ mask: mask || undefined })} />
        </Row>
        <Row label="Starts in a colour" htmlFor={id("tint")}>
          <span className="flex items-center gap-1">
            {a.tint ? (
              <button type="button" onClick={() => put({ tint: undefined })} className="press rounded px-1.5 text-caption text-fg-3 hover:text-fg">
                Clear
              </button>
            ) : (
              <span className="px-1.5 text-caption text-fg-3">None</span>
            )}
            <input id={id("tint")} type="color" value={a.tint ?? "#7c8cff"} onChange={(e) => put({ tint: e.target.value })} className={`h-7 w-9 cursor-pointer rounded-md bg-transparent ${a.tint ? "" : "opacity-30"}`} />
          </span>
        </Row>
      </div>
      <h4 className="pb-1.5 pl-2.5 pt-3 text-caption font-medium text-fg-3">Once it's in</h4>
      <Segmented full size="sm" label="Once it's in" value={a.idle ?? "none"} onChange={(idle) => put({ idle: idle === "none" ? undefined : idle })} options={IDLE} />
    </>
  )
}

function TweenCard({ t, put, remove, D }: { t: Tween; put: (p: Partial<Tween>) => void; remove: () => void; D: number }) {
  const spec = PROPS.find((p) => p.id === t.prop)!
  const scale = t.prop === "position" || t.prop === "opacity" ? 100 : 1
  const values = (which: "from" | "to") => (
    <div className="flex items-center gap-1.5">
      <span className="w-9 text-caption text-fg-3">{which === "from" ? "From" : "To"}</span>
      {spec.labels.map((name, i) => (
        <span key={name} className="flex items-center gap-1">
          {spec.labels.length > 1 && <span className="text-micro text-fg-3">{name}</span>}
          <Num label={`${spec.name} ${which} ${name}`} value={t[which][i] ?? spec.rest[i]} scale={scale} unit={spec.unit} step={spec.step * (scale === 100 ? 1 : 1)} set={(v) => put({ [which]: spec.rest.map((r, j) => (j === i ? v : (t[which][j] ?? r))) } as Partial<Tween>)} w={spec.labels.length > 1 ? 70 : 84} />
        </span>
      ))}
    </div>
  )
  return (
    <div className="rounded-lg p-2.5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--k-motion)_30%,var(--line-strong))]">
      <div className="flex items-center justify-between pb-1.5">
        <span className="flex items-center gap-2 text-body font-medium">
          {/* an animation, in motion's violet: the same mark as its lane on the timeline */}
          <span aria-hidden className="h-2 w-2 rotate-45 rounded-[2px] bg-k-motion" />
          {spec.name}
        </span>
        <IconButton size="sm" label={`Remove the ${spec.name.toLowerCase()} animation`} onClick={remove}>
          <X size={13} />
        </IconButton>
      </div>
      {t.prop === "position" && (
        <div className="mb-1.5 flex items-center gap-1">
          <span className="w-9 text-caption text-fg-3">From</span>
          {(
            [
              [ArrowRight, "the left", [-0.35, 0]],
              [ArrowLeft, "the right", [0.35, 0]],
              [ArrowDown, "above", [0, -0.3]],
              [ArrowUp, "below", [0, 0.3]],
            ] as const
          ).map(([I, where, from]) => (
            <IconButton key={where} size="sm" label={`Come in from ${where}`} onClick={() => put({ from: [...from], to: [0, 0] })}>
              <I size={13} />
            </IconButton>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        {values("from")}
        {values("to")}
        <div className="flex items-center gap-1.5">
          <span className="w-9 text-caption text-fg-3">At</span>
          <Num label="Starts at, seconds" value={t.at} unit="s" step={0.05} min={0} max={D} set={(v) => put({ at: v })} w={70} />
          <span className="text-caption text-fg-3">for</span>
          <Num label="Lasts, seconds" value={t.dur} unit="s" step={0.05} min={0.05} max={30} set={(v) => put({ dur: v })} w={70} />
        </div>
      </div>
      <div className="-ml-2.5 mt-1">
        <EaseField id={`tw-ease-${t.id}`} value={t.ease} set={(ease) => put({ ease: ease ?? "cubic-bezier(0.23, 1, 0.32, 1)" })} fallback="Ease out" />
      </div>
    </div>
  )
}

/* ---------------- shapes and cursors ---------------- */

export function ShapePanel({ l, set, size, accent }: { l: ShapeLayer; set: Setter<ShapeLayer>; size: string; accent: string }) {
  return (
    <>
      <Section title="Shape">
        <Segmented
          full
          size="sm"
          label="Shape"
          value={l.shape}
          onChange={(shape) => set({ shape, aspect: shape === "ellipse" ? 1 : l.aspect === 1 ? 1.6 : l.aspect })}
          options={[
            { value: "rect", label: "Rectangle" },
            { value: "ellipse", label: "Ellipse" },
          ]}
        />
        <div className="mt-2.5 space-y-1.5">
          <SliderField id={`s-ar-${l.id}`} label="Width ÷ height" unit="" min={0.1} max={6} step={0.01} value={r2(l.aspect)} def={l.shape === "ellipse" ? 1 : 1.6} set={(v) => set({ aspect: v })} />
          {l.shape === "rect" && <SliderField id={`s-r-${l.id}`} label="Corners" unit="" min={0} max={20} step={0.1} value={r2(l.radius)} def={1.2} set={(v) => set({ radius: v })} />}
          <SliderField id={`s-sw-${l.id}`} label="Outline" unit="" min={0} max={10} step={0.5} value={l.stroke?.width ?? 0} def={0} set={(v) => set({ stroke: v ? { color: l.stroke?.color ?? "#1d8cf8", width: v } : undefined })} />
          {l.stroke && (
            <Row label="Outline colour">
              <input type="color" aria-label="Outline colour" value={l.stroke.color} onChange={(e) => set({ stroke: { ...l.stroke!, color: e.target.value } })} className="h-7 w-10 cursor-pointer rounded bg-transparent" />
            </Row>
          )}
          <Row label="Shadow" htmlFor={`s-sh-${l.id}`}>
            <Switch id={`s-sh-${l.id}`} on={!!l.shadow} onChange={(v) => set({ shadow: v || undefined })} />
          </Row>
        </div>
      </Section>
      <Section title="Fill">
        <PaintStack paints={l.paint} set={(paint) => set({ paint })} aspect={l.aspect} accent={accent} base="" />
      </Section>
      {void size}
    </>
  )
}

export function CursorPanel({ l, set }: { l: CursorLayer; set: Setter<CursorLayer> }) {
  const COLORS = ["#ff2d8a", "#1d8cf8", "#16b364", "#f79009", "#7a5af8"]
  return (
    <Section title="Cursor">
      <input aria-label="Name" value={l.label} onChange={(e) => set({ label: e.target.value })} className={`${field} h-8 w-full px-2.5 text-body`} />
      <div className="mt-2.5 flex items-center gap-2">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={l.color === c} onClick={() => set({ color: c })} className={`press h-7 w-7 rounded-full ${l.color === c ? "outline outline-[1.5px] outline-offset-2 outline-fg" : ""}`} style={{ background: c }} />
        ))}
        <input type="color" aria-label="Another colour" value={l.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded bg-transparent" />
      </div>
      <p className="mt-2 text-caption text-fg-3">Give it a Position animation (Animate) to fly it in, the way collaborators move on a shared canvas.</p>
    </Section>
  )
}

/** Close an open popover from inside it (for menus built here). */
export { closePopover }
