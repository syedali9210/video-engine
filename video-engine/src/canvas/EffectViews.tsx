// Canvas — effects in the editor: one, live (drawn by the runtime, so it's what a site shows); the gallery of them (the
// starting ones, with what the template lab's admin approved); and the fields that edit one: its pattern, what moves
// under it, its colours, its light.
import { useEffect, useRef, useState } from "react"
import { ArrowsClockwise, ImageSquare, Plus, X } from "@phosphor-icons/react"
import { SliderField, field } from "../controls"
import { Button, Segmented, Switch } from "../ui"
import { Row } from "../studio/Studio"
import { CELLS, EFFECT_SEEDS, FADES, SOURCES, isScene, type Effect, type EffectCell, type EffectFade, type EffectPreset, type EffectSource } from "./effects"
import { loadRuntime, pictureOf, type EffectHandle } from "./runtime"

/** One effect, live, moving while it's on screen. `frame`: the frame width its sizes are for. */
export function EffectPreview({ effect, className, frame = 1440 }: { effect: Effect; className?: string; frame?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const handle = useRef<EffectHandle | null>(null)
  const latest = useRef(effect)
  latest.current = effect
  useEffect(() => {
    let alive = true
    // without the runtime (the server down), a preview just stays its plain ground; the canvas says what happened
    loadRuntime().then(
      (rt) => {
        if (alive && el.current) handle.current = rt.effect(el.current, latest.current, { frame })
      },
      () => {},
    )
    return () => {
      alive = false
      handle.current?.destroy()
      handle.current = null
    }
  }, [frame])
  useEffect(() => handle.current?.update(effect), [effect])
  return <div ref={el} aria-hidden className={className} />
}

/** The gallery: the starting effects, with the template lab's approved versions over them, and its new ones after. */
export function useEffectPresets() {
  const [approved, setApproved] = useState<EffectPreset[]>([])
  useEffect(() => {
    let on = true
    fetch("/__lab/effects")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => on && Array.isArray(list) && setApproved(list))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])
  const byId = new Map(EFFECT_SEEDS.map((p) => [p.id, p]))
  for (const p of approved) if (!byId.has(p.id) || byId.get(p.id)!.version <= p.version) byId.set(p.id, p)
  return [...byId.values()]
}

