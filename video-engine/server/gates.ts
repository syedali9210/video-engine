// The quality gates: a film is checked before it's exported, on the export page itself (render.html, headless Chrome),
// so what's checked is what renders. Each scene is sampled as it comes in, at its middle and as it leaves; at each moment
// every word on screen is measured, the composition's titles and the words inside each film's own frame alike (a frame
// on another site is reached through its own DevTools session), and the frame's pixels are read.
//   Readability: words big enough to read on a phone (px at 1080p), contrast with what's behind them, words cut off by
//     a box, words outside the safe area (a Reel's top and bottom are the platform's).
//   Story: a hook in the first 2 s, the name or the call at the end, each feature said, the length on target, and only
//     figures that are in the product's own material.
//   Fidelity: every template shot within the range it retimes to, and a template played whole kept on its own cuts.
//   Brand: the frames' strong colours against the product's palette, the faces against its type.
// Technical (after the export, on the file): frame rate and count, colour tags, black and frozen stretches, flashes
// (WCAG: no more than three a second), loudness when there's sound.
// The critic (the Work API's "critic" job) looks at the frames against the brief and says what it would change.
//   POST /__gates/check { config, width, height, kit?, target?, critic? } -> { id }   GET /__gates/:id -> the job
//   GET  /__gates/:id/frame/:n (a sampled frame, JPEG)
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin, ViteDevServer } from "vite"
import { PIXELS, SEE, type Run } from "./templates.ts"
import type { LibShot } from "../src/studio/shots.ts"
import type { ProductKit } from "../src/studio/product.ts"
import { parseJSON } from "./ai.ts"
import { run as ask } from "./work.ts"

export type Finding = { level: "error" | "warn" | "info"; text: string; at?: number; scene?: number; fix?: Fix }
/** What the auto-fix can do about a finding (the Studio applies it, then checks again). */
export type Fix =
  | { kind: "shorten"; film: string; key: string; to: number }
  | { kind: "ink"; scene: number; layer: string }
  | { kind: "retime"; scene: number; to: number }
  | { kind: "length"; to: number }
  | { kind: "first"; scene: number }
export type Gate = { id: "readability" | "story" | "fidelity" | "brand" | "technical"; name: string; pass: boolean; findings: Finding[] }
export type Critique = { score: number; verdict: string; notes: { scene?: number; problem: string; fix: string }[]; by: string }
export type GateReport = { gates: Gate[]; frames: { t: number; scene: number }[]; critic?: Critique | { error: string }; seconds: number }

type Comp = { scenes: { id: string; name: string; duration: number; transition?: string; layers: { id: string; kind: string; anim?: string; from?: number; rate?: number; text?: string; values?: Record<string, unknown>; hidden?: boolean }[] }[]; size?: string }
type Body = { config: { comp: Comp; [k: string]: unknown }; width: number; height: number }
type Seen = { runs: Run[]; joined: string }
type Sample = { t: number; scene: number; runs: (Run & { film?: string })[]; png: string; palette: { hex: string; share: number }[]; text: string }

const r2 = (x: number) => Math.round(x * 100) / 100
const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%$€£.,]+/gu, " ")
    .trim()

/** The commonest colours of a frame (from its own screenshot), with their share of it. */
const PALETTE = `(async (shot) => {
  const img = new Image(); img.src = shot; await img.decode()
  const c = document.createElement("canvas"); c.width = 160; c.height = Math.round(160 * img.height / img.width)
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height)
  const d = g.getImageData(0, 0, c.width, c.height).data, m = new Map()
  for (let i = 0; i < d.length; i += 4) { const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); m.set(k, (m.get(k) ?? 0) + 1) }
  const n = d.length / 4
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ hex: "#" + [k >> 8, (k >> 4) & 15, k & 15].map((x) => (x * 17).toString(16).padStart(2, "0")).join(""), share: Math.round(v / n * 1000) / 1000 }))
})`

