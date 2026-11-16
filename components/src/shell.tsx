// The frame every place sits in. On a desktop one floating glass island at the bottom of the window carries the
// Library, then find, New and you. Above it the Library is a page (a big title, its categories, every component
// drawn big). Opening one goes full-screen into its editor, whose dock is the same glass and starts with the way back.
import { createContext, startTransition, useContext, useLayoutEffect, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowLeft, MagnifyingGlass, Plus, SquaresFour } from "@phosphor-icons/react"
import type { Icon } from "./ui"
import { Logo, Popover, Tip, rove, useFlip } from "./ui"

/** On a desktop the island carries the places, so a left panel's own top shows only its actions (or nothing): the
    panel is the place's content, never navigation. */
export const InBar = createContext(false)

/** The top of every left panel: on a desktop just its actions; without the island (phone, tablet), the mark and the
    app's name with whatever the panel adds there. */
export function BrandRow({ children }: { children?: ReactNode }) {
  const bar = useContext(InBar)
  if (bar) return children ? <div className="flex h-11 shrink-0 items-center justify-end gap-0.5 px-2">{children}</div> : null
  return (
    <div className="flex h-12 shrink-0 items-center gap-2.5 pl-4 pr-2">
      <Logo size={20} />
      <span className="truncate text-body font-semibold tracking-[-0.01em]">Components</span>
      {children && <span className="ml-auto flex items-center gap-0.5">{children}</span>}
    </div>
  )
}

export type Space = "library"
/** The places, named for what's in them. */
export const SPACES: { id: Space; name: string; icon: Icon }[] = [{ id: "library", name: "Library", icon: SquaresFour }]

// the mark's curve, and the easings it can become (ease-in-out, ease-out, ease-in, a spring that overshoots)
const CURVES = ["M6.5 17C11.5 17 12.5 7 17.5 7", "M6.5 17C8 9 10 7 17.5 7", "M6.5 17C15 17 17 12 17.5 7", "M6.5 17C9 2 13 12 17.5 7"]

/** The engine's mark, alive: its handles breathe under the pointer, and when it dances (`dance` changes) its curve runs
    through the easings and settles back. */
export function LiveLogo({ size = 22, dance = 0 }: { size?: number; dance?: number }) {
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!dance || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const steps = [1, 2, 3, 1, 0]
    const ts = steps.map((v, i) => setTimeout(() => setAt(v), 140 + i * 260))
    return () => ts.forEach(clearTimeout)
  }, [dance])
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`live-logo shrink-0 ${dance ? "dancing" : ""}`} key={dance}>
      <rect width="24" height="24" rx="6.5" fill="var(--fg)" />
      <path d={CURVES[at]} fill="none" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" style={{ transition: "d 240ms cubic-bezier(0.34, 1.4, 0.64, 1)" }} />
      <circle className="h1" cx="6.5" cy="17" r="1.9" fill="var(--surface)" />
      <circle className="h2" cx="17.5" cy="7" r="1.9" fill="var(--surface)" />
    </svg>
  )
}