/** Every effect, live, to pick (or drag onto the frame). */
export function EffectGallery({ onPick, current, drag }: { onPick: (p: EffectPreset) => void; current?: string; drag?: boolean }) {
  const presets = useEffectPresets()
  return (
    <ul className="grid grid-cols-2 gap-2">
      {presets.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            title={p.summary}
            draggable={drag}
            onDragStart={drag ? (e) => e.dataTransfer.setData("application/x-canvas", JSON.stringify({ kind: "effect", id: p.id })) : undefined}
            onClick={() => onPick(p)}
            className={`press block w-full text-left ${drag ? "cursor-grab active:cursor-grabbing" : ""}`}
          >
            <EffectPreview effect={p.effect} className={`relative block aspect-[4/3] overflow-hidden rounded-md shadow-[0_0_0_1px_var(--line)] ${current === p.id ? "outline outline-2 outline-offset-1 outline-sel" : ""}`} />
            <span className="mt-1 block truncate text-caption text-fg-2">{p.name}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A row of chips for a value from a known set: one tap, everything visible. */
function Chips<T extends string>({ label, value, options, set, cols = 3 }: { label: string; value: T; options: { value: T; label: string }[]; set: (v: T) => void; cols?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => set(o.value)}
          className={`press h-7 truncate rounded-md px-1.5 text-caption font-medium ${value === o.value ? "k-tint k-ink" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2 hover:text-fg"}`}
          style={value === o.value ? ({ "--k": "var(--k-effect)" } as React.CSSProperties) : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
export { Chips }

const toHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join("")}` : "#000000")

/** Everything about an effect: its pattern, what moves under it, its colours, its light. A scene (a picture drawn
    whole) has no cells: its pattern fields step aside, and it takes up to six inks. */
export function EffectFields({ value: e, set, id }: { value: Effect; set: (e: Effect) => void; id: string }) {
  const up = (p: Partial<Effect>) => set({ ...e, ...p })
  const pct = (v: number) => Math.round(v * 100)
  const pickPicture = useRef<HTMLInputElement>(null)
  const ground = e.colors[0]
  const inks = e.colors.slice(1)
  const scene = isScene(e)
  return (
    <div className="space-y-3">
      {!scene && (
        <>
          <div>
            <p className="pb-1.5 text-caption font-medium text-fg-3">Pattern</p>
            <Chips<EffectCell> label="Pattern" value={e.cell} options={CELLS} set={(cell) => up({ cell })} />
          </div>
          {e.cell === "char" && (
            <label className="block">
              <span className="block pb-1 text-caption text-fg-3">Characters, lightest to densest</span>
              <input value={e.chars ?? ""} spellCheck={false} onChange={(x) => up({ chars: [...x.target.value].slice(0, 16).join("") })} className={`${field} mono h-8 w-full px-2.5 text-body`} />
            </label>
          )}
          <div className="space-y-1.5">
            <SliderField id={`${id}-size`} label="Cell size" unit="px" min={3} max={80} step={1} value={e.size} def={12} set={(size) => up({ size })} />
            <SliderField id={`${id}-gap`} label="Gap" unit="%" min={0} max={90} step={1} value={pct(e.gap)} def={10} set={(v) => up({ gap: v / 100 })} />
            <SliderField id={`${id}-sizeby`} label="Sized by the field" unit="%" min={0} max={100} step={1} value={pct(e.sizeBy)} def={100} set={(v) => up({ sizeBy: v / 100 })} hint="At 100% dense places draw big shapes (halftone); at 0 every shape is the same size." />
            <SliderField id={`${id}-dither`} label="Dither" unit="%" min={0} max={100} step={1} value={pct(e.dither)} def={0} set={(v) => up({ dither: v / 100 })} hint="Ordered dithering: each shape on or off, like a two-tone print." />
            <SliderField id={`${id}-soft`} label="Softness" unit="%" min={0} max={100} step={1} value={pct(e.soft)} def={0} set={(v) => up({ soft: v / 100 })} />
          </div>
        </>
      )}
      <div>
        <p className="pb-1.5 text-caption font-medium text-fg-3">What moves under it</p>
        <Chips<EffectSource> label="Source" value={e.source} options={SOURCES} set={(source) => (source === "picture" && !e.picture ? pickPicture.current?.click() : up({ source }))} cols={5} />
        <input
          ref={pickPicture}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (x) => {
            const file = x.target.files?.[0]
            x.target.value = ""
            if (!file) return
            const p = await pictureOf(file, 1200)
            up({ source: "picture", picture: p.src })
          }}
        />
        {e.source === "picture" && (
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => pickPicture.current?.click()}>
              <ImageSquare size={14} aria-hidden />
              Another picture
            </Button>
            <Row label="Its colours" htmlFor={`${id}-tint`}>
              <Switch id={`${id}-tint`} on={!!e.tint} onChange={(tint) => up({ tint: tint || undefined })} />
            </Row>
          </div>
        )}
        {e.source === "picture" && (
          <div className="mt-1.5">
            <SliderField id={`${id}-under`} label="Picture under" unit="%" min={0} max={100} step={1} value={pct(e.under ?? 0)} def={0} set={(v) => up({ under: v ? v / 100 : undefined })} hint="The photo itself, soft, under the cells." />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <SliderField id={`${id}-scale`} label="Scale" unit="×" min={0.2} max={5} step={0.05} value={e.scale} def={1.2} set={(scale) => up({ scale })} />
        <SliderField id={`${id}-speed`} label="Speed" unit="×" min={0} max={3} step={0.05} value={e.speed} def={0.3} set={(speed) => up({ speed })} hint="0 holds it still." />
        <SliderField id={`${id}-angle`} label="Direction" unit="°" min={-180} max={180} step={1} value={e.angle} def={0} set={(angle) => up({ angle })} />
        <SliderField id={`${id}-contrast`} label="Contrast" unit="×" min={0.2} max={3} step={0.05} value={e.contrast} def={1.3} set={(contrast) => up({ contrast })} />
        <SliderField id={`${id}-level`} label="Ink" unit="%" min={-100} max={100} step={1} value={pct(e.level)} def={0} set={(v) => up({ level: v / 100 })} hint="Less ink, or more." />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Row label="Invert" htmlFor={`${id}-invert`}>
          <Switch id={`${id}-invert`} on={!!e.invert} onChange={(invert) => up({ invert: invert || undefined })} />
        </Row>
        <Button size="sm" variant="ghost" onClick={() => up({ seed: Math.round(Math.random() * 1000) })}>
          <ArrowsClockwise size={14} aria-hidden />
          Another field
        </Button>
      </div>

      <div>
        <p className="pb-1.5 text-caption font-medium text-fg-3">Colours</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-caption text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
            <input type="color" aria-label="Ground" disabled={ground === "transparent"} value={toHex(ground)} onChange={(x) => up({ colors: [x.target.value, ...inks] })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent disabled:opacity-30" />
            Ground
          </label>
          {inks.map((c, i) => (
            <span key={i} className="flex items-center rounded-md py-1 pl-1 pr-0.5 shadow-[inset_0_0_0_1px_var(--line)]">
              <input type="color" aria-label={`Ink ${i + 1}`} value={toHex(c)} onChange={(x) => up({ colors: [ground, ...inks.map((y, j) => (j === i ? x.target.value : y))] })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent" />
              {inks.length > 1 && (
                <button type="button" aria-label={`Remove ink ${i + 1}`} onClick={() => up({ colors: [ground, ...inks.filter((_, j) => j !== i)] })} className="press grid h-6 w-5 place-items-center text-fg-3 hover:text-fg">
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
          {inks.length < (scene ? 6 : 3) && (
            <button type="button" aria-label="Add an ink" onClick={() => up({ colors: [ground, ...inks, inks.at(-1) ?? "#ffffff"] })} className="press grid h-8 w-8 place-items-center rounded-md text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2">
              <Plus size={13} />
            </button>
          )}
        </div>
        <Row label="See-through ground" htmlFor={`${id}-clear`}>
          <Switch id={`${id}-clear`} on={ground === "transparent"} onChange={(v) => up({ colors: [v ? "transparent" : "#ffffff", ...inks] })} />
        </Row>
      </div>

      <div className="space-y-1.5">
        <SliderField id={`${id}-glow`} label="Glow" unit="%" min={0} max={100} step={1} value={pct(e.glow)} def={0} set={(v) => up({ glow: v / 100 })} />
        <SliderField id={`${id}-grain`} label="Grain" unit="%" min={0} max={100} step={1} value={pct(e.grain)} def={0} set={(v) => up({ grain: v / 100 })} />
        <SliderField id={`${id}-screen`} label="Screen" unit="%" min={0} max={100} step={1} value={pct(e.screen ?? 0)} def={0} set={(v) => up({ screen: v ? v / 100 : undefined })} hint="An old television: the glass curves inside its bezel, with a phosphor mask and scanlines." />
        <SliderField id={`${id}-paper`} label="Paper" unit="%" min={0} max={100} step={1} value={pct(e.paper ?? 0)} def={0} set={(v) => up({ paper: v ? v / 100 : undefined })} hint="Fibres and blotches that stay still under the ink, for a print." />
      </div>
      <div>
        <p className="pb-1.5 text-caption font-medium text-fg-3">Fades out</p>
        <Segmented<EffectFade> full size="sm" label="Fades out" value={e.fade} onChange={(fade) => up({ fade })} options={FADES} />
      </div>
    </div>
  )
}
