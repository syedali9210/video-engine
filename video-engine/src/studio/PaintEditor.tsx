// Studio — the gradient editor, the way Figma edits fills: a stack of paints (the front one on top), and for the one
// picked its kind, its handles on a small copy of the frame, its stops on a bar, its opacity and blend, and how it moves:
// drifting by itself (a video sees that) or following the pointer (an interactive page sees that).
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPE } from "react"
import { ArrowDown, ArrowUp, Check, Copy, DotsThree, Eye, EyeSlash, Plus, Swatches, Trash, X } from "@phosphor-icons/react"
import { SliderField, field } from "../controls"
import { IconButton, Popover, Segmented, closePopover, Select } from "../ui"
import { BLENDS, DRIFTS, PAINT_KINDS, PAINT_PRESETS, colourAt, drawPaints, newPaint, rgba, stackCss, type Paint, type PaintKind, type Pt, type Stop } from "./paint"

/** Transparent, shown the way image editors show it. */
const CHECKER = "repeating-conic-gradient(#d9d9de 0% 25%, #f4f4f6 0% 50%) 50% / 10px 10px"
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const KIND_NAME: Record<PaintKind, string> = { solid: "Solid", linear: "Linear", radial: "Radial", angular: "Angular", diamond: "Diamond" }
const title = (s: string) => s[0].toUpperCase() + s.slice(1).replace(/-/g, " ")

/** A paint's swatch: its colours, left to right, over a checker. */
const swatchOf = (p: Paint) => {
  const s = [...p.stops].sort((a, b) => a.at - b.at)
  const c = s.map((x) => `${rgba(x.color, x.alpha)} ${(x.at * 100).toFixed(0)}%`)
  return `linear-gradient(135deg, ${c.length > 1 ? c.join(", ") : `${c[0]}, ${c[0]}`}), ${CHECKER}`
}

