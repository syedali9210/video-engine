// The film's music, scored to its cuts: synthesized here (nothing licensed), so it can be made at whatever tempo puts
// the film's cuts on its beats, rather than cutting the film to a song's. A mood (the library: calm, bright, driving,
// dark) says the tempo range, the chords and how busy the drums get; each scene's energy (its shot's tag) says how
// much of the band plays under it; each cut gets its hit: a knock on a hard cut, a whoosh into a whip, a riser into a
// push, an impact where the energy jumps and on the last shot (the logo, the call), which rings out.
// Made once per film shape and kept (.engine-data/music), handed to the Studio as one of its media files, so the
// export lays it on (server/sound.ts) and ends it on the bar at the film's end.
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type Mood = "calm" | "bright" | "driving" | "dark"
export const MOODS: { id: Mood; name: string; bpm: [number, number]; drums: number; minor: boolean; hint: string }[] = [
  { id: "calm", name: "Calm", bpm: [84, 100], drums: 0, minor: false, hint: "a warm pad, a slow pluck, a soft pulse" },
  { id: "bright", name: "Bright", bpm: [100, 120], drums: 1, minor: false, hint: "plucked chords, claps, light drums" },
  { id: "driving", name: "Driving", bpm: [116, 128], drums: 2, minor: true, hint: "four on the floor, a pumping bass, stabs" },
  { id: "dark", name: "Dark", bpm: [92, 112], drums: 1, minor: true, hint: "a low sub, a wide pad, big hits" },
]
/** a cut: where it lands, the energy of the shot it opens (1 calm to 3 loud), how the shot comes in */
export type Cut = { at: number; energy: number; enter?: string }

const SR = 48000

/** The tempo in a mood's range that puts the cuts nearest its beats (half beats count less), and how far off they land. */
export function tempoFor(cuts: number[], range: [number, number]) {
  let best = { bpm: Math.round((range[0] + range[1]) / 2), off: Infinity }
  for (let bpm = range[0]; bpm <= range[1]; bpm += 0.5) {
    const beat = 60 / bpm
    let off = 0
    for (const c of cuts) {
      const k = c / beat
      const onBeat = Math.abs(k - Math.round(k)) * beat
      const onHalf = Math.abs(k * 2 - Math.round(k * 2)) * (beat / 2) + 0.02
      off += Math.min(onBeat, onHalf)
    }
    // a small pull to the middle of the range: the mood's own pace when two fit as well
    off += Math.abs(bpm - (range[0] + range[1]) / 2) * 0.0004
    if (off < best.off) best = { bpm, off }
  }
  return { bpm: best.bpm, off: Math.round((best.off / Math.max(1, cuts.length)) * 1000) }
}

/* ---------------- the voices ---------------- */

const rand = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
let rnd = rand(7)
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd())
const buf = (d: number) => new Float32Array(Math.max(1, Math.round(d * SR)))
const noise = (d: number) => buf(d).map(() => gauss())
function lp(x: Float32Array, cut: number | ((i: number) => number)) {
  const y = new Float32Array(x.length)
  let s = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.exp((-2 * Math.PI * (typeof cut === "number" ? cut : cut(i))) / SR)
    s = (1 - a) * x[i] + a * s
    y[i] = s
  }
  return y
}
const hp = (x: Float32Array, cut: number) => {
  const l = lp(x, cut)
  return x.map((v, i) => v - l[i])
}
const shape = (d: number, f: (t: number, i: number) => number) => buf(d).map((_, i) => f(i / SR, i))

