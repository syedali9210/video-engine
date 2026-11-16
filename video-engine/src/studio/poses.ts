// Mockup studio — camera angles for stills, and the moves a video makes from them.
// A pose turns the device (yaw/pitch/roll), places the camera (elevation, azimuth, lens) and frames it (zoom, where 1
// fills the frame with a margin). Moves follow TASTE's grammar: arrivals ease out (expo), sweeps ease in-out (sine),
// loops are periodic so the last frame meets the first, and nothing bobs.
import type { DeviceId } from "../devices"

export type Pose = {
  yaw: number
  pitch: number
  roll: number
  /** camera height above the device, degrees */
  elev: number
  /** camera around the device, degrees */
  azim: number
  /** vertical field of view, degrees: low is a long lens, flatter perspective */
  fov: number
  zoom: number
  /** how far the device floats above the floor its shadow falls on, pt */
  lift: number
  /** fraction of the frame to shift the device up (+) or down */
  rise: number
  /** fraction of the frame to shift the device right (+) or left: with a close zoom, which part of it fills the shot */
  pan: number
}

export const BASE: Pose = { yaw: 0, pitch: 0, roll: 0, elev: 6, azim: 0, fov: 26, zoom: 1, lift: 50, rise: 0, pan: 0 }

export type AngleId = "front" | "hero" | "heroLeft" | "tilt" | "float" | "flat" | "low" | "side" | "back" | "macro" | "top" | "worm" | "profile" | "dutch" | "lying" | "edge" | "over"

export const ANGLES: { id: AngleId; name: string; pose: Partial<Pose>; mac?: Partial<Pose> }[] = [
  { id: "hero", name: "¾ right", pose: { yaw: -26, elev: 9, roll: 0 }, mac: { yaw: -24, elev: 18 } },
  { id: "heroLeft", name: "¾ left", pose: { yaw: 26, elev: 9 }, mac: { yaw: 24, elev: 18 } },
  { id: "front", name: "Front", pose: { elev: 4 }, mac: { elev: 14 } },
  { id: "side", name: "Side", pose: { yaw: -58, elev: 7 }, mac: { yaw: -52, elev: 16 } },
  { id: "tilt", name: "Tilted", pose: { pitch: -20, yaw: -12, elev: 24 }, mac: { yaw: -10, elev: 32 } },
  { id: "float", name: "Floating", pose: { yaw: -20, pitch: -12, roll: 8, elev: 16, lift: 200 }, mac: { yaw: -20, roll: 4, elev: 24, lift: 120 } },
  { id: "flat", name: "Flat lay", pose: { pitch: -90, roll: -16, elev: 62, lift: 0, fov: 22 }, mac: { yaw: -18, elev: 64, fov: 22 } },
  { id: "low", name: "Low", pose: { yaw: 18, pitch: 6, elev: -6, fov: 30 }, mac: { yaw: 16, elev: 6, fov: 30 } },
  { id: "back", name: "Back", pose: { yaw: 154, elev: 8 }, mac: { yaw: 158, elev: 18 } },
  // close on the camera: the launch films' cold open, the plateau filling the frame
  { id: "macro", name: "Macro", pose: { yaw: 196, pitch: 8, elev: 10, zoom: 2.5, rise: -0.7, pan: 0.12, fov: 22 }, mac: { yaw: 160, elev: 22, zoom: 2.2, rise: -0.3, fov: 22 } },
  // straight down onto it lying on the table, turned a little off square: a flat lay seen from above
  { id: "top", name: "Top down", pose: { pitch: -90, roll: -22, elev: 86, lift: 0, fov: 20 }, mac: { yaw: -16, elev: 80, fov: 20 } },
  // from below, a wide lens: it towers
  { id: "worm", name: "Worm's eye", pose: { yaw: -16, pitch: 16, elev: -16, fov: 36, rise: -0.04 }, mac: { yaw: -18, elev: -2, fov: 34 } },
  // edge on: the band, the buttons, the thinness
  { id: "profile", name: "Profile", pose: { yaw: -86, elev: 4, fov: 22 }, mac: { yaw: -84, elev: 10, fov: 22 } },
  // rolled off the level: energy, for a quick shot between steadier ones
  { id: "dutch", name: "Dutch", pose: { yaw: -20, roll: 13, elev: 8 }, mac: { yaw: -18, roll: 7, elev: 16 } },
  // lying back on a table, seen from three quarters above
  { id: "lying", name: "Lying ¾", pose: { pitch: -62, yaw: -24, roll: -12, elev: 34, lift: 0, fov: 24 }, mac: { yaw: -30, elev: 40, fov: 24 } },
  // close along the edge: the screen receding from the band in the foreground
  { id: "edge", name: "Edge macro", pose: { yaw: -64, pitch: 4, elev: 6, zoom: 2.1, pan: 0.16, fov: 20 }, mac: { yaw: -58, elev: 12, zoom: 1.9, pan: 0.12, fov: 20 } },
  // looking down over the top edge, the screen falling away below it
  { id: "over", name: "Over the top", pose: { pitch: -50, elev: 48, zoom: 1.25, rise: 0.06, fov: 24 }, mac: { elev: 56, zoom: 1.2, fov: 24 } },
]

