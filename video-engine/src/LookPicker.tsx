// The theme matcher's panel, the same in the Studio and the Canvas: the colour it matches to (what the screen says,
// or one picked), one look per harmony drawn as a tiny frame (ground, light, a device in its case or finish, the
// type), another round of them, and whether the devices go in a case.
import { useMemo, useState } from "react"
import { ArrowsClockwise, Eyedropper, Plus, Prohibit } from "@phosphor-icons/react"
import { Button, Switch } from "./ui"
import { HARMONIES, hex, lch, looksFor, type Look } from "./theme"
import { FINISHES } from "./studio/finishes"
import type { DeviceId } from "./devices"

const canPick = typeof window !== "undefined" && "EyeDropper" in window

/** Case colours that sit well with most grounds; a matched look's own case comes first. */
export const CASES = [
  { c: "#1d1d1f", name: "Black" },
  { c: "#f2efe9", name: "Chalk" },
  { c: "#b9886a", name: "Clay" },
  { c: "#8b9b7c", name: "Sage" },
  { c: "#5a7fa8", name: "Lake" },
  { c: "#6d4a69", name: "Plum" },
  { c: "#e2b347", name: "Sun" },
  { c: "#df6f5b", name: "Coral" },
]
const ring = (on: boolean) => (on ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)]")

