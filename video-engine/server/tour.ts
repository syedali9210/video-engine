// The UI tour recorder: the product's running app driven through a flow in headless Chrome and filmed. Each step is
// done with real input (the mouse moves, presses and lets go where the target is; keys typed one at a time, at a
// person's pace), and a cursor drawn into the page glides to each target first, so the clip reads like someone using
// it. Filmed with Chrome's screencast and laid at a steady 30 fps by its frames' own timestamps. The steps can be
// given, or planned from a goal by the Work API from what's clickable on the page.
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseJSON } from "./ai.ts"
import { run } from "./work.ts"

export type Step = { do: "click" | "type" | "wait" | "scroll"; target?: string; text?: string; ms?: number }

const CURSOR = `(() => {
  if (document.getElementById("__tour_cursor")) return true
  const c = document.createElement("div")
  c.id = "__tour_cursor"
  c.innerHTML = '<svg width="28" height="34" viewBox="0 0 28 34"><path d="M4 3.5v23.2l6.1-5.6 3.9 9.1 4.3-1.9-3.9-8.9h8.5Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(" + innerWidth * 0.5 + "px," + innerHeight * 0.62 + "px)", transition: "transform 0.75s cubic-bezier(0.22, 1, 0.36, 1)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))" })
  document.documentElement.appendChild(c)
  return true
})()`
/** The centre of what a step aims at: a CSS selector, or the visible words on a button, link, field or label. */
const FIND = (target: string) => `(() => {
  const t = ${JSON.stringify(target)}
  let el = null
  try { el = document.querySelector(t) } catch {}
  if (!el) {
    const want = t.trim().toLowerCase()
    const all = [...document.querySelectorAll("button, a, input, textarea, select, [role=button], [role=tab], [role=link], label, summary")]
    // its words, each on its own: its text, its label, its placeholder, its value, its title
    const said = (e) => [e.innerText, e.getAttribute("aria-label"), e.getAttribute("placeholder"), e.value, e.title].filter(Boolean).map((x) => String(x).replace(/\\s+/g, " ").trim().toLowerCase())
    const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden" }
    el = all.find((e) => shown(e) && said(e).includes(want)) ?? all.find((e) => shown(e) && said(e).some((x) => x.startsWith(want))) ?? all.find((e) => said(e).some((x) => x.includes(want)))
  }
  if (!el) return null
  el.scrollIntoView({ block: "center", behavior: "instant" })
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})()`

/** What can be done on the page, for planning steps from a goal: its buttons, links and fields, by their words. */
const AFFORDANCES = `[...document.querySelectorAll("button, a, input, textarea, select, [role=button], [role=tab]")].filter((e) => e.getBoundingClientRect().width > 4).slice(0, 80).map((e) => (e.tagName.toLowerCase() + ": " + [e.innerText, e.getAttribute("aria-label"), e.getAttribute("placeholder")].filter(Boolean).join(" / ").replace(/\\s+/g, " ").slice(0, 60))).join("\\n")`

