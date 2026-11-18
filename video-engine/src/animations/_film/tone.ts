// A film template drawn in the product's colours and type. Every colour a film's code names is a CSS variable
// (`var(--t-f5f4f0, #f5f4f0)`, written by the build: server/tone.ts), so one film's whole palette moves at once,
// without touching its code: its ground becomes the product's ground, its ink the product's ink, the greys between
// them land between those, cards lifted off the ground become the product's surface, and colours of the template's
// accent family turn to the product's accent (others, a template's decorative second colours, stay). Fonts the same:
// `--t-sans` and `--t-display`. The product's own pictures are pictures: they never change.
// One film plays per frame (stage.tsx puts the theme on), so the variables sit on the frame's root and code that does
// sums with a colour (hexMix, measure) reads the same answers through `resolve`.

/** The template's own: what its ground, ink and accent are (meta.film.tone). */
export type Tone = { ground: string; ink: string; accent?: string }
/** The product's, as a film is given it (values.theme, JSON). `fit`: "product" moves the ground and ink too,
    "accent" only the accent family (for films whose look is the point: deep space, a night studio). */
export type Theme = { bg?: string; ink?: string; surface?: string; accent?: string; sans?: string; display?: string; fonts?: string[]; fit?: "product" | "accent" }

type Rgb = [number, number, number]
const hex6 = (h: string) => {
  const s = h.trim().replace(/^#/, "").toLowerCase()
  return /^[0-9a-f]{3}$/.test(s) ? [...s].map((c) => c + c).join("") : /^[0-9a-f]{6}$/.test(s) ? s : null
}
const rgb = (h: string): Rgb => {
  const n = parseInt(hex6(h) ?? "000000", 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")
const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => a.map((v, i) => v + (b[i] - v) * k) as Rgb
/** CIE lightness, 0 to 100 */
const lightness = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}
const chroma = (c: Rgb) => (Math.max(...c) - Math.min(...c)) / 255
function hsl([r, g, b]: Rgb): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255]
  const mx = Math.max(x, y, z)
  const mn = Math.min(x, y, z)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = mx === x ? ((y - z) / d + 6) % 6 : mx === y ? (z - x) / d + 2 : (x - y) / d + 4
  return [h * 60, s, l]
}
function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))

/** Each of a film's colours (hex, no #) to the product's. */
export function toneMap(palette: string[], from: Tone, to: Theme): Record<string, string> {
  const out: Record<string, string> = {}
  const G = rgb(from.ground)
  const I = rgb(from.ink)
  const [lg, li] = [lightness(G), lightness(I)]
  const full = (to.fit ?? "product") === "product" && !!to.bg && !!to.ink
  const pg = rgb(to.bg ?? from.ground)
  const pi = rgb(to.ink ?? from.ink)
  // a card lifted off the ground: the product's surface, or a step from its ground towards its ink (dark grounds lift
  // lighter, light ones go white)
  const ps = to.surface ? rgb(to.surface) : lightness(pg) < 50 ? mixRgb(pg, pi, 0.07) : ([255, 255, 255] as Rgb)
  const ta = from.accent ? hsl(rgb(from.accent)) : null
  const pa = to.accent && hex6(to.accent) ? rgb(to.accent) : null
  for (const raw of palette) {
    const h = hex6(raw)
    if (!h) continue
    const c = rgb(h)
    let next: Rgb = c
    if (chroma(c) < 0.1) {
      if (full) {
        // where it sits between the template's ground (0) and ink (1); past the ground is a lifted surface
        const u = (lg - lightness(c)) / (lg - li || 1)
        next = u >= 0 ? mixRgb(pg, pi, clamp(u)) : mixRgb(pg, ps, clamp(-u * 25))
      }
    } else if (ta && pa) {
      const [hh, ss, ll] = hsl(c)
      if (hueGap(hh, ta[0]) <= 45) {
        const [ph, psat, pl] = hsl(pa)
        // the accent's family keeps its place around the accent: its hue turned, its saturation and lightness offset
        next = chroma(pa) < 0.1 ? fromHsl(0, 0, clamp(pl + (ll - ta[2]))) : fromHsl(hh + (ph - ta[0]), clamp(ss * (psat / (ta[1] || 1))), clamp(ll + (pl - ta[2]), 0.04, 0.96))
      }
    }
    out[h] = toHex(next)
  }
  return out
}

/** What the variables say now, in this frame: a colour's key (hex, no #) or "sans"/"display" to its value. */
export const tones: Record<string, string> = {}
/** A string with the variables in it, as it draws now (for code that does sums with a colour, or measures text).
    `html`: it's markup (a drawing's), so what goes into an attribute is escaped (a face's quotes would end it). */
export const resolve = (s: string, html = false) => (s.includes("var(--t-") ? s.replace(/var\(--t-([\w-]+),\s*([^()]+)\)/g, (_, k: string, fb: string) => (k in tones ? (html ? tones[k].replace(/&/g, "&amp;").replace(/"/g, "&quot;") : tones[k]) : fb.trim())) : s)
