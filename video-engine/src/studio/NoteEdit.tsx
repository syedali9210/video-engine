// A note to the film in plain words ("make the intro punchier", "end on the logo, not the phone"): the Work API rewrites
// the film's script, and what changed is shown before it's taken, shot by shot, before and after, with why.
import { useState } from "react"
import { ChatCircleText } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, IconButton, Popover } from "../ui"
import { Glyph } from "../Thinking"
import type { Comp } from "./comp"
import { toScript, type ScriptShot, type TemplateScript } from "./script"

type Edit = { script: TemplateScript | null; errors: string[]; changes: { what: string; why: string }[]; by: string }
const brief = (s: ScriptShot) => `${s.name} · ${s.dur.toFixed(1)} s${s.cut && s.cut !== "cut" ? ` · ${s.cut}` : ""}${s.clip ? "" : ` · ${(s.layers ?? []).length} layers`}`

export function NoteEdit({ comp, onApply }: { comp: Comp; onApply: (s: TemplateScript, note: string) => void }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [error, setError] = useState("")
  const before = toScript(comp, { id: "film", name: "This film" })
  const ask = async () => {
    setBusy(true)
    setError("")
    setEdit(null)
    try {
      const r = await fetch("/__briefs/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ script: before, note }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "No change came back")
      setEdit(j)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const after = edit?.script
  const rows = after ? Math.max(before.shots.length, after.shots.length) : 0
  return (
    <>
      <IconButton label="A note to the film" popover="note-pop">
        <ChatCircleText size={17} />
      </IconButton>
      <Popover id="note-pop" align="end" label="A note to the film">
        <div className="w-[420px] max-w-[calc(100vw-16px)] space-y-3 p-3">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Make the intro punchier · End on the logo · Half as long" aria-label="Your note" className={`${field} w-full px-2.5 py-1.5 text-body`} />
          <Button variant="primary" disabled={busy || !note.trim()} onClick={() => void ask()}>
            {busy ? <><Glyph variant="breathe" size={14} /> Rewriting the film…</> : "Show me the change"}
          </Button>
          {error && <p role="alert" className="text-caption text-fg-2">{error}</p>}
          {edit && !after && <p className="text-caption text-fg-2">What came back didn't read as a film: {edit.errors.slice(0, 2).join(" ")}</p>}
          {after && (
            <>
              {edit!.changes.length > 0 && (
                <ul className="space-y-1 text-caption">
                  {edit!.changes.map((c, i) => (
                    <li key={i} className="text-fg-2">
                      {c.what} <span className="text-fg-3">· {c.why}</span>
                    </li>
                  ))}
                </ul>
              )}
              <table className="w-full table-fixed text-caption">
                <thead>
                  <tr className="text-left text-fg-3">
                    <th className="pb-1 font-medium">Before</th>
                    <th className="pb-1 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }, (_, i) => {
                    const a = before.shots[i]
                    const b = after.shots[i]
                    const same = a && b && brief(a) === brief(b) && JSON.stringify(a.layers ?? []) === JSON.stringify(b.layers ?? [])
                    return (
                      <tr key={i} className={same ? "text-fg-3" : "text-fg"}>
                        <td className="truncate py-0.5 pr-2">{a ? brief(a) : "—"}</td>
                        <td className="truncate py-0.5">{b ? brief(b) : "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => (onApply(after, note), setEdit(null), setNote(""))}>
                  Take it
                </Button>
                <Button variant="ghost" onClick={() => setEdit(null)}>
                  Not this
                </Button>
              </div>
              <p className="text-caption text-fg-3">{edit!.by}. Taking it can be undone.</p>
            </>
          )}
        </div>
      </Popover>
    </>
  )
}
