// The content reader: what a product has to show, understood, so a layout fills itself. It reads the product into an
// inventory:
//   - its screens and components (the engine's own library items for it);
//   - its words (the name, the line, the hook, the call), its features;
//   - stats found in those words ("10×", "2,000 teams", "99.9%");
//   - real counts of its own things ("12 screens", "6 components").
// Then it places that inventory on a grid. Each cell gets the content that suits its shape and size: a tall cell a
// screen, a wide one the name or a component strip, a small square a stat, or a count with a folder. The most
// important things go in the biggest cells, and nothing repeats while there's something new to show. The canvas's smart
// bento and the Artist's films both read it. Pure.

export type ContentKind = "screen" | "component" | "name" | "tagline" | "hook" | "feature" | "stat" | "count" | "cta"
export type ContentItem = { kind: ContentKind; text?: string; value?: string; label?: string; /** which screen or component, in order */ ref?: number; importance: number }
export type Profile = { items: ContentItem[]; screens: number; components: number; features: string[]; stats: { value: string; label: string }[] }
export type Cell = { x: number; y: number; w: number; h: number }

/** Numbers worth showing in a product's words: a multiple, a share, a count of people or things, a time. */
export function statsIn(text: string): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const re = /(\d[\d,.]*\s?(?:%|×|x\b|k\b|K\b|M\b|\+)?)\s*([A-Za-z][^.,;:!?]{0,28})?/g
  for (const m of text.matchAll(re)) {
    const value = m[1].trim()
    // a bare small number with nothing after it says nothing (a version, a step)
    if (!/[%×xkKM+,]/.test(value) && Number(value.replace(/[^\d.]/g, "")) < 10 && !m[2]) continue
    out.push({ value, label: (m[2] ?? "").trim().replace(/\s+/g, " ") })
  }
  return out
}

/** A product's inventory: its words, its screens and components, its stats and its own counts, each with how much
    it matters on a page. */
export function profileOf(o: { name: string; kicker?: string; hook?: string; tagline?: string; cta?: string; features?: string[]; proof?: string; screens: number; components: number; componentNames?: string[] }): Profile {
  const features = (o.features ?? []).map((f) => f.trim()).filter(Boolean).slice(0, 4)
  const stats = [...statsIn(o.proof ?? ""), ...features.flatMap(statsIn), ...statsIn(o.tagline ?? "")].slice(0, 3)
  const items: ContentItem[] = [{ kind: "name", text: o.name, importance: 10 }]
  for (let i = 0; i < Math.max(1, o.screens); i++) items.push({ kind: "screen", ref: i, importance: i ? 7 : 9.5 })
  if (o.tagline?.trim()) items.push({ kind: "tagline", text: o.tagline.trim(), importance: 7.5 })
  if (o.hook?.trim() && o.hook.trim() !== o.tagline?.trim()) items.push({ kind: "hook", text: o.hook.trim(), importance: 5 })
  for (const s of stats) items.push({ kind: "stat", value: s.value, label: s.label || o.name, importance: 7 })
  features.forEach((f, i) => items.push({ kind: "feature", text: f, ref: i, importance: 6.5 - i * 0.3 }))
  for (let i = 0; i < o.components; i++) items.push({ kind: "component", ref: i, label: o.componentNames?.[i], importance: 6 - i * 0.2 })
  // real counts of its own things: what a folder holds
  if (o.screens > 1) items.push({ kind: "count", value: String(o.screens), label: "screens", importance: 5.2 })
  if (o.components > 1) items.push({ kind: "count", value: String(o.components), label: "components", importance: 5 })
  if (features.length > 1 && o.screens <= 1 && o.components <= 1) items.push({ kind: "count", value: String(features.length), label: "features", importance: 4.6 })
  if (o.cta?.trim()) items.push({ kind: "cta", text: o.cta.trim(), importance: 4.5 })
  return { items, screens: Math.max(1, o.screens), components: o.components, features, stats }
}

