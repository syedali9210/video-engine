// The director: a launch film from a story, not from a template's slots. Its rules are motionmaxxing's (Tejas
// Makwana's skill, vendored in public/motionmaxxing, Apache-2.0; measured on 53 frame-accurate professional films):
// every beat buys one belief, in four roles: the hook (a concrete promise or pain, in the audience's words), the turn
// (the product arrives, as its own liquid mark), the proofs (about half the film: a claim in type, a hard cut, the
// product performing it), the cta (the call, then the mark resolving: at most a quarter of the film, held at most
// 1.4 s). One AI call writes the spine; code holds it to the rules and builds one film in one world: a shader field
// under every shot (exports seek every video to the film's clock, so it flows through the cuts), the mark crashing in
// from oversize at the turn and the end (the same object twice), shapes only where a beat means what they mean, cuts
// hard and on motion, nothing fading, no page chrome. Every shot keeps its meaning (what it buys, says and shows), for
// the cross-checker (crosscheck.ts) and for whoever edits it next. Pure: the server (server/maker.ts) asks and renders.
import type { Brief } from "./maker.ts"
import type { ArtDirection } from "./artist.ts"
import type { ScriptLayer, ScriptShot, TemplateScript } from "./script.ts"
import type { TextEnter } from "./comp.ts"
import { TEXT_ANIMS } from "./textanim.ts"

export type Role = "hook" | "turn" | "proof" | "cta"
export const ROLES: Role[] = ["hook", "turn", "proof", "cta"]
/** what a beat is carried by: the line alone on the world, the liquid mark, a screen on a device, a recording, a shape */
/** `focus`: where to look on a screen (the reader's), what the camera magnifies */
export type Carrier = { id: string; kind: "words" | "logo" | "device" | "clip" | "shape"; what: string; file?: string; seconds?: number; phone?: boolean; focus?: { x: number; y: number } }
/** `buys`: the one belief the beat leaves the viewer with (“Buys trust: the viewer watches the machine do it”) */
export type Beat = { role: Role; buys: string; say: string; sub?: string; carrier: string; seconds: number }
export type Spine = { promise: string; throughline: string; signature: string; beats: Beat[] }
/** what a shot of the film is for: its role, the belief it buys, the words on it, what carries it and what it shows */
export type Meaning = { role: Role; buys: string; says: string; carrier: string; shows: string }

/** The shapes the generator makes (server/generate.ts), each standing for one idea: a shape is cast only where a beat
    means what it means. */
export const METAPHORS: { id: string; form: "slabs" | "discs" | "tiles" | "pills" | "orb" | "ring"; means: string }[] = [
  { id: "shape:formats", form: "slabs", means: "one thing fanning out into many: formats, sizes, versions" },
  { id: "shape:layers", form: "discs", means: "see-through layers stacked into one picture: a scene built layer by layer" },
  { id: "shape:outputs", form: "tiles", means: "many finished pieces at once: a set of outputs, a bento" },
  { id: "shape:steps", form: "pills", means: "steps landing in order on one stack: a flow, a pipeline" },
  { id: "shape:core", form: "orb", means: "one source at the centre that everything comes from: the engine, the brand" },
  { id: "shape:loop", form: "ring", means: "a loop that keeps itself current: sync, always up to date" },
]

/** What the writer is asked to return: kept small (a schema with many fields gets every one filled, and runs out of
    room). */
export const SPINE_SCHEMA = {
  name: "spine",
  schema: {
    type: "object",
    properties: {
      promise: { type: "string", description: "What the product changes for its audience, one short line." },
      throughline: { type: "string", description: "A word or short phrase the film opens on and closes on." },
      signature: { type: "string", description: "The one visual idea only this product could own, in a sentence." },
      beats: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ROLES },
            buys: { type: "string", description: "Buys ___: the viewer ___. One belief, no “and”." },
            say: { type: "string", description: "The words on screen, at most 7." },
            sub: { type: "string", description: "A smaller line, at most 10 words; empty if none." },
            carrier: { type: "string", description: "One of the carrier ids given." },
            seconds: { type: "number" },
          },
          required: ["role", "buys", "say", "carrier", "seconds"],
        },
      },
    },
    required: ["promise", "throughline", "signature", "beats"],
  },
}

