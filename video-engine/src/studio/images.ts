// The image library: pictures you upload (/images.html), each read for its vibe once (its colours, how light, how vivid,
// warm or cool, how busy, what it looks like it is: a sky, greenery, texture, something minimal), and a film's ground
// chosen from them for the product: closest to its brand's hue, as light or deep as its brand, as vivid as its tone,
// near what its own words say it is, and not the one its last film had. Pure: the server reads the pixels
// (server/images.ts, with ffmpeg) and hands them here.

export type ImageMeta = {
  id: string
  name: string
  w: number
  h: number
  /** its colours, the commonest first */
  palette: string[]
  /** its dominant hue (deg), saturation and lightness (0–1), contrast (the spread of its light), how busy (0–1), how warm (0–1) */
  hue: number
  sat: number
  light: number
  contrast: number
  busy: number
  warm: number
  tags: string[]
  added: string
  /** how many films have used it */
  used?: number
}
export type Vibe = { hue?: number; dark?: boolean; tone?: "calm" | "bright" | "bold"; words?: string }

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
function hsl(r: number, g: number, b: number) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const mx = Math.max(R, G, B)
  const mn = Math.min(R, G, B)
  const l = (mx + mn) / 2
  const d = mx - mn
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : mx === R ? 60 * (((G - B) / d + 6) % 6) : mx === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4)
  return { h, s, l }
}
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** What a picture is, from its pixels (rgb, `n`×`n` of them, row by row). */
export function describe(px: ArrayLike<number>, n: number): Omit<ImageMeta, "id" | "name" | "w" | "h" | "added"> {
  const cells = n * n
  let L = 0
  let S = 0
  let warm = 0
  let busy = 0
  const lum: number[] = []
  const bins = new Array(12).fill(0)
  const binRgb = Array.from({ length: 12 }, () => [0, 0, 0, 0])
  let topBlue = 0
  let green = 0
  for (let i = 0; i < cells; i++) {
    const [r, g, b] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]
    const c = hsl(r, g, b)
    const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    lum.push(y)
    L += c.l
    S += c.s
    const w = c.s * (1 - Math.abs(c.l - 0.5) * 1.4)
    const k = Math.floor(c.h / 30) % 12
    bins[k] += Math.max(0, w)
    binRgb[k][0] += r
    binRgb[k][1] += g
    binRgb[k][2] += b
    binRgb[k][3] += 1
    if (c.s > 0.15 && (c.h < 70 || c.h > 330)) warm++
    if (Math.floor(i / n) < n / 3 && c.h > 190 && c.h < 250 && c.s > 0.25) topBlue++
    if (c.h > 70 && c.h < 160 && c.s > 0.2) green++
    if (i % n) busy += Math.abs(y - lum[i - 1])
  }
  const mean = L / cells
  const sat = S / cells
  const yMean = lum.reduce((a, v) => a + v, 0) / cells
  const contrast = Math.sqrt(lum.reduce((a, v) => a + (v - yMean) ** 2, 0) / cells)
  const order = bins.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0])
  const top = order[0][1]
  const palette = order
    .filter(([v]) => v > 0)
    .slice(0, 5)
    .map(([, k]) => {
      const [r, g, b, c] = binRgb[k]
      return hex(r / c, g / c, b / c)
    })
  const b = busy / (cells - n)
  const tags: string[] = []
  tags.push(mean < 0.38 ? "dark" : mean > 0.62 ? "light" : "mid")
  tags.push(sat > 0.45 ? "vivid" : sat < 0.18 ? "muted" : mean > 0.6 ? "pastel" : "soft")
  tags.push(warm / cells > 0.4 ? "warm" : "cool")
  if (topBlue / (cells / 3) > 0.45) tags.push("sky")
  if (green / cells > 0.3) tags.push("greenery")
  tags.push(b > 0.09 ? "texture" : b < 0.035 ? "minimal" : "detailed")
  return { palette, hue: top * 30 + 15, sat, light: mean, contrast, busy: Math.min(1, b * 6), warm: warm / cells, tags }
}

/** what a product's own words point at, as tags a picture can have */
const WORDS: [RegExp, string[]][] = [
  [/\b(sport|bet|odds|game|win|fitness|run|health|eco|garden|farm|outdoor|green|climate|plant)/i, ["greenery", "vivid"]],
  [/\b(travel|flight|trip|sky|weather|cloud|space|air)/i, ["sky", "light"]],
  [/\b(ai|agent|model|code|dev|api|data|infra|security|terminal|database|observab|trace|log)/i, ["dark", "minimal", "cool"]],
  [/\b(design|creative|music|art|video|photo|studio|brand)/i, ["vivid", "texture"]],
  [/\b(finance|bank|pay|money|invest|account|tax|legal|insur)/i, ["minimal", "cool", "muted"]],
  [/\b(food|restaurant|coffee|cook|kitchen|deliver)/i, ["warm", "vivid"]],
  [/\b(calm|mind|sleep|meditat|wellness|focus|journal)/i, ["pastel", "minimal", "soft"]],
]

/** How well a picture suits a product, and why. */
export function score(img: ImageMeta, v: Vibe): { score: number; why: string[] } {
  const why: string[] = []
  let s = 0
  if (v.hue !== undefined) {
    const d = hueGap(img.hue, v.hue)
    const k = d < 40 ? 2.2 - d / 40 : Math.abs(d - 180) < 30 ? 0.8 : Math.max(0, 1 - d / 120)
    s += k * (0.4 + img.sat)
    if (d < 40) why.push("in the brand's hue")
    else if (Math.abs(d - 180) < 30) why.push("opposite the brand's hue")
  }
  if (v.dark !== undefined) {
    const k = v.dark ? 1 - img.light : img.light
    s += 1.5 * k
    if (k > 0.6) why.push(v.dark ? "deep, like the brand" : "light, like the brand")
  }
  if (v.tone === "bold") (s += 1.2 * img.sat + img.contrast), img.sat > 0.4 && why.push("vivid, for a bold film")
  if (v.tone === "calm") (s += 1.2 * (1 - img.sat) + (1 - img.busy) * 0.6), img.sat < 0.3 && why.push("quiet, for a calm film")
  if (v.tone === "bright") (s += 0.8 * img.light + 0.6 * img.sat), img.light > 0.5 && why.push("bright, for a bright film")
  for (const [re, tags] of WORDS)
    if (v.words && re.test(v.words)) {
      const hit = tags.filter((t) => img.tags.includes(t))
      if (hit.length) (s += 0.7 * hit.length), why.push(`${hit.join(" and ")}, like what it does`)
    }
  // a little against the ones used most (two films in a row don't open on the same picture)
  s -= 0.25 * (img.used ?? 0)
  return { score: Math.round(s * 100) / 100, why }
}

/** The library ranked for a product, best first. */
export const pick = (lib: ImageMeta[], v: Vibe) =>
  lib
    .map((img) => ({ img, ...score(img, v) }))
    .sort((a, b) => b.score - a.score)
