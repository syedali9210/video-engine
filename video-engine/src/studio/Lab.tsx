// The template lab, the admin's side:
//   - the inbox: what the nightly AI run (or you) proposed, each with why, what it changed, what the checker says, and
//     its shots against the version it improves; approved into the gallery, or rejected with a reason the next run
//     reads;
//   - ideas for films, made and read by the critic (IdeasLab.tsx);
//   - replicas: a launch film rebuilt shot for shot, measured (Replicate.tsx);
//   - the film templates and the canvas's effects as they stand;
//   - the films it studied, each analysed (References.tsx);
//   - what it learned from your decisions, and how its own generators are doing (Learning.tsx);
//   - the guidelines every proposal is judged by, the runs, and the settings (the Gemini key, the model, the night).
// The engine's dev server does the work (server/lab.ts).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowsClockwise, Bell, BookOpen, PencilSimpleLine, ChartLineUp, Check, ClockCounterClockwise, Copy, FilmSlate, FilmStrip, Flask, Gear, Info, Lightbulb, ListChecks, Play, Sparkle, Tray, WarningCircle, Wrench, X } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, Dialog, IconButton, Segmented, Switch, Tabs, useMedia, Select } from "../ui"
import EFFECTS_GUIDE from "../canvas/effects.md?raw"
import { EffectPreview, useEffectPresets } from "../canvas/EffectViews"
import type { EffectPreset } from "../canvas/effects"
import { TEMPLATES, type Comp } from "./comp"
import { FilmPoster, ScriptPoster } from "../FilmPoster"
import { Problem } from "../States"
import GUIDELINES from "./lab/guidelines.md?raw"
import { References } from "./References"
import { lintScript, toScript, type Finding, type TemplateScript } from "./script"
import { IdeasLab, Score, ScoreRow } from "./IdeasLab"
import { Replicate } from "./Replicate"
import { Learning } from "./Learning"
import { WorkApi } from "./WorkApi"
import { Briefs } from "./Briefs"
import { NewFilms, PageHead, type LabFilms } from "./NewFilms"
import { Glyph, Thinking } from "../Thinking"
import { Gloss } from "../Gloss"
import { BrandRow, PanelFoot } from "../shell"
import type { Taste } from "./taste"
import type { Fidelity } from "./replica"
import type { Reference } from "../refs"

type Run = { id: string; started: string; finished?: string; trigger: "nightly" | "manual" | "studio"; model: string; ok?: boolean; error?: string; note?: string; proposals: number; tokens?: { in?: number; out?: number } }
export type LabState = {
  key: boolean
  keyHint: string
  model: string
  enabled: boolean
  hour: number
  perNight: number
  research: boolean
  watch: number
  effects: number
  studying: boolean
  references: number
  lastRun?: string
  nextRun: string
  running: boolean
  pending: number
  unseen: number
  lastSeen?: string
  lastResult?: Run
  /** the model's day of requests used up, and when it's back */
  quota?: { model: string; until: string } | null
  /** New films waiting for a verdict */
  films?: number
}
type Change = { what: string; why: string; rule?: string }
type Proposal = { id: string; created: string; kind: "improve" | "new" | "effect"; base?: string; script: TemplateScript; effect?: EffectPreset; changes: Change[]; rationale: string; checker?: string; lint: Finding[]; status: "pending" | "approved" | "rejected" | "superseded"; reason?: string; decided?: string; by: string; run?: string; fidelity?: Fidelity }
type Tab = "films" | "inbox" | "ideas" | "briefs" | "replicate" | "templates" | "effects" | "references" | "learning" | "guidelines" | "runs" | "settings"
/** What each of the Lab's pages is for, in a line or two (New films writes its own). */
const LAB_PAGES: Partial<Record<Tab, { title: string; sub: string }>> = {
  inbox: { title: "Template ideas", sub: "What the nightly run proposed, each with what it changed and why. Approve or reject, and say why: the next run reads it." },
  ideas: { title: "Ideas", sub: "A hook, a spine and a signature before a film exists, read by the critic. Develop the good ones into films." },
  briefs: { title: "Directing briefs", sub: "What you want from each template, in one shape. The generator writes takes within it; each is checked, weighed by your taste and ranked." },
  replicate: { title: "Replicate a film", sub: "Pick a launch film you love. It's measured shot by shot and rebuilt as a template you can edit." },
  templates: { title: "Templates", sub: "The film templates as they stand, and how the checker reads each one." },
  effects: { title: "Effects", sub: "The canvas's background effects, and proposals for new ones." },
  references: { title: "Studied films", sub: "Films, pages and creatives the lab has torn down into shots, titles and grounds." },
  learning: { title: "What it learned", sub: "What your decisions taught the taste, and how each of the engine's generators is doing." },
  guidelines: { title: "Guidelines", sub: "The rules every proposal is judged by." },
  runs: { title: "Runs", sub: "Every run of the AI: when, with which model, and what it made." },
  settings: { title: "Settings", sub: "The AI keys: the Work API the film work runs on, and the Lab's own, with when its nightly run happens." },
}

/** The lab's sections, in the order the work goes: review what was made, make more, study films, see what it learned. */
const SECTIONS: { name: string; tabs: { value: Tab; label: string; icon: typeof Flask }[] }[] = [
  {
    name: "Review",
    tabs: [
      { value: "films", label: "New films", icon: FilmStrip },
      { value: "inbox", label: "Template ideas", icon: Tray },
    ],
  },
  {
    name: "Make",
    tabs: [
      { value: "ideas", label: "Ideas", icon: Lightbulb },
      { value: "briefs", label: "Directing briefs", icon: PencilSimpleLine },
      { value: "replicate", label: "Replicate a film", icon: Copy },
      { value: "templates", label: "Templates", icon: FilmSlate },
      { value: "effects", label: "Effects", icon: Sparkle },
    ],
  },
  { name: "Study", tabs: [{ value: "references", label: "Studied films", icon: BookOpen }] },
  {
    name: "Improve",
    tabs: [
      { value: "learning", label: "What it learned", icon: ChartLineUp },
      { value: "guidelines", label: "Guidelines", icon: ListChecks },
      { value: "runs", label: "Runs", icon: ClockCounterClockwise },
    ],
  },
]
/** Gemini's text models, for the list before a key can fetch the account's own */
const KNOWN_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"]

