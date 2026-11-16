// Studio — the kit: pieces to drag onto the stage (or click to add), each taken from a film the lab tore down or built
// in. Titles with their exact animation (dropped, a title with a custom animation the inspector edits), backgrounds (a
// ground and its lights), whole shots (a new scene). Narrowed to one kind of film by its category.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BookOpen, FilmSlate } from "@phosphor-icons/react"
import { CATEGORIES, type KitGround, type KitItem, type KitTitle } from "../refs"
import { CategoryChips } from "../shell"
import { Button } from "../ui"
import { text as newText, uid, type TextLayer } from "./comp"
import { layersCss, newPaint, type Paint } from "./paint"
import { curve } from "./poses"
import { TEXT_ANIMS, animLength, rankOf, type TextAnim } from "./textanim"

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))

/** A title's pieces, as spans the player moves: a root (it carries the tracking) round lines, words or letters, each
    in its own clip when masked. Words stay whole, so a line never breaks inside one. */
export function pieces(text: string, a: TextAnim): ReactNode {
  const clip = (key: number, child: ReactNode, block = false) =>
    a.mask ? (
      <span key={key} style={{ display: block ? "block" : "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0.08em 0.04em 0.16em", margin: "-0.08em -0.04em -0.16em" }}>
        {child}
      </span>
    ) : (
      child
    )
  const piece = (key: number, s: string, block = false) => (
    <span key={key} data-p="" style={{ display: block ? "block" : "inline-block", maxWidth: "100%" }}>
      {s}
    </span>
  )
  const words = (each: (w: string, i: number) => ReactNode) => text.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w.includes("\n") ? <br key={i} /> : w : each(w, i)))
  let body: ReactNode
  if (a.by === "all") body = clip(0, piece(0, text))
  else if (a.by === "line") body = text.split("\n").map((line, i) => clip(i, piece(i, line || " ", true), true))
  else if (a.by === "word") body = words((w, i) => clip(i, piece(i, w)))
  else
    body = words((w, i) => (
      <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        {[...w].map((c, j) => clip(j, piece(j, c)))}
      </span>
    ))
  return (
    <span data-root="" style={{ display: "contents" }}>
      {body}
    </span>
  )
}

/** Moves a title's pieces to `t` seconds into its entrance (before 0: waiting at their start). */
export function playPieces(box: HTMLElement, a: TextAnim, t: number) {
  const list = box.querySelectorAll<HTMLElement>("[data-p]")
  const n = list.length
  if (!n) return
  const ease = curve(a.ease)
  const f = a.from
  const rank = rankOf(a.order, n)
  const end = animLength(a, n)
  list.forEach((p, i) => {
    const start = rank[i] * a.stagger
    const k = clamp((t - start) / Math.max(0.01, a.dur))
    const e = ease(k)
    const u = 1 - e
    let y = (f.y ?? 0) * u
    let op = (f.opacity ?? 1) + (1 - (f.opacity ?? 1)) * clamp(e * 1.5)
    // after it's in
    const after = t - start - a.dur
    if (after > 0 && a.idle && a.idle !== "none") {
      const ramp = clamp(after / 0.8)
      if (a.idle === "wave") y += Math.sin(t * 3 - i * 0.5) * 0.07 * ramp
      else if (a.idle === "float") y += Math.sin(t * 1.4) * 0.06 * ramp
      else if (a.idle === "shimmer") {
        const head = ((t * 9) % (n + 14)) - 4
        op *= 1 - ramp * 0.45 * (1 - Math.exp(-((i - head) ** 2) / 4))
      }
    }
    const parts = [
      f.x || y ? `translate(${((f.x ?? 0) * u).toFixed(4)}em, ${y.toFixed(4)}em)` : "",
      f.flip ? `perspective(4em) rotateX(${(f.flip * u).toFixed(2)}deg)` : "",
      f.rotate ? `rotate(${(f.rotate * u).toFixed(2)}deg)` : "",
      f.skew ? `skewX(${(f.skew * u).toFixed(2)}deg)` : "",
      f.scale != null && f.scale !== 1 ? `scale(${(f.scale + (1 - f.scale) * e).toFixed(4)})` : "",
    ].filter(Boolean)
    p.style.transform = parts.join(" ")
    p.style.transformOrigin = f.flip ? "50% 100%" : "50% 60%"
    p.style.opacity = String(clamp(op))
    const blur = (f.blur ?? 0) * u
    p.style.filter = blur > 0.002 ? `blur(${blur.toFixed(3)}em)` : ""
    // a tint fades out into the title's own colour (not over a gradient fill, which clears the colour)
    if (a.tint && !p.style.backgroundClip) p.style.color = k < 1 ? `color-mix(in oklab, ${a.tint} ${Math.round(u * 100)}%, currentColor)` : ""
  })
  const root = box.querySelector<HTMLElement>("[data-root]")
  if (root) root.style.letterSpacing = f.spacing ? `calc(var(--ls, 0em) + ${(f.spacing * (1 - ease(clamp(t / Math.max(0.01, end))))).toFixed(4)}em)` : ""
}