/** The one request that writes the film: the brief, what can carry each beat, the shape of the story and its rules. */
export function spineRequest(b: Brief, carriers: Carrier[], o: { length: number; tone: string; notes?: string }) {
  const brief = { product: b.product, kind: b.kind, oneLiner: b.oneLiner, audience: b.audience, problem: b.problem, oldWay: b.oldWay, promise: b.promise, features: b.features.map((f) => `${f.name}: ${f.benefit}`), proof: b.proof, usp: b.usp, tone: b.tone, cta: b.cta, never_say: b.banned }
  const L = o.length
  const rules = [
    `A ${L} s launch film. Every beat buys one belief: write it as “Buys ___: the viewer ___” before its words; a beat that buys nothing is cut.`,
    `hook (about ${Math.round(L * 0.15)} s, one or two beats, carried by words): a concrete pain or promise in the audience's own words; the product not named yet.`,
    `turn (about ${Math.round(L * 0.15)} s, one beat carried by logo): say is the product's name, sub what it is in at most 8 words.`,
    `proof (about half the film, two or three beats of ${Math.round(L * 0.15)} to ${Math.round(L * 0.2)} s): say is the claim as an action, a verb first (“Drop in your screens.”); the film shows it, then cuts to the product performing exactly that, so carry it on the recording or screen that shows that action and its result (prefer recordings: they show the product working). sub is the result. Use each recording or screen once. A shape carries a proof only where the claim means what the shape means.`,
    `cta (at most a quarter of the film): one beat in words, the call in 2 to 5 words starting with a verb (“Start your film.”), about 3 s; then the last beat carried by logo: say is the product's name and nothing else (no address, no button).`,
    "Never: “Meet X”, “Not just X, it's Y”, “Unlock”, “the future of”, three one-word sentences in a row, hype words, another company's name, a number or claim the brief doesn't have.",
    "say: at most 7 words; sub: at most 10 words or empty. The seconds add up to the length.",
  ]
  return {
    schema: SPINE_SCHEMA,
    messages: [
      { role: "system" as const, content: `You direct a product's launch film as a motion designer would: the idea only this brand could own, then its beats and every word on screen. ${rules.join(" ")} Tone: ${o.tone}. JSON only.` },
      { role: "user" as const, content: `The product: ${JSON.stringify(brief)}\n\nWhat can carry a beat (use the ids):\n${carriers.map((c) => `- ${c.id}: ${c.what}${c.seconds ? ` (${c.seconds.toFixed(1)} s)` : ""}`).join("\n")}${o.notes ? `\n\nNotes from the person making it: ${o.notes}` : ""}` },
    ],
  }
}

const words = (s: string, n: number) => s.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ")
/** A line kept whole while it's at most `n` words; longer, cut where it breaks (a full stop, a comma, a dash) inside
    them, else at `n` words without a dangling “to” or “the”: a sentence cut mid-phrase reads worse than a long one. */
export function tidy(s: string, n: number) {
  const w = s.trim().split(/\s+/).filter(Boolean)
  if (w.length <= n) return w.join(" ")
  const head = w.slice(0, n).join(" ")
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf(", "), head.lastIndexOf(" — "), head.lastIndexOf(": "))
  if (stop > head.length * 0.4) return head.slice(0, stop + 1).replace(/[,:—]$/, "").trim()
  const cut = w.slice(0, n)
  while (cut.length > 3 && /^(to|the|a|an|and|or|of|for|with|too|in|on|at|by|your|their|is|are)$/i.test(cut.at(-1)!.replace(/\W/g, ""))) cut.pop()
  return cut.join(" ")
}
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "")
/** the roles the writer may still answer with from before (show, payoff) */
const roleOf = (x: unknown): Role => (ROLES.includes(x as Role) ? (x as Role) : x === "show" ? "proof" : x === "payoff" ? "cta" : "proof")

/** The spine as the rules want it, whatever came back: carriers that exist (a device or clip used once), lines cut to
    their length, a belief on every beat, the mark at the turn and at the end (its name alone there), the end at most a
    quarter of the film, the whole the length asked. */
