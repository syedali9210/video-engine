// The AI at work, shown as a small glyph that moves (the four "agent thinking" states): a striped globe turning, a
// light scanning a ring of lines, bars sliding through a circle, bars breathing. Its words shimmer beside it. Under
// reduced motion the glyph holds still and the words stay plain (engine.css).
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
