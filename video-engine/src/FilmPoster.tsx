// A film drawn as itself, for a card: its title scene on its own ground (the background director's pick where it has
// none), its biggest words set as the film sets them, and a strip of every scene's ground that shows under the pointer.
// From a template or a template script; made once per film, product and colour.
import { useMemo } from "react"
import { ANIMS } from "./registry"
import { SAMPLE_COPY, type Comp, type Template } from "./studio/comp"
import { fillCss, isDark } from "./studio/look"
import { direct } from "./studio/director"
import { layersCss } from "./studio/paint"
import { scriptTemplate, type TemplateScript } from "./studio/script"

export function ScriptPoster({ script, product, accent, className, bare }: { script: TemplateScript; product: string; accent?: string; className?: string; bare?: boolean }) {
  const t = useMemo(() => scriptTemplate(script), [script])
  return <FilmPoster t={t} product={product} accent={accent} className={className} bare={bare} />
}

const MADE = new Map<string, { c: Comp | null; looks: ReturnType<typeof direct> }>()

/** A launch film's own still (public/thumbs, shot from the film). One that isn't wide sits on a soft, blurred copy of
    itself, so a square or upright film fills its card instead of sitting between black bars. */
function FilmStill({ anim, wide, bare, className = "" }: { anim: string; wide: boolean; bare?: boolean; className?: string }) {
  const src = `/thumbs/${anim}-dark.webp`
  return (
    <span className={`${bare ? "" : "lift rounded-xl shadow-[0_0_0_1px_var(--line)] "}relative block aspect-video overflow-hidden bg-[#0b0b0c] ${className}`}>
      {!wide && <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-2xl" />}
      <img src={src} alt="" loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full ${wide ? "object-cover" : "object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.45)]"}`} />
    </span>
  )
}

/** The film you're making, drawn as itself: a launch film's own still when that's what it plays, else its title scene. */
export function CompPoster({ comp, product, accent, className = "", bare, still }: { comp: Comp; product: string; accent?: string; className?: string; bare?: boolean; /** the product's own still (a library id), for a film of devices and no titles yet */ still?: string }) {
  const layers = comp.scenes.flatMap((s) => s.layers)
  const film = layers.find((l) => l.kind === "component" && /^(film|reel)-/.test(l.anim) && !l.hidden)
  const t = useMemo<Template>(() => {
    const sig = comp.scenes.map((s) => `${s.id}:${s.duration}:${s.layers.length}:${s.look?.fill ?? ""}`).join("|")
    return { id: `yours:${sig}:${comp.fill}`, name: product, hint: "", scenes: comp.scenes.length, make: () => comp }
  }, [comp, product])
  const ground = useMemo(() => fillCss(comp.scenes[0]?.look?.fill ?? direct(comp)[0]?.fill ?? comp.fill), [comp])
  if (film && film.kind === "component") return <FilmStill anim={film.anim} wide={comp.size === "16x9"} bare={bare} className={className} />
  // devices and no titles yet: the product on its phone, on the film's ground
  if (still && !layers.some((l) => l.kind === "text") && layers.some((l) => l.kind === "device"))
    return (
      <span className={`${bare ? "" : "lift rounded-xl shadow-[0_0_0_1px_var(--line)] "}relative block aspect-video overflow-hidden ${className}`} style={{ background: ground }}>
        <span className="absolute left-1/2 top-[11%] h-[78%] -translate-x-1/2 rounded-[18%/8.5%] bg-[#111] p-[1.6%] shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_24px_48px_-20px_rgb(0_0_0/0.55)]" style={{ aspectRatio: "402 / 874" }}>
          <img src={`/thumbs/${still}-dark.webp`} alt="" loading="lazy" decoding="async" className="block h-full w-full rounded-[16%/7.5%] bg-black object-cover" />
        </span>
      </span>
    )
  return <FilmPoster t={t} product={product} accent={accent} className={className} bare={bare} />
}

/** A film drawn as itself: its title scene on its own ground, and a strip of every scene's ground under it. */
export function FilmPoster({ t, product, accent, className = "", bare }: { t: Template; product: string; accent?: string; className?: string; /** no frame of its own (a gallery card frames it) */ bare?: boolean }) {
  // made once per film, product and colour, and kept: a gallery of posters comes back instantly
  const { c, looks } = useMemo(() => {
    const key = `${t.id}|${t.name}|${t.scenes}|${product}|${accent ?? ""}`
    let hit = MADE.get(key)
    if (!hit) {
      let made: Comp | null = null
      try {
        made = t.make({ device: "iphone", posture: "open", name: product, anim: ANIMS[0].id, copy: { ...SAMPLE_COPY, name: product }, accent })
      } catch {
        made = null
      }
      // each scene's ground as the film shows it: its own, or the background director's pick
      hit = { c: made, looks: made ? direct(made) : [] }
      MADE.set(key, hit)
    }
    return hit
  }, [t, product, accent])
  if (!c) return <span className="block aspect-video rounded-xl bg-surface-2" />
  // a launch film is one live scene: its card shows the film's own still (public/thumbs, shot from the film)
  const film = t.film && t.values ? t.values({ device: "iphone", posture: "open", name: product, anim: ANIMS[0].id, copy: SAMPLE_COPY }).anim : null
  if (film) return <FilmStill anim={film} wide={!t.size || t.size === "16x9"} bare={bare} className={className} />
  const fillOf = (i: number) => c.scenes[i].look?.fill ?? looks[i]?.fill ?? c.fill
  const ground = (i: number) => {
    const s = c.scenes[i]
    const paint = s.look?.paint ?? looks[i]?.paint ?? (s.look?.fill ? undefined : c.paint)
    const base = fillCss(fillOf(i))
    const over = paint?.length ? layersCss(paint, 160, 90) : ""
    return { background: over ? `${over}, ${base}` : base }
  }
  const titled = c.scenes.map((s, i) => ({ i, l: s.layers.filter((l) => l.kind === "text" && l.font !== "mono").sort((a, b) => (b.kind === "text" ? b.size : 0) - (a.kind === "text" ? a.size : 0))[0] })).find((x) => x.l)
  const hero = titled?.i ?? 0
  const words = titled?.l?.kind === "text" ? titled.l : null
  const dark = isDark(fillOf(hero))
  return (
    <span className={`${bare ? "" : "lift rounded-xl shadow-[0_0_0_1px_var(--line)] "}relative block aspect-video overflow-hidden ${className}`} style={ground(hero)}>
      {words && (
        <span
          className="absolute inset-x-5 top-1/2 line-clamp-2 -translate-y-1/2 text-balance text-center text-[18px] font-semibold leading-[1.05] tracking-[-0.035em]"
          style={{
            color: dark ? "#fafafa" : "#171717",
            fontFamily: words.font === "serif" ? '"Instrument Serif", Georgia, serif' : undefined,
            fontWeight: words.font === "serif" ? 400 : undefined,
            ...(words.paint?.length ? { backgroundImage: layersCss(words.paint, 200, 40), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" } : {}),
          }}
        >
          {words.text.replace(/\|/g, " ")}
        </span>
      )}
      <span aria-hidden className="absolute inset-x-2 bottom-2 flex h-1.5 gap-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {c.scenes.slice(0, 12).map((s, i) => (
          <span key={s.id} className="min-w-0 rounded-full shadow-[0_0_0_1px_rgb(127_127_127/0.4)]" style={{ ...ground(i), flexGrow: s.duration, flexBasis: 0 }} />
        ))}
      </span>
    </span>
  )
}

