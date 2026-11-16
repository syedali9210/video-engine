// Canvas — Create: a whole composition in one pick. Every art direction is drawn small on the look you choose (the
// harmony, the colour it's matched to, a case or not), from the product's own screens and components; another round
// varies them. Picking one replaces the canvas (Undo puts it back). DocSketch draws any canvas small, quickly, without
// its live pages: the cards and the layer thumbnails both use it.
import { DialogHead } from "../Gloss"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { ArrowsClockwise, Plus, X, FrameCorners } from "@phosphor-icons/react"
import { Button, Dialog, IconButton, Switch, Select } from "../ui"
import { HARMONIES, contrast, hex, lch, matchLook, type Harmony } from "../theme"
import { layersCss } from "../studio/paint"
import { CATEGORIES, type LayoutLayer, type Reference } from "../refs"
import { CategoryChips } from "../shell"
import { COMPOSITIONS, glow, type Composition, type CreateCtx } from "./create"
import { arrangements } from "./arrange"
import { SMART } from "./smart"
import { deviceNode, effectNode, imageNode, shapeNode, textNode, uid, type CanvasDoc, type CNode } from "./doc"
import { EFFECT_SEEDS } from "./effects"
import { FACES, loadFaces } from "../studio/faces"
import { field } from "../controls"

const pct = (v: number) => `${(v * 100).toFixed(3)}%`

/** A canvas drawn small: its ground, and each layer as what it is (real type, a device in its finish turned as it is,
    a component as a pale card, an effect as its colours). */
