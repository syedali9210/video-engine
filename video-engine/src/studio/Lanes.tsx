// Studio — the timeline's lanes, Raylight's way: one lane per layer of the scene that's showing, its In and Out as
// blocks on it, and the picked layer opened into a lane per animated property with its animation blocks. Drag a block
// to move it, drag its edges to stretch it; it snaps to the playhead, to other blocks' edges and to tenths of a second.
// Click a lane to pick its layer, click the ruler to move the playhead.
import { useRef, useState, type PointerEvent as RPE } from "react"
import { PROPS, moving, type MovingLayer, type Prop, type Scene, type Tween } from "./comp"
import { kStyle, kindOf, layerIcon, layerName } from "./Layers"

type Target = { layer: string; what: "in" | "out" | string }
type Draft = Target & { at: number; dur: number }
type Grab = Target & { mode: "move" | "start" | "end"; x: number; at: number; dur: number; moved: boolean }

const LABEL = 172
const r2 = (x: number) => Math.round(x * 100) / 100

export function Lanes({
  scene,
  start,
  sel,
  setSel,
  update,
  seek,
  headRef,
}: {
  scene: Scene
  /** when the scene starts in the composition, seconds */
  start: number
  sel?: string
  setSel: (layer: string) => void
  update: (layer: string, patch: Partial<MovingLayer>) => void
  /** move the playhead (composition time) */
  seek: (t: number) => void
  /** the stage moves this line with the playhead */
  headRef: (el: HTMLDivElement | null) => void
}) {
  const D = Math.max(0.1, scene.duration)
  const track = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const grab = useRef<Grab | null>(null)
  const layers = [...scene.layers].reverse().filter((l): l is MovingLayer => moving(l) && !l.hidden)
  const order = scene.layers.filter((l) => l.kind !== "device" && !l.hidden)
  const auto = (l: MovingLayer) => 0.25 + 0.12 * order.indexOf(l)
  const pps = () => (track.current?.clientWidth ?? 600) / D
  const pct = (t: number) => `${(t / D) * 100}%`
  const tick = D <= 6 ? 0.5 : D <= 16 ? 1 : 2

  /** every block's time span now (with the one being dragged at its draft place) */
  const spans = (l: MovingLayer) => {
    const inT = { at: l.entry?.at ?? auto(l), dur: l.entry?.dur ?? 0.9 }
    const out = l.exit ? { at: l.exit.at, dur: l.exit.dur } : null
    const d = (what: string, x: { at: number; dur: number }) => (draft && draft.layer === l.id && draft.what === what ? { at: draft.at, dur: draft.dur } : x)
    return { in: l.enter !== "none" ? d("in", inT) : null, out: out && d("out", out), tweens: (l.tweens ?? []).map((t) => ({ t, ...d(t.id, t) })) }
  }
  /** edges to snap to: the playhead's place isn't known here, so 0, the end, and every other block's edges */
  const edges = (skip: Target) => {
    const out = [0, D]
    for (const l of layers) {
      const s = spans(l)
      for (const [what, x] of [["in", s.in], ["out", s.out], ...s.tweens.map((y) => [y.t.id, y] as const)] as const) {
        if (!x || (l.id === skip.layer && what === skip.what)) continue
        out.push(x.at, x.at + x.dur)
      }
    }
    return out
  }
  const snap = (t: number, skip: Target) => {
    const px = pps()
    for (const e of edges(skip)) if (Math.abs(e - t) * px < 6) return e
    return Math.round(t * 20) / 20
  }

  const down = (e: RPE, l: MovingLayer, what: string, mode: Grab["mode"], at: number, dur: number) => {
    e.stopPropagation()
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    grab.current = { layer: l.id, what, mode, x: e.clientX, at, dur, moved: false }
    setSel(l.id)
  }
  const move = (e: RPE) => {
    const g = grab.current
    if (!g) return
    const dt = (e.clientX - g.x) / pps()
    if (!g.moved && Math.abs(e.clientX - g.x) < 3) return
    g.moved = true
    let at = g.at
    let dur = g.dur
    if (g.mode === "move") at = Math.min(D - 0.05, Math.max(0, snap(g.at + dt, g)))
    else if (g.mode === "start") {
      const end = g.at + g.dur
      at = Math.min(end - 0.05, Math.max(0, snap(g.at + dt, g)))
      dur = end - at
    } else dur = Math.max(0.05, snap(g.at + g.dur + dt, g) - g.at)
    setDraft({ layer: g.layer, what: g.what, at: r2(at), dur: r2(dur) })
  }
  const up = () => {
    const g = grab.current
    grab.current = null
    const d = draft
    setDraft(null)
    if (!g || !g.moved || !d) return
    const l = layers.find((x) => x.id === g.layer)
    if (!l) return
    if (g.what === "in") update(l.id, { entry: { at: d.at, dur: d.dur, ease: l.entry?.ease } })
    else if (g.what === "out" && l.exit) update(l.id, { exit: { ...l.exit, at: d.at, dur: d.dur } })
    else update(l.id, { tweens: (l.tweens ?? []).map((t) => (t.id === g.what ? { ...t, at: d.at, dur: d.dur } : t)) })
  }

  // every animation block is violet, the colour of motion, firmer on the picked layer
  const block = (l: MovingLayer, what: string, x: { at: number; dur: number }, label: string, h: string) => (
    <div
      key={what}
      role="slider"
      tabIndex={0}
      aria-label={`${layerName(l)}: ${label}, from ${x.at.toFixed(2)} s for ${x.dur.toFixed(2)} s. Arrow keys move it, Shift with arrows stretches it`}
      aria-valuemin={0}
      aria-valuemax={D}
      aria-valuenow={x.at}
      onPointerDown={(e) => down(e, l, what, "move", x.at, x.dur)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        const by = e.key === "ArrowLeft" ? -0.05 : 0.05
        const at = e.shiftKey ? x.at : Math.max(0, x.at + by)
        const dur = e.shiftKey ? Math.max(0.05, x.dur + by) : x.dur
        if (what === "in") update(l.id, { entry: { at, dur, ease: l.entry?.ease } })
        else if (what === "out" && l.exit) update(l.id, { exit: { ...l.exit, at, dur } })
        else update(l.id, { tweens: (l.tweens ?? []).map((t) => (t.id === what ? { ...t, at, dur } : t)) })
      }}
      className={`group/b absolute top-1/2 flex -translate-y-1/2 cursor-grab touch-none items-center overflow-hidden rounded-[5px] px-1.5 text-micro font-medium outline-none focus-visible:ring-2 focus-visible:ring-sel active:cursor-grabbing ${sel === l.id ? "k-block-on" : "k-block"} ${h}`}
      style={{ ...kStyle("motion"), left: pct(x.at), width: `max(10px, ${(x.dur / D) * 100}%)` }}
    >
      <span className="pointer-events-none truncate">{label}</span>
      {(["start", "end"] as const).map((m) => (
        <span
          key={m}
          aria-hidden
          onPointerDown={(e) => down(e, l, what, m, x.at, x.dur)}
          onPointerMove={move}
          onPointerUp={up}
          className={`absolute inset-y-0 w-2 cursor-ew-resize opacity-0 group-hover/b:opacity-100 ${m === "start" ? "left-0" : "right-0"}`}
          style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--k) 70%, transparent), transparent)", transform: m === "end" ? "scaleX(-1)" : undefined }}
        />
      ))}
    </div>
  )

  const name = (p: Prop) => PROPS.find((x) => x.id === p)!.name
  return (
    <div className="select-none border-t text-caption" onPointerMove={move} onPointerUp={up}>
      {/* the ruler: click to move the playhead into this scene */}
      <div className="flex h-6 items-stretch border-b bg-surface-2/40">
        <div className="flex shrink-0 items-center truncate px-3 font-medium text-fg-2" style={{ width: LABEL }}>
          {scene.name}
        </div>
        <div
          ref={track}
          className="relative flex-1 cursor-pointer"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(start + Math.min(D - 0.001, Math.max(0, ((e.clientX - r.left) / r.width) * D)))
          }}
        >
          {Array.from({ length: Math.ceil(D / tick) }, (_, i) => i * tick).map((t) => (
            <span key={t} className="absolute top-0 h-full border-l border-line pl-1 text-micro leading-6 tabular-nums text-fg-3" style={{ left: pct(t) }}>
              {Number.isInteger(t) ? `${t}s` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="scroll-thin relative max-h-[188px] overflow-y-auto">
        {!layers.length && <p className="relative z-20 mx-auto my-2 w-fit rounded-full bg-surface px-3 py-1 text-fg-3 shadow-[0_0_0_1px_var(--line)]">Nothing on this scene's timeline yet: add a title, a picture or a shape from the toolbar on the canvas.</p>}
        {layers.map((l) => {
          const s = spans(l)
          const on = sel === l.id
          const I = layerIcon(l)
          const props = [...new Set((l.tweens ?? []).map((t) => t.prop))]
          return (
            <div key={l.id}>
              <div className={`flex h-7 items-stretch ${on ? "bg-sel/10" : "hover:bg-surface-2/60"}`}>
                <button type="button" onClick={() => setSel(l.id)} className="flex shrink-0 items-center gap-1.5 truncate px-3 text-left" style={{ width: LABEL }}>
                  <I size={13} aria-hidden className="k-ink shrink-0" style={kStyle(kindOf(l))} />
                  <span className={`truncate ${on ? "font-medium text-fg" : "text-fg-2"}`}>{layerName(l)}</span>
                </button>
                <div className="relative flex-1 border-l" onPointerDown={() => setSel(l.id)}>
                  {/* the layer is on screen the whole scene: its lifetime as a track in its kind's colour */}
                  <span aria-hidden className={`absolute inset-x-0 top-1/2 h-[18px] -translate-y-1/2 rounded-[5px] ${on ? "k-track-on" : "k-track"}`} style={kStyle(kindOf(l))} />
                  {s.in && block(l, "in", s.in, `In · ${l.enter}`, "h-[18px]")}
                  {s.out && block(l, "out", s.out, `Out · ${l.exit!.kind}`, "h-[18px]")}
                  {!on && s.tweens.map(({ t, at, dur }) => <span key={t.id} aria-hidden className="absolute bottom-0.5 h-[3px] rounded-full bg-k-motion" style={{ left: pct(at), width: pct(dur) }} />)}
                </div>
              </div>
              {on &&
                props.map((p) => (
                  <div key={p} className="flex h-6 items-stretch bg-sel/[0.05]">
                    <div className="flex shrink-0 items-center gap-1.5 truncate pl-8 pr-3 text-fg-2" style={{ width: LABEL }}>
                      <span aria-hidden className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-k-motion" />
                      {name(p)}
                    </div>
                    <div className="relative flex-1 border-l">
                      {s.tweens
                        .filter(({ t }) => t.prop === p)
                        .map(({ t, at, dur }: { t: Tween; at: number; dur: number }) => block(l, t.id, { at, dur }, name(p), "h-4"))}
                    </div>
                  </div>
                ))}
            </div>
          )
        })}
        <div ref={headRef} aria-hidden className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-sel" style={{ left: LABEL, display: "none" }} />
      </div>
    </div>
  )
}