/** Every scene sampled on the export page: its words (titles and films' own), its pixels. */
async function sample(server: ViteDevServer, origin: string, body: Body, onProgress: (k: number) => void) {
  const { findChrome, devtools, dropProfile } = await import("./studio")
  const chrome = findChrome()
  if (!chrome) throw new Error("Couldn't find Chrome or Edge to check the film with.")
  const comp = body.config.comp
  // checked at most 1920 wide: words and contrast read the same, and it's quicker
  const k = Math.min(1, 1920 / Math.max(body.width, body.height))
  const [W, H] = [Math.round(body.width * k), Math.round(body.height * k)]
  const profile = mkdtempSync(join(tmpdir(), "anim-engine-chrome-"))
  const cdp = await devtools(chrome, profile)
  const out: Sample[] = []
  try {
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("DOM.enable")
    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false })
    await cdp.send("Page.navigate", { url: `${origin}/render.html?job=gates#${encodeURIComponent(JSON.stringify(body.config))}` })
    for (let i = 0; i < 300 && !(await cdp.evaluate("!!window.__studio").catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100))
    await cdp.evaluate("window.__studio.ready.then(() => true)", 120000)
    const starts = comp.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + comp.scenes[i - 1].duration : 0], [])
    const moments = comp.scenes.flatMap((s, i) => [starts[i] + Math.min(0.5, s.duration * 0.3), starts[i] + s.duration * 0.6, starts[i] + Math.max(s.duration - 0.12, s.duration * 0.8)].map((t) => ({ t: r2(t), scene: i })))
    for (const [n, m] of moments.entries()) {
      await cdp.evaluate(`window.__studio.frame(${m.t}).then(() => true)`)
      const runs: Sample["runs"] = ((await cdp.evaluate(SEE)) as Seen).runs
      // the words inside each film's own frame, placed on the page: the frame's box, its scale, whether it shows. A
      // frame in another process is reached through its own session; one in this process (another origin, same site)
      // through a world of our own in it
      type Tree = { frame: { id: string; url: string }; childFrames?: Tree[] }
      const flat = (t: Tree): Tree["frame"][] => [t.frame, ...(t.childFrames ?? []).flatMap(flat)]
      const { frameTree } = await cdp.send<{ frameTree: Tree }>("Page.getFrameTree")
      for (const fr of flat(frameTree).slice(1)) {
        if (!/stage\.html/.test(fr.url)) continue
        try {
          const owner = await cdp.send<{ backendNodeId: number }>("DOM.getFrameOwner", { frameId: fr.id })
          const { object } = await cdp.send<{ object: { objectId: string } }>("DOM.resolveNode", { backendNodeId: owner.backendNodeId })
          const box = (
            await cdp.send<{ result: { value: { x: number; y: number; w: number; cw: number; shown: boolean } } }>("Runtime.callFunctionOn", {
              objectId: object.objectId,
              returnByValue: true,
              functionDeclaration: "function () { const r = this.getBoundingClientRect(); let op = 1; for (let a = this; a; a = a.parentElement) op *= +getComputedStyle(a).opacity; return { x: r.x, y: r.y, w: r.width, cw: this.clientWidth || r.width, shown: op > 0.4 && this.checkVisibility({ visibilityProperty: true }) && r.width > 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight } }",
            })
          ).result.value
          if (!box.shown) continue
          const k = box.w / box.cw
          const film = /[?&]a=([\w-]+)/.exec(fr.url)?.[1]
          const oop = cdp.frames.get(fr.id)
          let inner: Run[]
          if (oop) inner = ((await cdp.evaluate(SEE, 20000, oop.sessionId)) as Seen).runs
          else {
            const { executionContextId } = await cdp.send<{ executionContextId: number }>("Page.createIsolatedWorld", { frameId: fr.id, worldName: "gates" })
            const r = await cdp.send<{ result: { value?: Seen } }>("Runtime.evaluate", { expression: SEE, contextId: executionContextId, returnByValue: true })
            inner = r.result.value?.runs ?? []
          }
          for (const r of inner) runs.push({ ...r, x: box.x + r.x * k, y: box.y + r.y * k, w: r.w * k, h: r.h * k, px: Math.round(r.px * k), film })
        } catch {
          // a frame gone between asking and reading: nothing to read
        }
      }
      const png = (await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" })).data
      const shot = JSON.stringify(`data:image/png;base64,${png}`)
      const contrast = ((await cdp.evaluate(`${PIXELS}(${shot}, "", ${JSON.stringify(runs.filter((r) => !r.edge).slice(0, 120))})`)) as { contrast: { text: string; ratio: number; px: number }[] }).contrast
      const palette = (await cdp.evaluate(`${PALETTE}(${shot})`)) as Sample["palette"]
      const withContrast = runs.map((r) => ({ ...r, ratio: contrast.find((c) => c.text === r.text.slice(0, 60))?.ratio }))
      out.push({ ...m, runs: withContrast, png, palette, text: norm(runs.map((r) => r.text).join(" ")) })
      onProgress((n + 1) / moments.length)
    }
    // the size the words would be in the delivered film: px at 1080 on the short side
    const toDelivery = 1080 / Math.min(W, H)
    for (const s of out) for (const r of s.runs) r.px = Math.round(r.px * toDelivery)
    void server
    return { samples: out, W, H, starts }
  } finally {
    await cdp.close()
    dropProfile(profile)
  }
}