/** A pill that slides to the element marked by `selector` inside `box`, re-measured when `key` or the box changes. */
function useGlide(box: React.RefObject<HTMLElement | null>, selector: string, key: unknown) {
  const [g, setG] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const place = () => {
      const on = el.querySelector<HTMLElement>(selector)
      if (!on) return setG(null)
      const a = el.getBoundingClientRect()
      const b = on.getBoundingClientRect()
      const x = b.left - a.left + el.scrollLeft
      setG((p) => (p && p.x === x && p.w === b.width ? p : { x, w: b.width }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [box, selector, key])
  return g
}

/** The island: the app's navigation, floating at the bottom of the window. The mark (five quick clicks throw a party),
    the Library with a lit pill, then find, New (its menu opens upward) and you. */
export function Island({ at, go, onSearch, newMenu, me, onLogo, dance }: { at: Space; go: (s: Space) => void; onSearch: () => void; newMenu: ReactNode; /** the avatar and its menu */ me: ReactNode; /** five quick clicks on the mark */ onLogo?: () => void; dance?: number }) {
  const box = useRef<HTMLElement>(null)
  // the place you pressed lights at once; the page follows (it renders after the light has moved, see go below)
  const [want, setWant] = useState<Space | null>(null)
  useEffect(() => setWant(null), [at])
  const here = want ?? at
  const pill = useGlide(box, '.island-item[aria-current="page"]', here)
  const pillEl = useRef<HTMLSpanElement>(null)
  useFlip(pillEl, pill && { x: pill.x, w: pill.w })
  const goTo = (s: Space) => {
    if (s === here) return
    setWant(s)
    startTransition(() => go(s))
  }
  const clicks = useRef<number[]>([])
  return (
    <div className="island-wrap">
      <nav ref={box} aria-label="Places" className="island">
        {pill && <span ref={pillEl} aria-hidden className="island-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
        <Tip label="Components" side="top">
          <button
            type="button"
            aria-label="Components"
            onClick={() => {
              const now = performance.now()
              clicks.current = [...clicks.current.filter((t) => now - t < 1600), now]
              if (clicks.current.length >= 5) {
                clicks.current = []
                onLogo?.()
              } else goTo("library")
            }}
            className="island-icon"
          >
            <LiveLogo size={24} dance={dance} />
          </button>
        </Tip>
        <span aria-hidden className="island-sep" />
        {SPACES.map((s) => (
          <button key={s.id} type="button" aria-current={s.id === here ? "page" : undefined} aria-label={s.name} onPointerDown={(e) => e.button === 0 && goTo(s.id)} onClick={() => goTo(s.id)} className="island-item">
            <s.icon aria-hidden />
            <span className="label">{s.name}</span>
          </button>
        ))}
        <span aria-hidden className="island-sep" />
        <Tip label="Find anything" kbd="Ctrl K" side="top">
          <button type="button" aria-label="Find anything" onClick={onSearch} className="island-icon">
            <MagnifyingGlass aria-hidden />
          </button>
        </Tip>
        <button type="button" popoverTarget="island-new" className="island-new ml-1">
          <Plus aria-hidden weight="bold" />
          New
        </button>
        <Popover id="island-new" side="top" align="end" label="New">
          {newMenu}
        </Popover>
        <span className="grid h-11 w-11 place-items-center">{me}</span>
      </nav>
    </div>
  )
}

/** The way back out of an editor, carried by its dock: the place it opened from. Empty (no button) off a desktop. */
export const Back = createContext<{ label: string; go: () => void } | null>(null)
export function DockBack({ alone }: { /** the only thing on its dock: no divider after it */ alone?: boolean }) {
  const b = useContext(Back)
  if (!b) return null
  return (
    <>
      <Tip label={`Back to ${b.label}`} kbd="Esc" side="top">
        <button type="button" onClick={b.go} className="dock-back">
          <ArrowLeft aria-hidden />
          {b.label}
        </button>
      </Tip>
      {!alone && <span aria-hidden className="dock-sep" />}
    </>
  )
}

/** A page above the island: the soft light from above, a centred column, room at the foot for the island. */
export function Page({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main aria-label={label} className="page-ground scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-36 pt-12 lg:px-10 lg:pt-16">{children}</div>
    </main>
  )
}

/** A page's head: a small line over it (whose it is), the title, one line, and its actions. */
export function PageTitle({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise-in flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0 max-w-[720px]">
        {eyebrow && <div className="mb-3 text-body text-fg-3">{eyebrow}</div>}
        <h1 className="text-page font-semibold tracking-[-0.035em] text-balance">{title}</h1>
        {sub && <p className="mt-3 text-lead text-fg-2 text-pretty">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A section of a page: its title (and how many), what's at its right, then its content. */
export function PageSection({ title, count, aside, icon: I, children, className = "" }: { title: string; count?: number; aside?: ReactNode; icon?: Icon; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`below-fold ${className}`}>
      <div className="mb-5 flex min-h-9 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="flex items-center gap-2.5 text-section font-semibold tracking-[-0.02em]">
          {I && (
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]">
              <I size={17} />
            </span>
          )}
          {title}
          {count != null && <span className="text-lead font-normal tabular-nums text-fg-3">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** The one category control: pills in a well, the picked one lit, a pill that slides to it. Arrow keys move. */
export function Pills<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number; icon?: Icon }[]; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const g = useGlide(box, '[aria-selected="true"]', value)
  const glide = useRef<HTMLSpanElement>(null)
  useFlip(glide, g && { x: g.x, w: g.w })
  return (
    <div ref={box} role="tablist" aria-label={label} onKeyDown={(e: KeyboardEvent<HTMLElement>) => rove(e, options.map((o) => o.value), value, onChange, "tab")} className="pills">
      {g && <span ref={glide} aria-hidden className="pill-glide" style={{ transform: `translateX(${g.x}px)`, width: g.w }} />}
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)} className="pill-item">
          {o.icon && <o.icon aria-hidden />}
          {o.label}
          {o.count != null && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** The same choice for a long list of categories, down the side: a glyph, the name and how many, the picked row lit
    with a highlight that slides to it. Arrow keys move. */
export function SideList<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number; icon?: Icon }[]; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [g, setG] = useState<{ y: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const place = () => {
      const on = el.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!on) return setG(null)
      const a = el.getBoundingClientRect()
      const b = on.getBoundingClientRect()
      setG((p) => (p && p.y === b.top - a.top && p.h === b.height ? p : { y: b.top - a.top, h: b.height }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])
  const glide = useRef<HTMLSpanElement>(null)
  useFlip(glide, g && { y: g.y, h: g.h })
  return (
    <div ref={box} role="tablist" aria-orientation="vertical" aria-label={label} onKeyDown={(e: KeyboardEvent<HTMLElement>) => rove(e, options.map((o) => o.value), value, onChange, "tab")} className="relative flex flex-col gap-0.5">
      {g && <span ref={glide} aria-hidden className="side-glide" style={{ transform: `translateY(${g.y}px)`, height: g.h }} />}
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)} className="side-item">
          {o.icon && <o.icon aria-hidden />}
          <span className="mr-auto truncate">{o.label}</span>
          {o.count != null && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** A panel's own head under the brand: its title (or its tabs) and its actions. */
export function PanelHead({ children }: { children: ReactNode }) {
  return <div className="flex h-11 shrink-0 items-center gap-2 border-y pl-4 pr-2">{children}</div>
}

/** The foot of every left panel: the app's buttons (theme, shortcuts, the lab) and what the panel holds. */
export function PanelFoot({ children, info }: { children?: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-t px-2">
      {children}
      {info && <span className="ml-auto min-w-0 truncate pr-2 text-caption tabular-nums text-fg-3">{info}</span>}
    </div>
  )
}

/** The picked thing's kind, as the inspector's header shows it: its icon on a tint of its colour. */
export function KindTile({ icon: I, tone }: { icon: Icon; tone?: string }) {
  return (
    <span aria-hidden className="k-tint k-ink grid h-6 w-6 shrink-0 place-items-center rounded-md" style={tone ? ({ "--k": tone } as React.CSSProperties) : undefined}>
      <I size={14} />
    </span>
  )
}

/** A row of categories that narrows a list to one: "All" first, each with how many it holds. The same pills as the
    galleries, so every category choice in the app looks and moves the same. */
export function CategoryChips({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { id: string; name: string; count?: number }[]; label: string }) {
  return <Pills value={value} onChange={onChange} label={label} options={options.map((o) => ({ value: o.id, label: o.name, count: o.count }))} />
}
