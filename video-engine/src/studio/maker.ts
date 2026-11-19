// The director's thinking, as plain data and functions (no DOM, no network): what it knows about a product (the
// brief), which film template tells that product's story best (the picker, with its reasons), what it asks the writer
// for (one call: every line of the film, each with its meaning in the story and its limits), what it checks before
// anything renders, and the edits an agent or a person can make to a film. The server (server/maker.ts) runs it
// against the Work API and the renderer; `npm run check` runs it on its own.
import type { Shape } from "./story.ts"
import { shapeFor } from "./story.ts"
import { HOUSE, type Contract } from "./contracts.ts"
import { slotValue, type KitFile, type ProductKit } from "./product.ts"
import type { Slot } from "./shots.ts"
import type { Theme } from "../animations/_film/tone.ts"

/* ---------------- the brief: the product, understood once and reused by every film ---------------- */

export type Feature = { name: string; benefit: string; proof?: string; /** the kit file that shows it */ screen?: string; /** what you do to use it */ action?: string }
export type Brief = {
  product: string
  /** what kind of product (an AI assistant, a payments app, a design tool…) */
  kind: string
  oneLiner: string
  audience: string
  problem: string
  /** how people do it today, without the product */
  oldWay: string
  promise: string
  features: Feature[]
  /** real figures and quotes only, each with where it came from */
  proof: string[]
  usp: string
  tone: string
  banned: string[]
  cta: string
  url?: string
  /** field → where it was read from (the README, the site, a screen, you) */
  sources?: Record<string, string>
  by: "rules" | "ai" | "you"
  updated: string
}

