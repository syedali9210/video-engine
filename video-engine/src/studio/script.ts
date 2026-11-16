// Studio — template scripts. A film written down shot by shot in the engine's own words: what each shot shows, how
// the camera frames it at the start and where it glides to, the ground, the effects, the titles — and *why* each
// shot is there. A script compiles into a composition (which the Studio edits), a composition writes back into a
// script (which the template lab's AI edits), and the guidelines check a script before anyone sees it. Plain data and
// no DOM: the dev server runs this too, to check what the AI proposes.
import { DEVICES, type DeviceId } from "../devices"
import { ANIMS } from "../registry"
import { CAMERA, PROPS, VIEW, device as newDevice, defaultComp, scene as newScene, uid, type Box, type Brand, type Camera, type Comp, type FlatLayer, type Layer, type Light, type MovingLayer, type Scene, type Shot, type Template, type Timing, type Transition, type Tween, type View2D } from "./comp"
import { BACKDROPS, SIZES } from "./config"
import type { Copy } from "./copy"
import { FX_PRESETS, type SceneFx } from "./fx"
import { BLENDS, DRIFTS, PAINT_KINDS, PAINT_PRESETS, type DriftKind, type Paint } from "./paint"
import { ANGLES, MOTIONS, type AngleId, type MotionId } from "./poses"
import { HARMONIES, groundPaints, matchLook, type Harmony, type Look } from "../theme"
import { animOf as titleAnim } from "./textanim"
import { FACES, fontsUrl } from "./faces"
import { lintCuts, planCut, smoothCuts, turned } from "./cuts"
import { ASPECTS, launchFilm, type ComponentLayer } from "./comp"
import { LIBRARY, shotById } from "./library"
import { ROLES, type FilmRole } from "./shots"
import type { Values } from "../registry"

const SIZE_IDS = SIZES.map((x) => x.id)

/** A framing of the 3D camera: an angle to start from, then turned, raised, brought closer, the device pitched and
    rolled, the subject shifted up (rise) or right (pan) in fractions of the frame. Anything left out is the angle's. */
export type Framing = Partial<Omit<Camera, "angle">> & { angle?: AngleId }
/** A flat layer as a script writes it: no id (they're made fresh), and text may carry {name}, {hook}, {tagline},
    {cta}, {feature1}–{feature3}; a component's `anim` may be "{screen}" (what's open), "{screen2}" or "{screen3}". */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type ScriptLayer = DistOmit<FlatLayer, "id"> & { id?: string }
export type ScriptShot = {
  name: string
  /** seconds */
  dur: number
  /** into this shot from the one before; a film's first shot ignores it */
  cut?: Transition
  /** why the shot exists: what it does for the film */
  why: string
  /** the shot's ground (a backdrop id or a colour), a gradient preset over it, and its effects (a preset id or values) */
  ground?: string
  paint?: string
  /** or the film's colour in another harmony (a light title card in a dark film): its ground, lights and ink */
  look?: Harmony
  /** or its own gradient stack, whole (gradients.ts: a mesh, an aurora, a spotlight…), over `ground` */
  paints?: Paint[]
  fx?: string | SceneFx
  /** a device in 3D: the camera's framing at the start and, for a move between two framings, at the end; or one of the
      engine's named moves */
  device?: { id?: DeviceId | "{device}"; from: Framing; to?: Framing; ease?: string; move?: MotionId }
  /** the flat camera over the flat layers, at the start and the end */
  view?: { from: View2D; to?: View2D; ease?: string }
  /** flat layers, back to front */
  layers?: ScriptLayer[]
  /** a shot from the library (studio/shots.ts), by id ("film-spotlight/the-feature"): that template's own shot, its
      motion retimed to `dur`, with the product's words and screens in it; any layers play over it */
  clip?: string
  /** what the shot does in the film (shots.ts ROLES): the story planner, the casting and the gates read it */
  role?: FilmRole
}
export type TemplateScript = {
  id: string
  name: string
  version: number
  /** the reference it was rebuilt from */
  source: string
  /** the kind of film (refs.ts CATEGORIES.film): product launch, feature launch, demo… */
  category?: string
  summary: string
  size?: string
  /** the film's ground (a backdrop id or a colour) and light */
  ground: string
  light?: Light
  /** or a matched look (theme.ts) over all of it: one harmony of a colour (the product's accent, unless it names one),
      its ground, drifting lights, light, the devices' finish (or a case) and the titles' ink */
  look?: ScriptLook
  /** what makes it work, for whoever (or whatever) edits it next */
  why: string[]
  /** what it must never do */
  avoid: string[]
  shots: ScriptShot[]
  /** how the Artist directed it (artist.ts): its art direction, its story (the kind of film), the set pieces it used */
  artist?: { style: string; story: string; pieces: string[] }
  /** the faces its titles and words are set in (faces.ts), over the brand's */
  type?: { display?: string; text?: string; fonts?: string[] }
}

/* ---------------- compile: script → composition ---------------- */

export type ScriptLook = { harmony: Harmony; seed?: number; anchor?: string; case?: boolean }
/** `accent`: the product's own colour (read off its screen), the colour a script's look is matched to */
export type ScriptCtx = { device: DeviceId; posture: "folded" | "half" | "open"; anim: string; copy: Copy; brand?: Brand; accent?: string; /** each film's own values (a product kit's words and screens, filled into its slots), by film id */ values?: Record<string, Values> }

const camera = (f: Framing | undefined): Camera => ({ ...CAMERA, angle: f?.angle ?? "front", yaw: f?.yaw ?? 0, elev: f?.elev ?? 0, zoom: f?.zoom ?? 1, fov: f?.fov ?? null, pitch: f?.pitch, roll: f?.roll, rise: f?.rise, pan: f?.pan })
const fxOf = (fx: ScriptShot["fx"]): SceneFx | undefined => (typeof fx === "string" ? FX_PRESETS.find((p) => p.id === fx)?.fx : fx)
/** Other screens a collage can show beside the one that's open: the same product's other screens first, then the
    library's richest components, then anything (films left out). */
const RICH = ["wallet-card", "chat-quiz", "payment-success", "notch-card", "toast", "tab-hop"]
const others = (open: string) => {
  const me = ANIMS.find((a) => a.id === open)
  const usable = ANIMS.filter((a) => a.load && a.category !== "Launch films" && a.id !== open)
  const same = me?.brand ? usable.filter((a) => a.brand === me.brand && a.layout === "fill") : []
  const rich = RICH.filter((id) => id !== open && usable.some((a) => a.id === id))
  return [...new Set([...same.map((a) => a.id), ...rich, ...usable.map((a) => a.id)])]
}

