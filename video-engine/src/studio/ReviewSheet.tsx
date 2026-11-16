// The review sheet: what's waiting for a verdict, in a panel that slides in from the right over whatever you're doing.
// The newest thing is shown big (its date, its name, what it is, the film playing as it will render) with its verdict
// under it; the rest run down a timeline under it, older and fainter. Along the foot: New films, Template ideas, and
// what the taste has learned from the verdicts. Every verdict asks why (NewFilms.tsx VerdictForm; the inbox's own).
import { Problem } from "../States"
import { burstAt, Snooze } from "../fun"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowSquareOut, ArrowsClockwise, ChartLineUp, Check, FilmStrip, Lightbulb, Play, X } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, IconButton } from "../ui"
import { Glyph } from "../Thinking"
import { DIRECTIONS } from "./artist"
import { call, copyOf, FilmPlayer, kindOf, makeBatch, Making, seconds, styleOf, useLearned, VerdictForm, type LabFilms, type Screened } from "./NewFilms"
import { StoryStrip } from "./ArtistDialog"
import type { TemplateScript } from "./script"
import type { Taste } from "./taste"

type Idea = { id: string; created: string; kind: "improve" | "new" | "effect"; script: TemplateScript; rationale: string; changes: { what: string }[]; status: string; checker?: string; reason?: string; decided?: string }
type Tab = "films" | "ideas" | "learned"

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }).toUpperCase() : "")
const fresh = (iso?: string) => !!iso && Date.now() - new Date(iso).getTime() < 36 * 3600 * 1000

export function ReviewSheet({ open, onClose, films, taste, onPreview, onChanged, onLab }: { open: boolean; onClose: () => void; films?: LabFilms; taste?: Taste; onPreview: (s: TemplateScript) => void; onChanged: () => void; onLab: () => void }) {
  const [tab, setTab] = useState<Tab>("films")
  const [list, setList] = useState<Screened[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [at, setAt] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([call<Screened[]>("screening"), call<Idea[]>("proposals")])
      setList(l)
      setIdeas(p.filter((x) => !x.checker))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [open, onClose])
  const waiting = list.filter((f) => f.status === "waiting")
  const pending = ideas.filter((p) => p.status === "pending")
  const make = async () => {
    if (!films) return
    setMaking(true)
    setError("")
    try {
      const next = await makeBatch(films)
      setList(next)
      setAt(next[0]?.id ?? null)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMaking(false)
    }
  }

  return (
    <aside
      aria-label="To review"
      data-open={open}
      inert={!open}
      className="side-sheet panel fixed bottom-3 right-3 top-[60px] z-[70] flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[22px]"
    >
      <div className="flex items-start gap-2 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-ui font-semibold">To review</h2>
          <p className="mt-0.5 text-caption text-fg-3">Keep or pass, and say why: it's how the next ones get better.</p>
        </div>
        <IconButton size="sm" label="Open the Lab" onClick={onLab}>
          <ArrowSquareOut size={15} />
        </IconButton>
        <IconButton size="sm" label="Close" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
        {tab === "films" && (
          <Films
            list={list}
            at={at}
            setAt={setAt}
            films={films}
            making={making}
            make={() => void make()}
            onPreview={onPreview}
            onDecided={(next) => {
              setList(next)
              setAt(next.find((f) => f.status === "waiting")?.id ?? null)
              onChanged()
            }}
          />
        )}
        {tab === "ideas" && (
          <Ideas
            list={ideas}
            onPreview={onPreview}
            onDecided={() => {
              void load()
              onChanged()
            }}
          />
        )}
        {tab === "learned" && <Learned taste={taste} />}
      </div>

      {/* the foot: what there is to review, and what it learned */}
      <nav aria-label="Review" className="grid shrink-0 grid-cols-3 border-t px-2 pt-1.5">
        {(
          [
            ["films", "New films", FilmStrip, waiting.length],
            ["ideas", "Template ideas", Lightbulb, pending.length],
            ["learned", "What it learned", ChartLineUp, 0],
          ] as const
        ).map(([id, label, I, n]) => (
          <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`press relative flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors duration-150 ${tab === id ? "text-fg" : "text-fg-3 hover:text-fg"}`}>
            <I size={20} aria-hidden />
            {label}
            {n > 0 && <span className="absolute right-[calc(50%-26px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-semibold tabular-nums text-surface">{n}</span>}
          </button>
        ))}
      </nav>
      <p className="shrink-0 pb-2.5 pt-1 text-center text-micro text-fg-3">Made by the Artist · learns from every verdict</p>
    </aside>
  )
}

/* ---------------- new films: the newest big, the rest down a timeline ---------------- */

