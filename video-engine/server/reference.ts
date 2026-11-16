// A reference film, read on arrival (ffmpeg, on the dev server): how long it runs and where it cuts, whether it loops
// (its last frame comes back to its first), the bars or player chrome around the picture (a screen recording of a
// player, a letterboxed export) to crop away, and a contact sheet: one still from each shot, in order, so the whole
// film reads at a glance before anyone watches it.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ffmpeg, sceneCuts } from "./studio"

export type Measured = { duration: number; cuts: number[]; loop: boolean; crop?: { w: number; h: number; x: number; y: number }; size?: { w: number; h: number } }

const run = (bin: string, args: string[]) => spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

/** The picture's size, and the box inside it that isn't bars: ffmpeg's cropdetect over the film, kept when it trims
    more than 2% off a side (less is noise, or a dark edge of the picture itself). */
function cropOf(ff: string, file: string, duration: number): Pick<Measured, "crop" | "size"> {
  const probe = run(ff.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file])
  const [w, h] = probe.stdout.trim().split(",").map(Number)
  if (!w || !h) return {}
  // a few seconds from the middle: an opening on black would read as all bars
  const r = run(ff, ["-hide_banner", "-ss", String(Math.max(0, duration / 2 - 2)), "-t", "4", "-i", file, "-vf", "cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-"])
  const all = [...(r.stderr ?? "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map((m) => m.slice(1).map(Number))
  const last = all.at(-1)
  if (!last) return { size: { w, h } }
  const [cw, ch, x, y] = last
  const trims = cw < w * 0.98 || ch < h * 0.98
  return { size: { w, h }, ...(trims && cw > w * 0.3 && ch > h * 0.3 ? { crop: { w: cw, h: ch, x, y } } : {}) }
}

/** Whether the film comes back to where it began: its first and last frames, small, nearly the same (SSIM). */
function loops(ff: string, file: string, duration: number) {
  const r = run(ff, ["-hide_banner", "-i", file, "-ss", String(Math.max(0, duration - 0.08)), "-i", file, "-filter_complex", "[0:v]trim=end_frame=1,scale=160:90,setsar=1[a];[1:v]trim=end_frame=1,scale=160:90,setsar=1[b];[a][b]ssim", "-an", "-f", "null", "-"])
  const m = /All:([\d.]+)/.exec(r.stderr ?? "")
  return m ? Number(m[1]) > 0.9 : false
}

/** One still from the middle of each shot, four to a row, 320 px wide each: a JPEG. */
function contact(ff: string, file: string, duration: number, cuts: number[], crop?: Measured["crop"]) {
  const edges = [0, ...cuts, duration]
  const mids = edges.slice(0, -1).map((a, i) => (a + edges[i + 1]) / 2).slice(0, 40)
  const dir = mkdtempSync(join(tmpdir(), "anim-engine-contact-"))
  try {
    const cut = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : ""
    mids.forEach((t, i) => run(ff, ["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `${cut}scale=320:-2`, "-y", join(dir, `${String(i).padStart(3, "0")}.png`)]))
    const cols = Math.min(4, mids.length)
    const rows = Math.ceil(mids.length / cols)
    const out = join(dir, "sheet.jpg")
    run(ff, ["-hide_banner", "-loglevel", "error", "-framerate", "1", "-i", join(dir, "%03d.png"), "-vf", `tile=${cols}x${rows}:padding=6:margin=6:color=0x111111`, "-frames:v", "1", "-q:v", "3", "-y", out])
    return readFileSync(out)
  } catch {
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Everything ffmpeg can say about a reference film, and its contact sheet (null without ffmpeg). */
export function readFilm(file: string): { measured: Measured; sheet: Buffer | null } | null {
  const ff = ffmpeg()
  if (!ff) return null
  const cuts = sceneCuts(file, 0.3)
  if (!cuts) return null
  const { crop, size } = cropOf(ff, file, cuts.duration)
  const measured: Measured = { duration: Math.round(cuts.duration * 100) / 100, cuts: cuts.cuts.map((c) => Math.round(c * 100) / 100), loop: loops(ff, file, cuts.duration), ...(crop ? { crop } : {}), ...(size ? { size } : {}) }
  return { measured, sheet: contact(ff, file, cuts.duration, cuts.cuts, crop) }
}
