// Templates, checked. Every launch film template is rendered shot by shot in headless Chrome, twice: with its own
// words and pictures (the reference look: the golden frames every code change is compared against), and with a dummy
// product (made-up words as long as each slot allows, a test card in every screen). The dummy run says what each shot
// really shows (the params on screen: the slot map the shot library casts from), whether the reference's own words are
// still drawn when the product's are in (hard-coded, so they'd leak into someone else's film), and whether the longest
// words a slot allows are cut off. Each frame is measured: the words' size on screen, their contrast with what's
// behind them (read off the frame's own pixels), words clipped by a box.
//   POST /__templates/probe { only?: string[], golden?: "save" | "compare", write?: boolean } -> { films: FilmReport[] }
// `write` saves the slot map into src/studio/lib/shows.json; golden frames live in .engine-data/golden/<film>/<shot>.png.
// Run it with `npm run templates` (npm run templates -- --save to keep new golden frames).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { checkFilm, library, slotsOf, type FilmSpec, type LibShot } from "../src/studio/shots.ts"

type Meta = { id: string; name: string; film?: FilmSpec; params: Record<string, string | number | boolean>; schema: Record<string, { type: string; label: string; hint?: string }> }
export type Run = { text: string; px: number; x: number; y: number; w: number; h: number; color: string; clipped: boolean; edge: boolean; font?: string }
type Seen = { runs: Run[]; joined: string; tight: string; picks: string[]; sizes: Record<string, { w: number; h: number }> }
export type ShotReport = {
  id: string
  name: string
  t: number
  shows: string[]
  /** the reference's own words, drawn with the dummy product in (every slot filled) */
  leaks: string[]
  /** the reference's words in a screen's stand-in drawing: they go when the product's screen is in */
  standIn: string[]
  /** the product's words on screen, smaller than reads in a feed (px at the film's own size) */
  small: { key: string; px: number; text: string }[]
  /** the product's words cut off by a box (the longest a slot allows) */
  clipped: { key: string; text: string }[]
  /** words on too little contrast with what's behind them */
  contrast: { text: string; ratio: number }[]
  golden?: { changed: number; mean: number } | "saved" | "missing"
}
/** `sizes`: the biggest each screen slot is drawn, px on the frame at the film's own size (a picture narrower is soft) */
export type FilmReport = { id: string; name: string; problems: string[]; shots: ShotReport[]; errors: string[]; sizes: Record<string, { w: number; h: number }>; /** per shot, where its action is for each other frame shape */ focus: Record<string, ShotFocus> }
type Box = { x?: number; y?: number; w?: number; h?: number }
type ShotFocus = Partial<Record<"16x9" | "1x1" | "9x16" | "words", Box>> & { ground?: string }

/* ---------------- a made-up product ---------------- */

