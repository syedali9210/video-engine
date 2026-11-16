// Product → tools for what's in the kit:
//   From release notes: a changelog, a PRD or a ticket made into a feature launch (what's new, its features ranked).
//   Logo to vector: a bitmap logo traced into an SVG (studio/trace.ts), added to the kit.
//   What changed: two versions of a screen compared pixel by pixel, the changed areas boxed and labelled (the Work API
//     says what changed in each), the result added to the kit.
//   Cut out its parts: a screen's parts found (the Work API) and cut into pictures of their own, for close-ups.
import { useState } from "react"
import { field } from "./controls"
import { Button, Select } from "./ui"
import { Glyph } from "./Thinking"
import { traceLogo } from "./studio/trace"
import type { KitFile, ProductKit } from "./studio/product"

const load = (src: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => no(new Error("That picture didn't load"))
    i.src = src
  })
const blobOf = (c: HTMLCanvasElement, type = "image/png") => new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't draw it"))), type))

/** The areas that differ between two screens: both drawn 600 wide, compared pixel by pixel, the changed 24 px cells
    joined into boxes (fractions of the screen), the biggest first. */
export async function changedAreas(a: string, b: string) {
  const [ia, ib] = await Promise.all([load(a), load(b)])
  const W = 600
  const H = Math.round((W * ib.naturalHeight) / ib.naturalWidth)
  const draw = (img: HTMLImageElement) => {
    const c = Object.assign(document.createElement("canvas"), { width: W, height: H })
    c.getContext("2d")!.drawImage(img, 0, 0, W, H)
    return c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  }
  const [da, db] = [draw(ia), draw(ib)]
  const C = 24
  const [gw, gh] = [Math.ceil(W / C), Math.ceil(H / C)]
  const hot = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let n = 0
      let changed = 0
      for (let y = gy * C; y < Math.min(H, gy * C + C); y += 2)
        for (let x = gx * C; x < Math.min(W, gx * C + C); x += 2) {
          const i = (y * W + x) * 4
          n++
          if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 40) changed++
        }
      if (changed / n > 0.06) hot[gy * gw + gx] = 1
    }
  // joined: each group of touching cells, one box
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const seen = new Uint8Array(gw * gh)
  for (let i = 0; i < hot.length; i++) {
    if (!hot[i] || seen[i]) continue
    let [x0, y0, x1, y1] = [gw, gh, 0, 0]
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const j = stack.pop()!
      const [x, y] = [j % gw, Math.floor(j / gw)]
      ;[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const [nx, ny] = [x + dx, y + dy]
        const k = ny * gw + nx
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && hot[k] && !seen[k]) {
          seen[k] = 1
          stack.push(k)
        }
      }
    }
    const box = { x: (x0 * C) / W, y: (y0 * C) / H, w: Math.min(1, ((x1 + 1) * C) / W) - (x0 * C) / W, h: Math.min(1, ((y1 + 1) * C) / H) - (y0 * C) / H }
    if (box.w * box.h > 0.002) boxes.push(box)
  }
  return { boxes: boxes.sort((p, q) => q.w * q.h - p.w * p.h).slice(0, 12), after: ib }
}

/** A step a line: "click Sign up", "type Email = me@site.com", "type hello", "wait 1000", "scroll 600". */
export function readSteps(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [, verb, rest = ""] = /^(click|type|wait|scroll)\s*(.*)$/i.exec(l) ?? [, "click", l]
      const v = verb.toLowerCase()
      if (v === "wait" || v === "scroll") return { do: v, ms: Number(rest) || (v === "wait" ? 1000 : 600) }
      if (v === "type") {
        const [target, text] = rest.includes("=") ? rest.split(/\s*=\s*/) : ["", rest]
        return { do: "type", ...(target ? { target } : {}), text }
      }
      return { do: "click", target: rest }
    })
}

