// Lab → Directing briefs: for each film template, what the director wants, in the fixed shape (intent, locked, vary,
// rules, story beats, a note on each shot, sound, references). The generator writes takes within it (a new intro, a
// scene, a transition, a title reveal), each placed in its film; every take is checked (the gates and the critic, with
// the product kit in it) and weighed by what the taste has learned, then ranked with why. The good ones go to To review.
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Play, Tray, WarningCircle } from "@phosphor-icons/react"
import { field } from "../controls"
import { ANIMS } from "../registry"
import { Button, Segmented } from "../ui"
import { Glyph } from "../Thinking"
import { LIBRARY } from "./library"
import { features, tasteBrief, type Taste } from "./taste"
import type { LabFilms } from "./NewFilms"
import type { TemplateScript } from "./script"

type Brief = { film: string; intent: string; locked: string; vary: string; rules: string; beats: string; notes: Record<string, string>; sound: string; references: string; updated?: string }
type Kind = "intro" | "scene" | "transition" | "type"
type Take = { title: string; why: string; place: string; script: TemplateScript | null; errors: string[]; check?: Awaited<ReturnType<NonNullable<LabFilms["check"]>>>; taste?: number; rank?: number; checking?: boolean }
const FIELDS: { key: keyof Omit<Brief, "film" | "notes" | "updated">; label: string; hint: string }[] = [
  { key: "intent", label: "Intent", hint: "What this film is for, and the feeling it leaves." },
  { key: "locked", label: "Locked", hint: "What never changes: its cuts, its camera, its type…" },
  { key: "vary", label: "Vary", hint: "What a take may change." },
  { key: "rules", label: "Rules", hint: "Always and never." },
  { key: "beats", label: "Story beats", hint: "The story it tells, beat by beat." },
  { key: "sound", label: "Sound", hint: "The music, the hits, the silences." },
  { key: "references", label: "References", hint: "Films it should feel like (links, names)." },
]

