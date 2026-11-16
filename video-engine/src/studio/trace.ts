// Logo to vector: a bitmap logo traced into an SVG the films can scale without blur. Its colours are found (a few, the
// background left out), each colour's area is outlined (marching squares over a mask, so holes stay holes), the
// outlines are simplified (Ramer–Douglas–Peucker, about a pixel) and written as paths, the biggest colour first.
// Pixels in, a string out: it runs in the browser on a canvas's data, and in `npm run check` on made-up pixels.
type Pixels = { width: number; height: number; data: Uint8ClampedArray | number[] }
type Pt = [number, number]

const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** The logo's colours (k-means over its opaque pixels, at most `k`), the background (the corners' colour) left out. */
function palette(px: Pixels, k: number) {
  const { width: w, height: h, data } = px
  const at = (x: number, y: number) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2], data[(y * w + x) * 4 + 3]]
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  const bg = corners.every((c) => c[3] < 20) ? null : corners[0]
  const pts: number[][] = []
  for (let i = 0; i < w * h; i += 3) {
    const c = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]
    if (c[3] < 128 || (bg && d2(c, bg) < 900)) continue
    pts.push(c)
  }
  if (!pts.length) return { bg, colours: [] as number[][] }
  let centres = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / k)) === 0).slice(0, k)
  for (let it = 0; it < 8; it++) {
    const sums = centres.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      let best = 0
      for (let j = 1; j < centres.length; j++) if (d2(p, centres[j]) < d2(p, centres[best])) best = j
      sums[best][0] += p[0]
      sums[best][1] += p[1]
      sums[best][2] += p[2]
      sums[best][3]++
    }
    centres = sums.filter((s) => s[3]).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]])
  }
  // colours too close to each other are one
  const out: number[][] = []
  for (const c of centres) if (out.every((o) => d2(o, c) > 1600)) out.push(c)
  return { bg, colours: out }
}

/** The outlines of a mask's areas (and its holes), as closed polygons, by marching squares on the cell corners. */
export function outlines(mask: Uint8Array, w: number, h: number): Pt[][] {
  const m = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0)
  // each boundary edge between an inside pixel and an outside one, oriented so the inside is on the left
  const next = new Map<string, Pt>()
  const key = (p: Pt) => `${p[0]},${p[1]}`
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m(x, y)) continue
      if (!m(x, y - 1)) next.set(key([x + 1, y]), [x, y])
      if (!m(x + 1, y)) next.set(key([x + 1, y + 1]), [x + 1, y])
      if (!m(x, y + 1)) next.set(key([x, y + 1]), [x + 1, y + 1])
      if (!m(x - 1, y)) next.set(key([x, y]), [x, y + 1])
    }
  const polys: Pt[][] = []
  while (next.size) {
    const [startKey, first] = next.entries().next().value as [string, Pt]
    next.delete(startKey)
    const poly: Pt[] = [startKey.split(",").map(Number) as Pt, first]
    let cur = first
    for (let guard = 0; guard < w * h * 4; guard++) {
      const k = key(cur)
      const n = next.get(k)
      if (!n) break
      next.delete(k)
      if (k === startKey) break
      poly.push(n)
      cur = n
    }
    if (poly.length >= 4) polys.push(poly)
  }
  return polys
}

/** A closed outline with the points that don't change its shape by more than `eps` taken out: split at the point
    farthest from the first, each half simplified (Ramer–Douglas–Peucker). */
export function simplify(pts: Pt[], eps = 1): Pt[] {
  if (pts.length < 4) return pts
  const far = (a: Pt, b: Pt, p: Pt) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1)
  }
  const chain = (c: Pt[]) => {
    const keep = c.map((_, i) => i === 0 || i === c.length - 1)
    const cut = (a: number, b: number) => {
      let best = -1
      let at = -1
      for (let i = a + 1; i < b; i++) {
        const d = far(c[a], c[b], c[i])
        if (d > best) [best, at] = [d, i]
      }
      if (best > eps) {
        keep[at] = true
        cut(a, at)
        cut(at, b)
      }
    }
    cut(0, c.length - 1)
    return keep
  }
  let opp = 1
  for (let i = 2; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[opp][0] - pts[0][0], pts[opp][1] - pts[0][1])) opp = i
  const a = pts.slice(0, opp + 1)
  const b = [...pts.slice(opp), pts[0]]
  const ka = chain(a)
  const kb = chain(b)
  const out = [...a.filter((_, i) => ka[i]), ...b.slice(1, -1).filter((_, i) => kb[i + 1])]
  // the first point is kept whatever it is: dropped when it's on the line between its neighbours
  return out.length > 3 && far(out[out.length - 1], out[1], out[0]) <= eps ? out.slice(1) : out
}

/** The logo as SVG: one path a colour (its areas, holes cut out), on a transparent ground. */
export function traceLogo(px: Pixels, maxColours = 4): { svg: string; colours: string[] } {
  const { width: w, height: h, data } = px
  const { bg, colours } = palette(px, maxColours)
  const paths: { fill: string; d: string; area: number }[] = []
  colours.forEach((c) => {
    const mask = new Uint8Array(w * h)
    let area = 0
    for (let i = 0; i < w * h; i++) {
      const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]
      if (p[3] < 128 || (bg && d2(p, bg) < 900)) continue
      // this pixel's nearest colour is this one
      if (colours.every((o) => d2(p, c) <= d2(p, o))) {
        mask[i] = 1
        area++
      }
    }
    const d = outlines(mask, w, h)
      .map((poly) => simplify(poly, 0.8))
      .filter((poly) => poly.length >= 3)
      .map((poly) => `M${poly.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`)
      .join("")
    if (d) paths.push({ fill: hex(c), d, area })
  })
  paths.sort((a, b) => b.area - a.area)
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.map((p) => `<path fill="${p.fill}" fill-rule="evenodd" d="${p.d}"/>`).join("")}</svg>`, colours: paths.map((p) => p.fill) }
}