/** No case, the case colours (a matched look's first), or any colour. */
export function CaseSwatches({ value, set, extra }: { value?: string; set: (c: string | undefined) => void; extra?: string }) {
  const cases = extra && !CASES.some((x) => x.c === extra) ? [{ c: extra, name: "The look's" }, ...CASES] : CASES
  const custom = !!value && !cases.some((x) => x.c === value)
  return (
    <div role="radiogroup" aria-label="Case" className="flex flex-wrap items-center gap-2">
      <button type="button" role="radio" aria-checked={!value} onClick={() => set(undefined)} className={`press grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-fg-3 ${ring(!value)}`} title="No case">
        <Prohibit size={15} aria-hidden />
        <span className="sr-only">No case</span>
      </button>
      {cases.map((x) => (
        <button key={x.c} type="button" role="radio" aria-checked={value === x.c} title={`${x.name} case`} onClick={() => set(x.c)} className={`press h-7 w-7 rounded-full ${ring(value === x.c)}`} style={{ background: x.c }}>
          <span className="sr-only">{x.name} case</span>
        </button>
      ))}
      <label className={`press relative grid h-7 w-7 cursor-pointer place-items-center rounded-full text-fg-3 hover:text-fg ${custom ? ring(true) : "shadow-[inset_0_0_0_1px_var(--line-strong)]"}`} style={custom ? { background: value } : undefined} title="Another colour">
        {!custom && <Plus size={13} aria-hidden />}
        <input type="color" aria-label="A case in another colour" value={value ?? "#8b9b7c"} onChange={(e) => set(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

/** A tiny frame in a look: its ground and lights, a device in its case (or its finish), a title and a line under it. */
export function LookSwatch({ look, device = "iphone", inCase, on, onPick, label }: { look: Look; device?: DeviceId; inCase: boolean; on?: boolean; onPick?: () => void; label?: string }) {
  const body = inCase ? look.case : (FINISHES[device].find((f) => f.id === look.finish[device]) ?? FINISHES[device][0]).metal
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      title={HARMONIES.find((h) => h.id === look.harmony)?.hint}
      className={`press group relative block w-full overflow-hidden rounded-md text-left ${on ? "shadow-[0_0_0_2px_var(--sel)]" : "shadow-[0_0_0_1px_var(--line)] hover:shadow-[0_0_0_1px_var(--line-strong)]"}`}
    >
      <span
        aria-hidden
        className="relative block aspect-[4/3]"
        style={{ background: `radial-gradient(55% 75% at 66% 42%, ${look.glow} 0%, transparent 72%), radial-gradient(70% 70% at 10% 92%, ${look.haze} 0%, transparent 72%), ${look.ground}` }}
      >
        <span className="absolute left-[12%] top-[34%] text-[11px] font-semibold leading-none tracking-tight" style={{ color: look.ink }}>
          Aa
        </span>
        <span className="absolute left-[12%] top-[56%] h-[3px] w-[30%] rounded-full" style={{ background: look.muted }} />
        <span className="absolute left-[12%] top-[66%] h-[3px] w-[20%] rounded-full" style={{ background: look.muted, opacity: 0.6 }} />
        <span className="absolute right-[16%] top-[14%] h-[72%] w-[25%] rounded-[7px] shadow-[0_6px_10px_-6px_rgb(0_0_0/0.5)]" style={{ background: body }}>
          <span className="absolute inset-[2.5px] rounded-[5px] bg-[#050506]">
            <span className="absolute inset-x-[3px] top-[18%] h-[22%] rounded-[2px]" style={{ background: look.accent, opacity: 0.85 }} />
          </span>
        </span>
      </span>
      <span className="block truncate px-1.5 py-1 text-micro font-medium text-fg-2 group-aria-pressed:text-fg">{label ?? HARMONIES.find((h) => h.id === look.harmony)?.name}</span>
    </button>
  )
}

/** The panel: anchors to match to, a look per harmony, another round, and the case switch. */
export function LookPicker({
  anchors,
  device = "iphone",
  current,
  onApply,
  inCase,
  setInCase,
  hint,
}: {
  /** colours found in what's on screen (its accent first) */
  anchors: string[]
  device?: DeviceId
  /** the look applied last, to mark it */
  current?: { anchor: string; harmony: string; seed: number } | null
  onApply: (look: Look, seed: number) => void
  inCase: boolean
  setInCase: (v: boolean) => void
  hint?: string
}) {
  const found = useMemo(() => [...new Set(anchors.map((a) => hex(lch(a))))].slice(0, 5), [anchors])
  // what the screen offers is read after the first render: until a colour is picked, the anchor follows it
  const [picked, setAnchor] = useState<string | null>(current?.anchor ?? null)
  const anchor = picked ?? found[0] ?? "#5e5ce6"
  const [seed, setSeed] = useState(current?.seed ?? 0)
  const looks = useMemo(() => looksFor(anchor, seed), [anchor, seed])
  const chip = (c: string, label: string) => (
    <button key={c} type="button" onClick={() => setAnchor(c)} aria-pressed={anchor === c} title={label} className={`press h-6 w-6 rounded-full ${anchor === c ? "shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--sel)]" : "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"}`} style={{ background: c }}>
      <span className="sr-only">{label}</span>
    </button>
  )
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-fg-3">Match to</span>
        {found.map((c, i) => chip(c, i === 0 ? `The screen's accent, ${c}` : `From the screen, ${c}`))}
        {!found.includes(anchor) && chip(anchor, `Picked, ${anchor}`)}
        <label className="press relative grid h-6 w-6 cursor-pointer place-items-center rounded-full text-fg-3 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg" title="Another colour">
          <Plus size={12} aria-hidden />
          <input type="color" aria-label="Match to another colour" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        {canPick && (
          <button
            type="button"
            title="Pick a colour off the screen"
            onClick={async () => {
              try {
                const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open()
                setAnchor(r.sRGBHex)
              } catch {
                // cancelled
              }
            }}
            className="press grid h-6 w-6 place-items-center rounded-full text-fg-3 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg"
          >
            <Eyedropper size={12} aria-hidden />
            <span className="sr-only">Pick a colour off the screen</span>
          </button>
        )}
      </div>
      <div role="group" aria-label="Looks" className="mt-2.5 grid grid-cols-3 gap-1.5">
        {looks.map((k) => (
          <LookSwatch key={k.harmony} look={k} device={device} inCase={inCase} on={current?.anchor === anchor && current.harmony === k.harmony && current.seed === seed} onPick={() => onApply(k, seed)} />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setSeed((s) => s + 1)}>
          <ArrowsClockwise size={14} aria-hidden />
          Another round
        </Button>
        <label className="flex items-center gap-2 text-body text-fg-2" htmlFor="look-case">
          In a case
          <Switch id="look-case" on={inCase} onChange={setInCase} />
        </label>
      </div>
      {!found.length && <p className="hint mt-1.5 text-caption text-fg-3">Its screen didn't offer a colour to match (still loading, or all greys): pick one with + or the eyedropper.</p>}
      {hint && <p className="hint mt-1.5 text-caption text-fg-3">{hint}</p>}
    </div>
  )
}
