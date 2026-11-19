// The Work API: the AI the film work runs on (reading what's dropped in, planning films, the critic, the words), on
// keys of its own, apart from the Lab's. One call, run({ job, messages }), asks the providers in the job's order and
// moves on when one is out of requests, down, refuses the key, or can't take the request: Gemini first (a billed key
// keeps unreleased designs out of training), then the free backups that are set up. Answers are cached, each
// provider's requests are counted a day (with a cap), and every call is logged with who answered and why the others
// were passed over. Every provider speaks OpenAI's chat completions; keys live in .env.local (git ignores it) and
// never reach the page.
//   GET  /__work/state · /__work/models?p=groq
//   POST /__work/settings { provider, key?, model?, account?, url?, cap? } · /__work/test { provider }
//   POST /__work/run { job, messages, schema?, fresh?, maxTokens?, temperature? } → { text, provider, model, cached, tried }
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin } from "vite"
import { chat, loadEnv, saveEnv, type Msg, type Reply, type Via } from "./ai.ts"

export type ProviderId = "gemini" | "groq" | "openrouter" | "cloudflare" | "ollama"
/** `out`: the most a reply may be, in tokens (Gemini's thinking counts against it, so it gets room; the others refuse
    a request asking past their model's ceiling, 8,192 being safe for all) */
type Provider = { id: ProviderId; name: string; env?: string; url: string; model?: string; /** its other models, asked in turn when one is overloaded or can't take a request */ fallback?: string[]; keys?: { url: string; where: string }; models?: string[]; out: number }

