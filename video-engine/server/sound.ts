// The film's sound, mixed onto the exported video (ffmpeg): its song from where it's set to start, ending at a bar of
// the song near the film's end and fading there (so it doesn't stop mid-phrase), and sound design made for each cut,
// synthesized (nothing licensed): a whoosh on a whip, a riser into a zoom or a flash, a low thump on a hard cut. All of
// it brought to -14 LUFS, where feeds play. A voiceover goes over the top, each line at its moment, the song lowered
// under it.
import { spawnSync } from "node:child_process"
import { renameSync, rmSync } from "node:fs"

export type Sound = { music?: { file: string; offset?: number; gain?: number; beats?: number[] }; sfx?: boolean; /** spoken lines: each file, and when it starts (s into the film) */ voice?: { file: string; at: number }[] }
type Scene = { duration: number; transition?: string }

const r3 = (x: number) => Math.round(x * 1000) / 1000
/** The sound effects for a film's cuts: what each cut is and when, as ffmpeg sources placed at their moment. */
export function effectsFor(scenes: Scene[]): { at: number; kind: "whoosh" | "riser" | "thump" }[] {
  const out: { at: number; kind: "whoosh" | "riser" | "thump" }[] = []
  let t = 0
  scenes.forEach((s, i) => {
    if (i) {
      const tr = s.transition ?? "cut"
      if (tr === "whip" || tr === "push" || tr === "wipe") out.push({ at: Math.max(0, t - 0.18), kind: "whoosh" })
      else if (tr === "zoom" || tr === "flash" || tr === "through" || tr === "iris") out.push({ at: Math.max(0, t - 1.1), kind: "riser" })
      else if (tr === "cut") out.push({ at: t, kind: "thump" })
    }
    t += s.duration
  })
  return out
}
const SOURCE = {
  // pink noise swept up through a band-pass, in and out in 0.4 s
  whoosh: "anoisesrc=c=pink:a=0.6:d=0.45,bandpass=f=1800:w=1.2,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.25,volume=0.55",
  // a rising tone over noise, 1.1 s, cut off as the cut lands
  riser: "aevalsrc=0.25*sin(2*PI*(200+600*t*t)*t)+0.08*(random(0)-0.5):d=1.1,afade=t=in:d=0.9,volume=0.5",
  // a low sine knock, quick
  thump: "aevalsrc=0.9*sin(2*PI*58*t)*exp(-14*t):d=0.35,volume=0.7",
}

/** Lays the sound on `video` in place. `music.beats` (s, in the song): where a bar ends near the film's end, so the song
    is cut there with a fade. Throws in words when ffmpeg fails. */
export function addSound(ff: string, video: string, scenes: Scene[], sound: Sound) {
  const length = scenes.reduce((a, s) => a + s.duration, 0)
  const fx = sound.sfx ? effectsFor(scenes) : []
  const voice = sound.voice ?? []
  if (!sound.music && !fx.length && !voice.length) return
  const args = ["-y", "-loglevel", "error", "-i", video]
  const mix: string[] = []
  let n = 1
  if (sound.music) {
    const offset = Math.max(0, sound.music.offset ?? 0)
    // the song ends on a bar (every fourth beat) near the film's end, then fades over the last second
    const bars = (sound.music.beats ?? []).filter((_, i) => i % 4 === 0).map((b) => b - offset).filter((b) => b > length * 0.6 && b <= length)
    const end = bars.length ? bars[bars.length - 1] : length
    args.push("-ss", String(offset), "-i", sound.music.file)
    // under a voice, the song steps back
    mix.push(`[${n}:a]atrim=0:${r3(end)},afade=t=out:st=${r3(Math.max(0, end - 1))}:d=1,volume=${(sound.music.gain ?? 1) * (voice.length ? 0.4 : 1)}[m]`)
    n++
  }
  fx.forEach((f, i) => {
    args.push("-f", "lavfi", "-i", SOURCE[f.kind])
    mix.push(`[${n}:a]adelay=${Math.round(f.at * 1000)}|${Math.round(f.at * 1000)}[s${i}]`)
    n++
  })
  voice.forEach((v, i) => {
    args.push("-i", v.file)
    mix.push(`[${n}:a]aresample=48000,adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},volume=1.3[v${i}]`)
    n++
  })
  const parts = [...(sound.music ? ["[m]"] : []), ...fx.map((_, i) => `[s${i}]`), ...voice.map((_, i) => `[v${i}]`)]
  mix.push(`${parts.join("")}amix=inputs=${parts.length}:normalize=0:duration=longest,apad=whole_dur=${r3(length)},atrim=0:${r3(length)},loudnorm=I=-14:TP=-1.5:LRA=11[a]`)
  const out = video.replace(/(\.\w+)$/, ".sound$1")
  const r = spawnSync(ff, [...args, "-filter_complex", mix.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(r3(length)), out], { encoding: "utf8" })
  if (r.status !== 0) {
    rmSync(out, { force: true })
    throw new Error(`ffmpeg couldn't lay the sound: ${(r.stderr ?? "").trim().split("\n").pop()}`)
  }
  renameSync(out, video)
}
