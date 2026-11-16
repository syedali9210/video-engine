// The lab's references: what the engine studies, split by area (films, canvas pages, creatives, effects) and by
// category. Drop a video or a picture, or paste a YouTube film: Gemini tears it down (server/lab.ts, server/refs.ts)
// into shots, every title's animation, backgrounds, a layout, an effect, and what it becomes waits in the inbox (a
// template of its kind, an effect) or in the canvas's Create (a layout). "Write a template" is the compile step: a new
// film of one kind, from everything studied of that kind.
import { Problem } from "../States"
import { Glyph, Thinking } from "../Thinking"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowsClockwise, CopySimple, FilmReel, Lightbulb, MagicWand, MagnifyingGlass, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react"
import { field } from "../controls"
import { AREAS, CATEGORIES, type Area, type KitGround, type KitTitle, type Reference } from "../refs"
import { CategoryChips } from "../shell"
import { Button, IconButton, Segmented, Select } from "../ui"
import { AnimSample, glowPaints } from "./Kit"
import type { LabState } from "./Lab"
import { layersCss } from "./paint"
import { readFilm } from "./concepts"
import { cutName } from "./cuts"
import { Onion } from "./Onion"

type Api = <T>(path: string, body?: object) => Promise<T>

/** A still of a video or a picture, at most 1200 px across (WebP): the list shows it, an effect draws over it. */
async function stillOf(file: File): Promise<{ data: string; w: number; h: number }> {
  let src: CanvasImageSource
  let w: number
  let h: number
  const url = URL.createObjectURL(file)
  try {
    if (file.type.startsWith("video/")) {
      const v = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: url })
      await new Promise((ok, fail) => ((v.onloadeddata = ok), (v.onerror = fail)))
      v.currentTime = Math.min(1.5, (v.duration || 3) / 3)
      await new Promise((ok) => (v.onseeked = ok))
      ;[src, w, h] = [v, v.videoWidth, v.videoHeight]
    } else {
      const b = await createImageBitmap(file)
      ;[src, w, h] = [b, b.width, b.height]
    }
    const k = Math.min(1, 1200 / Math.max(w, h))
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(w * k), height: Math.round(h * k) })
    c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height)
    return { data: c.toDataURL("image/webp", 0.86), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** A film file as ffmpeg read it: its length, cuts, loop and bars in a line, a still from each shot, and the film laid
    over one of the engine's to compare at the same moment. */
function Measured({ r, api, onRead }: { r: Reference; api: Api; onRead: (r: Reference) => void }) {
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const m = r.measured
  if (!r.file?.type.startsWith("video/")) return null
  if (!m)
    return (
      <div>
        <h4 className="pb-1 font-medium text-fg-3">Measured</h4>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError("")
            api<{ reference: Reference }>(`references/${r.id}/measure`, {})
              .then((x) => onRead(x.reference), (e: Error) => setError(e.message))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? "Reading its cuts…" : "Read its cuts, loop and bars"}
        </Button>
        {error && <p role="alert" className="mt-1 text-fg-2">{error}</p>}
      </div>
    )
  return (
    <div>
      <h4 className="pb-1 font-medium text-fg-3">Measured</h4>
      <p className="text-fg-2">
        {m.duration.toFixed(2)} s · {plural(m.cuts.length + 1, "shot")}
        {m.cuts.length ? ` (cuts at ${m.cuts.map((c) => c.toFixed(2)).join(", ")} s)` : ""} · {m.loop ? "it loops" : "it doesn't loop"}
        {m.crop && m.size ? ` · bars round the picture: ${m.crop.w}×${m.crop.h} of ${m.size.w}×${m.size.h} kept` : ""}
      </p>
      {r.contact && <img src={r.contact} alt={`A still from each of its ${m.cuts.length + 1} shots`} className="mt-2 w-full rounded-md" />}
      <div className="mt-2">
        {compare ? (
          <Onion src={`/__lab/ref-file/${r.id}`} size={m.size} crop={m.crop} />
        ) : (
          <Button size="sm" onClick={() => setCompare(true)}>
            Compare with a film
          </Button>
        )}
      </div>
    </div>
  )
}
const thumb = (r: Reference) => r.poster ?? (r.video ? `https://i.ytimg.com/vi/${r.video}/mqdefault.jpg` : r.file?.type.startsWith("image/") ? `/__lab/ref-file/${r.id}` : "")

/** A studied film, read: its shots as a strip in time (its acts over it), its pace, its cuts as the engine's, the camera
    words its shots use. */
