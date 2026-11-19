// Studio — the page an export renders in headless Chrome, one frame at a time. It draws the composition with the same
// view the engine uses, and runs every live frame on the bridge's stepped clock (?vt=1), so video frame n shows exactly
// t = n / fps. The renderer calls `await __studio.ready`, then `await __studio.frame(t)` before each capture.
import { createRef } from "react"
import { createRoot } from "react-dom/client"
import { at as sceneAt } from "./comp"
import type { RenderConfig } from "./config"
import { CompositionView, type Resolve, type ViewHandle } from "./view"
import "./render.css"

type Stepped = Window & { __adv?: (ms: number) => Promise<number>; __now?: () => number }
declare global {
  interface Window {
    __studio: { ready: Promise<void>; frame: (t: number) => Promise<void>; where: () => string }
  }
}

const cfg: RenderConfig = JSON.parse(decodeURIComponent(location.hash.slice(1)))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// the engine resolved everything already: look it up
const resolve: Resolve = {
  screen: (_c, _d, key) => cfg.screens[key] ?? { frames: [], bg: "#000" },
  component: (_a, key, hairline, scheme) => ({ ...cfg.components[key], hairline, scheme }),
  part: (_a, key, _w, hairline, scheme) => ({ ...cfg.components[key], hairline, scheme }),
  image: (src) => src,
  dark: cfg.dark,
  stepped: true,
  origin: location.origin,
}

const view = createRef<ViewHandle>()
createRoot(document.getElementById("root")!).render(<CompositionView ref={view} comp={cfg.comp} resolve={resolve} preserve />)

/** which scene a frame belongs to, by its key: "scene:layer…" for a component, "layer:device" for a screen */
const owner = new Map<string, number>()
cfg.comp.scenes.forEach((s, j) => {
  owner.set(s.id, j)
  for (const l of s.layers) owner.set(l.id, j)
})
/** the first scene this renderer captures: a later part of a split export starts at its own */
const firstScene = sceneAt(cfg.comp, cfg.start + (cfg.first ?? 0)).i
/** A frame is brought up and stepped only while the film can still show it: its scene is on or ahead, or the scene on
    is taking over from it. The capture only goes forward, so a scene that has gone never comes back. */
function showing(el: HTMLIFrameElement, at: number) {
  const [a, b] = el.title.split(":")
  const j = owner.get(a) ?? owner.get(b)
  if (j === undefined) return true
  const { i, prev } = sceneAt(cfg.comp, at)
  return j >= firstScene && (j >= i || j === prev?.i)
}

/** each frame's own clock (ms) when it had first drawn: capture t = 0 is preroll ms after this */
const base = new Map<HTMLIFrameElement, number>()
/** what the page is waiting on (read `__studio.where()` over DevTools when an export stalls) */
let where = ""

/** Moves a frame's clock on by `ms`, unless the frame is taken out of the page meanwhile: a scene that's moved on
    drops its frames, and a removed frame's window stops, so it would never answer. */
async function step(el: HTMLIFrameElement, ms: number) {
  let poll = 0
  const gone = new Promise((r) => (poll = window.setInterval(() => !el.isConnected && r(null), 50)))
  await Promise.race([(el.contentWindow as Stepped).__adv!(ms), gone])
  clearInterval(poll)
}

/** One frame, from its document loading to its page being fully drawn (fonts, images, React). A frame that comes in
    later (scenes load their frames as the playhead nears them) starts its own clock where the film is (`at`). */
