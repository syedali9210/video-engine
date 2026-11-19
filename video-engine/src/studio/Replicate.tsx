// The template lab's Replicate: a product launch film worth copying, rebuilt as an editable template, measured rather
// than imitated.
//   - Find one: search YouTube (or the lab's own list of verified films), paste a film, drop a video, or pick one
//     already studied.
//   - The server watches it twice (its teardown, then each shot's exact camera values), measures a file's cuts with
//     ffmpeg, and builds the replica from those numbers (server/lab.ts, studio/replica.ts).
//   - Here it's shown against the film, part by part and shot by shot, with how close it came. Preview and edit it in
//     the Studio, or add it to the gallery as a template for any product.
import { Problem } from "../States"
import { draftSpec } from "./draft"
import { Thinking } from "../Thinking"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowsClockwise, Check, CopySimple, FilmReel, MagnifyingGlass, Play, UploadSimple, WarningCircle } from "@phosphor-icons/react"
import { field } from "../controls"
import { CATEGORIES, type Reference } from "../refs"
import { Button, Select } from "../ui"
import { cutName } from "./cuts"
import { Score, ScoreRow } from "./IdeasLab"
import type { Fidelity } from "./replica"
import type { TemplateScript } from "./script"
import type { LabState } from "./Lab"

type Api = <T>(path: string, body?: object) => Promise<T>
type Found = { url: string; id: string; title: string; channel: string }
type Result = { proposal: { id: string; script: TemplateScript; status: string }; fidelity: Fidelity; reference: Reference; notes: string[] }

const STEPS = ["Watching it: every cut and what each shot shows", "Measuring every shot: the angle, zoom, turn, height and roll, where the camera glides, each title's animation", "For a file: its cut points measured by ffmpeg", "Building the replica from those numbers, then checking it against the film"]
const short = (t: string) => cutName(t as never).replace(/^an? /, "")

/** The studied film as the start of a template: its shots tagged (where each cuts, its role, energy, moves) and the
    slots it would need, to copy into a new template's meta.ts. */
