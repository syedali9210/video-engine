// Studio — a title's animation as data, so any title a film shows can be written down and played back: what moves on
// its own (the whole title, each line, each word, each letter), where each piece starts (an offset, a scale, a turn, a
// flip, a skew, a blur, an opacity, wider tracking, a colour), how long each takes, how far apart they start, in what
// order, on what curve, clipped to its line or not, and how the pieces keep moving once they're in. A video's
// teardown writes its titles this way (server/refs.ts), the kit keeps them, the inspector edits them (Motion.tsx);
// Kit.tsx splits a title into its pieces and plays them. Plain data: the dev server checks what the AI writes with it.

export type TextAnim = {
  /** what moves on its own; "line" splits where the title has a line break */
  by: "all" | "line" | "word" | "char"
  /** where each piece starts, easing to rest: offsets in em, a scale, turns in degrees (`flip` tips it back on its
      baseline), a blur in em, an opacity, extra tracking in em (the whole title), a colour it starts in */
  from: { x?: number; y?: number; scale?: number; rotate?: number; flip?: number; skew?: number; blur?: number; opacity?: number; spacing?: number }
  /** one piece's entrance, seconds; the time between two pieces starting */
  dur: number
  stagger: number
  /** a CSS cubic-bezier */
  ease: string
  order?: "first" | "last" | "middle" | "random"
  /** each piece comes out from behind its own line's edge */
  mask?: boolean
  tint?: string
  /** once in: each piece bobs on a wave, the title floats, or a light runs across it now and then */
  idle?: "none" | "wave" | "float" | "shimmer"
}

const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)"
export const TEXT_ANIM: TextAnim = { by: "word", from: { y: 0.4, blur: 0.25, opacity: 0 }, dur: 0.7, stagger: 0.08, ease: EXPO }

