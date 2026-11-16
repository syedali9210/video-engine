// Studio — ideas for films, and the critic that reads them. An idea is a film before it has shots: a hook (what grabs
// in the first two seconds), a spine (the structure), a signature (the one visual idea that carries it, with the
// carrier its cuts lean on), a look, and its beats, each with its intent. Ideas are made by rules (a grammar of hooks,
// spines and signatures, seeded, your taste weighting it), by Gemini, or from a film the lab studied ("in the manner
// of"). Developed, an idea becomes a script like any other. The critic scores any film on what makes one work: its
// hook, its clarity, how its cuts flow, its craft by the guidelines, its pacing against the films studied, its
// variety, how new it is next to the gallery, and how it fits your taste. Each score says why, and the weakest say
// what to do.
import { SHAPE_COUNT, beatOf, filmOf, invent, pick, rng } from "./invent.ts"
import { cutFromWords, cutReport, cutScore, shotMotion, velocity } from "./cuts.ts"
import { tasteScore, type Taste } from "./taste.ts"
import { lintScript, type ScriptShot, type TemplateScript } from "./script"
import type { Transition } from "./comp"
import type { Harmony } from "../theme"
import type { Reference } from "../refs"

export type IdeaBeat = { beat: string; intent: string }
export type Idea = {
  id: string
  title: string
  logline: string
  category: string
  hook: string
  signature: string
  /** the carrier its cuts lean on, where two would do */
  carrier?: Transition
  harmony: Harmony
  beats: IdeaBeat[]
  why: string[]
  from: "rules" | "ai" | "study"
  /** the studied film it's after */
  ref?: string
  /** above 1, slower */
  pace?: number
  seed: number
}

/* ---------------- the grammar ---------------- */

type Part = { id: string; text: string; beats: [string, string][] }
const HOOKS: Part[] = [
  { id: "detail", text: "Opens close on a detail everyone knows, new because it's this near.", beats: [["detail-top", "The hook: a detail, close, already moving."]] },
  { id: "words", text: "A line in big letters before anything is shown: the question the film answers.", beats: [["card:{hook}:letters", "The hook: the line, letter by letter."]] },
  { id: "swing", text: "Comes in mid-swing: the film is already moving at its first frame.", beats: [["swing:dutch:Off the level", "The hook: a swing from a tilted look."]] },
  { id: "above", text: "Straight down onto it: a calm, unusual first look.", beats: [["top", "The hook: from above, whole and flat."]] },
  { id: "drop", text: "It drops into the light and bounces: weight in the first second.", beats: [["reveal:fall", "The hook: the product arriving with weight."]] },
  { id: "below", text: "From below on a wide lens it towers: the product as a monument.", beats: [["worm", "The hook: a monument."]] },
]
type Spine = Part & { name: string; category: string }
const SPINES: Spine[] = [
  { id: "tease", name: "Tease, reveal, tour", category: "teaser", text: "a second detail, the reveal, a turn round it, the line", beats: [["edge", "A second detail, from a new side."], ["reveal:flip", "The reveal, earned by the details."], ["turn:arc", "Around it: the space it lives in."], ["card:{tagline}:sweep", "The line, on its own."], ["end", "The name."]] },
  { id: "answer", name: "The line, then the answer", category: "feature-launch", text: "the product answering the line, the feature in context, the whole thing", beats: [["dive", "Into the interface: the answer, shown."], ["feature:{feature1}", "The feature, in context."], ["reveal:flip", "The whole thing."], ["card:{tagline}:mask", "The line."], ["end", "The name."]] },
  { id: "push", name: "One continuous push", category: "product-demo", text: "dive after dive, each chapter landing inside the interface", beats: [["dive", "In."], ["card:{feature1}:settle", "Chapter one, on the far side of the push."], ["reveal:flip", "Back out to the device."], ["dive", "In again."], ["card:{feature2}:settle", "Chapter two."], ["end", "The name."]] },
  { id: "chapters", name: "Three chapters", category: "product-launch", text: "three features, each said, then shown", beats: [["card:{feature1}:mask", "Said."], ["over", "Shown."], ["card:{feature2}:mask", "Said."], ["edge", "Shown."], ["card:{feature3}:mask", "Said."], ["reveal:rise", "All of it."], ["end", "The name."]] },
  { id: "montage", name: "Montage, then the hero", category: "social", text: "quick looks that swing into each other, then one slow turn", beats: [["swing:worm:From below", "A look from below."], ["swing:over:Over it", "From above."], ["swing:profile:Edge on", "Edge on."], ["reveal:spin", "The hero."], ["turn:turntable", "Every side."], ["end", "The name."]] },
  { id: "monument", name: "The monument", category: "brand", text: "the space bending round it, how thin it is, then it's set down in the light", beats: [["turn:vertigo", "The space bends round it."], ["profile", "How thin it is."], ["card:{tagline}:settle", "The line."], ["reveal:crane", "Set down in the light."], ["end", "The name."]] },
  { id: "table", name: "On the table", category: "brand", text: "one long glide along it lying down, then it rises", beats: [["lying", "One long glide along it."], ["card:{feature1}:words", "What it does."], ["reveal:rise", "It rises."], ["turn:arc", "Around it."], ["end", "The name."]] },
]
type Signature = { id: string; text: string; short: string; carrier: Transition }
const SIGNATURES: Signature[] = [
  { id: "push", text: "one continuous push: every chapter goes on through the frame", short: "on one push", carrier: "through" },
  { id: "swing", text: "every cut a swing the next shot catches", short: "on swings", carrier: "whip" },
  { id: "iris", text: "everything opens out of the product: the iris is the motif", short: "out of an iris", carrier: "iris" },
  { id: "line", text: "a line of light carries each new colour across", short: "on a line of light", carrier: "wipe" },
  { id: "glide", text: "one glide, cut in places: the camera never changes direction", short: "in one glide", carrier: "cut" },
]
const LOOKS: Record<string, Harmony[]> = { teaser: ["deep", "tonal"], "feature-launch": ["pop", "analogous", "tonal"], "product-demo": ["tonal", "light"], "product-launch": ["deep", "tonal"], social: ["pop", "deep"], brand: ["light", "analogous", "deep"] }

