// The planner: a film made for the product from the whole library. Pick the story (or let the product's kit say), the
// length, and whether to stay with one template as it was cut (locked) or cast across all of them (remix). Every beat
// gets a shot with the reason it was picked; any can be swapped for the next best. Then it opens as one film, one look
// laid over all of it, the product's words and screens in every shot.
import { useMemo, useState } from "react"
import { ArrowSquareOut, MagicWand } from "@phosphor-icons/react"
import { field } from "./controls"
import { Button, Segmented, Select } from "./ui"
import { Glyph } from "./Thinking"
import { LIBRARY } from "./studio/library"
import { LOOKS, type LibShot, type LookFamily } from "./studio/shots"
import { SHAPES, cast, cutFor, planStory, shapeFor, type Cast, type Shape } from "./studio/story"
import type { ProductKit } from "./studio/product"
import type { TemplateScript } from "./studio/script"

const LENGTHS = [6, 15, 30, 45]

/** The plan as a film script: one clip shot a beat, its cut, its reason. */
export function planScript(kit: ProductKit, shape: Shape, plan: Cast[], size: LibShot["size"]): TemplateScript {
  return {
    id: `plan-${kit.id}-${shape}`,
    name: `${kit.words.name || kit.name}: ${SHAPES[shape].name}`,
    version: 1,
    source: "the planner",
    category: shape === "teaser" ? "teaser" : shape === "walkthrough" ? "product-demo" : "product-launch",
    summary: SHAPES[shape].hint,
    size,
    ground: "black",
    why: [],
    avoid: [],
    shots: plan.map((c, i) => ({ name: c.shot.name, dur: c.beat.dur, ...(i ? { cut: c.cut } : {}), why: c.why, clip: c.shot.id, role: c.beat.role })),
  }
}