/** Fills a script's placeholders from what's open: its words, its screens. */
export function fill(text: string, ctx: ScriptCtx) {
  const c = ctx.copy
  // a line the copy writer left empty borrows a neighbour's, so a title card is never blank
  const name = c.name.trim() || "Your product"
  const hook = c.hook.trim() || c.tagline.trim() || name
  const tagline = c.tagline.trim() || c.hook.trim() || name
  const f = c.features.filter((x) => x.trim())
  return text
    .replace(/\{name\}/g, name)
    .replace(/\{hook\}/g, hook)
    .replace(/\{tagline\}/g, tagline)
    .replace(/\{cta\}/g, c.cta.trim() || "Try it")
    .replace(/\{kicker\}/g, c.kicker.trim() || "Introducing")
    .replace(/\{split\}/g, c.split.trim() || tagline)
    .replace(/\{feature1\}/g, f[0] ?? c.tagline)
    .replace(/\{feature2\}/g, f[1] ?? f[0] ?? c.tagline)
    .replace(/\{feature3\}/g, f[2] ?? f[1] ?? c.tagline)
    .replace(/\{proof\}/g, (c.proof ?? "").trim() || tagline)
}

/** A film's values in a script's film: the product kit's for it, over the name and colour of what's open. */
const filmValues = (film: string, ctx: ScriptCtx): Values => {
  const schema = ANIMS.find((a) => a.id === film)?.schema ?? {}
  const v: Values = {}
  if (schema.name && ctx.copy.name.trim()) v.name = ctx.copy.name.trim()
  const accent = ctx.brand?.accent ?? ctx.accent
  if (schema.accent && accent) v.accent = accent
  return { ...v, ...ctx.values?.[film] }
}

export function compileScript(s: TemplateScript, ctx: ScriptCtx): Comp {
  const more = others(ctx.anim)
  const screen = (anim: string) => (anim === "{screen}" ? ctx.anim : anim === "{screen2}" ? (more[0] ?? ctx.anim) : anim === "{screen3}" ? (more[1] ?? more[0] ?? ctx.anim) : anim)
  const phone: DeviceId = ctx.device === "macbook" || ctx.device === "ipad" ? "iphone" : ctx.device
  const scenes: Scene[] = s.shots.map((shot, i) => {
    const layers: Layer[] = []
    const d = shot.device
    if (d) layers.push(newDevice(!d.id || d.id === "{device}" ? phone : d.id, "center", ctx.posture))
    const clip = shot.clip ? shotById(shot.clip) : undefined
    if (clip) layers.push({ ...launchFilm(clip.film, ASPECTS[clip.size], clip.at), rate: Math.round((clip.dur / Math.max(0.3, shot.dur)) * 1000) / 1000, values: filmValues(clip.film, ctx) })
    for (const raw of shot.layers ?? []) {
      const l = { ...raw, id: uid() } as FlatLayer
      if (l.kind === "text") l.text = fill(l.text, ctx)
      if (l.kind === "cursor") l.label = fill(l.label, ctx)
      if (l.kind === "callout") {
        l.text = fill(l.text, ctx)
        l.sub = fill(l.sub, ctx)
      }
      if (l.kind === "component" || l.kind === "breakdown") l.anim = screen(l.anim)
      if ("tweens" in l && l.tweens) (l as MovingLayer).tweens = l.tweens.map((t) => ({ ...t, id: uid() }))
      layers.push(l)
    }
    const two = !!(d?.to || shot.view?.to)
    const paint = shot.paints?.length ? shot.paints.map((p) => ({ ...p, id: uid() })) : shot.paint ? PAINT_PRESETS.find((p) => p.id === shot.paint)?.make() : undefined
    const look = shot.ground && shot.ground !== s.ground ? { fill: shot.ground, ...(paint ? { paint } : {}) } : paint ? { fill: shot.ground ?? s.ground, paint } : undefined
    return newScene(shot.name, layers, {
      duration: Math.max(0.3, shot.dur),
      transition: i === 0 ? "cut" : (shot.cut ?? "cut"),
      camera: camera(d?.from),
      move: two ? "framings" : (d?.move ?? "still"),
      camera2: d?.to ? camera({ ...d.from, ...d.to }) : undefined,
      view: shot.view?.from,
      view2: shot.view?.to,
      ease: d?.ease ?? shot.view?.ease,
      look,
      fx: fxOf(shot.fx),
    })
  })
  const comp: Comp = {
    ...defaultComp(ctx.device, ctx.posture),
    size: s.size ?? "16x9",
    fill: s.ground,
    effect: "none",
    light: s.light ?? "studio",
    auto: false,
    brand: faced(s, ctx),
    ...(s.artist ? { artist: s.artist } : {}),
    scenes,
  }
  return looked(s, ctx, comp)
}

/** The brand a film's titles are set with: the product's, with the film's own faces over it (and a plain one made
    for them when the product has none), their Google Fonts stylesheet loaded with it. */
function faced(s: TemplateScript, ctx: ScriptCtx): Brand | undefined {
  const t = s.type
  if (!t?.display && !t?.text) return ctx.brand
  const url = fontsUrl([t.display, t.text])
  const base: Brand = ctx.brand ?? { name: ctx.copy.name, bg: "#000000", surface: "#111113", ink: "#f4f4f5", muted: "#a1a1aa", accent: ctx.accent ?? "#6d5dfc", onAccent: "#ffffff", font: "", display: "", mono: "", radius: 12, dark: true, fonts: [] }
  return { ...base, ...(t.display ? { display: t.display } : {}), ...(t.text ? { font: t.text } : {}), fonts: [...new Set([...base.fonts, ...(url ? [url] : [])])] }
}

/** A script's look on its film: the film's harmony over every scene, a shot's own harmony over its scene; titles left
    in "auto" ink take the look's (small ones its muted ink), devices its finish (or its case). */