/** The kit's own title animations: the moves launch films use most. A teardown adds the ones it finds. */
export const TEXT_ANIMS: { id: string; name: string; hint: string; anim: TextAnim }[] = [
  { id: "blur-up", name: "Blur up", hint: "Word by word, rising out of a blur.", anim: TEXT_ANIM },
  { id: "mask-lines", name: "Mask lines", hint: "Each line rises from behind its own edge.", anim: { by: "line", mask: true, from: { y: 1.15 }, dur: 0.9, stagger: 0.12, ease: EXPO } },
  { id: "mask-letters", name: "Mask letters", hint: "Letters rise from behind the line, one after another.", anim: { by: "char", mask: true, from: { y: 1.1 }, dur: 0.65, stagger: 0.022, ease: EXPO } },
  { id: "tracking", name: "Tracking in", hint: "Wide apart and soft, the letters close in.", anim: { by: "all", from: { spacing: 0.5, blur: 0.12, opacity: 0 }, dur: 1.6, stagger: 0, ease: "cubic-bezier(0.23, 1, 0.32, 1)" } },
  { id: "slam", name: "Slam", hint: "Huge, then down into place in a beat.", anim: { by: "all", from: { scale: 2.2, blur: 0.15, opacity: 0 }, dur: 0.5, stagger: 0, ease: EXPO } },
  { id: "flip-up", name: "Flip up", hint: "Words tip up off their baseline.", anim: { by: "word", from: { flip: -95, y: 0.2, opacity: 0 }, dur: 0.8, stagger: 0.07, ease: EXPO } },
  { id: "cascade", name: "Cascade", hint: "Letters fall in turned, and right themselves.", anim: { by: "char", from: { y: -0.7, rotate: -14, opacity: 0 }, dur: 0.6, stagger: 0.03, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" } },
  { id: "slide", name: "Slide in", hint: "Words slide in from the left.", anim: { by: "word", from: { x: -0.7, opacity: 0 }, dur: 0.65, stagger: 0.06, ease: "cubic-bezier(0.32, 0.72, 0, 1)" } },
  { id: "skew", name: "Skew rise", hint: "Words rise leaning forward, and straighten.", anim: { by: "word", mask: true, from: { y: 1, skew: -14 }, dur: 0.8, stagger: 0.06, ease: EXPO } },
  { id: "spotlight", name: "Spotlight", hint: "Every word dim, lit one at a time.", anim: { by: "word", from: { opacity: 0.16 }, dur: 0.35, stagger: 0.16, ease: "cubic-bezier(0.25, 0.1, 0.25, 1)" } },
  { id: "scatter", name: "Scatter", hint: "Letters come into focus in no order.", anim: { by: "char", order: "random", from: { blur: 0.3, opacity: 0 }, dur: 0.5, stagger: 0.025, ease: EXPO } },
  { id: "bloom", name: "Bloom", hint: "From the middle out, each letter growing in.", anim: { by: "char", order: "middle", from: { scale: 0.4, opacity: 0, blur: 0.1 }, dur: 0.6, stagger: 0.045, ease: EXPO } },
  { id: "wave", name: "Wave", hint: "Letters rise in, then keep riding a wave.", anim: { by: "char", from: { y: 0.5, opacity: 0 }, dur: 0.55, stagger: 0.03, ease: EXPO, idle: "wave" } },
  { id: "glint", name: "Glint", hint: "Fades up, then a light runs across it now and then.", anim: { by: "char", from: { opacity: 0 }, dur: 0.4, stagger: 0.015, ease: EXPO, idle: "shimmer" } },
]


/** The order the pieces start in: piece i starts `rank[i]` staggers in. */
const ranks = new Map<string, number[]>()
export function rankOf(order: TextAnim["order"], n: number): number[] {
  const key = `${order}:${n}`
  let r = ranks.get(key)
  if (r) return r
  const idx = [...Array(n).keys()]
  if (order === "last") r = idx.map((i) => n - 1 - i)
  else if (order === "middle") r = idx.map((i) => Math.round(Math.abs(i - (n - 1) / 2)))
  else if (order === "random") {
    // the same shuffle every frame, and every time the film plays
    const h = (i: number) => {
      const s = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453
      return s - Math.floor(s)
    }
    const sorted = [...idx].sort((p, q) => h(p) - h(q))
    r = []
    sorted.forEach((i, k) => (r![i] = k))
  } else r = idx
  ranks.set(key, r)
  return r
}

/** How long the whole title takes to come in, with `n` pieces. */
export const animLength = (a: TextAnim, n: number) => a.dur + a.stagger * Math.max(0, (a.order === "middle" ? Math.ceil((n - 1) / 2) : n - 1))

/** A title animation from anywhere (a script, a teardown, the AI): the fields it knows, each in range, or nothing. */
export function animOf(raw: unknown): TextAnim | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
  const one = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
  const fr = (r.from && typeof r.from === "object" ? r.from : {}) as Record<string, unknown>
  const from: TextAnim["from"] = {}
  const put = (k: keyof TextAnim["from"], lo: number, hi: number) => {
    const v = num(fr[k], lo, hi)
    if (v != null) from[k] = Math.round(v * 1000) / 1000
  }
  put("x", -6, 6)
  put("y", -6, 6)
  put("scale", 0, 6)
  put("rotate", -180, 180)
  put("flip", -180, 180)
  put("skew", -60, 60)
  put("blur", 0, 1)
  put("opacity", 0, 1)
  put("spacing", -0.2, 2)
  const ease = typeof r.ease === "string" && /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(r.ease) ? r.ease : EXPO
  const tint = typeof r.tint === "string" && /^#[0-9a-f]{3,8}$/i.test(r.tint) ? r.tint : undefined
  return {
    by: one(r.by, ["all", "line", "word", "char"] as const, "word"),
    from,
    dur: num(r.dur, 0.05, 6) ?? 0.7,
    stagger: num(r.stagger, 0, 1.5) ?? 0.06,
    ease,
    ...(r.order && r.order !== "first" ? { order: one(r.order, ["first", "last", "middle", "random"] as const, "first") } : {}),
    ...(r.mask === true ? { mask: true } : {}),
    ...(tint ? { tint } : {}),
    ...(r.idle && r.idle !== "none" ? { idle: one(r.idle, ["none", "wave", "float", "shimmer"] as const, "none") } : {}),
  }
}
