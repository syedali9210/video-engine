// The shot library, filled in: every launch film template's shots (shots.ts) with what each one shows, as the template
// probe measured it (npm run templates -- --write keeps src/studio/lib/shows.json up to date).
import { ANIMS } from "../registry"
import SHOWS from "./lib/shows.json"
import { library, slotsOf } from "./shots"
import type { Layer } from "./comp"

export const LIBRARY = library(ANIMS, SHOWS as Record<string, string[]>)
export const shotById = (id: string) => LIBRARY.find((s) => s.id === id)
/** A template's slots, with the shots each shows in. */
export const slotsFor = (anim: string) => {
  const m = ANIMS.find((a) => a.id === anim)
  return m ? slotsOf(m, LIBRARY) : []
}

/** A scene at a new length: a template's shot in it plays its own motion over that length (its film's rate: the shot's
    length ÷ the scene's), so a longer scene slows the camera rather than holding its last frame. */
export function retimed<S extends { duration: number; layers: Layer[] }>(sc: S, to: number): S {
  const d = Math.round(Math.max(0.3, to) * 100) / 100
  return {
    ...sc,
    duration: d,
    layers: sc.layers.map((l) => {
      if (l.kind !== "component" || l.from === undefined) return l
      const shot = LIBRARY.find((x) => x.film === l.anim && Math.abs(x.at - (l.from ?? 0)) < 0.05)
      return shot ? { ...l, rate: Math.round((shot.dur / d) * 1000) / 1000 } : l
    }),
  }
}
