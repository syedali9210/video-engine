// The lab's references, torn down. A film (a YouTube film or a video file): every shot and cut, every title with its
// animation measured (what moves, from where, how fast, in what order, on what curve), the backgrounds, the hook and
// the pacing, and the whole film rebuilt as a template script. A picture (a page, a creative, an effect): its layers,
// boxes, type and colours, and for an effect its cells. Here are the schemas Gemini answers in and what's kept of an
// answer: every value checked, the kit pieces cut from it. The lab (lab.ts) stores, serves and acts on them.
import { randomUUID } from "node:crypto"
import { CATEGORIES, type Area, type KitGround, type KitItem, type KitTitle, type Layout, type LayoutLayer, type Reference } from "../src/refs.ts"
import { animOf } from "../src/studio/textanim.ts"

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const hex = (v: unknown, d = "") => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim().toLowerCase() : d)
const one = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
const sec = (v: unknown) => Math.round(num(v, 0, 3600, 0) * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000

/* ---------------- films ---------------- */

const ANIM_PROPS = {
  by: { type: "string", enum: ["all", "line", "word", "char"], description: "what moves on its own: the whole title, each line, each word, each letter" },
  from: {
    type: "object",
    description: "where each piece starts, easing to rest. Offsets in em (1 em = the type's own size); flip tips it back on its baseline (rotateX, degrees); blur in em; spacing: extra letter spacing in em the title starts with",
    properties: { x: { type: "number" }, y: { type: "number" }, scale: { type: "number" }, rotate: { type: "number" }, flip: { type: "number" }, skew: { type: "number" }, blur: { type: "number" }, opacity: { type: "number" }, spacing: { type: "number" } },
  },
  dur: { type: "number", description: "one piece's entrance, seconds" },
  stagger: { type: "number", description: "seconds between two pieces starting" },
  ease: { type: "string", description: "the curve, as cubic-bezier(x1, y1, x2, y2)" },
  order: { type: "string", enum: ["first", "last", "middle", "random"] },
  mask: { type: "boolean", description: "each piece rises from behind its own line's edge, clipped" },
  idle: { type: "string", enum: ["none", "wave", "float", "shimmer"], description: "what the pieces do once in" },
}

export const filmSchema = () => ({
  type: "object",
  properties: {
    summary: { type: "string", description: "the film in two sentences: its structure, its look" },
    category: { type: "string", enum: CATEGORIES.film.map((c) => c.id), description: "what kind of film it is" },
    hook: { type: "string", description: "what grabs you in the first two seconds, and how" },
    pacing: { type: "string", description: "how fast it cuts: shots per minute, the shortest and longest, where it slows" },
    palette: { type: "array", items: { type: "string", description: "a hex colour" } },
    type: { type: "string", description: "the typefaces: their kind (geometric sans, grotesk, serif, mono), weight, tracking, case" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          at: { type: "number" },
          dur: { type: "number" },
          what: { type: "string", description: "what it shows" },
          from: { type: "string", description: "the camera's framing at the start, in the script's words" },
          to: { type: "string", description: "the framing at the end (or 'held')" },
          rotation: { type: "string" },
          cut: { type: "string", description: "how it comes in: cut, flash, dissolve, push, zoom, blur, match cut…" },
          focus: { type: "string" },
          type: { type: "string", description: "words on screen and how they arrive, or 'none'" },
          ground: { type: "string" },
          ease: { type: "string" },
        },
        required: ["at", "dur", "what", "from", "to", "cut"],
      },
    },
    titles: {
      type: "array",
      description: "every title on screen with a distinct look or animation, measured",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "the animation's name in two or three words, like 'Blur-up words', 'Mask lines', 'Tracking in'" },
          text: { type: "string", description: "the words as shown (\\n where a line breaks)" },
          at: { type: "number", description: "when it appears, seconds into the film" },
          role: { type: "string", enum: ["hook", "kicker", "name", "feature", "tagline", "cta", "label"] },
          font: { type: "string", enum: ["display", "text", "mono"], description: "display: big and tight; text: plain; mono: small spaced caps" },
          weight: { type: "number" },
          size: { type: "number", description: "the type's size as % of the frame's width (a big hook 8 to 14, a line 3 to 5, a label 1.5 to 2.5)" },
          color: { type: "string", description: "hex" },
          align: { type: "string", enum: ["left", "center", "right"] },
          x: { type: "number", description: "the title box's centre, fraction of the frame's width" },
          y: { type: "number", description: "its centre, fraction of the frame's height" },
          w: { type: "number", description: "its width, fraction of the frame's width" },
          ...ANIM_PROPS,
        },
        required: ["name", "text", "by", "from", "dur", "stagger", "ease"],
      },
    },
    grounds: {
      type: "array",
      description: "each distinct background: its base colour and the soft lights over it",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          color: { type: "string", description: "hex" },
          glows: { type: "array", items: { type: "object", properties: { color: { type: "string" }, x: { type: "number" }, y: { type: "number" }, r: { type: "number", description: "radius, fraction of the frame's width" }, alpha: { type: "number" } } } },
        },
        required: ["name", "color"],
      },
    },
    lessons: { type: "array", items: { type: "string", description: "one concrete thing a template should copy, with numbers" } },
    script: { type: "string", description: "the whole film rebuilt as one of the engine's template scripts, as JSON (the vocabulary below)" },
  },
  required: ["summary", "category", "shots", "titles", "lessons"],
})

