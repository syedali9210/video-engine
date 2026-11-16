// Studio — the cut grammar. Where a film feels made or thrown together is its cuts: a bare cut between two framings
// that move different ways jolts, a dip to a flat colour stalls, a ground that changes on a hard cut flickers, two alike
// framings cut together jump. Every cut here has a carrier, the thing on screen that brings the next shot in:
//   - the camera's own move going on across a hard cut (one glide cut in two);
//   - a whip in the direction the camera was swinging;
//   - a push that goes through the frame into the next shot;
//   - a shape (an iris opening from the subject);
//   - a line (a wipe that carries a new colour across).
// The planner reads the two shots either side of a cut (how each one's camera moves at that moment, measured from the
// same poses the renderer draws; what's in them; their grounds) and picks the carrier. It can turn the next shot's
// glide round so the move runs on, rather than reversing at the cut. The checker names a cut with nothing to carry it.
// Pure, with no DOM: the lab's server runs it too.
import { angle, curve, mix, move, type AngleId, type MotionId, type Pose } from "./poses.ts"
import type { Transition } from "./comp.ts"
import type { Finding, Framing, ScriptShot, TemplateScript } from "./script.ts"

/** The transitions where something on screen brings the next shot in. */
export const CARRIERS: Transition[] = ["whip", "through", "iris", "wipe", "flash"]
const NAME: Record<Transition, string> = { cut: "a hard cut", fade: "a dip", dissolve: "a dissolve", push: "a push", zoom: "a zoom", blur: "a blur", flash: "a colour flash", whip: "a whip", through: "a push through", iris: "an iris", wipe: "a light wipe" }
export const cutName = (t: Transition | undefined) => NAME[t ?? "cut"] ?? t ?? "a hard cut"
/** "Whip", "Iris": a cut's name on its own, capitalised */
const label = (t: Transition) => {
  const n = cutName(t).replace(/^an? /, "")
  return n[0].toUpperCase() + n.slice(1)
}

/* ---------------- how a shot moves at its ends ---------------- */

/** The picture's motion at a moment, per second: x right, y down (fractions of the frame), z the push (log of the
    zoom; positive is closer), spin degrees of roll. */
export type Velocity = { x: number; y: number; z: number; spin: number }
type View = { x: number; y: number; zoom: number }
/** What a shot's camera does, whichever way it was written down: a script's shot or a composition's scene. */
export type ShotMotion = { dur: number; device?: string; from?: Framing; to?: Framing; move?: MotionId; ease?: string; view?: View; view2?: View }

export const shotMotion = (sh: ScriptShot): ShotMotion => ({
  dur: sh.dur,
  device: sh.device?.id && sh.device.id !== "{device}" ? sh.device.id : undefined,
  from: sh.device?.from,
  to: sh.device?.to,
  move: sh.device?.move,
  ease: sh.device?.ease ?? sh.view?.ease,
  view: sh.view?.from,
  view2: sh.view?.to,
})

/** The device's pose for a framing: the angle's own, with the framing's turns and offsets on it (the renderer's
    cameraPose, without a drag). */