export function DocSketch({ doc, className = "" }: { doc: CanvasDoc; className?: string }) {
  const f = doc.frame
  const cq = (v: number) => `${((v / f.w) * 100).toFixed(3)}cqw`
  const draw = (n: CNode) => {
    // seen through another layer's box and corners
    const win = n.clip ? doc.layers.find((l) => l.id === n.clip) : undefined
    const clipPath = win ? `inset(${pct((win.y - n.y) / n.h)} ${pct((n.x + n.w - win.x - win.w) / n.w)} ${pct((n.y + n.h - win.y - win.h) / n.h)} ${pct((win.x - n.x) / n.w)} round ${cq(("radius" in win ? win.radius : 0) ?? 0)})` : undefined
    const box: CSSProperties = { position: "absolute", left: pct(n.x / f.w), top: pct(n.y / f.h), width: pct(n.w / f.w), height: pct(n.h / f.h), rotate: n.rot ? `${n.rot}deg` : undefined, opacity: n.opacity ?? 1, filter: n.blur ? `blur(${cq(n.blur)})` : undefined, clipPath }
    if (n.hidden) return null
    if (n.kind === "effect") {
      const c = n.effect.colors.map((x) => (x === "transparent" ? "rgb(0 0 0 / 0)" : x))
      return <div key={n.id} style={{ ...box, borderRadius: n.radius ? cq(n.radius) : undefined, background: `radial-gradient(60% 70% at 30% 35%, ${c[3] ?? c[2] ?? c[1]} 0%, transparent 70%), radial-gradient(60% 70% at 75% 70%, ${c[2] ?? c[1]} 0%, transparent 72%), radial-gradient(80% 60% at 50% 100%, ${c[1]} 0%, transparent 80%), ${c[0]}` }} />
    }
    if (n.kind === "rect" || n.kind === "ellipse") return <div key={n.id} style={{ ...box, background: layersCss(n.paint, n.w, n.h) || n.fill, borderRadius: n.kind === "ellipse" ? "50%" : cq(n.radius), boxShadow: n.stroke?.width ? `inset 0 0 0 ${cq(n.stroke.width)} ${n.stroke.color}` : undefined, backdropFilter: n.backdrop ? `blur(${cq(n.backdrop.blur / 3)})` : undefined }} />
    if (n.kind === "text")
      return (
        <div key={n.id} style={{ ...box, height: "auto", color: n.color || doc.frame.ink || "#18181b", fontSize: cq(n.size), fontWeight: n.weight, textAlign: n.align, lineHeight: 1.15, whiteSpace: "pre-wrap", overflowWrap: "anywhere", letterSpacing: n.font === "display" ? "-0.025em" : n.font === "mono" ? "0.06em" : undefined, textTransform: n.font === "mono" ? "uppercase" : undefined, fontSynthesisWeight: n.face ? "none" : undefined, fontFamily: (n.face ? `"${n.face}", ` : "") + (n.font === "mono" ? '"Geist Mono", ui-monospace, monospace' : n.font === "serif" ? '"Instrument Serif", Georgia, serif' : "Geist, ui-sans-serif, system-ui, sans-serif") }}>
          {n.text}
        </div>
      )
    if (n.kind === "path")
      return (
        <svg key={n.id} viewBox={`0 0 ${n.vw} ${n.vh}`} preserveAspectRatio="none" style={{ ...box, overflow: "visible" }}>
          <path d={n.d} fill={n.fill || "none"} stroke={n.stroke} strokeWidth={n.width} />
        </svg>
      )
    if (n.kind === "image") return <img key={n.id} alt="" src={n.src} style={{ ...box, objectFit: "cover", borderRadius: cq(n.radius) }} />
    if (n.kind === "component") return <div key={n.id} style={{ ...box, borderRadius: cq(14), background: n.scheme === "dark" ? "#1c1c1f" : "#ffffff", boxShadow: "0 1px 2px rgb(0 0 0 / 0.12)" }} />
    if (n.kind === "device") {
      const body = n.case ?? n.finish?.metal ?? (n.scheme === "dark" ? "#55555b" : "#cfccc5")
      const r = n.rot3d
      return (
        <div key={n.id} style={{ ...box, perspective: cq(n.h * 3.2) }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "18% / 8.6%", background: body, transform: r ? `rotateX(${r.x}deg) rotateY(${r.y}deg)` : undefined, boxShadow: "0 6px 14px -8px rgb(0 0 0 / 0.5)" }}>
            <div style={{ position: "absolute", inset: "2.2% 4.4%", borderRadius: "15% / 7%", background: n.picture ? `url(${n.picture}) center top / cover, #050506` : "linear-gradient(#eef0f4, #dfe3ea)" }} />
          </div>
        </div>
      )
    }
    return null
  }
  return (
    <div className={`relative overflow-hidden [container-type:inline-size] ${className}`} style={{ aspectRatio: `${f.w} / ${f.h}`, background: layersCss(f.paint, f.w, f.h) || f.fill || "#f4f4f6" }}>
      {doc.layers.map(draw)}
    </div>
  )
}

/* ---------------- from a reference: its measured layers, rebuilt ---------------- */

/** A studied page or creative rebuilt on the frame: its cards and shapes, its type (its own words, to edit), the
    product's phone where it had a device, an effect where it had one, and its pictures cut from the reference itself
    until they're swapped. Each layer keeps its place, in fractions of the frame. */
