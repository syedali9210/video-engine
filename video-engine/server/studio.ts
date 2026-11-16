// Mockup studio — the export side of the dev server. A job opens render.html in headless Chrome (on the GPU), steps
// it frame by frame over the DevTools protocol and captures each one: one frame is a PNG; a video goes through
// ffmpeg (H.264 MP4, or ProRes 4444 with alpha when the background is transparent). A video is split between up to
// four Chromes rendering side by side (see `plan`), all feeding one encoder in film order.
//   POST /__studio/jobs        { config, kind: "png" | "video", width, height, scale, fps } -> { id }
//   GET  /__studio/jobs/:id    -> { state, frame, total, error? }
//   GET  /__studio/jobs/:id/file
//   POST /__studio/media       (a dropped background image or video) -> { url }
//   POST /__studio/posters     { only?: id[] } -> { made }  the library cards' stills, into public/thumbs
import { spawn, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { cpus, freemem, tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { addImport, readImport } from "./importer"
import { plan, type Part } from "./plan"
import { technical, type Gate } from "./gates"
import { addSound } from "./sound"

type Kind = "png" | "video"
type Job = {
  id: string
  kind: Kind
  state: "queued" | "rendering" | "encoding" | "done" | "error"
  frame: number
  total: number
  error?: string
  file?: string
  type?: string
  ext?: string
  /** the technical gate, run on the finished file (server/gates.ts) */
  checks?: Gate
  /** scenes taken from the render cache, not rendered again */
  cached?: number
  /** its best stills for a thumbnail, once asked for */
  thumbs?: { t: number; file: string }[]
}

const DIR = join(tmpdir(), "anim-engine-studio")
// kept on the process, not the module: when the dev server restarts (a config file saved), this file is loaded again,
// and a render in flight carries on and is still found
const kept = globalThis as unknown as { __engineJobs?: Map<string, Job>; __engineMedia?: Map<string, { file: string; type: string }>; __engineQueue?: { p: Promise<void> } }
const jobs = (kept.__engineJobs ??= new Map<string, Job>())
const media = (kept.__engineMedia ??= new Map<string, { file: string; type: string }>())
const line = (kept.__engineQueue ??= { p: Promise.resolve() }) // one render at a time: they share the GPU
/** A finished export's file (a review link keeps a copy). */
export const jobFile = (id: string) => (jobs.get(id)?.state === "done" ? jobs.get(id)!.file : undefined)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Deletes a closed Chrome's profile once it lets go. One it still holds (Windows: EBUSY) is left to the OS's temp
    cleaner: a throw here, in a timer, would take the whole dev server down. */
export const dropProfile = (dir: string) =>
  setTimeout(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* still held */
    }
  }, 2000)

export function findChrome() {
  const env = process.env.STUDIO_CHROME
  if (env && existsSync(env)) return env
  const pf = process.env.PROGRAMFILES ?? "C:/Program Files"
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)"
  const local = process.env.LOCALAPPDATA ?? ""
  const paths = [
    `${pf}/Google/Chrome/Application/chrome.exe`,
    `${pf86}/Google/Chrome/Application/chrome.exe`,
    `${local}/Google/Chrome/Application/chrome.exe`,
    `${pf86}/Microsoft/Edge/Application/msedge.exe`,
    `${pf}/Microsoft/Edge/Application/msedge.exe`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
  return paths.find((p) => existsSync(p))
}

export const ffmpeg = () => {
  const bin = process.env.STUDIO_FFMPEG || "ffmpeg"
  return spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0 ? bin : null
}

/** A video file's length and where it cuts (ffmpeg's scene detection; `threshold` 0.05 to 0.9, higher keeps only the
    big changes). Null without ffmpeg; throws on a file it can't read. */