export function angle(id: AngleId, device: DeviceId): Pose {
  const a = ANGLES.find((x) => x.id === id) ?? ANGLES[0]
  return { ...BASE, ...(device === "macbook" ? { lift: 0, ...a.mac } : a.pose) }
}

/* ---------------- moves ---------------- */

export type MotionId = "still" | "reveal" | "spin" | "turn" | "pull" | "orbit" | "sway" | "push" | "rise" | "tour" | "drift" | "flip" | "framings" | "turntable" | "crane" | "arc" | "vertigo" | "fall" | "whip" | "roll" | "dive"

export const MOTIONS: { id: MotionId; name: string; hint: string; loops?: boolean }[] = [
  { id: "still", name: "Still", hint: "The device holds the shot; only the screen moves." },
  { id: "reveal", name: "Reveal", hint: "Turns in from the side and settles on the shot, then drifts slowly." },
  { id: "spin", name: "Spin in", hint: "Starts on its back and spins round to the screen, the way a keynote shows a new device." },
  { id: "turn", name: "Hero turn", hint: "One slow, continuous turn past the shot, easing in and out, the camera drifting closer." },
  { id: "pull", name: "Pull back", hint: "Starts close on the device and pulls back to the whole shot." },
  { id: "orbit", name: "Orbit", hint: "The camera sweeps from one side of the shot to the other." },
  { id: "sway", name: "Sway", hint: "A slow turn either side of the shot. Loops seamlessly.", loops: true },
  { id: "push", name: "Push in", hint: "The camera moves in towards the screen." },
  { id: "rise", name: "Rise", hint: "Comes up from below the frame and settles, then holds." },
  { id: "tour", name: "Tour", hint: "Three angles in one take: the shot, its mirror, then face-on and close." },
  { id: "drift", name: "Drift", hint: "A slow sideways glide with a slight push: for close-ups and macro shots." },
  { id: "flip", name: "Flip in", hint: "Starts edge-on and turns to face the camera, then glides on: the reveal of a product film." },
  { id: "framings", name: "Two framings", hint: "Glides from where the shot starts to where it ends, on your own curve. Pick Start or End, then frame it on the stage." },
  { id: "turntable", name: "Turntable", hint: "One whole turn at an even speed, the way a product turns on a stand. Loops seamlessly.", loops: true },
  { id: "crane", name: "Crane", hint: "Starts high, looking down, and lowers onto the shot." },
  { id: "arc", name: "Arc", hint: "The camera travels round it in a wide arc, closing in a little." },
  { id: "vertigo", name: "Dolly zoom", hint: "The lens widens as the camera closes in: it stays the same size while the space around it stretches." },
  { id: "fall", name: "Fall", hint: "Drops into the shot under gravity, bounces, and settles, each bounce lower." },
  { id: "whip", name: "Whip", hint: "Drifts, then swings away fast at the end: a cut hides in the swing." },
  { id: "roll", name: "Roll in", hint: "Rolls in a quarter turn and settles, then drifts." },
  { id: "dive", name: "Dive in", hint: "Turns to face the camera and pushes in until the screen fills the frame: cut to the screen itself." },
]

