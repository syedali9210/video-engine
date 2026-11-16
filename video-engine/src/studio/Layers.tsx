// Studio — the Layers panel: every scene in order, and inside each the layers it's made of, front first, the way a
// design tool lists them. Pick one to edit it, drag to reorder, the eye hides it, ⋯ has the rest. Animated layers say
// so. The background, shared by every scene, sits at the bottom. Also: the template gallery and the animation picker.
import { DialogHead } from "../Gloss"
import { useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CaretRight,
  Circle,
  Copy,
  Cursor as CursorIcon,
  CubeTransparent,
  LineSegment,
  DeviceMobile,
  DeviceTablet,
  DotsThree,
  Eye,
  EyeSlash,
  FilmSlate,
  PaintBrush,
  Image as ImageIcon,
  Laptop,
  MagnifyingGlass,
  PaintBucket,
  Plus,
  Square,
  SquaresFour,
  TextT,
  Trash,
  X,
} from "@phosphor-icons/react"
import { DEVICES, type DeviceId } from "../devices"
import { ANIMS, byId } from "../registry"
import { Button, Dialog, IconButton, MenuItem, Popover, Segmented, type Icon } from "../ui"
import { EFFECTS, SAMPLE_COPY, TEMPLATES, isAnimated, uid, type Comp, type Layer, type Scene, type Template } from "./comp"
import { BACKDROPS } from "./config"
import { fillCss, isDark } from "./look"
import { BrandRow, CategoryChips, InBar, PanelFoot } from "../shell"
import { CATEGORIES, categoryName } from "../refs"
import type { Sel } from "./Stage"

export const BG = "@bg"
/** What the Add menu and the canvas toolbar put in a scene. */
export type AddKind = "scene" | "device" | "component" | "breakdown" | "image" | "text" | "callout" | "rect" | "ellipse" | "cursor"
const DEVICE_ICON: Record<DeviceId, Icon> = { iphone: DeviceMobile, duo: BookOpen, ipad: DeviceTablet, macbook: Laptop }
export const layerIcon = (l: Layer): Icon =>
  l.kind === "device"
    ? DEVICE_ICON[l.device]
    : l.kind === "component"
      ? SquaresFour
      : l.kind === "image"
        ? ImageIcon
        : l.kind === "breakdown"
          ? CubeTransparent
          : l.kind === "callout"
            ? LineSegment
            : l.kind === "shape"
              ? l.shape === "ellipse"
                ? Circle
                : Square
              : l.kind === "cursor"
                ? CursorIcon
                : TextT
/** Every kind of thing has its own subtle colour, the same wherever it shows (Raylight's way; the tokens are in
    engine.css): a breakdown is a component's. `kStyle` sets it on an element for the .k-* classes. */
export const kindOf = (l: Layer) => (l.kind === "breakdown" ? "component" : l.kind)
export const tone = (k: string) => `var(--k-${k})`
export const kStyle = (k: string) => ({ "--k": tone(k) }) as CSSProperties
export function layerName(l: Layer) {
  if (l.name) return l.name
  if (l.kind === "device") return DEVICES.find((d) => d.id === l.device)!.name
  if (l.kind === "component") return byId(l.anim)?.name ?? "Component"
  if (l.kind === "breakdown") return `${byId(l.anim)?.name ?? "Screen"}, ${BD_NAME[l.view]}`
  if (l.kind === "image") return l.file || "Image"
  if (l.kind === "callout") return l.text || "Callout"
  if (l.kind === "shape") return l.shape === "ellipse" ? "Ellipse" : "Rectangle"
  if (l.kind === "cursor") return `${l.label || "Someone"}'s cursor`
  return l.text.split("\n")[0].replace("|", "") || "Title"
}
const BD_NAME = { table: "on the table", assemble: "assembling", stack: "in layers", focus: "close up" }
const BD_NOTE = { table: "Components out onto the table", assemble: "Components into the screen", stack: "Components floating in layers", focus: "One component, close" }
function layerNote(l: Layer) {
  if (l.kind === "device") return l.content.kind === "current" ? "Live screen" : l.content.kind === "anim" ? (byId(l.content.id)?.name ?? "Animation") : "Picture"
  if (l.kind === "component") return `${l.shot && l.shot !== "flat" ? `${l.shot[0].toUpperCase()}${l.shot.slice(1)} shot` : l.enter === "none" ? "Animation" : `Enters: ${l.enter}`}${l.hairline ? " · hairline" : ""}`
  if (l.kind === "breakdown") return `${BD_NOTE[l.view]}${l.lines ? " · hairline" : ""}`
  if (l.kind === "image") return l.enter === "none" ? "Picture" : `Enters: ${l.enter}`
  if (l.kind === "callout") return "Label with a leader line"
  const moves = "tweens" in l && l.tweens?.length ? ` · ${l.tweens.length} animation${l.tweens.length > 1 ? "s" : ""}` : ""
  if (l.kind === "shape") return `${l.enter === "none" ? "Shape" : `Enters: ${l.enter}`}${moves}`
  if (l.kind === "cursor") return `Cursor${moves}`
  return `${l.enter === "none" ? "Title" : `Enters: ${l.enter}`}${moves}`
}