export function sceneCuts(file: string, threshold = 0.3): { duration: number; cuts: number[] } | null {
  const ff = ffmpeg()
  if (!ff) return null
  const probe = spawnSync(ff.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" })
  const duration = Number(probe.stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("That doesn't look like a video ffmpeg can read.")
  const t = Math.min(0.9, Math.max(0.05, threshold))
  const run = spawnSync(ff, ["-hide_banner", "-i", file, "-vf", `scale=320:-2,select=gt(scene\\,${t}),showinfo`, "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const cuts = [...(run.stderr ?? "").matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x > 0.25 && x < duration - 0.25)
  // a burst of flashes reads as one cut
  return { duration, cuts: cuts.filter((x, i) => i === 0 || x - cuts[i - 1] > 0.4) }
}

/** A small DevTools-protocol client over Node's own WebSocket. */
export async function devtools(chrome: string, profile: string) {
  const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
  const browserUrl = await new Promise<string>((resolve, reject) => {
    let err = ""
    const t = setTimeout(() => reject(new Error("Chrome didn't start")), 20000)
    proc.stderr!.on("data", (b: Buffer) => {
      err += b.toString()
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(t)
        resolve(m[1])
      }
    })
    proc.on("exit", () => reject(new Error("Chrome quit while starting")))
  })
  const port = new URL(browserUrl).port
  let page: { webSocketDebuggerUrl: string; type: string } | undefined
  for (let i = 0; i < 50 && !page; i++) {
    page = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { webSocketDebuggerUrl: string; type: string }[]).find((x) => x.type === "page")
    if (!page) await sleep(100)
  }
  const ws = new WebSocket(page!.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let seq = 0
  const pending = new Map<number, (m: { result?: Record<string, unknown>; error?: { message: string } }) => void>()
  const errors: string[] = []
  /** frames on other sites (a film's own frame) attached as sessions of their own, once Target.setAutoAttach is on */
  const frames = new Map<string, { sessionId: string; url: string }>()
  /** whoever listens for an event (a screencast's frames) */
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>()
  const on = (method: string, fn: (params: Record<string, unknown>) => void) => {
    listeners.set(method, (listeners.get(method) ?? new Set()).add(fn))
    return () => void listeners.get(method)?.delete(fn)
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data))
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m)
      pending.delete(m.id)
    } else if (m.method === "Runtime.exceptionThrown") errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split("\n")[0])
    else if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "iframe") frames.set(m.params.targetInfo.targetId, { sessionId: m.params.sessionId, url: m.params.targetInfo.url })
    else if (m.method === "Target.detachedFromTarget") for (const [k, v] of frames) if (v.sessionId === m.params.sessionId) frames.delete(k)
    if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params)
  }
  // if Chrome dies mid-job nothing will ever answer: fail what's waiting, or the render queue would hang behind it
  const fail = (why: string) => {
    for (const cb of pending.values()) cb({ error: { message: why } })
    pending.clear()
  }
  ws.onclose = () => fail("Chrome closed the connection")
  proc.on("exit", () => fail("Chrome quit"))
  const send = <T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string) =>
    new Promise<T>((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) return reject(new Error(`${method}: Chrome is gone`))
      const id = ++seq
      pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)))
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  /** `sessionId`: in one of the attached frames instead of the page */
  const evaluate = async (expression: string, timeout = 90000, sessionId?: string) => {
    const r = await send<{ result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout }, sessionId)
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split("\n")[0])
    return r.result?.value
  }
  const close = async () => {
    // Chrome can quit without answering, and a close that never settles would hold the render queue forever
    await Promise.race([send("Browser.close").catch(() => {}), sleep(2000)])
    ws.close()
    proc.kill()
  }
  return { send, evaluate, close, errors, proc, frames, on }
}

type Body = { config: { transparent: boolean; start?: number; duration: number; comp?: { blur?: boolean; ghost?: number; scenes?: { duration: number; transition?: string }[]; music?: { url: string; offset?: number; gain?: number; beats?: number[] }; sfx?: boolean; voice?: { lines: { scene: string; url: string }[] } }; screens?: unknown; components?: unknown }; width: number; height: number; scale: number; fps: number; /** false: render it all again, ignoring the render cache */ cache?: boolean; /** a quick look: a fast encode */ draft?: boolean }

/** How many Chromes a video is split between, decided when it starts: a renderer holds about two gigabytes and keeps
    some six threads busy, and past what's free Windows starts compressing memory and every part slows down. So one per
    four free gigabytes and per eight threads, at most four. STUDIO_WORKERS overrides it. */
const partsFor = () => Number(process.env.STUDIO_WORKERS) || Math.max(1, Math.min(4, Math.round(cpus().length / 8), Math.floor(freemem() / 4e9)))

/** One headless Chrome on the render page, sized for the export and ready to draw: for a later part of a split
    export, where it joins the film and where it starts capturing (see `plan`). */
async function renderer(chrome: string, origin: string, job: Job, body: Body, part?: Part) {
  const scale = Math.min(3, Math.max(1, body.scale || 1))
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const cdp = await devtools(chrome, profile)
  const close = async () => {
    await cdp.close()
    dropProfile(profile)
  }
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.round(body.width / scale), height: Math.round(body.height / scale), deviceScaleFactor: scale, mobile: false })
    if (body.config.transparent) await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } })
    const config = part?.a ? { ...body.config, join: part.join, first: part.first } : body.config
    await cdp.send("Page.navigate", { url: `${origin}/render.html?job=${job.id}#${encodeURIComponent(JSON.stringify(config))}` })
    for (let i = 0; i < 300 && !(await cdp.evaluate("!!window.__studio").catch(() => false)); i++) await sleep(100)
    await cdp.evaluate("window.__studio.ready.then(() => true)", 120000)
  } catch (e) {
    await close()
    throw e
  }
  return {
    frame: (t: number) => cdp.evaluate(`window.__studio.frame(${t})`),
    // Chrome's fastest encoder: ffmpeg encodes every frame again anyway
    shot: async (format: "png" | "jpeg") => Buffer.from((await cdp.send<{ data: string }>("Page.captureScreenshot", { format, quality: format === "jpeg" ? 95 : undefined, optimizeForSpeed: true })).data, "base64"),
    close,
    errors: cdp.errors,
  }
}

