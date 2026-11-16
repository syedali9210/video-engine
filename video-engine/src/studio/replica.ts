// Studio — replicas. A launch film worth copying, rebuilt as an editable template with the accuracy of a measurement,
// not an impression. The film's teardown gives its cut points (or ffmpeg measures them, for a file). A second, closer
// watch gives each shot's subject and the engine's exact camera values: angle, zoom, turn, height, roll, where the
// subject sits, where the camera glides to and on what curve. It also gives the transition, the ground, the depth of
// field, and every title with its animation. This module turns that into a script the engine plays without guessing
// (here, never by the model), keeping the film's own cuts. It then scores how close the rebuild is (shot count, cut
// times, length, transitions, titles, colours, what could be shown as it was) and lists every shot side by side. The
// product's words and screens go in as placeholders, so the replica is a template for any product. Pure: the lab's
// server builds and checks it, the lab shows it.
import { ANGLES, MOTIONS, type AngleId, type MotionId } from "./poses.ts"
import { TRANSITION_IDS, cutFromWords } from "./cuts.ts"
import { animOf, type TextAnim } from "./textanim.ts"
import type { Transition } from "./comp"
import type { Reference } from "../refs.ts"
import type { Framing, ScriptLayer, ScriptShot, TemplateScript } from "./script"

export type PreciseTitle = { text: string; role: string; font: "display" | "text" | "mono"; weight: number; size: number; color: string; align: "left" | "center" | "right"; x: number; y: number; w: number; anim?: TextAnim }
/** One shot, measured: what it shows (a device, the interface filling the frame, only words, or something the engine
    can't render, like people), its framing at the start and where it goes, the cut into it, its ground and focus, and
    its titles. */
export type PreciseShot = {
  i: number
  subject: "device" | "screen" | "title" | "other"
  device?: "iphone" | "ipad" | "macbook"
  angle: AngleId
  zoom: number
  yaw: number
  elev: number
  roll: number
  pitch: number
  rise: number
  pan: number
  to?: Partial<Record<"zoom" | "yaw" | "elev" | "roll" | "rise" | "pan", number>>
  move?: MotionId
  ease?: string
  cut: Transition
  ground?: string
  dof: number
  titles: PreciseTitle[]
}

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {})
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : undefined)
const r2 = (v: number) => Math.round(v * 100) / 100
const EASE = /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/
const ROLES = ["hook", "kicker", "name", "feature", "tagline", "cta", "label"]
const RANGE: Record<"zoom" | "yaw" | "elev" | "roll" | "pitch" | "rise" | "pan", [number, number, number]> = { zoom: [0.3, 4, 1], yaw: [-180, 180, 0], elev: [-30, 80, 0], roll: [-90, 90, 0], pitch: [-90, 90, 0], rise: [-1.2, 1.2, 0], pan: [-1, 1, 0] }