/** Ideas by rules, `n` of them for `seed`: a hook, a spine and a signature each, no two alike, of one kind of film if
    asked. Your taste weights the signatures (the carriers you keep come up more) and sets the pace. */
export function ideasByRules(seed: number, n = 6, o: { category?: string; taste?: Taste } = {}): Idea[] {
  const r = rng(seed * 13 + 5)
  const spines = o.category && SPINES.some((s) => s.category === o.category) ? SPINES.filter((s) => s.category === o.category) : SPINES
  // a signature's chance, by how much you keep its carrier
  const weighted = SIGNATURES.flatMap((s) => Array.from({ length: Math.max(1, Math.round(2 * (o.taste?.prefer.carriers[s.carrier] ?? 1))) }, () => s))
  const out: Idea[] = []
  const seen = new Set<string>()
  for (let tries = 0; out.length < n && tries < n * 16; tries++) {
    const spine = pick(r, spines)
    const hook = pick(r, HOOKS.filter((h) => h.beats[0][0] !== spine.beats[0][0]))
    const sig = pick(r, weighted)
    const key = `${spine.id}-${hook.id}-${sig.id}`
    // a spine that already has more than one idea waits for the others
    if (seen.has(key) || (out.filter((x) => x.id.startsWith(`idea-${spine.id}-`)).length >= Math.ceil(n / spines.length) + 1 && tries < n * 8)) continue
    seen.add(key)
    const category = o.category ?? spine.category
    out.push({
      id: `idea-${key}-${seed}`,
      title: `${spine.name}, ${sig.short}`,
      logline: `${hook.text} Then ${spine.text}; ${sig.text}.`,
      category,
      hook: hook.text,
      signature: sig.text,
      carrier: sig.carrier,
      harmony: pick(r, LOOKS[category] ?? ["tonal"]),
      beats: [...hook.beats, ...spine.beats].map(([beat, intent]) => ({ beat, intent })),
      why: [`The hook: ${hook.text}`, `The spine, ${spine.name.toLowerCase()}: ${spine.text}.`, `The signature: ${sig.text}.`],
      from: "rules",
      ...(o.taste && o.taste.prefer.pace !== 1 ? { pace: o.taste.prefer.pace } : {}),
      seed: seed * 31 + tries,
    })
  }
  return out
}