export function PaintStack({ paints, set, aspect, accent, base }: { paints: Paint[]; set: (p: Paint[]) => void; aspect: number; accent: string; base: string }) {
  const [selId, setSel] = useState<string | null>(paints.at(-1)?.id ?? null)
  const sel = paints.find((p) => p.id === selId) ?? paints.at(-1) ?? null
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  const up = (id: string, patch: Partial<Paint>) => set(paints.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const add = () => {
    const p = newPaint(paints.length ? "radial" : "linear", /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#3b82f6")
    set([...paints, p])
    setSel(p.id)
  }
  const move = (id: string, dir: 1 | -1) => {
    const i = paints.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= paints.length) return
    const next = [...paints]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }
  const front = [...paints].reverse()
  return (
    <div>
      <div className="flex items-center gap-1 pb-2">
        <span className="mr-auto text-caption text-fg-3">{paints.length ? `${paints.length} layer${paints.length > 1 ? "s" : ""}, the front one on top` : "None yet: start from a preset or add one"}</span>
        <IconButton size="sm" label="Gradient presets" popover="paint-presets">
          <Swatches size={15} />
        </IconButton>
        <IconButton size="sm" label="Add a gradient" onClick={add}>
          <Plus size={15} />
        </IconButton>
        <Popover id="paint-presets" align="end" label="Gradient presets">
          <div className="grid w-[264px] grid-cols-3 gap-2 p-2.5">
            {PAINT_PRESETS.map((pr) => {
              const made = pr.make()
              return (
                <button
                  key={pr.id}
                  type="button"
                  onClick={(e) => {
                    set(made)
                    setSel(made.at(-1)?.id ?? null)
                    closePopover(e.currentTarget)
                  }}
                  className="press group text-left"
                >
                  <span aria-hidden className="block aspect-video rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] group-hover:shadow-[inset_0_0_0_1px_var(--fg-3)]" style={{ background: stackCss(made, 80, 45).replace(/^background:\s*/, "").replace(/;[\s\S]*$/, "") }} />
                  <span className="mt-1 block truncate text-micro font-medium text-fg-2 group-hover:text-fg">{pr.name}</span>
                </button>
              )
            })}
          </div>
        </Popover>
      </div>

      {paints.length > 0 && (
        <ul aria-label="Gradient layers, front first" className="overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--line-strong)]">
          {front.map((p) => {
            const on = p.id === sel?.id
            const menu = `paint-menu-${p.id}`
            return (
              <li key={p.id} className={`flex h-9 items-center gap-1 border-b pl-1.5 pr-1 last:border-b-0 ${on ? "bg-surface-2" : ""}`}>
                <button type="button" aria-current={on || undefined} onClick={() => setSel(p.id)} className="press flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-1 text-left">
                  <span aria-hidden className="h-5 w-5 shrink-0 rounded shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]" style={{ background: swatchOf(p), opacity: p.hidden ? 0.4 : 1 }} />
                  <span className={`truncate text-body ${on ? "font-medium text-fg" : "text-fg-2"} ${p.hidden ? "line-through decoration-fg-3" : ""}`}>{KIND_NAME[p.kind]}</span>
                  {p.blend !== "normal" && <span className="truncate text-caption text-fg-3">{title(p.blend)}</span>}
                  <span className="ml-auto pr-1 text-caption tabular-nums text-fg-3">{Math.round(p.opacity * 100)}%</span>
                </button>
                <IconButton size="sm" label={p.hidden ? "Show it" : "Hide it"} active={p.hidden} onClick={() => up(p.id, { hidden: !p.hidden })}>
                  {p.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                </IconButton>
                <IconButton size="sm" label="More" popover={menu}>
                  <DotsThree size={16} weight="bold" />
                </IconButton>
                <Popover id={menu} align="end" label={`${KIND_NAME[p.kind]} gradient`}>
                  <div className="w-[188px] p-1.5">
                    {(
                      [
                        [ArrowUp, "Bring forward", () => move(p.id, 1), paints.indexOf(p) === paints.length - 1],
                        [ArrowDown, "Send backward", () => move(p.id, -1), paints.indexOf(p) === 0],
                        [
                          Copy,
                          "Duplicate",
                          () => {
                            const d = { ...p, id: Math.random().toString(36).slice(2, 9) }
                            const i = paints.indexOf(p)
                            set([...paints.slice(0, i + 1), d, ...paints.slice(i + 1)])
                            setSel(d.id)
                          },
                          false,
                        ],
                        [Trash, "Remove", () => set(paints.filter((x) => x.id !== p.id)), false],
                      ] as const
                    ).map(([I, label, run, off]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={off}
                        onClick={(e) => {
                          run()
                          closePopover(e.currentTarget)
                        }}
                        className="press flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body hover:bg-surface-2 disabled:opacity-40"
                      >
                        <I size={15} aria-hidden className="text-fg-2" />
                        {label}
                      </button>
                    ))}
                  </div>
                </Popover>
              </li>
            )
          })}
        </ul>
      )}

      {sel && <PaintEditor key={sel.id} p={sel} all={paints} set={(patch) => up(sel.id, patch)} aspect={aspect} />}

      {paints.length > 0 && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(stackCss(paints, Math.round(1000 * aspect), 1000, /^#|^rgb/.test(base) ? base : "")).then(() => setCopied(true))
          }}
          className="press mt-3 flex items-center gap-1.5 text-caption font-medium text-fg-2 hover:text-fg"
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? "Copied" : "Copy as CSS"}
        </button>
      )}
    </div>
  )
}

/* ---------------- one paint ---------------- */