/** The closer watch's answer, checked: every value in range and in the engine's own words, one per shot `0 … n−1`. */
export function preciseShots(raw: unknown, n: number): PreciseShot[] {
  const list = Array.isArray(obj(raw).shots) ? (obj(raw).shots as unknown[]) : Array.isArray(raw) ? raw : []
  const out = new Map<number, PreciseShot>()
  list.forEach((x, k) => {
    const p = obj(x)
    // a shot it numbered outside the list (or twice) isn't one of the film's
    const i = typeof p.i === "number" && Number.isFinite(p.i) ? Math.round(p.i) : k
    if (i < 0 || i >= n || out.has(i)) return
    const to: PreciseShot["to"] = {}
    for (const key of ["zoom", "yaw", "elev", "roll", "rise", "pan"] as const) {
      const v = p[`to${key[0].toUpperCase()}${key.slice(1)}`]
      if (typeof v === "number" && Number.isFinite(v)) to[key] = r2(num(v, RANGE[key][0], RANGE[key][1], RANGE[key][2]))
    }
    const titles = (Array.isArray(p.titles) ? p.titles : []).slice(0, 4).flatMap((y): PreciseTitle[] => {
      const t = obj(y)
      const text = str(t.text, 120)
      if (!text) return []
      const anim = animOf(t)
      return [{ text, role: ROLES.includes(str(t.role, 20)) ? str(t.role, 20) : "label", font: (["display", "text", "mono"] as const).find((f) => f === t.font) ?? "display", weight: Math.round(num(t.weight, 100, 900, 600)), size: r2(num(t.size, 0.8, 30, 5)), color: hex(t.color) ?? "", align: (["left", "center", "right"] as const).find((a) => a === t.align) ?? "center", x: r2(num(t.x, 0, 1, 0.5)), y: r2(num(t.y, 0, 1, 0.5)), w: r2(num(t.w, 0.05, 1, 0.7)), ...(anim ? { anim } : {}) }]
    })
    const v = (k: keyof typeof RANGE) => r2(num(p[k], RANGE[k][0], RANGE[k][1], RANGE[k][2]))
    out.set(i, {
      i,
      subject: (["device", "screen", "title", "other"] as const).find((s) => s === p.subject) ?? "device",
      ...((["iphone", "ipad", "macbook"] as const).find((d) => d === p.device) ? { device: p.device as PreciseShot["device"] } : {}),
      angle: ANGLES.some((a) => a.id === p.angle) ? (p.angle as AngleId) : "front",
      zoom: v("zoom"),
      yaw: v("yaw"),
      elev: v("elev"),
      roll: v("roll"),
      pitch: v("pitch"),
      rise: v("rise"),
      pan: v("pan"),
      ...(Object.keys(to).length ? { to } : {}),
      ...(MOTIONS.some((m) => m.id === p.move && m.id !== "framings") ? { move: p.move as MotionId } : {}),
      ...(typeof p.ease === "string" && EASE.test(p.ease) ? { ease: p.ease } : {}),
      cut: TRANSITION_IDS.includes(p.cut as Transition) ? (p.cut as Transition) : "cut",
      ...(hex(p.ground) ? { ground: hex(p.ground) } : {}),
      dof: r2(num(p.dof, 0, 1, 0)),
      titles,
    })
  })
  return [...out.values()].sort((a, b) => a.i - b.i)
}

/* ---------------- without the closer watch: a shot from its words ---------------- */

const has = (t: string, re: RegExp) => re.test(t.toLowerCase())
/** A shot as the teardown described it, measured as well as words allow: the subject, the nearest angle, how close. */
export function guessShot(s: Reference["shots"][number], i: number): PreciseShot {
  const t = `${s.what} ${s.from} ${s.to} ${s.rotation} ${s.type}`
  const words = /\b(title|text|headline|words?|tagline|caption|logo|wordmark)\b/i.test(t) && !/\b(phone|device|iphone|mac|ipad|laptop|hand)\b/i.test(t)
  const screen = !words && has(t, /\b(ui|interface|screen recording|full.?screen|app screen|dashboard)\b/) && !has(t, /\b(phone|device|iphone|ipad|mac|laptop)\b/)
  const people = has(t, /\b(person|people|man|woman|hands?|face|team|crowd|office|street)\b/)
  const angle: AngleId = has(t, /over the top/) ? "over" : has(t, /top.?down|from above|overhead/) ? "top" : has(t, /from below|low angle|worm/) ? "worm" : has(t, /profile|side on|edge on/) ? "profile" : has(t, /edge|band/) ? "edge" : has(t, /dutch|tilted|canted/) ? "dutch" : has(t, /lying|on (a|the) table/) ? "lying" : has(t, /(its back|the back|rear)/) && !has(t, /from (its |the )?back/) ? "back" : has(t, /left/) ? "heroLeft" : has(t, /three.?quarter|¾|angled/) ? "hero" : "front"
  const zoom = has(t, /macro|extreme close/) ? 2.6 : has(t, /close/) ? 2 : has(t, /wide|whole|full/) ? 0.9 : 1.2
  const rise = has(t, /\btop\b|island|status bar|camera/) && zoom > 1.5 ? -0.6 : has(t, /bottom|home bar|tab bar/) && zoom > 1.5 ? 0.6 : 0
  const move: MotionId | undefined = has(t, /orbit|around|arc/) ? "arc" : has(t, /turntable|360/) ? "turntable" : has(t, /spin|from (its )?back/) ? "spin" : has(t, /flip|turns to face/) ? "flip" : has(t, /drop|falls?/) ? "fall" : has(t, /rises?/) ? "rise" : has(t, /crane|descend/) ? "crane" : has(t, /whip|swish/) ? "whip" : has(t, /dive|into the screen/) ? "dive" : has(t, /push|dolly in|zoom(s|ing)? in/) ? "push" : has(t, /pull back|pulls? out/) ? "pull" : has(t, /drift|glide|pan|track/) ? "drift" : undefined
  return { i, subject: words ? "title" : screen ? "screen" : people ? "other" : "device", angle, zoom, yaw: 0, elev: 0, roll: 0, pitch: 0, rise, pan: 0, ...(move ? { move } : {}), cut: cutFromWords(s.cut), dof: zoom >= 1.8 ? 0.55 : 0, titles: [] }
}

