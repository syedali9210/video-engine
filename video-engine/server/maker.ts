// The film maker: a product's launch film from its kit, by the director's rules (src/studio/maker.ts), with the
// fewest AI calls it can. Once per product, the brief (what it is, for whom, the pain, the old way, the features with
// their benefits, the real proof). Per film, one call that writes every line of the chosen template, told what each line
// means in that template's story (src/studio/contracts.ts); a second only for lines that didn't fit. Everything else is
// code: picking the template, filling the screens, building the composition, the checks. Rendering is the Studio's own,
// asked of the engine in a headless page, so a film renders exactly as it would by hand. Every step is logged with its
// time and tokens.
//   GET  /__film/templates                      the templates with their contracts
//   GET  /__film/brief?kit=                     the kit's brief (written once, then kept)
//   POST /__film/brief { kit, fresh?, brief? }  write it (AI, or the rules without one), or save yours
//   POST /__film/pick { kit, size?, length? }   the templates ranked for it, with reasons
//   POST /__film/make { kit, template?, size?, length?, fresh? } -> the film: its lines, checks, composition, cost
//   GET  /__film/get?id= · /__film/list
//   POST /__film/edit { id, ops? , note? }      edits (or a note in plain words, read into edits); a new version
//   POST /__film/render { id, draft? }          rendered by the Studio -> { job } (GET /__studio/jobs/:job)
//   POST /__film/critic { id }                  stills of the last render read against the brief; fixes applied
//   POST /__film/keep { id, keep }              your verdict: taste for the picker
//   POST /__film/contract { film }              a contract drafted for a template that has none
//   POST /__film/direct { kit, length?, size?, style?, notes?, review?, project?, flow?, cards?, pace? }
//                                               a film directed from a story
//                                               (src/studio/screenplay.ts); review: read it and direct it again
//                                               with the critic's notes while a score is under 4; project: the
//                                               product's codebase, whose panels a feature is built from; flow:
//                                               a film with no cuts, scenes morphing into each other (flow.ts), cut to
//                                               a measured pace (`pace`: a profile's name, .engine-data/profiles)
//   GET  /__film/panels?kit=&project=           the panels found in the product's code (src/studio/panels.ts)
//   POST /__film/panel-capture { url, panel }   the product's own panel, frozen from its running app (headless Chrome,
//                                               public/panel-capture.js) -> { src, found }
//   POST /__film/card-capture { url, text }     a card of the product's own (a post, a message), frozen by its words
//   POST /__film/panel-snapshot { html }        a panel frozen elsewhere (the capture pasted in a browser) -> { src }
//   POST /__film/review { id }                  stills of a film, its scorecard and its cross-check
//   GET  /__film/assets · POST /__film/asset { kit, kind: world|mark|shape, id? }   the generator (server/generate.ts)
//   POST /__film/flow { flow, name?, mood?, size? }  a flow written by hand (src/studio/flow.ts), no kit needed: fitted
//                                               to its choreography and made into a film -> { id, length, scenes }
//   GET  /__film/media/<name>                    a recording, a captured panel or a picture placed in a film
//   POST /__film/sequence { kit, parts: [{ template, shots?, screens? }], size?, length?, mood?, seam? }
//                                               one film from several templates' shots
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { extname, join, resolve as resolvePath } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { parseJSON } from "./ai.ts"
import { run, type Answer } from "./work.ts"
import { loadKit } from "./kits.ts"
import { devtools, dropProfile, findChrome, jobFile, sendFile } from "./studio.ts"
import { scored } from "./music.ts"
import { generator, palette } from "./generate.ts"
import { library as imageLibrary, vibeOfKit } from "./images.ts"
import type { Brief, Op, Pick, Problem, Stage, TemplateInfo } from "../src/studio/maker.ts"
import type { Contract } from "../src/studio/contracts.ts"
import type { ProductKit } from "../src/studio/product.ts"
import type { Slot } from "../src/studio/shots.ts"

type Version = { at: string; template: string; film: string; size: string; values: Record<string, string>; problems: Problem[]; note?: string }
export type FilmRecord = {
  id: string
  kit: string
  name: string
  made: string
  picks: Pick[]
  versions: Version[]
  /** the composition of the latest version, as the Studio takes it */
  comp: unknown
  renders: { at: string; job: string; draft: boolean }[]
  log: Stage[]
  keep?: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const read = (req: IncomingMessage, max = 4e6) =>
  new Promise<string>((ok, no) => {
    let s = ""
    req.on("data", (b: Buffer) => ((s += b), s.length > max && no(new Error("too large"))))
    req.on("end", () => ok(s))
    req.on("error", no)
  })
const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(body))
}