function looked(s: TemplateScript, ctx: ScriptCtx, comp: Comp): Comp {
  if (!s.look && !s.shots.some((x) => x.look)) return comp
  const anchor = s.look?.anchor ?? ctx.accent ?? ctx.brand?.accent ?? "#5e5ce6"
  const lookOf = (h: Harmony) => matchLook(anchor, h, s.look?.seed ?? 0)
  const base = s.look ? lookOf(s.look.harmony) : null
  const ink = (l: Layer, k: Look): Layer => (l.kind === "text" && !l.color ? { ...l, color: l.font === "mono" || l.size < 3.4 ? k.muted : k.ink } : l)
  const scenes = comp.scenes.map((sc, i) => {
    const own = s.shots[i]?.look
    const k = own ? lookOf(own) : base
    if (!k) return sc
    const layers = sc.layers.map((l) => (l.kind === "device" ? { ...l, finish: k.finish[l.device], ...(s.look?.case ? { case: k.case } : {}) } : ink(l, k)))
    return { ...sc, layers, ...(own ? { look: { ...sc.look, fill: k.ground, paint: groundPaints(k, { x: 0.5, y: 0.42 }) } } : {}) }
  })
  return base ? { ...comp, fill: base.ground, paint: groundPaints(base, { x: 0.5, y: 0.42 }), light: base.dark ? "dramatic" : "studio", scenes } : { ...comp, scenes }
}

/** A script as a template in the gallery: it takes what's open (its screen, its words, its brand). */
export const scriptTemplate = (s: TemplateScript): Template => ({
  id: `script:${s.id}`,
  name: s.name,
  hint: s.summary,
  scenes: s.shots.length,
  film: true,
  size: s.size ?? "16x9",
  category: s.category,
  make: (x) => compileScript(s, { device: x.device, posture: x.posture, anim: x.anim, copy: x.copy, brand: x.brand, accent: x.accent }),
})

/* ---------------- write back: composition → script ---------------- */

const framing = (c: Camera): Framing => {
  const f: Framing = { angle: c.angle }
  for (const k of ["yaw", "elev", "pitch", "roll", "rise", "pan"] as const) if (c[k]) f[k] = c[k]
  if (c.zoom !== 1) f.zoom = c.zoom
  if (c.fov != null) f.fov = c.fov
  return f
}
const strip = (l: FlatLayer): ScriptLayer => {
  const { id: _, ...rest } = l
  return rest as ScriptLayer
}

/** A composition as a script, for the AI to read and edit. The "why" of each shot is left for whoever edits it. */
export function toScript(c: Comp, meta: { id: string; name: string; source?: string; summary?: string }): TemplateScript {
  return {
    id: meta.id,
    name: meta.name,
    version: 1,
    source: meta.source ?? "the Studio",
    summary: meta.summary ?? "",
    size: c.size,
    ground: c.fill,
    light: c.light,
    why: [],
    avoid: [],
    ...(c.artist ? { artist: c.artist, category: c.artist.story } : {}),
    shots: c.scenes.map((s) => {
      const dev = s.layers.find((l) => l.kind === "device")
      const two = s.move === "framings"
      // a scene playing one of a template's shots from its start is that shot
      const film = s.layers.find((l): l is ComponentLayer => l.kind === "component" && l.from !== undefined && !l.hidden)
      const clip = film && LIBRARY.find((x) => x.film === film.anim && Math.abs(x.at - (film.from ?? 0)) < 0.05)
      return {
        name: s.name,
        dur: s.duration,
        cut: s.transition,
        why: "",
        ...(clip ? { clip: clip.id, role: clip.role[0] } : {}),
        ...(s.look?.fill ? { ground: s.look.fill } : {}),
        ...(s.look?.paint?.length ? { paints: s.look.paint } : {}),
        ...(s.fx ? { fx: s.fx } : {}),
        ...(dev ? { device: { id: dev.kind === "device" ? dev.device : undefined, from: framing(s.camera), ...(two ? { to: framing(s.camera2 ?? s.camera), ease: s.ease } : { move: s.move }) } } : {}),
        ...(s.view || s.view2 ? { view: { from: s.view ?? VIEW, ...(two && s.view2 ? { to: s.view2 } : {}), ease: s.ease } } : {}),
        layers: s.layers.filter((l): l is FlatLayer => l.kind !== "device" && !(clip && l === film)).map(strip),
      }
    }),
  }
}

/* ---------------- check: the guidelines, as rules a machine can apply ---------------- */

export type Finding = { level: "error" | "warn" | "info"; rule: string; shot?: number; text: string }
const zoomOf = (sh: ScriptShot) => Math.max(sh.device?.from.zoom ?? 1, sh.device?.to?.zoom ?? 0)
const moves = (sh: ScriptShot) => !!(sh.device?.to || (sh.device?.move && sh.device.move !== "still") || sh.view?.to || sh.layers?.some((l) => "tweens" in l && l.tweens?.length))
const blurOf = (sh: ScriptShot) => fxOf(sh.fx)?.focus?.blur ?? 0
const texts = (sh: ScriptShot) => (sh.layers ?? []).filter((l) => l.kind === "text")
/** The most titles on screen at once: small labels (mono, or under 1.6) don't count, and words that hand over to
    each other (one's Out before the next's In) aren't on screen together. */
function busiest(sh: ScriptShot) {
  const big = texts(sh).filter((l) => l.kind === "text" && l.font !== "mono" && l.size >= 1.6) as { entry?: Timing; exit?: Timing }[]
  const span = big.map((l) => [l.entry?.at ?? 0, l.exit ? l.exit.at + l.exit.dur : Infinity] as const)
  return Math.max(0, ...span.map(([a]) => span.filter(([x, y]) => x <= a + 0.01 && y > a).length))
}

/** Every guideline a machine can check (see lab/guidelines.md): errors stop a proposal, warnings go to the admin with
    it, notes are taste. */
