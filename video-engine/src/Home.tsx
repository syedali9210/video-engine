// Home: where you pick up and where you start. One field that finds or starts anything; then your desk (the film you're
// making, what the AI made for you to judge, and your product as the engine knows it); then four ways to start, drawn
// as what they make; a row of templates; and the product running live with your shared links. Every card says what's
// true when there's nothing yet, while it loads, and when its source is down, with the step that helps.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowRight, ArrowUpRight, ChatCircle, Copy, FilmSlate, FrameCorners, Lightbulb, MagnifyingGlass, Package, PaintBrush, SquaresFour, Tray, UploadSimple } from "@phosphor-icons/react"
import { Page, PageSection, Pills } from "./shell"
import { Card, Tag } from "./Galleries"
import { ANIMS, type Values } from "./registry"
import { Kbd } from "./ui"
import { CATEGORIES } from "./refs"
import { TEMPLATES, total, type Comp, type Template } from "./studio/comp"
import { DocSketch } from "./canvas/CreateDialog"
import { loadDoc } from "./canvas/Canvas"
import { kindOf, seconds, type Screened } from "./studio/NewFilms"
import { burst } from "./fun"
import { CompPoster, FilmPoster, ScriptPoster } from "./FilmPoster"
import type { ProductKit } from "./studio/product"
import { Empty, Problem, Skeleton } from "./States"

type Props = {
  /** the product everything is made from: the open component's brand, or its name */
  product: string
  anim: string
  overrides: Record<string, Values>
  dark: boolean
  accent?: string
  /** the film in the Studio */
  film: Comp
  lab: { films: number; ideas: number } | null
  /** products opened lately, newest first */
  recent: string[]
  /** on this machine, with the engine's server: the Lab's parts (what's waiting, the AI's status), your kits, your links */
  labOn: boolean
  onStudio: () => void
  onCanvas: () => void
  onArtist: () => void
  onTemplates: () => void
  onFilm: (t: Template) => void
  onAllFilms: () => void
  onCreative: (kind?: string) => void
  onComponent: (id: string) => void
  onComponents: () => void
  onProduct: () => void
  onReview: () => void
  onLab: (tab?: string) => void
  onSettings: () => void
  onSearch: (q: string) => void
}

/** A fetch from the engine's own server, with its three states: loading (undefined), done, or failed. */
function useServer<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: unknown; at: number }>({ at: 0 })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let on = true
    setState((s) => ({ ...s, error: undefined }))
    fetch(path)
      .then(async (r) => {
        // a static host answers these with a page, not JSON: no server here
        const j = await r.json().catch(() => undefined)
        if (!r.ok || j === undefined) throw new Error((j as { error?: string } | undefined)?.error ?? (r.ok ? "The engine's server isn't running here" : `The engine's server said ${r.status}`))
        return j as T
      })
      .then(
        (data) => on && setState({ data, at: Date.now() }),
        (error) => on && setState({ error, at: Date.now() }),
      )
    return () => {
      on = false
    }
  }, [path, n, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, loading: !!path && !state.data && !state.error, retry: () => setN((x) => x + 1) }
}

export function Home(p: Props) {
  const hour = new Date().getHours()
  const hello = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  return (
    <Page label="Home">
      <header className="rise-in relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        {/* the sky over the page: now and then a paper plane crosses it */}
        <div className="pointer-events-none absolute inset-x-0 -top-14 h-12 overflow-hidden [container-type:inline-size] [&_button]:pointer-events-auto">
          <Plane />
        </div>
        <div className="min-w-0">
          <p className="mb-3 text-body text-fg-3">{hello}, Syed</p>
          <h1 className="text-page font-semibold tracking-[-0.035em] text-balance">What are we making?</h1>
        </div>
        {p.labOn && <AiStatus onSettings={p.onSettings} />}
      </header>
      <Composer {...p} />

      {/* the desk: your film, what's waiting for you, your product, your links, what you opened */}
      <div className="mt-10 grid gap-5 lg:grid-cols-12">
        <Continue {...p} />
        {p.labOn && <Waiting {...p} />}
        {/* your kits and review links live on the engine's server: only where it runs */}
        {p.labOn && <ProductCard {...p} />}
        {p.labOn && <Shared />}
        <Recent {...p} />
      </div>

      <Templates {...p} />
    </Page>
  )
}