/* ---------------- the gates ---------------- */

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const chroma = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}
const dist = (a: string, b: string) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)))

export function judge(comp: Comp, samples: Sample[], starts: number[], dims: { W: number; H: number }, lib: LibShot[], kit?: ProductKit | null, target?: number): Gate[] {
  const total = comp.scenes.reduce((a, s) => a + s.duration, 0)
  const vertical = dims.H > dims.W
  // a word's worth: three letters or more (a letter drawn alone is a piece of a word being typed)
  const words = (s: Sample) => s.runs.filter((r) => r.text.replace(/[^\p{L}\p{N}]/gu, "").length >= 3)
  const name = (i: number) => `“${comp.scenes[i]?.name ?? `Scene ${i + 1}`}”`

  // readability
  const read: Finding[] = []
  const once = new Set<string>()
  const say = (key: string, f: Finding) => !once.has(key) && (once.add(key), read.push(f))
  for (const s of samples)
    for (const r of words(s)) {
      if (r.edge) continue
      const t = r.text.slice(0, 40)
      if (r.px < 20) say(`small:${s.scene}:${t}`, { level: "error", at: s.t, scene: s.scene, text: `${name(s.scene)}: “${t}” is about ${r.px} px at 1080p, too small to read on a phone.` })
      else if (r.px < 32) say(`small:${s.scene}:${t}`, { level: "warn", at: s.t, scene: s.scene, text: `${name(s.scene)}: “${t}” is about ${r.px} px at 1080p: small in a feed.` })
      const ratio = (r as { ratio?: number }).ratio
      if (ratio && ratio < (r.px >= 36 ? 3 : 4.5)) say(`faint:${s.scene}:${t}`, { level: ratio < 2 ? "error" : "warn", at: s.t, scene: s.scene, text: `${name(s.scene)}: “${t}” is ${ratio}:1 on what's behind it (${r.px >= 36 ? 3 : 4.5}:1 reads).` })
      if (r.clipped) {
        // a film's own line: which of its values it is, so it can be written shorter
        const layer = r.film ? comp.scenes[s.scene]?.layers.find((l) => l.anim === r.film && l.values) : undefined
        const key = layer && Object.entries(layer.values ?? {}).find(([, v]) => typeof v === "string" && v.split("|").some((p) => p.trim() && (p.includes(r.text) || r.text.includes(p.trim()))))?.[0]
        say(`cut:${s.scene}:${t}`, { level: "error", at: s.t, scene: s.scene, text: `${name(s.scene)}: “${t}” is cut off by its box.`, ...(r.film && key ? { fix: { kind: "shorten", film: r.film, key, to: 0.75 } } : {}) })
      }
      // the safe area: 5% in from the edges; a Reel's top 14% and bottom 20% are the platform's
      const [top, bottom] = vertical ? [0.14, 0.2] : [0.05, 0.05]
      const [x0, y0, x1, y1] = [r.x / dims.W, r.y / dims.H, (r.x + r.w) / dims.W, (r.y + r.h) / dims.H]
      if (r.px >= 32 && (x0 < 0.05 || x1 > 0.95 || y0 < top || y1 > 1 - bottom)) say(`safe:${s.scene}:${t}`, { level: "warn", at: s.t, scene: s.scene, text: `${name(s.scene)}: “${t}” is outside the safe area${vertical ? " (a Reel's top and bottom are the platform's buttons)" : ""}.` })
    }

  // story
  const story: Finding[] = []
  const shotOf = (i: number) => {
    const f = comp.scenes[i].layers.find((l) => l.kind === "component" && l.from !== undefined && !l.hidden)
    return f ? lib.find((x) => x.film === f.anim && Math.abs(x.at - (f.from ?? 0)) < 0.05) : undefined
  }
  const roles = comp.scenes.map((_, i) => shotOf(i)?.role ?? [])
  if (roles.some((r) => r.length)) {
    const early = comp.scenes.findIndex((_, i) => starts[i] < 2 && roles[i].some((r) => r === "hook" || r === "intro"))
    if (early < 0) {
      const hook = roles.findIndex((r) => r.includes("hook"))
      story.push({ level: "warn", text: `Nothing hooks in the first 2 s${hook >= 0 ? `: ${name(hook)} is a hook, at ${r2(starts[hook])} s` : ""}.`, ...(hook > 0 ? { fix: { kind: "first", scene: hook } } : {}) })
    }
  }
  const last = samples.filter((s) => s.t >= total - 3)
  const brand = kit ? norm(kit.words.name || kit.name) : ""
  const ends = last.some((s) => (brand && s.text.includes(brand)) || (kit?.words.cta && s.text.includes(norm(kit.words.cta)))) || roles.at(-1)?.some((r) => r === "logo" || r === "cta")
  if (!ends) story.push({ level: "warn", text: `The last 3 s show neither ${brand ? `“${kit!.words.name || kit!.name}”` : "the name"} nor a call to action.` })
  if (kit?.words.features.length) {
    const all = samples.map((s) => s.text).join(" ")
    const missing = kit.words.features.filter((f) => !all.includes(norm(f)))
    if (missing.length === kit.words.features.length) story.push({ level: "info", text: "None of the product's features is said in words: the film shows rather than tells (fine, if that's the idea)." })
    else if (missing.length) story.push({ level: "info", text: `Not said: ${missing.map((m) => `“${m}”`).join(", ")}.` })
  }
  // a scene that shows nothing: one colour fills the frame and there are no words (a screen magnified past what's in it)
  comp.scenes.forEach((_, i) => {
    const mine = samples.filter((s) => s.scene === i)
    const empty = mine.filter((s) => (s.palette[0]?.share ?? 0) > 0.9 && !words(s).length)
    if (mine.length && empty.length === mine.length) story.push({ level: "warn", scene: i, at: empty[0].t, text: `${name(i)} shows almost nothing: ${Math.round(empty[0].palette[0].share * 100)}% of the frame is one colour (${empty[0].palette[0].hex}) and there are no words. A screen that fits its slot, or a focus point, gives it something to show.` })
  })
  if (target && Math.abs(total - target) > target * 0.1) story.push({ level: "warn", text: `It runs ${r2(total)} s; the target is ${target} s.`, fix: { kind: "length", to: target } })
  if (kit) {
    const material = norm([kit.notes, kit.words.proof, ...(kit.understanding?.proof ?? []), ...kit.files.flatMap((f) => f.text ?? []), kit.words.tagline, kit.words.hook, ...kit.words.features].filter(Boolean).join(" "))
    // per scene, the figures it shows that aren't anywhere in the product's own material
    const seen = new Map<number, Set<string>>()
    for (const s of samples)
      for (const r of words(s))
        for (const m of r.text.match(/[$€£]?\d[\d,.]*\s?(%|×|x\b|k\b|m\b)?/gi) ?? [])
          if (/\d{2,}|%|×|[$€£]/.test(m) && !material.includes(norm(m))) seen.set(s.scene, (seen.get(s.scene) ?? new Set<string>()).add(m.trim()))
    for (const [i, ms] of seen) story.push({ level: "error", scene: i, text: `${name(i)} shows ${ms.size === 1 ? "a figure that isn't" : "figures that aren't"} in your material: ${[...ms].slice(0, 5).map((m) => `“${m}”`).join(", ")}${ms.size > 5 ? ` and ${ms.size - 5} more` : ""}. Films only show real numbers: put yours in, or take them out.` })
  }

  // fidelity
  const fid: Finding[] = []
  comp.scenes.forEach((s, i) => {
    const shot = shotOf(i)
    if (!shot) return
    const [lo, hi] = shot.stretch
    if (s.duration < lo || s.duration > hi) fid.push({ level: "warn", scene: i, text: `${name(i)} runs ${r2(s.duration)} s; the shot reads between ${lo} and ${hi} s (its own ${shot.dur} s).`, fix: { kind: "retime", scene: i, to: Math.min(hi, Math.max(lo, s.duration)) } })
  })
  const shots = comp.scenes.map((_, i) => shotOf(i))
  const one = shots.every((x) => x && x.film === shots[0]?.film) && shots.length > 1
  if (one) {
    const own = lib.filter((x) => x.film === shots[0]!.film)
    const inOrder = shots.every((x, i) => x!.id === own[i]?.id)
    if (inOrder) comp.scenes.forEach((s, i) => Math.abs(s.duration - own[i].dur) > 1 / 60 + 1e-6 && fid.push({ level: "info", scene: i, text: `${name(i)} is ${r2(s.duration)} s; the template cuts at ${own[i].dur} s (it's retimed).` }))
  }

  // brand
  const br: Finding[] = []
  if (kit?.brand.accent) {
    const palette = [kit.brand.accent, kit.brand.ground, kit.brand.ink, ...kit.files.flatMap((f) => f.palette ?? [])].filter((c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c))
    // per scene: how much of its frames is a strong colour far from every colour of the product's
    comp.scenes.forEach((_, i) => {
      const mine = samples.filter((x) => x.scene === i)
      if (!mine.length) return
      const off = new Map<string, number>()
      for (const x of mine)
        for (const c of x.palette) {
          if (chroma(c.hex) < 0.3 || lum(c.hex) < 0.02 || palette.some((p) => dist(p, c.hex) < 70)) continue
          off.set(c.hex, (off.get(c.hex) ?? 0) + c.share / mine.length)
        }
      const share = [...off.values()].reduce((a, b) => a + b, 0)
      if (share < 0.12) return
      const top = [...off].sort((a, b) => b[1] - a[1])[0][0]
      br.push({ level: share > 0.4 ? "warn" : "info", scene: i, at: mine[0].t, text: `${name(i)}: about ${Math.round(share * 100)}% of it is colour that isn't the product's (mostly ${top}).` })
    })
    const faces = [...new Set([kit.brand.display, kit.brand.text].filter((f): f is string => !!f))]
    if (faces.length) {
      const used = new Map<string, number>()
      for (const s of samples) for (const r of words(s)) if (r.font && r.px >= 48) used.set(r.font, (used.get(r.font) ?? 0) + 1)
      const off = [...used].filter(([f]) => !faces.some((x) => x.toLowerCase() === f.toLowerCase()) && !/^(system-ui|-apple-system|sans-serif|serif|monospace)$/i.test(f))
      if (off.length) br.push({ level: "info", text: `Titles are set in ${off.map(([f]) => f).join(", ")}; the product's type is ${faces.join(" and ")}.` })
    }
  }
  const gate = (id: Gate["id"], nameOf: string, findings: Finding[]): Gate => ({ id, name: nameOf, pass: !findings.some((f) => f.level === "error"), findings })
  return [gate("readability", "Readability", read), gate("story", "Story", story), gate("fidelity", "Fidelity", fid), gate("brand", "Brand", br)]
}

