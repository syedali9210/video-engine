// The lab's New films: the Artist makes a batch of films for the product that's open (a different kind of film and art
// direction each, the ones your taste leans to first), each plays as it will render, and you keep it or pass on it.
// Either way it asks why (what works, what doesn't, your words): a kept film joins the gallery, and the reasons teach
// the taste the next batch is directed by (taste.ts), so the films get closer to what you keep. The pieces (the
// player, the verdict, the rows while the Artist works) are shared with the review sheet (ReviewSheet.tsx).
import { Problem } from "../States"
import { Pills } from "../shell"
import { burstAt, Snooze, useWaitLine } from "../fun"
import { ScriptPoster } from "../FilmPoster"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowsClockwise, CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, Dialog, IconButton } from "../ui"
import { CATEGORIES } from "../refs"
import { Glyph, GLYPHS, Thinking } from "../Thinking"
import { DIRECTIONS } from "./artist"
import { StoryStrip } from "./ArtistDialog"
import { analyze } from "./concepts"
import { Score } from "./IdeasLab"
import { REVIEW_TAGS } from "./Review"
import { SAMPLE_COPY } from "./comp"
import type { TemplateScript } from "./script"
import type { Copy } from "./copy"
import type { Taste } from "./taste"

/** What the app gives the lab to make films with: the product's name, a batch from the Artist, a film as a playable link. */
export type LabFilms = {
  product: string
  copy?: Copy
  make: (n: number) => Promise<TemplateScript[]>
  link: (s: TemplateScript) => Promise<string>
  /** a film run through the gates and the critic, with the product kit in it: a score out of 100 and what it found */
  check?: (s: TemplateScript) => Promise<{ score: number; gates: { name: string; pass: boolean; findings: number }[]; critic?: { score: number; verdict: string } }>
}
export type Screened = { id: string; created: string; script: TemplateScript; status: "waiting" | "kept" | "passed"; decided?: string; praise?: string[]; improve?: string[]; why?: string }

export async function call<T>(path: string, body?: object): Promise<T> {
  const r = await fetch(`/__lab/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}

export const seconds = (s: TemplateScript) => s.shots.reduce((a, x) => a + x.dur, 0)
export const kindOf = (s: TemplateScript) => CATEGORIES.film.find((c) => c.id === (s.artist?.story ?? s.category))?.name ?? "Film"
export const styleOf = (s: TemplateScript) => DIRECTIONS.find((d) => d.id === s.artist?.style)?.name ?? s.artist?.style ?? ""
export const copyOf = (films?: LabFilms): Copy => films?.copy ?? { ...SAMPLE_COPY, name: films?.product ?? SAMPLE_COPY.name }

/** A batch being made: one row per film, each with its own glyph, saying what the Artist is doing. */
export function Making({ n = 4 }: { n?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <MakingRow key={i} i={i} n={n} />
      ))}
    </ul>
  )
}
function MakingRow({ i, n }: { i: number; n: number }) {
  // each film's line moves on every couple of seconds, a little wit while it waits
  const line = useWaitLine(true, i * 2)
  return (
    <li className="rise-in rounded-xl bg-surface-2 p-3" style={{ animationDelay: `${i * 70}ms` }}>
      <Thinking variant={GLYPHS[i % GLYPHS.length]} label={line} sub={`Film ${i + 1} of ${n}`} />
    </li>
  )
}

/** The film playing as it will render (the web player), at its own shape. */
export function FilmPlayer({ films, f, className = "", tall = 420 }: { films?: LabFilms; f: Screened; className?: string; /** a portrait film's height */ tall?: number | string }) {
  const [src, setSrc] = useState("")
  const [failed, setFailed] = useState("")
  useEffect(() => {
    let on = true
    setSrc("")
    setFailed("")
    films?.link(f.script).then(
      (u) => on && setSrc(u),
      (e) => on && setFailed((e as Error).message || "It couldn't be drawn"),
    )
    return () => {
      on = false
    }
  }, [f.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [w, h] = (f.script.size ?? "16x9").split("x").map(Number)
  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#0b0b0d] shadow-[0_0_0_1px_var(--line)] ${className}`} style={{ aspectRatio: `${w} / ${h}`, ...(w < h ? { height: tall, width: "auto", marginInline: "auto" } : {}) }}>
      {src ? (
        <iframe src={src} title={`${f.script.name}, playing`} className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-white">
          {failed ? <span className="px-4 text-center text-caption text-white/60">{failed}</span> : <Thinking variant="scan" label="Drawing it as it will render…" className="[&_.shimmer]:[--fg:#fff] [&_.shimmer]:[--fg-3:rgb(255_255_255/0.45)] [&_.think]:text-white" />}
        </div>
      )}
    </div>
  )
}

