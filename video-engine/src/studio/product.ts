// The product kit (product.ts): everything a film needs to know about one product, kept so switching products is one click. Its
// files (screens, recordings, the logo, photos, notes), what the reader made of each (what it is, what it shows, the
// words in it, where to look), its words in its own voice, its colours and type (each with where it was read from),
// and what the film should say first. A template's slots are filled from it (fillSlots), and the fit report says,
// before anything renders, what won't fit: a line too long, a screen the wrong shape, a picture too small for its zoom.
// Plain data and no DOM: the dev server and `npm run check` read it too.
import { fitText, type Slot } from "./shots.ts"

export type FileKind = "phone" | "tablet" | "desktop" | "photo" | "logo" | "clip" | "doc" | "other"
export const FILE_KINDS: { id: FileKind; name: string }[] = [
  { id: "phone", name: "Phone screen" },
  { id: "tablet", name: "Tablet screen" },
  { id: "desktop", name: "Desktop screen" },
  { id: "photo", name: "Photo" },
  { id: "logo", name: "Logo" },
  { id: "clip", name: "Clip" },
  { id: "doc", name: "Notes" },
  { id: "other", name: "Other" },
]
export type KitFile = {
  id: string
  name: string
  type: string
  size: number
  url: string
  w?: number
  h?: number
  /** a clip's length, s */
  dur?: number
  /** its colours, commonest first (read in the browser as it was dropped) */
  palette?: string[]
  kind?: FileKind
  /** what it shows, in a line (the reader) */
  shows?: string
  /** the words in it, biggest first */
  text?: string[]
  /** where to look: what crops and camera dives aim at (fractions of the picture) */
  focus?: { x: number; y: number }
  /** a clip's part to use, s */
  trim?: { from: number; to: number }
  /** chrome to strip (a status bar, a browser's bar): fractions cut off each edge */
  crop?: { top: number; right: number; bottom: number; left: number }
  /** who said what it is: the reader, the rules, or you (yours is never overwritten) */
  by?: "reader" | "rules" | "you"
}
export type KitWords = { name: string; tagline: string; hook: string; features: string[]; proof: string; cta: string; voice?: string; by?: "reader" | "rules" | "you" }
/** `ease` and `ms`: how the product itself moves (its commonest transition curve and length); `shadow`: how its
    surfaces lift (its cards' commonest shadow) */
export type KitBrand = { accent?: string; ground?: string; ink?: string; dark?: boolean; display?: string; text?: string; radius?: number; fonts?: string[]; ease?: string; ms?: number; shadow?: string; from?: Partial<Record<"accent" | "ground" | "ink" | "type" | "motion", string>> }
export type ProductKit = {
  id: string
  name: string
  updated: string
  url?: string
  notes?: string
  words: KitWords
  brand: KitBrand
  files: KitFile[]
  /** what the reader understood of the product (the story planner's input) */
  understanding?: { kind: string; whatsNew: string; features: string[]; proof: string[]; mood: string; audience: string }
}

export const emptyKit = (id: string, name: string): ProductKit => ({ id, name, updated: new Date().toISOString(), words: { name, tagline: "", hook: "", features: [], proof: "", cta: "" }, brand: {}, files: [] })

/** What a file probably is, from its type and shape, before (or without) the reader. */
export function guessKind(f: Pick<KitFile, "type" | "name" | "w" | "h">): FileKind {
  if (f.type.startsWith("video/")) return "clip"
  if (/^(text\/|application\/(pdf|json|msword))/.test(f.type) || /\.(md|txt|pdf|docx?)$/i.test(f.name)) return "doc"
  if (!f.type.startsWith("image/")) return "other"
  if (/logo|mark|icon|brand/i.test(f.name) || f.type === "image/svg+xml") return "logo"
  const a = f.w && f.h ? f.w / f.h : 1
  if (a < 0.62) return "phone"
  if (a < 0.9) return "tablet"
  if (a > 1.25) return "desktop"
  return f.w && f.w <= 1024 ? "logo" : "photo"
}