/* ---------------- after the export: the file ---------------- */

/** WCAG 2.3.1's general flashes, from a film's average brightness frame by frame (0 to 1): when more than three come
    within a second, or null. A flash is a pair of opposing changes of a tenth of the range or more; a change carries
    on to its extreme before the next one can start. */
export function flashAt(y: number[], fps: number): number | null {
  const turns: number[] = []
  let anchor = y[0] ?? 0
  let dir = 0
  y.forEach((v, i) => {
    const d = v - anchor
    if (Math.abs(d) >= 0.1 && Math.sign(d) !== dir) {
      turns.push(i / fps)
      dir = Math.sign(d)
      anchor = v
    } else if ((dir > 0 && v > anchor) || (dir < 0 && v < anchor)) anchor = v
  })
  // more than three flashes: eight changes inside one second
  for (let i = 0; i + 7 < turns.length; i++) if (turns[i + 7] - turns[i] < 1) return turns[i]
  return null
}

/** The technical gate, on the exported file (ffmpeg): frame rate and count, colour tags, black and frozen stretches,
    flashes (WCAG 2.3.1: no more than three in any second), loudness when there's sound. */
export function technical(file: string, expect: { fps: number; duration: number }): Gate {
  const f: Finding[] = []
  const ff = process.env.STUDIO_FFMPEG || "ffmpeg"
  const probe = spawnSync(ff.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" })
  let info: { streams?: { codec_type: string; r_frame_rate?: string; nb_frames?: string; color_primaries?: string; color_transfer?: string; color_space?: string }[]; format?: { duration?: string } } = {}
  try {
    info = JSON.parse(probe.stdout)
  } catch {
    return { id: "technical", name: "Technical", pass: false, findings: [{ level: "error", text: "ffprobe couldn't read the file." }] }
  }
  const v = info.streams?.find((s) => s.codec_type === "video")
  const [a, b] = (v?.r_frame_rate ?? "0/1").split("/").map(Number)
  const fps = b ? a / b : 0
  if (Math.abs(fps - expect.fps) > 0.01) f.push({ level: "error", text: `It plays at ${r2(fps)} fps, not ${expect.fps}.` })
  const frames = Number(v?.nb_frames ?? 0)
  const want = Math.round(expect.duration * expect.fps)
  if (frames && Math.abs(frames - want) > 1) f.push({ level: "error", text: `${frames} frames where ${want} were rendered: frames dropped or repeated.` })
  if (v && v.color_space !== "bt709") f.push({ level: "warn", text: `Its colour isn't tagged BT.709 (${v.color_space ?? "untagged"}): players may shift its colours.` })
  const filters = spawnSync(ff, ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.15:pix_th=0.06,freezedetect=n=0.001:d=0.6,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  const err = filters.stderr ?? ""
  for (const m of err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) f.push({ level: Number(m[1]) < 0.05 ? "info" : "warn", at: Number(m[1]), text: `Black from ${r2(Number(m[1]))} to ${r2(Number(m[2]))} s.` })
  for (const m of err.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)) f.push({ level: "info", at: Number(m[1]), text: `Nothing moves for ${r2(Number(m[2]))} s from ${r2(Number(m[1]))} s (a hold, or a frame stuck).` })
  const flash = flashAt([...err.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]) / 255), fps || expect.fps)
  if (flash !== null) f.push({ level: "error", at: flash, text: `Flashes more than three times in a second at ${r2(flash)} s: a seizure risk (WCAG 2.3.1).` })
  if (info.streams?.some((s) => s.codec_type === "audio")) {
    const loud = spawnSync(ff, ["-hide_banner", "-i", file, "-af", "ebur128", "-vn", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(loud.stderr.split("Summary:").pop() ?? "")?.[1])
    if (Number.isFinite(lufs) && (lufs < -18 || lufs > -10)) f.push({ level: "warn", text: `Its sound is ${lufs} LUFS; feeds play at about -14.` })
  }
  return { id: "technical", name: "Technical", pass: !f.some((x) => x.level === "error"), findings: f }
}