const SYL = ["ka", "lo", "mi", "ra", "zu", "ne", "to", "vi", "so", "fe", "du", "pa", "ri", "go", "ba", "te"]
/** A made-up word list for a piece: `words` words, `chars` characters in all, the same on every run (seeded by the key). */
export function dummyPiece(key: string, i: number, chars: number, words: number) {
  let seed = [...`${key}${i}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7)
  const next = () => (seed = (seed * 16807) % 2147483647) % SYL.length
  const n = Math.max(1, Math.min(words, Math.floor((chars + 1) / 3)))
  const each = Math.max(2, Math.floor((chars - (n - 1)) / n))
  const out: string[] = []
  for (let w = 0; w < n; w++) {
    let s = ""
    while (s.length < each) s += SYL[next()]
    out.push(s.slice(0, each))
  }
  out[0] = out[0][0].toUpperCase() + out[0].slice(1)
  return out.join(" ")
}
/** A test card for a screen slot: a grid, its corners marked, so it reads as a picture and never as words. */
const card = (w: number, h: number) =>
  `image:data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#5b6cff"/><g stroke="#fff" stroke-opacity=".35" stroke-width="2">${Array.from({ length: 9 }, (_, i) => `<line x1="${((i + 1) * w) / 10}" y1="0" x2="${((i + 1) * w) / 10}" y2="${h}"/><line x1="0" y1="${((i + 1) * h) / 10}" x2="${w}" y2="${((i + 1) * h) / 10}"/>`).join("")}</g><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 6}" fill="#ffd25b"/></svg>`)}`
export function dummyValues(m: Meta, shots: LibShot[]) {
  const values: Record<string, string> = {}
  for (const s of slotsOf(m, shots)) {
    if (s.kind === "text") values[s.key] = (s.chars ?? []).map((c, i) => dummyPiece(s.key, i, c, s.words?.[i] ?? 3)).join("|")
    else if (s.kind !== "color") values[s.key] = s.kind === "logo" ? card(400, 400) : card(Math.round(800 * (s.aspect ?? 1.6)), 800)
  }
  return values
}

/* ---------------- measuring a frame, in the page ---------------- */

/** What a frame shows: its visible words (with their size on screen, place, colour, whether a box cuts them off or they
    run off the frame), all of them in one line (spaced, and without spaces for words drawn a letter at a time), and the
    params whose elements are on screen (a slot, a drawing that says which). */
export const SEE = `(() => {
  const W = innerWidth, H = innerHeight
  const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  const range = document.createRange()
  const runs = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n && runs.length < 1500; n = w.nextNode()) {
    const text = n.textContent.replace(/\\s+/g, " ").trim()
    const el = n.parentElement
    if (!text || !el || el.closest("script,style") || el.closest('[aria-hidden="true"]') || !vis(el)) continue
    let op = 1
    for (let a = el; a && a !== document.body; a = a.parentElement) op *= +getComputedStyle(a).opacity
    if (op < 0.4) continue
    range.selectNodeContents(n)
    const rs = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H)
    if (!rs.length) continue
    const box = rs.reduce((a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 })
    let clipped = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (!/hidden|clip/.test(s.overflowX + s.overflowY)) continue
      const ar = a.getBoundingClientRect()
      if (ar.width * ar.height > W * H * 0.8) break
      clipped = box.r > ar.right + 2 || box.l < ar.left - 2 || box.b > ar.bottom + 2 || box.t < ar.top - 2
      break
    }
    const edge = box.l < 0 || box.t < 0 || box.r > W || box.b > H
    const cs = getComputedStyle(el)
    // the colour the letters are painted in: their fill when it's set; none for letters filled with a gradient
    const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color
    const color = /text/.test(cs.backgroundClip + cs.webkitBackgroundClip) ? "" : fill
    runs.push({ text, px: Math.round(Math.min(...rs.map((r) => r.height)) / 1.2), x: box.l, y: box.t, w: box.r - box.l, h: box.b - box.t, color, clipped, edge, font: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() })
  }
  const norm = (v) => v.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim()
  const drawn = [...document.querySelectorAll("canvas[data-text]")].filter((c) => { const r = c.getBoundingClientRect(); return vis(c) && r.width * r.height > 400 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H }).map((c) => norm(c.dataset.text))
  const joined = " " + [...runs.map((r) => norm(r.text)), ...drawn].join(" ") + " "
  const picks = new Set()
  // how big each slot is drawn (px on the frame): the biggest box of what's shown in it
  const sizes = {}
  for (const el of document.querySelectorAll("[data-pick]")) {
    let big = null
    for (const x of [el, ...el.querySelectorAll("*")]) {
      if (getComputedStyle(x).display === "contents") continue
      const r = x.getBoundingClientRect()
      if (r.width * r.height > 400 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H && vis(x) && (!big || r.width * r.height > big.w * big.h)) big = { w: Math.round(r.width), h: Math.round(r.height) }
    }
    if (big) for (const k of el.dataset.pick.split("|")) if (k) {
      picks.add(k)
      if (!sizes[k] || big.w > sizes[k].w) sizes[k] = big
    }
  }
  return { runs, joined, tight: joined.replace(/ /g, ""), picks: [...picks], sizes }
})()`

/** Contrast of each run with what's behind it, read off the frame's own pixels, and how far the frame is from its golden
    one (the share of pixels that changed, and by how much on average). In the page: it decodes PNGs for free. */
export const PIXELS = `(async (shot, golden, runs) => {
  const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
  const img = await load(shot)
  const c = document.createElement("canvas")
  c.width = img.width; c.height = img.height
  const g = c.getContext("2d", { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const k = img.width / innerWidth
  const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const contrast = []
  for (const r of runs) {
    const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(r.color)
    if (!m || m[4] === "0" || r.w < 4 || r.h < 4 || r.text.replace(/[^\\p{L}\\p{N}]/gu, "").length < 2) continue
    const ink = [+m[1], +m[2], +m[3]]
    const x = Math.max(0, Math.floor(r.x * k)), y = Math.max(0, Math.floor(r.y * k))
    const w = Math.min(c.width - x, Math.ceil(r.w * k)), h = Math.min(c.height - y, Math.ceil(r.h * k))
    if (w < 2 || h < 2) continue
    const d = g.getImageData(x, y, w, h).data
    // what's behind the words: the commonest colour in their box that isn't the words' own
    const count = new Map()
    for (let i = 0; i < d.length; i += 16) {
      const px = [d[i], d[i + 1], d[i + 2]]
      if (Math.abs(px[0] - ink[0]) + Math.abs(px[1] - ink[1]) + Math.abs(px[2] - ink[2]) < 60) continue
      const key = (px[0] >> 4) * 256 + (px[1] >> 4) * 16 + (px[2] >> 4)
      const e = count.get(key) ?? { n: 0, px }
      e.n++
      count.set(key, e)
    }
    const bg = [...count.values()].sort((a, b) => b.n - a.n)[0]
    if (bg) contrast.push({ text: r.text.slice(0, 60), ratio: Math.round(ratio(ink, bg.px) * 100) / 100, px: r.px })
  }
  let diff = null
  if (golden) {
    const o = await load(golden)
    if (o.width === img.width && o.height === img.height) {
      const c2 = document.createElement("canvas")
      c2.width = o.width; c2.height = o.height
      const g2 = c2.getContext("2d", { willReadFrequently: true })
      g2.drawImage(o, 0, 0)
      const a = g.getImageData(0, 0, c.width, c.height).data, b = g2.getImageData(0, 0, c.width, c.height).data
      let changed = 0, sum = 0, n = 0
      for (let i = 0; i < a.length; i += 8) {
        const dd = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
        if (dd > 24) changed++
        sum += dd
        n++
      }
      diff = { changed: Math.round((changed / n) * 10000) / 100, mean: Math.round((sum / n) * 100) / 100 }
    } else diff = { changed: 100, mean: 255 }
  }
  return { contrast, diff }
})`

/** words too common to say whose film they're from */
const COMMON = new Set("your that than from over every need keep built with this what when have more just into make made about only like time year been were will they them then here there each much most some such very also back even well where which while would could should first last next more less into onto upon".split(" "))
/** Where a frame's action is, for each other shape it might be cut to: the window of that shape, inside this frame,
    holding the most detail (edges, words, the subject), as the centre's fraction across (a narrower frame) or down (a
    shorter one). In the page: it reads the frame's own pixels. */
const FOCUS = `(async (shot, aspect) => {
  const img = new Image(); img.src = shot; await img.decode()
  const W = 160, H = Math.round(160 * img.height / img.width)
  const c = document.createElement("canvas"); c.width = W; c.height = H
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H)
  const d = g.getImageData(0, 0, W, H).data
  const l = (x, y) => { const i = (y * W + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] }
  const cols = new Float64Array(W), rows = new Float64Array(H)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const e = Math.abs(l(x + 1, y) - l(x - 1, y)) + Math.abs(l(x, y + 1) - l(x, y - 1))
    cols[x] += e; rows[y] += e
  }
  const best = (arr, win) => {
    let sum = 0
    for (let i = 0; i < win; i++) sum += arr[i]
    let top = sum, at = 0
    for (let i = win; i < arr.length; i++) { sum += arr[i] - arr[i - win]; if (sum > top) { top = sum; at = i - win + 1 } }
    return (at + win / 2) / arr.length
  }
  const src = img.width / img.height
  const out = {}
  for (const [name, a] of Object.entries(aspect)) out[name] = a < src ? { x: Math.round(best(cols, Math.max(1, Math.round(W * a / src))) * 1000) / 1000 } : a > src ? { y: Math.round(best(rows, Math.max(1, Math.round(H * src / a))) * 1000) / 1000 } : {}
  // its ground: the middle colour of its frame's edge, each channel apart
  const ring = [], ch = [[], [], []]
  for (let x = 0; x < W; x++) ring.push([x, 0], [x, H - 1])
  for (let y = 1; y < H - 1; y++) ring.push([0, y], [W - 1, y])
  for (const [x, y] of ring) for (let k = 0; k < 3; k++) ch[k].push(d[(y * W + x) * 4 + k])
  out.ground = "#" + ch.map((c) => c.sort((a, b) => a - b)[c.length >> 1].toString(16).padStart(2, "0")).join("")
  return out
})`

const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
/** Which params' words a frame shows: a piece is on screen when its words are (or, drawn a letter at a time, its letters). */
const shownKeys = (seen: Seen, values: Record<string, string>, keys: string[]) =>
  keys.filter((k) =>
    String(values[k] ?? "")
      .split("|")
      .map(norm)
      .some((p) => p.length > 1 && (seen.joined.includes(` ${p} `) || (p.length >= 6 && seen.tight.includes(p.replace(/ /g, "").slice(0, 6))))),
  )
const keyOfRun = (text: string, values: Record<string, string>, keys: string[]) => {
  const t = norm(text)
  if (t.length < 3) return ""
  return keys.find((k) => String(values[k] ?? "").split("|").map(norm).some((p) => p.includes(t) || t.includes(p))) ?? ""
}

/* ---------------- the probe ---------------- */

export async function probe(server: ViteDevServer, origin: string, o: { only?: string[]; golden?: "save" | "compare"; write?: boolean }) {
  const { findChrome, devtools, dropProfile } = await import("./studio")
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to render with. Set STUDIO_CHROME to its path.")
  const { ANIMS } = (await server.ssrLoadModule("/src/registry.ts")) as { ANIMS: Meta[] }
  const films = ANIMS.filter((a) => a.film && (!o.only?.length || o.only.includes(a.id)))
  const shots = library(films)
  const goldDir = join(server.config.root, ".engine-data", "golden")
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const cdp = await devtools(chrome, profile)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const reports: FilmReport[] = []
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    for (const m of films) {
      const f = m.film!
      const [W, H] = f.size === "1x1" ? [1080, 1080] : f.size === "9x16" ? [1080, 1920] : [1920, 1080]
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false })
      const mine = shots.filter((s) => s.film === m.id)
      const textKeys = Object.keys(m.schema).filter((k) => m.schema[k].type === "text")
      const dummy = dummyValues(m, mine)
      const defaults = Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, String(v)]))
      const report: FilmReport = { id: m.id, name: m.name, problems: checkFilm(m), shots: [], errors: [], sizes: {}, focus: {} }
      // a moment each shot is fully in: most of the way through it
      const moments = mine.map((s) => Math.round((s.at + Math.min(s.dur * 0.6, Math.max(0.05, s.dur - 0.2))) * 100) / 100)
      const run = async (values: Record<string, string> | null) => {
        await cdp.send("Page.navigate", { url: `${origin}/stage.html?a=${m.id}&t=${moments[0]}&frame=probe` })
        for (let i = 0; i < 300 && !(await cdp.evaluate("document.readyState === 'complete' && !!window.__hold").catch(() => false)); i++) await sleep(100)
        if (values) await cdp.evaluate(`window.postMessage({ source: "anim-engine-host", type: "params", values: ${JSON.stringify(values)} }, "*"); true`)
        // a film that brings its own faces adds their stylesheet as it mounts: wait for it, and for the faces in it
        await cdp.evaluate(
          "(async () => { for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 50)); if ([...document.querySelectorAll('link[rel=stylesheet]')].every((l) => l.sheet) && document.fonts.status === 'loaded' && i > 6) break } await document.fonts.ready; return true })()",
        )
        const out: { seen: Seen; png: string }[] = []
        for (const t of moments) {
          await cdp.evaluate(`window.__hold(${t}); true`)
          // drawn: two frames on, its pictures in, its fonts, nothing still baking
          await cdp.evaluate(
            "new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))).then(() => Promise.all([...document.images].map((i) => i.complete || new Promise((r) => { i.onload = i.onerror = r })))).then(() => document.fonts.ready).then(async () => { for (let i = 0; i < 100 && document.documentElement.dataset.baking; i++) await new Promise((r) => setTimeout(r, 50)) }).then(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))).then(() => true)",
          )
          const seen = (await cdp.evaluate(SEE)) as Seen
          const png = (await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" })).data
          out.push({ seen, png })
        }
        return out
      }
      try {
        const own = await run(null)
        // the product's words in the film's own drawings (a picture in a screen slot takes the drawing's place, words
        // and all), then its pictures too
        const words = await run(Object.fromEntries(textKeys.map((k) => [k, dummy[k]])))
        const full = await run(dummy)
        for (const [i, s] of mine.entries()) {
          const { seen, png } = words[i]
          const ref = own[i]
          const chrome = new Set((f.chrome ?? []).flatMap((w) => norm(w).split(" ")))
          const theirs = new Set(textKeys.flatMap((k) => norm(defaults[k] ?? "").split(" ")).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !chrome.has(w)))
          const dummyWords = new Set(textKeys.flatMap((k) => norm(dummy[k] ?? "").split(" ")))
          // a word of the reference's own (not a common one) still drawn: with every slot filled it's hard-coded into the
          // film; drawn only while a screen shows the film's own stand-in app, it's that stand-in's (replaced by yours)
          const theirsIn = (x: Seen) => new Set(x.joined.split(" ").filter((w) => theirs.has(w) && !dummyWords.has(w) && !COMMON.has(w)))
          const leaks = [...theirsIn(full[i].seen)]
          const standIn = [...theirsIn(seen)].filter((w) => !leaks.includes(w))
          const shows = [...new Set([...shownKeys(seen, dummy, textKeys), ...shownKeys(full[i].seen, dummy, textKeys), ...seen.picks, ...full[i].seen.picks])].filter((k) => k in m.schema)
          const mapped = seen.runs.map((r) => ({ r, key: keyOfRun(r.text, dummy, textKeys) })).filter((x) => x.key)
          const refClipped = new Set(ref.seen.runs.filter((r) => r.clipped).map((r) => keyOfRun(r.text, defaults, textKeys)).filter(Boolean))
          const gfile = join(goldDir, m.id, `${s.id.split("/")[1]}.png`)
          const goldenPng = o.golden === "compare" && existsSync(gfile) ? `data:image/png;base64,${readFileSync(gfile).toString("base64")}` : ""
          // contrast on the dummy frame: the product's words, as they'd be drawn
          const px = (await cdp.evaluate(`${PIXELS}(${JSON.stringify(`data:image/png;base64,${png}`)}, "", ${JSON.stringify(seen.runs.filter((r) => !r.edge).sort((a, b) => b.px - a.px).slice(0, 80))})`)) as { contrast: { text: string; ratio: number; px: number }[] }
          // where its action is for every other frame shape (re-framing follows it), its ground, and where its titles are,
          // with its own words or the longest a slot takes (re-framing keeps them whole)
          report.focus[s.id] = (await cdp.evaluate(`${FOCUS}(${JSON.stringify(`data:image/png;base64,${ref.png}`)}, ${JSON.stringify({ "16x9": 16 / 9, "1x1": 1, "9x16": 9 / 16 })})`)) as ShotFocus
          const titles = [...ref.seen.runs, ...full[i].seen.runs].filter((r) => !r.edge && r.px >= 28)
          if (titles.length) {
            const [x0, y0] = [Math.min(...titles.map((r) => r.x)) / W, Math.min(...titles.map((r) => r.y)) / H]
            const [x1, y1] = [Math.max(...titles.map((r) => r.x + r.w)) / W, Math.max(...titles.map((r) => r.y + r.h)) / H]
            const r3 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
            report.focus[s.id].words = { x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) }
          }
          // the golden frame is the reference look: the template's own words and pictures
          if (o.golden === "save") {
            mkdirSync(join(goldDir, m.id), { recursive: true })
            writeFileSync(gfile, Buffer.from(ref.png, "base64"))
          }
          // compared against the golden frame: the reference run's own frame
          const vsGolden = o.golden === "compare" ? (goldenPng ? ((await cdp.evaluate(`${PIXELS}(${JSON.stringify(`data:image/png;base64,${ref.png}`)}, ${JSON.stringify(goldenPng)}, [])`)) as { diff: { changed: number; mean: number } }).diff : "missing") : o.golden === "save" ? "saved" : undefined
          for (const [k, b] of Object.entries(full[i].seen.sizes)) if (!report.sizes[k] || b.w > report.sizes[k].w) report.sizes[k] = b
          report.shots.push({
            id: s.id,
            name: s.name,
            t: moments[i],
            shows,
            leaks,
            standIn,
            small: mapped.filter((x) => x.r.px < 28 && !x.r.edge).map((x) => ({ key: x.key, px: x.r.px, text: x.r.text.slice(0, 40) })),
            // a line the reference crops too is cropped by design (a marquee behind a mask), not a fit
            clipped: mapped.filter((x) => x.r.clipped && !refClipped.has(x.key)).map((x) => ({ key: x.key, text: x.r.text.slice(0, 40) })),
            contrast: px.contrast.filter((c) => c.ratio < (c.px >= 36 ? 3 : 4.5)).map(({ text, ratio }) => ({ text, ratio })),
            golden: vsGolden,
          })
        }
      } catch (e) {
        report.errors.push((e as Error).message)
      }
      if (cdp.errors.length) report.errors.push(...cdp.errors.splice(0).slice(0, 3))
      reports.push(report)
    }
  } finally {
    await cdp.close()
    dropProfile(profile)
  }
  if (o.write) {
    const file = join(server.config.root, "src", "studio", "lib", "shows.json")
    const was = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string[]>) : {}
    for (const r of reports) for (const s of r.shots) was[s.id] = s.shows
    mkdirSync(join(server.config.root, "src", "studio", "lib"), { recursive: true })
    writeFileSync(file, JSON.stringify(was, null, 1) + "\n")
    const sfile = join(server.config.root, "src", "studio", "lib", "sizes.json")
    const sizes = existsSync(sfile) ? (JSON.parse(readFileSync(sfile, "utf8")) as Record<string, { w: number; h: number }>) : {}
    for (const r of reports) for (const [k, b] of Object.entries(r.sizes)) sizes[`${r.id}/${k}`] = b
    writeFileSync(sfile, JSON.stringify(sizes, null, 1) + "\n")
    const ffile = join(server.config.root, "src", "studio", "lib", "focus.json")
    const focus = existsSync(ffile) ? (JSON.parse(readFileSync(ffile, "utf8")) as FilmReport["focus"]) : {}
    for (const r of reports) Object.assign(focus, r.focus)
    writeFileSync(ffile, JSON.stringify(focus, null, 1) + "\n")
  }
  return reports
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(body))
}
const readJson = (req: IncomingMessage) =>
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