/** Shots from cut points alone (ffmpeg's, from a file the lab can't watch without a key): the film's exact rhythm,
    each shot to be framed by hand. */
export function skeleton(duration: number, cuts: number[]): Reference["shots"] {
  const marks = [0, ...cuts.filter((t) => t > 0 && t < duration), duration]
  return marks.slice(1).map((t, i) => ({ at: r2(marks[i]), dur: r2(t - marks[i]), what: `Shot ${i + 1}`, from: "", to: "", rotation: "", cut: "cut", focus: "", type: "", ground: "", ease: "" }))
}
// shots from cut points only get a varied set of framings, not one repeated
const FILL: Partial<PreciseShot>[] = [{ angle: "front", zoom: 2.4, rise: -0.6, move: "drift" }, { angle: "hero", zoom: 1, move: "turn" }, { angle: "edge", zoom: 2.1, move: "drift" }, { angle: "over", zoom: 1.25, move: "push" }, { angle: "front", zoom: 2.3, rise: 0.55, move: "drift" }, { angle: "heroLeft", zoom: 0.95, move: "arc" }]

/** Snaps a teardown's cut points to the ones ffmpeg measured (each within 0.45 s of one), keeping the shot list. */
export function snapCuts(shots: Reference["shots"], cuts: number[], duration?: number): Reference["shots"] {
  const nearest = (t: number) => cuts.reduce<number | null>((best, c) => (Math.abs(c - t) <= 0.45 && (best === null || Math.abs(c - t) < Math.abs(best - t)) ? c : best), null)
  const at = shots.map((s, i) => (i === 0 ? 0 : (nearest(s.at) ?? s.at)))
  const end = duration ?? (shots.length ? shots.at(-1)!.at + shots.at(-1)!.dur : 0)
  return shots.map((s, i) => ({ ...s, at: r2(at[i]), dur: r2(Math.max(0.2, (at[i + 1] ?? end) - at[i])) }))
}

/* ---------------- the replica ---------------- */

/** what a shot's "why" says when it was framed from the teardown's words, not measured */
const UNMEASURED = "Framed from the teardown's words, not measured."
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "film"
const LINEAR = "cubic-bezier(0, 0, 1, 1)"
const dark = (c: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c)
  return c === "black" || (!!m && 0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16) < 110)
}

/** The film rebuilt as a template: one shot per shot, each as long as it was and coming in the way it did, framed
    by the measured values (or the words, where there are none). A live-action shot gets your device, framed the
    same way, and says so. Titles keep their measured place, size and animation; their words become the product's. */
