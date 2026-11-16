// The template lab's Ideas: films before they have shots, and the critic that reads them. New ideas come by rules (a
// grammar of hooks, spines and signatures, weighted by your taste), from Gemini, or from a film the lab studied. Each is
// developed into a film on the spot and scored, with its weakest parts said plainly. It can be previewed in the Studio,
// sent to the inbox as a template, or kept to come back to. The Critic reads any film: the one in the Studio, a
// template, an invented one, cut by cut.
import { Glyph } from "../Thinking"
import { useEffect, useMemo, useState } from "react"
import { ArrowsClockwise, BookmarkSimple, Check, Info, Lightbulb, Play, Sparkle, Tray, WarningCircle, Wrench } from "@phosphor-icons/react"
import { field } from "../controls"
import { CATEGORIES, categoryName, type Reference } from "../refs"
import { CategoryChips } from "../shell"
import { Button, IconButton, Segmented, Select } from "../ui"
import type { Comp } from "./comp"
import { cutName, cutReport } from "./cuts"
import { analyze, develop, ideasByRules, ideasFromFilm, type Analysis, type Idea } from "./concepts"
import { invent } from "./invent"
import { toScript, type TemplateScript } from "./script"
import type { Taste } from "./taste"
import type { LabState } from "./Lab"

type Api = <T>(path: string, body?: object) => Promise<T>

/** A beat of the grammar in words: "reveal:fall" is "Reveal: fall". */
export function beatWords(b: string) {
  const [k, a, c] = b.split(":")
  const simple: Record<string, string> = { "detail-top": "Close on the top", edge: "Along the edge", over: "Over the top", top: "From above", lying: "Lying back", profile: "Edge on", dutch: "Off the level", worm: "From below", dive: "Into the screen", end: "The name" }
  if (simple[k]) return simple[k]
  const ph = (x = "") => x.replace(/[{}]/g, "").replace(/(\d)$/, " $1")
  if (k === "reveal") return `Reveal: ${a}`
  if (k === "turn") return `Turn: ${a === "vertigo" ? "dolly zoom" : a}`
  if (k === "swing") return c || "A swing"
  if (k === "card") return `Card: the ${ph(a)}`
  if (k === "feature") return `The ${ph(a)}, over the device`
  return b
}

/** A score from 0 to 100 as a short bar: what's weak reads lighter. */
export function ScoreRow({ label, score, note }: { label: string; score: number; note?: string }) {
  return (
    <li className="grid grid-cols-[92px_1fr_28px] items-center gap-2" title={note}>
      <span className="truncate text-caption text-fg-2">{label}</span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-fg transition-[width] duration-300 ease-out" style={{ width: `${score}%`, opacity: score < 60 ? 0.4 : 0.85 }} />
      </span>
      <span className="text-right text-caption tabular-nums text-fg-2">
        {score}
        <span className="sr-only"> out of 100{note ? `: ${note}` : ""}</span>
      </span>
    </li>
  )
}
/** The overall score, large, with its verdict. */
export function Score({ value, verdict }: { value: number; verdict: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">{value}</span>
      <span className="text-caption text-fg-3">{verdict}</span>
    </span>
  )
}

