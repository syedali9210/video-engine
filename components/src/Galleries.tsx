// The Library as a page you browse before you edit: a big title and one line, search and the categories down the
// side, every component drawn as itself, big. Picking one opens it full-screen in its devices.
import { useState, type ReactNode } from "react"
import { ArrowUpRight, FileCode, MagnifyingGlass, Plus, Stack } from "@phosphor-icons/react"
import { ANIMS, CATEGORIES as KINDS, type Category } from "./registry"
import { CATEGORY_ICON } from "./ui"
import { Page, PageSection, PageTitle, SideList } from "./shell"
import { Empty } from "./States"

/* ---------------- the pieces every gallery shares ---------------- */

/** A card: the work big (its own picture), its name, one line. One link; it opens the thing. */
export function Card({ onClick, shot, title, meta, badge, i = 0 }: { onClick: () => void; shot: ReactNode; title: string; meta?: ReactNode; badge?: ReactNode; i?: number }) {
  return (
    <li className="rise-in min-w-0" style={{ animationDelay: `${Math.min(i, 11) * 24}ms` }}>
      <button type="button" onClick={onClick} className="card group block w-full text-left">
        <span className="card-shot">
          {shot}
          {badge && <span className="absolute left-3 top-3">{badge}</span>}
          <span aria-hidden className="card-open">
            <ArrowUpRight size={16} />
          </span>
        </span>
        <span className="mt-3 block truncate text-ui font-medium">{title}</span>
        {meta && <span className="mt-0.5 block truncate text-body text-fg-3">{meta}</span>}
      </button>
    </li>
  )
}

const Grid = ({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) => <ul className={`grid grid-cols-2 gap-x-6 gap-y-9 ${cols === 3 ? "lg:grid-cols-3" : "md:grid-cols-3 xl:grid-cols-4"}`}>{children}</ul>

/** A small label on a card's picture: what's open now. */
export const Tag = ({ children }: { children: ReactNode }) => <span className="rounded-full bg-black/55 px-2.5 py-1 text-caption font-medium text-white backdrop-blur-md">{children}</span>

/** The search over a gallery: filled, with its glyph. */
function Search({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative flex h-10 w-full items-center">
      <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3.5 text-fg-3" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={label} className="h-full w-full rounded-xl bg-surface-2 pl-10 pr-3 text-ui text-fg shadow-[inset_0_0_0_1px_var(--line)] outline-none transition-shadow duration-150 placeholder:text-fg-3 focus:shadow-[inset_0_0_0_1px_var(--fg-3)]" />
    </label>
  )
}

/** Primary and secondary page actions: pill buttons, ink and quiet. */
export function Act({ ink, icon: I, children, onClick }: { ink?: boolean; icon?: typeof Plus; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`press btn flex h-10 items-center gap-2 rounded-full px-4 text-ui font-medium ${ink ? "btn-ink" : "btn-2"}`}>
      {I && <I size={16} aria-hidden />}
      {children}
    </button>
  )
}

/* ---------------- Library: every animation, by category ---------------- */

export function LibraryPage(p: { dark: boolean; current: string; onOpen: (id: string) => void; onImport: () => void; onScreen: () => void }) {
  const [cat, setCat] = useState<"all" | Category>("all")
  const [q, setQ] = useState("")
  const match = (a: (typeof ANIMS)[number]) => !q || `${a.name} ${a.category} ${a.blurb ?? ""}`.toLowerCase().includes(q.toLowerCase())
  const found = ANIMS.filter(match)
  const kinds = KINDS.filter((k) => ANIMS.some((a) => a.category === k))
  const card = (a: (typeof ANIMS)[number], i: number) => (
    <Card
      key={a.id}
      i={i}
      onClick={() => p.onOpen(a.id)}
      title={a.name}
      meta={a.category}
      badge={a.id === p.current ? <Tag>Open</Tag> : undefined}
      shot={<Still id={a.id} dark={p.dark} category={a.category} />}
    />
  )
  return (
    <Page label="Library">
      <PageTitle
        title="Library"
        sub={`${ANIMS.length} animations, each running live in a real device. Open one to tune it, then make films and creatives from it.`}
        actions={
          <>
            <Act icon={Stack} onClick={p.onScreen}>
              Build a screen
            </Act>
            <Act ink icon={FileCode} onClick={p.onImport}>
              Import from code
            </Act>
          </>
        }
      />
      <div className="mt-12 grid gap-10 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Search value={q} onChange={setQ} label="Search the library" />
          <SideList label="Categories" value={cat} onChange={setCat} options={[{ value: "all" as const, label: "Everything", icon: Stack, count: found.length }, ...kinds.map((k) => ({ value: k, label: k, icon: CATEGORY_ICON[k], count: found.filter((a) => a.category === k).length }))]} />
        </aside>
      <div className="min-w-0 space-y-14">
        {cat === "all" ? (
          kinds.map((k) => {
            const list = found.filter((a) => a.category === k)
            if (!list.length) return null
            const I = CATEGORY_ICON[k]
            return (
              <PageSection key={k} title={k} count={list.length} icon={I}>
                <Grid cols={3}>{list.map(card)}</Grid>
              </PageSection>
            )
          })
        ) : (
          <PageSection title={cat} count={found.filter((a) => a.category === cat).length} icon={CATEGORY_ICON[cat]}>
            <Grid cols={3}>{found.filter((a) => a.category === cat).map(card)}</Grid>
          </PageSection>
        )}
        {!found.length && (
          <Empty
            icon={MagnifyingGlass}
            title={`Nothing called “${q}”`}
            sub="Search looks at names, categories and what each one does. Try fewer words, or bring your own in."
            action={
              <>
                <Act onClick={() => setQ("")}>Clear the search</Act>
                <Act ink icon={FileCode} onClick={p.onImport}>
                  Import from code
                </Act>
              </>
            }
            className="py-20"
          />
        )}
      </div>
      </div>
    </Page>
  )
}

/** An animation's still: its library card picture, or its category's glyph. */
export function Still({ id, dark, category, className = "aspect-[4/3]" }: { id: string; dark: boolean; category: Category; className?: string }) {
  const [ok, setOk] = useState(true)
  const I = CATEGORY_ICON[category]
  return (
    <span className={`relative block w-full bg-surface-2 ${className}`}>
      {ok ? (
        <img src={`/thumbs/${id}-${dark ? "dark" : "light"}.webp`} alt="" loading="lazy" decoding="async" onError={() => setOk(false)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-fg-3">
          <I size={28} />
        </span>
      )}
    </span>
  )
}
