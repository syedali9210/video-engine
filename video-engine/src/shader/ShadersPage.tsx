// The Shaders place: moving gradients, gradients on 3D shapes, liquid logos and React Three Fiber scenes, each made
// into a video. Browse (stills, a card plays when pointed at), make new ones by rule (a mood, or your brand's colour),
// open one to tune it live, render it (the engine's server: headless Chrome, ffmpeg), then download it or put it in
// your film. The preview is the page the export renders, so what you tune is what you get.
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { DownloadSimple, FilmStrip, Pause, Play, Plus, Shuffle, Trash, UploadSimple } from "@phosphor-icons/react"
import { Back, DockBack, Page, PageSection, PageTitle, Pills } from "../shell"
import { Act, Card, Grid, Tag } from "../Galleries"
import { Button, Segmented, Select, Switch, Tip, useMedia } from "../ui"
import { ColorField, SliderField, field } from "../controls"
import { Row, Section } from "../studio/Studio"
import { Skeleton } from "../States"
import { KINDS, MOODS, PRESETS, generate, specKey, type GradientSpec, type LiquidSpec, type Mark, type Mood, type SceneSpec, type ShaderKind, type ShaderSpec, type ShapeSpec } from "./spec"

const LOCAL = import.meta.env.DEV

/* ---------------- stills: one hidden page draws them, one at a time ---------------- */

const shots = new Map<string, string>()
const waiting: { key: string; spec: ShaderSpec; t: number; done: (url: string) => void }[] = []
let drawer: HTMLIFrameElement | null = null
let drawerReady: Promise<void> | null = null
let busy = false
let seq = 0
const keyOf = (s: ShaderSpec, t: number) => `${specKey(s)}@${t}`

function still(spec: ShaderSpec, t = 0.37): Promise<string> {
  const key = keyOf(spec, t)
  const had = shots.get(key)
  if (had) return Promise.resolve(had)
  return new Promise((done) => {
    waiting.push({ key, spec, t: spec.duration * t, done })
    void pump()
  })
}
async function pump() {
  if (busy || !waiting.length) return
  busy = true
  if (!drawer) {
    drawer = document.createElement("iframe")
    drawer.src = "/shader.html?still"
    drawer.setAttribute("aria-hidden", "true")
    drawer.tabIndex = -1
    // drawn at a card's size, out of the way (not display:none: a page that isn't drawn has no canvas to read)
    Object.assign(drawer.style, { position: "fixed", left: "0", top: "0", width: "480px", height: "270px", opacity: "0.001", pointerEvents: "none", border: "0", zIndex: "-1" })
    drawerReady = new Promise((r) => {
      const on = (e: MessageEvent) => {
        if (e.source === drawer?.contentWindow && e.data?.type === "shader-ready") {
          removeEventListener("message", on)
          r()
        }
      }
      addEventListener("message", on)
    })
    document.body.appendChild(drawer)
  }
  await drawerReady
  const job = waiting.shift()!
  const id = String(++seq)
  const url = await new Promise<string>((r) => {
    const on = (e: MessageEvent) => {
      if (e.source === drawer?.contentWindow && e.data?.type === "still" && e.data.id === id) {
        removeEventListener("message", on)
        r(e.data.url)
      }
    }
    addEventListener("message", on)
    drawer!.contentWindow!.postMessage({ type: "still", id, spec: job.spec, t: job.t }, "*")
    // a still that never comes (a lost context) doesn't hold up the rest
    setTimeout(() => r(""), 15000)
  })
  if (url) shots.set(job.key, url)
  job.done(url)
  busy = false
  void pump()
}

function Still({ spec }: { spec: ShaderSpec }) {
  const [url, setUrl] = useState(() => shots.get(keyOf(spec, 0.37)) ?? "")
  useEffect(() => {
    let on = true
    void still(spec).then((u) => on && setUrl(u))
    return () => {
      on = false
    }
  }, [spec])
  return url ? <img src={url} alt="" className="block aspect-video w-full object-cover" /> : <Skeleton className="aspect-video w-full" />
}

/** A card's picture: its still, playing live while it's pointed at. */
function Shot({ spec }: { spec: ShaderSpec }) {
  const [live, setLive] = useState(false)
  return (
    <span className="relative block" onPointerEnter={() => setLive(true)} onPointerLeave={() => setLive(false)}>
      <Still spec={spec} />
      {live && <iframe title="" tabIndex={-1} src={`/shader.html#${encodeURIComponent(JSON.stringify(spec))}`} className="pointer-events-none absolute inset-0 h-full w-full border-0" />}
    </span>
  )
}