function FilmReading({ r }: { r: Reference }) {
  const f = readFilm(r)
  if (!f.shots || !f.length) return null
  const pct = (t: number) => `${((t / f.length) * 100).toFixed(2)}%`
  return (
    <div>
      <h4 className="pb-1.5 font-medium text-fg-3">Its analysis</h4>
      <div className="relative pt-4">
        {f.acts.map((a) => (
          <span key={a.at} className="mono absolute top-0 truncate text-micro text-fg-3" style={{ left: pct(a.at), width: pct(a.to - a.at) }}>
            {a.label}
          </span>
        ))}
        <div aria-label={`${f.shots} shots over ${f.length.toFixed(1)} s`} role="img" className="flex h-6 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--line)]">
          {r.shots.map((s, i) => (
            // shots in the scenes' azure, every other one firmer, so each cut shows
            <span key={i} title={`${s.at.toFixed(1)} s, ${s.dur.toFixed(1)} s: ${s.what}`} className={`h-full shrink-0 ${i % 2 ? "bg-k-scene/35" : "bg-k-scene/15"}`} style={{ width: pct(s.dur) }} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-fg-2">
        {f.shots} shots in {f.length.toFixed(1)} s, about {f.perMinute} a minute; {f.mean.toFixed(1)} s on average, from {f.shortest.toFixed(1)} to {f.longest.toFixed(1)} s.
        {f.fastest && (f.fastest.to - f.fastest.at) / 4 < f.mean * 0.75 ? ` It cuts fastest from ${f.fastest.at.toFixed(1)} to ${f.fastest.to.toFixed(1)} s.` : ""}
        {f.slowest ? ` It holds longest on “${f.slowest.what}” (${f.slowest.dur.toFixed(1)} s).` : ""}
        {f.titles ? ` ${f.titles} titles.` : ""}
      </p>
      {f.cuts.length > 0 && (
        <p className="mt-1 text-fg-3">
          Its cuts: {f.cuts.map((c) => `${cutName(c.cut).replace(/^an? /, "")} ×${c.n}`).join(", ")}.
          {f.camera.length ? ` The camera: ${f.camera.map((c) => `${c.word} ×${c.n}`).join(", ")}.` : ""}
        </p>
      )}
    </div>
  )
}

export function References({ api, state, setState, onInbox, onIdeas, onReplicate }: { api: Api; state: LabState | null; setState: (s: LabState) => void; onInbox: () => void; /** new film ideas from a studied film */ onIdeas?: (id: string) => void; /** a studied film, replicated */ onReplicate?: (id: string) => void }) {
  const [area, setArea] = useState<Area>("film")
  const [list, setList] = useState<Reference[]>([])
  const [cat, setCat] = useState("all")
  const [url, setUrl] = useState("")
  const [about, setAbout] = useState("")
  // what's happening now: an upload, a teardown (which reference), a search, a template being written
  const [busy, setBusy] = useState<{ what: "upload" | "study" | "research" | "watch" | "compose"; id?: string } | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const load = useCallback(() => api<Reference[]>("references").then(setList, (e: Error) => setError(e.message)), [api])
  useEffect(() => {
    void load()
  }, [load])
  const ai = !!state?.key
  const cats = CATEGORIES[area]
  // a new reference lands in the kind picked above the list (or this area's first)
  const into = cat !== "all" ? cat : undefined
  const mine = list.filter((r) => (r.area ?? "film") === area)
  const shown = mine.filter((r) => cat === "all" || r.category === cat)

  const run = async (what: NonNullable<typeof busy>["what"], job: () => Promise<void>, id?: string) => {
    setBusy({ what, id })
    setError("")
    try {
      await job()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
      void load()
    }
  }
  const study = (id: string) =>
    run(
      "study",
      async () => {
        const r = await api<{ reference: Reference; state: LabState }>(`references/${id}/study`, {})
        setState(r.state)
        setOpen(r.reference.id)
      },
      id,
    )
  const take = async (file: File) => {
    let ref: Reference | undefined
    await run("upload", async () => {
      const still = await stillOf(file).catch(() => null)
      const q = new URLSearchParams({ area, name: file.name, ...(into ? { category: into } : {}), ...(still ? { w: String(still.w), h: String(still.h) } : {}) })
      const r = await fetch(`/__lab/upload?${q}`, { method: "POST", headers: { "content-type": file.type }, body: file })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `The lab said ${r.status}`)
      ref = j.reference as Reference
      if (still) await api(`references/${ref.id}/poster`, { data: still.data })
    })
    // straight on to its teardown, when there's a key to do it with
    if (ref && ai) await study(ref.id)
  }
  const watch = () =>
    run("watch", async () => {
      const r = await api<{ references: Reference[]; state: LabState }>("watch", { url: url.trim(), category: into })
      setState(r.state)
      setOpen(r.references[0]?.id ?? null)
      setUrl("")
    })
  const research = () =>
    run("research", async () => {
      const r = await api<{ references: Reference[]; state: LabState }>("research", { about: about.trim() || undefined })
      setState(r.state)
      setOpen(r.references[0]?.id ?? null)
    })
  const compose = () =>
    run("compose", async () => {
      await api("compose", { area, category: into })
      onInbox()
    })
  const recategorise = (r: Reference, category: string) => void api(`references/${r.id}/category`, { category }).then(load, (e: Error) => setError(e.message))

  const chips = [{ id: "all", name: "All", count: mine.length }, ...cats.map((c) => ({ id: c.id, name: c.name, count: mine.filter((r) => r.category === c.id).length }))]
  const kind = cats.find((c) => c.id === cat)
  const word = area === "film" ? "film" : "picture"

  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <Segmented
        full
        label="What kind of reference"
        value={area}
        onChange={(a) => {
          setArea(a)
          setCat("all")
          setOpen(null)
        }}
        options={AREAS.map((a) => ({ value: a.id, label: a.name }))}
      />
      <CategoryChips label="Category" value={cat} onChange={setCat} options={chips} />

      <section
        aria-label="Add a reference"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) void take(f)
        }}
        className={`rounded-xl p-3 ${drag ? "bg-sel/10 shadow-[inset_0_0_0_1.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_var(--line)]"}`}
      >
        <h3 className="text-body font-medium">Add {kind ? `a ${kind.name.toLowerCase()} reference` : `a ${AREAS.find((a) => a.id === area)!.name.toLowerCase().replace(/s$/, "")} reference`}</h3>
        <p className="mt-0.5 text-caption text-fg-3">
          {area === "film"
            ? "Drop a video, or paste a YouTube film. Gemini tears it down: every shot and cut, each title's animation measured, the backgrounds, the hook and the pacing. Its titles, backgrounds and shots land in the Studio's kit, and its rebuild waits in the inbox as a template."
            : area === "effect"
              ? "Drop a picture of an effect. Gemini reads its cells, colours and what shows under them; the effect waits in the inbox, drawn over your picture."
              : "Drop a picture. Gemini measures its layers, boxes, type and colours; it becomes a layout in the canvas's Create, your picture's parts in place until you swap them."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button disabled={!!busy} onClick={() => pick.current?.click()}>
            <UploadSimple size={14} aria-hidden />
            {busy?.what === "upload" ? "Uploading…" : `Choose a ${area === "film" ? "video" : "picture"}`}
          </Button>
          <input ref={pick} type="file" hidden accept={area === "film" ? "video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp,image/gif"} onChange={(e) => (e.target.files?.[0] ? void take(e.target.files[0]) : undefined, (e.target.value = ""))} />
          {area === "film" && (
            <span className="flex min-w-[260px] flex-1 gap-2">
              <input aria-label="A YouTube address" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && ai && void watch()} placeholder="or https://www.youtube.com/watch?v=…" className={`${field} mono h-8 min-w-0 flex-1 px-2.5 text-body`} />
              <Button variant="primary" disabled={!ai || !url.trim() || !!busy} onClick={() => void watch()}>
                <FilmReel size={14} aria-hidden />
                {busy?.what === "watch" ? <><Glyph variant="scan" size={14} /> Watching…</> : "Study it"}
              </Button>
            </span>
          )}
        </div>
        {area === "film" && (
          <div className="mt-2 flex gap-2">
            <input aria-label="What to look for (optional)" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Or let it search YouTube: what to look for (optional)" className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body`} />
            <Button disabled={!ai || !!busy} onClick={() => void research()}>
              <MagnifyingGlass size={14} aria-hidden />
              {busy?.what === "research" ? "Searching and watching…" : "Find films"}
            </Button>
          </div>
        )}
        {!ai && <p className="mt-1.5 text-caption text-fg-3">Add your Gemini key in Settings first: files are kept, and torn down once there's a key.</p>}
        {busy && busy.what !== "compose" && <Thinking className="mt-2.5" variant={busy.what === "upload" ? "slide" : "scan"} label={busy.what === "upload" ? "Uploading…" : `Gemini is ${area === "film" ? "watching" : "studying"} it…`} sub={busy.what === "upload" ? undefined : "A minute or two"} />}
      </section>

      {area === "film" && (
        <section aria-label="Write a template" className="flex flex-wrap items-center gap-3 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium">Write a new {kind ? kind.name.toLowerCase() : "film"} template</span>
            <span className="block text-caption text-fg-3">
              {kind ? `From everything studied of this kind (${plural(shown.length, "film")}), then the rest: their structure, hooks, pacing, shots and title animations. It waits in the inbox.` : "Pick a kind above first: the template is written from the references of that kind."}
            </span>
          </span>
          <Button variant="primary" disabled={!ai || !kind || !!busy} onClick={() => void compose()}>
            <MagicWand size={14} aria-hidden />
            {busy?.what === "compose" ? <><Glyph variant="breathe" size={14} /> Writing…</> : "Write it"}
          </Button>
        </section>
      )}

      {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}

      <section aria-label="References">
        <h3 className="pb-2 text-caption font-medium text-fg-3">{shown.length ? `${plural(shown.length, word)}, newest first` : `No ${kind ? kind.name.toLowerCase() : ""} references yet`}</h3>
        <ul className="space-y-2">
          {shown.map((r) => {
            const pending = !r.summary
            const studying = busy?.what === "study" && busy.id === r.id
            const titles = (r.kit ?? []).filter((k): k is KitTitle => k.kind === "title")
            const grounds = (r.kit ?? []).filter((k): k is KitGround => k.kind === "ground")
            return (
              <li key={r.id} className="rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="flex gap-3 p-3">
                  {thumb(r) ? <img src={thumb(r)} alt="" loading="lazy" className="h-[68px] w-[120px] shrink-0 rounded-md bg-surface-2 object-cover" /> : <span aria-hidden className="h-[68px] w-[120px] shrink-0 rounded-md bg-surface-2" />}
                  <span className="min-w-0 flex-1">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="block truncate text-body font-medium hover:underline">
                        {r.title}
                      </a>
                    ) : (
                      <span className="block truncate text-body font-medium">{r.title}</span>
                    )}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption text-fg-3">
                      <Select aria-label={`Category of “${r.title}”`} value={r.category ?? ""} onChange={(e) => recategorise(r, e.target.value)} className="-ml-1 cursor-pointer rounded bg-transparent px-1 text-caption text-fg-2 hover:bg-surface-2">
                        <option value="">No category</option>
                        {CATEGORIES[r.area].map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      {r.channel && <span>· {r.channel}</span>}
                      {r.shots.length > 0 && <span>· {plural(r.shots.length, "shot")}</span>}
                      {titles.length > 0 && <span>· {plural(titles.length, "title")}</span>}
                      {r.layout && <span>· {plural(r.layout.layers.length, "layer")}</span>}
                    </span>
                    <span className="mt-1 block text-caption text-fg-2">{studying ? <span className="shimmer">Gemini is tearing it down…</span> : pending ? "Not torn down yet." : r.summary}</span>
                    {r.made?.length ? (
                      <span className="mt-1 block text-caption text-fg-3">
                        Became {r.made.map((m) => (m.kind === "script" ? `a template, “${m.name}”, in the inbox` : m.kind === "effect" ? `an effect, “${m.name}”, in the inbox` : "a layout in the canvas's Create")).join("; ")}.
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {pending ? (
                      <Button size="sm" variant="primary" disabled={!ai || !!busy} onClick={() => void study(r.id)}>
                        {studying ? <><Glyph variant="globe" size={14} /> Studying…</> : "Tear it down"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? "Hide" : "Teardown"}
                      </Button>
                    )}
                    <span className="flex">
                      {!pending && (
                        <IconButton size="sm" label={`Tear “${r.title}” down again`} disabled={!ai || !!busy} onClick={() => void study(r.id)}>
                          <ArrowsClockwise size={14} />
                        </IconButton>
                      )}
                      <IconButton size="sm" label={`Forget “${r.title}”`} onClick={() => void api(`references/${r.id}/remove`, {}).then(load)}>
                        <Trash size={14} />
                      </IconButton>
                    </span>
                  </span>
                </div>
                {/* a film file is measured on arrival: that shows before any teardown */}
                {pending && r.file?.type.startsWith("video/") && (
                  <div className="border-t px-3 py-2.5 text-caption">
                    <Measured r={r} api={api} onRead={(x) => setList((all) => all.map((y) => (y.id === x.id ? x : y)))} />
                  </div>
                )}
                {open === r.id && !pending && (
                  <div className="space-y-3 border-t px-3 py-2.5 text-caption">
                    <Measured r={r} api={api} onRead={(x) => setList((all) => all.map((y) => (y.id === x.id ? x : y)))} />
                    {r.area === "film" && r.shots.length > 0 && (
                      <>
                        <FilmReading r={r} />
                        <div className="flex flex-wrap gap-1.5">
                          {onIdeas && (
                            <Button size="sm" onClick={() => onIdeas(r.id)}>
                              <Lightbulb size={14} aria-hidden />
                              Ideas from this film
                            </Button>
                          )}
                          {onReplicate && (
                            <Button size="sm" disabled={!ai} onClick={() => onReplicate(r.id)}>
                              <CopySimple size={14} aria-hidden />
                              {r.replica ? `Replicated, ${r.replica.score}% close: rebuild` : "Replicate it"}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                    {(r.hook || r.pacing || r.type) && (
                      <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1">
                        {r.hook && (
                          <>
                            <dt className="text-fg-3">Hook</dt>
                            <dd className="text-fg-2">{r.hook}</dd>
                          </>
                        )}
                        {r.pacing && (
                          <>
                            <dt className="text-fg-3">Pacing</dt>
                            <dd className="text-fg-2">{r.pacing}</dd>
                          </>
                        )}
                        {r.type && (
                          <>
                            <dt className="text-fg-3">Type</dt>
                            <dd className="text-fg-2">{r.type}</dd>
                          </>
                        )}
                      </dl>
                    )}
                    {r.palette?.length ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-[72px] text-fg-3">Palette</span>
                        {r.palette.map((c) => (
                          <span key={c} title={c} className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: c }} />
                        ))}
                      </div>
                    ) : null}
                    {titles.length > 0 && (
                      <div>
                        <h4 className="pb-1.5 font-medium text-fg-3">Titles, as they move · in the Studio's kit</h4>
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {titles.map((t) => (
                            <li key={t.id}>
                              <span className="grid aspect-[16/9] place-items-center overflow-hidden rounded-lg bg-canvas px-2 text-center shadow-[inset_0_0_0_1px_var(--line)]">
                                <AnimSample anim={t.anim} text={t.text.length > 24 ? `${t.text.slice(0, 22).trim()}…` : t.text} className="text-[15px] leading-none" style={{ fontWeight: t.weight }} />
                              </span>
                              <span className="mt-1 block truncate text-fg-2">{t.name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {grounds.length > 0 && (
                      <div>
                        <h4 className="pb-1.5 font-medium text-fg-3">Backgrounds</h4>
                        <ul className="flex flex-wrap gap-2">
                          {grounds.map((g) => (
                            <li key={g.id} title={g.name} className="h-10 w-16 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ backgroundColor: g.ground, backgroundImage: layersCss(glowPaints(g), 64, 40) }} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.layout && (
                      <div>
                        <h4 className="pb-1.5 font-medium text-fg-3">Layers, back to front</h4>
                        <ol className="divide-y">
                          {r.layout.layers.map((l, i) => (
                            <li key={i} className="flex gap-2 py-1">
                              <span className="w-14 shrink-0 text-fg-3">{l.kind}</span>
                              <span className="min-w-0 flex-1 truncate text-fg-2">
                                {l.name}
                                {l.text ? ` · “${l.text}”` : l.what ? ` · ${l.what}` : ""}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {r.lessons.length > 0 && (
                      <div>
                        <h4 className="pb-1 font-medium text-fg-3">What a template should copy</h4>
                        <ul className="list-disc space-y-0.5 pl-5 text-fg-2 marker:text-fg-3">
                          {r.lessons.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.shots.length > 0 && (
                      <div>
                        <h4 className="pb-1 font-medium text-fg-3">Shot by shot</h4>
                        <ol className="divide-y">
                          {r.shots.map((s, i) => (
                            <li key={i} className="grid grid-cols-[60px_1fr] gap-2 py-1.5">
                              <span className="tabular-nums text-fg-3">
                                {s.at.toFixed(1)} s<span className="block">+{s.dur.toFixed(1)} s</span>
                              </span>
                              <span className="min-w-0">
                                <span className="block text-fg">{s.what}</span>
                                <span className="block text-fg-3">
                                  {s.from} → {s.to}
                                  {s.rotation ? ` · turns ${s.rotation}` : ""}
                                </span>
                                <span className="block text-fg-3">{[s.cut && `comes in: ${s.cut}`, s.focus, s.ease, s.type && s.type !== "none" ? `type: ${s.type}` : ""].filter(Boolean).join(" · ")}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {!shown.length && <p className="text-caption text-fg-3">{kind ? `${kind.hint} Add one above: the more of a kind it studies, the better its templates of that kind.` : `Categories split what it learns: ${cats.map((c) => c.name).join(", ")}.`}</p>}
      </section>
    </div>
  )
}
