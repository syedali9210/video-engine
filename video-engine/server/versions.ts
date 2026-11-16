// Named versions of a film: the composition as it was, kept by name on this machine (.engine-data/versions), so a
// direction can be tried and gone back to, after any number of edits and reloads.
//   GET /__versions/list · /__versions/get?id=   POST /__versions/save { name, comp } · /__versions/remove { id }
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import type { Plugin } from "vite"

type Version = { id: string; name: string; at: string; scenes: number; seconds: number; comp: { scenes: { duration: number }[] } }

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
      if (size > 20 * 1024 * 1024) req.destroy(new Error("That composition is too big to keep."))
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

export function versions(): Plugin {
  return {
    name: "versions",
    async configureServer(s) {
      const { fromEngine } = await import("./studio")
      const dir = join(s.config.root, ".engine-data", "versions")
      mkdirSync(dir, { recursive: true })
      const file = (id: string) => join(dir, `${id}.json`)
      const read = (id: string) => (existsSync(file(id)) ? (JSON.parse(readFileSync(file(id), "utf8")) as Version) : null)
      const list = () =>
        readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => read(f.slice(0, -5)))
          .filter((v): v is Version => !!v)
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(({ comp: _, ...v }) => v)
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x")
        if (!url.pathname.startsWith("/__versions/")) return next()
        if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
        const what = url.pathname.split("/")[2]
        void (async () => {
          try {
            if (req.method === "GET") {
              if (what === "list") return json(res, 200, list())
              const id = url.searchParams.get("id") ?? ""
              const v = /^[\w-]{8,64}$/.test(id) ? read(id) : null
              return v ? json(res, 200, v) : json(res, 404, { error: "No such version" })
            }
            const b = await body(req)
            if (what === "save") {
              const comp = b.comp as Version["comp"]
              if (!comp || !Array.isArray(comp.scenes) || !comp.scenes.length) return json(res, 400, { error: "A composition, please." })
              const v: Version = { id: randomUUID(), name: String(b.name ?? "").trim().slice(0, 80) || "Untitled", at: new Date().toISOString(), scenes: comp.scenes.length, seconds: Math.round(comp.scenes.reduce((a, x) => a + (Number(x.duration) || 0), 0) * 10) / 10, comp }
              writeFileSync(file(v.id), JSON.stringify(v))
              return json(res, 200, list())
            }
            if (what === "remove" && typeof b.id === "string" && /^[\w-]{8,64}$/.test(b.id)) {
              rmSync(file(b.id), { force: true })
              return json(res, 200, list())
            }
            return json(res, 404, { error: "Not found" })
          } catch (e) {
            return json(res, 500, { error: (e as Error).message })
          }
        })()
      })
    },
  }
}
