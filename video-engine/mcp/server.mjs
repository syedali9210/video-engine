#!/usr/bin/env node
// Animation Engine — its MCP server. A client (Claude Code, Claude Desktop…) asks for a launch film or an interactive
// canvas in one call, and the engine does the rest by itself: it reads the project (its name, what it is, its
// features, its colours and type), captures the running app's screens at phone size, builds the film from one of its
// templates, renders it, waits, and saves the file. The answer is a few lines with where the file is, so the client
// spends nothing on the making. No dependencies: newline-delimited JSON-RPC on stdio, the engine's dev server
// (started if it isn't running), and headless Chrome over the DevTools protocol.
//
//   claude mcp add animation-engine -- node "<engine folder>/mcp/server.mjs"
//
// Tools: make_video · make_interactive · job_status · list_templates · engine_status
// Env:   ENGINE_URL (http://localhost:5180) · STUDIO_CHROME (Chrome or Edge; found by itself otherwise)
import { spawn, spawnSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, relative, resolve } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const ENGINE = (process.env.ENGINE_URL || "http://localhost:5180").replace(/\/+$/, "")
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const VERSION = "1.0.0"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => process.stderr.write(`[animation-engine] ${a.join(" ")}\n`)

/* ---------------- the protocol: JSON-RPC 2.0, one message per line ---------------- */

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
const reply = (id, result) => send({ jsonrpc: "2.0", id, result })
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } })
const calls = new Map() // a tool call's request id -> its AbortController (the client can cancel it)
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]
const INSTRUCTIONS =
  "Makes launch films (MP4) and interactive canvases (a lightweight JSON plus one script for a site) of a product. One call does all of it: reading the project, capturing the running app's screens, building from a template, rendering and saving. Pass `project` (the codebase's folder) and `url` (the app while it runs; start it first). A film takes a few minutes; tell the user the path it returns."

let buf = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buf += chunk
  for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let m
    try {
      m = JSON.parse(line)
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
      continue
    }
    for (const x of Array.isArray(m) ? m : [m]) void dispatch(x)
  }
})
process.stdin.on("end", quit)
process.on("SIGINT", quit)
process.on("SIGTERM", quit)

async function dispatch({ id, method, params = {} }) {
  if (method === "initialize")
    return reply(id, { protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: "animation-engine", version: VERSION }, instructions: INSTRUCTIONS })
  if (method === "notifications/cancelled") return calls.get(params.requestId)?.abort()
  if (typeof method === "string" && method.startsWith("notifications/")) return
  if (method === "ping") return reply(id, {})
  if (method === "tools/list") return reply(id, { tools: TOOLS.map(({ run: _, ...t }) => t) })
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name)
    if (!tool) return fail(id, -32602, `No tool called ${params.name}`)
    const abort = new AbortController()
    calls.set(id, abort)
    // progress, 0–100 and never backwards, for clients that show it (and keep a long call alive with it)
    const token = params._meta?.progressToken
    let last = 0
    const progress = (message, pct) => {
      last = Math.max(last, Math.min(100, pct ?? last))
      if (token !== undefined) send({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: Math.round(last), total: 100, message } })
    }
    try {
      const text = await tool.run(params.arguments ?? {}, { progress, signal: abort.signal })
      reply(id, { content: [{ type: "text", text }] })
    } catch (e) {
      if (!abort.signal.aborted) reply(id, { content: [{ type: "text", text: e?.message || String(e) }], isError: true })
    } finally {
      calls.delete(id)
    }
    return
  }
  if (id !== undefined) fail(id, -32601, `Unknown method ${method}`)
}

/* ---------------- the engine: its dev server, started when it isn't running ---------------- */

