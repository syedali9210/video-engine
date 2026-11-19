// The fun layer: small delights for rare moments, never for things done a hundred times a day (Emil's rule).
//   - burst / rain: confetti in the engine's own kind colours, shaped like what it makes (dots, squares, little easing
//     curves, tiny phones), with real physics (a kick, gravity, drag, paper that flutters as it turns);
//   - swap: places change through a View Transition (a quick fade and rise), the theme through a circle that grows
//     from where you clicked;
//   - barrelRoll: the whole app does one (the palette's secret);
//   - the Konami code (↑↑↓↓←→←→BA) throws a party;
//   - Snooze: an empty list that's asleep, z's drifting up.
// All of it stands still under prefers-reduced-motion.
import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { SESSION_GERUNDS } from "./quips"

const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/* ---------------- confetti ---------------- */

type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; flip: number; vf: number; size: number; color: string; kind: 0 | 1 | 2 | 3; life: number }
let canvas: HTMLCanvasElement | null = null
let bits: Bit[] = []
let raf = 0

function colours() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return [v("--k-scene"), v("--k-text"), v("--k-component"), v("--k-image"), v("--k-motion"), v("--k-effect"), v("--brand-3"), v("--k-device")].filter(Boolean)
}

function tick() {
  const c = canvas!
  const x = c.getContext("2d")!
  const dpr = c.width / innerWidth
  x.setTransform(dpr, 0, 0, dpr, 0, 0)
  x.clearRect(0, 0, innerWidth, innerHeight)
  bits = bits.filter((b) => b.y < innerHeight + 40 && b.life > 0)
  for (const b of bits) {
    b.vx *= 0.986
    b.vy = b.vy * 0.986 + 0.32
    b.x += b.vx
    b.y += b.vy
    b.r += b.vr
    b.flip += b.vf
    b.life -= 1
    x.save()
    x.globalAlpha = Math.min(1, b.life / 40)
    x.translate(b.x, b.y)
    x.rotate(b.r)
    // paper turning over: it narrows and widens as it falls
    x.scale(1, Math.cos(b.flip))
    x.fillStyle = b.color
    x.strokeStyle = b.color
    const s = b.size
    if (b.kind === 0) {
      x.beginPath()
      x.arc(0, 0, s * 0.45, 0, Math.PI * 2)
      x.fill()
    } else if (b.kind === 1) x.fillRect(-s / 2, -s / 3, s, s * 0.66)
    else if (b.kind === 2) {
      // a little easing curve, the engine's mark
      x.lineWidth = 2
      x.lineCap = "round"
      x.beginPath()
      x.moveTo(-s * 0.6, s * 0.45)
      x.bezierCurveTo(0, s * 0.45, 0, -s * 0.45, s * 0.6, -s * 0.45)
      x.stroke()
    } else {
      // a tiny phone
      x.beginPath()
      x.roundRect(-s * 0.32, -s * 0.6, s * 0.64, s * 1.2, s * 0.14)
      x.fill()
    }
    x.restore()
  }
  if (bits.length) raf = requestAnimationFrame(tick)
  else {
    canvas?.remove()
    canvas = null
  }
}

function launch(more: Bit[]) {
  if (still() || typeof document === "undefined") return
  if (!canvas) {
    canvas = document.createElement("canvas")
    Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "300" })
    canvas.setAttribute("aria-hidden", "true")
    const dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    document.body.appendChild(canvas)
  }
  bits.push(...more)
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(tick)
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

/** Confetti from a point (a button that just did something good), thrown up and out. */
export function burst(x: number, y: number, { count = 46, power = 1 } = {}) {
  const cols = colours()
  launch(
    Array.from({ length: count }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95
      const v = (5 + Math.random() * 7) * power
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, flip: Math.random() * 6, vf: 0.08 + Math.random() * 0.18, size: 6 + Math.random() * 6, color: pick(cols), kind: pick([0, 1, 1, 2, 3]) as Bit["kind"], life: 150 + Math.random() * 60 }
    }),
  )
}