async function render(job: Job, body: Body, origin: string, root?: string) {
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to render with. Set STUDIO_CHROME to its path.")
  const video = job.kind === "video"
  const ff = video ? ffmpeg() : null
  if (video && !ff) throw new Error("Video export needs ffmpeg on your PATH (winget install ffmpeg, or brew install ffmpeg).")
  const clear = body.config.transparent
  mkdirSync(DIR, { recursive: true })

  if (!video) {
    const r = await renderer(chrome, origin, job, body)
    try {
      job.total = 1
      job.state = "rendering"
      await r.frame(0)
      job.file = join(DIR, `${job.id}.png`)
      writeFileSync(job.file, await r.shot("png"))
      job.frame = 1
      job.type = "image/png"
      job.ext = "png"
    } finally {
      await r.close()
    }
    return
  }

  const fps = body.fps === 60 ? 60 : 30
  const n = Math.max(1, Math.round(body.config.duration * fps))
  // motion blur: four moments across a 180° shutter per frame, averaged; ghost: bright things leave fading trails
  const k = body.config.comp?.blur ? 4 : 1
  const ghost = Math.max(0, Math.min(1, body.config.comp?.ghost ?? 0))
  // (tmix averages the last k frames, so every k-th output from the (k-1)th is one whole frame's moments)
  const post = [k > 1 && `tmix=frames=${k}`, k > 1 && `trim=start_frame=${k - 1}`, k > 1 && `framestep=${k}`, k > 1 && `setpts=N/(${fps}*TB)`, ghost > 0 && `lagfun=decay=${(0.8 + 0.17 * ghost).toFixed(3)}`].filter(Boolean).join(",")
  job.total = n
  job.state = "rendering"
  job.ext = clear ? "mov" : "mp4"
  job.type = clear ? "video/quicktime" : "video/mp4"
  job.file = join(DIR, `${job.id}.${job.ext}`)
  const codec = clear
    ? [...(post ? ["-vf", post] : []), "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"]
    : // Chrome's JPEGs are full-range BT.601; video players expect limited-range BT.709, tagged as such
      [
        "-vf",
        `${post ? `${post},` : ""}scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709`,
        "-c:v",
        "libx264",
        "-preset",
        body.draft ? "ultrafast" : "medium",
        "-crf",
        body.draft ? "24" : "16",
        "-profile:v",
        "high",
        "-movflags",
        "+faststart",
      ]
  const sample = (i: number, j: number) => (i + (j / k) * 0.5) / fps
  const scenes = body.config.comp?.scenes ?? [{ duration: body.config.duration }]
  const shot = (r: Awaited<ReturnType<typeof renderer>>) => r.shot(clear ? "png" : "jpeg")
  let failure: Error | null = null
  const fail = (e: Error) => void (failure ??= e)
  let captured = 0
  /** One renderer's part, captured frame by frame into `put`. A renderer that dies part way is started again and
      carries on from the first frame it hadn't captured (twice at most): a crash costs seconds, not the export. */
  const work = async (p: Part, put: (idx: number, img: Buffer) => void) => {
    const done = new Set<number>()
    for (let attempt = 0; ; attempt++) {
      const r = await renderer(chrome, origin, job, body, p)
      try {
        for (const t of p.visit) await r.frame(t)
        for (let i = p.a; i < p.b && !failure; i++) {
          if (done.has(i)) continue
          for (let j = 0; j < k; j++) {
            await r.frame(sample(i, j))
            put(i * k + j, await shot(r))
          }
          done.add(i)
          job.frame = ++captured
        }
        return
      } catch (e) {
        if (r.errors.length) console.warn("[studio]", r.errors.slice(0, 3).join(" | "))
        if (attempt >= 2 || failure) throw e
        console.warn(`[studio] a renderer stopped (${(e as Error).message}); starting it again from frame ${[...Array(p.b - p.a).keys()].map((x) => x + p.a).find((x) => !done.has(x))}`)
      } finally {
        await r.close()
      }
    }
  }

  // the render cache: a film of several scenes is rendered scene by scene (as far as its cuts allow), each kept by what
  // it's made of; an export again renders only the scenes that changed and joins the rest from the cache
  const comp = body.config.comp as { scenes?: { id: string; duration: number; layers?: { id: string }[] }[]; [k: string]: unknown } | undefined
  const cacheDir = root ? join(root, ".engine-data", "render-cache") : ""
  if (cacheDir && !clear && (comp?.scenes?.length ?? 0) > 1 && body.cache !== false) {
    mkdirSync(cacheDir, { recursive: true })
    const segs = plan(scenes, body.config.start ?? 0, n, k, sample, 1, true)
    const stamp = codeStamp(root!)
    const starts = scenes.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + scenes[i - 1].duration : 0], [])
    const keyOf = (p: Part) => {
      // what the segment's pictures are made of: the scenes from where its renderer joins to its last frame, what those
      // scenes' frames hold, the export's settings, and the engine's code
      const t0 = (body.config.start ?? 0) + Math.min(p.join, sample(p.a, 0))
      const t1 = (body.config.start ?? 0) + sample(p.b - 1, k - 1)
      const window = (comp!.scenes ?? []).filter((_, i) => starts[i] <= t1 && starts[i] + scenes[i].duration >= t0)
      const ids = new Set(window.flatMap((x) => [x.id, ...(x.layers ?? []).map((l) => l.id)]))
      const own = (m: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(m ?? {}).filter(([key]) => key.split(":").some((x) => ids.has(x))))
      // (the sound is laid on after: a new song doesn't redraw a frame)
      const { scenes: _, music: _m, sfx: _x, voice: _v, ...rest } = comp! as Record<string, unknown>
      // its times as they fall in its own scenes, not in the film: a scene retimed earlier on doesn't redraw this one,
      // unless it moves this one's frames off the frame grid (then they are different pictures)
      const zero = starts[(comp!.scenes ?? []).indexOf(window[0])] ?? 0
      const rel = (t: number) => Math.round((t - zero) * 1e4) / 1e4
      const span = { frames: p.b - p.a, first: rel((body.config.start ?? 0) + sample(p.a, 0)), join: rel((body.config.start ?? 0) + p.join), visit: p.visit.map((t) => rel((body.config.start ?? 0) + t)) }
      return createHash("sha256").update(JSON.stringify({ span, rest, window, screens: own(body.config.screens as Record<string, unknown>), components: own(body.config.components as Record<string, unknown>), size: [body.width, body.height, body.scale, !!body.draft], fps, k, ghost, stamp })).digest("hex").slice(0, 32)
    }
    const files = segs.map((p) => join(cacheDir, `${keyOf(p)}.mp4`))
    const todo = segs.map((p, i) => ({ p, file: files[i] })).filter((x) => !existsSync(x.file))
    job.frame = captured = segs.filter((_, i) => existsSync(files[i])).reduce((a, p) => a + (p.b - p.a), 0)
    job.cached = segs.length - todo.length
    // the missing segments, a few at once, each into its own file
    const pool = Math.max(1, partsFor())
    let at = 0
    const renderSeg = async ({ p, file }: { p: Part; file: string }) => {
      const tmp = `${file}.${job.id}.part.mp4`
      const enc = encode(ff!, tmp, fps, k, codec, clear, p.a * k)
      try {
        await work(p, enc.put)
        if (failure) throw failure
        await enc.finish()
        renameSync(tmp, file)
      } catch (e) {
        enc.kill()
        rmSync(tmp, { force: true })
        throw e
      }
    }
    await Promise.all(Array.from({ length: Math.min(pool, todo.length) }, async () => {
      while (at < todo.length && !failure) await renderSeg(todo[at++]).catch(fail)
    }))
    if (failure) throw failure
    job.state = "encoding"
    // joined without encoding again: every segment was made with the same settings, each from a keyframe
    const list = join(DIR, `${job.id}.txt`)
    writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"))
    const joined = spawnSync(ff!, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", job.file], { encoding: "utf8" })
    rmSync(list, { force: true })
    if (joined.status !== 0) throw new Error(`ffmpeg couldn't join the scenes: ${joined.stderr.trim().split("\n").pop()}`)
    pruneCache(cacheDir)
  } else {
    // one encoder takes every frame in film order: a later part's frames wait their turn
    const enc = encode(ff!, job.file, fps, k, codec, clear, 0)
    const parts = plan(scenes, body.config.start ?? 0, n, k, sample, partsFor())
    try {
      await Promise.all(parts.map((p) => work(p, enc.put).catch(fail)))
      if (failure) throw failure
      job.state = "encoding"
      await enc.finish()
    } finally {
      enc.kill()
    }
  }
  // the sound: the song and the cuts' sound design, laid on the picture
  const music = body.config.comp?.music
  const song = music?.url ? media.get(music.url.split("/").pop() ?? "") : undefined
  // the voiceover's lines, each from 0.15 s into its scene
  const starts = scenes.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + scenes[i - 1].duration : 0], [])
  const ids = (body.config.comp?.scenes ?? []) as { id?: string }[]
  const voice = (body.config.comp?.voice?.lines ?? []).flatMap((l) => {
    const i = ids.findIndex((x) => x.id === l.scene)
    const file = root && /^\/__voice\/file\/[\w-]+\.wav$/.test(l.url) ? join(root, ".engine-data", "voice", l.url.split("/").pop()!) : ""
    return i >= 0 && file && existsSync(file) ? [{ file, at: starts[i] + 0.15 }] : []
  })
  if (song || body.config.comp?.sfx || voice.length) {
    job.state = "encoding"
    addSound(ff!, job.file, scenes, { ...(song ? { music: { file: song.file, offset: music!.offset, gain: music!.gain, beats: music!.beats } } : {}), sfx: !!body.config.comp?.sfx, voice })
  }
  // the file itself checked: frame rate and count, colour tags, black and frozen stretches, flashes, loudness
  try {
    job.checks = technical(job.file, { fps, duration: body.config.duration })
  } catch {
    // a check that can't run doesn't fail the export
  }
}

