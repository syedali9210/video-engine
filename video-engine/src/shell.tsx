// The frame every place sits in. On a desktop a sidebar on the ground is how you move around: New and Search first,
// then Home, Product, Films, Creatives and (on this machine) the Lab, what you opened lately, and you. Beside it, Home
// and the galleries are pages on one sheet (a title, one line, one action, then the work drawn big). Opening something
// goes full-screen into its editor, whose toolbar starts with the way back.
import { createContext, startTransition, useContext, useLayoutEffect, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowLeft, DotsThree, FilmStrip, Flask, FrameCorners, House, MagnifyingGlass, Plus, SidebarSimple, Tray, Package } from "@phosphor-icons/react"
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
      <Wordmark className="truncate" />
      {children && <span className="ml-auto flex items-center gap-0.5">{children}</span>}
    </div>
  )
}

export type Space = "home" | "product" | "films" | "creatives" | "lab"
/** The places, named for what's in them. */
export const SPACES: { id: Space; name: string; icon: Icon }[] = [
  { id: "home", name: "Home", icon: House },
  // your product's kit and the Lab live on the engine's server, with your files and keys: a build for the web leaves them out
  ...(import.meta.env.DEV ? [{ id: "product" as const, name: "Product", icon: Package }] : []),
  { id: "films", name: "Films", icon: FilmStrip },
  { id: "creatives", name: "Creatives", icon: FrameCorners },
  ...(import.meta.env.DEV ? [{ id: "lab" as const, name: "Lab", icon: Flask }] : []),
]

/** The engine's mark, alive: a dot on an ease-out arc and its two ghosts. Under the pointer the ghosts fall back
    along the arc (the trail lengthens); when it dances (`dance` changes) the dot runs the arc again and lands. Still
    under reduced motion. */
export function LiveLogo({ size = 22, dance = 0 }: { size?: number; dance?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`live-logo shrink-0 text-fg ${dance ? "dancing" : ""}`} key={dance}>
      <circle className="g2" cx="5" cy="18" r="2.1" fill="currentColor" opacity=".3" />
      <circle className="g1" cx="9.8" cy="13.6" r="3" fill="currentColor" opacity=".58" />
      <circle className="dot" cx="16.4" cy="8.6" r="4.6" fill="currentColor" />
    </svg>
  )
}

/** The wordmark beside the mark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`text-[14.5px] font-semibold tracking-[-0.025em] ${className}`}>Video Engine</span>
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

/** One recent thing in the sidebar: its still, its name, a click opens it. */
export type RecentItem = { id: string; name: string; thumb?: string; onOpen: () => void }

/** The sidebar: the app's navigation, on the ground beside the page. The mark (home; five quick clicks throw a
    party), New (everything that can be started), Search, then the places with a raised card that glides to where you
    are, what you opened lately, and you. Collapsed it keeps only glyphs, each naming itself on hover; the mark turns
    into the way to open it again. */
