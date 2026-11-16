// The website check: any page, on every device at its own screen size. A page that refuses to be framed
// (X-Frame-Options, or a CSP frame-ancestors) comes through the engine instead: each device has a site of its own
// (site-iphone.localhost…) that stands in for the real one, path for path, so the page's router sees its real paths and
// its own requests come back through here. Those headers are dropped, cookies are kept on the stand-in, each device
// sends its own user agent, the engine's bridge goes in (so the frame rate shows), and a link clicked on one device
// opens on all of them.
//   GET /__site/check?u=<url>   -> { url, status, frameable, why, title }       (the engine's page only)
//   on site-<device>.localhost:
//   GET /__site/go?u=<url>&ua=…&frame=…   point this device's stand-in at a site, then go to the page's path
//   anything else                          that path, fetched from the site it stands in for
import { readFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { Readable } from "node:stream"
import type { Plugin } from "vite"
import { fromEngine } from "./library"

const UA: Record<string, string> = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  // iPad Safari asks for the desktop site by default, so it says it's a Mac
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
}
const uaFor = (d: string) => (d === "iphone" || d === "duo" ? UA.iphone : UA.mac)

/** Why a page can't be shown in a frame, or "" if it can. */
function refuses(h: Headers) {
  const xfo = (h.get("x-frame-options") ?? "").toLowerCase()
  if (/deny|sameorigin/.test(xfo)) return `X-Frame-Options: ${xfo.toUpperCase()}`
  const fa = /frame-ancestors([^;]*)/i.exec(h.get("content-security-policy") ?? "")?.[1].trim()
  if (fa && !fa.split(/\s+/).includes("*")) return `CSP frame-ancestors ${fa}`
  return ""
}

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader("content-type", "application/json")
  res.setHeader("cache-control", "no-store")
  res.end(JSON.stringify(body))
}
const web = (u: string | null) => {
  try {
    const x = new URL(u ?? "")
    return /^https?:$/.test(x.protocol) ? x : null
  } catch {
    return null
  }
}
const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []
    req.on("data", (c: Buffer) => parts.push(c))
    req.on("end", () => resolve(Buffer.concat(parts)))
    req.on("error", reject)
  })

/** fetch, and once more if the connection drops (a busy line resets sockets); never again after a timeout or for a POST */
async function fetchy(url: string | URL, init: RequestInit) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if ((init.method ?? "GET") !== "GET" || /Abort|Timeout/.test((e as Error).name)) throw e
    return fetch(url, init)
  }
}

/** What a frame shows when its page couldn't be had: why, and how to try again. */
function oops(res: ServerResponse, why: string) {
  res.statusCode = 502
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  const esc = why.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  res.end(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;font:15px/1.45 system-ui,sans-serif;color:#8b8b93;background:#0b0b0d;text-align:center"><p>${esc}<br><span style="font-size:13px">Replay (R) tries again.</span></p>`,
  )
}

/** What each device's stand-in shows: the site, the user agent, and what the bridge needs to know. */
type Target = { origin: string; ua: string; boot: Record<string, string> }
const targets = new Map<string, Target>()

/** Put in the page's <head>: who it is to the engine, the bridge, and links sent back so every device follows. */
const inject = (t: Target) =>
  `<script>window.__engineQuery=${JSON.stringify(t.boot).replace(/</g, "\\u003c")};window.__siteOrigin=${JSON.stringify(t.origin)}</script>` +
  `<script src="/__site/bridge.js"></script>` +
  // parsed is enough to show it (a page with a streaming video never fires load)
  // and the colour Safari would paint the status bar's strip with: the page's theme-color, else its background
  `<script>(function(){var Q=window.__engineQuery,say=function(t,x){parent.postMessage(Object.assign({source:"anim-engine-stage",frame:Q.frame,type:t},x||{}),Q.host)},bg=function(e){var c=e&&getComputedStyle(e).backgroundColor;return c&&c!=="rgba(0, 0, 0, 0)"&&c!=="transparent"?c:""},ground=function(){var m=document.querySelector('meta[name="theme-color"]:not([media]),meta[name="theme-color"][media*="'+(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")+'"]');var b=bg(document.body)||bg(document.documentElement)||"rgb(255, 255, 255)";say("ground",{top:(m&&m.content)||b,bottom:b})};document.addEventListener("DOMContentLoaded",function(){say("painted");ground();setTimeout(ground,1500)})})()</script>` +
  `<script>addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||a.hasAttribute("download"))return;var t=a.getAttribute("target");if(t&&t!=="_self")return;var u=new URL(a.href,location.href);if(!/^https?:$/.test(u.protocol))return;if(u.origin===location.origin&&u.pathname===location.pathname&&u.search===location.search)return;var real=u.origin===location.origin?window.__siteOrigin+u.pathname+u.search+u.hash:u.href;e.preventDefault();parent.postMessage({source:"anim-engine-stage",frame:window.__engineQuery.frame,type:"navigate",url:real},window.__engineQuery.host)},true)</script>`