export function replicaScript(ref: Reference, measured: PreciseShot[], o: { name?: string; category?: string } = {}): TemplateScript {
  const film = ref.shots
  const durs = film.map((s, i) => r2(Math.max(0.3, (film[i + 1]?.at ?? s.at + s.dur) - s.at)))
  const pickOf = (i: number) => measured.find((p) => p.i === i) ?? (film[i].from || film[i].what !== `Shot ${i + 1}` ? guessShot(film[i], i) : { ...guessShot(film[i], i), ...FILL[i % FILL.length], i })
  const closely = new Set(measured.map((p) => p.i))
  const all = film.map((_, i) => pickOf(i))
  const tally = new Map<string, number>()
  for (const p of all) if (p.ground) tally.set(p.ground, (tally.get(p.ground) ?? 0) + 1)
  const ground = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ref.palette?.[0] ?? "black"
  let feature = 0
  const words = (t: PreciseTitle) => (t.role === "hook" ? "{hook}" : t.role === "name" ? "{name}" : t.role === "tagline" ? "{tagline}" : t.role === "cta" ? "{cta}" : t.role === "kicker" ? "{kicker}" : t.role === "feature" ? `{feature${(feature++ % 3) + 1}}` : t.text)
  const shots: ScriptShot[] = film.map((s, i) => {
    const p = all[i]
    const at = `Shot ${i + 1} of “${ref.title}”, at ${s.at.toFixed(1)} s for ${durs[i]} s: ${s.what || "measured from its cuts"}.`
    const shot: ScriptShot = {
      name: (s.what && s.what !== `Shot ${i + 1}` ? s.what.replace(/\.$/, "") : `Shot ${i + 1}`).slice(0, 44),
      dur: durs[i],
      ...(i ? { cut: p.cut } : {}),
      why: `${p.subject === "other" ? `${at} Live action in the reference: your device stands in, framed the way it was.` : at}${closely.has(i) ? "" : ` ${UNMEASURED}`}`,
      ...(p.ground && p.ground !== ground ? { ground: p.ground } : {}),
    }
    if (p.subject === "device" || p.subject === "other") {
      const from: Framing = { angle: p.angle, ...(p.zoom !== 1 ? { zoom: p.zoom } : {}), ...(p.yaw ? { yaw: p.yaw } : {}), ...(p.elev ? { elev: p.elev } : {}), ...(p.roll ? { roll: p.roll } : {}), ...(p.pitch ? { pitch: p.pitch } : {}), ...(p.rise ? { rise: p.rise } : {}), ...(p.pan ? { pan: p.pan } : {}) }
      shot.device = { id: "{device}", from, ...(p.to ? { to: p.to, ease: p.ease ?? LINEAR } : p.move && p.move !== "still" ? { move: p.move } : { to: { zoom: r2(p.zoom * 1.05) }, ease: LINEAR }) }
      if (p.dof > 0.3 || Math.max(p.zoom, p.to?.zoom ?? 0) >= 1.8) shot.fx = { focus: { at: p.rise < -0.3 ? 0.36 : p.rise > 0.3 ? 0.6 : 0.45, to: null, size: 0.3, blur: Math.max(0.45, p.dof), angle: p.roll }, vignette: 0.4 }
    }
    const layers: ScriptLayer[] = []
    if (p.subject === "screen") {
      // the interface filling the frame: the product's screen, as tall as the frame at the zoom it was seen
      layers.push({ kind: "component", name: "The interface", anim: "{screen}", box: { x: r2(0.5 - p.pan * 0.3), y: r2(0.5 - p.rise * 0.3), w: r2(Math.min(0.9, 0.26 * p.zoom)) }, aspect: 0.46, enter: "none", fit: true })
      shot.view = { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: p.to?.zoom ? r2(p.to.zoom / Math.max(0.3, p.zoom)) : 1.06 }, ease: p.ease ?? LINEAR }
    }
    for (const t of p.titles) layers.push({ kind: "text", name: t.text.slice(0, 60), text: words(t), box: { x: t.x, y: t.y, w: t.w }, size: t.size, weight: t.weight, align: t.align, enter: t.anim ? "custom" : "words", color: t.color, font: t.font, ...(t.anim ? { animation: t.anim } : {}) } as ScriptLayer)
    // only words in the teardown and none measured: the line it said, as the product's tagline
    if (p.subject === "title" && !p.titles.length) layers.push({ kind: "text", name: s.type || s.what, text: "{tagline}", box: { x: 0.5, y: 0.5, w: 0.8 }, size: 7, weight: 600, align: "center", enter: "words", color: "", font: "display" })
    if (layers.length) shot.layers = layers
    return shot
  })
  return {
    id: `replica-${slug(ref.title)}-${ref.id.slice(0, 4)}`,
    name: (o.name ?? `${ref.title.replace(/\s*[|–-].*$/, "").slice(0, 40)}, replicated`).slice(0, 60),
    version: 1,
    source: `replicated from “${ref.title}”${ref.url ? ` (${ref.url})` : ""}`,
    category: o.category ?? ref.category ?? "product-launch",
    summary: ref.summary || `${film.length} shots, cut where the reference cuts.`,
    size: "16x9",
    ground,
    light: dark(ground) ? "dramatic" : "studio",
    why: ref.lessons.slice(0, 6),
    avoid: ["Moving its cut points: they're the reference's, measured.", "Adding shots it doesn't have.", "Copying the reference's own words: they're placeholders for the product's."],
    shots,
  }
}