function PaintEditor({ p, all, set, aspect }: { p: Paint; all: Paint[]; set: (patch: Partial<Paint>) => void; aspect: number }) {
  const [stopAt, setStopAt] = useState(0)
  const stop = p.stops[Math.min(stopAt, p.stops.length - 1)]
  const setKind = (kind: PaintKind) => {
    if (kind === p.kind) return
    // keep its colours; a solid takes the first, and leaving a solid brings back a fade of it
    const stops = kind === "solid" ? p.stops.slice(0, 1) : p.kind === "solid" ? [{ ...p.stops[0], at: 0 }, { ...p.stops[0], at: 1, alpha: 0 }] : p.stops
    const fresh = newPaint(kind)
    set({ kind, stops, ...(p.kind === "linear" || kind === "linear" ? { from: fresh.from, to: fresh.to } : {}) })
    setStopAt(0)
  }
  const follow = p.follow?.amount ? p.follow.how : "off"
  const drift = p.drift ?? { kind: "none" as const, period: 10, amount: 0.5 }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
        <label htmlFor={`pt-kd-${p.id}`} className="text-body text-fg-2">
          Kind
        </label>
        <Select id={`pt-kd-${p.id}`} value={p.kind} onChange={(e) => setKind(e.target.value as PaintKind)} className={`${field} h-7 w-[150px] cursor-pointer px-2 text-body`}>
          {PAINT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </div>
      {p.kind !== "solid" && <HandlePad p={p} all={all} set={set} aspect={aspect} />}
      {p.kind !== "solid" && <StopBar p={p} sel={Math.min(stopAt, p.stops.length - 1)} setSel={setStopAt} set={set} />}
      {stop && (
        <StopFields
          stop={stop}
          solid={p.kind === "solid"}
          canRemove={p.stops.length > 2}
          set={(patch) => set({ stops: p.stops.map((s, i) => (i === Math.min(stopAt, p.stops.length - 1) ? { ...s, ...patch } : s)) })}
          remove={() => {
            set({ stops: p.stops.filter((_, i) => i !== stopAt) })
            setStopAt(Math.max(0, stopAt - 1))
          }}
        />
      )}
      <div className="space-y-1.5">
        <SliderField id={`pt-op-${p.id}`} label="Opacity" unit="%" min={0} max={100} step={1} value={Math.round(p.opacity * 100)} def={100} set={(v) => set({ opacity: v / 100 })} />
        {(p.kind === "radial" || p.kind === "diamond" || p.kind === "angular") && (
          <SliderField id={`pt-rt-${p.id}`} label="Shape" unit="%" min={10} max={300} step={1} value={Math.round(p.ratio * 100)} def={100} set={(v) => set({ ratio: v / 100 })} hint="The cross radius against the long one: 100% is round." />
        )}
        <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
          <label htmlFor={`pt-bl-${p.id}`} className="text-body text-fg-2">
            Blend
          </label>
          <Select id={`pt-bl-${p.id}`} value={p.blend} onChange={(e) => set({ blend: e.target.value as Paint["blend"] })} className={`${field} h-7 w-[150px] cursor-pointer px-2 text-body`}>
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {title(b)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <p id={`pt-fl-${p.id}`} className="text-caption font-medium text-fg-3">
          Follows the pointer
        </p>
        <Segmented
          full
          size="sm"
          labelledBy={`pt-fl-${p.id}`}
          value={follow}
          onChange={(v) => set({ follow: v === "off" ? undefined : { how: v, amount: p.follow?.amount || 0.5 } })}
          options={[
            { value: "off", label: "No" },
            { value: "move", label: "Moves to it" },
            { value: "turn", label: "Turns to it" },
          ]}
        />
        {follow !== "off" && (
          <SliderField id={`pt-fa-${p.id}`} label="How far" unit="%" min={5} max={100} step={1} value={Math.round((p.follow?.amount ?? 0.5) * 100)} def={50} set={(v) => set({ follow: { how: p.follow!.how, amount: v / 100 } })} />
        )}
        <p className="text-caption text-fg-3">On a web page, and on the stage when you hover it. A video has no pointer, so give it a drift.</p>
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <p id={`pt-dr-${p.id}`} className="text-caption font-medium text-fg-3">
          Drifts by itself
        </p>
        <div role="radiogroup" aria-labelledby={`pt-dr-${p.id}`} className="grid grid-cols-5 gap-1">
          {DRIFTS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={drift.kind === d.id}
              title={d.hint}
              onClick={() => set({ drift: d.id === "none" ? undefined : { ...drift, kind: d.id } })}
              className={`press h-7 truncate rounded-md px-1 text-caption font-medium ${drift.kind === d.id ? "bg-surface text-fg shadow-[0_0_0_1.5px_var(--fg)] dark:bg-surface-2" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg"}`}
            >
              {d.name}
            </button>
          ))}
        </div>
        {drift.kind !== "none" && (
          <>
            <SliderField id={`pt-dp-${p.id}`} label="Once every" unit="s" min={2} max={60} step={0.5} value={drift.period} def={10} set={(v) => set({ drift: { ...drift, period: v } })} hint="A video a whole number of these long loops without a seam." />
            {drift.kind !== "spin" && <SliderField id={`pt-da-${p.id}`} label="How far" unit="%" min={5} max={100} step={1} value={Math.round(drift.amount * 100)} def={50} set={(v) => set({ drift: { ...drift, amount: v / 100 } })} />}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- handles on a small copy of the frame ---------------- */

/** The whole stack drawn small, with the picked paint's handles: its start (or centre), its end (or radius), and for
    the round kinds a square that sets the cross radius. Drag them, or move them with the arrow keys. */
function HandlePad({ p, all, set, aspect }: { p: Paint; all: Paint[]; set: (patch: Partial<Paint>) => void; aspect: number }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(240)
  const h = Math.round(w / aspect)
  const drag = useRef<"from" | "to" | "ratio" | null>(null)
  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext("2d")
    if (!c || !ctx) return
    const dpr = Math.min(2, devicePixelRatio)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawPaints(ctx, w, h, all, 0, null)
  }, [all, w, h])
  // the handles in px on the pad
  const px = (q: Pt) => ({ x: q.x * w, y: q.y * h })
  const f = px(p.from)
  const t = px(p.to)
  const ang = Math.atan2(t.y - f.y, t.x - f.x)
  const r = Math.hypot(t.x - f.x, t.y - f.y)
  const round = p.kind !== "linear"
  const q = { x: f.x - Math.sin(ang) * r * p.ratio, y: f.y + Math.cos(ang) * r * p.ratio }
  const at = (e: RPE) => {
    const b = box.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - b.left) / b.width, -0.5, 1.5), y: clamp((e.clientY - b.top) / b.height, -0.5, 1.5) }
  }
  const onMove = (e: RPE) => {
    const which = drag.current
    if (!which) return
    const pt = at(e)
    if (which === "from") {
      // the end travels with the start, as in Figma
      const dx = pt.x - p.from.x
      const dy = pt.y - p.from.y
      set({ from: pt, to: { x: p.to.x + dx, y: p.to.y + dy } })
    } else if (which === "to") set({ to: pt })
    else {
      const d = Math.hypot(pt.x * w - f.x, pt.y * h - f.y)
      set({ ratio: clamp(d / Math.max(1, r), 0.05, 3) })
    }
  }
  const handle = (which: "from" | "to" | "ratio", pos: Pt, label: string, shape: string) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = which
      }}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onKeyDown={(e: KeyboardEvent) => {
        const by = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]
        if (!by) return
        e.preventDefault()
        const k = e.shiftKey ? 0.05 : 0.01
        if (which === "ratio") set({ ratio: clamp(p.ratio + (by[0] || -by[1]) * k * 2, 0.05, 3) })
        else if (which === "from") set({ from: { x: p.from.x + by[0] * k, y: p.from.y + by[1] * k }, to: { x: p.to.x + by[0] * k, y: p.to.y + by[1] * k } })
        else set({ to: { x: p.to.x + by[0] * k, y: p.to.y + by[1] * k } })
      }}
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.45),0_1px_4px_rgb(0_0_0/0.4)] outline-none focus-visible:ring-2 focus-visible:ring-fg active:cursor-grabbing ${shape}`}
      style={{ left: pos.x, top: pos.y }}
    />
  )
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--line-strong)]" style={{ height: h, background: CHECKER }}>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" width={w} height={h}>
        <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="white" strokeWidth="1.5" />
        <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="black" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 3" />
        {round && <line x1={f.x} y1={f.y} x2={q.x} y2={q.y} stroke="white" strokeOpacity="0.85" strokeWidth="1.5" />}
      </svg>
      {handle("from", f, p.kind === "linear" ? "Start of the gradient: drag, or use the arrow keys" : "Centre: drag, or use the arrow keys", "h-3.5 w-3.5 rounded-full bg-[var(--fg)]")}
      {handle("to", t, p.kind === "linear" ? "End of the gradient" : "Radius and direction", "h-3.5 w-3.5 rounded-full bg-transparent")}
      {round && handle("ratio", q, "Cross radius", "h-3 w-3 rounded-[2px] bg-white")}
    </div>
  )
}

/* ---------------- stops on a bar ---------------- */

function StopBar({ p, sel, setSel, set }: { p: Paint; sel: number; setSel: (i: number) => void; set: (patch: Partial<Paint>) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const ordered = [...p.stops].sort((a, b) => a.at - b.at)
  const css = `linear-gradient(90deg, ${ordered.map((s) => `${rgba(s.color, s.alpha)} ${(s.at * 100).toFixed(1)}%`).join(", ")}), ${CHECKER}`
  const posOf = (x: number) => {
    const b = bar.current!.getBoundingClientRect()
    return clamp((x - b.left) / b.width)
  }
  const moveTo = (i: number, at: number) => set({ stops: p.stops.map((s, j) => (j === i ? { ...s, at: +at.toFixed(3) } : s)) })
  return (
    <div className="px-1.5">
      <div
        ref={bar}
        className="relative h-6 cursor-copy rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
        style={{ background: css }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return
          // a click on the bar adds a stop there, in the colour the gradient already has there
          const at = posOf(e.clientX)
          set({ stops: [...p.stops, colourAt(p.stops, at)] })
          setSel(p.stops.length)
        }}
        title="Click to add a stop"
      >
        {p.stops.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Stop at ${Math.round(s.at * 100)}%: ${s.color}${s.alpha < 1 ? `, ${Math.round(s.alpha * 100)}% opaque` : ""}. Arrow keys move it, Delete removes it`}
            aria-pressed={i === sel}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = i
              setSel(i)
            }}
            onPointerMove={(e) => drag.current === i && moveTo(i, posOf(e.clientX))}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault()
                moveTo(i, clamp(s.at + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01)))
              } else if ((e.key === "Delete" || e.key === "Backspace") && p.stops.length > 2) {
                e.preventDefault()
                set({ stops: p.stops.filter((_, j) => j !== i) })
                setSel(Math.max(0, i - 1))
              }
            }}
            className={`absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full outline-none ${i === sel ? "z-10 shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--fg)]" : "shadow-[0_0_0_2px_white,0_0_0_3px_rgb(0_0_0/0.3)]"}`}
            style={{ left: `${s.at * 100}%`, background: `linear-gradient(${rgba(s.color, s.alpha)}, ${rgba(s.color, s.alpha)}), ${CHECKER}` }}
          />
        ))}
      </div>
    </div>
  )
}

