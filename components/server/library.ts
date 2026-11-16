// The Components app's side of the dev server: pictures and videos dropped behind a screen, an animation's code
// read and written into the library, and the library cards' stills (npm run posters).
//   POST /__studio/media            (a dropped background image or video) -> { url }
//   GET  /__studio/media/:id
//   POST /__studio/import/read|add  { files: [{ name, code }] } (see importer.ts)
//   POST /__studio/posters          { only?: id[] } -> { made }  into public/thumbs
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { addImport, readImport } from "./importer"

const DIR = join(tmpdir(), "anim-engine-studio")
// kept on the process, not the module: a dev server restart loads this file again
const kept = globalThis as unknown as { __engineMedia?: Map<string, { file: string; type: string }>; __engineQueue?: { p: Promise<void> } }
const media = (kept.__engineMedia ??= new Map<string, { file: string; type: string }>())
const line = (kept.__engineQueue ??= { p: Promise.resolve() }) // one poster run at a time

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

export function library(): Plugin {
  let origin = ""
  const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (!url.pathname.startsWith("/__studio/")) return next()
    origin ||= (server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`).replace(/\/$/, "")
    const [, , what, id] = url.pathname.split("/")
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
      // a dropped picture outlives the server: after a restart it's found on disk
      if (what === "media" && id && !media.has(id) && /^[0-9a-f-]{36}$/.test(id) && existsSync(join(DIR, `media-${id}.type`)))
        media.set(id, { file: join(DIR, `media-${id}`), type: readFileSync(join(DIR, `media-${id}.type`), "utf8") })
      if (what === "media" && id && media.has(id)) return sendFile(req, res, media.get(id)!.file, media.get(id)!.type)
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
      return json(res, 404, { error: "Not found" })
    } catch (e) {
      return json(res, 500, { error: (e as Error).message })
    }
  }
  return {
    name: "components-library",
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(server, req, res, next))
    },
  }
}