function poseOf(device: string, f: Framing = {}): Pose {
  const p = angle((f.angle ?? "front") as AngleId, device as never)
  return { ...p, yaw: p.yaw + (f.yaw ?? 0), pitch: p.pitch + (f.pitch ?? 0), roll: p.roll + (f.roll ?? 0), rise: p.rise + (f.rise ?? 0), pan: p.pan + (f.pan ?? 0), elev: Math.max(-30, Math.min(85, p.elev + (f.elev ?? 0))), zoom: p.zoom * (f.zoom ?? 1), fov: f.fov ?? p.fov }
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
function poseAt(m: ShotMotion, t: number): Pose | null {
  if (!m.from) return null
  const dev = m.device ?? "iphone"
  const a = poseOf(dev, m.from)
  if (m.to) return mix(a, poseOf(dev, { ...m.from, ...m.to }), curve(m.ease)(clamp01(t / Math.max(0.1, m.dur))))
  return move(m.move ?? "still", a, t, m.dur)
}
function viewAt(m: ShotMotion, t: number): View | null {
  if (!m.view) return null
  if (!m.view2) return m.view
  const k = curve(m.ease)(clamp01(t / Math.max(0.1, m.dur)))
  return { x: m.view.x + (m.view2.x - m.view.x) * k, y: m.view.y + (m.view2.y - m.view.y) * k, zoom: m.view.zoom + (m.view2.zoom - m.view.zoom) * k }
}

const STILL: Velocity = { x: 0, y: 0, z: 0, spin: 0 }
/** How the picture moves at a shot's start ("in") or end ("out"), measured over the first or last tenth of a second. A
    turn reads as sideways motion (120° of yaw is about a frame's width), a camera rising as the picture going down. */
export function velocity(m: ShotMotion, at: "in" | "out"): Velocity {
  const dt = Math.min(0.1, m.dur / 4)
  const [t0, t1] = at === "in" ? [0, dt] : [m.dur - dt, m.dur]
  const a = poseAt(m, t0)
  const b = poseAt(m, t1)
  const v: Velocity = { ...STILL }
  if (a && b) {
    v.x += (b.pan - a.pan + (b.yaw - a.yaw) / 120 - (b.azim - a.azim) / 120) / dt
    v.y += (-(b.rise - a.rise) - (b.elev - a.elev) / 160) / dt
    // closer, or a narrowing lens (a dolly zoom reads as a push)
    v.z += (Math.log(b.zoom / a.zoom) - Math.log(b.fov / a.fov) * 0.5) / dt
    v.spin += (b.roll - a.roll) / dt
  }
  const p = viewAt(m, t0)
  const q = viewAt(m, t1)
  if (p && q) {
    // the flat camera's middle moving right moves what's in the frame left
    v.x += (-(q.x - p.x) * q.zoom) / dt
    v.y += (-(q.y - p.y) * q.zoom) / dt
    v.z += Math.log(q.zoom / p.zoom) / dt
  }
  return v
}
const lateral = (v: Velocity) => Math.hypot(v.x, v.y)
const speed = (v: Velocity) => lateral(v) + Math.abs(v.z) * 0.5 + Math.abs(v.spin) / 90
const fast = (v: Velocity) => lateral(v) > 0.22 || Math.abs(v.spin) > 45
const pushing = (v: Velocity) => v.z > 0.3
/** fast, and sideways more than up or down: what a whip (a horizontal swing) can carry on */
const swinging = (v: Velocity) => fast(v) && Math.abs(v.x) >= Math.abs(v.y)
/** cosine of the angle between two sideways motions (0 when either barely moves) */
const sameWay = (a: Velocity, b: Velocity) => (lateral(a) > 0.03 && lateral(b) > 0.03 ? (a.x * b.x + a.y * b.y) / (lateral(a) * lateral(b)) : 0)

/** Two device shots framed alike (the same angle, about as close, about as turned): cut together, the picture jumps. */
function alike(a: ScriptShot, b: ScriptShot) {
  const fa = a.device ? { ...a.device.from, ...a.device.to } : undefined
  const fb = b.device?.from
  if (!fa || !fb) return false
  const za = fa.zoom ?? 1
  const zb = fb.zoom ?? 1
  return (fa.angle ?? "front") === (fb.angle ?? "front") && Math.max(za, zb) / Math.min(za, zb) < 1.3 && Math.abs((fa.yaw ?? 0) - (fb.yaw ?? 0)) < 14 && Math.abs((fa.rise ?? 0) - (fb.rise ?? 0)) < 0.25
}
const endOf = (sh: ScriptShot): Framing => ({ ...sh.device!.from, ...sh.device!.to })
/** The next shot starts where this one stopped (the same angle, place, turn and distance): a move cut in two. */
function continuous(a: ScriptShot, b: ScriptShot) {
  if (!a.device || !b.device) return false
  const e = endOf(a)
  const f = b.device.from
  return (e.angle ?? "front") === (f.angle ?? "front") && Math.abs((e.pan ?? 0) - (f.pan ?? 0)) < 0.05 && Math.abs((e.rise ?? 0) - (f.rise ?? 0)) < 0.05 && Math.abs((e.yaw ?? 0) - (f.yaw ?? 0)) < 4 && Math.abs(Math.log((e.zoom ?? 1) / (f.zoom ?? 1))) < 0.08
}
// the moves a shot arrives with: an iris or a push through suits them better than a hard cut into a standing start
const ARRIVALS: MotionId[] = ["rise", "fall", "crane", "spin", "flip", "roll", "reveal"]

/* ---------------- the planner ---------------- */

/** `mirror`: turn the next shot's glide round; `carry`: start it where this one stopped */
export type CutPlan = { cut: Transition; why: string; rule: string; mirror?: boolean; carry?: boolean }
const groundOf = (sh: ScriptShot, film: { ground: string }) => `${sh.look ?? ""}|${sh.ground ?? film.ground}|${sh.paint ?? ""}`

/** Can its sideways move be turned round without changing the shot (a glide between two framings, a drift)? */
const turnable = (sh: ScriptShot) => !!sh.device && (sh.device.to ? sh.device.to.pan !== undefined || sh.device.to.yaw !== undefined : sh.device.move === "drift")
const r2 = (v: number) => Math.round(v * 100) / 100
/** The same shot gliding the other way: a glide's sideways change mirrored about where it starts; a drift written as
    its two framings, the other way round. */
export function turned(sh: ScriptShot): ScriptShot {
  const d = sh.device
  if (!d) return sh
  if (d.to) {
    const to = { ...d.to }
    for (const k of ["pan", "yaw"] as const) if (d.to[k] !== undefined) to[k] = r2(2 * (d.from[k] ?? 0) - d.to[k]!)
    return { ...sh, device: { ...d, to } }
  }
  if (d.move === "drift") {
    const f = d.from
    return { ...sh, device: { ...d, move: undefined, from: { ...f, pan: r2((f.pan ?? 0) - 0.05), yaw: (f.yaw ?? 0) + 4 }, to: { pan: r2((f.pan ?? 0) + 0.05), yaw: (f.yaw ?? 0) - 4, zoom: r2((f.zoom ?? 1) * 1.07) }, ease: "cubic-bezier(0.37, 0, 0.63, 1)" } }
  }
  return sh
}

/** The same shot, starting where `a` stopped (its place, turn and distance), its glide moved with it. */
export function continued(a: ScriptShot, b: ScriptShot): ScriptShot {
  const d = b.device
  if (!a.device || !d) return b
  const e = endOf(a)
  const from = { ...d.from }
  const to = d.to ? { ...d.to } : undefined
  for (const k of ["pan", "rise", "yaw"] as const) {
    const delta = (e[k] ?? 0) - (d.from[k] ?? 0)
    from[k] = r2((d.from[k] ?? 0) + delta)
    if (to && to[k] !== undefined) to[k] = r2(to[k]! + delta)
  }
  const k = (e.zoom ?? 1) / (d.from.zoom ?? 1)
  from.zoom = r2(e.zoom ?? 1)
  if (to?.zoom !== undefined) to.zoom = r2(to.zoom * k)
  return { ...b, device: { ...d, from, ...(to ? { to } : {}) } }
}

/** The cut into shot `b` from shot `a`, with what carries it. `recent`: the cuts before it in the film, so one carrier
    isn't used three times running. */
export function planCut(a: ScriptShot, b: ScriptShot, film: { ground: string }, recent: Transition[] = [], prefer?: Partial<Record<Transition, number>>): CutPlan {
  const out = velocity(shotMotion(a), "out")
  const inn = velocity(shotMotion(b), "in")
  const aDev = !!a.device
  const bDev = !!b.device
  const recolour = groundOf(a, film) !== groundOf(b, film)
  const tired = (t: Transition) => recent.length >= 2 && recent.at(-1) === t && recent.at(-2) === t
  // where two carriers would both do, the one the film (or your taste) prefers first
  const pick = (...ts: Transition[]) => {
    const order = prefer ? [...ts].sort((x, y) => (prefer[y] ?? 1) - (prefer[x] ?? 1)) : ts
    return order.find((t) => !tired(t)) ?? order[0]
  }
  const plan = (cut: Transition, why: string, rule = "5.2", mirror = false, carry = false): CutPlan => ({ cut, why, rule, ...(mirror ? { mirror } : {}), ...(carry ? { carry } : {}) })

  // a shot that ends in its own transition: the whip swings out, the dive goes into the screen
  if (a.device?.move === "whip") return plan("whip", "The shot swings away fast at its end: the whip carries on that way into the next.")
  if (a.device?.move === "dive" || out.z > 1.1) return plan("through", "The camera is diving into the screen: it goes on through the frame into the next shot.")

  if (aDev && bDev) {
    if (recolour) {
      if (swinging(out)) return plan("whip", "The ground changes here: a whip, in the direction the camera was swinging, carries the new colour in.", "5.4")
      if (pushing(out)) return plan("through", "The ground changes here: the push goes on through the frame and lands in the new colour.", "5.4")
      return plan(pick("wipe", "iris"), "The ground changes here: a line carries the new colour across instead of it flipping on a cut.", "5.4")
    }
    const way = sameWay(out, inn)
    // the same way across the cut: framed alike, it starts where this one stopped (else it would jump back)
    const runOn = alike(a, b) && !continuous(a, b)
    if (way < -0.2 && turnable(b)) return plan("cut", "The next glide is turned to go the way this one was going, so one move runs across the cut.", "5.3", true, runOn)
    if (way > 0.3) return plan("cut", runOn ? "Both glide the same way: the next starts where this one stopped, one dolly cut in two." : "Both glide the same way: the move itself carries the cut.", "5.3", false, runOn)
    if (swinging(out)) return plan("whip", "It swings away fast: the whip carries on in that direction into the next shot.", "5.3")
    if (fast(out)) return plan("through", "It's moving fast up or down as it ends: a push through carries the speed into the next shot.", "5.3")
    if (pushing(out) && inn.z > 0.08) return plan("cut", "Both push in: one push, cut in two on the beat.", "5.3")
    if (pushing(out)) return plan("through", "It's pushing in as it ends: the push goes on through the frame into the next shot.", "5.3")
    if (alike(a, b)) return plan("through", "Two framings this alike would jump on a hard cut: a push through carries it.", "5.5")
    if (b.device?.move && ARRIVALS.includes(b.device.move) && speed(out) < 0.05) return plan(pick("iris", "through"), "The next shot arrives on its own move from a still end: it opens out of the subject instead of starting cold.", "5.2")
    return plan("cut", "Two distinct framings, a clean cut on the beat.", "5.1")
  }
  if (aDev && !bDev) {
    if (pushing(out)) return plan("through", "The push goes on through the frame and the words arrive on the other side.", "5.2")
    if (swinging(out)) return plan("whip", "The swing carries the words in.", "5.2")
    return plan(pick("iris", "wipe"), "The card opens out of the device: one shape brings the words in.", "5.2")
  }
  if (!aDev && bDev) {
    if (swinging(inn) && !(b.device?.move && ARRIVALS.includes(b.device.move))) return plan("whip", "The shot comes in swinging: a whip lands it.", "5.2")
    if (b.device?.move && ARRIVALS.includes(b.device.move)) return plan(pick("through", "iris"), "The words push past and the device arrives behind them.", "5.2")
    return plan(pick("through", "wipe"), "The words push past the camera into the next shot.", "5.2")
  }
  return plan(pick("wipe", "iris"), "One card hands to the next on a line, never a dip to an empty colour.", "5.2")
}

export type CutChange = { what: string; why: string; rule: string }
/** Every cut of a film given its carrier (guidelines §5). A designed colour flash between two device shots stays
    (twice a film at most). Returns the film and what changed. */
export function smoothCuts(s: TemplateScript, prefer?: Partial<Record<Transition, number>>): { script: TemplateScript; changes: CutChange[] } {
  const shots = s.shots.map((x) => ({ ...x }))
  const changes: CutChange[] = []
  const used: Transition[] = []
  let flashes = 0
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1]
    const was = shots[i].cut ?? "cut"
    if (was === "flash" && a.device && shots[i].device && flashes < 2) {
      flashes++
      used.push("flash")
      continue
    }
    const p = planCut(a, shots[i], s, used, prefer)
    if (p.mirror) {
      shots[i] = turned(shots[i])
      changes.push({ what: `“${shots[i].name}”: its glide turned round`, why: p.why, rule: p.rule })
    }
    if (p.carry) {
      shots[i] = continued(a, shots[i])
      changes.push({ what: `“${shots[i].name}”: starts where “${a.name}” stopped`, why: "Framed alike, the next shot of a move picks up from the last one's last frame, so the cut doesn't jump.", rule: "5.3" })
    }
    if (p.cut !== was) {
      shots[i] = { ...shots[i], cut: p.cut }
      changes.push({ what: `“${shots[i].name}”: ${cutName(was)} → ${cutName(p.cut)}`, why: p.why, rule: p.rule })
    }
    used.push(p.cut)
  }
  return { script: { ...s, shots }, changes }
}

