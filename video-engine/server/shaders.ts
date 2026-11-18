// Shader videos: the export side. A job opens shader.html?render in headless Chrome (on the GPU), steps it frame by
// frame (window.__shader.frame(t)) and pipes each PNG to ffmpeg. Renders are kept by what they're made of (the spec,
// the size, the frame rate and the shader code), so asking again for the same video is instant.
//   POST /__shader/jobs   { spec, width, height, fps, scale?, seconds?, format? } -> { id }
//   GET  /__shader/jobs/:id -> { state, frame, total, url?, error? }
//   GET  /__shader/file/:name   a finished video (or still)
//   GET  /__shader/list         the renders kept: [{ name, url, spec, width, height, fps, seconds, made }]
//   POST /__shader/logo         a logo picture for the liquid logo -> { url }
//   GET  /__shader/logo/:name
// format: "mp4" (H.264, the default), "mov" (ProRes 4444 with alpha: a spec whose bg is ""), or "png" (one frame).
// scale 2 renders at twice the size and scales down (smoother edges and grain); 4K at scale 1 is the same pixels.
import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { cpus, freemem, tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "vite"
import { devtools, dropProfile, ffmpeg, findChrome } from "./studio"

type Body = { spec: { kind: string; duration: number; bg: string; grain?: number; name?: string }; width: number; height: number; fps: number; scale?: number; seconds?: number; format?: "mp4" | "mov" | "png"; t?: number }
type Job = { id: string; state: "queued" | "rendering" | "encoding" | "done" | "error"; frame: number; total: number; url?: string; error?: string }

const kept = globalThis as unknown as { __shaderJobs?: Map<string, Job>; __shaderLine?: { p: Promise<void> } }
const jobs = (kept.__shaderJobs ??= new Map())
const line = (kept.__shaderLine ??= { p: Promise.resolve() }) // one at a time: they share the GPU
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const read = (req: IncomingMessage, max = 40e6) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []
    let n = 0
    req.on("data", (b: Buffer) => {
      n += b.length
      if (n > max) reject(new Error("too large"))
      else parts.push(b)
    })
    req.on("end", () => resolve(Buffer.concat(parts)))
    req.on("error", reject)
  })
const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(body))
}
const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp", gif: "image/gif" }

/** What the shader code is: a change to any of it is a new picture, so the cache keys on it. */
function codeStamp(root: string) {
  const dir = join(root, "src", "shader")
  const h = createHash("sha1")
  for (const f of readdirSync(dir).sort()) if (/\.(tsx?|glsl)$/.test(f)) h.update(f).update(readFileSync(join(dir, f)))
  return h.digest("hex").slice(0, 12)
}
const stable = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)])) : Array.isArray(v) ? v.map(stable) : v)

/** How many Chromes a render is split between. Every frame is a function of its time, so the parts join without a
    seam: one per four threads and per 1.5 GB free, at most three (they share one GPU), never parts under 1.5 s.
    SHADER_WORKERS overrides it. */
const workersFor = (frames: number, fps: number) => Math.max(1, Math.min(Number(process.env.SHADER_WORKERS) || Math.min(3, Math.floor(cpus().length / 4), Math.floor(freemem() / 1.5e9)), Math.floor(frames / (fps * 1.5)) || 1))

/** A file Windows may still hold for a moment after its writer quits: removed when it lets go, never thrown. */
const drop = (f: string) => {
  try {
    rmSync(f, { force: true })
  } catch {
    setTimeout(() => {
      try {
        rmSync(f, { force: true })
      } catch {
        /* the temp cleaner will */
      }
    }, 3000)
  }
}

