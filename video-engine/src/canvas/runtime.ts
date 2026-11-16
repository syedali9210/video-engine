// Canvas — the runtime (public/canvas.js), loaded the way a site loads it: by its full address, which the dev server
// leaves alone (a bare "/canvas.js" it would rewrite, and refuse). The editor, the effect gallery and the template lab
// all draw with it, so what they show is what a site shows.
import type { CanvasDoc } from "./doc"
import type { Effect } from "./effects"

export type Mounted = { update: (d: CanvasDoc, o?: object) => void; destroy: () => void; preview: (id: string) => void; replay: () => void; describe: (id: string) => Promise<string[]> }
export type EffectHandle = { update: (e: Effect) => void; destroy: () => void }
export type Runtime = {
  mount: (el: HTMLElement, d: CanvasDoc, o: object) => Mounted
  effect: (el: HTMLElement, e: Effect, o?: { frame?: number }) => EffectHandle
}

let runtime: Promise<Runtime> | null = null
let failed = 0
/** The runtime, loaded once; a load that failed (the server down for a moment) is forgotten, so the next asks again,
    at a fresh address: the browser remembers a module that failed to load and won't fetch the same one twice. */
export const loadRuntime = () =>
  (runtime ??= (import(/* @vite-ignore */ `${location.origin}/canvas.js${failed ? `?try=${failed}` : ""}`) as Promise<Runtime>).catch((e) => {
    runtime = null
    failed++
    throw e
  }))

/** The colours of a picture (a captured screen), most covered first: the theme matcher reads its accent from them. */
export async function paletteOf(src: string): Promise<string[]> {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement("canvas")
  c.width = 48
  c.height = Math.max(1, Math.round((48 * img.height) / img.width))
  const g = c.getContext("2d")!
  g.drawImage(img, 0, 0, c.width, c.height)
  const px = g.getImageData(0, 0, c.width, c.height).data
  const count = new Map<string, number>()
  for (let i = 0; i < px.length; i += 4) {
    // coarse bins, so near-identical pixels count together
    const key = `rgb(${px[i] & 0xf0}, ${px[i + 1] & 0xf0}, ${px[i + 2] & 0xf0})`
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k)
}

/** A dropped picture, made small enough to travel in the JSON: at most `max` px across, WebP. */
export async function pictureOf(file: File, max = 1600): Promise<{ src: string; w: number; h: number }> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement("canvas")
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
  return { src: c.toDataURL("image/webp", 0.86), w: img.width, h: img.height }
}
