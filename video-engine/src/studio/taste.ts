// Studio — what the lab learns from you. Every proposal you approve or reject, and why, is evidence about your taste:
// what was in the films you kept and the ones you didn't (the cuts, angles, moves, pace, looks, kinds of film, how the
// titles arrive) and the words in your reasons. From these it learns:
//   - weights: how far each feature leans you towards yes;
//   - rules: your reasons turned into checks that every new film is held to;
//   - preferences: which shapes, carriers and pace the generators reach for.
// It's recomputed from the decisions each time, so every number can show its evidence and nothing is guessed. Pure:
// the lab's server runs it (and puts it in the nightly prompt), the lab's Learning tab shows it.
import { lintCuts } from "./cuts.ts"
import type { Finding, ScriptShot, TemplateScript } from "./script.ts"

export type Decision = { script: TemplateScript; status: "approved" | "rejected"; reason?: string; decided?: string }
/** `lean`: −1 (you turn these down more than you turn films down in general) to 1 (you keep them more than you keep
    films in general), smoothed so one decision can't swing it all the way */
export type Weight = { feature: string; label: string; yes: number; no: number; lean: number }
export type LearnedRule = { id: string; label: string; quotes: string[] }
/** What you did with a film outside the inbox, kept with the film's features: exported it (the strongest yes), picked
    it from the Artist's takes, passed it over, or gave it a thumb. */
/** `accept` and `rework` are your verdict on a film (Review.tsx): `praise` and `improve` are what works and what could
    be better, as tags; `why` and `note` the same in your words. */
export type Signal = { kind: "export" | "pick" | "skip" | "like" | "dislike" | "accept" | "rework"; at: string; features: string[]; note?: string; why?: string; praise?: string[]; improve?: string[] }
export const SIGNAL_WEIGHT: Record<Signal["kind"], number> = { accept: 2, export: 1.5, like: 1, pick: 0.6, skip: -0.25, dislike: -1, rework: -1 }
export type Taste = {
  decisions: number
  approved: number
  rejected: number
  /** signals by kind (exports, picks, likes…) */
  signals?: Partial<Record<Signal["kind"], number>>
  /** your verdicts: what you praise and what you ask to be better, by how often, and the latest in your words */
  reviews?: { praise: Record<string, number>; improve: Record<string, number>; notes: { at: string; kind: "accept" | "rework"; why?: string; better?: string; praise: string[]; improve: string[] }[] }
  weights: Weight[]
  rules: LearnedRule[]
  /** what the generators read: a weight per invented shape and per carrier (1 is neutral), and a pace factor (above 1
      is slower) */
  prefer: { shapes: Record<string, number>; carriers: Record<string, number>; styles?: Record<string, number>; pace: number }
}
export const EMPTY_TASTE: Taste = { decisions: 0, approved: 0, rejected: 0, signals: {}, weights: [], rules: [], prefer: { shapes: {}, carriers: {}, styles: {}, pace: 1 } }

/* ---------------- what's in a film ---------------- */

const titlesOf = (sh: ScriptShot) => (sh.layers ?? []).filter((l) => l.kind === "text")
const LABEL: Record<string, (v: string) => string> = {
  cut: (v) => `${v === "cut" ? "hard" : v} cuts`,
  angle: (v) => `the ${v} angle`,
  move: (v) => (v === "glide" ? "glides between two framings" : `the ${v} move`),
  look: (v) => `${v} looks`,
  ground: (v) => `${v} grounds`,
  title: (v) => `titles that arrive by ${v}`,
  pace: (v) => `a ${v} pace`,
  length: (v) => `${v} films`,
  type: (v) => (v === "many" ? "lots of words" : "few words"),
  category: (v) => `${v.replace(/-/g, " ")} films`,
  shape: (v) => `the inventor's “${v}” shape`,
  style: (v) => `the Artist's “${v}” art direction`,
  piece: (v) => `the “${v}” set piece`,
  signal: (v) => v,
}
export const featureLabel = (f: string) => {
  const [k, v] = f.split(":")
  return LABEL[k]?.(v) ?? f
}

