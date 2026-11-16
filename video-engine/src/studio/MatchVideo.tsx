// Studio — time a composition to a video you already have: a reference ad, a cut of your own, a track's video. The
// engine reads how long it runs and where it cuts (ffmpeg's scene detection, on the dev server), then either stretches
// every scene by the same amount so the film runs as long, or gives each scene the length of one shot, so the film
// cuts where the video cuts.
import { useEffect, useRef, useState } from "react"
import { FilmSlate, UploadSimple, WarningCircle, X } from "@phosphor-icons/react"
import { SliderField } from "../controls"
import { Button, Dialog, IconButton } from "../ui"
import { total, uid, type Comp } from "./comp"

type Read = { duration: number; cuts: number[] }

/** Every scene stretched or shrunk by the same amount, so the whole runs `d` seconds. */
export function matchLength(c: Comp, d: number): Comp {
  const k = d / Math.max(0.1, total(c))
  return { ...c, scenes: c.scenes.map((s) => ({ ...s, duration: Math.max(0.3, +(s.duration * k).toFixed(3)) })) }
}

/** Scene n lasts as long as shot n, and each starts on a cut. More shots than scenes: the last scene is repeated for
    the rest. Fewer: the scenes left over keep their lengths, after the video's end. */
export function matchCuts(c: Comp, d: number, cuts: number[]): Comp {
  const marks = [0, ...cuts.filter((t) => t > 0 && t < d), d]
  const shots = marks.slice(1).map((t, i) => t - marks[i])
  const scenes = [...c.scenes]
  while (scenes.length < shots.length) {
    const last = scenes[scenes.length - 1]
    scenes.push({ ...last, id: uid(), name: `${last.name.replace(/ \d+$/, "")} ${scenes.length + 1}`, layers: last.layers.map((l) => ({ ...l, id: uid() })) })
  }
  return { ...c, scenes: scenes.map((s, i) => (i < shots.length ? { ...s, duration: Math.max(0.3, +shots[i].toFixed(3)), transition: i === 0 ? s.transition : "cut" } : s)) }
}

const fmt = (t: number) => `${t.toFixed(t < 10 ? 2 : 1)} s`

