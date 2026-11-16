// The template lab's AI: Google's Gemini API (one key from Google AI Studio, any Gemini model by its id), through its
// OpenAI-compatible endpoint for proposals, and its own API where only it will do: searching the web (grounded in
// Google Search) and watching films on YouTube. Server-side only: the key is read from the environment or the
// project's .env.local (git ignores it) and never reaches the page.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

let root = process.cwd()
/** Read .env.local and .env into process.env (what's already set wins), once the project's root is known. */
export function loadEnv(dir: string) {
  root = dir
  for (const f of [".env.local", ".env"]) {
    const p = join(dir, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  }
}
export const aiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
/** GEMINI_BASE_URL points it at another OpenAI-compatible endpoint (a proxy, or a stand-in in a test). */
export const aiUrl = () => (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "")
/** The last four characters, to show which key is set without showing it. */
export const keyHint = () => (aiKey() ? `…${aiKey().slice(-4)}` : "")

/** Save a value in .env.local (replacing an old one; empty removes it), and use it from now on. */
export function saveEnv(name: string, value: string) {
  const p = join(root, ".env.local")
  const lines = existsSync(p) ? readFileSync(p, "utf8").split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${name}\\s*=`).test(l)) : []
  while (lines.length && !lines.at(-1)?.trim()) lines.pop()
  if (value) lines.push(`${name}=${value}`)
  writeFileSync(p, lines.length ? lines.join("\n") + "\n" : "")
  if (value) process.env[name] = value
  else delete process.env[name]
}
export const saveKey = (key: string) => saveEnv("GEMINI_API_KEY", key)

export type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
export type Msg = { role: "system" | "user" | "assistant"; content: string | Part[] }
/** `finish`: how the reply ended; "length" means it ran out of room and was cut off mid-sentence */
export type Reply = { text: string; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number }; finish?: string }

/** What went wrong, in Gemini's words (it answers `{error}` or `[{error}]`). */
function why(text: string) {
  try {
    const j = JSON.parse(text)
    return (Array.isArray(j) ? j[0] : j)?.error?.message ?? text.slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** A request, tried again when the trouble is passing: the service busy or failing for a moment (500, 502, 503, 504),
    the network dropping, or a per-minute rate limit that says when to come back (within 45 s). Twice more at most,
    a little later each time; anything else (a bad key, a day's quota used up, a bad request) fails at once. `who`: the
    service, by name, in the words of a failure; `most`: how many more tries (none: only the words). */
export async function retrying<T>(send: () => Promise<T>, who = "Gemini", most = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send()
    } catch (e) {
      const err = e as Error & { status?: number; retryAfter?: number }
      const s = err.status
      const wait =
        s && [500, 502, 503, 504].includes(s) ? [3000, 9000][attempt] : s === 429 && err.retryAfter && err.retryAfter <= 45000 ? err.retryAfter + 500 : !s && /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket/i.test(err.message) ? [2000, 6000][attempt] : undefined
      if (wait === undefined || attempt >= most) {
        // the network or the clock, in words. A timeout is a DOMException, whose message can't be set (assigning it
        // threw "Cannot set property message … which has only a getter" instead), so the words go on a new error
        let msg = err.message
        if (!s && /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket/i.test(msg)) msg = `Couldn't reach ${who}: ${who === "Gemini" ? "the network seems to be down, or blocked" : "it isn't running, or the network is down"}`
        else if (err.name === "TimeoutError" || /aborted due to timeout/i.test(msg)) msg = `${who} didn't answer in time. Try again, or pick a lighter model in Settings`
        if (attempt > 0) msg = `${msg} (tried ${attempt + 1} times)`
        if (msg === err.message) throw err
        throw Object.assign(new Error(msg, { cause: err }), { status: err.status, retryAfter: err.retryAfter, resetAt: (err as { resetAt?: number }).resetAt })
      }
      await sleep(wait)
    }
  }
}

/** How long a "retry in 23.4s" asks for, ms (none when it's hours away, or not said). */
const retryAfter = (text: string) => {
  const m = /retry in ([\d.]+)s/i.exec(why(text))
  return m ? Number(m[1]) * 1000 : undefined
}

/** When a day's allowance comes back (ms since 1970), from a 429 that says it's hours away; none for a minute's. */
function resetAt(text: string) {
  const m = why(text)
  const back = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(m)
  const ms = ((Number(back?.[1] ?? 0) * 60 + Number(back?.[2] ?? 0)) * 60 + Number(back?.[3] ?? 0)) * 1000
  return /per_?day|free_tier_requests/i.test(m) && ms > 5 * 60000 ? Date.now() + ms : undefined
}

