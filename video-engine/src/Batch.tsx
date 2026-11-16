// Batch: many films at once. One template for many products, or many templates for one, each in the shapes asked for
// (re-framed, not cropped). Every film is queued on the renderer as it's made (its lines written for its product with
// a Work API key), and comes to download when it's done. The list outlasts a reload: the renderer carries on.
import { useEffect, useState } from "react"
import { DownloadSimple, WarningCircle } from "@phosphor-icons/react"
import { Button } from "./ui"
import { Glyph } from "./Thinking"
import type { Template } from "./studio/comp"
import type { ProductKit } from "./studio/product"

/** The film a template makes (its launch film's id). */
export const animOf = (t: Template) => t.values?.({ device: "iphone", posture: "open", name: "", anim: "", copy: { kicker: "", hook: "", name: "", tagline: "", features: [], split: "", proof: "", cta: "", by: "rules" } }).anim ?? ""

export type BatchJob = (t: Template, kit: ProductKit, size: string) => Promise<{ id: string; /** lines still the template's own */ kept: number }>
type Row = { key: string; label: string; file: string; id?: string; kept?: number; state: string; pct: number; error?: string }
const SAVED = "anim-engine:batch"

const SHAPES = [
  { value: "16x9", label: "16:9" },
  { value: "1x1", label: "1:1" },
  { value: "9x16", label: "9:16" },
]
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function Chips({ label, options, on, set }: { label: string; options: { value: string; label: string }[]; on: string[]; set: (v: string[]) => void }) {
  return (
    <div>
      <span className="block pb-1.5 text-caption text-fg-3">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={on.includes(o.value)} onClick={() => set(toggle(on, o.value))} className={`press h-7 rounded-md px-2.5 text-caption font-medium ${on.includes(o.value) ? "bg-sel/15 text-fg shadow-[inset_0_0_0_1px_var(--sel)]" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Batch({ kit, kits, templates, onBatch }: { kit: ProductKit; kits: { id: string; name: string }[]; templates: Template[]; onBatch: BatchJob }) {
  const [products, setProducts] = useState([kit.id])
  const [films, setFilms] = useState<string[]>([])
  const [shapes, setShapes] = useState(["16x9"])
  const [rows, setRows] = useState<Row[]>(() => {
    try {
      return (JSON.parse(sessionStorage.getItem(SAVED) ?? "[]") as Row[]).filter((r) => r.id)
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(SAVED, JSON.stringify(rows))
    } catch {
      // a private window: the list just isn't kept
    }
  }, [rows])
  const [busy, setBusy] = useState(false)
  const n = products.length * films.length * shapes.length
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const start = async () => {
    setBusy(true)
    const list = products.flatMap((k) => films.flatMap((f) => shapes.map((s) => ({ k, t: templates.find((x) => x.id === f)!, s }))))
    const name = (k: string) => kits.find((x) => x.id === k)?.name ?? k
    setRows(list.map(({ k, t, s }) => ({ key: `${k}/${t.id}/${s}`, label: `${name(k)} · ${t.name} · ${s.replace("x", ":")}`, file: `${slug(name(k))}-${slug(t.name)}-${s}.mp4`, state: "making", pct: 0 })))
    const full = new Map<string, ProductKit>()
    for (const { k, t, s } of list) {
      const key = `${k}/${t.id}/${s}`
      try {
        if (!full.has(k)) full.set(k, (await (await fetch(`/__kit/get?id=${k}`)).json()) as ProductKit)
        patch(key, { ...(await onBatch(t, full.get(k)!, s)), state: "queued" })
      } catch (e) {
        patch(key, { state: "error", error: (e as Error).message })
      }
    }
    setBusy(false)
  }

  // each film's progress on the renderer (it renders one at a time, in the order they were queued)
  useEffect(() => {
    const live = rows.filter((r) => r.id && r.state !== "done" && r.state !== "error")
    if (!live.length) return
    const t = setTimeout(() => {
      for (const r of live)
        void fetch(`/__studio/jobs/${r.id}`)
          .then((x) => x.json() as Promise<{ state: string; frame: number; total: number; error?: string }>)
          .then((s) => patch(r.key, { state: s.state, pct: s.total ? s.frame / s.total : 0, error: s.error }), () => {})
    }, 1000)
    return () => clearTimeout(t)
  }, [rows])

  const done = rows.filter((r) => r.state === "done")
  const download = (r: Row) => Object.assign(document.createElement("a"), { href: `/__studio/jobs/${r.id}/file`, download: r.file }).click()
  return (
    <div className="space-y-4">
      <Chips label="Products" options={kits.map((k) => ({ value: k.id, label: k.name }))} on={products} set={setProducts} />
      <Chips label="Templates" options={templates.map((t) => ({ value: t.id, label: t.name }))} on={films} set={setFilms} />
      <Chips label="Shapes" options={SHAPES} on={shapes} set={setShapes} />
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy || !n} onClick={() => void start()}>
          {busy ? <><Glyph variant="slide" size={14} /> Queuing…</> : n ? `Render ${n} film${n > 1 ? "s" : ""}` : "Pick a template"}
        </Button>
        {done.length > 1 && (
          <Button variant="ghost" onClick={() => done.forEach(download)}>
            <DownloadSimple size={14} aria-hidden /> Download all {done.length}
          </Button>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="divide-y rounded-xl shadow-[0_0_0_1px_var(--line)]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5 text-caption">
              <span className="min-w-0 flex-1 truncate text-fg">
                {r.label}
                {!!r.kept && <span className="text-warn-ink"> · {r.kept} line{r.kept > 1 ? "s" : ""} still the template's</span>}
              </span>
              {r.state === "done" ? (
                <button type="button" onClick={() => download(r)} className="press flex items-center gap-1 text-fg-2 hover:text-fg">
                  <DownloadSimple size={14} aria-hidden /> Download
                </button>
              ) : r.state === "error" ? (
                <span title={r.error} className="flex items-center gap-1 text-bad-ink">
                  <WarningCircle size={14} aria-hidden /> Failed
                </span>
              ) : (
                <span className="tabular-nums text-fg-3">{r.state === "rendering" && r.pct ? `${Math.round(r.pct * 100)}%` : r.state === "encoding" ? "Encoding" : r.state === "making" ? "Making" : "Queued"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