/* ---------------- the server's side ---------------- */

type Job = { id: string; state: "queued" | "rendering" | "encoding" | "done" | "error"; frame: number; total: number; url?: string; error?: string }
export type Render = { name: string; url: string; spec: ShaderSpec; width: number; height: number; fps: number; seconds: number; made: number }

const FORMATS = [
  { id: "16x9", name: "16:9 · 1920 × 1080", w: 1920, h: 1080 },
  { id: "4k", name: "16:9 4K · 3840 × 2160", w: 3840, h: 2160 },
  { id: "9x16", name: "9:16 · 1080 × 1920", w: 1080, h: 1920 },
  { id: "1x1", name: "1:1 · 1080 × 1080", w: 1080, h: 1080 },
  { id: "4x5", name: "4:5 · 1080 × 1350", w: 1080, h: 1350 },
]

async function startRender(body: object): Promise<string> {
  const r = await fetch("/__shader/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.id) throw new Error(j?.error || "The engine's server isn't running")
  return j.id
}

/* ---------------- the place ---------------- */

export function ShadersPage({ brand, onUse }: { /** the product's colour, for "from your brand" */ brand?: string; /** put a finished video in the film */ onUse?: (url: string, aspect: number) => void }) {
  const [kind, setKind] = useState<ShaderKind>("gradient")
  const [mood, setMood] = useState<Mood>("any")
  const [fromBrand, setFromBrand] = useState(false)
  const [made, setMade] = useState<ShaderSpec[]>([])
  // a phone fits the four kinds in one row only with short names
  const narrow = useMedia("(max-width: 520px)")
  const [open, setOpen] = useState<ShaderSpec | null>(null)
  const [renders, setRenders] = useState<Render[]>([])
  const refresh = () => {
    if (!LOCAL) return
    void fetch("/__shader/list")
      .then((r) => r.json())
      .then((x) => Array.isArray(x) && setRenders(x.filter((v: Render) => /\.(mp4|mov)$/.test(v.name))))
      .catch(() => {})
  }
  useEffect(refresh, [])

  const make = () => {
    const base = (Math.random() * 1e6) | 0
    setMade(Array.from({ length: 4 }, (_, i) => ({ ...generate(kind, base + i, mood, fromBrand ? brand : undefined) })))
  }
  // a new kind starts with its presets, not the last kind's made ones
  useEffect(() => setMade([]), [kind])

  if (open)
    return (
      <Back.Provider value={{ label: "Shaders", go: () => (setOpen(null), refresh()) }}>
        <Editor start={open} brand={brand} onUse={onUse} onRendered={refresh} />
      </Back.Provider>
    )

  const presets = PRESETS[kind]
  return (
    <Page label="Shaders">
      <PageTitle
        title="Shaders"
        sub="Moving gradients, gradients on 3D shapes, liquid logos and 3D scenes, rendered as videos that loop. Tune one live, then download it or put it behind your film."
        actions={
          <Act ink icon={Shuffle} onClick={make}>
            Make new ones
          </Act>
        }
      />
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Pills label="Kinds of shader" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.id, label: narrow ? SHORT[k.id] : k.name, count: narrow ? undefined : PRESETS[k.id].length }))} />
        {(kind === "gradient" || kind === "shape" || kind === "scene") && (
          <div className="flex flex-wrap items-center gap-3">
            <span id="sh-mood" className="text-body text-fg-3">
              New ones
            </span>
            <Select aria-labelledby="sh-mood" value={mood} onChange={(e) => setMood(e.target.value as Mood)} className="w-32">
              {MOODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            {brand && (
              <label className="flex items-center gap-2 text-body text-fg-2">
                <Switch on={fromBrand} onChange={setFromBrand} label="From your brand colour" />
                <span className="inline-flex items-center gap-1.5">
                  From your brand
                  <span aria-hidden className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_var(--line)]" style={{ background: brand }} />
                </span>
              </label>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-body text-fg-3">{KINDS.find((k) => k.id === kind)?.hint}</p>

      {made.length > 0 && (
        <PageSection className="mt-10" title="Made for you" icon={Shuffle} aside={<Button size="sm" onClick={make}>Four more</Button>}>
          <Grid>
            {made.map((s, i) => (
              <Card key={specKey(s)} i={i} onClick={() => setOpen(s)} title={s.name} meta={describe(s)} shot={<Shot spec={s} />} />
            ))}
          </Grid>
        </PageSection>
      )}

      <PageSection className="mt-12" title={KINDS.find((k) => k.id === kind)!.name} count={presets.length}>
        <Grid>
          {presets.map((s, i) => (
            <Card key={s.name} i={i} onClick={() => setOpen(s)} title={s.name} meta={describe(s)} shot={<Shot spec={s} />} />
          ))}
        </Grid>
      </PageSection>

      {LOCAL && renders.length > 0 && (
        <PageSection className="mt-16" title="Your renders" count={renders.length} icon={FilmStrip}>
          <Grid>
            {renders.map((r, i) => (
              <Card
                key={r.name}
                i={i}
                onClick={() => setOpen(r.spec)}
                title={r.spec.name}
                meta={`${r.width} × ${r.height} · ${r.fps} fps · ${r.seconds} s`}
                shot={<Clip url={r.url} />}
                badge={<Tag>{r.name.endsWith(".mov") ? "ProRes, alpha" : "MP4"}</Tag>}
              />
            ))}
          </Grid>
        </PageSection>
      )}
    </Page>
  )
}

/** A rendered video on a card: its first frame, playing while pointed at. */
function Clip({ url }: { url: string }) {
  const v = useRef<HTMLVideoElement>(null)
  return (
    <video
      ref={v}
      src={url}
      muted
      loop
      playsInline
      preload="metadata"
      className="block aspect-video w-full bg-black object-cover"
      onPointerEnter={() => void v.current?.play().catch(() => {})}
      onPointerLeave={() => v.current?.pause()}
    />
  )
}

const describe = (s: ShaderSpec) =>
  s.kind === "gradient"
    ? `${s.mesh === "water" ? "Water" : s.mesh === "plane" ? "Plane" : "Sphere"} · ${s.grain > 0 ? "grain" : "clean"} · ${s.duration} s loop`
    : s.kind === "shape"
      ? `${FORM_NAME[s.form]} · ${AXIS[s.axis].name.toLowerCase()} · ${MOTION[s.motion].toLowerCase()}`
      : s.kind === "liquid"
        ? `${s.logo.type === "text" ? `“${s.logo.text}”` : s.logo.type === "mark" ? `${s.logo.mark} mark` : "your logo"} · ${s.duration} s loop`
        : `React Three Fiber · ${s.duration} s loop`

const SHORT: Record<ShaderKind, string> = { gradient: "Gradients", shape: "Shapes", liquid: "Liquid", scene: "3D" }
const FORM_NAME: Record<ShapeSpec["form"], string> = { slabs: "Stacked slabs", discs: "Glass discs", pills: "Pills", orb: "Orb", ring: "Ring", tiles: "Bento tiles" }
const AXIS: Record<ShapeSpec["axis"], { name: string; hint: string }> = {
  stack: { name: "Through the stack", hint: "Each piece a step of the ramp, darkest at the bottom" },
  across: { name: "Across", hint: "Over every piece at an angle, like light falling on it" },
  radial: { name: "From the middle", hint: "Rings out from the centre of each piece" },
  facing: { name: "At the rims", hint: "By how a face turns from you: glass and chrome" },
  around: { name: "Round it", hint: "Round the piece like a clock hand: rings and orbs" },
}
const MOTION: Record<ShapeSpec["motion"], string> = { stack: "Stacking", twist: "Twisting", turn: "Turning", breathe: "Breathing", float: "Floating", fan: "Fanning" }
const MARKS: Mark[] = ["sparkle", "drop", "ring", "bolt"]

/* ---------------- the editor ---------------- */

function Editor({ start, brand, onUse, onRendered }: { start: ShaderSpec; brand?: string; onUse?: (url: string, aspect: number) => void; onRendered: () => void }) {
  const [s, setS] = useState<ShaderSpec>(start)
  const put = (patch: object) => setS((x) => ({ ...x, ...patch }) as ShaderSpec)
  const frame = useRef<HTMLIFrameElement>(null)
  const [playing, setPlaying] = useState(true)
  const [format, setFormat] = useState(FORMATS[0].id)
  const [fps, setFps] = useState<30 | 60>(60)
  const [best, setBest] = useState(false)
  const [loops, setLoops] = useState(1)
  const [job, setJob] = useState<Job | null>(null)
  const [seed, setSeed] = useState(1)
  const f = FORMATS.find((x) => x.id === format)!
  // Space plays and pauses, Escape goes back (not while typing in a field)
  const back = useContext(Back)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable], [role=listbox]")) return
      if (e.key === " ") {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === "Escape" && !document.querySelector(":popover-open")) back?.go()
    }
    addEventListener("keydown", on)
    return () => removeEventListener("keydown", on)
  }, [back])

  // the preview follows every change (the page takes the spec by message)
  const ready = useRef(false)
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.type === "shader-ready") {
        ready.current = true
        frame.current!.contentWindow!.postMessage({ type: "spec", spec: s }, "*")
      }
    }
    addEventListener("message", on)
    return () => removeEventListener("message", on)
  }, [s])
  useEffect(() => {
    if (ready.current) frame.current?.contentWindow?.postMessage({ type: "spec", spec: s }, "*")
  }, [s])
  useEffect(() => frame.current?.contentWindow?.postMessage({ type: "play", on: playing }, "*"), [playing])
  const src = useMemo(() => `/shader.html#${encodeURIComponent(JSON.stringify(start))}`, [start])

  // a render, followed until it's done
  useEffect(() => {
    if (!job || job.state === "done" || job.state === "error") return
    const t = setTimeout(async () => {
      const j = (await fetch(`/__shader/jobs/${job.id}`).then((r) => r.json()).catch(() => null)) as Job | null
      if (j) setJob(j)
      if (j?.state === "done") onRendered()
    }, 600)
    return () => clearTimeout(t)
  }, [job, onRendered])
  const render = async () => {
    setJob({ id: "", state: "queued", frame: 0, total: 0 })
    try {
      const id = await startRender({ spec: s, width: f.w, height: f.h, fps, scale: best && f.w <= 1920 ? 2 : 1, seconds: s.duration * loops, format: s.bg ? "mp4" : "mov" })
      setJob({ id, state: "queued", frame: 0, total: 0 })
    } catch (e) {
      setJob({ id: "", state: "error", frame: 0, total: 0, error: (e as Error).message })
    }
  }
  const busy = !!job && job.state !== "done" && job.state !== "error"
  // a different spec than the one rendered: the result is stale
  useEffect(() => setJob((j) => (j && !busy ? null : j)), [s, format, fps, best, loops]) // eslint-disable-line react-hooks/exhaustive-deps

  const again = () => {
    const n = seed + 1
    setSeed(n)
    if (s.kind === "gradient" || s.kind === "shape") setS({ ...generate(s.kind, ((Math.random() * 1e6) | 0) + n, "any", undefined), name: s.name })
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas lg:flex-row">
      {/* the stage: the video at the chosen shape */}
      <div className="relative flex min-h-[46vh] min-w-0 flex-1 items-center justify-center p-4 pb-24 lg:p-8 lg:pb-24">
        <div className="relative max-h-full w-full overflow-hidden rounded-[14px] shadow-[0_0_0_1px_var(--line),var(--sh-lg)]" style={{ aspectRatio: `${f.w} / ${f.h}`, maxWidth: `min(100%, calc((100vh - 140px) * ${f.w / f.h}))`, background: s.bg ? s.bg : "repeating-conic-gradient(#8883 0% 25%, transparent 0% 50%) 50% / 16px 16px" }}>
          <iframe ref={frame} title={`${s.name}, live`} src={src} className="absolute inset-0 h-full w-full border-0" />
        </div>
        <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">
          <div className="dock">
            <DockBack />
            <Tip label={playing ? "Pause" : "Play"} kbd="Space" side="top">
              <button type="button" className="grid" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause /> : <Play />}
              </button>
            </Tip>
            {(s.kind === "gradient" || s.kind === "shape") && (
              <Tip label="Another one by the rules" side="top">
                <button type="button" className="grid" onClick={again} aria-label="Another one">
                  <Shuffle />
                </button>
              </Tip>
            )}
            <span aria-hidden className="dock-sep" />
            <Output job={job} busy={busy} onRender={render} onUse={onUse && job?.url ? () => onUse(job.url!, f.w / f.h) : undefined} />
          </div>
        </div>
      </div>

      {/* its settings */}
      <aside aria-label="Settings" className="scroll-thin max-h-[54vh] w-full shrink-0 overflow-y-auto border-t bg-surface lg:max-h-none lg:w-[320px] lg:border-l lg:border-t-0">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <input aria-label="Name" value={s.name} onChange={(e) => put({ name: e.target.value })} className="min-w-0 flex-1 bg-transparent text-ui font-semibold outline-none" />
          <span className="text-caption text-fg-3">{KINDS.find((k) => k.id === s.kind)?.name}</span>
        </div>
        {s.kind === "gradient" && <GradientControls s={s} put={put} />}
        {s.kind === "shape" && <ShapeControls s={s} put={put} />}
        {s.kind === "liquid" && <LiquidControls s={s} put={put} />}
        {s.kind === "scene" && <SceneControls s={s} put={put} />}
        <Section title="Ground">
          <Ground s={s} put={put} brand={brand} />
        </Section>
        <Section title="Video">
          <Row label="Size">
            <Select aria-label="Size" value={format} onChange={(e) => setFormat(e.target.value)} className="w-full">
              {FORMATS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Frames">
            <Segmented label="Frames a second" value={fps} onChange={setFps} options={[{ value: 30, label: "30 fps" }, { value: 60, label: "60 fps" }]} full />
          </Row>
          <SliderField id="sh-dur" label="Loop" value={s.duration} min={3} max={20} step={0.5} unit="s" def={start.duration} set={(v) => put({ duration: v })} hint="One lap of the motion: the video's last frame runs into its first" />
          <SliderField id="sh-loops" label="Laps" value={loops} min={1} max={6} step={1} def={1} set={setLoops} hint="How many times round in the file" />
          <Row label="Smoother">
            <Switch on={best} onChange={setBest} label="Render at twice the size and scale down (slower)" />
          </Row>
        </Section>
      </aside>
    </div>
  )
}

