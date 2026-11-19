// The film maker in the Product place: the product's brief (written once, by the AI or the rules, yours to correct),
// then a film from a template picked for it (or named), every line written in one call and checked, its cost shown;
// a draft render to look at, a note in plain words to change it, the critic, the Studio, and your verdict.
// It's the server's (server/maker.ts); this is its face.
import { useEffect, useState } from "react"
import { ArrowSquareOut, Check, MagicWand, Play, Sparkle, WarningCircle, X } from "@phosphor-icons/react"
import { field } from "./controls"
import { Button, Segmented, Select } from "./ui"
import { Glyph } from "./Thinking"
import type { Brief, Pick, Problem, Stage } from "./studio/maker"
import type { ProductKit } from "./studio/product"

type Version = { at: string; template: string; film: string; size: string; values: Record<string, string>; problems: Problem[]; note?: string }
type Film = { id: string; kit: string; name: string; made: string; picks: Pick[]; versions: Version[]; comp: unknown; renders: { job: string; draft: boolean }[]; log: Stage[]; keep?: boolean }
type Row = { id: string; kit: string; name: string; made: string; versions: number; keep?: boolean }
type TemplateRow = { id: string; film: string; name: string; size: string; seconds: number; contract: { idea: string } }

async function api<T>(what: string, body?: object): Promise<T> {
  const r = await fetch(`/__film/${what}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  const j = await r.json().catch(() => ({ error: "The engine's server isn't running (npm run dev)." }))
  if (!r.ok || (j && typeof j === "object" && "error" in j && j.error)) throw new Error(j.error ?? `The engine said ${r.status}`)
  return j as T
}
const media = (v: string) => /^(image|video|anim):|^#[0-9a-f]{3,8}$/i.test(v)
/** values that aren't lines: the theme and the score */
const SETTINGS = new Set(["theme", "music", "spine"])
type Beat = { act: string; say: string; sub?: string; carrier: string; seconds: number }
type Card = { say: string; story: number; product: number; look: number; words: number; carriers: number; notes: string; shots?: { n: number; matches: boolean; note: string }[]; lint?: { gate: string; level: "fail" | "warn"; scene?: number; text: string }[] }
const MOODS = [
  { value: "calm", label: "Calm" },
  { value: "bright", label: "Bright" },
  { value: "driving", label: "Driving" },
  { value: "dark", label: "Dark" },
  { value: "none", label: "No music" },
]
const cost = (log: Stage[]) => {
  const tokens = log.reduce((a, s) => a + s.tokens, 0)
  const s = log.filter((x) => !/render/.test(x.stage)).reduce((a, x) => a + x.ms, 0) / 1000
  return `${tokens.toLocaleString()} tokens · ${s.toFixed(0)} s`
}

export function MakerPanel({ kit, onOpen }: { kit: ProductKit; onOpen: (comp: unknown) => void }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [template, setTemplate] = useState("auto")
  const [size, setSize] = useState<"" | "16x9" | "9x16" | "1x1">("")
  const [film, setFilm] = useState<Film | null>(null)
  const [films, setFilms] = useState<Row[]>([])
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [said, setSaid] = useState("")
  const [render, setRender] = useState<{ job: string; state: string; frame: number; total: number } | null>(null)
  const [card, setCard] = useState<Card | null>(null)

  useEffect(() => {
    setFilm(null)
    setRender(null)
    void api<Brief | null>(`brief?kit=${kit.id}`).then(setBrief, () => setBrief(null))
    void api<TemplateRow[]>("templates").then(setTemplates, () => {})
    void api<Row[]>("list").then((x) => setFilms(x.filter((f) => f.kit === kit.id)), () => {})
  }, [kit.id])
  // a render followed to its end
  useEffect(() => {
    if (!render || render.state === "done" || render.state === "error") return
    const t = setTimeout(async () => {
      const s = await fetch(`/__studio/jobs/${render.job}`).then((r) => r.json()).catch(() => null)
      if (s) setRender({ job: render.job, state: s.state, frame: s.frame, total: s.total })
    }, 1200)
    return () => clearTimeout(t)
  }, [render])

  const act = async (what: string, run: () => Promise<void>) => {
    setBusy(what)
    setError("")
    try {
      await run()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  const v = film?.versions.at(-1)
  const chosen = film && v ? film.picks.find((p) => p.id === v.template) : undefined
  const errors = v?.problems.filter((p) => p.level === "error") ?? []
  // how the film wears the product now: its theme's reach, and its score
  const fit = !v ? "product" : v.values.theme === "" ? "template" : ((): string => {
    try {
      return (JSON.parse(v.values.theme ?? "{}") as { fit?: string }).fit ?? "template"
    } catch {
      return "template"
    }
  })()
  const music = (film?.comp as { music?: { mood?: string; name?: string } } | undefined)?.music
  // a directed film: its story, beat by beat (edited by directing it again, not line by line)
  const beats: Beat[] | null = v?.film === "directed" && v.values.spine ? (JSON.parse(v.values.spine) as { beats: Beat[] }).beats : null
  const change = (what: string, ops: object[]) => film && act(what, async () => setFilm((await api<{ film: Film }>("edit", { id: film.id, ops })).film))

  const set = (p: Partial<Brief>) => brief && setBrief({ ...brief, ...p })
  const text = (k: keyof Brief, label: string, rows = 1) => (
    <label className="block">
      <span className="mb-1 block text-caption text-fg-3">{label}</span>
      {rows > 1 ? (
        <textarea rows={rows} value={String(brief?.[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<Brief>)} className={`${field} w-full resize-y px-2.5 py-2 text-body`} />
      ) : (
        <input value={String(brief?.[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<Brief>)} className={`${field} h-8 w-full px-2.5 text-body`} />
      )}
    </label>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* the brief */}
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-ui font-semibold">The brief</h3>
            <p className="text-caption text-fg-3">{brief ? `Written by ${brief.by === "you" ? "you" : brief.by === "ai" ? "the AI" : "the rules"} · every film reads it` : "What the product is, for whom, and why: written once"}</p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" disabled={!!busy} onClick={() => act("brief", async () => setBrief((await api<{ brief: Brief }>("brief", { kit: kit.id })).brief))}>
              <MagicWand size={14} aria-hidden /> {brief ? "Write again" : "Write it"}
            </Button>
            {brief && (
              <Button size="sm" variant="primary" disabled={!!busy} onClick={() => act("save", async () => setBrief(await api<Brief>("brief", { kit: kit.id, brief })))}>
                Save
              </Button>
            )}
          </div>
        </div>
        {busy === "brief" && <Glyph variant="scan" size={18} />}
        {brief ? (
          <div className="grid gap-3">
            {text("kind", "What it is")}
            {text("audience", "Who it's for", 2)}
            {text("problem", "The pain it ends", 2)}
            {text("oldWay", "How they do it today", 2)}
            {text("promise", "The change it makes")}
            <div>
              <span className="mb-1 block text-caption text-fg-3">Features, strongest first</span>
              <div className="grid gap-1.5">
                {brief.features.map((f, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-1.5">
                    <input aria-label={`Feature ${i + 1}`} value={f.name} onChange={(e) => set({ features: brief.features.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={`${field} h-8 px-2.5 text-body`} />
                    <input aria-label={`What feature ${i + 1} lets you do`} value={f.benefit} onChange={(e) => set({ features: brief.features.map((x, j) => (j === i ? { ...x, benefit: e.target.value } : x)) })} className={`${field} h-8 px-2.5 text-body`} />
                  </div>
                ))}
              </div>
            </div>
            {text("usp", "What nothing else does")}
            <div className="grid grid-cols-2 gap-3">
              {text("tone", "How it talks")}
              {text("cta", "The call")}
            </div>
            {text("url", "Its address (shown only if real)")}
            <p className="text-caption text-fg-3">{brief.proof.length ? `Proof: ${brief.proof.join(" · ")}` : "No real figures yet: templates that need one are ranked down."}</p>
          </div>
        ) : (
          <p className="text-body text-fg-2">No brief yet. “Write it” reads the kit's notes, words and files (one call), or the rules do what they can.</p>
        )}
      </div>

      {/* the film */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-caption text-fg-3">Template</span>
            <Select aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full">
              <option value="auto">Pick the one that fits</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.size.replace("x", ":")} · {t.seconds.toFixed(0)} s
                </option>
              ))}
            </Select>
          </label>
          <Segmented label="Shape" value={size} onChange={setSize} options={[{ value: "", label: "Its own" }, { value: "16x9", label: "16:9" }, { value: "9x16", label: "9:16" }, { value: "1x1", label: "1:1" }]} />
          <Button variant="primary" disabled={!!busy} onClick={() => act("make", async () => {
            const f = await api<Film>("make", { kit: kit.id, template, size: size || undefined })
            setFilm(f)
            setRender(null)
            setFilms((x) => [{ id: f.id, kit: f.kit, name: f.name, made: f.made, versions: f.versions.length }, ...x])
            if (!brief) setBrief(await api<Brief | null>(`brief?kit=${kit.id}`))
          })}>
            <Sparkle size={15} aria-hidden /> Make the film
          </Button>
          <Button disabled={!!busy} onClick={() => act("direct", async () => {
            const f = await api<Film>("direct", { kit: kit.id, length: 30, size: size || undefined, notes: note.trim() || undefined })
            setFilm(f)
            setRender(null)
            setCard(null)
            setFilms((x) => [{ id: f.id, kit: f.kit, name: f.name, made: f.made, versions: f.versions.length }, ...x])
          })} label="A 30 s film directed from a story: the product's screens and recordings, one world, its liquid mark">
            <MagicWand size={15} aria-hidden /> Direct a film
          </Button>
        </div>
        {busy === "direct" && (
          <div className="mt-4 flex items-center gap-2 text-body text-fg-2">
            <Glyph variant="breathe" size={18} /> The story, then one world under it…
          </div>
        )}
        {busy === "make" && (
          <div className="mt-4 flex items-center gap-2 text-body text-fg-2">
            <Glyph variant="breathe" size={18} /> The brief, the pick, then every line in one call…
          </div>
        )}
        {error && (
          <p className="mt-4 flex items-start gap-2 text-body text-[var(--bad,#e5484d)]">
            <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {film && v && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-ui font-semibold">{beats ? film.name : (chosen?.name ?? templates.find((t) => t.id === v.template)?.name ?? v.template)}</h3>
              <span className="text-caption tabular-nums text-fg-3">{cost(film.log)} · version {film.versions.length}</span>
            </div>
            {chosen?.reasons.length ? <p className="mt-1 text-caption text-fg-3">Picked because it {chosen.reasons.join("; ")}.</p> : null}
            {beats && (
              <ol className="mt-3 grid gap-1">
                {beats.map((b, i) => (
                  <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2 rounded-lg px-2 py-1 text-body hover:bg-surface-2">
                    <span className="text-fg-3">{b.act}</span>
                    <span className="min-w-0">
                      {b.say || "—"}
                      {b.sub && <span className="block text-caption text-fg-3">{b.sub}</span>}
                    </span>
                    <span className="text-caption tabular-nums text-fg-3">
                      {b.carrier.split(":")[0]} · {b.seconds.toFixed(1)} s
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {card && (
              <div className="mt-3 rounded-lg px-2 py-2 text-body shadow-[0_0_0_1px_var(--line)]">
                <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                  {(["story", "product", "look", "words", "carriers"] as const).map((k) => (
                    <span key={k} className={card[k] < 4 ? "text-[var(--bad,#e5484d)]" : "text-fg-2"}>
                      {k} {card[k]}/5
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-caption text-fg-3">{card.say}</p>
                {/* the cross-check: gates that failed, shots that don't show what they mean */}
                {[...(card.lint ?? []).filter((x) => x.level === "fail").map((x) => `${x.gate}${x.scene !== undefined ? ` · shot ${x.scene + 1}` : ""}: ${x.text}`), ...(card.shots ?? []).filter((x) => !x.matches).map((x) => `shot ${x.n}: ${x.note}`)].map((t, i) => (
                  <p key={i} className="mt-1 text-caption text-[var(--bad,#e5484d)]">
                    {t}
                  </p>
                ))}
                {card.notes && <p className="mt-1 text-caption text-fg-2">Next time: {card.notes}</p>}
              </div>
            )}
            <ul className="mt-3 grid gap-1">
              {Object.entries(v.values)
                .filter(([k, x]) => !media(String(x)) && !SETTINGS.has(k))
                .map(([k, x]) => {
                  const bad = v.problems.filter((p) => p.key === k)
                  return (
                    <li key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1 text-body hover:bg-surface-2">
                      <span className="truncate text-fg-3">{k}</span>
                      <span className="min-w-0">
                        {String(x).split("|").join(" · ")}
                        {bad.map((p, i) => (
                          <span key={i} className={`mt-0.5 block text-caption ${p.level === "error" ? "text-[var(--bad,#e5484d)]" : "text-fg-3"}`}>
                            {p.text}
                          </span>
                        ))}
                      </span>
                    </li>
                  )
                })}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-caption text-fg-3">{errors.length ? <WarningCircle size={14} aria-hidden /> : <Check size={14} aria-hidden />}{errors.length ? `${errors.length} line${errors.length === 1 ? "" : "s"} to fix` : "Every line checked: fits, the product's own words, no invented figures"}</p>

            {/* the product's look over the template's, and the score cut to the film */}
            {!beats && <div className="mt-4 flex flex-wrap items-end gap-3">
              <Segmented label="Colours and type" value={fit} onChange={(f) => change("theme", [{ op: "theme", fit: f }])} options={[{ value: "product", label: "The product's" }, { value: "accent", label: "Its accent" }, { value: "template", label: "The template's" }]} />
              <label>
                <span className="mb-1 block text-caption text-fg-3">Music{music?.name ? `: ${music.name}` : ""}</span>
                <Select aria-label="Music" value={music?.mood ?? "none"} disabled={!!busy} onChange={(e) => change("music", [{ op: "music", mood: e.target.value }])}>
                  {MOODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => act("stills", async () => setRender({ job: (await api<{ job: string }>("render", { id: film.id, stills: true })).job, state: "queued", frame: 0, total: 0 }))} label="Two frames a second at a quarter of the size: every shot, in seconds">
                Quick look
              </Button>
              {beats && (
                <Button size="sm" disabled={!!busy} onClick={() => act("review", async () => setCard(await api<Card>("review", { id: film.id })))} label="Stills of every shot, scored against the brief">
                  Score it
                </Button>
              )}
              <Button size="sm" disabled={!!busy} onClick={() => act("draft", async () => setRender({ job: (await api<{ job: string }>("render", { id: film.id, draft: true })).job, state: "queued", frame: 0, total: 0 }))}>
                <Play size={14} aria-hidden /> Draft
              </Button>
              <Button size="sm" disabled={!!busy} onClick={() => act("final", async () => setRender({ job: (await api<{ job: string }>("render", { id: film.id })).job, state: "queued", frame: 0, total: 0 }))}>
                Render
              </Button>
              {!beats && <Button size="sm" disabled={!!busy || render?.state !== "done"} onClick={() => act("critic", async () => {
                const c = await api<{ say: string; film: Film }>("critic", { id: film.id })
                setFilm(c.film)
                setSaid(c.say)
              })}>
                Review the draft
              </Button>}
              <Button size="sm" onClick={() => onOpen(film.comp)}>
                <ArrowSquareOut size={14} aria-hidden /> Open in the Studio
              </Button>
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => act("keep", async () => (await api("keep", { id: film.id, keep: true }), setFilm({ ...film, keep: true })))} label="Keep: the picker learns from it">
                  <Check size={14} aria-hidden /> {film.keep === true ? "Kept" : "Keep"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act("keep", async () => (await api("keep", { id: film.id, keep: false }), setFilm({ ...film, keep: false })))} label="Pass: the picker learns from it">
                  <X size={14} aria-hidden /> {film.keep === false ? "Passed" : "Pass"}
                </Button>
              </span>
            </div>
            {render && render.state !== "done" && <p className="mt-3 text-caption tabular-nums text-fg-3">{render.state === "error" ? "The render failed." : render.total ? `Rendering ${render.frame} / ${render.total}` : "Waiting for the renderer…"}</p>}
            {render?.state === "done" && <video key={render.job} src={`/__studio/jobs/${render.job}/file`} controls muted loop playsInline className="mt-3 w-full rounded-xl bg-black" />}
            {said && <p className="mt-3 text-body text-fg-2">{said}</p>}

            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                void act("note", async () => {
                  const r = await api<{ film: Film; say: string }>("edit", { id: film.id, note })
                  setFilm(r.film)
                  setSaid(r.say)
                  setNote("")
                })
              }}
            >
              <input aria-label="A note on the film" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Make the hook punchier · use the glide template · 9:16" className={`${field} h-9 min-w-0 flex-1 px-3 text-body`} />
              <Button variant="primary" disabled={!!busy || !note.trim()}>
                {busy === "note" ? "Changing…" : "Change"}
              </Button>
            </form>

            {film.versions.length > 1 && (
              <div className="mt-5">
                <span className="mb-1.5 block text-caption text-fg-3">Versions</span>
                <ol className="grid gap-0.5">
                  {film.versions
                    .map((x, i) => ({ x, i }))
                    .reverse()
                    .slice(0, 6)
                    .map(({ x, i }) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1 text-body hover:bg-surface-2">
                        <span className="w-6 shrink-0 tabular-nums text-fg-3">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{x.note ?? (i ? "Edited" : "First made")} · {templates.find((t) => t.id === x.template)?.name ?? x.template}</span>
                        <span className="shrink-0 text-caption tabular-nums text-fg-3">{new Date(x.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {i === film.versions.length - 1 ? (
                          <span className="w-[72px] shrink-0 text-right text-caption text-fg-3">Now</span>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => change("restore", [{ op: "restore", version: i }])} className="w-[72px] shrink-0">
                            Go back
                          </Button>
                        )}
                      </li>
                    ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {films.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <span className="mb-2 block text-caption text-fg-3">Films made for {kit.words.name || kit.name}</span>
            <ul className="grid gap-1">
              {films.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => act("open", async () => setFilm(await api<Film>(`get?id=${f.id}`)))} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-body hover:bg-surface-2">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-caption text-fg-3">
                      {f.keep === true ? "kept · " : f.keep === false ? "passed · " : ""}v{f.versions} · {new Date(f.made).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
