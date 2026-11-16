// A film's review link (server/reviews.ts): the film, and notes on it, each at a moment and a spot on the frame. Click
// the frame to pause there and leave one; click a note to go back to it. Others' notes come in as they're left.
//   review.html#<review id>
import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { ChatCircle, Check, LinkBreak, Pause, Play } from "@phosphor-icons/react"
import { Empty, Problem, Skeleton } from "./States"
import "./engine.css"

type Comment = { id: string; t: number; x: number; y: number; text: string; by: string; at: string; done?: boolean }
type Review = { id: string; name: string; at: string; comments: Comment[] }

const id = location.hash.slice(1)
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${Math.floor((t % 1) * 10)}`
const stored = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ""
  } catch {
    return ""
  }
}
async function call(path: string, body?: object): Promise<Review> {
  const r = await fetch(`/__review/${id}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as Review
}

function ReviewPage() {
  const video = useRef<HTMLVideoElement>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState("")
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [draft, setDraft] = useState<{ t: number; x: number; y: number } | null>(null)
  const [text, setText] = useState("")
  const [by, setBy] = useState(() => stored("anim-engine:reviewer"))
  const [sel, setSel] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  const [tries, setTries] = useState(0)

  // the notes, and whatever others leave, every few seconds
  useEffect(() => {
    if (!id) return
    const get = () => void call("").then((r) => (setReview(r), setError("")), (e: Error) => setError(e.message))
    get()
    const i = setInterval(get, 5000)
    return () => clearInterval(i)
  }, [tries])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).closest("input, textarea, button")) return
      e.preventDefault()
      toggle()
    }
    addEventListener("keydown", key)
    return () => removeEventListener("keydown", key)
  })

  const v = () => video.current!
  const toggle = () => (v().paused ? void v().play() : v().pause())
  const seek = (to: number) => {
    v().pause()
    v().currentTime = to
    setT(to)
  }
  const pin = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    v().pause()
    setSel(null)
    setDraft({ t: v().currentTime, x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height })
  }
  const send = async () => {
    if (!text.trim()) return
    const at = draft ?? { t: v().currentTime, x: 0.5, y: 0.5 }
    try {
      localStorage.setItem("anim-engine:reviewer", by)
    } catch {
      // a private window: the name just isn't remembered
    }
    try {
      setReview(await call("/comment", { ...at, text, by }))
      setText("")
      setDraft(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const center = (body: React.ReactNode) => <main className="grid min-h-dvh place-items-center p-6">{body}</main>
  if (!id) return center(<Empty icon={LinkBreak} title="This link is missing its review" sub="A review link ends in # and the review's id. Ask whoever shared it for the whole link." />)
  if (error && !review)
    return center(/no review/i.test(error) ? <Empty icon={ChatCircle} title="This review isn't here" sub="It may have been taken down, or the link was cut short. Ask whoever shared it for a new one." /> : <Problem error={error} onRetry={() => (setError(""), setTries((t) => t + 1))} />)
  if (!review)
    return (
      <main className="mx-auto grid min-h-dvh max-w-[1400px] gap-6 p-4 md:grid-cols-[1fr_340px] md:p-8">
        <div>
          <Skeleton className="mb-3 h-5 w-48" />
          <Skeleton className="aspect-video w-full !rounded-xl" />
        </div>
        <div className="space-y-3 md:pt-9">
          <Skeleton className="h-32 !rounded-xl" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </main>
    )
  const notes = [...review.comments].sort((a, b) => a.t - b.t)
  // the notes left at this moment show where they were left
  const here = notes.filter((c) => c.id === sel || (!c.done && Math.abs(c.t - t) < 0.4))
  return (
    <main className="mx-auto grid min-h-dvh max-w-[1400px] gap-6 p-4 md:grid-cols-[1fr_340px] md:p-8">
      <section className="min-w-0">
        <h1 className="pb-3 text-[15px] font-semibold text-fg">{review.name}</h1>
        {/* the frame hugs the film, whole on screen whatever its shape, so a spot clicked is a spot on the film */}
        <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_var(--line)]">
          <video ref={video} src={`/__review/${id}/film`} playsInline preload="auto" className="block max-h-[calc(100dvh-8.5rem)] max-w-full" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onPlay={() => (setPlaying(true), setDraft(null))} onPause={() => setPlaying(false)} onError={() => setBroken(true)} />
          {broken && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white">
              <p className="max-w-[36ch] text-body">The film itself couldn't load. Its notes are still here; ask whoever shared it to export and share it again.</p>
            </div>
          )}
          <div role="button" tabIndex={-1} aria-label="Leave a note here" onClick={pin} className="absolute inset-0 cursor-crosshair" />
          {[...here.map((c) => ({ key: c.id, x: c.x, y: c.y, on: c.id === sel })), ...(draft ? [{ key: "draft", x: draft.x, y: draft.y, on: true }] : [])].map((p) => (
            <span key={p.key} aria-hidden className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${p.on ? "bg-sel" : "bg-sel/60"} shadow-[0_0_0_4px_rgb(0_0_0/0.25)]`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="press grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg hover:bg-surface-2">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="relative flex-1">
            <input type="range" aria-label="Time" min={0} max={dur || 1} step={0.01} value={t} onChange={(e) => seek(+e.target.value)} className="block w-full accent-[var(--sel)]" />
            {dur > 0 &&
              notes.map((c) => (
                <button key={c.id} type="button" title={`${clock(c.t)} · ${c.text}`} aria-label={`Go to the note at ${clock(c.t)}`} onClick={() => (seek(c.t), setSel(c.id))} className={`absolute -top-2.5 h-2 w-2 -translate-x-1/2 rounded-full ${c.done ? "bg-fg-3" : "bg-sel"}`} style={{ left: `${(c.t / dur) * 100}%` }} />
              ))}
          </div>
          <span className="shrink-0 font-mono text-caption tabular-nums text-fg-2">
            {clock(t)} / {clock(dur)}
          </span>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col md:pt-9">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="space-y-2 rounded-xl p-3 shadow-[0_0_0_1px_var(--line)]"
        >
          <p className="text-caption text-fg-3">{draft ? `A note at ${clock(draft.t)}, on the spot you clicked` : "Click the film to note a spot, or write about this moment"}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What should change?" aria-label="Your note" className="block w-full resize-none rounded-md bg-surface-2 px-2.5 py-2 text-body text-fg outline-none placeholder:text-fg-3 focus:shadow-[0_0_0_1px_var(--sel)]" />
          <div className="flex gap-2">
            <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Your name" aria-label="Your name" className="h-8 min-w-0 flex-1 rounded-md bg-surface-2 px-2.5 text-body text-fg outline-none placeholder:text-fg-3 focus:shadow-[0_0_0_1px_var(--sel)]" />
            <button type="submit" disabled={!text.trim()} className="press h-8 rounded-md bg-fg px-3 text-body font-medium text-surface disabled:opacity-40">
              Leave it
            </button>
          </div>
        </form>
        <ol className="mt-4 space-y-1 overflow-y-auto">
          {notes.map((c) => (
            <li key={c.id} className={`group flex gap-2.5 rounded-lg p-2.5 ${c.id === sel ? "bg-surface-2" : "hover:bg-surface-2"} ${c.done ? "opacity-55" : ""}`}>
              <button type="button" onClick={() => (seek(c.t), setSel(c.id))} className="min-w-0 flex-1 text-left">
                <span className="flex items-baseline gap-2 text-caption">
                  <span className="font-mono tabular-nums text-sel-ink">{clock(c.t)}</span>
                  <span className="truncate text-fg-3">{c.by}</span>
                </span>
                <span className={`mt-0.5 block whitespace-pre-wrap text-body text-fg ${c.done ? "line-through" : ""}`}>{c.text}</span>
              </button>
              <button type="button" aria-pressed={!!c.done} aria-label={c.done ? "Open it again" : "Mark it done"} title={c.done ? "Open it again" : "Mark it done"} onClick={() => void call("/resolve", { comment: c.id, done: !c.done }).then(setReview, (e: Error) => setError(e.message))} className={`press grid h-7 w-7 shrink-0 place-items-center rounded-md ${c.done ? "text-good-ink" : "text-fg-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}>
                <Check size={15} />
              </button>
            </li>
          ))}
          {!notes.length && <li className="p-2.5 text-caption text-fg-3">No notes yet.</li>}
        </ol>
        {error && <p role="alert" className="mt-2 text-caption text-bad-ink">{error}</p>}
      </aside>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<ReviewPage />)