/** An encoder taking frames in order (`base`: the first frame's index): a frame that comes early waits its turn, on
    disk past the first few. `finish` once every frame is in. */
function encode(ff: string, file: string, fps: number, k: number, codec: string[], clear: boolean, base: number) {
  const encoder = spawn(ff, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps * k), "-c:v", clear ? "png" : "mjpeg", "-i", "-", ...codec, "-r", String(fps), file], { stdio: ["pipe", "ignore", "pipe"] })
  let ffErr = ""
  encoder.stderr!.on("data", (b: Buffer) => (ffErr += b.toString()))
  encoder.stdin!.on("error", () => {}) // an encoder that quit says why when it exits
  const exited = new Promise<number>((r) => encoder.on("exit", (code) => r(code ?? 1)))
  let gone = false
  void exited.then(() => (gone = true))
  const ffFailed = () => new Error(`ffmpeg failed: ${ffErr.trim().split("\n").pop() || "it quit"}`)
  const spool = mkdtempSync(join(DIR, "spool-"))
  const held = new Map<number, Buffer | string>()
  let next = base
  let failure: Error | null = null
  let pump: Promise<void> = Promise.resolve()
  const put = (idx: number, img: Buffer) => {
    if (idx < next) return // captured again by a restarted renderer: already in
    if (idx - next > 12) {
      const f = join(spool, String(idx))
      writeFileSync(f, img)
      held.set(idx, f)
    } else held.set(idx, img)
    pump = pump
      .then(async () => {
        while (!failure && held.has(next)) {
          if (gone) throw ffFailed()
          const v = held.get(next)!
          held.delete(next)
          const buf = typeof v === "string" ? readFileSync(v) : v
          if (typeof v === "string") rmSync(v, { force: true })
          if (!encoder.stdin!.write(buf)) await Promise.race([new Promise((r) => encoder.stdin!.once("drain", r)), exited])
          next++
        }
      })
      .catch((e: Error) => void (failure ??= e))
  }
  return {
    put,
    finish: async () => {
      await pump
      if (failure) throw failure
      encoder.stdin!.end()
      if ((await exited) !== 0) throw ffFailed()
      rmSync(spool, { recursive: true, force: true })
    },
    kill: () => {
      encoder.kill()
      rmSync(spool, { recursive: true, force: true })
    },
  }
}

