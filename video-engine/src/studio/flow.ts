// Flow films: a launch film with no cuts, every scene becoming the next through a shape they share, the way the
// reference films move (measured into a profile: pace.ts). The prompt box shrinks to a dot, the dot opens into a
// white world and becomes the mark, the name's pill grows into the product's panel; a card becomes the next card; the
// last card becomes the glass pill the closing line wraps around. Words are wiped on and swapped through a blur;
// prompts stream in; the camera pushes in on what matters and the rest goes out of focus; grounds change with the
// morphs (a composed field of the brand's colour, white for the mark, dark for the product).
// This file writes a flow (what each scene is, how long it lasts, what it stands on) from the director's story; the
// renderer draws it frame by frame (src/animations/film-flow). Pure: no DOM.
import type { Beat, Carrier, Meaning, Spine } from "./screenplay.ts"
import type { Composition } from "./field.ts"
import type { Panel } from "./panels.ts"
import type { Profile } from "./pace.ts"
import type { Part } from "./assemble.ts"
import { fit, type Style, type Tone } from "./compose.ts"

/** `image`: a picture of the library's (images.ts), chosen for the product; `ink` the words' colour on it */
/** `motion`: moving graphics over it under words alone (the generator gives text scenes one: backdrop.ts) */
export type Ground = ({ tone: "field"; variant: Composition; grain?: number; finish?: "satin" | "matte" } | { tone: "white" } | { tone: "dark" } | { tone: "light" } | { tone: "image"; src: string; ink?: string; focus?: { x: number; y: number } }) & { motion?: import("./graph.ts").Backdrop }
/** a card the film shows (a post, a message, a result): drawn from its words, or the product's own, captured (`src`,
    `h` its height drawn 900 px wide) */
export type Card = { by?: string; handle?: string; tag?: string; lines: string[]; src?: string; h?: number }
type Base = { dur: number; ground: Ground; meaning?: Meaning }
export type FlowScene = Base &
  (
    | { kind: "words"; text: string; big?: boolean }
    | { kind: "prompt"; lead: string; tail: string; typed: string }
    | { kind: "brand"; name: string; logo?: string }
    | { kind: "panel"; panel: Pick<Panel, "title" | "rows" | "ctas" | "src"> & { surface?: string } }
    /** a component of the product's own, captured whole (its parts marked: public/panel-capture.js), built piece by
        piece (assemble.ts); `w`, `h` its size, `press` the words on the button to press (else its primary one) */
    | { kind: "component"; src: string; w: number; h: number; parts: Part[]; press?: string; radius?: number }
    /** an engine (engines.ts): dither (subject: butterfly, flower, orb, ripple), cartoon (flower, blob, doodles),
        mograph (panels; `words` on its buttons, `images` in its panels), or embed (`slots`: engines in styled frames,
        `layout` full|card|split|grid|pip, `style` glass|flat|device|polaroid) */
    | { kind: "engine"; engine: "dither" | "cartoon" | "mograph" | "embed"; subject?: string; words?: string[]; images?: string[]; layout?: string; style?: string; slots?: { engine: "dither" | "cartoon" | "mograph" | "satin"; subject?: string }[] }
    | { kind: "app"; media: string; icon?: string; focus?: { x: number; y: number }; aspect?: number }
    | { kind: "tour"; media: string; aspect?: number; stops?: { x: number; y: number; z?: number }[]; press?: { x: number; y: number } }
    | { kind: "orbit"; items: string[]; name: string; logo?: string }
    | { kind: "cards"; cards: Card[] }
    | { kind: "stack"; cards: Card[] }
    | { kind: "end"; lead: string; tail: string; swap?: [string, string]; name: string; logo?: string }
  )
export type Pace = Pick<Profile, "move" | "hold" | "morph" | "ease" | "bezier" | "typeCps" | "revealCps"> & { name: string }
/** `tone` and `style`: what the generator (compose.ts) chooses variants and transitions by, and any choice set by hand;
    `motion`: its motion style (styles.ts: soft, kinetic, tour, orbit, cta, or a measured one's) */
export type Flow = { name: string; accent: string; dark?: boolean; pace: Pace; scenes: FlowScene[]; tone?: Tone; style?: Style; motion?: string }

/** The pace measured off the reference film (npm run measure): ~1.4 s moves easing out, ~0.4 s holds, ~0.64 s morphs,
    prompts streaming at ~75 letters a second, lines wiped on at ~40, no cuts. */
export const SOFT_MORPH: Pace = { name: "soft-morph", move: 1.42, hold: 0.4, morph: 0.64, ease: "ease-out", bezier: [0, 0, 0.58, 1], typeCps: 75, revealCps: 40 }

/** where each scene starts (s) */
export const starts = (f: Pick<Flow, "scenes">) => f.scenes.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + f.scenes[i - 1].dur : 0], [])
export const lengthOf = (f: Pick<Flow, "scenes">) => f.scenes.reduce((a, s) => a + s.dur, 0)

/** the least a scene needs at the reference's pace: its transition in and out (one window: half each side), and
    a line read, a prompt typed, a panel built, an app opened in between */