let devServer = null
const up = async () => {
  try {
    return (await fetch(`${ENGINE}/`, { signal: AbortSignal.timeout(2500) })).ok
  } catch {
    return false
  }
}
async function ensureEngine(progress) {
  if (await up()) return
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ENGINE)) throw new Error(`The engine isn't answering at ${ENGINE}.`)
  progress?.("Starting the engine", 2)
  log("starting the engine in", ROOT)
  const win = process.platform === "win32"
  devServer = spawn(win ? "npm.cmd" : "npm", ["run", "dev", "--", "--port", new URL(ENGINE).port || "80", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: win })
  devServer.on("exit", () => (devServer = null))
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    if (await up()) return
  }
  throw new Error(`The engine didn't start (npm run dev in ${ROOT}).`)
}
function quit() {
  // the engine this server started goes with it (its whole tree: npm, then Vite)
  if (devServer?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(devServer.pid), "/T", "/F"], { stdio: "ignore" })
    else devServer.kill()
  }
  process.exit(0)
}

/* ---------------- headless Chrome over the DevTools protocol ---------------- */

function findChrome() {
  const env = process.env.STUDIO_CHROME
  if (env && existsSync(env)) return env
  const pf = process.env.PROGRAMFILES ?? "C:/Program Files"
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)"
  const local = process.env.LOCALAPPDATA ?? ""
  return [
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
  ].find((p) => existsSync(p))
}

/** A headless Chrome of its own (its own profile, deleted after) and one tab in it. */
async function launch() {
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge. Set STUDIO_CHROME to its path.")
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-mcp-"))
  const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
  const close = () => {
    proc.kill()
    // a profile Chrome still holds (Windows) is left to the temp cleaner
    setTimeout(() => {
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {
        /* still held */
      }
    }, 1500)
  }
  try {
    const browser = await new Promise((ok, no) => {
      let err = ""
      const t = setTimeout(() => no(new Error("Chrome didn't start")), 20000)
      proc.stderr.on("data", (b) => {
        err += b
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
        if (m) {
          clearTimeout(t)
          ok(m[1])
        }
      })
      proc.on("exit", () => no(new Error("Chrome quit while starting")))
    })
    let page
    for (let i = 0; i < 50 && !page; i++) {
      page = (await (await fetch(`http://127.0.0.1:${new URL(browser).port}/json/list`)).json()).find((x) => x.type === "page")
      if (!page) await sleep(100)
    }
    const tab = await connect(page.webSocketDebuggerUrl)
    return { tab, close }
  } catch (e) {
    close()
    throw e
  }
}

async function connect(url) {
  const ws = new WebSocket(url)
  const pending = new Map()
  const waiting = new Map()
  let seq = 0
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { ok, no, method } = pending.get(m.id)
      pending.delete(m.id)
      if (m.error) no(new Error(`${method}: ${m.error.message}`))
      else ok(m.result)
    } else if (m.method && waiting.has(m.method)) {
      for (const f of waiting.get(m.method)) f(m.params)
      waiting.delete(m.method)
    }
  }
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = () => no(new Error("Couldn't reach Chrome"))
  })
  const tab = {
    send: (method, params = {}) =>
      new Promise((ok, no) => {
        const id = ++seq
        pending.set(id, { ok, no, method })
        ws.send(JSON.stringify({ id, method, params }))
      }),
    next: (event, ms) =>
      new Promise((ok, no) => {
        const t = setTimeout(() => no(new Error(`No ${event}`)), ms)
        waiting.set(event, [...(waiting.get(event) ?? []), (p) => (clearTimeout(t), ok(p))])
      }),
    /** Runs an expression in the page (awaited) and gives back its value. */
    async eval(expression) {
      const r = await tab.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text)
      return r.result.value
    },
    /** Opens an address and waits for it to load, then a moment more for its fonts and first animations. */
    async go(url, settle = 1500) {
      const loaded = tab.next("Page.loadEventFired", 30000)
      const r = await tab.send("Page.navigate", { url })
      if (r.errorText) throw new Error(`Couldn't open ${url} (${r.errorText}). Is it running?`)
      await loaded.catch(() => {})
      await sleep(settle)
    },
  }
  await tab.send("Page.enable")
  await tab.send("Runtime.enable")
  return tab
}