async function call<T>(path: string, body?: object): Promise<T> {
  const r = await fetch(`/__briefs/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}

/** What the taste leans to in a film: its features' learned leans, together (0 is neutral). */
const leanOf = (s: TemplateScript, taste?: Taste) => (taste ? features(s).reduce((a, f) => a + (taste.weights.find((w) => w.feature === f)?.lean ?? 0), 0) : 0)

export function Briefs({ films, taste, onPreview, onInbox }: { films?: LabFilms; taste?: Taste; onPreview: (s: TemplateScript) => void; onInbox: () => void }) {
  const templates = useMemo(() => ANIMS.filter((a) => a.film), [])
  const [film, setFilm] = useState(templates[0]?.id ?? "")
  const [brief, setBrief] = useState<Brief | null>(null)
  const [written, setWritten] = useState<Set<string>>(new Set())
  const [kind, setKind] = useState<Kind>("intro")
  const [note, setNote] = useState("")
  const [takes, setTakes] = useState<Take[]>([])
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const saving = useRef(0)
  const shots = LIBRARY.filter((s) => s.film === film)

  useEffect(() => {
    void call<Brief[]>("list").then((l) => setWritten(new Set(l.map((b) => b.film))), () => {})
  }, [])
  useEffect(() => {
    setBrief(null)
    setTakes([])
    void call<Brief>(`get?film=${film}`).then(setBrief, (e: Error) => setMsg({ ok: false, text: e.message }))
  }, [film])
  const edit = (next: Brief) => {
    setBrief(next)
    clearTimeout(saving.current)
    saving.current = window.setTimeout(() => void call<Brief>("save", { film, brief: next }).then(() => setWritten((w) => new Set([...w, film])), (e: Error) => setMsg({ ok: false, text: e.message })), 600)
  }

  // write takes, then check each and rank them: the gates and the critic (out of 100), nudged by the taste's lean
  const write = async () => {
    setBusy("write")
    setMsg(null)
    setTakes([])
    try {
      const r = await call<{ takes: Take[]; by: string }>("generate", { film, kind, count: 3, note, taste: taste ? `${tasteBrief(taste)}\n${taste.rules.map((x) => `- ${x.label}`).join("\n")}` : "" })
      const list = r.takes.map((t) => ({ ...t, taste: t.script ? leanOf(t.script, taste) : 0, checking: !!t.script && !!films?.check }))
      setTakes(list)
      setMsg({ ok: true, text: `${list.filter((t) => t.script).length} of ${list.length} takes read as films (${r.by}).${films?.check ? " Checking each…" : ""}` })
      if (films?.check)
        for (const [i, t] of list.entries()) {
          if (!t.script) continue
          const check = await films.check(t.script).catch(() => undefined)
          setTakes((all) => all.map((x, j) => (j === i ? { ...x, check, checking: false } : x)))
        }
      setTakes((all) => all.map((x) => ({ ...x, rank: (x.check?.score ?? 50) + Math.max(-15, Math.min(15, (x.taste ?? 0) * 10)) })).sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1)))
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const propose = async (t: Take) => {
    if (!t.script) return
    const r = await fetch("/__lab/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ script: t.script, rationale: `${t.why}${t.check ? ` Checked: ${t.check.score}/100${t.check.critic ? `; the critic: ${t.check.critic.verdict}` : ""}.` : ""}`, changes: [{ what: `${t.title} (${kind}, ${t.place})`, why: `Written within ${templates.find((x) => x.id === film)?.name}'s brief.` }] }) })
    if (r.ok) onInbox()
    else setMsg({ ok: false, text: (await r.json().catch(() => ({})))?.error ?? "Couldn't send it to review" })
  }

  return (
    <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Templates" className="scroll-thin overflow-y-auto border-r px-2 py-3">
        {templates.map((t) => (
          <button key={t.id} type="button" aria-current={film === t.id} onClick={() => setFilm(t.id)} className={`press flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body ${film === t.id ? "bg-surface-2 font-medium" : "text-fg-2 hover:bg-surface-2"}`}>
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            {written.has(t.id) && <span aria-label="Brief written" className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />}
          </button>
        ))}
      </nav>
      <div className="scroll-thin min-h-0 overflow-y-auto px-6 py-4">
        {brief && (
          <div className="grid gap-8 xl:grid-cols-2">
            <section aria-label="The brief" className="space-y-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-body font-medium">{f.label}</span>
                  <span className="block pb-1 text-caption text-fg-3">{f.hint}</span>
                  <textarea rows={f.key === "beats" ? 4 : 2} value={brief[f.key]} onChange={(e) => edit({ ...brief, [f.key]: e.target.value })} className={`${field} w-full px-2.5 py-1.5 text-body`} />
                </label>
              ))}
              <div>
                <span className="block text-body font-medium">Directing notes, shot by shot</span>
                <ol className="mt-1.5 space-y-1.5">
                  {shots.map((s, i) => (
                    <li key={s.id} className="grid grid-cols-[130px_1fr] items-start gap-2">
                      <span className="pt-1.5 text-caption text-fg-2">
                        {i + 1}. {s.name}
                        <span className="block text-fg-3">{s.dur} s · {s.role.join(", ")}</span>
                      </span>
                      <textarea rows={1} value={brief.notes[s.id] ?? ""} onChange={(e) => edit({ ...brief, notes: { ...brief.notes, [s.id]: e.target.value } })} aria-label={`A note on “${s.name}”`} className={`${field} w-full px-2.5 py-1.5 text-body`} />
                    </li>
                  ))}
                </ol>
              </div>
            </section>
            <section aria-label="Takes" className="space-y-3">
              <h3 className="text-body font-semibold">Write takes within the brief</h3>
              <Segmented size="sm" label="What to write" value={kind} onChange={setKind} options={[{ value: "intro", label: "An intro" }, { value: "scene", label: "A scene" }, { value: "transition", label: "A transition" }, { value: "type", label: "A title reveal" }]} />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for this round (optional)" aria-label="A note for this round" className={`${field} h-8 w-full px-2.5 text-body`} />
              <Button variant="primary" disabled={!!busy} onClick={() => void write()}>
                {busy === "write" ? <><Glyph variant="breathe" size={14} /> Writing and checking takes…</> : "Write three takes"}
              </Button>
              {msg && (
                <p role={msg.ok ? "status" : "alert"} className="flex items-start gap-1.5 text-caption text-fg-2">
                  {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
                  {msg.text}
                </p>
              )}
              <ol className="space-y-2">
                {takes.map((t, i) => (
                  <li key={i} className="rounded-lg p-3 shadow-[0_0_0_1px_var(--line)]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-body font-medium">
                        {t.rank !== undefined && <span className="mr-1.5 text-fg-3">#{i + 1}</span>}
                        {t.title}
                      </p>
                      <span className="shrink-0 text-caption text-fg-3">{t.checking ? "checking…" : t.check ? `${t.check.score}/100` : t.script ? "" : "didn't read"}</span>
                    </div>
                    <p className="mt-0.5 text-caption text-fg-2">{t.why}</p>
                    {t.check && (
                      <p className="mt-1 text-caption text-fg-3">
                        {t.check.gates.map((g) => `${g.name} ${g.pass ? "✓" : "✗"}`).join(" · ")}
                        {t.check.critic ? ` · the critic ${t.check.critic.score}: ${t.check.critic.verdict}` : ""}
                        {t.taste ? ` · your taste ${t.taste > 0 ? "leans to it" : "leans away"}` : ""}
                      </p>
                    )}
                    {!t.script && t.errors.length > 0 && <p className="mt-1 text-caption text-fg-3">The checker: {t.errors.slice(0, 2).join(" ")}</p>}
                    {t.script && (
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" onClick={() => onPreview(t.script!)}>
                          <Play size={13} aria-hidden /> Open it
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void propose(t)}>
                          <Tray size={13} aria-hidden /> To review
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