/* ---------------- the critic ---------------- */

const CRITIC_SCHEMA = {
  name: "critique",
  schema: {
    type: "object",
    properties: {
      score: { type: "number", description: "0 to 100: how ready it is to post." },
      verdict: { type: "string", description: "One sentence." },
      notes: { type: "array", items: { type: "object", properties: { scene: { type: "number" }, problem: { type: "string" }, fix: { type: "string" } }, required: ["problem", "fix"] } },
    },
    required: ["score", "verdict", "notes"],
  },
}
async function critic(samples: Sample[], comp: Comp, kit: ProductKit | null | undefined, brief: string): Promise<Critique> {
  // one frame from the middle of each scene, at most eight, small
  const picks = comp.scenes.map((_, i) => samples.filter((s) => s.scene === i)[1] ?? samples.find((s) => s.scene === i)).filter((s): s is Sample => !!s).slice(0, 8)
  const a = await ask({
    job: "critic",
    schema: CRITIC_SCHEMA,
    maxTokens: 6000,
    fresh: true,
    messages: [
      { role: "system", content: "You're a launch-film director reviewing a cut before it's posted. Judge it like a shipped product: the hook, the story order, pacing, whether each shot earns its place, type, colour, and anything that would embarrass the brand (another company's logo or name, a fake-looking number, cut-off words). Say what to change, scene by scene, concretely. Short, plain words." },
      {
        role: "user",
        content: [
          { type: "text", text: `The film: ${comp.scenes.map((s, i) => `${i + 1}. ${s.name} (${r2(s.duration)} s)`).join(", ")}.${kit ? ` The product: ${kit.words.name || kit.name}${kit.understanding ? `, ${kit.understanding.kind}; launching ${kit.understanding.whatsNew}` : ""}.` : ""}${brief ? `\nThe brief and the taste rules: ${brief.slice(0, 3000)}` : ""}\nOne frame from each scene follows, in order.` },
          ...picks.map((s) => ({ type: "image_url" as const, image_url: { url: `data:image/png;base64,${s.png}` } })),
        ],
      },
    ],
  })
  const j = parseJSON(a.text) as Critique
  return { score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))), verdict: String(j.verdict ?? "").slice(0, 300), notes: (Array.isArray(j.notes) ? j.notes : []).slice(0, 12).map((n) => ({ ...(typeof n.scene === "number" ? { scene: Math.round(n.scene) - 1 } : {}), problem: String(n.problem ?? "").slice(0, 300), fix: String(n.fix ?? "").slice(0, 300) })), by: a.provider }
}