/** A cut as a teardown wrote it in words ("whip pan", "match cut on the swing", "dip to black"), as the engine's. */
export function cutFromWords(text = ""): Transition {
  const t = text.toLowerCase()
  if (/whip|swish|swing/.test(t)) return "whip"
  if (/iris|circle|aperture/.test(t)) return "iris"
  if (/wipe|line|sweep/.test(t)) return "wipe"
  if (/flash|light leak|false colou?r|white/.test(t)) return "flash"
  if (/zoom (in|through)|push through|through|into the|dive/.test(t)) return "through"
  if (/dissolve|cross ?fade|crossfade|overlap/.test(t)) return "dissolve"
  if (/fade|dip|black/.test(t)) return "fade"
  if (/slide|push/.test(t)) return "push"
  if (/blur|focus/.test(t)) return "blur"
  if (/zoom/.test(t)) return "zoom"
  return "cut"
}
/** The engine's transitions, for a model to choose from. */
export const TRANSITION_IDS: Transition[] = ["cut", "whip", "through", "iris", "wipe", "flash", "push", "zoom", "blur", "dissolve", "fade"]

/* ---------------- the checker ---------------- */

export type CutVerdict = { at: number; cut: Transition; verdict: "carried" | "clean" | "abrupt"; why: string }
/** Each cut of a film, judged: carried (something on screen brings the next shot in), clean (a hard cut between
    distinct framings) or abrupt (it jumps, reverses, flips colour, dips, or stalls). */
