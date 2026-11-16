// Onion-skin compare: a reference film under one of the engine's films, at the same moment. Play or scrub and both move
// together; the film sits over the reference at a chosen opacity, or in difference (where they match it goes black,
// where they don't it lights up). How a replica is checked by eye: same moment, one over the other, never from memory.
import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "@phosphor-icons/react"
import { SliderField } from "../controls"
import { ANIMS, byId } from "../registry"
import { IconButton, Segmented, Select } from "../ui"

type Crop = { w: number; h: number; x: number; y: number }
const FILMS = ["", ...ANIMS.filter((a) => a.film).map((a) => a.id)]

export function Onion({ src, size, crop, film: initial = "" }: { src: string; /** the picture's own size */ size?: { w: number; h: number }; crop?: Crop; film?: string }) {
  const [film, setFilm] = useState(initial)
  const [t, setT] = useState(0)
  const [len, setLen] = useState(10)
  const [playing, setPlaying] = useState(false)
  const [mix, setMix] = useState(50)
  const [mode, setMode] = useState<"over" | "difference">("over")
  const [offset, setOffset] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const spec = byId(film)?.film
  const aspect = spec ? (spec.size === "1x1" ? 1 : spec.size === "9x16" ? 9 / 16 : 16 / 9) : crop ? crop.w / crop.h : size ? size.w / size.h : 16 / 9

  // the film follows the reference's clock: held at the same moment (its `?t=` hold), plus the offset
  const hold = (at: number) => {
    const w = frame.current?.contentWindow as (Window & { __hold?: (s: number) => void }) | null
    try {
      w?.__hold?.(Math.max(0.01, at + offset))
    } catch {
      // another origin: nothing to hold
    }
  }
  useEffect(() => {
    if (!playing) return
    let id = 0
    const tick = () => {
      const v = video.current
      if (v) {
        setT(v.currentTime)
        hold(v.currentTime)
      }
      id = requestAnimationFrame(tick)
    }
    void video.current?.play()
    id = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(id)
      video.current?.pause()
    }
  }, [playing, offset]) // eslint-disable-line react-hooks/exhaustive-deps
  const seek = (s: number) => {
    setT(s)
    if (video.current) video.current.currentTime = s
    hold(s)
  }

  // the bars or player chrome round the reference, cropped away: the video is drawn bigger and moved so only the box shows
  const crops = crop && size ? { width: `${(size.w / crop.w) * 100}%`, height: `${(size.h / crop.h) * 100}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%` } : { inset: 0, width: "100%", height: "100%" }
  return (
    <div className="space-y-2.5">
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: String(aspect) }}>
        <video ref={video} src={src} muted playsInline preload="auto" onLoadedMetadata={(e) => setLen(e.currentTarget.duration || 10)} onEnded={() => setPlaying(false)} className="absolute object-cover" style={crops} />
        {film && (
          <iframe
            ref={frame}
            key={film}
            title="The film, over the reference"
            src={`/stage.html?a=${film}&t=0.01&frame=onion`}
            onLoad={() => setTimeout(() => hold(t), 300)}
            className="pointer-events-none absolute inset-0 h-full w-full border-0"
            style={{ opacity: mode === "difference" ? 1 : mix / 100, mixBlendMode: mode === "difference" ? "difference" : "normal" }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <IconButton label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </IconButton>
        <input type="range" aria-label="Moment" min={0} max={len} step={0.01} value={t} onChange={(e) => seek(Number(e.target.value))} className="min-w-0 flex-1 accent-current" />
        <span className="mono w-14 text-right text-caption tabular-nums text-fg-3">{t.toFixed(2)} s</span>
      </div>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <Select aria-label="Film over it" value={film} onChange={(e) => setFilm(e.target.value)} className="h-8 w-full cursor-pointer px-2 text-body">
          {FILMS.map((id) => (
            <option key={id} value={id}>
              {id ? byId(id)?.name : "Just the reference"}
            </option>
          ))}
        </Select>
        <Segmented size="sm" label="How they're laid together" value={mode} onChange={setMode} options={[{ value: "over", label: "Over" }, { value: "difference", label: "Difference" }]} />
        {mode === "over" && <SliderField id="onion-mix" label="The film's opacity" unit="%" min={0} max={100} value={mix} def={50} set={setMix} />}
        <SliderField id="onion-offset" label="The film starts at" unit="s" min={-5} max={30} step={0.01} value={offset} def={0} set={setOffset} />
      </div>
    </div>
  )
}