const clamp = (x: number) => Math.min(1, Math.max(0, x))
const expoOut = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x))
const quintOut = (x: number) => 1 - (1 - x) ** 5
const sineInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
export const mix = (a: Pose, b: Pose, k: number): Pose => Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof Pose] + (b[key as keyof Pose] - a[key as keyof Pose]) * k])) as Pose
/** How high something dropped onto a shot still is (1 at the start, 0 at rest), `t` seconds in: it falls under
    gravity, lands at `land` seconds, and each bounce leaves with `e` of the speed it came in with. */
export function fallHeight(t: number, land = 0.55, e = 0.38) {
  if (t < land) return 1 - (t / land) ** 2
  const g = 2 / land ** 2
  let v = 2 / land
  let rest = t - land
  for (let i = 0; i < 8; i++) {
    v *= e
    const span = (2 * v) / g
    if (rest < span) return v * rest - 0.5 * g * rest * rest
    rest -= span
  }
  return 0
}
/** after a move lands: a slow, small turn, so a long take never freezes */
const drift = (t: number, from: number) => (t > from ? 3 * Math.sin((2 * Math.PI * (t - from)) / 9) : 0)

/** An easing curve, the way CSS writes one ("cubic-bezier(x1, y1, x2, y2)"), as a function of 0 → 1. */
export function curve(css: string | undefined) {
  const n = (css?.match(/-?[\d.]+/g) ?? []).map(Number)
  const [x1, y1, x2, y2] = n.length === 4 ? n : [0.65, 0, 0.35, 1]
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
  return (u: number) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    // x(t) only climbs, so halving the interval finds the t for x = u
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (bx(mid) < u) lo = mid
      else hi = mid
    }
    return by((lo + hi) / 2)
  }
}