/* ---------------- how close it is ---------------- */

export type FidelityRow = { i: number; at: number; refDur: number; repDur: number; what: string; refCut: Transition; repCut: Transition; framing: string; standIn: boolean; titles: number }
export type Fidelity = { score: number; parts: { id: string; label: string; score: number; note: string }[]; rows: FidelityRow[] }
const family = (t: Transition) => (t === "fade" || t === "dissolve" ? "soft" : t)
const rgb = (c: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(c)
  return m ? [1, 2, 3].map((k) => parseInt(m[k], 16)) : null
}

/** The replica measured against the reference, part by part (0 to 100), and shot by shot. */
export function fidelity(ref: Reference, s: TemplateScript): Fidelity {
  const film = ref.shots
  const n = Math.min(film.length, s.shots.length)
  const pct = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100)
  const refLen = film.length ? film.at(-1)!.at + film.at(-1)!.dur : 0
  const repLen = s.shots.reduce((a, x) => a + x.dur, 0)
  let t = 0
  const starts = s.shots.map((x) => ((t += x.dur), t - x.dur))
  const timing = n ? film.slice(0, n).reduce((a, x, i) => a + Math.abs(x.at - starts[i]), 0) / n : 0
  const cutsAgree = n > 1 ? film.slice(1, n).filter((x, i) => family(cutFromWords(x.cut)) === family(s.shots[i + 1].cut ?? "cut")).length / (n - 1) : 1
  const refTitles = (ref.kit ?? []).filter((k) => k.kind === "title").length
  const repTitles = s.shots.reduce((a, x) => a + (x.layers ?? []).filter((l) => l.kind === "text").length, 0)
  const standIns = s.shots.filter((x) => /Live action in the reference/.test(x.why)).length
  const guessed = s.shots.filter((x) => x.why.includes(UNMEASURED)).length
  // the reference's colours, each against the nearest one the replica uses
  // type left in "auto" ink reads as the ink of its ground
  const auto = s.shots.some((x) => (x.layers ?? []).some((l) => l.kind === "text" && !l.color)) ? [dark(s.ground) ? "#ffffff" : "#111111"] : []
  const used = [s.ground, ...auto, ...s.shots.map((x) => x.ground ?? ""), ...s.shots.flatMap((x) => (x.layers ?? []).map((l) => ("color" in l ? String(l.color ?? "") : "")))].map(rgb).filter((x): x is number[] => !!x)
  const palette = (ref.palette ?? []).slice(0, 4).map(rgb).filter((x): x is number[] => !!x)
  const colour = palette.length && used.length ? 1 - palette.reduce((a, p) => a + Math.min(...used.map((u) => Math.hypot(p[0] - u[0], p[1] - u[1], p[2] - u[2]))), 0) / palette.length / 441 : 1
  const parts = [
    { id: "shots", label: "Shots", score: pct(film.length ? 1 - Math.abs(film.length - s.shots.length) / film.length : 0), note: `${s.shots.length} of ${film.length}.` },
    { id: "measured", label: "Measured", score: pct(s.shots.length ? 1 - guessed / s.shots.length : 0), note: guessed ? `${s.shots.length - guessed} of ${s.shots.length} shots measured closely; ${guessed} framed from the teardown's words.` : "Every shot's framing measured closely." },
    { id: "timing", label: "Cut points", score: pct(1 - timing / 0.5), note: `Each cut within ${timing.toFixed(2)} s of the film's, ${ref.cutsMeasured ? "measured by ffmpeg" : "as Gemini read them off it"}.` },
    { id: "length", label: "Length", score: pct(refLen ? 1 - Math.abs(refLen - repLen) / refLen : 0), note: `${repLen.toFixed(1)} s against ${refLen.toFixed(1)} s.` },
    { id: "cuts", label: "Transitions", score: pct(cutsAgree), note: `${Math.round(cutsAgree * Math.max(0, n - 1))} of ${Math.max(0, n - 1)} come in the same way.` },
    { id: "titles", label: "Titles", score: pct(refTitles ? 1 - Math.abs(refTitles - repTitles) / refTitles : repTitles ? 0.6 : 1), note: `${repTitles} titles, ${refTitles} in the reference.` },
    { id: "colour", label: "Colour", score: pct(colour), note: palette.length ? "Its palette against the replica's grounds and type." : "No palette measured." },
    { id: "subjects", label: "As it was", score: pct(s.shots.length ? 1 - standIns / s.shots.length : 1), note: standIns ? `${standIns} live-action shot${standIns > 1 ? "s" : ""} stood in by your device.` : "Every shot shows what it showed." },
  ]
  // how closely each shot was measured weighs as much as the cut points: a replica framed from words isn't accurate
  const W: Record<string, number> = { measured: 0.2, shots: 0.1, timing: 0.2, length: 0.05, cuts: 0.15, titles: 0.1, colour: 0.1, subjects: 0.1 }
  const rows: FidelityRow[] = film.map((x, i) => {
    const sh = s.shots[i]
    const d = sh?.device
    return {
      i,
      at: x.at,
      refDur: x.dur,
      repDur: sh?.dur ?? 0,
      what: x.what,
      refCut: cutFromWords(x.cut),
      repCut: sh?.cut ?? "cut",
      framing: d ? `${ANGLES.find((a) => a.id === (d.from.angle ?? "front"))?.name ?? d.from.angle}${d.from.zoom && d.from.zoom !== 1 ? ` ×${d.from.zoom}` : ""}${d.to ? " → glide" : d.move ? ` · ${MOTIONS.find((m) => m.id === d.move)?.name ?? d.move}` : ""}` : sh?.layers?.some((l) => l.kind === "component") ? "The interface" : sh ? "Words" : "",
      standIn: !!sh && /Live action in the reference/.test(sh.why),
      titles: (sh?.layers ?? []).filter((l) => l.kind === "text").length,
    }
  })
  return { score: Math.round(parts.reduce((a, p) => a + p.score * W[p.id], 0)), parts, rows }
}