export const PROVIDERS: Provider[] = [
  { id: "gemini", name: "Gemini", env: "WORK_GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", fallback: ["gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.7-flash", "gemini-flash-latest"], keys: { url: "https://aistudio.google.com/apikey", where: "Google AI Studio" }, out: 16000 },
  { id: "groq", name: "Groq", env: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1", keys: { url: "https://console.groq.com/keys", where: "GroqCloud" }, out: 8192 },
  { id: "openrouter", name: "OpenRouter", env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1", keys: { url: "https://openrouter.ai/keys", where: "OpenRouter" }, out: 8192 },
  // the address carries the account; this endpoint lists no models, so the ones Cloudflare documents for text
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    env: "CLOUDFLARE_API_TOKEN",
    url: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
    keys: { url: "https://dash.cloudflare.com/profile/api-tokens", where: "Cloudflare dashboard" },
    models: ["@cf/openai/gpt-oss-120b", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-4.7-flash"],
    out: 8192,
  },
  { id: "ollama", name: "Ollama (this machine)", url: "http://localhost:11434/v1", out: 8192 },
]

/** What the work asks for, and who it asks in turn. A job that sees pictures goes only to providers that can serve a
    model that sees (Groq's and Cloudflare's text models can't). */
export const JOBS = {
  read: { name: "Reading files", sees: true, chain: ["gemini", "openrouter", "ollama"] },
  plan: { name: "Planning films", sees: false, chain: ["gemini", "groq", "cloudflare", "openrouter", "ollama"] },
  critic: { name: "The critic", sees: true, chain: ["gemini", "openrouter", "ollama"] },
  words: { name: "Words", sees: false, chain: ["gemini", "groq", "cloudflare", "openrouter", "ollama"] },
  quick: { name: "Quick answers", sees: false, chain: ["groq", "gemini", "cloudflare", "openrouter", "ollama"] },
} satisfies Record<string, { name: string; sees: boolean; chain: ProviderId[] }>
export type Job = keyof typeof JOBS

/** A provider as the router sees it: set up (key and model), resting after a 429, its key refused, today's count. */
export type Snap = { setUp: boolean; cooling?: number; refused?: string; used: number; cap: number }

/** Who to ask, in order, and why the others are passed over ("" = ask it). */
export function order(chain: readonly ProviderId[], snap: (id: ProviderId) => Snap, now = Date.now()) {
  return chain.map((id) => {
    const s = snap(id)
    const skip = !s.setUp
      ? "not set up"
      : s.refused
        ? `key refused: ${s.refused}`
        : s.cooling && s.cooling > now
          ? `out of requests for about ${Math.ceil((s.cooling - now) / 60000)} min`
          : s.cap && s.used >= s.cap
            ? `today's ${s.cap} requests used (the cap in Settings)`
            : ""
    return { id, skip }
  })
}

/** What a failure says about the provider: rest until its allowance is back (429, or 402 out of credit), stop using
    the key until it's changed (refused), or nothing (busy, down, slow, can't take this request: just ask the next). */
export function after(e: { status?: number; message: string; resetAt?: number; retryAfter?: number }, now = Date.now()): { cooling?: number; refused?: string } {
  if (e.status === 401 || e.status === 403 || (e.status === 400 && /api key/i.test(e.message))) return { refused: e.message.slice(0, 160) || `${e.status}` }
  if (e.status === 429) return { cooling: e.resetAt ?? now + Math.max(e.retryAfter ?? 0, 60000) }
  if (e.status === 402) return { cooling: now + 3600000 }
  return {}
}

type Settings = { models: Partial<Record<ProviderId, string>>; account?: string; ollama?: string; cap: Partial<Record<ProviderId, number>> }
type Usage = { day: string; n: Partial<Record<ProviderId, number>>; tokens: Partial<Record<ProviderId, number>> }
type Tried = { id: ProviderId; why: string }
type Line = { at: string; job: Job; ok: boolean; provider?: ProviderId; model?: string; cached?: boolean; ms: number; tokens?: number; tried: Tried[]; error?: string }
export type Answer = { text: string; provider: ProviderId; model: string; finish?: string; cached: boolean; tried: Tried[]; /** what it cost (0 from the cache) */ tokens: { in: number; out: number } }

let dir = join(process.cwd(), ".engine-data", "work")
const status = new Map<ProviderId, { cooling?: number; refused?: string }>()

const file = (f: string) => join(dir, f)
function read<T>(f: string, d: T): T {
  try {
    return existsSync(file(f)) ? (JSON.parse(readFileSync(file(f), "utf8")) as T) : d
  } catch {
    return d
  }
}
const write = (f: string, v: unknown) => writeFileSync(file(f), JSON.stringify(v, null, 2))
const today = () => new Date().toLocaleDateString("en-CA")
const settings = (): Settings => ({ models: {}, cap: { gemini: 200 }, ...read<Partial<Settings>>("settings.json", {}) })
const usage = (): Usage => {
  const u = read<Usage>("usage.json", { day: "", n: {}, tokens: {} })
  return u.day === today() ? u : { day: today(), n: {}, tokens: {} }
}
const provider = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!
const keyOf = (p: Provider) => (p.env ? (process.env[p.env] ?? "") : "ollama")
const modelOf = (p: Provider, s = settings()) => s.models[p.id] ?? p.model ?? ""
function via(p: Provider, s = settings()): Via {
  const url = p.id === "ollama" ? (s.ollama ?? p.url) : p.url.replace("{account}", s.account ?? "")
  return { url, key: keyOf(p), name: p.name }
}
function snap(id: ProviderId, s = settings(), u = usage()): Snap {
  const p = provider(id)
  return { setUp: !!keyOf(p) && !!modelOf(p, s) && (id !== "cloudflare" || !!s.account), ...status.get(id), used: u.n[id] ?? 0, cap: s.cap[id] ?? 0 }
}
function count(id: ProviderId, u?: Reply["usage"]) {
  const x = usage()
  x.n[id] = (x.n[id] ?? 0) + 1
  x.tokens[id] = (x.tokens[id] ?? 0) + (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0)
  write("usage.json", x)
}
// ponytail: the log only grows; trim it when reading the last lines gets slow
const log = (l: Line) => appendFileSync(file("log.jsonl"), JSON.stringify(l) + "\n")
function lastLines(n: number): Line[] {
  if (!existsSync(file("log.jsonl"))) return []
  return readFileSync(file("log.jsonl"), "utf8")
    .trim()
    .split("\n")
    .slice(-n)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Line]
      } catch {
        return []
      }
    })
    .reverse()
}