/** The running app filmed through a flow: the steps given, or a goal it plans the steps from (the Work API). */
function Tour({ kit, onKit, busy, act }: { kit: ProductKit; onKit: (k: ProductKit) => void; busy: string; act: (what: string, run: () => Promise<string>) => Promise<void> }) {
  const [url, setUrl] = useState(kit.url ?? "")
  const [steps, setSteps] = useState("")
  const [goal, setGoal] = useState("")
  const [phone, setPhone] = useState(false)
  return (
    <section className="space-y-2 lg:col-span-2">
      <h3 className="text-body font-semibold">Film a tour of the app</h3>
      <p className="text-caption text-fg-3">The running app driven through a flow with real clicks and keys, a cursor gliding to each target, filmed into a clip for the kit. One step a line (click Sign up · type Email = me@site.com · wait 1000 · scroll 600), or just say the goal.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000" aria-label="The app's address" spellCheck={false} className={`${field} mono h-8 w-full px-2.5 text-body`} />
        <label className="flex items-center gap-1.5 text-caption text-fg-2">
          <input type="checkbox" checked={phone} onChange={(e) => setPhone(e.target.checked)} /> On a phone
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <textarea rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"click Sign up\ntype Email = me@site.com\nclick Continue"} aria-label="The steps" className={`${field} mono w-full px-2.5 py-1.5 text-caption`} />
        <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Or the goal: create a project and invite a teammate" aria-label="The goal" className={`${field} w-full px-2.5 py-1.5 text-body`} />
      </div>
      <Button size="sm" disabled={!!busy || !url.trim() || (!steps.trim() && !goal.trim())} onClick={() => void act("tour", async () => {
        const r = await fetch("/__kit/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: kit.id, url: url.trim(), steps: readSteps(steps), goal: goal.trim(), phone }) })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? "The tour didn't film")
        onKit(j.kit)
        return `Filmed: ${(j.steps as string[]).join(" → ")}. The clip is in the kit.`
      })}>
        {busy === "tour" ? <><Glyph variant="slide" size={14} /> Driving the app and filming…</> : "Film it"}
      </Button>
    </section>
  )
}

