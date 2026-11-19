// Panels in a product's code: what the director films as a feature unfolding (src/animations/film-unfold) when a beat
// talks about a feature the product has a panel for. A panel is a heading with what sits under it: its properties (a
// label and its value), its lines, its buttons. It is read from the code as written (JSX, Vue, Svelte, HTML), by rule,
// not run: a heading (an <h1>–<h6>, a *Title / *Heading / *Header component, a heading's classes, a `title=` prop or a
// `title:` key) starts one; properties (<dt>/<dd>, <th>/<td>, <label>, `label: … value: …`, “Status:” followed by its
// value), buttons (<button>, *Button, role="button", .btn) and short lines join the heading before them, until the
// next heading or component. A value the code works out as it runs is “~” (the film draws a soft bar there: it never
// invents one). Matching is by words: the beat's against the panel's title (most), its component's name, then the rest.
// Plain data and no DOM: the dev server and `npm run check` run it.

/** `src`: the product's own panel, frozen from its running app (public/panel-capture.js), when it's been captured */
export type Panel = { id: string; title: string; rows: string[]; ctas: string[]; file: string; component?: string; src?: string; /** its ground, when captured (what a flow film's shape becomes it through) */ surface?: string }

/* ---------------- reading code ---------------- */

type Item = { at: number; end: number; kind: "head" | "row" | "button" | "text" | "wall"; text: string; value?: string }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", hellip: "…", middot: "·", ndash: "–", mdash: "—" }
/** The words in a piece of markup as they'd show: translated strings and literal expressions kept, tags and other
    expressions dropped, entities decoded. */