/** The features a film has, each once: what the weights are kept on. */
export function features(s: TemplateScript): string[] {
  const out = new Set<string>()
  s.shots.forEach((sh, i) => {
    if (i) out.add(`cut:${sh.cut ?? "cut"}`)
    if (sh.device) {
      out.add(`angle:${sh.device.from.angle ?? "front"}`)
      out.add(`move:${sh.device.to ? "glide" : (sh.device.move ?? "still")}`)
    }
    for (const t of titlesOf(sh)) if (t.kind === "text") out.add(`title:${t.enter}`)
  })
  // the light harmonies sit on pale grounds (as the inventor sets them); the rest on dark ones
  const dark = s.look ? !["light", "analogous", "studio"].includes(s.look.harmony) : /^(black|#0|#1)/.test(s.ground)
  out.add(`ground:${dark ? "dark" : "light"}`)
  if (s.look) out.add(`look:${s.look.harmony}`)
  const n = s.shots.length || 1
  const mean = s.shots.reduce((a, x) => a + x.dur, 0) / n
  out.add(`pace:${mean < 2.2 ? "fast" : mean < 3.6 ? "steady" : "slow"}`)
  const total = mean * n
  out.add(`length:${total < 15 ? "short" : total < 32 ? "mid-length" : "long"}`)
  const words = s.shots.reduce((a, x) => a + titlesOf(x).length, 0)
  out.add(`type:${words > Math.ceil(n / 2) ? "many" : "few"}`)
  if (s.category) out.add(`category:${s.category}`)
  // how the Artist made it: its art direction and its set pieces
  if (s.artist) {
    out.add(`style:${s.artist.style}`)
    for (const p of s.artist.pieces) out.add(`piece:${p}`)
  }
  const shape = /^invented-([a-z]+)-/.exec(s.id)?.[1]
  if (shape) out.add(`shape:${shape}`)
  return [...out]
}

/* ---------------- your reasons, as rules ---------------- */

type Lesson = { id: string; label: string; re: RegExp; check: (s: TemplateScript) => { shot?: number; text: string }[] }
const devicesHeld = (s: TemplateScript) => s.shots.flatMap((sh, i) => (sh.device && !sh.device.to && (!sh.device.move || sh.device.move === "still") ? [i] : []))
/** Reasons the admin gives, by what they say, and the check each becomes. Matched on the words, not guessed at. */
export const LESSONS: Lesson[] = [
  { id: "cut.smooth", label: "Every cut carried: nothing the checker calls abrupt", re: /\b(?:abrupt\w*|jarr\w*|jump(?:y|s)?|janky|choppy|not smooth|smooth(?:er|ly)?|cuts? (?:are|is|feel))\b/i, check: (s) => lintCuts(s).map((f) => ({ shot: f.shot, text: f.text })) },
  { id: "pace.slower", label: "Calmer: no shot under 1.6 s", re: /\b(?:too (?:fast|quick|rushed|hectic)|slow (?:it )?down|calmer|breathe)\b/i, check: (s) => s.shots.flatMap((sh, i) => (sh.dur < 1.6 ? [{ shot: i, text: `“${sh.name}” lasts ${sh.dur} s.` }] : [])) },
  { id: "pace.faster", label: "More energy: no device shot over 4.5 s", re: /\b(?:too slow|drags?|boring|more energy|faster|snappier|dynamic)\b/i, check: (s) => s.shots.flatMap((sh, i) => (sh.device && sh.dur > 4.5 ? [{ shot: i, text: `“${sh.name}” holds for ${sh.dur} s.` }] : [])) },
  { id: "type.fewer", label: "Fewer words: one title at a time, in at most half the shots", re: /\b(?:too (?:much|many) (?:text|type|words|titles)|less text|fewer words|not so much text|wordy)\b/i, check: (s) => { const n = s.shots.filter((x) => titlesOf(x).length).length; return n > Math.ceil(s.shots.length / 2) ? [{ text: `Titles in ${n} of ${s.shots.length} shots.` }] : [] } },
  { id: "busy.less", label: "Less going on: at most 7 shots, one thing in each", re: /\b(?:too (?:much|many things) going on|busy|cluttered|less going on|nothing primary|too many (?:shots|things))\b/i, check: (s) => (s.shots.length > 7 ? [{ text: `${s.shots.length} shots.` }] : []) },
  { id: "cut.noflash", label: "No colour flashes", re: /\bflash(?:es|y)?\b/i, check: (s) => s.shots.flatMap((sh, i) => (sh.cut === "flash" ? [{ shot: i, text: `“${sh.name}” comes in on a flash.` }] : [])) },
  { id: "look.calm", label: "Calmer colour: no pop or complementary looks", re: /\b(?:too bright|(?:over)?saturated|loud|garish|neon|colou?rs? (?:are )?too \w+|calmer colou?rs?)\b/i, check: (s) => (s.look && ["pop", "complement"].includes(s.look.harmony) ? [{ text: `A ${s.look.harmony} look.` }] : []) },
  { id: "look.light", label: "Lighter grounds", re: /\b(?:too dark|lighter|white ground|keep (?:it )?white)\b/i, check: (s) => (features(s).includes("ground:dark") ? [{ text: "A dark ground." }] : []) },
  { id: "look.dark", label: "Darker grounds", re: /\b(?:too (?:light|white|washed)|darker|keep (?:it )?dark)\b/i, check: (s) => (features(s).includes("ground:light") ? [{ text: "A light ground." }] : []) },
  { id: "camera.moving", label: "The camera never holds still", re: /\b(?:static|lifeless|flat|stiff|nothing moves|more movement)\b/i, check: (s) => devicesHeld(s).map((i) => ({ shot: i, text: `“${s.shots[i].name}” holds the device still.` })) },
]

/** A "could be better" tag as the words a lesson listens for (a tag alone can't say which way pacing should go). */
const IMPROVE_TO: Record<string, string> = { Cuts: "the cuts are abrupt", Type: "too much text" }

/* ---------------- learning ---------------- */

/** Everything the decisions teach: the weights, the rules from the reasons, the generators' preferences. */
/** A decision's weight by its age: a half-life of 45 days, so taste follows you as it changes. */
const recency = (at: string | undefined, now: number) => (at ? 0.5 ** Math.max(0, (now - new Date(at).getTime()) / (45 * 864e5)) : 1)

export function learn(decisions: Decision[], signals: Signal[] = [], now = Date.now()): Taste {
  const yes = new Map<string, number>()
  const no = new Map<string, number>()
  let up = 0
  let all = 0
  const add = (feats: string[], w: number) => {
    const to = w > 0 ? yes : no
    for (const f of feats) to.set(f, (to.get(f) ?? 0) + Math.abs(w))
    if (w > 0) up += w
    all += Math.abs(w)
  }
  for (const d of decisions) add(features(d.script), (d.status === "approved" ? 1 : -1) * recency(d.decided, now))
  for (const g of signals) add(g.features, SIGNAL_WEIGHT[g.kind] * recency(g.at, now))
  // against your own base rate: if you approve one film in five, a feature in two kept films and none turned down
  // leans in, one in a kept film and six turned down leans out a little, and one as common as films in general is level
  const p0 = all ? up / all : 0.5
  const leanOf = (y: number, n: number) => {
    const rate = (y + 2 * p0) / (y + n + 2)
    const d = rate - p0
    return Math.round((d >= 0 ? d / Math.max(0.05, 1 - p0) : d / Math.max(0.05, p0)) * 100) / 100
  }
  const weights: Weight[] = [...new Set([...yes.keys(), ...no.keys()])]
    .map((f) => {
      const y = yes.get(f) ?? 0
      const n = no.get(f) ?? 0
      return { feature: f, label: featureLabel(f), yes: Math.round(y * 10) / 10, no: Math.round(n * 10) / 10, lean: leanOf(y, n) }
    })
    .sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean) || b.yes + b.no - (a.yes + a.no))
  const rules: LearnedRule[] = []
  for (const l of LESSONS) {
    const quotes = [...decisions.filter((d) => d.status === "rejected" && d.reason).map((d) => d.reason!), ...signals.filter((g) => (g.kind === "dislike" || g.kind === "rework" || g.kind === "accept") && g.note).map((g) => g.note!), ...signals.flatMap((g) => (g.improve ?? []).map((t) => IMPROVE_TO[t]).filter(Boolean))].filter((q) => l.re.test(q)).map((q) => q.trim().slice(0, 160))
    if (quotes.length) rules.push({ id: l.id, label: l.label, quotes: [...new Set(quotes)].slice(0, 4) })
  }
  const lean = (f: string) => weights.find((w) => w.feature === f)?.lean ?? 0
  const prefer: Required<Taste["prefer"]> = { shapes: {}, carriers: {}, styles: {}, pace: 1 }
  for (const w of weights) {
    const [k, v] = w.feature.split(":")
    if (k === "shape") prefer.shapes[v] = Math.round((1 + w.lean) * 100) / 100
    if (k === "cut") prefer.carriers[v] = Math.round((1 + w.lean) * 100) / 100
    if (k === "style") prefer.styles[v] = Math.round((1 + w.lean) * 100) / 100
  }
  const has = (id: string) => rules.some((r) => r.id === id)
  prefer.pace = has("pace.slower") && !has("pace.faster") ? 1.15 : has("pace.faster") && !has("pace.slower") ? 0.88 : Math.round((1 + 0.1 * (lean("pace:slow") - lean("pace:fast"))) * 100) / 100
  const counts: Partial<Record<Signal["kind"], number>> = {}
  for (const g of signals) counts[g.kind] = (counts[g.kind] ?? 0) + 1
  const verdicts = signals.filter((g) => g.kind === "accept" || g.kind === "rework")
  const tally = (key: "praise" | "improve") => verdicts.reduce<Record<string, number>>((a, g) => ((g[key] ?? []).forEach((t) => (a[t] = (a[t] ?? 0) + 1)), a), {})
  const reviews = verdicts.length ? { praise: tally("praise"), improve: tally("improve"), notes: verdicts.slice(0, 12).map((g) => ({ at: g.at, kind: g.kind as "accept" | "rework", why: g.why, better: g.note, praise: g.praise ?? [], improve: g.improve ?? [] })) } : undefined
  return { decisions: decisions.length, approved: decisions.filter((d) => d.status === "approved").length, rejected: decisions.filter((d) => d.status === "rejected").length, signals: counts, ...(reviews ? { reviews } : {}), weights, rules, prefer }
}

