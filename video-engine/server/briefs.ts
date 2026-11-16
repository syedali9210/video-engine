// Directing briefs, one per film template, in a fixed shape: the intent, what's locked, what may vary, the rules, the
// story beats, a directing note for each of its shots, the sound, the references. The generator writes new intros,
// scenes, transitions and title reveals in the engine's scene language (the Lab's guidelines) within what the brief
// allows, each placed among the template's own shots so it's seen in its film; the checker reads every one. Notes to
// edits: a note in plain words ("make the intro punchier") becomes the film's script changed, to look at before it's
// taken. All of it on the Work API.
//   GET  /__briefs/list · /__briefs/get?film=
//   POST /__briefs/save { film, brief } · /__briefs/generate { film, kind, count, note? } · /__briefs/edit { script, note }
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { parseJSON } from "./ai.ts"
import { run } from "./work.ts"

export type Brief = { film: string; intent: string; locked: string; vary: string; rules: string; beats: string; notes: Record<string, string>; sound: string; references: string; updated: string }
export const KINDS = { intro: "a new opening: one or two shots before the film's first", scene: "a new scene the film doesn't have, placed where it serves the story", transition: "a bridge between two of its shots: one short shot that carries the move across the cut", type: "a title reveal: one shot of words with a type animation" } as const
export type Kind = keyof typeof KINDS
type Shot = Record<string, unknown> & { name?: string; dur?: number; clip?: string }
type Script = { id: string; name: string; version: number; source: string; summary: string; ground: string; why: string[]; avoid: string[]; shots: Shot[]; size?: string; category?: string }
type ScriptMod = { validateScript: (raw: unknown) => { script?: Script; errors: string[] } }
type LibMod = { LIBRARY: { id: string; film: string; template: string; name: string; at: number; dur: number; role: string[]; energy: number; enter: string; exit: string; size: string; look: string }[] }

let dir = join(process.cwd(), ".engine-data", "briefs")
const file = (film: string) => join(dir, `${film}.json`)
export function loadBrief(film: string): Brief | null {
  try {
    return JSON.parse(readFileSync(file(film), "utf8")) as Brief
  } catch {
    return null
  }
}
const clean = (film: string, b: Record<string, unknown>): Brief => {
  const s = (k: string) => String(b[k] ?? "").slice(0, 4000)
  const notes = b.notes && typeof b.notes === "object" ? Object.fromEntries(Object.entries(b.notes as Record<string, unknown>).map(([k, v]) => [k.slice(0, 80), String(v ?? "").slice(0, 1000)]).filter(([, v]) => v.trim())) : {}
  return { film, intent: s("intent"), locked: s("locked"), vary: s("vary"), rules: s("rules"), beats: s("beats"), notes, sound: s("sound"), references: s("references"), updated: new Date().toISOString() }
}
const briefText = (b: Brief, shots: LibMod["LIBRARY"]) =>
  [
    `Intent: ${b.intent || "(not written)"}`,
    `Locked (never change): ${b.locked || "(not written)"}`,
    `May vary: ${b.vary || "(not written)"}`,
    `Rules: ${b.rules || "(not written)"}`,
    `Story beats: ${b.beats || "(not written)"}`,
    `Its shots, in order, with the director's notes:\n${shots.map((s, i) => `${i + 1}. ${s.id} “${s.name}” (${s.dur} s, ${s.role.join("/")}, energy ${s.energy}, comes in ${s.enter}, leaves ${s.exit})${b.notes[s.id] ? ` — ${b.notes[s.id]}` : ""}`).join("\n")}`,
    `Sound: ${b.sound || "(not written)"}`,
    `References: ${b.references || "(none)"}`,
  ].join("\n")