/** A title animation playing on a word or two, over and over while it's on screen. */
export function AnimSample({ anim, text = "Launch day", className = "", style }: { anim: TextAnim; text?: string; className?: string; style?: React.CSSProperties }) {
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    // still, at rest, for anyone who asked for less motion
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return playPieces(el, anim, 99)
    let raf = 0
    let t0 = performance.now()
    const loop = (now: number) => {
      const n = el.querySelectorAll("[data-p]").length
      // each pass: the entrance, a held beat (longer when it keeps moving), then again
      const len = animLength(anim, n) + (anim.idle && anim.idle !== "none" ? 2.4 : 1)
      playPieces(el, anim, ((now - t0) / 1000) % len)
      raf = requestAnimationFrame(loop)
    }
    // only while it can be seen: a kit of thirty cards stays cheap
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf)
      if (e.isIntersecting) {
        t0 = performance.now()
        raf = requestAnimationFrame(loop)
      }
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [anim, text])
  return (
    <span ref={box} className={className} style={{ whiteSpace: "pre-wrap", ...style }}>
      {pieces(text, anim)}
    </span>
  )
}

/** A kit title as a layer, at the drop point (fractions of the frame) or where the film had it. */
export function kitTitle(item: KitTitle, at?: { x: number; y: number }): TextLayer {
  return {
    ...newText(item.text, at ? { ...item.box, x: at.x, y: at.y } : item.box, item.size, item.weight, "custom", { color: item.color, align: item.align, font: item.font }),
    animation: item.anim,
    name: item.name,
  }
}
/** A kit background's lights, as gradient layers over its ground. */
export const glowPaints = (g: KitGround): Paint[] =>
  g.glows.map((l) => ({ ...newPaint("radial", l.color), id: uid(), from: { x: l.x, y: l.y }, to: { x: l.x + l.r, y: l.y }, stops: [{ at: 0, color: l.color, alpha: l.alpha }, { at: 1, color: l.color, alpha: 0 }] }))

/** The built-in title animations, as kit titles: a word or two, in the display face. */
const BUILT_IN: KitTitle[] = TEXT_ANIMS.map((p) => ({ kind: "title", id: `anim:${p.id}`, name: p.name, text: "Launch day", font: "display", weight: 650, size: 8, color: "", align: "center", box: { x: 0.5, y: 0.5, w: 0.8 }, anim: p.anim }))

type KitState = { items: KitItem[]; refs: Record<string, string> }