export function lintScript(s: TemplateScript): Finding[] {
  const out: Finding[] = []
  const total = s.shots.reduce((a, x) => a + x.dur, 0)
  if (!s.shots.length) out.push({ level: "error", rule: "shape.shots", text: "No shots." })
  if (s.shots.length > 12) out.push({ level: "warn", rule: "shape.shots", text: `${s.shots.length} shots: a launch film holds 4 to 9.` })
  if (total < 5 || total > 60) out.push({ level: "warn", rule: "shape.length", text: `${total.toFixed(1)} s long: launch films run 8 to 45 s.` })
  // a shot with its own gradient stack belongs to the film's world (the Artist's grounds): only flat grounds count
  const grounds = new Set([s.ground, ...s.shots.filter((x) => !x.paints?.length).map((x) => x.ground).filter(Boolean)])
  if (grounds.size > 3) out.push({ level: "warn", rule: "ground.one", text: `${grounds.size} grounds: own one (two at most), let the product bring the colour.` })
  let firstDevice = -1
  s.shots.forEach((sh, i) => {
    if (!sh.why?.trim()) out.push({ level: "warn", rule: "why", shot: i, text: `"${sh.name}" doesn't say why it's there.` })
    if (sh.dur < 0.4 || sh.dur > 8) out.push({ level: "warn", rule: "pace.shot", shot: i, text: `"${sh.name}" is ${sh.dur} s: shots last 0.8 to 6 s.` })
    if (sh.device) {
      if (firstDevice < 0) firstDevice = i
      const z = zoomOf(sh)
      if (z >= 1.8 && blurOf(sh) <= 0) out.push({ level: "warn", rule: "dof.macro", shot: i, text: `"${sh.name}" is a close shot without depth of field: every pixel sharp reads as a screenshot.` })
      if (!moves(sh)) out.push({ level: "warn", rule: "camera.moves", shot: i, text: `"${sh.name}" holds the device still: the camera never stops.` })
      const prev = s.shots[i - 1]
      if (i > 0 && prev?.device && (sh.cut === "dissolve" || sh.cut === "fade")) out.push({ level: "warn", rule: "cut.hard", shot: i, text: `"${sh.name}" dissolves from a device shot: cut hard, let the camera's motion carry across.` })
      const glide = sh.device.to && (sh.device.to.zoom ?? sh.device.from.zoom ?? 1) === (sh.device.from.zoom ?? 1) && (sh.device.to.rise !== undefined || sh.device.to.pan !== undefined)
      if (glide && sh.device.ease && !/0,\s*0,\s*1,\s*1|^linear$/.test(sh.device.ease)) out.push({ level: "info", rule: "ease.glide", shot: i, text: `"${sh.name}" glides on an eased curve: long glides run linear.` })
    }
    const t = texts(sh)
    const many = busiest(sh)
    if (many > 3) out.push({ level: "warn", rule: "type.rare", shot: i, text: `"${sh.name}" has ${many} titles on screen at once: one idea at a time.` })
    for (const l of t) if (l.kind === "text" && l.size > 12 && sh.device) out.push({ level: "info", rule: "type.small", shot: i, text: `"${sh.name}" sets type at ${l.size} over a device: big type is for title cards.` })
  })
  if (firstDevice >= 0 && zoomOf(s.shots[firstDevice]) < 1.4 && s.shots.filter((x) => x.device).length > 2) out.push({ level: "info", rule: "story.close-first", shot: firstDevice, text: "The first device shot is wide: start close (a detail), earn the whole device later." })
  const last = s.shots.at(-1)
  if (last && !texts(last).some((l) => l.kind === "text" && /\{name\}|\{cta\}/.test(l.text)) && !texts(last).length) out.push({ level: "info", rule: "story.end", shot: s.shots.length - 1, text: "It doesn't end on the name or a call to action." })
  // every cut has a carrier (§5): the ones with nothing to carry them
  out.push(...lintCuts(s).filter((f) => !out.some((o) => o.rule === "cut.hard" && o.shot === f.shot)))
  return out
}

/* ---------------- fix: the guidelines applied, without any AI ---------------- */

const DOF: SceneFx["focus"] = { at: 0.45, to: null, size: 0.3, blur: 0.55, angle: 0 }
/** The guidelines a machine can apply by itself: depth of field on close shots, hard cuts between device shots,
    linear glides, a slow move on held devices, shots inside 0.8–6 s. Returns the fixed script and what it changed. */
export function autofix(s: TemplateScript): { script: TemplateScript; changes: { what: string; why: string; rule: string }[] } {
  const changes: { what: string; why: string; rule: string }[] = []
  const shots = s.shots.map((sh, i) => {
    let x = { ...sh }
    if (x.device) {
      const z = zoomOf(x)
      const fx = fxOf(x.fx) ?? {}
      if (z >= 1.8 && !(fx.focus?.blur ?? 0)) {
        x = { ...x, fx: { ...fx, focus: DOF } }
        changes.push({ what: `"${sh.name}": depth of field on`, why: "A close shot with every pixel sharp reads as a screenshot.", rule: "dof.macro" })
      }
      if (!moves(x)) {
        const f = x.device!.from
        x = { ...x, device: { ...x.device!, to: { zoom: (f.zoom ?? 1) * 1.08 }, ease: "cubic-bezier(0, 0, 1, 1)", move: undefined } }
        changes.push({ what: `"${sh.name}": a slow push in`, why: "The camera never stops: a held device reads as a still.", rule: "camera.moves" })
      }
    }
    if (x.dur > 6.5 || x.dur < 0.6) {
      const dur = Math.min(6, Math.max(0.8, x.dur))
      changes.push({ what: `"${sh.name}": ${x.dur} s → ${dur} s`, why: "Shots last 0.8 to 6 s.", rule: "pace.shot" })
      x = { ...x, dur }
    }
    return x
  })
  // and every cut given its carrier (§5), read from the shots as they now move
  const cuts = smoothCuts({ ...s, shots })
  changes.push(...cuts.changes)
  return { script: { ...s, version: s.version + (changes.length ? 1 : 0), shots: cuts.script.shots }, changes }
}

/* ---------------- extend: new shots from the ones before (guidelines §12) ---------------- */

/** A new shot for a film, where it goes (the index it takes) and the rule it follows. */
export type ShotIdea = { shot: ScriptShot; at: number; rule: string; by?: "rules" | "ai" }

const LINEAR = "cubic-bezier(0, 0, 1, 1)"
const ARRIVE = "cubic-bezier(0.16, 1, 0.3, 1)"
const r2 = (v: number) => Math.round(v * 100) / 100
const endOf = (d: NonNullable<ScriptShot["device"]>): Framing => ({ ...d.from, ...d.to })
// a shot that names the product (with a device or without): the ending, when it's one of the last two
const naming = (sh: ScriptShot) => texts(sh).some((l) => l.kind === "text" && /\{name\}|\{cta\}/.test(l.text))
const endAt = (s: TemplateScript) => {
  const i = s.shots.map(naming).lastIndexOf(true)
  return i >= 0 && i >= s.shots.length - 2 ? i : -1
}
const says = (s: TemplateScript, tag: string) => s.shots.some((sh) => (sh.layers ?? []).some((l) => (l.kind === "text" && l.text.includes(tag)) || (l.kind === "component" && l.anim === tag)))
/** The shot a new one follows by default: the last, or the one before the ending. */
export const lastShot = (s: TemplateScript) => Math.max(0, (endAt(s) >= 0 ? endAt(s) : s.shots.length) - 1)

