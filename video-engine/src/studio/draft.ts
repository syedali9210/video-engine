// A studied film as the start of a template: its shots as a tagged shot list (studio/shots.ts FilmSpec: where each
// cuts, what it does in a film, its energy, how it comes in and leaves) and the slots it would need from a product
// (the words it shows, the screens it films). What a template's meta.ts `film` and schema start from; the replica (its
// first script) is made alongside. Rules only, from the teardown and the measured cuts. Plain data: `npm run check`.
import type { FilmRole, FilmSpec, LookFamily, ShotMove } from "./shots.ts"

type Shot = { at: number; dur: number; what: string; from?: string; to?: string; cut?: string; type?: string; ground?: string }
type Ref = { title: string; shots: Shot[]; palette?: string[]; file?: { w?: number; h?: number }; measured?: { duration: number; cuts: number[] } }
export type DraftSlot = { key: string; kind: "text" | "screen" | "logo"; label: string; example: string }

const r2 = (x: number) => Math.round(x * 100) / 100
const moveOf = (s = ""): ShotMove => (/whip/i.test(s) ? "whip" : /flash/i.test(s) ? "flash" : /zoom|dolly in|push in|dive/i.test(s) ? "push-in" : /pull|zoom out|reveal/i.test(s) ? "pull-out" : /pan|slide|track/i.test(s) ? "pan" : /spin|rotat|turn/i.test(s) ? "spin" : /rise|lift/i.test(s) ? "rise" : /typ/i.test(s) ? "type" : /hold|still|static/i.test(s) ? "hold" : "cut")
const lum = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h)
  if (!m) return 0.5
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function draftSpec(ref: Ref): { film: FilmSpec; slots: DraftSlot[] } {
  const end = r2(ref.measured?.duration ?? Math.max(0, ...ref.shots.map((s) => s.at + s.dur)))
  const w = ref.file?.w ?? 16
  const h = ref.file?.h ?? 9
  const size: FilmSpec["size"] = w / h < 0.8 ? "9x16" : w / h < 1.2 ? "1x1" : "16x9"
  const p = ref.palette ?? []
  const dark = p.length ? p.slice(0, 3).reduce((a, c) => a + lum(c), 0) / Math.min(3, p.length) < 0.3 : true
  const look: LookFamily = dark ? "night" : p.some((c) => lum(c) > 0.85 && /^#?(f|e)/i.test(c)) ? "paper" : "studio"
  // its shots: the teardown's, on the measured cuts when there are some
  const list: Shot[] = ref.shots.length ? ref.shots : (ref.measured ? [0, ...ref.measured.cuts] : [0]).map((at, i, a) => ({ at, dur: (a[i + 1] ?? end) - at, what: `Shot ${i + 1}` }))
  const shots = list.map((s, i) => {
    const what = s.what ?? ""
    const role: FilmRole[] =
      i === 0 ? ["hook"] : i === list.length - 1 ? ["logo", "cta"] : /\d/.test(what) && /%|×|users|teams|faster|saved/i.test(what) ? ["proof"] : /screen|app|interface|dashboard|window|ui\b/i.test(what) ? ["product"] : s.type && s.type !== "none" ? ["feature"] : /logo|name|mark/i.test(what) ? ["logo"] : ["feature"]
    const energy: 1 | 2 | 3 = s.dur < 1 ? 3 : s.dur < 2.5 ? 2 : 1
    return { name: what.split(/[,.;:]/)[0].trim().slice(0, 40) || `Shot ${i + 1}`, at: r2(s.at), role, energy, enter: i ? moveOf(s.cut) : ("cut" as ShotMove), exit: moveOf(`${s.to ?? ""} ${list[i + 1]?.cut ?? ""}`) }
  })
  // names stay unique (the library's ids are made from them)
  const seen = new Map<string, number>()
  for (const s of shots) {
    const n = (seen.get(s.name) ?? 0) + 1
    seen.set(s.name, n)
    if (n > 1) s.name = `${s.name} ${n}`
  }
  // its slots: every line of words it shows, every screen it films, its mark
  const slots: DraftSlot[] = []
  list.forEach((s, i) => {
    if (s.type && s.type !== "none" && slots.filter((x) => x.kind === "text").length < 12) slots.push({ key: `line${i + 1}`, kind: "text", label: `Words in “${shots[i].name}”`, example: s.type })
    if (/screen|app|interface|dashboard|window|phone|laptop/i.test(s.what ?? "") && slots.filter((x) => x.kind === "screen").length < 4) slots.push({ key: `screen${slots.filter((x) => x.kind === "screen").length + 1}`, kind: "screen", label: `The screen in “${shots[i].name}”`, example: "" })
  })
  if (list.some((s) => /logo|mark/i.test(s.what ?? ""))) slots.push({ key: "mark", kind: "logo", label: "Logo", example: "" })
  return { film: { size, end, look, shots }, slots }
}