/** How well a film fits what you've kept and turned down, 0 to 100 (50 with too little to go on): the mean lean of
    its features, less every learned rule it breaks. */
export function tasteScore(s: TemplateScript, t: Taste) {
  const seen = t.decisions + Object.values(t.signals ?? {}).reduce((a, x) => a + (x ?? 0), 0)
  if (seen < 2) return { score: 50, why: "Not enough to go on yet: approve or reject a few proposals, export a film, or pick an Artist take, and it learns." }
  const f = features(s)
  const known = t.weights.filter((w) => f.includes(w.feature))
  const mean = known.length ? known.reduce((a, w) => a + w.lean, 0) / known.length : 0
  const broken = tasteLints(s, t)
  const score = Math.round(Math.min(100, Math.max(0, 50 + 50 * mean - 12 * broken.length)))
  const best = [...known].sort((a, b) => b.lean - a.lean)[0]
  const worst = [...known].sort((a, b) => a.lean - b.lean)[0]
  const why = [best && best.lean > 0.15 ? `you keep ${best.label}` : "", worst && worst.lean < -0.15 ? `you turn down ${worst.label}` : "", broken.length ? `it breaks ${broken.length === 1 ? "a rule" : `${broken.length} rules`} you taught it` : ""].filter(Boolean).join("; ")
  return { score, why: why ? `${why[0].toUpperCase()}${why.slice(1)}.` : "Nothing in it you've decided on either way." }
}