export function KitTools({ kit, onKit, add }: { kit: ProductKit; onKit: (k: ProductKit) => void; /** files into the kit (as a drop does) */ add: (files: File[]) => Promise<void> }) {
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState("")
  const [notes, setNotes] = useState("")
  const screens = kit.files.filter((f) => f.type.startsWith("image/") && f.type !== "image/svg+xml")
  const [a, setA] = useState(screens[0]?.id ?? "")
  const [b, setB] = useState(screens[1]?.id ?? "")
  const [one, setOne] = useState(screens.find((f) => f.kind !== "logo")?.id ?? screens[0]?.id ?? "")
  const logo = kit.files.find((f) => f.kind === "logo" && f.type !== "image/svg+xml")
  const post = async <T,>(path: string, body: object) => {
    const r = await fetch(`/__kit/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: kit.id, ...body }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error ?? "The engine's server said no")
    return j as T
  }
  const act = async (what: string, run: () => Promise<string>) => {
    setBusy(what)
    setMsg("")
    try {
      setMsg(await run())
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  const byId = (id: string) => kit.files.find((f) => f.id === id) as KitFile
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <Select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className={`${field} h-8 min-w-0 flex-1 cursor-pointer px-2 text-caption`}>
      {screens.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </Select>
  )
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2">
        <h3 className="text-body font-semibold">From release notes</h3>
        <p className="text-caption text-fg-3">A changelog, a PRD or a ticket: what's new becomes the feature the film launches, its features ranked.</p>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste the release notes" aria-label="Release notes" className={`${field} w-full px-2.5 py-1.5 text-body`} />
        <Button size="sm" disabled={!!busy || notes.trim().length < 20} onClick={() => void act("release", async () => {
          const k = await post<ProductKit>("release", { text: notes })
          onKit(k)
          setNotes("")
          return `A feature launch: ${k.understanding?.whatsNew ?? "read"}. Plan a film above: a feature countdown fits it.`
        })}>
          {busy === "release" ? <><Glyph variant="breathe" size={14} /> Reading the notes…</> : "Make it a feature launch"}
        </Button>
      </section>
      <section className="space-y-2">
        <h3 className="text-body font-semibold">Logo to vector</h3>
        <p className="text-caption text-fg-3">{logo ? `“${logo.name}” traced into an SVG, so a close-up of it never blurs.` : "Drop a logo (a PNG or JPEG) to trace it."}</p>
        <Button size="sm" disabled={!logo || !!busy} onClick={() => void act("vector", async () => {
          const img = await load(logo!.url)
          const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight))
          const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) })
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
          const { svg, colours } = traceLogo(c.getContext("2d")!.getImageData(0, 0, c.width, c.height))
          await add([new File([svg], `${logo!.name.replace(/\.[^.]+$/, "")} (vector).svg`, { type: "image/svg+xml" })])
          return `Traced in ${colours.length} ${colours.length === 1 ? "colour" : "colours"}: ${colours.join(", ")}. It's in the kit as a logo.`
        })}>
          {busy === "vector" ? "Tracing…" : "Trace it"}
        </Button>
      </section>
      <section className="space-y-2">
        <h3 className="text-body font-semibold">What changed</h3>
        <p className="text-caption text-fg-3">Two versions of a screen: what differs, boxed and named, for a before and after.</p>
        <div className="flex gap-2">
          {pick(a, setA, "Before")}
          {pick(b, setB, "After")}
        </div>
        <Button size="sm" disabled={screens.length < 2 || a === b || !!busy} onClick={() => void act("spot", async () => {
          const { boxes, after } = await changedAreas(byId(a).url, byId(b).url)
          if (!boxes.length) return "They're the same, to the pixel (near enough)."
          const labels = await post<{ labels: string[] }>("spot", { a, b, boxes }).then((r) => r.labels).catch(() => [] as string[])
          const c = Object.assign(document.createElement("canvas"), { width: after.naturalWidth, height: after.naturalHeight })
          const g = c.getContext("2d")!
          g.drawImage(after, 0, 0)
          const s = c.width / 600
          g.lineWidth = 3 * s
          g.font = `600 ${14 * s}px Geist, system-ui, sans-serif`
          boxes.forEach((x, i) => {
            g.strokeStyle = "#ff3b30"
            g.strokeRect(x.x * c.width, x.y * c.height, x.w * c.width, x.h * c.height)
            const t = `${i + 1}${labels[i] ? `  ${labels[i]}` : ""}`
            g.fillStyle = "#ff3b30"
            g.fillRect(x.x * c.width, Math.max(0, x.y * c.height - 20 * s), g.measureText(t).width + 12 * s, 20 * s)
            g.fillStyle = "#fff"
            g.fillText(t, x.x * c.width + 6 * s, Math.max(14 * s, x.y * c.height - 5 * s))
          })
          await add([new File([await blobOf(c)], `${byId(b).name.replace(/\.[^.]+$/, "")} · what changed.png`, { type: "image/png" })])
          return `${boxes.length} ${boxes.length === 1 ? "area" : "areas"} changed${labels.length ? `: ${labels.slice(0, 4).join("; ")}` : " (the Work API names them, with a key)"}. The boxed screen is in the kit.`
        })}>
          {busy === "spot" ? "Comparing…" : "Find what changed"}
        </Button>
      </section>
      <section className="space-y-2">
        <h3 className="text-body font-semibold">Cut out its parts</h3>
        <p className="text-caption text-fg-3">A screen's parts found and cut into pictures of their own, for close-ups and the screen taken apart.</p>
        <div className="flex gap-2">{pick(one, setOne, "Screen")}</div>
        <Button size="sm" disabled={!screens.length || !!busy} onClick={() => void act("parts", async () => {
          const f = byId(one)
          const { parts } = await post<{ parts: { name: string; x: number; y: number; w: number; h: number }[] }>("parts", { file: one })
          if (!parts.length) return "No parts worth a close-up were found."
          const img = await load(f.url)
          const files: File[] = []
          for (const p of parts) {
            const [w, h] = [Math.round(p.w * img.naturalWidth), Math.round(p.h * img.naturalHeight)]
            const c = Object.assign(document.createElement("canvas"), { width: w, height: h })
            c.getContext("2d")!.drawImage(img, p.x * img.naturalWidth, p.y * img.naturalHeight, w, h, 0, 0, w, h)
            files.push(new File([await blobOf(c)], `${f.name.replace(/\.[^.]+$/, "")} · ${p.name}.png`, { type: "image/png" }))
          }
          await add(files)
          return `Cut out: ${parts.map((p) => p.name).join(", ")}. They're in the kit.`
        })}>
          {busy === "parts" ? <><Glyph variant="scan" size={14} /> Finding its parts…</> : "Cut them out"}
        </Button>
      </section>
      <Tour kit={kit} onKit={onKit} busy={busy} act={act} />
      {msg && <p role="status" className="text-caption text-fg-2 lg:col-span-2">{msg}</p>}
    </div>
  )
}