async function api<T>(path: string, body?: object): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/__lab/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  } catch {
    throw new Error("The lab runs on the engine's server: start it with npm run dev.")
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
function ago(iso?: string) {
  if (!iso) return "never"
  const s = (new Date(iso).getTime() - Date.now()) / 1000
  const [n, unit] = Math.abs(s) < 60 ? [s, "second"] : Math.abs(s) < 3600 ? [s / 60, "minute"] : Math.abs(s) < 86400 ? [s / 3600, "hour"] : [s / 86400, "day"]
  return rtf.format(Math.round(n), unit as Intl.RelativeTimeFormatUnit)
}
const clock = (h: number) => `${String(h).padStart(2, "0")}:00`
const length = (s: TemplateScript) => s.shots.reduce((a, x) => a + x.dur, 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
/** the app's launch films (their scripts carry the film's own id) */
const FILM_IDS = new Set(TEMPLATES.filter((t) => t.film).map((t) => t.id))

/** The lab's state and the approved scripts, kept fresh while the engine is open; a system notification when new ideas
    land while it's in the background (if the admin allowed them). */
export function useLab() {
  const [state, setState] = useState<LabState | null>(null)
  const [approved, setApproved] = useState<TemplateScript[]>([])
  const [taste, setTaste] = useState<Taste | undefined>()
  const told = useRef(0)
  const refresh = useCallback(async () => {
    try {
      const [s, a, t] = await Promise.all([api<LabState>("state"), api<TemplateScript[]>("scripts"), api<Taste>("taste").catch(() => undefined)])
      setState(s)
      setApproved(Array.isArray(a) ? a : [])
      setTaste(t)
      if (s.unseen > told.current && document.hidden && "Notification" in window && Notification.permission === "granted")
        new Notification("Template lab", { body: `${plural(s.unseen, "new template idea")} to review`, tag: "anim-engine-lab" })
      told.current = s.unseen
    } catch {
      // no server (a static build): no lab
    }
  }, [])
  useEffect(() => {
    // the Lab lives on the dev server: a build for the web doesn't ask for it
    if (!import.meta.env.DEV) return
    void refresh()
    const t = setInterval(() => void refresh(), 10 * 60000)
    return () => clearInterval(t)
  }, [refresh])
  return { state, setState, approved, taste, refresh }
}

/** The morning notice: what the night's run proposed, until it's looked at. */
export function LabNotice({ state, onReview, onDismiss }: { state: LabState | null; onReview: () => void; onDismiss: () => void }) {
  if (!state?.unseen) return null
  const night = state.lastResult?.trigger === "nightly"
  return (
    <div role="status" className="notice panel fixed bottom-4 right-4 z-[85] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-[22px] p-5 shadow-[var(--in-hi),var(--sh-lg)]">
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="press absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
        <X size={14} aria-hidden />
      </button>
      <Gloss icon={Flask} tone="light" size={52} />
      <p className="mt-4 flex flex-wrap items-center gap-2 text-ui font-semibold">
        {plural(state.unseen, "new template idea")}
        <span className="rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "color-mix(in srgb, var(--brand-3) 16%, transparent)", color: "var(--brand-3)" }}>
          {night ? "From last night" : "New"}
        </span>
      </p>
      <p className="mt-1.5 text-body text-fg-3">The AI studied launch films and wrote these. Nothing joins the gallery until you approve it, and it asks why.</p>
      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onReview} className="press btn btn-ink h-9 rounded-full px-5 text-body font-medium">
          Review them
        </button>
        <button type="button" onClick={onDismiss} className="press h-9 rounded-full px-4 text-body font-medium text-fg-2 transition-colors duration-150 hover:bg-surface-2 hover:text-fg">
          Maybe later
        </button>
      </div>
    </div>
  )
}

export function LabDialog({
  open,
  tab: at,
  onClose,
  state,
  setState,
  scripts,
  comp,
  onPreview,
  onChanged,
  page,
  films,
  foot,
}: {
  /** a place of its own (a desktop's), not a dialog */
  page?: boolean
  /** the sidebar's foot (theme, tips, keys) */
  foot?: ReactNode
  /** what New films makes films with (the app's Artist and player) */
  films?: LabFilms
  open: boolean
  /** the tab it opens at (else where it was left) */
  tab?: string
  onClose: () => void
  state: LabState | null
  setState: (s: LabState) => void
  /** the templates as they stand: the seeds, with what was approved over them */
  scripts: TemplateScript[]
  comp: Comp
  onPreview: (s: TemplateScript) => void
  /** something was approved: the gallery has to fetch it */
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>("films")
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [refs, setRefs] = useState<Reference[]>([])
  const [taste, setTaste] = useState<Taste | undefined>()
  // a studied film handed to Ideas or Replicate from the Study tab (taken once)
  const [ideasFor, setIdeasFor] = useState<string | undefined>()
  const [replicaFor, setReplicaFor] = useState<string | undefined>()
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    try {
      const [p, r, s, f, t] = await Promise.all([api<Proposal[]>("proposals"), api<Run[]>("runs"), api<LabState>("state"), api<Reference[]>("references"), api<Taste>("taste").catch(() => undefined)])
      setProposals(p)
      setRuns(r)
      setState(s)
      setRefs(f)
      setTaste(t)
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }, [setState])
  useEffect(() => {
    if (!open) return
    if (at) setTab(at as Tab)
    void load()
    // the admin has looked: the morning notice goes
    if (state?.unseen) void api<LabState>("seen", {}).then(setState, () => {})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const pending = proposals.filter((p) => p.status === "pending")
  const count = (t: Tab) => (t === "inbox" ? pending.length : t === "films" ? (state?.films ?? 0) : 0)
  const pill = (n: number) => (n ? <span className="rounded-full bg-fg px-1.5 text-micro font-medium tabular-nums text-surface">{n}</span> : undefined)
  const tabs: { value: Tab; label: string; badge?: ReactNode }[] = [...SECTIONS.flatMap((g) => g.tabs.map((t) => ({ value: t.value, label: t.label, badge: pill(count(t.value)) }))), { value: "settings", label: "Settings" }]
  const panel = (
    <div id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
      {tab === "films" && <NewFilms films={films} taste={taste} gallery={scripts} onPreview={onPreview} onChanged={() => void load().then(onChanged)} />}
      {tab === "inbox" && <Inbox proposals={proposals} scripts={scripts} reload={load} onPreview={onPreview} onChanged={onChanged} setTab={setTab} state={state} />}
      {tab === "templates" && <Templates scripts={scripts} comp={comp} state={state} onPreview={onPreview} onProposed={() => void load().then(() => setTab("inbox"))} />}
      {tab === "effects" && <Effects state={state} onProposed={() => void load().then(() => setTab("inbox"))} />}
      {tab === "ideas" && <IdeasLab api={api} state={state} gallery={scripts} comp={comp} refs={refs} taste={taste} focus={ideasFor} onPreview={onPreview} onInbox={() => void load().then(() => setTab("inbox"))} />}
      {tab === "briefs" && <Briefs films={films} taste={taste} onPreview={onPreview} onInbox={() => void load().then(() => setTab("inbox"))} />}
      {tab === "replicate" && <Replicate api={api} state={state} setState={setState} focus={replicaFor} onTaken={() => setReplicaFor(undefined)} onPreview={onPreview} onInbox={() => void load().then(() => setTab("inbox"))} />}
      {tab === "references" && (
        <References
          api={api}
          state={state}
          setState={setState}
          onInbox={() => void load().then(() => setTab("inbox"))}
          onIdeas={(id) => {
            setIdeasFor(id)
            setTab("ideas")
          }}
          onReplicate={(id) => {
            setReplicaFor(id)
            setTab("replicate")
          }}
        />
      )}
      {tab === "learning" && <Learning api={api} state={state} gallery={scripts} refs={refs} taste={taste} onReload={() => void load()} onPreview={onPreview} onInbox={() => void load().then(() => setTab("inbox"))} />}
      {tab === "guidelines" && <Guidelines />}
      {tab === "runs" && <Runs runs={runs} proposals={proposals} />}
      {tab === "settings" && <Settings state={state} setState={setState} reload={load} />}
    </div>
  )
  const alert = error && <Problem compact error={error} onRetry={() => void load()} className="mx-5 mt-3 rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />
  if (page) {
    const item = (t: { value: Tab; label: string; icon: typeof Flask }) => {
      const on = tab === t.value
      const n = count(t.value)
      return (
        <li key={t.value}>
          <button
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => setTab(t.value)}
            className={`press flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-ui transition-[color,background-color,box-shadow] duration-150 ${on ? "bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(0_0_0/0.12)] dark:bg-surface-2" : "text-fg-2 hover:bg-surface-2/70 hover:text-fg"}`}
          >
            <t.icon size={17} aria-hidden className={`shrink-0 ${on ? "text-fg" : "text-fg-3"}`} />
            <span className="mr-auto truncate">{t.label}</span>
            {n > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-sel px-1.5 text-[11px] font-semibold tabular-nums text-white">{n}</span>}
          </button>
        </li>
      )
    }
    const head = LAB_PAGES[tab]
    return (
      <div className="flex min-w-0 flex-1">
        <nav aria-label="Lab" className="flex w-[256px] shrink-0 flex-col border-r bg-canvas">
          <div className="px-5 pb-1 pt-8">
            <h1 className="flex items-center gap-2.5 text-section font-semibold tracking-[-0.02em]">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
                <Flask size={17} />
              </span>
              Lab
            </h1>
            <p className="mt-2 text-body text-fg-3">Where the engine learns your taste</p>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {SECTIONS.map((g) => (
              <div key={g.name} className="pt-5">
                <p className="px-2.5 pb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-fg-3">{g.name}</p>
                <ul className="space-y-0.5">{g.tabs.map(item)}</ul>
              </div>
            ))}
            <ul className="mt-5 border-t pt-4">{item({ value: "settings", label: "Settings", icon: Gear })}</ul>
          </div>
          {/* the nightly run, at a glance */}
          <div className="shrink-0 border-t px-5 py-4 pb-6">
            {state?.running ? (
              <Thinking variant="globe" size={16} label="Working on new templates…" />
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-fg-3">
                <span className={`h-2 w-2 rounded-full ${state?.key && state.enabled ? "bg-good" : "bg-fg-3/50"}`} aria-hidden />
                {state?.key && state.enabled ? `Runs tonight at ${clock(state.hour)}` : "The nightly run is off"}
              </p>
            )}
          </div>
        </nav>
        <main aria-label="Lab" className="page-ground flex min-w-0 flex-1 flex-col overflow-hidden pb-[92px]">
          {tab !== "films" && head && <PageHead title={head.title} sub={head.sub} />}
          {tab !== "films" && <div className="border-b" />}
          {alert}
          {panel}
        </main>
      </div>
    )
  }
  return (
    <Dialog open={open} onClose={onClose} label="Template lab" className="modal wide">
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-3 py-3 pl-5 pr-3">
          <div className="min-w-0">
            <h2 className="text-ui font-semibold">Template lab</h2>
            <p className="text-caption text-fg-3">
              {state?.key && state.enabled ? `Every night at ${clock(state.hour)} the AI ${state.research ? "studies launch films, then " : ""}proposes better templates and effects by the guidelines.` : "Proposes better templates and effects by the guidelines."} Nothing joins the gallery until you approve it.
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        {/* on a narrow dialog the row of sections scrolls sideways */}
        <div className="scroll-thin shrink-0 overflow-x-auto">
          <Tabs id="lab" label="Template lab" value={tab} onChange={setTab} options={tabs} />
        </div>
        {alert}
        {panel}
      </div>
    </Dialog>
  )
}

/* ---------------- inbox ---------------- */

function Inbox({ proposals, scripts, reload, onPreview, onChanged, setTab, state }: { proposals: Proposal[]; scripts: TemplateScript[]; reload: () => Promise<void>; onPreview: (s: TemplateScript) => void; onChanged: () => void; setTab: (t: Tab) => void; state: LabState | null }) {
  const wide = useMedia("(min-width: 768px)")
  const [past, setPast] = useState(false)
  // what the checker refused never reached the admin: the Runs tab counts it
  const list = proposals.filter((p) => !p.checker && (past ? p.status !== "pending" : p.status === "pending"))
  const [selId, setSel] = useState<string | null>(null)
  const sel = list.find((p) => p.id === selId) ?? (wide ? list[0] : undefined)
  const empty = (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-[340px]">
        <Flask size={22} aria-hidden className="mx-auto text-fg-3" />
        <p className="mt-2 text-body font-medium">{past ? "Nothing decided yet" : "Nothing waiting"}</p>
        <p className="mt-1 text-caption text-fg-3">
          {past
            ? "What you approve or reject shows here, with your reasons."
            : state?.key
              ? `The next run is ${ago(state.nextRun)}. You can ask for one now in Settings, or improve a template from Templates.`
              : "Add your Gemini API key in Settings for the nightly run. Fix by rules works without one, from Templates."}
        </p>
        {!state?.key && !past && (
          <Button size="sm" className="mt-3" onClick={() => setTab("settings")}>
            Open Settings
          </Button>
        )}
      </div>
    </div>
  )
  const listPane = (
    <div className="flex min-h-0 flex-col md:border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Segmented
          size="sm"
          label="Show"
          value={past ? "past" : "waiting"}
          onChange={(v) => {
            setPast(v === "past")
            setSel(null)
          }}
          options={[
            { value: "waiting", label: "Waiting" },
            { value: "past", label: "Decided" },
          ]}
        />
      </div>
      <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
        {list.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setSel(p.id)}
              aria-current={sel?.id === p.id}
              className={`press w-full rounded-lg px-2.5 py-2 text-left ${sel?.id === p.id ? "bg-surface-2" : "hover:bg-surface-2"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body font-medium">{p.script.name}</span>
                <span className="shrink-0 text-micro text-fg-3">{ago(p.created)}</span>
              </span>
              <span className="mt-0.5 block truncate text-caption text-fg-3">
                {/* a new template in motion's violet, an improvement in the scenes' azure, an effect in its coral */}
                <span aria-hidden className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${p.kind === "effect" ? "bg-k-effect" : p.kind === "new" ? "bg-k-motion" : "bg-k-scene"}`} />
                {p.kind === "effect" ? (p.base ? `Effect · improves v${p.script.version - 1}` : "New effect") : p.kind === "new" ? "New template" : `Improves v${p.script.version - 1}`} · {p.status === "pending" ? plural(p.changes.length, "change") : p.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
  if (!wide)
    return sel ? (
      <Detail key={sel.id} p={sel} base={scripts.find((s) => s.id === sel.base)} reload={reload} onPreview={onPreview} onChanged={onChanged} onBack={() => setSel(null)} />
    ) : list.length ? (
      listPane
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        {listPane}
        {empty}
      </div>
    )
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr]">
      {listPane}
      {sel ? <Detail key={sel.id} p={sel} base={scripts.find((s) => s.id === sel.base)} reload={reload} onPreview={onPreview} onChanged={onChanged} /> : empty}
    </div>
  )
}

function Detail({ p, base, reload, onPreview, onChanged, onBack }: { p: Proposal; base?: TemplateScript; reload: () => Promise<void>; onPreview: (s: TemplateScript) => void; onChanged: () => void; onBack?: () => void }) {
  // approving and rejecting both ask why: the reason is what the taste and the next run learn from
  const [asking, setAsking] = useState<"approve" | "reject" | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const decide = async (act: "approve" | "reject") => {
    setBusy(true)
    setError("")
    try {
      await api(`proposals/${p.id}/${act}`, { reason })
      if (act === "approve") onChanged()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const findings = p.lint.filter((f) => f.level !== "info")
  const notes = p.lint.filter((f) => f.level === "info")
  const mark = (i: number) => (!base ? "" : !base.shots[i] ? "Added" : JSON.stringify(base.shots[i]) !== JSON.stringify(p.script.shots[i]) ? "Changed" : "")
  const removed = base ? Math.max(0, base.shots.length - p.script.shots.length) : 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {onBack && (
          <Button size="sm" variant="ghost" className="-ml-2" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden />
            All proposals
          </Button>
        )}
        <div>
          <p className="text-caption text-fg-3">
            {p.kind === "effect" ? (p.base ? `An effect · ${p.base} · v${p.script.version - 1} → v${p.script.version}` : "A new effect for the canvas") : p.kind === "new" ? "A new template" : `${base?.name ?? p.base} · v${p.script.version - 1} → v${p.script.version}`} ·{" "}
            {p.by.startsWith("ai:") ? p.by.slice(3) : "the rules, without AI"} · {ago(p.created)}
          </p>
          <h3 className="mt-1 text-ui font-semibold">{p.script.name}</h3>
          <p className="mt-1.5 max-w-[60ch] text-body text-fg-2">{p.rationale || p.script.summary}</p>
          {p.status !== "pending" && (
            <p className="mt-2 text-caption text-fg-3">
              {p.status === "approved" ? "Approved" : p.status === "superseded" ? "Superseded: another version was approved" : "Rejected"} {ago(p.decided)}
              {p.reason ? `: “${p.reason}”` : ""}
            </p>
          )}
        </div>
        {p.changes.length > 0 && (
          <section aria-label="What changed">
            <h4 className="pb-1.5 text-caption font-medium text-fg-3">What changed</h4>
            <ul className="space-y-2">
              {p.changes.map((c, i) => (
                <li key={i} className="flex gap-2.5">
                  <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-fg-3" />
                  <span className="min-w-0">
                    <span className="block text-body">{c.what}</span>
                    <span className="block text-caption text-fg-3">
                      {c.why}
                      {c.rule && <span className="mono ml-1.5 text-micro">{c.rule}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {p.fidelity && (
          <section aria-label="How close it is to the film" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
            <Score value={p.fidelity.score} verdict="% close to the film it replicates" />
            <ul className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {p.fidelity.parts.map((x) => (
                <ScoreRow key={x.id} label={x.label} score={x.score} note={x.note} />
              ))}
            </ul>
          </section>
        )}
        {p.effect && (
          <section aria-label="The effect">
            <EffectPreview effect={p.effect.effect} className="relative block aspect-[16/9] w-full max-w-[560px] overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--line)]" />
            {p.effect.summary && <p className="mt-2 max-w-[60ch] text-body text-fg-2">{p.effect.summary}</p>}
            {p.effect.why.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-caption text-fg-3 marker:text-fg-3">
                {p.effect.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <p className="mono mt-2 text-micro text-fg-3">
              {p.effect.effect.cell} · {p.effect.effect.source} · {p.effect.effect.size}px · {p.effect.effect.colors.join(" ")}
            </p>
          </section>
        )}
        <section aria-label="Shots" hidden={p.kind === "effect"}>
          <h4 className="pb-1.5 text-caption font-medium text-fg-3">
            {plural(p.script.shots.length, "shot")} · {length(p.script).toFixed(1)} s{removed ? ` · ${plural(removed, "shot")} removed` : ""}
          </h4>
          <ol className="divide-y rounded-lg shadow-[inset_0_0_0_1px_var(--line)]">
            {p.script.shots.map((s, i) => (
              <li key={i} className="grid grid-cols-[20px_1fr_auto] gap-x-2 px-3 py-2">
                <span className="text-caption tabular-nums text-fg-3">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-body font-medium">{s.name}</span>
                  <span className="block text-caption text-fg-3">{s.why}</span>
                </span>
                <span className="text-right">
                  <span className="block text-caption tabular-nums text-fg-2">{s.dur.toFixed(1)} s</span>
                  <span className="block text-micro text-fg-3">{i ? (s.cut ?? "cut") : "opens"}</span>
                  {mark(i) && <span className="mt-0.5 inline-block rounded bg-surface-3 px-1 text-micro font-medium text-fg">{mark(i)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
        {(findings.length > 0 || notes.length > 0) && (
          <section aria-label="The checker">
            <h4 className="pb-1.5 text-caption font-medium text-fg-3">The checker</h4>
            <Findings list={[...findings, ...notes]} />
          </section>
        )}
        {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
      </div>
      {p.status === "pending" && (
        <div className="border-t px-4 py-3">
          {asking ? (
            <div className="space-y-2">
              <label className="block text-caption font-medium text-fg-2" htmlFor="lab-reason">
                {asking === "reject" ? "Why not? The next run reads this and won't propose it again." : "Why approve it? What works is what the next run does more of."}
              </label>
              <textarea id="lab-reason" autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={asking === "reject" ? "The orb is too fast; keep the white ground." : "The wipe carries the cut; the end card breathes."} className={`${field} w-full resize-none px-2.5 py-2 text-body`} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAsking(null)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={busy || (asking === "approve" && reason.trim().length < 3)} onClick={() => void decide(asking)}>
                  {asking === "reject" ? (busy ? "Rejecting…" : "Reject") : busy ? "Approving…" : p.kind === "new" ? "Add to the gallery" : p.kind === "effect" && !p.base ? "Add to the effects" : "Approve"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {p.kind !== "effect" ? (
                <Button variant="ghost" className="mr-auto" onClick={() => onPreview(p.script)}>
                  <Play size={14} aria-hidden />
                  Preview in the Studio
                </Button>
              ) : (
                <span className="mr-auto text-caption text-fg-3">Approved, it joins the canvas's effects.</span>
              )}
              <Button onClick={() => setAsking("reject")}>Reject…</Button>
              <Button variant="primary" onClick={() => setAsking("approve")}>
                <Check size={14} aria-hidden />
                Approve…
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Findings({ list }: { list: Finding[] }) {
  return (
    <ul className="space-y-1.5">
      {list.map((f, i) => (
        <li key={i} className="flex gap-2 text-caption">
          {f.level === "info" ? <Info size={14} aria-hidden className="mt-px shrink-0 text-fg-3" /> : <WarningCircle size={14} aria-hidden className={`mt-px shrink-0 ${f.level === "error" ? "text-bad-ink" : "text-warn-ink"}`} />}
          <span className="text-fg-2">
            {f.text}
            <span className="mono ml-1.5 text-micro text-fg-3">{f.rule}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ---------------- templates ---------------- */

function Templates({ scripts, comp, state, onPreview, onProposed }: { scripts: TemplateScript[]; comp: Comp; state: LabState | null; onPreview: (s: TemplateScript) => void; onProposed: () => void }) {
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [name, setName] = useState("My film")
  const ai = !!state?.key
  const improve = async (s: TemplateScript, withAI: boolean, key: string) => {
    setBusy(key)
    setError("")
    try {
      const r = await api<{ proposal?: Proposal }>("improve", { script: s, ai: withAI, note: note.trim() || undefined })
      if (r.proposal && !r.proposal.changes.length && r.proposal.by === "rules") setError(`“${s.name}” already follows every guideline a machine can check: nothing to fix by rules.`)
      else onProposed()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  const studio = useMemo(() => toScript(comp, { id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-film", name: name.trim() || "My film" }), [comp, name])
  const actions = (s: TemplateScript, key: string) => (
    <span className="flex shrink-0 gap-1">
      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void improve(s, false, `${key}:rules`)}>
        <Wrench size={14} aria-hidden />
        {busy === `${key}:rules` ? "Fixing…" : "Fix by rules"}
      </Button>
      <Button size="sm" disabled={!!busy || !ai} onClick={() => void improve(s, true, `${key}:ai`)} label={ai ? undefined : "Improve with AI: add a key in Settings first"}>
        <Sparkle size={14} aria-hidden />
        {busy === `${key}:ai` ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Improve with AI"}
      </Button>
    </span>
  )
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <section aria-label="The film in the Studio" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <h3 className="text-body font-medium">The film in the Studio</h3>
        <p className="mt-0.5 text-caption text-fg-3">
          {plural(studio.shots.length, "shot")} · {length(studio).toFixed(1)} s. Its proposal waits in the Inbox like any other; approved, it becomes a template.
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-[180px_1fr]">
          <input aria-label="Its name as a template" value={name} onChange={(e) => setName(e.target.value)} className={`${field} h-8 px-2.5 text-body`} />
          <input aria-label="What should change (optional, for the AI)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change? (optional, for the AI)" className={`${field} h-8 px-2.5 text-body`} />
        </div>
        <div className="mt-2 flex justify-end">{actions(studio, "studio")}</div>
      </section>
      {/* the launch films first, drawn as themselves; then the scripts the lab wrote and you approved */}
      {(() => {
        const films = scripts.filter((s) => FILM_IDS.has(s.id))
        const own = scripts.filter((s) => !FILM_IDS.has(s.id))
        const card = (s: TemplateScript) => {
          const lint = lintScript(s).filter((f) => f.level !== "info")
          const t = TEMPLATES.find((x) => x.id === s.id)
          return (
            <li key={s.id} className="min-w-0 overflow-hidden rounded-xl bg-surface shadow-[0_0_0_1px_var(--line)]">
              <button type="button" onClick={() => onPreview(s)} className="card group block w-full p-2 pb-0 text-left" title={`Preview “${s.name}” in the Studio`}>
                <span className="card-shot !rounded-lg">{t ? <FilmPoster bare t={t} product="Product" /> : <ScriptPoster script={s} product="Product" className="!rounded-none !shadow-none" />}</span>
              </button>
              <div className="px-3 pb-3 pt-2.5">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-body font-medium">{s.name}</span>
                  <span className="shrink-0 text-micro tabular-nums text-fg-3">
                    v{s.version} · {plural(s.shots.length, "shot")} · {length(s).toFixed(1)} s
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 min-h-[32px] text-caption text-fg-3" title={s.source}>
                  {lint.length ? <span className="text-warn-ink">{plural(lint.length, "guideline")} to look at · </span> : null}
                  {s.summary || s.source}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-1">
                  <IconButton size="sm" label={`Preview “${s.name}” in the Studio`} onClick={() => onPreview(s)}>
                    <Play size={14} />
                  </IconButton>
                  {actions(s, s.id)}
                </div>
              </div>
            </li>
          )
        }
        return (
          <>
            <section aria-label="Launch films">
              <h3 className="pb-2.5 text-caption font-medium text-fg-3">
                {plural(films.length, "launch film")} · the templates replicated from references, each a script of its shots
              </h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">{films.map(card)}</ul>
            </section>
            {own.length > 0 && (
              <section aria-label="Lab scripts">
                <h3 className="pb-2.5 text-caption font-medium text-fg-3">{plural(own.length, "script")} the lab wrote and you approved</h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">{own.map(card)}</ul>
              </section>
            )}
          </>
        )
      })()}
      {error && (/already follows/.test(error) ? <p role="status" className="text-caption text-fg-2">{error}</p> : <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />)}
    </div>
  )
}

/* ---------------- effects ---------------- */

/** The canvas's background effects as they stand, live; Gemini improves one or proposes a new one, into the Inbox. */
function Effects({ state, onProposed }: { state: LabState | null; onProposed: () => void }) {
  const presets = useEffectPresets()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const ai = !!state?.key
  const ask = async (base?: string) => {
    setBusy(base ?? "new")
    setError("")
    try {
      await api("effect", { base, note: note.trim() || undefined })
      onProposed()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <section aria-label="A new effect" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <h3 className="text-body font-medium">A new effect</h3>
        <p className="mt-0.5 text-caption text-fg-3">
          Gemini proposes one by the effects rulebook (Guidelines → Effects). It waits in the Inbox with a live preview; approved, it joins the canvas's effects.
          {state?.effects ? ` The nightly run proposes ${plural(state.effects, "effect")} too.` : ""}
        </p>
        <div className="mt-2.5 flex gap-2">
          <input aria-label="What it should be (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should it be? (optional) A newsprint halftone for a dark hero…" className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body`} />
          <Button variant="primary" disabled={!ai || !!busy} onClick={() => void ask()}>
            <Sparkle size={14} aria-hidden />
            {busy === "new" ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Propose one"}
          </Button>
        </div>
        {!ai && <p className="mt-1.5 text-caption text-fg-3">Add your Gemini key in Settings first.</p>}
      </section>
      {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
      <section aria-label="Effects">
        <h3 className="pb-2 text-caption font-medium text-fg-3">{plural(presets.length, "effect")} · live, as a site draws them</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {presets.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
              <EffectPreview effect={p.effect} className="relative block aspect-[16/9] w-full" />
              <div className="p-3">
                <span className="flex items-baseline gap-2">
                  <span className="text-body font-medium">{p.name}</span>
                  <span className="text-micro tabular-nums text-fg-3">v{p.version}</span>
                </span>
                <p className="mt-0.5 text-caption text-fg-3">{p.summary}</p>
                <div className="mt-2 flex justify-end">
                  <Button size="sm" disabled={!ai || !!busy} onClick={() => void ask(p.id)}>
                    <Sparkle size={14} aria-hidden />
                    {busy === p.id ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Improve with AI"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/* ---------------- studied films ---------------- */

/** The launch films the lab watched, each written down shot by shot; paste one to study, or let it search for some. */
/* ---------------- guidelines ---------------- */

/** The guidelines files (the films', the effects'), set as text: headings, paragraphs, lists, bold and code. */
function Guidelines() {
  const [which, setWhich] = useState<"films" | "effects">("films")
  const text = which === "films" ? GUIDELINES : EFFECTS_GUIDE
  const blocks = useMemo(() => {
    const out: { kind: "h" | "p" | "ul" | "ol"; items: string[] }[] = []
    for (const line of text.split(/\r?\n/)) {
      const last = out.at(-1)
      if (!line.trim()) out.push({ kind: "p", items: [] })
      else if (/^#{1,2} /.test(line)) out.push({ kind: "h", items: [line.replace(/^#+ /, "")] })
      else if (/^(- |\d+\. )/.test(line)) {
        const kind = line.startsWith("- ") ? "ul" : "ol"
        const text = line.replace(/^(- |\d+\. )/, "")
        if (last?.kind === kind) last.items.push(text)
        else out.push({ kind, items: [text] })
      } else if (last && last.kind !== "h" && (/^\s/.test(line) || last.kind === "p")) {
        if (last.items.length) last.items[last.items.length - 1] += ` ${line.trim()}`
        else last.items.push(line.trim())
      } else out.push({ kind: "p", items: [line] })
    }
    return out.filter((b) => b.items.length)
  }, [text])
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((x, i) =>
      x.startsWith("**") ? (
        <strong key={i} className="font-semibold text-fg">
          {x.slice(2, -2)}
        </strong>
      ) : x.startsWith("`") ? (
        <code key={i} className="mono rounded bg-surface-2 px-[3px] text-[0.92em]">
          {x.slice(1, -1)}
        </code>
      ) : (
        x
      ),
    )
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <article className="max-w-[68ch] space-y-3 text-body text-fg-2">
        <Segmented<"films" | "effects">
          size="sm"
          label="Which guidelines"
          value={which}
          onChange={setWhich}
          options={[
            { value: "films", label: "Films" },
            { value: "effects", label: "Effects" },
          ]}
        />
        <p className="text-caption text-fg-3">The AI reads these before every proposal; the checker enforces what a machine can check. They live in {which === "films" ? "src/studio/lab/guidelines.md" : "src/canvas/effects.md"}.</p>
        {blocks.map((b, i) =>
          b.kind === "h" ? (
            <h3 key={i} className={`text-fg ${i ? "pt-2 text-body font-semibold" : "text-ui font-semibold"}`}>
              {inline(b.items[0])}
            </h3>
          ) : b.kind === "p" ? (
            <p key={i}>{inline(b.items.join(" "))}</p>
          ) : b.kind === "ul" ? (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-fg-3">
              {b.items.map((t, j) => (
                <li key={j}>{inline(t)}</li>
              ))}
            </ul>
          ) : (
            <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-fg-3">
              {b.items.map((t, j) => (
                <li key={j}>{inline(t)}</li>
              ))}
            </ol>
          ),
        )}
      </article>
    </div>
  )
}

/* ---------------- runs ---------------- */

/** A run's failure in words, for runs from before the lab said it plainly itself. */
function explain(error = "") {
  if (/Unterminated string in JSON|Unexpected end of JSON|in JSON at position/.test(error)) return "Gemini's reply was cut off before it finished: it ran out of room (its thinking counts too). Fixed since: it now gets the model's full room, and the proposals it finishes are kept."
  const day = /limit: (\d+), model: ([\w.-]+)/.exec(error)
  if (/^Rate limited \(429\)/.test(error) && day) return `The key's free allowance of ${day[1]} requests a day on ${day[2]} was used up.`
  if (/^503: /.test(error)) return "Gemini was busy (503), and it wasn't asked again then. It's now tried three times before giving up."
  return error
}

function Runs({ runs, proposals }: { runs: Run[]; proposals: Proposal[] }) {
  if (!runs.length) return <p className="px-5 py-6 text-caption text-fg-3">No runs yet.</p>
  return (
    <ul className="scroll-thin min-h-0 flex-1 divide-y overflow-y-auto px-5 py-2">
      {runs.map((r) => {
        const failed = proposals.filter((p) => p.run === r.id && p.checker)
        return (
          <li key={r.id} className="py-2.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-body font-medium">
                {r.trigger === "nightly" ? "Nightly run" : r.trigger === "manual" ? "Run by hand" : "From the Studio"}
                <span className="ml-2 text-caption font-normal text-fg-3">{new Date(r.started).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
              <span className="mono shrink-0 text-micro text-fg-3">{r.model}</span>
            </span>
            <span className="mt-0.5 block text-caption text-fg-3">
              {r.ok === undefined ? "Running…" : r.ok ? `${plural(r.proposals, "proposal")} offered` : `Failed: ${explain(r.error)}`}
              {failed.length ? ` · ${failed.length} didn't pass the checker` : ""}
              {r.tokens?.in ? ` · ${Math.round((r.tokens.in + (r.tokens.out ?? 0)) / 1000)}k tokens` : ""}
            </span>
            {r.note && <span className="mt-0.5 block text-caption text-fg-2">{r.note}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/* ---------------- settings ---------------- */

function Settings({ state, setState, reload }: { state: LabState | null; setState: (s: LabState) => void; reload: () => Promise<void> }) {
  const [key, setKey] = useState("")
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [perm, setPerm] = useState(() => ("Notification" in window ? Notification.permission : "denied"))
  useEffect(() => {
    if (state?.key) void api<string[]>("models").then(setModels, () => {})
  }, [state?.key])
  const save = async (patch: object, what = "") => {
    setBusy(what)
    try {
      setState(await api<LabState>("settings", patch))
      return true
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy("")
    }
  }
  const act = async (what: "test" | "run") => {
    setBusy(what)
    setMsg(null)
    try {
      if (what === "test") {
        const r = await api<{ models?: number; has?: boolean; ok?: boolean; reply?: string; error?: string }>("test", {})
        setMsg(
          r.ok
            ? { ok: true, text: `Connected. ${r.models ? `${r.models} models; ` : ""}${state?.model}${r.has === false ? " (not in the list, but it answered)" : ""} answered: “${r.reply}”` }
            : { ok: false, text: r.error ?? "It didn't answer with JSON: pick another model." },
        )
      } else {
        const r = await api<{ made: number }>("run", {})
        setMsg({ ok: true, text: `${plural(r.made, "proposal")} waiting in the Inbox.` })
        await reload()
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const saveKey = () => key.trim() && void save({ key: key.trim() }, "key").then((ok) => ok && setKey(""))
  if (!state) return <p className="px-5 py-6 text-caption text-fg-3">The lab runs on the engine's server: start it with npm run dev.</p>
  const row = "grid gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[200px_1fr]"
  return (
    <div className="scroll-thin min-h-0 flex-1 divide-y overflow-y-auto px-5 py-1">
      <WorkApi row={row} />
      <div className="pb-3.5 pt-6">
        <h2 className="text-body font-semibold">Lab</h2>
        <p className="mt-0.5 max-w-[60ch] text-caption text-fg-3">The nightly lab: studying launch films and proposing templates, on its own key.</p>
      </div>
      <div className={row}>
        <span>
          <span className="block text-body font-medium" id="lab-key-label">
            Gemini API key
          </span>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="block text-caption text-fg-3 underline decoration-fg-3/50 underline-offset-4 hover:text-fg">
            Google AI Studio → Get API key
          </a>
        </span>
        <span className="min-w-0">
          <span className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-labelledby="lab-key-label"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder={state.key ? `Set (${state.keyHint}). Paste a new one to replace it` : "Paste your key"}
              className={`${field} mono h-8 min-w-0 flex-1 px-2.5 text-body`}
            />
            <Button disabled={!key.trim() || busy === "key"} onClick={saveKey}>
              {busy === "key" ? "Saving…" : "Save"}
            </Button>
          </span>
          <span className="mt-1.5 block text-caption text-fg-3">
            Kept in .env.local on this machine (git ignores it); the page never sees it.
            {state.key && (
              <button type="button" onClick={() => void save({ key: "" }, "key")} className="press ml-1.5 font-medium text-fg-2 underline decoration-fg-3 underline-offset-4">
                Remove it
              </button>
            )}
          </span>
        </span>
      </div>
      <div className={row}>
        <span>
          <label htmlFor="lab-model" className="block text-body font-medium">
            Model
          </label>
          <span className="block text-caption text-fg-3">{models.length ? `${models.length} your key can use` : "Add the key to list yours"}</span>
        </span>
        <span className="min-w-0">
          {/* a list, not a text box: a key or a label typed here would fail every night */}
          <Select id="lab-model" value={state.model} onChange={(e) => void save({ model: e.target.value })} className={`${field} mono h-8 w-full cursor-pointer px-2 text-body`}>
            {[...new Set([state.model, ...(models.length ? models : KNOWN_MODELS)])].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <span className="mt-1.5 block text-caption text-fg-3">gemini-3.8-flash is the strongest Flash; gemini-3.5-flash-lite is the lightest. A night is a handful of requests: a search, a film or two watched at a low resolution, the proposals (about 40k tokens), inside the free tier (AI Studio shows your limits).</span>
        </span>
      </div>
      <div className={row}>
        <span>
          <span className="block text-body font-medium" id="lab-night-label">
            Every night
          </span>
          <span className="block text-caption text-fg-3">{state.enabled ? `Next ${ago(state.nextRun)}; last ${ago(state.lastRun)}` : "Off"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch on={state.enabled} onChange={(v) => void save({ enabled: v })} labelledBy="lab-night-label" />
          <Select aria-label="At" value={state.hour} onChange={(e) => void save({ hour: Number(e.target.value) })} className={`${field} h-8 cursor-pointer px-2 text-body`}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {clock(h)}
              </option>
            ))}
          </Select>
          <span className="flex items-center gap-2">
            <span className="text-caption text-fg-3" id="lab-per-label">
              Proposals a night
            </span>
            <Segmented size="sm" labelledBy="lab-per-label" value={state.perNight} onChange={(v) => void save({ perNight: v })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          </span>
          <span className="basis-full text-caption text-fg-3">If the machine is off at that hour, it runs when the engine next starts.</span>
        </span>
      </div>
      <div className={row}>
        <span>
          <span className="block text-body font-medium" id="lab-research-label">
            Studies launch films
          </span>
          <span className="block text-caption text-fg-3">{state.references ? `${plural(state.references, "film")} studied so far` : "Nothing studied yet"}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Switch on={state.research} onChange={(v) => void save({ research: v })} labelledBy="lab-research-label" />
          <span className="flex items-center gap-2">
            <span className="text-caption text-fg-3" id="lab-watch-label">
              Films a night
            </span>
            <Segmented size="sm" labelledBy="lab-watch-label" value={state.watch} onChange={(v) => void save({ watch: v })} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
          </span>
          <span className="basis-full text-caption text-fg-3">Before proposing, it searches the web for product launch films on YouTube (or, if your key has no web search, takes the next film on its own list), watches each one's first two minutes and tears it down (the References section). A film is a few thousand tokens.</span>
        </span>
      </div>
      <div className={row}>
        <span>
          <span className="block text-body font-medium" id="lab-fx-label">
            Canvas effects
          </span>
          <span className="block text-caption text-fg-3">Background effects proposed a night</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented size="sm" labelledBy="lab-fx-label" value={state.effects} onChange={(v) => void save({ effects: v })} options={[0, 1, 2].map((n) => ({ value: n, label: n ? String(n) : "None" }))} />
        </span>
      </div>
      <div className={row}>
        <span>
          <span className="block text-body font-medium">Notifications</span>
          <span className="block text-caption text-fg-3">When new ideas land while the engine is in the background</span>
        </span>
        <span className="flex items-center gap-3">
          {perm === "granted" ? (
            <span className="flex items-center gap-1.5 text-body text-fg-2">
              <Check size={14} aria-hidden />
              On
            </span>
          ) : (
            <Button disabled={perm === "denied"} onClick={() => void Notification.requestPermission().then(setPerm)}>
              <Bell size={14} aria-hidden />
              Allow notifications
            </Button>
          )}
          {perm === "denied" && <span className="text-caption text-fg-3">Blocked in this browser's site settings. The notice in the engine still shows.</span>}
        </span>
      </div>
      {state.quota && (
        <p role="status" className="flex items-start gap-1.5 border-b py-3 text-caption text-fg-2">
          <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-warn-ink" />
          <span>
            Today's requests on <span className="mono">{state.quota.model}</span> are used up; they're back around {new Date(state.quota.until).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. The nightly run waits for them. To run now, pick another model above: each has its own allowance.
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 py-3.5">
        <Button disabled={!state.key || !!busy} onClick={() => void act("test")}>
          <ArrowsClockwise size={14} aria-hidden />
          {busy === "test" ? "Testing…" : "Test the key"}
        </Button>
        <Button variant="primary" disabled={!state.key || !!busy || state.running} onClick={() => void act("run")}>
          <Sparkle size={14} aria-hidden />
          {busy === "run" || state.running ? "Running… (a minute or two)" : "Run now"}
        </Button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className="flex basis-full items-start gap-1.5 text-caption text-fg-2">
            {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}
