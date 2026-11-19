// The cross-checker: does the film hold together, and is it any good? Two passes. This one is code, free, on the
// composition itself: motionmaxxing's gates (public/motionmaxxing/references/slop.md, adapted to the engine's films)
// and the meaning every shot was made with (scene.meaning: its role, the belief it buys, its words, what shows it).
// The other is a look at the film (server/maker.ts review): one still a shot, each checked against what it's meant
// to show, and the whole scored. A fail is fixed, never argued: its `fix` goes back to the director.
// Pure: the server, the panel and `npm run check` all run it.

export type Finding = { gate: string; level: "fail" | "warn"; scene?: number; text: string; fix?: string }
type L = { kind: string; anim?: string; text?: string; size?: number; font?: string; enter?: string; box?: { x: number; y: number; w: number }; entry?: { at: number; dur: number }; name?: string }
type S = { name?: string; duration: number; transition?: string; layers: L[]; camera?: { zoom?: number }; camera2?: { zoom?: number }; meaning?: { role: string; buys: string; says: string; carrier: string; shows: string } }

const SLOGAN = /\bmeet\s+[A-Z]|\bnot just\b|\bthe future of\b|\bunlock\w*|\brevolution\w*|\bgame[- ]?chang\w*|\bseamless\w*|\bnext[- ]level\b|\bsupercharg\w*/i
const URL = /\b[\w-]+\.(com|app|io|dev|ai|co|net|org|so|xyz)\b|www\.|https?:\/\//i
const FADES = new Set(["fade", "dissolve", "blur", "through", "iris"])

