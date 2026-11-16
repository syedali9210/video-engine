// The template lab, on the dev server. Every night (at the hour set, midnight by default, or on the next start if the
// machine was off) it first studies real launch films (Gemini searches the web for them on YouTube, each address is
// checked with YouTube itself, and it watches them and writes them down shot by shot: cut points, angles, how the
// device turns), then asks Gemini to improve the template scripts by the guidelines, measured against those films,
// to propose new ones, and to propose background effects for the canvas by their own rulebook.
// Every proposal is checked (it must compile and pass the guidelines a machine can check) and waits for the admin:
// approved, it joins the templates (or the effects); rejected, its reason is read by the next night's run. Without a
// key, the lab still improves scripts by the rules alone. Everything it keeps is in .engine-data/lab (git ignores it).
//   GET  /__lab/state · /__lab/proposals · /__lab/scripts · /__lab/effects · /__lab/references · /__lab/runs · /__lab/guidelines · /__lab/models
//   POST /__lab/settings · /__lab/run · /__lab/test · /__lab/seen · /__lab/improve · /__lab/scenes (the Studio's scene ideas)
//   POST /__lab/watch { url } · /__lab/research { about?, count? } (launch films studied) · /__lab/effect { base?, note? }
//   GET  /__lab/kit (the pieces the references left: titles, backgrounds, shots) · /__lab/ref-file/:id[/poster|/contact]
//   POST /__lab/upload?area&category&name&w&h (a video or picture, the raw file) · /__lab/compose { area, category, note? }
//   POST /__lab/references/:id/study · /poster { data } · /category { category } · /measure · /remove
//   POST /__lab/proposals/:id/approve · /__lab/proposals/:id/reject
//   GET  /__lab/taste (what the decisions and signals taught) · /__lab/ideas (the ideas kept)
//   POST /__lab/signal { kind: export|pick|skip|like|dislike|accept|rework, script, note?, why?, praise?, improve? }
//   GET  /__lab/directions · POST /__lab/directions { direction } · /__lab/directions/:id/remove (your art directions)
//   POST /__lab/ideas { count, category?, note?, ref? } (Gemini's) · /__lab/ideas/keep { idea } · /__lab/ideas/:id/remove
//   POST /__lab/propose { script, rationale, changes } (a film made in the app: an idea developed, a generator's film)
//   POST /__lab/replicate { url? | ref?, category?, again? } · /__lab/replicate/find { about? } (films worth replicating)
import { randomUUID } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { aiKey, brokeOff, chat, gemini, keyHint, listModels, loadEnv, outputLimit, parseJSON, parseList, saveKey, uploadFile, youtube, type GPart } from "./ai"
import { contextFor, filmRef, filmSchema, filmSystem, pictureRef, pictureSchema, pictureSystem, stub } from "./refs"
import { ideasSchema, ideasSystem, preciseSchema, preciseSystem, type Vocab } from "./prompts"
import { fromEngine, sceneCuts, sendFile } from "./studio"
import { readFilm } from "./reference"
import { AREAS, CATEGORIES, type Area, type Reference } from "../src/refs.ts"

type Script = { id: string; name: string; version: number; shots: unknown[]; [k: string]: unknown }
type Finding = { level: "error" | "warn" | "info"; rule: string; shot?: number; text: string }
type Change = { what: string; why: string; rule?: string }
type EffectPreset = { id: string; name: string; version: number; summary: string; why: string[]; effect: Record<string, unknown> }
type Proposal = {
  id: string
  created: string
  /** improve a film template, a new one, or an effect for the canvas (new or improved: `base` says which) */
  kind: "improve" | "new" | "effect"
  base?: string
  /** for an effect, a stand-in carrying its id, name and version */
  script: Script
  effect?: EffectPreset
  changes: Change[]
  rationale: string
  /** why the checker refused it before the admin saw it (the next run reads this too) */
  checker?: string
  /** a replica's closeness to its reference (studio/replica.ts Fidelity) */
  fidelity?: { score: number; parts: unknown[]; rows: unknown[] }
  lint: Finding[]
  /** superseded: another version of the same script was approved while it waited */
  status: "pending" | "approved" | "rejected" | "superseded"
  reason?: string
  decided?: string
  by: string
  run?: string
}
/** `note`: what went partly wrong in a run that still made something (a reply cut off after some proposals) */
type Run = { id: string; started: string; finished?: string; trigger: "nightly" | "manual" | "studio"; model: string; ok?: boolean; error?: string; note?: string; proposals: number; tokens?: { in?: number; out?: number } }
type Settings = {
  model: string
  enabled: boolean
  hour: number
  perNight: number
  /** each night, search for launch films and watch some before proposing */
  research: boolean
  /** films watched a night */
  watch: number
  /** canvas effects proposed a night */
  effects: number
  lastRun?: string
  lastSeen?: string
}

// Gemini's most capable stable Flash model; gemini-3.5-flash-lite is the cheaper one
const DEFAULTS: Settings = { model: "gemini-3.8-flash", enabled: true, hour: 0, perNight: 2, research: true, watch: 2, effects: 1 }

type ScriptModule = {
  validateScript: (raw: unknown) => { script?: Script; errors: string[] }
  lintScript: (s: Script) => Finding[]
  autofix: (s: Script) => { script: Script; changes: Change[] }
  compileScript: (s: Script, ctx: unknown) => unknown
}
type EffectModule = {
  EFFECT_SEEDS: EffectPreset[]
  validatePreset: (raw: unknown) => { preset?: EffectPreset; errors: string[] }
  lintEffect: (e: EffectPreset["effect"]) => Finding[]
}
type TasteModule = { learn: (d: unknown[], signals?: unknown[]) => unknown; tasteLints: (s: Script, t: unknown) => Finding[]; tasteBrief: (t: unknown) => string; features: (s: Script) => string[] }
type Signal = { kind: "export" | "pick" | "skip" | "like" | "dislike" | "accept" | "rework"; at: string; features: string[]; note?: string; why?: string; praise?: string[]; improve?: string[] }
/** A film the lab made for the admin to screen: kept (with why) into the gallery, or passed on (with why). */
type Screened = { id: string; created: string; script: Script; status: "waiting" | "kept" | "passed"; decided?: string; praise?: string[]; improve?: string[]; why?: string }
type InventModule = { invent: (seed: number) => unknown; beatOf: (id: string) => unknown; BEAT_NAMES: string[] }
type ReplicaModule = {
  preciseShots: (raw: unknown, n: number) => Record<string, unknown>[]
  replicaScript: (ref: Reference, measured: unknown[], o?: { category?: string }) => Script
  fidelity: (ref: Reference, s: Script) => { score: number; parts: { id: string; label: string; score: number; note: string }[]; rows: unknown[] }
  skeleton: (duration: number, cuts: number[]) => Reference["shots"]
  snapCuts: (shots: Reference["shots"], cuts: number[], duration?: number) => Reference["shots"]
}
/** An idea for a film (studio/ideas.ts), as kept */
type Idea = { id: string; title: string; beats: { beat: string; intent: string }[]; [k: string]: unknown }
/** what a nightly or asked-for run works on: one script (improve it), or a kind of film to write a new template of */
type Focus = { script: Script; note?: string } | { category: string; note?: string }

