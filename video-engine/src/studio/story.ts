// The smart engine's planning: a story shape for the product, its beats timed (to the music's beats when there is a
// song), and a shot cast for each beat from the whole library, any template's, with the reason it was picked and the
// next best ones. Casting weighs the beat's role, the energy the story wants there, what the shot needs against what
// the product has (a shot of a screen needs a screen), keeping one look family, carrying each cut (the move a shot
// leaves on into the move the next comes in on), and not using a shot twice. Locked mode keeps one template's own
// shots in its own order (the reference film, only the product changed); remix casts across templates.
// Plain data and no DOM: `npm run check` runs it.
import type { FilmRole, LibShot, LookFamily, ShotMove } from "./shots.ts"

export type Shape = "launch" | "problem-solution" | "before-after" | "day-in-life" | "countdown" | "teaser" | "walkthrough"
type BeatSpec = { role: FilmRole; weight: number; energy: 1 | 2 | 3; what: string }
/** Each story as its beats: what each does, how much of the film it gets, how hard it hits. */
export const SHAPES: Record<Shape, { name: string; hint: string; beats: BeatSpec[] }> = {
  launch: {
    name: "Product launch",
    hint: "The hook, the reveal, what it does, the proof, the name.",
    beats: [
      { role: "hook", weight: 1, energy: 3, what: "Stop the scroll: the change it makes, said fast." },
      { role: "intro", weight: 1, energy: 2, what: "Meet it: the name or the product revealed." },
      { role: "product", weight: 1.4, energy: 2, what: "It, working: the main screen." },
      { role: "feature", weight: 1.2, energy: 2, what: "The strongest feature." },
      { role: "feature", weight: 1.2, energy: 2, what: "The next feature." },
      { role: "proof", weight: 0.9, energy: 3, what: "A real figure, if there is one." },
      { role: "logo", weight: 1, energy: 1, what: "The name, and the call." },
    ],
  },
  "problem-solution": {
    name: "Problem, then the answer",
    hint: "The pain everyone knows, then the product ending it.",
    beats: [
      { role: "hook", weight: 1.2, energy: 2, what: "The problem, the way people feel it." },
      { role: "detail", weight: 1, energy: 1, what: "How it goes wrong today." },
      { role: "intro", weight: 1, energy: 3, what: "The turn: the product arrives." },
      { role: "product", weight: 1.4, energy: 2, what: "The answer, working." },
      { role: "feature", weight: 1.2, energy: 2, what: "What makes it work." },
      { role: "cta", weight: 1, energy: 1, what: "The name, and the call." },
    ],
  },
  "before-after": {
    name: "Before and after",
    hint: "The old way, the new way, side by side.",
    beats: [
      { role: "hook", weight: 1, energy: 2, what: "Before: the old way." },
      { role: "bridge", weight: 0.6, energy: 3, what: "The switch." },
      { role: "product", weight: 1.5, energy: 2, what: "After: the product doing it." },
      { role: "feature", weight: 1.2, energy: 2, what: "What changed." },
      { role: "logo", weight: 1, energy: 1, what: "The name." },
    ],
  },
  "day-in-life": {
    name: "A day with it",
    hint: "Morning to night: where it shows up in someone's day.",
    beats: [
      { role: "intro", weight: 1, energy: 1, what: "Morning: the day starts." },
      { role: "product", weight: 1.2, energy: 2, what: "First use." },
      { role: "feature", weight: 1.2, energy: 2, what: "Midday: it saves time." },
      { role: "feature", weight: 1.2, energy: 2, what: "Afternoon: another moment." },
      { role: "detail", weight: 1, energy: 1, what: "Evening: the small touch." },
      { role: "logo", weight: 1, energy: 1, what: "The name." },
    ],
  },
  countdown: {
    name: "Feature countdown",
    hint: "Three, two, one: the features in a row, fast.",
    beats: [
      { role: "hook", weight: 0.8, energy: 3, what: "What's new, in three." },
      { role: "feature", weight: 1, energy: 3, what: "Three: a feature." },
      { role: "feature", weight: 1, energy: 3, what: "Two: a feature." },
      { role: "feature", weight: 1, energy: 3, what: "One: the best one." },
      { role: "logo", weight: 0.9, energy: 2, what: "The name, and the call." },
    ],
  },
  teaser: {
    name: "Teaser",
    hint: "Short and mysterious: details, never the whole thing, then the name.",
    beats: [
      { role: "hook", weight: 1, energy: 2, what: "A detail that intrigues." },
      { role: "detail", weight: 1, energy: 2, what: "Another glimpse." },
      { role: "logo", weight: 1, energy: 1, what: "The name, and when." },
    ],
  },
  walkthrough: {
    name: "Demo walkthrough",
    hint: "The product in use, step by step, on the real interface.",
    beats: [
      { role: "intro", weight: 1, energy: 2, what: "What it is, in one look." },
      { role: "product", weight: 1.4, energy: 1, what: "Step one." },
      { role: "product", weight: 1.4, energy: 1, what: "Step two." },
      { role: "feature", weight: 1.2, energy: 2, what: "The part that matters." },
      { role: "cta", weight: 1, energy: 1, what: "Try it." },
    ],
  },
}