function IdeaCard({ idea, film, read, kept, busy, onPreview, onSend, onKeep }: { idea: Idea; film: TemplateScript; read: Analysis; kept: boolean; busy: boolean; onPreview: () => void; onSend: () => void; onKeep: () => void }) {
  const [open, setOpen] = useState(false)
  const source = idea.from === "ai" ? "Gemini" : idea.from === "study" ? `After “${idea.ref}”` : "The rules"
  return (
    <li className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-body font-medium">{idea.title}</span>
          <span className="mt-0.5 block text-micro text-fg-3">
            {/* an idea in motion's violet, from a studied film in the scenes' azure */}
            <span aria-hidden className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${idea.from === "study" ? "bg-k-scene" : "bg-k-motion"}`} />
            {source} · {categoryName("film", idea.category)} · {film.shots.length} shots · {film.shots.reduce((a, s) => a + s.dur, 0).toFixed(1)} s
          </span>
        </span>
        <Score value={read.score} verdict={read.verdict.split(":")[0]} />
      </div>
      <p className="mt-2 max-w-[70ch] text-body text-fg-2">{idea.logline}</p>
      <ol aria-label="Its beats" className="mt-2 flex flex-wrap gap-1">
        {idea.beats.map((b, i) => (
          <li key={i} title={b.intent} className="rounded-md px-1.5 py-0.5 text-micro text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
            {beatWords(b.beat)}
          </li>
        ))}
      </ol>
      <ul aria-label="The critic" className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {read.parts.map((p) => (
          <ScoreRow key={p.id} label={p.label} score={p.score} note={p.note} />
        ))}
      </ul>
      {open && (
        <div className="mt-3 space-y-2 text-caption">
          <ul className="space-y-1">
            {read.parts.map((p) => (
              <li key={p.id} className="text-fg-2">
                <span className="font-medium text-fg">{p.label}.</span> {p.note}
              </li>
            ))}
          </ul>
          <ul className="list-disc space-y-0.5 pl-5 text-fg-3 marker:text-fg-3">
            {idea.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {read.fixes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {read.fixes.map((f, i) => (
            <li key={i} className="flex gap-1.5 text-caption text-fg-2">
              <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-warn-ink" />
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="mr-auto" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
          <Info size={14} aria-hidden />
          {open ? "Less" : "Why these scores"}
        </Button>
        <IconButton size="sm" label={kept ? `Kept: “${idea.title}”` : `Keep “${idea.title}”`} onClick={onKeep}>
          <BookmarkSimple size={14} weight={kept ? "fill" : "regular"} />
        </IconButton>
        <Button size="sm" variant="ghost" onClick={onPreview}>
          <Play size={14} aria-hidden />
          Preview
        </Button>
        <Button size="sm" disabled={busy} onClick={onSend}>
          <Tray size={14} aria-hidden />
          {busy ? "Sending…" : "Send to the inbox"}
        </Button>
      </div>
    </li>
  )
}

export function IdeasLab({ api, state, gallery, comp, refs, taste, focus, onPreview, onInbox }: { api: Api; state: LabState | null; gallery: TemplateScript[]; comp: Comp; refs: Reference[]; taste?: Taste; focus?: string; onPreview: (s: TemplateScript) => void; onInbox: () => void }) {
  const [view, setView] = useState<"new" | "kept" | "critic">("new")
  const [cat, setCat] = useState("all")
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000))
  const [ai, setAi] = useState<Idea[]>([])
  const [note, setNote] = useState("")
  const [after, setAfter] = useState(focus ?? "")
  const [kept, setKept] = useState<Idea[]>([])
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState("")
  useEffect(() => {
    if (focus) {
      setAfter(focus)
      setView("new")
    }
  }, [focus])
  useEffect(() => {
    void api<Idea[]>("ideas").then(setKept, () => {})
  }, [api])
  const films = refs.filter((r) => r.area === "film" && r.shots.length)
  const category = cat === "all" ? undefined : cat
  const rules = useMemo(() => ideasByRules(seed, 6, { category, taste }), [seed, category, taste])
  const study = useMemo(() => {
    const r = films.find((x) => x.id === after)
    return r ? ideasFromFilm(r, seed, taste) : []
  }, [after, films.length, seed, taste]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (view === "kept" ? kept : [...study, ...ai.filter((x) => !category || x.category === category), ...rules]), [view, kept, study, ai, category, rules])
  // each idea developed and read once
  const ctx = useMemo(() => ({ gallery, refs, taste }), [gallery, refs, taste])
  const read = useMemo(() => new Map(shown.map((i) => [i.id, (() => {
    const film = develop(i)
    return { film, a: analyze(film, ctx) }
  })()])), [shown, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what)
    setError("")
    setDone("")
    try {
      await job()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  const askAI = () =>
    run("ai", async () => {
      const r = await api<{ ideas: Idea[] }>("ideas", { count: 4, category, note: note.trim() || undefined, ref: after || undefined })
      setAi((x) => [...r.ideas, ...x].slice(0, 12))
    })
  const send = (i: Idea) =>
    run(`send:${i.id}`, async () => {
      const film = read.get(i.id)!.film
      const a = read.get(i.id)!.a
      await api("propose", { script: film, rationale: `${i.logline} The critic gives it ${a.score}: ${a.verdict.toLowerCase()}`, changes: i.why.map((w) => ({ what: w, why: i.from === "study" ? `From “${i.ref}”.` : i.from === "ai" ? "Gemini's idea." : "The rules' idea." })), by: i.from === "ai" ? `ai:${String((i as Idea & { by?: string }).by ?? "gemini")}` : "rules" })
      setDone(`“${i.title}” is waiting in the inbox.`)
    })
  const keep = (i: Idea) =>
    run(`keep:${i.id}`, async () => {
      setKept(kept.some((k) => k.id === i.id) ? await api<Idea[]>(`ideas/${i.id}/remove`, {}) : await api<Idea[]>("ideas/keep", { idea: i }))
    })

  const chips = [{ id: "all", name: "All" }, ...CATEGORIES.film.map((c) => ({ id: c.id, name: c.name }))]
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <Segmented
        label="Ideas"
        value={view}
        onChange={setView}
        options={[
          { value: "new", label: "New ideas" },
          { value: "kept", label: kept.length ? `Kept · ${kept.length}` : "Kept" },
          { value: "critic", label: "Critic" },
        ]}
      />
      {view === "critic" ? (
        <Critic api={api} state={state} gallery={gallery} comp={comp} refs={refs} taste={taste} onPreview={onPreview} onInbox={onInbox} />
      ) : (
        <>
          {view === "new" && (
            <section aria-label="Make ideas" className="space-y-2.5 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-body font-medium">Ideas for films</span>
                  <span className="block text-caption text-fg-3">A hook, a spine and the one visual idea that carries it. Each is developed into a film here and scored by the critic.{taste?.decisions ? " Your taste weights them." : ""}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)}>
                  <ArrowsClockwise size={14} aria-hidden />
                  Another round
                </Button>
              </div>
              <CategoryChips label="Kind of film" value={cat} onChange={setCat} options={chips} />
              <div className="grid gap-2 sm:grid-cols-[minmax(0,220px)_1fr_auto]">
                <Select aria-label="From a film the lab studied" value={after} onChange={(e) => setAfter(e.target.value)} className={`${field} h-8 min-w-0 cursor-pointer px-2 text-body`}>
                  <option value="">From any film studied</option>
                  {films.map((f) => (
                    <option key={f.id} value={f.id}>
                      After “{f.title.slice(0, 48)}”
                    </option>
                  ))}
                </Select>
                <input aria-label="What the ideas should be (optional, for Gemini)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should they be? (optional, for Gemini)" className={`${field} h-8 min-w-0 px-2.5 text-body`} />
                <Button variant="primary" disabled={!state?.key || !!busy} onClick={() => void askAI()} label={state?.key ? undefined : "Add a Gemini key in Settings first"}>
                  <Sparkle size={14} aria-hidden />
                  {busy === "ai" ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Ask Gemini"}
                </Button>
              </div>
            </section>
          )}
          {(error || done) && (
            <p role={error ? "alert" : "status"} className="flex items-start gap-1.5 text-caption text-fg-2">
              {error ? <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" /> : <Check size={14} aria-hidden className="mt-px shrink-0" />}
              {error || done}
              {done && (
                <button type="button" onClick={onInbox} className="press ml-1 font-medium text-fg underline decoration-fg-3 underline-offset-4">
                  Open the inbox
                </button>
              )}
            </p>
          )}
          {shown.length ? (
            <ul className="space-y-3">
              {shown.map((i) => {
                const r = read.get(i.id)
                return r ? <IdeaCard key={i.id} idea={i} film={r.film} read={r.a} kept={kept.some((k) => k.id === i.id)} busy={busy === `send:${i.id}`} onPreview={() => onPreview(r.film)} onSend={() => void send(i)} onKeep={() => void keep(i)} /> : null
              })}
            </ul>
          ) : (
            <div className="grid place-items-center p-8 text-center">
              <Lightbulb size={22} aria-hidden className="text-fg-3" />
              <p className="mt-2 text-body font-medium">Nothing kept yet</p>
              <p className="mt-1 max-w-[340px] text-caption text-fg-3">Keep an idea (the bookmark on its card) to come back to it here.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- the critic ---------------- */

function Critic({ api, state, gallery, comp, refs, taste, onPreview, onInbox }: { api: Api; state: LabState | null; gallery: TemplateScript[]; comp: Comp; refs: Reference[]; taste?: Taste; onPreview: (s: TemplateScript) => void; onInbox: () => void }) {
  const [pick, setPick] = useState("studio")
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const studio = useMemo(() => toScript(comp, { id: "studio-film", name: comp.brand?.name ? `${comp.brand.name} film` : "The film in the Studio" }), [comp])
  const invented = useMemo(() => Array.from({ length: 4 }, (_, i) => invent(Math.floor(Date.now() / 864e5) * 7 + i)), [])
  const options = [{ id: "studio", film: studio, label: "The film in the Studio" }, ...gallery.map((s) => ({ id: s.id, film: s, label: s.name })), ...invented.map((s) => ({ id: s.id, film: s, label: `${s.name} (invented today)` }))]
  const film = options.find((o) => o.id === pick)?.film ?? studio
  const read = useMemo(() => analyze(film, { gallery, refs, taste }), [film, gallery, refs, taste])
  const cuts = useMemo(() => cutReport(film), [film])
  const improve = async (withAI: boolean) => {
    setBusy(withAI ? "ai" : "rules")
    setMsg(null)
    try {
      const r = await api<{ proposal?: { changes: unknown[]; by: string } }>("improve", { script: film, ai: withAI })
      setMsg(r.proposal && !r.proposal.changes.length && r.proposal.by === "rules" ? { ok: true, text: "Nothing to fix by rules: it follows every guideline a machine can check." } : { ok: true, text: "Its improvement is waiting in the inbox." })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  return (
    <section aria-label="The critic" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="The film to read" value={pick} onChange={(e) => setPick(e.target.value)} className={`${field} h-8 min-w-0 flex-1 cursor-pointer px-2 text-body`}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <IconButton label="Preview it in the Studio" onClick={() => onPreview(film)}>
          <Play size={14} />
        </IconButton>
      </div>
      <div className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-body font-medium">{film.name}</span>
          <span className="text-micro tabular-nums text-fg-3">
            {film.shots.length} shots · {film.shots.reduce((a, s) => a + s.dur, 0).toFixed(1)} s
          </span>
        </div>
        <div className="mt-2">
          <Score value={read.score} verdict={read.verdict} />
        </div>
        <ul className="mt-3 space-y-2">
          {read.parts.map((p) => (
            <li key={p.id}>
              <ul>
                <ScoreRow label={p.label} score={p.score} />
              </ul>
              <p className="mt-0.5 pl-[100px] text-caption text-fg-3">{p.note}</p>
            </li>
          ))}
        </ul>
        {read.fixes.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3">
            {read.fixes.map((f, i) => (
              <li key={i} className="flex gap-1.5 text-caption text-fg-2">
                <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-warn-ink" />
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void improve(false)}>
            <Wrench size={14} aria-hidden />
            {busy === "rules" ? "Fixing…" : "Fix by rules"}
          </Button>
          <Button size="sm" disabled={!!busy || !state?.key} onClick={() => void improve(true)} label={state?.key ? undefined : "Add a Gemini key in Settings first"}>
            <Sparkle size={14} aria-hidden />
            {busy === "ai" ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Improve with AI"}
          </Button>
        </div>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className="mt-2 flex items-start gap-1.5 text-caption text-fg-2">
            {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
            {msg.text}
            {msg.ok && /inbox/.test(msg.text) && (
              <button type="button" onClick={onInbox} className="press ml-1 font-medium text-fg underline decoration-fg-3 underline-offset-4">
                Open it
              </button>
            )}
          </p>
        )}
      </div>
      {cuts.length > 0 && (
        <div>
          <h3 className="pb-1.5 text-caption font-medium text-fg-3">Cut by cut</h3>
          <ol className="divide-y rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
            {cuts.map((c) => (
              <li key={c.at} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-body">
                    {film.shots[c.at - 1].name} → {film.shots[c.at].name}
                  </span>
                  <span className="block text-caption text-fg-3">{c.why}</span>
                </span>
                <span className="text-right">
                  <span className="block text-caption text-fg-2">{cutName(c.cut).replace(/^an? /, "")}</span>
                  <span className={`block text-micro font-medium ${c.verdict === "abrupt" ? "text-warn-ink" : "text-fg-3"}`}>{c.verdict}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
