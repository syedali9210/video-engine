// The Artist's art-direction editor: your own directions. Start from one of the six, or drop pictures (references, a
// moodboard, your brand's posts) and it reads a direction off them: light or dark, vivid or calm, how far the hues
// reach, the accent. Then make it yours:
//   - the colour and harmony;
//   - a gradient world for each part of the story;
//   - the faces and weight;
//   - how each kind of title arrives;
//   - the cards, the tempo, how the device arrives.
// A storyboard of the film it makes updates as you change it. Saved on the engine's server, it joins the Artist's
// directions (and the MCP's).
import { useEffect, useMemo, useState } from "react"
import { Check, ImageSquare, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react"
import { SliderField, field } from "../controls"
import { HARMONIES, accentOf, hex, lch } from "../theme"
import { Button, IconButton, Segmented, Select } from "../ui"
import { paletteOf, pictureOf } from "../canvas/runtime"
import { DIRECTIONS, direct, directionFromPalette, validDirection, type ArtDirection, type Brief } from "./artist"
import { StoryStrip } from "./ArtistDialog"
import { FACES } from "./faces"
import { GRADIENTS, gradient, lookFor, type GradientKind } from "./gradients"
import { layersCss } from "./paint"
import { TEXT_ANIMS } from "./textanim"

const ENTRANCES = [
  { id: "words", name: "Words rise" },
  { id: "letters", name: "Letters drop" },
  { id: "mask", name: "Lines from a mask" },
  { id: "settle", name: "Settle from huge" },
  { id: "sweep", name: "Light sweep" },
  { id: "type", name: "Typed" },
  ...TEXT_ANIMS.map((a) => ({ id: a.id, name: a.name })),
]
const PARTS: { id: keyof ArtDirection["grounds"]; name: string }[] = [
  { id: "hook", name: "The hook" },
  { id: "reveal", name: "The reveal" },
  { id: "feature", name: "The features" },
  { id: "interlude", name: "Breaths" },
  { id: "end", name: "The end" },
]

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
    <span className="text-caption text-fg-2">{label}</span>
    <span className="min-w-0">{children}</span>
  </div>
)

