#!/usr/bin/env node
// Capture a product for a film, from its running app (the engine's dev server must be up: npm run dev):
//   npm run shoot -- screen <url> <out.png> [--hide "words"]... [--size 1600x1000] [--scale 2] [--click "words"]...
//       a screenshot of a screen, sharp enough to zoom into (2x), for a `tour` or `app` scene. --hide blanks any words
//       (a person's name) before it's taken; --click presses something first (a menu, a tab)
//   npm run shoot -- component <url> (--title "words" [--rows "a,b"] [--ctas "c"] | --selector "css" | --text "words")
//       [--click "words"]... [--hide "words"]...
//       one of its components frozen whole with its parts marked (public/panel-capture.js) and kept by the engine:
//       prints the snapshot's address, for a `component` scene ({ kind: "component", src, press? })
// Pictures go into .engine-data/films/media (served at /__film/media/<name>) unless <out> is elsewhere.
import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ENGINE = process.env.ENGINE_URL || "http://localhost:5180"
const [what, url, out] = process.argv.slice(2)
const flags = (name) => process.argv.flatMap((a, i, all) => (a === `--${name}` && all[i + 1] ? [all[i + 1]] : []))
const flag = (name) => flags(name)[0]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!["screen", "component"].includes(what) || !url) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"))
  process.exit(1)
}
const chrome = process.env.STUDIO_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync)
if (!chrome) throw new Error("No Chrome or Edge (set STUDIO_CHROME).")

const [w, h] = (flag("size") || "1600x1000").split("x").map(Number)
const profile = mkdtempSync(join(tmpdir(), "engine-shoot-"))
const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const wsUrl = await new Promise((ok, no) => {
  let e = ""
  const t = setTimeout(() => no(new Error("Chrome didn't start")), 20000)
  proc.stderr.on("data", (b) => {
    e += b
    const m = e.match(/DevTools listening on (ws:\/\/\S+)/)
    if (m) (clearTimeout(t), ok(m[1]))
  })
})
const port = new URL(wsUrl).port
let page
for (let i = 0; i < 50 && !page; i++) {
  page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page")
  if (!page) await sleep(100)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let seq = 0
const wait = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && wait.has(d.id)) (wait.get(d.id)(d), wait.delete(d.id))
}
const send = (method, params = {}) => new Promise((ok, no) => {
  const id = ++seq
  wait.set(id, (d) => (d.error ? no(new Error(d.error.message)) : ok(d.result)))
  ws.send(JSON.stringify({ id, method, params }))
})
const run = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result?.value
}
try {
  await send("Page.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: Number(flag("scale") || 2), mobile: false })
  await send("Page.navigate", { url })
  for (let i = 0; i < 150 && (await run("document.readyState")) !== "complete"; i++) await sleep(100)
  await sleep(2500)
  // words to blank (a name), anywhere they are, kept blank as the page re-renders
  const hide = flags("hide")
  if (hide.length)
    await run(`(() => { const hide = ${JSON.stringify(hide)}; const go = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) for (const x of hide) if (n.textContent.includes(x)) n.textContent = n.textContent.split(x).join("").replace(/,\\s*$/, "").replace(/^\\s*,\\s*/, ""); }; go(); new MutationObserver(go).observe(document.body, { subtree: true, childList: true, characterData: true }); })()`)
  for (const c of flags("click")) {
    const ok = await run(`(() => { const want = ${JSON.stringify(c)}.toLowerCase(); const el = [...document.querySelectorAll("button, [role=button], a, [role=tab], summary")].find((e) => (e.innerText || e.getAttribute("aria-label") || "").trim().toLowerCase() === want); if (el) el.click(); return !!el; })()`)
    if (!ok) throw new Error(`Nothing to click called “${c}”.`)
    await sleep(900)
  }
  if (what === "screen") {
    const file = resolve(out || join(root, ".engine-data", "films", "media", `screen-${Date.now().toString(36)}.png`))
    mkdirSync(dirname(file), { recursive: true })
    const { data } = await send("Page.captureScreenshot", { format: "png" })
    writeFileSync(file, Buffer.from(data, "base64"))
    const media = join(root, ".engine-data", "films", "media")
    if (!file.startsWith(media)) copyFileSync(file, join(media, basename(file)))
    console.log(JSON.stringify({ file, media: `image:/__film/media/${basename(file)}`, aspect: +(w / h).toFixed(3) }))
  } else {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await run(readFileSync(join(root, "public", "panel-capture.js"), "utf8"))
    const spec = flag("selector") ? { selector: flag("selector") } : flag("title") ? { title: flag("title"), rows: (flag("rows") || "").split(",").filter(Boolean), ctas: (flag("ctas") || "").split(",").filter(Boolean) } : { text: flag("text") }
    const r = await run(`window.__captureComponent(${JSON.stringify(spec)})`)
    if (!r || r.error) throw new Error(r?.error || "Nothing captured.")
    const kept = await (await fetch(`${ENGINE}/__film/panel-snapshot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html: r.html, parts: r.parts, w: r.w, h: r.h, bg: r.bg }) })).json()
    if (!kept.src) throw new Error(kept.error || "The engine didn't keep it (is npm run dev up?).")
    const kinds = r.parts.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {})
    console.log(JSON.stringify({ src: kept.src, w: r.w, h: r.h, parts: r.parts.length, kinds, buttons: r.parts.filter((p) => p.kind === "button" && p.text).map((p) => p.text) }))
  }
} finally {
  ws.close()
  proc.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