export function minimum(s: FlowScene, p: Pace) {
  const T = Math.min(1.1, Math.max(0.75, p.morph * 1.5))
  const read = (n: number) => Math.max(p.move, 0.3 + n / p.revealCps + 0.8)
  switch (s.kind) {
    case "words":
      return T + read(s.text.length) + (s.big ? 0.75 : 0)
    case "prompt":
      return T + 1.15 + s.typed.length / p.typeCps + 0.7
    case "brand":
      return T + 2.15
    case "panel":
      return T + 5.4
    case "component":
      return T + 2.2 + Math.min(4.5, s.parts.length * 0.09)
    case "engine":
      return T + (s.engine === "mograph" ? 4.2 : s.engine === "embed" ? 3.6 : 3)
    case "app":
      return T + 2.9
    case "cards":
      return T + s.cards.length * 1.5
    case "stack":
      return T + 0.6 + s.cards.length * 0.8
    case "end":
      return T + (s.swap ? 2.8 : 1.5)
    case "tour":
      return T + 1 + (s.stops?.length ?? 3) * 1.25
    case "orbit":
      return T + 3.6
  }
}

/** a flow with every scene long enough to play all of its own animation, hold, and only then leave (compose.ts fit) */
export const fitted = (f: Flow): Flow => fit({ ...f, scenes: f.scenes.map((s) => ({ ...s, dur: Math.round(Math.max(s.dur, minimum(s, f.pace)) * 100) / 100 })) })

/** a line cut in two around its middle word: the closing line wraps around the mark's pill */
export function halves(say: string): [string, string] {
  const w = say.replace(/[.!]$/, "").split(/\s+/).filter(Boolean)
  if (w.length < 2) return [w[0] ?? "", ""]
  const k = Math.ceil(w.length / 2)
  return [w.slice(0, k).join(" "), w.slice(k).join(" ")]
}

/** The flow a story makes: its hooks wiped on over the brand's field (the first thrown in huge), the prompt (when the
    product takes one) typed into a box that opens between the words, the mark on white, each proof as the product
    itself on dark (its panel built, its screen opened from its icon), any cards morphing one into the next, and the
    call wrapped round the mark's pill, swapping to the name. Each scene at least what the pace needs, the whole the
    length asked where it can be. */
