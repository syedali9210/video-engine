// The asset generator: what a film is made of besides the product, made for the product. From its brand (ground, ink,
// accent) and its logo: the world (one grainy shader field the whole film lives in), the mark (its logo's own lines in
// liquid metal), and shapes that each stand for one idea (src/studio/screenplay.ts METAPHORS: a fanning stack is
// "every format", glass discs are "layers", tiles are "many outputs", pills are "steps", an orb is "the engine at the
// centre", a ring is "always in sync"). Each is a spec for the shader renderer (server/shaders.ts), rendered once for
// what it's made of and kept, then re-encoded with a keyframe every 12 frames so a film's export can seek it cheaply.
// Made on demand: a shape no beat uses is never rendered.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ProductKit } from "../src/studio/product.ts"

export type Gen = ReturnType<typeof generator>
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("")

/** `origin`: this server; `root`: the project; `media`: where film-ready copies are kept (served at /__film/media/). */
export function generator(o: { origin: () => string; root: string; media: string }) {
  const ff = () => process.env.STUDIO_FFMPEG || "ffmpeg"

  /** A shader video, rendered once for its spec and kept: its address. */
  async function render(spec: Record<string, unknown>) {
    const r = (await fetch(`${o.origin()}/__shader/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec, width: 1920, height: 1080, fps: 60 }) }).then((x) => x.json())) as { id?: string; error?: string }
    if (!r.id) throw new Error(`The shader couldn't start: ${r.error ?? "no job"}`)
    for (let i = 0; i < 900; i++) {
      const j = (await fetch(`${o.origin()}/__shader/jobs/${r.id}`).then((x) => x.json())) as { state: string; url?: string; error?: string }
      if (j.state === "done" && j.url) return seekable(j.url)
      if (j.state === "error") throw new Error(`The shader failed: ${j.error}`)
      await sleep(1000)
    }
    throw new Error("The shader took too long")
  }
  /** A shader video as a film layer: a keyframe every 12 frames, so the export's seek to each frame decodes a few
      frames, not a whole loop's (read from the disk: this server can't answer ffmpeg while it waits on it). */
  function seekable(url: string) {
    const name = `${url.split("/").pop()!.replace(/\.mp4$/, "")}-k12.mp4`
    const out = join(o.media, name)
    if (!existsSync(out)) execFileSync(ff(), ["-y", "-loglevel", "error", "-i", join(o.root, ".engine-data", "shaders", url.split("/").pop()!), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-g", "12", "-keyint_min", "12", "-sc_threshold", "0", "-pix_fmt", "yuv420p", out])
    return `/__film/media/${name}`
  }
  /** The brand as the generator reads it: its accent (none for a black-and-white brand) and a ramp of it, dark to light. */
  function palette(k: ProductKit) {
    const accent = k.brand.accent && k.brand.accent !== k.brand.ink ? k.brand.accent : null
    const ramp = accent ? [mix(accent, "#000000", 0.8), mix(accent, "#000000", 0.4), accent, mix(accent, "#ffffff", 0.7)] : ["#121215", "#45454d", "#a3a3ad", "#f3f3f6"]
    return { accent, ramp }
  }

  /** The world: a dark grainy field with one lit fold, in the accent (or silver), slow enough to sit under words. */
  const worldSpec = (k: ProductKit) => {
    const { accent } = palette(k)
    return { kind: "gradient", name: "World", duration: 8, bg: "#000000", grain: 0.1, mesh: "water", colors: accent ? [mix(accent, "#000000", 0.55), mix(accent, "#000000", 0.15), "#000000"] : ["#202027", "#6a6a76", "#000000"], density: 0.75, strength: 1.4, speed: 0.2, frequency: 5.5, amplitude: 0, brightness: 0.62, light: 0, cam: { az: 180, polar: 100, dist: 2.6, zoom: 1 }, pos: [0, 0, 0], rot: [0, 0, 200], orbit: 0 }
  }

  /** The product's mark as a shape for the liquid: the lines of its logo picked out from the tile they sit on (a logo
      on a square is opaque: its alpha would be the square). None: its initial. */
  async function markShape(k: ProductKit) {
    const f = k.files.find((x) => x.kind === "logo" && /dark/i.test(x.name)) ?? k.files.find((x) => x.kind === "logo")
    const src = f ? join(o.root, ".engine-data", "kits", k.id, "files", f.id) : ""
    if (!f || !existsSync(src)) return { type: "text", text: (k.words.name || k.name)[0] ?? "•" }
    const out = join(o.media, `mark-${f.id}.png`)
    if (!existsSync(out)) {
      // what differs from the tile's own colour (read a fifth of the way in) is the mark
      const ref = "(r(W*0.2,H*0.2)+g(W*0.2,H*0.2)+b(W*0.2,H*0.2))/3"
      execFileSync(ff(), ["-y", "-loglevel", "error", "-i", src, "-vf", `format=rgba,geq=r='255':g='255':b='255':a='255*gt(abs((r(X,Y)+g(X,Y)+b(X,Y))/3-${ref}),70)*gt(alpha(X,Y),100)'`, out])
    }
    const r = (await fetch(`${o.origin()}/__shader/logo`, { method: "POST", headers: { "content-type": "image/png" }, body: readFileSync(out) }).then((x) => x.json())) as { url?: string }
    return r.url ? { type: "image", src: r.url } : { type: "text", text: (k.words.name || k.name)[0] ?? "•" }
  }
  const markSpec = async (k: ProductKit) => ({ kind: "liquid", name: "Mark", duration: 8, bg: "#000000", grain: 0.05, logo: await markShape(k), size: 0.72, noise: 4, contour: 0.6, rim: 0.35, speed: 0.4, iterations: 15, scale: 3.12, dot: 0.04, dotMul: 0.21, vOffset: 5.1, intensity: 0.07, exp: 0.2, rgb: palette(k).accent ? [1.1, 0.7, 0.9] : [1.1, 1.0, 1.05], shift: 0.9, edge: 0.4 })

  /** A shape metaphor in the brand's ramp, on black (laid over the world with a screen blend in a film). */
  const shapeSpec = (k: ProductKit, id: string) => {
    const { accent, ramp } = palette(k)
    const base = { kind: "shape", duration: 8, bg: "#000000", grain: 0.06, count: 4, gap: 0.35, round: 0.3, axis: "across", angle: 45, density: 1, faces: "all", base: mix(ramp[0], "#000000", 0.3), flow: 0.3, speed: 0.25, glass: 0, glow: 0, under: "", motion: "turn", tilt: 28, dist: 7, spin: 0.25, colors: ramp }
    const glow = accent ?? "#d8d8de"
    const by: Record<string, Record<string, unknown>> = {
      "shape:formats": { name: "Every format", form: "slabs", count: 6, gap: 0.3, round: 0.4, axis: "stack", flow: 0.2, motion: "fan", tilt: 34, dist: 9.5 },
      "shape:layers": { name: "Layers", form: "discs", count: 3, gap: 0.9, round: 1, axis: "facing", glass: 0.85, glow: 0.6, under: glow, flow: 0.4, motion: "breathe", tilt: 22, dist: 6.4 },
      "shape:outputs": { name: "Outputs", form: "tiles", count: 5, round: 0.5, angle: 70, flow: 0.55, speed: 0.2, motion: "float", tilt: 0, dist: 9.6, grain: 0.1 },
      "shape:steps": { name: "Steps", form: "pills", count: 5, gap: 0.25, axis: "stack", flow: 0.2, motion: "stack", tilt: 24, dist: 9.5 },
      "shape:core": { name: "Core", form: "orb", count: 1, angle: 35, density: 1.2, flow: 0.7, speed: 0.3, motion: "turn", tilt: 12, dist: 5 },
      "shape:loop": { name: "Loop", form: "ring", count: 1, axis: "around", flow: 0.25, speed: 0.3, glow: 0.4, motion: "turn", tilt: 34, dist: 6, colors: [...ramp, ramp[0]] },
    }
    if (!by[id]) throw new Error(`No shape “${id}”: there are ${Object.keys(by).join(", ")}`)
    return { ...base, ...by[id] }
  }

  return {
    world: (k: ProductKit) => render(worldSpec(k)),
    mark: async (k: ProductKit) => render(await markSpec(k)),
    shape: (k: ProductKit, id: string) => render(shapeSpec(k, id)),
    /** whichever of these a film needs, made (or found kept) */
    async forFilm(k: ProductKit, shapes: string[]) {
      return { world: await this.world(k), mark: await this.mark(k), shapes: Object.fromEntries(await Promise.all(shapes.map(async (id) => [id, await this.shape(k, id)] as const))) }
    },
  }
}