/** The template's film as a script of its own shots (clips), a generated shot or two placed among them. */
function placed(film: string, lib: LibMod["LIBRARY"], take: { title?: string; why?: string; place?: string; shots?: Shot[] }): Script {
  const own: Shot[] = lib.filter((s) => s.film === film).map((s) => ({ name: s.name, dur: s.dur, cut: "cut", why: "The template's own shot.", clip: s.id, role: s.role[0] }))
  const fresh = (take.shots ?? []).slice(0, 3).map((s) => ({ ...s, why: String(s.why ?? take.why ?? "") }))
  const where = String(take.place ?? "before")
  const after = where.startsWith("after:") ? own.findIndex((s) => s.clip === where.slice(6)) : -1
  const instead = where.startsWith("replace:") ? own.findIndex((s) => s.clip === where.slice(8)) : -1
  const shots = instead >= 0 ? [...own.slice(0, instead), ...fresh, ...own.slice(instead + 1)] : after >= 0 ? [...own.slice(0, after + 1), ...fresh, ...own.slice(after + 1)] : [...fresh, ...own]
  return { id: `${film}-${String(take.title ?? "take").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, name: String(take.title ?? "A take").slice(0, 60), version: 1, source: `the generator, from ${film}'s brief`, summary: String(take.why ?? "").slice(0, 400), ground: "black", why: [String(take.why ?? "").slice(0, 300)], avoid: [], shots, size: lib.find((s) => s.film === film)?.size }
}

/** New ideas for a template within its brief: `count` takes of one kind, each a script (its film with the idea in it). */
export async function generate(server: ViteDevServer, film: string, kind: Kind, count: number, note = "", taste = "") {
  const { LIBRARY } = (await server.ssrLoadModule("/src/studio/library.ts")) as LibMod
  const { validateScript } = (await server.ssrLoadModule("/src/studio/script.ts")) as ScriptMod
  const shots = LIBRARY.filter((s) => s.film === film)
  if (!shots.length) throw new Error("No such film template")
  const brief = loadBrief(film) ?? clean(film, {})
  const guidelines = readFileSync(join(server.config.root, "src/studio/lab/guidelines.md"), "utf8").slice(0, 9000)
  const a = await run({
    job: "plan",
    fresh: true,
    temperature: 0.9,
    maxTokens: 12000,
    messages: [
      { role: "system", content: `You direct launch films in the engine's scene language. The language and the rules:\n\n${guidelines}\n\nYou write within the director's brief: never touch what it locks, vary only what it lets vary, keep its rules. Answer with JSON only: {"takes": [{"title": "...", "why": "one sentence: what it does for the film", "place": "before" | "after:<shot id>" | "replace:<shot id>", "shots": [<one to three shots in the scene language: name, dur, cut, why, and device / view / layers / ground / paint / fx as the language allows>]}]}` },
      { role: "user", content: `The template: ${shots[0].template}.\n\nIts brief:\n${briefText(brief, shots)}${taste ? `\n\nWhat the director's verdicts have taught (lean towards what was kept, away from what was turned down, and keep every rule):\n${taste}` : ""}\n\nWrite ${count} different takes, each ${KINDS[kind]}.${note ? `\nThe director's note: ${note}` : ""}` },
    ],
  })
  const j = parseJSON(a.text) as { takes?: { title?: string; why?: string; place?: string; shots?: Shot[] }[] }
  const takes = (j.takes ?? []).slice(0, Math.max(1, Math.min(6, count)))
  return {
    by: `${a.provider} · ${a.model}`,
    takes: takes.map((t) => {
      const v = validateScript(placed(film, LIBRARY, t))
      return { title: String(t.title ?? "A take"), why: String(t.why ?? ""), place: String(t.place ?? "before"), script: v.script ?? null, errors: v.errors }
    }),
  }
}

/** A note in plain words made into the film's script, changed: the whole script back, checked. */
export async function edit(server: ViteDevServer, script: Script, note: string) {
  const { validateScript } = (await server.ssrLoadModule("/src/studio/script.ts")) as ScriptMod
  const guidelines = readFileSync(join(server.config.root, "src/studio/lab/guidelines.md"), "utf8").slice(0, 9000)
  const a = await run({
    job: "plan",
    fresh: true,
    maxTokens: 16000,
    messages: [
      { role: "system", content: `You edit launch films written in the engine's scene language. The language and the rules:\n\n${guidelines}\n\nMake the change the director asks for and nothing else: keep every shot you weren't asked to change exactly as it is (a shot with a "clip" is a template's own shot: keep its clip, change only its dur or cut if asked). Answer with the whole script as JSON, and a "changes" list: [{"what": "...", "why": "..."}].` },
      { role: "user", content: `The note: ${note}\n\nThe film's script:\n${JSON.stringify(script)}` },
    ],
  })
  const j = parseJSON(a.text) as Record<string, unknown> & { changes?: { what?: string; why?: string }[] }
  const v = validateScript({ ...j, id: script.id, name: script.name })
  return { script: v.script ?? null, errors: v.errors, changes: (j.changes ?? []).map((c) => ({ what: String(c.what ?? ""), why: String(c.why ?? "") })).slice(0, 12), by: `${a.provider} · ${a.model}` }
}

/** One night's take for the briefs, in turn: the next brief written, one idea of a kind it hasn't had lately. */
export async function nightTake(server: ViteDevServer, night: number) {
  if (!existsSync(dir)) return null
  const briefs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort()
  if (!briefs.length) return null
  const film = briefs[night % briefs.length]
  const kinds = Object.keys(KINDS) as Kind[]
  const kind = kinds[Math.floor(night / briefs.length) % kinds.length]
  const r = await generate(server, film, kind, 1)
  const t = r.takes.find((x) => x.script)
  return t ? { film, kind, ...t, by: r.by } : null
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}
const readBody = (req: IncomingMessage) =>
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
const FILM = /^[\w-]{3,60}$/

export function briefs(): Plugin {
  return {
    name: "briefs",
    async configureServer(s) {
      const { fromEngine } = await import("./studio")
      dir = join(s.config.root, ".engine-data", "briefs")
      mkdirSync(dir, { recursive: true })
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__briefs/")) return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        const what = url.pathname.split("/")[2]
        void (async () => {
          try {
            if (req.method === "GET") {
              if (what === "list")
                return json(
                  res,
                  200,
                  readdirSync(dir)
                    .filter((f) => f.endsWith(".json"))
                    .map((f) => loadBrief(f.slice(0, -5)))
                    .filter(Boolean),
                )
              const film = url.searchParams.get("film") ?? ""
              return json(res, 200, FILM.test(film) ? (loadBrief(film) ?? clean(film, {})) : null)
            }
            const b = await readBody(req)
            const film = String(b.film ?? "")
            if (what === "save") {
              if (!FILM.test(film)) return json(res, 400, { error: "Which template?" })
              const brief = clean(film, (b.brief ?? {}) as Record<string, unknown>)
              writeFileSync(file(film), JSON.stringify(brief, null, 2))
              return json(res, 200, brief)
            }
            if (what === "generate") {
              if (!FILM.test(film)) return json(res, 400, { error: "Which template?" })
              const kind = (Object.keys(KINDS).includes(String(b.kind)) ? b.kind : "scene") as Kind
              return json(res, 200, await generate(s, film, kind, Math.max(1, Math.min(6, Number(b.count) || 3)), String(b.note ?? "").slice(0, 600), String(b.taste ?? "").slice(0, 3000)))
            }
            if (what === "edit") {
              const note = String(b.note ?? "").trim().slice(0, 600)
              if (!note || !b.script) return json(res, 400, { error: "A note and a film, please." })
              return json(res, 200, await edit(s, b.script as Script, note))
            }
            return json(res, 404, { error: "Not found" })
          } catch (e) {
            return json(res, 502, { error: (e as Error).message })
          }
        })()
      })
    },
  }
}