export function DirectionEditor({ brief, own, setOwn, onUse }: { brief: Brief; own: ArtDirection[]; setOwn: (list: ArtDirection[]) => void; onUse: (id: string) => void }) {
  const [base, setBase] = useState(DIRECTIONS[0].id)
  const [d, setD] = useState<ArtDirection>(() => validDirection({ ...DIRECTIONS[0], name: "My direction" }, DIRECTIONS[0])!)
  const [pictures, setPictures] = useState<string[]>([])
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (patch: Partial<ArtDirection>) => setD((x) => ({ ...x, ...patch }))
  const start = (id: string) => {
    const b = [...DIRECTIONS, ...own].find((x) => x.id === id)
    if (!b) return
    setBase(id)
    setD(own.some((x) => x.id === id) ? b : validDirection({ ...b, id: undefined, name: `${b.name}, mine`, own: {} }, b)!)
    setPictures([])
  }
  // pictures in: their colours, most covered first, read into a direction
  const take = async (files: File[]) => {
    setBusy("pictures")
    setMsg(null)
    try {
      const pics = await Promise.all(files.slice(0, 6).map((f) => pictureOf(f, 640)))
      const colors = (await Promise.all(pics.map((p) => paletteOf(p.src)))).flat()
      const small = await pictureOf(files[0], 160)
      const read = directionFromPalette(colors, d.name, accentOf(colors), DIRECTIONS.find((x) => x.id === base) ?? DIRECTIONS[0])
      setD({ ...read, id: d.id, own: { from: `${files.length} of your pictures`, picture: small.src } })
      setPictures(pics.map((p) => p.src))
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't read those pictures: ${(e as Error).message}` })
    } finally {
      setBusy("")
    }
  }
  const save = async () => {
    setBusy("save")
    setMsg(null)
    try {
      const r = await fetch("/__lab/directions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: d }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? String(r.status))
      setOwn(j)
      const saved = (j as ArtDirection[]).find((x) => x.name === d.name)
      if (saved) setD(saved)
      setMsg({ ok: true, text: "Saved: it's one of the Artist's directions now." })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const remove = async (id: string) => setOwn(await fetch(`/__lab/directions/${id}/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json()))
  const preview = useMemo(() => direct({ ...brief, directions: [d], style: d.id, seed: 7 }, d), [brief, d])
  const look = lookFor(d.anchor ?? brief.accent, d.harmony, 1)
  const tile = (k: GradientKind) => layersCss(gradient(k, look, { energy: d.energy, spread: d.spread, speed: 0 }), 48, 30)
  useEffect(() => setMsg(null), [d.id])
  return (
    <div className="space-y-4 p-4">
      <section className="space-y-2 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-fg-3">Start from</span>
          <Select aria-label="Start from" value={base} onChange={(e) => start(e.target.value)} className={`${field} h-8 cursor-pointer px-2 text-body`}>
            {DIRECTIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
            {own.length > 0 && (
              <optgroup label="Yours">
                {own.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          <label className="press ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-caption font-medium shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-surface-2">
            <UploadSimple size={14} aria-hidden />
            {busy === "pictures" ? "Reading…" : "From your pictures"}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (e.target.files?.length ? void take([...e.target.files]) : undefined, (e.target.value = ""))} />
          </label>
        </div>
        <p className="text-caption text-fg-3">Drop in references, a moodboard or your brand's posts: it reads light or dark, how vivid, how far the hues reach and the accent, and makes a direction you can tune below.</p>
        {pictures.length > 0 && (
          <ul className="flex gap-1.5">
            {pictures.map((p, i) => (
              <li key={i}>
                <img src={p} alt="" className="h-12 w-16 rounded-md object-cover shadow-[inset_0_0_0_1px_var(--line)]" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Its film" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Its name" value={d.name} onChange={(e) => set({ name: e.target.value })} className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body font-medium`} />
          <span className="text-micro text-fg-3">{preview.shots.length} shots · {preview.shots.reduce((a, s) => a + s.dur, 0).toFixed(1)} s · {d.tempo} bpm</span>
        </div>
        <StoryStrip film={preview} copy={brief.copy} className="mt-2.5" />
        <p className="mt-1.5 text-caption text-fg-3">{d.hint}</p>
      </section>

      <section aria-label="Colour" className="space-y-2">
        <Row label="Colour">
          <span className="flex items-center gap-2">
            <label className="press relative h-7 w-7 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: d.anchor ?? brief.accent }} title="Its own colour">
              <input type="color" aria-label="Its own colour" value={hex(lch(d.anchor ?? brief.accent))} onChange={(e) => set({ anchor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <Button size="sm" variant="ghost" disabled={!d.anchor} onClick={() => set({ anchor: undefined })}>
              {d.anchor ? "Use the product's colour" : "The product's colour"}
            </Button>
          </span>
        </Row>
        <Row label="Harmony">
          <span className="flex flex-wrap gap-1">
            {HARMONIES.map((h) => (
              <button key={h.id} type="button" aria-pressed={d.harmony === h.id} title={h.hint} onClick={() => set({ harmony: h.id })} className={`press h-7 rounded-md px-2.5 text-caption font-medium ${d.harmony === h.id ? "bg-fg text-surface" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface-2"}`}>
                {h.name}
              </button>
            ))}
          </span>
        </Row>
        {PARTS.map((p) => (
          <Row key={p.id} label={p.name}>
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-6 w-10 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(127_127_127/0.25)]" style={{ backgroundImage: tile(d.grounds[p.id]) }} />
              <Select aria-label={`${p.name}'s gradient`} value={d.grounds[p.id]} onChange={(e) => set({ grounds: { ...d.grounds, [p.id]: e.target.value as GradientKind } })} className={`${field} h-8 min-w-0 flex-1 cursor-pointer px-2 text-body`}>
                {GRADIENTS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
        ))}
        <SliderField id="de-en" label="Energy" unit="%" min={0} max={100} step={1} value={Math.round(d.energy * 100)} def={70} set={(v) => set({ energy: v / 100 })} />
        <SliderField id="de-sp" label="Drift" unit="%" min={0} max={200} step={5} value={Math.round(d.speed * 100)} def={100} set={(v) => set({ speed: v / 100 })} />
        <SliderField id="de-hu" label="Hue spread" unit="°" min={0} max={180} step={5} value={d.spread} def={60} set={(v) => set({ spread: v })} />
      </section>

      <section aria-label="Type" className="space-y-2">
        <Row label="Titles in">
          <Select aria-label="The face titles are set in" value={d.faces?.display ?? ""} onChange={(e) => set({ faces: { ...d.faces, display: e.target.value || undefined } })} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
            <option value="">The brand's (or Geist)</option>
            {FACES.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}: {f.hint}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Words in">
          <Select aria-label="The face the smaller words are set in" value={d.faces?.text ?? ""} onChange={(e) => set({ faces: { ...d.faces, text: e.target.value || undefined } })} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
            <option value="">The brand's (or Geist)</option>
            {FACES.filter((f) => f.kind !== "serif").map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Title style">
          <Segmented size="sm" label="Title style" value={d.type.display} onChange={(v) => set({ type: { ...d.type, display: v } })} options={[{ value: "display", label: "Sans, tight" }, { value: "serif", label: "Serif" }]} />
        </Row>
        <SliderField id="de-wt" label="Title weight" unit="" min={300} max={900} step={10} value={d.type.weight} def={650} set={(v) => set({ type: { ...d.type, weight: v } })} />
        <Row label="The name's fill">
          <Segmented size="sm" label="The name's fill" value={d.type.nameFill} onChange={(v) => set({ type: { ...d.type, nameFill: v } })} options={[{ value: "ink", label: "Ink" }, { value: "accent", label: "Accent" }, { value: "chrome", label: "Chrome" }, { value: "spectrum", label: "Spectrum" }]} />
        </Row>
        {(["hook", "name", "feature", "line"] as const).map((role) => (
          <Row key={role} label={{ hook: "Hook arrives", name: "Name arrives", feature: "Features arrive", line: "Lines arrive" }[role]}>
            <Select aria-label={`How the ${role} arrives`} value={d.titles[role]} onChange={(e) => set({ titles: { ...d.titles, [role]: e.target.value } })} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
              {ENTRANCES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Row>
        ))}
      </section>

      <section aria-label="Shape and pace" className="space-y-2">
        <Row label="Cards">
          <Segmented size="sm" label="Cards" value={d.cards} onChange={(v) => set({ cards: v })} options={[{ value: "glass", label: "Glass" }, { value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }]} />
        </Row>
        <SliderField id="de-rd" label="Corners" unit="" min={0} max={4} step={0.1} value={d.radius} def={1.6} set={(v) => set({ radius: v })} />
        <SliderField id="de-tp" label="Tempo" unit=" bpm" min={70} max={150} step={1} value={d.tempo} def={110} set={(v) => set({ tempo: v })} />
        <Row label="Device arrives">
          <Segmented size="sm" label="How the device arrives" value={d.arrive} onChange={(v) => set({ arrive: v })} options={[{ value: "rise", label: "Rises" }, { value: "flip", label: "Flips" }, { value: "spin", label: "Spins" }, { value: "fall", label: "Drops" }, { value: "crane", label: "Crane" }]} />
        </Row>
      </section>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className="flex items-start gap-1.5 text-caption text-fg-2">
          {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
          {msg.text}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button variant="ghost" disabled={!own.some((x) => x.id === d.id)} onClick={() => onUse(d.id)}>
          Direct a film with it
        </Button>
        <Button variant="primary" disabled={busy === "save" || !d.name.trim()} onClick={() => void save()}>
          <Check size={14} aria-hidden />
          {busy === "save" ? "Saving…" : own.some((x) => x.id === d.id) ? "Save changes" : "Save it"}
        </Button>
      </div>

      {own.length > 0 && (
        <section aria-label="Your directions" className="border-t pt-3">
          <h3 className="pb-2 text-caption font-medium text-fg-3">Your directions</h3>
          <ul className="space-y-1.5">
            {own.map((x) => (
              <li key={x.id} className="flex items-center gap-2.5">
                {x.own?.picture ? <img src={x.own.picture} alt="" className="h-8 w-11 rounded object-cover" /> : <ImageSquare size={18} aria-hidden className="text-fg-3" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{x.name}</span>
                  <span className="block truncate text-micro text-fg-3">{x.own?.from ?? "Made in the Artist"}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => start(x.id)}>
                  Edit
                </Button>
                <IconButton size="sm" label={`Delete “${x.name}”`} onClick={() => void remove(x.id)}>
                  <Trash size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