/** The engine's code, as one stamp: what every frame is drawn by. Any file changed and the cached scenes are drawn
    again. */
// ponytail: any code change empties the cache's use; stamp per film template if that costs real time
function codeStamp(root: string) {
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])) : [])
  const h = createHash("sha256")
  for (const f of [...walk(join(root, "src")), join(root, "public", "engine-bridge.js"), join(root, "render.html"), join(root, "stage.html")]) if (existsSync(f)) h.update(`${f}:${statSync(f).mtimeMs}:${statSync(f).size}\n`)
  return h.digest("hex").slice(0, 16)
}

/** The cache kept under 4 GB: the least recently made go first. */
function pruneCache(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".mp4") && !f.includes(".part.")).map((f) => ({ f: join(dir, f), s: statSync(join(dir, f)) }))
  let total = files.reduce((a, x) => a + x.s.size, 0)
  for (const x of files.sort((a, b) => a.s.mtimeMs - b.s.mtimeMs)) {
    if (total < 4e9) break
    rmSync(x.f, { force: true })
    total -= x.s.size
  }
}

/** The film's best stills for a thumbnail: four frames a second scored by ffmpeg (sharp, full of detail, well away
    from a cut, neither black nor blown out), the best three from different scenes where it has them (else a second
    apart), each saved at full size. */