function StopFields({ stop, solid, canRemove, set, remove }: { stop: Stop; solid: boolean; canRemove: boolean; set: (s: Partial<Stop>) => void; remove: () => void }) {
  const [hex, setHex] = useState(stop.color)
  useEffect(() => setHex(stop.color), [stop.color])
  return (
    <div className="flex items-center gap-1.5">
      <label className="press relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg" style={{ background: `linear-gradient(${rgba(stop.color, stop.alpha)}, ${rgba(stop.color, stop.alpha)}), ${CHECKER}` }}>
        <span className="sr-only">Colour</span>
        <input type="color" value={stop.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <input
        aria-label="Colour, as hex"
        value={hex}
        spellCheck={false}
        onChange={(e) => {
          setHex(e.target.value)
          const v = e.target.value.trim()
          if (/^#?[0-9a-f]{6}$/i.test(v)) set({ color: (v.startsWith("#") ? v : `#${v}`).toLowerCase() })
        }}
        onBlur={() => setHex(stop.color)}
        className={`${field} h-8 w-[84px] px-2 font-mono text-caption uppercase`}
      />
      <NumberBox label="Opacity of this stop" value={Math.round(stop.alpha * 100)} unit="%" set={(v) => set({ alpha: clamp(v / 100) })} />
      {!solid && <NumberBox label="Where it sits" value={Math.round(stop.at * 100)} unit="%" set={(v) => set({ at: clamp(v / 100) })} />}
      {!solid && (
        <IconButton size="sm" label="Remove this stop" disabled={!canRemove} onClick={remove}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  )
}

function NumberBox({ label, value, unit, set }: { label: string; value: number; unit: string; set: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <label className={`${field} flex h-8 w-[62px] items-center px-1.5 text-caption tabular-nums`}>
      <span className="sr-only">{label}</span>
      <input
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() && Number.isFinite(n)) set(n)
        }}
        onBlur={() => setDraft(String(value))}
        className="w-full min-w-0 bg-transparent text-right outline-none"
      />
      <span aria-hidden className="pl-0.5 text-fg-3">
        {unit}
      </span>
    </label>
  )
}