/* ---------------- the field that finds or starts anything ---------------- */

function Composer(p: Props) {
  const [q, setQ] = useState("")
  const starts: [string, typeof PaintBrush, () => void][] = [
    ["Direct a film", PaintBrush, p.onArtist],
    ["Start from a template", FilmSlate, p.onTemplates],
    ["Make a creative", FrameCorners, () => p.onCreative()],
    // replicating runs in the Lab: only on this machine
    ...(p.labOn ? ([["Replicate a film", Copy, () => p.onLab("replicate")]] as [string, typeof PaintBrush, () => void][]) : []),
  ]
  return (
    <div className="tile rise-in mt-7 !overflow-visible focus-within:[--tile-sh:0_0_0_1px_var(--fg-3),0_8px_20px_-8px_rgb(0_0_0/0.12)]" style={{ animationDelay: "40ms" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          p.onSearch(q.trim())
        }}
        className="flex h-16 items-center gap-3 pl-5 pr-4"
      >
        <MagnifyingGlass size={19} aria-hidden className="shrink-0 text-fg-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => !q && e.currentTarget.select()}
          aria-label="Find or start anything"
          placeholder={`Find a template, an action or your work, or start a film for ${p.product}…`}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </form>
      <div className="flex flex-wrap gap-2 border-t px-4 py-3">
        {starts.map(([label, I, run]) => (
          <button key={label} type="button" onClick={run} className="press group flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-body font-medium text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] transition-[background-color,color,transform] duration-150 hover:bg-surface-3 hover:text-fg">
            <I size={16} aria-hidden className="text-fg-3 transition-colors duration-150 group-hover:text-fg" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Whether the AI can work right now, at a glance: ready (and on which model), not set up, busy, or out of requests. */
function AiStatus({ onSettings }: { onSettings: () => void }) {
  type Work = { providers: { id: string; name: string; ready?: boolean; model?: string }[]; log?: { at: string; ok: boolean; error?: string }[] }
  const s = useServer<Work>("/__work/state")
  const ready = s.data?.providers.find((x) => x.ready)
  const last = s.data?.log?.[0]
  const recent = last && !last.ok && Date.now() - new Date(last.at).getTime() < 15 * 60000 ? last.error ?? "" : ""
  const [dot, label, sub] = s.error
    ? ["var(--bad)", "Server offline", "Start it with npm run dev"]
    : !s.data
      ? ["var(--fg-3)", "Checking the AI…", ""]
      : !ready
        ? ["var(--fg-3)", "AI off", "Set it up"]
        : /free tier|used up|quota/i.test(recent)
          ? ["var(--warn)", "AI out of requests", "Pick another model"]
          : /busy|503|in time/i.test(recent)
            ? ["var(--warn)", "AI busy", ready.model ?? ""]
            : ["var(--good)", "AI ready", ready.model ?? ready.name]
  return (
    <button type="button" onClick={onSettings} title="The AI's settings" className="press rise-in flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-body shadow-[var(--tile-sh)] transition-colors duration-150 hover:bg-surface-2">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot, boxShadow: `0 0 0 3px color-mix(in srgb, ${dot} 22%, transparent)` }} />
      <span className="font-medium">{label}</span>
      {sub && <span className="max-w-[180px] truncate text-fg-3">{sub}</span>}
    </button>
  )
}

/* ---------------- the desk ---------------- */

const Frame = ({ children, className = "", label, lifts }: { children: ReactNode; className?: string; label: string; lifts?: boolean }) => (
  <section aria-label={label} className={`tile rise-in group flex min-w-0 flex-col ${lifts ? "lifts" : ""} ${className}`}>
    {children}
  </section>
)
const Head = ({ title, count, n, aside }: { title: string; /** waiting on you: a lit badge */ count?: ReactNode; /** just how many */ n?: ReactNode; aside?: ReactNode }) => (
  <div className="relative z-20 flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
    <h2 className="flex items-center gap-2 text-ui font-semibold">
      {title}
      {count != null && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sel px-1.5 text-[11px] font-semibold tabular-nums text-white">{count}</span>}
      {n != null && <span className="text-body font-normal tabular-nums text-fg-3">{n}</span>}
    </h2>
    {aside}
  </div>
)
function Go({ children, onClick, ink }: { children: ReactNode; onClick: () => void; ink?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`press btn group/go relative z-20 flex h-9 items-center gap-1.5 rounded-full px-4 text-body font-medium ${ink ? "btn-ink" : "btn-2"}`}>
      {children}
      <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover/go:translate-x-0.5" />
    </button>
  )
}
/** A whole card that opens something: a button laid over it (the card's own buttons sit above it). */
const Opens = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" aria-label={label} onClick={onClick} className="absolute inset-0 z-10 rounded-[inherit]" />

/** The film you're making: its poster fills the card, its name and the way back in over the foot of it. */
function Continue(p: Props) {
  const scenes = p.film.scenes.length
  const doc = useMemo(() => loadDoc(), [])
  return (
    <Frame label="Continue" lifts className={`aspect-video lg:aspect-auto lg:min-h-[440px] ${p.labOn ? "lg:col-span-8" : "lg:col-span-12"}`}>
      <div className="tile-media absolute inset-0">
        <CompPoster bare comp={p.film} product={p.product} accent={p.accent} still={p.anim} className="!aspect-auto h-full w-full" />
      </div>
      <Opens label={`Open ${p.product}, your film, in the Studio`} onClick={p.onStudio} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5 bg-[linear-gradient(to_top,rgb(0_0_0/0.78),rgb(0_0_0/0.35)_45%,transparent)]" />
      <div className="pointer-events-none relative z-20 mt-auto flex flex-wrap items-end justify-between gap-4 p-6 text-white [&_button]:pointer-events-auto">
        <div className="min-w-0">
          <p className="text-micro font-medium uppercase tracking-[0.1em] text-white/70">Continue</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-[30px] tracking-[-0.025em] text-balance">{p.product}, your film</p>
          <p className="mt-1 text-body tabular-nums text-white/70">
            {scenes} {scenes === 1 ? "scene" : "scenes"} · {total(p.film).toFixed(1)} s · {p.film.size.replace("x", ":")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc && (
            <button type="button" onClick={p.onCanvas} className="press flex h-9 items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3.5 text-body font-medium text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)] backdrop-blur-md transition-colors duration-150 hover:bg-white/25" title="The canvas you were working on">
              <span className="block w-12 overflow-hidden rounded-full bg-white">
                <DocSketch doc={doc} className="w-full" />
              </span>
              Your canvas
            </button>
          )}
          <button type="button" onClick={p.onStudio} className="press group/go flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-body font-medium text-[#0a0a0a] shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)] transition-transform duration-150">
            Open in the Studio
            <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover/go:translate-x-0.5" />
          </button>
        </div>
      </div>
    </Frame>
  )
}

/** One print in a pile: depth 0 on top, and which way it fans. */
const Print = ({ k, side, children, w }: { k: number; side: number; children: ReactNode; w?: string }) => (
  <span className="print" style={{ "--k": k, "--s": side, ...(w ? { "--w": w } : {}) } as React.CSSProperties}>
    {children}
  </span>
)
const SIDES = [0, -1, 1]

/** What the AI made for you to judge: the newest films, a pile of prints that fans out under the pointer. */
function Waiting(p: Props) {
  const s = useServer<Screened[]>("/__lab/screening")
  const list = (s.data ?? []).filter((f) => f.status === "waiting")
  const ideas = p.lab?.ideas ?? 0
  const count = list.length + ideas
  // no films waiting: the ideas themselves, drawn as the films they'd be
  const props = useServer<{ id: string; kind: string; script: Screened["script"] }[]>(s.data && !list.length && ideas ? "/__lab/proposals" : null)
  const drafts = (props.data ?? []).filter((x) => x.kind !== "effect").slice(-3).reverse()
  return (
    <Frame label="Waiting for you" lifts={count > 0} className="min-h-[380px] lg:col-span-4">
      {count > 0 && <Opens label="Review what's waiting" onClick={p.onReview} />}
      <Head title="Waiting for you" count={s.data && count ? count : undefined} aside={count ? <Go onClick={p.onReview}>Review</Go> : undefined} />
      {s.loading ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Skeleton className="aspect-video w-[70%] !rounded-2xl" />
        </div>
      ) : s.error ? (
        <Problem compact error={s.error} onRetry={s.retry} className="p-5" />
      ) : list.length ? (
        <>
          <div className="stack flex-1 [--spread:34%]">
            {list.slice(0, 3).map((f, i) => (
              <Print key={f.id} k={i} side={SIDES[i]}>
                <ScriptPoster script={f.script} product={p.product} accent={p.accent} className="!rounded-none !shadow-none" />
              </Print>
            ))}
          </div>
          <div className="px-5 pb-5">
            <p className="text-ui font-medium">
              {list.length} new {list.length === 1 ? "film" : "films"}
              <span className="font-normal text-fg-3"> · {[...new Set(list.slice(0, 3).map((f) => kindOf(f.script)))].join(", ")}</span>
            </p>
            {ideas > 0 && <p className="mt-0.5 text-body text-fg-3">and {ideas} template {ideas === 1 ? "idea" : "ideas"} from the Lab</p>}
          </div>
        </>
      ) : ideas ? (
        <>
          <div className="stack flex-1 [--spread:26%]">
            {drafts.length
              ? drafts.map((d, i) => (
                  <Print key={d.id} k={i} side={SIDES[i]}>
                    <ScriptPoster script={d.script} product={p.product} accent={p.accent} className="!rounded-none !shadow-none" />
                  </Print>
                ))
              : [0, 1, 2].map((i) => (
                  <Print key={i} k={i} side={SIDES[i]} w="56%">
                    <span className="flex aspect-[4/3] flex-col justify-between bg-surface p-4">
                      <Lightbulb size={22} aria-hidden className="text-warn" />
                      <span className="space-y-1.5">
                        <span className="block h-2 w-4/5 rounded-full bg-surface-3" />
                        <span className="block h-2 w-3/5 rounded-full bg-surface-3" />
                      </span>
                    </span>
                  </Print>
                ))}
          </div>
          <div className="px-5 pb-5">
            <p className="text-ui font-medium">
              {ideas} template {ideas === 1 ? "idea" : "ideas"} from the Lab
            </p>
            <p className="mt-0.5 truncate text-body text-fg-3">{drafts[0] ? `Newest: ${drafts[0].script.name}` : "Keep the ones worth making; the next batch follows what you said."}</p>
          </div>
        </>
      ) : (
        <Empty icon={Tray} title="Nothing waiting" sub="The Artist can make four films for you to keep or pass." action={<Go onClick={() => p.onLab("films")}>Make four</Go>} className="flex-1 justify-center" />
      )}
    </Frame>
  )
}

/** Your product as the engine knows it: its name and colour, and its screens as a pile; or the step that brings it in. */
function ProductCard(p: Props) {
  type Row = { id: string; name: string }
  const rows = useServer<Row[]>("/__kit/list")
  const want = (() => {
    try {
      return localStorage.getItem("anim-engine:kit")
    } catch {
      return null
    }
  })()
  const id = rows.data ? (rows.data.find((r) => r.id === want) ?? rows.data[0])?.id : undefined
  const kit = useServer<ProductKit>(id ? `/__kit/get?id=${id}` : null)
  const shots = (kit.data?.files ?? []).filter((f) => f.type.startsWith("image/") && f.kind !== "logo").slice(0, 3)
  const loading = rows.loading || kit.loading
  const error = rows.error ?? kit.error
  return (
    <Frame label="Your product" lifts={!!kit.data} className="min-h-[320px] lg:col-span-4">
      {kit.data && <Opens label="Open your product" onClick={p.onProduct} />}
      <Head title="Your product" aside={kit.data ? <Go onClick={p.onProduct}>Open</Go> : undefined} />
      {loading ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Skeleton className="aspect-[4/3] w-[60%] !rounded-2xl" />
        </div>
      ) : error ? (
        <Problem compact error={error} onRetry={() => (rows.retry(), kit.retry())} className="p-5" />
      ) : !kit.data ? (
        <Empty icon={Package} title="Bring your product in" sub="Drop its screens, a recording or its address once; every film and template takes it." action={<Go ink onClick={p.onProduct}>Add your product</Go>} className="flex-1 justify-center" />
      ) : (
        <>
          {shots.length ? (
            <div className="stack flex-1 [--spread:28%]">
              {shots.map((f, i) => (
                <Print key={f.id} k={i} side={SIDES[i]} w="66%">
                  <span className="relative block aspect-[4/3]">
                    <img src={f.url} alt={f.shows ?? f.name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top" />
                  </span>
                </Print>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-5">
              <span className="flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-body text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]">
                <UploadSimple size={15} aria-hidden />
                No screens yet: drop some in so films show the real thing
              </span>
            </div>
          )}
          <p className="flex items-center gap-2.5 px-5 pb-5">
            <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--line-strong)]" style={{ background: kit.data.brand.accent ?? "var(--surface-3)" }} />
            <span className="truncate text-ui font-semibold">{kit.data.words.name || kit.data.name}</span>
            <span className="truncate text-body text-fg-3">{kit.data.understanding?.kind ?? kit.data.words.tagline}</span>
          </p>
        </>
      )}
    </Frame>
  )
}

/* ---------------- templates ---------------- */

function Templates(p: Props) {
  const [cat, setCat] = useState("all")
  const all = useMemo(() => TEMPLATES.filter((t) => t.category), [])
  const shown = all.filter((t) => cat === "all" || t.category === cat).slice(0, 4)
  const options = [{ value: "all", label: "All", count: all.length }, ...CATEGORIES.film.map((c) => ({ value: c.id, label: c.name, count: all.filter((t) => t.category === c.id).length })).filter((c) => c.count)]
  return (
    <PageSection
      className="mt-16"
      title="Templates"
      count={all.length}
      aside={
        <div className="flex flex-wrap items-center gap-4">
          <Pills label="Kinds of film" value={cat} onChange={setCat} options={options} />
          <More onClick={p.onAllFilms}>All films</More>
        </div>
      }
    >
      <ul className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">
        {shown.map((t, i) => (
          <Card key={t.id} i={i} onClick={() => p.onFilm(t)} title={t.name} meta={`${CATEGORIES.film.find((c) => c.id === t.category)?.name ?? "Film"} · ${t.scenes === 1 ? "1 scene" : `${t.scenes} scenes`}`} shot={<FilmPoster bare t={t} product={p.product} accent={p.accent} />} />
        ))}
      </ul>
    </PageSection>
  )
}

const More = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="press group flex items-center gap-1 text-[14px] text-fg-2 transition-colors duration-150 hover:text-fg">
    {children}
    <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5" />
  </button>
)

/* ---------------- shared, recent, and the plane ---------------- */

/** Now and then a paper plane crosses the sky. Catch it. */
function Plane() {
  const [caught, setCaught] = useState(0)
  const [said, setSaid] = useState(false)
  const lines = ["Caught it.", "Nice reflexes.", "It'll be back.", "Okay, you're good at this."]
  return (
    <>
      <span className={`plane absolute left-0 top-10 z-[2] ${caught ? "caught" : ""}`} key={caught}>
        <span>
          <button
            type="button"
            aria-label="A paper plane"
            onClick={(e) => {
              burst(e.clientX, e.clientY, { count: 36, power: 0.8 })
              setCaught((c) => c + 1)
              setSaid(true)
              setTimeout(() => setSaid(false), 2200)
            }}
            className="block cursor-pointer p-2"
          >
            <svg viewBox="0 0 32 24" width="26" height="19" aria-hidden className="drop-shadow-[0_2px_3px_rgb(0_0_0/0.35)]">
              <path d="M1 11 L31 1 L19 23 L14 14 Z" fill="#ffffff" />
              <path d="M14 14 L31 1 L17 17 Z" fill="#c9d8ff" />
              <path d="M14 14 L17 17 L15 21 Z" fill="#9fb6f5" />
            </svg>
          </button>
        </span>
      </span>
      {said && <span className="pop-in absolute right-4 top-4 z-[3] rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-md">{lines[(caught - 1) % lines.length]}</span>}
    </>
  )
}

/** Films you shared for review, with their open notes. */
function Shared() {
  type Row = { id: string; name: string; at: string; comments: number; open: number }
  const s = useServer<Row[]>("/__review/list")
  const list = s.data ?? []
  return (
    <Frame label="Shared for review" className="lg:col-span-4">
      <Head title="Shared for review" n={s.data ? list.length : undefined} />
      {s.loading ? (
        <div className="space-y-2 p-5 pt-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : s.error ? (
        <Problem compact error={s.error} onRetry={s.retry} className="p-5 pt-3" />
      ) : list.length ? (
        <ul className="divide-y px-2 pb-2">
          {list.slice(0, 3).map((r) => (
            <li key={r.id}>
              <a href={`/review.html#${r.id}`} target="_blank" rel="noreferrer" className="press group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
                  <ChatCircle size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium">{r.name}</span>
                  <span className="block text-caption text-fg-3">
                    {r.comments ? `${r.comments} ${r.comments === 1 ? "note" : "notes"}${r.open ? ` · ${r.open} open` : " · all done"}` : "No notes yet"} · {ago(r.at)}
                  </span>
                </span>
                <ArrowUpRight size={14} aria-hidden className="shrink-0 text-fg-3 transition-transform duration-200 ease-[var(--ease-out)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 pt-1 text-body text-fg-3">After an export, “Share for review” makes a link others can leave notes on, at a moment and a spot.</p>
      )}
    </Frame>
  )
}

function Recent(p: Props) {
  const list = p.recent
    .map((id) => ANIMS.find((a) => a.id === id))
    .filter((a): a is (typeof ANIMS)[number] => !!a)
    .slice(0, 4)
  return (
    <Frame label="Recently opened" className={p.labOn ? "lg:col-span-4" : "lg:col-span-12"}>
      <Head title="Recently opened" aside={<More onClick={p.onComponents}>Switch screen</More>} />
      {list.length ? (
        <ul className="grid gap-1 px-2 pb-2">
          {list.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => p.onComponent(a.id)} className="press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2">
                <Still id={a.id} dark={p.dark} />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium">{a.name}</span>
                  <span className="block truncate text-caption text-fg-3">{a.category}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-5 pb-5 pt-1 text-body text-fg-3">
          <SquaresFour size={15} aria-hidden />
          What you open in the library shows here.
        </p>
      )}
    </Frame>
  )
}

function Still({ id, dark }: { id: string; dark: boolean }) {
  const [ok, setOk] = useState(true)
  return (
    <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-[0_0_0_1px_var(--line)]">
      {ok && <img src={`/thumbs/${id}-${dark ? "dark" : "light"}.webp`} alt="" loading="lazy" decoding="async" onError={() => setOk(false)} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  )
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000
  const [n, unit] = Math.abs(s) < 3600 ? [s / 60, "minute"] : Math.abs(s) < 86400 ? [s / 3600, "hour"] : [s / 86400, "day"]
  return rtf.format(Math.round(n), unit as Intl.RelativeTimeFormatUnit)
}