const kick = (punch = 1) => {
  let ph = 0
  const c = noise(0.5)
  return shape(0.5, (t, i) => {
    ph += (2 * Math.PI * (44 + 120 * Math.exp(-t * 32))) / SR
    return Math.tanh((Math.sin(ph) * Math.exp(-t * 6.5) + c[i] * Math.exp(-t * 900) * 0.35) * 1.6 * punch) * 0.9
  })
}
const clap = () => {
  const n = hp(lp(noise(0.35), 2600), 700)
  return n.map((v, i) => {
    const t = i / SR
    let e = 0
    ;[0, 0.011, 0.023].forEach((o, k) => (e += t >= o ? Math.exp(-(t - o) * (k < 2 ? 180 : 16)) : 0))
    return v * e * 0.55
  })
}
const hat = (open = false) => {
  const d = open ? 0.28 : 0.06
  return hp(noise(d), 7000).map((v, i) => v * Math.exp((-i / SR) * (open ? 11 : 70)) * (open ? 0.22 : 0.16))
}
const knock = () => shape(0.5, (t) => Math.sin(2 * Math.PI * (52 + 30 * Math.exp(-t * 20)) * t) * Math.exp(-t * 9) * 0.8)
function pad(freqs: number[], d: number, cut = 1400, att = 0.8, rel = 1.2, gain = 0.09): [Float32Array, Float32Array] {
  const n = Math.round((d + rel) * SR)
  const ph = freqs.flatMap(() => [rnd(), rnd(), rnd(), rnd()])
  const env = (t: number) => Math.min(1, t / att) * (t > d ? Math.exp(-(t - d) * 3.2) : 1)
  const side = (det: number[]) => {
    const x = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / SR
      let s = 0
      freqs.forEach((f, j) => det.forEach((dt, k) => (s += 2 * ((f * (1 + dt) * t + ph[j * 4 + k]) % 1) - 1)))
      x[i] = s
    }
    return lp(lp(x, cut), cut).map((v, i) => v * env(i / SR) * gain)
  }
  return [side([-0.004, 0.003]), side([0.005, -0.002])]
}
const pluck = (f: number, d = 0.45, gain = 0.12) =>
  shape(d, (t) => {
    let s = 0
    for (let k = 1; k <= 10; k++) s += (1 / k) * Math.sin(2 * Math.PI * f * k * t) * Math.exp(-t * (4 + k * 2.2))
    return s * gain
  })
const sub = (f: number, d: number, gain = 0.42) => shape(d, (t) => Math.tanh((Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t)) * 1.3) * Math.min(1, t / 0.008) * Math.exp(-t * 2.4) * gain)
const riser = (d: number, gain = 0.2) => {
  let ph = 0
  const f = (t: number) => 180 * (2400 / 180) ** (t / d)
  const n = lp(noise(d), (i) => f(i / SR) * 2.5)
  return shape(d, (t, i) => {
    ph += (2 * Math.PI * f(t)) / SR
    return (Math.sin(ph) * 0.35 + n[i] * 0.6) * (t / d) ** 2.2 * gain
  })
}
const whoosh = (d = 0.32, gain = 0.16) => {
  const a = lp(noise(d), (i) => 300 + 5000 * Math.sin((Math.PI * i) / SR / d) ** 2)
  const b = lp(noise(d), 200)
  return a.map((v, i) => (v - b[i]) * Math.sin((Math.PI * i) / SR / d) ** 2 * gain)
}
const impact = (gain = 1, d = 3) => {
  const n = lp(noise(d), 3500)
  return shape(d, (t, i) => Math.tanh((Math.sin(2 * Math.PI * (34 + 46 * Math.exp(-t * 6)) * t) * Math.exp(-t * 1.6) + n[i] * Math.exp(-t * 7) * 0.5) * 1.4) * gain * 0.85)
}

/* ---------------- the chords ---------------- */

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
// four bars a phrase; each chord a root (low) and its voicing (the pad's notes), in MIDI
const MAJOR = [
  [41, [60, 64, 67, 71]], // Fmaj7 over F
  [36, [60, 64, 67, 74]], // C(add9)
  [45, [57, 60, 64, 67]], // Am7
  [43, [59, 62, 67, 69]], // G(add9)
] as const
const MINOR = [
  [45, [57, 60, 64, 71]], // Am(add9)
  [41, [57, 60, 65, 67]], // Fmaj7
  [36, [55, 60, 64, 74]], // C
  [43, [55, 59, 62, 69]], // G
] as const

/* ---------------- the score ---------------- */

export type Score = { file: string; bpm: number; beats: number[]; mood: Mood; length: number; off: number }

