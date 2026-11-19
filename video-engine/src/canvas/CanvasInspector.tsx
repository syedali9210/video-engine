// Canvas — the inspector: with nothing picked, the frame (its size, its phone layout, its background); with a layer
// picked, Raylight's two tabs: Design (where it is, how it looks, what it shows) and Interact (how it comes in, how it
// answers the pointer and the scroll, where it links).
import { useState } from "react"
import { ArrowDown, ArrowUp, ArrowsClockwise, Path, Play, Sparkle, Trash } from "@phosphor-icons/react"
import { ParamRow, SliderField, field, groupSchema } from "../controls"
import { byId, withDefaults, type Values } from "../registry"
import { Button, Popover, Segmented, Switch, closePopover, Select } from "../ui"
import { Hint } from "../studio/Layers"
import { Num, TitleAnimFields, TitleAnimPicker } from "../studio/Motion"
import { PaintStack } from "../studio/PaintEditor"
import { More, Row, Section } from "../studio/Studio"
import { FRAMES, MOTION_PRESETS, MOTION_TRIGGERS, boxOf, sizeOf, type CanvasDoc, type CNode, type DeviceKind, type DeviceNode, type EffectNode, type Enter, type Follow, type Hover, type MotionPreset, type MotionTrigger, type View } from "./doc"
import type { EffectPreset } from "./effects"
import { Chips, EffectFields, EffectGallery, EffectPreview } from "./EffectViews"
import { finishPatch } from "./looks"
import { CaseSwatches, LookPicker } from "../LookPicker"
import type { Look } from "../theme"
import { FINISHES } from "../studio/finishes"
import { FACES } from "../studio/faces"

type Props = {
  doc: CanvasDoc
  view: View
  node: CNode | null
  /** a change to the picked layer (place and size go to the view's layout) */
  set: (patch: Partial<CNode>, box?: boolean) => void
  setDoc: (fn: (d: CanvasDoc) => CanvasDoc) => void
  pick: (what: "screen" | "component") => void
  arrange: (by: 1 | -1) => void
  remove: () => void
  layoutPhone: () => void
  /** plays the picked layer's path once, on the canvas */
  preview: () => void
  /** the Path tool, to draw (or redraw) the picked layer's path */
  drawPath: () => void
  select: (id: string) => void
  /** an effect as the frame's background, behind everything */
  addBackground: (p: EffectPreset) => void
  removeLayer: (id: string) => void
  /** colours the screens offer to match a look to, and the look put on last */
  anchors: string[]
  look: { anchor: string; harmony: string; seed: number; case: string } | null
  onLook: (look: Look, seed: number) => void
  inCase: boolean
  setInCase: (v: boolean) => void
}



/** The frame's background effect: the backmost effect that covers the whole frame. */
export const backgroundEffect = (doc: CanvasDoc) =>
  doc.layers.find((n): n is EffectNode => n.kind === "effect" && n.x <= 1 && n.y <= 1 && n.x + n.w >= doc.frame.w - 1 && n.y + n.h >= doc.frame.h - 1)

export function CanvasInspector(p: Props) {
  const [tab, setTab] = useState<"design" | "interact">("design")
  if (!p.node) return <FramePanel {...p} />
  return (
    <div>
      <div className="sticky top-0 z-10 bg-panel px-4 py-2.5">
        <Segmented<"design" | "interact">
          full
          size="sm"
          label="Inspector"
          value={tab}
          onChange={setTab}
          options={[
            { value: "design", label: "Design" },
            { value: "interact", label: "Interact" },
          ]}
        />
      </div>
      {tab === "design" ? <Design {...p} node={p.node} /> : <Interact {...p} node={p.node} />}
    </div>
  )
}

/* ---------------- the frame ---------------- */

