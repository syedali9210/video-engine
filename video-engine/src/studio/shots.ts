// The shot library and the slot lists. Every launch film template is cut at its own cuts (its meta's `film`), and each
// shot carries tags saying what it does in a film: its role (a hook, the product, a feature, proof, the logo, the
// call), its energy, how it comes in and goes out, its look. Together they're a library a film can be cast from, any
// shot from any template. A template's slots are what it needs from a product: each screen (its shape, from the
// template's hint), each line of words (how many pieces, how long each may be, from the template's own words), and
// the shots each one shows in. Plain data and no DOM: the dev server and `npm run check` read it too.

export const ROLES = ["hook", "intro", "product", "feature", "detail", "proof", "logo", "cta", "bridge"] as const
export type FilmRole = (typeof ROLES)[number]
/** how a shot comes in or goes out: the camera's or the frame's move across the cut */
export const MOVES = ["cut", "push-in", "pull-out", "pan", "whip", "rise", "spin", "type", "flash", "hold"] as const
export type ShotMove = (typeof MOVES)[number]
/** the look a template is shot in; a film mixing shots keeps to one family, or carries a look layer over them */
export const LOOKS = ["paper", "night", "space", "blueprint", "pop", "studio"] as const
export type LookFamily = (typeof LOOKS)[number]
export const DARK_LOOKS: readonly LookFamily[] = ["night", "space"]

/** One cut of a template: its name, where it starts (s), and its tags. `shows`: the params on screen in it (measured by
    the template probe, server/templates.ts, unless written here). */
export type ShotTag = { name: string; at: number; role: FilmRole[]; energy: 1 | 2 | 3; enter: ShotMove; exit: ShotMove; shows?: string[] }
/** `chrome`: the film's own interface words (a menu, an agent's log, a tool's settings), drawn whatever the product, so
    the template probe doesn't take them for the reference's. `fit`: how much longer than the template's own words a
    line may run (1.25 unless the probe found a longer one cut off). */
export type FilmSpec = { size: "16x9" | "1x1" | "9x16"; end: number; look: LookFamily; shots: ShotTag[]; chrome?: string[]; fit?: Record<string, number> }
/** what it reads of a library item (registry.ts AnimMeta) */
type Meta = { id: string; name?: string; film?: FilmSpec; params?: Record<string, unknown>; schema?: Record<string, { type: string; label: string; hint?: string }> }

/** A shot in the library: its tags, its film, how long it runs, and how far it can be retimed (its motion slowed or
    sped to fit, still reading as itself). */
export type LibShot = ShotTag & { id: string; film: string; template: string; dur: number; size: FilmSpec["size"]; look: LookFamily; dark: boolean; stretch: [number, number]; shows: string[] }

const r2 = (x: number) => Math.round(x * 100) / 100
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** Every template's shots, in film order. `shows`: measured params per shot id, over what a meta doesn't write itself. */
export function library(metas: Meta[], shows: Record<string, string[]> = {}): LibShot[] {
  return metas.flatMap((m) => {
    const f = m.film
    if (!f) return []
    return f.shots.map((s, i) => {
      const id = `${m.id}/${slug(s.name)}`
      const dur = r2((f.shots[i + 1]?.at ?? f.end) - s.at)
      return { ...s, id, film: m.id, template: m.name ?? m.id, dur, size: f.size, look: f.look, dark: DARK_LOOKS.includes(f.look), stretch: [r2(dur * 0.6), r2(dur * 1.6)], shows: s.shows ?? shows[id] ?? [] }
    })
  })
}