/** An idea, developed into a film: its beats as shots, each shot's "why" opening with the beat's intent, the cuts
    planned with the signature's carrier first. */
export function develop(idea: Idea): TemplateScript {
  const beats = idea.beats.filter((b) => beatOf(b.beat))
  const film = filmOf({
    id: idea.id.replace(/^idea-/, "idea-film-").slice(0, 60),
    name: idea.title.slice(0, 60),
    source: `developed from the idea “${idea.title}”${idea.ref ? `, after “${idea.ref}”` : ""}`,
    category: idea.category,
    harmony: idea.harmony,
    summary: idea.logline,
    why: idea.why,
    beats: beats.map((b) => b.beat),
    seed: idea.seed,
    pace: idea.pace,
    prefer: idea.carrier ? { [idea.carrier]: 2 } : undefined,
  })
  return { ...film, shots: film.shots.map((sh, i) => ({ ...sh, why: beats[i] ? `${beats[i].intent} ${sh.why}` : sh.why })) }
}

/* ---------------- the critic ---------------- */

export type Score = { id: "hook" | "clarity" | "flow" | "craft" | "pacing" | "variety" | "novelty" | "taste"; label: string; score: number; note: string }
export type Analysis = { score: number; verdict: string; parts: Score[]; fixes: string[] }
const WEIGHT: Record<Score["id"], number> = { hook: 0.16, clarity: 0.1, flow: 0.2, craft: 0.14, pacing: 0.1, variety: 0.1, novelty: 0.12, taste: 0.08 }
const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)))
const titlesOf = (sh: ScriptShot) => (sh.layers ?? []).filter((l) => l.kind === "text")
const KINETIC = ["letters", "settle", "custom", "words", "sweep", "mask", "type"]
// a shot by what it is: a device by its angle and move; a flat shot by the kinds of layer in it and how many titles
const token = (sh: ScriptShot) => (sh.device ? `${sh.device.from.angle ?? "front"}/${sh.device.to ? "glide" : (sh.device.move ?? "still")}` : `flat:${[...new Set((sh.layers ?? []).map((l) => l.kind))].sort().join("+")}:${Math.min(3, titlesOf(sh).length)}`)
const bigrams = (s: TemplateScript) => {
  const t = s.shots.map(token)
  return new Set(t.slice(1).map((x, i) => `${t[i]}>${x}`))
}
/** How alike two films are, 0 to 1: the shots that follow each other in both (an order, not just the same shots). */
export function likeness(a: TemplateScript, b: TemplateScript) {
  const x = bigrams(a)
  const y = bigrams(b)
  const both = [...x].filter((k) => y.has(k)).length
  return x.size + y.size - both ? both / (x.size + y.size - both) : 0
}
/** The usual shot length of the films studied (of this kind, when two or more are), the median of their means, held
    inside the guidelines' band: a demo's long takes don't make every film slow. Null with nothing studied. */
export function studiedPace(refs: Reference[] = [], category?: string) {
  const films = refs.filter((r) => r.shots.length > 2)
  const same = films.filter((r) => r.category === category)
  const means = (same.length >= 2 ? same : films).map((r) => r.shots.reduce((a, s) => a + s.dur, 0) / r.shots.length).sort((a, b) => a - b)
  if (!means.length) return null
  const mid = means.length % 2 ? means[(means.length - 1) / 2] : (means[means.length / 2 - 1] + means[means.length / 2]) / 2
  return Math.min(4.8, Math.max(2.2, mid))
}

/** A film read by the critic. `gallery`: the templates it's measured against for novelty; `refs`: the films studied,
    for pacing; `taste`: what your decisions taught. */