export function Planner({ kit, onOpen }: { kit: ProductKit; onOpen: (script: TemplateScript) => Promise<void> }) {
  const screens = kit.files.filter((f) => f.kind === "phone" || f.kind === "desktop" || f.kind === "tablet" || f.kind === "clip").length
  const auto = shapeFor({ length: 15, features: kit.words.features.length, screens, whatsNew: kit.understanding?.whatsNew })
  const [shape, setShape] = useState<Shape | "auto">("auto")
  const [length, setLength] = useState(15)
  const [mode, setMode] = useState<"remix" | "locked">("remix")
  const [look, setLook] = useState<LookFamily | "any">("any")
  const [size, setSize] = useState<LibShot["size"]>("16x9")
  const [plan, setPlan] = useState<Cast[] | null>(null)
  const [busy, setBusy] = useState(false)
  const story: Shape = shape === "auto" ? shapeFor({ length, features: kit.words.features.length, screens, whatsNew: kit.understanding?.whatsNew }) : shape
  const have = useMemo(() => ({ screens, logo: kit.files.some((f) => f.kind === "logo"), photos: kit.files.filter((f) => f.kind === "photo").length, words: !!kit.words.tagline, figures: !!(kit.words.proof || kit.understanding?.proof.length) }), [kit, screens])
  const make = () => setPlan(cast(planStory(story, length), LIBRARY, have, { size, look: look === "any" ? undefined : look, locked: mode === "locked" ? true : undefined }))
  // a beat's shot swapped for one of the next best; the cuts on either side follow
  const swap = (i: number, id: string) =>
    setPlan((p) => {
      if (!p) return p
      const shot = LIBRARY.find((s) => s.id === id)
      if (!shot) return p
      const next = p.map((c, j) => (j === i ? { ...c, shot, alternatives: [c.shot, ...c.alternatives.filter((a) => a.id !== id)], why: `${shot.template}, “${shot.name}”: your pick.` } : c))
      return next.map((c, j) => (j ? { ...c, cut: cutFor(next[j - 1].shot.exit, c.shot.enter) } : c))
    })
  return (
    <div className="rounded-xl p-5 shadow-[0_0_0_1px_var(--line)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[560px]">
          <h3 className="flex items-center gap-2 text-body font-semibold">
            <MagicWand size={16} aria-hidden /> Plan a film for {kit.words.name || kit.name}
          </h3>
          <p className="mt-0.5 text-caption text-fg-3">A story, its beats, and the best shot for each from all twelve templates, each with why. Locked keeps one template as it was cut.</p>
        </div>
        <Button variant="primary" disabled={busy} onClick={make}>
          {plan ? "Plan again" : "Plan it"}
        </Button>
      </div>
      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="block pb-1 text-caption text-fg-3">Story</span>
          <Select aria-label="Story" value={shape} onChange={(e) => setShape(e.target.value as Shape | "auto")} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
            <option value="auto">Auto ({SHAPES[shape === "auto" ? story : auto].name})</option>
            {(Object.keys(SHAPES) as Shape[]).map((k) => (
              <option key={k} value={k}>
                {SHAPES[k].name}
              </option>
            ))}
          </Select>
        </label>
        <div>
          <span className="block pb-1 text-caption text-fg-3" id="plan-len">
            Length
          </span>
          <Segmented size="sm" labelledBy="plan-len" value={length} onChange={setLength} options={LENGTHS.map((n) => ({ value: n, label: `${n} s` }))} />
        </div>
        <div>
          <span className="block pb-1 text-caption text-fg-3" id="plan-mode">
            Shots
          </span>
          <Segmented size="sm" labelledBy="plan-mode" value={mode} onChange={setMode} options={[{ value: "remix", label: "Remix" }, { value: "locked", label: "Locked" }]} />
        </div>
        <div className="flex gap-2">
          <label className="block min-w-0 flex-1">
            <span className="block pb-1 text-caption text-fg-3">Look</span>
            <Select aria-label="Look" value={look} onChange={(e) => setLook(e.target.value as LookFamily | "any")} className={`${field} h-8 w-full cursor-pointer px-2 text-body capitalize`}>
              <option value="any">Any</option>
              {LOOKS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="block w-24">
            <span className="block pb-1 text-caption text-fg-3">Frame</span>
            <Select aria-label="Frame" value={size} onChange={(e) => setSize(e.target.value as LibShot["size"])} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
              <option value="16x9">16:9</option>
              <option value="1x1">1:1</option>
              <option value="9x16">9:16</option>
            </Select>
          </label>
        </div>
      </div>
      {plan && (
        <div className="rise-in mt-5">
          <ol className="space-y-2">
            {plan.map((c, i) => (
              <li key={i} className="grid grid-cols-[120px_1fr] gap-3 rounded-lg bg-surface-2/60 p-2 sm:grid-cols-[160px_1fr_200px]">
                <img src={`/__templates/still/${c.shot.film}/${c.shot.id.split("/")[1]}.png`} alt="" loading="lazy" className="aspect-video w-full rounded-md bg-black object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                <div className="min-w-0 text-caption">
                  <p className="text-body font-medium">
                    {i + 1}. {c.beat.role} <span className="font-normal text-fg-3">· {c.beat.dur.toFixed(1)} s{i ? ` · comes in on a ${c.cut}` : ""}</span>
                  </p>
                  <p className="text-fg-3">{c.beat.what}</p>
                  <p className="mt-1 text-fg-2">{c.why}</p>
                </div>
                {c.alternatives.length > 0 && (
                  <Select aria-label={`Another shot for beat ${i + 1}`} value={c.shot.id} onChange={(e) => swap(i, e.target.value)} className={`${field} col-span-2 h-8 w-full cursor-pointer self-start px-2 text-caption sm:col-span-1`}>
                    {[c.shot, ...c.alternatives].map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.template}: {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-fg-3">
              {plan.length} shots from {new Set(plan.map((c) => c.shot.film)).size} {new Set(plan.map((c) => c.shot.film)).size === 1 ? "template" : "templates"}, {plan.reduce((a, c) => a + c.beat.dur, 0).toFixed(1)} s. One look goes over all of it.
            </p>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void onOpen(planScript(kit, story, plan, size)).finally(() => setBusy(false))
              }}
            >
              {busy ? <><Glyph variant="breathe" size={14} /> Writing its lines…</> : <><ArrowSquareOut size={14} aria-hidden /> Open the film</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