function FramePanel({ doc, view, setDoc, layoutPhone, select, addBackground, removeLayer, anchors, look, onLook, inCase, setInCase }: Props) {
  const f = doc.frame
  const bg = backgroundEffect(doc)
  const preset = FRAMES.find((x) => x.w === f.w && x.h === f.h)?.id ?? "custom"
  const main = doc.layers.find((n): n is DeviceNode => n.kind === "device")
  return (
    <div>
      <Section title="Canvas">
        <input aria-label="Name" value={doc.name} onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value.slice(0, 80) }))} className={`${field} h-8 w-full px-2.5 text-body`} />
      </Section>
      <Section title="Look" aside={anchors.length ? "matched to the screen" : undefined}>
        <LookPicker
          anchors={anchors}
          device={main?.device ?? "iphone"}
          current={look}
          onApply={onLook}
          inCase={inCase}
          setInCase={setInCase}
          hint="One look sets the ground and its light, the type's colours, each device's finish (or a case) and the background effect's palette. Undo puts it back."
        />
      </Section>
      {view === "desktop" ? (
        <Section title="Frame" aside={`${f.w} × ${f.h}`}>
          <Select
            aria-label="Size"
            value={preset}
            onChange={(e) => {
              const x = FRAMES.find((y) => y.id === e.target.value)
              if (x) setDoc((d) => ({ ...d, frame: { ...d.frame, w: x.w, h: x.h } }))
            }}
            className={`${field} h-8 w-full cursor-pointer px-2 text-body`}
          >
            {FRAMES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.w} × {x.h}
              </option>
            ))}
            {preset === "custom" && <option value="custom">Custom</option>}
          </Select>
          <div className="mt-2 flex items-center gap-1.5">
            <Num label="Width" value={f.w} min={200} max={4000} set={(w) => setDoc((d) => ({ ...d, frame: { ...d.frame, w: Math.round(w) } }))} w={92} unit="w" />
            <Num label="Height" value={f.h} min={200} max={8000} set={(h) => setDoc((d) => ({ ...d, frame: { ...d.frame, h: Math.round(h) } }))} w={92} unit="h" />
          </div>
          <div className="mt-2">
            <SliderField id="cv-radius" label="Corners" min={0} max={80} step={1} value={f.radius} def={0} set={(v) => setDoc((d) => ({ ...d, frame: { ...d.frame, radius: v } }))} />
          </div>
        </Section>
      ) : (
        <Section title="Phone layout" aside={`${f.phone.w} × ${Math.round(f.phone.h)}`}>
          <p className="text-caption text-fg-3">Under 744 px wide, the canvas takes this layout. It's made from the desktop one, and yours to move and size here: the desktop layout stays as it is.</p>
          <div className="mt-2.5">
            <Button size="sm" onClick={layoutPhone}>
              <ArrowsClockwise size={14} aria-hidden />
              Lay it out again
            </Button>
          </div>
          <div className="mt-2.5">
            <Num label="Phone frame height" value={f.phone.h} min={400} max={8000} set={(h) => setDoc((d) => ({ ...d, frame: { ...d.frame, phone: { ...d.frame.phone, h: Math.round(h) } } }))} w={110} unit="h" />
          </div>
        </Section>
      )}
      <Section title="Background effect" aside="animated">
        {bg ? (
          <div className="space-y-2">
            <EffectPreview effect={bg.effect} className="relative block aspect-[16/9] overflow-hidden rounded-md shadow-[0_0_0_1px_var(--line)]" />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => select(bg.id)}>
                <Sparkle size={14} aria-hidden />
                Edit it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeLayer(bg.id)}>
                <Trash size={14} aria-hidden />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Hint>An artwork that moves behind everything: dithers, halftones, characters, stitches, glowing blocks. Pick one, then make it yours.</Hint>
            <div className="mt-2.5">
              <EffectGallery onPick={addBackground} />
            </div>
          </>
        )}
      </Section>
      <Section title="Background">
        <PaintStack paints={f.paint} set={(paint) => setDoc((d) => ({ ...d, frame: { ...d.frame, paint } }))} aspect={f.w / f.h} accent="#1f95ff" base="#f4f4f6" />
      </Section>
    </div>
  )
}

/* ---------------- blur, glow, frosted glass ---------------- */

