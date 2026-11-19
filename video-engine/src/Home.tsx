// Home: where you start and where you pick up. The ways to start, each drawn as what it makes (a fan of template
// posters, the Artist's mark, a creative's layout, a dashed place for your product); a three-step line until your first
// film is out; what's waiting for your verdict (only when something is); your work; the templates by kind; your
// review links. Every piece says what's true while it loads and when its source is down, with the step that helps.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowRight, ArrowUpRight, ChatCircle, FrameCorners, Lightbulb, UploadSimple } from "@phosphor-icons/react"
import { Page, PageSection, Pills } from "./shell"
import { Card, Tag, useCompositions } from "./Galleries"
import { type Values } from "./registry"
import { CATEGORIES } from "./refs"
import { TEMPLATES, total, type Comp, type Template } from "./studio/comp"
import { DocSketch } from "./canvas/CreateDialog"
import { loadDoc } from "./canvas/Canvas"
import { kindOf, type Screened } from "./studio/NewFilms"
import { burst } from "./fun"
import { CompPoster, FilmPoster, ScriptPoster } from "./FilmPoster"
import type { ProductKit } from "./studio/product"
import { Problem, Skeleton } from "./States"

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
      <header className="relative">
        {/* the sky over the page: now and then a paper plane crosses it */}
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-16 overflow-hidden [container-type:inline-size] [&_button]:pointer-events-auto">
          <Plane />
        </div>
        <p className="rise-in text-body text-fg-3">
          {hello}, Syed
        </p>
        <h1 className="hero-title rise-in mt-2 text-balance" style={{ animationDelay: "30ms" }}>
          What are we <span className="serif text-[1.1em]">making</span> today?
        </h1>
        <p className="rise-in mt-3 max-w-[60ch] text-lead text-fg-2 text-pretty" style={{ animationDelay: "60ms" }}>
          Launch films and creatives of <span className="font-medium text-fg">{p.product}</span>, with the real product live on every screen.
        </p>
      </header>

      <Starts {...p} />
      <Guide {...p} />
      {p.labOn && <Waiting {...p} />}
      <ContinueRow {...p} />
      <Templates {...p} />
      {p.labOn && <Shared />}
    </Page>
  )
}

/* ---------------- the ways to start, each drawn as what it makes ---------------- */

/** A way to start: a picture of what it makes (a cutout, a fan of posters, a layout), its name and one line. */
function Start({ title, sub, art, onClick, i, dashed }: { title: string; sub: string; art: ReactNode; onClick: () => void; i: number; dashed?: boolean }) {
  return (
    <li className="rise-in min-w-0" style={{ animationDelay: `${90 + i * 40}ms` }}>
      <button type="button" onClick={onClick} className="card group block w-full text-left">
        <span className={`card-shot start-art ${dashed ? "start-dashed" : ""}`}>{art}</span>
        <span className="mt-3 flex items-center gap-1.5 text-ui font-medium">
          {title}
          <ArrowRight size={14} aria-hidden className="text-fg-3 opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none" />
        </span>
        <span className="mt-0.5 block text-body text-fg-3 text-pretty">{sub}</span>
      </button>
    </li>
  )
}

