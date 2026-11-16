// Studio — new scenes: shots that continue the film from the scene picked, by the rules (guidelines §12, no AI: the
// film's own framings, ground, effects, pace and easing) or by Gemini (held to the same rules, checked the same way).
// Adding one moves on to it, so the next ideas continue from there: a film grows a shot at a time.
import { Glyph } from "../Thinking"
import { useEffect, useMemo, useState } from "react"
import { FilmSlate, Lightbulb, X } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, Dialog, IconButton, Select } from "../ui"
import type { Comp } from "./comp"
import { kStyle } from "./Layers"
import { lastShot, nextShots, toScript, type ScriptShot, type ShotIdea } from "./script"
import { artistShots } from "./artist"
import { planCut } from "./cuts"
import type { Copy } from "./copy"
import { PaintBrush } from "@phosphor-icons/react"

/** A shot in a few words: how long, how close, how the camera moves, what's in it. */
function gist(sh: ScriptShot) {
  const out = [`${sh.dur.toFixed(1)} s`]
  const d = sh.device
  if (d) {
    const z = Math.max(d.from.zoom ?? 1, d.to?.zoom ?? 0)
    out.push(z >= 1.8 ? "close" : z <= 1.25 ? "wide" : "mid")
    out.push(!d.to ? (d.move ?? "still") : d.to.rise !== undefined || d.to.pan !== undefined ? "glide" : d.to.yaw !== undefined ? "turn" : "push")
  }
  for (const l of sh.layers ?? []) out.push(l.kind === "text" ? "title" : l.kind)
  return out.join(" · ")
}

export function SceneIdeas({ open, onClose, comp, picked, gemini, onAdd, copy }: { open: boolean; onClose: () => void; comp: Comp; picked: number; gemini: boolean; onAdd: (shot: ScriptShot, at: number) => void; /** the product's words, for the Artist's pieces that cut them up */ copy?: Copy | null }) {
  const film = useMemo(() => toScript(comp, { id: "film", name: comp.brand?.name || "This film" }), [comp])
  // after the scene picked; on the ending, before it
  const [after, setAfter] = useState(0)
  useEffect(() => {
    if (open) setAfter(Math.min(picked, lastShot(film)))
  }, [open, picked]) // eslint-disable-line react-hooks/exhaustive-deps
  const from = Math.min(after, film.shots.length - 1)
  const rules = useMemo(() => (open ? nextShots(film, from) : []), [open, film, from])
  const [ai, setAi] = useState<{ after: number; ideas: ShotIdea[] } | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const ask = async () => {
    setBusy(true)
    setError("")
    try {
      const r = await fetch("/__lab/scenes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ script: film, after: from, count: 3, note }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
      setAi({ after: from, ideas: j.ideas ?? [] })
      if (!j.ideas?.length) setError("Gemini's ideas didn't pass the checker this time. Ask again.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  // the Artist's set pieces on the film's own colour (and its art direction, if the Artist made it): scenes that aren't
  // another angle, each coming in on the cut that carries it
  const pieces = useMemo((): ShotIdea[] => {
    if (!open) return []
    const words: Copy = copy ?? { kicker: "Introducing", hook: comp.brand?.name ?? "Meet it", name: comp.brand?.name ?? "{name}", tagline: "{tagline}", features: [], split: "", proof: "", cta: "Try it", by: "rules" }
    return artistShots({ accent: comp.brand?.accent ?? "#6d5dfc", copy: words, style: comp.artist?.style, size: comp.size, seed: from + 1 }).map(({ shot }) => {
      const before = film.shots[from]
      return { shot: before ? { ...shot, cut: planCut(before, shot, film).cut } : shot, at: from + 1, rule: "artist", by: "rules" as const }
    })
  }, [open, film, from, copy, comp.brand, comp.artist, comp.size])
  const ideas = [...(ai?.after === from ? ai.ideas : []), ...pieces, ...rules]
  const place = (at: number) => (at >= film.shots.length ? "at the end" : `before ${at + 1}. ${film.shots[at].name}`)

  return (
    <Dialog open={open} onClose={onClose} label="New scenes" className="modal">
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between border-b py-3 pl-5 pr-3">
          <div>
            <h2 className="text-ui font-semibold">New scenes</h2>
            <p className="text-caption text-fg-3">The Artist's set pieces on the film's colour, and shots made from the film's own, by its rules. Adding one moves on to it.</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <label htmlFor="ideas-after" className="shrink-0 text-body text-fg-2">
            Continue from
          </label>
          <Select id="ideas-after" value={from} onChange={(e) => setAfter(Number(e.target.value))} className={`${field} h-8 min-w-0 flex-1 cursor-pointer px-2 text-body`}>
            {film.shots.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}. {s.name}
              </option>
            ))}
          </Select>
        </div>
        <ul className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {!ideas.length && <li className="px-1 py-6 text-center text-caption text-fg-3">Nothing more by the rules from here: the film shows every part and ends on its name. Ask Gemini, or continue from another scene.</li>}
          {ideas.map((idea, i) => (
            <li key={`${idea.by}-${i}-${idea.shot.name}`} className="flex items-start gap-3 rounded-lg p-3 shadow-[inset_0_0_0_1px_var(--line)]">
              <span aria-hidden className="k-tint k-ink mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md" style={kStyle(idea.by === "ai" ? "motion" : "scene")}>
                {idea.by === "ai" ? <Lightbulb size={15} /> : idea.rule === "artist" ? <PaintBrush size={15} /> : <FilmSlate size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-body font-medium">
                  {idea.shot.name}
                  <span className="text-micro font-normal text-fg-3">
                    {idea.by === "ai" ? `Gemini · §${idea.rule}` : idea.rule === "artist" ? "The Artist" : `Rules · §${idea.rule}`}
                  </span>
                </p>
                <p className="mt-0.5 text-caption text-fg-2">{idea.shot.why}</p>
                <p className="mt-1 text-micro tabular-nums text-fg-3">
                  {gist(idea.shot)} · goes {place(idea.at)}
                </p>
              </div>
              <Button size="sm" onClick={() => onAdd(idea.shot, idea.at)}>
                Add
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t px-5 py-3">
          {gemini ? (
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it should show (optional)" aria-label="What the new scenes should show" className={`${field} h-8 min-w-0 flex-1 px-2.5 text-body`} />
              <Button variant="primary" disabled={busy} onClick={() => void ask()}>
                <Lightbulb size={15} aria-hidden />
                {busy ? <><Glyph variant="scan" size={14} /> Thinking…</> : "Ask Gemini"}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-fg-3">{import.meta.env.DEV ? "Add a Gemini key in the Template lab's Settings for ideas from the AI too." : "Ideas from the AI come when the engine runs on your own machine."}</p>
          )}
          {error && (
            <p role="alert" className="text-caption text-fg-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