export type Beat = { role: FilmRole; energy: 1 | 2 | 3; what: string; dur: number }
const r2 = (x: number) => Math.round(x * 100) / 100

/** A story's beats timed to a length. With a song's beats (`grid`, s), each beat ends on one of them. Short films keep
    the beats that matter most (the hook, the product, the name). */
export function planStory(shape: Shape, length: number, grid: number[] = []): Beat[] {
  let specs = SHAPES[shape].beats
  // about 1.6 s a beat at least: a 6 s film can't hold seven
  const most = Math.max(2, Math.floor(length / 1.6))
  if (specs.length > most) {
    const keep = (r: FilmRole) => r === "hook" || r === "logo" || r === "cta" || r === "product"
    specs = [...specs].map((b, i) => ({ b, i })).sort((x, y) => Number(keep(y.b.role)) - Number(keep(x.b.role)) || y.b.weight - x.b.weight).slice(0, most).sort((x, y) => x.i - y.i).map((x) => x.b)
  }
  const total = specs.reduce((a, b) => a + b.weight, 0)
  let at = 0
  return specs.map((b, i) => {
    let end = i === specs.length - 1 ? length : at + (b.weight / total) * length
    // on the music: the nearest beat of the song, keeping every shot at least 0.8 s
    if (grid.length && i < specs.length - 1) {
      const near = grid.filter((g) => g > at + 0.8 && g < length - 0.8).sort((x, y) => Math.abs(x - end) - Math.abs(y - end))[0]
      if (near !== undefined && Math.abs(near - end) < 1) end = near
    }
    // cut on the hundredth, so the lengths add up to the film's exactly
    end = i === specs.length - 1 ? length : r2(end)
    const beat = { role: b.role, energy: b.energy, what: b.what, dur: r2(end - at) }
    at = end
    return beat
  })
}

/** The story for a product when no one says: a teaser for a very short film, a countdown when it's a feature list, a
    walkthrough for a tool shown on its screens, otherwise a launch. */
export function shapeFor(o: { length: number; features: number; screens: number; whatsNew?: string }): Shape {
  if (o.length <= 7) return "teaser"
  if (/feature|update|new in|now with/i.test(o.whatsNew ?? "") && o.features >= 3) return "countdown"
  if (o.screens >= 4 && o.length >= 20) return "walkthrough"
  return "launch"
}

/** The cut a shot's exit and the next one's entrance call for (cuts.ts names). */
export function cutFor(exit: ShotMove, enter: ShotMove): "cut" | "whip" | "zoom" | "push" | "flash" | "dissolve" {
  if (exit === "whip" || enter === "whip") return "whip"
  if (exit === "flash" || enter === "flash") return "flash"
  if ((exit === "push-in" && enter !== "pull-out") || enter === "push-in") return "zoom"
  if (exit === "pan" || enter === "pan") return "push"
  if (exit === "hold" && enter === "rise") return "dissolve"
  return "cut"
}
/** How well one shot's exit hands over to the next one's entrance: 1 carried (the same move continues), 0.5 neutral,
    0 against (a push in met by a pull out). */
export function carry(exit: ShotMove, enter: ShotMove) {
  if (exit === enter && exit !== "cut" && exit !== "hold") return 1
  if ((exit === "push-in" && enter === "pull-out") || (exit === "pull-out" && enter === "push-in")) return 0
  if (exit === "cut" || enter === "cut" || exit === "hold") return 0.5
  return 0.7
}