const DROP = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "strict-transport-security",
  "alt-svc",
  "set-cookie",
  "location",
  "cache-control",
  "etag",
  "last-modified",
  "expires",
  "age",
  "report-to",
  "nel",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
])
const PASS = ["accept", "accept-language", "content-type", "cookie", "range", "x-requested-with"]

async function go(req: IncomingMessage, res: ServerResponse, host: string, q: URLSearchParams) {
  // only ever a frame the engine opened: a page can't point its own stand-in somewhere else (it could read what came
  // back, and use that as a way into the local network)
  if (req.headers["sec-fetch-dest"] !== "iframe" || req.headers["sec-fetch-site"] === "same-origin") return json(res, 403, { error: "Only the engine opens pages here" })
  const u = web(q.get("u"))
  if (!u) return json(res, 400, { error: "Not a web address" })
  const ua = uaFor(q.get("ua") ?? "")
  // where it ends up (raylight.app → www.raylight.app), so the stand-in is for that site
  const r = await fetchy(u, { redirect: "follow", headers: { "user-agent": ua }, signal: AbortSignal.timeout(15000) })
  void r.body?.cancel()
  const end = new URL(r.url)
  const boot = Object.fromEntries([...q].filter(([k]) => k !== "u" && k !== "ua"))
  const was = targets.get(host)
  targets.set(host, { origin: end.origin, ua, boot })
  res.statusCode = 302
  res.setHeader("cache-control", "no-store")
  // another site on the same stand-in: none of the last one's cookies or storage
  if (was && was.origin !== end.origin) res.setHeader("clear-site-data", '"cookies", "storage"')
  res.setHeader("location", end.pathname + end.search + u.hash)
  res.end()
}

/** A site's static files (scripts, styles, fonts, pictures), kept here once fetched: every device asks for the same
    ones, and a browser only opens six connections to each stand-in, so fetching each one once is most of the speed. */
type Kept = { status: number; headers: [string, string][]; body: Buffer }
const STATIC = /\.(m?js|css|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/i
const kept = new Map<string, Kept>()
const coming = new Map<string, Promise<Kept>>()
let keptBytes = 0
function staticFile(url: string, headers: Record<string, string>) {
  const hit = kept.get(url)
  if (hit) return Promise.resolve(hit)
  let p = coming.get(url)
  if (!p) {
    p = (async () => {
      const r = await fetchy(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) })
      const k: Kept = { status: r.status, headers: [...r.headers].filter(([h]) => !DROP.has(h)), body: Buffer.from(await r.arrayBuffer()) }
      if (r.status === 200 && k.body.length < 8e6) {
        kept.set(url, k)
        keptBytes += k.body.length
        // ponytail: oldest-first eviction at 256 MB; an LRU if sites ever thrash it
        for (const [u, x] of kept) {
          if (keptBytes < 256e6) break
          kept.delete(u)
          keptBytes -= x.body.length
        }
      }
      return k
    })().finally(() => coming.delete(url))
    coming.set(url, p)
  }
  return p
}

