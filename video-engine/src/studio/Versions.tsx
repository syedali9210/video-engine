// The film's history, kept: undo survives a reload (the last 50 steps, in this browser's IndexedDB, for the composition
// they belong to), and named versions are kept by the engine's server, to go back to whenever.
import { useEffect, useState } from "react"
import { ClockCounterClockwise, Trash } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, IconButton, Popover } from "../ui"
import type { Comp } from "./comp"

/* ---------------- undo across reloads ---------------- */

const DB = "anim-engine"
const open = () =>
  new Promise<IDBDatabase>((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore("kv")
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open()
  return new Promise<T>((ok, no) => {
    const req = run(db.transaction("kv", mode).objectStore("kv"))
    req.onsuccess = () => ok(req.result)
    req.onerror = () => no(req.error)
  })
}
type Kept = { at: string; now: string; past: Comp[]; future: Comp[] }
let timer = 0
/** Keeps the history a moment after the last change (the steps, and the composition they lead to). */
export function keepHistory(now: Comp, past: Comp[], future: Comp[]) {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    void idb("readwrite", (s) => s.put({ at: new Date().toISOString(), now: JSON.stringify(now), past: past.slice(-50), future: future.slice(-50) } satisfies Kept, "history")).catch(() => {
      // a private window, or no room: undo just doesn't outlive the page
    })
  }, 800)
}
/** The history kept for this composition (the one open when it was kept), if there is one. */
export async function keptHistory(now: Comp): Promise<{ past: Comp[]; future: Comp[] } | null> {
  try {
    const k = await idb<Kept | undefined>("readonly", (s) => s.get("history") as IDBRequest<Kept | undefined>)
    return k && k.now === JSON.stringify(now) ? { past: k.past, future: k.future } : null
  } catch {
    return null
  }
}

/* ---------------- named versions ---------------- */

type Row = { id: string; name: string; at: string; scenes: number; seconds: number }
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

export function Versions({ comp, onRestore }: { comp: Comp; /** back to a version (undoable like any change) */ onRestore: (c: Comp, name: string) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const call = async <T,>(path: string, body?: object) => {
    const r = await fetch(`/__versions/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
    const j = await r.json()
    if (!r.ok) throw new Error(j.error ?? "The engine's server didn't keep it")
    return j as T
  }
  const load = () => void call<Row[]>("list").then(setRows, (e: Error) => setError(e.message))
  useEffect(load, [])
  const save = () =>
    void call<Row[]>("save", { name: name.trim() || `Version ${rows.length + 1}`, comp }).then(
      (r) => (setRows(r), setName("")),
      (e: Error) => setError(e.message),
    )
  return (
    <>
      <IconButton label="Versions" popover="versions-pop">
        <ClockCounterClockwise size={17} />
      </IconButton>
      <Popover id="versions-pop" align="end" label="Versions">
        <div className="w-[320px] space-y-3 p-3">
          <div className="flex gap-2">
            <input aria-label="This version's name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder={`Version ${rows.length + 1}`} className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body`} />
            <Button onClick={save}>Keep</Button>
          </div>
          {error && <p role="alert" className="text-caption text-fg-2">{error}</p>}
          {rows.length ? (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {rows.map((v) => (
                <li key={v.id} className="group flex items-center gap-1">
                  <button type="button" onClick={() => void call<{ comp: Comp }>(`get?id=${v.id}`).then((x) => onRestore(x.comp, v.name), (e: Error) => setError(e.message))} className="press min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                    <span className="block truncate text-body">{v.name}</span>
                    <span className="block text-caption text-fg-3">
                      {when(v.at)} · {v.scenes} {v.scenes === 1 ? "scene" : "scenes"}, {v.seconds} s
                    </span>
                  </button>
                  <IconButton size="sm" label={`Forget “${v.name}”`} onClick={() => void call<Row[]>("remove", { id: v.id }).then(setRows)}>
                    <Trash size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-fg-3">Keep the film as it is now, by name, to come back to it after any number of changes. Undo also survives a reload.</p>
          )}
        </div>
      </Popover>
    </>
  )
}