export const filmSystem = (vocabulary: string, example: string) =>
  `You tear films down for an animation engine, so it can rebuild them from its own parts. Watch closely and write down:
1. Every shot and cut, in the engine's words (its vocabulary is below): the cut points to a tenth of a second, the camera's framing at the start and end, how the device turns, the focus, the easing.
2. Every title, measured exactly: the words; its face, weight, size and colour; where it sits; and its animation. Which unit moves on its own (the whole title, each line, each word, each letter); where each piece starts relative to where it rests (offsets in em of the type's own size, a scale, a turn, a flip back on its baseline, a skew, a blur in em, an opacity, letters spaced out); how long one piece takes; the gap between two pieces starting; the curve as cubic-bezier; the order; whether each piece is clipped by its own line (a mask); and what it does once it has landed (still, a wave, a float, a glint running across). Watch titles frame by frame: these numbers are what the engine plays back.
3. The backgrounds: each one's base colour and the soft lights over it (centres in fractions of the frame, radius as a fraction of its width, opacity).
4. The hook (what grabs in the first two seconds), the pacing, the palette, the typefaces.
5. The lessons: what this film does that a template should copy, each concrete (durations, angles, zooms, curves).
6. The whole film rebuilt as a template script in the engine's vocabulary, the same JSON shape as the example. Product words are placeholders ({name}, {hook}, {tagline}, {cta}, {feature1}–{feature3}); the product's screens are {screen}, {screen2}, {screen3}. Titles in the script may use "enter": "custom" with an "animation" object exactly like the titles above ({by, from, dur, stagger, ease, order, mask, idle}).
Describe only what you see; never guess at what you can't.

<vocabulary>
${vocabulary}
</vocabulary>

<example script>
${example}
</example script>`

/** A film's teardown, checked: what's kept on the reference, and its kit (titles, grounds; shots are added once the
    script is checked). */