export function flowFromSpine(sp: Spine, carriers: Carrier[], o: { name: string; accent: string; dark?: boolean; logo?: string; prompt?: string; cards?: Card[]; length?: number; pace?: Pace; /** a screen's or recording's address, as a slot ("image:…", "video:…"), and its shape */ media?: (c: Carrier) => string; aspect?: (c: Carrier) => number | undefined; tone?: Tone; style?: Style; /** names to orbit the mark (its integrations, partners) */ orbit?: string[]; /** a picture of the library's for the opening (images.ts) */ image?: { src: string; light?: boolean }; /** its motion style (styles.ts) */ motion?: string }): Flow {
  const pace = o.pace ?? SOFT_MORPH
  o = { ...o, prompt: o.prompt ?? sp.prompt }
  const kind = (id: string) => carriers.find((c) => c.id === id)
  const scenes: FlowScene[] = []
  const meaning = (x: Beat, shows: string): Meaning => ({ role: x.role, buys: x.buys, says: x.say, carrier: x.carrier, shows })
  const beats = sp.beats
  const end = beats.at(-1)
  let hooks = 0
  let proofs = 0
  beats.forEach((x, i) => {
    const c = kind(x.carrier)
    const last = i === beats.length - 1
    if (x.role === "hook" || (!c && x.role !== "cta") || (c?.kind === "words" && x.role !== "cta") || c?.kind === "shape") {
      // the opening on the library's picture for the product, when there is one; the rest on its composed field
      const onImage = o.image && hooks === 0 && x.role === "hook"
      const ground: Ground = onImage ? { tone: "image", src: o.image!.src, ink: o.image!.light ? "#111114" : "#ffffff" } : { tone: "field", variant: proofs % 2 ? "mirror" : "diagonal", grain: 0.28 }
      scenes.push({ kind: "words", text: x.say, big: hooks++ === 0 && x.role === "hook", dur: x.seconds, ground, meaning: meaning(x, onImage ? "the line over a picture chosen for the product" : "the line over the brand's field") })
      // the prompt goes in once the pain is said, before the mark
      if (o.prompt && x.role === "hook" && beats[i + 1]?.role !== "hook") scenes.push({ kind: "prompt", lead: "using", tail: o.name, typed: o.prompt, dur: 0, ground: { tone: "field", variant: "diagonal", grain: 0.18 }, meaning: { ...meaning(x, `a prompt typed into ${o.name}: ${o.prompt}`), says: o.prompt } })
    } else if (c?.kind === "logo" && !last) {
      scenes.push({ kind: "brand", name: o.name, logo: o.logo, dur: x.seconds, ground: { tone: "white" }, meaning: meaning(x, "the mark and the name on white, their pill growing into the product") })
      // what it works with, orbiting its mark
      if (o.orbit?.length) scenes.push({ kind: "orbit", items: o.orbit.slice(0, 8), name: o.name, logo: o.logo, dur: 0, ground: { tone: "white" }, meaning: { ...meaning(x, `what ${o.name} works with, orbiting its mark: ${o.orbit.join(", ")}`), buys: `Buys reach: ${o.name} works with what they already use.` } })
    } else if (c?.kind === "panel" && c.panel) {
      proofs++
      // captured with its parts: built piece by piece (assemble.ts); else the unfold of its title, rows and buttons
      if (c.panel.src && c.panel.parts?.length && c.panel.w && c.panel.h) scenes.push({ kind: "component", src: c.panel.src, w: c.panel.w, h: c.panel.h, parts: c.panel.parts, ...(c.panel.ctas[0] ? { press: c.panel.ctas[0] } : {}), dur: x.seconds, ground: { tone: "dark" }, meaning: meaning(x, c.what) })
      else scenes.push({ kind: "panel", panel: { title: c.panel.title, rows: c.panel.rows, ctas: c.panel.ctas, ...(c.panel.src ? { src: c.panel.src } : {}), ...(c.panel.surface ? { surface: c.panel.surface } : {}) }, dur: x.seconds, ground: { tone: "dark" }, meaning: meaning(x, c.what) })
    } else if (c?.kind === "device" && c.file && !c.phone && o.tone !== "calm" && proofs > 0) {
      // a desktop screen after the first: toured, the camera snapping from part to part and going close on what's pressed
      proofs++
      const f = c.focus
      scenes.push({ kind: "tour", media: o.media?.(c) ?? `image:${c.file}`, ...(o.aspect?.(c) ? { aspect: o.aspect(c) } : {}), ...(f ? { stops: [{ x: f.x, y: f.y, z: 2.2 }, { x: Math.min(0.85, f.x + 0.3), y: Math.min(0.85, f.y + 0.15), z: 1.9 }, { x: Math.max(0.15, f.x - 0.2), y: Math.min(0.85, f.y + 0.3), z: 2.1 }] } : {}), dur: x.seconds, ground: { tone: "light" }, meaning: meaning(x, `${c.what}, toured`) })
    } else if ((c?.kind === "device" || c?.kind === "clip") && c.file) {
      proofs++
      scenes.push({ kind: "app", media: o.media?.(c) ?? `${c.kind === "clip" ? "video" : "image"}:${c.file}`, focus: c.focus, ...(o.aspect?.(c) ? { aspect: o.aspect(c) } : {}), dur: x.seconds, ground: { tone: "dark" }, meaning: meaning(x, c.what) })
    } else if (x.role === "cta" && !last) {
      // the call: the line round the mark's pill, swapping to “using <name>” when the last beat is the mark
      const [lead, tail] = halves(x.say)
      scenes.push({ kind: "end", lead, tail, ...(end?.carrier === "logo" ? { swap: ["using", o.name] as [string, string] } : {}), name: o.name, logo: o.logo, dur: x.seconds + (end?.carrier === "logo" ? end.seconds : 0), ground: { tone: "field", variant: "diagonal", grain: 0.22 }, meaning: meaning(x, "the call wrapped round the mark's pill, then the name") })
    } else if (last && !scenes.some((s) => s.kind === "end")) {
      scenes.push({ kind: "end", lead: "using", tail: o.name, name: o.name, logo: o.logo, dur: x.seconds, ground: { tone: "field", variant: "diagonal", grain: 0.22 }, meaning: meaning(x, "the name beside the mark's pill") })
    }
  })
  // cards (posts, messages: the product's results) go before the call, morphing one into the next
  if (o.cards?.length) {
    const at = Math.max(0, scenes.findIndex((s) => s.kind === "end"))
    const [first, ...rest] = o.cards
    scenes.splice(at, 0, { kind: "cards", cards: [first, ...rest.slice(0, 1)], dur: 0, ground: { tone: "dark" } }, ...(rest.length > 1 ? [{ kind: "stack" as const, cards: rest.slice(1, 6), dur: 0, ground: { tone: "field" as const, variant: "horizon" as const } }] : []))
  }
  // each at least what it needs; then the length asked, shared out in proportion where there's room
  for (const s of scenes) s.dur = Math.max(s.dur, minimum(s, pace))
  const want = o.length ?? lengthOf({ scenes })
  const total = lengthOf({ scenes })
  if (want > total) for (const s of scenes) s.dur += ((want - total) * s.dur) / total
  else if (want < total) {
    const room = scenes.reduce((a, s) => a + Math.max(0, s.dur - minimum(s, pace)), 0)
    const cut = Math.min(room, total - want)
    if (room > 0) for (const s of scenes) s.dur -= (Math.max(0, s.dur - minimum(s, pace)) * cut) / room
  }
  for (const s of scenes) s.dur = Math.round(s.dur * 100) / 100
  // then each long enough to play all of itself in its motion style, hold, and only then leave
  return fit({ name: o.name, accent: o.accent, dark: o.dark, pace, scenes, ...(o.tone ? { tone: o.tone } : {}), ...(o.style ? { style: o.style } : {}), ...(o.motion ? { motion: o.motion } : {}) })
}