let busy = false
export function templates(): Plugin {
  return {
    name: "templates",
    async configureServer(s) {
      // studio.ts brings the export server with it; imported here so `npm run check` can load this file on its own
      const { fromEngine } = await import("./studio")
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        // a shot's still: its golden frame (the template's own look, at the moment the probe measures it)
        const still = /^\/__templates\/still\/([\w-]+)\/([\w-]+)\.png$/.exec(url.pathname)
        if (still && req.method === "GET") {
          const f = join(s.config.root, ".engine-data", "golden", still[1], `${still[2]}.png`)
          if (!existsSync(f)) return json(res, 404, { error: "No still yet: npm run templates -- --save" })
          res.setHeader("content-type", "image/png")
          res.setHeader("cache-control", "private, max-age=3600")
          return res.end(readFileSync(f))
        }
        if (url.pathname !== "/__templates/probe" || req.method !== "POST") return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        if (busy) return json(res, 409, { error: "Already checking the templates" })
        busy = true
        void (async () => {
          try {
            const b = await readJson(req)
            const origin = `http://${req.headers.host}`
            const films = await probe(s, origin, { only: Array.isArray(b.only) ? b.only.map(String) : [], golden: b.golden === "save" || b.golden === "compare" ? b.golden : undefined, write: b.write === true })
            json(res, 200, { films })
          } catch (e) {
            json(res, 500, { error: (e as Error).message })
          } finally {
            busy = false
          }
        })()
      })
    },
  }
}