/** One headless Chrome on shader.html, sized for the output and ready to draw. */
async function page(chrome: string, origin: string, b: Body, alpha: boolean, scale: number) {
  // (the profile's name matches the Studio's, so a sweep for stray test browsers finds it)
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-shader-"))
  const cdp = await devtools(chrome, profile)
  const close = async () => {
    await cdp.close()
    dropProfile(profile)
  }
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.round(b.width), height: Math.round(b.height), deviceScaleFactor: scale, mobile: false })
    if (alpha) await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } })
    await cdp.send("Page.navigate", { url: `${origin}/shader.html?render#${encodeURIComponent(JSON.stringify(b.spec))}` })
    for (let i = 0; i < 300 && !(await cdp.evaluate("!!window.__shader").catch(() => false)); i++) await sleep(100)
    await cdp.evaluate("window.__shader.ready", 120000)
  } catch (e) {
    await close()
    throw e
  }
  // frames as JPEG at 95 (the encode is 4:2:0 anyway, and a PNG of grain is ~5 MB); PNG where alpha or a still needs it
  const shot = async (lossless: boolean) => Buffer.from((await cdp.send<{ data: string }>("Page.captureScreenshot", { format: lossless ? "png" : "jpeg", quality: lossless ? undefined : 95, optimizeForSpeed: true })).data, "base64")
  return { frame: (t: number) => cdp.evaluate(`window.__shader.frame(${t})`), shot, close, errors: cdp.errors }
}

async function render(job: Job, b: Body, origin: string, file: string) {
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to render with. Set STUDIO_CHROME to its path.")
  const ff = ffmpeg()
  const still = b.format === "png"
  if (!still && !ff) throw new Error("Video needs ffmpeg on your PATH (winget install ffmpeg).")
  const alpha = b.format === "mov" || (!still && !b.spec.bg)
  const scale = b.scale === 2 ? 2 : 1
  const fps = b.fps === 60 ? 60 : b.fps === 24 ? 24 : 30
  const seconds = Math.max(0.5, Math.min(120, b.seconds ?? b.spec.duration))
  const meta = () => writeFileSync(file.replace(/\.\w+$/, ".json"), JSON.stringify({ spec: b.spec, width: b.width, height: b.height, fps, seconds, scale, made: Date.now() }))

  if (still) {
    job.total = 1
    const p = await page(chrome, origin, b, alpha, scale)
    try {
      job.state = "rendering"
      await p.frame(Number(b.t) || 0)
      writeFileSync(file, await p.shot(true))
      job.frame = 1
    } finally {
      await p.close()
    }
    return meta()
  }

  const n = Math.round(seconds * fps)
  job.total = n
  // twice the size scales down with lanczos; the colours go to limited-range BT.709, tagged, as players expect.
  // x264 at CRF 16 (slow): clean on gradients; aq-mode 3 spends bits in dark flat areas, where gradients band
  const down = scale === 2 ? `scale=${b.width}:${b.height}:flags=lanczos,` : ""
  const codec = alpha
    ? ["-vf", `${down}format=yuva444p10le`, "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"]
    : ["-vf", `${down}scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-x264-params", "aq-mode=3:aq-strength=0.9", "-profile:v", "high", "-movflags", "+faststart"]
  const parts = workersFor(n, fps)
  const ranges = Array.from({ length: parts }, (_, i) => [Math.round((i * n) / parts), Math.round(((i + 1) * n) / parts)] as const)
  const ext = alpha ? "mov" : "mp4"
  const segs = ranges.map((_, i) => `${file}.${job.id}.${i}.part.${ext}`)
  const list = `${file}.${job.id}.txt`
  let failure: Error | null = null
  // one Chrome and one encoder a part, each frame drawn at its own time
  const one = async ([a, z]: readonly [number, number], seg: string) => {
    const p = await page(chrome, origin, b, alpha, scale)
    const enc = spawn(ff!, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", alpha ? "png" : "mjpeg", "-i", "-", ...codec, "-r", String(fps), seg], { stdio: ["pipe", "ignore", "pipe"] })
    let ffErr = ""
    enc.stderr!.on("data", (x: Buffer) => (ffErr += x.toString()))
    enc.stdin!.on("error", () => {})
    const exited = new Promise<number>((r) => enc.on("exit", (c) => r(c ?? 1)))
    try {
      job.state = "rendering"
      for (let i = a; i < z && !failure; i++) {
        await p.frame(i / fps)
        if (!enc.stdin!.write(await p.shot(alpha))) await new Promise((r) => enc.stdin!.once("drain", r))
        job.frame++
      }
      enc.stdin!.end()
      if ((await exited) !== 0) throw new Error(`ffmpeg failed: ${ffErr.trim().split("\n").pop() || "it quit"}`)
      if (p.errors.length) console.warn("[shaders]", p.errors.slice(0, 3).join(" | "))
    } catch (e) {
      enc.kill()
      throw e
    } finally {
      await p.close()
    }
  }
  try {
    await Promise.all(ranges.map((r, i) => one(r, segs[i]).catch((e) => void (failure ??= e as Error))))
    if (failure) throw failure
    job.state = "encoding"
    if (segs.length === 1) renameSync(segs[0], file)
    else {
      // joined as they are: every part was made with the same settings, each from a keyframe
      writeFileSync(list, segs.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"))
      await new Promise<void>((ok, no) => {
        const j = spawn(ff!, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", ...(alpha ? [] : ["-movflags", "+faststart"]), file], { stdio: ["ignore", "ignore", "pipe"] })
        let err = ""
        j.stderr!.on("data", (x: Buffer) => (err += x.toString()))
        j.on("exit", (c) => (c === 0 ? ok() : no(new Error(`ffmpeg couldn't join the parts: ${err.trim().split("\n").pop()}`))))
      })
    }
    meta()
  } finally {
    for (const f of [...segs, list]) drop(f)
  }
}

