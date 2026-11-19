// Product: your product, kept once, so every film takes it. Drop its screens, recordings, logo, photos, notes or
// design tokens, and give its address; the reader says what each file is and where to look, writes its words in its
// own voice, and the colour reader takes its accent from the best source there is (its tokens, then its logo, then its
// site's main button, then its screens). Then pick a template: its fit report says what won't fit before anything
// renders, and the film opens with the product in every slot.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { ArrowSquareOut, Check, Crosshair, Globe, Plus, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react"
import { field } from "./controls"
import { Button, IconButton, Select } from "./ui"
import { Page, PageSection, PageTitle } from "./shell"
import { Glyph } from "./Thinking"
import { FilmPoster } from "./FilmPoster"
import type { Template } from "./studio/comp"
import { slotsFor } from "./studio/library"
import SIZES from "./studio/lib/sizes.json"
import { FILE_KINDS, fillSlots, fitReport, type FileKind, type FitIssue, type KitFile, type ProductKit } from "./studio/product"
import { brandFrom, readImage } from "./studio/brand"
import { Planner } from "./Planner"
import { KitTools } from "./KitTools"
import type { TemplateScript } from "./studio/script"
import { accentOf } from "./theme"
import { Problem } from "./States"
import { Batch, animOf, type BatchJob } from "./Batch"
import { MakerPanel } from "./MakerPanel"

type KitRow = { id: string; name: string; updated: string; accent?: string; logo?: string; files: number }

async function kitApi<T>(path: string, body?: object): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/__kit/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  } catch {
    throw new Error("Kits are kept by the engine's server: start it with npm run dev.")
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}

/** A file's size and, for a picture, its palette; a clip's length; read in the browser as it's dropped. */
async function measure(file: File) {
  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file)
    try {
      const v = Object.assign(document.createElement("video"), { muted: true, preload: "metadata", src: url })
      await new Promise((ok, no) => ((v.onloadedmetadata = ok), (v.onerror = no)))
      return { w: v.videoWidth, h: v.videoHeight, dur: v.duration, palette: [] as string[] }
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  if (!file.type.startsWith("image/")) return { palette: [] as string[] }
  const b = await createImageBitmap(file).catch(() => null)
  return { w: b?.width, h: b?.height, palette: await readImage(file).catch(() => [] as string[]) }
}

/** Where a colour came from, best first: what the product's code says beats its logo, its site and its screenshots. */
const SOURCES = ["tokens", "logo", "the site", "screens"]
const rank = (from?: string) => (from ? SOURCES.findIndex((s) => from.startsWith(s)) : 99)