/** The dock's end: render, its progress, then download and use. */
function Output({ job, busy, onRender, onUse }: { job: Job | null; busy: boolean; onRender: () => void; onUse?: () => void }) {
  if (!LOCAL)
    return (
      <Tip label="Rendering runs on the engine's server: npm run dev on your machine" side="top">
        <span className="px-3 text-body text-fg-3">Render on your machine</span>
      </Tip>
    )
  if (job?.state === "done" && job.url)
    return (
      <span className="flex items-center gap-1">
        <a href={`${job.url}?download`} download className="press btn btn-2 flex h-9 items-center gap-2 rounded-full px-3.5 text-body font-medium">
          <DownloadSimple size={16} aria-hidden />
          Download
        </a>
        {onUse && (
          <button type="button" onClick={onUse} className="press btn btn-ink flex h-9 items-center gap-2 rounded-full px-3.5 text-body font-medium">
            <FilmStrip size={16} aria-hidden />
            Use in film
          </button>
        )}
      </span>
    )
  return (
    <span className="flex items-center gap-2">
      {job?.state === "error" && <span className="max-w-56 truncate px-1 text-body text-[var(--bad,#e5484d)]" title={job.error}>{job.error}</span>}
      {busy && (
        <span className="px-2 text-body tabular-nums text-fg-2" aria-live="polite">
          {job!.state === "queued" ? "Waiting…" : job!.state === "encoding" ? "Encoding…" : `${job!.frame} / ${job!.total}`}
        </span>
      )}
      <button type="button" disabled={busy} onClick={onRender} className="press btn btn-ink flex h-9 items-center gap-2 rounded-full px-4 text-body font-medium disabled:opacity-50">
        {job?.state === "error" ? "Try again" : "Render video"}
      </button>
    </span>
  )
}

