// The galleries: Films and Creatives as pages you browse before you edit. Each opens with a big title and one
// line, then the thing you'd continue, then everything by category (one row of pills), each drawn as itself, big.
// Picking one opens it full-screen in its editor.
import { useMemo, useState, type ReactNode } from "react"
import { ArrowUpRight, PaintBrush, Plus, Tray } from "@phosphor-icons/react"
import { ANIMS, type Values } from "./registry"
import { CATEGORIES } from "./refs"
import { total, type Comp, type Template } from "./studio/comp"
import { CompPoster, FilmPoster } from "./FilmPoster"
import { Page, PageSection, PageTitle, Pills } from "./shell"
import { COMPOSITIONS, type Composition, type CreateCtx } from "./canvas/create"
import { SMART } from "./canvas/smart"
import { DocSketch } from "./canvas/CreateDialog"
import { liveFor, loadDoc } from "./canvas/Canvas"
import { matchLook } from "./theme"
import type { CanvasDoc } from "./canvas/doc"
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
/** Primary and secondary page actions: pill buttons, ink and quiet. */
export function Act({ ink, icon: I, children, onClick }: { ink?: boolean; icon?: typeof Plus; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`press btn flex h-10 items-center gap-2 rounded-full px-4 text-ui font-medium ${ink ? "btn-ink" : "btn-2"}`}>
      {I && <I size={16} aria-hidden />}
      {children}
    </button>
  )
}

/** "For Coins & Notes": whose films and creatives these are, with its still; a click switches. */
function ForProduct({ product, anim, dark, onSwitch }: { product: string; anim: string; dark: boolean; onSwitch: () => void }) {
  return (
    <button type="button" onClick={onSwitch} className="press group inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-body text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 hover:text-fg">
      <img src={`/thumbs/${anim}-${dark ? "dark" : "light"}.webp`} alt="" className="h-6 w-6 rounded-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
      For <span className="font-medium text-fg">{product}</span>
      <span aria-hidden className="text-fg-3 transition-colors group-hover:text-fg-2">· Switch</span>
    </button>
  )
}

/** The thing you were working on, to go back to: wide, first on the page. */
function Continue({ shot, title, meta, action, onClick }: { shot: ReactNode; title: string; meta: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tile lifts group grid w-full items-center gap-6 p-3 text-left sm:grid-cols-[minmax(0,360px)_1fr] sm:pr-8">
      <span className="tile-media relative block overflow-hidden rounded-2xl bg-surface-2 shadow-[var(--print-sh)]">{shot}</span>
      <span className="min-w-0 px-2 pb-2 sm:p-0">
        <span className="block text-caption font-medium uppercase tracking-[0.08em] text-fg-3">Continue</span>
        <span className="mt-2 block truncate text-section font-semibold tracking-[-0.02em]">{title}</span>
        <span className="mt-1 block truncate text-body text-fg-3">{meta}</span>
        <span className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-body font-medium text-surface transition-transform duration-150 group-hover:translate-x-0.5">
          {action}
          <ArrowUpRight size={14} aria-hidden />
        </span>
      </span>
    </button>
  )
}

/* ---------------- Films: continue yours, or start from a template ---------------- */

export function FilmsPage(p: { product: string; anim: string; dark: boolean; accent?: string; templates: Template[]; film: Comp; waiting: number; onContinue: () => void; onTemplate: (t: Template) => void; onArtist: () => void; onReview: () => void; onSwitch: () => void }) {
  const [cat, setCat] = useState("all")
  const kinds = CATEGORIES.film.filter((c) => p.templates.some((t) => t.category === c.id))
  const shown = p.templates.filter((t) => cat === "all" || t.category === cat)
  return (
    <Page label="Films">
      <PageTitle
        eyebrow={<ForProduct product={p.product} anim={p.anim} dark={p.dark} onSwitch={p.onSwitch} />}
        title="Films"
        sub={`Launch films of ${p.product}, with the product live on every screen. Let the Artist direct one, or start from a template.`}
        actions={
          <>
            {p.waiting > 0 && (
              <Act icon={Tray} onClick={p.onReview}>
                {p.waiting} to review
              </Act>
            )}
            <Act ink icon={PaintBrush} onClick={p.onArtist}>
              Direct a film
            </Act>
          </>
        }
      />
      <div className="mt-12">
        <Continue
          onClick={p.onContinue}
          title={`${p.product}, your film`}
          meta={`${p.film.scenes.length} ${p.film.scenes.length === 1 ? "scene" : "scenes"} · ${total(p.film).toFixed(1)} s · ${p.film.size.replace("x", ":")}`}
          action="Open in the Studio"
          shot={<CompPoster bare comp={p.film} product={p.product} accent={p.accent} still={p.anim} />}
        />
      </div>
      <PageSection className="mt-16" title="Start from a template" count={p.templates.length} aside={<Pills label="Kinds of film" value={cat} onChange={setCat} options={[{ value: "all", label: "All", count: p.templates.length }, ...kinds.map((c) => ({ value: c.id, label: c.name, count: p.templates.filter((t) => t.category === c.id).length }))]} />}>
        <Grid cols={3}>
          {shown.map((t, i) => (
            <Card key={t.id} i={i} onClick={() => p.onTemplate(t)} title={t.name} meta={`${CATEGORIES.film.find((c) => c.id === t.category)?.name ?? "Film"} · ${t.scenes === 1 ? "1 scene" : `${t.scenes} scenes`}`} shot={<FilmPoster bare t={t} product={p.product} accent={p.accent} />} />
          ))}
        </Grid>
      </PageSection>
    </Page>
  )
}