export function ProductPage({ templates, onMake, onPlan, onBatch, onOpenFilm }: { /** a film the film maker made, opened in the Studio as it is */ onOpenFilm: (comp: unknown) => void; templates: Template[]; /** a film from a template, with this kit in it (and its lines, written for it) */ onMake: (t: Template, kit: ProductKit, lines?: Record<string, string>) => void; /** a planned film: its script, and each of its films' values */ onPlan: (script: TemplateScript, kit: ProductKit, values: Record<string, Record<string, string>>) => void; /** a film queued on the renderer for a batch */ onBatch: BatchJob }) {
  const [kits, setKits] = useState<KitRow[]>([])
  const [kit, setKit] = useState<ProductKit | null>(null)
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [site, setSite] = useState("")
  const [over, setOver] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const saving = useRef<number>(0)

  const load = useCallback(async (id?: string) => {
    const list = await kitApi<KitRow[]>("list")
    setKits(list)
    const want = id ?? localStorageGet() ?? list[0]?.id
    if (want) setKit(await kitApi<ProductKit>(`get?id=${want}`).catch(() => null))
  }, [])
  useEffect(() => {
    void load().catch((e: Error) => setMsg({ ok: false, text: e.message }))
  }, [load])
  useEffect(() => {
    if (kit) localStorageSet(kit.id)
    if (kit?.url) setSite(kit.url)
  }, [kit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // what you type is kept a moment after you stop
  const edit = (next: ProductKit) => {
    setKit(next)
    clearTimeout(saving.current)
    saving.current = window.setTimeout(() => void kitApi<ProductKit>("save", { kit: next }).catch((e: Error) => setMsg({ ok: false, text: e.message })), 500)
  }
  const act = async (what: string, run: () => Promise<void>) => {
    setBusy(what)
    setMsg(null)
    try {
      await run()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const newKit = () =>
    act("new", async () => {
      const k = await kitApi<ProductKit>("new", { name: "My product" })
      setKit(k)
      setKits(await kitApi<KitRow[]>("list"))
    })

  // files in: each kept by the server; design tokens and a logo also read for the colours and type
  const add = (files: File[]) =>
    act("upload", async () => {
      let k = kit ?? (await kitApi<ProductKit>("new", { name: files[0]?.name.replace(/\.[^.]+$/, "") ?? "My product" }))
      const tokens = files.filter((f) => /\.(css|json|js|ts|html)$/i.test(f.name) || f.type === "text/css")
      for (const f of files) {
        if (tokens.includes(f) && !/\.(json|css|html)$/i.test(f.name)) continue
        const m = await measure(f)
        const q = new URLSearchParams({ kit: k.id, name: f.name, ...(m.w ? { w: String(m.w), h: String(m.h) } : {}), ...("dur" in m && m.dur ? { dur: String(m.dur) } : {}), palette: m.palette.slice(0, 8).join(",") })
        const type = f.type || (/\.md$/i.test(f.name) ? "text/markdown" : /\.json$/i.test(f.name) ? "application/json" : /\.css$/i.test(f.name) ? "text/css" : "text/plain")
        const r = await fetch(`/__kit/upload?${q}`, { method: "POST", headers: { "content-type": type }, body: f })
        const j = await r.json()
        if (!r.ok) throw new Error(`${f.name}: ${j.error}`)
        k = j
      }
      // the colour reader: the best source there is wins (tokens, then the logo, then the site, then the screens)
      let brand = { ...k.brand }
      if (tokens.length) {
        const b = await brandFrom(tokens)
        if (rank("tokens") <= rank(brand.from?.accent)) brand = { ...brand, accent: b.accent, ground: b.bg, ink: b.ink, dark: b.dark, radius: b.radius, ...(b.display ? { display: b.display } : {}), ...(b.font ? { text: b.font } : {}), fonts: b.fonts, from: { ...brand.from, accent: `tokens (${tokens[0].name})`, ground: "tokens", ink: "tokens", type: "tokens" } }
      }
      const logo = k.files.find((f) => f.kind === "logo" && f.palette?.length)
      const fromLogo = logo ? accentOf(logo.palette!) : null
      if (fromLogo && rank("logo") < rank(brand.from?.accent)) brand = { ...brand, accent: fromLogo, from: { ...brand.from, accent: `logo (${logo!.name})` } }
      const screens = accentOf(k.files.filter((f) => f.kind !== "logo").flatMap((f) => f.palette ?? []))
      if (screens && !brand.accent) brand = { ...brand, accent: screens, from: { ...brand.from, accent: "screens" } }
      const next = await kitApi<ProductKit>("save", { kit: { ...k, brand } })
      setKit(next)
      setKits(await kitApi<KitRow[]>("list"))
    })
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = [...e.dataTransfer.files]
    if (files.length) void add(files)
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")
    if (!files.length && /^https?:\/\//.test(text.trim())) setSite(text.trim())
  }
  const read = (fresh = false) =>
    act("read", async () => {
      const r = await kitApi<{ kit: ProductKit; notes: string[] }>("read", { id: kit!.id, fresh })
      setKit(r.kit)
      setMsg(r.notes.length ? { ok: false, text: `Read, with trouble: ${r.notes.slice(0, 3).join(" · ")}` } : { ok: true, text: "Read: what each file is, where to look, and the product's words." })
    })
  const readSite = () =>
    act("site", async () => {
      // the address can be the first thing given: the kit is made for it
      const host = site.trim().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "")
      const id = kit?.id ?? (await kitApi<ProductKit>("new", { name: host.split(".")[0].replace(/^./, (c) => c.toUpperCase()) })).id
      const k = await kitApi<ProductKit>("site", { id, url: site })
      setKit(k)
      setKits(await kitApi<KitRow[]>("list"))
      setMsg({ ok: true, text: `Read ${new URL(k.url ?? site).hostname}: a capture on a desktop and a phone, its main button's colour, its type and its words.` })
    })

  const fits = useMemo(() => {
    if (!kit) return new Map<string, { issues: FitIssue[]; kept: string[] }>()
    return new Map(
      templates.map((t) => {
        const anim = animOf(t)
        const slots = slotsFor(anim)
        const f = fillSlots(kit, slots)
        const sizes = Object.fromEntries(Object.entries(SIZES as Record<string, { w: number; h: number }>).filter(([k]) => k.startsWith(`${anim}/`)).map(([k, v]) => [k.split("/")[1], v]))
        return [t.id, { issues: fitReport(kit, slots, f.values, sizes), kept: f.kept }]
      }),
    )
  }, [kit, templates])

  const setFile = (id: string, patch: Partial<KitFile>) => kit && edit({ ...kit, files: kit.files.map((f) => (f.id === id ? { ...f, ...patch, by: "you" } : f)) })
  const words = kit?.words
  const setWords = (patch: Partial<ProductKit["words"]>) => kit && edit({ ...kit, words: { ...kit.words, ...patch, by: "you" } })
  const chosen = templates.find((t) => t.id === pick)

  return (
    <Page label="Product">
      <PageTitle
        title={kit?.words.name || kit?.name || "Your product"}
        sub="Everything a film needs about your product, kept once: drop it in, and every film and every template takes it."
        actions={
          <span className="flex items-center gap-2">
            {kits.length > 0 && (
              <Select aria-label="Product kit" value={kit?.id ?? ""} onChange={(e) => void load(e.target.value)} className={`${field} h-8 min-w-40 cursor-pointer px-2 text-body`}>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            )}
            <Button onClick={() => void newKit()} disabled={!!busy}>
              <Plus size={14} aria-hidden />
              New product
            </Button>
          </span>
        }
      />

      {/* the drop zone: the whole first screen when there's nothing yet */}
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`mt-10 rounded-2xl border border-dashed transition-colors duration-150 ${over ? "border-fg-2 bg-surface-2" : "border-line"} ${kit?.files.length ? "px-5 py-4" : "grid min-h-[300px] place-items-center px-6 py-12 text-center"}`}
      >
        <div className={kit?.files.length ? "flex flex-wrap items-center gap-3" : "max-w-[520px]"}>
          {!kit?.files.length && <UploadSimple size={28} aria-hidden className="mx-auto mb-3 text-fg-3" />}
          <p className={kit?.files.length ? "text-body text-fg-2" : "text-[17px] font-medium"}>{kit?.files.length ? "Drop more here" : "Drop your product in"}</p>
          {!kit?.files.length && <p className="mt-1.5 text-body text-fg-3">Screens and recordings, your logo, photos, notes or a doc, your design tokens (CSS, Tailwind, a tokens JSON). All at once is fine.</p>}
          <span className={`flex flex-wrap items-center gap-2 ${kit?.files.length ? "ml-auto" : "mt-5 justify-center"}`}>
            <Button onClick={() => input.current?.click()} disabled={!!busy}>
              {busy === "upload" ? <><Glyph variant="slide" size={14} /> Keeping them…</> : "Choose files"}
            </Button>
            <span className="flex items-center gap-2">
              <input aria-label="Your product's address" value={site} onChange={(e) => setSite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && site.trim() && !busy && void readSite()} placeholder="yourproduct.com" spellCheck={false} className={`${field} mono h-8 w-56 px-2.5 text-body`} />
              <Button disabled={!site.trim() || !!busy} onClick={() => void readSite()}>
                {busy === "site" ? <><Glyph variant="globe" size={14} /> Opening it…</> : <><Globe size={14} aria-hidden /> Read the site</>}
              </Button>
            </span>
          </span>
          <input ref={input} type="file" multiple hidden accept="image/*,video/*,.md,.txt,.pdf,.css,.json,.html" onChange={(e) => (void add([...(e.target.files ?? [])]), (e.target.value = ""))} />
        </div>
      </div>
      {msg &&
        (msg.ok ? (
          <p role="status" className="mt-3 flex items-start gap-1.5 text-caption text-fg-2">
            <Check size={14} aria-hidden className="mt-px shrink-0" />
            {msg.text}
          </p>
        ) : (
          <Problem compact error={msg.text} onRetry={() => (setMsg(null), void load(kit?.id).catch((e: Error) => setMsg({ ok: false, text: e.message })))} className="mt-3 rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />
        ))}

      {kit && kit.files.length > 0 && (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
          <PageSection
            title="What's in it"
            count={kit.files.length}
            aside={
              <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void read(kit.files.some((f) => f.by === "reader"))}>
                {busy === "read" ? <><Glyph variant="scan" size={14} /> Reading each file…</> : kit.files.some((f) => f.by === "reader") ? "Read it again" : "Read it"}
              </Button>
            }
          >
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {kit.files.map((f) => (
                <FileCard key={f.id} f={f} onChange={(p) => setFile(f.id, p)} onRemove={() => void act("unfile", async () => setKit(await kitApi<ProductKit>("unfile", { kit: kit.id, file: f.id })))} />
              ))}
            </ul>
          </PageSection>

          <aside className="space-y-8">
            <section>
              <h2 className="pb-2 text-body font-semibold">Its words {words?.by === "reader" && <span className="ml-1 text-caption font-normal text-fg-3">by the reader</span>}</h2>
              <div className="space-y-2">
                {(["name", "tagline", "hook", "proof", "cta"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="block pb-1 text-caption text-fg-3">{{ name: "Name", tagline: "What it's for", hook: "The opening line", proof: "A real figure", cta: "The call" }[k]}</span>
                    <input value={words?.[k] ?? ""} onChange={(e) => setWords({ [k]: e.target.value })} className={`${field} h-8 w-full px-2.5 text-body`} />
                  </label>
                ))}
                <label className="block">
                  <span className="block pb-1 text-caption text-fg-3">Features, strongest first (one a line)</span>
                  <textarea rows={4} value={(words?.features ?? []).join("\n")} onChange={(e) => setWords({ features: e.target.value.split("\n").map((x) => x.trimStart()).slice(0, 8) })} className={`${field} w-full px-2.5 py-1.5 text-body`} />
                </label>
              </div>
            </section>
            <section>
              <h2 className="pb-2 text-body font-semibold">Its colours and type</h2>
              <div className="space-y-1.5 text-body">
                {(["accent", "ground", "ink"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2.5">
                    <input type="color" value={kit.brand[k] ?? "#888888"} onChange={(e) => edit({ ...kit, brand: { ...kit.brand, [k]: e.target.value, from: { ...kit.brand.from, [k]: "you" } } })} className="h-7 w-9 cursor-pointer rounded-md border border-line bg-transparent" />
                    <span className="w-16 capitalize">{k}</span>
                    <span className="truncate text-caption text-fg-3">{kit.brand[k] ? `from ${kit.brand.from?.[k] ?? "you"}` : "not read yet"}</span>
                  </label>
                ))}
                <p className="pt-1 text-caption text-fg-3">{kit.brand.display || kit.brand.text ? `Type: ${[kit.brand.display, kit.brand.text].filter((x, i, a) => x && a.indexOf(x) === i).join(" and ")}${kit.brand.radius ? ` · corners ${kit.brand.radius} px` : ""}` : "Type: drop your tokens or read the site"}</p>
                {(kit.brand.ease || kit.brand.ms) && <p className="text-caption text-fg-3">Motion: {[kit.brand.ms ? `${kit.brand.ms} ms` : "", kit.brand.ease].filter(Boolean).join(", ")}{kit.brand.shadow ? " · its own shadows" : ""}</p>}
              </div>
            </section>
            {kit.understanding && (
              <section>
                <h2 className="pb-2 text-body font-semibold">What the reader understood</h2>
                <dl className="space-y-1.5 text-caption">
                  {[
                    ["What it is", kit.understanding.kind],
                    ["What's new", kit.understanding.whatsNew],
                    ["For", kit.understanding.audience],
                    ["Mood", kit.understanding.mood],
                    ["Proof", kit.understanding.proof.join(" · ") || "none found: the film won't invent any"],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[80px_1fr] gap-2">
                      <dt className="text-fg-3">{k}</dt>
                      <dd className="text-fg-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </aside>
        </div>
      )}

      {kit && kit.files.length > 0 && (
        <PageSection className="mt-14" title="Tools">
          <KitTools kit={kit} onKit={setKit} add={add} />
        </PageSection>
      )}

      {kit && (
        <PageSection className="mt-16" title="The film maker">
          <p className="-mt-2 mb-5 max-w-[720px] text-body text-fg-2">The brief once, then a film from the template whose story fits: every line written in one call and checked, its cost shown, a note in plain words to change it.</p>
          <MakerPanel kit={kit} onOpen={onOpenFilm} />
        </PageSection>
      )}

      {kit && kit.files.length > 0 && (
        <PageSection className="mt-16" title="Make a film with it" count={templates.length}>
          <div className="mb-6">
            <Planner
              kit={kit}
              onOpen={async (script) => {
                // every film it casts from gets the kit's screens and words, its lines written for it (with a Work API key)
                const films = [...new Set(script.shots.map((x) => x.clip?.split("/")[0]).filter((x): x is string => !!x))]
                const values = Object.fromEntries(
                  await Promise.all(
                    films.map(async (f) => {
                      const w = await kitApi<{ values: Record<string, string> }>("words", { id: kit.id, film: f }).catch(() => null)
                      return [f, { ...fillSlots(kit, slotsFor(f)).values, ...w?.values }] as const
                    }),
                  ),
                )
                onPlan(script, kit, values)
              }}
            />
          </div>
          <p className="pb-3 text-caption text-fg-3">Or start from one template as it is:</p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
            {templates.map((t) => {
              const fit = fits.get(t.id)
              const bad = fit?.issues.filter((i) => i.level !== "info").length ?? 0
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setPick(pick === t.id ? null : t.id)} aria-expanded={pick === t.id} className={`press group block w-full overflow-hidden rounded-xl text-left shadow-[0_0_0_1px_var(--line)] ${pick === t.id ? "shadow-[0_0_0_2px_var(--fg)]" : ""}`}>
                    <FilmPoster bare t={t} product={kit.words.name || kit.name} accent={kit.brand.accent} />
                    <span className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="truncate text-body font-medium">{t.name}</span>
                      <span className={`shrink-0 text-caption ${bad ? "text-warn-ink" : "text-fg-3"}`}>{bad ? `${bad} to fix` : "Fits"}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {chosen && kit && (
            <div className="rise-in mt-6 rounded-xl p-5 shadow-[0_0_0_1px_var(--line)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-body font-semibold">{chosen.name}: the fit report</h3>
                  <p className="mt-0.5 text-caption text-fg-3">What won't fit, before anything renders. Fix it here, or open it and edit on the film.</p>
                </div>
                <Button
                  variant="primary"
                  disabled={!!busy}
                  onClick={() =>
                    void act("make", async () => {
                      // the template's lines written in the product's voice first (with a Work API key); the rules' without
                      const w = await kitApi<{ values: Record<string, string>; problems: string[] }>("words", { id: kit.id, film: animOf(chosen) }).catch(() => null)
                      onMake(chosen, kit, w?.values)
                    })
                  }
                >
                  {busy === "make" ? <><Glyph variant="breathe" size={14} /> Writing its lines…</> : <><ArrowSquareOut size={14} aria-hidden /> Open it with {kit.words.name || kit.name}</>}
                </Button>
              </div>
              <ul className="mt-4 space-y-1.5">
                {(fits.get(chosen.id)?.issues ?? []).map((i, n) => (
                  <li key={n} className="flex items-start gap-2 text-caption">
                    <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i.level === "error" ? "bg-bad-ink" : i.level === "warn" ? "bg-warn-ink" : "bg-fg-3"}`} />
                    <span className="text-fg-2">{i.text}</span>
                  </li>
                ))}
                {(fits.get(chosen.id)?.kept ?? []).length > 0 && (
                  <li className="flex items-start gap-2 text-caption">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
                    <span className="text-fg-2">Still the template's own words (nothing in the kit says what goes there yet): {fits.get(chosen.id)!.kept.join(", ")}. The AI writes them in your voice when the film opens with a Work API key.</span>
                  </li>
                )}
                {!fits.get(chosen.id)?.issues.length && !fits.get(chosen.id)?.kept.length && <li className="text-caption text-fg-2">Everything fits.</li>}
              </ul>
            </div>
          )}
        </PageSection>
      )}

      {kit && kit.files.length > 0 && (
        <PageSection className="mt-16" title="Many at once">
          <p className="-mt-1 pb-4 text-caption text-fg-3">One template for many products, or many templates for one, in each shape you pick.</p>
          <Batch kit={kit} kits={kits} templates={templates} onBatch={onBatch} />
        </PageSection>
      )}
    </Page>
  )
}

const KEY = "anim-engine:kit"
const localStorageGet = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const localStorageSet = (id: string) => {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // a private window: it just isn't remembered
  }
}

/** One file: itself (a click on a picture sets where to look), what it is, what it shows, a clip's part. */
function FileCard({ f, onChange, onRemove }: { f: KitFile; onChange: (p: Partial<KitFile>) => void; onRemove: () => void }) {
  const picture = f.type.startsWith("image/")
  const clip = f.type.startsWith("video/")
  // every card the same height: the picture sits whole inside it (contain), and where to look is measured on the
  // picture itself, not the box around it
  const box = (r: DOMRect) => {
    const a = f.w && f.h ? f.w / f.h : r.width / r.height
    const w = Math.min(r.width, r.height * a)
    const h = w / a
    return { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h }
  }
  const [area, setArea] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const frame = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(() => setArea(box(el.getBoundingClientRect())))
    ro.observe(el)
    return () => ro.disconnect()
  }, [f.w, f.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const aim = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const b = box(r)
    const x = (e.clientX - r.left - b.x) / b.w
    const y = (e.clientY - r.top - b.y) / b.h
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    setArea(b)
    onChange({ focus: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } })
  }
  return (
    <li className="group min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-2">
        {picture || clip ? (
          <button ref={frame} type="button" onClick={aim} aria-label={`Set where to look in “${f.name}”`} className="absolute inset-0 block cursor-crosshair">
            {picture ? <img src={f.url} alt="" className="block h-full w-full object-contain" /> : <video src={`${f.url}#t=${(f.trim?.from ?? (f.dur ?? 2) / 2).toFixed(2)}`} muted playsInline preload="metadata" className="block h-full w-full object-contain" />}
            {f.focus && (
              <span aria-hidden className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgb(0_0_0/0.6)]" style={area ? { left: area.x + f.focus.x * area.w, top: area.y + f.focus.y * area.h } : { left: `${f.focus.x * 100}%`, top: `${f.focus.y * 100}%` }} />
            )}
          </button>
        ) : (
          <span className="grid h-full place-items-center px-3 text-center text-caption text-fg-3">{f.name}</span>
        )}
        <IconButton size="sm" label={`Take “${f.name}” out`} onClick={onRemove} className="absolute right-1.5 top-1.5 bg-black/50 text-white opacity-0 backdrop-blur-md group-hover:opacity-100 focus-visible:opacity-100">
          <Trash size={13} />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Select aria-label={`What “${f.name}” is`} value={f.kind ?? "other"} onChange={(e) => onChange({ kind: e.target.value as FileKind })} className="h-7 min-w-0 flex-1 cursor-pointer rounded-md px-1.5 text-caption">
          {FILE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
        {f.focus && (
          <IconButton size="sm" label="Forget where to look" onClick={() => onChange({ focus: undefined })}>
            <Crosshair size={13} />
          </IconButton>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-caption text-fg-3" title={f.shows ?? f.name}>
        {f.shows ?? f.name}
        {f.w ? ` · ${f.w}×${f.h}` : ""}
      </p>
      {clip && f.dur ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-caption text-fg-3">
          <span>Use</span>
          <input type="number" aria-label="From (s)" min={0} max={f.dur} step={0.1} value={f.trim?.from ?? 0} onChange={(e) => onChange({ trim: { from: Number(e.target.value), to: f.trim?.to ?? f.dur! } })} className={`${field} mono h-6 w-14 px-1 text-caption`} />
          <span>to</span>
          <input type="number" aria-label="To (s)" min={0} max={f.dur} step={0.1} value={f.trim?.to ?? Math.round(f.dur * 10) / 10} onChange={(e) => onChange({ trim: { from: f.trim?.from ?? 0, to: Number(e.target.value) } })} className={`${field} mono h-6 w-14 px-1 text-caption`} />
          <span>s</span>
        </div>
      ) : null}
    </li>
  )
}