/** Keep it or pass, and either way why: what works, what doesn't, in your words. No verdict without a reason. */
export function VerdictForm({ f, onDecided }: { f: Screened; onDecided: (l: Screened[]) => void }) {
  const [verdict, setVerdict] = useState<"keep" | "pass" | null>(null)
  const [praise, setPraise] = useState<string[]>([])
  const [improve, setImprove] = useState<string[]>([])
  const [why, setWhy] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const ready = praise.length + improve.length > 0 || why.trim().length >= 3
  const saveRef = useRef<HTMLSpanElement>(null)
  const save = async () => {
    if (!verdict || !ready) return
    setSaving(true)
    setError("")
    try {
      const r = await call<{ films: Screened[] }>(`screening/${f.id}/${verdict}`, { praise, improve, why })
      // a film kept is a small win
      if (verdict === "keep") burstAt(saveRef.current, { count: 40 })
      onDecided(r.films)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const tags = (value: string[], set: (fn: (v: string[]) => string[]) => void, label: string) => (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {REVIEW_TAGS.map((t) => {
        const on = value.includes(t)
        return (
          <button key={t} type="button" aria-pressed={on} onClick={() => set((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))} className={`press h-7 rounded-full px-3 text-caption font-medium transition-colors duration-150 ${on ? "bg-fg text-surface" : "bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg"}`}>
            {t}
          </button>
        )
      })}
    </div>
  )
  if (f.status !== "waiting")
    return (
      <div className="rounded-xl bg-surface-2 p-3.5 text-body">
        <p className="font-medium">{f.status === "kept" ? "Kept: it's in the gallery." : "Passed on."}</p>
        {(f.praise?.length || f.improve?.length) && (
          <p className="mt-1 text-caption text-fg-3">
            {f.praise?.length ? `Works: ${f.praise.join(", ")}` : ""}
            {f.praise?.length && f.improve?.length ? " · " : ""}
            {f.improve?.length ? `Better: ${f.improve.join(", ")}` : ""}
          </p>
        )}
        {f.why && <p className="mt-1.5 text-fg-2">“{f.why}”</p>}
      </div>
    )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant={verdict === "pass" ? "primary" : "secondary"} onClick={() => setVerdict("pass")}>
          <X size={16} aria-hidden /> Pass
        </Button>
        <Button size="lg" variant={verdict === "keep" ? "primary" : "secondary"} onClick={() => setVerdict("keep")}>
          <Check size={16} aria-hidden /> Keep it
        </Button>
      </div>
      {verdict && (
        <div className="fade-in space-y-4">
          <div>
            <p className="mb-2 text-caption font-medium text-fg-2">{verdict === "keep" ? "Why keep it? What works" : "What works, still"}</p>
            {tags(praise, setPraise, "What works")}
          </div>
          <div>
            <p className="mb-2 text-caption font-medium text-fg-2">{verdict === "pass" ? "Why pass? What doesn't work" : "What could still be better"}</p>
            {tags(improve, setImprove, "What could be better")}
          </div>
          <textarea
            rows={3}
            aria-label="In your words"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder={verdict === "keep" ? "In your words: the hook lands, the gradients feel premium…" : "In your words: too much text in the middle, the cuts feel abrupt…"}
            className={`${field} block w-full resize-none px-3 py-2.5 text-body`}
          />
          {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
          <div className="flex items-center justify-end gap-3">
            {!ready && <span className="text-caption text-fg-3">Tap a reason or write a few words</span>}
            <span ref={saveRef}>
              <Button variant="primary" onClick={() => void save()} disabled={!ready || saving}>
                {verdict === "keep" ? "Keep it" : "Pass on it"}
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Makes a batch and stores it for screening. */
export async function makeBatch(films: LabFilms, n = 4) {
  const made = await films.make(n)
  return (await call<{ films: Screened[] }>("screening", { films: made })).films
}

/* ---------------- the Lab page's section ---------------- */

type Shelf = "waiting" | "kept" | "passed"

/** New films, the Lab's page: what the Artist made, as posters, by where they stand (to review, kept, passed). A film
    opens in a review of its own: playing big, its verdict beside it, the next one after you decide. */
export function NewFilms({ films, taste, gallery, onPreview, onChanged }: { films?: LabFilms; taste?: Taste; gallery: TemplateScript[]; onPreview: (s: TemplateScript) => void; onChanged: () => void }) {
  const [list, setList] = useState<Screened[] | null>(null)
  const [shelf, setShelf] = useState<Shelf>("waiting")
  const [openId, setOpen] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    void call<Screened[]>("screening").then(setList, (e) => (setList([]), setError((e as Error).message)))
  }, [])
  const all = list ?? []
  const count = (s: Shelf) => all.filter((f) => f.status === s).length
  const shown = all.filter((f) => f.status === shelf)
  const learned = useLearned(taste)
  const make = async () => {
    if (!films) return
    setMaking(true)
    setError("")
    setShelf("waiting")
    try {
      setList(await makeBatch(films))
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMaking(false)
    }
  }
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      <PageHead
        title="New films"
        sub={
          <>
            The Artist makes films for <span className="text-fg-2">{films?.product ?? "your product"}</span>. Keep or pass on each and say why: the next batch follows what you said.
          </>
        }
        action={
          <button type="button" onClick={() => void make()} disabled={!films || making} className="press btn btn-ink flex h-9 items-center gap-2 rounded-lg px-3.5 text-[14px] font-medium disabled:opacity-60">
            {making ? <Glyph variant="globe" size={15} /> : <ArrowsClockwise size={15} aria-hidden />}
            {making ? "Making…" : "Make 4 films"}
          </button>
        }
      >
        {learned && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-fg-3">
            <span className="h-1.5 w-1.5 rounded-full bg-sel" aria-hidden />
            {learned}
          </p>
        )}
      </PageHead>

      <Underline
        value={shelf}
        onChange={setShelf}
        options={[
          { value: "waiting", label: "To review", count: count("waiting") },
          { value: "kept", label: "Kept", count: count("kept") },
          { value: "passed", label: "Passed", count: count("passed") },
        ]}
      />

      <div className="px-8 pb-16 pt-7">
        {error && <Problem compact error={error} className="mb-5 rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
        {list === null ? (
          <Grid>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className="block aspect-video animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
                <span className="mt-3 block h-3.5 w-2/3 rounded bg-surface-2" />
              </li>
            ))}
          </Grid>
        ) : (
          <Grid>
            {making && shelf === "waiting" && [0, 1, 2, 3].map((i) => <MakingCard key={`m${i}`} i={i} />)}
            {shown.map((f, i) => (
              <li key={f.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <button type="button" onClick={() => setOpen(f.id)} className="card group block w-full text-left">
                  <span className="card-shot">
                    <ScriptPoster bare script={f.script} product={films?.product ?? "Product"} />
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">{seconds(f.script).toFixed(0)} s</span>
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{f.script.name}</span>
                    {f.status !== "waiting" && <Status status={f.status} />}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-fg-3">
                    {kindOf(f.script)} · {styleOf(f.script)} · {f.script.shots.length} shots
                  </span>
                </button>
              </li>
            ))}
          </Grid>
        )}
        {list !== null && !shown.length && !(making && shelf === "waiting") && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <Snooze title={shelf === "waiting" ? "Nothing to review" : shelf === "kept" ? "Nothing kept yet" : "Nothing passed on"} sub={shelf === "waiting" ? "Four films, each a different kind of film and art direction, made for your product." : "Films you decide on land here, with what you said."} />
            {shelf === "waiting" && (
              <button type="button" onClick={() => void make()} disabled={!films || making} className="press btn btn-2 -mt-4 h-9 rounded-lg px-4 text-[14px] font-medium">
                Make 4 films
              </button>
            )}
          </div>
        )}
      </div>

      <ReviewDialog
        id={openId}
        list={all}
        shelf={shelf}
        films={films}
        taste={taste}
        gallery={gallery}
        onClose={() => setOpen(null)}
        onOpen={setOpen}
        onPreview={onPreview}
        onDecided={(next) => {
          setList(next)
          onChanged()
        }}
      />
    </div>
  )
}