export function analyze(s: TemplateScript, ctx: { gallery?: TemplateScript[]; refs?: Reference[]; taste?: Taste } = {}): Analysis {
  const shots = s.shots
  const n = Math.max(1, shots.length)
  const lint = lintScript(s)
  const parts: Score[] = []

  // the hook: short, already moving (or kinetic words), not a wide device standing still
  const first = shots[0]
  let hook = 50
  const hookNotes: string[] = []
  if (first) {
    const v = velocity(shotMotion(first), "in")
    const moving = Math.hypot(v.x, v.y) + Math.abs(v.z) * 0.5 + Math.abs(v.spin) / 90 > 0.04
    const kinetic = titlesOf(first).some((l) => l.kind === "text" && KINETIC.includes(l.enter))
    if (first.dur <= 2.6) hook += 20
    else hookNotes.push(`it takes ${first.dur.toFixed(1)} s`)
    if (moving || kinetic) hook += 25
    else hookNotes.push("nothing moves in its first moment")
    const z = Math.max(first.device?.from.zoom ?? 1, first.device?.to?.zoom ?? 0)
    if (first.device && z < 1.2 && !moving) {
      hook -= 30
      hookNotes.push("it opens wide on a device standing still")
    }
    if (first.device && z >= 1.8) hook += 5
  }
  parts.push({ id: "hook", label: "Hook", score: clamp(hook), note: hookNotes.length ? `The first shot: ${hookNotes.join(", ")}.` : "The first shot is short and already moving." })

  // clarity: one idea at a time, words in at most half the shots
  const busy = lint.filter((f) => f.rule === "type.rare").length
  const worded = shots.filter((x) => titlesOf(x).length).length
  // a film led by its type (the Artist's) carries words in most shots by design: only crowding counts against it
  const extra = s.artist ? 0 : Math.max(0, worded - Math.ceil(n / 2))
  parts.push({ id: "clarity", label: "Clarity", score: clamp(100 - 25 * busy - 12 * extra), note: busy || extra ? `${busy ? `${busy} shot${busy > 1 ? "s" : ""} with more than two titles; ` : ""}words in ${worded} of ${n} shots.` : `One idea at a time; words in ${worded} of ${n} shots.` })

  // flow: the cuts
  const report = cutReport(s)
  const abrupt = report.filter((c) => c.verdict === "abrupt")
  parts.push({ id: "flow", label: "Flow", score: cutScore(s), note: abrupt.length ? `${abrupt.length} of ${report.length} cuts are abrupt: ${abrupt[0].why.toLowerCase()}` : `Every cut is carried or clean (${report.filter((c) => c.verdict === "carried").length} carried).` })

  // craft: the guidelines a machine checks, other than what flow and clarity count
  const rest = lint.filter((f) => !f.rule.startsWith("cut.") && f.rule !== "type.rare")
  const warns = rest.filter((f) => f.level !== "info")
  parts.push({ id: "craft", label: "Craft", score: clamp(100 - 12 * warns.length - 3 * (rest.length - warns.length)), note: warns.length ? `${warns.length} guideline${warns.length > 1 ? "s" : ""} to look at: ${warns[0].text}` : "It follows every guideline a machine can check." })

  // pacing: the mean shot against the films studied (or the guidelines' 2.2 to 4.2 s), and some change in it
  const mean = shots.reduce((a, x) => a + x.dur, 0) / n
  const ref = studiedPace(ctx.refs, s.category)
  const [lo, hi] = ref ? [ref * 0.75, ref * 1.3] : [2.2, 4.2]
  const off = mean < lo ? lo - mean : mean > hi ? mean - hi : 0
  const sd = Math.sqrt(shots.reduce((a, x) => a + (x.dur - mean) ** 2, 0) / n)
  parts.push({ id: "pacing", label: "Pacing", score: clamp(100 - 45 * off - (sd / mean < 0.12 && n > 3 ? 15 : 0)), note: `Shots of ${mean.toFixed(1)} s on average${ref ? ` (the films studied: ${ref.toFixed(1)} s)` : " (the guidelines: 2.2 to 4.2 s)"}${sd / mean < 0.12 && n > 3 ? "; every shot about as long, so nothing lands harder" : ""}.` })

  // variety: different angles and moves
  const kinds = new Set(shots.map(token))
  parts.push({ id: "variety", label: "Variety", score: clamp((kinds.size / n) * 110), note: `${kinds.size} different kinds of shot in ${n}.` })

  // novelty: unlike the gallery's films
  const others = (ctx.gallery ?? []).filter((g) => g.id !== s.id)
  const near = others.map((g) => ({ g, k: likeness(s, g) })).sort((a, b) => b.k - a.k)[0]
  parts.push({ id: "novelty", label: "Novelty", score: clamp(100 - 100 * (near?.k ?? 0)), note: near && near.k > 0.25 ? `Close to “${near.g.name}”: ${Math.round(near.k * 100)}% of its shot pairs are the same.` : "Unlike anything in the gallery." })

  // taste
  const t = ctx.taste ? tasteScore(s, ctx.taste) : { score: 50, why: "Taste isn't loaded." }
  parts.push({ id: "taste", label: "Your taste", score: t.score, note: t.why })

  const score = clamp(parts.reduce((a, p) => a + p.score * WEIGHT[p.id], 0))
  const FIX: Record<Score["id"], string> = {
    hook: "Open on something short and already moving: a close detail, a swing, or the line in big letters.",
    clarity: "Cut words: one title at a time, and in at most half the shots.",
    flow: "Fix by rules: every cut gets its carrier (a whip, a push through, an iris, a wipe, or the move going on).",
    craft: "Fix by rules applies the guidelines a machine can (depth of field on close shots, the camera always moving).",
    pacing: ref ? `Bring the shots towards ${ref.toFixed(1)} s, with one held longer than the rest.` : "Bring the shots into 2.2 to 4.2 s, with one held longer than the rest.",
    variety: "Use more of the vocabulary: a new angle (over the top, below, edge on) or a move (an arc, a crane, a dolly zoom).",
    novelty: "Change the order or swap a shot for a new one: it's too close to a film you already have.",
    taste: "It leans on what you've turned down before: see Learning.",
  }
  const fixes = [...parts].filter((p) => p.score < 70).sort((a, b) => a.score - b.score).slice(0, 3).map((p) => FIX[p.id])
  return { score, verdict: score >= 80 ? "Strong: develop it." : score >= 65 ? "Promising: fix the notes first." : "Weak: rework it.", parts, fixes }
}

