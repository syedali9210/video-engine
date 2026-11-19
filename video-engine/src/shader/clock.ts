import * as THREE from "three"

/** The one clock every scene reads: the page sets it, then draws. `phase` is how far round the loop (0..1), `px` the
    device pixels per output pixel (the grain's size). Nothing reads the wall clock, so frame t is always the same picture. */
export const clock = { t: 0, duration: 10, phase: 0, px: 1 }

/** The grain holds still on the screen while the picture moves under it (ShaderGradient's grain does the same): a
    fresh speckle every frame is pure noise to the encoder, and a 10 s 1080p60 clip came out at 300 Mbit/s. */
export const GRAIN_SEED = 7

/** What a scene still waits for (a logo's picture, a font) before its first frame is true. */
export const pending = new Set<Promise<unknown>>()

/** #rrggbb as the raw numbers a shader mixes (no colour management: what's written is what's shown). */
export const vec = (hex: string) => {
  const n = parseInt((hex || "#000000").replace("#", "").padEnd(6, "0").slice(0, 6), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Seamless motion: a sine over the loop, `k` whole cycles. */
export const wave = (k = 1, off = 0) => Math.sin((clock.phase * k + off) * Math.PI * 2)
/** Eases: out (arrivals), in-out (travel). */
export const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
export const easeInOut = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
/** A spring settling from 0 to 1 over `x` (0..1+): overshoots a little, then rests. */
export const spring = (x: number, bounce = 0.35) => (x <= 0 ? 0 : 1 - Math.exp(-6 * x) * Math.cos(x * (4 + 10 * bounce)))
