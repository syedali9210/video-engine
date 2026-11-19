// Product kits, kept on this machine (.engine-data/kits/<id>/kit.json and its files). Drop screens, recordings, the
// logo, photos and notes; give the product's address. The reader (the Work API's "read" job, one call per picture) says
// what each file is, what it shows, the words in it, where to look and what chrome to cut; then one "plan" call writes
// the product's words in its own voice and what it understood of it (what's new, the features ranked, the real proof,
// the mood). The live site is opened in headless Chrome: a capture of it, its main button's colour, its type, its
// corners, its title. Without a Work API key the rules do what they can: kinds by shape, words from the site and notes.
//   GET  /__kit/list · /__kit/get?id= · /__kit/file/<kit>/<file>
//   POST /__kit/new { name } · /__kit/save { kit } · /__kit/remove { id }
//   POST /__kit/upload?kit=&name=&w=&h=&dur=&palette= (the raw file) · /__kit/unfile { kit, file }
//   POST /__kit/read { id, fresh? } · /__kit/site { id, url } · /__kit/words { id, film } (a template's lines, in its voice)
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "vite"
import { emptyKit, guessKind, type FileKind, type KitFile, type ProductKit } from "../src/studio/product.ts"
import { parseJSON } from "./ai.ts"
import { run } from "./work.ts"

let root = join(process.cwd(), ".engine-data", "kits")
const dirOf = (id: string) => join(root, id)
const safe = (id: unknown): id is string => typeof id === "string" && /^[\w-]{6,64}$/.test(id)
export function loadKit(id: string): ProductKit | null {
  try {
    return JSON.parse(readFileSync(join(dirOf(id), "kit.json"), "utf8")) as ProductKit
  } catch {
    return null
  }
}
const saveKit = (k: ProductKit) => {
  mkdirSync(join(dirOf(k.id), "files"), { recursive: true })
  const out = { ...k, updated: new Date().toISOString() }
  writeFileSync(join(dirOf(k.id), "kit.json"), JSON.stringify(out, null, 2))
  return out
}
const list = () =>
  existsSync(root)
    ? readdirSync(root)
        .map((id) => loadKit(id))
        .filter((k): k is ProductKit => !!k)
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map((k) => ({ id: k.id, name: k.name, updated: k.updated, accent: k.brand.accent, logo: k.files.find((f) => f.kind === "logo")?.url, files: k.files.length }))
    : []
const fileOf = (k: ProductKit, f: KitFile) => join(dirOf(k.id), "files", f.id)

/* ---------------- checking what the page sends ---------------- */

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "")
const frac = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const KINDS: FileKind[] = ["phone", "tablet", "desktop", "photo", "logo", "clip", "doc", "other"]
/** The reader's word for a file, unless its shape says otherwise: a phone's screen is upright, a desktop's is wide. A
    site's own captures keep the kind they were taken as. */