/* ---------------- Creatives: continue the canvas, or start from a layout ---------------- */

/** Every composition the Create dialog can make, made from the open product (the same pieces it uses). */
export function useCompositions(p: { anim: string; overrides: Record<string, Values>; accent?: string; product: string; dark: boolean }, max = Infinity) {
  const ctx = useMemo((): CreateCtx | null => {
    const a = ANIMS.find((x) => x.id === p.anim)
    const fill = a?.layout === "fill" ? a : (ANIMS.find((x) => x.brand && x.brand === a?.brand && x.layout === "fill") ?? ANIMS.find((x) => x.layout === "fill"))
    const live = fill && liveFor(fill.id, p.overrides, "iphone")
    if (!live) return null
    const kin = ANIMS.filter((x) => x.load && x.category !== "Launch films" && x.id !== live.anim && (a?.brand ? x.brand === a.brand : x.category === a?.category)).slice(0, 6)
    const more = kin.map((x) => ({ live: liveFor(x.id, p.overrides)!, fill: x.layout === "fill" && !x.html }))
    return { frame: { w: 1440, h: 900 }, look: matchLook(p.accent ?? "#5e5ce6", "tonal", 1), inCase: false, seed: 1, name: p.product, kicker: "Introducing", tagline: "Made to move. Try it on the phone.", cta: "Get the app", screen: { live, device: "iphone", scheme: p.dark ? "dark" : "light" }, more, features: kin.slice(0, 3).map((x) => x.name), names: kin.map((x) => x.name) }
  }, [p.anim, p.overrides, p.accent, p.product, p.dark])
  return useMemo(() => {
    if (!ctx) return [] as { c: Composition; doc: CanvasDoc }[]
    // only as many as asked for (Home shows one): each is a whole layout to make
    const out: { c: Composition; doc: CanvasDoc }[] = []
    for (const c of [...COMPOSITIONS, ...SMART] as Composition[]) {
      if (out.length >= max) break
      if ((c.needs ?? 0) > ctx.more.length) continue
      try {
        out.push({ c, doc: c.make(ctx) })
      } catch {
        // a layout this product can't fill is left out
      }
    }
    return out
  }, [ctx, max])
}

export const CREATIVE_KINDS = [...CATEGORIES.canvas, ...CATEGORIES.creative]

export function CreativesPage(p: { product: string; anim: string; overrides: Record<string, Values>; dark: boolean; accent?: string; onContinue: () => void; onCreate: (kind?: string) => void; onSwitch: () => void }) {
  const [cat, setCat] = useState("all")
  const all = useCompositions(p)
  // the canvas as you left it (not a layout that looks like it)
  const yours = useMemo(() => loadDoc(), [])
  const kinds = CREATIVE_KINDS.filter((k) => all.some((x) => x.c.category === k.id))
  const shown = all.filter((x) => cat === "all" || x.c.category === cat)
  return (
    <Page label="Creatives">
      <PageTitle
        eyebrow={<ForProduct product={p.product} anim={p.anim} dark={p.dark} onSwitch={p.onSwitch} />}
        title="Creatives"
        sub={`Heroes, stories, bentos and posters made from the screens of ${p.product}, for a site or a feed. Each one stays editable, layer by layer.`}
        actions={
          <Act ink icon={Plus} onClick={() => p.onCreate()}>
            Make a creative
          </Act>
        }
      />
      <div className="mt-12">
        <Continue
          onClick={p.onContinue}
          title={yours ? `${p.product}, your canvas` : `Start a canvas for ${p.product}`}
          meta={yours ? `${yours.layers.length} ${yours.layers.length === 1 ? "layer" : "layers"} · ${yours.frame.w} × ${yours.frame.h}` : "A frame with its screen, its name and its line, ready to arrange"}
          action={yours ? "Open in the Canvas" : "Start it"}
          shot={yours ? <DocSketch doc={yours} className="w-full" /> : all[0] ? <DocSketch doc={all[0].doc} className="w-full" /> : <span className="block aspect-[16/10]" />}
        />
      </div>
      <PageSection className="mt-16" title="Start from a layout" count={all.length} aside={<Pills label="Kinds of creative" value={cat} onChange={setCat} options={[{ value: "all", label: "All", count: all.length }, ...kinds.map((k) => ({ value: k.id, label: k.name, count: all.filter((x) => x.c.category === k.id).length }))]} />}>
        {!all.length && <Empty icon={Plus} title="No layouts for this product yet" sub="Layouts are made from a product's screens. Open one that fills a phone's screen in the Library, then come back." action={<Act onClick={p.onSwitch}>Open the Library</Act>} />}
        <Grid cols={3}>
          {shown.map(({ c, doc }, i) => (
            <Card key={c.id} i={i} onClick={() => p.onCreate(c.category)} title={c.name} meta={CREATIVE_KINDS.find((k) => k.id === c.category)?.name ?? "Creative"} shot={<DocSketch doc={doc} className="w-full" />} />
          ))}
        </Grid>
      </PageSection>
    </Page>
  )
}
