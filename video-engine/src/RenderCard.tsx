// An export in progress, wherever you are: a card at the foot of the window with the engine's voice (a ring, a verb
// that changes, a quip or a tip), the frame it's on and about how long is left. It folds into a pill if it's in the
// way, says plainly when the file is ready (and checked), and when something went wrong, the step that helps.
import { useEffect, useRef, useState } from "react"
import { ArrowsInSimple, ArrowsOutSimple, SlidersHorizontal, WarningCircle, X } from "@phosphor-icons/react"
import type { ExportState } from "./studio/export"
import { Making, ProgressRing } from "./Thinking"
import { Problem } from "./States"

const secs = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`)

export function RenderCard({ state, onRetry, onClose, onOptions }: { state: ExportState; onRetry: () => void; onClose: () => void; /** the export's own panel: thumbnails, a review link, the web page */ onOptions: () => void }) {
  const [small, setSmall] = useState(false)
  const [hover, setHover] = useState(false)
  // how fast it's going, measured from the first frame it reported
  const t0 = useRef<{ at: number; done: number } | null>(null)
  const working = state.phase === "working"
  useEffect(() => {
    if (!working) t0.current = null
  }, [working])
  if (working && state.total > 1 && state.done > 0 && !t0.current) t0.current = { at: performance.now(), done: state.done }
  // a finished file rests a moment, then goes by itself (not while the pointer is on it)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (state.phase !== "done" || hover) return
    const t = setTimeout(() => close.current(), 12000)
    return () => clearTimeout(t)
  }, [state.phase, hover])
  useEffect(() => {
    if (state.phase !== "working") setSmall(false)
  }, [state.phase])

  if (state.phase === "idle") return null

  if (state.phase === "working") {
    const pct = state.total > 1 ? state.done / state.total : undefined
    let eta = ""
    const s = t0.current
    if (s && state.done - s.done >= 3) {
      const per = (performance.now() - s.at) / 1000 / (state.done - s.done)
      eta = `about ${secs(per * (state.total - state.done))} left`
    }
    const detail = state.total > 1 ? `Frame ${state.done} of ${state.total}${eta ? ` · ${eta}` : ""}` : state.label
    if (small)
      return (
        <button type="button" onClick={() => setSmall(false)} aria-label="Show the export's progress" className="render-card small press flex items-center gap-2.5 text-body font-medium">
          <ProgressRing value={pct} size={28} />
          <span className="tabular-nums">{pct != null ? `${Math.round(pct * 100)}%` : "Exporting…"}</span>
          <ArrowsOutSimple size={14} aria-hidden className="text-fg-3" />
        </button>
      )
    return (
      <section aria-label="Export in progress" className="render-card">
        <div className="flex items-start gap-2">
          <Making progress={pct} detail={detail} className="min-w-0 flex-1" />
          <button type="button" onClick={() => setSmall(true)} aria-label="Fold it into a pill" className="press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg">
            <ArrowsInSimple size={16} aria-hidden />
          </button>
        </div>
        <div className="render-bar mt-3.5">
          <span style={{ width: `${Math.max(3, (pct ?? 0.04) * 100)}%` }} />
        </div>
        <p className="mt-2 text-micro text-fg-3">{state.label}. You can keep working, or go elsewhere in the app.</p>
      </section>
    )
  }

  if (state.phase === "error")
    return (
      <section aria-label="The export stopped" className="render-card">
        <div className="flex items-start gap-2">
          <Problem compact error={state.message} onRetry={onRetry} className="min-w-0 flex-1" />
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg">
            <X size={15} aria-hidden />
          </button>
        </div>
      </section>
    )

  const problems = state.checks?.findings.filter((f) => f.level !== "info") ?? []
  return (
    <section aria-label="Export finished" className="render-card" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <div role="status" className="flex items-start gap-3.5">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-good text-white shadow-[0_8px_20px_-8px_var(--good)]">
          <svg viewBox="0 0 24 24" width="22" height="22" className="check-draw" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-ui font-semibold tracking-[-0.01em]">{state.kind === "video" ? "Your film is ready" : "Your image is ready"}</span>
          <span className="mt-0.5 block truncate text-caption text-fg-3" title={state.file}>
            Downloaded {state.file}
            {state.checks ? (state.checks.pass ? " · the file checks out" : "") : ""}
          </span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg">
          <X size={15} aria-hidden />
        </button>
      </div>
      {problems.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-surface-2 px-3 py-2.5">
          {problems.slice(0, 3).map((f, i) => (
            <li key={i} className="flex items-start gap-1.5 text-caption text-fg-2">
              <WarningCircle size={14} aria-hidden className={`mt-px shrink-0 ${f.level === "error" ? "text-bad-ink" : "text-warn-ink"}`} />
              {f.text}
            </li>
          ))}
        </ul>
      )}
      {state.kind === "video" && state.id && (
        <button type="button" onClick={onOptions} className="press btn btn-2 mt-3.5 flex h-9 w-full items-center justify-center gap-2 rounded-full text-body font-medium">
          <SlidersHorizontal size={15} aria-hidden />
          Thumbnails, a review link, your verdict
        </button>
      )}
    </section>
  )
}
