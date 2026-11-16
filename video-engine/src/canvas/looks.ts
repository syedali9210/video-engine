// Canvas — a matched look (theme.ts) put on a canvas: the frame's ground and lights (the main light where the device
// stands), the titles' ink and the small type's, each device's finish (and a case, if asked), and the background
// effect's palette. What a canvas's screen shows decides the anchor; this only paints.
import { contrast, groundPaints, lch, type Look } from "../theme"
import { FINISHES } from "../studio/finishes"
import type { CanvasDoc, CNode, DeviceNode } from "./doc"

/** A device's finish (by its id), as the layer keeps it: the colours travel with it, so a site needs no catalogue. */
export function finishPatch(device: DeviceNode["device"], id: string) {
  const f = FINISHES[device].find((x) => x.id === id) ?? FINISHES[device][0]
  return { id: f.id, metal: f.metal, back: f.back }
}

/** An effect's colours for a look: the ground, then inks that show on it without shouting, most quiet first. */
export function effectColours(count: number, look: Look) {
  const inks = [look.haze, look.glow, look.accent, look.muted, look.ink]
    .filter((c) => contrast(c, look.ground) > 1.18)
    .sort((a, b) => Math.abs(lch(a).l - lch(look.ground).l) - Math.abs(lch(b).l - lch(look.ground).l))
  return [look.ground, ...inks.slice(0, Math.max(1, Math.min(3, count - 1)))]
}

export function applyLook(doc: CanvasDoc, look: Look, o: { inCase: boolean }): CanvasDoc {
  const covers = (n: CNode) => n.x <= 1 && n.y <= 1 && n.x + n.w >= doc.frame.w - 1 && n.y + n.h >= doc.frame.h - 1
  // the light goes behind the main device (the biggest), a little above its middle
  const dev = [...doc.layers].filter((n): n is DeviceNode => n.kind === "device").sort((a, b) => b.w * b.h - a.w * a.h)[0]
  const at = dev ? { x: (dev.x + dev.w / 2) / doc.frame.w, y: (dev.y + dev.h * 0.42) / doc.frame.h } : { x: 0.62, y: 0.42 }
  const layers = doc.layers.map((n): CNode => {
    if (n.kind === "text") return { ...n, color: n.font === "mono" || n.size < 26 ? look.muted : look.ink }
    if (n.kind === "device") {
      const rest = { ...n }
      delete rest.case
      return { ...rest, finish: finishPatch(n.device, look.finish[n.device] ?? ""), ...(o.inCase ? { case: look.case } : {}) }
    }
    if (n.kind === "effect" && covers(n)) {
      // a see-through ground stays see-through: only the inks take the look
      const colors = effectColours(n.effect.colors.length, look)
      return { ...n, effect: { ...n.effect, colors: n.effect.colors[0] === "transparent" ? ["transparent", ...colors.slice(1)] : colors } }
    }
    return n
  })
  return { ...doc, frame: { ...doc.frame, paint: groundPaints(look, at, false), ink: look.ink }, layers }
}