/** A brief from what the kit already says, at no cost: the starting point when the AI can't be asked. */
export function briefFromKit(k: ProductKit): Brief {
  const u = k.understanding
  // notes written as a README's list ("- **Films**: what it does") give features with their benefit
  const listed = [...(k.notes ?? "").matchAll(/^\s*[-*]\s+\*\*([^*]{2,40})\*\*[:\s—-]+(.{8,200})$/gm)].map((m) => ({ name: m[1].trim(), benefit: m[2].replace(/\*\*|`/g, "").split(/(?<=\.)\s/)[0].trim() }))
  const named = u?.features?.length ? u.features : k.words.features
  return {
    product: k.words.name || k.name,
    kind: u?.kind ?? "",
    oneLiner: k.words.tagline,
    audience: u?.audience ?? "",
    problem: "",
    oldWay: "",
    promise: k.words.hook,
    features: named.length ? named.map((name) => ({ name, benefit: listed.find((f) => f.name.toLowerCase() === name.toLowerCase())?.benefit ?? "" })) : listed.slice(0, 6),
    proof: u?.proof ?? (k.words.proof ? [k.words.proof] : []),
    usp: "",
    tone: k.words.voice ?? u?.mood ?? "",
    banned: [],
    cta: k.words.cta,
    url: k.url,
    by: "rules",
    updated: new Date().toISOString(),
  }
}

/** What the brief-writer is asked to return (the Work API's JSON schema). */
export const BRIEF_SCHEMA = {
  name: "brief",
  schema: {
    type: "object",
    properties: {
      product: { type: "string" },
      kind: { type: "string", description: "What kind of product, in a few words (an AI assistant for designers, a payments app…)." },
      oneLiner: { type: "string", description: "What it is and who it's for, one sentence." },
      audience: { type: "string", description: "Who it's for, concretely: their role and what they're trying to get done." },
      problem: { type: "string", description: "The pain it ends, in the audience's words." },
      oldWay: { type: "string", description: "How they do it today without it." },
      promise: { type: "string", description: "The change it makes, one short line." },
      features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, benefit: { type: "string", description: "What it lets the user do, in their words." }, proof: { type: "string", description: "A real figure or quote for it, if the material has one; else empty." }, screen: { type: "string", description: "The id of the file that shows it best, if any." }, action: { type: "string", description: "What you do to use it, if shown." } }, required: ["name", "benefit"] } },
      proof: { type: "array", items: { type: "string" }, description: "Real figures and quotes only, each followed by where it came from in brackets." },
      usp: { type: "string", description: "What it does that nothing else does, one line." },
      tone: { type: "string", description: "How it talks, three adjectives." },
      banned: { type: "array", items: { type: "string" }, description: "Words it would never use." },
      cta: { type: "string", description: "The call to action, 2 to 4 words." },
      url: { type: "string", description: "Its real address if the material gives one; else empty." },
      sources: { type: "object", additionalProperties: { type: "string" }, description: "For each field above, where it was read from." },
    },
    required: ["product", "kind", "oneLiner", "audience", "problem", "oldWay", "promise", "features", "proof", "usp", "tone", "cta"],
  },
}

/** The material the brief is written from, kept small: the kit's words, what each file shows, the notes. */
export function briefMaterial(k: ProductKit, max = 6000) {
  const files = k.files
    .filter((f) => f.shows || f.text?.length)
    .map((f) => `- ${f.id} (${f.kind}): ${f.shows ?? ""}${f.text?.length ? ` · words on it: ${f.text.slice(0, 8).join(" · ")}` : ""}`)
  const text = [`Name: ${k.words.name || k.name}`, k.url ? `Address: ${k.url}` : "", `Its own words: ${JSON.stringify(k.words)}`, k.understanding ? `Read before: ${JSON.stringify(k.understanding)}` : "", files.length ? `Its files:\n${files.join("\n")}` : "", k.notes ? `Notes:\n${k.notes}` : ""].filter(Boolean).join("\n\n")
  return text.slice(0, max)
}

/* ---------------- the picker: which template tells this story best ---------------- */

export type TemplateInfo = { id: string; film: string; name: string; size: "16x9" | "1x1" | "9x16"; seconds: number; screens: Slot[] }
export type Pick = { id: string; film: string; name: string; score: number; reasons: string[] }

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !/^(a|an|the|of|to|for|and|or|in|on|it|its|is)$/.test(w)))
/** Ranks the templates for a brief, best first, each with why: what it suits, the story it tells, whether the product
    has what it needs (features, a real number, its site, screens of the right shape), its shape and length, and your
    taste (how often you kept films from it). */
export function pick(b: Brief, list: { t: TemplateInfo; c: Contract }[], o: { size?: string; length?: number; kitFiles?: { kind?: string; w?: number; h?: number }[]; taste?: Record<string, number> } = {}): Pick[] {
  const about = words(`${b.kind} ${b.audience} ${b.oneLiner} ${b.usp} ${b.features.map((f) => f.name).join(" ")}`)
  const shape: Shape = shapeFor({ length: o.length ?? 20, features: b.features.length, screens: o.kitFiles?.length ?? 0, whatsNew: b.promise })
  const files = o.kitFiles ?? []
  return list
    .map(({ t, c }) => {
      const reasons: string[] = []
      let score = 0
      // a phrase counts only whole ("physical product" isn't any product)
      const has = (f: string) => [...words(f)].every((w) => about.has(w))
      const fit = c.fits.filter(has)
      if (fit.length) (score += Math.min(6, fit.length * 2.5), reasons.push(`suits ${fit.slice(0, 3).join(", ")}`))
      const wrong = (c.avoid ?? []).filter(has)
      if (wrong.length) (score -= 6, reasons.push(`wrong for ${wrong.join(", ")}`))
      if (c.arc === shape) (score += 2, reasons.push(`tells a ${shape} story`))
      const have = b.features.length
      if (have >= c.needs.features) score += 1.5
      else (score -= 2 * (c.needs.features - have), reasons.push(`needs ${c.needs.features} features, the brief has ${have}`))
      if (c.needs.proof && !b.proof.length) (score -= 4, reasons.push("needs a real number, the brief has none"))
      // a template that flies over a site draws its reference product's page unless it has a whole page of this one's
      if (c.needs.site && !files.some((f) => f.kind === "desktop" && f.w && f.h && f.h / f.w > 1.6)) (score -= 8, reasons.push("draws another product's page without a full-page picture of this one's site"))
      const screens = t.screens.filter((s) => s.kind === "screen" || s.kind === "photo")
      const got = screens.filter((s) => files.some((f) => (s.aspect ?? 1) < 0.8 ? f.kind === "phone" : f.kind === "desktop" || f.kind === "tablet" || f.kind === "photo")).length
      if (screens.length) (score += 1.5 * (got / screens.length) - (screens.length - got) * 0.5, reasons.push(`${got} of its ${screens.length} screens can be the product's`))
      if (o.size) score += o.size === t.size ? 2 : -1
      if (o.length) score -= Math.min(3, Math.abs(t.seconds - o.length) / 8)
      const taste = o.taste?.[t.id] ?? 0
      if (taste) (score += taste, reasons.push(taste > 0 ? "you've kept films from it" : "you've passed on it"))
      return { id: t.id, film: t.film, name: t.name, score: Math.round(score * 10) / 10, reasons }
    })
    .sort((a, b) => b.score - a.score)
}

/* ---------------- the writer: one call for every line ---------------- */

/** The one request that writes a film's lines: the brief (only what lines use), the film's idea and tone, and each
    line with its meaning, how to write it, the feature it carries, its limits and the template's own words. */
export function linesRequest(b: Brief, c: Contract, slots: Slot[], extra = "") {
  const text = slots.filter((s) => s.kind === "text" && s.pieces)
  const lines = text.map((s) => {
    const r = c.slots[s.key]
    const f = r?.feature !== undefined ? b.features[r.feature] : undefined
    const lim = limitsOf(s, c, b.product)
    return {
      key: s.key,
      means: r?.means ?? "ui",
      write: r?.say ?? `${s.label}${s.hint ? ` (${s.hint})` : ""}`,
      ...(f ? { feature: `${f.name}: ${f.benefit}` } : {}),
      ...(r?.factual ? { factual: "only a real figure or address from the brief; if there's none, keep the meaning without numbers" } : {}),
      pieces: s.pieces,
      max_characters_each: lim.chars,
      ...(lim.words ? { max_words_each: lim.words } : {}),
      template_wrote: s.example,
    }
  })
  const brief = { product: b.product, kind: b.kind, oneLiner: b.oneLiner, audience: b.audience, problem: b.problem, oldWay: b.oldWay, promise: b.promise, features: b.features.map((f) => ({ name: f.name, benefit: f.benefit, ...(f.proof ? { proof: f.proof } : {}) })), proof: b.proof, usp: b.usp, tone: b.tone, cta: b.cta, ...(b.url ? { url: b.url } : {}), never_say: b.banned }
  return {
    schema: { name: "lines", schema: { type: "object", properties: Object.fromEntries(text.map((s) => [s.key, { type: "string" }])), required: text.map((s) => s.key) } },
    messages: [
      { role: "system" as const, content: `You write the on-screen words of one launch film template for a product, so the film tells that product's story. ${HOUSE.join(" ")} Answer with JSON only: each key, its line.` },
      { role: "user" as const, content: `The film: ${c.idea} Tone: ${c.tone}.\n\nThe product: ${JSON.stringify(brief)}\n\nThe lines (template_wrote is the reference film's line, for length and shape only):\n${JSON.stringify(lines)}${extra}` },
    ],
  }
}

/** The lines code can fill without asking anyone: the product's name and its address, from the brief. A name is judged
    by its length only (the reference film's was one word; this product's may be two). */
export function fixedLines(b: Brief, c: Contract | undefined, slots: Slot[]) {
  const out: Record<string, string> = {}
  for (const s of slots.filter((x) => x.kind === "text" && x.pieces === 1)) {
    const m = c?.slots[s.key]?.means
    // (a name gets far more room than the reference film's line had: a product's name is never cut to a word of it
    // while it can be drawn whole; the reference's may have been one short word)
    const room = Math.floor((s.chars?.[0] ?? 99) * (m === "name" || m === "product" ? NAME_ROOM : m === "url" ? URL_ROOM : 1))
    if (m === "name" || m === "product") out[s.key] = b.product.length <= room ? b.product : b.product.split(/\s+/)[0]
    if (m === "url" && b.url) {
      const host = b.url.replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (host.length <= room) out[s.key] = host
    }
  }
  return out
}
/** how much longer than the reference's a name, and an address, may run */
const NAME_ROOM = 2.2
const URL_ROOM = 1.3
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** A slot as its limits apply to a line: names and addresses by characters only. A piece that carried the reference's
    own name (“Switch To Arcane”) has room for this product's instead (“Switch To Video Engine”). */
export const limitsOf = (s: Slot, c?: Contract, product = ""): Slot => {
  const m = c?.slots[s.key]?.means ?? ""
  if (m === "name" || m === "product") return { ...s, words: undefined, chars: s.chars?.map((x) => Math.floor(x * NAME_ROOM)) }
  if (m === "url") return { ...s, words: undefined, chars: s.chars?.map((x) => Math.floor(x * URL_ROOM)) }
  const refs = c?.refs ?? []
  if (!product || !refs.length || !s.chars) return s
  const pieces = (s.example ?? "").split("|")
  const named = (i: number) => refs.find((r) => new RegExp(`\\b${esc(r)}\\b`).test(pieces[i] ?? ""))
  return {
    ...s,
    chars: s.chars.map((x, i) => (named(i) ? x + Math.max(0, Math.ceil((product.length - named(i)!.length) * 1.1)) : x)),
    words: s.words?.map((w, i) => (named(i) ? w + Math.max(0, product.split(/\s+/).length - 1) : w)),
  }
}

/* ---------------- the product in the template: its colours, type and screens ---------------- */

/** A film's theme from the product's brand (read off its site or its tokens): its ground, ink and accent (a brand with
    no colour of its own, black and white, takes its ink as the accent), its faces, and how far the template takes them
    (the contract's `theme`). None without a ground and an ink. */
export function themeFor(k: ProductKit, c?: Contract): Theme | null {
  const br = k.brand
  if (!br.ground || !br.ink) return br.accent ? { accent: br.accent, fit: "accent" } : null
  // faces the frame has already (Geist) or the system's need nothing loaded; others come from Google Fonts
  const own = (f?: string) => (f && !/^(Geist|system-ui|-apple-system|BlinkMacSystemFont|Segoe|Helvetica|Arial|SF |San Francisco|ui-)/i.test(f) ? f : "")
  const families = [...new Set([own(br.text), own(br.display)].filter(Boolean))]
  const fonts = br.fonts?.length ? br.fonts.filter((f) => f.startsWith("https://fonts.googleapis.com/")) : families.map((f) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`)
  return { bg: br.ground, ink: br.ink, accent: br.accent || br.ink, ...(br.text ? { sans: br.text } : {}), ...(br.display ? { display: br.display } : {}), ...(fonts.length ? { fonts } : {}), fit: c?.theme ?? "product" }
}

const HOME = /\b(home|dashboard|overview|start|first screen|opening|landing)\b/i
/** The kit file that shows a feature best: the one the brief named, else the one whose name and what it shows (the
    reader's line) share the most words with the feature, its name most. The words read off a screen count least:
    every screen of an app carries its navigation ("Studio", "Films"), so they name the app's places, not this one. */
export function screenFor(f: Feature, files: KitFile[], taken: Set<string> = new Set()): KitFile | undefined {
  const named = f.screen ? files.find((x) => x.id === f.screen && !taken.has(x.id)) : undefined
  if (named) return named
  const name = words(f.name)
  const said = words(`${f.benefit} ${f.action ?? ""}`)
  let best: KitFile | undefined
  let score = 0
  for (const x of files.filter((y) => !taken.has(y.id))) {
    const own = words(`${x.name.replace(/\.\w+$/, "")} ${x.shows ?? ""}`)
    const read = words((x.text ?? []).join(" "))
    const in_ = (set: Set<string>, w: string) => set.has(w) || set.has(w.replace(/s$/, ""))
    let s = 0
    for (const w of name) s += in_(own, w) ? 3 : in_(read, w) ? 1 : 0
    for (const w of said) s += own.has(w) ? 0.5 : read.has(w) ? 0.15 : 0
    if (s > score) {
      score = s
      best = x
    }
  }
  return score >= 3 ? best : undefined
}

/** The template's screens filled by the story instead of by shape alone: the one that opens on the app (its home)
    with the product's home screen, the others with the brief's features in order, each with the screen that shows
    it. A slot no screen matches keeps what `base` (fillSlots, by shape) gave it, unless that screen is used already. */
export function storyScreens(b: Brief, k: ProductKit, slots: Slot[], base: Record<string, string> = {}, run: { taken: Set<string>; next: number } = { taken: new Set(), next: 0 }): Record<string, string> {
  const out: Record<string, string> = {}
  // (`run`: a film of several templates carries on where the last part stopped: its screens and its features)
  const taken = run.taken
  const pool = (s: Slot) => k.files.filter((f) => ((s.aspect ?? 1.6) < 0.8 ? f.kind === "phone" : f.kind === "desktop" || f.kind === "tablet"))
  let next = run.next
  for (const s of slots.filter((x) => x.kind === "screen")) {
    const files = pool(s)
    if (!files.length) continue
    let file: KitFile | undefined
    if (!next && HOME.test(`${s.key} ${s.label} ${s.hint ?? ""}`)) file = files.find((f) => !taken.has(f.id) && HOME.test(`${f.name} ${f.shows ?? ""}`))
    while (!file && next < b.features.length) file = screenFor(b.features[next++], files, taken)
    file ??= files.find((f) => base[s.key]?.includes(f.url) && !taken.has(f.id)) ?? files.find((f) => !taken.has(f.id))
    if (!file) continue
    taken.add(file.id)
    out[s.key] = slotValue(file)
  }
  run.next = next
  return out
}

export type Mood = "calm" | "bright" | "driving" | "dark"
/** The score's mood for a film, from its contract: its pace, and a dark look's tone. */
export function moodFor(c?: Contract): Mood {
  if (/dark|night|space|cinematic|moody|myster/i.test(c?.tone ?? "") && (c?.pace ?? 2) >= 2) return "dark"
  return c?.pace === 1 ? "calm" : c?.pace === 3 ? "driving" : "bright"
}

/* ---------------- the checks, before anything renders ---------------- */

export type Problem = { key: string; level: "error" | "warn"; text: string }
const HYPE = /\b(revolutionary|seamless(ly)?|game[- ]?chang\w*|unleash\w*|supercharg\w*|next[- ]level|cutting[- ]edge|world[- ]class)\b/i
/** The reference film's own brand: the words in the template's name, product and address slots (“Arcane”, “Pay”,
    “arcaneprivacy”), so a line still carrying one is caught. */
export function referenceNames(slots: Slot[], c?: Contract) {
  const names = new Set<string>(c?.refs ?? [])
  for (const s of slots) {
    const m = c?.slots[s.key]?.means ?? (/^(name|product|app|url)$/.test(s.key) ? "name" : "")
    if (m === "name" || m === "product" || m === "url") for (const w of (s.example ?? "").split(/[^A-Za-z]+/)) if (w.length > 2 && !/^(com|www|app|http|https|the|and|for|your)$/i.test(w)) names.add(w)
  }
  return names
}
/** Every line checked: it fits; it isn't still the reference film's; no number, price or address the brief doesn't
    have; no other company's name the template carried; no hype; nothing the brand bans. */
export function checkLines(values: Record<string, string>, slots: Slot[], c: Contract | undefined, b: Brief, fit: (s: Slot, v: string) => { ok: boolean; problems: string[] }): Problem[] {
  const out: Problem[] = []
  const known = `${JSON.stringify(b)}`.toLowerCase()
  const names = referenceNames(slots, c)
  for (const s of slots.filter((x) => x.kind === "text" && x.pieces)) {
    const v = values[s.key] ?? s.example ?? ""
    const r = c?.slots[s.key]
    const f = fit(limitsOf(s, c, b.product), v)
    if (!f.ok) for (const p of f.problems) out.push({ key: s.key, level: "error", text: p })
    if (v === s.example && r?.means !== "ui") out.push({ key: s.key, level: "error", text: `${s.label}: still the reference film's words (“${v}”).` })
    for (const n of v.match(/[$€£₹]?\d[\d,.]*%?/g) ?? []) if (!known.includes(n.toLowerCase().replace(/^[$€£₹]/, ""))) out.push({ key: s.key, level: r?.factual || r?.means === "proof" ? "error" : "warn", text: `${s.label}: “${n}” isn't in the brief; a figure has to be real.` })
    if (r?.means === "url" && b.url && !v.includes(b.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))) out.push({ key: s.key, level: "error", text: `${s.label}: “${v}” isn't the product's address.` })
    if (r?.means === "url" && !b.url) out.push({ key: s.key, level: "warn", text: `${s.label}: the brief has no address to show.` })
    for (const n of names) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(v) && !known.includes(n.toLowerCase())) out.push({ key: s.key, level: "error", text: `${s.label}: “${n}” is the reference film's name, not this product's.` })
    const hype = HYPE.exec(v)
    if (hype) out.push({ key: s.key, level: "warn", text: `${s.label}: “${hype[0]}” is a hype word.` })
    for (const ban of b.banned) if (ban && v.toLowerCase().includes(ban.toLowerCase())) out.push({ key: s.key, level: "error", text: `${s.label}: “${ban}” is a word the brand never uses.` })
  }
  return out
}