function Films({ list, at, setAt, films, making, make, onPreview, onDecided }: { list: Screened[]; at: string | null; setAt: (id: string) => void; films?: LabFilms; making: boolean; make: () => void; onPreview: (s: TemplateScript) => void; onDecided: (l: Screened[]) => void }) {
  const lead = list.find((f) => f.id === at) ?? list.find((f) => f.status === "waiting") ?? list[0]
  const rest = list.filter((f) => f !== lead).slice(0, 24)
  return (
    <>
      {making ? (
        <div className="pt-1">
          <Making />
        </div>
      ) : (
        <Button className="w-full" onClick={make} disabled={!films}>
          <ArrowsClockwise size={14} aria-hidden /> Make 4 new films
        </Button>
      )}
      {lead && !making && (
        <article key={lead.id} className="fade-in mt-5">
          <p className="text-micro font-medium tracking-[0.06em] text-fg-3">
            {day(lead.created)}
            {lead.status === "waiting" && fresh(lead.created) && <span className="text-good-ink"> · NEW</span>}
            {lead.status !== "waiting" && <span> · {lead.status === "kept" ? "KEPT" : "PASSED"}</span>}
          </p>
          <h3 className="mt-1 text-[17px] font-semibold leading-6 tracking-[-0.01em]">{lead.script.name}</h3>
          <p className="mt-1 text-body text-fg-3">
            {kindOf(lead.script)} in {styleOf(lead.script)}, {lead.script.shots.length} shots, {seconds(lead.script).toFixed(0)} s.
          </p>
          <FilmPlayer films={films} f={lead} className="mt-3" tall={360} />
          <StoryStrip film={lead.script} copy={copyOf(films)} className="mt-2" />
          <div className="mt-4">
            <VerdictForm key={lead.id} f={lead} onDecided={onDecided} />
          </div>
          <button type="button" onClick={() => onPreview(lead.script)} className="press mt-3 flex items-center gap-1.5 text-caption font-medium text-fg-2 hover:text-fg">
            <Play size={12} aria-hidden /> Open it in the Studio
          </button>
        </article>
      )}
      {rest.length > 0 && <Timeline items={rest.map((f) => ({ id: f.id, date: day(f.created), title: f.script.name, text: `${kindOf(f.script)} in ${styleOf(f.script)}. ${f.why ? `“${f.why}”` : f.script.summary}`, status: f.status === "waiting" ? "" : f.status === "kept" ? "Kept" : "Passed" }))} onPick={setAt} />}
      {!list.length && !making && <Snooze title="Nothing to review" sub="The Artist is napping. Wake it with Make 4 new films: each a different kind and art direction." />}
    </>
  )
}