export async function recordTour(o: { url: string; steps: Step[]; goal?: string; phone?: boolean; out: string }) {
  const { findChrome, devtools, dropProfile, ffmpeg } = await import("./studio")
  const chrome = findChrome()
  const ff = ffmpeg()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to drive the app with.")
  if (!ff) throw new Error("Filming the tour needs ffmpeg on your PATH (winget install ffmpeg).")
  const [W, H] = o.phone ? [390, 844] : [1440, 900]
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const frames = mkdtempSync(join(tmpdir(), "anim-engine-tour-"))
  const cdp = await devtools(chrome, profile)
  const shots: { file: string; t: number }[] = []
  const done: string[] = []
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: !!o.phone })
    await cdp.send("Page.navigate", { url: o.url })
    for (let i = 0; i < 100 && (await cdp.evaluate("document.readyState").catch(() => "")) !== "complete"; i++) await new Promise((r) => setTimeout(r, 150))
    await new Promise((r) => setTimeout(r, 800))
    let steps = o.steps
    // no steps: planned from the goal and what's on the page
    if (!steps.length && o.goal) {
      const a = await run({
        job: "plan",
        fresh: true,
        maxTokens: 3000,
        messages: [
          { role: "system", content: 'You plan a short product tour of a web app for a launch film. Steps are {"do": "click" | "type" | "wait" | "scroll", "target": the visible words of a button, link or field (as listed), "text": what to type, "ms": how long to wait}. At most 8 steps, each one a person would do. JSON only: {"steps": [...]}' },
          { role: "user", content: `The goal: ${o.goal}\n\nWhat's on the page:\n${await cdp.evaluate(AFFORDANCES)}` },
        ],
      })
      steps = ((parseJSON(a.text) as { steps?: Step[] }).steps ?? []).slice(0, 8)
    }
    if (!steps.length) throw new Error("No steps: give the tour's steps, or a goal for it to plan from.")
    let n = 0
    const stop = cdp.on("Page.screencastFrame", (p) => {
      const file = join(frames, `${String(n++).padStart(5, "0")}.jpg`)
      writeFileSync(file, Buffer.from(String(p.data), "base64"))
      shots.push({ file, t: Number((p.metadata as { timestamp?: number })?.timestamp ?? Date.now() / 1000) })
      void cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 })
    await cdp.evaluate(CURSOR)
    await new Promise((r) => setTimeout(r, 700))
    const mouse = (type: string, x: number, y: number) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1 })
    for (const s of steps) {
      if (s.do === "wait") {
        await new Promise((r) => setTimeout(r, Math.min(5000, s.ms ?? 1000)))
        continue
      }
      if (s.do === "scroll") {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: W / 2, y: H / 2, deltaX: 0, deltaY: s.ms ?? 600 })
        await new Promise((r) => setTimeout(r, 900))
        continue
      }
      const at = s.target ? ((await cdp.evaluate(FIND(s.target))) as { x: number; y: number } | null) : null
      if (s.target && !at) {
        done.push(`couldn't find “${s.target}”`)
        continue
      }
      if (at) {
        // the drawn cursor glides there, the real one follows, then the press
        await cdp.evaluate(`${CURSOR}; document.getElementById("__tour_cursor").style.transform = "translate(${at.x - 4}px, ${at.y - 4}px)"`)
        await new Promise((r) => setTimeout(r, 800))
        await mouse("mouseMoved", at.x, at.y)
        await cdp.evaluate(`document.getElementById("__tour_cursor").animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 220, easing: "ease-out" })`)
        await mouse("mousePressed", at.x, at.y)
        await new Promise((r) => setTimeout(r, 90))
        await mouse("mouseReleased", at.x, at.y)
        await new Promise((r) => setTimeout(r, 350))
      }
      if (s.do === "type" && s.text) {
        for (const ch of s.text.slice(0, 200)) {
          await cdp.send("Input.dispatchKeyEvent", { type: "char", text: ch })
          await new Promise((r) => setTimeout(r, 55 + Math.round(Math.random() * 45)))
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      done.push(`${s.do} ${s.target ?? ""}`.trim())
      // a page that navigated gets its cursor back
      await cdp.evaluate(CURSOR).catch(() => {})
      await new Promise((r) => setTimeout(r, 900))
    }
    await new Promise((r) => setTimeout(r, 1000))
    await cdp.send("Page.stopScreencast").catch(() => {})
    stop()
  } finally {
    await cdp.close()
    dropProfile(profile)
  }
  if (shots.length < 2) {
    rmSync(frames, { recursive: true, force: true })
    throw new Error("The screencast caught no frames.")
  }
  // a steady 30 fps: each frame held until the next one's moment
  const list = shots.map((s, i) => `file '${s.file.replace(/\\/g, "/")}'\nduration ${Math.max(1 / 60, (shots[i + 1]?.t ?? s.t + 1 / 30) - s.t).toFixed(4)}`).join("\n") + `\nfile '${shots[shots.length - 1].file.replace(/\\/g, "/")}'`
  const listFile = join(frames, "list.txt")
  writeFileSync(listFile, list)
  const r = spawnSync(ff, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-movflags", "+faststart", o.out], { encoding: "utf8" })
  rmSync(frames, { recursive: true, force: true })
  if (r.status !== 0) throw new Error(`ffmpeg couldn't film the tour: ${(r.stderr ?? "").trim().split("\n").pop()}`)
  return { steps: done, seconds: Math.round((shots[shots.length - 1].t - shots[0].t) * 10) / 10, w: W * 2, h: H * 2 }
}