/* ---------------- a studied film, analysed ---------------- */

/** A shot as a teardown described it, as one of the inventor's beats (the nearest the engine has). */
export function beatFromWords(sh: Reference["shots"][number]): string {
  const t = `${sh.what} ${sh.from} ${sh.to} ${sh.rotation}`.toLowerCase()
  if (/\b(logo|end card|wordmark|the name)\b/.test(t)) return "end"
  if (/\b(title|text|headline|words?|tagline|caption)\b/.test(t) && !/\b(phone|device|iphone|mac|ipad|laptop|screen|ui|interface)\b/.test(t)) return /tagline|line/.test(t) ? "card:{tagline}:sweep" : "card:{feature1}:mask"
  if (/into the screen|dive|zoom(s|ing)? in(to)?|push(es)? into/.test(t)) return "dive"
  if (/whip|swish/.test(t)) return "swing:hero:Swing past"
  if (/drop|falls?\b/.test(t)) return "reveal:fall"
  if (/from (its )?back|spin/.test(t)) return "reveal:spin"
  if (/flip|edge to face|turns to face/.test(t)) return "reveal:flip"
  if (/rises?|from below the frame/.test(t)) return "reveal:rise"
  if (/crane|descend|lowers/.test(t)) return "reveal:crane"
  if (/turntable|360|full turn/.test(t)) return "turn:turntable"
  if (/orbit|arc|around/.test(t)) return "turn:arc"
  if (/dolly zoom|vertigo/.test(t)) return "turn:vertigo"
  if (/over the top/.test(t)) return "over"
  if (/top.?down|from above|overhead|bird/.test(t)) return "top"
  if (/worm|from below|low angle/.test(t)) return "worm"
  if (/profile|side on|edge on/.test(t)) return "profile"
  if (/edge|band|side/.test(t)) return "edge"
  if (/dutch|tilted|canted/.test(t)) return "dutch"
  if (/lying|on (a|the) table|flat lay/.test(t)) return "lying"
  if (/macro|close|detail|extreme/.test(t)) return "detail-top"
  if (/feature|ui|interface|screen/.test(t)) return "feature:{feature1}"
  return "turn:turn"
}

