// The live frame-rate meter: while the film plays, how many frames a second the editor draws (a dot: steady, a few
// dropped, struggling). "Find what's slow" measures it: the scene playing is timed as it is, then with each of its
// layers hidden in turn, and the layer whose absence saves the most time a frame is named, with what it costs.
import { useEffect, useRef, useState } from "react"
import { Gauge } from "@phosphor-icons/react"
import { Button, Popover } from "../ui"
import { Glyph } from "../Thinking"
import type { Comp } from "./comp"

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0
/** frame times (ms) over the next `n` frames */
const frames = (n: number) =>
  new Promise<number[]>((done) => {
    const out: number[] = []
    let last = performance.now()
    const tick = (now: number) => {
      out.push(now - last)
      last = now
      if (out.length >= n) done(out.slice(2))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

export function FpsMeter({ comp, playing }: { comp: Comp; playing: boolean }) {
  const [fps, setFps] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<string | null>(null)
  const times = useRef<number[]>([])
  useEffect(() => {
    if (!playing) return setFps(null)
    let id = 0
    let last = performance.now()
    let shown = last
    const tick = (now: number) => {
      times.current.push(now - last)
      if (times.current.length > 120) times.current.shift()
      last = now
      if (now - shown > 500) {
        shown = now
        const avg = times.current.reduce((a, b) => a + b, 0) / times.current.length
        setFps(Math.round(1000 / avg))
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing])

  const find = async () => {
    setBusy(true)
    setFound(null)
    try {
      // the scene on screen and its layers (a device's 3D is one layer for all of them)
      const scene = [...document.querySelectorAll<HTMLElement>("[data-scene]")].find((s) => getComputedStyle(s).visibility === "visible")
      if (!scene) return setFound("Play the film first: it's measured while it plays.")
      const layers = [...scene.querySelectorAll<HTMLElement>(":scope > [data-layer], :scope > div:not([data-layer])")]
      const base = p95(await frames(60))
      const cost: { name: string; saved: number }[] = []
      for (const el of layers) {
        const was = el.style.display
        el.style.display = "none"
        const t = p95(await frames(45))
        el.style.display = was
        const l = comp.scenes.flatMap((s) => s.layers).find((x) => x.id === el.dataset.layer)
        const name = l ? (l.name ?? (l.kind === "component" ? `${l.kind} (${l.anim})` : l.kind)) : "the 3D devices"
        cost.push({ name, saved: base - t })
      }
      const worst = cost.sort((a, b) => b.saved - a.saved)[0]
      const sceneName = comp.scenes.find((s) => s.id === scene.dataset.scene)?.name ?? "this scene"
      setFound(
        base <= 18
          ? `“${sceneName}” keeps up: ${Math.round(1000 / Math.max(base, 1000 / 120))} fps at its slowest moments.`
          : worst && worst.saved > 2
            ? `In “${sceneName}”, “${worst.name}” costs about ${Math.round(worst.saved)} ms a frame: without it the slowest frames take ${Math.round(base - worst.saved)} ms instead of ${Math.round(base)}. A 60 fps frame has 16.7.`
            : `“${sceneName}” is slow (${Math.round(base)} ms frames) but no one layer is the cause: it's all of them together.`,
      )
    } finally {
      setBusy(false)
    }
  }

  const tone = fps === null ? "bg-fg-3" : fps >= 55 ? "bg-good-ink" : fps >= 40 ? "bg-warn-ink" : "bg-bad-ink"
  return (
    <>
      <Button variant="ghost" popover="fps-pop" label="Frame rate">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        <span className="tabular-nums">{fps === null ? "fps" : `${fps} fps`}</span>
      </Button>
      <Popover id="fps-pop" align="end" label="Frame rate">
        <div className="w-[300px] space-y-2.5 p-3 text-caption">
          <p className="text-fg-2">{fps === null ? "Play the film to see how many frames a second the editor draws." : `${fps} frames a second, the last two seconds.`}</p>
          <Button size="sm" disabled={busy || !playing} onClick={() => void find()}>
            {busy ? <><Glyph variant="scan" size={14} /> Timing each layer…</> : <><Gauge size={14} aria-hidden /> Find what's slow</>}
          </Button>
          {found && <p role="status" className="text-fg-2">{found}</p>}
        </div>
      </Popover>
    </>
  )
}