/** New shots that continue a film, made from the shots it has (their framings, ground, effects, pace and easing) and
    guidelines §12: picking up where the camera stopped after shot `after`, a part of the interface it hasn't been
    close to, the wide reveal it hasn't earned yet, a screen or a feature it hasn't shown, the end it doesn't have.
    Without any AI; each one passes the checker in place. */
export function nextShots(s: TemplateScript, after = lastShot(s)): ShotIdea[] {
  const prev = s.shots[after]
  const at = after + 1
  const devices = s.shots.filter((x) => x.device)
  const dev = devices.find((x) => x.device?.id)?.device?.id
  const id = dev ? { id: dev } : {}
  // the film's own pace for a device shot, inside the guidelines' 3–4.5 s
  const pace = r2(devices.length ? Math.min(4.5, Math.max(3, devices.reduce((a, x) => a + x.dur, 0) / devices.length)) : 3.6)
  // the film's look on close shots (its vignette, its glow), with depth of field where the eye reads, tilted with the roll
  const look = fxOf(devices.find((x) => zoomOf(x) >= 1.8)?.fx) ?? fxOf(devices.find((x) => x.fx)?.fx) ?? {}
  const close = (focusAt: number, roll = 0): SceneFx => ({ ...look, focus: { ...DOF!, at: focusAt, angle: roll } })
  const { focus: _, ...wide } = look
  const out: ShotIdea[] = []

  // 12.2 the move goes on: from where the last camera stopped, the same way, at the same speed
  if (prev?.device) {
    const a = prev.device.from
    const b = endOf(prev.device)
    const to: Framing = {}
    const dRise = (b.rise ?? 0) - (a.rise ?? 0)
    const dPan = (b.pan ?? 0) - (a.pan ?? 0)
    const dYaw = (b.yaw ?? 0) - (a.yaw ?? 0)
    const kZoom = (b.zoom ?? 1) / (a.zoom ?? 1)
    if (Math.abs(dRise) > 0.02 && Math.abs((b.rise ?? 0) + dRise) <= 0.95) to.rise = r2((b.rise ?? 0) + dRise)
    if (Math.abs(dPan) > 0.02 && Math.abs((b.pan ?? 0) + dPan) <= 0.6) to.pan = r2((b.pan ?? 0) + dPan)
    if (Math.abs(dYaw) > 1) to.yaw = Math.round((b.yaw ?? 0) + dYaw)
    if (Math.abs(kZoom - 1) > 0.01) to.zoom = r2(Math.min(3.2, Math.max(0.6, (b.zoom ?? 1) * kZoom)))
    // a held shot goes on as a slow push
    if (!Object.keys(to).length) to.zoom = r2((b.zoom ?? 1) * 1.08)
    const z = Math.max(b.zoom ?? 1, to.zoom ?? 0)
    const f = fxOf(prev.fx)?.focus
    out.push({
      at,
      rule: "12.2",
      shot: {
        name: `${prev.name.replace(/, on$/, "")}, on`,
        dur: r2(prev.dur),
        cut: "cut",
        why: "Picks up where the last camera stopped and keeps the same move going: one dolly, cut in two on the beat.",
        ...(prev.ground ? { ground: prev.ground } : {}),
        ...(z >= 1.8 ? { fx: close(f?.to ?? f?.at ?? 0.45, b.roll ?? 0) } : prev.fx ? { fx: prev.fx } : {}),
        device: { ...(prev.device.id ? { id: prev.device.id } : {}), from: b, to, ease: prev.device.ease ?? LINEAR },
      },
    })
  }

  // 12.3 a part of the interface the film hasn't been close to
  const near = devices.filter((x) => zoomOf(x) >= 1.8).map((x) => endOf(x.device!))
  const seen = {
    top: near.some((f) => (f.rise ?? 0) <= -0.3),
    bottom: near.some((f) => (f.rise ?? 0) >= 0.3),
    edge: near.some((f) => Math.abs(f.yaw ?? 0) >= 25),
    middle: near.some((f) => Math.abs(f.rise ?? 0) < 0.3 && Math.abs(f.yaw ?? 0) < 25),
  }
  const PARTS: Record<keyof typeof seen, { name: string; why: string; from: Framing; to: Framing; focus: number }> = {
    top: { name: "The top, close", why: "A part the film hasn't been close to: the top of the screen, the camera gliding down it.", from: { angle: "front", zoom: 2.6, rise: -0.64, roll: -6, yaw: -10, elev: 14 }, to: { rise: -0.44 }, focus: 0.38 },
    bottom: { name: "The bottom, close", why: "A part the film hasn't been close to: the bottom of the screen, where the thumb goes, the camera gliding up to it.", from: { angle: "front", zoom: 2.5, rise: 0.62, roll: 8, yaw: -14, pitch: -10, elev: 10 }, to: { rise: 0.44 }, focus: 0.58 },
    edge: { name: "Along the edge", why: "The edge in the foreground and the screen receding: a side the film hasn't shown.", from: { angle: "front", zoom: 2.1, yaw: 36, pan: -0.08, roll: -4, elev: 10 }, to: { yaw: 30, pan: -0.02 }, focus: 0.5 },
    middle: { name: "The middle, close", why: "A part the film hasn't been close to: the middle of the screen, pushed into.", from: { angle: "front", zoom: 2.2, rise: -0.05, roll: -3, yaw: 8, elev: 12 }, to: { zoom: 2.45 }, focus: 0.5 },
  }
  const part = (["top", "bottom", "edge", "middle"] as const).find((p) => !seen[p])
  if (part) {
    const p = PARTS[part]
    out.push({ at, rule: "12.3", shot: { name: p.name, dur: pace, cut: "cut", why: p.why, fx: close(p.focus, p.from.roll ?? 0), device: { ...id, from: p.from, to: p.to, ease: LINEAR } } })
  }

  // 12.4 the whole device, once details have earned it
  if (devices.length && !devices.some((x) => (endOf(x.device!).zoom ?? 1) <= 1.25))
    out.push({ at, rule: "12.4", shot: { name: "The whole thing", dur: 3.6, cut: "cut", why: "The whole device, earned after the details: it rises into the frame and settles.", ...(Object.keys(wide).length ? { fx: wide } : {}), device: { ...id, from: { angle: "front", zoom: 0.86, rise: -1.2 }, to: { zoom: 0.94, rise: 0.02 }, ease: ARRIVE } } })

  // 12.5 one more screen, or one more feature (a title card, only in a film that has them)
  if (!says(s, "{screen2}"))
    out.push({ at, rule: "12.5", shot: { name: "Another screen", dur: r2(Math.min(pace, 3.4)), cut: "cut", why: "One more of the product's screens, on its own: it rises in while the frame pushes in.", view: { from: VIEW, to: { x: 0.5, y: 0.5, zoom: 1.06 }, ease: LINEAR }, layers: [{ kind: "component", anim: "{screen2}", box: { x: 0.5, y: 0.5, w: 0.3 }, aspect: 0.75, enter: "rise", fit: true }] } })
  const feature = [1, 2, 3].find((k) => !says(s, `{feature${k}}`))
  if (feature && s.shots.some((x) => !x.device && texts(x).length))
    out.push({ at, rule: "12.5", shot: { name: `Feature ${feature}`, dur: 2, cut: "cut", why: "A feature the film hasn't said yet, in a few words, arriving word by word.", layers: [{ kind: "text", text: `{feature${feature}}`, box: { x: 0.5, y: 0.5, w: 0.8 }, size: 5.2, weight: 600, align: "center", enter: "words", color: "" }] } })

  // 12.6 the end stays the end; a film without one gets one
  if (s.shots.length && !s.shots.some(naming))
    out.push({ at: s.shots.length, rule: "12.6", shot: { name: "The name", dur: 2.4, cut: "cut", why: "Ends on the name, small, letters landing: what the viewer keeps.", layers: [{ kind: "text", text: "{name}", box: { x: 0.5, y: 0.5, w: 0.6 }, size: 4.2, weight: 650, align: "center", enter: "letters", color: "", font: "display" }] } })

  // each one comes in on the cut that carries it from the shot before (§5), then has to pass the checker where it goes
  return out
    .map((idea) => {
      const before = s.shots[idea.at - 1]
      if (!before) return { ...idea, by: "rules" as const }
      const p = planCut(before, idea.shot, s)
      return { ...idea, shot: { ...(p.mirror ? turned(idea.shot) : idea.shot), cut: p.cut }, by: "rules" as const }
    })
    .filter((idea) => {
      const shots = [...s.shots]
      shots.splice(idea.at, 0, idea.shot)
      return !lintScript({ ...s, shots }).some((f) => f.shot === idea.at && f.level !== "info")
    })
}