/** How well a kind of content suits a cell, by its shape (width over height) and its share of the grid. */
function suits(kind: ContentKind, aspect: number, share: number) {
  const tall = aspect < 0.8
  const wide = aspect > 1.35
  const small = share < 0.12
  switch (kind) {
    case "screen":
      return tall ? (share > 0.12 ? 1 : 0.7) : aspect < 1.1 ? 0.45 : 0.15
    case "name":
      return share > 0.16 ? (wide ? 1 : 0.85) : wide ? 0.6 : 0.3
    case "tagline":
    case "hook":
      return wide ? (small ? 0.6 : 0.9) : tall ? 0.35 : 0.6
    case "component":
      return wide || aspect > 0.9 ? (small ? 0.6 : 0.9) : 0.35
    case "stat":
    case "count":
      return small ? (aspect > 0.6 && aspect < 1.8 ? 1 : 0.7) : 0.45
    case "feature":
      return small ? 0.7 : aspect > 0.8 ? 0.8 : 0.5
    case "cta":
      return small && aspect > 1 ? 0.8 : 0.3
  }
}

/** The grid filled: one piece of content per cell, the biggest cells first, each taking what suits it best among what
    hasn't been shown (a kind shown already counts for less, so the grid has variety), the name and a screen always in. */
export function fillCells(cells: Cell[], p: Profile): ContentItem[] {
  const total = cells.reduce((a, c) => a + c.w * c.h, 0) || 1
  const order = cells.map((c, i) => ({ c, i })).sort((a, b) => b.c.w * b.c.h - a.c.w * a.c.h)
  const used = new Set<ContentItem>()
  const shown = new Map<ContentKind, number>()
  const out: ContentItem[] = new Array(cells.length)
  const must = (k: ContentKind) => !shown.has(k) && p.items.some((x) => x.kind === k)
  for (const { c, i } of order) {
    const aspect = c.w / Math.max(1, c.h)
    const share = (c.w * c.h) / total
    const left = order.length - order.findIndex((o) => o.i === i)
    let best: ContentItem | undefined
    let score = -1
    for (const item of p.items) {
      if (used.has(item)) continue
      // the name and a screen are owed a cell: once the cells left are as few as what's owed, only they're eligible
      const owed = (["name", "screen"] as const).filter(must)
      if (owed.length >= left && !owed.includes(item.kind as "name" | "screen")) continue
      const s = item.importance * suits(item.kind, aspect, share) * (1 / (1 + 0.6 * (shown.get(item.kind) ?? 0)))
      if (s > score) {
        score = s
        best = item
      }
    }
    const pick = best ?? { kind: "feature", text: p.features[0] ?? p.items.find((x) => x.text)?.text ?? "", importance: 0 }
    used.add(pick)
    shown.set(pick.kind, (shown.get(pick.kind) ?? 0) + 1)
    out[i] = pick
  }
  return out
}

/** A bento grid for `n` cells on a w×h frame, seeded: rows of cells of different widths, one or two spanning two rows,
    a gap between them. */
export function bentoCells(w: number, h: number, n: number, seed: number, m: number, gap: number): Cell[] {
  let a = (seed * 2654435761) >>> 0 || 5
  const r = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const tall = h > w * 1.1
  const cols = tall ? 2 : n >= 6 ? 4 : 3
  // room for n cells plus a few spans (a big first block, a wide or tall one or two)
  const rows = Math.ceil((n + (tall ? 0 : 3)) / cols) + (tall ? 1 : 0)
  const cw = (w - 2 * m - (cols - 1) * gap) / cols
  const rh = (h - 2 * m - (rows - 1) * gap) / rows
  // a free map of the grid, filled by blocks of 1×1, 2×1, 1×2 and 2×2 cells until n are placed
  const free = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
  const cells: Cell[] = []
  const sizes: [number, number][] = [[2, 2], [1, 2], [2, 1], [1, 1]]
  // the slots a span may take beyond its one: spent, a span never leaves too few slots for the n cells
  let slack = rows * cols - n
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      if (!free[row][col]) continue
      const fits = sizes.filter(([cw2, rh2]) => cw2 * rh2 - 1 <= slack && col + cw2 <= cols && row + rh2 <= rows && [...Array(rh2)].every((_, dy) => [...Array(cw2)].every((__, dx) => free[row + dy][col + dx])))
      // the first block is big; after that mostly small, with a few spans for rhythm
      const want = cells.length === 0 ? fits[0] : fits[Math.min(fits.length - 1, Math.floor(r() * (cells.length < 3 ? 3 : 5)))] ?? fits.at(-1)!
      const [bw, bh] = want ?? [1, 1]
      slack -= bw * bh - 1
      for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) free[row + dy][col + dx] = false
      cells.push({ x: m + col * (cw + gap), y: m + row * (rh + gap), w: bw * cw + (bw - 1) * gap, h: bh * rh + (bh - 1) * gap })
    }
  return cells
}