export type Cast = { beat: Beat; shot: LibShot; why: string; alternatives: LibShot[]; cut: ReturnType<typeof cutFor> }
export type Have = { screens: number; logo: boolean; photos: number; words: boolean; figures: boolean }

/** A shot for every beat, with why, and the next best. `locked`: one template's own shots in order (the one that
    scores best for the story as a whole), its cuts as they are; otherwise any template's. */
export function cast(beats: Beat[], lib: LibShot[], have: Have, o: { size?: LibShot["size"]; look?: LookFamily; locked?: string | true } = {}): Cast[] {
  if (o.locked) {
    const films = o.locked === true ? [...new Set(lib.map((s) => s.film))] : [o.locked]
    const best = films
      .map((f) => {
        const own = lib.filter((s) => s.film === f)
        return { f, own, score: own.reduce((a, s, i) => a + (beats[i] && s.role.includes(beats[i].role) ? 1 : 0), 0) / Math.max(own.length, beats.length) - (o.size && own[0]?.size !== o.size ? 0.5 : 0) }
      })
      .sort((a, b) => b.score - a.score)[0]
    if (!best?.own.length) return []
    // the template as it is: its own shots, its own order, its own lengths
    return best.own.map((shot, i) => ({ beat: { role: shot.role[0], energy: shot.energy, what: shot.name, dur: shot.dur }, shot, why: `${shot.template} as it was cut: shot ${i + 1} of ${best.own.length}.`, alternatives: [], cut: "cut" as const }))
  }
  const out: Cast[] = []
  const used = new Set<string>()
  const families = new Map<LookFamily, number>()
  beats.forEach((asked, i) => {
    // a proof beat with no real figure to show becomes another feature: films only show real numbers
    const beat: Beat = asked.role === "proof" && !have.figures ? { ...asked, role: "feature", what: `${asked.what} (no real figure in the material: a feature instead)` } : asked
    const prev = out[i - 1]?.shot
    const scored = lib
      .filter((s) => !used.has(s.id))
      .map((s) => {
        // why, most telling first: what it is, how it carries the cut, the look it keeps, what it shows, its energy
        const reasons: string[] = []
        const rank = (r: string) => (/^it.s a /.test(r) ? 0 : /picks up/.test(r) ? 1 : /keeps the/.test(r) ? 2 : /shows/.test(r) ? 3 : 4)
        let score = 0
        if (s.role.includes(beat.role)) {
          score += s.role[0] === beat.role ? 4 : 3
          reasons.push(`it's ${/^[aeiou]/.test(beat.role) ? "an" : "a"} ${beat.role} shot`)
        } else if ((beat.role === "cta" && s.role.includes("logo")) || (beat.role === "logo" && s.role.includes("cta")) || (beat.role === "detail" && s.role.includes("feature"))) score += 2
        score -= Math.abs(s.energy - beat.energy) * 0.8
        if (s.energy === beat.energy) reasons.push(`its energy (${s.energy}) is what this beat wants`)
        // what it shows, against what the product has
        const screens = s.shows.filter((k) => !/mark|logo|icon|photo|name|accent/i.test(k)).length
        if (s.shows.some((k) => /screen|page|dashboard/i.test(k)) && have.screens) {
          score += 1
          reasons.push("it shows your screens")
        }
        if (s.shows.some((k) => /mark|logo|icon/i.test(k)) && have.logo) score += 0.5
        if (s.shows.some((k) => /photo/i.test(k)) && !have.photos) score -= 1
        if (s.shows.some((k) => /proof|stats|amount|share/i.test(k)) && !have.figures) score -= 1.5
        void screens
        // it can be retimed to the beat
        if (beat.dur < s.stretch[0] || beat.dur > s.stretch[1]) score -= 1.5
        // one look: the family most of the film is in, and the one asked for
        if (o.look && s.look === o.look) score += 1.2
        const lead = [...families].sort((a, b) => b[1] - a[1])[0]
        if (lead && s.look === lead[0]) {
          score += 0.8
          reasons.push(`it keeps the ${s.look} look`)
        }
        if (o.size && s.size !== o.size) score -= 1
        if (prev) {
          const c = carry(prev.exit, s.enter)
          score += c - 0.5
          if (c === 1) reasons.push(`it picks up the ${prev.exit} the last shot left on`)
          if (prev.film === s.film && prev.at > s.at) score -= 1
        }
        return { s, score, reasons: reasons.sort((a, b) => rank(a) - rank(b)) }
      })
      .sort((a, b) => b.score - a.score)
    const pick = scored[0]
    if (!pick) return
    used.add(pick.s.id)
    families.set(pick.s.look, (families.get(pick.s.look) ?? 0) + 1)
    out.push({ beat, shot: pick.s, why: `From ${pick.s.template}, “${pick.s.name}”: ${pick.reasons.slice(0, 3).join("; ") || "the closest there is"}.`, alternatives: scored.slice(1, 4).map((x) => x.s), cut: prev ? cutFor(prev.exit, pick.s.enter) : "cut" })
  })
  return out
}

