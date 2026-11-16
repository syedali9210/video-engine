// The Artist, the Studio's director: one brief (the kind of film, an art direction or your taste's pick, how long, what
// shape, the product's colour) and it directs three takes of a whole launch film (artist.ts). Each take has its own
// story of set pieces, gradients, type and cuts, drawn as a storyboard and read by the critic, ready to use and edit.
// Or a set of mockup stills on the same art direction. What you pick, pass over or thumb teaches the taste
// (taste.ts signals).
import { DialogHead } from "../Gloss"
import { useEffect, useMemo, useState } from "react"
import { ArrowsClockwise, Check, DeviceMobile, FilmStrip, Images, PaintBrush, Plus, ThumbsDown, ThumbsUp, X } from "@phosphor-icons/react"
import { CATEGORIES, type Reference } from "../refs"
import { CategoryChips } from "../shell"
import { Button, Dialog, IconButton, Popover, Segmented, Select } from "../ui"
import { hex, lch } from "../theme"
import { DIRECTIONS, directionOf, mockups, takes, type ArtDirection, type Brief } from "./artist"
import { DirectionEditor } from "./DirectionEditor"
import { ScriptPoster } from "../FilmPoster"
import { Thinking } from "../Thinking"
import { FACES, loadFaces } from "./faces"
import { field } from "../controls"
import { analyze } from "./concepts"
import type { Copy } from "./copy"
import { gradient, lookFor } from "./gradients"
import { layersCss } from "./paint"
import { fill, type ScriptCtx, type TemplateScript } from "./script"
import { Score } from "./IdeasLab"
import type { Taste } from "./taste"

const said = (text: string, copy: Copy) => fill(text, { copy } as ScriptCtx)

/** A film's shots in a row, each as wide as it is long: its gradient, its first big title (or the device), so a take
    reads at a glance. */