/** Every gate on a film's composition: what fails and what to do about it. */
export function lintFilm(c: { scenes: S[] }): Finding[] {
  const out: Finding[] = []
  const total = c.scenes.reduce((a, s) => a + s.duration, 0) || 1
  const texts = (s: S) => s.layers.filter((l) => l.kind === "text" && l.text)
  const last = c.scenes.at(-1)
  // G3: the end card is short: the final shot at most a quarter of the film, its resolved hold at most 1.4 s
  if (last) {
    if (last.duration > total * 0.25) out.push({ gate: "G3 end card", level: "fail", scene: c.scenes.length - 1, text: `The last shot is ${last.duration.toFixed(1)} s of ${total.toFixed(1)}: more than a quarter of the film.`, fix: "Shorten the close: the mark arriving and resolving, about 2 s." })
    const settled = Math.max(0.6, ...last.layers.map((l) => (l.entry ? l.entry.at + l.entry.dur : 0.6)))
    if (last.duration - settled > 1.4) out.push({ gate: "G3 end card", level: "fail", scene: c.scenes.length - 1, text: `The end holds ${(last.duration - settled).toFixed(1)} s after everything has landed (1.4 s at most).`, fix: "End the film 1.4 s after the mark lands." })
  }
  c.scenes.forEach((s, i) => {
    const t = texts(s)
    // G5: no page chrome: small labels at the frame's edge, tracked mono captions, an address in the close
    for (const l of t) {
      const y = l.box?.y ?? 0.5
      if ((l.size ?? 9) < 1.3 && (y < 0.1 || y > 0.88)) out.push({ gate: "G5 page chrome", level: "fail", scene: i, text: `“${l.text}” is a small label at the frame's edge.`, fix: "Delete it: corner and edge labels are page furniture." })
      else if (l.font === "mono" && (l.size ?? 9) < 1.6) out.push({ gate: "G5 page chrome", level: "fail", scene: i, text: `“${l.text}” is a tracked mono caption.`, fix: "Delete it, or set it as a line of the film." })
      if (i >= c.scenes.length - 2 && URL.test(l.text!)) out.push({ gate: "G5 page chrome", level: "fail", scene: i, text: `The close shows an address (“${l.text}”): a web-footer ending.`, fix: "End on the mark and the name; the address belongs in the post, not the film." })
      if (l.enter === "type") out.push({ gate: "G5 page chrome", level: "warn", scene: i, text: `“${l.text}” is typed letter by letter: a headline never is (only the product's own input).`, fix: "Let the words arrive whole." })
      if (SLOGAN.test(l.text!)) out.push({ gate: "copy", level: "fail", scene: i, text: `“${l.text}” is slogan copy.`, fix: "Say what it does, plainly, in the audience's words." })
    }
    // deck layout: a title stacked over the product (say it, then show it: a cut between, not a header)
    const product = s.layers.some((l) => l.kind === "device") || s.layers.some((l) => l.kind === "image" && (l.name === "Recording" || l.name === "Screen"))
    if (product && t.some((l) => (l.box?.y ?? 0.5) < 0.22)) out.push({ gate: "deck layout", level: "fail", scene: i, text: "A title sits over the product, like a slide.", fix: "Show the claim on its own, then cut to the product doing it, with nothing over it." })
    // G1: the proof reads: the product big enough to read on a phone
    const rec = s.layers.find((l) => l.kind === "image" && (l.name === "Recording" || l.name === "Screen"))
    if (rec && (rec.box?.w ?? 1) < 0.55) out.push({ gate: "G1 proof readable", level: "fail", scene: i, text: `The recording is ${Math.round((rec.box?.w ?? 0) * 100)}% of the frame's width (55% at least).`, fix: "Show it bigger, or magnify the part that matters." })
    if (s.layers.some((l) => l.kind === "device") && Math.max(s.camera?.zoom ?? 1, s.camera2?.zoom ?? 0) < 1.1) out.push({ gate: "G1 proof readable", level: "warn", scene: i, text: "The device is small in the frame: its screen won't read.", fix: "Push in: the screen at half the frame or more." })
    // meaning: every shot buys something
    if (!s.meaning) out.push({ gate: "meaning", level: "warn", scene: i, text: `“${s.name ?? `Shot ${i + 1}`}” has no meaning recorded: what is it for?` })
    else if (!s.meaning.buys) out.push({ gate: "meaning", level: "warn", scene: i, text: `“${s.name ?? `Shot ${i + 1}`}” buys nothing.`, fix: "Write what the viewer believes after it, or cut it." })
  })
  // the product is the film: on screen (a device, a recording, a template's own shot of it) a third of it at least
  // (the ground a film sits on, a composed field, is a component too: it isn't the product)
  const onScreen = c.scenes.filter((s) => s.layers.some((l) => l.kind === "device" || (l.kind === "component" && l.name !== "World" && l.anim !== "film-field") || (l.kind === "image" && (l.name === "Recording" || l.name === "Screen")))).reduce((a, s) => a + s.duration, 0)
  if (onScreen < total / 3) out.push({ gate: "product", level: "fail", text: `The product is on screen ${Math.round((onScreen / total) * 100)}% of the film (a third at least: proofs are half of a good one).`, fix: "Carry the proofs on the product's recordings and screens, not on words or shapes." })
  // almost nothing fades between beats (motionmaxxing law 6)
  const fades = c.scenes.slice(1).filter((s) => FADES.has(s.transition ?? "cut")).length
  if (fades > 1) out.push({ gate: "cuts", level: "warn", text: `${fades} cuts fade or blur: almost nothing fades between beats.`, fix: "Cut hard, on motion." })
  // a pinned object: the same words in the same place through three shots or more
  for (let i = 2; i < c.scenes.length; i++) {
    const key = (s: S) => texts(s).map((l) => `${l.text}@${l.box?.x},${l.box?.y}`)
    const same = key(c.scenes[i]).filter((k) => key(c.scenes[i - 1]).includes(k) && key(c.scenes[i - 2]).includes(k))
    if (same.length) out.push({ gate: "pinned", level: "warn", scene: i, text: `“${same[0].split("@")[0]}” stays pinned in place for three shots.`, fix: "Let it move, change or go." })
  }
  return out
}

/** The findings as notes for the director's next pass (the fails first). */
export const notesOf = (f: Finding[]) =>
  f
    .filter((x) => x.fix)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "fail" ? -1 : 1))
    .slice(0, 8)
    .map((x) => `${x.scene !== undefined ? `Shot ${x.scene + 1}: ` : ""}${x.text} ${x.fix}`)
    .join(" ")