/* ---------------- each kind's settings ---------------- */

type Put = (patch: object) => void

function Colors({ colors, set, min = 2, max = 5 }: { colors: string[]; set: (c: string[]) => void; min?: number; max?: number }) {
  return (
    <>
      {colors.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <ColorField id={`sh-c${i}`} label={`Colour ${i + 1}`} value={c} def={c} set={(v) => set(colors.map((x, k) => (k === i ? v : x)))} />
          </div>
          {colors.length > min && (
            <Tip label="Remove this colour">
              <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => set(colors.filter((_, k) => k !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg">
                <Trash size={15} />
              </button>
            </Tip>
          )}
        </div>
      ))}
      {colors.length < max && (
        <Button size="sm" variant="ghost" onClick={() => set([...colors, colors[colors.length - 1]])}>
          <Plus size={14} aria-hidden /> Add a colour
        </Button>
      )}
    </>
  )
}

function GradientControls({ s, put }: { s: GradientSpec; put: Put }) {
  const cam = (p: Partial<GradientSpec["cam"]>) => put({ cam: { ...s.cam, ...p } })
  return (
    <>
      <Section title="Colours">
        <Colors colors={s.colors} set={(c) => put({ colors: c })} min={3} max={3} />
      </Section>
      <Section title="Folds">
        <Row label="Surface">
          <Segmented label="Surface" value={s.mesh} onChange={(v) => put({ mesh: v })} options={[{ value: "water", label: "Water" }, { value: "plane", label: "Plane" }, { value: "sphere", label: "Sphere" }]} full />
        </Row>
        <SliderField id="sh-dens" label="Density" value={s.density} min={0.2} max={3} step={0.05} set={(v) => put({ density: v })} hint="How close the folds are" />
        <SliderField id="sh-str" label="Depth" value={s.strength} min={0} max={6} step={0.05} set={(v) => put({ strength: v })} hint="How deep they fold" />
        <SliderField id="sh-spd" label="Speed" value={s.speed} min={0} max={1} step={0.01} set={(v) => put({ speed: v })} />
        {s.mesh === "sphere" && (
          <>
            <SliderField id="sh-amp" label="Twist" value={s.amplitude} min={0} max={8} step={0.1} set={(v) => put({ amplitude: v })} />
            <SliderField id="sh-freq" label="Twists" value={s.frequency} min={0} max={10} step={0.1} set={(v) => put({ frequency: v })} />
          </>
        )}
      </Section>
      <Section title="Light">
        <SliderField id="sh-bri" label="Brightness" value={s.brightness} min={0.4} max={2} step={0.01} set={(v) => put({ brightness: v })} />
        <SliderField id="sh-lit" label="Shading" value={s.light} min={0} max={1} step={0.01} set={(v) => put({ light: v })} hint="0 is flat, the way ShaderGradient lights it; up shades the folds" />
        <SliderField id="sh-grain" label="Grain" value={s.grain} min={0} max={0.2} step={0.005} set={(v) => put({ grain: v })} />
      </Section>
      <Section title="Camera" fold>
        <SliderField id="sh-az" label="Around" value={s.cam.az} min={0} max={360} step={1} unit="°" set={(v) => cam({ az: v })} />
        <SliderField id="sh-pol" label="From above" value={s.cam.polar} min={0} max={180} step={1} unit="°" set={(v) => cam({ polar: v })} />
        {s.mesh === "sphere" ? <SliderField id="sh-zoom" label="Zoom" value={s.cam.zoom} min={1} max={30} step={0.1} set={(v) => cam({ zoom: v })} /> : <SliderField id="sh-dist" label="Distance" value={s.cam.dist} min={0.5} max={10} step={0.05} set={(v) => cam({ dist: v })} />}
        <SliderField id="sh-orbit" label="Sway" value={s.orbit} min={0} max={30} step={0.5} unit="°" set={(v) => put({ orbit: v })} hint="The camera swings this far each way over the loop" />
        {(["x", "y", "z"] as const).map((a, i) => (
          <SliderField key={a} id={`sh-rot-${a}`} label={`Turn ${a}`} value={s.rot[i]} min={-180} max={360} step={1} unit="°" set={(v) => put({ rot: s.rot.map((x, k) => (k === i ? v : x)) })} />
        ))}
        {(["x", "y", "z"] as const).map((a, i) => (
          <SliderField key={a} id={`sh-pos-${a}`} label={`Move ${a}`} value={s.pos[i]} min={-4} max={4} step={0.05} set={(v) => put({ pos: s.pos.map((x, k) => (k === i ? v : x)) })} />
        ))}
      </Section>
    </>
  )
}