export function filmRef(j: Raw, ref: { id: string; category?: string }) {
  // the kind the admin filed it under; Gemini's guess only when they didn't
  const category = ref.category ?? one(j.category, CATEGORIES.film.map((c) => c.id), "product-launch")
  const kit: KitItem[] = []
  arr(j.titles)
    .slice(0, 24)
    .forEach((x, i) => {
      const t = obj(x)
      const anim = animOf(t)
      const text = str(t.text, 160)
      if (!anim || !text) return
      const item: KitTitle = {
        kind: "title",
        id: `${ref.id}:t${i}`,
        name: str(t.name, 40) || `Title ${i + 1}`,
        category,
        ref: ref.id,
        text,
        font: one(t.font, ["display", "text", "mono"] as const, "display"),
        weight: Math.round(num(t.weight, 100, 900, 600)),
        size: r3(num(t.size, 0.8, 30, 6)),
        color: hex(t.color),
        align: one(t.align, ["left", "center", "right"] as const, "center"),
        box: { x: r3(num(t.x, 0, 1, 0.5)), y: r3(num(t.y, 0, 1, 0.5)), w: r3(num(t.w, 0.05, 1, 0.8)) },
        anim,
      }
      kit.push(item)
    })
  arr(j.grounds)
    .slice(0, 8)
    .forEach((x, i) => {
      const g = obj(x)
      const ground = hex(g.color)
      if (!ground) return
      const item: KitGround = {
        kind: "ground",
        id: `${ref.id}:g${i}`,
        name: str(g.name, 40) || `Background ${i + 1}`,
        category,
        ref: ref.id,
        ground,
        glows: arr(g.glows)
          .slice(0, 5)
          .flatMap((y) => {
            const l = obj(y)
            const color = hex(l.color)
            return color ? [{ color, x: r3(num(l.x, -0.5, 1.5, 0.5)), y: r3(num(l.y, -0.5, 1.5, 0.5)), r: r3(num(l.r, 0.05, 2, 0.5)), alpha: r3(num(l.alpha, 0, 1, 0.6)) }] : []
          }),
      }
      kit.push(item)
    })
  return {
    category,
    summary: str(j.summary, 600),
    hook: str(j.hook, 300),
    pacing: str(j.pacing, 300),
    palette: arr(j.palette).map((c) => hex(c)).filter(Boolean).slice(0, 8),
    type: str(j.type, 300),
    shots: arr(j.shots)
      .slice(0, 60)
      .map((x) => {
        const s = obj(x)
        return { at: sec(s.at), dur: sec(s.dur), what: str(s.what, 200), from: str(s.from, 160), to: str(s.to, 160), rotation: str(s.rotation, 120), cut: str(s.cut, 60), focus: str(s.focus, 120), type: str(s.type, 160), ground: str(s.ground, 100), ease: str(s.ease, 100) }
      }),
    lessons: arr(j.lessons).map((x) => str(x, 300)).filter(Boolean).slice(0, 12),
    kit,
  }
}

/* ---------------- pictures: pages, creatives, effects ---------------- */

const LAYER_KINDS = ["text", "picture", "device", "card", "shape", "glow", "icon", "effect"] as const

export const pictureSchema = (area: Area) => ({
  type: "object",
  properties: {
    name: { type: "string", description: "a name for it in two to four words, like 'Mission over clouds'" },
    summary: { type: "string", description: "the picture in two sentences: its layout, its look" },
    category: { type: "string", enum: CATEGORIES[area].map((c) => c.id) },
    palette: { type: "array", items: { type: "string", description: "a hex colour" } },
    type: { type: "string", description: "the typefaces: kind, weight, tracking, case" },
    ground: { type: "string", description: "the page's own background colour, hex" },
    layers: {
      type: "array",
      description: "every layer, back to front",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...LAYER_KINDS] },
          name: { type: "string" },
          x: { type: "number", description: "the left edge, fraction of the picture's width" },
          y: { type: "number", description: "the top edge, fraction of the picture's height" },
          w: { type: "number" },
          h: { type: "number" },
          text: { type: "string" },
          font: { type: "string", enum: ["serif", "sans", "mono"] },
          weight: { type: "number" },
          size: { type: "number", description: "the type's size as a fraction of the picture's width" },
          color: { type: "string" },
          align: { type: "string", enum: ["left", "center", "right"] },
          fill: { type: "string", description: "a card's or shape's colour, hex" },
          radius: { type: "number", description: "corner radius, fraction of the layer's width" },
          opacity: { type: "number" },
          blur: { type: "number", description: "px of blur at the picture's size" },
          shadow: { type: "boolean" },
          what: { type: "string", description: "what a picture, icon or effect shows" },
          device: { type: "string", enum: ["iphone", "ipad", "macbook"] },
          clip: { type: "boolean", description: "it shows a part of a bigger picture through a window (a card filled with a photo that continues behind)" },
        },
        required: ["kind", "name", "x", "y", "w", "h"],
      },
    },
    motion: { type: "array", items: { type: "string", description: "how it would move if it were alive: an entrance, a parallax, a hover, a loop" } },
    lessons: { type: "array", items: { type: "string", description: "one concrete thing a template should copy, with numbers" } },
    ...(area === "effect"
      ? {
          effect: {
            type: "object",
            description: "the effect as the engine's settings",
            properties: {
              cell: { type: "string", enum: ["pixel", "dot", "cross", "char", "line", "block", "smooth"] },
              chars: { type: "string", description: "for characters: the set used, lightest to densest" },
              size: { type: "number", description: "a cell's size in px when the picture is 1440 wide" },
              gap: { type: "number" },
              sizeBy: { type: "number" },
              dither: { type: "number" },
              soft: { type: "number" },
              contrast: { type: "number" },
              level: { type: "number" },
              colors: { type: "array", items: { type: "string" }, description: "the ground, then one to three inks" },
              tint: { type: "boolean", description: "each cell takes the picture's own colour" },
              under: { type: "number", description: "how much of the photo itself shows, soft, under the cells, 0 to 1" },
              glow: { type: "number" },
              grain: { type: "number" },
              fade: { type: "string", enum: ["none", "bottom", "top", "edges", "radial"] },
            },
          },
        }
      : {}),
  },
  required: ["summary", "category", "layers", "lessons"],
})