/** Where the shot is at `t` seconds into a `dur`-second video that starts from pose `p`. */
export function move(id: MotionId, p: Pose, t: number, dur: number): Pose {
  const u = clamp(t / dur)
  switch (id) {
    case "reveal": {
      const k = expoOut(clamp(t / 1.2))
      const from = { ...p, yaw: p.yaw - 40, pitch: p.pitch + 10, rise: p.rise - 0.04, zoom: p.zoom * 0.92 }
      const at = mix(from, p, k)
      return { ...at, yaw: at.yaw + drift(t, 1.2) }
    }
    case "spin": {
      // a full turn less the shot's own yaw, so it lands facing the camera the way the shot does
      const len = Math.min(2.2, dur * 0.6)
      const k = quintOut(clamp(t / len))
      const from = { ...p, yaw: p.yaw + 180, pitch: p.pitch + 6, zoom: p.zoom * 0.86, rise: p.rise - 0.03 }
      const at = mix(from, p, k)
      return { ...at, yaw: at.yaw + drift(t, len) }
    }
    case "turn": {
      const k = sineInOut(u)
      return { ...p, yaw: p.yaw - 22 + 34 * k, zoom: p.zoom * (1 + 0.1 * k) }
    }
    case "pull": {
      const k = expoOut(clamp(t / Math.min(2.6, dur * 0.8)))
      return { ...p, zoom: p.zoom * (2.1 - 1.1 * k), yaw: p.yaw + 10 * (1 - k), rise: p.rise - 0.08 * (1 - k) }
    }
    case "orbit":
      return { ...p, azim: p.azim - 28 + 56 * sineInOut(u) }
    case "sway":
      return { ...p, yaw: p.yaw + 18 * Math.sin(2 * Math.PI * u) }
    case "push":
      return { ...p, zoom: p.zoom * (1 + 0.45 * sineInOut(u)), yaw: p.yaw * (1 - 0.35 * sineInOut(u)) }
    case "rise": {
      const k = expoOut(clamp(t / 1.1))
      return { ...p, rise: p.rise - 0.55 * (1 - k), pitch: p.pitch + 14 * (1 - k), yaw: p.yaw - 10 * (1 - k) }
    }
    case "drift": {
      const k = sineInOut(u)
      return { ...p, pan: p.pan + 0.05 - 0.1 * k, zoom: p.zoom * (1 + 0.07 * k), yaw: p.yaw - 4 + 8 * k }
    }
    case "flip": {
      // edge-on, a little low and close, turning to face the camera; then a slow glide so the take never freezes
      const len = Math.min(1.8, dur * 0.55)
      const k = expoOut(clamp(t / len))
      const from = { ...p, yaw: p.yaw + 88, pitch: p.pitch + 4, zoom: p.zoom * 1.12, rise: p.rise + 0.02 }
      const at = mix(from, p, k)
      return { ...at, yaw: at.yaw + drift(t, len), zoom: at.zoom * (1 + 0.05 * sineInOut(clamp((t - len) / Math.max(0.1, dur - len)))) }
    }
    case "turntable":
      return { ...p, yaw: p.yaw + 360 * u }
    case "crane": {
      const len = Math.min(2.6, dur * 0.7)
      const from = { ...p, elev: Math.min(80, p.elev + 46), pitch: p.pitch - 10, zoom: p.zoom * 0.88, rise: p.rise + 0.05 }
      const at = mix(from, p, quintOut(clamp(t / len)))
      return { ...at, yaw: at.yaw + drift(t, len) }
    }
    case "arc": {
      const k = sineInOut(u)
      return { ...p, azim: p.azim - 55 + 85 * k, zoom: p.zoom * (1 + 0.16 * k), elev: p.elev + 6 * Math.sin(Math.PI * u) }
    }
    case "vertigo": {
      const k = sineInOut(u)
      return { ...p, fov: p.fov * (0.55 + 1.3 * k), yaw: p.yaw + 4 * k }
    }
    case "fall": {
      const h = fallHeight(t)
      return { ...p, rise: p.rise + 0.85 * h, pitch: p.pitch + 9 * h, yaw: p.yaw - 7 * h + drift(t, 2.2) }
    }
    case "whip": {
      // into the cut: an ease-in on the last fifth, so the swing is fastest as the shot ends
      const k = clamp((u - 0.78) / 0.22) ** 3
      return { ...p, yaw: p.yaw - 6 + 8 * u + 75 * k, azim: p.azim + 10 * k, zoom: p.zoom * (1 + 0.04 * u) }
    }
    case "roll": {
      const len = Math.min(1.6, dur * 0.5)
      const from = { ...p, roll: p.roll - 90, zoom: p.zoom * 0.82, yaw: p.yaw - 20 }
      const at = mix(from, p, expoOut(clamp(t / len)))
      return { ...at, yaw: at.yaw + drift(t, len) }
    }
    case "dive": {
      // turns to face the camera as it pushes in, faster and faster (into a cut, accelerate)
      const k = sineInOut(u)
      return { ...p, yaw: p.yaw * (1 - k), pitch: p.pitch * (1 - k), roll: p.roll * (1 - k), elev: p.elev * (1 - k), rise: p.rise * (1 - k), pan: p.pan * (1 - k), zoom: p.zoom * 4.6 ** (u * u) }
    }
    case "tour": {
      // hold, glide, hold, glide, hold: each glide in-out, overlapping nothing, so every stop reads as a shot
      const mirror = { ...p, yaw: -p.yaw || 22, elev: p.elev + 4 }
      const close = { ...p, yaw: 0, pitch: p.pitch - 6, elev: p.elev + 2, zoom: p.zoom * 1.25 }
      if (u < 0.22) return p
      if (u < 0.42) return mix(p, mirror, sineInOut((u - 0.22) / 0.2))
      if (u < 0.6) return mirror
      if (u < 0.8) return mix(mirror, close, sineInOut((u - 0.6) / 0.2))
      return close
    }
    default:
      return p
  }
}
