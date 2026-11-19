// shader.html: one shader video, drawn by React Three Fiber on a clock nobody else touches. Three ways in:
//   the export (server/shaders.ts) opens it with ?render, waits for window.__shader.ready and calls frame(t) per frame;
//   the editor opens it in an iframe and plays it (postMessage: spec, play, seek);
//   the gallery asks one hidden copy for stills (postMessage: still → a JPEG back).
// The spec comes in the hash (JSON), or by message.
import { StrictMode, Suspense, useEffect, useRef, useState, type MutableRefObject } from "react"
import { createRoot } from "react-dom/client"
import { Canvas, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { clock, pending } from "./clock"
import { Gradient } from "./Gradient"
import { Shapes } from "./Shapes"
import { Liquid } from "./Liquid"
import { Scenes } from "./Scenes"
import { GRADIENT_PRESETS, type ShaderSpec } from "./spec"

const q = new URLSearchParams(location.search)
const RENDER = q.has("render")
const read = (): ShaderSpec => {
  try {
    return JSON.parse(decodeURIComponent(location.hash.slice(1)))
  } catch {
    return GRADIENT_PRESETS[0]
  }
}

type Api = { ready: Promise<boolean>; frame: (t: number) => Promise<void>; spec: () => ShaderSpec }
declare global {
  interface Window {
    __shader?: Api
  }
}

const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const setTime = (t: number, duration: number) => {
  clock.duration = Math.max(0.1, duration)
  clock.t = t
  clock.phase = (((t / clock.duration) % 1) + 1) % 1
}

type StillFn = (t: number) => Promise<string>

function Driver({ spec, playing, seek, stillRef }: { spec: ShaderSpec; playing: boolean; seek: number | null; stillRef: MutableRefObject<StillFn | null> }) {
  const { gl, advance, scene } = useThree()
  // the ground, and how light becomes pixels: gradients and shapes write their colours exactly; lit 3D scenes go
  // through a neutral tone curve that keeps hues
  useEffect(() => {
    gl.setClearColor(new THREE.Color(spec.bg || "#000000"), spec.bg ? 1 : 0)
    gl.toneMapping = spec.kind === "scene" ? THREE.NeutralToneMapping : THREE.NoToneMapping
    scene.background = null
  }, [gl, scene, spec.bg, spec.kind])
  clock.px = gl.getPixelRatio()

  // the export's way in
  useEffect(() => {
    if (!RENDER) return
    const api: Api = {
      ready: (async () => {
        for (let i = 0; i < 3; i++) {
          await Promise.all([...pending])
          setTime(0, spec.duration)
          advance(performance.now())
          await twoFrames()
        }
        return true
      })(),
      // one frame of the page's own after drawing: the capture that follows composites the canvas as drawn
      frame: async (t) => {
        await Promise.all([...pending])
        setTime(t, spec.duration)
        advance(performance.now())
        await new Promise((r) => requestAnimationFrame(r))
      },
      spec: () => spec,
    }
    window.__shader = api
  }, [advance, spec])

  // playing in the editor: its own loop (the gallery's still page draws only when asked)
  useEffect(() => {
    if (RENDER || q.has("still")) return
    let raf = 0
    let from = performance.now() - clock.t * 1000
    const loop = (now: number) => {
      if (playing) setTime((now - from) / 1000, spec.duration)
      else from = now - clock.t * 1000
      advance(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [advance, playing, spec.duration])
  useEffect(() => {
    if (seek !== null) setTime(seek, spec.duration)
  }, [seek, spec.duration])

  // a still for the gallery: this frame, at the canvas's size
  useEffect(() => {
    stillRef.current = async (t) => {
      await Promise.all([...pending])
      setTime(t, spec.duration)
      advance(performance.now())
      return gl.domElement.toDataURL("image/jpeg", 0.86)
    }
  }, [advance, gl, stillRef, spec.duration])
  return null
}

function Body({ spec }: { spec: ShaderSpec }) {
  if (spec.kind === "gradient") return <Gradient s={spec} />
  if (spec.kind === "shape") return <Shapes s={spec} />
  if (spec.kind === "liquid") return <Liquid s={spec} />
  return <Scenes s={spec} />
}

function App() {
  const [spec, setSpec] = useState(read)
  const [playing, setPlaying] = useState(!RENDER && !q.has("still"))
  const [seek, setSeek] = useState<number | null>(null)
  const stillRef = useRef<StillFn | null>(null)
  const [queue, setQueue] = useState<{ id: string; spec: ShaderSpec; t: number; from: MessageEventSource | null }[]>([])
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const m = e.data
      if (!m || typeof m !== "object") return
      if (m.type === "spec") setSpec(m.spec)
      else if (m.type === "play") setPlaying(!!m.on)
      else if (m.type === "seek") setSeek(Number(m.t) || 0)
      else if (m.type === "still") setQueue((x) => [...x, { id: m.id, spec: m.spec, t: Number(m.t) || 0, from: e.source }])
    }
    addEventListener("message", on)
    addEventListener("hashchange", () => setSpec(read()))
    parent.postMessage({ type: "shader-ready" }, "*")
    return () => removeEventListener("message", on)
  }, [])
  // stills one at a time: show its spec, let it mount, take the frame, answer (timers, not frames: a page drawn
  // out of sight may get no animation frames)
  const head = queue[0]
  useEffect(() => {
    if (!head) return
    if (specOf(spec) !== specOf(head.spec)) return void setSpec(head.spec)
    let gone = false
    void (async () => {
      for (let i = 0; i < 200 && !stillRef.current; i++) await sleep(20)
      await sleep(40)
      const url = stillRef.current ? await stillRef.current(head.t).catch(() => "") : ""
      if (gone) return
      ;(head.from as Window | null)?.postMessage({ type: "still", id: head.id, url }, "*")
      setQueue((x) => x.slice(1))
    })()
    return () => {
      gone = true
    }
  }, [head, spec])

  // a new kind, mesh, form or logo is a new scene graph
  const key = [spec.kind, "mesh" in spec ? spec.mesh : "", "form" in spec ? spec.form : "", "scene" in spec ? spec.scene : "", "logo" in spec ? JSON.stringify(spec.logo) : ""].join(":")
  return (
    <Canvas
      frameloop="never"
      dpr={Math.min(devicePixelRatio || 1, RENDER ? 4 : 1.5)}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 45, position: [0, 0, 5], near: 0.1, far: 100 }}
      style={{ position: "fixed", inset: 0 }}
    >
      <Suspense fallback={null}>
        <Body key={key} spec={spec} />
      </Suspense>
      <Driver spec={spec} playing={playing} seek={seek} stillRef={stillRef} />
    </Canvas>
  )
}
const specOf = (s: ShaderSpec) => JSON.stringify(s)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
