// The Animation Engine's embed script, for a site that shows films from the engine (<iframe class="engine-film">
// pointing at the engine's play.html). With it, every film on the page:
//   - takes the shape its link asks for at the page's width (a laptop from 1024 px, a tablet from 744 px, a phone
//     below), and keeps it as the page resizes, so it's right on a Mac, an iPad, an iPhone and a Duo by itself;
//   - loads only as it comes near the screen (its link in data-src), the nearest first and two at a time, so a page of
//     many films opens as fast as a page of one; at most four stay loaded, the farthest off screen let go (and loaded
//     again on the way back), so memory stays flat however many there are;
//   - plays with the page's scroll when its link says play=scroll, and rests while it's off screen.
// Films a page adds later (a single-page app's) are picked up too.
// <script src="https://<where the engine is>/embed.js" defer></script>, once per page, however many films.
(() => {
  const LOADING = 2 // films loading at once
  const LIVE = 4 // films kept loaded
  const ratio = (shape) => {
    const m = /^(\d+)x(\d+)$/.exec(shape || "")
    return m ? `${m[1]} / ${m[2]}` : "16 / 9"
  }
  const link = (f) => {
    const s = f.getAttribute("src")
    return s && s !== "about:blank" ? s : f.dataset.src || ""
  }
  const opts = (f) => new URLSearchParams(link(f).split("#")[1] || "")
  const films = () => [...document.querySelectorAll("iframe.engine-film")]
  const tell = (f, msg) => f.contentWindow && f.contentWindow.postMessage({ engineFilm: msg.what, ...msg }, "*")
  // queued (waiting to be near and have a turn) → loading (until it says it's ready) → live
  const state = new WeakMap()
  const near = new Set()
  const shown = new Set()
  const away = (f) => {
    const r = f.getBoundingClientRect()
    return Math.abs(r.top + r.height / 2 - innerHeight / 2)
  }

  const fit = () => {
    const w = document.documentElement.clientWidth
    const at = w >= 1024 ? 0 : w >= 744 ? 1 : 2
    for (const f of films()) {
      const shapes = (opts(f).get("shape") || "16x9,4x3,4x5").split(",")
      f.style.width = "100%"
      f.style.height = "auto"
      f.style.aspectRatio = ratio(shapes[at] || shapes[0])
      // a quiet tint holds its place until it loads
      if (!f.style.backgroundColor) f.style.backgroundColor = "rgba(128, 128, 128, 0.08)"
    }
  }

  // how far a film is through its pass across the screen: 0 as its top comes in at the bottom, 1 as its bottom leaves
  const scrub = () => {
    for (const f of films()) {
      if (state.get(f) !== "live" || opts(f).get("play") !== "scroll") continue
      const r = f.getBoundingClientRect()
      tell(f, { what: "seek", p: Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))) })
    }
  }

  /* ---- loading: near the screen, nearest first, a few at a time, a few kept ---- */
  const pump = () => {
    const all = films()
    let loading = all.filter((f) => state.get(f) === "loading").length
    const next = all.filter((f) => state.get(f) === "queued" && near.has(f)).sort((a, b) => away(a) - away(b))
    for (const f of next) {
      if (loading >= LOADING) break
      load(f)
      loading++
    }
  }
  const load = (f) => {
    const kept = films().filter((x) => state.get(x) === "live" || state.get(x) === "loading")
    if (kept.length >= LIVE) {
      const far = kept.filter((x) => !shown.has(x)).sort((a, b) => away(b) - away(a))[0]
      if (far) unload(far)
    }
    state.set(f, "loading")
    f.src = f.dataset.src
    // loaded when it says it's ready; a film that never says so gets its turn back after a while
    f.__engineWait = setTimeout(() => ready(f), 8000)
  }
  const ready = (f) => {
    if (state.get(f) !== "loading") return
    clearTimeout(f.__engineWait)
    state.set(f, "live")
    tell(f, { what: "visible", on: shown.has(f) })
    scrub()
    pump()
  }
  const unload = (f) => {
    f.dataset.src = link(f)
    f.src = "about:blank"
    state.set(f, "queued")
  }

  const nearby = new IntersectionObserver(
    (list) => {
      for (const e of list) e.isIntersecting ? near.add(e.target) : near.delete(e.target)
      pump()
    },
    { rootMargin: "600px 0px" },
  )
  const seen = new IntersectionObserver((list) => {
    for (const e of list) {
      e.isIntersecting ? shown.add(e.target) : shown.delete(e.target)
      tell(e.target, { what: "visible", on: e.isIntersecting })
    }
  })

  // the engine's address, reached for once before the first film needs it
  const reached = new Set()
  const preconnect = (f) => {
    try {
      const o = new URL(link(f), location.href).origin
      if (o === location.origin || reached.has(o)) return
      reached.add(o)
      document.head.appendChild(Object.assign(document.createElement("link"), { rel: "preconnect", href: o }))
    } catch {
      /* not a link */
    }
  }

  const scan = () => {
    for (const f of films()) {
      if (state.has(f)) continue
      // an embed with its link in src was already left to the browser to load
      state.set(f, f.dataset.src && !f.getAttribute("src") ? "queued" : "live")
      preconnect(f)
      nearby.observe(f)
      seen.observe(f)
      f.addEventListener("load", () => (fit(), scrub()))
    }
    fit()
    scrub()
    pump()
  }
  addEventListener("resize", () => (fit(), scrub()))
  addEventListener("scroll", scrub, { passive: true })
  addEventListener("message", (e) => {
    if (!e.data || e.data.engineFilm !== "ready") return
    const f = films().find((x) => x.contentWindow === e.source)
    if (f) ready(f)
    scrub()
  })
  const start = () => {
    scan()
    // films added later, once a frame at most
    let queued = 0
    new MutationObserver(() => queued || (queued = requestAnimationFrame(() => ((queued = 0), scan())))).observe(document.body, { childList: true, subtree: true })
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start)
  else start()
})()