export function lab(): Plugin {
  let server: ViteDevServer
  let dir = ""
  let running = false
  // a film being found or watched on the admin's request
  let studying = false
  const file = (f: string) => join(dir, f)
  const read = <T>(f: string, d: T): T => {
    try {
      return existsSync(file(f)) ? (JSON.parse(readFileSync(file(f), "utf8")) as T) : d
    } catch {
      return d
    }
  }
  const write = (f: string, v: unknown) => writeFileSync(file(f), JSON.stringify(v, null, 2))
  const settings = (): Settings => {
    const s = { ...DEFAULTS, ...read<Partial<Settings>>("settings.json", {}) }
    // a model saved for another provider: Gemini's default instead
    return /^(gemini|gemma)/.test(s.model) ? s : { ...s, model: DEFAULTS.model }
  }
  const proposals = () => read<Proposal[]>("proposals.json", [])
  const approved = () => read<Record<string, Script>>("approved.json", {})
  const runs = () => read<Run[]>("runs.json", [])
  const mod = () => server.ssrLoadModule("/src/studio/script.ts") as Promise<ScriptModule>
  const fxMod = () => server.ssrLoadModule("/src/canvas/effects.ts") as Promise<EffectModule>
  // films the engine invents by itself (studio/invent.ts): tonight's new templates start from them
  const inventMod = () => server.ssrLoadModule("/src/studio/invent.ts") as Promise<InventModule>
  const tasteMod = () => server.ssrLoadModule("/src/studio/taste.ts") as Promise<TasteModule>
  const replicaMod = () => server.ssrLoadModule("/src/studio/replica.ts") as Promise<ReplicaModule>
  /** the engine's angles, moves, transitions and looks, for the schemas Gemini answers in */
  const vocab = async (): Promise<Vocab> => {
    const [P, C, T] = await Promise.all([server.ssrLoadModule("/src/studio/poses.ts"), server.ssrLoadModule("/src/studio/cuts.ts"), server.ssrLoadModule("/src/theme.ts")])
    return { angles: P.ANGLES, moves: P.MOTIONS, transitions: C.TRANSITION_IDS, harmonies: (T.HARMONIES as { id: string }[]).map((h) => h.id) }
  }
  /** What the admin decided, with the films they decided on: what the taste is learned from (the checker's refusals
      aren't the admin's). */
  const decisions = () =>
    proposals()
      .filter((p) => p.kind !== "effect" && !p.checker && (p.status === "approved" || p.status === "rejected") && Array.isArray(p.script.shots) && p.script.shots.length)
      .map((p) => ({ script: p.script, status: p.status, reason: p.reason, decided: p.decided }))
  // what was done with films outside the inbox: exported, picked from the Artist's takes, passed over, thumbed
  const signals = () => read<Signal[]>("signals.json", [])
  // the New films: what the lab made for screening, newest first
  const screening = () => read<Screened[]>("screening.json", [])
  const taste = async () => (await tasteMod()).learn(decisions(), signals())
  const ideas = () => read<Idea[]>("ideas.json", [])
  // your own art directions (artist.ts), made in the Artist or from your pictures
  const directions = () => read<Record<string, unknown>[]>("directions.json", [])
  const artistMod = () => server.ssrLoadModule("/src/studio/artist.ts") as Promise<{ validDirection: (raw: unknown) => ({ id: string } & Record<string, unknown>) | null }>
  // a film studied before references had areas is a film
  const references = () => read<Reference[]>("references.json", []).map((r) => (r.area ? r : { ...r, area: "film" as Area }))
  const approvedEffects = () => read<Record<string, EffectPreset>>("effects.json", {})
  const effectsGuide = () => readFileSync(join(server.config.root, "src/canvas/effects.md"), "utf8")
  /** The canvas effects as they stand: the seeds, with the approved versions over them. */
  const effects = async () => {
    const byId = new Map((await fxMod()).EFFECT_SEEDS.map((p) => [p.id, p]))
    for (const p of Object.values(approvedEffects())) if (!byId.has(p.id) || byId.get(p.id)!.version <= p.version) byId.set(p.id, p)
    return [...byId.values()]
  }

  /** The seeds in the repo (none since round 26: the templates are launch films), the app's launch films as scripts
      (sent by the app: films.json beside the rest, see POST /__lab/catalog), with the approved versions over them. */
  const scripts = (): Script[] => {
    const seedDir = join(server.config.root, "src/studio/lab/scripts")
    const byId = new Map<string, Script>()
    for (const s of read<Script[]>("catalog.json", [])) byId.set(s.id, s)
    for (const f of existsSync(seedDir) ? readdirSync(seedDir).filter((x) => x.endsWith(".json")) : []) {
      const s = JSON.parse(readFileSync(join(seedDir, f), "utf8")) as Script
      byId.set(s.id, s)
    }
    for (const s of Object.values(approved())) if (!byId.has(s.id) || byId.get(s.id)!.version <= s.version) byId.set(s.id, s)
    return [...byId.values()]
  }
  const guidelines = () => readFileSync(join(server.config.root, "src/studio/lab/guidelines.md"), "utf8")
  /** The guidelines' first section: the script's vocabulary, which a watched film is written down in. */
  const vocabulary = () => {
    const g = guidelines()
    const a = g.indexOf("## 1.")
    const b = g.indexOf("## 2.")
    return a >= 0 && b > a ? g.slice(a, b) : g.slice(0, 4000)
  }

  /* ---- research: launch films found on the web, watched, written down ---- */

  /** Films worth studying: Gemini searches the web (grounded in Google Search) for launch films on YouTube. Every
      address it gives is checked with YouTube itself; ones already watched are skipped. */
  const findFilms = async (n: number, model: string, about = "") => {
    const seen = new Set(references().map((r) => r.video))
    const skip = references()
      .slice(0, 30)
      .map((r) => `- ${r.title} (${r.channel})`)
      .join("\n")
    const ask = `${n + 3} product launch films on YouTube for software or apps: films that show an app's real interface on a device (an iPhone, a Mac, an iPad), made with real craft. For example Apple's own product films, Linear, Raylight, Arc, Framer, Notion, Figma, Nothing; recent ones first.${about ? ` Above all: ${about}.` : ""} Prefer films with macro shots of the screen, camera moves, depth of field and hard cuts, 20 seconds to 3 minutes long. Not reviews, tutorials, unboxings or reactions.\n\nAlready studied (skip these):\n${skip || "- none yet"}\n\nReply with one line per film: its YouTube address (https://www.youtube.com/watch?v=…), then " | " and its exact title, then " | " and what makes it worth studying, in a few words.`
    const films: { url: string; id: string; title: string; channel: string }[] = []
    // what happened to each address it named: for the admin, when nothing comes of it
    const checked = { named: 0, real: 0, matched: 0, seen: 0 }
    let reply
    let grounded = true
    try {
      reply = await gemini({ model, search: true, maxTokens: 3000, parts: [{ text: `Search the web for ${ask}` }] })
    } catch (e) {
      // web search isn't in the key's quota (or the model won't take it): the lab's own list of films first (when
      // nothing in particular was asked for), then the model's memory, every address checked with YouTube and its
      // real title matched against the one claimed
      if (![400, 403, 429].includes((e as { status?: number }).status ?? 0)) throw e
      grounded = false
      if (!about) {
        const listed = JSON.parse(readFileSync(join(server.config.root, "src/studio/lab/films.json"), "utf8")) as { url: string }[]
        for (const f of listed) {
          if (films.length >= n) break
          const v = await youtube(f.url)
          if (v && !seen.has(v.id)) films.push(v)
        }
        if (films.length >= n) return { films, usage: {}, queries: [], grounded, checked }
      }
      reply = await gemini({ model, maxTokens: 3000, parts: [{ text: `From what you know (you can't search the web right now), name ${ask} Only films you're sure of, with their exact titles.` }] })
    }
    const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3))
    for (const line of reply.text.split(/\r?\n/)) {
      if (films.length >= n) break
      const id = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(line)?.[1]
      if (!id || films.some((f) => f.id === id)) continue
      checked.named++
      if (seen.has(id)) {
        checked.seen++
        continue
      }
      const v = await youtube(`https://www.youtube.com/watch?v=${id}`)
      if (!v) continue
      checked.real++
      if (!grounded) {
        // an address from memory can point at the wrong video: its real title has to share two words with the claim
        const claimed = words(line.split("|")[1] ?? "")
        const real = words(`${v.title} ${v.channel}`)
        if ([...claimed].filter((w) => real.has(w)).length < 2) {
          console.warn(`[lab] "${(line.split("|")[1] ?? "").trim()}" is really "${v.title}" (${v.channel}): skipped`)
          continue
        }
      }
      checked.matched++
      films.push(v)
    }
    return { films, usage: reply.usage, queries: reply.queries, grounded, checked }
  }

  const refDir = () => join(dir, "refs")
  const saveRef = (ref: Reference) => write("references.json", [ref, ...references().filter((r) => r.id !== ref.id && (!ref.video || r.video !== ref.video))].slice(0, 160))
  /** The shortest seed script, for the shape a teardown writes its rebuild in. */
  const example = () => JSON.stringify([...scripts()].sort((x, y) => JSON.stringify(x).length - JSON.stringify(y).length)[0] ?? {})
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "film"

  /** Tears a film down (a YouTube film, or a video file uploaded to Gemini): its shots, every title's animation, its
      backgrounds, hook and pacing, and the whole film rebuilt as a script. The script is checked like any proposal and
      waits in the inbox as a new template of the film's kind; its shots, titles and backgrounds join the kit. */
  const studyFilm = async (ref: Reference, part: GPart, model: string, propose = true) => {
    const reply = await gemini({
      model,
      system: filmSystem(vocabulary(), example()),
      schema: filmSchema(),
      maxTokens: await outputLimit(model),
      parts: [part, { text: `This is "${ref.title}"${ref.channel ? ` by ${ref.channel}` : ""}. Tear it down.` }],
    })
    let j: Record<string, unknown>
    try {
      j = parseJSON(reply.text) as Record<string, unknown>
    } catch {
      // cut off part way: the shots it wrote in full still count
      const shots = parseList(reply.text, "shots").items
      if (!shots.length) throw new Error(brokeOff(reply, "shot"))
      j = { shots }
    }
    const f = filmRef(j, ref)
    if (!f.shots.length) throw new Error(`Gemini couldn't break "${ref.title}" down.`)
    const next: Reference = { ...ref, ...f, watched: new Date().toISOString() }
    let raw = j.script
    if (typeof raw === "string")
      try {
        raw = parseJSON(raw)
      } catch {
        raw = null
      }
    if (raw && propose) {
      const c = await check(raw)
      if (c.script && !c.errors.length) {
        const script = { ...c.script, id: `ref-${slug(ref.title)}-${ref.id.slice(0, 4)}`, name: c.script.name && c.script.name !== "Untitled" ? c.script.name : ref.title.slice(0, 40), version: 1, category: f.category, source: `torn down from “${ref.title}”${ref.url ? ` (${ref.url})` : ""}` } as Script
        const p: Proposal = { id: randomUUID(), created: new Date().toISOString(), kind: "new", script, changes: [{ what: `Rebuilt from “${ref.title}”, shot by shot`, why: f.summary || "A studied film, in the engine's own parts." }], rationale: `The engine's rebuild of “${ref.title}”, ${f.shots.length} shots measured.${f.hook ? ` Its hook: ${f.hook}` : ""}`, lint: c.lint ?? [], status: "pending", by: `ai:${reply.model}`, run: ref.run }
        write("proposals.json", [p, ...proposals()].slice(0, 300))
        next.made = [{ kind: "script", id: script.id, name: script.name }]
        next.kit = [...f.kit, ...(script.shots as { name?: string }[]).map((s, i) => ({ kind: "shot" as const, id: `${ref.id}:s${i}`, name: String(s.name ?? `Shot ${i + 1}`), category: f.category, ref: ref.id, shot: s as Record<string, unknown> }))]
      } else console.warn(`[lab] the rebuild of "${ref.title}" didn't pass the checker:`, c.errors.join(" "))
    }
    saveRef(next)
    return { ref: next, usage: reply.usage }
  }
  /** A YouTube film found or pasted: its first two minutes, at a low resolution. */
  const watchFilm = (v: { url: string; id: string; title: string; channel: string }, model: string, by: Reference["by"], run?: string, category?: string) =>
    studyFilm(stub({ area: "film", title: v.title, url: v.url, video: v.id, channel: v.channel, by, run, category }), { video: v.url, from: 0, to: 120 }, model)

  /** Tears down a reference that is a file: a video (uploaded to Gemini), or a picture (sent along with the question). */
  const studyFile = async (ref: Reference, model: string) => {
    if (!ref.file) throw new Error("This reference has no file.")
    const data = readFileSync(join(refDir(), ref.id))
    if (ref.file.type.startsWith("video/")) return studyFilm(ref, { file: await uploadFile(data, ref.file.type, ref.file.name), mime: ref.file.type }, model)
    const reply = await gemini({ model, system: pictureSystem(ref.area), schema: pictureSchema(ref.area), maxTokens: await outputLimit(model), parts: [{ inline: data.toString("base64"), mime: ref.file.type }, { text: `This is "${ref.title}". Tear it down.` }] })
    let j: Record<string, unknown>
    try {
      j = parseJSON(reply.text) as Record<string, unknown>
    } catch {
      throw new Error(brokeOff(reply, "layer"))
    }
    const { name, ...p } = pictureRef(j, ref.area, { w: ref.file.w ?? 1440, h: ref.file.h ?? 900 }, ref.category)
    // a file's own name ("9", "IMG_2041") says nothing: the teardown's name for it instead
    const title = name && /^[\w-]{1,24}$/.test(ref.title) && !/[a-z]{4,}/i.test(ref.title) ? name : ref.title
    const next: Reference = { ...ref, ...p, title, watched: new Date().toISOString(), made: ref.area === "effect" ? ref.made : [{ kind: "layout", id: ref.id, name: ref.title }] }
    // an effect: proposed as one, drawn over the picture itself, in the inbox like the lab's own
    if (ref.area === "effect" && p.effect && existsSync(join(refDir(), `${ref.id}.poster`))) {
      const fx = await fxMod()
      const picture = `data:image/webp;base64,${readFileSync(join(refDir(), `${ref.id}.poster`)).toString("base64")}`
      // a gap read in pixels (2) is a share of the cell (2 of a 16 px cell: 0.125)
      const e = p.effect as Record<string, number>
      const gap = typeof e.gap === "number" && e.gap > 1 ? Math.min(0.6, e.gap / Math.max(3, Number(e.size) || 12)) : e.gap
      const v = fx.validatePreset({ id: `ref-${slug(ref.title)}`, name: ref.title.slice(0, 40), version: 1, summary: p.summary, why: p.lessons.slice(0, 4), effect: { ...p.effect, gap, source: "picture", picture } })
      if (v.preset) {
        const prop: Proposal = { id: randomUUID(), created: new Date().toISOString(), kind: "effect", script: { id: v.preset.id, name: v.preset.name, version: 1, shots: [] }, effect: v.preset, changes: [{ what: `Read off “${ref.title}”`, why: p.summary }], rationale: `The effect in your reference, as the engine's settings, drawn over the reference itself.`, lint: fx.lintEffect(v.preset.effect), status: "pending", by: `ai:${reply.model}` }
        write("proposals.json", [prop, ...proposals()].slice(0, 300))
        next.made = [{ kind: "effect", id: v.preset.id, name: v.preset.name }]
      }
    }
    saveRef(next)
    return { ref: next, usage: reply.usage }
  }

  /** When the last nightly run was due: today's hour if it has passed, else yesterday's. */
  const lastDue = (s: Settings, now = new Date()) => {
    const d = new Date(now)
    d.setHours(s.hour, 0, 0, 0)
    if (d > now) d.setDate(d.getDate() - 1)
    return d
  }
  const nextDue = (s: Settings, now = new Date()) => {
    const d = lastDue(s, now)
    d.setDate(d.getDate() + 1)
    return d
  }

  /** Checks a proposed script: it must be a script, compile, and pass the guidelines' errors. */
  const check = async (raw: unknown) => {
    const m = await mod()
    const v = m.validateScript(raw)
    if (!v.script) return { errors: v.errors }
    try {
      m.compileScript(v.script, { device: "iphone", posture: "open", anim: "swiggy-home", copy: { kicker: "Introducing", hook: "Meet what's next.", name: "Product", tagline: "Made to move", features: ["Built in motion"], split: "Built | in motion", proof: "", cta: "Try it", by: "rules" } })
    } catch (e) {
      return { errors: [`It doesn't compile: ${(e as Error).message}`] }
    }
    const T = await tasteMod()
    const lint = [...m.lintScript(v.script), ...T.tasteLints(v.script, T.learn(decisions(), signals()))]
    const errors = lint.filter((f) => f.level === "error").map((f) => f.text)
    return { script: v.script, lint, errors }
  }

  const SCHEMA = {
    name: "proposals",
    schema: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["improve", "new"] },
              base: { type: "string" },
              rationale: { type: "string" },
              changes: { type: "array", items: { type: "object", properties: { what: { type: "string" }, why: { type: "string" }, rule: { type: "string" } }, required: ["what", "why"] } },
              script: { type: "string", description: "the whole script, as JSON" },
            },
            required: ["kind", "rationale", "changes", "script"],
          },
        },
      },
      required: ["proposals"],
    },
  }

  /** What the admin decided before, newest first: the next run reads it. */
  const history = () =>
    proposals()
      .filter((p) => p.kind !== "effect" && (p.status === "approved" || p.status === "rejected"))
      .sort((a, b) => (b.decided ?? "").localeCompare(a.decided ?? ""))
      .slice(0, 20)
      .map((p) => `- ${p.status.toUpperCase()}: ${p.kind === "new" ? "new template" : `improve ${p.base}`} "${p.script.name}". Changes: ${p.changes.map((c) => c.what).join("; ")}.${p.checker ? ` The checker refused it: ${p.checker}` : ""}${p.reason ? ` The admin said: "${p.reason}"` : ""}`)
      .join("\n")

  const SYSTEM = (g: string) =>
    `You are the template lab of an animation engine that makes product launch films (Raylight-style: macro shots of the real interface on a device, depth of field, camera moves, hard cuts, rare small type). Each night you improve its template scripts and sometimes propose a new one. The lab also studies real launch films (the references, broken down shot by shot): measure the templates against them, their finesse and their execution, and bring over what they do and the templates don't: new scenes, cut points, angles, how the device rotates within a shot. Cite the film a change comes from. Follow the guidelines exactly. Never invent product facts: titles use the placeholders. Change the fewest things that make a film clearly better, and justify every change with the rule it follows (its section number). Never re-propose something the admin rejected, in any form. Keep every script valid: the same JSON shape as the scripts you're given.\n\n<guidelines>\n${g}\n</guidelines>`

  /* ---- canvas effects: proposed the way templates are ---- */

  const EFFECT_SYSTEM = (g: string) =>
    `You design the background effects of an animation engine's canvas: animated raster artwork drawn on the GPU (dithers, halftones, characters, cross-stitches, scanlines, glowing blocks) behind interactive product pages. Propose effects by the guidelines below: every setting in its range, a ground and one to three inks, legible under type, calm in motion. Each proposal says what kind of page and type the effect suits and why it works, citing the rule (its section number). Never re-propose something the admin rejected, in any form.\n\n<guidelines>\n${g}\n</guidelines>`
  const EFFECTS_SCHEMA = {
    name: "effects",
    schema: {
      type: "object",
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              base: { type: "string", description: "the id of the effect improved, or '' for a new one" },
              rationale: { type: "string" },
              changes: { type: "array", items: { type: "object", properties: { what: { type: "string" }, why: { type: "string" }, rule: { type: "string" } }, required: ["what", "why"] } },
              preset: { type: "string", description: "the whole preset as JSON: {id, name, version, summary, why: [...], effect: {...}}" },
            },
            required: ["rationale", "changes", "preset"],
          },
        },
      },
      required: ["proposals"],
    },
  }
  const effectHistory = () =>
    proposals()
      .filter((p) => p.kind === "effect" && (p.status === "approved" || p.status === "rejected"))
      .sort((a, b) => (b.decided ?? "").localeCompare(a.decided ?? ""))
      .slice(0, 20)
      .map((p) => `- ${p.status.toUpperCase()}: ${p.base ? `improve ${p.base}` : "new effect"} "${p.script.name}". ${p.rationale}${p.checker ? ` The checker refused it: ${p.checker}` : ""}${p.reason ? ` The admin said: "${p.reason}"` : ""}`)
      .join("\n")
  /** Effect proposals from the AI, checked (valid, in range, by the effects rulebook) like scripts are. */
  const proposeEffects = async (n: number, model: string, run: string, focus?: { base?: string; note?: string }) => {
    const fx = await fxMod()
    const all = await effects()
    const task = focus?.base
      ? `Improve the effect "${focus.base}"${focus.note ? `; the admin says: "${focus.note}"` : ""}. Return exactly one proposal with base "${focus.base}".`
      : focus
        ? `Propose one new effect${focus.note ? `; the admin asks for: "${focus.note}"` : ""}.`
        : `Tonight: ${n} effect proposal${n > 1 ? "s" : ""}: new effects in a look the gallery doesn't have yet (for example a typewriter grid of letters, a knitted or woven pattern, a newsprint halftone, a CRT phosphor glow, a bitmap dissolve), or an improvement of the weakest one.`
    const waiting = proposals()
      .filter((p) => p.kind === "effect" && p.status === "pending")
      .map((p) => `- ${p.base ? `improve ${p.base}` : "new effect"} "${p.script.name}"`)
      .join("\n")
    const reply = await chat({
      model,
      schema: EFFECTS_SCHEMA,
      maxTokens: await outputLimit(model),
      messages: [
        { role: "system", content: EFFECT_SYSTEM(effectsGuide()) },
        { role: "user", content: `${task}\n\nThe effects now:\n${JSON.stringify(all)}\n\nWhat the admin decided before (newest first):\n${effectHistory() || "- nothing yet"}\n\nStill waiting for the admin (don't propose these again):\n${waiting || "- nothing"}\n\nReturn {"proposals": [...]}: each with base (an effect's id, or ""), rationale (two sentences), changes [{what, why, rule}], and preset: the whole preset as a JSON string.` },
      ],
    })
    const list = parseList(reply.text, "proposals")
    if (!list.items.length) throw new Error(brokeOff(reply, "effect"))
    const cut = !list.whole || reply.finish === "length"
    const made: Proposal[] = []
    const now = () => new Date().toISOString()
    for (const p of list.items as { base?: string | null; rationale?: string; changes?: Change[]; preset?: unknown }[]) {
      let raw = p.preset
      if (typeof raw === "string")
        try {
          raw = parseJSON(raw)
        } catch {
          raw = null
        }
      const v = fx.validatePreset(raw)
      const base = p.base ? all.find((x) => x.id === p.base) : undefined
      if (!v.preset) {
        made.push({ id: randomUUID(), created: now(), kind: "effect", base: base?.id, script: { id: "invalid", name: "Not a valid effect", version: 0, shots: [] }, changes: p.changes ?? [], rationale: p.rationale ?? "", checker: v.errors.join(" "), lint: [], status: "rejected", decided: now(), by: `ai:${reply.model}`, run })
        continue
      }
      const id = base ? base.id : all.some((x) => x.id === v.preset!.id) ? `${v.preset.id}-${run.slice(0, 4)}` : v.preset.id
      const preset = { ...v.preset, id, version: (base?.version ?? 0) + 1 }
      const lint = fx.lintEffect(preset.effect)
      const errors = lint.filter((f) => f.level === "error").map((f) => f.text)
      made.push({
        id: randomUUID(),
        created: now(),
        kind: "effect",
        base: base?.id,
        script: { id, name: preset.name, version: preset.version, shots: [] },
        effect: preset,
        changes: (p.changes ?? []).slice(0, 12),
        rationale: p.rationale ?? "",
        lint,
        ...(errors.length ? { checker: errors.join(" "), status: "rejected" as const, decided: now() } : { status: "pending" as const }),
        by: `ai:${reply.model}`,
        run,
      })
    }
    return { made, usage: reply.usage, cut }
  }

  // the Studio's scene ideas: new shots for a film, after the shot the editor picked (guidelines §12)
  const SCENE_SYSTEM = (g: string) =>
    `You extend product launch films for an animation engine (Raylight-style: macro shots of the real interface on a device, depth of field, camera moves, hard cuts, rare small type). You're given a film as a script and the shot to continue from. Propose new shots that belong to this film: read the shot before and the shots around it (their framings, ground, effects, pace and easing), keep the film's ground, look and device, and change one thing per shot. Follow the guidelines exactly, section 12 above all, and give each shot its "why" and the rule it follows (its section number). Titles use the placeholders: never invent product facts. Each shot is one object in the scripts' shot shape.\n\n<guidelines>\n${g}\n</guidelines>`
  const SCENES = {
    name: "scenes",
    schema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: { type: "object", properties: { rule: { type: "string" }, shot: { type: "string", description: "one shot, as JSON, in the scripts' shot shape" } }, required: ["rule", "shot"] },
        },
      },
      required: ["ideas"],
    },
  }

  /** One run: the AI's proposals, checked and stored. */
  const runAI = async (trigger: Run["trigger"], focus?: Focus) => {
    const s = settings()
    const run: Run = { id: randomUUID(), started: new Date().toISOString(), trigger, model: s.model, proposals: 0 }
    write("runs.json", [run, ...runs()].slice(0, 60))
    const done = (patch: Partial<Run>) => write("runs.json", runs().map((r) => (r.id === run.id ? { ...r, ...patch, finished: new Date().toISOString() } : r)))
    const used = { in: 0, out: 0 }
    try {
      const m = await mod()
      // tonight's research first: launch films found on the web and watched, so the proposals are measured against them
      const count = (u?: { in?: number; out?: number; prompt_tokens?: number; completion_tokens?: number }) => {
        used.in += u?.in ?? u?.prompt_tokens ?? 0
        used.out += u?.out ?? u?.completion_tokens ?? 0
      }
      // what went partly wrong, said on the run (it still makes what it can)
      const notes: string[] = []
      if (!focus && s.research && s.watch > 0) {
        try {
          const found = await findFilms(s.watch, s.model)
          count(found.usage)
          let watched = 0
          for (const v of found.films)
            try {
              count((await watchFilm(v, s.model, "search", run.id)).usage)
              watched++
            } catch (e) {
              console.warn("[lab] couldn't watch", v.url, (e as Error).message)
              if (!watched) notes.push(`Couldn't watch “${v.title}”: ${(e as Error).message}`)
            }
          if (!found.films.length) notes.push("No new launch films found to study tonight: paste one in Studied, or add to src/studio/lab/films.json.")
        } catch (e) {
          console.warn("[lab] research failed:", (e as Error).message)
          notes.push(`Didn't study films tonight: ${(e as Error).message}`)
        }
      }
      const all = scripts()
      const lints = all.map((x) => ({ id: x.id, name: x.name, version: x.version, findings: m.lintScript(x) }))
      let task: string
      const kind = focus && "category" in focus ? CATEGORIES.film.find((c) => c.id === focus.category) : undefined
      if (focus && "category" in focus) {
        // the compile step: a new template of one kind, written from everything studied of that kind
        task = `Write one new template of the kind "${kind?.name ?? focus.category}" (${kind?.hint ?? ""})${focus.note ? `; the admin asks for: "${focus.note}"` : ""}. Build it from what the references of this kind teach (below, that kind first): their structure, hook, pacing, shots, camera, backgrounds and title animations (titles may use "enter": "custom" with an "animation" measured from a reference). Take the strongest shape among them and make it the engine's own; cite the references you take from. Give the script "category": "${focus.category}". Return exactly one proposal of kind "new".\n\nThe scripts now (don't rearrange their shots into a new order: that's not a new film):\n${JSON.stringify(scripts().filter((x) => (x as { category?: string }).category === focus.category).slice(0, 3))}`
      } else if (focus) {
        task = `Improve this one script (the admin is working on it in the Studio${focus.note ? `, and says: "${focus.note}"` : ""}). Return exactly one proposal of kind "improve" with base "${focus.script.id}".\n\nThe script:\n${JSON.stringify(focus.script)}\n\nThe checker says:\n${JSON.stringify(m.lintScript(focus.script))}`
      } else {
        // improve the script the checker likes least; the rest of tonight's budget is new ideas
        const worst = [...lints].sort((a, b) => b.findings.filter((f) => f.level !== "info").length - a.findings.filter((f) => f.level !== "info").length)[0]
        const n = Math.max(1, Math.min(4, s.perNight))
        // the new ones start from films the engine invented tonight (a new seed each night), not from the old scripts
        const night = Math.floor(Date.now() / 86400000)
        const { invent } = await inventMod()
        const fresh = Array.from({ length: n - 1 }, (_, i) => invent(night * 7 + i))
        task = `Tonight: ${n} proposal${n > 1 ? "s" : ""}. First, improve "${worst?.name}" (id ${worst?.id}), the script the checker flags most.${n > 1 ? ` Then ${n - 1} new template${n > 2 ? "s" : ""}, each starting from one of the films the engine invented tonight (below): keep its shape, then make it yours with what the studied films do (new scenes, cut points, angles, how the device turns within a shot) and invent where they don't reach. Use the whole vocabulary (guidelines §14): every angle and move, and a look (a harmony matched to the product's colour, with a contrasting shot or two). Don't rearrange the old scripts' shots into a new order: that's not a new film.` : ""}\n\nThe scripts now:\n${JSON.stringify(all)}\n\nThe checker says:\n${JSON.stringify(lints)}${fresh.length ? `\n\nInvented tonight:\n${JSON.stringify(fresh)}` : ""}`
      }
      const past = history()
      const learned = (await tasteMod()).tasteBrief(await taste())
      const waiting = proposals()
        .filter((p) => p.kind !== "effect" && p.status === "pending")
        .map((p) => `- ${p.kind === "new" ? "new template" : `improve ${p.base}`} "${p.script.name}": ${p.changes.map((c) => c.what).join("; ")}`)
        .join("\n")
      const reply = await chat({
        model: s.model,
        schema: SCHEMA,
        // the model's own ceiling: it thinks before it writes, and a whole script per proposal is long
        maxTokens: await outputLimit(s.model),
        messages: [
          { role: "system", content: SYSTEM(guidelines()) },
          { role: "user", content: `${task}\n\nThe films the lab has studied${kind ? ` (${kind.name} first)` : ""}: measure the scripts against them and bring over their craft (new scenes, cut points, angles, how the device rotates within a shot, how the titles move), citing the film:\n${contextFor(references(), "film", kind?.id) || "- none yet"}\n\nWhat the admin decided before (newest first):\n${past || "- nothing yet"}\n\nWhat their decisions taught (their taste, learned from every approval and rejection; follow it):\n${learned}\n\nStill waiting for the admin (don't propose these again):\n${waiting || "- nothing"}\n\nReturn {"proposals": [...]}: each with kind, base (the script id, or "" for a new one), rationale (two sentences), changes [{what, why, rule}], and script: the whole script as a JSON string.` },
        ],
      })
      count(reply.usage)
      // the proposals it wrote; if it was cut off (or broke off), the ones it finished
      const list = parseList(reply.text, "proposals")
      if (!list.items.length) throw new Error(brokeOff(reply, "proposal"))
      if (!list.whole || reply.finish === "length") notes.push(`Gemini's reply was cut off; the ${list.items.length === 1 ? "proposal" : `${list.items.length} proposals`} it finished ${list.items.length === 1 ? "is" : "are"} kept.`)
      const made: Proposal[] = []
      for (const p of list.items as { kind?: string; base?: string | null; rationale?: string; changes?: Change[]; script?: unknown }[]) {
        // the script comes as a JSON string (or, from a model that ignored the schema, as an object)
        let raw = p.script
        if (typeof raw === "string")
          try {
            raw = parseJSON(raw)
          } catch {
            raw = null
          }
        const c = await check(raw)
        if (!c.script || c.errors.length) {
          made.push({ id: randomUUID(), created: new Date().toISOString(), kind: p.kind === "new" ? "new" : "improve", base: p.base || undefined, script: (c.script ?? { id: "invalid", name: "Didn't compile", version: 0, shots: [] }) as Script, changes: p.changes ?? [], rationale: p.rationale ?? "", checker: c.errors.join(" "), lint: [], status: "rejected", decided: new Date().toISOString(), by: `ai:${reply.model}`, run: run.id })
          continue
        }
        const base = p.base ? all.find((x) => x.id === p.base) : undefined
        const script = { ...c.script, id: p.kind === "new" && all.some((x) => x.id === c.script!.id) ? `${c.script.id}-${run.id.slice(0, 4)}` : (base?.id ?? c.script.id), version: (base?.version ?? 0) + 1 }
        made.push({ id: randomUUID(), created: new Date().toISOString(), kind: p.kind === "new" ? "new" : "improve", base: base?.id, script, changes: (p.changes ?? []).slice(0, 12), rationale: p.rationale ?? "", lint: c.lint ?? [], status: "pending", by: `ai:${reply.model}`, run: run.id })
      }
      // and the canvas's effects, the same way
      if (!focus && s.effects > 0)
        try {
          const fx = await proposeEffects(s.effects, s.model, run.id)
          made.push(...fx.made)
          count(fx.usage)
          if (fx.cut) notes.push("The effects reply was cut off; the effects it finished are kept.")
        } catch (e) {
          console.warn("[lab] effect proposals failed:", (e as Error).message)
          notes.push(`No effects tonight: ${(e as Error).message}`)
        }
      write("proposals.json", [...made, ...proposals()].slice(0, 300))
      done({ ok: true, proposals: made.filter((p) => p.status === "pending").length, tokens: used, ...(notes.length ? { note: notes.join(" ") } : {}) })
      return made
    } catch (e) {
      done({ ok: false, error: (e as Error).message, ...(used.in ? { tokens: used } : {}) })
      // a day's allowance used up: remember until when, so the night doesn't spend itself on it
      const resetAt = (e as { resetAt?: number }).resetAt
      if (resetAt) usedUp(s.model, resetAt)
      throw e
    }
  }

  /** Without a key: the guidelines a machine can apply, as a proposal like any other. */
  const runRules = async (script: Script) => {
    const m = await mod()
    const { script: fixed, changes } = m.autofix(script)
    const p: Proposal = { id: randomUUID(), created: new Date().toISOString(), kind: "improve", base: script.id, script: fixed, changes, rationale: changes.length ? "The guidelines applied by rule, without AI." : "Nothing to fix by rule: it already follows the guidelines a machine can check.", lint: m.lintScript(fixed), status: "pending", by: "rules" }
    if (changes.length) write("proposals.json", [p, ...proposals()].slice(0, 300))
    return p
  }

  /** The model's day used up, and when it's back (while it lasts, for this model only). */
  /** A model's day of requests used up, and when it's back (each model has its own allowance). */
  const outOf = (model: string) => {
    const s = read<{ quota?: { model: string; until: string }; quotas?: Record<string, string> }>("settings.json", {})
    const until = s.quotas?.[model] ?? (s.quota?.model === model ? s.quota.until : "")
    return until && new Date(until).getTime() > Date.now() ? { model, until } : null
  }
  const usedUp = (model: string, resetAt: number) => {
    const s = read<{ quotas?: Record<string, string> }>("settings.json", {})
    const until = new Date(resetAt).toISOString()
    write("settings.json", { ...s, quotas: { ...s.quotas, [model]: until }, ...(model === settings().model ? { quota: { model, until } } : {}) })
  }
  /** A study on the chosen model, or, when its day is used up (or this key can't reach it), on the next one that has
      requests left: a reference the admin is waiting on shouldn't wait for tomorrow. */
  const FALLBACK = ["gemini-3.6-flash", "gemini-3.5-flash-lite"]
  const withModel = async <T>(job: (model: string) => Promise<T>): Promise<T> => {
    const list = [settings().model, ...FALLBACK.filter((m) => m !== settings().model)].filter((m) => !outOf(m))
    let last: unknown = new Error(`Every model's free requests are used up today: they're back ${new Date(Math.min(...[settings().model, ...FALLBACK].map((m) => new Date(outOf(m)?.until ?? Date.now()).getTime()))).toUTCString()}.`)
    for (const m of list) {
      try {
        return await job(m)
      } catch (e) {
        const x = e as { status?: number; resetAt?: number }
        if (x.status === 429 && x.resetAt) usedUp(m, x.resetAt)
        else if (x.status !== 404 && x.status !== 503) throw e
        console.warn(`[lab] ${m} can't take it now (${x.status}); trying the next model`)
        last = e
      }
    }
    throw last
  }
  const nightly = async () => {
    const s = settings()
    if (running || !s.enabled || !aiKey() || outOf(s.model)) return
    if (s.lastRun && new Date(s.lastRun) >= lastDue(s)) return
    running = true
    write("settings.json", { ...read("settings.json", {}), lastRun: new Date().toISOString() })
    try {
      await runAI("nightly")
    } catch (e) {
      console.warn("[lab] nightly run failed:", (e as Error).message)
    } finally {
      running = false
    }
    // the night shift: one take written against a directing brief, the briefs in turn, on the Work API (its daily cap
    // is the budget), checked like any proposal and waiting in the inbox
    try {
      const { nightTake } = await import("./briefs")
      const t = await nightTake(server, Math.floor(Date.now() / 86400000))
      if (t?.script) {
        const c = await check(t.script)
        if (c.script && !c.errors.length) {
          const p: Proposal = { id: randomUUID(), created: new Date().toISOString(), kind: "new", script: { ...c.script, id: `${c.script.id}-${randomUUID().slice(0, 4)}`, version: 1 }, changes: [{ what: `${t.title} (${t.kind}, ${t.place})`, why: `The night shift, within ${t.film}'s brief.` }], rationale: t.why.slice(0, 600), lint: c.lint ?? [], status: "pending", by: `ai:${t.by.split(" · ")[1] ?? "work"}`.replace(/[^\w:.-]/g, "") }
          write("proposals.json", [p, ...proposals()].slice(0, 300))
        }
      }
    } catch (e) {
      console.warn("[lab] the night shift wrote nothing:", (e as Error).message)
    }
  }

  /* ---- replicas: a film rebuilt shot for shot, measured ---- */

  /** A film made into a template with the accuracy of a measurement:
      1. its first watch (the teardown: cut points, what each shot shows), unless it has one;
      2. for a file, its cut points measured by ffmpeg, which win over the ones read off it;
      3. a closer watch: each shot in the engine's exact camera values, titles and transitions (kept on the
         reference, so it's asked once);
      4. the script built from those numbers (studio/replica.ts), checked like any proposal, and scored against the
         reference.
      Without a key, a file still gets its measured cuts as a skeleton to frame by hand. */
  const replicate = async (start: Reference, o: { again?: boolean; category?: string }) => {
    const R = await replicaMod()
    let ref = start
    const notes: string[] = []
    let by = "rules"
    let filePart: GPart | null = null
    const video = ref.file?.type.startsWith("video/")
    const partOf = async (): Promise<GPart | null> => {
      if (ref.video && ref.url) return { video: ref.url, from: 0, to: 120 }
      if (video) return (filePart ??= { file: await uploadFile(readFileSync(join(refDir(), ref.id)), ref.file!.type, ref.file!.name), mime: ref.file!.type })
      return null
    }
    if (aiKey() && (!ref.summary || !ref.shots.length)) {
      const part = await partOf()
      if (part) {
        const done = await withModel(async (m) => ({ ...(await studyFilm(ref, part, m, false)), model: m }))
        ref = done.ref
        by = `ai:${done.model}`
      }
    }
    if (video) {
      try {
        const m = sceneCuts(join(refDir(), ref.id), 0.3)
        if (m) ref = { ...ref, cutsMeasured: true, shots: ref.shots.length ? R.snapCuts(ref.shots, m.cuts, m.duration) : R.skeleton(m.duration, m.cuts) }
        else notes.push("ffmpeg isn't on this machine's PATH, so the cut points are as Gemini read them.")
      } catch (e) {
        notes.push(`ffmpeg couldn't read the file: ${(e as Error).message}`)
      }
    }
    if (!ref.shots.length) throw new Error(aiKey() ? `Gemini couldn't break “${ref.title}” down into shots.` : "Without a Gemini key, only a video file can be replicated (its cuts are measured). Add a key in Settings for a YouTube film.")
    // the closer watch, a few shots per request (asked for a whole film at once, a model answered for two of eleven);
    // shots measured before are kept, so measuring again asks only for what's missing
    if (aiKey() && (o.again || (ref.precise?.length ?? 0) < ref.shots.length)) {
      const part = await partOf()
      if (part) {
        const list = ref.shots.map((x, i) => `${i}. at ${x.at.toFixed(1)} s for ${x.dur.toFixed(1)} s: ${x.what} [${x.from || "?"} → ${x.to || "?"}; comes in: ${x.cut || "?"}${x.type && x.type !== "none" ? `; words: ${x.type}` : ""}]`).join("\n")
        const have = new Map((o.again ? [] : (ref.precise ?? [])).map((p) => [Number(p.i), p]))
        const todo = ref.shots.map((_, i) => i).filter((i) => !have.has(i))
        const CHUNK = 6
        const MOST = 4
        let asked = 0
        const V = await vocab()
        for (let k = 0; k < todo.length && asked < MOST; k += CHUNK) {
          const want = todo.slice(k, k + CHUNK)
          asked++
          try {
            const reply = await withModel(async (model) => ({ ...(await gemini({ model, system: preciseSystem(V), schema: preciseSchema(V), maxTokens: await outputLimit(model), parts: [part, { text: `This is "${ref.title}". Its shot list from the first watch:\n${list}\n\nMeasure shots ${want.join(", ")}, and only those, each with its i.` }] })), model }))
            let j: unknown
            try {
              j = parseJSON(reply.text)
            } catch {
              j = { shots: parseList(reply.text, "shots").items }
            }
            for (const p of R.preciseShots(j, ref.shots.length)) if (want.includes(Number(p.i))) have.set(Number(p.i), p)
            by = `ai:${reply.model}`
          } catch (e) {
            notes.push(`The closer watch stopped (${(e as Error).message}).`)
            break
          }
        }
        const measured = [...have.values()].sort((a, b) => Number(a.i) - Number(b.i))
        if (measured.length) ref = { ...ref, precise: measured }
        const missing = ref.shots.length - measured.length
        if (missing) notes.push(`${missing} of ${ref.shots.length} shots weren't measured closely, so they're framed from the teardown's words.${todo.length > CHUNK * MOST ? ` One replica asks at most ${MOST} times; Measure the rest picks them up.` : " Measure the rest asks for just those."}`)
      }
    }
    const built = R.replicaScript(ref, ref.precise ?? [], { category: o.category })
    const c = await check(built)
    if (!c.script || c.errors.length) throw new Error(`The replica didn't pass the checker: ${c.errors.join(" ")}`)
    const script = { ...c.script, id: built.id, version: 1 } as Script
    const fid = R.fidelity(ref, script)
    const top = [...fid.parts].sort((a, b) => a.score - b.score)[0]
    const p: Proposal = {
      id: randomUUID(),
      created: new Date().toISOString(),
      kind: "new",
      script,
      changes: [{ what: `Replicated from “${ref.title}”, ${ref.shots.length} shots, cut for cut`, why: `${fid.score}% close to it. Furthest off: ${top.label.toLowerCase()} (${top.note.replace(/\.$/, "")}).` }],
      rationale: `“${ref.title}” rebuilt from ${ref.precise?.length ? "a shot-by-shot measurement" : "its teardown"}${ref.cutsMeasured ? ", its cut points measured by ffmpeg" : ""}. Your product's words and screens go where its own were.`,
      lint: c.lint ?? [],
      status: "pending",
      by,
      fidelity: fid,
    }
    // an older replica of the same film, still waiting, is replaced by this one
    write("proposals.json", [p, ...proposals().map((q) => (q.status === "pending" && q.script.id === script.id ? { ...q, status: "superseded" as const, decided: p.created } : q))].slice(0, 300))
    ref = { ...ref, replica: { id: script.id, name: script.name, score: fid.score, made: p.created }, made: [...(ref.made ?? []).filter((m) => m.id !== script.id), { kind: "script", id: script.id, name: script.name }] }
    saveRef(ref)
    return { proposal: p, fidelity: fid, reference: ref, notes }
  }

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code
    res.setHeader("content-type", "application/json")
    res.setHeader("cache-control", "no-store")
    res.end(JSON.stringify(body))
  }
  const body = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const parts: Buffer[] = []
      req.on("data", (c: Buffer) => parts.push(c))
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(parts).toString() || "{}"))
        } catch (e) {
          reject(e)
        }
      })
      req.on("error", reject)
    })
  const state = () => {
    const s = settings()
    const ps = proposals()
    const pending = ps.filter((p) => p.status === "pending")
    return {
      key: !!aiKey(),
      keyHint: keyHint(),
      model: s.model,
      enabled: s.enabled,
      hour: s.hour,
      perNight: s.perNight,
      research: s.research,
      watch: s.watch,
      effects: s.effects,
      studying,
      references: references().length,
      lastRun: s.lastRun,
      nextRun: nextDue(s).toISOString(),
      running,
      pending: pending.length,
      films: screening().filter((f) => f.status === "waiting").length,
      unseen: pending.filter((p) => !s.lastSeen || p.created > s.lastSeen).length,
      lastSeen: s.lastSeen,
      lastResult: runs()[0],
      quota: outOf(s.model),
    }
  }

  return {
    name: "anim-engine-lab",
    configureServer(s) {
      server = s
      dir = join(s.config.root, ".engine-data", "lab")
      mkdirSync(dir, { recursive: true })
      loadEnv(s.config.root)
      // the nightly run: checked now and then, so a machine that was off at midnight runs it when it's next on
      const t1 = setTimeout(() => void nightly(), 20000)
      const t2 = setInterval(() => void nightly(), 5 * 60000)
      s.httpServer?.on("close", () => {
        clearTimeout(t1)
        clearInterval(t2)
      })
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__lab/")) return next()
        const [, , what, id, act] = url.pathname.split("/")
        // the lab is the admin's: not the frames' own sites, not another page
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        void (async () => {
          try {
            if (req.method === "GET") {
              if (what === "state") return json(res, 200, state())
              if (what === "proposals") return json(res, 200, proposals())
              if (what === "scripts") return json(res, 200, Object.values(approved()))
              if (what === "runs") return json(res, 200, runs())
              if (what === "guidelines") return json(res, 200, { text: guidelines(), effects: effectsGuide() })
              if (what === "references") return json(res, 200, references())
              if (what === "kit") return json(res, 200, { items: references().flatMap((r) => r.kit ?? []), refs: Object.fromEntries(references().map((r) => [r.id, r.title])) })
              // a reference's own file (a video or a picture) or its still, for the lab and the canvas's crops
              if (what === "ref-file" && id && /^[\w-]+$/.test(id)) {
                const ref = references().find((r) => r.id === id)
                const f = join(refDir(), act === "poster" ? `${id}.poster` : act === "contact" ? `${id}.contact` : id)
                if (!ref || !existsSync(f)) return json(res, 404, { error: "No such file" })
                res.setHeader("cache-control", "private, max-age=3600")
                // with byte ranges: a video only seeks when they're answered (the onion-skin compare scrubs it)
                return sendFile(req, res, f, act === "poster" ? "image/webp" : act === "contact" ? "image/jpeg" : (ref.file?.type ?? "application/octet-stream"))
              }
              if (what === "effects") return json(res, 200, Object.values(approvedEffects()))
              if (what === "taste") return json(res, 200, await taste())
              if (what === "ideas") return json(res, 200, ideas())
              if (what === "directions") return json(res, 200, directions())
              if (what === "screening") return json(res, 200, screening())
              if (what === "models") return json(res, 200, aiKey() ? await listModels() : [])
              return json(res, 404, { error: "Not found" })
            }
            // a reference that's a file: kept as it came (up to 300 MB), waiting for its teardown
            if (what === "upload") {
              const q = url.searchParams
              const type = String(req.headers["content-type"] ?? "").split(";")[0]
              if (!/^(video\/(mp4|quicktime|webm|x-m4v)|image\/(png|jpeg|webp|gif))$/.test(type)) return json(res, 415, { error: "A video (MP4, MOV, WebM) or a picture (PNG, JPEG, WebP, GIF), please." })
              const area = (AREAS.some((a) => a.id === q.get("area")) ? q.get("area") : type.startsWith("video/") ? "film" : "creative") as Area
              const category = CATEGORIES[area].some((c) => c.id === q.get("category")) ? q.get("category")! : undefined
              const name = (q.get("name") ?? "reference").slice(0, 120)
              const dim = (k: string) => Math.round(Math.min(20000, Math.max(0, Number(q.get(k)) || 0))) || undefined
              const ref = stub({ area, category, title: name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "Reference", file: { name, type, size: 0, w: dim("w"), h: dim("h") } })
              mkdirSync(refDir(), { recursive: true })
              const dest = join(refDir(), ref.id)
              let size = 0
              await new Promise<void>((done, fail) => {
                const out = createWriteStream(dest)
                req.on("data", (c: Buffer) => {
                  size += c.length
                  if (size > 300 * 1024 * 1024) {
                    req.destroy()
                    out.destroy()
                    fail(new Error("That file is over 300 MB: trim it to the part worth studying."))
                  }
                })
                req.pipe(out)
                out.on("finish", done)
                out.on("error", fail)
                req.on("error", fail)
              }).catch((e) => {
                rmSync(dest, { force: true })
                throw e
              })
              let made: Reference = { ...ref, file: { ...ref.file!, size } }
              // a film is read on arrival: its cuts, whether it loops, the bars round it, a contact sheet of its shots
              if (type.startsWith("video/")) {
                try {
                  const read = readFilm(dest)
                  if (read) {
                    if (read.sheet) writeFileSync(join(refDir(), `${ref.id}.contact`), read.sheet)
                    made = { ...made, measured: read.measured, cutsMeasured: true, ...(read.sheet ? { contact: `/__lab/ref-file/${ref.id}/contact` } : {}) }
                  }
                } catch {
                  // a file ffmpeg can't read is kept as it is: the teardown says what's wrong with it
                }
              }
              saveRef(made)
              return json(res, 200, { reference: made })
            }
            const b = await body(req)
            if (what === "references" && id && act === "poster") {
              const m = typeof b.data === "string" ? /^data:image\/webp;base64,(.+)$/.exec(b.data) : null
              const ref = references().find((r) => r.id === id)
              if (!m || !ref) return json(res, 400, { error: "A WebP still, please." })
              mkdirSync(refDir(), { recursive: true })
              writeFileSync(join(refDir(), `${id}.poster`), Buffer.from(m[1], "base64"))
              saveRef({ ...ref, poster: `/__lab/ref-file/${id}/poster` })
              return json(res, 200, { ok: true })
            }
            // a film file read again by ffmpeg (one kept before films were read on arrival)
            if (what === "references" && id && act === "measure") {
              const ref = references().find((r) => r.id === id)
              if (!ref?.file?.type.startsWith("video/") || !/^[\w-]+$/.test(id)) return json(res, 404, { error: "No such film file" })
              const read = readFilm(join(refDir(), id))
              if (!read) return json(res, 400, { error: "Reading a film needs ffmpeg on your PATH (winget install ffmpeg)." })
              if (read.sheet) writeFileSync(join(refDir(), `${id}.contact`), read.sheet)
              const made: Reference = { ...ref, measured: read.measured, cutsMeasured: true, ...(read.sheet ? { contact: `/__lab/ref-file/${id}/contact` } : {}) }
              saveRef(made)
              return json(res, 200, { reference: made })
            }
            if (what === "references" && id && act === "category") {
              const ref = references().find((r) => r.id === id)
              if (!ref) return json(res, 404, { error: "No such reference" })
              const category = CATEGORIES[ref.area].some((c) => c.id === b.category) ? String(b.category) : undefined
              saveRef({ ...ref, category, kit: ref.kit?.map((k) => ({ ...k, category })) })
              return json(res, 200, { references: references() })
            }
            // tear down a reference now: a YouTube film, a video file, a picture
            if (what === "references" && id && act === "study") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings." })
              if (studying) return json(res, 409, { error: "Already studying a reference: give it a minute." })
              const ref = references().find((r) => r.id === id)
              if (!ref) return json(res, 404, { error: "No such reference" })
              studying = true
              try {
                const done = await withModel((model) => (ref.video ? studyFilm(ref, { video: ref.url!, from: 0, to: 120 }, model) : studyFile(ref, model)))
                return json(res, 200, { reference: done.ref, state: state() })
              } finally {
                studying = false
              }
            }
            // the compile step: a new template of one kind, from everything the lab studied of that kind
            if (what === "compose") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings." })
              if (running) return json(res, 409, { error: "A run is already going" })
              const category = CATEGORIES.film.some((c) => c.id === b.category) ? String(b.category) : ""
              if (!category) return json(res, 400, { error: "Which kind of film?" })
              running = true
              try {
                const made = await runAI("studio", { category, note: typeof b.note === "string" ? b.note.trim().slice(0, 400) : undefined })
                const p = made.find((x) => x.status === "pending")
                if (!p) return json(res, 422, { error: made[0]?.checker ? `Gemini's template didn't pass the checker: ${made[0].checker}` : "Gemini didn't write a template this time. Try again." })
                return json(res, 200, { proposal: p })
              } finally {
                running = false
              }
            }
            // your own art directions: kept, replaced (same id) or removed
            if (what === "directions" && id && act === "remove") {
              write("directions.json", directions().filter((d) => d.id !== id))
              return json(res, 200, directions())
            }
            if (what === "directions") {
              const d = (await artistMod()).validDirection(b.direction)
              if (!d) return json(res, 400, { error: "An art direction needs a name." })
              write("directions.json", [d, ...directions().filter((x) => x.id !== d.id)].slice(0, 40))
              return json(res, 200, directions())
            }
            // New films: a batch made in the app joins the screening; each is kept or passed, and either way says why
            if (what === "screening" && !id) {
              const m = await mod()
              const made: Screened[] = []
              for (const raw of Array.isArray(b.films) ? b.films.slice(0, 12) : []) {
                const v = m.validateScript(raw)
                if (v.script) made.push({ id: randomUUID(), created: new Date().toISOString(), script: v.script, status: "waiting" })
              }
              if (!made.length) return json(res, 400, { error: "No films to screen." })
              write("screening.json", [...made, ...screening()].slice(0, 120))
              return json(res, 200, { films: screening(), state: state() })
            }
            if (what === "screening" && id && act === "remove") {
              write("screening.json", screening().filter((f) => f.id !== id))
              return json(res, 200, { films: screening(), state: state() })
            }
            if (what === "screening" && id && (act === "keep" || act === "pass")) {
              const all = screening()
              const f = all.find((x) => x.id === id)
              if (!f) return json(res, 404, { error: "No such film" })
              const tags = (x: unknown) => (Array.isArray(x) ? x.map((t) => String(t).slice(0, 30)).filter(Boolean).slice(0, 12) : [])
              const praise = tags(b.praise)
              const improve = tags(b.improve)
              const why = typeof b.why === "string" ? b.why.trim().slice(0, 800) : ""
              // the point of screening is the reason: no verdict without one
              if (!praise.length && !improve.length && why.length < 3) return json(res, 400, { error: "Say why: tap what works or what doesn't, or write a few words." })
              Object.assign(f, { status: act === "keep" ? "kept" : "passed", decided: new Date().toISOString(), ...(praise.length ? { praise } : {}), ...(improve.length ? { improve } : {}), ...(why ? { why } : {}) })
              write("screening.json", all)
              // it teaches the taste the way a verdict on an exported film does: kept weighs most, passed counts against
              const sig: Signal = { kind: act === "keep" ? "accept" : "rework", at: f.decided!, features: (await tasteMod()).features(f.script), ...(why ? (act === "keep" ? { why } : { note: why }) : {}), ...(praise.length ? { praise } : {}), ...(improve.length ? { improve } : {}) }
              write("signals.json", [sig, ...signals()].slice(0, 600))
              // a kept film joins the gallery, as a template for any product
              if (act === "keep") {
                const gallery = approved()
                const sid = gallery[f.script.id] && gallery[f.script.id] !== f.script ? `${f.script.id}-${f.id.slice(0, 4)}` : f.script.id
                write("approved.json", { ...gallery, [sid]: { ...f.script, id: sid } })
              }
              return json(res, 200, { films: all, state: state() })
            }
            // a signal of taste from outside the inbox: a film exported, an Artist take picked or passed over, a thumb
            if (what === "signal") {
              const kinds = ["export", "pick", "skip", "like", "dislike", "accept", "rework"]
              if (!kinds.includes(String(b.kind))) return json(res, 400, { error: "Which signal?" })
              const v = (await mod()).validateScript(b.script)
              if (!v.script) return json(res, 400, { error: "A film, please." })
              const tags = (x: unknown) => (Array.isArray(x) ? x.map((t) => String(t).slice(0, 30)).filter(Boolean).slice(0, 12) : [])
              const sig: Signal = { kind: b.kind as Signal["kind"], at: new Date().toISOString(), features: (await tasteMod()).features(v.script), ...(typeof b.note === "string" && b.note.trim() ? { note: b.note.trim().slice(0, 600) } : {}), ...(typeof b.why === "string" && b.why.trim() ? { why: b.why.trim().slice(0, 600) } : {}), ...(tags(b.praise).length ? { praise: tags(b.praise) } : {}), ...(tags(b.improve).length ? { improve: tags(b.improve) } : {}) }
              write("signals.json", [sig, ...signals()].slice(0, 600))
              return json(res, 200, { ok: true })
            }
            // the app's launch films as scripts, so the nightly run improves them and its ideas don't repeat them
            if (what === "catalog") {
              const list = (Array.isArray(b.scripts) ? b.scripts : []).slice(0, 60).filter((x): x is Script => !!x && typeof x === "object" && typeof (x as Script).id === "string" && Array.isArray((x as Script).shots))
              const text = JSON.stringify(list)
              if (text.length > 2_000_000) return json(res, 413, { error: "That catalog is too big." })
              if (text !== JSON.stringify(read<Script[]>("catalog.json", []))) write("catalog.json", list)
              return json(res, 200, { films: list.length })
            }
            // a film made in the app (an idea developed, the weakest film of a generator), into the inbox like any other
            if (what === "propose") {
              const c = await check(b.script)
              if (!c.script || c.errors.length) return json(res, 422, { error: `It didn't pass the checker: ${c.errors.join(" ")}` })
              const all = scripts()
              const script = { ...c.script, id: all.some((x) => x.id === c.script!.id) ? `${c.script.id}-${randomUUID().slice(0, 4)}` : c.script.id, version: 1 }
              const changes = (Array.isArray(b.changes) ? b.changes : []).slice(0, 12).flatMap((x) => (x && typeof x === "object" && typeof (x as Change).what === "string" ? [{ what: String((x as Change).what).slice(0, 200), why: String((x as Change).why ?? "").slice(0, 400), ...((x as Change).rule ? { rule: String((x as Change).rule).slice(0, 40) } : {}) }] : []))
              const p: Proposal = { id: randomUUID(), created: new Date().toISOString(), kind: "new", script, changes, rationale: typeof b.rationale === "string" ? b.rationale.slice(0, 600) : "", lint: c.lint ?? [], status: "pending", by: typeof b.by === "string" && /^(rules|ai:[\w.-]+)$/.test(b.by) ? b.by : "rules" }
              write("proposals.json", [p, ...proposals()].slice(0, 300))
              return json(res, 200, { proposal: p })
            }
            // ideas: Gemini's (the rules' are made in the app); kept ones are stored to come back to
            if (what === "ideas" && id === "keep") {
              const idea = b.idea as Idea | undefined
              if (!idea || typeof idea.id !== "string" || typeof idea.title !== "string" || !Array.isArray(idea.beats)) return json(res, 400, { error: "Not an idea." })
              write("ideas.json", [{ ...idea, kept: new Date().toISOString() }, ...ideas().filter((x) => x.id !== idea.id)].slice(0, 100))
              return json(res, 200, ideas())
            }
            if (what === "ideas" && id && act === "remove") {
              write("ideas.json", ideas().filter((x) => x.id !== id))
              return json(res, 200, ideas())
            }
            if (what === "ideas") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings. Ideas by rules work without one." })
              const { beatOf, BEAT_NAMES } = await inventMod()
              const n = Math.min(6, Math.max(1, Math.round(Number(b.count) || 4)))
              const category = CATEGORIES.film.some((c) => c.id === b.category) ? String(b.category) : undefined
              const refs = references()
              const after = typeof b.ref === "string" ? refs.find((r) => r.id === b.ref) : undefined
              const note = typeof b.note === "string" && b.note.trim() ? ` The admin asks for: "${b.note.trim().slice(0, 400)}".` : ""
              const brief = (await tasteMod()).tasteBrief(await taste())
              const V = await vocab()
              const reply = await withModel(async (model) => ({
                ...(await chat({
                  model,
                  schema: { name: "ideas", schema: ideasSchema(BEAT_NAMES, V) },
                  maxTokens: await outputLimit(model),
                  messages: [
                    { role: "system", content: ideasSystem(guidelines()) },
                    { role: "user", content: `${n} ideas for films${category ? ` of the kind "${CATEGORIES.film.find((c) => c.id === category)!.name}"` : ""}${after ? `, each taking something from the studied film "${after.title}" (first below) and making it new` : ""}.${note}\n\nThe films the lab studied:\n${contextFor(after ? [after, ...refs.filter((r) => r !== after)] : refs, "film", category) || "- none yet"}\n\nThe films the engine already has (don't repeat them):\n${scripts().map((x) => `- ${x.name}: ${String(x.summary ?? "")}`).join("\n")}\n\nThe admin's taste, learned from their decisions:\n${brief}\n\nReturn {"ideas": [...]}.` },
                  ],
                })),
                model,
              }))
              const list = parseList(reply.text, "ideas")
              if (!list.items.length) return json(res, 502, { error: brokeOff(reply, "idea") })
              const HARM = V.harmonies
              const out = (list.items as Record<string, unknown>[]).flatMap((x, k) => {
                const beats = (Array.isArray(x.beats) ? x.beats : []).flatMap((y) => {
                  const o = y as { beat?: unknown; intent?: unknown }
                  return typeof o.beat === "string" && beatOf(o.beat) ? [{ beat: o.beat, intent: String(o.intent ?? "").slice(0, 200) }] : []
                })
                if (beats.length < 3) return []
                const cat = CATEGORIES.film.some((c) => c.id === x.category) ? String(x.category) : (category ?? "product-launch")
                return [{ id: `idea-ai-${randomUUID().slice(0, 8)}`, title: String(x.title ?? "An idea").slice(0, 80), logline: String(x.logline ?? "").slice(0, 400), category: cat, hook: String(x.hook ?? "").slice(0, 300), signature: String(x.signature ?? "").slice(0, 300), ...(["cut", "whip", "through", "iris", "wipe"].includes(String(x.carrier)) ? { carrier: String(x.carrier) } : {}), harmony: HARM.includes(String(x.harmony)) ? String(x.harmony) : "tonal", beats, why: (Array.isArray(x.why) ? x.why : []).map((w) => String(w).slice(0, 300)).slice(0, 5), from: "ai", ...(after ? { ref: after.title } : {}), by: reply.model, seed: Math.floor(Math.random() * 1e6) + k }]
              })
              if (!out.length) return json(res, 422, { error: "Gemini's ideas didn't use the engine's beats this time. Ask again." })
              return json(res, 200, { ideas: out })
            }
            // films worth replicating: found on the web (or the lab's own verified list), not watched yet
            if (what === "replicate" && id === "find") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings." })
              const found = await findFilms(6, settings().model, typeof b.about === "string" ? b.about.trim().slice(0, 200) : "")
              return json(res, 200, { films: found.films, grounded: found.grounded })
            }
            if (what === "replicate") {
              if (studying) return json(res, 409, { error: "Already studying a film: give it a minute." })
              let ref: Reference | undefined
              if (typeof b.ref === "string") ref = references().find((r) => r.id === b.ref)
              else if (typeof b.url === "string") {
                const v = await youtube(b.url)
                if (!v) return json(res, 400, { error: "That isn't a public YouTube film (a youtube.com/watch or youtu.be address)." })
                ref = references().find((r) => r.video === v.id) ?? stub({ area: "film", title: v.title, url: v.url, video: v.id, channel: v.channel, by: "admin" })
              }
              if (!ref || ref.area !== "film") return json(res, 404, { error: "Pick a film to replicate." })
              if (ref.video && !aiKey()) return json(res, 400, { error: "No Gemini key yet: a YouTube film has to be watched. Add the key in Settings, or drop the video file in to measure its cuts." })
              studying = true
              try {
                const category = CATEGORIES.film.some((c) => c.id === b.category) ? String(b.category) : undefined
                return json(res, 200, { ...(await replicate(ref, { again: b.again === true, category })), state: state() })
              } finally {
                studying = false
              }
            }
            if (what === "settings") {
              if (typeof b.key === "string") saveKey(b.key.trim())
              const cur = read<Partial<Settings>>("settings.json", {})
              const next: Partial<Settings> = { ...cur }
              if (typeof b.model === "string" && b.model.trim()) {
                // only a model's id ("gemini-3.8-flash"): a key or a label typed here would fail every night
                if (!/^(gemini|gemma)[\w.-]*$/.test(b.model.trim())) return json(res, 400, { error: `“${b.model.trim().slice(0, 40)}” isn't a Gemini model's id (like gemini-3.8-flash).` })
                next.model = b.model.trim()
              }
              if (typeof b.enabled === "boolean") next.enabled = b.enabled
              if (typeof b.hour === "number") next.hour = Math.min(23, Math.max(0, Math.round(b.hour)))
              if (typeof b.perNight === "number") next.perNight = Math.min(4, Math.max(1, Math.round(b.perNight)))
              if (typeof b.research === "boolean") next.research = b.research
              if (typeof b.watch === "number") next.watch = Math.min(3, Math.max(0, Math.round(b.watch)))
              if (typeof b.effects === "number") next.effects = Math.min(2, Math.max(0, Math.round(b.effects)))
              write("settings.json", next)
              return json(res, 200, state())
            }
            // a film the admin wants studied: checked with YouTube, then watched now
            if (what === "watch" || what === "research") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings." })
              if (studying) return json(res, 409, { error: "Already studying a film: give it a minute." })
              studying = true
              try {
                const model = settings().model
                if (what === "watch") {
                  const v = typeof b.url === "string" ? await youtube(b.url) : null
                  if (!v) return json(res, 400, { error: "That isn't a public YouTube film (a youtube.com/watch or youtu.be address)." })
                  const { ref } = await withModel((m) => watchFilm(v, m, "admin", undefined, CATEGORIES.film.some((c) => c.id === b.category) ? String(b.category) : undefined))
                  return json(res, 200, { references: [ref], state: state() })
                }
                // find films on the web and watch them, the way a night does
                const n = Math.min(3, Math.max(1, Math.round(Number(b.count) || settings().watch || 1)))
                const found = await findFilms(n, model, typeof b.about === "string" ? b.about.trim().slice(0, 200) : "")
                const made: Reference[] = []
                for (const v of found.films)
                  try {
                    made.push((await watchFilm(v, model, "search")).ref)
                  } catch (e) {
                    console.warn("[lab] couldn't watch", v.url, (e as Error).message)
                  }
                if (!made.length) {
                  const c = found.checked
                  const how = found.grounded ? "Searching the web" : "Web search is over your key's quota, so from memory"
                  return json(res, 502, {
                    error: found.films.length
                      ? "Gemini found films but couldn't break them down. Try again, or paste one."
                      : `${how}, Gemini named ${c.named} film${c.named === 1 ? "" : "s"}: ${c.real} exist on YouTube${found.grounded ? "" : `, ${c.matched} match the titles it gave`}${c.seen ? `, ${c.seen} already studied` : ""}. Paste a film's address to study it instead.`,
                    checked: c,
                  })
                }
                return json(res, 200, { references: made, state: state() })
              } finally {
                studying = false
              }
            }
            if (what === "references" && id && act === "remove") {
              write("references.json", references().filter((r) => r.id !== id))
              if (/^[\w-]+$/.test(id)) for (const f of [id, `${id}.poster`, `${id}.contact`]) rmSync(join(refDir(), f), { force: true })
              return json(res, 200, { state: state() })
            }
            // an effect to propose now (improve one, or a new one), from the lab's Effects section
            if (what === "effect") {
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in Settings." })
              if (running) return json(res, 409, { error: "A run is already going" })
              running = true
              try {
                const fx = await proposeEffects(1, settings().model, "studio", { base: typeof b.base === "string" && b.base ? b.base : undefined, note: typeof b.note === "string" ? b.note.trim().slice(0, 400) : undefined })
                write("proposals.json", [...fx.made, ...proposals()].slice(0, 300))
                const p = fx.made[0]
                if (!p) return json(res, 502, { error: "Gemini didn't propose an effect this time. Try again." })
                if (p.checker) return json(res, 422, { error: `Gemini's effect didn't pass the checker: ${p.checker}` })
                return json(res, 200, { proposal: p })
              } finally {
                running = false
              }
            }
            if (what === "seen") {
              write("settings.json", { ...read("settings.json", {}), lastSeen: new Date().toISOString() })
              return json(res, 200, state())
            }
            if (what === "run") {
              if (running) return json(res, 409, { error: "A run is already going" })
              if (!aiKey()) return json(res, 400, { error: "No AI key yet: add it in Settings. (Fix by rules works without one.)" })
              running = true
              // a run by hand counts as tonight's: the free tier's credit isn't spent twice
              write("settings.json", { ...read("settings.json", {}), lastRun: new Date().toISOString() })
              let made: Proposal[]
              try {
                made = await runAI("manual")
              } finally {
                running = false
              }
              return json(res, 200, { made: made.filter((p) => p.status === "pending").length, state: state() })
            }
            if (what === "test") {
              const out: { models?: number; has?: boolean; ok?: boolean; reply?: string; error?: string } = {}
              try {
                const list = await listModels()
                out.models = list.length
                out.has = list.includes(settings().model)
              } catch (e) {
                out.error = (e as Error).message
              }
              try {
                const r = await chat({ model: settings().model, maxTokens: 3000, schema: { name: "ping", schema: { type: "object", properties: { ok: { type: "boolean" }, shot: { type: "string" } }, required: ["ok", "shot"] } }, messages: [{ role: "user", content: 'Reply as JSON: {"ok": true, "shot": "<one sentence: a camera move for a phone macro shot>"}' }] })
                const j = parseJSON(r.text) as { ok?: boolean; shot?: string }
                out.ok = j.ok === true
                out.reply = j.shot
              } catch (e) {
                out.ok = false
                out.error = (e as Error).message
              }
              return json(res, 200, out)
            }
            if (what === "improve") {
              const c = await check(b.script)
              if (!c.script) return json(res, 400, { error: c.errors.join(" ") })
              if (b.ai === false || !aiKey()) return json(res, 200, { proposal: await runRules(c.script), by: "rules" })
              if (running) return json(res, 409, { error: "A run is already going" })
              running = true
              try {
                const made = await runAI("studio", { script: c.script, note: typeof b.note === "string" ? b.note : undefined })
                return json(res, 200, { proposal: made[0], by: "ai" })
              } finally {
                running = false
              }
            }
            if (what === "scenes") {
              // new shots after shot `after`, from Gemini: each is checked where it goes, fixed by the rules a machine can
              // apply, and dropped if the checker still flags it
              const c = await check(b.script)
              if (!c.script) return json(res, 400, { error: c.errors.join(" ") })
              if (!aiKey()) return json(res, 400, { error: "No Gemini key yet: add it in the Template lab's Settings. The rules work without one." })
              const film = c.script
              const after = Math.min(film.shots.length - 1, Math.max(0, Math.round(Number(b.after) || 0)))
              const n = Math.min(4, Math.max(1, Math.round(Number(b.count) || 3)))
              const note = typeof b.note === "string" && b.note.trim() ? ` The editor asks: ${b.note.trim().slice(0, 400)}` : ""
              const reply = await chat({
                model: settings().model,
                schema: SCENES,
                maxTokens: await outputLimit(settings().model),
                messages: [
                  { role: "system", content: SCENE_SYSTEM(guidelines()) },
                  { role: "user", content: `The film:\n${JSON.stringify(film)}\n\nPropose ${n} new shot${n > 1 ? "s" : ""}, different from each other, to go after shot ${after + 1} ("${(film.shots[after] as { name?: string }).name}").${note}` },
                ],
              })
              const m = await mod()
              const at = after + 1
              const ideas: { shot: unknown; at: number; rule: string; by: "ai" }[] = []
              const list = parseList(reply.text, "ideas")
              if (!list.items.length) return json(res, 502, { error: brokeOff(reply, "idea") })
              for (const r of (list.items as { rule?: unknown; shot?: unknown }[]).slice(0, n)) {
                let shot: unknown
                try {
                  shot = typeof r.shot === "string" ? parseJSON(r.shot) : r.shot
                } catch {
                  continue
                }
                const shots = [...film.shots]
                shots.splice(at, 0, shot)
                const v = await check({ ...film, shots })
                if (!v.script || v.errors.length) continue
                const fixed = m.autofix(v.script).script
                if (m.lintScript(fixed).some((f) => f.shot === at && f.level !== "info")) continue
                ideas.push({ shot: fixed.shots[at], at, rule: String(r.rule ?? "").slice(0, 40), by: "ai" })
              }
              return json(res, 200, { ideas })
            }
            if (what === "proposals" && id && (act === "approve" || act === "reject")) {
              const all = proposals()
              const p = all.find((x) => x.id === id)
              if (!p) return json(res, 404, { error: "No such proposal" })
              p.status = act === "approve" ? "approved" : "rejected"
              p.decided = new Date().toISOString()
              if (typeof b.reason === "string" && b.reason.trim()) p.reason = b.reason.trim().slice(0, 1000)
              if (act === "approve") {
                // an effect joins the canvas's gallery; a script, the films'
                if (p.kind === "effect" && p.effect) write("effects.json", { ...approvedEffects(), [p.effect.id]: p.effect })
                else write("approved.json", { ...approved(), [p.script.id]: p.script })
                // the other versions of this one that were waiting were made from the old one
                for (const q of all) if (q !== p && q.status === "pending" && (q.kind === "effect") === (p.kind === "effect") && q.script.id === p.script.id) Object.assign(q, { status: "superseded", decided: p.decided })
              }
              write("proposals.json", all)
              return json(res, 200, { proposal: p, state: state() })
            }
            return json(res, 404, { error: "Not found" })
          } catch (e) {
            return json(res, 500, { error: (e as Error).message })
          }
        })()
      })
    },
  }
}