/** Older things down a line: a dot each, the date, the name, a faded line of what it is. */
function Timeline({ items, onPick }: { items: { id: string; date: string; title: string; text: string; status: string }[]; onPick: (id: string) => void }) {
  return (
    <ol className="mt-6">
      {items.map((x, i) => (
        <li key={x.id} className="relative pl-6">
          {/* the line runs from this dot to the next */}
          {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[3px] top-3 w-px border-l border-dashed border-line-strong" />}
          <span aria-hidden className={`absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full ${x.status ? "bg-fg-3" : "bg-fg"}`} />
          <button type="button" onClick={() => onPick(x.id)} className="press group block w-full pb-5 text-left">
            <span className="flex items-center gap-2 text-micro font-medium tracking-[0.06em] text-fg-3">
              {x.date}
              {x.status && <span className="rounded-full bg-surface-2 px-1.5 py-px normal-case tracking-normal">{x.status}</span>}
            </span>
            <span className="mt-0.5 block text-ui font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{x.title}</span>
            <span className="mt-0.5 line-clamp-2 block text-caption text-fg-3 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">{x.text}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

/* ---------------- template ideas: the nightly run's proposals, approved or rejected with why ---------------- */

function Ideas({ list, onPreview, onDecided }: { list: Idea[]; onPreview: (s: TemplateScript) => void; onDecided: () => void }) {
  const [at, setAt] = useState<string | null>(null)
  const pending = list.filter((p) => p.status === "pending")
  const lead = list.find((p) => p.id === at) ?? pending[0]
  const rest = (pending.length ? pending : list).filter((p) => p !== lead).slice(0, 24)
  if (!lead) return <p className="mt-6 text-center text-caption text-fg-3">No template ideas waiting. The nightly run proposes them, or the Lab's Templates.</p>
  return (
    <>
      <IdeaLead key={lead.id} p={lead} onPreview={onPreview} onDecided={onDecided} />
      {rest.length > 0 && <Timeline items={rest.map((p) => ({ id: p.id, date: day(p.created), title: p.script.name, text: p.rationale, status: p.status === "pending" ? "" : p.status === "approved" ? "Approved" : p.status === "rejected" ? "Rejected" : "Replaced" }))} onPick={setAt} />}
    </>
  )
}

function IdeaLead({ p, onPreview, onDecided }: { p: Idea; onPreview: (s: TemplateScript) => void; onDecided: () => void }) {
  const [asking, setAsking] = useState<"approve" | "reject" | null>(null)
  const [reason, setReason] = useState("")
  const goRef = useRef<HTMLSpanElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const decide = async () => {
    if (!asking) return
    setBusy(true)
    setError("")
    try {
      await call(`proposals/${p.id}/${asking}`, { reason })
      if (asking === "approve") burstAt(goRef.current, { count: 40 })
      onDecided()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="fade-in mt-1">
      <p className="text-micro font-medium tracking-[0.06em] text-fg-3">
        {day(p.created)}
        {p.status === "pending" && fresh(p.created) && <span className="text-good-ink"> · NEW</span>}
        <span> · {p.kind === "improve" ? "AN IMPROVEMENT" : p.kind === "effect" ? "A NEW EFFECT" : "A NEW TEMPLATE"}</span>
      </p>
      <h3 className="mt-1 text-[17px] font-semibold leading-6 tracking-[-0.01em]">{p.script.name}</h3>
      <p className="mt-1 text-body text-fg-3">{p.rationale}</p>
      {p.changes.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3">
          {p.changes.slice(0, 4).map((c, i) => (
            <li key={i} className="flex gap-2 text-caption text-fg-2">
              <Check size={12} aria-hidden className="mt-0.5 shrink-0 text-fg-3" />
              {c.what}
            </li>
          ))}
        </ul>
      )}
      {p.kind !== "effect" && (
        <button type="button" onClick={() => onPreview(p.script)} className="press mt-3 flex items-center gap-1.5 text-caption font-medium text-fg-2 hover:text-fg">
          <Play size={12} aria-hidden /> Preview in the Studio
        </button>
      )}
      {p.status === "pending" &&
        (asking ? (
          <div className="fade-in mt-4 space-y-2">
            <textarea autoFocus rows={3} aria-label="Why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={asking === "reject" ? "Why not? The next run reads it and won't propose it again." : "Why approve it? What works is what the next run does more of."} className={`${field} block w-full resize-none px-3 py-2.5 text-body`} />
            {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <span ref={goRef}>
                <Button variant="primary" disabled={busy || reason.trim().length < 3} onClick={() => void decide()}>
                  {asking === "reject" ? "Reject" : "Approve"}
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => setAsking("reject")}>
              <X size={16} aria-hidden /> Reject
            </Button>
            <Button size="lg" onClick={() => setAsking("approve")}>
              <Check size={16} aria-hidden /> Approve
            </Button>
          </div>
        ))}
    </article>
  )
}

/* ---------------- what it learned ---------------- */

function Learned({ taste }: { taste?: Taste }) {
  const line = useLearned(taste)
  const notes = taste?.reviews?.notes ?? []
  const top = useMemo(() => Object.entries(taste?.prefer.styles ?? {}).sort((a, b) => b[1] - a[1]), [taste])
  return (
    <div className="space-y-5 pt-1">
      <p className="text-body text-fg-2">{line || "Nothing decisive yet: a few verdicts and it starts to lean."}</p>
      {top.length > 0 && (
        <section>
          <h3 className="mb-2 text-micro font-medium tracking-[0.06em] text-fg-3">ART DIRECTIONS</h3>
          <ul className="space-y-2">
            {top.map(([id, w]) => (
              <li key={id} className="flex items-center gap-3 text-body">
                <span className="w-28 truncate">{DIRECTIONS.find((d) => d.id === id)?.name ?? id}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-fg" style={{ width: `${Math.max(4, Math.min(100, (w / 2) * 100))}%`, opacity: w >= 1 ? 1 : 0.4 }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(taste?.rules.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-micro font-medium tracking-[0.06em] text-fg-3">RULES FROM YOUR REASONS</h3>
          <ul className="space-y-2">
            {taste!.rules.slice(0, 6).map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-2 p-3">
                <p className="text-body font-medium">{r.label}</p>
                {r.quotes[0] && <p className="mt-0.5 text-caption text-fg-3">“{r.quotes[0]}”</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <section>
          <h3 className="mb-2 text-micro font-medium tracking-[0.06em] text-fg-3">YOUR LATEST VERDICTS</h3>
          <Timeline items={notes.slice(0, 8).map((n, i) => ({ id: String(i), date: day(n.at), title: n.kind === "accept" ? "Kept" : "Sent back", text: [n.why, n.better].filter(Boolean).join(" · ") || [...n.praise, ...n.improve].join(", "), status: "" }))} onPick={() => {}} />
        </section>
      )}
      <p className="flex items-center gap-2 text-caption text-fg-3">
        <Glyph variant="breathe" size={16} /> The next batch is directed by all of this.
      </p>
    </div>
  )
}