export function bestThumbs(file: string, out: string) {
  const ff = ffmpeg()
  if (!ff) throw new Error("Thumbnails need ffmpeg on your PATH.")
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-vf", "fps=4,scale=480:-2,blurdetect,entropy,scdet=threshold=6,signalstats,metadata=print", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  const frames: { t: number; blur: number; entropy: number; cut: number; y: number }[] = []
  for (const block of (r.stderr ?? "").split(/frame:\d+\s+pts:\d+\s+pts_time:/).slice(1)) {
    const t = parseFloat(block)
    const num = (k: string) => Number(new RegExp(`${k}=([\\d.]+)`).exec(block)?.[1] ?? NaN)
    frames.push({ t, blur: num("lavfi\\.blur"), entropy: num("lavfi\\.entropy\\.normalized_entropy\\.normal\\.Y"), cut: num("lavfi\\.scd\\.score"), y: num("lavfi\\.signalstats\\.YAVG") })
  }
  if (!frames.length) throw new Error("ffmpeg read no frames from the film.")
  const end = frames[frames.length - 1].t
  const cuts = frames.filter((f) => f.cut > 6).map((f) => f.t)
  const score = (f: (typeof frames)[number]) => (Number.isFinite(f.entropy) ? f.entropy * 3 : 1) - (Number.isFinite(f.blur) ? f.blur * 0.4 : 0) - (cuts.some((c) => Math.abs(c - f.t) < 0.35) ? 2 : 0) - (f.y < 25 || f.y > 235 ? 2 : 0) - (f.t < 0.3 || f.t > end - 0.3 ? 3 : 0)
  const scene = (t: number) => cuts.filter((c) => c <= t).length
  const ranked = [...frames].sort((a, b) => score(b) - score(a))
  const picks: number[] = []
  for (const apart of [true, false])
    for (const f of ranked) if (picks.length < 3 && picks.every((p) => Math.abs(p - f.t) >= 1 && (!apart || scene(p) !== scene(f.t)))) picks.push(f.t)
  return picks.map((t, i) => {
    const png = `${out}-thumb-${i}.png`
    spawnSync(ff, ["-y", "-loglevel", "error", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", png])
    return { t: Math.round(t * 100) / 100, file: png }
  })
}

type PosterMeta = { id: string; html?: boolean; layout?: string; poster?: { at?: number; y?: number } }

/** The library's card stills: each animation on an iPhone-sized page, run on the stepped clock to its moment, cropped
    to the card's 4:3, in both themes. Written to public/thumbs/<id>-<light|dark>.webp. */
async function posters(server: ViteDevServer, origin: string, only: string[]) {
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to render with. Set STUDIO_CHROME to its path.")
  const { ANIMS } = (await server.ssrLoadModule("/src/registry.ts")) as { ANIMS: PosterMeta[] }
  const out = join(server.config.publicDir, "thumbs")
  mkdirSync(out, { recursive: true })
  const W = 402
  const H = 874
  const CH = Math.round((W * 3) / 4)
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const cdp = await devtools(chrome, profile)
  const made: string[] = []
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false })
    for (const a of ANIMS.filter((x) => !only.length || only.includes(x.id))) {
      for (const scheme of ["light", "dark"]) {
        const q = new URLSearchParams({ frame: "poster", rm: "0", cs: scheme, vt: "1", dpr: "2", host: origin })
        if (!a.html) q.set("a", a.id)
        await cdp.send("Page.navigate", { url: `${origin}${a.html ? `/anim/${a.id}/index.html` : "/stage.html"}?${q}` })
        for (let i = 0; i < 200 && !(await cdp.evaluate("document.readyState === 'complete' && !!window.__adv").catch(() => false)); i++) await sleep(50)
        // React mounts the animation lazily, on timers that only run when the clock is stepped
        for (let i = 0; i < 400 && !(await cdp.evaluate(`window.__adv(16).then(() => !!document.querySelector("#root > *, body > :not(script):not(#root)"))`)); i++) await sleep(8)
        await cdp.evaluate("Promise.all([...document.images].map((i) => i.complete || new Promise((r) => { i.onload = i.onerror = r }))).then(() => document.fonts.ready).then(() => true)")
        // in frame-sized steps, so anything that builds up frame by frame gets its frames
        for (let t = 0; t < (a.poster?.at ?? 1800); t += 16) await cdp.evaluate("window.__adv(16)")
        // GPU work lands on its own time: give WebGL / WebGPU a few real frames to present
        for (let i = 0; i < 6; i++) {
          await cdp.evaluate("window.__adv(16)")
          await sleep(60)
        }
        const y = a.poster?.y ?? (a.layout === "fill" ? 0 : 0.5)
        const top = Math.round(Math.min(H - CH, Math.max(0, y * H - CH / 2)))
        const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "webp", quality: 82, clip: { x: 0, y: top, width: W, height: CH, scale: 1 } })
        writeFileSync(join(out, `${a.id}-${scheme}.webp`), Buffer.from(data, "base64"))
      }
      made.push(a.id)
    }
  } finally {
    await cdp.close()
    dropProfile(profile)
  }
  return made
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(body))
}
const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []
    req.on("data", (c: Buffer) => parts.push(c))
    req.on("end", () => resolve(Buffer.concat(parts)))
    req.on("error", reject)
  })

