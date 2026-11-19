// The AI at work, shown as a small glyph that moves (the four "agent thinking" states): a striped globe turning, a
// light scanning a ring of lines, bars sliding through a circle, bars breathing. Its words shimmer beside it. Under
// reduced motion the glyph holds still and the words stay plain (engine.css).
import { useEffect, useId, useState, type ReactNode } from "react"
import { SESSION_GERUNDS, SESSION_QUOTES } from "./quips"

export type ThinkingGlyph = "globe" | "scan" | "slide" | "breathe"
export const GLYPHS: ThinkingGlyph[] = ["globe", "scan", "slide", "breathe"]

export function Glyph({ variant = "globe", size = 22 }: { variant?: ThinkingGlyph; size?: number }) {
  const id = `g-${variant}`
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`think think-${variant} shrink-0`}>
      <defs>
        <clipPath id={id}>
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      {variant === "globe" && (
        <g clipPath={`url(#${id})`}>
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.12" />
          {/* stripes that thin toward the poles, rolling down: a sphere turning */}
          <g className="think-roll">
            {[0, 1].map((k) => (
              <g key={k} transform={`translate(0 ${k * 24})`}>
                {[1.5, 4.5, 8, 12, 16, 19.5, 22.5].map((y, i) => (
                  <rect key={i} x="0" y={y - [0.6, 1, 1.4, 1.7, 1.4, 1, 0.6][i]} width="24" height={[0.6, 1, 1.4, 1.7, 1.4, 1, 0.6][i] * 2} fill="currentColor" />
                ))}
              </g>
            ))}
          </g>
        </g>
      )}
      {variant === "scan" && (
        <g clipPath={`url(#${id})`}>
          {Array.from({ length: 11 }, (_, i) => (
            <rect key={i} x={1.6 + i * 2} y="0" width="0.8" height="24" fill="currentColor" opacity="0.28" />
          ))}
          <rect className="think-sweep" x="0" y="0" width="1.4" height="24" fill="currentColor" />
        </g>
      )}
      {variant === "slide" && (
        <g clipPath={`url(#${id})`}>
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.1" />
          {[4, 8, 12, 16, 20].map((y, i) => (
            <rect key={y} className="think-bar" style={{ animationDelay: `${i * -0.32}s` }} x="2" y={y - 0.9} width={[7, 10, 6, 9, 5][i]} height="1.8" rx="0.9" fill="currentColor" />
          ))}
        </g>
      )}
      {variant === "breathe" && (
        <g clipPath={`url(#${id})`}>
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.1" />
          {[5, 9, 13, 17].map((x, i) => (
            <rect key={x} className="think-pulse" style={{ animationDelay: `${i * -0.22}s` }} x={x - 0.9} y="6" width="1.8" height="12" rx="0.9" fill="currentColor" />
          ))}
        </g>
      )}
    </svg>
  )
}

/* ---------------- making: the engine's voice while something long runs ---------------- */

const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** Steps through `list` every `ms` while `on` (slower when motion is reduced: the words change, they never rush). */
export function useCycle<T>(list: T[], ms: number, on = true, seed = 0) {
  const [i, setI] = useState(seed)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setI((x) => x + 1), calm() ? ms * 1.6 : ms)
    return () => clearInterval(t)
  }, [on, ms])
  return { item: list[i % list.length], n: i }
}

/** A ring that fills as the work does; spinning (a soft arc in the engine's colours) while how much is unknown. */
export function ProgressRing({ value, size = 44, stroke = 3 }: { /** 0..1, or undefined while unknown */ value?: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const known = value != null && Number.isFinite(value)
  const id = useId()
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={`pring shrink-0 ${known ? "" : "pring-spin"}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-1)" />
          <stop offset="0.55" stopColor="var(--brand-2)" />
          <stop offset="1" stopColor="var(--brand-3)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
      <circle
        className="pring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={known ? c * (1 - Math.max(0.02, Math.min(1, value!))) : c * 0.72}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/** The engine at work: a ring (or the percentage inside it), a verb that changes ("Kerning…"), and under it a quip,
    a maxim or a tip. `title` replaces the verb when there's something truer to say. */
export function Making({ progress, title, detail, quotes = true, size = "md", className = "" }: { progress?: number; title?: string; detail?: ReactNode; quotes?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const verb = useCycle(SESSION_GERUNDS, 2400)
  const quote = useCycle(SESSION_QUOTES, 6200, quotes)
  const ring = size === "lg" ? 64 : size === "sm" ? 32 : 44
  const pct = progress != null ? Math.round(progress * 100) : null
  return (
    <div role="status" aria-live="polite" className={`making making-${size} ${className}`}>
      <span className="relative grid shrink-0 place-items-center">
        <ProgressRing value={progress} size={ring} stroke={size === "lg" ? 4 : 3} />
        {pct != null && size !== "sm" && <span className="absolute text-caption font-semibold tabular-nums">{pct}%</span>}
      </span>
      <span className="min-w-0 flex-1">
        {/* the verb swaps in place: the old one is gone, the new one rises out of a little blur */}
        <span className="making-title block truncate">
          {title ?? (
            <span key={verb.n} className="gerund-in shimmer inline-block">
              {verb.item}…
            </span>
          )}
        </span>
        {detail && <span className="mt-0.5 block truncate text-caption tabular-nums text-fg-3">{detail}</span>}
        {quotes && quote.item && (
          <span key={quote.n} className="quote-in mt-2 block text-caption text-fg-2 text-pretty">
            {quote.item.tip ? <span className="mr-1.5 rounded-full bg-surface-3 px-1.5 py-px text-micro font-semibold uppercase tracking-[0.06em] text-fg-2">Tip</span> : "“"}
            {quote.item.text}
            {!quote.item.tip && "”"}
            {quote.item.by && <span className="text-fg-3"> · {quote.item.by}</span>}
          </span>
        )}
      </span>
    </div>
  )
}

/** A place still loading, said with the engine's voice instead of a bare spinner. */
export function Loading({ label, className = "" }: { /** what's loading, said plainly under the verb */ label?: string; className?: string }) {
  return (
    <div className={`grid min-h-0 flex-1 place-items-center p-6 ${className}`}>
      <div className="rise-in w-[min(360px,100%)]">
        <Making size="md" detail={label} />
      </div>
    </div>
  )
}

/** A glyph and its words ("Directing a teaser…"), the words shimmering while it works. */
export function Thinking({ label, sub, variant = "globe", size = 22, className = "" }: { label: string; sub?: string; variant?: ThinkingGlyph; size?: number; className?: string }) {
  return (
    <span role="status" className={`flex min-w-0 items-center gap-3 ${className}`}>
      <Glyph variant={variant} size={size} />
      <span className="min-w-0">
        <span className="shimmer block truncate text-body font-medium">{label}</span>
        {sub && <span className="block truncate text-caption text-fg-3">{sub}</span>}
      </span>
    </span>
  )
}