async function settle(el: HTMLIFrameElement, at = -1) {
  where = `loading ${el.title}`
  const w = el.contentWindow as Stepped
  for (let i = 0; i < 600 && el.isConnected && !(el.contentDocument?.readyState === "complete" && w.__adv); i++) await sleep(25)
  // taken out of the page while it loaded (its scene moved on): nothing to settle
  if (!el.isConnected || !el.contentDocument) return
  const doc = el.contentDocument
  await doc.fonts.ready
  // The animation mounts lazily, and React holds a suspended tree back on a timer, which on this clock only runs when
  // we step it: step in small increments until it draws something.
  where = `first paint of ${el.title}`
  for (let i = 0; i < 400 && el.isConnected && !doc.querySelector("#root > *, body > :not(script):not(#root)"); i++) {
    await step(el, 16)
    await sleep(8)
  }
  const loaded = (img: HTMLImageElement) =>
    img.complete ||
    new Promise((r) => {
      img.addEventListener("load", r, { once: true })
      img.addEventListener("error", r, { once: true })
    })
  where = `pictures and type of ${el.title}`
  await Promise.all([...doc.images].map(loaded))
  await doc.fonts.ready
  // a film's baked parts (kit.tsx Baked) start drawing as it mounts, on the real clock: let it mount, then wait for them
  where = `drawing ${el.title}`
  await step(el, 34)
  for (let i = 0; i < 400 && el.isConnected && doc.documentElement.dataset.baking; i++) await sleep(25)
  if (el.isConnected) base.set(el, w.__now!() - (at >= 0 ? cfg.preroll + at * 1000 : 0))
}

const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)))

async function frame(t: number) {
  const at = cfg.start + t
  // the scene at the playhead decides which frames are loaded: let React mount any new ones, then bring them up
  view.current!.render(at)
  await tick()
  // frames can arrive while others settle (a close-up's component mounts once its whole screen has said what it
  // holds): settle until no new ones come
  for (let pass = 0; pass < 6; pass++) {
    const fresh = view.current!.frames().filter((el) => !base.has(el) && showing(el, at))
    if (!fresh.length) break
    for (const el of fresh) await settle(el, at)
    view.current!.render(at)
    await tick()
  }
  // every frame steps at once: each keeps its own clock, and most of a tick is waiting on the frame's own timers
  where = `stepping to ${at.toFixed(3)} s`
  await Promise.all(
    view.current!.frames().map(async (el) => {
      // one still loading joins on the next frame
      if (!base.has(el) || !el.isConnected || !showing(el, at)) return
      const w = el.contentWindow as Stepped
      const dt = base.get(el)! + cfg.preroll + at * 1000 - w.__now!()
      if (dt > 0) await step(el, dt)
    }),
  )
  where = "drawing"
  // the frame laid out first, so the videos that show in it are known: one in a scene that isn't showing is left where
  // it is (seeking every video each frame, a world under every scene, is what made films with video slow)
  view.current!.render(at)
  for (const v of document.querySelectorAll("video")) {
    if (!v.duration) continue
    if (v.closest<HTMLElement>("[data-scene]")?.style.visibility === "hidden") continue
    const want = at % v.duration
    if (Math.abs(v.currentTime - want) > 0.0005) {
      v.currentTime = want
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }))
    }
  }
  view.current!.render(at)
  // two of the page's own frames, so the compositor has drawn the screens and the canvases together
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

window.__studio = {
  ready: (async () => {
    await document.fonts.ready
    // a later part of a split export joins the film part way (server/studio.ts `plan`): the frames it finds there
    // start their clocks there, the way they did when the film played up to it
    const join = cfg.join ?? 0
    // the view mounts its scenes (those near the start), then each scene its 3D and its screens: wait until the frames
    // in the page stop changing in number
    for (let i = 0; i < 200 && !view.current; i++) await sleep(25)
    view.current!.render(cfg.start + join)
    let last = -1
    for (let i = 0, still = 0; i < 300 && still < 8; i++) {
      await sleep(80)
      view.current!.render(cfg.start + join)
      const n = view.current!.frames().length
      still = n === last ? still + 1 : 0
      last = n
    }
    await Promise.all(
      view.current!.frames()
        .filter((el) => showing(el, cfg.start + join))
        .map((el) => settle(el, join ? cfg.start + join : -1)),
    )
    // the brand's type, before the first frame (its stylesheet goes in with the view)
    for (const f of [cfg.comp.brand?.font, cfg.comp.brand?.display].filter(Boolean)) await document.fonts.load(`600 32px "${f}"`).catch(() => {})
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.complete || new Promise((r) => (img.onload = img.onerror = r))))
    await Promise.all(
      [...document.querySelectorAll("video")].map((v) => v.readyState >= 2 || new Promise((r) => v.addEventListener("loadeddata", r, { once: true }))),
    )
    await frame(join)
  })(),
  frame,
  where: () => where,
}
