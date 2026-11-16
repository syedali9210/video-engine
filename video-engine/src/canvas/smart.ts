// Canvas — smart bentos: a grid that fills itself. The content reader (studio/content.ts) works out what the product
// has: its screens, components, words, stats and real counts. Each cell of a seeded bento grid then gets the content
// that suits it: a tall cell a phone with a screen, a wide one the name or a component, a small square a stat, a
// feature, or a folder that holds the product's real count of screens. Two styles: paper (white cards on pale grey)
// and glass (frosted cards on a moving gradient). Each round deals a new grid and fills it again.
import { bentoCells, fillCells, profileOf, type Cell, type ContentItem } from "../studio/content"
import { MOCKUP, shapeNode, type CNode } from "./doc"
import { button, dress, fade, folder, frameDoc, glass, gradient, part, phone, rise, scaleOf, stack, words, type Composition, type CreateCtx } from "./create"

/** The product's screens (phones can show them) and components (cards can), in order. */
function inventory(c: CreateCtx) {
  const screens = [c.screen.live, ...c.more.filter((m) => m.device).map((m) => m.device!)]
  const components = c.more.filter((m) => !m.device)
  return { screens, components }
}

/** One cell's content, drawn: inset by `pad`, its type fitted to the cell. */
function draw(c: CreateCtx, cell: Cell, item: ContentItem, pad: number, i: number): CNode[] {
  const k = scaleOf(c)
  const { screens, components } = inventory(c)
  const x = cell.x + pad
  const w = cell.w - 2 * pad
  const at = 0.15 + i * 0.07
  const fit = (text: string, max: number, lines: number) => Math.max(12, Math.min(max * k, (w * lines) / Math.max(4, text.length * 0.55), cell.h * 0.32))
  switch (item.kind) {
    case "screen": {
      const m = MOCKUP[c.screen.device]
      const h = Math.min(cell.h * 0.88, ((w * 0.92) / m.w) * m.h)
      return [{ ...phone(c, screens[(item.ref ?? 0) % screens.length], cell.x + cell.w / 2, cell.y + cell.h / 2 + cell.h * 0.02, h, item.ref ? undefined : c.screen.picture), rot3d: { x: 0, y: 0 }, shadow: false, enter: rise(at, 0.8), name: `Screen ${(item.ref ?? 0) + 1}` }]
    }
    case "component": {
      const p = components[(item.ref ?? 0) % Math.max(1, components.length)]
      if (!p) return []
      const label = words(x, cell.y + pad, item.label ?? "Component", 12 * k, { font: "mono", weight: 500, w, enter: fade(at), name: "Label" })
      return [label, part(p.live, cell.x + cell.w / 2, cell.y + cell.h / 2 + 10 * k, w * 0.92, (cell.h - 2 * pad - 24 * k) * 0.92, c.screen.scheme, p.fill)]
    }
    case "name": {
      const size = fit(item.text ?? c.name, 84, 2)
      return stack(cell.y + cell.h - pad - size * 2.4, [words(x, 0, c.kicker, 12 * k, { font: "mono", weight: 500, w, enter: fade(at), name: "Kicker" }), words(x, 0, item.text ?? c.name, size, { weight: 650, w, enter: rise(at + 0.05), name: "Name" })])
    }
    case "tagline":
    case "hook": {
      const size = fit(item.text ?? "", 30, 3)
      return [words(x, cell.y + cell.h - pad - size * 3.6, item.text ?? "", size, { font: "display", weight: 560, w, enter: rise(at), name: item.kind === "hook" ? "Hook" : "Line" })]
    }
    case "stat": {
      const size = fit(item.value ?? "", 72, 1)
      return stack(cell.y + pad, [words(x, 0, item.value ?? "", size, { weight: 700, w, enter: rise(at), name: "Number" }), words(x, 0, item.label ?? "", 14 * k, { font: "text", weight: 450, w, enter: fade(at + 0.1), name: "Number, what it counts" })])
    }
    case "count": {
      // a folder holding the product's real count of its things, labelled the way a desktop folder is
      const fw = Math.min(cell.w * 0.5, cell.h * 0.62 * 1.25)
      return [words(x, cell.y + pad, `[${item.value}] ${item.label}`, 15 * k, { font: "mono", weight: 500, w, enter: fade(at), name: "Count" }), ...folder(cell.x + cell.w - pad - fw, cell.y + cell.h - pad - fw * 0.8, fw, c.look.accent)]
    }
    case "feature": {
      const size = fit(item.text ?? "", 26, 3)
      return stack(cell.y + pad, [words(x, 0, String((item.ref ?? 0) + 1).padStart(2, "0"), 12 * k, { font: "mono", weight: 500, w, enter: fade(at), name: "Number" }), words(x, 0, item.text ?? "", size, { weight: 600, w, enter: rise(at + 0.05), name: "Feature" })])
    }
    case "cta":
      return button(c, x, cell.y + cell.h / 2 - 26, item.text ?? c.cta)
  }
}

function smart(c: CreateCtx, style: "paper" | "glass"): CNode[] {
  const { w, h } = c.frame
  const m = Math.round(0.035 * Math.min(w, h))
  const gap = Math.round(0.016 * Math.min(w, h))
  const { screens, components } = inventory(c)
  const profile = profileOf({ name: c.name, kicker: c.kicker, tagline: c.tagline, cta: c.cta, features: c.features, proof: c.proof, screens: screens.length, components: components.length, componentNames: c.names })
  // as many cells as there's content for, five to eight
  const n = Math.max(5, Math.min(8, Math.round(profile.items.length * 0.7)))
  const cells = bentoCells(w, h, n, c.seed, m, gap)
  const items = fillCells(cells, profile)
  const k = scaleOf(c)
  const pad = Math.round(22 * k)
  const radius = Math.round(22 * Math.max(0.7, k))
  const dark = c.look.dark
  const ground: CNode[] = style === "glass" ? [gradient(c.look.dark ? "aurora" : "mesh", { x: 0, y: 0, w, h }, c.look)] : []
  const cards: CNode[] = cells.map((cell, i) => (style === "glass" ? { ...glass(cell.x, cell.y, cell.w, cell.h, "#ffffff", radius), name: `Card ${i + 1}`, enter: rise(0.05 + i * 0.05, 0.8) } : { ...shapeNode("rect", cell, dark ? "#26262b" : "#ffffff"), name: `Card ${i + 1}`, radius, enter: rise(0.05 + i * 0.05, 0.8) }))
  return [...ground, ...cards, ...cells.flatMap((cell, i) => draw(c, cell, items[i], pad, i))]
}

export const SMART: Composition[] = [
  {
    id: "smart-paper",
    category: "bento",
    name: "Smart bento, paper",
    hint: "A bento that fills itself: it reads what the product has (screens, components, words, numbers, real counts) and gives each cell what suits it. A folder holds the count of its screens. A new grid each round.",
    make: (c) => {
      const d = dress(c, frameDoc(c, "Smart bento", smart(c, "paper")))
      return { ...d, frame: { ...d.frame, paint: [], fill: c.look.dark ? "#1b1b1f" : "#ebebee", ink: c.look.dark ? "#f4f4f5" : "#18181b" } }
    },
  },
  {
    id: "smart-glass",
    category: "bento",
    name: "Smart bento, glass",
    hint: "The same self-filling grid on frosted cards over a moving gradient in the product's colour.",
    make: (c) => dress(c, frameDoc(c, "Smart bento", smart(c, "glass"))),
  },
]
