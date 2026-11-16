// Search your own work in plain words: product kits, named versions, directing briefs, the lab's proposals, studied
// films and review links, everything kept in .engine-data. Words match whole or by their start, a name counts three
// times what's inside, and a thing is found by its name or by half of what's asked. The command palette asks it as you type.
//   GET /__search?q=the dark film for linear → [{ kind, id, title, sub, snippet }]
import { existsSync, readFileSync, readdirSync } from "node:fs"
import type { ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin } from "vite"

export type Hit = { kind: "kit" | "version" | "brief" | "proposal" | "reference" | "review"; id: string; title: string; sub: string; snippet: string; score: number }
type Doc = Omit<Hit, "snippet" | "score"> & { texts: string[] }

const STOP = new Set("a an the and or of to in on for with my our your that this it its is are was were be by at from as what where which who one".split(" "))
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w)
export const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w)).map(stem)
/** every string in a thing, however deep */
const strings = (x: unknown, out: string[] = []): string[] => {
  if (typeof x === "string") out.push(x)
  else if (Array.isArray(x)) for (const v of x) strings(v, out)
  else if (x && typeof x === "object") for (const v of Object.values(x)) strings(v, out)
  return out
}
const readJson = (f: string): unknown => {
  try {
    return JSON.parse(readFileSync(f, "utf8"))
  } catch {
    return null
  }
}
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : [])

/** Ranks docs against what's asked (plain data: `npm run check` runs it). */
export function rank(docs: Doc[], q: string, n = 20): Hit[] {
  const want = [...new Set(words(q))]
  if (!want.length) return []
  const hits: Hit[] = []
  for (const d of docs) {
    const title = new Set(words(d.title))
    const body = d.texts.map((t) => ({ t, w: words(t) }))
    const all = new Set(body.flatMap((b) => b.w))
    const has = (set: Set<string>, q: string) => set.has(q) || (q.length >= 3 && [...set].some((w) => w.startsWith(q)))
    let score = 0
    let found = 0
    let named = false
    let first: string | undefined
    for (const q of want) {
      if (has(title, q)) (score += 3), found++, (named = true)
      else if (has(all, q)) (score += 1), found++, (first ??= q)
    }
    if (!named && found < Math.ceil(want.length / 2)) continue
    const line = first ? (body.find((b) => b.w.some((w) => w === first || w.startsWith(first!)))?.t ?? "") : ""
    hits.push({ kind: d.kind, id: d.id, title: d.title, sub: d.sub, snippet: line.replace(/\s+/g, " ").slice(0, 110), score: score + found / want.length })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, n)
}

function gather(root: string): Doc[] {
  const data = join(root, ".engine-data")
  const docs: Doc[] = []
  for (const id of list(join(data, "kits"))) {
    const k = readJson(join(data, "kits", id, "kit.json")) as { name?: string; url?: string; files?: unknown[] } | null
    if (k) docs.push({ kind: "kit", id, title: k.name ?? "Product", sub: `Product · ${k.files?.length ?? 0} files`, texts: strings(k) })
  }
  for (const f of list(join(data, "versions")).filter((f) => f.endsWith(".json"))) {
    const v = readJson(join(data, "versions", f)) as { id: string; name: string; at: string; comp: unknown } | null
    if (v) docs.push({ kind: "version", id: v.id, title: v.name, sub: `Version · ${v.at.slice(0, 10)}`, texts: strings(v.comp) })
  }
  for (const f of list(join(data, "briefs")).filter((f) => f.endsWith(".json"))) {
    const b = readJson(join(data, "briefs", f))
    if (b) docs.push({ kind: "brief", id: f.slice(0, -5), title: `Brief for ${f.slice(0, -5)}`, sub: "Directing brief", texts: strings(b) })
  }
  for (const p of (readJson(join(data, "lab", "proposals.json")) as { id: string; kind: string; status?: string; script?: { name?: string }; rationale?: unknown; changes?: unknown }[] | null) ?? [])
    docs.push({ kind: "proposal", id: p.id, title: p.script?.name ?? "Proposal", sub: `Lab proposal · ${p.kind}${p.status ? ` · ${p.status}` : ""}`, texts: strings([p.rationale, p.changes, p.script]) })
  for (const r of (readJson(join(data, "lab", "references.json")) as { id: string; title?: string; category?: string }[] | null) ?? [])
    docs.push({ kind: "reference", id: r.id, title: r.title ?? "Studied film", sub: `Studied film${r.category ? ` · ${r.category}` : ""}`, texts: strings(r) })
  for (const id of list(join(data, "reviews"))) {
    const r = readJson(join(data, "reviews", id, "review.json")) as { name: string; comments: { text: string; by: string }[] } | null
    if (r) docs.push({ kind: "review", id, title: r.name, sub: `Review · ${r.comments.length} note${r.comments.length === 1 ? "" : "s"}`, texts: r.comments.flatMap((c) => [c.text, c.by]) })
  }
  return docs
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}

export function search(): Plugin {
  return {
    name: "search",
    async configureServer(s) {
      const { fromEngine } = await import("./studio")
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (url.pathname !== "/__search") return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        // ponytail: reads every file on each search; an index when there are thousands of things kept
        json(res, 200, rank(gather(s.config.root), url.searchParams.get("q") ?? ""))
      })
    },
  }
}