/* ---------------- validate: anything that claims to be a script ---------------- */

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : undefined)
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d)
const oneOf = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d)
const ENTERS = ["none", "fade", "rise", "scale", "blur"] as const
const TEXT_ENTERS = [...ENTERS, "words", "sweep", "type", "mask", "part", "letters", "settle", "custom"] as const
const SHOT_IDS: Shot[] = ["flat", "tilt", "dolly", "macro", "float", "orbit"]
const TRANS = ["cut", "fade", "dissolve", "push", "zoom", "blur", "flash", "whip", "through", "iris", "wipe"] as const
const COLOUR = /^#[0-9a-f]{3,8}$/i
const colour = (v: unknown, d: string) => (typeof v === "string" && COLOUR.test(v) ? v : d)
const groundOf = (v: unknown) => (typeof v === "string" && (BACKDROPS.some((b) => b.id === v) || COLOUR.test(v)) ? v : undefined)
const ease = (v: unknown) => (typeof v === "string" && /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(v) ? v : undefined)
const box = (v: unknown, d: Box): Box => {
  const b = obj(v)
  return { x: num(b?.x, -0.5, 1.5, d.x), y: num(b?.y, -0.5, 1.5, d.y), w: num(b?.w, 0.01, 2, d.w) }
}
const timing = (v: unknown): Timing | undefined => {
  const t = obj(v)
  const e = ease(t?.ease)
  return t ? { at: num(t.at, 0, 60, 0), dur: num(t.dur, 0.05, 30, 0.5), ...(e ? { ease: e } : {}) } : undefined
}
const tweens = (v: unknown): Tween[] =>
  (Array.isArray(v) ? v : []).flatMap((x) => {
    const t = obj(x)
    const p = PROPS.find((q) => q.id === t?.prop)
    if (!t || !p) return []
    const vals = (a: unknown) => p.rest.map((r, i) => num(Array.isArray(a) ? a[i] : undefined, -100, 100, r))
    return [{ id: uid(), prop: p.id, at: num(t.at, 0, 60, 0), dur: num(t.dur, 0.05, 30, 0.5), from: vals(t.from), to: vals(t.to), ease: ease(t.ease) ?? "cubic-bezier(0.23, 1, 0.32, 1)" }]
  })
const pt = (v: unknown, d: { x: number; y: number }) => ({ x: num(obj(v)?.x, -2, 3, d.x), y: num(obj(v)?.y, -2, 3, d.y) })
const paints = (v: unknown): Paint[] =>
  (Array.isArray(v) ? v : []).slice(0, 6).flatMap((x) => {
    const p = obj(x)
    if (!p || !PAINT_KINDS.some((k) => k.id === p.kind) || !Array.isArray(p.stops) || !p.stops.length) return []
    const stops = p.stops.slice(0, 8).map((s) => ({ at: num(obj(s)?.at, 0, 1, 0), color: colour(obj(s)?.color, "#ffffff"), alpha: num(obj(s)?.alpha, 0, 1, 1) }))
    const d = obj(p.drift)
    const drift = d && DRIFTS.some((k) => k.id === d.kind) && d.kind !== "none" ? { drift: { kind: d.kind as DriftKind, period: num(d.period, 2, 120, 12), amount: num(d.amount, 0, 2, 0.5) } } : {}
    return [{ id: uid(), kind: p.kind as Paint["kind"], stops, from: pt(p.from, { x: 0.5, y: 0.5 }), to: pt(p.to, { x: 1, y: 0.5 }), ratio: num(p.ratio, 0.05, 20, 1), opacity: num(p.opacity, 0, 1, 1), blend: oneOf(p.blend, BLENDS, "normal"), ...drift }]
  })