export function shaders(): Plugin {
  return {
    name: "shaders",
    configureServer(server) {
      const root = server.config.root
      const dir = join(root, ".engine-data", "shaders")
      const logos = join(dir, "logos")
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__shader/")) return next()
        try {
          mkdirSync(logos, { recursive: true })
          const parts = url.pathname.split("/").filter(Boolean)
          // a render: from the cache when it's been made before, else queued
          const start = (b: Body) => {
            const format = b.format === "png" ? "png" : b.format === "mov" || !b.spec.bg ? "mov" : "mp4"
            const key = createHash("sha256").update(JSON.stringify(stable({ spec: b.spec, w: b.width, h: b.height, fps: b.fps, scale: b.scale ?? 1, seconds: b.seconds ?? null, format, t: format === "png" ? b.t ?? 0 : null, code: codeStamp(root) }))).digest("hex").slice(0, 24)
            const name = `${(b.spec.name || b.spec.kind).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shader"}-${key.slice(0, 8)}.${format}`
            const file = join(dir, name)
            const id = randomUUID()
            const job: Job = { id, state: "queued", frame: 0, total: 0 }
            jobs.set(id, job)
            if (existsSync(file)) Object.assign(job, { state: "done", url: `/__shader/file/${name}` })
            else
              line.p = line.p.then(async () => {
                try {
                  await render(job, { ...b, format }, `http://localhost:${server.config.server.port ?? 5180}`, file)
                  Object.assign(job, { state: "done", url: `/__shader/file/${name}` })
                } catch (e) {
                  Object.assign(job, { state: "error", error: (e as Error).message })
                }
              })
            return id
          }
          const sized = (b: { width?: number; height?: number }) => !!b.width && !!b.height && b.width > 15 && b.width <= 4096 && b.height > 15 && b.height <= 4096
          if (req.method === "POST" && parts[1] === "jobs") {
            const b = JSON.parse((await read(req, 2e6)).toString("utf8")) as Body
            if (!b?.spec?.kind || !sized(b)) return json(res, 400, { error: "a spec and a size (16 to 4096 px) are needed" })
            return json(res, 200, { id: start(b) })
          }
          // the presets and the generator live in the app's code (src/shader/spec.ts): the MCP tool and scripts ask
          // here for a spec by name, or a new one by the rules, and get its render started
          type Specs = { PRESETS: Record<string, Body["spec"][]>; generate: (kind: string, seed: number, mood?: string, brand?: string) => Body["spec"] }
          if (req.method === "GET" && parts[1] === "presets") {
            const m = (await server.ssrLoadModule("/src/shader/spec.ts")) as unknown as Specs
            return json(res, 200, Object.fromEntries(Object.entries(m.PRESETS).map(([k, xs]) => [k, xs.map((x) => x.name)])))
          }
          if (req.method === "POST" && parts[1] === "make") {
            const a = JSON.parse((await read(req, 1e5)).toString("utf8")) as { kind?: string; preset?: string; mood?: string; brand?: string; seed?: number; colors?: string[]; text?: string; logo?: string; transparent?: boolean; width?: number; height?: number; fps?: number; seconds?: number; scale?: number }
            const m = (await server.ssrLoadModule("/src/shader/spec.ts")) as unknown as Specs
            const kind = String(a.kind ?? "")
            if (!m.PRESETS[kind]) return json(res, 400, { error: "kind is gradient, shape, liquid or scene" })
            if (!sized(a)) return json(res, 400, { error: "a size (16 to 4096 px) is needed" })
            const hex = (c: unknown) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)
            let spec: Body["spec"] & Record<string, unknown>
            if (a.preset) {
              const p = m.PRESETS[kind].find((x) => (x.name ?? "").toLowerCase() === String(a.preset).toLowerCase())
              if (!p) return json(res, 400, { error: `No ${kind} preset “${a.preset}”. There are: ${m.PRESETS[kind].map((x) => x.name).join(", ")}` })
              spec = { ...p }
            } else spec = { ...m.generate(kind, Number.isFinite(a.seed) ? Number(a.seed) : (Math.random() * 1e6) | 0, a.mood || "any", hex(a.brand) ? a.brand : undefined) }
            if (Array.isArray(a.colors) && a.colors.length && a.colors.every(hex)) spec.colors = kind === "gradient" ? [0, 1, 2].map((i) => a.colors![Math.min(i, a.colors!.length - 1)]) : a.colors.slice(0, 5)
            if (kind === "liquid" && a.text) spec.logo = { type: "text", text: String(a.text).slice(0, 14) }
            if (kind === "liquid" && a.logo && /^\/__shader\/logo\/[\w.-]+$/.test(a.logo)) spec.logo = { type: "image", src: a.logo }
            if (a.transparent) spec.bg = ""
            const id = start({ spec, width: a.width!, height: a.height!, fps: a.fps ?? 60, scale: a.scale, seconds: a.seconds })
            return json(res, 200, { id, spec })
          }
          if (req.method === "GET" && parts[1] === "jobs" && parts[2]) {
            const j = jobs.get(parts[2])
            return j ? json(res, 200, j) : json(res, 404, { error: "no such job" })
          }
          if (req.method === "GET" && parts[1] === "list") {
            const out = readdirSync(dir)
              .filter((f) => f.endsWith(".json"))
              .flatMap((f) => {
                const media = readdirSync(dir).find((x) => x !== f && x.startsWith(f.slice(0, -5) + ".") && !x.includes(".part"))
                if (!media) return []
                try {
                  return [{ name: media, url: `/__shader/file/${media}`, ...JSON.parse(readFileSync(join(dir, f), "utf8")) }]
                } catch {
                  return []
                }
              })
              .sort((a, b) => b.made - a.made)
            return json(res, 200, out)
          }
          if (req.method === "POST" && parts[1] === "logo") {
            const type = String(req.headers["content-type"] ?? "")
            const ext = Object.entries(TYPES).find(([, t]) => t === type.split(";")[0])?.[0]
            if (!ext || !/png|jpe?g|svg|webp|gif/.test(ext)) return json(res, 400, { error: "a PNG, JPEG, SVG or WebP picture" })
            const buf = await read(req, 12e6)
            const name = `${createHash("sha1").update(buf).digest("hex").slice(0, 16)}.${ext}`
            writeFileSync(join(logos, name), buf)
            return json(res, 200, { url: `/__shader/logo/${name}` })
          }
          if (req.method === "GET" && (parts[1] === "file" || parts[1] === "logo") && parts[2] && /^[\w.-]+$/.test(parts[2])) {
            const f = join(parts[1] === "logo" ? logos : dir, parts[2])
            if (!existsSync(f)) return json(res, 404, { error: "not found" })
            const size = statSync(f).size
            res.setHeader("content-type", TYPES[parts[2].split(".").pop()!] ?? "application/octet-stream")
            res.setHeader("accept-ranges", "bytes")
            if (url.searchParams.has("download")) res.setHeader("content-disposition", `attachment; filename="${parts[2]}"`)
            // a video element seeks with ranges
            const range = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ""))
            if (range) {
              const a = range[1] ? Number(range[1]) : 0
              const z = range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
              res.statusCode = 206
              res.setHeader("content-range", `bytes ${a}-${z}/${size}`)
              res.setHeader("content-length", String(z - a + 1))
              return void createReadStream(f, { start: a, end: z }).pipe(res)
            }
            res.setHeader("content-length", String(size))
            return void createReadStream(f).pipe(res)
          }
          next()
        } catch (e) {
          json(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}