/** Serve a file, with byte ranges: a video only seeks when its server answers them. */
export function sendFile(req: IncomingMessage, res: ServerResponse, file: string, type: string, download?: string) {
  const size = statSync(file).size
  res.setHeader("content-type", type)
  res.setHeader("accept-ranges", "bytes")
  if (download) res.setHeader("content-disposition", `attachment; filename="${download}"`)
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "")
  if (range && !download) {
    const start = range[1] ? +range[1] : 0
    const end = range[2] ? Math.min(+range[2], size - 1) : size - 1
    res.statusCode = 206
    res.setHeader("content-range", `bytes ${start}-${end}/${size}`)
    res.setHeader("content-length", String(end - start + 1))
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.setHeader("content-length", String(size))
  createReadStream(file).pipe(res)
}

/** Only the engine's own page may change things here. The frames it hosts (and any page they open) live on *.localhost
    sites of their own, and a page anywhere else sends its own origin; a script on this machine (npm run posters) sends
    neither. */
export function fromEngine(req: IncomingMessage) {
  const host = req.headers.host ?? ""
  if (/\.localhost(:\d+)?$/i.test(host)) return false
  const origin = req.headers.origin
  const site = req.headers["sec-fetch-site"]
  if (!origin && !site) return true
  if (origin)
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  return site === "same-origin" || site === "none"
}