function ShapeControls({ s, put }: { s: ShapeSpec; put: Put }) {
  const stack = s.form !== "orb" && s.form !== "ring"
  return (
    <>
      <Section title="Form">
        <Row label="Form">
          <Select aria-label="Form" value={s.form} onChange={(e) => put({ form: e.target.value })} className="w-full">
            {Object.entries(FORM_NAME).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Row>
        {stack && <SliderField id="sh-count" label={s.form === "tiles" ? "Tiles" : "Pieces"} value={s.count} min={1} max={s.form === "tiles" ? 5 : 9} step={1} set={(v) => put({ count: v })} />}
        {stack && s.form !== "tiles" && <SliderField id="sh-gap" label="Gap" value={s.gap} min={0} max={2} step={0.01} set={(v) => put({ gap: v })} hint="As a share of a piece's thickness" />}
        {(s.form === "slabs" || s.form === "tiles") && <SliderField id="sh-round" label="Rounding" value={s.round} min={0} max={1} step={0.01} set={(v) => put({ round: v })} />}
      </Section>
      <Section title="Gradient">
        <Colors colors={s.colors} set={(c) => put({ colors: c })} />
        <Row label="Runs">
          <Select aria-label="Where the gradient runs" value={s.axis} onChange={(e) => put({ axis: e.target.value })} className="w-full">
            {Object.entries(AXIS).map(([id, a]) => (
              <option key={id} value={id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Row>
        <p className="pb-2 pl-0.5 text-caption text-fg-3">{AXIS[s.axis].hint}</p>
        {s.axis === "across" && <SliderField id="sh-ang" label="Angle" value={s.angle} min={0} max={180} step={1} unit="°" set={(v) => put({ angle: v })} />}
        <SliderField id="sh-den" label="Density" value={s.density} min={0.25} max={4} step={0.05} set={(v) => put({ density: v })} hint="How many times the colours run over it" />
        {s.form !== "tiles" && (
          <Row label="On">
            <Segmented label="Which faces" value={s.faces} onChange={(v) => put({ faces: v })} options={[{ value: "all", label: "All" }, { value: "top", label: "Top" }, { value: "sides", label: "Sides" }]} full />
          </Row>
        )}
        {s.faces !== "all" && s.form !== "tiles" && <ColorField id="sh-base" label="Other faces" value={s.base} def={s.base} set={(v) => put({ base: v })} />}
        <SliderField id="sh-flow" label="Marbling" value={s.flow} min={0} max={1} step={0.01} set={(v) => put({ flow: v })} hint="0 straight bands, 1 marbled" />
        <SliderField id="sh-fspd" label="Flow speed" value={s.speed} min={0} max={1} step={0.01} set={(v) => put({ speed: v })} />
      </Section>
      <Section title="Material">
        <SliderField id="sh-glass" label="Glass" value={s.glass} min={0} max={1} step={0.01} set={(v) => put({ glass: v })} />
        <SliderField id="sh-glow" label="Glow" value={s.glow} min={0} max={1} step={0.01} set={(v) => put({ glow: v })} />
        <Row label="Light under">
          <Switch on={!!s.under} onChange={(on) => put({ under: on ? s.colors[s.colors.length - 1] : "" })} label="A light under the shapes" />
        </Row>
        {!!s.under && <ColorField id="sh-under" label="Its colour" value={s.under} def={s.under} set={(v) => put({ under: v })} />}
      </Section>
      <Section title="Motion">
        <Row label="Motion">
          <Select aria-label="Motion" value={s.motion} onChange={(e) => put({ motion: e.target.value })} className="w-full">
            {Object.entries(MOTION).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </Row>
        {s.motion === "turn" && <SliderField id="sh-spin" label="Turns" value={s.spin} min={0.05} max={3} step={0.05} set={(v) => put({ spin: v })} hint="Under 1 sways that share of a half turn; 1 and up turns whole times round the loop" />}
        {s.form !== "tiles" && <SliderField id="sh-tilt" label="Camera height" value={s.tilt} min={0} max={80} step={1} unit="°" set={(v) => put({ tilt: v })} />}
        <SliderField id="sh-dist2" label="Distance" value={s.dist} min={3} max={16} step={0.1} set={(v) => put({ dist: v })} />
        <SliderField id="sh-grain2" label="Grain" value={s.grain} min={0} max={0.2} step={0.005} set={(v) => put({ grain: v })} />
      </Section>
    </>
  )
}

function LiquidControls({ s, put }: { s: LiquidSpec; put: Put }) {
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState("")
  const upload = async (f: File) => {
    setErr("")
    try {
      // on the engine's server it's kept (an export needs it); in the browser alone it stays in the page
      const r = LOCAL ? await fetch("/__shader/logo", { method: "POST", headers: { "content-type": f.type }, body: f }).then((x) => x.json()) : null
      const src = r?.url ?? (await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(f) }))
      put({ logo: { type: "image", src } })
    } catch {
      setErr("That picture couldn't be read: try a PNG or SVG")
    }
  }
  const n = (k: keyof LiquidSpec, label: string, min: number, max: number, step: number, hint?: string) => <SliderField id={`sh-l-${k}`} label={label} value={s[k] as number} min={min} max={max} step={step} hint={hint} set={(v) => put({ [k]: v })} />
  return (
    <>
      <Section title="Logo">
        <Row label="Shape">
          <Segmented label="The logo" value={s.logo.type} onChange={(v) => put({ logo: v === "text" ? { type: "text", text: "S" } : v === "mark" ? { type: "mark", mark: "sparkle" } : s.logo })} options={[{ value: "text", label: "Word" }, { value: "mark", label: "Mark" }, { value: "image", label: "Picture" }]} full />
        </Row>
        {s.logo.type === "text" && (
          <Row label="Word">
            <input aria-label="Word" value={s.logo.text} maxLength={14} onChange={(e) => put({ logo: { type: "text", text: e.target.value } })} className={`${field} h-8 w-full px-2.5 text-body`} />
          </Row>
        )}
        {s.logo.type === "mark" && (
          <Row label="Mark">
            <Segmented label="Mark" value={s.logo.mark} onChange={(v) => put({ logo: { type: "mark", mark: v } })} options={MARKS.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} full />
          </Row>
        )}
        {(s.logo.type === "image" || s.logo.type === "mark" || s.logo.type === "text") && (
          <Row label="Your logo">
            <input ref={file} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button size="sm" onClick={() => file.current?.click()}>
              <UploadSimple size={14} aria-hidden /> {s.logo.type === "image" ? "Another picture" : "A picture"}
            </Button>
          </Row>
        )}
        {err && <p className="text-caption text-[var(--bad,#e5484d)]">{err}</p>}
        {n("size", "Size", 0.2, 1, 0.01, "Its height, as a share of the frame")}
      </Section>
      <Section title="Flow">
        {n("speed", "Speed", 0, 2, 0.01)}
        {n("iterations", "Detail", 1, 16, 1, "How many times the field folds over itself")}
        {n("scale", "Scale", 0.05, 4, 0.01)}
        {n("noise", "Turbulence", 0, 6, 0.05)}
        {n("vOffset", "Drift", 0, 8, 0.05)}
        {n("intensity", "Intensity", 0.01, 0.5, 0.005)}
        {n("exp", "Falloff", 0, 6, 0.05)}
        {n("dot", "Ring", 0, 1, 0.005)}
        {n("dotMul", "Ring strength", 0, 1, 0.01)}
      </Section>
      <Section title="Colour">
        {(["Red", "Green", "Blue"] as const).map((c, i) => (
          <SliderField key={c} id={`sh-rgb${i}`} label={c} value={s.rgb[i]} min={-2.5} max={2.5} step={0.05} set={(v) => put({ rgb: s.rgb.map((x, k) => (k === i ? v : x)) })} />
        ))}
        {n("shift", "Shift", 0, 2, 0.01)}
      </Section>
      <Section title="Edge">
        {n("edge", "Edge pull", 0, 1, 0.01, "How hard the flow bends at the outline")}
        {n("contour", "Contours", 0, 1.5, 0.01, "How far in the outline's shape carries the flow")}
        {n("rim", "Bevel", 0, 1, 0.01, "The edge rounded over, catching the light")}
        {n("grain", "Grain", 0, 0.2, 0.005)}
      </Section>
    </>
  )
}

function SceneControls({ s, put }: { s: SceneSpec; put: Put }) {
  return (
    <>
      <Section title="Scene">
        <Row label="Scene">
          <Select aria-label="Scene" value={s.scene} onChange={(e) => put({ scene: e.target.value })} className="w-full">
            <option value="showroom">Showroom</option>
            <option value="prism">Prism</option>
            <option value="candy">Candy</option>
          </Select>
        </Row>
        {s.scene !== "prism" && <Colors colors={s.colors} set={(c) => put({ colors: c })} min={s.scene === "showroom" ? 3 : 2} max={s.scene === "showroom" ? 3 : 6} />}
        <SliderField id="sh-sspd" label="Speed" value={s.speed} min={0.25} max={3} step={0.05} set={(v) => put({ speed: v })} />
        <SliderField id="sh-sgrain" label="Grain" value={s.grain} min={0} max={0.2} step={0.005} set={(v) => put({ grain: v })} />
      </Section>
    </>
  )
}

function Ground({ s, put, brand }: { s: ShaderSpec; put: Put; brand?: string }): ReactNode {
  const clear = !s.bg
  return (
    <>
      <Row label="Clear">
        <Switch on={clear} onChange={(on) => put({ bg: on ? "" : "#000000" })} label="A clear ground (exports ProRes 4444 with alpha)" />
      </Row>
      {!clear && <ColorField id="sh-bg" label="Ground" value={s.bg} def={s.bg} set={(v) => put({ bg: v })} />}
      {!clear && brand && (
        <Button size="sm" variant="ghost" onClick={() => put({ bg: brand })}>
          Your brand's colour
        </Button>
      )}
    </>
  )
}