export function MatchVideo({ open, onClose, comp, onApply }: { open: boolean; onClose: () => void; comp: Comp; onApply: (c: Comp, label: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState("")
  const [read, setRead] = useState<Read | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [how, setHow] = useState<"length" | "cuts">("cuts")
  const [sharp, setSharp] = useState(30)
  const [over, setOver] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  const ask = async (f: File, s: number) => {
    setBusy(true)
    setError("")
    try {
      // sharper: only big changes count as a cut
      const r = await fetch(`/__studio/cuts?t=${(0.12 + (s / 100) * 0.5).toFixed(3)}`, { method: "POST", headers: { "content-type": f.type || "application/octet-stream" }, body: f })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
      setRead(j)
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "The engine's server isn't answering. Run it with npm run dev." : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const take = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith("video/")) return setError("That isn't a video. Drop an MP4, MOV or WebM.")
    setFile(f)
    setSrc(URL.createObjectURL(f))
    setRead(null)
    void ask(f, sharp)
  }
  // a new sharpness reads the video again, once the slider rests
  useEffect(() => {
    if (!file) return
    const t = setTimeout(() => void ask(file, sharp), 450)
    return () => clearTimeout(t)
  }, [sharp]) // eslint-disable-line react-hooks/exhaustive-deps
  const shots = read ? [0, ...read.cuts, read.duration].slice(1).map((t, i, a) => t - (i ? a[i - 1] : 0)) : []
  const n = comp.scenes.length
  const result = !read ? "" : how === "length" ? `Every scene ${read.duration > total(comp) ? "stretches" : "shrinks"} by ${Math.round(Math.abs(read.duration / total(comp) - 1) * 100)}%, so the film runs ${fmt(read.duration)}.` : shots.length > n ? `${shots.length} shots for ${n} scene${n > 1 ? "s" : ""}: the last scene repeats for the other ${shots.length - n}.` : shots.length < n ? `${shots.length} shots: the first ${shots.length} scenes take their lengths, the other ${n - shots.length} keep theirs after the video ends.` : `One scene per shot, each starting on a cut.`
  return (
    <Dialog open={open} onClose={onClose} label="Match a video's timing" className="modal">
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between border-b py-3 pl-5 pr-3">
          <div>
            <h2 className="text-ui font-semibold">Match a video's timing</h2>
            <p className="text-caption text-fg-3">The film runs as long as the video, or cuts where it cuts.</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="scroll-thin min-h-0 space-y-3 overflow-y-auto p-4">
          {!src ? (
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                take(e.dataTransfer.files[0])
              }}
              className={`press flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center ${over ? "border-fg bg-surface-2" : "border-line-strong hover:bg-surface-2"}`}
            >
              <UploadSimple size={22} aria-hidden className="text-fg-2" />
              <span className="text-body font-medium">Drop a video, or choose one</span>
              <span className="text-caption text-fg-3">A reference ad, your own cut, a track's video: MP4, MOV, WebM</span>
              <input type="file" accept="video/*" className="sr-only" onChange={(e) => take(e.target.files?.[0])} />
            </label>
          ) : (
            <>
              <video ref={video} src={src} controls muted playsInline className="block w-full rounded-lg bg-black" />
              <div>
                <div className="flex items-baseline justify-between text-caption">
                  <span className="truncate font-medium text-fg-2">{file?.name}</span>
                  <span className="shrink-0 tabular-nums text-fg-3">{busy ? "Reading…" : read ? `${fmt(read.duration)} · ${read.cuts.length} cut${read.cuts.length === 1 ? "" : "s"}` : ""}</span>
                </div>
                {read && (
                  <div aria-label={`${shots.length} shots`} className="mt-1.5 flex h-6 gap-px overflow-hidden rounded-md">
                    {shots.map((d, i) => (
                      <button
                        key={i}
                        type="button"
                        title={`Shot ${i + 1}: ${fmt(d)}`}
                        onClick={() => {
                          if (video.current) video.current.currentTime = shots.slice(0, i).reduce((a, x) => a + x, 0) + 0.05
                        }}
                        className="press min-w-[3px] bg-surface-3 text-micro tabular-nums text-fg-3 hover:bg-fg hover:text-surface"
                        style={{ flexGrow: d, flexBasis: 0 }}
                      >
                        {d / read.duration > 0.06 ? i + 1 : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <SliderField id="mv-sharp" label="Only sharp cuts" unit="%" min={0} max={100} step={1} value={sharp} def={30} set={setSharp} hint="Higher: only a big change of picture counts as a cut." />
              <div role="radiogroup" aria-label="What to match" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["cuts", "Its cuts", "Each scene lasts one shot."],
                    ["length", "Its length", "Every scene by the same amount."],
                  ] as const
                ).map(([id, name, hint]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={how === id}
                    onClick={() => setHow(id)}
                    className={`press rounded-lg p-3 text-left ${how === id ? "bg-surface shadow-[0_0_0_1.5px_var(--fg)] dark:bg-surface-2" : "shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2"}`}
                  >
                    <span className="block text-body font-medium">{name}</span>
                    <span className="mt-0.5 block text-caption text-fg-3">{hint}</span>
                  </button>
                ))}
              </div>
              {result && <p className="text-caption text-fg-2">{result}</p>}
            </>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-caption text-fg-2">
              <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!read || busy}
            onClick={() => {
              if (!read) return
              onApply(how === "length" ? matchLength(comp, read.duration) : matchCuts(comp, read.duration, read.cuts), `Timed to ${file?.name ?? "the video"}`)
              onClose()
            }}
          >
            <FilmSlate size={14} aria-hidden />
            {how === "length" ? "Match its length" : "Match its cuts"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
