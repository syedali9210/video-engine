// The film's voice and words in other languages, on the Work API. A voiceover script: a line a scene, as long as the
// scene allows (about 2.6 words a second), in the product's voice. Spoken by Gemini's text-to-speech on the Work API's
// Gemini key (the Interactions API, a prebuilt voice; WAV back), kept on this machine. Translation that re-fits: every
// line of the film in another language, each within its slot's limits (studio/shots.ts fitText), asked again once
// for any that came out too long.
//   POST /__voice/script { scenes, kit?, language? } · /__voice/speak { lines, voice, style? } · /__voice/translate { language, films, texts, kit? }
//   GET  /__voice/file/<id>.wav
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin } from "vite"
import { parseJSON } from "./ai.ts"
import { run } from "./work.ts"

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

export const VOICES = ["Kore", "Puck", "Zephyr", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Sulafat", "Gacrux"]
type Line = { scene: string; text: string }

/** The speech model, and the lighter one a line falls back to when the first is busy or slow. */
const TTS = () => process.env.WORK_TTS_MODEL || "gemini-3.8-flash-tts"
const TTS_LITE = "gemini-3.8-flash-lite-tts"

/** One line spoken (a WAV: 24 kHz, mono, 16-bit), and how long it runs. Under heavy demand a line can take a minute
    or more on the main speech model: one that's busy (429, 503) or past 45 s is asked of the lighter model once. */
async function speak(text: string, voice: string, style: string) {
  try {
    return await speakWith(TTS(), text, voice, style, 45000)
  } catch (e) {
    if (TTS() === TTS_LITE || !/timeout|aborted|\((429|503)\)/i.test((e as Error).message)) throw e
    return speakWith(TTS_LITE, text, voice, style, 90000)
  }
}
async function speakWith(model: string, text: string, voice: string, style: string, ms: number) {
  const key = process.env.WORK_GEMINI_API_KEY
  if (!key) throw new Error("A voice needs the Work API's Gemini key (Lab → Settings → Work API).")
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ type: "user_input", content: [{ type: "text", text, ...(style ? { annotations: [{ type: "speech_metadata", style }] } : {}) }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICES.includes(voice) ? voice : "Kore" }] },
    }),
    signal: AbortSignal.timeout(ms),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`The voice failed (${r.status}): ${body.slice(0, 200)}`)
  const j = JSON.parse(body) as { steps?: { type?: string; content?: { type?: string; data?: string }[] }[] }
  const audio = (j.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "audio").at(-1)?.data
  if (!audio) throw new Error("The voice came back without audio.")
  const wav = Buffer.from(audio, "base64")
  // a 44-byte RIFF header, then 24,000 two-byte samples a second
  return { wav, seconds: Math.round(((wav.length - 44) / 48000) * 100) / 100 }
}