export function studio(): Plugin {
  let origin = ""
  const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (!url.pathname.startsWith("/__studio/")) return next()
    origin ||= (server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`).replace(/\/$/, "")
    const [, , what, id, extra] = url.pathname.split("/")
    if (req.method === "POST" && !fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
    try {
      if (what === "media" && req.method === "POST") {
        const mid = randomUUID()
        const type = req.headers["content-type"] ?? "application/octet-stream"
        mkdirSync(DIR, { recursive: true })
        const file = join(DIR, `media-${mid}`)
        writeFileSync(file, await readBody(req))
        writeFileSync(`${file}.type`, type)
        media.set(mid, { file, type })
        return json(res, 200, { url: `/__studio/media/${mid}` })
      }
      // a picture in a composition outlives the server: after a restart it's found on disk
      if (what === "media" && id && !media.has(id) && /^[0-9a-f-]{36}$/.test(id) && existsSync(join(DIR, `media-${id}.type`)))
        media.set(id, { file: join(DIR, `media-${id}`), type: readFileSync(join(DIR, `media-${id}.type`), "utf8") })
      if (what === "media" && id && media.has(id)) return sendFile(req, res, media.get(id)!.file, media.get(id)!.type)
      // copy for a film, by Claude, when the dev server has a key (the key never reaches the page)
      if (what === "copy" && req.method === "POST") {
        const key = process.env.ANTHROPIC_API_KEY
        if (!key) return json(res, 503, { error: "No ANTHROPIC_API_KEY: the engine writes the copy itself." })
        const ctx = JSON.parse((await readBody(req)).toString() || "{}")
        const system =
          "You write on-screen copy for short product launch films, in the style of Apple's launch films and the best SaaS launch ads: " +
          "a 2–4 word hook (the pain or the promise), short noun-phrase feature lines of 2–5 words (like 'Forged aluminum unibody', 'Center Stage front camera'), " +
          "one feature split into two halves that part around a device ('for smarter | group selfies'), a tagline of at most 8 words, and a 2–4 word call to action. " +
          "Use only what the context says the product is and shows. Never invent numbers, names, prices or claims; 'proof' is empty unless a figure from the screen supports it. " +
          'Answer with JSON only: {"kicker","hook","name","tagline","features":[3 or 4 strings],"split","proof","cta"}.'
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: process.env.STUDIO_COPY_MODEL || "claude-sonnet-5-5", max_tokens: 1500, system, messages: [{ role: "user", content: JSON.stringify(ctx) }] }),
        }).catch(() => null)
        if (!r || !r.ok) return json(res, 502, { error: `Claude didn't answer (${r?.status ?? "offline"})` })
        const out = (await r.json()) as { content?: { type: string; text?: string }[] }
        const text = out.content?.find((c) => c.type === "text")?.text ?? ""
        const m = /\{[\s\S]*\}/.exec(text)
        try {
          return json(res, 200, JSON.parse(m ? m[0] : text))
        } catch {
          return json(res, 502, { error: "Claude's answer wasn't JSON" })
        }
      }
      // a reference video's length and where it cuts (ffmpeg's scene detection), to time a composition to it
      if (what === "cuts" && req.method === "POST") {
        const ff = ffmpeg()
        if (!ff) return json(res, 503, { error: "Reading a video needs ffmpeg on your PATH (winget install ffmpeg, or brew install ffmpeg)." })
        mkdirSync(DIR, { recursive: true })
        const file = join(DIR, `cuts-${randomUUID()}`)
        writeFileSync(file, await readBody(req))
        try {
          return json(res, 200, sceneCuts(file, Number(url.searchParams.get("t")) || 0.3))
        } catch (e) {
          return json(res, 400, { error: (e as Error).message })
        } finally {
          rmSync(file, { force: true })
        }
      }
      // an animation's code, read for what's tunable in it, then written into the library (see importer.ts)
      if (what === "import" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString() || "{}")
        if (!Array.isArray(body.files) || body.files.some((f: { name?: unknown; code?: unknown }) => typeof f.name !== "string" || typeof f.code !== "string")) return json(res, 400, { error: "Send the files' names and code" })
        if (id === "read") return json(res, 200, readImport(body.files, server.config.root))
        if (id === "add") return json(res, 200, addImport(body, server.config.root))
      }
      if (what === "posters" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString() || "{}") as { only?: string[] }
        const run = line.p.then(() => posters(server, origin, body.only ?? []))
        line.p = run.then(
          () => {},
          () => {},
        )
        return json(res, 200, { made: await run })
      }
      if (what === "jobs" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString())
        // a video's sides are even: H.264 (4:2:0) takes no odd ones
        if (body.kind === "video") [body.width, body.height] = [Math.round(body.width / 2) * 2, Math.round(body.height / 2) * 2]
        const job: Job = { id: randomUUID(), kind: body.kind === "video" ? "video" : "png", state: "queued", frame: 0, total: 0 }
        jobs.set(job.id, job)
        line.p = line.p.then(() =>
          render(job, body, origin, server.config.root).then(
            () => void (job.state = "done"),
            (e: Error) => {
              job.state = "error"
              job.error = e.message
            },
          ),
        )
        return json(res, 200, { id: job.id })
      }
      const job = id ? jobs.get(id) : undefined
      if (what === "jobs" && job && !extra) return json(res, 200, { state: job.state, frame: job.frame, total: job.total, error: job.error, checks: job.checks, cached: job.cached })
      if (what === "jobs" && job && extra === "file" && job.state === "done" && job.file) return sendFile(req, res, job.file, job.type!, `studio.${job.ext}`)
      // the film's best stills, for a thumbnail
      if (what === "jobs" && job && extra === "thumbs" && job.state === "done" && job.file && job.kind === "video") {
        job.thumbs ??= bestThumbs(job.file, join(DIR, job.id))
        return json(res, 200, job.thumbs.map((x, i) => ({ t: x.t, url: `/__studio/jobs/${job.id}/thumb/${i}` })))
      }
      const n = Number((url.pathname.split("/")[5] ?? "x"))
      if (what === "jobs" && job && extra === "thumb" && job.thumbs?.[n]) return sendFile(req, res, job.thumbs[n].file, "image/png", `thumbnail-${n + 1}.png`)
      return json(res, 404, { error: "Not found" })
    } catch (e) {
      return json(res, 500, { error: (e as Error).message })
    }
  }
  return {
    name: "anim-engine-studio",
    configureServer(server) {
      // a finished export is downloaded once: a day later it goes, with anything a crash left behind (dropped pictures
      // stay: a composition may still use them)
      try {
        for (const f of readdirSync(DIR))
          if (/^[0-9a-f-]{36}\.(mp4|mov|png)$|^spool-|^cuts-/.test(f) && Date.now() - statSync(join(DIR, f)).mtimeMs > 864e5) rmSync(join(DIR, f), { recursive: true, force: true })
      } catch {
        /* nothing exported yet */
      }
      server.middlewares.use((req, res, next) => void handle(server, req, res, next))
    },
  }
}