export function LayersPanel({
  comp,
  setComp,
  sel,
  setSel,
  onAdd,
  onTemplates,
  onArtist,
  undo,
  hideTitle,
  foot,
  kit,
}: {
  comp: Comp
  setComp: (fn: (c: Comp) => Comp) => void
  sel: Sel
  setSel: (s: Sel) => void
  onAdd: (kind: AddKind, device?: DeviceId) => void
  onTemplates: () => void
  /** the Artist: a whole launch film directed from a brief */
  onArtist?: () => void
  /** after a template replaced the composition: put the old one back */
  undo?: { label: string; run: () => void }
  /** in a sheet that already says "Layers" */
  hideTitle?: boolean
  /** on a computer: the app's brand row over it, and its foot (theme, shortcuts, the lab) under it */
  foot?: ReactNode
  /** the kit (Kit.tsx): a second tab beside the layers */
  kit?: ReactNode
}) {
  const [tab, setTab] = useState<"layers" | "kit">("layers")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => open[id] ?? id === sel.scene
  const scenes = (fn: (s: Scene[]) => Scene[]) => setComp((c) => ({ ...c, scenes: fn(c.scenes) }))
  const layers = (sid: string, fn: (l: Layer[]) => Layer[]) => scenes((ss) => ss.map((s) => (s.id === sid ? { ...s, layers: fn(s.layers) } : s)))
  const shift = <T,>(list: T[], i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= list.length) return list
    const out = [...list]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  }

  // dragging a layer row up or down its scene's list
  const [dragging, setDragging] = useState<{ scene: string; id: string; over: number } | null>(null)
  const rows = useRef(new Map<string, HTMLElement>())
  const press = useRef<{ scene: string; id: string; y: number } | null>(null)

  // under the app bar, New lives there: the panel is the film's own layers
  const bar = useContext(InBar)
  const bgName = BACKDROPS.find((b) => b.id === comp.fill)?.name ?? "Custom colour"
  const fx = EFFECTS.find((e) => e.id === comp.effect)

  return (
    <div className="flex h-full flex-col bg-surface">
      {foot !== undefined && !bar && (
        <BrandRow>
          <Button size="sm" popover="layers-new">
            <Plus size={14} aria-hidden />
            New film
          </Button>
          <Popover id="layers-new" align="end" label="New film">
            <div className="w-[280px] p-1.5">
              {onArtist && (
                <MenuItem icon={PaintBrush} tone={tone("motion")} hint="A whole launch film from your product: story, type, gradients, cuts." onSelect={onArtist}>
                  Direct it with the Artist
                </MenuItem>
              )}
              <MenuItem icon={FilmSlate} tone={tone("scene")} hint="A film by kind: product launch, feature, demo, teaser…" onSelect={onTemplates}>
                Start from a template
              </MenuItem>
            </div>
          </Popover>
        </BrandRow>
      )}
      <div className={`flex shrink-0 items-center gap-2 pl-4 pr-2 ${foot !== undefined ? "h-11 border-y" : "h-12 border-b"}`}>
        {kit && !hideTitle ? (
          <span className="mr-auto">
            <Segmented size="sm" label="Panel" value={tab} onChange={setTab} options={[{ value: "layers", label: "Layers" }, { value: "kit", label: "Kit" }]} />
          </span>
        ) : (
          <h2 className={`mr-auto ${foot !== undefined ? "text-caption font-medium text-fg-2" : "text-body font-semibold"} ${hideTitle ? "sr-only" : ""}`}>Layers</h2>
        )}
        {hideTitle && <span className="mr-auto" />}
        {foot === undefined && (
          <>
            <Button size="sm" variant="ghost" popover="layers-new-sheet">
              <Plus size={14} aria-hidden />
              New film
            </Button>
            <Popover id="layers-new-sheet" align="end" label="New film">
              <div className="w-[280px] p-1.5">
                {onArtist && (
                  <MenuItem icon={PaintBrush} tone={tone("motion")} hint="A whole launch film from your product." onSelect={onArtist}>
                    Direct it with the Artist
                  </MenuItem>
                )}
                <MenuItem icon={FilmSlate} tone={tone("scene")} hint="A film by kind: launch, feature, demo…" onSelect={onTemplates}>
                  Start from a template
                </MenuItem>
              </div>
            </Popover>
          </>
        )}
        <IconButton label="Add a scene or a layer" popover="layers-add">
          <Plus size={16} />
        </IconButton>
        <Popover id="layers-add" align="end" label="Add">
          <div className="w-[260px] p-1.5">
            <MenuItem icon={FilmSlate} tone={tone("scene")} hint="A new shot after this one, with the same devices." onSelect={() => onAdd("scene")}>
              Scene
            </MenuItem>
            <div className="my-1 border-t" />
            <p className="px-2.5 pb-1 pt-1.5 text-micro font-medium text-fg-3">Device, matched to the others in this scene</p>
            {DEVICES.map((d) => (
              <MenuItem key={d.id} icon={DEVICE_ICON[d.id]} tone={tone("device")} onSelect={() => onAdd("device", d.id)}>
                {d.name}
              </MenuItem>
            ))}
            <div className="my-1 border-t" />
            <MenuItem icon={SquaresFour} tone={tone("component")} hint="Any animation from the library, outside a device." onSelect={() => onAdd("component")}>
              Component
            </MenuItem>
            <MenuItem icon={CubeTransparent} tone={tone("component")} hint="A screen taken apart into its components: on the table, in layers, or one close up." onSelect={() => onAdd("breakdown")}>
              Breakdown
            </MenuItem>
            <MenuItem icon={ImageIcon} tone={tone("image")} onSelect={() => onAdd("image")}>
              Picture
            </MenuItem>
            <MenuItem icon={TextT} tone={tone("text")} onSelect={() => onAdd("text")}>
              Title
            </MenuItem>
            <MenuItem icon={LineSegment} tone={tone("callout")} hint="A label with a leader line to a point." onSelect={() => onAdd("callout")}>
              Callout
            </MenuItem>
            <div className="my-1 border-t" />
            <MenuItem icon={Square} tone={tone("shape")} hint="Filled with a colour or gradients." onSelect={() => onAdd("rect")}>
              Rectangle
            </MenuItem>
            <MenuItem icon={Circle} tone={tone("shape")} hint="A dot, an orb, a glow." onSelect={() => onAdd("ellipse")}>
              Ellipse
            </MenuItem>
            <MenuItem icon={CursorIcon} tone={tone("cursor")} hint="A collaborator's cursor with a name, to fly across the canvas." onSelect={() => onAdd("cursor")}>
              Cursor
            </MenuItem>
          </div>
        </Popover>
      </div>

      {undo && (
        <div className="flex items-center gap-2 border-b bg-surface-2 px-4 py-2 text-caption text-fg-2">
          <span className="mr-auto truncate">{undo.label}</span>
          <button type="button" onClick={undo.run} className="press rounded font-medium text-fg underline decoration-fg-3 underline-offset-4">
            Undo
          </button>
        </div>
      )}

      {tab === "kit" && kit ? kit : (
      <>
      <div role="tree" aria-label="Scenes and layers" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {comp.scenes.map((s, si) => {
          const on = sel.scene === s.id && !sel.layer
          const front = [...s.layers].reverse() // front first, like a layers panel
          return (
            <div key={s.id} role="treeitem" aria-expanded={isOpen(s.id)} aria-selected={on} className="mb-0.5">
              <div className={`group flex h-9 items-center gap-1 rounded-md pr-1 ${on ? "bg-sel/15" : "hover:bg-surface-2"}`}>
                <button
                  type="button"
                  aria-label={isOpen(s.id) ? `Collapse ${s.name}` : `Expand ${s.name}`}
                  onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen(s.id) }))}
                  className="grid h-7 w-6 shrink-0 place-items-center rounded text-fg-3 hover:text-fg"
                >
                  <CaretRight size={12} weight="bold" className={`transition-transform duration-150 ${isOpen(s.id) ? "rotate-90" : ""}`} />
                </button>
                <button type="button" onClick={() => setSel({ scene: s.id })} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
                  <span className="w-4 shrink-0 text-caption font-medium tabular-nums text-k-scene">{si + 1}</span>
                  <span className={`truncate text-body ${on ? "font-medium text-fg" : "text-fg-2"}`}>{s.name}</span>
                  <span className="ml-auto shrink-0 text-caption tabular-nums text-fg-3">{s.duration.toFixed(1)}s</span>
                </button>
                <span className={`flex ${on ? "" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"}`}>
                  <IconButton size="sm" label={`${s.name}: more`} popover={`scene-${s.id}`}>
                    <DotsThree size={16} weight="bold" />
                  </IconButton>
                </span>
                <Popover id={`scene-${s.id}`} align="end" label={s.name}>
                  <div className="w-[220px] p-1.5">
                    <MenuItem
                      icon={Copy}
                      onSelect={() => {
                        const copy = { ...s, id: uid(), name: `${s.name} copy`, layers: s.layers.map((l) => ({ ...l, id: uid() })) }
                        scenes((ss) => [...ss.slice(0, si + 1), copy, ...ss.slice(si + 1)])
                        setSel({ scene: copy.id })
                      }}
                    >
                      Duplicate
                    </MenuItem>
                    <MenuItem icon={ArrowUp} disabled={si === 0} onSelect={() => scenes((ss) => shift(ss, si, -1))}>
                      Move earlier
                    </MenuItem>
                    <MenuItem icon={ArrowDown} disabled={si === comp.scenes.length - 1} onSelect={() => scenes((ss) => shift(ss, si, 1))}>
                      Move later
                    </MenuItem>
                    <MenuItem
                      icon={Trash}
                      disabled={comp.scenes.length === 1}
                      onSelect={() => {
                        scenes((ss) => ss.filter((x) => x.id !== s.id))
                        setSel({ scene: comp.scenes[si === 0 ? 1 : si - 1].id })
                      }}
                    >
                      Delete scene
                    </MenuItem>
                  </div>
                </Popover>
              </div>

              {isOpen(s.id) && (
                <ul role="group" className="relative">
                  {!front.length && <li className="py-1.5 pl-11 text-caption text-fg-3">Empty. Add a device, a component or a title.</li>}
                  {front.map((l) => {
                    const i = s.layers.indexOf(l)
                    const picked = sel.scene === s.id && sel.layer === l.id
                    const I = layerIcon(l)
                    const over = dragging?.scene === s.id && dragging.over === i && dragging.id !== l.id
                    return (
                      <li
                        key={l.id}
                        ref={(el) => {
                          if (el) rows.current.set(l.id, el)
                          else rows.current.delete(l.id)
                        }}
                        role="treeitem"
                        aria-selected={picked}
                        className={`group relative flex h-9 touch-none items-center gap-1 rounded-md pl-6 pr-1 ${picked ? "bg-sel/15" : "hover:bg-surface-2"} ${dragging?.id === l.id ? "opacity-60" : ""}`}
                        onPointerDown={(e) => {
                          if ((e.target as Element).closest("button[data-act]") || e.button !== 0) return
                          press.current = { scene: s.id, id: l.id, y: e.clientY }
                          e.currentTarget.setPointerCapture(e.pointerId)
                        }}
                        onPointerMove={(e) => {
                          const p = press.current
                          if (!p) return
                          if (!dragging && Math.abs(e.clientY - p.y) < 5) return
                          // the row the pointer is over, in the scene's own order
                          let target = i
                          for (const x of s.layers) {
                            const r = rows.current.get(x.id)?.getBoundingClientRect()
                            if (r && e.clientY >= r.top && e.clientY < r.bottom) target = s.layers.indexOf(x)
                          }
                          setDragging({ scene: s.id, id: l.id, over: target })
                        }}
                        onPointerUp={() => {
                          const p = press.current
                          press.current = null
                          if (dragging && p) {
                            const to = dragging.over
                            layers(s.id, (ls) => {
                              const from = ls.findIndex((x) => x.id === p.id)
                              const out = ls.filter((x) => x.id !== p.id)
                              out.splice(to, 0, ls[from])
                              return out
                            })
                            setDragging(null)
                          } else setSel({ scene: s.id, layer: l.id })
                        }}
                        onPointerCancel={() => {
                          press.current = null
                          setDragging(null)
                        }}
                        onKeyDown={(e) => {
                          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
                          e.preventDefault()
                          layers(s.id, (ls) => shift(ls, i, e.key === "ArrowUp" ? 1 : -1)) // up the list = towards the front
                        }}
                      >
                        {over && <span aria-hidden className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-sel" />}
                        <button
                          type="button"
                          aria-pressed={picked}
                          onClick={() => setSel({ scene: s.id, layer: l.id })}
                          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 py-1 text-left active:cursor-grabbing"
                        >
                          <I size={15} aria-hidden className={`shrink-0 ${l.hidden ? "text-fg-3" : "k-ink"}`} style={kStyle(kindOf(l))} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-body leading-4 ${l.hidden ? "text-fg-3 line-through" : picked ? "font-medium text-fg" : "text-fg-2"}`}>{layerName(l)}</span>
                            <span className="block truncate text-micro text-fg-3">{layerNote(l)}</span>
                          </span>
                          {isAnimated(l) && (
                            <span title="Animated" className="grid h-4 w-4 shrink-0 place-items-center">
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-k-motion" />
                              <span className="sr-only">(animated)</span>
                            </span>
                          )}
                        </button>
                        <span className={`flex items-center ${picked || l.hidden ? "" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"}`}>
                          <span data-act>
                            <IconButton size="sm" label={l.hidden ? `Show ${layerName(l)}` : `Hide ${layerName(l)}`} active={l.hidden} onClick={() => layers(s.id, (ls) => ls.map((x) => (x.id === l.id ? { ...x, hidden: !x.hidden } : x)))}>
                              {l.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                            </IconButton>
                          </span>
                          <span data-act>
                            <IconButton size="sm" label={`${layerName(l)}: more`} popover={`layer-${l.id}`}>
                              <DotsThree size={16} weight="bold" />
                            </IconButton>
                          </span>
                        </span>
                        <Popover id={`layer-${l.id}`} align="end" label={layerName(l)}>
                          <div className="w-[220px] p-1.5">
                            <MenuItem icon={ArrowUp} disabled={i === s.layers.length - 1} onSelect={() => layers(s.id, (ls) => shift(ls, i, 1))}>
                              Bring forward
                            </MenuItem>
                            <MenuItem icon={ArrowDown} disabled={i === 0} onSelect={() => layers(s.id, (ls) => shift(ls, i, -1))}>
                              Send backward
                            </MenuItem>
                            <MenuItem
                              icon={Copy}
                              onSelect={() => {
                                const copy = { ...l, id: uid() } as Layer
                                layers(s.id, (ls) => [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)])
                                setSel({ scene: s.id, layer: copy.id })
                              }}
                            >
                              Duplicate
                            </MenuItem>
                            <MenuItem
                              icon={Trash}
                              onSelect={() => {
                                layers(s.id, (ls) => ls.filter((x) => x.id !== l.id))
                                setSel({ scene: s.id })
                              }}
                            >
                              Delete
                            </MenuItem>
                          </div>
                        </Popover>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setSel({ scene: sel.scene, layer: BG })}
        aria-pressed={sel.layer === BG}
        className={`press flex h-12 shrink-0 items-center gap-2.5 border-t px-4 text-left ${sel.layer === BG ? "bg-sel/15" : "hover:bg-surface-2"}`}
      >
        <span aria-hidden className="h-5 w-5 shrink-0 rounded shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style={{ background: comp.fill === "transparent" ? "repeating-conic-gradient(#e4e4e8 0% 25%, #f6f6f8 0% 50%) 50% / 8px 8px" : fillCss(comp.fill) }} />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium">Background</span>
          <span className="block truncate text-micro text-fg-3">
            {bgName}
            {comp.effect !== "none" ? ` · ${fx?.name}` : ""} · {comp.light === "dramatic" ? "Keynote light" : comp.light === "soft" ? "Soft light" : "Studio light"}
          </span>
        </span>
        <PaintBucket size={15} aria-hidden className="shrink-0 text-fg-3" />
      </button>
      </>
      )}
      {foot !== undefined && (
        <PanelFoot info={`${comp.scenes.length} ${comp.scenes.length === 1 ? "scene" : "scenes"} · ${comp.scenes.reduce((a, s) => a + s.duration, 0).toFixed(1)} s`}>{foot}</PanelFoot>
      )}
    </div>
  )
}

/* ---------------- the template gallery ---------------- */

/** A storyboard of the template: one card per scene, drawn from what's in it. */
function Storyboard({ t, accent }: { t: Template; accent?: string }) {
  const c = useMemo(() => t.make({ device: "iphone", posture: "open", name: "Title", anim: ANIMS[0].id, copy: SAMPLE_COPY, accent }), [t, accent])
  return (
    <div className="flex h-16 gap-1 rounded-md p-1.5" style={{ background: c.auto ? "linear-gradient(90deg, #0b0b0d 0%, #1b1b20 45%, #f2f1ec 55%, #0b0b0d 100%)" : fillCss(c.fill) }}>
      {c.scenes.slice(0, 8).map((s) => {
        // each scene on its own ground, when it has one
        const ground = s.look?.fill ?? c.fill
        const dark = isDark(ground) || c.auto
        return (
          <div key={s.id} className="flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(127_127_127/0.25)]" style={{ background: s.look?.fill ? fillCss(s.look.fill) : "rgb(255 255 255 / 0.1)" }}>
            {s.layers.map((l) => {
              const I = layerIcon(l)
              return <I key={l.id} size={l.kind === "device" ? 14 : 11} className={dark ? "text-white/80" : "text-black/60"} />
            })}
          </div>
        )
      })}
    </div>
  )
}

export function TemplateDialog({ open, onClose, onPick, scripts = [], accent, onArtist }: { open: boolean; onClose: () => void; onPick: (t: Template) => void; scripts?: Template[]; accent?: string; /** the Artist directs a whole film instead */ onArtist?: () => void }) {
  // the kind of film wanted: every list narrows to it
  const [cat, setCat] = useState("all")
  const fits = (t: Template) => cat === "all" || t.category === cat
  const studied = scripts.filter(fits)
  const built = TEMPLATES.filter(fits)
  const all = [...scripts, ...TEMPLATES]
  const chips = [
    { id: "all", name: "All", count: all.length },
    ...CATEGORIES.film.map((c) => ({ id: c.id, name: c.name, count: all.filter((t) => t.category === c.id).length })),
  ]
  const hint = CATEGORIES.film.find((c) => c.id === cat)?.hint
  const card = (t: Template) => (
    <li key={t.id}>
      <button type="button" onClick={() => onPick(t)} className="press lift flex w-full flex-col gap-2 rounded-xl bg-surface-2 p-2 text-left shadow-[var(--in-hi),0_0_0_1px_var(--line)]">
        <Storyboard t={t} accent={accent} />
        <span className="px-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-body font-medium">{t.name}</span>
            <span className="shrink-0 text-micro tabular-nums text-fg-3">
              {cat === "all" && t.category ? `${categoryName("film", t.category)} · ` : ""}
              {t.scenes === 1 ? "1 scene" : `${t.scenes} scenes`}
            </span>
          </span>
          <span className="mt-0.5 block text-caption text-fg-3">{t.hint}</span>
        </span>
      </button>
    </li>
  )
  return (
    <Dialog open={open} onClose={onClose} label="Templates" className="modal medium">
      <div className="flex max-h-[inherit] flex-col">
        <DialogHead icon={FilmSlate} tone="var(--k-scene)" title="Start from a template" sub="Made from what's open: its device, its screen, its words, your brand." onClose={onClose} />
        <div className="border-b px-4 pb-2 pt-3">
          <CategoryChips label="Kind of film" value={cat} onChange={setCat} options={chips} />
          {hint && <p className="px-0.5 pt-1 text-caption text-fg-3">{hint}</p>}
        </div>
        <div className="scroll-thin min-h-0 overflow-y-auto p-3">
          {onArtist && (
            <button type="button" onClick={onArtist} className="press mb-3 flex w-full items-center gap-3 rounded-lg p-3 text-left shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-k-motion/15 text-k-motion">
                <PaintBrush size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-medium">The Artist directs a whole launch film</span>
                <span className="block text-caption text-fg-3">A story for its kind of film, an art direction (gradients, type, tempo), titles on the beat, the product in its interface: three takes to pick from.</span>
              </span>
            </button>
          )}
          {/* everything else, by kind of film: what it is decides where it goes */}
          {cat === "all"
            ? CATEGORIES.film.map((k) => {
                const of = [...studied, ...built].filter((t) => t.category === k.id)
                return of.length ? (
                  <section key={k.id} aria-label={k.name}>
                    <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">
                      {k.name} · <span className="font-normal">{k.hint}</span>
                    </h3>
                    <ul className="grid grid-cols-1 gap-2.5 pb-4 sm:grid-cols-2 md:grid-cols-3">{of.map(card)}</ul>
                  </section>
                ) : null
              })
            : studied.length > 0 && (
                <>
                  <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Scripts · rebuilt from reference films, improved by the template lab</h3>
                  <ul className="grid grid-cols-1 gap-2.5 pb-4 sm:grid-cols-2 md:grid-cols-3">{studied.map(card)}</ul>
                </>
              )}
          {cat === "all" && [...studied, ...built].some((t) => !t.category) && (
            <>
              <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Other</h3>
              <ul className="grid grid-cols-1 gap-2.5 pb-4 sm:grid-cols-2 md:grid-cols-3">{[...studied, ...built].filter((t) => !t.category).map(card)}</ul>
            </>
          )}
          {cat !== "all" && built.length > 0 && (
            <>
              <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Built in</h3>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">{built.map(card)}</ul>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------- the animation picker ---------------- */

export function AnimPicker({ open, onClose, onPick, dark, title = "Pick an animation" }: { open: boolean; onClose: () => void; onPick: (id: string) => void; dark: boolean; title?: string }) {
  const [q, setQ] = useState("")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus())
  }, [open])
  const list = ANIMS.filter((a) => !q || `${a.name} ${a.category}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Dialog open={open} onClose={onClose} label={title} className="modal">
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center gap-2 border-b py-2.5 pl-4 pr-3">
          <MagnifyingGlass size={15} aria-hidden className="shrink-0 text-fg-3" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={title} aria-label="Search animations" className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-fg-3" />
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <ul className="scroll-thin grid min-h-0 grid-cols-3 gap-x-2 gap-y-3 overflow-y-auto p-3">
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(a.id)
                  onClose()
                }}
                className="press block w-full rounded-lg text-left"
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-canvas shadow-[0_0_0_1px_var(--line)] hover:shadow-[0_0_0_1px_var(--line-strong)]">
                  <img src={`/thumbs/${a.id}-${dark ? "dark" : "light"}.webp`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="mt-1 block truncate px-0.5 text-caption font-medium text-fg-2">{a.name}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="col-span-3 py-8 text-center text-body text-fg-3">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </Dialog>
  )
}

/** How a control works, in a sentence: shown only with Tips on (the rail's ?), unless it holds an action (`keep`). */
export const Hint = ({ children, keep }: { children: ReactNode; keep?: boolean }) => <p className={`${keep ? "" : "hint "}mt-1.5 text-caption text-fg-3`}>{children}</p>
