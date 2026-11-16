// Review links: an exported film kept with its comments (.engine-data/reviews/<id>), each comment at a moment and a
// spot on the frame, for whoever has the link: on this machine, or anyone on its network when the dev server is
// shared (npm run dev -- --host).
//   POST /__review/new { job, name } → { id }   GET /__review/list · /__review/<id> · /__review/<id>/film
//   POST /__review/<id>/comment { t, x, y, text, by } · /__review/<id>/resolve { comment, done }
import { randomUUID } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin } from "vite"

type Comment = { id: string; t: number; x: number; y: number; text: string; by: string; at: string; done?: boolean }
type Review = { id: string; name: string; at: string; comments: Comment[] }

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}
const body = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const parts: Buffer[] = []
    let size = 0
    req.on("data", (c: Buffer) => {
      size += c.length
      if (size > 64 * 1024) req.destroy(new Error("That comment is too long."))
      else parts.push(c)
    })
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString() || "{}"))
      } catch (e) {
        reject(e)
      }
    })
    req.on("error", reject)
  })
const unit = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0))

export function reviews(): Plugin {
  return {
    name: "reviews",
    async configureServer(s) {
      const { fromEngine, jobFile, sendFile } = await import("./studio")
      const dir = join(s.config.root, ".engine-data", "reviews")
      mkdirSync(dir, { recursive: true })
      const file = (id: string) => join(dir, id, "review.json")
      const read = (id: string) => (/^[\da-f-]{36}$/.test(id) && existsSync(file(id)) ? (JSON.parse(readFileSync(file(id), "utf8")) as Review) : null)
      const write = (r: Review) => writeFileSync(file(r.id), JSON.stringify(r, null, 2))
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__review/")) return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        const [, , id, extra] = url.pathname.split("/")
        void (async () => {
          try {
            if (req.method === "GET" && id === "list")
              return json(
                res,
                200,
                readdirSync(dir)
                  .map(read)
                  .filter((r): r is Review => !!r)
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((r) => ({ id: r.id, name: r.name, at: r.at, comments: r.comments.length, open: r.comments.filter((c) => !c.done).length })),
              )
            if (req.method === "POST" && id === "new") {
              const b = await body(req)
              const film = jobFile(String(b.job ?? ""))
              if (!film?.endsWith(".mp4")) return json(res, 400, { error: "Only a finished video export can go up for review." })
              const r: Review = { id: randomUUID(), name: String(b.name ?? "Film").slice(0, 120), at: new Date().toISOString(), comments: [] }
              mkdirSync(join(dir, r.id))
              copyFileSync(film, join(dir, r.id, "film.mp4"))
              write(r)
              return json(res, 200, { id: r.id })
            }
            const r = read(id)
            if (!r) return json(res, 404, { error: "There's no review at that link." })
            if (req.method === "GET" && !extra) return json(res, 200, r)
            if (req.method === "GET" && extra === "film") return sendFile(req, res, join(dir, r.id, "film.mp4"), "video/mp4")
            if (req.method === "POST" && extra === "comment") {
              const b = await body(req)
              const text = String(b.text ?? "").trim().slice(0, 2000)
              if (!text) return json(res, 400, { error: "Write something first." })
              r.comments.push({ id: randomUUID(), t: Math.max(0, Number(b.t) || 0), x: unit(b.x), y: unit(b.y), text, by: String(b.by ?? "").trim().slice(0, 60) || "Someone", at: new Date().toISOString() })
              write(r)
              return json(res, 200, r)
            }
            if (req.method === "POST" && extra === "resolve") {
              const b = await body(req)
              const c = r.comments.find((x) => x.id === b.comment)
              if (!c) return json(res, 404, { error: "That comment's gone." })
              c.done = !!b.done
              write(r)
              return json(res, 200, r)
            }
            json(res, 404, { error: "Not a review route" })
          } catch (e) {
            json(res, 500, { error: (e as Error).message })
          }
        })()
      })
    },
  }
}
