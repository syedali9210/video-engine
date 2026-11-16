// Studio — the web player: a film from the Studio as a page that plays by itself, for a portfolio or a site. It draws
// the film with the view the engine and the export use, and fills whatever box it's given: the film reflows to it.
// With embed.js on the page the box takes the shape asked for at each width, so one embed reads on a Mac, an iPad, an
// iPhone and a Duo (the engine's Interactive section shows all four). The link says how it plays:
//   play=loop (by itself, round and round) or play=scroll (it scrubs with the page's scroll, through embed.js);
//   lean=0–1 (how far the device leans toward the pointer); pause=0 (a click or Space doesn't pause it).
// Off screen it rests; with reduced motion it holds one still.
//   play.html#z=<a packed film>&play=…   ·   play.html?src=<a film's JSON>#play=…
import { createRef } from "react"
import { createRoot } from "react-dom/client"
import { starts, total } from "./comp"
import { CompositionView, type FrameSpec, type Resolve, type ViewHandle } from "./view"
import { unpack, type WebFilm } from "./web"
import "./render.css"

const root = document.getElementById("root")!
const hash = new URLSearchParams(location.hash.slice(1))
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const opts = {
  scroll: hash.get("play") === "scroll",
  lean: clamp(Number(hash.get("lean") ?? 1) || 0),
  pause: hash.get("pause") !== "0",
}

async function load(): Promise<WebFilm> {
  const src = new URLSearchParams(location.search).get("src")
  if (src) return (await fetch(src)).json()
  const z = hash.get("z")
  if (!z) throw new Error("No film in the link")
  return unpack(z)
}

// a frame can only be one of the engine's own pages: a film's link can't put another site in here
const own = (f: FrameSpec): FrameSpec => (/^\/(stage\.html|anim\/[\w-]+\/[\w.-]+\.html)$/.test(f.path) ? f : { ...f, path: "/stage.html", query: {} })

async function main() {
  let film: WebFilm
  try {
    film = await load()
  } catch {
    root.className = "grid place-items-center bg-neutral-950 font-sans text-sm text-neutral-400"
    root.textContent = "This film couldn't be loaded."
    return
  }
  document.title = film.name
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  const frame = (key: string, hairline: boolean, scheme: "light" | "dark"): FrameSpec => (film.components[key] ? own(film.components[key]) : { key, path: "/stage.html", query: {}, values: {}, bare: true, hairline, scheme })
  const resolve: Resolve = {
    screen: (_c, _d, key) => {
      const s = film.screens[key]
      return s ? { ...s, frames: s.frames.map(own) } : { frames: [], bg: "#000" }
    },
    component: (_a, key, hairline, scheme) => ({ ...frame(key, hairline, scheme), hairline, scheme }),
    part: (_a, key, _w, hairline, scheme) => ({ ...frame(key, hairline, scheme), hairline, scheme }),
    image: (src) => src,
    dark: film.dark,
    stepped: false,
    origin: location.origin,
    reduce: still,
  }
  const view = createRef<ViewHandle>()
  root.setAttribute("role", "img")
  root.setAttribute("aria-label", film.name)
  createRoot(root).render(<CompositionView ref={view} comp={film.comp} resolve={resolve} />)

  const L = Math.max(0.1, total(film.comp))
  // with reduced motion, one moment holds: well into the first shot, where it has settled
  let t = still ? Math.min(L - 0.01, starts(film.comp)[0] + film.comp.scenes[0].duration * 0.6) : 0
  let playing = !still
  let visible = true
  // play=scroll: where the page's scroll puts the film (embed.js says); until it does, the film loops
  let target: number | null = null
  let last = performance.now()
  let pointer: { x: number; y: number } | null = null
  // the lean toward the pointer, on a spring (decorative: it follows, it never jumps)
  const lean = { yaw: 0, elev: 0, vy: 0, ve: 0 }
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    requestAnimationFrame(loop)
    if (!visible) return
    if (still) {
      // one moment holds
    } else if (opts.scroll && target !== null) t += (target - t) * (1 - Math.exp(-dt * 12))
    else if (playing) t = (t + dt) % L
    if (!still && opts.lean) {
      const ty = pointer ? (pointer.x - 0.5) * 10 * opts.lean : 0
      const te = pointer ? (0.5 - pointer.y) * 6 * opts.lean : 0
      lean.vy += (ty - lean.yaw) * 90 * dt - lean.vy * 14 * dt
      lean.ve += (te - lean.elev) * 90 * dt - lean.ve * 14 * dt
      lean.yaw += lean.vy * dt
      lean.elev += lean.ve * dt
    }
    view.current?.render(Math.min(t, L - 0.001), { yaw: lean.yaw, elev: lean.elev, zoom: 1 }, pointer)
  }
  requestAnimationFrame(loop)

  // the page around it (embed.js): where the scroll is, and whether the film is on screen
  addEventListener("message", (e) => {
    const d = e.data as { engineFilm?: string; p?: unknown; on?: unknown } | null
    if (!d || typeof d !== "object") return
    if (d.engineFilm === "seek" && opts.scroll && typeof d.p === "number" && Number.isFinite(d.p)) target = clamp(d.p) * (L - 0.001)
    if (d.engineFilm === "visible") visible = d.on !== false
  })
  if (parent !== window) parent.postMessage({ engineFilm: "ready" }, "*")

  addEventListener("pointermove", (e) => (pointer = { x: e.clientX / innerWidth, y: e.clientY / innerHeight }))
  document.documentElement.addEventListener("pointerleave", () => (pointer = null))
  const toggle = () => {
    if (still || !opts.pause || (opts.scroll && target !== null)) return
    playing = !playing
    last = performance.now()
  }
  addEventListener("click", toggle)
  addEventListener("keydown", (e) => {
    if (e.key !== " ") return
    e.preventDefault()
    toggle()
  })
}

void main()