/** From an element's middle. */
export function burstAt(el: Element | null, o?: { count?: number; power?: number }) {
  if (!el) return
  const r = el.getBoundingClientRect()
  burst(r.left + r.width / 2, r.top + r.height / 2, o)
}

/** A party: confetti falling across the whole window for a moment. */
export function rain(ms = 1800) {
  const cols = colours()
  const until = performance.now() + ms
  const drop = () => {
    launch(Array.from({ length: 7 }, () => ({ x: Math.random() * innerWidth, y: -20, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25, flip: Math.random() * 6, vf: 0.06 + Math.random() * 0.15, size: 7 + Math.random() * 7, color: pick(cols), kind: pick([0, 1, 1, 2, 3]) as Bit["kind"], life: 260 })))
    if (performance.now() < until) setTimeout(drop, 60)
  }
  drop()
}

/* ---------------- transitions ---------------- */

type VT = { ready: Promise<void>; finished: Promise<void> }
const vt = () => (document as Document & { startViewTransition?: (cb: () => void) => VT }).startViewTransition?.bind(document)

/** A change of place: a quick fade and rise (the app bar holds still). Plain without View Transitions or with less motion. */
export function swap(change: () => void) {
  const start = vt()
  if (!start || still()) return change()
  document.documentElement.classList.add("vt-swap")
  const t = start(() => flushSync(change))
  t.finished.finally(() => document.documentElement.classList.remove("vt-swap"))
}

/** The whole app, once round. */
export function barrelRoll() {
  if (still()) return
  document.getElementById("root")?.animate([{ transform: "rotate(0deg) scale(1)" }, { transform: "rotate(180deg) scale(0.9)" }, { transform: "rotate(360deg) scale(1)" }], { duration: 1300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" })
}

/* ---------------- the Konami code ---------------- */

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]
/** Calls `then` when ↑↑↓↓←→←→BA is typed (not while typing in a field). */
export function useKonami(then: () => void) {
  useEffect(() => {
    let at = 0
    const k = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable]")) return
      const want = KONAMI[at]
      at = e.key.toLowerCase() === want.toLowerCase() || e.key === want ? at + 1 : e.key === KONAMI[0] ? 1 : 0
      if (at === KONAMI.length) {
        at = 0
        then()
      }
    }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [then])
}

/* ---------------- waiting, with a little wit ---------------- */

const WAITS = [...SESSION_GERUNDS, "Choosing between 47 shades of violet", "Teaching the cuts to carry each other", "Asking the gradients to calm down", "Arguing about kerning", "Giving the end card room to breathe"]
/** A line that changes every couple of seconds while something long runs (slower when motion is reduced). */
export function useWaitLine(on: boolean, seed = 0) {
  const [i, setI] = useState(seed)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setI((x) => x + 1), still() ? 3600 : 2200)
    return () => clearInterval(t)
  }, [on])
  return `${WAITS[i % WAITS.length]}…`
}

/** An empty list, asleep: a moon and z's drifting up. */
export function Snooze({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span aria-hidden className="relative block h-14 w-16">
        <svg viewBox="0 0 48 48" width="40" height="40" className="absolute bottom-0 left-1 text-fg-3">
          <path d="M30 8a16 16 0 1 0 10 28A18 18 0 0 1 30 8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {[0, 1, 2].map((i) => (
          <span key={i} className="snooze absolute font-semibold text-fg-3" style={{ left: 34 + i * 6, top: 18 - i * 7, fontSize: 9 + i * 3, animationDelay: `${i * 0.6}s` }}>
            z
          </span>
        ))}
      </span>
      <p className="mt-3 text-body font-medium">{title}</p>
      {sub && <p className="mt-1 max-w-[280px] text-caption text-fg-3">{sub}</p>}
    </div>
  )
}