export function KitPanel({ onUse, onReferences }: { onUse: (item: KitItem) => void; onReferences: () => void }) {
  const [kit, setKit] = useState<KitState>({ items: [], refs: {} })
  const [error, setError] = useState("")
  const [cat, setCat] = useState("all")
  useEffect(() => {
    fetch("/__lab/kit")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The lab said ${r.status}`))))
      .then((j: KitState) => setKit(j), (e: Error) => setError(e.message))
  }, [])
  const fits = (i: KitItem) => cat === "all" || i.category === cat
  const studied = kit.items.filter(fits)
  const titles = [...studied.filter((i): i is KitTitle => i.kind === "title"), ...(cat === "all" ? BUILT_IN : [])]
  const grounds = studied.filter((i): i is KitGround => i.kind === "ground")
  const shots = studied.filter((i) => i.kind === "shot")
  const chips = useMemo(
    () => [{ id: "all", name: "All", count: kit.items.length + BUILT_IN.length }, ...CATEGORIES.film.map((c) => ({ id: c.id, name: c.name, count: kit.items.filter((i) => i.category === c.id).length })).filter((c) => c.count)],
    [kit],
  )
  const drag = (item: KitItem) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/x-kit", JSON.stringify(item))
    e.dataTransfer.effectAllowed = "copy"
  }
  const from = (i: KitItem) => (i.ref ? kit.refs[i.ref] : "Built in")
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
      {chips.length > 1 && (
        <div className="px-3 pt-3">
          <CategoryChips label="Kind of film" value={cat} onChange={setCat} options={chips} />
        </div>
      )}
      {error && <p className="px-4 pt-3 text-caption text-fg-3">The kit's studied pieces didn't load ({error}): the built-in ones are here.</p>}
      {!kit.items.length && !error && (
        <div className="mx-3 mt-3 rounded-lg p-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <p className="text-caption text-fg-2">Tear a film down in the lab and its titles, backgrounds and shots land here, ready to drag in.</p>
          <Button size="sm" className="mt-2" onClick={onReferences}>
            <BookOpen size={14} aria-hidden />
            References
          </Button>
        </div>
      )}
      <section aria-label="Titles" className="px-3 pb-2 pt-3">
        <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Titles · drag one onto the stage</h3>
        <ul className="grid grid-cols-2 gap-2">
          {titles.map((t) => (
            <li key={t.id}>
              <button type="button" draggable onDragStart={drag(t)} onClick={() => onUse(t)} title={`${t.name} · ${from(t)}: drag it onto the stage, or click to add it`} className="press block w-full cursor-grab rounded-lg text-left active:cursor-grabbing">
                <span className="grid aspect-[16/10] place-items-center overflow-hidden rounded-lg bg-canvas px-2 text-center shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--line-strong)]">
                  <AnimSample
                    anim={t.anim}
                    text={t.text.length > 22 ? `${t.text.slice(0, 20).trim()}…` : t.text}
                    className="leading-none"
                    style={{ fontSize: 15, fontWeight: t.weight, letterSpacing: "-0.03em", fontFamily: t.font === "mono" ? '"Geist Mono", monospace' : undefined, textTransform: t.font === "mono" ? "uppercase" : undefined }}
                  />
                </span>
                <span className="mt-1 block truncate px-0.5 text-caption font-medium text-fg-2">{t.name}</span>
                <span className="block truncate px-0.5 text-micro text-fg-3">{from(t)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {grounds.length > 0 && (
        <section aria-label="Backgrounds" className="px-3 pb-2 pt-2">
          <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Backgrounds · for this scene</h3>
          <ul className="grid grid-cols-3 gap-2">
            {grounds.map((g) => (
              <li key={g.id}>
                <button type="button" draggable onDragStart={drag(g)} onClick={() => onUse(g)} title={`${g.name} · ${from(g)}`} className="press block w-full text-left">
                  <span aria-hidden className="block aspect-video rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ backgroundColor: g.ground, backgroundImage: layersCss(glowPaints(g), 160, 90) }} />
                  <span className="mt-1 block truncate px-0.5 text-micro text-fg-3">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {shots.length > 0 && (
        <section aria-label="Shots" className="px-3 pb-3 pt-2">
          <h3 className="px-1 pb-2 text-caption font-medium text-fg-3">Shots · each a new scene after this one</h3>
          <ul className="space-y-1">
            {shots.map((s) => (
              <li key={s.id}>
                <button type="button" draggable onDragStart={drag(s)} onClick={() => onUse(s)} className="press flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                  <FilmSlate size={14} aria-hidden className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{s.name}</span>
                    <span className="block truncate text-micro text-fg-3">{from(s)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
