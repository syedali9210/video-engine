// References — what the engine studies, split by area (films, canvas pages, creatives, effects) and by category
// (a product launch, a feature launch, a demo…), and the kit their teardowns leave behind: titles with their exact
// animation, backgrounds, whole shots. The lab's server tears a reference down (server/lab.ts), the Studio's kit
// lays the pieces out to drag in, and the compile step hands everything studied in a category to the AI that writes
// the next template. Plain data, shared by the server and the app.
import type { TextAnim } from "./studio/textanim.ts"

export type Area = "film" | "canvas" | "creative" | "effect"
export const AREAS: { id: Area; name: string; hint: string }[] = [
  { id: "film", name: "Films", hint: "Launch films, demos, teasers: torn down into shots, titles with their animation, backgrounds." },
  { id: "canvas", name: "Canvas", hint: "Interactive pages: their layout, type, devices and what moves." },
  { id: "creative", name: "Creatives", hint: "Graphics, bentos, posters, ads: their layout, cards and pictures." },
  { id: "effect", name: "Effects", hint: "Background effects: the cells, the colours, what the picture under them does." },
]

export type Category = { id: string; name: string; hint: string }
export const CATEGORIES: Record<Area, Category[]> = {
  film: [
    { id: "product-launch", name: "Product launch", hint: "A whole product introduced: the hook, the reveal, what it does, the name." },
    { id: "feature-launch", name: "Feature launch", hint: "One new feature: the problem, the feature at work, the close." },
    { id: "product-demo", name: "Product demo", hint: "The product in use, step by step, on the real interface." },
    { id: "teaser", name: "Teaser", hint: "Short and withholding: a glimpse, a date." },
    { id: "brand", name: "Brand film", hint: "The idea behind the product: mood over features." },
    { id: "social", name: "Social", hint: "Vertical and quick, for Reels, Shorts and Stories." },
    { id: "mockup", name: "Device mockup", hint: "Your product on real devices under studio light: one turning, a family, a device beside a component." },
  ],
  canvas: [
    { id: "hero", name: "Hero", hint: "The top of a page: the name, the line, the product." },
    { id: "story", name: "Story", hint: "A mission, a manifesto: a big word over a picture." },
    { id: "feature", name: "Feature", hint: "One thing the product does, shown working." },
    { id: "showcase", name: "Showcase", hint: "Devices and components arranged to be looked at." },
    { id: "studio", name: "Studio", hint: "Work presented the way a design studio shows it: plates, spreads, line-ups, anatomies and specimens, with captions." },
  ],
  creative: [
    { id: "bento", name: "Bento", hint: "Cards of different sizes in a grid: a picture, a screen, a number, a line." },
    { id: "poster", name: "Poster", hint: "One big idea: type and an object." },
    { id: "social-post", name: "Social post", hint: "A square or a 4:5 for a feed." },
    { id: "ad", name: "Ad", hint: "A product, a promise, a button." },
  ],
  effect: [
    { id: "picture", name: "Over a picture", hint: "Cells drawn from a photo underneath." },
    { id: "pattern", name: "Pattern", hint: "Dithers, halftones, stitches and grids on their own." },
    { id: "gradient", name: "Gradient", hint: "Moving colour with no cells." },
    { id: "type", name: "Characters", hint: "Letters and symbols as the texture." },
  ],
}
export const categoryName = (area: Area, id?: string) => CATEGORIES[area].find((c) => c.id === id)?.name ?? "Other"

/** A title as a film showed it: the words, the face, the size (% of the frame's width), the colour, where it sat, and
    how it came in. Dropped on the stage, it's an ordinary title with a custom animation. */
export type KitTitle = { kind: "title"; id: string; name: string; category?: string; ref?: string; text: string; font: "text" | "display" | "mono"; weight: number; size: number; color: string; align: "left" | "center" | "right"; box: { x: number; y: number; w: number }; anim: TextAnim }
/** A background: a ground colour and the lights over it (as gradient layers). */
export type KitGround = { kind: "ground"; id: string; name: string; category?: string; ref?: string; ground: string; glows: { color: string; x: number; y: number; r: number; alpha: number }[] }
/** A whole shot in the script's words (ScriptShot): added as a scene. */
export type KitShot = { kind: "shot"; id: string; name: string; category?: string; ref?: string; shot: Record<string, unknown> }
export type KitItem = KitTitle | KitGround | KitShot

/** A picture's layers as its teardown measured them, back to front: boxes in fractions of the picture (top-left corner,
    width, height), type sizes in fractions of its width. A canvas page or a creative is rebuilt from these. */
export type LayoutLayer = {
  kind: "text" | "picture" | "device" | "card" | "shape" | "glow" | "icon" | "effect"
  name: string
  x: number
  y: number
  w: number
  h: number
  text?: string
  font?: "serif" | "sans" | "mono"
  weight?: number
  size?: number
  color?: string
  align?: "left" | "center" | "right"
  fill?: string
  radius?: number
  opacity?: number
  blur?: number
  shadow?: boolean
  /** what a picture or an icon shows */
  what?: string
  device?: "iphone" | "ipad" | "macbook"
  /** the layer is a part of the picture behind it, seen through (a card holding a photo of clouds) */
  clip?: boolean
}
export type Layout = { w: number; h: number; ground: string; layers: LayoutLayer[]; motion: string[] }

/** A reference: a YouTube film, a video or picture file, studied once and kept. `file`: its own copy, served from the
    lab (a video or a picture); `poster`: a still of it. */
export type Reference = {
  id: string
  area: Area
  category?: string
  title: string
  url?: string
  /** a YouTube film's id */
  video?: string
  channel?: string
  file?: { name: string; type: string; size: number; w?: number; h?: number }
  poster?: string
  watched: string
  by: "search" | "admin"
  summary: string
  /** films: what grabs in the first seconds; how fast it cuts */
  hook?: string
  pacing?: string
  palette?: string[]
  type?: string
  shots: { at: number; dur: number; what: string; from: string; to: string; rotation: string; cut: string; focus: string; type: string; ground: string; ease: string }[]
  lessons: string[]
  kit?: KitItem[]
  /** a picture's layers (canvas, creatives, effects) */
  layout?: Layout
  /** an effect's settings as the teardown read them (canvas/effects.ts Effect) */
  effect?: Record<string, unknown>
  /** what it became: a template proposal, a canvas layout */
  made?: { kind: "script" | "layout" | "effect"; id: string; name: string }[]
  /** a film's closer watch for its replica: each shot's subject and exact camera values (studio/replica.ts), kept so
      the replica can be rebuilt without asking again */
  precise?: Record<string, unknown>[]
  /** its cut points were measured by ffmpeg (a file), not only read off the film */
  cutsMeasured?: boolean
  /** a film file as ffmpeg read it on arrival (server/reference.ts): its length and cuts, whether it loops, the box
      inside any bars or player chrome round the picture, the picture's own size */
  measured?: { duration: number; cuts: number[]; loop: boolean; crop?: { w: number; h: number; x: number; y: number }; size?: { w: number; h: number } }
  /** a contact sheet: a still from each shot, in order */
  contact?: string
  /** the replica made of it, and how close it came (0 to 100) */
  replica?: { id: string; name: string; score: number; made: string }
  run?: string
}