const fits = (kind: unknown, f: { w?: number; h?: number; by?: string; shows?: string }) => {
  if (!KINDS.includes(kind as FileKind)) return false
  if (/^The site's first screen/.test(f.shows ?? "")) return false
  const a = f.w && f.h ? f.w / f.h : 0
  return !a || !((kind === "phone" && a > 0.8) || (kind === "desktop" && a < 1.1))
}
const HEX = /^#[0-9a-f]{6}$/i
/** A kit as the page sent it, held to what a kit can hold: its files are the ones already kept (the page can only
    change what they're said to be, where to look, their part and crop), never new ones. */
function cleanKit(raw: Record<string, unknown>, was: ProductKit): ProductKit {
  const w = (raw.words ?? {}) as Record<string, unknown>
  const b = (raw.brand ?? {}) as Record<string, unknown>
  const files = Array.isArray(raw.files) ? (raw.files as Record<string, unknown>[]) : []
  return {
    ...was,
    name: str(raw.name, 80) || was.name,
    url: str(raw.url, 300) || undefined,
    notes: str(raw.notes, 20000) || undefined,
    words: {
      name: str(w.name, 60),
      tagline: str(w.tagline, 120),
      hook: str(w.hook, 120),
      features: (Array.isArray(w.features) ? w.features : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 8),
      proof: str(w.proof, 120),
      cta: str(w.cta, 40),
      ...(str(w.voice, 200) ? { voice: str(w.voice, 200) } : {}),
      by: w.by === "you" || w.by === "reader" || w.by === "rules" ? w.by : "you",
    },
    brand: {
      ...was.brand,
      ...(HEX.test(str(b.accent)) ? { accent: str(b.accent) } : {}),
      ...(HEX.test(str(b.ground)) ? { ground: str(b.ground) } : {}),
      ...(HEX.test(str(b.ink)) ? { ink: str(b.ink) } : {}),
      ...(typeof b.dark === "boolean" ? { dark: b.dark } : {}),
      ...(str(b.display, 60) ? { display: str(b.display, 60) } : {}),
      ...(str(b.text, 60) ? { text: str(b.text, 60) } : {}),
      ...(typeof b.radius === "number" ? { radius: Math.min(64, Math.max(0, b.radius)) } : {}),
      ...(/^(cubic-bezier\([\d.,\s-]+\)|ease(-in|-out|-in-out)?)$/.test(str(b.ease, 80)) ? { ease: str(b.ease, 80) } : {}),
      ...(typeof b.ms === "number" ? { ms: Math.min(5000, Math.max(0, Math.round(b.ms))) } : {}),
      ...(b.from && typeof b.from === "object" ? { from: Object.fromEntries(Object.entries(b.from as Record<string, unknown>).map(([k, v]) => [k, str(v, 60)])) } : {}),
    },
    files: was.files.map((f) => {
      const n = files.find((x) => x.id === f.id)
      if (!n) return f
      const focus = n.focus as { x?: unknown; y?: unknown } | undefined
      const trim = n.trim as { from?: unknown; to?: unknown } | undefined
      const crop = n.crop as Record<string, unknown> | undefined
      return {
        ...f,
        ...(KINDS.includes(n.kind as FileKind) ? { kind: n.kind as FileKind } : {}),
        ...(typeof n.shows === "string" ? { shows: str(n.shows, 200) } : {}),
        focus: focus ? { x: frac(focus.x), y: frac(focus.y) } : undefined,
        trim: trim && typeof trim.from === "number" && typeof trim.to === "number" && trim.to > trim.from ? { from: Math.max(0, trim.from), to: Math.min(f.dur ?? trim.to, trim.to) } : undefined,
        crop: crop ? { top: Math.min(0.4, frac(crop.top)), right: Math.min(0.4, frac(crop.right)), bottom: Math.min(0.4, frac(crop.bottom)), left: Math.min(0.4, frac(crop.left)) } : undefined,
        ...(n.by === "you" ? { by: "you" as const } : {}),
      }
    }),
  }
}

/* ---------------- the reader ---------------- */

const READ_SCHEMA = {
  name: "file",
  schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["phone", "tablet", "desktop", "photo", "logo", "other"] },
      shows: { type: "string", description: "What it shows, in one plain line (the screen's job, not its pixels)." },
      text: { type: "array", items: { type: "string" }, description: "The words on it that matter, biggest first, at most 8." },
      focus: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], description: "The centre of what matters most on it, as fractions of its width and height." },
      crop: { type: "object", properties: { top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" }, left: { type: "number" } }, required: ["top", "right", "bottom", "left"], description: "Chrome that isn't the product (a phone's status bar, a browser's toolbar and tabs, a window's title bar, a home indicator), as fractions to cut off each edge; 0 where there's none." },
    },
    required: ["kind", "shows", "text", "focus", "crop"],
  },
}
const READ_MANY = {
  name: "pictures",
  schema: { type: "object", properties: { pictures: { type: "array", items: { ...READ_SCHEMA.schema, properties: { n: { type: "number", description: "The picture's number." }, ...READ_SCHEMA.schema.properties }, required: ["n", ...READ_SCHEMA.schema.required] } } }, required: ["pictures"] },
}
/** A picture at most 1024 px wide, as a JPEG (the reader sees what matters; the tokens are a fraction). */
function smaller(file: string) {
  const ff = process.env.STUDIO_FFMPEG || "ffmpeg"
  const r = spawnSync(ff, ["-v", "error", "-i", file, "-vf", "scale='min(1024,iw)':-2", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "-q:v", "4", "-"], { maxBuffer: 2e7 })
  return r.status === 0 && r.stdout.length ? r.stdout : readFileSync(file)
}
const PLAN_SCHEMA = {
  name: "product",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      tagline: { type: "string", description: "What it is for, in at most 6 words." },
      hook: { type: "string", description: "The opening line of a launch film: the problem it ends or the change it makes, at most 8 words." },
      features: { type: "array", items: { type: "string" }, description: "Its 3 to 5 strongest features as short noun phrases (2 to 4 words each), strongest first." },
      proof: { type: "string", description: "One real figure from the material (users, speed, savings), as it's written there; empty if there is none. Never invent a number." },
      cta: { type: "string", description: "The call to action, 2 to 4 words." },
      voice: { type: "string", description: "How it talks, in a few words (plain and direct, playful, technical…)." },
      kind: { type: "string", description: "What kind of product it is (a mobile app, a developer tool, a design tool…)." },
      whatsNew: { type: "string", description: "What the film is launching: the new product or the new feature, in a line." },
      audience: { type: "string" },
      mood: { type: "string", description: "The film's mood in 2 or 3 words." },
      proofs: { type: "array", items: { type: "string" }, description: "Every real figure or quote in the material, as written there." },
    },
    required: ["name", "tagline", "hook", "features", "proof", "cta", "voice", "kind", "whatsNew", "audience", "mood", "proofs"],
  },
}