const WHITE = [{ kind: "solid", stops: [{ at: 0, color: "#ffffff", alpha: 1 }] }]
/** The motion every moving layer can carry (Raylight's In, Out, blocks, and its Design values), checked. */
const motion = (r: Raw) => {
  const exit = obj(r.exit)
  const out = timing(exit)
  const tilt = obj(r.tilt)
  const blocks = tweens(r.tweens)
  const entry = timing(r.entry)
  return {
    ...(entry ? { entry } : {}),
    ...(exit && out ? { exit: { ...out, kind: oneOf(exit.kind, ENTERS, "fade") } } : {}),
    ...(blocks.length ? { tweens: blocks } : {}),
    ...(typeof r.rot === "number" ? { rot: num(r.rot, -360, 360, 0) } : {}),
    ...(tilt ? { tilt: { x: num(tilt.x, -80, 80, 0), y: num(tilt.y, -80, 80, 0) } } : {}),
    ...(typeof r.opacity === "number" ? { opacity: num(r.opacity, 0, 1, 1) } : {}),
    ...(typeof r.blur === "number" ? { blur: num(r.blur, 0, 10, 0) } : {}),
  }
}
const frame = (r: Raw) => (r.frame === "selection" ? { frame: "selection" as const, ...(COLOUR.test(str(r.frameColor)) ? { frameColor: str(r.frameColor) } : {}) } : {})
const animOf = (v: unknown) => (typeof v === "string" && (/^\{screen[23]?\}$/.test(v) || ANIMS.some((a) => a.id === v)) ? v : "{screen}")

/** One flat layer from outside: every field checked against what the engine knows, the rest made fresh. A picture
    can't come from outside (there's no file), so an image is dropped. */
function layerOf(x: unknown): ScriptLayer | undefined {
  const r = obj(x)
  if (!r) return
  const name = typeof r.name === "string" ? { name: r.name.slice(0, 80) } : {}
  switch (r.kind) {
    case "text": {
      const fill = paints(r.paint)
      return { kind: "text", ...name, text: str(r.text).slice(0, 200), box: box(r.box, { x: 0.5, y: 0.5, w: 0.6 }), size: num(r.size, 0.6, 30, 4), weight: num(r.weight, 100, 900, 600), align: oneOf(r.align, ["left", "center", "right"] as const, "center"), enter: oneOf(r.enter, TEXT_ENTERS, "fade"), color: colour(r.color, ""), ...(r.font ? { font: oneOf(r.font, ["text", "display", "mono", "serif"] as const, "text") } : {}), ...(typeof r.gap === "number" ? { gap: num(r.gap, 0, 80, 20) } : {}), ...(fill.length ? { paint: fill } : {}), ...(r.enter === "custom" && titleAnim(r.animation) ? { animation: titleAnim(r.animation) } : {}), ...motion(r) }
    }
    case "shape": {
      const fill = paints(r.paint)
      const st = obj(r.stroke)
      return { kind: "shape", ...name, shape: oneOf(r.shape, ["rect", "ellipse"] as const, "rect"), box: box(r.box, { x: 0.5, y: 0.5, w: 0.3 }), aspect: num(r.aspect, 0.05, 20, 1), radius: num(r.radius, 0, 50, 0), paint: fill.length ? fill : paints(WHITE), ...(st ? { stroke: { color: colour(st.color, "#000000"), width: num(st.width, 0, 20, 1) } } : {}), ...(r.shadow === true ? { shadow: true } : {}), enter: oneOf(r.enter, ENTERS, "fade"), ...motion(r) }
    }
    case "cursor":
      return { kind: "cursor", ...name, label: str(r.label, "Monica").slice(0, 40), color: colour(r.color, "#1d8cf8"), box: box(r.box, { x: 0.6, y: 0.6, w: 0.08 }), enter: oneOf(r.enter, ENTERS, "fade"), ...motion(r) }
    case "component":
      return { kind: "component", ...name, anim: animOf(r.anim), box: box(r.box, { x: 0.72, y: 0.5, w: 0.3 }), aspect: num(r.aspect, 0.1, 10, 0.75), enter: oneOf(r.enter, ENTERS, "rise"), fit: r.fit !== false, ...(r.hairline === true ? { hairline: true } : {}), ...(SHOT_IDS.includes(r.shot as Shot) ? { shot: r.shot as Shot } : {}), ...frame(r), ...motion(r) }
    case "breakdown":
      return { kind: "breakdown", ...name, anim: animOf(r.anim), mockup: oneOf(r.mockup, ["phone", "tablet", "none"] as const, "phone"), view: oneOf(r.view, ["table", "assemble", "stack", "focus"] as const, "table"), focus: Math.round(num(r.focus, 0, 20, 0)), max: Math.round(num(r.max, 1, 20, 6)), lines: r.lines === true, labels: r.labels !== false, box: box(r.box, { x: 0.5, y: 0.5, w: 1 }), enter: oneOf(r.enter, ENTERS, "fade") }
    case "callout":
      return { kind: "callout", ...name, text: str(r.text).slice(0, 120), sub: str(r.sub).slice(0, 160), at: pt(r.at, { x: 0.5, y: 0.5 }), box: box(r.box, { x: 0.5, y: 0.5, w: 0.3 }), enter: oneOf(r.enter, ENTERS, "fade"), color: colour(r.color, "") }
  }
}
const FRAMING: [keyof Framing, number, number][] = [["zoom", 0.2, 8], ["yaw", -180, 180], ["elev", -89, 89], ["pitch", -90, 90], ["roll", -180, 180], ["rise", -3, 3], ["pan", -3, 3], ["fov", 10, 120]]
function framingOf(v: unknown): Framing | undefined {
  const r = obj(v)
  if (!r) return
  const f: Framing = {}
  if (ANGLES.some((a) => a.id === r.angle)) f.angle = r.angle as AngleId
  for (const [k, lo, hi] of FRAMING) if (typeof r[k] === "number" && Number.isFinite(r[k])) (f as Record<string, unknown>)[k] = num(r[k], lo, hi, 0)
  return f
}
function view2d(v: unknown): View2D | undefined {
  const r = obj(v)
  return r ? { x: num(r.x, -1, 2, 0.5), y: num(r.y, -1, 2, 0.5), zoom: num(r.zoom, 0.2, 8, 1) } : undefined
}
function fxIn(v: unknown): ScriptShot["fx"] {
  if (typeof v === "string") return FX_PRESETS.some((p) => p.id === v) ? v : undefined
  const r = obj(v)
  if (!r) return
  const fx: SceneFx = {}
  const f = obj(r.focus)
  if (f) fx.focus = { at: num(f.at, 0, 1, 0.45), to: typeof f.to === "number" ? num(f.to, 0, 1, 0.5) : null, size: num(f.size, 0.05, 1, 0.3), blur: num(f.blur, 0, 1, 0.55), angle: num(f.angle, -90, 90, 0) }
  for (const k of ["bloom", "vignette", "grain", "split"] as const) if (typeof r[k] === "number") fx[k] = num(r[k], 0, 1, 0)
  const g = obj(r.grade)
  if (g) fx.grade = { exposure: num(g.exposure, -1, 1, 0), contrast: num(g.contrast, -1, 1, 0), saturation: num(g.saturation, -1, 1, 0), warmth: num(g.warmth, -1, 1, 0) }
  return fx
}
function shotOf(sh: Raw, i: number): ScriptShot {
  const d = obj(sh.device)
  const from = d && framingOf(d.from)
  const to = d && framingOf(d.to)
  const v = obj(sh.view)
  const vFrom = v && view2d(v.from)
  const vTo = v && view2d(v.to)
  const fx = fxIn(sh.fx)
  const ground = groundOf(sh.ground)
  const own = paints(sh.paints)
  return {
    name: str(sh.name, `Shot ${i + 1}`).slice(0, 60),
    dur: num(sh.dur, 0.3, 30, 3),
    cut: oneOf(sh.cut, TRANS, "cut"),
    why: str(sh.why).slice(0, 400),
    ...(ground ? { ground } : {}),
    ...(PAINT_PRESETS.some((p) => p.id === sh.paint) ? { paint: sh.paint as string } : {}),
    ...(HARMONIES.some((h) => h.id === sh.look) ? { look: sh.look as Harmony } : {}),
    ...(own.length ? { paints: own } : {}),
    ...(fx ? { fx } : {}),
    ...(d && from
      ? {
          device: {
            ...(d.id === "{device}" || DEVICES.some((x) => x.id === d.id) ? { id: d.id as DeviceId | "{device}" } : {}),
            from,
            ...(to ? { to } : {}),
            ...(ease(d.ease) ? { ease: ease(d.ease) } : {}),
            ...(MOTIONS.some((m) => m.id === d.move && m.id !== "framings") ? { move: d.move as MotionId } : {}),
          },
        }
      : {}),
    ...(vFrom ? { view: { from: vFrom, ...(vTo ? { to: vTo } : {}), ...(ease(v?.ease) ? { ease: ease(v?.ease) } : {}) } } : {}),
    layers: (Array.isArray(sh.layers) ? sh.layers : []).slice(0, 24).map(layerOf).filter((l): l is ScriptLayer => !!l),
    ...(typeof sh.clip === "string" && shotById(sh.clip) ? { clip: sh.clip } : {}),
    ...(ROLES.includes(sh.role as FilmRole) ? { role: sh.role as FilmRole } : {}),
  }
}