/** One answer for the work, from the first provider in the job's order that can give it. The same question asked
    again comes from the cache (`fresh` asks anyway). Throws, with `tried`, when no one could answer. */
export async function run(o: { job: Job; messages: Msg[]; schema?: { name: string; schema: object }; fresh?: boolean; maxTokens?: number; temperature?: number }): Promise<Answer> {
  const t0 = Date.now()
  const cache = join("cache", createHash("sha256").update(JSON.stringify([o.job, o.messages, o.schema ?? null])).digest("hex").slice(0, 32) + ".json")
  const hit = o.fresh ? null : read<Omit<Answer, "cached" | "tried"> | null>(cache, null)
  if (hit) {
    log({ at: new Date().toISOString(), job: o.job, ok: true, provider: hit.provider, model: hit.model, cached: true, ms: Date.now() - t0, tried: [] })
    return { ...hit, cached: true, tried: [], tokens: { in: 0, out: 0 } }
  }
  const s = settings()
  const u = usage()
  const plan = order(JOBS[o.job].chain, (id) => snap(id, s, u))
  // what wasn't set up isn't a decision: only real passes are kept
  const tried: Tried[] = plan.filter((p) => p.skip && p.skip !== "not set up").map((p) => ({ id: p.id, why: p.skip }))
  const ask = plan.filter((p) => !p.skip)
  for (const [i, { id }] of ask.entries()) {
    const p = provider(id)
    try {
      // the last one asked gets the usual second try when it's busy; before that, the next provider is the second try
      // (a model with another to fall back on is asked once, without the usual waits and retries)
      const room = Math.min(o.maxTokens ?? p.out, p.out)
      const ask1 = (model: string, last: boolean, max = room) => chat({ model, messages: o.messages, schema: o.schema, maxTokens: max, temperature: o.temperature, via: via(p, s), once: !last || i < ask.length - 1, timeoutMs: last ? 120000 : 60000 })
      // a model picked in Settings that can't take this kind of request (one that only answers another API, or has no
      // eyes or system prompt) hands it to the provider's own default model, rather than failing every job
      // (and one that's overloaded, a 503, hands it to the next of the provider's own models)
      const picked = modelOf(p, s)
      const models = [...new Set([picked, ...(p.model ? [p.model] : []), ...(p.fallback ?? [])])]
      let r: Reply | null = null
      for (const [k, m] of models.entries()) {
        try {
          r = await ask1(m, k === models.length - 1)
          // a JSON answer cut off (a thinking model can spend its room thinking): asked once more with all the room
          if (r.finish === "length" && o.schema && room < p.out) r = await ask1(m, k === models.length - 1, p.out)
          break
        } catch (e) {
          const msg = (e as Error).message
          // (Gemini's quotas are a model's own: one used up today leaves the others)
          const passOn = /Interactions API|not enabled|modality|not supported|does not support|no longer available|\(503\)|\(429\)|high demand|overloaded|quota|free tier|used up|requests a day|didn't answer in time/i.test(msg)
          if (!passOn || k === models.length - 1) throw e
          tried.push({ id, why: `${m}: ${msg.slice(0, 90)}; asked ${models[k + 1]}` })
        }
      }
      if (!r) throw new Error("no reply")
      if (!r.text.trim()) throw new Error(r.finish === "length" ? "its reply ran out of room before it said anything" : "an empty reply")
      count(id, r.usage)
      const out = { text: r.text, provider: id, model: r.model, finish: r.finish }
      // (a reply cut off isn't kept: asking again should get a whole one, not this)
      if (r.finish !== "length") write(cache, out)
      log({ at: new Date().toISOString(), job: o.job, ok: true, provider: id, model: r.model, ms: Date.now() - t0, tokens: (r.usage?.prompt_tokens ?? 0) + (r.usage?.completion_tokens ?? 0), tried })
      return { ...out, cached: false, tried, tokens: { in: r.usage?.prompt_tokens ?? 0, out: r.usage?.completion_tokens ?? 0 } }
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: number; retryAfter?: number }
      const next = after(err)
      if (next.cooling || next.refused) status.set(id, { ...status.get(id), ...next })
      tried.push({ id, why: err.message.slice(0, 200) })
    }
  }
  const error = ask.length
    ? `No provider could answer. ${tried.map((t) => `${provider(t.id).name}: ${t.why}`).join(" · ")}`
    : tried.length
      ? `Every provider for ${JOBS[o.job].name.toLowerCase()} is resting. ${tried.map((t) => `${provider(t.id).name}: ${t.why}`).join(" · ")}`
      : "The Work API isn't set up: add its Gemini key in Lab → Settings."
  log({ at: new Date().toISOString(), job: o.job, ok: false, ms: Date.now() - t0, tried, error })
  throw Object.assign(new Error(error), { tried })
}