export const pictureSystem = (area: Area) =>
  `You tear pictures down for a design engine${area === "effect" ? "'s background effects" : area === "canvas" ? "'s interactive pages" : "'s creatives (bentos, posters, ads)"}, so it can rebuild them as editable layers. Make a layer of everything a designer would: the background's own colour (ground), every card or panel, every picture (and what it shows), every heading, label, chip and paragraph, every button and icon, every device, soft glow and effect; a page usually has 6 to 20. Measure each, back to front: its kind, its box (the top-left corner and the size, in fractions of the picture). Text goes in "text": a heading's or a label's exact words; a paragraph gets a short stand-in sentence of about its length (never copy body copy). Text: its words, face (serif, sans, mono), weight, size (a fraction of the picture's width), colour, alignment. Cards: their fill, corner radius (a fraction of the card's width), shadow. Pictures and icons: what they show. Devices: which. Soft glows. A layer that shows part of a bigger picture through a window (a card holding a photo that continues behind it) says so (clip).${area === "effect" ? " Then the effect itself in the engine's settings: the cells (pixels, dots, crosses, characters, lines, blocks, or smooth), their size, the characters used, the colours, whether the cells take the photo's own colours, how much of the photo shows softly under them." : ""} Then the palette (3 to 6 colours), how it would move if it were alive, and the lessons. Describe only what you see.`