function AsTemplate({ reference }: { reference: Reference }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const d = draftSpec(reference)
  return (
    <div className="mt-3 border-t pt-2.5">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="press flex w-full items-center justify-between text-left text-caption font-medium text-fg-2">
        As a template: {d.film.shots.length} shots tagged, {d.slots.length} slots
        <span className="text-fg-3">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="rise-in mt-2 space-y-2 text-caption">
          <ol className="space-y-0.5">
            {d.film.shots.map((s, i) => (
              <li key={i} className="grid grid-cols-[48px_1fr] gap-2">
                <span className="tabular-nums text-fg-3">{s.at.toFixed(2)} s</span>
                <span className="text-fg-2">
                  {s.name} <span className="text-fg-3">· {s.role.join(", ")} · energy {s.energy} · in {s.enter}, out {s.exit}</span>
                </span>
              </li>
            ))}
          </ol>
          {d.slots.length > 0 && <p className="text-fg-3">Slots: {d.slots.map((x) => x.label).join(" · ")}</p>}
          <Button size="sm" onClick={() => void navigator.clipboard.writeText(JSON.stringify({ film: d.film, slots: d.slots }, null, 2)).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy as a template's film and slots"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function Replicate({ api, state, setState, focus, onTaken, onPreview, onInbox }: { api: Api; state: LabState | null; setState: (s: LabState) => void; /** a film handed over from Study, replicated once */ focus?: string; onTaken: () => void; onPreview: (s: TemplateScript) => void; onInbox: () => void }) {
  const [refs, setRefs] = useState<Reference[]>([])
  const [about, setAbout] = useState("")
  const [url, setUrl] = useState("")
  const [category, setCategory] = useState("product-launch")
  const [found, setFound] = useState<Found[]>([])
  const [busy, setBusy] = useState<{ what: string; started: number } | null>(null)
  const [now, setNow] = useState(0)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [approved, setApproved] = useState(false)
  const pickFile = useRef<HTMLInputElement>(null)
  const ai = !!state?.key
  const load = useCallback(() => api<Reference[]>("references").then((r) => setRefs(r.filter((x) => x.area === "film")), () => {}), [api])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [busy])

  const run = async (what: string, job: () => Promise<void>) => {
    setBusy({ what, started: Date.now() })
    setNow(Date.now())
    setError("")
    try {
      await job()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      void load()
    }
  }
  const replicate = (body: object) =>
    run("replicate", async () => {
      const r = await api<Result & { state: LabState }>("replicate", { category, ...body })
      setState(r.state)
      setResult(r)
      setApproved(false)
    })
  useEffect(() => {
    if (!focus) return
    onTaken()
    void replicate({ ref: focus })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const find = () =>
    run("find", async () => {
      const r = await api<{ films: Found[] }>("replicate/find", { about: about.trim() || undefined })
      setFound(r.films)
      if (!r.films.length) setError("No new films found: paste one's address, or drop a video in.")
    })
  const take = (file: File) =>
    run("replicate", async () => {
      const q = new URLSearchParams({ area: "film", name: file.name, category })
      const up = await fetch(`/__lab/upload?${q}`, { method: "POST", headers: { "content-type": file.type }, body: file })
      const j = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(j.error ?? `The lab said ${up.status}`)
      const r = await api<Result & { state: LabState }>("replicate", { ref: (j.reference as Reference).id, category })
      setState(r.state)
      setResult(r)
      setApproved(false)
    })
  const approve = () =>
    run("approve", async () => {
      if (!result) return
      await api(`proposals/${result.proposal.id}/approve`, {})
      setApproved(true)
    })

  const studied = refs.filter((r) => r.shots.length || r.file?.type.startsWith("video/"))
  const secs = busy ? Math.max(0, Math.round((now - busy.started) / 1000)) : 0

  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <section aria-label="A film to replicate" className="space-y-2.5 rounded-xl bg-subtle p-3">
        <span className="block">
          <span className="block text-body font-medium">Replicate a launch film</span>
          <span className="block text-caption text-fg-3">The engine watches it twice: its cuts, then every shot's exact camera values and titles. It rebuilds the film from those numbers as a template, measured against the original. Your product's words and screens go where its own were.</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-caption text-fg-3" htmlFor="rep-kind">
            Files it as
          </label>
          <Select id="rep-kind" value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} h-8 cursor-pointer px-2 text-body`}>
            {CATEGORIES.film.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <input aria-label="A YouTube address" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && ai && !busy && void replicate({ url: url.trim() })} placeholder="https://www.youtube.com/watch?v=…" className={`${field} mono h-8 min-w-[220px] flex-1 px-2.5 text-body`} />
          <Button variant="primary" disabled={!ai || !url.trim() || !!busy} onClick={() => void replicate({ url: url.trim() })}>
            <CopySimple size={14} aria-hidden />
            Replicate it
          </Button>
          <Button disabled={!!busy} onClick={() => pickFile.current?.click()}>
            <UploadSimple size={14} aria-hidden />
            A video file
          </Button>
          <input ref={pickFile} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={(e) => (e.target.files?.[0] ? void take(e.target.files[0]) : undefined, (e.target.value = ""))} />
        </div>
        <div className="flex gap-2">
          <input aria-label="What to look for (optional)" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Or find one: what kind of film (optional)" className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body`} />
          <Button disabled={!ai || !!busy} onClick={() => void find()}>
            <MagnifyingGlass size={14} aria-hidden />
            {busy?.what === "find" ? "Finding…" : "Find films"}
          </Button>
        </div>
        {!ai && <p className="text-caption text-fg-3">A YouTube film needs your Gemini key (Settings). Without one, a video file still gets its cuts measured by ffmpeg, as a skeleton to frame by hand.</p>}
      </section>

      {found.length > 0 && (
        <section aria-label="Films found">
          <h3 className="pb-2 text-caption font-medium text-fg-3">Found · not watched yet</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {found.map((f) => (
              <li key={f.id} className="flex gap-2.5 rounded-xl bg-subtle p-2">
                <img src={`https://i.ytimg.com/vi/${f.id}/mqdefault.jpg`} alt="" loading="lazy" className="h-[54px] w-[96px] shrink-0 rounded-md bg-surface-2 object-cover" />
                <span className="min-w-0 flex-1">
                  <a href={f.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-caption font-medium hover:underline">
                    {f.title}
                  </a>
                  <span className="block truncate text-micro text-fg-3">{f.channel}</span>
                </span>
                <Button size="sm" disabled={!!busy} onClick={() => void replicate({ url: f.url })}>
                  Replicate
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {busy?.what === "replicate" && (
        <section role="status" aria-label="Replicating" className="rounded-xl bg-subtle p-3">
          <span className="flex items-baseline justify-between gap-2">
            <Thinking variant="globe" label="Replicating…" />
            <span className="text-caption tabular-nums text-fg-3">{secs} s · usually one to three minutes</span>
          </span>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-caption text-fg-2 marker:text-fg-3">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}
      {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}

      {result && (
        <section aria-label="The replica" className="rounded-xl bg-subtle p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-body font-medium">{result.proposal.script.name}</span>
              <span className="block text-caption text-fg-3">
                Of{" "}
                {result.reference.url ? (
                  <a href={result.reference.url} target="_blank" rel="noreferrer" className="underline decoration-fg-3 underline-offset-4 hover:text-fg">
                    {result.reference.title}
                  </a>
                ) : (
                  result.reference.title
                )}
                {result.reference.cutsMeasured ? " · cuts measured by ffmpeg" : ""}
                {result.reference.precise?.length ? ` · ${result.reference.precise.length} shots measured closely` : " · framed from its teardown"}
              </span>
            </span>
            <Score value={result.fidelity.score} verdict="% close to the film" />
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {result.fidelity.parts.map((p) => (
              <ScoreRow key={p.id} label={p.label} score={p.score} note={p.note} />
            ))}
          </ul>
          <AsTemplate reference={result.reference} />
          {result.notes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.notes.map((n, i) => (
                <li key={i} className="flex gap-1.5 text-caption text-fg-2">
                  <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-warn-ink" />
                  {n}
                </li>
              ))}
            </ul>
          )}
          <div className="scroll-thin mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-caption">
              <thead className="text-fg-3">
                <tr className="border-b">
                  <th className="py-1.5 pr-2 font-medium">#</th>
                  <th className="py-1.5 pr-2 font-medium">The film</th>
                  <th className="py-1.5 pr-2 font-medium">Comes in</th>
                  <th className="py-1.5 pr-2 font-medium">The replica</th>
                  <th className="py-1.5 font-medium">Comes in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.fidelity.rows.map((r) => (
                  <tr key={r.i} className="align-top">
                    <td className="py-1.5 pr-2 tabular-nums text-fg-3">{r.i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <span className="block text-fg">{r.what}</span>
                      <span className="block tabular-nums text-fg-3">
                        {r.at.toFixed(1)} s · {r.refDur.toFixed(1)} s
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-fg-2">{r.i ? short(r.refCut) : "opens"}</td>
                    <td className="py-1.5 pr-2">
                      <span className="block text-fg">{r.framing || "—"}</span>
                      <span className="block tabular-nums text-fg-3">
                        {r.repDur.toFixed(1)} s{r.titles ? ` · ${r.titles} title${r.titles > 1 ? "s" : ""}` : ""}
                        {r.standIn ? " · your device stands in" : ""}
                      </span>
                    </td>
                    <td className="py-1.5 text-fg-2">
                      {r.i ? short(r.repCut) : "opens"}
                      {r.i > 0 && r.refCut === r.repCut && <Check size={12} aria-label="the same" className="ml-1 inline text-fg-3" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
            {/* shots left unmeasured are asked for on their own; with all of them measured, the whole film again */}
            <Button size="sm" variant="ghost" className="mr-auto" disabled={!!busy || !ai} onClick={() => void replicate({ ref: result.reference.id, again: (result.reference.precise?.length ?? 0) >= result.reference.shots.length })}>
              <ArrowsClockwise size={14} aria-hidden />
              {(result.reference.precise?.length ?? 0) < result.reference.shots.length ? "Measure the rest" : "Measure again"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onPreview(result.proposal.script)}>
              <Play size={14} aria-hidden />
              Preview and edit in the Studio
            </Button>
            {approved ? (
              <Button size="sm" onClick={onInbox}>
                <Check size={14} aria-hidden />
                In the gallery
              </Button>
            ) : (
              <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void approve()}>
                <Check size={14} aria-hidden />
                Add to the gallery
              </Button>
            )}
          </div>
        </section>
      )}

      {studied.length > 0 && (
        <section aria-label="Films studied">
          <h3 className="pb-2 text-caption font-medium text-fg-3">Films the lab has · replicating one it has watched costs one request (one already measured, none)</h3>
          <ul className="divide-y">
            {studied.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <FilmReel size={14} aria-hidden className="shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{r.title}</span>
                  <span className="block text-micro text-fg-3">
                    {r.shots.length ? `${r.shots.length} shots` : "not torn down yet"}
                    {r.replica ? ` · replicated, ${r.replica.score}% close` : ""}
                  </span>
                </span>
                <Button size="sm" disabled={!!busy || (!ai && !r.file)} onClick={() => void replicate({ ref: r.id })}>
                  {r.replica ? "Rebuild" : "Replicate"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
