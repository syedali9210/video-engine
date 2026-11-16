// Studio — the gradient maker: the gradient engine's worlds (gradients.ts) as tiles drawn in the colours they'd use, a
// harmony and a colour to match, and the knobs that shape one (energy, drift, hue spread, another arrangement). It's a
// tool window floating beside the work (FloatingPanel): its preview at the top, the world, the knobs, and its actions
// along the foot; in the panel only a line opens it. Picking a world sets the background to it at once and turning a
// knob re-makes it, so the stage shows every change. It's an ordinary paint stack after that, edited layer by layer.
import { useMemo, useState } from "react"
import { ArrowsClockwise, CaretUpDown, Gradient } from "@phosphor-icons/react"
import { SliderField, field } from "../controls"
import { HARMONIES, hex, lch, type Harmony } from "../theme"
import { Button, Select } from "../ui"
import { FloatingPanel } from "../FloatingPanel"
import { GRADIENTS, gradient, lookFor, type GradientKind } from "./gradients"
import { layersCss, type Paint } from "./paint"

export function GradientMaker({ accent, onMake, idp }: { accent: string; onMake: (paints: Paint[]) => void; idp: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<GradientKind | null>(null)
  const [harmony, setHarmony] = useState<Harmony>("deep")
  const [anchor, setAnchor] = useState(accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#6d5dfc")
  const [energy, setEnergy] = useState(70)
  const [speed, setSpeed] = useState(100)
  const [spread, setSpread] = useState(60)
  const [seed, setSeed] = useState(1)
  const look = useMemo(() => lookFor(anchor, harmony, seed), [anchor, harmony, seed])
  const make = (k: GradientKind, o: Partial<{ energy: number; speed: number; spread: number; seed: number; look: ReturnType<typeof lookFor> }> = {}) =>
    gradient(k, o.look ?? look, { energy: (o.energy ?? energy) / 100, speed: (o.speed ?? speed) / 100, spread: o.spread ?? spread, seed: o.seed ?? seed })
  // a knob turned re-makes the picked world at once
  const apply = (k: GradientKind | null, o: Parameters<typeof make>[1] = {}) => k && onMake(make(k, o))
  const shown = kind ?? "mesh"
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className="press flex h-9 w-full items-center gap-2.5 rounded-lg bg-surface-2 pl-1.5 pr-2.5 text-left transition-colors duration-150 hover:bg-surface-3">
        <span aria-hidden className="h-6 w-6 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(127_127_127/0.25)]" style={{ backgroundImage: layersCss(make(shown, { speed: 0 }), 24, 24) }} />
        <span className="min-w-0 flex-1 truncate text-body">{kind ? GRADIENTS.find((g) => g.id === kind)?.name : "Make a gradient"}</span>
        <Gradient size={15} aria-hidden className="shrink-0 text-fg-3" />
      </button>
      <FloatingPanel
        open={open}
        title="Gradients"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button
              disabled={!kind}
              onClick={() => {
                setSeed((s) => s + 1)
                apply(kind, { seed: seed + 1 })
              }}
            >
              <ArrowsClockwise size={14} aria-hidden />
              Another
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {/* what it makes, as it will look */}
        <div aria-hidden className="aspect-[16/10] w-full rounded-xl shadow-[inset_0_0_0_1px_rgb(127_127_127/0.2)]" style={{ backgroundColor: look.ground, backgroundImage: layersCss(make(shown, { speed: 0 }), 288, 180) }} />
        <div className="flex items-center gap-2">
          <label className="press relative h-8 w-8 shrink-0 cursor-pointer rounded-lg shadow-[inset_0_0_0_1px_rgb(127_127_127/0.3)]" style={{ background: anchor }} title="The colour it's matched to">
            <input
              type="color"
              aria-label="The colour it's matched to"
              value={hex(lch(anchor))}
              onChange={(e) => {
                setAnchor(e.target.value)
                apply(kind, { look: lookFor(e.target.value, harmony, seed) })
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <span className="relative min-w-0 flex-1">
            <Select
              aria-label="Harmony"
              value={harmony}
              onChange={(e) => {
                const h = e.target.value as Harmony
                setHarmony(h)
                apply(kind, { look: lookFor(anchor, h, seed) })
              }}
              className={`${field} h-8 w-full cursor-pointer appearance-none pl-2.5 pr-7 text-body`}
            >
              {HARMONIES.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </span>
        </div>
        <div role="radiogroup" aria-label="Gradient" className="grid grid-cols-5 gap-1.5">
          {GRADIENTS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={kind === g.id}
              title={`${g.name}: ${g.hint}`}
              onClick={() => {
                setKind(g.id)
                apply(g.id)
              }}
              className={`press flex flex-col gap-1 rounded-lg p-1 text-left transition-colors duration-150 ${kind === g.id ? "bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--sel)]" : "hover:bg-surface-2"}`}
            >
              <span aria-hidden className="block aspect-square w-full rounded-md shadow-[inset_0_0_0_1px_rgb(127_127_127/0.25)]" style={{ backgroundImage: layersCss(make(g.id, { speed: 0 }), 48, 48) }} />
              <span className="truncate text-center text-micro text-fg-2">{g.name}</span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <SliderField id={`${idp}-en`} label="Energy" unit="%" min={0} max={100} step={1} value={energy} def={70} set={(v) => (setEnergy(v), apply(kind, { energy: v }))} />
          <SliderField id={`${idp}-sp`} label="Drift" unit="%" min={0} max={200} step={5} value={speed} def={100} set={(v) => (setSpeed(v), apply(kind, { speed: v }))} />
          <SliderField id={`${idp}-hu`} label="Hue spread" unit="°" min={0} max={180} step={5} value={spread} def={60} set={(v) => (setSpread(v), apply(kind, { spread: v }))} />
        </div>
      </FloatingPanel>
    </>
  )
}