/* ---------------- edits: what an agent or a person can do to a film ---------------- */

export type Op =
  | { op: "line"; key: string; value: string }
  | { op: "rewrite"; keys?: string[]; note: string }
  | { op: "template"; id: string }
  | { op: "size"; size: "16x9" | "9x16" | "1x1" | "4x5" }
  | { op: "drop"; scene: number }
  | { op: "move"; scene: number; to: number }
  | { op: "retime"; scene: number; seconds: number }
  | { op: "screen"; key: string; file: string }
  /** the product's colours and type on the template ("product"), only its accent ("accent"), or the template's own */
  | { op: "theme"; fit: "product" | "accent" | "template" }
  /** the score's mood (server/music.ts), or none */
  | { op: "music"; mood: Mood | "none" }
  /** back to an earlier version (its template, size and every line), as a new version */
  | { op: "restore"; version: number }

/** What the note-reader may answer: edits the director can make without asking anyone. */
export const OPS_SCHEMA = {
  name: "edits",
  schema: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["line", "rewrite", "template", "size", "drop", "move", "retime", "screen", "theme", "music", "restore"] },
            fit: { type: "string", enum: ["product", "accent", "template"] },
            mood: { type: "string", enum: ["calm", "bright", "driving", "dark", "none"] },
            version: { type: "number" },
            key: { type: "string" },
            keys: { type: "array", items: { type: "string" } },
            value: { type: "string" },
            note: { type: "string" },
            id: { type: "string" },
            size: { type: "string", enum: ["16x9", "9x16", "1x1", "4x5"] },
            scene: { type: "number" },
            to: { type: "number" },
            seconds: { type: "number" },
            file: { type: "string" },
          },
          required: ["op"],
        },
      },
      say: { type: "string", description: "One line back to the person: what was changed." },
    },
    required: ["ops", "say"],
  },
}