/** A file as a slot's value: "image:" or "video:", its address, and its focus, part and crop as a fragment the film's
    Slot reads (kit.tsx). */
export function slotValue(f: KitFile) {
  const bits: string[] = []
  if (f.focus) bits.push(`focus=${r3(f.focus.x)},${r3(f.focus.y)}`)
  if (f.trim) bits.push(`t=${r3(f.trim.from)},${r3(f.trim.to)}`)
  if (f.crop && (f.crop.top || f.crop.right || f.crop.bottom || f.crop.left)) bits.push(`crop=${[f.crop.top, f.crop.right, f.crop.bottom, f.crop.left].map(r3).join(",")}`)
  return `${f.type.startsWith("video/") ? "video" : "image"}:${f.url}${bits.length ? `#${bits.join("&")}` : ""}`
}
const r3 = (x: number) => Math.round(x * 1000) / 1000
/** A file's shape once its chrome is cut away (width ÷ height). */
export const aspectOfFile = (f: KitFile) => {
  if (!f.w || !f.h) return undefined
  const c = f.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }
  return (f.w * (1 - c.left - c.right)) / (f.h * (1 - c.top - c.bottom))
}

/* ---------------- filling a template ---------------- */

/** Which of the kit's words a text slot takes, by what the slot is called (a template's `name`, `tagline`, `tags`…). */
const SAYS: [RegExp, (w: KitWords, kit: ProductKit) => string[]][] = [
  [/^(name|product|app|brand|wordmark)$/i, (w) => [w.name]],
  [/^(cta|ready|action|send|start|button)$/i, (w) => [w.cta]],
  [/^(proof|stats?|amount|social|received|share|price)$/i, (w) => [w.proof]],
  [/^(url|site|domain)$/i, (_, k) => [k.url ? k.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : ""]],
  [/^(features?|tags|pills|verbs|tools|chips|moods|ideas|tabs|pages|plans|clips|tracks|sections)$/i, (w) => w.features],
  [/^(hook|ask|prompt|begin|intro|caption|headline)$/i, (w) => [w.hook, w.tagline]],
  [/^(tagline|promise|close|line|hero|sub|subject|campaign|together|everything|made|why|overlay|ailine|switch|orbit|easy|feature)$/i, (w) => [w.tagline, w.hook, ...w.features]],
]

export type Fill = { values: Record<string, string>; /** text slots left with the template's own words (nothing in the kit said what goes there) */ kept: string[]; used: string[] }

/** A template's slots filled from the kit: its words into the lines that ask for them (piece by piece; the template's
    own pieces where the kit has none to give), its screens by shape (the closest shape among its screens and clips,
    each used once while there are others), its logo and photos into theirs, its accent into the colour. */
export function fillSlots(kit: ProductKit, slots: Slot[]): Fill {
  const values: Record<string, string> = {}
  const kept: string[] = []
  const used = new Set<string>()
  const files = kit.files.filter((f) => f.kind !== "doc" && f.kind !== "other")
  for (const s of slots) {
    if (s.kind === "color") {
      if (kit.brand.accent && /accent|color|colour|tint/i.test(s.key)) values[s.key] = kit.brand.accent
      continue
    }
    if (s.kind === "text") {
      const say = SAYS.find(([re]) => re.test(s.key))
      const pieces = (s.example ?? "").split("|").map((x) => x.trim())
      const mine = say ? say[1](kit.words, kit).map((x) => x.trim()).filter(Boolean) : []
      if (!mine.length) {
        kept.push(s.key)
        continue
      }
      // a piece of the kit's words for each piece the line takes, then the template's own for the rest
      values[s.key] = pieces.map((p, i) => mine[i] ?? p).join("|")
      continue
    }
    const want: FileKind[] = s.kind === "logo" ? ["logo"] : s.kind === "photo" ? ["photo", "desktop", "phone", "tablet"] : ["phone", "tablet", "desktop", "clip", "photo"]
    const pool = files.filter((f) => want.includes(f.kind ?? "other"))
    if (!pool.length) continue
    const target = s.aspect ?? (s.kind === "logo" ? 1 : undefined)
    const off = (f: KitFile) => (target && aspectOfFile(f) ? Math.abs(Math.log(aspectOfFile(f)! / target)) : 0.5)
    const best = [...pool].sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || off(a) - off(b) || want.indexOf(a.kind ?? "other") - want.indexOf(b.kind ?? "other"))[0]
    used.add(best.id)
    values[s.key] = slotValue(best)
  }
  return { values, kept, used: [...used] }
}