/** A film's faces, as they came from outside: only the curated ones. */
function typeIn(v: unknown): TemplateScript["type"] {
  const o = obj(v)
  const known = (x: unknown) => (FACES.some((f) => f.name === x) ? (x as string) : undefined)
  const display = known(o?.display)
  const text = known(o?.text)
  return display || text ? { ...(display ? { display } : {}), ...(text ? { text } : {}) } : undefined
}

/** How the Artist made a film, as it came from outside: words, kept short. */
function artistIn(v: unknown): TemplateScript["artist"] {
  const o = obj(v)
  if (!o || typeof o.style !== "string" || typeof o.story !== "string") return undefined
  return { style: o.style.replace(/[^a-z-]/g, "").slice(0, 30), story: o.story.replace(/[^a-z-]/g, "").slice(0, 30), pieces: (Array.isArray(o.pieces) ? o.pieces : []).map((x) => str(x).replace(/[^a-z-]/g, "").slice(0, 30)).filter(Boolean).slice(0, 24) }
}

/** A script's look as it came from outside: a harmony the engine knows, a seed, a colour. */
function lookIn(v: unknown): ScriptLook | undefined {
  const o = obj(v)
  if (!o || !HARMONIES.some((h) => h.id === o.harmony)) return undefined
  return { harmony: o.harmony as Harmony, ...(typeof o.seed === "number" ? { seed: Math.round(num(o.seed, 0, 1e6, 0)) } : {}), ...(typeof o.anchor === "string" && COLOUR.test(o.anchor) ? { anchor: o.anchor } : {}), ...(o.case === true ? { case: true } : {}) }
}

/** Turns whatever came from outside (an AI's reply, a file) into a script the compiler can take, or says why it
    can't. Every field is checked against what the engine knows (angles, moves, presets, grounds, layer kinds);
    numbers are clamped to sane ranges; unknown fields go. */
export function validateScript(raw: unknown): { script?: TemplateScript; errors: string[] } {
  const errors: string[] = []
  const r = obj(raw)
  if (!r) return { errors: ["Not an object."] }
  if (!Array.isArray(r.shots) || !r.shots.length) return { errors: ["No shots."] }
  const shots: ScriptShot[] = []
  r.shots.slice(0, 16).forEach((x: unknown, i: number) => {
    const sh = obj(x)
    if (sh) shots.push(shotOf(sh, i))
    else errors.push(`Shot ${i + 1} isn't an object.`)
  })
  if (!shots.length) return { errors: [...errors, "No usable shots."] }
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map((w) => str(w).slice(0, 300)).filter(Boolean).slice(0, 8)
  return {
    script: {
      id: (str(r.id) || `script-${uid()}`).replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 60),
      name: str(r.name, "Untitled").slice(0, 60),
      version: Math.round(num(r.version, 1, 999, 1)),
      source: str(r.source, "the template lab").slice(0, 300),
      ...(str(r.category) ? { category: str(r.category).replace(/[^a-z-]/g, "").slice(0, 40) } : {}),
      summary: str(r.summary).slice(0, 400),
      size: oneOf(r.size, SIZE_IDS, "16x9"),
      ground: groundOf(r.ground) ?? "white",
      light: oneOf(r.light, ["studio", "dramatic", "soft"] as const, "studio"),
      ...(lookIn(r.look) ? { look: lookIn(r.look) } : {}),
      ...(artistIn(r.artist) ? { artist: artistIn(r.artist) } : {}),
      ...(typeIn(r.type) ? { type: typeIn(r.type) } : {}),
      why: list(r.why),
      avoid: list(r.avoid),
      shots,
    },
    errors,
  }
}