/** A still of a clip (its middle) for the reader, by ffmpeg. */
async function stillOf(file: string, dur = 2) {
  const { ffmpeg } = await import("./studio")
  const ff = ffmpeg()
  if (!ff) return null
  const dir = mkdtempSync(join(tmpdir(), "anim-engine-still-"))
  try {
    const out = join(dir, "still.jpg")
    spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-ss", String(dur / 2), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", "-y", out])
    return existsSync(out) ? readFileSync(out) : null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** What each picture and clip is, and then the product's words and what's being launched. Files you've said what
    they are keep what you said. */
async function readKit(k: ProductKit, fresh: boolean): Promise<{ kit: ProductKit; notes: string[] }> {
  const notes: string[] = []
  // the pictures to read, each shrunk to 1024 px (what the reader needs to see, at a fraction of the tokens): read
  // together, eight to a call, rather than a call each
  const todo: { f: KitFile; data: Buffer; mime: string }[] = []
  for (const f of k.files) {
    if (f.by === "you" || (f.by === "reader" && !fresh) || !(f.type.startsWith("image/") || f.type.startsWith("video/")) || f.type === "image/svg+xml") continue
    const data = f.type.startsWith("video/") ? await stillOf(fileOf(k, f), f.dur) : smaller(fileOf(k, f))
    if (data) todo.push({ f, data, mime: "image/jpeg" })
  }
  const read = new Map<string, KitFile>()
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8)
    try {
      const a = await run({
        job: "read",
        schema: READ_MANY,
        maxTokens: 6000,
        messages: [
          { role: "system", content: "You read a product's pictures for a film editor. For each picture, by its number: say what it is and what it shows, list the words on it that matter, where the most important thing is, and what chrome around it isn't the product. Plain words; JSON only." },
          { role: "user", content: batch.flatMap((x, j) => [{ type: "text" as const, text: `Picture ${j + 1}: ${x.f.name}${x.f.type.startsWith("video/") ? " (a still from a screen recording)" : ""}.` }, { type: "image_url" as const, image_url: { url: `data:${x.mime};base64,${x.data.toString("base64")}` } }]) },
        ],
      })
      const got = (parseJSON(a.text) as { pictures?: ({ n?: number; kind?: string; shows?: string; text?: string[]; focus?: { x: number; y: number }; crop?: Record<string, number> })[] }).pictures ?? []
      got.forEach((j, idx) => {
        const x = batch[(typeof j.n === "number" ? j.n - 1 : idx)] ?? batch[idx]
        if (!x) return
        const f = x.f
        read.set(f.id, {
          ...f,
          kind: f.type.startsWith("video/") ? "clip" : fits(j.kind, f) ? (j.kind as FileKind) : f.kind,
          shows: str(j.shows, 200),
          text: (j.text ?? []).map((t) => str(t, 120)).filter(Boolean).slice(0, 8),
          focus: j.focus ? { x: frac(j.focus.x), y: frac(j.focus.y) } : f.focus,
          crop: j.crop ? { top: Math.min(0.3, frac(j.crop.top)), right: Math.min(0.3, frac(j.crop.right)), bottom: Math.min(0.3, frac(j.crop.bottom)), left: Math.min(0.3, frac(j.crop.left)) } : f.crop,
          by: "reader",
        })
      })
    } catch (e) {
      const m = (e as Error).message
      // no key at all: said once, and nothing else is asked
      if (/isn't set up|is resting/.test(m)) {
        notes.push(m)
        return { kit: k, notes }
      }
      notes.push(`${batch.map((x) => x.f.name).join(", ")}: ${m}`)
    }
  }
  const files = k.files.map((f) => read.get(f.id) ?? f)
  let kit: ProductKit = { ...k, files }
  // the words, unless you wrote them
  if (k.words.by !== "you" || fresh) {
    const material = [
      k.url && `Site: ${k.url}`,
      k.notes && `Notes:\n${k.notes.slice(0, 8000)}`,
      ...files.filter((f) => f.shows || f.text?.length).map((f) => `${f.name} (${f.kind}): ${f.shows ?? ""}${f.text?.length ? ` — words on it: ${f.text.join(" · ")}` : ""}`),
    ]
      .filter(Boolean)
      .join("\n")
    if (material.trim()) {
      try {
        const a = await run({
          job: "plan",
          schema: PLAN_SCHEMA,
          maxTokens: 6000,
          messages: [
            { role: "system", content: "You read everything about a product for its launch film: write its words in its own voice (short, concrete, no hype words like revolutionary or seamless) and say what you understood of it. Use only facts in the material; never invent a number or a quote." },
            { role: "user", content: `Product: ${k.name}\n\n${material}` },
          ],
        })
        const j = parseJSON(a.text) as Record<string, unknown>
        const arr = (v: unknown, n: number, max = 80) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])
        kit = {
          ...kit,
          words: { name: str(j.name, 60) || k.name, tagline: str(j.tagline, 120), hook: str(j.hook, 120), features: arr(j.features, 5), proof: str(j.proof, 120), cta: str(j.cta, 40), voice: str(j.voice, 200), by: "reader" },
          understanding: { kind: str(j.kind, 120), whatsNew: str(j.whatsNew, 200), features: arr(j.features, 5), proof: arr(j.proofs, 8, 160), mood: str(j.mood, 60), audience: str(j.audience, 120) },
        }
      } catch (e) {
        notes.push(`The words: ${(e as Error).message}`)
      }
    }
  }
  return { kit, notes }
}