export function StoryStrip({ film, copy, className = "" }: { film: TemplateScript; copy: Copy; className?: string }) {
  const tall = film.size === "9x16" || film.size === "4x5"
  useEffect(() => loadFaces([film.type?.display, film.type?.text]), [film.type?.display, film.type?.text])
  // as the film sets them: display titles in its face, words in its text face, serif in Instrument Serif
  const family = (f?: string) => (f === "serif" ? '"Instrument Serif", Georgia, serif' : f === "mono" ? '"Geist Mono", monospace' : `${(f === "display" ? film.type?.display : film.type?.text) ? `"${f === "display" ? film.type?.display : film.type?.text}", ` : ""}Geist, system-ui, sans-serif`)
  return (
    <div className={`flex gap-[3px] ${className}`} role="img" aria-label={`${film.shots.length} shots: ${film.shots.map((s) => s.name).join(", ")}`}>
      {film.shots.map((s, i) => {
        const big = (s.layers ?? []).filter((l) => l.kind === "text" && l.font !== "mono" && l.size >= 2).sort((a, b) => (b.kind === "text" ? b.size : 0) - (a.kind === "text" ? a.size : 0))[0]
        const t = big?.kind === "text" ? big : undefined
        const cards = (s.layers ?? []).some((l) => l.kind === "component" || l.kind === "breakdown")
        return (
          <div key={i} title={`${s.name} · ${s.dur.toFixed(1)} s`} className={`relative min-w-0 overflow-hidden rounded-[4px] shadow-[inset_0_0_0_1px_rgb(127_127_127/0.2)] ${tall ? "h-[96px]" : "h-[60px]"}`} style={{ flexGrow: s.dur, flexBasis: 0, backgroundColor: s.ground && s.ground.startsWith("#") ? s.ground : "#111", backgroundImage: s.paints?.length ? layersCss(s.paints, 120, 80) : undefined }}>
            {s.device && <DeviceMobile size={tall ? 22 : 18} aria-hidden className="absolute inset-0 m-auto opacity-80" style={{ color: t?.color || "#fff" }} />}
            {!s.device && cards && <span aria-hidden className="absolute inset-y-[22%] right-[14%] w-[22%] rounded-[3px] bg-white/80 shadow-sm" />}
            {t && !s.device && (
              <span className="absolute inset-x-1 top-1/2 line-clamp-2 -translate-y-1/2 text-center leading-[1.05]" style={{ color: t.color || "#fff", fontWeight: Math.min(800, t.weight), fontSize: Math.max(7, Math.min(12, t.size * 1.1)), fontFamily: family(t.font), fontSynthesisWeight: "none", ...(t.paint?.length ? { backgroundImage: layersCss(t.paint, 100, 20), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } : {}) }}>
                {said(t.text, copy)}
              </span>
            )}
            <span className="absolute bottom-0.5 left-1 text-[8px] tabular-nums text-white/70 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">{i + 1}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The words a film says, each one editable: what the Artist's takes are made with. */
function WordsPanel({ copy, set, type, setType }: { copy: Copy; set: (c: Copy) => void; type: NonNullable<Brief["type"]>; setType: (t: NonNullable<Brief["type"]>) => void }) {
  const line = (k: "name" | "kicker" | "hook" | "tagline" | "proof" | "cta" | "split", label: string, hint: string) => (
    <label className="grid gap-1">
      <span className="text-micro text-fg-3">{label}</span>
      <input value={copy[k]} placeholder={hint} onChange={(e) => set({ ...copy, [k]: e.target.value })} className={`${field} h-8 px-2.5 text-body`} />
    </label>
  )
  const f = [0, 1, 2].map((i) => copy.features[i] ?? "")
  return (
    <div className="grid gap-2.5 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)] sm:grid-cols-2">
      {line("name", "The name", "Coins & Notes")}
      {line("kicker", "The kicker (small, over the name)", "Introducing")}
      {line("hook", "The hook (the first second)", "Money that moves with you.")}
      {line("tagline", "The line", "Pixels, in motion.")}
      {f.map((v, i) => (
        <label key={i} className="grid gap-1">
          <span className="text-micro text-fg-3">Feature {i + 1}</span>
          <input value={v} placeholder={["Send in a tap", "Split any bill", "Every coin, live"][i]} onChange={(e) => set({ ...copy, features: f.map((x, j) => (j === i ? e.target.value : x)).filter((x, j) => x || j < 3) })} className={`${field} h-8 px-2.5 text-body`} />
        </label>
      ))}
      {line("proof", "A proof or a number (optional)", "Loved by 2,000 teams")}
      {line("cta", "The call to action", "Get the app")}
      {line("split", "Words that part round the device (a | marks where)", "Money | in motion")}
      <label className="grid gap-1">
        <span className="text-micro text-fg-3">Titles in</span>
        <Select value={type.display ?? ""} onChange={(e) => setType({ ...type, display: e.target.value || undefined })} className={`${field} h-8 cursor-pointer px-2 text-body`}>
          <option value="">The direction's (or the brand's)</option>
          {FACES.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1">
        <span className="text-micro text-fg-3">Words in</span>
        <Select value={type.text ?? ""} onChange={(e) => setType({ ...type, text: e.target.value || undefined })} className={`${field} h-8 cursor-pointer px-2 text-body`}>
          <option value="">The direction's (or the brand's)</option>
          {FACES.filter((x) => x.kind !== "serif").map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}

export function ArtistDialog({ open, onClose, accents, getCopy, screens, components = 0, componentNames, taste, gallery, refs = [], onUse }: { open: boolean; onClose: () => void; accents: string[]; getCopy: () => Promise<Copy>; screens: number; /** how many components the product has, and their names (the content reader's) */ components?: number; componentNames?: string[]; taste?: Taste; gallery: TemplateScript[]; refs?: Reference[]; onUse: (film: TemplateScript) => void }) {
  const [copy, setCopy] = useState<Copy | null>(null)
  const [mode, setMode] = useState<"film" | "mockups" | "direction">("film")
  const [own, setOwn] = useState<ArtDirection[]>([])
  const [words, setWords] = useState(false)
  const [type, setType] = useState<NonNullable<Brief["type"]>>({})
  useEffect(() => {
    if (open) void fetch("/__lab/directions").then((r) => (r.ok ? r.json() : []), () => []).then(setOwn)
  }, [open])
  const [category, setCategory] = useState("product-launch")
  const [style, setStyle] = useState("auto")
  const [length, setLength] = useState<NonNullable<Brief["length"]>>("standard")
  const [size, setSize] = useState<NonNullable<Brief["size"]>>("16x9")
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 900) + 1)
  const found = useMemo(() => [...new Set(accents.map((a) => hex(lch(a))))].slice(0, 4), [accents])
  const [anchor, setAnchor] = useState<string | null>(null)
  const accent = anchor ?? found[0] ?? "#6d5dfc"
  const [thumbs, setThumbs] = useState<Record<string, "like" | "dislike">>({})
  useEffect(() => {
    if (open && !copy) void getCopy().then(setCopy, () => {})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const brief: Brief | null = copy ? { category, style, length, size: mode === "mockups" && size === "16x9" ? "4x5" : size, accent, copy, screens, components, componentNames, seed, taste, directions: own, ...(type.display || type.text ? { type } : {}) } : null
  const made = useMemo(() => (open && brief && mode !== "direction" ? (mode === "film" ? takes(brief, 3) : [0, 1, 2].map((i) => mockups({ ...brief, seed: seed + i * 37 }, style === "auto" ? undefined : directionOf(brief, style)))) : []), [open, mode, category, style, length, size, accent, seed, copy, taste, own, type]) // eslint-disable-line react-hooks/exhaustive-deps
  const read = useMemo(() => new Map(made.map((f) => [f.id, analyze(f, { gallery, refs, taste })])), [made, gallery, refs, taste])
  const signal = (kind: "pick" | "skip" | "like" | "dislike", film: TemplateScript) => void fetch("/__lab/signal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, script: film }) }).catch(() => {})
  const use = (film: TemplateScript) => {
    signal("pick", film)
    for (const other of made) if (other.id !== film.id && !thumbs[other.id]) signal("skip", other)
    onUse(film)
  }
  const thumb = (film: TemplateScript, kind: "like" | "dislike") => {
    if (thumbs[film.id] === kind) return
    setThumbs((t) => ({ ...t, [film.id]: kind }))
    signal(kind, film)
  }
  const kinds = [{ id: "auto", name: "Your taste" }, ...[...DIRECTIONS, ...own].map((d) => ({ id: d.id, name: d.name }))]
  const ad = [...DIRECTIONS, ...own].find((d) => d.id === style)
  return (
    <Dialog open={open} onClose={onClose} label="The Artist" className="modal wide">
      <div className="flex h-full max-h-[inherit] flex-col">
        <DialogHead icon={PaintBrush} tone="brand" title="The Artist" sub={`Three takes on a film${copy?.name ? ` for ${copy.name}` : ""}, each a different art direction, every part editable.`} onClose={onClose} />
        <div className="space-y-2.5 border-y px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented
              size="sm"
              label="What to make"
              value={mode}
              onChange={setMode}
              options={[
                { value: "film", label: "Launch film" },
                { value: "mockups", label: "Mockups" },
                { value: "direction", label: "Your direction" },
              ]}
            />
            {/* the brief's finer points, one click away: length, shape, colour */}
            <Button size="sm" variant="secondary" popover="artist-opts" className="ml-auto">
              <span aria-hidden className="h-3.5 w-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(127_127_127/0.35)]" style={{ background: accent }} />
              {size.replace("x", ":")} · {length === "standard" ? "Standard" : length === "short" ? "Short" : "Long"}
            </Button>
            <Popover id="artist-opts" align="end" label="Length, shape and colour">
              <div className="w-[300px] space-y-3 p-3">
                <div>
                  <p className="mb-1.5 text-caption font-medium text-fg-2">How long</p>
                  <Segmented full size="sm" label="How long" value={length} onChange={setLength} options={[{ value: "short", label: "Short" }, { value: "standard", label: "Standard" }, { value: "long", label: "Long" }]} />
                </div>
                <div>
                  <p className="mb-1.5 text-caption font-medium text-fg-2">Shape</p>
                  <Segmented full size="sm" label="Shape" value={size} onChange={setSize} options={[{ value: "16x9", label: "16:9" }, { value: "9x16", label: "9:16" }, { value: "1x1", label: "1:1" }, { value: "4x5", label: "4:5" }]} />
                </div>
                <div>
                  <p className="mb-1.5 text-caption font-medium text-fg-2">Colour</p>
                  <span className="flex items-center gap-1.5">
                    {[...found, ...(anchor && !found.includes(anchor) ? [anchor] : [])].map((c) => (
                      <button key={c} type="button" onClick={() => setAnchor(c)} aria-pressed={accent === c} title={c} className={`press h-6 w-6 rounded-full ${accent === c ? "shadow-[0_0_0_2px_var(--overlay),0_0_0_3.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"}`} style={{ background: c }}>
                        <span className="sr-only">{c}</span>
                      </button>
                    ))}
                    <label className="press relative grid h-6 w-6 cursor-pointer place-items-center rounded-full text-fg-3 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg" title="Another colour">
                      <Plus size={12} aria-hidden />
                      <input type="color" aria-label="Another colour" value={accent} onChange={(e) => setAnchor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                    </label>
                  </span>
                </div>
              </div>
            </Popover>
            {mode !== "direction" && copy && (
              <Button size="sm" variant={words ? "primary" : "secondary"} aria-expanded={words} onClick={() => setWords((w) => !w)}>
                Words and type
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)}>
              <ArrowsClockwise size={14} aria-hidden />
              Three new takes
            </Button>
          </div>
          {mode === "film" && <CategoryChips label="Kind of film" value={category} onChange={setCategory} options={CATEGORIES.film.map((c) => ({ id: c.id, name: c.name }))} />}
          {mode !== "direction" && copy && words && <WordsPanel copy={copy} set={setCopy} type={type} setType={setType} />}
          {mode !== "direction" && (
            <>
              <div role="radiogroup" aria-label="Art direction" className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
                {kinds.map((k) => {
                  const d = [...DIRECTIONS, ...own].find((x) => x.id === k.id)
                  const look = d ? lookFor(d.anchor ?? accent, d.harmony, 1) : null
                  return (
                    <button key={k.id} type="button" role="radio" aria-checked={style === k.id} onClick={() => setStyle(k.id)} className={`press flex h-8 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-caption font-medium ${style === k.id ? "bg-fg text-surface" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg"}`}>
                      <span aria-hidden className="h-6 w-6 rounded-full bg-cover bg-center shadow-[inset_0_0_0_1px_rgb(127_127_127/0.3)]" style={{ backgroundColor: look?.ground ?? "transparent", backgroundImage: d?.own?.picture ? `url(${d.own.picture})` : d && look ? layersCss(gradient(d.grounds.reveal, look, { energy: d.energy, spread: d.spread, speed: 0 }), 24, 24) : "conic-gradient(from 0deg, #f59e0b, #ec4899, #8b5cf6, #3b82f6, #10b981, #f59e0b)" }} />
                      {k.name}
                    </button>
                  )
                })}
              </div>
              <p className="hint text-caption text-fg-3">{ad ? ad.hint : taste && (taste.decisions || Object.keys(taste.signals ?? {}).length) ? "The art directions your taste leans to, and one it hasn't tried much: the Artist keeps exploring." : "Three different art directions. What you pick, pass over and thumb teaches it which you like."}</p>
            </>
          )}
        </div>
        {mode === "direction" && brief ? (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <DirectionEditor
              brief={brief}
              own={own}
              setOwn={setOwn}
              onUse={(id) => {
                setStyle(id)
                setMode("film")
              }}
            />
          </div>
        ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-canvas p-5">
          {!copy ? (
            <div className="grid place-items-center p-12">
              <Thinking variant="globe" label="Reading the product's words…" sub="Its name, its line, what it does" />
            </div>
          ) : (
            <>
              {/* three takes side by side: compare them at a glance, the critic's read on each */}
              <ul className="grid gap-4 md:grid-cols-3">
                {made.map((film, i) => {
                  const a = read.get(film.id)
                  const secs = film.shots.reduce((x, s) => x + s.dur, 0)
                  const d = [...DIRECTIONS, ...own].find((x) => x.id === film.artist?.style)
                  return (
                    <li key={film.id} className="rise-in flex flex-col overflow-hidden rounded-xl border bg-surface" style={{ animationDelay: `${i * 50}ms` }}>
                      <button type="button" onClick={() => use(film)} className="press group block text-left" aria-label={mode === "film" ? `Use ${film.name}` : `Use the stills in ${d?.name ?? "this direction"}`}>
                        <span className="relative block">
                          <ScriptPoster script={film} product={copy.name} className="rounded-none shadow-none" />
                          {a && mode === "film" && <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white backdrop-blur-sm">{a.score}</span>}
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col p-4">
                        <p className="text-[12px] text-fg-3">{d?.name ?? film.artist?.style}</p>
                        <p className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.01em]">{film.name}</p>
                        <p className="mt-1 text-[13px] tabular-nums text-fg-3">
                          {film.shots.length} {mode === "film" ? "shots" : "stills"}
                          {mode === "film" && ` · ${secs.toFixed(0)} s · ${/(\d+) bpm/.exec(film.source)?.[1] ?? ""} bpm`}
                        </p>
                        <StoryStrip film={film} copy={copy} className="mt-3" />
                        <p className="mt-3 line-clamp-3 text-[13px] leading-[19px] text-fg-2">{mode === "film" ? film.summary : d?.hint}</p>
                        <div className="mt-auto flex items-center gap-1 pt-4">
                          <IconButton size="sm" label={`More like “${film.name}”`} active={thumbs[film.id] === "like"} onClick={() => thumb(film, "like")}>
                            <ThumbsUp size={14} />
                          </IconButton>
                          <IconButton size="sm" label={`Less like “${film.name}”`} active={thumbs[film.id] === "dislike"} onClick={() => thumb(film, "dislike")}>
                            <ThumbsDown size={14} />
                          </IconButton>
                          <Button size="sm" variant="primary" className="ml-auto" onClick={() => use(film)}>
                            {mode === "film" ? <FilmStrip size={14} aria-hidden /> : <Images size={14} aria-hidden />}
                            {mode === "film" ? "Use this take" : "Use these stills"}
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-fg-3">
                <Check size={13} aria-hidden />
                A take opens in Films, every scene, title and cut yours to change. Undo puts back what you had.
              </p>
            </>
          )}
        </div>
        )}
      </div>
    </Dialog>
  )
}