export function fixSpine(raw: unknown, carriers: Carrier[], b: Brief, length: number): Spine {
  const r = (raw ?? {}) as Partial<Spine> & { beats?: (Partial<Beat> & { act?: string })[] }
  const known = new Map(carriers.map((c) => [c.id, c]))
  const used = new Set<string>()
  let beats: Beat[] = (Array.isArray(r.beats) ? r.beats : []).flatMap((x): Beat[] => {
    const role = roleOf(x?.role ?? (x as { act?: string } | undefined)?.act)
    let carrier = clean(x?.carrier)
    const c = known.get(carrier)
    if (!c || ((c.kind === "device" || c.kind === "clip") && used.has(carrier))) carrier = role === "turn" ? "logo" : "words"
    used.add(carrier)
    const say = tidy(clean(x?.say), 9)
    if (!say && carrier !== "logo") return []
    return [{ role, buys: clean(x?.buys).slice(0, 160), say, sub: tidy(clean(x?.sub), 12) || undefined, carrier, seconds: Math.max(1.6, Math.min(7, Number(x?.seconds) || 3)) }]
  })
  // the product performs the proofs: while fewer than two proofs show it, a proof on words or a shape moves to the
  // unused recording or screen that shares the most words with its claim (recordings first: they show it working)
  const shows = (b: Beat) => ["device", "clip"].includes(known.get(b.carrier)?.kind ?? "")
  const wordsOf = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  for (const x of beats.filter((b) => b.role === "proof" && !shows(b))) {
    if (beats.filter((b) => b.role === "proof" && shows(b)).length >= 2) break
    const said = wordsOf(`${x.say} ${x.sub ?? ""}`)
    const free = carriers.filter((c) => (c.kind === "clip" || c.kind === "device") && !used.has(c.id))
    const best = free.map((c) => ({ c, n: [...wordsOf(c.what)].filter((w) => said.has(w)).length + (c.kind === "clip" ? 0.5 : 0) })).sort((a, b) => b.n - a.n)[0]
    if (!best) break
    x.carrier = best.c.id
    used.add(best.c.id)
  }
  // the mark arrives with the product (the turn) and closes the film: the same object twice
  if (!beats.some((x) => x.role === "turn" && x.carrier === "logo")) {
    const i = beats.findIndex((x) => x.role !== "hook")
    beats.splice(i < 0 ? beats.length : i, 0, { role: "turn", buys: `Buys the answer: the viewer learns its name is ${b.product}.`, say: b.product, sub: words(b.promise || b.oneLiner, 8) || undefined, carrier: "logo", seconds: 3.5 })
  }
  if (beats.at(-1)?.carrier !== "logo") beats.push({ role: "cta", buys: `Buys the close: ${b.product} is where it ends.`, say: b.product, carrier: "logo", seconds: 2.2 })
  // only the two marks: one more is a logo too many
  let marks = 0
  beats = beats.filter((x, i) => x.carrier !== "logo" || (x.role === "turn" && !marks++) || i === beats.length - 1)
  // the end card: the name alone, the mark arriving and resolving (gate G3: held at most 1.4 s)
  const end = beats.at(-1)!
  beats[beats.length - 1] = { ...end, role: "cta", say: b.product, sub: undefined, seconds: 2.2 }
  // the call in words: about 3 s (its time goes to the proofs)
  for (const x of beats.slice(0, -1)) if (x.role === "cta" && x.carrier === "words") x.seconds = Math.min(x.seconds, 3)
  const rest = beats.slice(0, -1).reduce((a, x) => a + x.seconds, 0)
  beats = beats.map((x, i) => (i === beats.length - 1 ? x : { ...x, seconds: (x.seconds * (length - 2.2)) / rest }))
  beats = beats.map((x) => ({ ...x, buys: x.buys || `Buys ${x.role === "proof" ? "trust" : x.role === "hook" ? "attention" : "the answer"}: the viewer ${x.role === "proof" ? "sees it done" : "reads it"}.` }))
  return { promise: words(clean(r.promise), 14) || b.promise, throughline: words(clean(r.throughline), 4), signature: clean(r.signature).slice(0, 200), beats }
}

