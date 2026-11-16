// The film's voice and words: a voiceover written a line a scene (in the product's voice, as long as each scene
// allows), spoken in a chosen voice and laid on the film (the Studio plays it, the export mixes it, the song stepping
// back under it); captions from the same lines, on the film itself or as an .srt beside it; and every line of the film
// translated into another language, each re-fitted to its slot. On the Work API (server/voice.ts).
import { useState } from "react"
import { field } from "../controls"
import { Button, Select } from "../ui"
import { Glyph } from "../Thinking"
import { text as titleLayer, starts, type Comp, type TextLayer } from "./comp"
import { LIBRARY } from "./library"

const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Hindi", "Japanese", "Korean", "Chinese (Simplified)", "Arabic", "Turkish", "Indonesian"]
const VOICES = ["Kore", "Puck", "Zephyr", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Sulafat", "Gacrux"]
const CAPTION = "Caption"

const kitId = () => {
  try {
    return localStorage.getItem("anim-engine:kit") ?? undefined
  } catch {
    return undefined
  }
}
async function post<T>(path: string, body: object): Promise<T> {
  const r = await fetch(`/__voice/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}
const stamp = (t: number) => {
  const ms = Math.round(t * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

export function VoicePanel({ comp, setComp }: { comp: Comp; setComp: (fn: (c: Comp) => Comp) => void }) {
  const [language, setLanguage] = useState(comp.voice?.language ?? "English")
  const [voice, setVoice] = useState(comp.voice?.voice ?? "Kore")
  const [lines, setLines] = useState<Record<string, string>>(() => Object.fromEntries((comp.voice?.lines ?? []).map((l) => [l.scene, l.text])))
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState("")
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
  const sceneInfo = comp.scenes.map((s) => {
    const l = s.layers.find((x) => x.kind === "component" && x.from !== undefined)
    const shot = l && l.kind === "component" ? LIBRARY.find((x) => x.film === l.anim && Math.abs(x.at - (l.from ?? 0)) < 0.05) : undefined
    return { id: s.id, name: s.name, dur: s.duration, role: shot?.role[0] }
  })
  const write = () =>
    act("write", async () => {
      const r = await post<{ lines: { scene: string; text: string }[] }>("script", { scenes: sceneInfo, kit: kitId(), language })
      setLines(Object.fromEntries(r.lines.map((l) => [l.scene, l.text])))
      return `${r.lines.length} lines written. Change any, then voice them.`
    })
  const speak = () =>
    act("speak", async () => {
      const list = comp.scenes.filter((s) => lines[s.id]?.trim()).map((s) => ({ scene: s.id, text: lines[s.id].trim() }))
      const r = await post<{ lines: { scene: string; text: string; url: string; dur: number }[] }>("speak", { lines: list, voice })
      setComp((c) => ({ ...c, voice: { lines: r.lines, voice, language } }))
      const long = r.lines.filter((l) => l.dur > (comp.scenes.find((s) => s.id === l.scene)?.duration ?? 99) - 0.15)
      return `Voiced ${r.lines.length} lines in ${voice}.${long.length ? ` ${long.length} run past their scene: shorten them or lengthen the scene.` : " Play the film to hear it."}`
    })
  // captions: the voiceover's lines (or what's written) at the foot of each scene, as titles you can edit
  const captions = () =>
    setComp((c) => ({
      ...c,
      scenes: c.scenes.map((s) => {
        const line = lines[s.id]?.trim()
        const rest = s.layers.filter((l) => !(l.kind === "text" && l.name === CAPTION))
        if (!line) return { ...s, layers: rest }
        const vertical = c.size === "9x16"
        return { ...s, layers: [...rest, titleLayer(line, { x: 0.5, y: vertical ? 0.74 : 0.88, w: vertical ? 0.8 : 0.7 }, vertical ? 3 : 2.4, 560, "fade", { name: CAPTION, align: "center" } as Partial<TextLayer>)] }
      }),
    }))
  const srt = () => {
    const st = starts(comp)
    const rows = comp.scenes.flatMap((s, i) => {
      const line = lines[s.id]?.trim()
      if (!line) return []
      const said = comp.voice?.lines.find((l) => l.scene === s.id)
      const from = st[i] + 0.15
      const to = Math.min(st[i] + s.duration, from + (said?.dur ?? s.duration - 0.3))
      return [`${stamp(from)} --> ${stamp(to)}\n${line}`]
    })
    const blob = new Blob([rows.map((r, i) => `${i + 1}\n${r}\n`).join("\n")], { type: "application/x-subrip" })
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `captions-${language.toLowerCase()}.srt` })
    a.click()
    URL.revokeObjectURL(a.href)
  }
  // every line of the film in another language, each re-fitted to its slot; titles too
  const translate = () =>
    act("translate", async () => {
      const films: Record<string, Record<string, string>> = {}
      for (const l of comp.scenes.flatMap((s) => s.layers)) if (l.kind === "component" && l.values) films[l.anim] = { ...films[l.anim], ...(Object.fromEntries(Object.entries(l.values).filter(([, v]) => typeof v === "string")) as Record<string, string>) }
      const texts = comp.scenes.flatMap((s) => s.layers).flatMap((l) => (l.kind === "text" ? [l.text] : []))
      const r = await post<{ films: Record<string, Record<string, string>>; texts: string[]; unfitted: string[] }>("translate", { language, films, texts, kit: kitId() })
      let n = 0
      setComp((c) => ({
        ...c,
        scenes: c.scenes.map((s) => ({
          ...s,
          layers: s.layers.map((l) => {
            if (l.kind === "component" && r.films[l.anim]) return { ...l, values: { ...l.values, ...r.films[l.anim] } }
            if (l.kind === "text") {
              const t = r.texts[n++]
              return t ? { ...l, text: t } : l
            }
            return l
          }),
        })),
      }))
      return `In ${language}: ${Object.values(r.films).reduce((a, v) => a + Object.keys(v).length, 0)} lines re-fitted, ${r.texts.filter(Boolean).length} titles.${r.unfitted.length ? ` ${r.unfitted.length} wouldn't fit and kept their words.` : ""} Undo takes it back.`
    })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block pb-1 text-caption text-fg-3">Language</span>
          <Select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
            {LANGUAGES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="block pb-1 text-caption text-fg-3">Voice</span>
          <Select aria-label="Voice" value={voice} onChange={(e) => setVoice(e.target.value)} className={`${field} h-8 w-full cursor-pointer px-2 text-body`}>
            {VOICES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <Button size="sm" disabled={!!busy} onClick={() => void write()}>
        {busy === "write" ? <><Glyph variant="breathe" size={14} /> Writing the voiceover…</> : "Write the voiceover"}
      </Button>
      <ol className="space-y-1.5">
        {comp.scenes.map((s) => (
          <li key={s.id}>
            <span className="block text-caption text-fg-3">
              {s.name} · {s.duration.toFixed(1)} s
            </span>
            <input value={lines[s.id] ?? ""} onChange={(e) => setLines({ ...lines, [s.id]: e.target.value })} placeholder="No line: the picture says it" aria-label={`The line for “${s.name}”`} className={`${field} h-8 w-full px-2.5 text-body`} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" disabled={!!busy || !Object.values(lines).some((x) => x.trim())} onClick={() => void speak()}>
          {busy === "speak" ? <><Glyph variant="slide" size={14} /> Voicing…</> : "Voice it"}
        </Button>
        <Button size="sm" disabled={!Object.values(lines).some((x) => x.trim())} onClick={captions}>
          Captions on the film
        </Button>
        <Button size="sm" variant="ghost" disabled={!Object.values(lines).some((x) => x.trim())} onClick={srt}>
          Captions as .srt
        </Button>
        {comp.voice && (
          <Button size="sm" variant="ghost" onClick={() => setComp((c) => ({ ...c, voice: undefined }))}>
            Take the voice out
          </Button>
        )}
      </div>
      <div className="border-t pt-3">
        <Button size="sm" disabled={!!busy} onClick={() => void translate()}>
          {busy === "translate" ? <><Glyph variant="breathe" size={14} /> Translating, line by line…</> : `Translate the film into ${language}`}
        </Button>
        <p className="mt-1 text-caption text-fg-3">Every line, re-fitted to its space; names stay as they are.</p>
      </div>
      {msg && <p role="status" className="text-caption text-fg-2">{msg}</p>}
    </div>
  )
}