export function voice(): Plugin {
  return {
    name: "voice",
    async configureServer(s) {
      const { fromEngine } = await import("./studio")
      const { loadKit } = await import("./kits")
      const dir = join(s.config.root, ".engine-data", "voice")
      mkdirSync(dir, { recursive: true })
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__voice/")) return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        const [, , what, id] = url.pathname.split("/")
        void (async () => {
          try {
            if (req.method === "GET" && what === "file" && /^[\w-]{8,64}\.wav$/.test(id ?? "") && existsSync(join(dir, id))) {
              res.setHeader("content-type", "audio/wav")
              res.setHeader("cache-control", "private, max-age=86400")
              return res.end(readFileSync(join(dir, id)))
            }
            const b = await readBody(req)
            const kit = typeof b.kit === "string" && /^[\w-]{6,64}$/.test(b.kit) ? loadKit(b.kit) : null
            const about = kit ? JSON.stringify({ name: kit.words.name || kit.name, tagline: kit.words.tagline, features: kit.words.features, proof: kit.words.proof, cta: kit.words.cta, voice: kit.words.voice, whatsNew: kit.understanding?.whatsNew }) : "(no product kit)"
            const language = String(b.language ?? "English").slice(0, 40)
            if (what === "script") {
              const scenes = (Array.isArray(b.scenes) ? b.scenes : []).slice(0, 30) as { id: string; name: string; dur: number; role?: string; shows?: string }[]
              if (!scenes.length) return json(res, 400, { error: "A film, please." })
              const a = await run({
                job: "words",
                fresh: true,
                maxTokens: 4000,
                schema: { name: "voiceover", schema: { type: "object", properties: { lines: { type: "array", items: { type: "object", properties: { scene: { type: "string" }, text: { type: "string" } }, required: ["scene", "text"] } } }, required: ["lines"] } },
                messages: [
                  { role: "system", content: `You write a launch film's voiceover in ${language}: one short line a scene (or none, where the picture says it), each no longer than the scene allows (the most words given), in the product's own voice. Spoken English is about 2.6 words a second. Plain, concrete; never invent a number. JSON only.` },
                  { role: "user", content: `The product: ${about}\n\nThe scenes, in order: ${JSON.stringify(scenes.map((x) => ({ scene: x.id, name: x.name, role: x.role, seconds: x.dur, most_words: Math.max(2, Math.floor(x.dur * 2.6) - 1) })))}` },
                ],
              })
              const lines = ((parseJSON(a.text) as { lines?: Line[] }).lines ?? []).filter((l) => scenes.some((x) => x.id === l.scene) && String(l.text ?? "").trim()).map((l) => ({ scene: l.scene, text: String(l.text).trim().slice(0, 240) }))
              return json(res, 200, { lines })
            }
            if (what === "speak") {
              const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 30) as Line[]
              // every line at once: the wait is the slowest line's, not all of them added up
              const out = await Promise.all(
                lines.map(async (l) => {
                  const { wav, seconds } = await speak(String(l.text).slice(0, 300), String(b.voice ?? "Kore"), String(b.style ?? "").slice(0, 120))
                  const name = `${randomUUID()}.wav`
                  writeFileSync(join(dir, name), wav)
                  return { scene: l.scene, text: l.text, url: `/__voice/file/${name}`, dur: seconds }
                }),
              )
              return json(res, 200, { lines: out })
            }
            if (what === "translate") {
              const films = (b.films && typeof b.films === "object" ? b.films : {}) as Record<string, Record<string, string>>
              const texts = (Array.isArray(b.texts) ? b.texts : []).map(String).slice(0, 60)
              const { slotsFor } = (await s.ssrLoadModule("/src/studio/library.ts")) as { slotsFor: (a: string) => { key: string; kind: string; label: string; pieces?: number; chars?: number[]; words?: number[] }[] }
              const { fitText } = (await s.ssrLoadModule("/src/studio/shots.ts")) as { fitText: (s: unknown, v: string) => { ok: boolean; problems: string[] } }
              // each film's lines with their limits, and the titles as they are
              const brief = Object.entries(films).map(([film, values]) => ({ film, lines: slotsFor(film).filter((x) => x.kind === "text" && typeof values[x.key] === "string").map((x) => ({ key: x.key, now: values[x.key], pieces: x.pieces, max_characters_each: x.chars })) }))
              const ask = async (extra: string) =>
                parseJSON(
                  (
                    await run({
                      job: "words",
                      fresh: true,
                      maxTokens: 8000,
                      messages: [
                        { role: "system", content: `You translate a launch film's words into ${language}, the way a native copywriter would write them (not word for word), keeping each line's job, its pieces split by |, and each piece within its character limit. Names of products and features stay as they are. JSON only: {"films": {"<film>": {"<key>": "..."}}, "texts": ["..."]}` },
                        { role: "user", content: `${JSON.stringify({ films: brief, texts })}${extra}` },
                      ],
                    })
                  ).text,
                ) as { films?: Record<string, Record<string, string>>; texts?: string[] }
              let j = await ask("")
              const outFilms: Record<string, Record<string, string>> = {}
              const tooLong: string[] = []
              const take = (src: typeof j) => {
                for (const { film, lines } of brief)
                  for (const l of lines) {
                    const v = src.films?.[film]?.[l.key]
                    if (typeof v !== "string" || outFilms[film]?.[l.key]) continue
                    const slot = slotsFor(film).find((x) => x.key === l.key)
                    if (fitText(slot, v).ok) (outFilms[film] ??= {})[l.key] = v
                    else tooLong.push(`${film} ${l.key}: ${fitText(slot, v).problems.join(" ")}`)
                  }
              }
              take(j)
              if (tooLong.length) {
                const again = await ask(`\n\nThese came out too long; write them again, shorter:\n${tooLong.join("\n")}`)
                tooLong.length = 0
                take(again)
                j = { ...j, texts: j.texts }
              }
              return json(res, 200, { films: outFilms, texts: (j.texts ?? []).map(String).slice(0, texts.length), unfitted: tooLong })
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