async function proxy(req: IncomingMessage, res: ServerResponse, host: string) {
  const t = targets.get(host)
  if (!t) return json(res, 404, { error: "Open a page from the engine's website check" })
  // no service workers: one would outlive this site on this stand-in
  if (req.headers["service-worker"]) return json(res, 404, { error: "No service workers here" })
  const headers: Record<string, string> = { "user-agent": t.ua }
  for (const k of PASS) if (typeof req.headers[k] === "string") headers[k] = req.headers[k] as string
  const ref = req.headers.referer
  if (ref) headers.referer = ref.replace(/^https?:\/\/[^/]+/, t.origin)
  const method = req.method ?? "GET"
  if (method === "GET" && STATIC.test(req.url ?? "") && !req.headers.range) {
    const k = await staticFile(t.origin + req.url, headers)
    res.statusCode = k.status
    for (const [h, v] of k.headers) res.setHeader(h, v)
    res.setHeader("cache-control", "no-store")
    return res.end(k.body)
  }
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req)
  // a slow first byte gives up after 20 s; a long body (a video) streams for as long as it takes, until the frame goes
  const ac = new AbortController()
  const slow = setTimeout(() => ac.abort(new DOMException("The site took too long to answer", "TimeoutError")), 20000)
  res.on("close", () => ac.abort())
  const r = await fetchy(t.origin + (req.url ?? "/"), { method, headers, body, redirect: "manual", signal: ac.signal }).finally(() => clearTimeout(slow))
  res.statusCode = r.status
  r.headers.forEach((v, k) => !DROP.has(k) && res.setHeader(k, v))
  // the stand-in keeps the site's cookies, on itself
  const cookies = r.headers.getSetCookie().map((c) =>
    c
      .replace(/;\s*domain=[^;]*/gi, "")
      .replace(/;\s*secure/gi, "")
      .replace(/;\s*samesite=none/gi, "; SameSite=Lax"),
  )
  if (cookies.length) res.setHeader("set-cookie", cookies)
  const loc = r.headers.get("location")
  if (loc) {
    const to = new URL(loc, t.origin)
    res.setHeader("location", to.origin === t.origin ? to.pathname + to.search + to.hash : to.href)
  }
  // a stand-in is one site today and another tomorrow: nothing it serves may be cached
  res.setHeader("cache-control", "no-store")
  const dest = req.headers["sec-fetch-dest"]
  if ((r.headers.get("content-type") ?? "").includes("html") && (dest === "iframe" || dest === "document")) {
    const html = (await r.text()).replace(/<meta[^>]+http-equiv=["']?content-security-policy[^>]*>/gi, "")
    const add = inject(t)
    return res.end(/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + add) : add + html)
  }
  if (!r.body || method === "HEAD") return res.end()
  const stream = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream)
  stream.on("error", () => res.destroy())
  stream.pipe(res)
}

export function site(): Plugin {
  return {
    name: "anim-engine-site",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host ?? ""
        const stand = /^site-[a-z]+\.localhost(:\d+)?$/i.test(host)
        const url = new URL(req.url ?? "/", "http://x")
        if (!stand && url.pathname !== "/__site/check") return next()
        void (async () => {
          try {
            if (url.pathname === "/__site/check") {
              if (!fromEngine(req)) return json(res, 403, { error: "Not from the engine" })
              const u = web(url.searchParams.get("u"))
              if (!u) return json(res, 400, { error: "That isn't a web address. Start it with https://" })
              const r = await fetch(u, { redirect: "follow", headers: { "user-agent": UA.mac, accept: "text/html,*/*;q=0.8" }, signal: AbortSignal.timeout(10000) })
              const html = (r.headers.get("content-type") ?? "").includes("html") ? (await r.text()).slice(0, 300_000) : ""
              const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1].trim().replace(/\s+/g, " ") ?? ""
              const why = refuses(r.headers)
              return json(res, 200, { url: r.url, status: r.status, frameable: !why, why, title })
            }
            if (url.pathname === "/__site/go") return await go(req, res, host, url.searchParams)
            if (url.pathname === "/__site/bridge.js") {
              res.setHeader("content-type", "text/javascript")
              res.setHeader("cache-control", "no-store")
              return res.end(readFileSync(join(server.config.publicDir, "engine-bridge.js")))
            }
            return await proxy(req, res, host)
          } catch (e) {
            const m = (e as Error).name === "TimeoutError" ? "The site took too long to answer" : `Couldn't reach it: ${(e as Error).message}`
            const dest = req.headers["sec-fetch-dest"]
            if (!res.headersSent) return dest === "iframe" || dest === "document" ? oops(res, m) : json(res, 502, { error: m })
            res.end()
          }
        })()
      })
    },
  }
}
