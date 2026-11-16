// Studio — a matched look (theme.ts) put on a film: the ground and its slowly drifting lights, the light on the
// devices (a dark look gets the keynote's rims), each device's finish (or a case), the titles' ink. The director steps
// aside (one look is one decision), and scenes give up grounds of their own. The anchor comes from what the screen is
// made of: its page is read off screen once (copy.ts) and its accents kept.
import { useEffect, useState } from "react"
import { byId } from "../registry"
import { accentsOf, groundPaints, type Look } from "../theme"
import type { Comp, Layer } from "./comp"
import { describe } from "./copy"

export function applyLookComp(comp: Comp, look: Look, o: { inCase: boolean }): Comp {
  const paint = (l: Layer): Layer => {
    if (l.kind === "device") return { ...l, finish: look.finish[l.device], case: o.inCase ? look.case : undefined }
    if (l.kind === "text") return { ...l, color: l.font === "mono" || l.size < 3.4 ? look.muted : look.ink }
    return l
  }
  return {
    ...comp,
    fill: look.ground,
    paint: groundPaints(look, { x: 0.5, y: 0.42 }),
    light: look.dark ? "dramatic" : "studio",
    auto: false,
    scenes: comp.scenes.map((s) => ({ ...s, look: undefined, layers: s.layers.map(paint) })),
  }
}

const read = new Map<string, Promise<string[]>>()
/** The accents of an animation's screen, read once per animation (it loads off screen for a moment). */
export function useScreenAccents(id: string | undefined) {
  const [v, setV] = useState<string[]>([])
  useEffect(() => {
    const a = id ? byId(id) : undefined
    if (!a) return
    let live = true
    // a heavy page can take a while to load the first time; an empty answer isn't kept, so the next look asks again
    if (!read.has(a.id)) read.set(a.id, describe(a, 14000).then((d) => accentsOf(d.colors, 3)))
    void read.get(a.id)!.then((x) => {
      if (!x.length) read.delete(a.id)
      if (live) setV(x)
    })
    return () => {
      live = false
    }
  }, [id])
  return v
}