/** A picture's teardown, checked. */
export function pictureRef(j: Raw, area: Area, size: { w: number; h: number }, category?: string) {
  const layers: LayoutLayer[] = arr(j.layers)
    .slice(0, 40)
    .flatMap((x) => {
      const l = obj(x)
      if (!LAYER_KINDS.includes(l.kind as LayoutLayer["kind"])) return []
      const x0 = num(l.x, -0.5, 1.5, 0)
      const y0 = num(l.y, -0.5, 1.5, 0)
      const out: LayoutLayer = { kind: l.kind as LayoutLayer["kind"], name: str(l.name, 60) || String(l.kind), x: r3(x0), y: r3(y0), w: r3(num(l.w, 0.005, 2, 0.2)), h: r3(num(l.h, 0.005, 2, 0.1)) }
      if (str(l.text, 300)) out.text = str(l.text, 300)
      if (l.font) out.font = one(l.font, ["serif", "sans", "mono"] as const, "sans")
      if (typeof l.weight === "number") out.weight = Math.round(num(l.weight, 100, 900, 500))
      if (typeof l.size === "number") out.size = r3(num(l.size, 0.003, 0.5, 0.03))
      if (hex(l.color)) out.color = hex(l.color)
      if (l.align) out.align = one(l.align, ["left", "center", "right"] as const, "left")
      if (hex(l.fill)) out.fill = hex(l.fill)
      if (typeof l.radius === "number") out.radius = r3(num(l.radius, 0, 0.5, 0))
      if (typeof l.opacity === "number") out.opacity = r3(num(l.opacity, 0, 1, 1))
      if (typeof l.blur === "number" && l.blur > 0) out.blur = Math.round(num(l.blur, 0, 200, 0))
      if (l.shadow === true) out.shadow = true
      if (str(l.what, 200)) out.what = str(l.what, 200)
      if (l.device) out.device = one(l.device, ["iphone", "ipad", "macbook"] as const, "iphone")
      if (l.clip === true) out.clip = true
      return [out]
    })
  const layout: Layout = { w: size.w, h: size.h, ground: hex(j.ground, "#0b0b0d"), layers, motion: arr(j.motion).map((x) => str(x, 200)).filter(Boolean).slice(0, 8) }
  return {
    ...(str(j.name, 60) ? { name: str(j.name, 60) } : {}),
    category: category ?? one(j.category, CATEGORIES[area].map((c) => c.id), CATEGORIES[area][0].id),
    summary: str(j.summary, 600),
    palette: arr(j.palette).map((c) => hex(c)).filter(Boolean).slice(0, 8),
    type: str(j.type, 300),
    lessons: arr(j.lessons).map((x) => str(x, 300)).filter(Boolean).slice(0, 12),
    layout,
    ...(area === "effect" && j.effect ? { effect: obj(j.effect) } : {}),
  }
}

/** A new reference waiting for its teardown. */
export const stub = (o: Partial<Reference> & { area: Area; title: string }): Reference => ({ id: randomUUID(), watched: "", by: "admin", summary: "", shots: [], lessons: [], ...o })

/* ---------------- the compile step: what a category has taught, for the AI that writes the next template ---------------- */

/** Everything studied in one area (and, first, one category), in a few lines each: the summaries, hooks, pacing,
    lessons, shots, and every title animation measured, so a new template is written from all of it. */
export function contextFor(refs: Reference[], area: Area, category?: string, max = 8) {
  const inArea = refs.filter((r) => (r.area ?? "film") === area && r.summary)
  const picked = [...inArea.filter((r) => category && r.category === category), ...inArea.filter((r) => !category || r.category !== category)].slice(0, max)
  return picked
    .map((r) => {
      const head = `- "${r.title}"${r.channel ? ` (${r.channel})` : ""} [${r.category ?? "uncategorised"}]: ${r.summary}`
      const extra = [r.hook && `Hook: ${r.hook}`, r.pacing && `Pacing: ${r.pacing}`, r.type && `Type: ${r.type}`, r.palette?.length && `Palette: ${r.palette.join(" ")}`, r.lessons.length && `Lessons: ${r.lessons.join(" ")}`].filter(Boolean).join(" ")
      const shots = r.shots
        .slice(0, 14)
        .map((s) => `${s.at.toFixed(1)}s +${s.dur.toFixed(1)}s ${s.what} [${s.from} → ${s.to}${s.rotation ? `; turns ${s.rotation}` : ""}; ${s.cut}${s.ease ? `; ${s.ease}` : ""}]`)
        .join(" | ")
      const titles = (r.kit ?? [])
        .filter((k): k is KitTitle => k.kind === "title")
        .slice(0, 6)
        .map((t) => `"${t.text.replace(/\n/g, " / ")}" ${t.font} ${t.weight} size ${t.size}: ${JSON.stringify(t.anim)}`)
        .join(" | ")
      const layers = r.layout ? `Layers: ${r.layout.layers.map((l) => `${l.kind} "${l.name}" at ${l.x},${l.y} ${l.w}×${l.h}${l.text ? ` "${l.text.slice(0, 40)}"` : ""}`).join("; ")}` : ""
      return [head, extra, shots && `Shots: ${shots}`, titles && `Titles: ${titles}`, layers].filter(Boolean).join("\n  ").slice(0, 3200)
    })
    .join("\n")
}