/** How much of the film shows the product working (devices and recordings), 0–1. */
export const productShare = (s: Spine, carriers: Carrier[]) => {
  const kind = (id: string) => carriers.find((c) => c.id === id)?.kind
  const total = s.beats.reduce((a, x) => a + x.seconds, 0) || 1
  return s.beats.filter((x) => kind(x.carrier) === "device" || kind(x.carrier) === "clip").reduce((a, x) => a + x.seconds, 0) / total
}

/* ---------------- the film, built ---------------- */

/** What the film is made with: the world under everything, the liquid mark, the shapes, by id; each recording's
    address once it's placed (`clip(id, start, seconds)`), each screen's. */
/** `light`: the brand lives on white: a light world, its mark and shapes multiplied over it, quiet ink grey on white */
export type Means = { world: string; mark: string; shapes: Record<string, string>; screen: (file: string) => string; clip: (file: string, start: number, seconds: number) => string; light?: boolean }
/** per shot: the device's screen and which device, where it starts, its energy (for the score), its meaning */
export type Built = { script: TemplateScript; devices: ({ src: string; phone: boolean } | null)[]; starts: number[]; energy: number[]; meanings: Meaning[] }

const r2 = (v: number) => Math.round(v * 100) / 100
const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)"
const CRUISE = "cubic-bezier(0.33, 0, 0.67, 1)"
/** a title arriving the art direction's way, and staying: the cut, not a fade, ends it (cut on motion) */
function title(ad: ArtDirection, role: keyof ArtDirection["titles"], text: string, box: { x: number; y: number; w: number }, size: number, o: { color?: string; at?: number; font?: "display" | "text" | "mono"; weight?: number; align?: "left" | "center" | "right" } = {}): ScriptLayer {
  const spec = ad.titles[role]
  const custom = TEXT_ANIMS.find((a) => a.id === spec)
  return {
    kind: "text",
    name: role,
    text,
    box,
    size: r2(size),
    weight: o.weight ?? (o.font === "text" ? 450 : o.font === "mono" ? 500 : ad.type.weight),
    align: o.align ?? "center",
    enter: (custom ? "custom" : (spec as TextEnter)) ?? "words",
    ...(custom ? { animation: custom.anim } : {}),
    color: o.color ?? "",
    font: o.font ?? "display",
    entry: { at: r2(o.at ?? 0.08), dur: 0.6 },
  } as ScriptLayer
}
/** a title's size (% of the frame's width) that keeps it to `lines` lines of its box */
const fit = (text: string, w: number, want: number, lines = 2) => Math.min(want, (w * 100 * lines) / (Math.max(4, text.length) * 0.52))
/** a full-frame video (the world, the mark, a shape); `crash`: it arrives decelerating from oversize, the way a logo
    lands (motionmaxxing law 7), and keeps a living drift */
const video = (src: string, name: string, o: { blend?: boolean | "screen" | "multiply"; box?: { x: number; y: number; w: number }; crash?: boolean; push?: number; dur: number }): ScriptLayer =>
  ({
    kind: "image",
    name,
    src,
    file: name,
    aspect: 16 / 9,
    box: o.box ?? { x: 0.5, y: 0.5, w: 1 },
    radius: 0,
    enter: "none",
    ...(o.blend ? { blend: o.blend === true ? "screen" : o.blend } : {}),
    tweens: [
      ...(o.crash ? [{ prop: "scale", at: 0, dur: 0.55, from: [3.5], to: [1], ease: EXPO }, { prop: "opacity", at: 0, dur: 0.12, from: [0], to: [1], ease: "linear" }] : []),
      ...(o.push ? [{ prop: "scale", at: o.crash ? 0.55 : 0, dur: r2(o.dur - (o.crash ? 0.55 : 0)), from: [1], to: [1 + o.push], ease: CRUISE }] : []),
    ],
  }) as ScriptLayer

/** The spine as a film: its beats timed to the art direction's tempo; every proof a claim in type and then a hard cut to
    the product performing it, big; the mark crashing in at the turn and resolving at the end; one world under all. */