/* ---------------- a template's words, in the product's voice ---------------- */

type SlotLite = { key: string; kind: string; label: string; hint?: string; example?: string; pieces?: number; chars?: number[]; words?: number[] }
/** Every line of one template written for the product, each piece within its slot's limits: one "words" call, and one
    more for any line that came back too long (told which and by how much). What still doesn't fit keeps the rules'. */
export async function wordsFor(k: ProductKit, film: string, slots: SlotLite[], fit: (s: SlotLite, v: string) => { ok: boolean; problems: string[] }) {
  const text = slots.filter((s) => s.kind === "text" && s.pieces)
  if (!text.length) return { values: {}, problems: [] as string[] }
  const brief = text.map((s) => ({ key: s.key, what: `${s.label}${s.hint ? ` (${s.hint})` : ""}`, template_says: s.example, pieces: s.pieces, max_characters_each: s.chars, max_words_each: s.words }))
  const schema = { name: "lines", schema: { type: "object", properties: Object.fromEntries(text.map((s) => [s.key, { type: "string" }])), required: text.map((s) => s.key) } }
  const about = JSON.stringify({ name: k.words.name || k.name, tagline: k.words.tagline, hook: k.words.hook, features: k.words.features, proof: k.words.proof, cta: k.words.cta, voice: k.words.voice, understanding: k.understanding, notes: k.notes?.slice(0, 3000) })
  const ask = async (extra: string) => {
    const a = await run({
      job: "words",
      schema,
      maxTokens: 6000,
      messages: [
        { role: "system", content: "You write the on-screen words of one launch film template for a product, line by line. Each line replaces the template's own, keeps its job in the film (a tab's name stays a tab's name, a log line stays a log line), splits into exactly the pieces asked for with | between them, and keeps every piece within its character and word limits. Use the product's real features and voice; never invent a number, a customer or a quote: where the template shows a figure and the product has none, write words instead. JSON only." },
        { role: "user", content: `The product: ${about}\n\nThe film: ${film}\n\nThe lines to write:\n${JSON.stringify(brief)}${extra}` },
      ],
    })
    return parseJSON(a.text) as Record<string, unknown>
  }
  const values: Record<string, string> = {}
  let j = await ask("")
  let bad: string[] = []
  for (const s of text) {
    const v = typeof j[s.key] === "string" ? (j[s.key] as string).trim() : ""
    if (v && fit(s, v).ok) values[s.key] = v
    else bad.push(...(v ? fit(s, v).problems : [`${s.label}: nothing came back for it.`]))
  }
  if (bad.length) {
    j = await ask(`\n\nLast time these didn't fit; write just these again, shorter:\n${bad.join("\n")}`)
    const still: string[] = []
    for (const s of text) {
      if (values[s.key]) continue
      const v = typeof j[s.key] === "string" ? (j[s.key] as string).trim() : ""
      if (v && fit(s, v).ok) values[s.key] = v
      else still.push(...(v ? fit(s, v).problems : [`${s.label}: nothing came back for it.`]))
    }
    bad = still
  }
  return { values, problems: bad }
}