/* ---------------- music ---------------- */

/** A song's beats from its onset strength (an envelope sampled every `hop` s): the tempo by autocorrelation (70 to 180
    beats a minute), then the beats laid on the strongest phase of it. Also its loudest hits, for cuts that land on them. */
export function beatsOf(onset: number[], hop: number): { bpm: number; beats: number[]; hits: number[] } {
  if (onset.length < 16) return { bpm: 0, beats: [], hits: [] }
  const mean = onset.reduce((a, b) => a + b, 0) / onset.length
  const x = onset.map((v) => Math.max(0, v - mean))
  let best = { lag: 0, score: -1 }
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = 60 / bpm / hop
    let score = 0
    for (let i = 0; i + lag * 2 < x.length; i++) score += x[i] * (x[Math.round(i + lag)] + 0.5 * x[Math.round(i + lag * 2)])
    if (score > best.score) best = { lag, score }
  }
  // the period and phase together whose comb of beats lands on the most onset (a sample either side counts: an onset
  // is never exactly on the grid), so the beats don't drift over a long song
  let period = best.lag
  let phase = 0
  let strongest = -1
  for (let lag = best.lag - 1; lag <= best.lag + 1; lag += 0.05)
    for (let p = 0; p < lag; p += 0.5) {
      let sum = 0
      for (let t = p; t < x.length; t += lag) {
        const i = Math.round(t)
        sum += Math.max(x[i] ?? 0, 0.5 * (x[i - 1] ?? 0), 0.5 * (x[i + 1] ?? 0))
      }
      if (sum > strongest + 1e-9) {
        strongest = sum
        phase = p
        period = lag
      }
    }
  const beats: number[] = []
  for (let t = phase; t < x.length; t += period) beats.push(r2(t * hop))
  const hits = x
    .map((v, i) => ({ v, t: i * hop }))
    .filter((h, i) => h.v > 0 && h.v >= (x[i - 1] ?? 0) && h.v >= (x[i + 1] ?? 0))
    .sort((a, b) => b.v - a.v)
    .slice(0, 8)
    .map((h) => r2(h.t))
    .sort((a, b) => a - b)
  return { bpm: Math.round((60 / (period * hop)) * 10) / 10, beats, hits }
}

/** Scene lengths with every cut moved onto the nearest beat of the song (`beats`: s, in the film's time), each scene
    kept within what it can be retimed to (`range`). The last scene keeps its length. */
export function snapToBeats(durs: number[], beats: number[], range: (i: number) => [number, number] = () => [0.5, 60]): number[] {
  let at = 0
  return durs.map((d, i) => {
    if (i === durs.length - 1) return d
    const [lo, hi] = range(i)
    const want = at + d
    const near = beats.filter((b) => b - at >= lo && b - at <= hi).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0]
    const end = r2(near ?? want)
    const len = r2(end - at)
    at = end
    return len
  })
}

/** One look over every shot of a film cast from several templates, so it reads as one film: the same grain, the same
    vignette, a grade leaning the way the product's colour leans (warmer for a warm accent, cooler for a cool one). */
export function lookLayer<S extends { fx?: Record<string, unknown> }>(scenes: S[], accent?: string): S[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(accent ?? "")
  let warmth = 0
  if (m) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const h = max === min ? -1 : max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
    const deg = h * 60
    warmth = h < 0 || max - min < 0.15 ? 0 : deg < 70 || deg > 330 ? 0.08 : deg > 170 && deg < 270 ? -0.06 : 0
  }
  return scenes.map((s) => ({ ...s, fx: { ...s.fx, grain: 0.12, vignette: 0.16, grade: { exposure: 0, contrast: 0.05, saturation: 0, warmth } } }))
}
