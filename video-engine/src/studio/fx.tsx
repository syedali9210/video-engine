// Studio — scene effects, the way a launch-video tool finishes a shot: depth of field (a band in focus, racking from one
// place to another while the scene plays), bloom (only the bright parts glow), a colour grade (exposure, contrast,
// saturation, warmth), colour split, a vignette and film grain. They're drawn over the finished frame as backdrop
// filters: the one kind of filter that reaches into the live screens (each runs on its own site, and a plain SVG filter
// never touches another site's pixels). So the stage and the export show the same picture.
import { forwardRef, useId, useImperativeHandle, useRef } from "react"
import { SliderField } from "../controls"
import { Switch } from "../ui"

export type Focus = {
  /** where the band in focus sits, 0 (top) to 1 (bottom) */
  at: number
  /** where it racks to over the scene, or null to hold */
  to: number | null
  /** how tall the band is, as a share of the frame */
  size: number
  /** how soft the rest goes, 0 to 1 */
  blur: number
  /** the band's tilt, degrees */
  angle: number
}
export type Grade = { exposure: number; contrast: number; saturation: number; warmth: number }
export type SceneFx = { focus?: Focus; bloom?: number; grade?: Grade; split?: number; vignette?: number; grain?: number }

/** Every effect as a number, at one moment: what the layer draws, and what two scenes blend between. */
export type FxNow = { focusAt: number; focusSize: number; blur: number; angle: number; bloom: number; exposure: number; contrast: number; saturation: number; warmth: number; split: number; vignette: number; grain: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

/** A scene's effects over the composition's: the scene's own win, a grade mixes key by key. */
export function fxFor(comp: SceneFx | undefined, scene: SceneFx | undefined): SceneFx {
  return { ...comp, ...scene, grade: comp?.grade || scene?.grade ? ({ ...comp?.grade, ...scene?.grade } as Grade) : undefined }
}

/** The effects `t` seconds into a `dur`-second scene: a rack focus pulls between 30% and 70% of it, easing in and out
    the way a focus puller turns the ring. */
export function fxNow(fx: SceneFx | undefined, t: number, dur: number): FxNow {
  const f = fx?.focus
  const k = f && f.to != null ? inOut(clamp((t / Math.max(0.1, dur) - 0.3) / 0.4)) : 0
  const g = fx?.grade
  return {
    focusAt: f ? f.at + ((f.to ?? f.at) - f.at) * k : 0.5,
    focusSize: f?.size ?? 1,
    blur: f?.blur ?? 0,
    angle: f?.angle ?? 0,
    bloom: fx?.bloom ?? 0,
    exposure: g?.exposure ?? 0,
    contrast: g?.contrast ?? 0,
    saturation: g?.saturation ?? 0,
    warmth: g?.warmth ?? 0,
    split: fx?.split ?? 0,
    vignette: fx?.vignette ?? 0,
    grain: fx?.grain ?? 0,
  }
}
export const mixFx = (a: FxNow, b: FxNow, k: number) => Object.fromEntries((Object.keys(a) as (keyof FxNow)[]).map((key) => [key, a[key] + (b[key] - a[key]) * k])) as FxNow
export const anyFx = (fx: SceneFx | undefined) => !!fx && !!((fx.focus && fx.focus.blur > 0) || fx.bloom || fx.split || fx.vignette || fx.grain || (fx.grade && Object.values(fx.grade).some(Boolean)))

/** A noise tile for the grain (the background effects' own). */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.6 -0.3"/></filter><rect width="220" height="220" filter="url(#n)"/></svg>')}")`

export type EffectsHandle = { set: (v: FxNow, t: number, W: number) => void }

/** The effects over the whole frame, set every frame by the view. */
export const EffectsLayer = forwardRef<EffectsHandle>(function EffectsLayer(_, ref) {
  const id = `fx${useId().replace(/[^a-z0-9]/gi, "")}`
  const root = useRef<HTMLDivElement>(null)
  // the SVG filters are swapped between two copies whenever their numbers change, so the backdrop is filtered again
  const flip = useRef(0)
  const said = useRef("")
  useImperativeHandle(ref, () => ({
    set(v, t, W) {
      const el = root.current
      if (!el || !W) return
      const q = <T extends Element>(s: string) => el.querySelector<T>(s)!
      // depth of field: three layers, each blurring more and further from the band
      for (let i = 0; i < 3; i++) {
        const d = q<HTMLDivElement>(`[data-dof="${i}"]`)
        if (v.blur <= 0.001) {
          d.style.display = "none"
          continue
        }
        d.style.display = ""
        d.style.backdropFilter = `blur(${((v.blur * W * 0.014 * (i + 1)) / 3).toFixed(2)}px)`
        const h = v.focusSize / 2 + i * 0.07
        const p = (x: number) => `${(x * 100).toFixed(2)}%`
        const m = `linear-gradient(${180 + v.angle}deg, #000 ${p(v.focusAt - h - 0.1)}, transparent ${p(v.focusAt - h)}, transparent ${p(v.focusAt + h)}, #000 ${p(v.focusAt + h + 0.1)})`
        d.style.maskImage = m
        d.style.webkitMaskImage = m
      }
      // bloom, grade and split, chained in one backdrop filter
      const grade = v.exposure || v.contrast || v.saturation || v.warmth
      const now = [v.bloom, v.exposure, v.contrast, v.saturation, v.warmth, v.split, W].map((x) => x.toFixed(3)).join("|")
      if (now !== said.current) {
        said.current = now
        flip.current ^= 1
        const f = flip.current
        const th = 0.74 - 0.3 * v.bloom
        const s = 1 / (1 - th)
        q(`#${id}-bloom${f} [data-th]`).setAttribute("values", `${s} 0 0 0 ${-th * s}  0 ${s} 0 0 ${-th * s}  0 0 ${s} 0 ${-th * s}  0 0 0 1 0`)
        q(`#${id}-bloom${f} [data-r]`).setAttribute("stdDeviation", String((W * 0.009 * (0.6 + v.bloom)).toFixed(2)))
        for (const fn of el.querySelectorAll(`#${id}-bloom${f} [data-k] > *`)) fn.setAttribute("slope", String(0.5 + 1.6 * v.bloom))
        q(`#${id}-grade${f} [data-sat]`).setAttribute("values", String(1 + v.saturation))
        const w = v.warmth
        q(`#${id}-grade${f} [data-warm]`).setAttribute("values", `${1 + 0.12 * w} 0 0 0 0  0 ${1 + 0.02 * w} 0 0 0  0 0 ${1 - 0.12 * w} 0 0  0 0 0 1 0`)
        const c = 1 + 0.6 * v.contrast
        const e = 2 ** (0.9 * v.exposure)
        for (const fn of el.querySelectorAll(`#${id}-grade${f} [data-con] > *`)) {
          fn.setAttribute("slope", String(c * e))
          fn.setAttribute("intercept", String(0.5 * (1 - c) * e))
        }
        const dx = (v.split * W * 0.004).toFixed(2)
        q(`#${id}-split${f} [data-r]`).setAttribute("dx", `-${dx}`)
        q(`#${id}-split${f} [data-b]`).setAttribute("dx", dx)
        const list = [v.bloom > 0.001 && `url(#${id}-bloom${f})`, grade && `url(#${id}-grade${f})`, v.split > 0.001 && `url(#${id}-split${f})`].filter(Boolean)
        const post = q<HTMLDivElement>("[data-post]")
        post.style.display = list.length ? "" : "none"
        post.style.backdropFilter = list.join(" ")
      }
      const vig = q<HTMLDivElement>("[data-vig]")
      vig.style.display = v.vignette > 0.001 ? "" : "none"
      vig.style.background = `radial-gradient(ellipse 72% 68% at 50% 50%, transparent ${(1 - v.vignette) * 45 + 25}%, rgba(0,0,0,${(0.2 + 0.7 * v.vignette).toFixed(3)}) 100%)`
      // grain moves at 24 frames a second, like film, and the same frame always gets the same grain
      const grain = q<HTMLDivElement>("[data-grain]")
      grain.style.display = v.grain > 0.001 ? "" : "none"
      const n = Math.floor(t * 24)
      grain.style.opacity = String((0.12 + 0.5 * v.grain).toFixed(3))
      grain.style.backgroundPosition = `${(n * 73) % 220}px ${(n * 151) % 220}px`
    },
  }))
  const bloom = (f: number) => (
    <filter key={`b${f}`} id={`${id}-bloom${f}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix data-th="" in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="hi" />
      <feGaussianBlur data-r="" in="hi" stdDeviation="10" result="soft" />
      <feComponentTransfer data-k="" in="soft" result="glow">
        <feFuncR type="linear" slope="1" />
        <feFuncG type="linear" slope="1" />
        <feFuncB type="linear" slope="1" />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="glow" mode="screen" />
    </filter>
  )
  const grade = (f: number) => (
    <filter key={`g${f}`} id={`${id}-grade${f}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix data-sat="" type="saturate" values="1" />
      <feColorMatrix data-warm="" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
      <feComponentTransfer data-con="">
        <feFuncR type="linear" slope="1" intercept="0" />
        <feFuncG type="linear" slope="1" intercept="0" />
        <feFuncB type="linear" slope="1" intercept="0" />
      </feComponentTransfer>
    </filter>
  )
  const split = (f: number) => (
    <filter key={`s${f}`} id={`${id}-split${f}`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset data-r="" in="r" dx="-4" result="r2" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
      <feOffset data-b="" in="b" dx="4" result="b2" />
      <feBlend in="r2" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b2" mode="screen" />
    </filter>
  )
  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 60 }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>{[0, 1].flatMap((f) => [bloom(f), grade(f), split(f)])}</defs>
      </svg>
      {[0, 1, 2].map((i) => (
        <div key={i} data-dof={i} className="absolute inset-0" style={{ display: "none" }} />
      ))}
      <div data-post="" className="absolute inset-0" style={{ display: "none" }} />
      <div data-vig="" className="absolute inset-0" style={{ display: "none" }} />
      <div data-grain="" className="absolute inset-0" style={{ display: "none", backgroundImage: GRAIN, backgroundSize: "220px 220px", mixBlendMode: "overlay" }} />
    </div>
  )
})

/* ---------------- presets ---------------- */

export const FX_PRESETS: { id: string; name: string; hint: string; fx: SceneFx }[] = [
  { id: "clean", name: "Clean", hint: "No effects.", fx: {} },
  { id: "cinematic", name: "Cinematic", hint: "A touch of bloom, a vignette, fine grain and a warm, contrasty grade.", fx: { bloom: 0.25, vignette: 0.35, grain: 0.12, grade: { exposure: 0, contrast: 0.15, saturation: -0.05, warmth: 0.15 } } },
  { id: "macro", name: "Macro", hint: "A shallow band in focus that racks down the frame: the close-up of a product film.", fx: { focus: { at: 0.32, to: 0.62, size: 0.26, blur: 0.65, angle: -8 }, bloom: 0.2, vignette: 0.25 } },
  { id: "dreamy", name: "Dreamy", hint: "A soft glow everywhere, lifted and a little cool.", fx: { bloom: 0.6, grade: { exposure: 0.1, contrast: -0.15, saturation: 0.05, warmth: -0.1 }, vignette: 0.15 } },
  { id: "retro", name: "Retro", hint: "Warm, grainy and split at the edges.", fx: { grain: 0.45, split: 0.35, vignette: 0.4, grade: { exposure: 0, contrast: -0.1, saturation: -0.15, warmth: 0.35 } } },
  { id: "noir", name: "Noir", hint: "Black and white, hard contrast.", fx: { grade: { exposure: -0.05, contrast: 0.45, saturation: -1, warmth: 0 }, vignette: 0.5, grain: 0.25 } },
]

/* ---------------- the controls ---------------- */

const DEF_FOCUS: Focus = { at: 0.45, to: null, size: 0.3, blur: 0.55, angle: 0 }
const DEF_GRADE: Grade = { exposure: 0, contrast: 0, saturation: 0, warmth: 0 }

/** Every effect's control, for a scene's own or the composition's. */
export function FxFields({ fx, set, idp }: { fx: SceneFx; set: (fx: SceneFx) => void; idp: string }) {
  const f = fx.focus
  const g = fx.grade ?? DEF_GRADE
  const pc = (x: number) => Math.round(x * 100)
  const setF = (patch: Partial<Focus>) => set({ ...fx, focus: { ...(f ?? DEF_FOCUS), ...patch } })
  const setG = (patch: Partial<Grade>) => {
    const next = { ...g, ...patch }
    set({ ...fx, grade: Object.values(next).some(Boolean) ? next : undefined })
  }
  const on = (k: string, v: number) => set({ ...fx, [k]: v || undefined })
  const preset = FX_PRESETS.find((p) => JSON.stringify(p.fx) === JSON.stringify(Object.fromEntries(Object.entries(fx).filter(([, v]) => v !== undefined))))
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Effect presets" className="flex flex-wrap gap-1.5">
        {FX_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset?.id === p.id}
            title={p.hint}
            onClick={() => set(structuredClone(p.fx))}
            className={`press h-7 rounded-full px-2.5 text-caption font-medium ${preset?.id === p.id ? "bg-fg text-surface" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg"}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
          <label htmlFor={`${idp}-dof`} className="text-body text-fg-2">
            Depth of field
          </label>
          <Switch id={`${idp}-dof`} on={!!f && f.blur > 0} onChange={(v) => set({ ...fx, focus: v ? { ...DEF_FOCUS, ...f, blur: f?.blur || DEF_FOCUS.blur } : undefined })} />
        </div>
        {f && f.blur > 0 && (
          <>
            <SliderField id={`${idp}-fat`} label="In focus at" unit="%" min={0} max={100} step={1} value={pc(f.at)} def={45} set={(v) => setF({ at: v / 100 })} hint="Down the frame: where the sharp band sits." />
            <SliderField id={`${idp}-fsz`} label="Sharp band" unit="%" min={4} max={90} step={1} value={pc(f.size)} def={30} set={(v) => setF({ size: v / 100 })} />
            <SliderField id={`${idp}-fbl`} label="Softness" unit="%" min={5} max={100} step={1} value={pc(f.blur)} def={55} set={(v) => setF({ blur: v / 100 })} />
            <SliderField id={`${idp}-fan`} label="Tilt" unit="°" min={-45} max={45} step={1} value={Math.round(f.angle)} def={0} set={(v) => setF({ angle: v })} />
            <div className="flex min-h-8 items-center justify-between gap-3 pl-2.5">
              <label htmlFor={`${idp}-rack`} className="text-body text-fg-2">
                Rack focus
              </label>
              <Switch id={`${idp}-rack`} on={f.to != null} onChange={(v) => setF({ to: v ? clamp(f.at + 0.3, 0, 1) : null })} />
            </div>
            {f.to != null && <SliderField id={`${idp}-fto`} label="Racks to" unit="%" min={0} max={100} step={1} value={pc(f.to)} def={75} set={(v) => setF({ to: v / 100 })} hint="The focus pulls here, through the middle of the scene." />}
          </>
        )}
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <SliderField id={`${idp}-bloom`} label="Bloom" unit="%" min={0} max={100} step={1} value={pc(fx.bloom ?? 0)} def={0} set={(v) => on("bloom", v / 100)} hint="Only the bright parts glow." />
        <SliderField id={`${idp}-vig`} label="Vignette" unit="%" min={0} max={100} step={1} value={pc(fx.vignette ?? 0)} def={0} set={(v) => on("vignette", v / 100)} />
        <SliderField id={`${idp}-grain`} label="Film grain" unit="%" min={0} max={100} step={1} value={pc(fx.grain ?? 0)} def={0} set={(v) => on("grain", v / 100)} />
        <SliderField id={`${idp}-split`} label="Colour split" unit="%" min={0} max={100} step={1} value={pc(fx.split ?? 0)} def={0} set={(v) => on("split", v / 100)} />
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-caption font-medium text-fg-3">Grade</p>
        <SliderField id={`${idp}-exp`} label="Exposure" unit="" min={-100} max={100} step={1} value={pc(g.exposure)} def={0} set={(v) => setG({ exposure: v / 100 })} />
        <SliderField id={`${idp}-con`} label="Contrast" unit="" min={-100} max={100} step={1} value={pc(g.contrast)} def={0} set={(v) => setG({ contrast: v / 100 })} />
        <SliderField id={`${idp}-sat`} label="Saturation" unit="" min={-100} max={100} step={1} value={pc(g.saturation)} def={0} set={(v) => setG({ saturation: v / 100 })} />
        <SliderField id={`${idp}-warm`} label="Warmth" unit="" min={-100} max={100} step={1} value={pc(g.warmth)} def={0} set={(v) => setG({ warmth: v / 100 })} />
      </div>
    </div>
  )
}