/* ---------------- the product: what its codebase says about it ---------------- */

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "vendor", ".turbo", ".vercel", ".cache", "engine-exports"])
const DESIGN = ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs", "app/globals.css", "src/app/globals.css", "styles/globals.css", "src/styles/globals.css", "src/index.css", "src/main.css", "src/styles.css", "src/global.css", "src/globals.css", "src/App.css", "index.html", "public/index.html", "src/theme.ts", "src/theme.js", "theme.json", "tokens.json"]
const markdown = (s) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
const titled = (s = "") => s.replace(/^@[^/]+\//, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
/** The first sentence, cut at a word to `max` characters. */
function sentence(s, max) {
  const first = s.split(/(?<=[.!?])\s/)[0].replace(/[.!]$/, "").trim()
  if (first.length <= max) return first
  return `${first.slice(0, max).replace(/\s+\S*$/, "")}…`
}

/** The product as its codebase describes it: a name, a line on what it is, up to three features, and the files its
    colours and type are named in (the engine reads those into a brand). */
function readProject(dir) {
  const out = { name: "", tagline: "", features: [], design: "" }
  if (!dir) return out
  const root = resolve(dir)
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`There's no folder at ${root}.`)
  const text = (f, max = 300_000) => {
    try {
      const p = join(root, f)
      const s = statSync(p)
      return s.isFile() && s.size <= max ? readFileSync(p, "utf8") : ""
    } catch {
      return ""
    }
  }
  let pkg = {}
  try {
    pkg = JSON.parse(text("package.json") || "{}")
  } catch {
    /* not JSON */
  }
  const readme = ["README.md", "readme.md", "Readme.md", "README.mdx", "README"].map((f) => text(f)).find(Boolean) || ""
  out.name = sentence(markdown(/^#\s+(.+)$/m.exec(readme)?.[1] ?? "") || titled(pkg.name) || titled(basename(root)), 40)
  // what it is: package.json's description, else the README's first real paragraph
  const para = readme
    .split(/\n\s*\n/)
    .filter((p) => !/^\s*(#|\||-|\*|>|\d+\.|```|<|\[!\[)/.test(p))
    .map(markdown)
    .find((p) => p.length > 24 && !/^(npm|yarn|pnpm|bun|git|npx) /.test(p))
  out.tagline = sentence(markdown(pkg.description || "") || para || "", 90)
  // features: the bullets under a Features (or Highlights…) heading, else the README's first bullets
  const lines = readme.split("\n")
  const at = lines.findIndex((l) => /^#{1,4}\s*(features|key features|highlights|what it does|why)/i.test(l))
  for (let i = at >= 0 ? at + 1 : 0; i < lines.length && out.features.length < 3; i++) {
    if (at >= 0 && /^#{1,4}\s/.test(lines[i])) break
    const m = /^\s*[-*+]\s+(.+)/.exec(lines[i])
    const f = m && sentence(markdown(m[1]), 48)
    if (f && f.length > 3 && !/^(npm|yarn|pnpm|bun|git|npx) /.test(f)) out.features.push(f)
  }
  // design: the theme files where it's usually written, else any stylesheet that names colours
  const found = DESIGN.map((f) => text(f, 200_000)).filter(Boolean)
  if (found.join("").length < 200) {
    const css = []
    const walk = (d, depth) => {
      if (depth > 3 || css.length >= 6) return
      let list = []
      try {
        list = readdirSync(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of list) {
        if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(d, e.name), depth + 1)
        else if (e.isFile() && /\.(css|scss)$/.test(e.name)) {
          const s = text(relative(root, join(d, e.name)), 200_000)
          if (/--[\w-]+\s*:/.test(s)) css.push(s)
        }
      }
    }
    walk(root, 0)
    found.push(...css)
  }
  out.design = found.join("\n\n").slice(0, 300_000)
  return out
}

/* ---------------- the work ---------------- */

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

/** The app's screens as an iPhone's Safari shows them: the page below the status bar (402 × 820 points), the pages
    asked for or the first one scrolled down. With `strip`, each becomes the whole screen (874 points), the status
    bar's strip painted in the page's own colour (its first rows), the way Safari paints it. */
async function capture(tab, url, paths = [], { scale = 3, quality = 86, max = 3, strip = false } = {}) {
  const { userAgent } = await tab.send("Browser.getVersion")
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 402, height: 820, deviceScaleFactor: scale, mobile: true })
  await tab.send("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA })
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  const shoot = async () => {
    const { data } = await tab.send("Page.captureScreenshot", { format: "webp", quality })
    if (!strip) return data
    return tab.eval(`(async () => {
      const img = new Image()
      img.src = "data:image/webp;base64,${data}"
      await img.decode()
      const top = ${54 * scale}
      const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight + top })
      const x = c.getContext("2d")
      x.drawImage(img, 0, 0, img.naturalWidth, 2, 0, 0, c.width, top)
      x.drawImage(img, 0, top)
      return c.toDataURL("image/webp", ${quality / 100}).split(",")[1]
    })()`)
  }
  const shots = []
  try {
    if (paths.length)
      for (const p of paths.slice(0, 4)) {
        await tab.go(new URL(p, url).href, 1800)
        shots.push(await shoot())
      }
    else {
      await tab.go(url, 1800)
      shots.push(await shoot())
      for (let i = 1; i < max; i++) {
        const moved = await tab.eval("(() => { const y = scrollY; scrollBy(0, innerHeight * 0.85); return scrollY > y + 40 })()")
        if (!moved) break
        await sleep(700)
        shots.push(await shoot())
      }
    }
  } finally {
    await tab.send("Emulation.clearDeviceMetricsOverride")
    await tab.send("Emulation.setTouchEmulationEnabled", { enabled: false })
    await tab.send("Emulation.setUserAgentOverride", { userAgent: userAgent.replace("HeadlessChrome", "Chrome") })
  }
  return shots
}

/** Puts something on the engine's server for its pages and its renderer to read; its address there comes back. */
async function upload(body, type) {
  const r = await fetch(`${ENGINE}/__studio/media`, { method: "POST", headers: { "content-type": type }, body })
  if (!r.ok) throw new Error(`The engine wouldn't take the ${type.startsWith("image/") ? "screenshots" : "file"} (${r.status}).`)
  return (await r.json()).url
}

/** The engine's own page, in the Studio, ready to be driven (window.__engine). */
async function openEngine(tab) {
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await tab.go(`${ENGINE}/`, 300)
  await tab.eval('localStorage.setItem("anim-engine:studio", "true"); localStorage.setItem("anim-engine:canvas", "false"); 1')
  await tab.go(`${ENGINE}/`, 1500)
  for (let i = 0; i < 60; i++) {
    if (await tab.eval("!!window.__engine")) return
    await sleep(500)
  }
  throw new Error("The engine's page didn't come up.")
}

/** The templates: the seeds in the engine's folder, with the template lab's approved versions over them. */
async function templates() {
  const dir = join(ROOT, "src/studio/lab/scripts")
  const by = new Map()
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")) : []) {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"))
    by.set(s.id, s)
  }
  try {
    for (const s of await (await fetch(`${ENGINE}/__lab/scripts`)).json()) if (!by.has(s.id) || by.get(s.id).version <= s.version) by.set(s.id, s)
  } catch {
    /* the engine isn't up: the seeds will do */
  }
  return [...by.values()]
}
/** The kind of film a brief asks for, for the Artist; a product launch when it says nothing particular. */
const KINDS = [
  [/teaser|tease|coming soon|sneak/i, "teaser"],
  [/demo|walkthrough|how (it|to)|tutorial|step/i, "product-demo"],
  [/feature|new in|update|release|changelog/i, "feature-launch"],
  [/brand|manifesto|mood|story|mission/i, "brand"],
  [/social|reel|short|story|tiktok|vertical|9x16/i, "social"],
]
const pickKind = (brief = "") => KINDS.find(([re]) => re.test(brief))?.[1] ?? "product-launch"

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product"
/** Where a file goes: `out` (a file, or a folder), else the project's engine-exports folder, else the engine's own. */
function target(out, project, name) {
  if (out && extname(out)) return resolve(out)
  return join(out ? resolve(out) : project ? join(resolve(project), "engine-exports") : join(ROOT, "exports"), name)
}
/** Never over another file: name-2, name-3… */
function fresh(file) {
  let f = file
  for (let i = 2; existsSync(f); i++) f = file.replace(/(\.[\w.]+)$/, `-${i}$1`)
  return f
}

/** Follows a render to its end, telling the client how far it got. True when it's done, false when it took too long. */
async function follow(id, progress, signal, limit) {
  const end = Date.now() + limit
  while (Date.now() < end) {
    if (signal?.aborted) throw new Error("Cancelled")
    const r = await fetch(`${ENGINE}/__studio/jobs/${id}`).catch(() => null)
    if (!r?.ok) throw new Error(`The engine lost job ${id} (did it restart?).`)
    const s = await r.json()
    if (s.state === "error") throw new Error(`The render failed: ${s.error || "no reason given"}`)
    if (s.state === "done") return true
    progress(s.state === "queued" ? "Waiting for the renderer" : s.state === "encoding" ? "Encoding" : s.total > 1 ? `Rendering frame ${s.frame} of ${s.total}` : "Rendering", s.total > 1 ? 30 + (65 * s.frame) / s.total : 30)
    await sleep(1000)
  }
  return false
}
/** Saves a finished render; its kind decides the extension (MP4, ProRes .mov with alpha, or a PNG). */
async function save(id, out) {
  const r = await fetch(`${ENGINE}/__studio/jobs/${id}/file`)
  if (!r.ok || !r.body) throw new Error(`Job ${id}'s file couldn't be fetched (${r.status}).`)
  const type = r.headers.get("content-type") || ""
  const file = fresh(out.replace(/\.\w+$/, type.includes("quicktime") ? ".mov" : type.includes("png") ? ".png" : ".mp4"))
  mkdirSync(dirname(file), { recursive: true })
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file))
  return file
}
const mb = (file) => (statSync(file).size / 1048576).toFixed(1)

