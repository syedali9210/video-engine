// The command palette (Ctrl K, the rail's search, the box on Home): one field that finds anything and does it. Filters
// as chips with their icons (Places, Products, Films, Actions; one picked shows ×), then the results in groups (what
// you opened lately, quick actions with their keys, places, your own work found in plain words, products by their
// stills, films by their kind). Arrows move
// through them, Enter runs one, Escape closes; the pointer works the same. Over the app on a dimmed, blurred backdrop.
import { useEffect, useMemo, useRef, useState } from "react"
import { CaretRight, Lightning, MagnifyingGlass, SquaresFour, FilmStrip, Compass, FolderSimple, X } from "@phosphor-icons/react"
import { Dialog, type Icon } from "./ui"
import { Gloss } from "./Gloss"

export type PaletteGroup = "recent" | "work" | "actions" | "places" | "products" | "films"
export type PaletteItem = { id: string; group: PaletteGroup; title: string; sub?: string; icon?: Icon; tone?: string; /** a picture instead of an icon (a still's address) */ picture?: string; kbd?: string; words?: string; /** shown only when what's typed finds it */ secret?: boolean; /** found by the server's search, in plain words: shown as it is */ found?: boolean; run: () => void }

const GROUPS: { id: PaletteGroup; name: string }[] = [
  { id: "recent", name: "Recent" },
  { id: "actions", name: "Quick actions" },
  { id: "places", name: "Places" },
  { id: "products", name: "Products" },
  { id: "films", name: "Films" },
  // the server's word-by-word search last: a name typed exactly finds its film or product first
  { id: "work", name: "Your work" },
]
const FILTERS: { id: Exclude<PaletteGroup, "recent">; name: string; icon: Icon }[] = [
  { id: "places", name: "Places", icon: Compass },
  { id: "products", name: "Products", icon: SquaresFour },
  { id: "films", name: "Films", icon: FilmStrip },
  { id: "actions", name: "Actions", icon: Lightning },
  { id: "work", name: "Your work", icon: FolderSimple },
]

export function Palette({ open, onClose, items: own, query: start = "", search }: { open: boolean; onClose: () => void; items: PaletteItem[]; query?: string; /** your own work, found in plain words as you type */ search?: (q: string) => Promise<PaletteItem[]> }) {
  const [q, setQ] = useState(start)
  const [work, setWork] = useState<PaletteItem[]>([])
  // (the app hands a new function each render: what's typed is what asks again)
  const ask = useRef(search)
  ask.current = search
  useEffect(() => {
    if (!ask.current || q.trim().length < 2) return setWork([])
    let on = true
    const t = setTimeout(() => void ask.current?.(q).then((w) => on && setWork(w), () => {}), 180)
    return () => {
      on = false
      clearTimeout(t)
    }
  }, [q])
  const items = useMemo(() => [...own, ...work], [own, work])
  const [only, setOnly] = useState<PaletteGroup[]>([])
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    setQ(start)
    setOnly([])
    setAt(0)
    requestAnimationFrame(() => input.current?.focus())
  }, [open, start])
  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    const hit = (x: PaletteItem) => !t || x.found || `${x.title} ${x.sub ?? ""} ${x.words ?? ""}`.toLowerCase().includes(t)
    const keep = (x: PaletteItem) => (x.secret ? t.length >= 4 : only.length ? only.includes(x.group) : t ? x.group !== "recent" : true)
    return GROUPS.map((g) => ({ g, rows: items.filter((x) => x.group === g.id && keep(x) && hit(x)).slice(0, t || only.length ? 8 : g.id === "products" || g.id === "films" ? 4 : 6) })).filter((x) => x.rows.length)
  }, [items, q, only])
  const flat = found.flatMap((x) => x.rows)
  const run = (x?: PaletteItem) => {
    if (!x) return
    onClose()
    x.run()
  }
  useEffect(() => setAt(0), [q, only])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" })
  }, [at])
  let i = -1
  return (
    <Dialog open={open} onClose={onClose} label="Search" className="modal palette">
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center gap-3 border-b px-4">
          <MagnifyingGlass size={18} aria-hidden className="shrink-0 text-fg-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setAt((a) => Math.min(flat.length - 1, a + 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setAt((a) => Math.max(0, a - 1))
              } else if (e.key === "Enter") {
                e.preventDefault()
                run(flat[at])
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={flat[at] ? `pal-${flat[at].id}` : undefined}
            placeholder="Search for products, films, places, actions and your own work"
            className="h-14 min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="mono shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-fg-3 shadow-[var(--in-well)]">Esc</kbd>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-1 pt-3">
          <span className="mr-1 text-caption text-fg-3">I'm looking for…</span>
          {FILTERS.map((f) => {
            const on = only.includes(f.id)
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => setOnly((o) => (on ? o.filter((x) => x !== f.id) : [...o, f.id]))} className={`press btn chip flex h-7 items-center gap-1.5 rounded-full pl-2 text-caption font-medium ${on ? "pr-1.5" : "pr-2.5 text-fg-2"}`}>
                <f.icon size={14} aria-hidden />
                {f.name}
                {on && <X size={11} aria-hidden className="opacity-70" />}
              </button>
            )
          })}
        </div>
        <div ref={list} id="palette-list" role="listbox" aria-label="Results" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {found.map(({ g, rows }) => (
            <div key={g.id} role="group" aria-label={g.name} className="pt-2">
              <p className="px-2.5 pb-1 pt-1 text-micro font-medium text-fg-3">
                {g.name} {g.id !== "actions" && <span className="tabular-nums">{rows.length}</span>}
              </p>
              {rows.map((x) => {
                i += 1
                const me = i
                const on = me === at
                return (
                  <div
                    key={x.id}
                    id={`pal-${x.id}`}
                    role="option"
                    aria-selected={on}
                    data-i={me}
                    onPointerMove={() => setAt(me)}
                    onClick={() => run(x)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-100 ${on ? "bg-surface-2 shadow-[var(--in-hi)]" : ""}`}
                  >
                    {x.picture ? (
                      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-surface-3 shadow-[0_0_0_1px_var(--line)]">
                        <img src={x.picture} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.opacity = "0")} />
                      </span>
                    ) : x.icon ? (
                      x.tone ? (
                        <Gloss icon={x.icon} tone={x.tone} size={28} />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
                          <x.icon size={15} aria-hidden />
                        </span>
                      )
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium">{x.title}</span>
                      {x.sub && <span className="block truncate text-caption text-fg-3">{x.sub}</span>}
                    </span>
                    {x.kbd ? <kbd className="mono shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-micro text-fg-3 shadow-[var(--in-well)]">{x.kbd}</kbd> : <CaretRight size={13} aria-hidden className={`shrink-0 text-fg-3 transition-opacity duration-100 ${on ? "opacity-100" : "opacity-0"}`} />}
                  </div>
                )
              })}
            </div>
          ))}
          {!flat.length && <p className="px-3 py-10 text-center text-body text-fg-3">Nothing called “{q}”. Try a product's name, a kind of film, or a place.</p>}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2.5 text-micro text-fg-3">
          <span>
            <kbd className="mono">↑↓</kbd> to move
          </span>
          <span>
            <kbd className="mono">↵</kbd> to open
          </span>
          <span className="ml-auto">Ctrl K anywhere</span>
        </div>
      </div>
    </Dialog>
  )
}