/** What the critic answers: what it saw, and each line to fix with how (turned into rewrites by the server). Small on
    purpose: a schema listing every edit's fields gets every field filled, and the reply runs out of room. */
export const CRITIC_SCHEMA = {
  name: "review",
  schema: {
    type: "object",
    properties: {
      say: { type: "string", description: "What you saw, one or two sentences." },
      fixes: { type: "array", items: { type: "object", properties: { key: { type: "string" }, note: { type: "string", description: "How to rewrite it." } }, required: ["key", "note"] } },
    },
    required: ["say", "fixes"],
  },
}

/** The scorecard a directed film is read against (1 to 5 each), and what to tell the director when it falls short:
    `notes` go into the next story call. */
export const SCORE_SCHEMA = {
  name: "scorecard",
  schema: {
    type: "object",
    properties: {
      say: { type: "string", description: "What you saw, one or two sentences." },
      story: { type: "number", description: "1-5: after watching, could a stranger say what the product does and for whom?" },
      product: { type: "number", description: "1-5: is the product itself on screen, working, for most of it?" },
      look: { type: "number", description: "1-5: one world, one type, one grade: never a mix of clips." },
      words: { type: "number", description: "1-5: every line big enough, on a calm ground, not cut off, plain." },
      carriers: { type: "number", description: "1-5: the mark, the shapes and the screens each mean something where they are." },
      shots: { type: "array", description: "Each still against what its shot is meant to do.", items: { type: "object", properties: { n: { type: "number", description: "The still's number." }, matches: { type: "boolean", description: "Does the picture actually show what the shot is meant to (its words, what it shows, the belief it buys)?" }, note: { type: "string", description: "If not, what's wrong and what would fix it; empty if it matches." } }, required: ["n", "matches", "note"] } },
      notes: { type: "string", description: "What to change in the story, in plain words, for the director; empty if nothing." },
    },
    required: ["say", "story", "product", "look", "words", "carriers", "shots", "notes"],
  },
}
export type Scorecard = { say: string; story: number; product: number; look: number; words: number; carriers: number; notes: string; shots?: { n: number; matches: boolean; note: string }[] }
/** The weakest score on a card, and whether the film passes (every score 4 or more). */
export const weakest = (s: Scorecard) => Math.min(s.story, s.product, s.look, s.words, s.carriers)

/** Scene edits on a composition's scenes (lines, templates and sizes are the server's: they need the writer or the
    template's code). */
export function applySceneOps<S extends { duration: number }>(scenes: S[], ops: Op[]): S[] {
  let out = [...scenes]
  for (const o of ops) {
    if (o.op === "drop" && out[o.scene] && out.length > 1) out = out.filter((_, i) => i !== o.scene)
    else if (o.op === "move" && out[o.scene]) {
      const [s] = out.splice(o.scene, 1)
      out.splice(Math.max(0, Math.min(out.length, o.to)), 0, s)
    } else if (o.op === "retime" && out[o.scene]) out[o.scene] = { ...out[o.scene], duration: Math.max(0.4, Math.min(30, o.seconds)) }
  }
  return out
}

/* ---------------- the run log: what each film cost ---------------- */

export type Stage = { stage: string; ms: number; tokens: number; model?: string; cached?: boolean; note?: string }
export const totals = (log: Stage[]) => ({ ms: log.reduce((a, s) => a + s.ms, 0), tokens: log.reduce((a, s) => a + s.tokens, 0), calls: log.filter((s) => s.tokens > 0 || s.model).length })