/* ---------------- the tools ---------------- */

const str = (description) => ({ type: "string", description })
const PRODUCT = {
  project: str("Absolute path of the product's codebase. Its name, what it is, its features (package.json, README) and its colours and type (CSS, Tailwind theme, index.html) are read from it."),
  url: str("The app's address while it runs (start its dev server first), e.g. http://localhost:3000. Its screens are captured at iPhone size and shown on the devices."),
  name: str("The product's name, if not the codebase's."),
  tagline: str("One line on what it is, if not the codebase's description."),
  screen: str("Instead of url: one of the engine's library screens, by id."),
}

const TOOLS = [
  {
    name: "make_video",
    title: "Make a launch film",
    description:
      "Makes a launch film of a product and saves it as an MP4: reads the codebase, captures the running app's screens, and the engine's Artist directs it (a story for the kind of film, an art direction with moving gradients, kinetic titles on the beat, the product in its interface and on 3D devices, every cut carried), or a named template builds it. Renders at 1080p and waits until the file is saved. Takes a few minutes. Returns the file's path.",
    inputSchema: {
      type: "object",
      properties: {
        ...PRODUCT,
        paths: { type: "array", items: { type: "string" }, description: 'Pages of the app to capture, under url (up to 4), e.g. ["/", "/pricing"]. By default: the page at url, scrolled.' },
        brief: str("What the film is for, in a few words: 'launch video', 'teaser', 'feature release', 'demo', 'brand film', 'reel'… The Artist picks the kind of film from it."),
        kind: { type: "string", enum: ["product-launch", "feature-launch", "product-demo", "teaser", "brand", "social"], description: "The kind of film the Artist directs. Overrides brief." },
        style: { type: "string", enum: ["auto", "keynote", "pop", "editorial", "neon", "glass", "bold"], description: "The Artist's art direction: auto (the admin's taste), keynote (dark, chrome, a ring of light), pop (loud gradients, heavy type), editorial (paper light, serif), neon (aurora, spectrum titles), glass (pastel meshes, frosted cards), bold (black and white, the heaviest type)." },
        length: { type: "string", enum: ["short", "standard", "long"], description: "About 12, 25 or 40 seconds." },
        template: str("A template's id (list_templates) instead of the Artist."),
        features: { type: "array", items: { type: "string" }, description: "Up to three features in a few words each, if not the README's." },
        cta: str("The call to action at the end, e.g. 'Try it free'."),
        size: { type: "string", enum: ["16x9", "16x9-4k", "4x3", "1x1", "4x5", "9x16"], description: "16x9 by default; 9x16 for Reels and Shorts." },
        fps: { type: "number", enum: [30, 60] },
        out: str("Where to save it: a file, or a folder. By default the project's engine-exports folder."),
        wait: { type: "boolean", description: "Wait for the render (default). False: return the job's id at once and follow it with job_status." },
      },
    },
    async run(a, { progress, signal }) {
      const t0 = Date.now()
      await ensureEngine(progress)
      progress("Reading the project", 6)
      const p = readProject(a.project)
      const name = a.name?.trim() || p.name
      if (!name) throw new Error("Give the product's name (name) or its codebase (project).")
      if (!a.url && !a.screen) throw new Error("Give the app's address while it runs (url), so its screens are filmed, or a library screen (screen).")
      // the Artist directs it, unless a template is named
      const template = a.template || undefined
      const artist = template ? undefined : { category: a.kind || pickKind(a.brief), style: a.style || "auto", length: a.length }
      const copy = { name, ...(a.tagline || p.tagline ? { tagline: a.tagline || p.tagline } : {}), features: a.features?.length ? a.features.slice(0, 3) : p.features, ...(a.cta ? { cta: a.cta } : {}) }
      const b = await launch()
      let film
      let id
      try {
        let images = []
        if (a.url) {
          progress(`Capturing ${a.url}`, 10)
          images = []
          for (const shot of await capture(b.tab, a.url, a.paths, { strip: true })) images.push(await upload(Buffer.from(shot, "base64"), "image/webp"))
        }
        progress("Building the film", 22)
        await openEngine(b.tab)
        film = await b.tab.eval(`window.__engine.film(${JSON.stringify({ template, artist, copy, design: p.design || undefined, images, screen: a.screen, size: a.size, fps: a.fps })})`)
        // the Studio lays the film out (its components measure themselves) before it's handed over
        await sleep(2500)
        progress("Handing it to the renderer", 28)
        id = await b.tab.eval('window.__engine.render("video")')
      } finally {
        b.close()
      }
      const out = target(a.out, a.project, `${slug(name)}-film.mp4`)
      if (a.wait === false) return `Rendering “${film.name}” for ${name}: job ${id}.\njob_status with {"id": "${id}", "out": ${JSON.stringify(out)}} saves it when it's done.`
      if (!(await follow(id, progress, signal, 25 * 60_000))) return `Still rendering after 25 minutes: job ${id}.\njob_status with {"id": "${id}", "out": ${JSON.stringify(out)}} saves it when it's done.`
      progress("Saving", 97)
      const file = await save(id, out)
      return `Saved the film: ${file}\n${name}, ${template ? `from the “${film.name}” template` : `directed by the Artist as “${film.name}”`}: ${film.scenes} shots, ${film.seconds} s, ${a.size ?? "16x9"}, ${mb(file)} MB. Made in ${Math.round((Date.now() - t0) / 1000)} s.`
    },
  },
  {
    name: "make_interactive",
    title: "Make an interactive canvas",
    description:
      "Makes an interactive canvas of a product for a site (a hero: its name, its line, and its screen in an iPhone that turns to the pointer, things coming in as they're seen, a phone layout under 744 px) and saves it as a lightweight JSON that one script draws on any site. Returns the JSON's path, a preview link and the two lines to embed it.",
    inputSchema: {
      type: "object",
      properties: {
        ...PRODUCT,
        path: str("The page of the app to capture, under url. By default the page at url."),
        kicker: str("The small line over the name. 'Introducing' by default."),
        origin: str("Where the engine is deployed (the site loads canvas.js, and any live screens, from there). This machine's engine by default."),
        out: str("Where to save the JSON: a file, or a folder. By default the project's engine-exports folder."),
      },
    },
    async run(a, { progress }) {
      await ensureEngine(progress)
      progress("Reading the project", 8)
      const p = readProject(a.project)
      const name = a.name?.trim() || p.name
      if (!name) throw new Error("Give the product's name (name) or its codebase (project).")
      const origin = (a.origin || ENGINE).replace(/\/+$/, "")
      const b = await launch()
      let canvas
      try {
        let picture
        if (a.url) {
          progress(`Capturing ${a.url}`, 20)
          // one screen, at twice the points: it travels inside the JSON
          const [shot] = await capture(b.tab, a.url, a.path ? [a.path] : [], { scale: 2, quality: 80, max: 1 })
          picture = `data:image/webp;base64,${shot}`
        }
        progress("Making the canvas", 55)
        await openEngine(b.tab)
        canvas = await b.tab.eval(`window.__engine.canvas(${JSON.stringify({ name, kicker: a.kicker, tagline: a.tagline || p.tagline || undefined, screen: a.screen, picture, origin })})`)
      } finally {
        b.close()
      }
      const file = fresh(target(a.out, a.project, `${slug(name)}-canvas.json`))
      mkdirSync(dirname(file), { recursive: true })
      const json = JSON.stringify(canvas.doc)
      writeFileSync(file, json)
      // a preview on this machine's engine, for a day
      const src = await upload(json, "application/json").catch(() => "")
      return [
        `Saved the canvas: ${file} (${Math.round(json.length / 1024)} KB)`,
        src ? `See it: ${ENGINE}/canvas-demo.html#src=${src}` : "",
        `On a site (serve the JSON next to the page):`,
        `<div data-engine-canvas="/${basename(file)}"></div>`,
        `<script type="module" src="${origin}/canvas.js"></script>`,
        /localhost|127\.0\.0\.1/.test(origin) ? "canvas.js comes from this machine's engine: on a site, pass origin (where the engine is deployed)." : "",
        "To edit it: the engine's Canvas → Export → Open a JSON.",
      ]
        .filter(Boolean)
        .join("\n")
    },
  },
  {
    name: "job_status",
    title: "Follow a render",
    description: "Where a render is (make_video with wait: false). With out, saves the file once it's done and returns its path.",
    inputSchema: { type: "object", properties: { id: str("The job's id."), out: str("Where to save it when it's done: a file, or a folder.") }, required: ["id"] },
    async run(a) {
      const r = await fetch(`${ENGINE}/__studio/jobs/${encodeURIComponent(a.id)}`).catch(() => null)
      if (!r?.ok) throw new Error(`No job ${a.id} on the engine (it forgets them when it restarts).`)
      const s = await r.json()
      if (s.state === "error") throw new Error(`The render failed: ${s.error || "no reason given"}`)
      if (s.state !== "done") return `${s.state === "queued" ? "Waiting for the renderer" : s.state === "encoding" ? "Encoding" : `Rendering: frame ${s.frame} of ${s.total}`}.`
      if (!a.out) return "Done. Pass out to save it."
      const file = await save(a.id, target(a.out, undefined, "film.mp4"))
      return `Saved: ${file} (${mb(file)} MB)`
    },
  },
  {
    name: "list_templates",
    title: "List the film templates",
    description: "The film templates make_video can use: their ids, what each film is, how many shots and how long.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      return (await templates()).map((s) => `${s.id}: ${s.name}, ${s.shots.length} shots, ${s.shots.reduce((x, y) => x + y.dur, 0).toFixed(1)} s. ${s.summary}`).join("\n")
    },
  },
  {
    name: "engine_status",
    title: "Is the engine ready",
    description: "Whether the engine is running (it starts by itself when a film is asked for), whether it has Chrome to render with, and whether its template lab has a Gemini key.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      const running = await up()
      let key = false
      if (running)
        try {
          key = !!(await (await fetch(`${ENGINE}/__lab/state`)).json()).key
        } catch {
          /* no lab */
        }
      const chrome = findChrome()
      return [
        running ? `The engine is running at ${ENGINE}.` : `The engine isn't running at ${ENGINE}: it starts by itself (npm run dev in ${ROOT}).`,
        chrome ? `Renders with ${basename(chrome)}.` : "No Chrome or Edge found: set STUDIO_CHROME.",
        running ? (key ? "The template lab has a Gemini key." : "The template lab has no Gemini key (films don't need one).") : "",
      ]
        .filter(Boolean)
        .join("\n")
    },
  },
]

log(`ready, version ${VERSION}, engine at ${ENGINE}`)