export function Sidebar({ at, go, onSearch, review, newMenu, meMenu, recent = [], collapsed, onCollapse, onLogo, dance }: { at: Space; go: (s: Space) => void; onSearch: () => void; /** what's waiting for a verdict (the Lab's, so only on this machine) */ review?: { count: number; open: boolean; toggle: () => void }; newMenu: ReactNode; /** your menu: the theme, tips, shortcuts */ meMenu: ReactNode; recent?: RecentItem[]; collapsed: boolean; onCollapse: (c: boolean) => void; /** five quick clicks on the mark */ onLogo?: () => void; dance?: number }) {
  const list = useRef<HTMLElement>(null)
  // the place you pressed lights at once; the page follows (it renders after the light has moved, see go below)
  const [want, setWant] = useState<Space | null>(null)
  useEffect(() => setWant(null), [at])
  const here = want ?? at
  const [g, setG] = useState<{ y: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const place = () => {
      const on = el.querySelector<HTMLElement>('.nav-item[aria-current="page"]')
      if (!on) return setG(null)
      const a = el.getBoundingClientRect()
      const b = on.getBoundingClientRect()
      setG((p) => (p && p.y === b.top - a.top && p.h === b.height ? p : { y: b.top - a.top, h: b.height }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [here, collapsed])
  const glide = useRef<HTMLSpanElement>(null)
  useFlip(glide, g && { y: g.y, h: g.h })
  const goTo = (s: Space) => {
    if (s === here) return
    setWant(s)
    startTransition(() => go(s))
  }
  const clicks = useRef<number[]>([])
  const [newOpen, setNewOpen] = useState(false)
  // collapsed, each glyph names itself on hover; open, the names are there
  const tip = (label: string, node: ReactNode, kbd?: string) =>
    collapsed ? (
      <Tip label={label} kbd={kbd} side="right">
        {node}
      </Tip>
    ) : (
      node
    )
  return (
    <aside className="sidebar" data-collapsed={collapsed} aria-label="Video Engine">
      <div className="side-top">
        {tip(
          collapsed ? "Open the sidebar" : "Home",
          <button
            type="button"
            aria-label={collapsed ? "Open the sidebar" : "Video Engine, home"}
            onClick={() => {
              if (collapsed) return onCollapse(false)
              const now = performance.now()
              clicks.current = [...clicks.current.filter((t) => now - t < 1600), now]
              if (clicks.current.length >= 5) {
                clicks.current = []
                onLogo?.()
              } else goTo("home")
            }}
            className="group/logo relative grid h-8 w-8 shrink-0 place-items-center rounded-[9px] transition-colors duration-150 hover:bg-[var(--nav-hover)]"
          >
            <span className={collapsed ? "transition-opacity duration-150 group-hover/logo:opacity-0" : ""}>
              <LiveLogo size={24} dance={dance} />
            </span>
            {collapsed && <SidebarSimple aria-hidden size={18} className="absolute text-fg-2 opacity-0 transition-opacity duration-150 group-hover/logo:opacity-100" />}
          </button>,
        )}
        <Wordmark className="side-label" />
        <span className="side-hide ml-auto">
          <Tip label="Close the sidebar" kbd={"Ctrl \\"} side="bottom">
            <button type="button" aria-label="Close the sidebar" onClick={() => onCollapse(true)} className="grid h-8 w-8 place-items-center rounded-[9px] text-fg-3 transition-colors duration-150 hover:bg-[var(--nav-hover)] hover:text-fg">
              <SidebarSimple size={18} aria-hidden />
            </button>
          </Tip>
        </span>
      </div>

      {tip(
        "New",
        <button type="button" popoverTarget="side-new" aria-expanded={newOpen} className="nav-new">
          <Plus aria-hidden weight="bold" />
          <span className="side-label">New</span>
        </button>,
      )}
      <Popover id="side-new" side="right" align="start" label="New" onToggle={setNewOpen}>
        {newMenu}
      </Popover>
      <div className="mt-1.5 flex flex-col gap-px">
        {tip(
          "Search",
          <button type="button" onClick={onSearch} className="nav-item">
            <MagnifyingGlass aria-hidden />
            <span className="side-label">Search</span>
            <span className="kbd-hint side-hide">Ctrl K</span>
          </button>,
          "Ctrl K",
        )}
        {review &&
          tip(
            review.count ? `${review.count} to review` : "Inbox",
            <button type="button" aria-expanded={review.open} onClick={review.toggle} className="nav-item">
              <Tray aria-hidden />
              <span className="side-label">Inbox</span>
              {review.count > 0 && <span className="nav-count">{review.count}</span>}
            </button>,
          )}
      </div>

      <p className="side-head" aria-hidden>
        Places
      </p>
      <nav ref={list} aria-label="Places" className="nav-list">
        {g && <span ref={glide} aria-hidden className="nav-glide" style={{ transform: `translateY(${g.y}px)`, height: g.h }} />}
        {SPACES.map((s) => (
          <span key={s.id} className="contents">
            {tip(
              s.name,
              <button type="button" aria-current={s.id === here ? "page" : undefined} onPointerDown={(e) => e.button === 0 && goTo(s.id)} onClick={() => goTo(s.id)} className="nav-item">
                <s.icon aria-hidden />
                <span className="side-label">{s.name}</span>
                {s.id === "lab" && review && review.count > 0 && <span className="nav-count">{review.count}</span>}
              </button>,
            )}
          </span>
        ))}
      </nav>

      {recent.length > 0 && (
        <>
          <p className="side-head side-hide" aria-hidden>
            Recent
          </p>
          <ul aria-label="Recent" className="side-hide scroll-thin -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={r.onOpen} className="nav-recent">
                  {r.thumb ? <img src={r.thumb} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="thumb" />}
                  <span className="truncate">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto pt-2">
        {tip(
          "You",
          <button type="button" popoverTarget="side-me" className="nav-item !h-11">
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white shadow-[0_0_0_1px_var(--line-strong)]" style={{ background: "conic-gradient(from 210deg at 35% 35%, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-1))" }}>
              S
            </span>
            <span className="side-label min-w-0 flex-1">
              <span className="block truncate text-[13px] text-fg">Syed</span>
              <span className="block truncate text-[11.5px] font-normal text-fg-3">Settings and shortcuts</span>
            </span>
            <DotsThree aria-hidden size={16} className="side-hide shrink-0 text-fg-3" />
          </button>,
        )}
        <Popover id="side-me" side="right" align="end" label="You">
          {meMenu}
        </Popover>
      </div>
    </aside>
  )
}

/** The way back out of an editor: the place it opened from. Empty (no button) off a desktop. */
export const Back = createContext<{ label: string; go: () => void } | null>(null)
/** The way back out of an editor, first in its toolbar: the place it opened from. */
export function BarBack() {
  const b = useContext(Back)
  if (!b) return null
  return (
    <>
      <Tip label={`Back to ${b.label}`}>
        <button type="button" onClick={b.go} className="bar-back">
          <ArrowLeft aria-hidden />
          {b.label}
        </button>
      </Tip>
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
    </>
  )
}

/** A page beside the sidebar: the soft light from above, a centred column, room at the foot for the island. */
export function Page({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main aria-label={label} className="page-ground scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] px-6 pb-24 pt-10 lg:px-12 lg:pt-14">{children}</div>
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
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface-2 text-fg-2">
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