/** The models a provider's key can use for writing (not the ones that embed, draw, speak or transcribe). OpenRouter's
    free ones only: the backups are there for their free tiers. */
async function models(p: Provider): Promise<string[]> {
  if (p.models) return p.models
  const v = via(p)
  const r = await fetch(v.url + "/models", { headers: p.env ? { authorization: `Bearer ${v.key}` } : {}, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`${p.name} wouldn't list its models (${r.status})`)
  const j = (await r.json()) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] }
  return (j.data ?? j.models ?? [])
    .map((m) => (m.id ?? (m as { name?: string }).name ?? "").replace(/^models\//, ""))
    .filter((id) => id && !/embed|whisper|tts|guard|imagen|image|veo|audio|transcribe|moderation|rerank|live|aqa|orpheus|playai|lyria/i.test(id))
    .filter((id) => p.id !== "openrouter" || id.endsWith(":free"))
    .sort()
}

function state() {
  const s = settings()
  const u = usage()
  const now = Date.now()
  return {
    providers: PROVIDERS.map((p) => {
      const st = status.get(p.id)
      const key = p.env ? (process.env[p.env] ?? "") : ""
      return {
        id: p.id,
        name: p.name,
        keys: p.keys,
        needsKey: !!p.env,
        key: !!key,
        keyHint: key ? `…${key.slice(-4)}` : "",
        model: modelOf(p, s),
        account: p.id === "cloudflare" ? (s.account ?? "") : undefined,
        url: p.id === "ollama" ? (s.ollama ?? p.url) : undefined,
        ready: snap(p.id, s, u).setUp,
        cooling: st?.cooling && st.cooling > now ? st.cooling : undefined,
        refused: st?.refused,
        used: u.n[p.id] ?? 0,
        tokens: u.tokens[p.id] ?? 0,
        cap: s.cap[p.id] ?? 0,
      }
    }),
    jobs: Object.entries(JOBS).map(([id, j]) => ({ id, ...j })),
    log: lastLines(12),
  }
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
const isMsg = (m: unknown): m is Msg => !!m && typeof m === "object" && ["system", "user", "assistant"].includes((m as Msg).role) && (typeof (m as Msg).content === "string" || Array.isArray((m as Msg).content))

export function work(): Plugin {
  return {
    name: "work-api",
    async configureServer(s) {
      // imported here rather than at the top: studio.ts brings the export server with it, and `npm run check` loads
      // this file on its own
      const { fromEngine } = await import("./studio")
      dir = join(s.config.root, ".engine-data", "work")
      mkdirSync(join(dir, "cache"), { recursive: true })
      loadEnv(s.config.root)
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__work/")) return next()
        const what = url.pathname.split("/")[2]
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        void (async () => {
          try {
            if (req.method === "GET") {
              if (what === "state") return json(res, 200, state())
              if (what === "models") {
                const p = PROVIDERS.find((x) => x.id === url.searchParams.get("p"))
                if (!p) return json(res, 404, { error: "No such provider" })
                if (p.env && !keyOf(p)) return json(res, 200, [])
                return json(res, 200, await models(p))
              }
              return json(res, 404, { error: "Not found" })
            }
            const b = await body(req)
            if (what === "run") {
              if (!(typeof b.job === "string" && b.job in JOBS)) return json(res, 400, { error: `Which job? ${Object.keys(JOBS).join(", ")}` })
              if (!Array.isArray(b.messages) || !b.messages.length || !b.messages.every(isMsg)) return json(res, 400, { error: "Messages, please: [{ role, content }]" })
              const schema = b.schema && typeof b.schema === "object" ? (b.schema as { name: string; schema: object }) : undefined
              try {
                return json(res, 200, await run({ job: b.job as Job, messages: b.messages, schema, fresh: b.fresh === true, maxTokens: typeof b.maxTokens === "number" ? b.maxTokens : undefined, temperature: typeof b.temperature === "number" ? b.temperature : undefined }))
              } catch (e) {
                return json(res, 502, { error: (e as Error).message, tried: (e as { tried?: Tried[] }).tried ?? [] })
              }
            }
            const p = PROVIDERS.find((x) => x.id === b.provider)
            if (!p) return json(res, 400, { error: "Which provider?" })
            if (what === "settings") {
              const cur = settings()
              if (typeof b.key === "string" && p.env) {
                const k = b.key.trim()
                // one line in .env.local: a space or a line break would be a second setting
                if (/\s/.test(k) || k.length > 400) return json(res, 400, { error: "That doesn't look like a key: paste just the key." })
                saveEnv(p.env, k)
                status.delete(p.id)
              }
              if (typeof b.model === "string") {
                const m = b.model.trim()
                if (m && !/^[\w@./:-]{1,120}$/.test(m)) return json(res, 400, { error: `“${m.slice(0, 40)}” isn't a model's id.` })
                if (m) cur.models[p.id] = m
                else delete cur.models[p.id]
                status.delete(p.id)
              }
              if (typeof b.account === "string" && p.id === "cloudflare") {
                const a = b.account.trim()
                if (a && !/^[0-9a-f]{32}$/i.test(a)) return json(res, 400, { error: "A Cloudflare account ID is 32 letters and digits (the dashboard's Account home shows it)." })
                cur.account = a || undefined
              }
              if (typeof b.url === "string" && p.id === "ollama") {
                const v = b.url.trim().replace(/\/$/, "")
                if (v && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(v)) return json(res, 400, { error: "An address like http://localhost:11434/v1, please." })
                cur.ollama = v || undefined
              }
              if (typeof b.cap === "number") cur.cap[p.id] = Math.max(0, Math.min(100000, Math.round(b.cap)))
              write("settings.json", cur)
              return json(res, 200, state())
            }
            if (what === "test") {
              const sn = snap(p.id)
              if (!sn.setUp) return json(res, 200, { ok: false, error: `${p.name} isn't set up yet: ${p.env && !keyOf(p) ? "add its key" : p.id === "cloudflare" && !settings().account ? "add the account ID" : "pick a model"}.` })
              const t0 = Date.now()
              try {
                const r = await chat({ model: modelOf(p), messages: [{ role: "user", content: "Reply with the single word: ready" }], maxTokens: Math.min(4000, p.out), via: via(p), once: true, timeoutMs: 60000 })
                status.delete(p.id)
                return json(res, 200, { ok: true, model: r.model, ms: Date.now() - t0, reply: r.text.trim().slice(0, 60) })
              } catch (e) {
                const next = after(e as Error)
                if (next.cooling || next.refused) status.set(p.id, next)
                return json(res, 200, { ok: false, error: (e as Error).message, state: state() })
              }
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