/** The rules learned from your reasons, as findings on a film (warnings: it goes to you with them, not refused). */
export function tasteLints(s: TemplateScript, t: Taste): Finding[] {
  return t.rules.flatMap((r) => {
    const l = LESSONS.find((x) => x.id === r.id)
    return (l?.check(s) ?? []).map((x) => ({ level: "warn" as const, rule: `learned.${r.id}`, ...(x.shot !== undefined ? { shot: x.shot } : {}), text: `${x.text} You said: “${r.quotes[0]}”` }))
  })
}

/** The taste in a few lines, for the AI that writes the next films. */
export function tasteBrief(t: Taste) {
  if (!t.decisions) return "- no decisions yet"
  const keep = t.weights.filter((w) => w.lean >= 0.2).slice(0, 6).map((w) => `${w.label} (${w.yes} kept, ${w.no} not)`)
  const drop = t.weights.filter((w) => w.lean <= -0.2).slice(0, 6).map((w) => `${w.label} (${w.no} turned down, ${w.yes} kept)`)
  const top = (o: Record<string, number> = {}) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} (${n})`).join(", ")
  const said = (t.reviews?.notes ?? []).flatMap((n) => [n.why && `kept: "${n.why}"`, n.better && `better: "${n.better}"`]).filter(Boolean).slice(0, 4).join("; ")
  return [keep.length && `- They keep: ${keep.join("; ")}.`, drop.length && `- They turn down: ${drop.join("; ")}.`, t.reviews && top(t.reviews.praise) && `- In their verdicts they praise: ${top(t.reviews.praise)}.`, t.reviews && top(t.reviews.improve) && `- And ask to be better: ${top(t.reviews.improve)}.`, said && `- In their words: ${said}.`, ...t.rules.map((r) => `- Rule they taught: ${r.label}. They said: "${r.quotes[0]}"`)].filter(Boolean).join("\n") || "- nothing decisive yet"
}