/* ---------------- the fit report ---------------- */

export type FitIssue = { slot: string; level: "error" | "warn" | "info"; text: string; file?: string }

/** What won't fit, before anything renders: lines too long or the wrong number of pieces, a screen the wrong shape
    (how much of it a crop loses), a picture too small for how big the film draws it (`sizes`: px on the frame, from
    the template probe), and slots the kit has nothing for. */
export function fitReport(kit: ProductKit, slots: Slot[], values: Record<string, string>, sizes: Record<string, { w: number; h: number }> = {}): FitIssue[] {
  const out: FitIssue[] = []
  const byUrl = (v: string) => kit.files.find((f) => v.includes(f.url))
  for (const s of slots) {
    const v = values[s.key]
    if (s.kind === "text") {
      if (v !== undefined) for (const p of fitText(s, v).problems) out.push({ slot: s.key, level: "error", text: p })
      continue
    }
    if (s.kind === "color") continue
    if (!v) {
      if (s.shots.length) out.push({ slot: s.key, level: "info", text: `${s.label}: nothing in the kit for it, so the film's own ${s.kind === "logo" ? "stand-in mark" : "drawing"} stays.` })
      continue
    }
    const f = byUrl(v)
    if (!f) continue
    const a = aspectOfFile(f)
    if (a && s.aspect) {
      const lost = 1 - Math.min(a, s.aspect) / Math.max(a, s.aspect)
      if (lost > 0.15) out.push({ slot: s.key, level: lost > 0.4 ? "error" : "warn", file: f.id, text: `${s.label}: “${f.name}” is ${a > s.aspect ? "wider" : "taller"} than the space (${fmt(a)} for ${fmt(s.aspect)}); about ${Math.round(lost * 100)}% of it is cropped away.${f.focus ? "" : " Set where to look so the crop keeps what matters."}` })
    }
    const need = sizes[s.key]
    if (need && f.w && f.type.startsWith("image/") && f.type !== "image/svg+xml") {
      const k = need.w / (f.w * (1 - (f.crop?.left ?? 0) - (f.crop?.right ?? 0)))
      if (k > 1.5) out.push({ slot: s.key, level: k > 3 ? "error" : "warn", file: f.id, text: `${s.label}: the film draws it ${need.w} px wide and “${f.name}” is ${f.w}: ${k > 3 ? "it'll look blurry" : "it'll look a little soft"}. A capture ${Math.ceil(k)}× bigger reads sharp.` })
    }
  }
  return out
}
const fmt = (a: number) => (a >= 1 ? `${Math.round(a * 100) / 100}:1` : `1:${Math.round((1 / a) * 100) / 100}`)

/** The kit's words as the copy writer's (studio/copy.ts Copy), for everything that takes one. */
export const kitCopy = (k: ProductKit) => ({
  kicker: "Introducing",
  hook: k.words.hook,
  name: k.words.name || k.name,
  tagline: k.words.tagline,
  features: k.words.features,
  split: k.words.tagline,
  proof: k.words.proof,
  cta: k.words.cta,
  by: "rules" as const,
})