export function textOf(s: string) {
  return s
    .replace(/\{\s*t\(\s*["'`]([^"'`]+)["'`][^)]*\)\s*\}/g, " $1 ")
    .replace(/\{\s*["'`]([^"'`{}$]*)["'`]\s*\}/g, " $1 ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&(\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, " ")
    .trim()
}
/** a value as the code gives it: its words, or “~” for one worked out as it runs */
const valueOf = (s: string) => {
  const t = textOf(s)
  return t && /[a-z0-9]/i.test(t) ? t.slice(0, 30) : /\{[^}]+\}/.test(s) ? "~" : ""
}
const uncomment = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, a: string) => a + " ".repeat(m.length - a.length))
const sane = (s: string, max = 60) => s.length >= 2 && s.length <= max && /[a-z]/i.test(s) && !/^[\w-]+\.(tsx?|jsx?|css|svg|png)$/i.test(s) && !/[;=]|=>|\(\)|^https?:/.test(s)

/** Every panel in one file: a heading and what's under it (at least one property or line, and two things in all). */
export function panelsFromCode(source: string, file = ""): Panel[] {
  const s = uncomment(source)
  const items: Item[] = []
  const add = (re: RegExp, f: (m: RegExpExecArray) => Omit<Item, "at" | "end"> | null) => {
    for (const m of s.matchAll(re)) {
      const it = f(m as RegExpExecArray)
      if (it && (it.kind === "wall" || sane(it.text, it.kind === "head" ? 60 : 48))) items.push({ ...it, at: m.index!, end: m.index! + m[0].length })
    }
  }
  // where one component (or a section of a page) ends and the next begins
  add(/(?:^|\n)[ \t]*(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*(?::[^=\n]+)?=\s*(?:\(|function|React\.|memo|forwardRef))/g, (m) => ({ kind: "wall", text: m[1] ?? m[2] }))
  add(/<(?:section|aside|article|dialog)\b/gi, () => ({ kind: "wall", text: "" }))
  // headings
  add(/<h([1-6])\b[^>]*>([\s\S]{1,240}?)<\/h\1>/gi, (m) => ({ kind: "head", text: textOf(m[2]) }))
  add(/<([A-Z]\w*(?:Title|Heading|Header))\b[^>]*>([\s\S]{1,200}?)<\/\1>/g, (m) => ({ kind: "head", text: textOf(m[2]) }))
  add(/<[a-z]\w*\b[^>]*\bclass(?:Name)?=["'`][^"'`]*\b(?:title|heading|headline|panel-title|card-title)\b[^"'`]*["'`][^>]*>([^<{]{2,80})</gi, (m) => ({ kind: "head", text: textOf(m[1]) }))
  add(/<[a-z]\w*\b[^>]*\bclass(?:Name)?=["'`](?=[^"'`]*\bfont-(?:semibold|bold|medium)\b)(?=[^"'`]*\btext-(?:lg|xl|2xl|3xl)\b)[^"'`]*["'`][^>]*>([^<{]{2,80})</gi, (m) => ({ kind: "head", text: textOf(m[1]) }))
  add(/<\w[\w.]*\b[^>]*?\s(?:title|heading|header)=\{?["'`]([^"'`{}$]{3,60})["'`]\}?/g, (m) => ({ kind: "head", text: m[1].trim() }))
  add(/\b(?:title|heading)\s*:\s*["'`]([^"'`$]{3,60})["'`]/g, (m) => ({ kind: "head", text: m[1].trim() }))
  // properties
  add(/<dt\b[^>]*>([\s\S]{1,80}?)<\/dt>\s*<dd\b[^>]*>([\s\S]{0,160}?)<\/dd>/gi, (m) => ({ kind: "row", text: textOf(m[1]).replace(/:$/, ""), value: valueOf(m[2]) }))
  add(/<th\b[^>]*>([\s\S]{1,80}?)<\/th>\s*<td\b[^>]*>([\s\S]{0,160}?)<\/td>/gi, (m) => ({ kind: "row", text: textOf(m[1]).replace(/:$/, ""), value: valueOf(m[2]) }))
  add(/<label\b[^>]*>([^<{]{2,40})<\/label>/gi, (m) => ({ kind: "row", text: textOf(m[1]).replace(/:$/, ""), value: "~" }))
  add(/\blabel\s*:\s*["'`]([^"'`$]{2,30})["'`]\s*,\s*value\s*:\s*(?:["'`]([^"'`$]{1,30})["'`]|[^,}\n]+)/g, (m) => ({ kind: "row", text: m[1].trim(), value: m[2]?.trim() || "~" }))
  add(/>\s*([A-Z][\w &/-]{1,24}):\s*(?:<\/\w+>\s*)?(?:<\w+[^>]*>\s*)?(\{[^{}]*\}|[^<{\n]{1,30})/g, (m) => ({ kind: "row", text: m[1].trim(), value: valueOf(m[2]) }))
  // buttons
  add(/<button\b[^>]*>([\s\S]{1,200}?)<\/button>/gi, (m) => ({ kind: "button", text: textOf(m[1]) }))
  add(/<(\w*Button)\b[^>]*>([\s\S]{1,200}?)<\/\1>/g, (m) => ({ kind: "button", text: textOf(m[2]) }))
  add(/<(?:a|div|span)\b[^>]*(?:role=["']button["']|class(?:Name)?=["'`][^"'`]*\b(?:btn|button)\b[^"'`]*["'`])[^>]*>([^<{]{2,30})</gi, (m) => ({ kind: "button", text: textOf(m[1]) }))
  add(/<input\b[^>]*type=["']submit["'][^>]*value=["']([^"']{2,30})["']/gi, (m) => ({ kind: "button", text: m[1].trim() }))
  // lines: a short piece of text between tags (the fallback, when a panel has no properties)
  add(/>\s*([^<>{}\n]{3,60}?)\s*</g, (m) => ({ kind: "text", text: textOf(m[1]) }))

  // one thing once: what a stronger rule found (a heading, a property, a button) wins over a line it sits in
  const rank = { wall: 0, head: 1, row: 2, button: 2, text: 3 }
  items.sort((a, b) => a.at - b.at || rank[a.kind] - rank[b.kind])
  const kept: Item[] = []
  for (const it of items) {
    if (it.kind !== "wall" && kept.some((k) => k.kind !== "wall" && it.at < k.end && k.at < it.end && (rank[k.kind] <= rank[it.kind] || k.text === it.text))) continue
    kept.push(it)
  }

  const out: (Panel & { lines: string[]; start: number })[] = []
  let cur: (typeof out)[number] | null = null
  let component: string | undefined
  for (const it of kept) {
    if (it.kind === "wall") {
      cur = null
      if (it.text) component = it.text
      continue
    }
    if (it.kind === "head") {
      cur = { id: "", title: it.text, rows: [], ctas: [], lines: [], file, component, start: it.at }
      out.push(cur)
      continue
    }
    if (!cur || it.at - cur.start > 5000) continue
    if (it.kind === "row" && cur.rows.length < 6 && !cur.rows.some((r) => r.split(":")[0] === it.text)) cur.rows.push(it.value ? `${it.text}: ${it.value}` : it.text)
    else if (it.kind === "button" && cur.ctas.length < 3 && it.text.split(" ").length <= 4 && !cur.ctas.includes(it.text)) cur.ctas.push(it.text)
    else if (it.kind === "text" && cur.lines.length < 4 && it.text !== cur.title && it.text.split(" ").length <= 6 && /^[A-Z0-9]/.test(it.text)) cur.lines.push(it.text)
  }
  const panels = out
    .map((p) => ({ ...p, rows: p.rows.length ? p.rows : p.lines }))
    .filter((p) => p.title.split(" ").length <= 8 && p.rows.length >= 1 && p.rows.length + p.ctas.length >= 2)
    .map(({ lines: _l, start: _s, ...p }) => ({ ...p, id: `panel:${slug(p.title)}` }))
  return dedupe(panels)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "panel"
/** One panel a title: the fullest of those that share it. */
export function dedupe(panels: Panel[]): Panel[] {
  const by = new Map<string, Panel>()
  for (const p of panels) {
    const k = p.title.toLowerCase()
    const was = by.get(k)
    if (!was || p.rows.length + p.ctas.length > was.rows.length + was.ctas.length) by.set(k, p)
  }
  return [...by.values()]
}

/* ---------------- matching a beat to a panel ---------------- */

const STOP = new Set(
  "a an the and or of to in on at by for with from into as up out off over your you our we us it its is are be been was this that these those what when where who how why all any every each one more most less new now just get got can will not no yes do does done make made let lets see use using via than then them they their there here about after before".split(" ").concat("panel card view section modal dialog sheet page screen component list item items button container wrapper box drawer popover".split(" ")),
)
const stem = (w: string) => (w.length > 5 ? w.replace(/(ings|ing|ed|es|s)$/, "") : w.length > 3 ? w.replace(/s$/, "") : w)
/** A line's words as matching reads them: split at camelCase, lower case, without the little ones, stemmed. */
export const tokens = (s: string) => [...new Set((s ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem))]

/** How well a panel is what a line talks about (0: not at all). Its title counts most, its component's name next, its
    properties and buttons least; it needs a word from the title or the name to count at all. */
export function panelScore(text: string, p: Panel) {
  const said = tokens(text)
  if (!said.length) return 0
  const weight = new Map<string, number>()
  const give = (ws: string[], w: number) => ws.forEach((x) => weight.set(x, Math.max(weight.get(x) ?? 0, w)))
  give(tokens([...p.rows.map((r) => r.replace(/:\s*~$/, "")), ...p.ctas].join(" ")), 1)
  give(tokens(p.component ?? ""), 2)
  give(tokens(p.title), 3)
  const hits = said.map((w) => weight.get(w) ?? 0)
  if (!hits.some((h) => h >= 2)) return 0
  return hits.reduce((a, h) => a + h, 0) / Math.sqrt(said.length)
}
export const PANEL_MATCH = 2

/** The panel a line is about, if one clearly is. */
export function matchPanel(text: string, panels: Panel[], used = new Set<string>()) {
  let best: { panel: Panel; score: number } | null = null
  for (const p of panels) {
    if (used.has(p.id)) continue
    const score = panelScore(text, p)
    if (score >= PANEL_MATCH && (!best || score > best.score)) best = { panel: p, score }
  }
  return best
}

/** A panel as the unfold film's values (src/animations/film-unfold/params.ts). */
export const panelValues = (p: Panel, o: { accent?: string; dark?: boolean; font?: string; variant?: string; grain?: number } = {}) => ({
  title: p.title,
  rows: p.rows.join("|"),
  ctas: p.ctas.join("|"),
  ...(p.src ? { src: p.src } : {}),
  ...(o.accent ? { accent: o.accent } : {}),
  panel: o.dark ? "dark" : "light",
  ground: "field",
  ...(o.variant ? { variant: o.variant } : {}),
  ...(o.grain !== undefined ? { grain: o.grain } : {}),
  ...(o.font ? { font: o.font } : {}),
})

/** What the writer is told a panel carrier shows. */
export const panelWhat = (p: Panel) =>
  `its “${p.title}” panel built on screen, a blob opening into it: ${p.rows.map((r) => r.split(":")[0]).slice(0, 5).join(", ")}${p.ctas.length ? `; buttons ${p.ctas.join(", ")}` : ""}${p.component ? ` (${p.component} in ${p.file.split("/").pop()})` : ""}`

/** The film a panel is built in, and its length at its own pace (src/animations/film-unfold). */
export const UNFOLD = { anim: "film-unfold", seconds: 6.4 }