/** The film's score: its cuts, its length (s) and a mood, written to `file` (48 kHz stereo WAV). */
export function score(cuts: Cut[], length: number, mood: Mood, file: string): Score {
  const m = MOODS.find((x) => x.id === mood) ?? MOODS[1]
  rnd = rand(Math.round(length * 1000) + cuts.length * 31)
  const { bpm, off } = tempoFor([...cuts.slice(1).map((c) => c.at), length], m.bpm)
  const beat = 60 / bpm
  const bar = beat * 4
  const N = Math.round((length + 2.5) * SR)
  const L = new Float32Array(N)
  const R = new Float32Array(N)
  const sendL = new Float32Array(N)
  const sendR = new Float32Array(N)
  const add = (sig: Float32Array | [Float32Array, Float32Array], t: number, gain = 1, pan = 0, verb = 0) => {
    const i0 = Math.round(t * SR)
    const [l, r] = Array.isArray(sig) ? sig : [sig.map((v) => v * (1 - Math.max(0, pan))), sig.map((v) => v * (1 + Math.min(0, pan)))]
    for (let i = 0; i < l.length && i0 + i < N; i++) {
      if (i0 + i < 0) continue
      L[i0 + i] += l[i] * gain
      R[i0 + i] += r[i] * gain
      if (verb) {
        sendL[i0 + i] += l[i] * gain * verb
        sendR[i0 + i] += r[i] * gain * verb
      }
    }
  }
  const chords = m.minor ? MINOR : MAJOR
  const energyAt = (t: number) => [...cuts].reverse().find((c) => c.at <= t + 1e-6)?.energy ?? 1
  const level = (t: number) => Math.min(3, energyAt(t) + m.drums - 1)
  const last = cuts[cuts.length - 1]?.at ?? length
  // the bars: a pad on each; under them, as much of the band as the scene's energy asks
  for (let b = 0; b * bar < length; b++) {
    const t0 = b * bar
    const [root, notes] = chords[b % 4]
    const lv = level(t0 + 0.01)
    const ending = t0 >= last - 0.01
    add(pad(notes.map(hz), bar, lv >= 3 ? 2400 : 1100 + lv * 300, lv >= 3 ? 0.2 : 0.6, 1.2, mood === "dark" ? 0.08 : 0.065), t0, 1, 0, 0.55)
    if (mood === "dark" || lv <= 1) add(sub(hz(root), bar * 0.95, 0.24), t0)
    for (let k = 0; k < 4; k++) {
      const tb = t0 + k * beat
      if (tb >= length || ending) break
      const l2 = level(tb + 0.01)
      if (l2 >= 3 || (l2 === 2 && k % 2 === 0)) add(kick(l2 >= 3 ? 1 : 0.75), tb, l2 >= 3 ? 0.85 : 0.6)
      if (l2 >= 2 && k % 2 === 1) add(clap(), tb, 0.8, 0, 0.3)
      if (l2 >= 2) for (let h = 0; h < 2; h++) add(hat(h === 1 && l2 >= 3), tb + (h * beat) / 2, 1, h ? 0.25 : -0.2)
      if (l2 >= 3) add(sub(hz(root), beat * 0.48), tb + beat / 2)
      // the melody: a pluck on the chord's notes, an octave up, in eighths where it's calm, quarters where it isn't
      if (mood !== "driving" || l2 <= 2) {
        const arp = [...notes, ...notes.map((x) => x + 12)]
        const steps = l2 <= 1 ? 2 : 1
        for (let s = 0; s < steps; s++) add(pluck(hz(arp[(b * 4 + k * steps + s) * 3 % arp.length] + 12), 0.5, 0.05), tb + (s * beat) / steps, 1, 0.3 * Math.sin(b * 4 + k + s), 0.5)
      }
    }
  }
  // the cuts: each lands with a hit; the jump into a loud shot, and the last shot, with an impact
  cuts.forEach((c, i) => {
    if (!i) return
    const rise = c.energy > (cuts[i - 1]?.energy ?? 1)
    if (/whip|pan|spin/.test(c.enter ?? "")) add(whoosh(0.3, 0.14), c.at - 0.15, 1, 0.3 * (i % 2 ? 1 : -1), 0.2)
    if (/push|zoom|rise/.test(c.enter ?? "") && c.at > 1.2) add(riser(Math.min(1.2, c.at - (cuts[i - 1]?.at ?? 0)), 0.14), c.at - Math.min(1.2, c.at - (cuts[i - 1]?.at ?? 0)))
    if (i === cuts.length - 1) add(impact(0.95, 3), c.at, 1, 0, 0.7)
    else if (rise) add(impact(0.6, 2), c.at, 1, 0, 0.5)
    else add(knock(), c.at, 0.7)
  })
  // the last shot rings out: one chord, a high pluck
  const [, end] = chords[Math.floor(last / bar) % 4]
  add(pad([...end, end[0] + 12].map(hz), Math.max(0.6, length - last), 2200, 0.02, 1.6, 0.08), last, 1, 0, 0.8)
  add(pluck(hz(end[0] + 24), 1.6, 0.06), last, 1, 0, 0.8)

  // the room: four combs and two all-passes a side (a small hall), on what's sent to it
  const room = (x: Float32Array, spread: number) => {
    const y = new Float32Array(N)
    for (const d of [1557, 1617, 1491, 1422].map((v) => v + spread)) {
      const lines = new Float32Array(d)
      let p = 0
      let f = 0
      for (let i = 0; i < N; i++) {
        const o = lines[p]
        f = o * 0.8 + f * 0.2
        lines[p] = x[i] + f * 0.84
        y[i] += o
        p = (p + 1) % d
      }
    }
    for (const d of [556 + spread, 441 + spread]) {
      const lines = new Float32Array(d)
      let p = 0
      for (let i = 0; i < N; i++) {
        const b = lines[p]
        const v = y[i] + b * 0.5
        lines[p] = v
        y[i] = b - v * 0.5
        p = (p + 1) % d
      }
    }
    return y.map((v) => v * 0.08)
  }
  const wl = room(sendL, 0)
  const wr = room(sendR, 23)
  // the master: the room in, a fade after the film's end, soft-clipped to a steady level
  let peak = 1e-6
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const tail = t < length ? 1 : Math.max(0, 1 - (t - length) / 2.4) ** 2
    L[i] = (L[i] + wl[i]) * tail
    R[i] = (R[i] + wr[i]) * tail
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  }
  const pcm = Buffer.alloc(N * 4)
  for (let i = 0; i < N; i++) {
    pcm.writeInt16LE(Math.round(Math.tanh((L[i] / peak) * 1.25) * 0.95 * 32767), i * 4)
    pcm.writeInt16LE(Math.round(Math.tanh((R[i] / peak) * 1.25) * 0.95 * 32767), i * 4 + 2)
  }
  const head = Buffer.alloc(44)
  head.write("RIFF", 0)
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write("WAVEfmt ", 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(2, 22)
  head.writeUInt32LE(SR, 24)
  head.writeUInt32LE(SR * 4, 28)
  head.writeUInt16LE(4, 32)
  head.writeUInt16LE(16, 34)
  head.write("data", 36)
  head.writeUInt32LE(pcm.length, 40)
  writeFileSync(file, Buffer.concat([head, pcm]))
  // the beats, counted back from the film's end so a bar (every fourth) lands on it: the export cuts the song there
  const beats: number[] = []
  for (let t = length; t >= -1e-6; t -= beat) beats.unshift(Math.round(t * 1000) / 1000)
  while (beats.length % 4 !== 1) beats.shift()
  return { file, bpm, beats, mood: m.id, length, off }
}

