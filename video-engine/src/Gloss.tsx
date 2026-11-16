// An icon tile for what something IS (a launch film, a creative, the lab): the glyph in outline, in its kind's colour,
// on a soft tint of that colour with a lit top edge and a hairline. Never filled glyphs, never on a button's action.
// `tone`: a CSS colour, "brand" (the signature violet) or "light" (neutral).
import type { CSSProperties } from "react"
import type { Icon } from "./ui"

export function Gloss({ icon: I, tone = "brand", size = 40, className = "" }: { icon: Icon; tone?: string; size?: number; className?: string }) {
  const ink = tone === "brand" ? "var(--brand-2)" : tone === "light" ? "var(--fg-2)" : tone
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.3),
    background: tone === "light" ? "var(--surface-2)" : `color-mix(in srgb, ${ink} 13%, var(--surface))`,
    boxShadow: `var(--in-hi), inset 0 0 0 1px color-mix(in srgb, ${tone === "light" ? "var(--fg)" : ink} ${tone === "light" ? 8 : 24}%, transparent)`,
    color: ink,
  }
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center ${className}`} style={style}>
      <I size={Math.round(size * 0.52)} />
    </span>
  )
}

/** A modal's head: what it is (its glossy icon), its title and one line, and its close. */
export function DialogHead({ icon, tone, title, sub, onClose, children }: { icon: Icon; tone?: string; title: string; sub?: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 px-5 pb-3.5 pt-4">
      <Gloss icon={icon} tone={tone} size={36} />
      <div className="min-w-0 flex-1 pt-px">
        <h2 className="text-ui font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-caption text-fg-3">{sub}</p>}
      </div>
      {children}
      <button type="button" aria-label="Close" onClick={onClose} className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