function Starts(p: Props) {
  const films = useMemo(() => TEMPLATES.filter((t) => t.category).slice(0, 3), [])
  const layouts = useCompositions(p, 1)
  return (
    <section aria-label="Start something" className="mt-10">
      <ul className={`grid gap-x-5 gap-y-8 sm:grid-cols-2 ${p.labOn ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Start
          i={0}
          onClick={p.onTemplates}
          title="Start from a template"
          sub={`${TEMPLATES.filter((t) => t.category).length} launch films, cut from real ads.`}
          art={
            <span className="stack block aspect-[4/3] [--spread:26%]">
              {films.map((t, k) => (
                <span key={t.id} className="print" style={{ "--k": k, "--s": [0, -1, 1][k], "--w": "68%" } as CSSProperties}>
                  <FilmPoster bare t={t} product={p.product} accent={p.accent} />
                </span>
              ))}
            </span>
          }
        />
        <Start
          i={1}
          onClick={p.onArtist}
          title="Direct a film"
          sub="The Artist plans the story, type and cuts from your product."
          art={
            <span className="artist-art block aspect-[4/3]">
              <svg viewBox="0 0 24 24" aria-hidden className="artist-mark">
                <circle cx="5" cy="18" r="2.1" fill="#fff" opacity=".3" />
                <circle cx="9.8" cy="13.6" r="3" fill="#fff" opacity=".58" />
                <circle cx="16.4" cy="8.6" r="4.6" fill="#fff" />
              </svg>
            </span>
          }
        />
        <Start
          i={2}
          onClick={() => p.onCreative()}
          title="Make a creative"
          sub="A hero, a bento, a poster or a post for your site."
          art={<span className="grid aspect-[4/3] place-items-center bg-[var(--bg-subtle)] p-5">{layouts[0] ? <DocSketch doc={layouts[0].doc} className="w-full rounded-md shadow-[var(--shadow-2)]" /> : <FrameCorners size={28} aria-hidden className="text-fg-3" />}</span>}
        />
        {p.labOn && (
          <Start
            i={3}
            dashed
            onClick={p.onProduct}
            title="Add your product"
            sub="Screens, the logo and the words, once for every film."
            art={
              <span className="grid aspect-[4/3] place-items-center">
                <span className="flex flex-col items-center gap-3 text-fg-3 transition-colors duration-150 group-hover:text-fg">
                  <span className="flex items-end gap-2" aria-hidden>
                    <span className="h-10 w-7 rounded-md border border-dashed border-current opacity-50" />
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bg-hover)]">
                      <UploadSimple size={20} />
                    </span>
                    <span className="h-10 w-7 rounded-md border border-dashed border-current opacity-50" />
                  </span>
                  <span className="text-body font-medium">Drop your screens</span>
                </span>
              </span>
            }
          />
        )}
      </ul>
    </section>
  )
}

/* ---------------- the guide: three steps to a first film, as one quiet line ---------------- */

const local = (k: string) => {
  try {
    return JSON.parse(localStorage.getItem("anim-engine:" + k) ?? "null")
  } catch {
    return null
  }
}

function Guide(p: Props) {
  const [hidden, setHidden] = useState(() => !!local("guideHidden"))
  // your product is known on this machine only (its kit is on the engine's server)
  const kits = useServer<{ id: string }[]>(p.labOn && !hidden ? "/__kit/list" : null)
  const steps: { title: string; done: boolean; run: () => void }[] = [
    ...(p.labOn ? [{ title: "Add your product", done: !!kits.data?.length, run: p.onProduct }] : []),
    { title: "Make your first film", done: p.film.scenes.length > 1 || !!local("made"), run: p.onTemplates },
    { title: "Export and share it", done: !!local("exported"), run: p.onStudio },
  ]
  const done = steps.filter((s) => s.done).length
  if (hidden || done === steps.length) return null
  const next = steps.findIndex((s) => !s.done)
  return (
    <section aria-label="Get started" className="rise-in mt-12 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "200ms" }}>
      <h2 className="text-body font-semibold">
        Get started <span className="font-normal tabular-nums text-fg-3">· {done} of {steps.length}</span>
      </h2>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className={`h-px w-6 ${steps[i - 1].done ? "bg-good" : "bg-line-strong"}`} />}
            <button type="button" onClick={s.run} data-done={s.done} data-next={i === next} className="step press">
              <span className="step-dot" aria-hidden>
                {s.done ? (
                  <svg viewBox="0 0 24 24" width="12" height="12" className="check-draw" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {s.title}
              <span className="sr-only">{s.done ? " (done)" : ""}</span>
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("anim-engine:guideHidden", "true")
          setHidden(true)
        }}
        className="press ml-auto rounded-md px-2 py-1 text-body text-fg-3 transition-colors hover:bg-hover hover:text-fg"
      >
        Hide
      </button>
    </section>
  )
}

/* ---------------- pick up where you left off ---------------- */

function ContinueRow(p: Props) {
  const doc = useMemo(() => loadDoc(), [])
  const scenes = p.film.scenes.length
  return (
    <PageSection className="mt-14" title="Your work">
      <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          onClick={p.onStudio}
          title={`${p.product}, your film`}
          meta={`${scenes} ${scenes === 1 ? "scene" : "scenes"} · ${total(p.film).toFixed(1)} s · ${p.film.size.replace("x", ":")}`}
          badge={<Tag>Film</Tag>}
          shot={<CompPoster bare comp={p.film} product={p.product} accent={p.accent} still={p.anim} />}
        />
        {doc && <Card i={1} onClick={p.onCanvas} title="Your canvas" meta={`${doc.layers.length} layers · ${doc.frame.w}×${doc.frame.h}`} badge={<Tag>Creative</Tag>} shot={<span className="grid aspect-video place-items-center bg-white p-4"><DocSketch doc={doc} className="max-h-full w-full" /></span>} />}
        {p.labOn && <ProductCard {...p} />}
      </ul>
    </PageSection>
  )
}

/** What the AI made for you to judge: one quiet line with the newest films as little prints, only when there's
    something there (the Lab and the sidebar's Inbox hold the rest). */
function Waiting(p: Props) {
  const s = useServer<Screened[]>("/__lab/screening")
  const list = (s.data ?? []).filter((f) => f.status === "waiting")
  const ideas = p.lab?.ideas ?? 0
  const count = list.length + ideas
  if (!s.data || !count) return null
  return (
    <section aria-label="Waiting for you" className="rise-in mt-8">
      <button type="button" onClick={p.onReview} className="group flex w-full items-center gap-4 rounded-2xl p-2 pr-4 text-left transition-colors duration-150 hover:bg-hover">
        <span className="flex shrink-0 -space-x-6">
          {list.slice(0, 3).map((f, i) => (
            <span key={f.id} className="block w-20 overflow-hidden rounded-lg shadow-[var(--shadow-2)] transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-x-[calc(var(--i)*6px)] motion-reduce:transition-none" style={{ "--i": i, zIndex: 3 - i } as CSSProperties}>
              <ScriptPoster script={f.script} product={p.product} accent={p.accent} className="!rounded-none !shadow-none" />
            </span>
          ))}
          {!list.length && (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-subtle text-warn">
              <Lightbulb size={20} aria-hidden />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-body font-semibold">
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sel px-1.5 text-[11px] font-semibold tabular-nums text-white">{count}</span>
            {list.length ? `${list.length} new ${list.length === 1 ? "film is" : "films are"} waiting for your verdict` : `${ideas} template ${ideas === 1 ? "idea is" : "ideas are"} waiting for you`}
          </span>
          <span className="mt-0.5 block truncate text-caption text-fg-3">{list.length ? `${[...new Set(list.slice(0, 3).map((f) => kindOf(f.script)))].join(", ")}. Keep or pass, and say why: the next batch follows.` : "From the Lab. Keep the ones worth making."}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-body font-medium">
          Review
          <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </button>
    </section>
  )
}

/** Your product as the engine knows it (only once there is one: adding it is a way to start, above). */
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
  const shot = (kit.data?.files ?? []).find((f) => f.type.startsWith("image/") && f.kind !== "logo")
  if (rows.loading || kit.loading)
    return (
      <li className="min-w-0">
        <Skeleton className="aspect-video w-full !rounded-2xl" />
        <Skeleton className="mt-3 h-4 w-2/5" />
      </li>
    )
  const error = rows.error ?? kit.error
  if (error)
    return (
      <li className="flex min-w-0 items-center rounded-2xl bg-subtle p-5">
        <Problem compact error={error} onRetry={() => (rows.retry(), kit.retry())} className="w-full" />
      </li>
    )
  if (!kit.data) return null
  return (
    <Card
      i={2}
      onClick={p.onProduct}
      title={kit.data.words.name || kit.data.name}
      meta={
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--line-strong)]" style={{ background: kit.data.brand.accent ?? "var(--surface-3)" }} />
          <span className="truncate">{kit.data.understanding?.kind ?? kit.data.words.tagline ?? "Your product"}</span>
        </span>
      }
      badge={<Tag>Product</Tag>}
      shot={
        shot ? (
          <span className="relative block aspect-video">
            <img src={shot.url} alt={shot.shows ?? shot.name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top" />
          </span>
        ) : (
          <span className="grid aspect-video place-items-center text-fg-3">
            <span className="flex items-center gap-2 text-body">
              <UploadSimple size={16} aria-hidden />
              No screens yet
            </span>
          </span>
        )
      }
    />
  )
}

/* ---------------- templates, by kind ---------------- */

function Templates(p: Props) {
  const [cat, setCat] = useState("all")
  const all = useMemo(() => TEMPLATES.filter((t) => t.category), [])
  const kinds = CATEGORIES.film.filter((c) => all.some((t) => t.category === c.id))
  const options = [{ value: "all", label: "All", count: all.length }, ...kinds.map((c) => ({ value: c.id, label: c.name, count: all.filter((t) => t.category === c.id).length }))]
  const card = (t: Template, i: number) => <Card key={t.id} i={i} onClick={() => p.onFilm(t)} title={t.name} meta={t.scenes === 1 ? "1 scene" : `${t.scenes} scenes`} shot={<FilmPoster bare t={t} product={p.product} accent={p.accent} />} />
  return (
    <PageSection className="mt-16" title="Templates" count={all.length} aside={<More onClick={p.onAllFilms}>All films</More>}>
      <div className="-mt-1 mb-7">
        <Pills label="Kinds of film" value={cat} onChange={setCat} options={options} />
      </div>
      {cat === "all" ? (
        <div className="space-y-10">
          {kinds.map((k) => (
            <div key={k.id}>
              <h3 className="mb-3 text-body font-medium text-fg-2">{k.name}</h3>
              <ul className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">{all.filter((t) => t.category === k.id).slice(0, 4).map(card)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">{all.filter((t) => t.category === cat).map(card)}</ul>
      )}
    </PageSection>
  )
}

const More = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="press group flex items-center gap-1 text-[14px] text-fg-2 transition-colors duration-150 hover:text-fg">
    {children}
    <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 motion-reduce:transition-none" />
  </button>
)

/* ---------------- shared, and the plane ---------------- */

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

/** Films you shared for review, with their open notes: only once there are some (an export's panel makes them). */
function Shared() {
  type Row = { id: string; name: string; at: string; comments: number; open: number }
  const s = useServer<Row[]>("/__review/list")
  const list = s.data ?? []
  if (!list.length) return null
  return (
    <PageSection className="mt-14" title="Shared for review" count={list.length}>
      <ul className="grid gap-2 md:grid-cols-3">
        {list.slice(0, 6).map((r) => (
          <li key={r.id}>
            <a href={`/review.html#${r.id}`} target="_blank" rel="noreferrer" className="press group flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 transition-colors duration-150 hover:bg-surface-3">
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-fg-2">
                <ChatCircle size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{r.name}</span>
                <span className="block truncate text-caption text-fg-3">
                  {r.comments ? `${r.comments} ${r.comments === 1 ? "note" : "notes"}${r.open ? ` · ${r.open} open` : " · all done"}` : "No notes yet"} · {ago(r.at)}
                </span>
              </span>
              <ArrowUpRight size={14} aria-hidden className="shrink-0 text-fg-3 transition-transform duration-200 ease-[var(--ease-out)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </a>
          </li>
        ))}
      </ul>
    </PageSection>
  )
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000
  const [n, unit] = Math.abs(s) < 3600 ? [s / 60, "minute"] : Math.abs(s) < 86400 ? [s / 3600, "hour"] : [s / 86400, "day"]
  return rtf.format(Math.round(n), unit as Intl.RelativeTimeFormatUnit)
}