const Grid = ({ children }: { children: React.ReactNode }) => <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-5 gap-y-8">{children}</ul>

function Status({ status }: { status: "kept" | "passed" }) {
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-[12px] font-medium ${status === "kept" ? "text-good-ink" : "text-fg-3"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "kept" ? "bg-good" : "bg-fg-3"}`} aria-hidden />
      {status === "kept" ? "Kept" : "Passed"}
    </span>
  )
}

/** A film being made: a card where the poster will be, the Artist's glyph and a line that moves on. */
function MakingCard({ i }: { i: number }) {
  const line = useWaitLine(true, i * 2)
  return (
    <li className="rise-in" style={{ animationDelay: `${i * 60}ms` }}>
      <span className="grid aspect-video place-items-center rounded-xl bg-surface-2 shadow-[0_0_0_1px_var(--line)]">
        <Glyph variant={GLYPHS[i % GLYPHS.length]} size={26} />
      </span>
      <span className="shimmer mt-3 block truncate text-[14px] font-medium">{line}</span>
      <span className="mt-0.5 block text-[13px] text-fg-3">Film {i + 1} of 4</span>
    </li>
  )
}

/** A page's head, Vercel's: the title, one or two lines of what it's for, and its one action. */
export function PageHead({ title, sub, action, children }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="px-8 pb-6 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[640px]">
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.025em]">{title}</h1>
          {sub && <p className="mt-1.5 text-[14px] leading-[21px] text-fg-3">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/** The shelves, as the app's one category control (words in a row, a line gliding under the pick). */
export function Underline<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="px-8 pt-2">
      <Pills label="Shelves" value={value} onChange={onChange} options={options} />
    </div>
  )
}

/** One film, reviewed: it plays big on the left, its verdict on the right; ← and → step through the shelf, and after a
    verdict the next film still waiting opens. */
function ReviewDialog({ id, list, shelf, films, taste, gallery, onClose, onOpen, onPreview, onDecided }: { id: string | null; list: Screened[]; shelf: Shelf; films?: LabFilms; taste?: Taste; gallery: TemplateScript[]; onClose: () => void; onOpen: (id: string) => void; onPreview: (s: TemplateScript) => void; onDecided: (l: Screened[]) => void }) {
  const f = list.find((x) => x.id === id)
  const row = list.filter((x) => x.status === shelf)
  const at = f ? row.findIndex((x) => x.id === f.id) : -1
  const step = (by: number) => {
    const n = row[at + by]
    if (n) onOpen(n.id)
  }
  useEffect(() => {
    if (!f) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea")) return
      if (e.key === "ArrowRight") step(1)
      if (e.key === "ArrowLeft") step(-1)
    }
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  })
  const read = useMemo(() => (f ? analyze(f.script, { gallery, taste }) : null), [f, gallery, taste])
  return (
    <Dialog open={!!f} onClose={onClose} label={f ? `Review ${f.script.name}` : "Review"} className="modal review">
      {f && read && (
        <div className="grid h-full max-h-[inherit] grid-cols-1 md:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-h-0 flex-col justify-center gap-3 bg-canvas p-6">
            <FilmPlayer key={f.id} films={films} f={f} className="w-full" tall="min(62vh, 640px)" />
            <StoryStrip film={f.script} copy={copyOf(films)} />
          </div>
          <div className="flex min-h-0 flex-col border-l bg-surface">
            <div className="flex items-start gap-3 px-6 pb-4 pt-5">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-fg-3">
                  {at + 1} of {row.length} · {shelf === "waiting" ? "To review" : shelf === "kept" ? "Kept" : "Passed"}
                </p>
                <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.02em]">{f.script.name}</h2>
                <p className="mt-0.5 text-[13px] text-fg-3">
                  {kindOf(f.script)} · {styleOf(f.script)} · {f.script.shots.length} shots · {seconds(f.script).toFixed(1)} s
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5">
                <IconButton size="sm" label="Previous film" kbd="←" disabled={at <= 0} onClick={() => step(-1)}>
                  <CaretLeft size={14} />
                </IconButton>
                <IconButton size="sm" label="Next film" kbd="→" disabled={at >= row.length - 1} onClick={() => step(1)}>
                  <CaretRight size={14} />
                </IconButton>
                <IconButton size="sm" label="Close" onClick={onClose}>
                  <X size={14} />
                </IconButton>
              </span>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="flex items-center justify-between rounded-lg border px-3.5 py-3">
                <span className="text-[13px] text-fg-3">The critic's read</span>
                <Score value={read.score} verdict={read.verdict} />
              </div>
              <div className="mt-5">
                <VerdictForm
                  key={f.id}
                  f={f}
                  onDecided={(next) => {
                    onDecided(next)
                    // on to the next film still waiting, or done
                    const rest = next.filter((x) => x.status === "waiting")
                    if (rest.length) onOpen(rest[0].id)
                    else onClose()
                  }}
                />
              </div>
              <button type="button" onClick={() => onPreview(f.script)} className="press mt-5 flex items-center gap-1.5 text-[13px] text-fg-2 transition-colors duration-150 hover:text-fg">
                Open it in Films
                <CaretRight size={12} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

/** What the taste has learned so far, in a line: the art directions it leans to, the reasons it holds films to. */
export function useLearned(taste?: Taste) {
  return useMemo(() => {
    const lean = Object.entries(taste?.prefer.styles ?? {})
      .filter(([, w]) => w > 1.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => DIRECTIONS.find((d) => d.id === id)?.name ?? id)
    const rules = (taste?.rules ?? []).slice(0, 3).map((r) => r.label.toLowerCase())
    return [lean.length ? `Leaning to ${lean.join(", ")}` : "", rules.length ? `holding films to ${rules.join(", ")}` : ""].filter(Boolean).join(" · ")
  }, [taste])
}