/** The score for a film, made once for its cuts, length and mood (kept in `dir`), and handed to the Studio as a media
    file: its address for the composition's `music`. */
export function scored(dir: string, cuts: Cut[], length: number, mood: Mood) {
  mkdirSync(dir, { recursive: true })
  const h = createHash("sha1").update(JSON.stringify([cuts, Math.round(length * 1000), mood, 2])).digest("hex")
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  const kept = join(dir, `${id}.wav`)
  const meta = join(dir, `${id}.json`)
  let s: Score
  if (existsSync(kept) && existsSync(meta)) s = JSON.parse(readFileSync(meta, "utf8")) as Score
  else {
    s = score(cuts, length, mood, kept)
    writeFileSync(meta, JSON.stringify(s))
  }
  // where the Studio finds its media (server/studio.ts: DIR), so the export can lay it on
  const media = join(tmpdir(), "anim-engine-studio")
  mkdirSync(media, { recursive: true })
  if (!existsSync(join(media, `media-${id}`))) {
    copyFileSync(kept, join(media, `media-${id}`))
    writeFileSync(join(media, `media-${id}.type`), "audio/wav")
  }
  return { url: `/__studio/media/${id}`, name: `${MOODS.find((x) => x.id === s.mood)?.name} score, ${s.bpm} BPM`, bpm: s.bpm, beats: s.beats, offset: 0, gain: 0.9, mood: s.mood, off: s.off }
}