export function maker(): Plugin {
  return {
    name: "maker",
    configureServer(server: ViteDevServer) {
      const root = join(server.config.root, ".engine-data")
      const dir = join(root, "films")
      const briefs = join(dir, "briefs")
      const contracts = join(root, "contracts")
      for (const d of [dir, briefs, contracts]) mkdirSync(d, { recursive: true })
      const origin = () => `http://localhost:${server.config.server.port ?? 5180}`

      // the app's own modules, loaded as the dev server sees them (so the server never type-checks the app)
      type M = typeof import("../src/studio/maker.ts")
      type K = typeof import("../src/studio/contracts.ts")
      const mods = async () => ({
        M: (await server.ssrLoadModule("/src/studio/maker.ts")) as M,
        K: (await server.ssrLoadModule("/src/studio/contracts.ts")) as K,
        L: (await server.ssrLoadModule("/src/studio/library.ts")) as { slotsFor: (a: string) => Slot[]; LIBRARY: unknown[]; retimed: <X extends { duration: number }>(s: X, to: number) => X },
        S: (await server.ssrLoadModule("/src/studio/shots.ts")) as { fitText: (s: Slot, v: string) => { ok: boolean; problems: string[] } },
        P: (await server.ssrLoadModule("/src/studio/product.ts")) as { fillSlots: (k: ProductKit, s: Slot[]) => { values: Record<string, string>; kept: string[] }; kitCopy: (k: ProductKit) => Record<string, unknown> },
        C: (await server.ssrLoadModule("/src/studio/comp.ts")) as { TEMPLATES: TemplateT[]; SAMPLE_COPY: Record<string, unknown> },
        F: (await server.ssrLoadModule("/src/studio/formats.ts")) as { reframe: (c: unknown, size: string, lib: unknown[], focus: unknown) => CompT },
        SP: (await server.ssrLoadModule("/src/studio/screenplay.ts")) as unknown as SPT,
        A: (await server.ssrLoadModule("/src/studio/artist.ts")) as { DIRECTIONS: DirectionT[] },
        SC: (await server.ssrLoadModule("/src/studio/script.ts")) as { compileScript: (s: unknown, ctx: unknown) => CompT },
        CC: (await server.ssrLoadModule("/src/studio/crosscheck.ts")) as typeof import("../src/studio/crosscheck.ts"),
        PN: (await server.ssrLoadModule("/src/studio/panels.ts")) as typeof import("../src/studio/panels.ts"),
        FL: (await server.ssrLoadModule("/src/studio/flow.ts")) as unknown as FLT,
        R: (await server.ssrLoadModule("/src/registry.ts")) as { byId: (id: string) => { params?: Record<string, unknown>; film?: { size: string; end: number; shots: { at: number; energy: number; enter: string }[] } } | undefined },
      })
      // the director's module as the server uses it (its own types would pull the app into the server's check)
      type Carrier = { id: string; kind: "words" | "logo" | "device" | "clip" | "shape" | "panel"; what: string; file?: string; seconds?: number; phone?: boolean; focus?: { x: number; y: number }; panel?: PanelT }
      type PanelT = import("../src/studio/panels.ts").Panel
      // the flow generator as the server uses it (src/studio/flow.ts; its own types would pull the app in)
      type CardT = { by?: string; handle?: string; tag?: string; lines: string[]; src?: string; h?: number }
      type PaceT = { name: string; move: number; hold: number; morph: number; ease: string; bezier: number[]; typeCps: number; revealCps: number }
      type FlowT = { name: string; accent: string; pace: PaceT; scenes: { kind: string; dur: number; meaning?: MeaningT }[] }
      type FLT = {
        SOFT_MORPH: PaceT
        flowFromSpine: (sp: SpineT, c: Carrier[], o: { name: string; accent: string; dark?: boolean; logo?: string; prompt?: string; cards?: CardT[]; length?: number; pace?: PaceT; media?: (c: Carrier) => string; aspect?: (c: Carrier) => number | undefined; tone?: string; style?: Record<string, unknown>; orbit?: string[]; image?: { src: string; light?: boolean }; motion?: string }) => FlowT
        starts: (f: FlowT) => number[]
        lengthOf: (f: FlowT) => number
        fitted: (f: FlowT) => FlowT
      }
      type SpineT = { promise: string; throughline: string; signature: string; beats: { role: string; buys: string; say: string; sub?: string; carrier: string; seconds: number }[] }
      type MeaningT = { role: string; buys: string; says: string; carrier: string; shows: string }
      type DirectionT = { id: string; name: string; hint: string; energy: number; tempo: number }
      type SPT = {
        spineRequest: (b: Brief, c: Carrier[], o: { length: number; tone: string; notes?: string }) => { schema: { name: string; schema: object }; messages: { role: "system" | "user"; content: string }[] }
        fixSpine: (raw: unknown, c: Carrier[], b: Brief, length: number) => SpineT
        productShare: (s: SpineT, c: Carrier[]) => number
        buildFilm: (s: SpineT, c: Carrier[], ad: DirectionT, m: { light?: boolean; accent?: string; font?: string; world: string; worlds?: string[]; field?: { accent?: string; dark?: boolean }; mark: string; shapes: Record<string, string>; screen: (file: string) => string; clip: (file: string, start: number, seconds: number) => string }, o: { size?: string; url?: string; name: string }) => { script: unknown; devices: ({ src: string; phone: boolean } | null)[]; starts: number[]; energy: number[]; meanings: MeaningT[] }
        METAPHORS: { id: string; means: string }[]
      }
      type CompT = { size: string; fps: number; music?: unknown; scenes: { duration: number; name?: string; transition?: string; meaning?: MeaningT; layers: { kind: string; anim?: string; values?: Record<string, unknown> }[] }[] }
      type TemplateT = { id: string; name: string; film?: boolean; size?: string; make: (x: unknown) => CompT; values?: (x: unknown) => { anim: string; values: Record<string, string> } }

      /* ---------------- records ---------------- */
      const fileOf = (id: string) => join(dir, `${id}.json`)
      const load = (id: string): FilmRecord | null => (/^[\w-]{6,64}$/.test(id) && existsSync(fileOf(id)) ? (JSON.parse(readFileSync(fileOf(id), "utf8")) as FilmRecord) : null)
      const save = (f: FilmRecord) => writeFileSync(fileOf(f.id), JSON.stringify(f, null, 1))
      const loadBrief = (kit: string): Brief | null => (existsSync(join(briefs, `${kit}.json`)) ? (JSON.parse(readFileSync(join(briefs, `${kit}.json`), "utf8")) as Brief) : null)
      const saveBrief = (kit: string, b: Brief) => writeFileSync(join(briefs, `${kit}.json`), JSON.stringify(b, null, 1))
      const drafts = (): Contract[] => readdirSync(contracts).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(contracts, f), "utf8")) as Contract)
      /** one line a step in the run log, kept with the film and across all films (what each video costs) */
      const step = (log: Stage[], stage: string, t0: number, a?: Answer | null, note?: string) => {
        const s: Stage = { stage, ms: Date.now() - t0, tokens: a ? a.tokens.in + a.tokens.out : 0, ...(a ? { model: a.model, cached: a.cached } : {}), ...(note ? { note } : {}) }
        log.push(s)
        appendFileSync(join(dir, "runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...s }) + "\n")
        return s
      }
      const taste = (): Record<string, number> => {
        const t: Record<string, number> = {}
        for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
          const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as FilmRecord
          const tpl = r.versions?.at(-1)?.template
          if (tpl && r.keep !== undefined) t[tpl] = (t[tpl] ?? 0) + (r.keep ? 1 : -1)
        }
        return t
      }

      /** The templates as the picker sees them: each film template with its contract and what screens it takes. */
      const templates = async () => {
        const { K, L, C, R } = await mods()
        const extra = drafts()
        const ctx = { device: "iphone", posture: "open", name: "", anim: "", copy: C.SAMPLE_COPY }
        return C.TEMPLATES.filter((t) => t.film && t.values)
          .map((t) => {
            const film = t.values!(ctx).anim
            const m = R.byId(film)
            const c = K.contractFor(film, extra)
            const info: TemplateInfo = { id: t.id, film, name: t.name, size: (m?.film?.size ?? t.size ?? "16x9") as TemplateInfo["size"], seconds: m?.film?.end ?? 10, screens: L.slotsFor(film).filter((s) => s.kind !== "text" && s.kind !== "color") }
            return c ? { t: info, c } : null
          })
          .filter((x): x is { t: TemplateInfo; c: Contract } => !!x)
      }

      /* ---------------- the brief ---------------- */
      async function writeBrief(k: ProductKit, log: Stage[]): Promise<Brief> {
        const { M } = await mods()
        const t0 = Date.now()
        try {
          const a = await run({
            job: "plan",
            schema: M.BRIEF_SCHEMA,
            maxTokens: 3000,
            messages: [
              { role: "system", content: "You write a product's brief for its launch film from the material given: who it's for, the pain it ends, how people do it today, the change it makes, its features each with what it lets the user do, real proof only. Use only facts in the material; never invent a number, customer, quote or address. Plain words, no hype. JSON only." },
              { role: "user", content: M.briefMaterial(k) },
            ],
          })
          const j = parseJSON(a.text) as Partial<Brief>
          step(log, "brief", t0, a)
          const base = M.briefFromKit(k)
          return { ...base, ...j, features: Array.isArray(j.features) && j.features.length ? j.features : base.features, proof: Array.isArray(j.proof) ? j.proof : base.proof, banned: Array.isArray(j.banned) ? j.banned : [], url: j.url || base.url, by: "ai", updated: new Date().toISOString() } as Brief
        } catch (e) {
          step(log, "brief", t0, null, `the AI couldn't be asked (${(e as Error).message.slice(0, 120)}); written by the rules`)
          return M.briefFromKit(k)
        }
      }

      /* ---------------- the lines: one call, a second only for what didn't fit ---------------- */
      async function writeLines(b: Brief, c: Contract, slots: Slot[], log: Stage[], extra = "") {
        const { M, S } = await mods()
        // the name and the address come from the brief; the writer gets only what needs writing
        const values: Record<string, string> = M.fixedLines(b, c, slots)
        let todo = slots.filter((s) => s.kind === "text" && s.pieces && !values[s.key])
        let note = extra
        for (let round = 0; round < 2 && todo.length; round++) {
          const t0 = Date.now()
          const req = M.linesRequest(b, c, todo, note)
          let a: Answer | null = null
          try {
            a = await run({ job: "words", schema: req.schema, maxTokens: 4000, messages: req.messages })
          } catch (e) {
            step(log, round ? "lines, again" : "lines", t0, null, (e as Error).message.slice(0, 160))
            break
          }
          step(log, round ? "lines, again" : "lines", t0, a)
          const j = parseJSON(a.text) as Record<string, unknown>
          const bad: string[] = []
          for (const s of todo) {
            const v = typeof j[s.key] === "string" ? (j[s.key] as string).trim() : ""
            const f = v ? S.fitText(M.limitsOf(s, c, b.product), v) : { ok: false, problems: [`${s.label}: nothing came back.`] }
            if (f.ok) values[s.key] = v
            else bad.push(...f.problems)
          }
          todo = todo.filter((s) => !values[s.key])
          note = `${extra}\n\nThese didn't fit last time; write just these again, shorter:\n${bad.join("\n")}`
        }
        return values
      }

      /* ---------------- the composition, as the app builds it from a template ---------------- */
      /** The score for a composition: each scene's shot (its film and where in it the scene starts) says its energy and
          how it comes in. */
      async function scoreComp(made: CompT, mood: string) {
        const { R } = await mods()
        let at = 0
        const cuts = made.scenes.map((s) => {
          const l = s.layers.find((x) => x.kind === "component") as { anim?: string; from?: number } | undefined
          const shot = R.byId(l?.anim ?? "")?.film?.shots.find((x) => Math.abs(x.at - (l?.from ?? -1)) < 0.05)
          const cut = { at: Math.round(at * 1000) / 1000, energy: shot?.energy ?? 2, enter: shot?.enter ?? "cut" }
          at += s.duration
          return cut
        })
        return scored(join(root, "music"), cuts, at, mood as Parameters<typeof scored>[3])
      }

      /** `o.fit`: the theme's reach whatever the contract says; `o.music: false`: no score (a part of a longer film);
          `o.run`: where a longer film's screens are up to; `o.screens`: slot -> kit file name, as a director picks them */
      async function compose(templateId: string, k: ProductKit, b: Brief, values: Record<string, string>, size: string, o: { fit?: "product" | "accent"; music?: boolean; run?: { taken: Set<string>; next: number }; screens?: Record<string, string> } = {}) {
        const { C, F, L, P, R, M, K } = await mods()
        const t = C.TEMPLATES.find((x) => x.id === templateId)
        if (!t?.values) throw new Error(`No film template “${templateId}”`)
        const ctx = { device: "iphone", posture: "open", name: b.product, anim: "maze-walk", copy: { ...P.kitCopy(k), name: b.product }, accent: k.brand.accent, kit: k }
        const raw = t.make(ctx)
        const film = t.values(ctx)
        const c = K.contractFor(film.anim, drafts())
        // the screens by the story (the home screen where the film opens on the app, then each feature's own screen),
        // not by shape alone
        const named = Object.fromEntries(
          Object.entries(o.screens ?? {}).flatMap(([key, name]) => {
            const f = k.files.find((x) => x.name === name || x.id === name)
            if (f) o.run?.taken.add(f.id)
            return f ? [[key, `${f.kind === "clip" ? "video" : "image"}:${f.url}${f.focus ? `#focus=${f.focus.x},${f.focus.y}` : ""}`]] : []
          }),
        )
        Object.assign(film.values, M.storyScreens(b, k, L.slotsFor(film.anim).filter((s) => !named[s.key]), film.values, o.run), named)
        // a slot that wants a whole page only takes a picture that is one (tall): a single screen there would hide the
        // page the template draws with the product's own lines
        for (const sl of L.slotsFor(film.anim).filter((x) => x.kind === "screen" && /full-page|whole page/i.test(x.hint ?? ""))) {
          const f = k.files.find((x) => film.values[sl.key]?.endsWith(x.url))
          if (f && !(f.w && f.h && f.h / f.w > 1.6)) delete film.values[sl.key]
        }
        const all: Record<string, string> = { ...film.values, ...values }
        // the product's colours and type over the template's (a film made before keeps the choice it had: "" is the
        // template's own)
        if (all.theme === undefined) {
          const th = M.themeFor(k, c)
          if (th && o.fit) th.fit = o.fit
          if (th) all.theme = JSON.stringify(th)
        }
        const th = all.theme ? (JSON.parse(all.theme) as { accent?: string }) : null
        if (th?.accent && L.slotsFor(film.anim).some((s) => s.kind === "color" && s.key === "accent")) all.accent = th.accent
        let made: CompT = { ...raw, fps: 60, scenes: raw.scenes.map((sc) => ({ ...sc, layers: sc.layers.map((l) => (l.kind === "component" && l.anim === film.anim ? { ...l, values: { ...(R.byId(film.anim)?.params ?? {}), ...l.values, ...all } } : l)) })) }
        const native = t.size ?? made.size
        made = { ...made, size: native }
        if (size && size !== native) {
          const focus = JSON.parse(readFileSync(join(server.config.root, "src", "studio", "lib", "focus.json"), "utf8"))
          made = F.reframe(made, size, L.LIBRARY, focus)
        }
        // the score, made for this film's cuts: each scene's shot says its energy and how it comes in
        // each scene keeps what its shot is for: its role, its job in the contract's story, the lines it shows
        const lib = L.LIBRARY as { id: string; film: string; name: string; at: number; role: string[]; shows: string[] }[]
        const roleOf = (r: string[]) => (r.includes("hook") ? "hook" : r.includes("intro") ? "turn" : r.includes("cta") || r.includes("logo") ? "cta" : "proof")
        made = {
          ...made,
          scenes: made.scenes.map((sc) => {
            const l = sc.layers.find((x) => x.kind === "component") as { anim?: string; from?: number } | undefined
            const shot = lib.find((x) => x.film === l?.anim && Math.abs(x.at - (l?.from ?? -1)) < 0.05)
            if (!shot) return sc
            const job = c?.shots[shot.name] ?? ""
            return { ...sc, meaning: { role: roleOf(shot.role), buys: job, says: shot.shows.map((k) => all[k]).filter((v) => v && !/^(image|video|anim):|^#|^\{/.test(v)).join(" · "), carrier: `shot:${shot.id}`, shows: job } }
          }),
        }
        const mood = all.music || M.moodFor(c)
        if (mood !== "none" && o.music !== false) made = { ...made, music: await scoreComp(made, mood) }
        return { comp: made, film: film.anim, values: all }
      }

      /* ---------------- making a film ---------------- */
      async function make(o: { kit: string; template?: string; size?: string; length?: number; fresh?: boolean }) {
        const { M, K, L, S } = await mods()
        const log: Stage[] = []
        const k = loadKit(o.kit)
        if (!k) throw new Error(`No product kit “${o.kit}”`)
        let t0 = Date.now()
        // a brief the rules wrote (the AI was down) is asked again; one the AI or you wrote is kept
        let b = !o.fresh ? loadBrief(k.id) : null
        if (b?.by === "rules") b = null
        if (b) step(log, "brief", t0, null, "kept from before")
        else saveBrief(k.id, (b = await writeBrief(k, log)))
        t0 = Date.now()
        const list = await templates()
        const picks = M.pick(b, list, { size: o.size, length: o.length, kitFiles: k.files, taste: taste() })
        const chosen = o.template && o.template !== "auto" ? (picks.find((p) => p.id === o.template || p.film === o.template) ?? null) : picks[0]
        if (!chosen) throw new Error(`No film template “${o.template}”. There are: ${picks.map((p) => p.id).join(", ")}`)
        step(log, "pick", t0, null, `${chosen.name}: ${chosen.reasons.join("; ")}`)
        const c = K.contractFor(chosen.film, drafts())!
        const slots = L.slotsFor(chosen.film)
        const written = await writeLines(b, c, slots, log)
        t0 = Date.now()
        const { comp, film, values } = await compose(chosen.id, k, b, written, o.size ?? "")
        const problems = M.checkLines(values, slots, c, b, S.fitText)
        step(log, "build and check", t0, null, `${Object.keys(written).length} lines written, ${problems.filter((p) => p.level === "error").length} problems`)
        const f: FilmRecord = { id: randomUUID().slice(0, 12), kit: k.id, name: `${b.product}: ${chosen.name}`, made: new Date().toISOString(), picks: picks.slice(0, 5), versions: [{ at: new Date().toISOString(), template: chosen.id, film, size: comp.size, values, problems }], comp, renders: [], log }
        save(f)
        return f
      }

      /* ---------------- a film directed from a story ---------------- */
      const media = join(dir, "media")
      mkdirSync(media, { recursive: true })
      const ff = () => process.env.STUDIO_FFMPEG || "ffmpeg"
      // the world, the mark and the shapes, made for the brand (server/generate.ts)
      const gen = generator({ origin, root: server.config.root, media })
      /** Where in a clip the `seconds` with the most colour and light start: its frames read once (4 a second, small),
          each scored by saturation and brightness, the best window of them. */
      const windows = new Map<string, number[]>()
      function bestWindow(file: string, dur: number, seconds: number) {
        const last = Math.max(0, dur - seconds - 0.25)
        try {
          let score = windows.get(file)
          if (!score) {
            const r = execFileSync(ff(), ["-v", "error", "-i", file, "-vf", "fps=4,scale=160:-2,signalstats,metadata=print:file=-", "-an", "-f", "null", "-"], { maxBuffer: 2e7 }).toString()
            const sat = [...r.matchAll(/lavfi\.signalstats\.SATAVG=([\d.]+)/g)].map((m) => +m[1])
            const lum = [...r.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => +m[1])
            score = sat.map((v, i) => v * 2 + (lum[i] ?? 0) * 0.3)
            windows.set(file, score)
          }
          const n = Math.max(1, Math.round(seconds * 4))
          // a window may run up to 1.5 s past the end, on its last frame held (a page that only fills in at the end)
          const held = [...score, ...Array(6).fill(score.at(-1) ?? 0)]
          let best = last
          let top = -1
          for (let i = 0; i + n <= held.length; i++) {
            const avg = held.slice(i, i + n).reduce((a, x) => a + x, 0) / n
            // (ties go to the later window: the result, not the way there)
            if (avg >= top * 1.03) (top = avg), (best = i / 4)
          }
          return Math.max(0, Math.min(best, dur - 0.5))
        } catch {
          return last
        }
      }
      /** A recording placed on a film's clock: its last part (where the result shows), held from `start` (exports seek
          a video to the film's time, so at `start` it's at its first frame). */
      function placeClip(k: ProductKit, file: string, start: number, seconds: number) {
        const f = k.files.find((x) => x.id === file)!
        // the stretch where the result shows: a beat is an action and what you get, so the window with the most colour
        // and light (a page filled in, not its grey placeholders), measured once a clip (else its last stretch)
        const from = bestWindow(join(root, "kits", k.id, "files", f.id), f.dur ?? seconds, seconds)
        const name = `${createHash("sha1").update(JSON.stringify([f.id, from, start, seconds])).digest("hex").slice(0, 16)}.mp4`
        const out = join(media, name)
        if (!existsSync(out))
          execFileSync(ff(), ["-y", "-loglevel", "error", "-ss", from.toFixed(2), "-t", (seconds + 0.2).toFixed(2), "-i", join(root, "kits", k.id, "files", f.id), "-vf", `scale=1920:-2,fps=30,tpad=start_duration=${start.toFixed(3)}:start_mode=clone,tpad=stop_duration=2.5:stop_mode=clone`, "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-g", "12", "-pix_fmt", "yuv420p", out])
        return `/__film/media/${name}`
      }

      /** The panels in the product's code: its codebase's components and pages (`project`, walked; the usual build and
          dependency folders left out), and any code files dropped in its kit. At most 600 files of 300 KB. */
      const CODE = /\.(tsx|jsx|vue|svelte|astro|html?)$/i
      const SKIP = /^(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.vercel|\.turbo|coverage|vendor|\.engine-data|engine-exports|storybook-static)$/
      async function codePanels(k: ProductKit, project?: string) {
        const { PN } = await mods()
        const found: PanelT[] = []
        const take = (file: string, label: string) => {
          try {
            if (statSync(file).size > 300_000) return
            found.push(...PN.panelsFromCode(readFileSync(file, "utf8"), label))
          } catch {
            /* unreadable: skipped */
          }
        }
        if (project && existsSync(project)) {
          const base = resolvePath(project)
          let files = 0
          const walk = (d: string, depth: number) => {
            if (depth > 8 || files >= 600) return
            for (const e of readdirSync(d, { withFileTypes: true })) {
              if (files >= 600) return
              if (e.isDirectory()) {
                if (!SKIP.test(e.name) && !e.name.startsWith(".")) walk(join(d, e.name), depth + 1)
              } else if (CODE.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) {
                files++
                take(join(d, e.name), join(d, e.name).slice(base.length + 1))
              }
            }
          }
          walk(base, 0)
        }
        for (const f of k.files) if (CODE.test(f.name) || /\.(tsx|jsx)$/i.test(extname(f.name))) take(join(root, "kits", k.id, "files", f.id), f.name)
        return PN.dedupe(found)
      }

      /** A frozen panel kept with the films' media (its address is what the unfold film fetches). */
      function keepSnapshot(html: string) {
        const name = `panel-${createHash("sha1").update(html).digest("hex").slice(0, 16)}.html`
        mkdirSync(media, { recursive: true })
        writeFileSync(join(media, name), html)
        return `/__film/media/${name}`
      }
      /** The product's own panel, frozen from its running app: the page opened in headless Chrome, the panel found by
          its words (its title, its properties' labels, its buttons), every element's look inlined. Looks on the page it's
          given, then on up to six of that page's own links whose words share the panel's. */
      async function capturePanel(url: string, p: PanelT, card?: string): Promise<{ src?: string; found?: unknown; error?: string; bg?: string; w?: number; h?: number }> {
        const chrome = findChrome()
        if (!chrome) return { error: "No Chrome or Edge to open the app in (STUDIO_CHROME)." }
        const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-panel-"))
        const cdp = await devtools(chrome, profile)
        const script = readFileSync(join(server.config.root, "public", "panel-capture.js"), "utf8")
        const spec = JSON.stringify({ title: p.title, rows: p.rows, ctas: p.ctas })
        const open = async (u: string) => {
          await cdp.send("Page.navigate", { url: u })
          for (let i = 0; i < 200 && !(await cdp.evaluate("document.readyState === 'complete'").catch(() => false)); i++) await sleep(100)
          await sleep(1500)
          await cdp.evaluate(script)
          return (await cdp.evaluate(card ? `window.__captureCard(${JSON.stringify({ text: card })})` : `window.__capturePanel(${spec})`, 60000)) as { html?: string; w?: number; h?: number; found?: unknown; error?: string; bg?: string }
        }
        try {
          await cdp.send("Page.enable")
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
          let r = await open(url)
          if (!r.html) {
            const words = new Set(PN_tokens([p.title, ...p.rows.map((x) => x.split(":")[0]), ...p.ctas].join(" ")))
            const links = ((await cdp.evaluate(`[...document.querySelectorAll("a[href]")].map((a) => [a.href, a.textContent]).filter(([h]) => h.startsWith(location.origin))`)) as [string, string][]) ?? []
            const ranked = links
              .map(([h, txt]) => ({ h, n: PN_tokens(`${txt} ${h}`).filter((w) => words.has(w)).length }))
              .filter((x) => x.n > 0)
              .sort((a, b) => b.n - a.n)
              .slice(0, 6)
            for (const l of ranked) if ((r = await open(l.h)).html) break
          }
          return r.html ? { src: keepSnapshot(r.html), found: r.found, bg: r.bg, w: r.w, h: r.h } : { error: r.error ?? "Not found" }
        } catch (e) {
          return { error: (e as Error).message }
        } finally {
          await cdp.close()
          dropProfile(profile)
        }
      }
      let PN_tokens: (s: string) => string[] = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      void mods().then((m) => (PN_tokens = m.PN.tokens))

      /** Directs a film and reads it, and while its weakest score is under 4, directs it again with the critic's notes
          (two rounds at most): the best film comes back, with every card. */
      async function directed(o: Parameters<typeof direct>[0] & { rounds?: number }) {
        const { M } = await mods()
        let f = await direct(o)
        let card = await review(f)
        const cards = [{ id: f.id, card }]
        let best = { f, card }
        // again while a score is under 4, a gate fails, or a shot doesn't show what it means
        const short = (c: typeof card) => M.weakest(c) < 4 || c.lint.some((x) => x.level === "fail") || (c.shots ?? []).some((x) => !x.matches)
        for (let r = 1; r < (o.rounds ?? 2) && short(card) && card.notes; r++) {
          f = await direct({ ...o, notes: [o.notes, card.notes].filter(Boolean).join(" ") })
          card = await review(f)
          cards.push({ id: f.id, card })
          // passing the gates first (a fail is fixed, never argued), then the weakest score
          const fails = (c: typeof card) => c.lint.filter((x) => x.level === "fail").length
          if (fails(card) < fails(best.card) || (fails(card) === fails(best.card) && M.weakest(card) > M.weakest(best.card))) best = { f, card }
        }
        return { film: load(best.f.id) ?? best.f, card: best.card, cards }
      }

      async function direct(o: { kit: string; length?: number; size?: string; style?: string; notes?: string; mood?: string; project?: string; flow?: boolean; cards?: CardT[]; pace?: string; choices?: Record<string, unknown>; motion?: string; orbit?: string[]; images?: boolean }) {
        const { SP, A, SC, P, PN } = await mods()
        const log: Stage[] = []
        const k = loadKit(o.kit)
        if (!k) throw new Error(`No product kit “${o.kit}”`)
        const length = Math.max(10, Math.min(90, o.length ?? 30))
        let t0 = Date.now()
        let b = loadBrief(k.id)
        if (b?.by === "rules") b = null
        if (b) step(log, "brief", t0, null, "kept from before")
        else saveBrief(k.id, (b = await writeBrief(k, log)))
        const brief = b
        // what can carry a beat: the product's screens and recordings, as the reader saw them
        const carriers: Carrier[] = [
          { id: "words", kind: "words", what: "the line alone, big, on the film's world" },
          { id: "logo", kind: "logo", what: "the product's mark forming in liquid metal, its name under it" },
          ...k.files.filter((f) => f.kind === "desktop" || f.kind === "phone").map((f) => ({ id: `screen:${f.id.slice(0, 8)}`, kind: "device" as const, file: f.id, phone: f.kind === "phone", focus: f.focus, what: `its screen on a ${f.kind === "phone" ? "phone" : "laptop"}: ${f.shows ?? f.name}` })),
          ...k.files.filter((f) => f.kind === "clip").map((f) => ({ id: `clip:${f.id.slice(0, 8)}`, kind: "clip" as const, file: f.id, seconds: f.dur, what: `a recording of someone using it: ${(f.name.split(": ").slice(1).join(": ") || f.shows) ?? f.name}` })),
          // the generator's shapes, each one idea: only the ones a beat uses are made
          ...SP.METAPHORS.map((x) => ({ id: x.id, kind: "shape" as const, what: `a shape: ${x.means}` })),
        ]
        // the panels in its code: a feature it has a panel for is built on screen (the ones with the most in them first)
        t0 = Date.now()
        const panels = (await codePanels(k, o.project)).sort((a, b) => b.rows.length + b.ctas.length - (a.rows.length + a.ctas.length)).slice(0, 10)
        carriers.push(...panels.map((p) => ({ id: p.id, kind: "panel" as const, what: PN.panelWhat(p), panel: p })))
        if (o.project || panels.length) step(log, "panels", t0, null, `${panels.length} in the code: ${panels.map((p) => p.title).join(", ") || "none"}`)
        const dark = !k.brand.ground || parseInt(k.brand.ground.slice(1, 3), 16) < 90
        const ad = A.DIRECTIONS.find((d) => d.id === o.style) ?? A.DIRECTIONS.find((d) => d.id === (dark ? "keynote" : "glass"))!
        t0 = Date.now()
        const req = SP.spineRequest(brief, carriers, { length, tone: `${ad.name}: ${ad.hint}`, notes: o.notes })
        const a = await run({ job: "plan", schema: req.schema, maxTokens: 3000, messages: req.messages })
        step(log, "story", t0, a)
        const spine = SP.fixSpine(parseJSON(a.text), carriers, brief, length)
        // the panels the story builds, as the product draws them: frozen from its running app (its address), so the
        // film shows the exact component; without one, they're drawn from their words
        const cast = carriers.filter((c) => c.kind === "panel" && c.panel && spine.beats.some((b) => b.carrier === c.id))
        if (cast.length && k.url) {
          t0 = Date.now()
          const got = await Promise.all(cast.map(async (c) => ({ c, r: await capturePanel(k.url!, c.panel!) })))
          for (const { c, r } of got) if (r.src) c.panel = { ...c.panel!, src: r.src, ...(r.bg ? { surface: r.bg } : {}) }
          step(log, "panels captured", t0, null, got.map(({ c, r }) => `${c.panel!.title}: ${r.src ? "the app's own" : `drawn (${r.error})`}`).join("; "))
        }
        if (o.flow) return directFlow(o, k, brief, spine, carriers, ad, dark, log, length)
        // the world, the mark and the shapes the story uses: made once for the brand, kept after
        t0 = Date.now()
        // (the world is a composed field, drawn live: only the mark and the shapes are rendered)
        const res = await gen.forFilm(k, [...new Set(spine.beats.map((x) => x.carrier).filter((c) => c.startsWith("shape:")))], { worlds: false })
        step(log, "mark and shapes", t0, null, `${Object.keys(res.shapes).length} shapes: ${Object.keys(res.shapes).join(", ") || "none"}`)
        t0 = Date.now()
        const built = SP.buildFilm(spine, carriers, ad, { light: res.light, accent: res.accent, font: k.brand.text, world: res.world, field: { accent: res.accent, dark: !res.light }, mark: res.mark, shapes: res.shapes, screen: (file) => k.files.find((f) => f.id === file)!.url, clip: (file, start, seconds) => placeClip(k, file, start, seconds) }, { size: o.size ?? "16x9", url: brief.url, name: brief.product })
        const accent = k.brand.accent || k.brand.ink || "#ededed"
        const brand = { name: brief.product, bg: k.brand.ground ?? "#000000", surface: "#111113", ink: k.brand.ink ?? "#ededed", muted: "#a1a1aa", accent, onAccent: "#0b0b0c", font: k.brand.text ?? "", display: k.brand.display ?? "", mono: "", radius: k.brand.radius ?? 12, dark, fonts: k.brand.fonts ?? [] }
        let comp = SC.compileScript(built.script, { device: "macbook", posture: "open", anim: "maze-walk", copy: { ...P.kitCopy(k), name: brief.product }, brand, accent })
        // each device shows the product's screen, and stands in the world (the world first, so it's behind)
        comp = {
          ...comp,
          fps: 60,
          scenes: comp.scenes.map((sc, i) => {
            const d = built.devices[i]
            const layers = sc.layers.map((l) => (l.kind === "device" && d ? { ...l, content: { kind: "image", src: d.src, name: "screen" }, fit: "fill" } : l))
            const dev = layers.filter((l) => l.kind === "device")
            const flat = layers.filter((l) => l.kind !== "device")
            // and keeps what it's for: its role, the belief it buys, its words, what carries it, what it shows
            return { ...sc, meaning: built.meanings[i], layers: dev.length ? [flat[0], ...dev, ...flat.slice(1)] : flat }
          }),
        }
        // the score, cut to the beats: each scene's energy from its act
        const mood = o.mood ?? (ad.energy >= 0.85 ? "bright" : ad.tempo >= 120 ? "driving" : dark ? "dark" : "calm")
        const total = built.starts.at(-1)! + comp.scenes.at(-1)!.duration
        comp = { ...comp, music: scored(join(root, "music"), built.starts.map((at, i) => ({ at, energy: built.energy[i], enter: i ? "cut" : "cut" })), total, mood as Parameters<typeof scored>[3]) }
        const share = SP.productShare(spine, carriers)
        step(log, "build", t0, null, `${spine.beats.length} beats, ${total.toFixed(1)} s, ${Math.round(share * 100)}% on the product, ${ad.name}, ${mood} score`)
        const f: FilmRecord = { id: randomUUID().slice(0, 12), kit: k.id, name: `${brief.product}: directed (${ad.name})`, made: new Date().toISOString(), picks: [], versions: [{ at: new Date().toISOString(), template: `directed:${ad.id}`, film: "directed", size: comp.size, values: { spine: JSON.stringify(spine) }, problems: [] }], comp, renders: [], log }
        save(f)
        return f
      }

      /** A flow film from the story (src/studio/flow.ts): no cuts, every scene becoming the next through a shape they
          share, at a measured film's pace (`pace`, a profile npm run measure made; the reference's own by default). One
          film over all its scenes, each scene playing its slice of it, so the Studio edits it scene by scene. */
      async function directFlow(o: Parameters<typeof direct>[0], k: ProductKit, brief: Brief, spine: SpineT, carriers: Carrier[], ad: DirectionT, dark: boolean, log: Stage[], length: number) {
        const { FL, P } = await mods()
        const t0 = Date.now()
        const p = palette(k)
        let pace = FL.SOFT_MORPH
        if (o.pace) {
          const f = join(root, "profiles", `${o.pace.replace(/[^\w-]/g, "")}.json`)
          if (existsSync(f)) pace = { ...pace, ...(JSON.parse(readFileSync(f, "utf8")) as Partial<typeof pace>), name: o.pace }
        }
        // cards asked for by their words are the product's own, frozen from its running app (else drawn from them)
        const cards = await Promise.all(
          (o.cards ?? []).map(async (c) => {
            if (c.src || !k.url || !c.lines.length) return c
            const r = await capturePanel(k.url, { id: "", file: "", title: "", rows: [], ctas: [] }, c.lines[0])
            return r.src ? { ...c, src: r.src, ...(r.w && r.h ? { h: Math.round((900 * r.h) / r.w) } : {}) } : c
          }),
        )
        const media = (c: Carrier) => {
          const f = k.files.find((x) => x.id === c.file)
          return f ? `${c.kind === "clip" ? "video" : "image"}:${f.url}` : ""
        }
        // the tone the generator chooses its moves by (compose.ts): the art direction's energy
        const tone = ad.energy >= 0.85 ? "bold" : ad.energy >= 0.55 ? "bright" : "calm"
        const aspect = (c: Carrier) => {
          const f = k.files.find((x) => x.id === c.file)
          return f?.w && f?.h ? f.w / f.h : undefined
        }
        // a picture for the opening, from the library, for this product's vibe (its hue, how deep, its tone, its words)
        let image: { src: string; light?: boolean } | undefined
        if (o.images !== false) {
          const got = imageLibrary(server.config.root).choose(vibeOfKit(k.id, tone as "calm" | "bright" | "bold"))
          if (got) {
            image = { src: got.src, light: got.img.light > 0.62 }
            step(log, "image", t0, null, `${got.img.name} (${got.img.tags.join(", ")}): ${got.why.join("; ") || "the closest"}`)
          }
        }
        const flow = FL.flowFromSpine(spine, carriers, { name: brief.product, accent: p.accent, dark: !p.light, logo: k.files.find((f) => f.kind === "logo")?.url, length, cards, pace, media, aspect, tone, ...(o.choices ? { style: o.choices } : {}), ...(o.orbit?.length ? { orbit: o.orbit } : {}), ...(image ? { image } : {}), ...(o.motion ? { motion: o.motion } : {}) })
        const accent = k.brand.accent || p.accent
        const brand = { name: brief.product, bg: "#000000", surface: "#111113", ink: "#ededed", muted: "#a1a1aa", accent, onAccent: "#0b0b0c", font: k.brand.text ?? "", display: k.brand.display ?? "", mono: "", radius: k.brand.radius ?? 12, dark, fonts: k.brand.fonts ?? [] }
        const mood = o.mood ?? (ad.energy >= 0.85 ? "bright" : ad.tempo >= 120 ? "driving" : dark ? "dark" : "calm")
        const f = await filmOfFlow(flow, { kit: k.id, name: brief.product, summary: spine.promise, why: [spine.signature], size: o.size, brand, copy: { ...P.kitCopy(k), name: brief.product }, mood, log, values: { spine: JSON.stringify(spine) } })
        step(log, "flow", t0, null, `${flow.scenes.length} scenes (${flow.scenes.map((s) => s.kind).join(" → ")}), ${FL.lengthOf(flow).toFixed(1)} s, no cuts, at ${flow.pace.name}'s pace`)
        save(f)
        return f
      }

      /** A flow (src/studio/flow.ts) made into a film: one Studio scene per scene of it, each the flow film drawn from
          its own start, and a score cut to its scenes. The director's (directFlow) and a flow written by hand
          (POST /__film/flow) both come through here. */
      async function filmOfFlow(flow: FlowT, o: { kit?: string; name: string; summary?: string; why?: string[]; size?: string; brand?: Record<string, unknown>; copy?: Record<string, unknown>; mood?: string; log?: Stage[]; values?: Record<string, string> }) {
        const { FL, SC } = await mods()
        const at = FL.starts(flow)
        const spec = JSON.stringify(flow)
        const script = {
          id: `flow-${Date.now().toString(36)}`,
          name: `${o.name}: flow`,
          version: 1,
          source: "director",
          summary: o.summary ?? "",
          size: o.size ?? "16x9",
          ground: "#000000",
          light: "studio",
          why: o.why ?? [],
          avoid: [],
          shots: flow.scenes.map((s, i) => ({ name: `${s.kind}: ${s.meaning?.says ?? ""}`.slice(0, 60), dur: s.dur, cut: "cut", why: s.meaning?.buys ?? "", layers: [{ kind: "component", name: "Flow", anim: "film-flow", box: { x: 0.5, y: 0.5, w: 1 }, aspect: 16 / 9, enter: "none", fit: false, from: at[i], rate: 1, values: { spec } }] })),
        }
        const accent = flow.accent
        const brand = o.brand ?? { name: o.name, bg: "#000000", surface: "#111113", ink: "#ededed", muted: "#a1a1aa", accent, onAccent: "#0b0b0c", font: "", display: "", mono: "", radius: 12, dark: true, fonts: [] }
        let comp = SC.compileScript(script, { device: "macbook", posture: "open", anim: "maze-walk", copy: o.copy ?? { name: o.name }, brand, accent })
        comp = { ...comp, fps: 60, scenes: comp.scenes.map((sc, i) => ({ ...sc, meaning: flow.scenes[i].meaning })) }
        const energy: Record<string, number> = { words: 1, prompt: 2, brand: 2, panel: 3, app: 3, tour: 3, orbit: 2, cards: 2, stack: 2, end: 2 }
        const total = FL.lengthOf(flow)
        comp = { ...comp, music: scored(join(root, "music"), at.map((a, i) => ({ at: a, energy: energy[flow.scenes[i].kind] ?? 2, enter: "cut" })), total, (o.mood ?? "bright") as Parameters<typeof scored>[3]) }
        const f: FilmRecord = { id: randomUUID().slice(0, 12), kit: o.kit ?? "", name: `${o.name}: flow`, made: new Date().toISOString(), picks: [], versions: [{ at: new Date().toISOString(), template: "directed:flow", film: "directed", size: comp.size, values: { ...(o.values ?? {}), flow: spec }, problems: [] }], comp, renders: [], log: o.log ?? [] }
        save(f)
        return f
      }

      /* ---------------- a film of several templates' shots ---------------- */
      type Part = { template: string; /** which of its shots, by index (all if none) */ shots?: number[]; /** slot -> kit file name */ screens?: Record<string, string> }
      /** One film from several templates' shots, in order: each part's lines written at once (only the lines its kept
          shots show, every part in parallel), every part on the same theme (the product's, ground and all: one film,
          one ground), the screens carrying on from part to part, the seams dissolved, the last shot held to `length`,
          one score over the whole. */
      async function makeSequence(o: { kit: string; parts: Part[]; size?: string; length?: number; mood?: string; seam?: string }) {
        const { M, L, S } = await mods()
        const log: Stage[] = []
        const k = loadKit(o.kit)
        if (!k) throw new Error(`No product kit “${o.kit}”`)
        if (!o.parts?.length) throw new Error("A sequence needs its parts: [{ template, shots? }]")
        let t0 = Date.now()
        let b = loadBrief(k.id)
        if (b?.by === "rules") b = null
        if (b) step(log, "brief", t0, null, "kept from before")
        else saveBrief(k.id, (b = await writeBrief(k, log)))
        const brief = b
        const list = await templates()
        const LIB = L.LIBRARY as { id: string; film: string }[]
        const parts = o.parts.map((p) => {
          const x = list.find((y) => y.t.id === p.template || y.t.film === p.template)
          if (!x) throw new Error(`No film template “${p.template}”`)
          const ids = LIB.filter((s) => s.film === x.t.film).map((s) => s.id)
          const keep = p.shots ? p.shots.map((i) => ids[i]).filter(Boolean) : ids
          // the lines its kept shots show (a line no shot is measured to show is written anyway: it may be on screen)
          const slots = L.slotsFor(x.t.film).filter((s) => s.kind !== "text" || !s.shots.length || s.shots.some((id) => keep.includes(id)))
          return { p, x, slots }
        })
        const written = await Promise.all(parts.map(({ x, slots }) => writeLines(brief, x.c, slots, log)))
        t0 = Date.now()
        const run = { taken: new Set<string>(), next: 0 }
        const built: { name: string; film: string; values: Record<string, string>; problems: Problem[]; scenes: CompT["scenes"]; comp: CompT }[] = []
        for (const [i, { p, x, slots }] of parts.entries()) {
          const r = await compose(x.t.id, k, brief, written[i], o.size ?? "16x9", { fit: "product", music: false, run, screens: p.screens })
          const scenes = p.shots ? r.comp.scenes.filter((_, j) => p.shots!.includes(j)) : r.comp.scenes
          built.push({ name: x.t.name, film: r.film, values: r.values, problems: M.checkLines(r.values, slots, x.c, brief, S.fitText), scenes, comp: r.comp })
        }
        // the seams: the next part comes in through a dissolve
        let scenes = built.flatMap((x, i) => x.scenes.map((s, j) => (i && !j ? { ...s, transition: o.seam ?? "dissolve" } : s)))
        if (o.length) {
          const before = scenes.slice(0, -1).reduce((a, s) => a + s.duration, 0)
          const last = scenes.at(-1)!
          scenes = [...scenes.slice(0, -1), L.retimed(last, Math.max(last.duration * 0.6, o.length - before))]
        }
        let comp: CompT = { ...built[0].comp, scenes }
        const mood = o.mood ?? M.moodFor(parts[0].x.c)
        if (mood !== "none") comp = { ...comp, music: await scoreComp(comp, mood) }
        const total = scenes.reduce((a, s) => a + s.duration, 0)
        const problems = built.flatMap((x, i) => x.problems.map((q) => ({ ...q, key: `${i + 1}.${q.key}` })))
        step(log, "build and check", t0, null, `${built.length} parts, ${scenes.length} shots, ${total.toFixed(2)} s; ${written.reduce((a, w) => a + Object.keys(w).length, 0)} lines written, ${problems.filter((q) => q.level === "error").length} problems`)
        const values = Object.fromEntries(built.flatMap((x, i) => Object.entries(x.values).map(([key, v]) => [`${i + 1}.${key}`, v])))
        const f: FilmRecord = {
          id: randomUUID().slice(0, 12),
          kit: k.id,
          name: `${brief.product}: ${built.map((x) => x.name).join(" + ")}`,
          made: new Date().toISOString(),
          picks: [],
          versions: [{ at: new Date().toISOString(), template: parts.map((x) => x.x.t.id).join("+"), film: "sequence", size: comp.size, values, problems, note: `shots: ${o.parts.map((p) => `${p.template}${p.shots ? `[${p.shots.join(",")}]` : ""}`).join(" + ")}` }],
          comp,
          renders: [],
          log,
        }
        save(f)
        return f
      }

      /* ---------------- edits ---------------- */
      async function edit(f: FilmRecord, ops: Op[], note?: string) {
        const { M, K, L, S } = await mods()
        const k = loadKit(f.kit)!
        const b = loadBrief(f.kit) ?? M.briefFromKit(k)
        const last = f.versions.at(-1)!
        let template = last.template
        let size = last.size
        let values = { ...last.values }
        let restored = false
        const c = () => K.contractFor(f.versions.at(-1)!.film, drafts())!
        for (const o of ops) {
          if (o.op === "line") values[o.key] = o.value
          else if (o.op === "restore") {
            const v = f.versions[o.version]
            if (!v) throw Object.assign(new Error(`No version ${o.version}: there are ${f.versions.length}`), { code: 400 })
            ;({ template, size } = v)
            values = { ...v.values }
            restored = true
          } else if (o.op === "music") values.music = o.mood
          else if (o.op === "screen") {
            const file = k.files.find((x) => x.id === o.file)
            if (file) values[o.key] = `${file.kind === "clip" ? "video" : "image"}:${file.url}`
          } else if (o.op === "template") template = (await templates()).find((x) => x.t.id === o.id || x.t.film === o.id)?.t.id ?? template
          else if (o.op === "size") size = o.size
          else if (o.op === "theme") values.theme = o.fit === "template" ? "" : JSON.stringify({ ...(M.themeFor(k, c()) ?? {}), fit: o.fit })
          else if (o.op === "rewrite") {
            const slots = L.slotsFor(last.film).filter((s) => !o.keys?.length || o.keys.includes(s.key))
            Object.assign(values, await writeLines(b, c(), slots, f.log, `\n\nA note from the person making the film: ${o.note}`))
          }
        }
        // a new template is new lines: written for it (a version gone back to has its own)
        if (template !== last.template && !restored) {
          const film = (await templates()).find((x) => x.t.id === template)!.t.film
          values = await writeLines(b, K.contractFor(film, drafts())!, L.slotsFor(film), f.log)
        }
        const built = await compose(template, k, b, values, size)
        const sceneOps = ops.filter((o) => o.op === "drop" || o.op === "move" || o.op === "retime")
        const comp = sceneOps.length ? { ...built.comp, scenes: M.applySceneOps(built.comp.scenes, sceneOps) } : built.comp
        const problems = M.checkLines(built.values, L.slotsFor(built.film), K.contractFor(built.film, drafts()), b, S.fitText)
        // what changed, said in the version list when no note said it
        const said = note ?? ops.map((o) => (o.op === "theme" ? `colours: ${o.fit === "template" ? "the template's" : o.fit === "accent" ? "the product's accent" : "the product's"}` : o.op === "music" ? `music: ${o.mood}` : o.op === "restore" ? `back to version ${o.version + 1}` : o.op === "line" ? `${o.key} set` : o.op === "screen" ? `${o.key}: another screen` : o.op)).join(", ")
        f.versions.push({ at: new Date().toISOString(), template, film: built.film, size: comp.size, values: built.values, problems, ...(said ? { note: said } : {}) })
        f.comp = comp
        save(f)
        return f
      }
      /** A note in plain words, read into edits (one small call); the lines it names are rewritten with it. */
      async function noteToOps(f: FilmRecord, note: string) {
        const { M, L } = await mods()
        const last = f.versions.at(-1)!
        const t0 = Date.now()
        const lines = L.slotsFor(last.film).filter((s) => s.kind === "text").map((s) => ({ key: s.key, label: s.label, now: last.values[s.key] ?? s.example }))
        const scenes = (f.comp as CompT).scenes.map((s, i) => ({ scene: i, name: (s as { name?: string }).name, seconds: s.duration }))
        const a = await run({
          job: "plan",
          schema: M.OPS_SCHEMA,
          maxTokens: 1500,
          messages: [
            { role: "system", content: "You turn a note about a launch film into edits. Edits: line (set one line exactly), rewrite (have lines rewritten with the note: give their keys), template (another film template by id), size (16x9, 9x16, 1x1, 4x5), drop/move/retime (scenes by index), screen (a slot's picture: a kit file id). Prefer rewrite for anything about wording. Give each edit only the fields it needs. JSON only." },
            { role: "user", content: JSON.stringify({ note, lines, scenes, templates: (await templates()).map((x) => ({ id: x.t.id, idea: x.c.idea })) }) },
          ],
        })
        step(f.log, "note", t0, a, note)
        const j = parseJSON(a.text) as { ops?: Op[]; say?: string }
        return { ops: Array.isArray(j.ops) ? j.ops : [], say: j.say ?? "" }
      }

      /* ---------------- rendering, by the Studio itself ---------------- */
      async function render(f: FilmRecord, draft: boolean, stills = false) {
        const chrome = findChrome()
        if (!chrome) throw new Error("Couldn't find Chrome or Edge.")
        const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-maker-"))
        const cdp = await devtools(chrome, profile)
        const t0 = Date.now()
        try {
          await cdp.send("Page.enable")
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
          await cdp.send("Page.navigate", { url: origin() + "/" })
          for (let i = 0; i < 200 && !(await cdp.evaluate("!!window.__engine?.load").catch(() => false)); i++) await sleep(150)
          await cdp.evaluate(`window.__engine.load(${JSON.stringify(f.comp)})`)
          // the Studio mounts the film's scenes and their screens
          await sleep(5000)
          const job = String(await cdp.evaluate(`window.__engine.render("video", { draft: ${draft}, stills: ${stills} })`))
          f.renders.push({ at: new Date().toISOString(), job, draft })
          const what = stills ? "stills render" : draft ? "draft render" : "render"
          step(f.log, `${what} queued`, t0)
          save(f)
          // the render's own time, logged when it finishes (this call returns once it's queued)
          const started = Date.now()
          void (async () => {
            for (let i = 0; i < 7200; i++) {
              await sleep(1000)
              const s = (await fetch(`${origin()}/__studio/jobs/${job}`).then((r) => r.json()).catch(() => null)) as { state?: string; total?: number } | null
              if (s?.state !== "done" && s?.state !== "error") continue
              const g = load(f.id)
              if (g) (step(g.log, `${what} ${s.state === "done" ? "done" : "failed"}`, started, null, `${s.total ?? 0} frames`), save(g))
              return
            }
          })()
          return job
        } finally {
          await cdp.close()
          dropProfile(profile)
        }
      }

      /* ---------------- the critic: stills of the last render, read against the brief ---------------- */
      async function critic(f: FilmRecord) {
        const { M, K, L } = await mods()
        const last = f.renders.at(-1)
        const file = last ? jobFile(last.job) : undefined
        if (!file) throw new Error("Render it first (a draft will do), and wait for it to finish.")
        const comp = f.comp as CompT
        const starts = comp.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + comp.scenes[i - 1].duration : 0], [])
        const at = comp.scenes.map((s, i) => starts[i] + s.duration * 0.7).slice(0, 8)
        const ff = process.env.STUDIO_FFMPEG || "ffmpeg"
        const stills = at.map((t) => execFileSync(ff, ["-v", "error", "-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2", "-c:v", "mjpeg", "-q:v", "5", "-"], { maxBuffer: 1e7 }).toString("base64"))
        const v = f.versions.at(-1)!
        const b = loadBrief(f.kit)
        const c = K.contractFor(v.film, drafts())
        const t0 = Date.now()
        const a = await run({
          job: "critic",
          schema: M.CRITIC_SCHEMA,
          maxTokens: 4000,
          messages: [
            { role: "system", content: "You review stills of a product's launch film against its brief and the film's contract. Look for: words that don't read (too small, cut off, on a busy ground), lines that don't tell this product's story, anything left from the reference film (another product's name, figures, words). Say what you saw in a sentence or two, and list the lines to fix (their keys, from the lines given) with how to rewrite each. If it's good, no fixes. JSON only." },
            { role: "user", content: [{ type: "text", text: JSON.stringify({ brief: b, film: c?.idea, lines: v.values, shots: c?.shots, slots: L.slotsFor(v.film).filter((s) => s.kind === "text").map((s) => s.key) }) }, ...stills.map((s) => ({ type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${s}` } }))] },
          ],
        })
        step(f.log, "critic", t0, a)
        const j = parseJSON(a.text) as { fixes?: { key: string; note: string }[]; say?: string }
        const known = new Set(Object.keys(v.values))
        const ops: Op[] = (Array.isArray(j.fixes) ? j.fixes : []).filter((x) => known.has(x.key)).map((x) => ({ op: "rewrite", keys: [x.key], note: x.note }))
        return { say: j.say ?? "", film: ops.length ? await edit(f, ops, `critic: ${j.say ?? ""}`) : f, ops }
      }

      /* ---------------- the scorecard: a directed film read from its stills ---------------- */
      /** Waits for a render job to finish: its file. */
      async function finished(job: string) {
        for (let i = 0; i < 3600; i++) {
          const s = (await fetch(`${origin()}/__studio/jobs/${job}`).then((r) => r.json()).catch(() => null)) as { state?: string; error?: string } | null
          if (s?.state === "done") return jobFile(job)!
          if (s?.state === "error") throw new Error(`The render failed: ${s.error}`)
          await sleep(1000)
        }
        throw new Error("The render took too long")
      }
      /** Stills of the film (a quick render: a few frames a second), read against the brief and the film's own spine. */
      async function review(f: FilmRecord) {
        const { M, CC } = await mods()
        let t0 = Date.now()
        const file = await finished(await render(f, false, true))
        f = load(f.id) ?? f
        const comp = f.comp as CompT
        const starts = comp.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + comp.scenes[i - 1].duration : 0], [])
        const stills = comp.scenes.slice(0, 10).map((s, i) => execFileSync(ff(), ["-v", "error", "-ss", (starts[i] + s.duration * 0.62).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2", "-c:v", "mjpeg", "-q:v", "5", "-"], { maxBuffer: 1e7 }).toString("base64"))
        step(f.log, "stills", t0, null, `${comp.scenes.length} shots`)
        t0 = Date.now()
        const spine = f.versions.at(-1)?.values.spine
        // the code's pass first (free): motionmaxxing's gates and the meanings, on the composition
        const lint = CC.lintFilm(comp as never)
        // then the look: each still against what its shot is meant to do, and the whole scored
        const meant = comp.scenes.slice(0, 10).map((s, i) => ({ n: i + 1, ...(s.meaning ?? { role: "", buys: "", says: "", carrier: "", shows: s.name ?? "" }) }))
        const a = await run({
          job: "critic",
          schema: M.SCORE_SCHEMA,
          maxTokens: 4000,
          messages: [
            { role: "system", content: "You review a product's launch film as a senior motion designer would, from one still of each shot, in order. For each still you're told what its shot is meant to do: its role, the belief it buys, its words, what it shows. Say for each whether the picture actually does that, and if not, what's wrong and what would fix it (another recording or screen, other words). Then score the film 1 to 5 on each line of the card, strictly: 5 is a film you'd put on the product's homepage; a mix of clips, a slide layout, unreadable product or words that don't match the picture are 2. Then tell the director in plain words what to change. JSON only." },
            { role: "user", content: [{ type: "text", text: JSON.stringify({ brief: loadBrief(f.kit), story: spine ? JSON.parse(spine) : undefined, shots: meant }) }, ...stills.flatMap((s, i) => [{ type: "text" as const, text: `Still ${i + 1}:` }, { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${s}` } }])] },
          ],
        })
        const card = parseJSON(a.text) as import("../src/studio/maker.ts").Scorecard
        const off = (card.shots ?? []).filter((x) => !x.matches)
        step(f.log, "cross-check", t0, a, `story ${card.story} · product ${card.product} · look ${card.look} · words ${card.words} · carriers ${card.carriers}; ${off.length} shots off their meaning; ${lint.filter((x) => x.level === "fail").length} gates failed`)
        save(f)
        // what the director is told next time: the gates that failed, the shots that don't show their meaning, the critic
        const notes = [CC.notesOf(lint), ...off.map((x) => `Shot ${x.n}: ${x.note}`), card.notes].filter(Boolean).join(" ")
        return { ...card, lint, notes }
      }

      /* ---------------- a contract drafted for a template without one ---------------- */
      async function draftContract(film: string) {
        const { L, R } = await mods()
        const m = R.byId(film) as { film?: { shots: { name: string; role: string[] }[] } } & Record<string, unknown> | undefined
        if (!m) throw new Error(`No template “${film}”`)
        const a = await run({
          job: "plan",
          maxTokens: 3000,
          messages: [
            { role: "system", content: "You write a story contract for a launch film template: its idea in one sentence, the story shape (launch, problem-solution, before-after, day-in-life, countdown, teaser, walkthrough), the kinds of product it suits and doesn't, its tone, its pace (1 calm to 3 fast), what it needs (how many features, whether a real number, whether the product's site), each shot's job, and for each text slot what it means (name, product, kicker, hook, pain, old-way, promise, benefit, feature, feature-list, action, detail, proof, tagline, cta, url, ui, example), how to write it in a line, which feature it carries (0 = strongest) and whether it must be a real figure. JSON only, in the shape: {film, idea, arc, fits[], avoid[], tone, pace, needs:{features, proof, site}, shots:{name: job}, slots:{key:{means, say, feature?, factual?}}}." },
            { role: "user", content: JSON.stringify({ film, about: m.blurb, shots: m.film?.shots, slots: L.slotsFor(film).map((s) => ({ key: s.key, kind: s.kind, label: s.label, hint: s.hint, example: s.example })) }) },
          ],
        })
        const raw = parseJSON(a.text) as Contract
        // (models echo the shape's "feature?" as a key: the rules' own names, kept only when set)
        const slots = Object.fromEntries(Object.entries(raw.slots ?? {}).map(([k, r]) => {
          const x = Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([f, v]) => [f.replace(/\?$/, ""), v]).filter(([, v]) => v !== null && v !== undefined && v !== "")) as Contract["slots"][string]
          return [k, x]
        }))
        const c: Contract = { ...raw, slots, film, by: "draft" }
        writeFileSync(join(contracts, `${film}.json`), JSON.stringify(c, null, 1))
        return c
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__film/")) return next()
        const what = url.pathname.slice("/__film/".length)
        try {
          // (a frozen panel carries its fonts and pictures: it may be a few MB)
          const body = req.method === "POST" ? (JSON.parse((await read(req, what === "panel-snapshot" ? 1.2e7 : 4e6)) || "{}") as Record<string, unknown>) : {}
          const get = (id: unknown) => {
            const f = load(String(id ?? ""))
            if (!f) throw Object.assign(new Error("No such film"), { code: 404 })
            return f
          }
          if (what === "templates") return json(res, 200, (await templates()).map((x) => ({ ...x.t, contract: x.c })))
          if (what === "brief" && req.method === "GET") return json(res, 200, loadBrief(url.searchParams.get("kit") ?? "") ?? null)
          if (what === "brief") {
            const k = loadKit(String(body.kit))
            if (!k) return json(res, 404, { error: "No such product kit" })
            if (body.brief) {
              const b = { ...(body.brief as Brief), by: "you" as const, updated: new Date().toISOString() }
              saveBrief(k.id, b)
              return json(res, 200, b)
            }
            const log: Stage[] = []
            const b = await writeBrief(k, log)
            saveBrief(k.id, b)
            return json(res, 200, { brief: b, log })
          }
          if (what === "pick") {
            const k = loadKit(String(body.kit))
            if (!k) return json(res, 404, { error: "No such product kit" })
            const { M } = await mods()
            const b = loadBrief(k.id) ?? M.briefFromKit(k)
            return json(res, 200, M.pick(b, await templates(), { size: body.size as string, length: Number(body.length) || undefined, kitFiles: k.files, taste: taste() }))
          }
          if (what === "make") return json(res, 200, await make({ kit: String(body.kit), template: body.template as string, size: body.size as string, length: Number(body.length) || undefined, fresh: !!body.fresh }))
          if (what === "sequence") return json(res, 200, await makeSequence(body as Parameters<typeof makeSequence>[0]))
          if (what === "direct") return json(res, 200, body.review ? await directed(body as Parameters<typeof directed>[0]) : await direct(body as Parameters<typeof direct>[0]))
          // a flow written by hand (no product kit needed): fitted to its own choreography, made into a film
          if (what === "flow") {
            const { FL } = await mods()
            const fl = body.flow as FlowT | undefined
            if (!fl?.scenes?.length || !fl.name || !fl.accent) return json(res, 400, { error: "Give the flow: { name, accent, scenes: [...] } (src/studio/flow.ts)." })
            const flow = FL.fitted({ ...fl, pace: fl.pace ?? FL.SOFT_MORPH })
            const t0 = Date.now()
            const log: Stage[] = []
            const f = await filmOfFlow(flow, { name: String(body.name ?? fl.name), summary: String(body.summary ?? ""), size: body.size as string | undefined, mood: body.mood as string | undefined, log })
            step(log, "flow", t0, null, `${flow.scenes.length} scenes (${flow.scenes.map((s) => s.kind).join(" → ")}), ${FL.lengthOf(flow).toFixed(1)} s`)
            save(f)
            return json(res, 200, { id: f.id, length: FL.lengthOf(flow), scenes: flow.scenes.map((s) => ({ kind: s.kind, dur: s.dur })) })
          }
          if (what === "review") return json(res, 200, await review(get(body.id)))
          if (what === "panel-capture") {
            const p = (body.panel ?? {}) as Partial<PanelT>
            if (!body.url || !p.title) return json(res, 400, { error: "Give the app's url and the panel ({ title, rows, ctas })." })
            return json(res, 200, await capturePanel(String(body.url), { id: p.id ?? "", file: p.file ?? "", title: p.title, rows: p.rows ?? [], ctas: p.ctas ?? [] }))
          }
          // a card of the product's own (a post, a message, a result), frozen by words in it
          if (what === "card-capture") {
            if (!body.url || !body.text) return json(res, 400, { error: "Give the app's url and words in the card (text)." })
            return json(res, 200, await capturePanel(String(body.url), { id: "", file: "", title: "", rows: [], ctas: [] }, String(body.text)))
          }
          if (what === "panel-snapshot") {
            const html = String(body.html ?? "")
            if (!html.includes("data-unfold-root") || html.length > 8e6) return json(res, 400, { error: "Not a captured panel (public/panel-capture.js makes one)." })
            return json(res, 200, { src: keepSnapshot(html) })
          }
          // the panels a directed film could build, found in the product's code
          if (what === "panels") {
            const k = loadKit(String(url.searchParams.get("kit") ?? body.kit))
            if (!k) return json(res, 404, { error: "No such product kit" })
            return json(res, 200, await codePanels(k, (url.searchParams.get("project") ?? body.project ?? undefined) as string | undefined))
          }
          // the generator: the shapes it knows (each one idea), and any asset made for a product on demand
          if (what === "assets") return json(res, 200, (await mods()).SP.METAPHORS)
          if (what === "asset") {
            const k = loadKit(String(body.kit))
            if (!k) return json(res, 404, { error: "No such product kit" })
            const kind = String(body.kind)
            const url = kind === "world" ? await gen.world(k) : kind === "mark" ? await gen.mark(k) : kind === "shape" ? await gen.shape(k, String(body.id)) : null
            if (!url) return json(res, 400, { error: "kind: world, mark or shape (with id)" })
            return json(res, 200, { url })
          }
          if (what.startsWith("media/")) {
            const name = what.slice("media/".length)
            const types: Record<string, string> = { mp4: "video/mp4", html: "text/html; charset=utf-8", png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" }
            const ext = name.split(".").pop() ?? ""
            if (!/^[\w-]+\.\w+$/.test(name) || !types[ext] || !existsSync(join(media, name))) return json(res, 404, { error: "No such file" })
            return sendFile(req, res, join(media, name), types[ext])
          }
          if (what === "get") return json(res, 200, get(url.searchParams.get("id")))
          if (what === "list")
            return json(res, 200, readdirSync(dir).filter((x) => x.endsWith(".json")).map((x) => JSON.parse(readFileSync(join(dir, x), "utf8")) as FilmRecord).map((f) => ({ id: f.id, kit: f.kit, name: f.name, made: f.made, versions: f.versions.length, keep: f.keep })).sort((a, b) => (a.made < b.made ? 1 : -1)))
          if (what === "edit") {
            const f = get(body.id)
            if (f.versions.at(-1)?.film === "sequence" || f.versions.at(-1)?.film === "directed") return json(res, 400, { error: "A film of several templates can't be edited yet: change its parts and make it again (POST /__film/sequence)." })
            let ops = Array.isArray(body.ops) ? (body.ops as Op[]) : []
            let say = ""
            if (!ops.length && typeof body.note === "string" && body.note.trim()) ({ ops, say } = await noteToOps(f, body.note.trim()))
            if (!ops.length) return json(res, 200, { film: f, say: say || "Nothing to change." })
            return json(res, 200, { film: await edit(f, ops, typeof body.note === "string" ? body.note : undefined), say, ops })
          }
          if (what === "render") return json(res, 200, { job: await render(get(body.id), !!body.draft, !!body.stills) })
          if (what === "critic") return json(res, 200, await critic(get(body.id)))
          if (what === "keep") {
            const f = get(body.id)
            f.keep = !!body.keep
            save(f)
            return json(res, 200, { ok: true })
          }
          if (what === "contract") return json(res, 200, await draftContract(String(body.film)))
          next()
        } catch (e) {
          const err = e as Error & { code?: number }
          json(res, err.code ?? 500, { error: err.message })
        }
      })
    },
  }
}