/* ---------------- the live site ---------------- */

/** The product's site in headless Chrome: a capture of its first screen (desktop and phone), its main button's colour
    and corners, the page's ground and ink, its type, its title and line. */
async function readSite(k: ProductKit, url: string) {
  const { findChrome, devtools, dropProfile } = await import("./studio")
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to open the site with.")
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const cdp = await devtools(chrome, profile)
  const added: KitFile[] = []
  type Site = { title: string; line: string; h1: string; accent: string; onAccent: string; radius: number; ground: string; ink: string; display: string; text: string; ease: string; ms: number; shadow: string }
  let found: Site | null = null
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    for (const [w, h, kind] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: kind === "phone" })
      await cdp.send("Page.navigate", { url })
      for (let i = 0; i < 100 && (await cdp.evaluate("document.readyState").catch(() => "")) !== "complete"; i++) await new Promise((r) => setTimeout(r, 150))
      await cdp.evaluate("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1200))).then(() => true)")
      if (kind === "desktop")
        found = (await cdp.evaluate(`(() => {
          const sat = (c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?/.exec(c); if (!m || m[4] === "0") return -1; const [r, g, b] = [m[1], m[2], m[3]].map(Number); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0 }
          const hex = (c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m ? "#" + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, "0")).join("") : "" }
          // the main button: the most colourful, biggest clickable thing in the first screen
          let best = null
          for (const el of document.querySelectorAll("button, a, [role=button], input[type=submit]")) {
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
            if (r.top > innerHeight || r.width < 40 || r.height < 24 || cs.visibility === "hidden") continue
            const s = sat(cs.backgroundColor)
            if (s < 0.15) continue
            const score = s * Math.min(r.width * r.height, 60000)
            if (!best || score > best.score) best = { score, el, cs }
          }
          const body = getComputedStyle(document.body), h1 = document.querySelector("h1")
          let ground = body.backgroundColor
          if (sat(ground) < 0 || /rgba\\(0, 0, 0, 0\\)/.test(ground)) ground = getComputedStyle(document.documentElement).backgroundColor
          const fam = (cs) => cs.fontFamily.split(",")[0].replace(/["']/g, "").trim()
          return {
            title: document.title, line: document.querySelector('meta[name="description"], meta[property="og:description"]')?.content ?? "", h1: ((t) => { const half = t.slice(0, Math.floor(t.length / 2)).trim(); return t === half + " " + half ? half : t })(h1?.innerText.replace(/\\s+/g, " ").trim() ?? "").slice(0, 140),
            accent: best ? hex(best.cs.backgroundColor) : "", onAccent: best ? hex(best.cs.color) : "", radius: best ? parseFloat(best.cs.borderTopLeftRadius) || 0 : 0,
            ground: hex(ground) || "#ffffff", ink: hex(body.color), display: h1 ? fam(getComputedStyle(h1)) : "", text: fam(body),
            // how it moves and lifts: the commonest transition curve and length on what you can click, the commonest shadow
            ...(() => {
              const tally = (xs) => { const m = new Map(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "" }
              const moving = [...document.querySelectorAll("a, button, [role=button], input, [class*=card]")].slice(0, 400).map((el) => getComputedStyle(el)).filter((cs) => parseFloat(cs.transitionDuration) > 0)
              const first = (v) => v.split(/,(?![^(]*\\))/)[0].trim()
              const ease = tally(moving.map((cs) => first(cs.transitionTimingFunction)).filter((e) => e !== "linear"))
              const ms = Math.round(parseFloat(tally(moving.map((cs) => first(cs.transitionDuration))) || "0") * 1000)
              const shadow = tally([...document.querySelectorAll("div, section, article, li")].slice(0, 1500).map((el) => getComputedStyle(el).boxShadow).filter((b) => b && b !== "none"))
              return { ease, ms, shadow: shadow.slice(0, 200) }
            })(),
          }
        })()`)) as Site
      const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" })
      const id = randomUUID()
      writeFileSync(join(dirOf(k.id), "files", id), Buffer.from(data, "base64"))
      added.push({ id, name: `${new URL(url).hostname} (${kind})`, type: "image/png", size: Math.round((data.length * 3) / 4), url: `/__kit/file/${k.id}/${id}`, w: w * 2, h: h * 2, kind, shows: `The site's first screen on a ${kind === "desktop" ? "desktop" : "phone"}`, by: "rules" })
    }
  } finally {
    await cdp.close()
    dropProfile(profile)
  }
  const f = found as Site | null
  const words = k.words.by === "you" ? k.words : { ...k.words, name: k.words.name || (f?.title.split(/[|·—–-]/)[0].trim() ?? ""), tagline: k.words.tagline || f?.h1 || "", hook: k.words.hook || f?.line || "" }
  const brand = {
    ...k.brand,
    ...(f?.accent && !k.brand.from?.accent?.startsWith("tokens") ? { accent: f.accent } : {}),
    ...(f?.ground ? { ground: f.ground } : {}),
    ...(f?.ink ? { ink: f.ink } : {}),
    ...(f?.display || f?.text ? { display: f?.display, text: f?.text } : {}),
    ...(f?.radius ? { radius: Math.round(f.radius) } : {}),
    ...(f?.ease ? { ease: f.ease } : {}),
    ...(f?.ms ? { ms: f.ms } : {}),
    ...(f?.shadow ? { shadow: f.shadow } : {}),
    from: { ...k.brand.from, ...(f?.accent && !k.brand.from?.accent?.startsWith("tokens") ? { accent: "the site's main button" } : {}), ground: "the site", ink: "the site", type: "the site", ...(f?.ease || f?.ms ? { motion: "the site" } : {}) },
  }
  return { ...k, url, words, brand, files: [...k.files.filter((x) => !x.name.startsWith(`${new URL(url).hostname} (`)), ...added] }
}