/* ---------------- the routes ---------------- */

type Job = { id: string; state: "checking" | "done" | "error"; progress: number; report?: GateReport; error?: string; dir: string }
const jobs = new Map<string, Job>()
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

export function gates(): Plugin {
  return {
    name: "gates",
    async configureServer(s) {
      const { fromEngine } = await import("./studio")
      const { loadKit } = await import("./kits")
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__gates/")) return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        const [, , id, what, n] = url.pathname.split("/")
        if (req.method === "GET") {
          const job = jobs.get(id)
          if (!job) return json(res, 404, { error: "No such check" })
          if (what === "frame") {
            res.setHeader("content-type", "image/png")
            try {
              return res.end(readFileSync(join(job.dir, `${Number(n)}.png`)))
            } catch {
              return json(res, 404, { error: "No such frame" })
            }
          }
          const { dir: _, ...rest } = job
          return json(res, 200, rest)
        }
        if (id !== "check") return json(res, 404, { error: "Not found" })
        void (async () => {
          try {
            const b = (await readBody(req)) as Body & { kit?: string; target?: number; critic?: boolean; brief?: string }
            if (!b.config?.comp?.scenes?.length) return json(res, 400, { error: "A film to check, please." })
            const job: Job = { id: randomUUID(), state: "checking", progress: 0, dir: mkdtempSync(join(tmpdir(), "anim-engine-gates-")) }
            jobs.set(job.id, job)
            json(res, 200, { id: job.id })
            const t0 = Date.now()
            try {
              const kit = typeof b.kit === "string" && /^[\w-]{6,64}$/.test(b.kit) ? loadKit(b.kit) : null
              const { LIBRARY } = (await s.ssrLoadModule("/src/studio/library.ts")) as { LIBRARY: LibShot[] }
              const { samples, W, H, starts } = await sample(s, `http://${req.headers.host}`, b, (p) => (job.progress = Math.round(p * 90)))
              mkdirSync(job.dir, { recursive: true })
              samples.forEach((x, i) => writeFileSync(join(job.dir, `${i}.png`), Buffer.from(x.png, "base64")))
              const report: GateReport = { gates: judge(b.config.comp, samples, starts, { W, H }, LIBRARY, kit, typeof b.target === "number" ? b.target : undefined), frames: samples.map((x) => ({ t: x.t, scene: x.scene })), seconds: 0 }
              if (b.critic !== false) {
                job.progress = 92
                report.critic = await critic(samples, b.config.comp, kit, typeof b.brief === "string" ? b.brief : "").catch((e: Error) => ({ error: e.message }))
              }
              report.seconds = Math.round((Date.now() - t0) / 100) / 10
              Object.assign(job, { state: "done", progress: 100, report })
            } catch (e) {
              Object.assign(job, { state: "error", error: (e as Error).message })
            }
            // a check's frames are kept an hour
            setTimeout(() => (rmSync(job.dir, { recursive: true, force: true }), jobs.delete(job.id)), 3600000)
          } catch (e) {
            if (!res.headersSent) json(res, 500, { error: (e as Error).message })
          }
        })()
      })
    },
  }
}