function Looks({ node: n, set }: { node: CNode; set: Props["set"] }) {
  const glow = n.glow
  const bd = n.backdrop
  return (
    <Section title="Blur and glow">
      <SliderField id="cv-blur" label="Blur" unit="px" min={0} max={40} step={0.5} value={n.blur ?? 0} def={0} set={(blur) => set({ blur: blur || undefined })} />
      <Row label={n.kind === "text" ? "Glow around the letters" : "Glow around it"} htmlFor="cv-glow">
        <span className="flex items-center gap-2">
          {glow && <input aria-label="Glow colour" type="color" value={/^#[0-9a-f]{6}$/i.test(glow.color) ? glow.color : "#ffffff"} onChange={(e) => set({ glow: { ...glow, color: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />}
          <Switch id="cv-glow" on={!!glow} onChange={(v) => set({ glow: v ? { color: n.kind === "text" ? "#8fc8ff" : "#ffffff", size: 24 } : undefined })} />
        </span>
      </Row>
      {glow && <SliderField id="cv-glow-size" label="Glow size" unit="px" min={2} max={160} step={1} value={glow.size} def={24} set={(size) => set({ glow: { ...glow, size } })} />}
      <Row label="Frosted glass behind it" htmlFor="cv-bd">
        <span className="flex items-center gap-2">
          {bd && <input aria-label="Glass tint" type="color" value={/^#[0-9a-f]{6}$/i.test(bd.tint) ? bd.tint : "#ffffff"} onChange={(e) => set({ backdrop: { ...bd, tint: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />}
          <Switch id="cv-bd" on={!!bd} onChange={(v) => set({ backdrop: v ? { blur: 24, tint: "#ffffff", opacity: 0.16, radius: 20, pad: 20 } : undefined })} />
        </span>
      </Row>
      {bd && (
        <div className="space-y-1.5">
          <SliderField id="cv-bd-blur" label="Blurs what's behind" unit="px" min={0} max={80} step={1} value={bd.blur} def={24} set={(blur) => set({ backdrop: { ...bd, blur } })} />
          <SliderField id="cv-bd-tint" label="Tint" unit="%" min={0} max={100} step={1} value={Math.round(bd.opacity * 100)} def={16} set={(v) => set({ backdrop: { ...bd, opacity: v / 100 } })} />
          <SliderField id="cv-bd-r" label="Corners" unit="px" min={0} max={120} step={1} value={bd.radius} def={20} set={(radius) => set({ backdrop: { ...bd, radius } })} />
          <SliderField id="cv-bd-pad" label="Reaches past it" unit="px" min={0} max={160} step={1} value={bd.pad} def={20} set={(pad) => set({ backdrop: { ...bd, pad } })} />
        </div>
      )}
      <Hint>Frosted glass blurs whatever is behind it: an effect, a picture, a device. It's how a title stays readable over a busy ground.</Hint>
    </Section>
  )
}

/* ---------------- a device in 3D ---------------- */

/** Its finish (Apple's own, by name), a case in any colour over it, and its shadow. */
function Body({ node: n, set, look }: { node: DeviceNode; set: Props["set"]; look: Props["look"] }) {
  const ring = (on: boolean) => (on ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]")
  return (
    <Section title="Finish" aside={n.case ? "in a case" : FINISHES[n.device].find((f) => f.id === n.finish?.id)?.name}>
      <div role="radiogroup" aria-label="Finish" className="flex flex-wrap gap-2">
        {FINISHES[n.device].map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={!n.case && n.finish?.id === f.id} title={f.name} onClick={() => set({ finish: finishPatch(n.device, f.id), case: undefined } as Partial<CNode>)} className={`press h-7 w-7 rounded-full ${ring(!n.case && n.finish?.id === f.id)}`} style={{ background: `linear-gradient(135deg, ${f.metal} 0 48%, ${f.back} 52% 100%)` }}>
            <span className="sr-only">{f.name}</span>
          </button>
        ))}
      </div>
      <p className="pb-1.5 pt-3 text-caption font-medium text-fg-3">Case</p>
      <CaseSwatches value={n.case} set={(c) => set({ case: c } as Partial<CNode>)} extra={look?.case} />
      <div className="mt-2">
        <Row label="Shadow under it" htmlFor="cv-dev-shadow">
          <Switch id="cv-dev-shadow" on={n.shadow !== false} onChange={(v) => set({ shadow: v ? undefined : false } as Partial<CNode>)} />
        </Row>
      </div>
    </Section>
  )
}

const TURNS: { label: string; x: number; y: number }[] = [
  { label: "Front", x: 0, y: 0 },
  { label: "Left", x: 0, y: -30 },
  { label: "Right", x: 0, y: 30 },
  { label: "Lying back", x: 38, y: -18 },
  { label: "Side", x: 0, y: 74 },
  { label: "Back", x: 0, y: 180 },
]
// the lens as the Studio states it, its angle of view: a long lens (a few degrees) flattens, a wide one exaggerates
const fovOf = (p: number) => Math.round((2 * Math.atan(0.5 / p) * 180) / Math.PI)
const pOf = (fov: number) => +(0.5 / Math.tan((fov * Math.PI) / 360)).toFixed(2)

function Turn3D({ node: n, set, view }: { node: DeviceNode; set: Props["set"]; view: View }) {
  const r = n.rot3d ?? { x: 0, y: 0 }
  const to = (x: number, y: number, p = r.p) => set({ rot3d: x || y || p ? { x, y, ...(p ? { p } : {}) } : undefined } as Partial<CNode>)
  const rot = boxOf(n, view).rot ?? 0
  return (
    <Section title="Turn in 3D" aside={r.x || r.y || rot ? `X ${Math.round(r.x)}° · Y ${Math.round(r.y)}° · Z ${Math.round(rot)}°` : undefined}>
      <div role="group" aria-label="Turns" className="grid grid-cols-3 gap-1">
        {TURNS.map((t) => (
          <button key={t.label} type="button" onClick={() => to(t.x, t.y)} aria-pressed={r.x === t.x && r.y === t.y} className={`press h-7 rounded-md text-caption font-medium ${r.x === t.x && r.y === t.y ? "k-tint k-ink" : "text-fg-2 hover:bg-surface-2"}`} style={{ "--k": "var(--k-device)" } as React.CSSProperties}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1.5">
        <SliderField id="cv-turn-x" label="Tilt · X" unit="°" min={-180} max={180} step={1} value={Math.round(r.x)} def={0} set={(x) => to(x, r.y)} />
        <SliderField id="cv-turn-y" label="Turn · Y" unit="°" min={-180} max={180} step={1} value={Math.round(r.y)} def={0} set={(y) => to(r.x, y)} />
        <SliderField id="cv-turn-z" label="Roll · Z" unit="°" min={-180} max={180} step={1} value={Math.round(rot)} def={0} set={(v) => set({ rot: v } as Partial<CNode>, true)} />
        <SliderField id="cv-lens" label="Lens" unit="°" min={7} max={40} step={1} value={fovOf(r.p ?? 3.2)} def={18} set={(v) => to(r.x, r.y, v === 18 ? undefined : pOf(v))} hint="Its angle of view: a few degrees is a long lens, flat like a product shot; more is wide and dramatic." />
      </div>
      <Hint>Or turn it with the ball beside it on the canvas: a ring turns it about one axis, inside them freely, Shift steps by 15°, a double-click puts it straight.</Hint>
    </Section>
  )
}

/* ---------------- design ---------------- */

const DEVICES: { value: DeviceKind; label: string }[] = [
  { value: "iphone", label: "iPhone" },
  { value: "ipad", label: "iPad" },
  { value: "macbook", label: "Mac" },
  { value: "duo", label: "Duo" },
]

function Design({ doc, view, node: n, set, pick, arrange, remove, look }: Props & { node: CNode }) {
  const b = boxOf(n, view)
  const box = (k: "x" | "y" | "w" | "h" | "rot", v: number) => set({ [k]: k === "rot" ? v : Math.round(v) } as Partial<CNode>, true)
  return (
    <div>
      <Section title="Layout" aside={view === "phone" ? "phone layout" : undefined}>
        <div className="grid grid-cols-2 gap-1.5">
          <Num label="X" value={b.x} set={(v) => box("x", v)} unit="x" w={120} />
          <Num label="Y" value={b.y} set={(v) => box("y", v)} unit="y" w={120} />
          <Num label="Width" value={b.w} min={1} set={(v) => (n.kind === "device" ? set({ w: Math.round(v), h: Math.round((v * b.h) / b.w) } as Partial<CNode>, true) : box("w", v))} unit="w" w={120} />
          <Num label="Height" value={b.h} min={1} set={(v) => (n.kind === "device" ? set({ h: Math.round(v), w: Math.round((v * b.w) / b.h) } as Partial<CNode>, true) : box("h", v))} unit="h" w={120} />
          <Num label="Rotation" value={b.rot ?? 0} min={-360} max={360} set={(v) => box("rot", v)} unit="°" w={120} />
        </div>
        {view === "phone" && (
          <Row label="Hidden on phones" htmlFor="cv-phone-hidden">
            <Switch id="cv-phone-hidden" on={!!n.phone?.hidden} onChange={(v) => set({ phone: { ...n.phone, hidden: v } })} />
          </Row>
        )}
        <div className="mt-2">
          <SliderField id="cv-opacity" label="Opacity" unit="%" min={0} max={100} step={1} value={Math.round((n.opacity ?? 1) * 100)} def={100} set={(v) => set({ opacity: v / 100 })} />
        </div>
      </Section>

      {(n.kind === "rect" || n.kind === "ellipse") && (
        <Section title={n.kind === "rect" ? "Rectangle" : "Ellipse"}>
          {n.kind === "rect" && <SliderField id="cv-corners" label="Corners" min={0} max={Math.round(Math.min(n.w, n.h) / 2)} step={1} value={n.radius} def={0} set={(radius) => set({ radius })} />}
          <div className="mt-2">
            <PaintStack paints={n.paint} set={(paint) => set({ paint })} aspect={n.w / n.h} accent="#1f95ff" base="#ffffff" />
          </div>
          <Row label="Outline" htmlFor="cv-stroke">
            <span className="flex items-center gap-2">
              {n.stroke && <input aria-label="Outline colour" type="color" value={n.stroke.color} onChange={(e) => set({ stroke: { ...n.stroke!, color: e.target.value } })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />}
              <Switch id="cv-stroke" on={!!n.stroke} onChange={(v) => set({ stroke: v ? { color: "#18181b", width: 2 } : undefined })} />
            </span>
          </Row>
          {n.stroke && <SliderField id="cv-stroke-w" label="Outline width" min={0} max={24} step={0.5} value={n.stroke.width} def={2} set={(width) => set({ stroke: { ...n.stroke!, width } })} />}
          <Row label="Shadow" htmlFor="cv-shadow">
            <Switch id="cv-shadow" on={!!n.shadow} onChange={(shadow) => set({ shadow })} />
          </Row>
        </Section>
      )}

      {n.kind === "text" && (
        <Section title="Text">
          <textarea aria-label="Text" rows={3} value={n.text} onChange={(e) => set({ text: e.target.value })} className={`${field} block w-full resize-y px-2.5 py-2 text-body`} />
          <div className="mt-2 space-y-1.5">
            <Segmented<typeof n.font>
              full
              size="sm"
              label="Face"
              value={n.font}
              onChange={(font) => set({ font })}
              options={[
                { value: "text", label: "Text" },
                { value: "display", label: "Display" },
                { value: "serif", label: "Serif" },
                { value: "mono", label: "Label" },
              ]}
            />
            <Row label="Typeface" htmlFor="cv-typeface">
              <Select id="cv-typeface" value={n.face ?? ""} onChange={(e) => set({ face: e.target.value || undefined })} className={`${field} h-7 w-40 cursor-pointer px-2 text-caption`}>
                <option value="">The engine's</option>
                {FACES.map((x) => (
                  <option key={x.name} value={x.name} title={x.hint}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Row>
            <SliderField
              id="cv-size"
              label={view === "phone" ? "Size on phones" : "Size"}
              min={8}
              max={240}
              step={1}
              value={sizeOf(n, view)}
              def={48}
              set={(v) => (view === "phone" ? set({ phone: { ...n.phone, size: v } }) : set({ size: v }))}
            />
            <Segmented<number>
              full
              size="sm"
              label="Weight"
              value={n.weight}
              onChange={(weight) => set({ weight })}
              options={[400, 500, 600, 700].map((w) => ({ value: w, label: w === 400 ? "Regular" : w === 500 ? "Medium" : w === 600 ? "Semibold" : "Bold" }))}
            />
            <Segmented<typeof n.align>
              full
              size="sm"
              label="Align"
              value={n.align}
              onChange={(align) => set({ align })}
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Centre" },
                { value: "right", label: "Right" },
              ]}
            />
          </div>
          <Row label="Colour" htmlFor="cv-color">
            <span className="flex items-center gap-2">
              {n.color && (
                <button type="button" onClick={() => set({ color: "" })} className="press text-caption font-medium text-fg-3 hover:text-fg">
                  Auto
                </button>
              )}
              <input id="cv-color" type="color" value={n.color || doc.frame.ink || "#18181b"} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />
            </span>
          </Row>
        </Section>
      )}

      {n.kind === "text" && (
        <Section title="Animation" aside={n.animation ? undefined : "none yet"}>
          <TitleAnimPicker id={`cv-${n.id}`} current={n.animation} onPick={(a) => set({ animation: { ...a, ...(n.animation?.on ? { on: n.animation.on } : {}) } })} />
          {n.animation && (
            <div className="mt-2 space-y-2">
              <Segmented
                full
                size="sm"
                label="Plays"
                value={n.animation.on ?? "enter"}
                onChange={(on) => set({ animation: { ...n.animation!, on: on === "scroll" ? "scroll" : undefined } })}
                options={[
                  { value: "enter", label: "When it's seen" },
                  { value: "scroll", label: "With the scroll" },
                ]}
              />
              <TitleAnimFields id={`cv-${n.id}`} a={n.animation} put={(p) => set({ animation: { ...n.animation!, ...p } })} />
              <button type="button" onClick={() => set({ animation: undefined })} className="press pl-2.5 text-caption font-medium text-fg-2 underline decoration-fg-3 underline-offset-4 hover:text-fg">
                No animation
              </button>
            </div>
          )}
        </Section>
      )}

      {n.kind === "image" && (
        <Section title="Picture">
          <SliderField id="cv-img-r" label="Corners" min={0} max={Math.round(Math.min(n.w, n.h) / 2)} step={1} value={n.radius} def={12} set={(radius) => set({ radius })} />
        </Section>
      )}

      {n.kind === "path" && (
        <Section title="Line">
          <Row label="Colour" htmlFor="cv-path-c">
            <input id="cv-path-c" type="color" value={n.stroke} onChange={(e) => set({ stroke: e.target.value })} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />
          </Row>
          <SliderField id="cv-path-w" label="Width" min={0.5} max={60} step={0.5} value={n.width} def={4} set={(width) => set({ width })} />
        </Section>
      )}

      {n.kind === "device" && (
        <Section title="Device">
          <Segmented<DeviceKind> full size="sm" label="Device" value={n.device} onChange={(device) => set({ device, h: n.h } as Partial<CNode>)} options={DEVICES} />
          {n.device === "duo" && (
            <Row label="Open" htmlFor="cv-duo">
              <Switch id="cv-duo" on={!!n.open} onChange={(open) => set({ open })} />
            </Row>
          )}
          {n.picture ? (
            // a picture of the product's own screen (made from its codebase): it stays a picture until a live one is picked
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-caption text-fg-3">Screen</span>
                <span className="block truncate text-body font-medium">A picture of the screen</span>
              </span>
              <Button size="sm" onClick={() => pick("screen")}>
                Live screen…
              </Button>
            </div>
          ) : (
            <LiveFields name="Screen" anim={n.screen.anim} values={n.screen.values} scheme={n.scheme} change={() => pick("screen")} setScheme={(scheme) => set({ scheme })} setValues={(values) => set({ screen: { ...n.screen, values } })} id={n.id} />
          )}
        </Section>
      )}

      {n.kind === "device" && <Body node={n} set={set} look={look} />}

      {n.kind === "device" && <Turn3D node={n} set={set} view={view} />}

      {n.kind === "component" && (
        <Section title="Component">
          <LiveFields name="Component" anim={n.live.anim} values={n.live.values} scheme={n.scheme} change={() => pick("component")} setScheme={(scheme) => set({ scheme })} setValues={(values) => set({ live: { ...n.live, values } })} id={n.id} />
        </Section>
      )}

      {n.kind === "effect" && (
        <Section
          title="Effect"
          aside={
            <>
              <button type="button" popoverTarget="cv-fx-presets" className="press rounded text-caption font-medium text-fg-2 hover:text-fg">
                Start from…
              </button>
              <Popover id="cv-fx-presets" align="end" label="Start from an effect">
                <div className="max-h-[70vh] w-[300px] overflow-y-auto p-2.5">
                  <EffectGallery
                    onPick={(p) => {
                      set({ effect: p.effect, name: p.name })
                      closePopover(document.getElementById("cv-fx-presets"))
                    }}
                  />
                </div>
              </Popover>
            </>
          }
        >
          <EffectFields value={n.effect} set={(effect) => set({ effect })} id={`fx-${n.id}`} />
        </Section>
      )}

      <Looks node={n} set={set} />

      <Section title="Arrange">
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => arrange(1)}>
            <ArrowUp size={14} aria-hidden />
            Forward
          </Button>
          <Button size="sm" onClick={() => arrange(-1)}>
            <ArrowDown size={14} aria-hidden />
            Backward
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={remove}>
            <Trash size={14} aria-hidden />
            Delete
          </Button>
        </div>
      </Section>
    </div>
  )
}

/** What a live page shows: which animation, light or dark, and its own properties (over the library's). */
function LiveFields({ name, anim, values, scheme, change, setScheme, setValues, id }: { name: string; anim: string; values: Values; scheme: "light" | "dark"; change: () => void; setScheme: (s: "light" | "dark") => void; setValues: (v: Values) => void; id: string }) {
  const a = byId(anim)
  const all = a ? withDefaults(a, values) : values
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-caption text-fg-3">{name}</span>
          <span className="block truncate text-body font-medium">{a?.name ?? anim}</span>
        </span>
        <Button size="sm" onClick={change}>
          Change…
        </Button>
      </div>
      <Segmented<"light" | "dark">
        full
        size="sm"
        label={`${name} theme`}
        value={scheme}
        onChange={setScheme}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
      {a && Object.keys(a.params).length > 0 && (
        <More label={`Its settings (${Object.keys(a.params).length})`}>
          {groupSchema(a).map(([g, keys]) => (
            <div key={g}>
              <p className="pb-1 pt-1.5 text-micro font-medium text-fg-3">{g}</p>
              {keys.map(([k, s]) => (
                <ParamRow key={k} k={`${id}-${k}`} s={s} value={all[k]} def={a.params[k]} set={(v) => setValues({ ...values, [k]: v })} />
              ))}
            </div>
          ))}
        </More>
      )}
    </div>
  )
}

/* ---------------- interact ---------------- */

function Interact({ node: n, set, preview, drawPath }: Props & { node: CNode }) {
  const enter = n.enter
  const hover = n.hover
  const follow = n.follow
  const mo = n.motion
  const bouncy = mo && mo.preset !== "glide" && mo.preset !== "slide" && mo.preset !== "float"
  const spin = n.kind === "device" ? n.spin : undefined
  return (
    <div>
      <Section title="Moves along a path" aside={mo ? "by physics" : undefined}>
        {!mo ? (
          <>
            <Hint>Hold the layer on the canvas for a moment, then draw where it goes. It follows the line by physics: a spring, a bounce, a slide, a drop.</Hint>
            <Button size="sm" className="mt-2" onClick={drawPath}>
              <Path size={14} aria-hidden />
              Draw its path
            </Button>
          </>
        ) : (
          <div className="space-y-2.5">
            <Chips<MotionPreset> label="How it moves" value={mo.preset} options={MOTION_PRESETS} set={(preset) => set({ motion: { ...mo, preset } })} cols={4} />
            <div>
              <p className="pb-1.5 text-caption font-medium text-fg-3">When</p>
              <Segmented<MotionTrigger> full size="sm" label="When it moves" value={mo.trigger} onChange={(trigger) => set({ motion: { ...mo, trigger } })} options={MOTION_TRIGGERS} />
            </div>
            <div className="space-y-1.5">
              {bouncy && <SliderField id="cv-mo-k" label={mo.preset === "bounce" || mo.preset === "drop" ? "Bounciness" : "Springiness"} unit="%" min={0} max={100} step={1} value={Math.round(mo.strength * 100)} def={50} set={(v) => set({ motion: { ...mo, strength: v / 100 } })} />}
              <SliderField id="cv-mo-speed" label="Speed" unit="×" min={0.2} max={3} step={0.05} value={mo.speed} def={1} set={(speed) => set({ motion: { ...mo, speed } })} />
              {(mo.trigger === "enter" || mo.trigger === "loop") && <SliderField id="cv-mo-delay" label="After" unit="s" min={0} max={4} step={0.05} value={mo.delay} def={0} set={(delay) => set({ motion: { ...mo, delay } })} />}
            </div>
            <Row label="Fades in as it goes" htmlFor="cv-mo-fade">
              <Switch id="cv-mo-fade" on={!!mo.fade} onChange={(fade) => set({ motion: { ...mo, fade: fade || undefined } })} />
            </Row>
            <Row label="Turns with the path" htmlFor="cv-mo-orient">
              <Switch id="cv-mo-orient" on={!!mo.orient} onChange={(orient) => set({ motion: { ...mo, orient: orient || undefined } })} />
            </Row>
            <Row label="Comes in along it, to here" htmlFor="cv-mo-rev">
              <Switch id="cv-mo-rev" on={!!mo.reverse} onChange={(reverse) => set({ motion: { ...mo, reverse: reverse || undefined } })} />
            </Row>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" onClick={preview}>
                <Play size={14} aria-hidden />
                Play it
              </Button>
              <Button size="sm" onClick={drawPath}>
                <Path size={14} aria-hidden />
                Redraw
              </Button>
              <Button size="sm" variant="ghost" onClick={() => set({ motion: undefined })}>
                <Trash size={14} aria-hidden />
                Remove
              </Button>
            </div>
          </div>
        )}
      </Section>
      {n.kind === "device" && (
        <Section title="Turns" aside="in 3D">
          <Segmented<"none" | "scroll" | "loop">
            full
            size="sm"
            label="Turns"
            value={spin?.kind ?? "none"}
            onChange={(k) => set({ spin: k === "none" ? undefined : k === "loop" ? { kind: "loop", y: 24, x: 6 } : { kind: "scroll", y: 40, x: 0 } } as Partial<CNode>)}
            options={[
              { value: "none", label: "None" },
              { value: "scroll", label: "With the scroll" },
              { value: "loop", label: "On its own" },
            ]}
          />
          {spin && (
            <div className="mt-2 space-y-1.5">
              <SliderField
                id="cv-spin-y"
                label={spin.kind === "loop" ? "Turns a second" : "Turn either side"}
                unit="°"
                min={spin.kind === "loop" ? -120 : -180}
                max={spin.kind === "loop" ? 120 : 180}
                step={1}
                value={spin.y}
                def={spin.kind === "loop" ? 24 : 40}
                set={(y) => set({ spin: { ...spin, y } } as Partial<CNode>)}
              />
              <SliderField id="cv-spin-x" label={spin.kind === "loop" ? "Nods" : "Tilt either side"} unit="°" min={-40} max={40} step={1} value={spin.x} def={0} set={(x) => set({ spin: { ...spin, x } } as Partial<CNode>)} />
            </div>
          )}
          <Hint>{spin?.kind === "loop" ? "A turntable: it keeps turning while it's on screen." : "Straight on as it crosses the middle of the screen, turned either side of it."}</Hint>
        </Section>
      )}
      <Section title="Comes in" aside="the first time it's seen">
        <Segmented<Enter["kind"] | "none">
          full
          size="sm"
          label="Comes in"
          value={enter?.kind ?? "none"}
          onChange={(k) => set({ enter: k === "none" ? undefined : { kind: k, delay: enter?.delay ?? 0, dur: enter?.dur ?? 0.7 } })}
          options={[
            { value: "none", label: "None" },
            { value: "fade", label: "Fade" },
            { value: "rise", label: "Rise" },
            { value: "scale", label: "Scale" },
            { value: "blur", label: "Blur" },
          ]}
        />
        {enter && (
          <div className="mt-2 space-y-1.5">
            <SliderField id="cv-in-delay" label="After" unit="s" min={0} max={3} step={0.05} value={enter.delay} def={0} set={(delay) => set({ enter: { ...enter, delay } })} />
            <SliderField id="cv-in-dur" label="For" unit="s" min={0.1} max={2.5} step={0.05} value={enter.dur} def={0.7} set={(dur) => set({ enter: { ...enter, dur } })} />
          </div>
        )}
      </Section>
      <Section title="Under the pointer">
        <Segmented<Hover["kind"] | "none">
          full
          size="sm"
          label="Under the pointer"
          value={hover?.kind ?? "none"}
          onChange={(k) => set({ hover: k === "none" ? undefined : { kind: k, amount: hover?.amount ?? 0.6 } })}
          options={[
            { value: "none", label: "None" },
            { value: "lift", label: "Lift" },
            { value: "scale", label: "Grow" },
            { value: "tilt", label: "Tilt" },
          ]}
        />
        {hover && (
          <div className="mt-2">
            <SliderField id="cv-hover" label="Amount" unit="%" min={5} max={100} step={5} value={Math.round(hover.amount * 100)} def={60} set={(v) => set({ hover: { ...hover, amount: v / 100 } })} />
          </div>
        )}
      </Section>
      <Section title="Follows the pointer" aside="anywhere on the frame">
        <Segmented<Follow["kind"] | "none">
          full
          size="sm"
          label="Follows the pointer"
          value={follow?.kind ?? "none"}
          onChange={(k) => set({ follow: k === "none" ? undefined : { kind: k, amount: follow?.amount ?? 0.5 } })}
          options={[
            { value: "none", label: "None" },
            { value: "parallax", label: "Drift" },
            { value: "tilt", label: "Turn" },
          ]}
        />
        {follow && (
          <div className="mt-2">
            <SliderField id="cv-follow" label="Amount" unit="%" min={5} max={100} step={5} value={Math.round(follow.amount * 100)} def={50} set={(v) => set({ follow: { ...follow, amount: v / 100 } })} />
          </div>
        )}
      </Section>
      <Section title="With the scroll">
        <SliderField id="cv-scroll" label="Moves" unit="%" min={-100} max={100} step={5} value={Math.round((n.scroll ?? 0) * 100)} def={0} set={(v) => set({ scroll: v / 100 || undefined })} hint="Up (negative) or down as the page scrolls past: layers moving at different speeds give depth." />
      </Section>
      <Section title="Link">
        <input
          aria-label="Opens on a click"
          type="url"
          placeholder="https://…"
          value={n.link ?? ""}
          onChange={(e) => set({ link: e.target.value || undefined })}
          className={`${field} h-8 w-full px-2.5 text-body`}
        />
        <Hint>A click (or Enter) opens it in a new tab. Only web addresses.</Hint>
      </Section>
    </div>
  )
}