const pictures = new Map<string, Promise<ImageBitmap | null>>()
const pictureOfRef = (id: string) => {
  let p = pictures.get(id)
  if (!p) {
    p = fetch(`/__lab/ref-file/${id}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b))
      .catch(() => null)
    pictures.set(id, p)
  }
  return p
}
async function fromLayout(ref: Reference, c: CreateCtx): Promise<CanvasDoc> {
  const L = ref.layout!
  const { w: W, h: H } = c.frame
  const img = await pictureOfRef(ref.id)
  const crop = (l: LayoutLayer) => {
    if (!img) return ""
    const sw = Math.max(1, l.w * img.width)
    const sh = Math.max(1, l.h * img.height)
    const k = Math.min(2, 900 / Math.max(sw, sh))
    const cv = Object.assign(document.createElement("canvas"), { width: Math.round(sw * k), height: Math.round(sh * k) })
    cv.getContext("2d")!.drawImage(img, l.x * img.width, l.y * img.height, sw, sh, 0, 0, cv.width, cv.height)
    return cv.toDataURL("image/webp", 0.88)
  }
  const fx = (l: LayoutLayer) => EFFECT_SEEDS.find((p) => p.id === (/cloud|sky|mist/i.test(`${l.what} ${l.name}`) ? "dusk-clouds" : /ascii|character|letter|type/i.test(`${l.what} ${l.name}`) ? "characters" : /dot|halftone/i.test(`${l.what} ${l.name}`) ? "halftone-flow" : "mesh"))!.effect
  const ink = contrast("#ffffff", L.ground) > 4.5 ? "#f4f4f5" : "#18181b"
  const layers: CNode[] = []
  const windows: { id: string; l: LayoutLayer }[] = []
  for (const l of L.layers) {
    const b = { x: Math.round(l.x * W), y: Math.round(l.y * H), w: Math.max(4, Math.round(l.w * W)), h: Math.max(4, Math.round(l.h * H)) }
    const name = l.name.slice(0, 60)
    let n: CNode | null = null
    // what a card or a picture shows decides what stands in for it: drifting clouds, the picture itself, or a card
    const sky = /cloud|sky|mist/i.test(`${l.what} ${l.name}`)
    const imagery = /photo|image|picture|render|illustration|scene/i.test(`${l.what ?? ""}`)
    if (l.kind === "text" && l.text) {
      // body copy is the reference's, not yours: a long paragraph becomes your own line
      const text = l.text.length > 90 ? c.tagline || l.text : l.text
      // a size it didn't give: what fits its box (a line's height, or the area a paragraph fills)
      const size = Math.max(8, Math.round(l.size ? l.size * W : Math.min(b.h * 0.8, Math.sqrt((b.h * b.w) / Math.max(1, l.text.length * 0.65)))))
      n = { ...textNode(b.x, b.y, text, size), ...b, h: Math.max(b.h, Math.round(size * 1.15)), name, color: l.color ?? "", weight: l.weight ?? (size > 40 ? 600 : 400), align: l.align ?? "left", font: l.font === "serif" ? "serif" : l.font === "mono" ? "mono" : size > 40 ? "display" : "text" }
    } else if (l.kind === "card" && sky) n = { ...effectNode(EFFECT_SEEDS.find((p) => p.id === "dusk-clouds")!.effect, b, name), radius: Math.round((l.radius ?? 0.06) * b.w) }
    else if (l.kind === "card" && imagery && crop(l)) n = { ...imageNode(crop(l), b), name, radius: Math.round((l.radius ?? 0.06) * b.w) }
    else if (l.kind === "card" || l.kind === "shape") n = { ...shapeNode("rect", b, l.fill ?? (l.kind === "card" ? "#ffffff" : "#d4d4d8")), name, radius: Math.round((l.radius ?? 0) * b.w), ...(l.shadow ? { shadow: true } : {}) }
    else if (l.kind === "picture" && sky) n = { ...effectNode(EFFECT_SEEDS.find((p) => p.id === (contrast("#ffffff", L.ground) > 4.5 ? "night-clouds" : "dusk-clouds"))!.effect, b, name), opacity: l.opacity ?? 0.9 }
    else if (l.kind === "picture" || l.kind === "icon") {
      const src = crop(l)
      n = src ? { ...imageNode(src, b), name, radius: Math.round((l.radius ?? 0) * b.w) } : { ...shapeNode("rect", b, "#d4d4d8"), name: `${name} (a picture goes here)`, radius: Math.round((l.radius ?? 0) * b.w) }
    } else if (l.kind === "device") n = { ...deviceNode(c.screen.device, c.screen.live, b.x + b.w / 2, b.y + b.h / 2, b.h, c.screen.scheme), ...(c.screen.picture ? { picture: c.screen.picture } : {}), name }
    else if (l.kind === "glow") n = { ...glow(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) / 2, l.color ?? l.fill ?? c.look.glow), name }
    else if (l.kind === "effect") n = { ...effectNode(fx(l), b, name), ...(l.radius ? { radius: Math.round(l.radius * b.w) } : {}) }
    if (!n) continue
    if (typeof l.opacity === "number" && l.opacity < 1) n = { ...n, opacity: l.opacity }
    if (l.blur) n = { ...n, blur: Math.round((l.blur * W) / Math.max(1, L.w)) }
    // a layer seen through a window: the last card it sits inside
    if (l.clip) {
      const win = [...windows].reverse().find((x) => l.x >= x.l.x - 0.01 && l.y >= x.l.y - 0.01 && l.x + l.w <= x.l.x + x.l.w + 0.01 && l.y + l.h <= x.l.y + x.l.h + 0.01)
      if (win) n = { ...n, clip: win.id }
    }
    if (l.kind === "card") windows.push({ id: n.id, l })
    layers.push(n)
  }
  return { v: 1, name: ref.title, frame: { w: W, h: H, paint: [], fill: L.ground, ink, radius: 0, phone: { w: 402, h: 874 } }, layers: layers.map((n) => ({ ...n, id: n.id || uid() })) }
}

/** The references the lab studied that have a layout (pages and creatives), fetched once the dialog opens. */
function useLayouts(open: boolean) {
  const [refs, setRefs] = useState<Reference[]>([])
  useEffect(() => {
    if (!open) return
    fetch("/__lab/references")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Reference[]) => setRefs(list.filter((r) => r.layout && (r.area === "canvas" || r.area === "creative"))), () => setRefs([]))
  }, [open])
  return refs
}

export function CreateDialog({ open, onClose, ctx, anchors, onPick, kind }: { open: boolean; onClose: () => void; ctx: Omit<CreateCtx, "look" | "inCase" | "seed">; anchors: string[]; onPick: (doc: CanvasDoc, c: Composition) => void; /** the kind it opens at */ kind?: string }) {
  const found = useMemo(() => [...new Set(anchors.map((a) => hex(lch(a))))].slice(0, 5), [anchors])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [harmony, setHarmony] = useState<Harmony>("tonal")
  const [seed, setSeed] = useState(1)
  const [inCase, setInCase] = useState(false)
  // the face its titles are set in (the display and serif texts), over the engine's
  const [face, setFace] = useState("")
  useEffect(() => loadFaces([face]), [face])
  const colour = anchor ?? found[0] ?? "#5e5ce6"
  const look = useMemo(() => matchLook(colour, harmony, seed), [colour, harmony, seed])
  // the art directions, then this round's studio arrangements (new variables on the same principles each round)
  const docs = useMemo(() => (open ? [...COMPOSITIONS, ...SMART, ...arrangements(seed)].map((c) => ({ c, doc: c.make({ ...ctx, look, inCase, seed }) })) : []), [open, ctx, look, inCase, seed])
  // the studied pages and creatives, rebuilt (their pictures are cut from them, so this waits on the files)
  const refs = useLayouts(open)
  const [built, setBuilt] = useState<{ c: Composition; doc: CanvasDoc }[]>([])
  useEffect(() => {
    let on = true
    void Promise.all(refs.map(async (r) => ({ c: { id: `ref:${r.id}`, category: r.category ?? "", name: r.title, hint: `Rebuilt from your reference: ${r.summary.split(". ")[0]}. Its pictures are cut from it until you swap them.`, make: () => ({}) as CanvasDoc }, doc: await fromLayout(r, { ...ctx, look, inCase, seed }) }))).then((x) => on && setBuilt(x))
    return () => {
      on = false
    }
  }, [refs, ctx, look, inCase, seed])
  const [cat, setCat] = useState("all")
  useEffect(() => {
    if (open) setCat(kind ?? "all")
  }, [open, kind])
  const titled = (doc: CanvasDoc): CanvasDoc => (face ? { ...doc, layers: doc.layers.map((n) => (n.kind === "text" && (n.font === "display" || n.font === "serif") ? { ...n, face } : n)) } : doc)
  const all = [...docs, ...built].map((x) => ({ ...x, doc: titled(x.doc) }))
  const kinds = [...CATEGORIES.canvas, ...CATEGORIES.creative]
  const chips = [{ id: "all", name: "All", count: all.length }, ...kinds.map((k) => ({ id: k.id, name: k.name, count: all.filter((x) => x.c.category === k.id).length })).filter((k) => k.count)]
  const shown = all.filter((x) => cat === "all" || x.c.category === cat)
  return (
    <Dialog open={open} onClose={onClose} label="Create" className="modal wide">
      <div className="flex h-full max-h-[inherit] flex-col">
        <DialogHead icon={FrameCorners} tone="var(--k-image)" title="Create" sub="A whole composition from your product's screens, on a look matched to its colour. Everything stays editable." onClose={onClose} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-fg-3">Colour</span>
            {[...found, ...(anchor && !found.includes(anchor) ? [anchor] : [])].map((c) => (
              <button key={c} type="button" onClick={() => setAnchor(c)} aria-pressed={colour === c} title={c} className={`press h-6 w-6 rounded-full ${colour === c ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"}`} style={{ background: c }}>
                <span className="sr-only">{c}</span>
              </button>
            ))}
            <label className="press relative grid h-6 w-6 cursor-pointer place-items-center rounded-full text-fg-3 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg" title="Another colour">
              <Plus size={12} aria-hidden />
              <input type="color" aria-label="Another colour" value={colour} onChange={(e) => setAnchor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
          <div role="radiogroup" aria-label="Harmony" className="flex flex-wrap items-center gap-1">
            {HARMONIES.map((h) => (
              <button key={h.id} type="button" role="radio" aria-checked={harmony === h.id} title={h.hint} onClick={() => setHarmony(h.id)} className={`press h-7 rounded-md px-2.5 text-caption font-medium ${harmony === h.id ? "bg-fg text-surface" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2"}`}>
                {h.name}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-body text-fg-2" htmlFor="create-case">
            In a case
            <Switch id="create-case" on={inCase} onChange={setInCase} />
          </label>
          <label className="flex items-center gap-2 text-body text-fg-2" htmlFor="create-face">
            Titles in
            <Select id="create-face" value={face} onChange={(e) => setFace(e.target.value)} className={`${field} h-7 cursor-pointer px-2 text-caption`}>
              <option value="">The engine's</option>
              {FACES.map((x) => (
                <option key={x.name} value={x.name} title={x.hint}>
                  {x.name}
                </option>
              ))}
            </Select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)}>
            <ArrowsClockwise size={14} aria-hidden />
            Another round
          </Button>
        </div>
        <div className="px-5 pt-3">
          <CategoryChips label="Kind" value={cat} onChange={setCat} options={chips} />
        </div>
        <ul className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ c, doc }) => {
            // one that wants more of the product than it has is shown, and says why it can't be picked
            const short = (c.needs ?? 0) > ctx.more.length
            return (
              <li key={c.id}>
                <button type="button" disabled={short} onClick={() => onPick(doc, c)} className="press group flex w-full flex-col gap-2 rounded-lg p-1.5 text-left shadow-[inset_0_0_0_1px_var(--line)] enabled:hover:bg-surface-2 enabled:hover:shadow-[inset_0_0_0_1px_var(--line-strong)] disabled:cursor-not-allowed">
                  <DocSketch doc={doc} className={`w-full rounded-md ${short ? "opacity-40 grayscale" : ""}`} />
                  <span className="px-1 pb-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-body font-medium">{c.name}</span>
                      <span className="shrink-0 text-micro text-fg-3">{c.id.startsWith("ref:") ? "Your reference" : c.id.startsWith("arr-") ? `Studio · round ${seed}` : kinds.find((k) => k.id === c.category)?.name}</span>
                    </span>
                    <span className="mt-0.5 block text-caption text-fg-3">{short ? `It floats ${c.needs} or more of the product's components round the phone, and this product has ${ctx.more.length === 0 ? "none" : `only ${ctx.more.length}`} in the library.` : c.hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