/** What's wrong with a template's shot list, in words (none: it's fine). */
export function checkFilm(m: Meta): string[] {
  const f = m.film
  if (!f) return []
  const out: string[] = []
  if (!f.shots.length) out.push("It has no shots.")
  if (f.shots[0] && f.shots[0].at !== 0) out.push(`The first shot starts at ${f.shots[0].at} s, not 0.`)
  f.shots.forEach((s, i) => {
    if (i && s.at <= f.shots[i - 1].at) out.push(`“${s.name}” starts before the shot ahead of it ends.`)
    if (s.at >= f.end) out.push(`“${s.name}” starts after the film ends (${f.end} s).`)
    if (!s.role.length || s.role.some((r) => !ROLES.includes(r))) out.push(`“${s.name}” needs roles from: ${ROLES.join(", ")}.`)
    if (![1, 2, 3].includes(s.energy)) out.push(`“${s.name}”: energy is 1, 2 or 3.`)
    if (!MOVES.includes(s.enter) || !MOVES.includes(s.exit)) out.push(`“${s.name}”: its moves are from: ${MOVES.join(", ")}.`)
    for (const k of s.shows ?? []) if (m.schema && !(k in m.schema)) out.push(`“${s.name}” shows “${k}”, which isn't one of its params.`)
  })
  if (new Set(f.shots.map((s) => slug(s.name))).size !== f.shots.length) out.push("Two shots have the same name.")
  return out
}

/* ---------------- slots: what a template needs from a product ---------------- */

export type Slot = {
  key: string
  kind: "screen" | "logo" | "photo" | "text" | "color"
  label: string
  hint?: string
  /** a screen's width ÷ height, when its hint says ("3:2", "about 2.4:1", "1400×850") */
  aspect?: number
  /** words: how many pieces (split by |) it takes, and the most each piece may be, in characters and in words */
  pieces?: number
  chars?: number[]
  words?: number[]
  /** the template's own words for it */
  example?: string
  /** the shots it's on screen in */
  shots: string[]
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
export const aspectOf = (hint = "") => {
  const m = /(\d+(?:\.\d+)?)\s*[:×x]\s*(\d+(?:\.\d+)?)/.exec(hint)
  return m && +m[2] ? r2(+m[1] / +m[2]) : undefined
}

/** A template's slots, from its params: its own words set how many pieces a line takes and how long each may run (a
    quarter longer than the template's, which it was laid out for). */
export function slotsOf(m: Meta, shots: LibShot[] = []): Slot[] {
  const mine = shots.filter((s) => s.film === m.id)
  return Object.entries(m.schema ?? {}).flatMap(([key, spec]): Slot[] => {
    const on = mine.filter((s) => s.shows.includes(key)).map((s) => s.id)
    const base = { key, label: spec.label, hint: spec.hint, shots: on }
    if (spec.type === "screen") return [{ ...base, kind: /mark|logo|icon/i.test(key + spec.label) ? "logo" : /photo/i.test(key) ? "photo" : "screen", aspect: aspectOf(spec.hint) }]
    if (spec.type === "color") return [{ ...base, kind: "color", example: String(m.params?.[key] ?? "") }]
    if (spec.type !== "text") return []
    const example = String(m.params?.[key] ?? "")
    const parts = example.split("|").map((x) => x.trim())
    const room = m.film?.fit?.[key] ?? 1.25
    return [{ ...base, kind: "text", example, pieces: parts.length, chars: parts.map((p) => Math.max(3, Math.ceil(p.length * room))), words: parts.map((p) => Math.max(1, wordCount(p) + (room > 1.1 && wordCount(p) >= 3 ? 1 : 0))) }]
  })
}

/** How words fit a text slot: each piece too long (by how much), and a wrong number of pieces. */
export function fitText(slot: Slot, value: string): { ok: boolean; problems: string[] } {
  if (slot.kind !== "text" || !slot.pieces) return { ok: true, problems: [] }
  const parts = value.split("|").map((x) => x.trim())
  const problems: string[] = []
  if (parts.length !== slot.pieces) problems.push(`${slot.label}: it takes ${slot.pieces} ${slot.pieces === 1 ? "piece" : "pieces"} split by |, not ${parts.length}.`)
  parts.slice(0, slot.pieces).forEach((p, i) => {
    const c = slot.chars?.[i] ?? Infinity
    const w = slot.words?.[i] ?? Infinity
    const which = slot.pieces! > 1 ? ` (piece ${i + 1})` : ""
    if (p.length > c) problems.push(`${slot.label}${which}: “${p}” is ${p.length} characters; ${c} fit.`)
    else if (wordCount(p) > w) problems.push(`${slot.label}${which}: “${p}” is ${wordCount(p)} words; ${w} fit.`)
  })
  return { ok: !problems.length, problems }
}