/* ---------------- the routes ---------------- */

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
const TYPES = /^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|quicktime|webm)|text\/(plain|markdown|css|html)|application\/(json|pdf))$/

export function kits(): Plugin {
  return {
    name: "kits",
    async configureServer(s) {
      const { fromEngine, sendFile } = await import("./studio")
      root = join(s.config.root, ".engine-data", "kits")
      mkdirSync(root, { recursive: true })
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__kit/")) return next()
        const [, , what, a, b] = url.pathname.split("/")
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        void (async () => {
          try {
            if (req.method === "GET") {
              if (what === "list") return json(res, 200, list())
              if (what === "get") {
                const k = safe(url.searchParams.get("id")) ? loadKit(url.searchParams.get("id")!) : null
                return k ? json(res, 200, k) : json(res, 404, { error: "No such kit" })
              }
              if (what === "file" && safe(a) && safe(b)) {
                const k = loadKit(a)
                const f = k?.files.find((x) => x.id === b)
                if (!k || !f || !existsSync(fileOf(k, f))) return json(res, 404, { error: "No such file" })
                res.setHeader("cache-control", "private, max-age=86400")
                return sendFile(req, res, fileOf(k, f), f.type)
              }
              return json(res, 404, { error: "Not found" })
            }
            if (what === "upload") {
              const q = url.searchParams
              const k = safe(q.get("kit")) ? loadKit(q.get("kit")!) : null
              if (!k) return json(res, 404, { error: "No such kit" })
              const type = String(req.headers["content-type"] ?? "").split(";")[0]
              if (!TYPES.test(type)) return json(res, 415, { error: "Pictures, videos, notes (.txt, .md), a PDF, or design tokens (.css, .json), please." })
              const id = randomUUID()
              const dest = join(dirOf(k.id), "files", id)
              mkdirSync(join(dirOf(k.id), "files"), { recursive: true })
              let size = 0
              await new Promise<void>((done, fail) => {
                const out = createWriteStream(dest)
                req.on("data", (c: Buffer) => {
                  size += c.length
                  if (size > 400 * 1024 * 1024) {
                    req.destroy()
                    out.destroy()
                    fail(new Error("That file is over 400 MB: trim it to the part the film needs."))
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
              const num = (n: string) => (Number.isFinite(Number(q.get(n))) && Number(q.get(n)) > 0 ? Number(q.get(n)) : undefined)
              const palette = (q.get("palette") ?? "").split(",").filter((c) => HEX.test(c)).slice(0, 8)
              const f: KitFile = { id, name: (q.get("name") ?? "file").slice(0, 120), type, size, url: `/__kit/file/${k.id}/${id}`, w: num("w"), h: num("h"), dur: num("dur"), ...(palette.length ? { palette } : {}) }
              f.kind = guessKind(f)
              f.by = "rules"
              // a dropped note is read into the kit's notes
              if (f.kind === "doc" && /^text\//.test(type)) k.notes = [k.notes, `${f.name}:\n${readFileSync(dest, "utf8").slice(0, 20000)}`].filter(Boolean).join("\n\n")
              return json(res, 200, saveKit({ ...k, files: [...k.files, f] }))
            }
            const bd = await body(req)
            if (what === "new") return json(res, 200, saveKit(emptyKit(randomUUID().slice(0, 12), str(bd.name, 80) || "My product")))
            const k = safe(bd.id) ? loadKit(bd.id) : safe(bd.kit) ? loadKit(bd.kit as string) : null
            if (what === "save") {
              const raw = (bd.kit ?? {}) as Record<string, unknown>
              const was = safe(raw.id) ? loadKit(raw.id) : null
              if (!was) return json(res, 404, { error: "No such kit" })
              return json(res, 200, saveKit(cleanKit(raw, was)))
            }
            if (!k) return json(res, 404, { error: "No such kit" })
            if (what === "remove") {
              rmSync(dirOf(k.id), { recursive: true, force: true })
              return json(res, 200, list())
            }
            if (what === "unfile") {
              const f = k.files.find((x) => x.id === bd.file)
              if (f) rmSync(fileOf(k, f), { force: true })
              return json(res, 200, saveKit({ ...k, files: k.files.filter((x) => x.id !== bd.file) }))
            }
            if (what === "read") {
              const r = await readKit(k, bd.fresh === true)
              return json(res, 200, { kit: saveKit(r.kit), notes: r.notes })
            }
            // release notes (a changelog, a PRD, a ticket) made into a feature launch: what's new is the feature, its
            // features are what the notes say it does, ranked; the words follow
            if (what === "release") {
              const notes = str(bd.text, 20000).trim()
              if (notes.length < 20) return json(res, 400, { error: "Paste the release notes, the PRD or the ticket." })
              const a = await run({
                job: "plan",
                schema: PLAN_SCHEMA,
                maxTokens: 6000,
                fresh: true,
                messages: [
                  { role: "system", content: "You turn release notes into a feature launch film's brief. whatsNew is the feature being launched, in a line; features are what it lets people do, 3 to 5, strongest first, short noun phrases; the hook is the change it makes for them. Use only what the notes say; never invent a number." },
                  { role: "user", content: `Product: ${k.words.name || k.name}${k.understanding ? ` (${k.understanding.kind})` : ""}.\n\nThe release notes:\n${notes}` },
                ],
              })
              const j = parseJSON(a.text) as Record<string, unknown>
              const arr = (v: unknown, n: number, max = 80) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [])
              const next: ProductKit = {
                ...k,
                notes: [k.notes, `Release notes:\n${notes}`].filter(Boolean).join("\n\n").slice(0, 20000),
                words: { ...k.words, tagline: str(j.tagline, 120) || k.words.tagline, hook: str(j.hook, 120) || k.words.hook, features: arr(j.features, 5).length ? arr(j.features, 5) : k.words.features, cta: str(j.cta, 40) || k.words.cta, by: "reader" },
                understanding: { kind: str(j.kind, 120) || k.understanding?.kind || "", whatsNew: str(j.whatsNew, 200), features: arr(j.features, 5), proof: arr(j.proofs, 8, 160), mood: str(j.mood, 60), audience: str(j.audience, 120) },
              }
              return json(res, 200, saveKit(next))
            }
            // what changed between two screens, box by box (the boxes found by the page, comparing pixels)
            if (what === "spot") {
              const [fa, fb] = [k.files.find((f) => f.id === bd.a), k.files.find((f) => f.id === bd.b)]
              const boxes = (Array.isArray(bd.boxes) ? bd.boxes : []).slice(0, 12) as { x: number; y: number; w: number; h: number }[]
              if (!fa || !fb || !boxes.length) return json(res, 400, { error: "Two screens and what differs between them, please." })
              const img = (f: KitFile) => ({ type: "image_url" as const, image_url: { url: `data:${f.type};base64,${readFileSync(fileOf(k, f)).toString("base64")}` } })
              const a = await run({
                job: "read",
                maxTokens: 3000,
                schema: { name: "changes", schema: { type: "object", properties: { labels: { type: "array", items: { type: "string" } } }, required: ["labels"] } },
                messages: [
                  { role: "system", content: "Two versions of one screen, before and after. For each numbered box (fractions of the screen: x, y, width, height), say in a few words what changed there (\"New: a Share button\", \"The total is bigger\"). JSON only." },
                  { role: "user", content: [{ type: "text", text: `Before, then after. The boxes: ${JSON.stringify(boxes.map((b, i) => ({ n: i + 1, ...b })))}` }, img(fa), img(fb)] },
                ],
              })
              const labels = ((parseJSON(a.text) as { labels?: unknown[] }).labels ?? []).map((x) => str(x, 80))
              return json(res, 200, { labels })
            }
            // a screen's parts, for close-ups and the screen taken apart: each one's name and box
            if (what === "parts") {
              const f = k.files.find((x) => x.id === bd.file)
              if (!f || !f.type.startsWith("image/")) return json(res, 400, { error: "A picture of a screen, please." })
              const a = await run({
                job: "read",
                maxTokens: 4000,
                schema: { name: "parts", schema: { type: "object", properties: { parts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["name", "x", "y", "w", "h"] } } }, required: ["parts"] } },
                messages: [
                  { role: "system", content: "Find the parts of this screen worth a close-up in a launch film: a card, a chart, a button group, a list, the navigation, a hero. At most 8, each a tight box around the whole part, as fractions of the screen (x, y from the top left, w, h). JSON only." },
                  { role: "user", content: [{ type: "image_url", image_url: { url: `data:${f.type};base64,${readFileSync(fileOf(k, f)).toString("base64")}` } }] },
                ],
              })
              const parts = ((parseJSON(a.text) as { parts?: { name?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown }[] }).parts ?? [])
                .map((p) => ({ name: str(p.name, 40) || "Part", x: frac(p.x), y: frac(p.y), w: frac(p.w), h: frac(p.h) }))
                .filter((p) => p.w > 0.03 && p.h > 0.02)
                .slice(0, 8)
              return json(res, 200, { parts })
            }
            // the running app filmed through a flow (server/tour.ts): the clip goes into the kit
            if (what === "tour") {
              const u = str(bd.url, 300).trim() || k.url || ""
              if (!/^https?:\/\//.test(u)) return json(res, 400, { error: "The running app's address, please (http://localhost:3000, or its site)." })
              const steps = (Array.isArray(bd.steps) ? bd.steps : []).slice(0, 20).map((x) => {
                const o = (x ?? {}) as Record<string, unknown>
                const d = ["click", "type", "wait", "scroll"].includes(String(o.do)) ? (o.do as "click") : "click"
                return { do: d, ...(o.target ? { target: str(o.target, 120) } : {}), ...(o.text ? { text: str(o.text, 200) } : {}), ...(typeof o.ms === "number" ? { ms: o.ms } : {}) }
              })
              const { recordTour } = await import("./tour")
              const id = randomUUID()
              const out = join(dirOf(k.id), "files", id)
              const r = await recordTour({ url: u, steps, goal: str(bd.goal, 300), phone: bd.phone === true, out: `${out}.mp4` })
              renameSync(`${out}.mp4`, out)
              const f: KitFile = { id, name: `Tour of ${new URL(u).hostname}${bd.goal ? `: ${str(bd.goal, 60)}` : ""}`, type: "video/mp4", size: statSync(out).size, url: `/__kit/file/${k.id}/${id}`, w: r.w, h: r.h, dur: r.seconds, kind: "clip", shows: `A tour: ${r.steps.join(", ")}`, by: "rules" }
              return json(res, 200, { kit: saveKit({ ...k, files: [...k.files, f] }), steps: r.steps })
            }
            if (what === "words") {
              const film = str(bd.film, 60)
              const { slotsFor } = (await s.ssrLoadModule("/src/studio/library.ts")) as { slotsFor: (a: string) => SlotLite[] }
              const { fitText } = (await s.ssrLoadModule("/src/studio/shots.ts")) as { fitText: (s: SlotLite, v: string) => { ok: boolean; problems: string[] } }
              const all = slotsFor(film)
              if (!all.length) return json(res, 404, { error: "No such film template" })
              // just some lines, with less room than the slot allows (one the check found cut off: written shorter)
              const only = Array.isArray(bd.only) ? bd.only.map(String) : null
              const room = typeof bd.room === "number" ? Math.min(1, Math.max(0.3, bd.room)) : 1
              const slots = all.filter((x) => !only || only.includes(x.key)).map((x) => (room < 1 && x.chars ? { ...x, chars: x.chars.map((c) => Math.max(3, Math.floor(c * room))) } : x))
              return json(res, 200, await wordsFor(k, film, slots, fitText))
            }
            if (what === "site") {
              const u = str(bd.url, 300).trim()
              let parsed: URL
              try {
                parsed = new URL(/^https?:\/\//.test(u) ? u : `https://${u}`)
              } catch {
                return json(res, 400, { error: "That isn't a web address." })
              }
              if (!/^https?:$/.test(parsed.protocol)) return json(res, 400, { error: "An http or https address, please." })
              return json(res, 200, saveKit(await readSite(k, parsed.href)))
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