export type FilmReading = {
  shots: number
  length: number
  perMinute: number
  mean: number
  shortest: number
  longest: number
  /** the stretch where it cuts fastest, and where it holds longest */
  fastest?: { at: number; to: number }
  slowest?: { at: number; dur: number; what: string }
  cuts: { cut: Transition; n: number }[]
  camera: { word: string; n: number }[]
  titles: number
  firstTitle?: number
  /** the acts, by where the pace changes */
  acts: { at: number; to: number; label: string }[]
}
const CAMERA_WORDS = ["macro", "close", "wide", "push", "pull", "orbit", "pan", "tilt", "top", "below", "profile", "dolly", "rack", "spin", "whip", "track", "static", "handheld"]
/** A studied film, read: its pacing, its cuts as the engine's transitions, the camera words its shots use, its titles
    and its acts. */
export function readFilm(ref: Reference): FilmReading {
  const sh = ref.shots
  const length = sh.length ? Math.max(...sh.map((s) => s.at + s.dur)) : 0
  const durs = sh.map((s) => s.dur).filter((d) => d > 0)
  const mean = durs.length ? durs.reduce((a, x) => a + x, 0) / durs.length : 0
  const hist = new Map<Transition, number>()
  sh.slice(1).forEach((s) => hist.set(cutFromWords(s.cut), (hist.get(cutFromWords(s.cut)) ?? 0) + 1))
  const words = new Map<string, number>()
  for (const s of sh) for (const w of CAMERA_WORDS) if (`${s.from} ${s.to} ${s.what}`.toLowerCase().includes(w)) words.set(w, (words.get(w) ?? 0) + 1)
  // the fastest stretch: four shots in the least time
  let fastest: FilmReading["fastest"]
  for (let i = 0; i + 4 <= sh.length; i++) {
    const span = sh[i + 3].at + sh[i + 3].dur - sh[i].at
    if (!fastest || span < fastest.to - fastest.at) fastest = { at: sh[i].at, to: sh[i].at + span }
  }
  const long = [...sh].sort((a, b) => b.dur - a.dur)[0]
  // acts: the hook (to 2.5 s), then a new act wherever the pace halves or doubles against the last three shots
  const acts: FilmReading["acts"] = []
  if (sh.length) {
    let start = 0
    const hookEnd = sh.find((s) => s.at >= 2.4)?.at ?? Math.min(2.5, length)
    acts.push({ at: 0, to: hookEnd, label: "Hook" })
    start = hookEnd
    for (let i = 3; i < sh.length; i++) {
      if (sh[i].at <= start + 3) continue
      const before = (sh[i - 1].dur + sh[i - 2].dur + sh[i - 3].dur) / 3
      if (sh[i].dur > before * 2 || sh[i].dur < before / 2) {
        acts.push({ at: start, to: sh[i].at, label: acts.length === 1 ? "Build" : "Turn" })
        start = sh[i].at
      }
    }
    acts.push({ at: start, to: length, label: "Close" })
  }
  const titles = (ref.kit ?? []).filter((k) => k.kind === "title").length
  return {
    shots: sh.length,
    length,
    perMinute: length ? Math.round((sh.length / length) * 60) : 0,
    mean,
    shortest: durs.length ? Math.min(...durs) : 0,
    longest: durs.length ? Math.max(...durs) : 0,
    fastest,
    ...(long ? { slowest: { at: long.at, dur: long.dur, what: long.what } } : {}),
    cuts: [...hist.entries()].map(([cut, n]) => ({ cut, n })).sort((a, b) => b.n - a.n),
    camera: [...words.entries()].map(([word, n]) => ({ word, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    titles,
    acts,
  }
}

/** Ideas from a film the lab studied: its own structure, as the engine's beats, at its pace, with the signature its
    cuts suggest; then its structure with another signature; then its hook on another spine. */
export function ideasFromFilm(ref: Reference, seed = 1, taste?: Taste): Idea[] {
  if (!ref.shots.length) return []
  const r = rng(seed * 7 + ref.shots.length)
  const reading = readFilm(ref)
  // its shots as beats, neighbours that map to the same beat merged, at most nine, ending on the name
  const beats: IdeaBeat[] = []
  for (const s of ref.shots) {
    const b = beatFromWords(s)
    if (beats.at(-1)?.beat === b) continue
    beats.push({ beat: b, intent: `After ${s.at.toFixed(1)} s: ${s.what}` })
  }
  const kept = beats.length > 9 ? [...beats.slice(0, 8), beats.at(-1)!] : beats
  if (kept.at(-1)?.beat !== "end") kept.push({ beat: "end", intent: "The name." })
  const top = reading.cuts.find((c) => c.cut !== "cut")?.cut
  const theirs = SIGNATURES.find((s) => s.carrier === top) ?? SIGNATURES.find((s) => s.id === "glide")!
  const pace = reading.mean ? Math.min(1.4, Math.max(0.7, reading.mean / 3.2)) * (taste?.prefer.pace ?? 1) : taste?.prefer.pace
  const category = ref.category ?? "product-launch"
  const harmony = pick(r, LOOKS[category] ?? ["tonal"])
  const base = { category, harmony, from: "study" as const, ref: ref.title, pace }
  const other = pick(r, SIGNATURES.filter((s) => s.id !== theirs.id))
  const spine = pick(r, SPINES.filter((s) => s.category === category).length ? SPINES.filter((s) => s.category === category) : SPINES)
  return [
    { ...base, id: `idea-study-${ref.id.slice(0, 6)}-a-${seed}`, title: `After “${ref.title.slice(0, 40)}”`, logline: `Its structure, shot for shot as the engine's beats, at its pace (${reading.mean.toFixed(1)} s a shot); ${theirs.text}.`, hook: ref.hook || kept[0].intent, signature: theirs.text, carrier: theirs.carrier, beats: kept, why: [`Its structure: ${kept.length} beats.`, ref.pacing ? `Its pacing: ${ref.pacing}` : `About ${reading.perMinute} shots a minute.`, `Its cuts lean on ${top ?? "hard cuts"}.`], seed: seed * 101 },
    { ...base, id: `idea-study-${ref.id.slice(0, 6)}-b-${seed}`, title: `“${ref.title.slice(0, 32)}”, ${other.short}`, logline: `The same structure, carried another way: ${other.text}.`, hook: ref.hook || kept[0].intent, signature: other.text, carrier: other.carrier, beats: kept, why: [`Its structure, with a signature it doesn't have: ${other.text}.`], seed: seed * 103 },
    { ...base, id: `idea-study-${ref.id.slice(0, 6)}-c-${seed}`, title: `Its hook, ${spine.name.toLowerCase()}`, logline: `Opens the way it does (${kept[0].intent.replace(/^After [\d.]+ s: /, "").toLowerCase()}), then ${spine.text}; ${theirs.text}.`, hook: ref.hook || kept[0].intent, signature: theirs.text, carrier: theirs.carrier, beats: [kept[0], ...spine.beats.map(([beat, intent]) => ({ beat, intent }))], why: [`Its hook on the engine's “${spine.name}” spine.`], seed: seed * 107 },
  ]
}

/* ---------------- the generators, checked ---------------- */

export type GeneratorRow = { shape: string; name: string; score: number; flow: number; craft: number; novelty: number; films: number; worst: TemplateScript }
/** Every shape the inventor writes in, `seeds` films each, read by the critic: the weakest first, with its weakest film
    (the one to improve). */
export function generatorHealth(ctx: { gallery?: TemplateScript[]; refs?: Reference[]; taste?: Taste }, seeds = 4, from = 0): GeneratorRow[] {
  const rows: GeneratorRow[] = []
  for (let i = 0; i < SHAPE_COUNT; i++) {
    const films = Array.from({ length: seeds }, (_, k) => invent(from + i + k * SHAPE_COUNT))
    const read = films.map((f) => ({ f, a: analyze(f, ctx) }))
    const avg = (id: Score["id"]) => Math.round(read.reduce((a, x) => a + x.a.parts.find((p) => p.id === id)!.score, 0) / read.length)
    const worst = [...read].sort((a, b) => a.a.score - b.a.score)[0]
    rows.push({ shape: /^invented-([a-z]+)-/.exec(films[0].id)?.[1] ?? String(i), name: films[0].name, score: Math.round(read.reduce((a, x) => a + x.a.score, 0) / read.length), flow: avg("flow"), craft: avg("craft"), novelty: avg("novelty"), films: films.length, worst: worst.f })
  }
  return rows.sort((a, b) => a.score - b.score)
}
