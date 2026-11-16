// States: what a place shows when it has nothing yet, while it waits, and when something went wrong. One look
// everywhere: a glyph on a soft tile, a title that says what's true, one line on why, and the next step as a button.
// `explain` turns any error the engine meets into those words and that step: the engine's server isn't answering, the
// network's gone, the AI isn't set up, it's busy, it's out of requests for today, it took too long.
import { createContext, useContext, type ReactNode } from "react"
import { ArrowClockwise, CloudSlash, Gear, Hourglass, Key, PlugsConnected, WarningCircle, type Icon } from "@phosphor-icons/react"
import { explain, type Trouble } from "./trouble"

export { explain }

const ICON: Record<Trouble["kind"], Icon> = { offline: CloudSlash, server: PlugsConnected, "ai-key": Key, "ai-busy": Hourglass, "ai-quota": Hourglass, timeout: Hourglass, unknown: WarningCircle }

/** The app's way to the AI's settings, for a problem's "Settings" button (App provides it). */
export const OpenSettings = createContext<(() => void) | null>(null)

/** Something went wrong: what happened, why, and the step that helps. `compact` is one row (a card's foot). */
export function Problem({ error, onRetry, compact, className = "" }: { error: unknown; onRetry?: () => void; compact?: boolean; className?: string }) {
  const t = explain(error)
  const settings = useContext(OpenSettings)
  const I = ICON[t.kind]
  const tone = t.kind === "unknown" || t.kind === "server" ? "var(--bad-ink)" : "var(--warn-ink)"
  const actions = (
    <span className="flex shrink-0 gap-1.5">
      {t.retry && onRetry && (
        <button type="button" onClick={onRetry} className="press btn btn-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-body font-medium">
          <ArrowClockwise size={14} aria-hidden />
          Try again
        </button>
      )}
      {t.settings && settings && (
        <button type="button" onClick={settings} className="press btn btn-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-body font-medium">
          <Gear size={14} aria-hidden />
          Settings
        </button>
      )}
    </span>
  )
  if (compact)
    return (
      <div role="alert" className={`flex items-center gap-3 ${className}`}>
        <I size={18} aria-hidden className="shrink-0" style={{ color: tone }} />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium">{t.title}</span>
          <span className="block text-caption text-fg-3 text-pretty">{t.detail}</span>
        </span>
        {actions}
      </div>
    )
  return (
    <div role="alert" className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <span aria-hidden className="grid h-12 w-12 place-items-center rounded-[14px]" style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 22%, transparent)` }}>
        <I size={22} />
      </span>
      <p className="mt-4 text-ui font-semibold">{t.title}</p>
      <p className="mt-1 max-w-[46ch] text-body text-fg-3 text-pretty">{t.detail}</p>
      <div className="mt-5">{actions}</div>
    </div>
  )
}

/** Nothing here yet: what will be, and the one step that starts it. */
export function Empty({ icon: I, title, sub, action, children, className = "" }: { icon: Icon; title: string; sub?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <span aria-hidden className="grid h-12 w-12 place-items-center rounded-[14px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <I size={22} />
      </span>
      <p className="mt-4 text-ui font-semibold">{title}</p>
      {sub && <p className="mt-1 max-w-[46ch] text-body text-fg-3 text-pretty">{sub}</p>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
      {children}
    </div>
  )
}

/** A shape that holds a place while what goes there loads: the same size, a light passing over it. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />
}