export function cutReport(s: TemplateScript): CutVerdict[] {
  const out: CutVerdict[] = []
  let flashes = 0
  for (let i = 1; i < s.shots.length; i++) {
    const a = s.shots[i - 1]
    const b = s.shots[i]
    const cut = b.cut ?? "cut"
    const va = velocity(shotMotion(a), "out")
    const vb = velocity(shotMotion(b), "in")
    const say = (verdict: CutVerdict["verdict"], why: string) => out.push({ at: i, cut, verdict, why })
    if (cut === "flash" && ++flashes > 2) say("abrupt", "A third colour flash: designed transitions lose their point when they're every cut.")
    else if (cut === "fade") say("abrupt", "It dips to a flat colour: the screen goes empty between two shots.")
    else if (cut === "dissolve" && a.device && b.device) say("abrupt", "Two device shots dissolve: the devices ghost through each other.")
    else if (CARRIERS.includes(cut)) say("carried", `${label(cut)} carries it.`)
    else if (cut !== "cut") say("clean", `${label(cut)}.`)
    else if (groundOf(a, s) !== groundOf(b, s)) say("abrupt", "The ground flips colour on a hard cut.")
    else if (a.device && b.device && sameWay(va, vb) < -0.2) say("abrupt", "The camera's move reverses at the cut.")
    else if (a.device && b.device && continuous(a, b) && sameWay(va, vb) > 0.3) say("carried", "The move runs on from where the last shot stopped: one move, cut in two.")
    else if (a.device && b.device && alike(a, b)) say("abrupt", "Two alike framings: the picture jumps.")
    else if (a.device && b.device && sameWay(va, vb) > 0.3) say("carried", "The move runs on across the cut.")
    else if (a.device && b.device && pushing(va) && vb.z > 0.08) say("carried", "One push, cut in two.")
    else if (!a.device !== !b.device || (!a.device && !b.device)) say("abrupt", "A bare cut between a card and a shot: nothing carries it.")
    else if (speed(va) < 0.02 && speed(vb) < 0.02) say("clean", "Two still frames cut together: clean, but nothing carries it.")
    else say("clean", "Two distinct framings, a clean cut.")
  }
  return out
}

/** How smooth a film's cuts are, 0 to 100: carried cuts count whole, clean ones most of the way, abrupt ones little. */
export function cutScore(s: TemplateScript) {
  const r = cutReport(s)
  if (!r.length) return 100
  return Math.round((r.reduce((a, x) => a + (x.verdict === "carried" ? 1 : x.verdict === "clean" ? 0.72 : 0.15), 0) / r.length) * 100)
}

/** The cuts the checker flags, as findings. */
export function lintCuts(s: TemplateScript): Finding[] {
  const RULE: Record<string, string> = { dip: "cut.dip", flash: "cut.flash", ground: "cut.ground", reverse: "cut.reverse", jump: "cut.jump", bare: "cut.bare" }
  return cutReport(s)
    .filter((c) => c.verdict === "abrupt")
    .map((c) => {
      const k = /dips/.test(c.why) ? "dip" : /flash/.test(c.why) ? "flash" : /ground/.test(c.why) ? "ground" : /reverses/.test(c.why) ? "reverse" : /alike/.test(c.why) ? "jump" : "bare"
      return { level: "warn" as const, rule: RULE[k], shot: c.at, text: `Into “${s.shots[c.at].name}”: ${c.why[0].toLowerCase()}${c.why.slice(1)}` }
    })
}
