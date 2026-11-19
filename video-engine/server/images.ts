// The image library's server (src/studio/images.ts is what it knows): pictures kept in .engine-data/images, each read
// once with ffmpeg (24×24 of its pixels) for its vibe.
//   GET  /__images/list                       every picture, read
//   POST /__images/upload?name=               the raw file -> its reading
//   GET  /__images/file/<id>                   the picture
//   POST /__images/pick { hue?, dark?, tone?, words?, kit? }   the library ranked for a product, with reasons
//   POST /__images/remove { id }
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { extname, join } from "node:path"
import type { Plugin } from "vite"
import { describe, pick, type ImageMeta, type Vibe } from "../src/studio/images.ts"
import { loadKit } from "./kits.ts"
import { hueOf, palette } from "./generate.ts"

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" }
const ff = () => process.env.STUDIO_FFMPEG || "ffmpeg"
const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(body))
}
const body = (req: IncomingMessage, max = 4e7) =>
  new Promise<Buffer>((ok, no) => {
    const parts: Buffer[] = []
    let n = 0
    req.on("data", (b: Buffer) => {
      n += b.length
      if (n > max) no(new Error("too large"))
      else parts.push(b)
    })
    req.on("end", () => ok(Buffer.concat(parts)))
    req.on("error", no)
  })

/** the library, from the files in a folder: each picture beside its reading (<id>.json) */
export function library(root: string) {
  const dir = join(root, ".engine-data", "images")
  mkdirSync(dir, { recursive: true })
  const metaOf = (id: string) => join(dir, `${id}.json`)
  const list = (): (ImageMeta & { file: string })[] =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
      .sort((a, b) => (a.added < b.added ? 1 : -1))
  /** a picture read: its size (ffprobe) and 24×24 of its pixels (ffmpeg) */
  function read(file: string): { w: number; h: number; px: Buffer } {
    const probe = execFileSync(ff().replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim().split(",").map(Number)
    const px = execFileSync(ff(), ["-v", "error", "-i", file, "-vf", "scale=24:24:flags=area,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 })
    return { w: probe[0] || 0, h: probe[1] || 0, px }
  }
  function add(name: string, data: Buffer) {
    const ext = (extname(name) || ".jpg").toLowerCase()
    if (!TYPES[ext]) throw new Error(`Not a picture: ${name}`)
    const id = randomUUID().slice(0, 12)
    const file = join(dir, `${id}${ext}`)
    writeFileSync(file, data)
    try {
      const r = read(file)
      const meta: ImageMeta & { file: string } = { id, name, w: r.w, h: r.h, ...describe(r.px, 24), added: new Date().toISOString(), used: 0, file: `${id}${ext}` }
      writeFileSync(metaOf(id), JSON.stringify(meta, null, 1))
      return meta
    } catch (e) {
      rmSync(file, { force: true })
      throw new Error(`Couldn't read ${name}: ${(e as Error).message.split("\n")[0]}`)
    }
  }
  /** the best picture for a product's vibe (marked used), or none */
  function choose(v: Vibe) {
    const ranked = pick(list(), v)
    const best = ranked[0]
    if (!best) return null
    const meta = JSON.parse(readFileSync(metaOf(best.img.id), "utf8"))
    writeFileSync(metaOf(best.img.id), JSON.stringify({ ...meta, used: (meta.used ?? 0) + 1 }, null, 1))
    return { ...best, src: `/__images/file/${best.img.id}` }
  }
  return { dir, list, add, choose, remove: (id: string) => (rmSync(metaOf(id), { force: true }), readdirSync(dir).filter((f) => f.startsWith(id)).forEach((f) => rmSync(join(dir, f), { force: true }))) }
}

/** a product kit's vibe: its brand's hue (or the one its logo, screens or name give), how deep, and what it says it is */
export function vibeOfKit(kitId: string | undefined, tone?: Vibe["tone"]): Vibe {
  const k = kitId ? loadKit(kitId) : null
  if (!k) return { tone }
  const p = palette(k)
  return { hue: hueOf(k).h, dark: !p.light, tone, words: [k.name, k.words.tagline, k.words.hook, ...k.words.features, k.understanding?.kind, k.understanding?.mood].filter(Boolean).join(" ") }
}

export function images(): Plugin {
  return {
    name: "images",
    configureServer(server) {
      const lib = library(server.config.root)
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__images/")) return next()
        const what = url.pathname.slice("/__images/".length)
        try {
          if (what === "list") return json(res, 200, lib.list())
          if (what === "upload" && req.method === "POST") return json(res, 200, lib.add(url.searchParams.get("name") || "picture.jpg", await body(req)))
          if (what.startsWith("file/")) {
            const id = what.slice(5).replace(/[^\w-]/g, "")
            const meta = lib.list().find((m) => m.id === id)
            if (!meta || !existsSync(join(lib.dir, meta.file))) return json(res, 404, { error: "No such picture" })
            res.setHeader("content-type", TYPES[extname(meta.file)] ?? "application/octet-stream")
            res.setHeader("cache-control", "max-age=3600")
            return res.end(readFileSync(join(lib.dir, meta.file)))
          }
          const b = req.method === "POST" ? (JSON.parse((await body(req, 1e6)).toString() || "{}") as Record<string, unknown>) : {}
          if (what === "pick") {
            const v: Vibe = { ...vibeOfKit(b.kit as string | undefined, b.tone as Vibe["tone"]), ...(b.hue !== undefined ? { hue: Number(b.hue) } : {}), ...(b.dark !== undefined ? { dark: !!b.dark } : {}), ...(b.words ? { words: String(b.words) } : {}) }
            return json(res, 200, { vibe: v, ranked: pick(lib.list(), v).map((r) => ({ id: r.img.id, name: r.img.name, score: r.score, why: r.why, tags: r.img.tags })) })
          }
          if (what === "remove") return (lib.remove(String(b.id ?? "")), json(res, 200, { ok: true }))
          next()
        } catch (e) {
          json(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}