/** A 429 in words: which allowance ran out, on which model, and when it comes back. Gemini says it as
    "Quota exceeded for metric: …free_tier_requests, limit: 20, model: gemini-3.8-flash … Please retry in 15h7m14.8s". */
export function rateWords(text: string) {
  const m = why(text)
  const limit = /limit: (\d+)/.exec(m)?.[1]
  const model = /model: ([\w.-]+)/.exec(m)?.[1]
  const back = /retry in ((?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?)/i.exec(m)
  const h = Number(back?.[2] ?? 0)
  const min = Number(back?.[3] ?? 0)
  const s = Math.ceil(Number(back?.[4] ?? 0))
  const when = h ? `in about ${h} h${min ? ` ${min} min` : ""}` : min ? `in about ${min + (s > 30 ? 1 : 0)} min` : s ? `in ${s} s` : "later"
  if (/per_?day|free_tier_requests/i.test(m) && limit && (h || min > 5))
    return `Your key's free tier allows ${limit} requests a day${model ? ` on ${model}` : ""}, and today's are used up: they're back ${when}. Pick another model in Settings (each has its own allowance), or wait.`
  return `Too many requests for your key just now (429): try again ${when}.${model ? ` (${model})` : ""}`
}
/** Where a request goes: Gemini on the lab's key, unless another OpenAI-compatible endpoint and its key are given
    (the Work API's providers, server/work.ts). */
export type Via = { url: string; key: string; name: string }
async function postOnce(path: string, body: unknown, timeoutMs: number, via?: Via) {
  const key = via ? via.key : aiKey()
  if (!key) throw new Error("No Gemini API key: add it in the lab's Settings.")
  const r = await fetch((via?.url ?? aiUrl()) + path, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await r.text()
  if (!r.ok) {
    const msg = why(text)
    const e = new Error(r.status === 429 ? rateWords(text) : r.status === 503 ? `${via?.name ?? "Gemini"} is busy right now (503): ${msg}` : `${r.status}: ${msg}`) as Error & { status: number; retryAfter?: number; resetAt?: number }
    e.status = r.status
    e.retryAfter = retryAfter(text)
    if (r.status === 429) e.resetAt = resetAt(text)
    throw e
  }
  return JSON.parse(text)
}

/** One chat completion. With `schema`, the model is asked for JSON matching it (structured outputs where the model
    takes them; where it doesn't, the request is retried asking for JSON in words). `via`: another endpoint; `once`: no
    second try when it's busy (the Work API moves on to the next provider instead). */
export async function chat(o: { model: string; messages: Msg[]; schema?: { name: string; schema: object }; maxTokens?: number; temperature?: number; timeoutMs?: number; via?: Via; once?: boolean }): Promise<Reply> {
  const base = { model: o.model, messages: o.messages, max_tokens: o.maxTokens ?? 16000, temperature: o.temperature ?? 0.6 }
  const t = o.timeoutMs ?? 240000
  const post = (body: unknown) => retrying(() => postOnce("/chat/completions", body, t, o.via), o.via?.name, o.once ? 0 : 2)
  const read = (j: { choices?: { message?: { content?: string }; finish_reason?: string }[]; model?: string; usage?: Reply["usage"] }): Reply => ({ text: j.choices?.[0]?.message?.content ?? "", model: j.model ?? o.model, usage: j.usage, finish: j.choices?.[0]?.finish_reason })
  if (!o.schema) return read(await post(base))
  try {
    return read(await post({ ...base, response_format: { type: "json_schema", json_schema: { name: o.schema.name, schema: o.schema.schema } } }))
  } catch (e) {
    if ((e as { status?: number }).status !== 400 || /api key/i.test((e as Error).message)) throw e
    // the model doesn't take this schema: say it in words
    const say: Msg = { role: "system", content: `Answer with one JSON object only, no prose, matching this JSON schema: ${JSON.stringify(o.schema.schema)}` }
    return read(await post({ ...base, messages: [...o.messages, say] }))
  }
}

/** The models that can write (Gemini and Gemma, by id: "gemini-3.8-flash"), not the ones that draw, speak or embed. */
export async function listModels(): Promise<string[]> {
  const key = aiKey()
  const r = await fetch(aiUrl() + "/models", { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status}: couldn't list the models (${why(await r.text())})`)
  const j = (await r.json()) as { data?: { id?: string; name?: string }[]; models?: (string | { id?: string; name?: string })[] }
  const list = j.data ?? j.models ?? []
  return list
    .map((m) => (typeof m === "string" ? m : (m.id ?? m.name ?? "")).replace(/^models\//, ""))
    .filter((id) => /^(gemini|gemma)/.test(id) && !/embed|tts|image|live|transcribe|veo|imagen|omni|aqa/.test(id))
}

/* ---------------- Gemini's own API: Google Search, and films it watches ---------------- */

/** Gemini's own endpoint, beside the OpenAI-compatible one: only it takes Google Search grounding and videos. */
export const nativeUrl = () => aiUrl().replace(/\/openai$/, "")
/** `video`: a YouTube film; `file`: one uploaded with uploadFile (a video); `inline`: a picture, base64 */
export type GPart = { text: string } | { video: string; from?: number; to?: number } | { file: string; mime: string } | { inline: string; mime: string }
/** `finish`: how the reply ended (MAX_TOKENS: cut off) */
export type Grounded = { text: string; model: string; sources: { uri: string; title: string }[]; queries: string[]; usage: { in?: number; out?: number }; finish?: string }
type GReply = {
  modelVersion?: string
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/** One request to Gemini's own API. `search`: grounded with Google Search (it answers in words, citing what it found).
    A `{ video }` part is a YouTube film it watches, its first minutes at a low resolution, so a film costs a few
    thousand tokens. `schema`: a JSON answer to that JSON schema (retried asking for JSON in words if the model won't). */
export async function gemini(o: { model: string; system?: string; parts: GPart[]; search?: boolean; schema?: object; maxTokens?: number; timeoutMs?: number }): Promise<Grounded> {
  const key = aiKey()
  if (!key) throw new Error("No Gemini API key: add it in the lab's Settings.")
  const parts = o.parts.map((p) =>
    "text" in p
      ? { text: p.text }
      : "inline" in p
        ? { inline_data: { mime_type: p.mime, data: p.inline } }
        : "file" in p
          ? { file_data: { mime_type: p.mime, file_uri: p.file } }
          : { file_data: { file_uri: p.video }, video_metadata: { start_offset: `${p.from ?? 0}s`, end_offset: `${p.to ?? 120}s` } },
  )
  const send = async (schema: boolean) => {
    const body = {
      ...(o.system ? { system_instruction: { parts: [{ text: o.system }] } } : {}),
      contents: [{ role: "user", parts: schema || !o.schema ? parts : [...parts, { text: `Answer with one JSON object only, matching this JSON schema: ${JSON.stringify(o.schema)}` }] }],
      ...(o.search ? { tools: [{ google_search: {} }] } : {}),
      generation_config: {
        max_output_tokens: o.maxTokens ?? 8000,
        temperature: 0.5,
        ...(o.parts.some((p) => "video" in p || ("file" in p && p.mime.startsWith("video/"))) ? { media_resolution: "MEDIA_RESOLUTION_LOW" } : {}),
        ...(o.schema ? { response_mime_type: "application/json", ...(schema ? { response_json_schema: o.schema } : {}) } : {}),
      },
    }
    return retrying(async () => {
      const r = await fetch(`${nativeUrl()}/models/${encodeURIComponent(o.model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 300000),
      })
      const text = await r.text()
      if (!r.ok) {
        const e = new Error(r.status === 429 ? rateWords(text) : r.status === 503 ? `Gemini is busy right now (503): ${why(text)}` : `${r.status}: ${why(text)}`) as Error & { status: number; retryAfter?: number; resetAt?: number }
        e.status = r.status
        e.retryAfter = retryAfter(text)
        if (r.status === 429) e.resetAt = resetAt(text)
        throw e
      }
      return JSON.parse(text) as GReply
    })
  }
  let j: GReply
  try {
    j = await send(true)
  } catch (e) {
    if (!o.schema || (e as { status?: number }).status !== 400 || /api key/i.test((e as Error).message)) throw e
    j = await send(false)
  }
  const c = j.candidates?.[0]
  const text = (c?.content?.parts ?? [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
  if (!text && c?.finishReason && c.finishReason !== "STOP") throw new Error(`Gemini stopped without an answer (${c.finishReason}).`)
  const g = c?.groundingMetadata
  return {
    text,
    model: j.modelVersion ?? o.model,
    sources: (g?.groundingChunks ?? []).flatMap((x) => (x.web?.uri ? [{ uri: x.web.uri, title: x.web.title ?? "" }] : [])),
    queries: g?.webSearchQueries ?? [],
    usage: { in: j.usageMetadata?.promptTokenCount, out: j.usageMetadata?.candidatesTokenCount },
    finish: c?.finishReason,
  }
}

/** A file (a video too big to send inline) uploaded to Gemini's file store, ready once Gemini has processed it: its
    address, for a `{ file }` part. Gemini keeps it two days. */
export async function uploadFile(data: Buffer, mime: string, name: string): Promise<string> {
  const key = aiKey()
  if (!key) throw new Error("No Gemini API key: add it in the lab's Settings.")
  const start = await fetch(`${nativeUrl().replace(/\/v1beta$/, "/upload/v1beta")}/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(data.length),
      "x-goog-upload-header-content-type": mime,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, 120) } }),
  })
  const at = start.headers.get("x-goog-upload-url")
  if (!start.ok || !at) throw new Error(`Gemini wouldn't take the file (${start.status}): ${why(await start.text())}`)
  const up = await fetch(at, { method: "POST", headers: { "x-goog-upload-command": "upload, finalize", "x-goog-upload-offset": "0", "content-length": String(data.length) }, body: new Uint8Array(data) })
  const j = (await up.json().catch(() => ({}))) as { file?: { name?: string; uri?: string; state?: string } }
  if (!up.ok || !j.file?.uri || !j.file.name) throw new Error(`The upload to Gemini failed (${up.status}).`)
  // a video is processed before it can be watched: asked after every few seconds, for up to three minutes
  let state = j.file.state
  for (let i = 0; state === "PROCESSING" && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = (await (await fetch(`${nativeUrl()}/${j.file.name}`, { headers: { "x-goog-api-key": key } })).json().catch(() => ({}))) as { state?: string }
    state = s.state
  }
  if (state && state !== "ACTIVE") throw new Error(state === "PROCESSING" ? "Gemini is still processing the video after three minutes: try again in a moment." : `Gemini couldn't read the file (${state}).`)
  return j.file.uri
}

/** A YouTube video as YouTube itself describes it (title, channel), or null if there's no such public video: the
    check on every address a model gives. */
export async function youtube(url: string): Promise<{ url: string; id: string; title: string; channel: string } | null> {
  const id = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1]
  if (!id) return null
  const watch = `https://www.youtube.com/watch?v=${id}`
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return null
    const j = (await r.json()) as { title?: string; author_name?: string }
    return { url: watch, id, title: String(j.title ?? "").slice(0, 200), channel: String(j.author_name ?? "").slice(0, 100) }
  } catch {
    return null
  }
}

/** How much a model may write in one reply, its thinking included (Gemini thinks before it answers, and the thinking
    counts against the same ceiling, so a short ceiling can leave a long answer cut off half way): the model's own
    ceiling, asked once per model (65,536 for Gemini, 32,768 for Gemma), 16,000 if it can't be asked. */
const ceilings = new Map<string, Promise<number>>()
export function outputLimit(model: string): Promise<number> {
  if (!ceilings.has(model))
    ceilings.set(
      model,
      fetch(`${nativeUrl()}/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": aiKey() }, signal: AbortSignal.timeout(15000) })
        .then((r) => (r.ok ? (r.json() as Promise<{ outputTokenLimit?: number }>) : null))
        .then((j) => (typeof j?.outputTokenLimit === "number" && j.outputTokenLimit >= 4000 ? Math.min(j.outputTokenLimit, 65536) : 16000))
        .catch(() => 16000),
    )
  return ceilings.get(model)!
}

/** A list in a reply (`{"proposals": [...]}`): all of it; or, when the reply broke off part way (cut off, or not
    quite JSON), the items it had written in full before the break. `whole` says which. */
export function parseList(text: string, key: string): { items: unknown[]; whole: boolean } {
  try {
    const j = parseJSON(text) as Record<string, unknown> | null
    const v = j?.[key]
    return { items: Array.isArray(v) ? v : [], whole: true }
  } catch {
    const at = text.indexOf(`"${key}"`)
    const open = at < 0 ? -1 : text.indexOf("[", at)
    const items: unknown[] = []
    if (open < 0) return { items, whole: false }
    let depth = 0
    let inString = false
    let escaped = false
    let start = -1
    for (let i = open + 1; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === "{") {
        if (depth === 0) start = i
        depth++
      } else if (ch === "}") {
        depth--
        if (depth === 0 && start >= 0) {
          try {
            items.push(JSON.parse(text.slice(start, i + 1)))
          } catch {
            // one item that isn't JSON: the others still count
          }
          start = -1
        }
      } else if (ch === "]" && depth === 0) break
    }
    return { items, whole: false }
  }
}

/** Why a reply that should have been a list wasn't, in words. */
export function brokeOff(reply: { finish?: string }, kind: string) {
  return reply.finish === "length" || reply.finish === "MAX_TOKENS"
    ? `Gemini's reply ran out of room and was cut off before it finished a single ${kind} (it thinks before it writes, and the thinking counts too). Nothing was changed: run it again, or ask for fewer a night in Settings.`
    : `Gemini's reply broke off before it finished a single ${kind}, so nothing could be read from it. Nothing was changed: run it again.`
}

/** The first JSON object in a reply (models sometimes wrap it in prose or a code fence). */
export function parseJSON(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("The reply had no JSON in it")
  return JSON.parse(body.slice(start, end + 1))
}