export function buildFilm(s: Spine, carriers: Carrier[], ad: ArtDirection, m: Means, o: { size?: string; url?: string; name: string }): Built {
  const beat = 60 / ad.tempo
  // whole beats; the end card keeps its 2.2 s and the longest beat takes what rounding left
  const total = s.beats.reduce((a, x) => a + x.seconds, 0)
  let durs = s.beats.map((x, i) => (i === s.beats.length - 1 ? x.seconds : Math.max(2, Math.round(x.seconds / beat)) * beat))
  const longest = durs.slice(0, -1).reduce((mx, d, j, a) => (d > a[mx] ? j : mx), 0)
  durs[longest] += total - durs.reduce((a, d) => a + d, 0)
  durs = durs.map(r2)
  const kind = (id: string) => carriers.find((c) => c.id === id)
  const proofs = s.beats.filter((x) => x.role === "proof").length
  let proved = 0
  const shots: ScriptShot[] = []
  const devices: Built["devices"] = []
  const energy: number[] = []
  const meanings: Meaning[] = []
  const world = (dur: number) => video(m.world, "World", { dur })
  // over the world: a dark brand's mark and shapes are made on black and screened, a light one's on white and multiplied
  const blend = m.light ? "multiply" : "screen"
  const ground = m.light ? "#ffffff" : "#000000"
  const quiet = m.light ? "#5b5b63" : "#b4b4bc"
  const add = (shot: ScriptShot, e: number, meaning: Meaning, device: Built["devices"][number] = null) => (shots.push(shot), energy.push(e), meanings.push(meaning), devices.push(device))
  const view = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.05 }, ease: CRUISE }
  s.beats.forEach((x, i) => {
    const dur = durs[i]
    const c = kind(x.carrier)
    const end = i === s.beats.length - 1
    const meaning = (says: string, shows: string): Meaning => ({ role: x.role, buys: x.buys, says, carrier: x.carrier, shows })
    // a supporting line: 5 % of the frame's height or so (motionmaxxing's 5–7 % H), quieter ink
    const sub = (y: number) => (x.sub ? [title(ad, "line", x.sub, { x: 0.5, y, w: 0.7 }, fit(x.sub, 0.7, 2.9, 1), { at: 0.45, font: "text", color: quiet })] : [])
    if (!c || c.kind === "words") {
      add({ name: `${x.role}: ${x.say}`.slice(0, 60), dur, cut: "cut", why: x.buys, ground, view, layers: [world(dur), title(ad, x.role === "hook" ? "hook" : "feature", x.say, { x: 0.5, y: x.sub ? 0.46 : 0.5, w: 0.8 }, fit(x.say, 0.8, 6.2)), ...sub(0.6)] }, x.role === "hook" ? 1 : 3, meaning(x.say, "words on the film's world"))
    } else if (c.kind === "logo") {
      // the mark crashes in from oversize; the name lands under it; at the end it resolves and holds (≤ 1.4 s)
      add(
        { name: `${x.role}: ${x.say}`.slice(0, 60), dur, cut: "cut", why: x.buys, ground, layers: [world(dur), video(m.mark, "Mark", { blend, box: { x: 0.5, y: 0.4, w: 0.9 }, crash: true, push: end ? 0.015 : 0.04, dur }), title(ad, "name", x.say, { x: 0.5, y: 0.74, w: 0.6 }, fit(x.say, 0.6, 3.4, 1), { at: 0.35 }), ...(end ? [] : sub(0.82))] },
        end ? 2 : 2,
        meaning(x.say, "the product's mark in liquid metal, its name"),
      )
    } else if (c.kind === "shape") {
      // the shape stands right of its line, small enough never to reach it
      add({ name: `${x.role}: ${x.say}`.slice(0, 60), dur, cut: "cut", why: x.buys, ground, layers: [world(dur), video(m.shapes[c.id] ?? m.world, "Shape", { blend, box: { x: 0.74, y: 0.5, w: 0.62 }, push: 0.05, dur }), title(ad, "feature", x.say, { x: 0.27, y: x.sub ? 0.46 : 0.5, w: 0.4 }, fit(x.say, 0.4, 4.2), { align: "left" }), ...(x.sub ? [title(ad, "line", x.sub, { x: 0.27, y: 0.6, w: 0.4 }, 1.6, { at: 0.45, font: "text", color: quiet, align: "left" })] : [])] }, 2, meaning(x.say, c.what))
    } else {
      // show it, then say it: the claim in type, a hard cut, the product performing it, big, with nothing over it
      proved++
      const claim = r2(Math.min(1.5, Math.max(1.1, dur * 0.3)))
      const rest = r2(dur - claim)
      // (one claim, nothing under it: the product it cuts to is the rest of the sentence)
      add({ name: `${x.role}: ${x.say}`.slice(0, 60), dur: claim, cut: "cut", why: x.buys, ground, view, layers: [world(claim), title(ad, "feature", x.say, { x: 0.5, y: 0.5, w: 0.8 }, fit(x.say, 0.8, 5.2))] }, 2, meaning(x.say, "the claim in type"))
      const at = shots.reduce((a, sh) => a + sh.dur, 0)
      const e = 2 + Math.round(proved / Math.max(1, proofs))
      if (c.kind === "clip")
        add(
          { name: `${x.role}: ${x.say} (the product)`.slice(0, 60), dur: rest, cut: "cut", why: x.buys, ground, layers: [world(rest), { kind: "image", name: "Recording", src: m.clip(c.file!, at, rest), file: "recording", aspect: 1.6, box: { x: 0.5, y: 0.5, w: 0.84 }, radius: 0.8, enter: "none", tweens: [{ prop: "scale", at: 0, dur: 0.5, from: [1.06], to: [1], ease: EXPO }, { prop: "scale", at: 0.5, dur: r2(rest - 0.5), from: [1], to: [1.03], ease: CRUISE }] } as ScriptLayer] },
          e,
          meaning("", c.what),
        )
      else if (!c.phone) {
        // a desktop screen is read by the camera, not on a laptop: big and flat, pushing into where to look
        const f = c.focus ?? { x: 0.5, y: 0.42 }
        const zoom = 0.22
        const dx = r2(-(f.x - 0.5) * 0.84 * zoom)
        const dy = r2(-(f.y - 0.5) * ((0.84 / 1.6) * (16 / 9)) * zoom)
        add(
          { name: `${x.role}: ${x.say} (the product)`.slice(0, 60), dur: rest, cut: "cut", why: x.buys, ground, layers: [world(rest), { kind: "image", name: "Screen", src: m.screen(c.file!), file: "screen", aspect: 1.6, box: { x: 0.5, y: 0.5, w: 0.84 }, radius: 0.8, enter: "none", tweens: [{ prop: "scale", at: 0, dur: 0.5, from: [1.06], to: [1], ease: EXPO }, { prop: "scale", at: 0.5, dur: r2(rest - 0.5), from: [1], to: [1 + zoom], ease: CRUISE }, { prop: "position", at: 0.5, dur: r2(rest - 0.5), from: [0, 0], to: [dx, dy], ease: CRUISE }] } as ScriptLayer] },
          e,
          meaning("", c.what),
        )
      } else
        add(
          { name: `${x.role}: ${x.say} (the product)`.slice(0, 60), dur: rest, cut: "cut", why: x.buys, ground, layers: [world(rest)], device: { id: c.phone ? "iphone" : "macbook", from: { angle: proved % 2 ? "hero" : "heroLeft", zoom: 1.24, rise: -0.02 }, to: { angle: "front", zoom: 1.4, rise: -0.02 }, ease: CRUISE } },
          e,
          meaning("", c.what),
          { src: m.screen(c.file!), phone: !!c.phone },
        )
    }
  })
  const starts = shots.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + shots[i - 1].dur : 0], [])
  return {
    script: { id: `directed-${Date.now().toString(36)}`, name: `${o.name}: directed`, version: 1, source: "director", summary: s.promise, size: o.size ?? "16x9", ground, light: m.light ? "studio" : "dramatic", why: [s.signature], avoid: [], shots, artist: { style: ad.id, story: "launch", pieces: meanings.map((x) => x.role) } },
    devices,
    starts,
    energy,
    meanings,
  }
}
