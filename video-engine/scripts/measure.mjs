// Measure a reference film into a motion profile (src/studio/pace.ts) the flow generator cuts new films to.
//   npm run measure -- <video> [--name soft-morph] [--type-cps 75] [--reveal-cps 40]
// The frames are measured by macOS's AVFoundation (scripts/motion/measure.swift) or, elsewhere, ffmpeg (motiscope's
// method either way: github.com/KumarSashank/motiscope). The profile goes to .engine-data/profiles/<name>.json and
// is printed. To look at the film too, install motiscope and run `motiscope ingest <video>` (its curated keyframes).
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseFrames, profileOf } from "../src/studio/pace.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
// (the first argument that isn't a flag or a flag's value)
const video = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")))
const opt = (k) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : undefined
}
if (!video || !existsSync(video)) {
  console.error("Usage: npm run measure -- <video> [--name <profile>] [--type-cps 75] [--reveal-cps 40]")
  process.exit(1)
}
const name = (opt("name") || basename(video).replace(/\.[^.]+$/, "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/** frames.csv, by AVFoundation on a Mac, else by ffmpeg (32×32 grey + colour, the same columns) */
function measure() {
  if (process.platform === "darwin" && spawnSync("swift", ["--version"]).status === 0) {
    const r = spawnSync("swift", ["-O", join(root, "scripts/motion/measure.swift"), video], { maxBuffer: 1 << 28, encoding: "utf8" })
    if (r.status === 0 && r.stdout.length > 100) return r.stdout
    console.error(r.stderr)
  }
  const ff = process.env.STUDIO_FFMPEG || "ffmpeg"
  const raw = spawnSync(ff, ["-v", "error", "-i", video, "-vf", "fps=60,scale=32:32,format=rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 })
  if (raw.status !== 0) throw new Error("Couldn't measure: no AVFoundation (macOS) and no ffmpeg on the PATH (or STUDIO_FFMPEG).")
  const px = 32 * 32
  const buf = raw.stdout
  const lines = ["t,energy,local,yavg,r,g,b,grid"]
  let prev = null
  for (let f = 0; (f + 1) * px * 3 <= buf.length; f++) {
    const grey = new Float64Array(px)
    let R = 0, G = 0, B = 0
    for (let i = 0; i < px; i++) {
      const [r, g, b] = [buf[(f * px + i) * 3], buf[(f * px + i) * 3 + 1], buf[(f * px + i) * 3 + 2]]
      grey[i] = 0.299 * r + 0.587 * g + 0.114 * b
      R += r; G += g; B += b
    }
    let energy = 0, local = 0
    if (prev) {
      const cells = new Float64Array(64)
      for (let i = 0; i < px; i++) {
        const d = Math.abs(grey[i] - prev[i])
        energy += d
        cells[(((i / 32) | 0) >> 2) * 8 + ((i % 32) >> 2)] += d / 16
      }
      energy /= px
      const top = [...cells].sort((a, b) => b - a).slice(0, 7)
      local = top.reduce((a, b) => a + b, 0) / 7
    }
    prev = grey
    const y = grey.reduce((a, b) => a + b, 0) / px
    lines.push([(f / 60).toFixed(4), energy.toFixed(3), local.toFixed(3), y.toFixed(1), (R / px).toFixed(0), (G / px).toFixed(0), (B / px).toFixed(0), ""].join(","))
  }
  return lines.join("\n")
}

const csv = measure()
const p = profileOf(parseFrames(csv), { name, source: basename(video), typeCps: Number(opt("type-cps")) || undefined, revealCps: Number(opt("reveal-cps")) || undefined })
const dir = join(root, ".engine-data", "profiles")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `${name}.json`), JSON.stringify(p, null, 1))
writeFileSync(join(dir, `${name}.frames.csv`), csv)
console.log(`${name}: ${p.duration} s, ${p.cuts} cuts, moves ~${p.move} s (${p.ease}), holds ~${p.hold} s, morphs ~${p.morph} s; grounds ${p.grounds.join(" → ")}`)
console.log(`  ${p.events.length} bursts: one every ~${p.beat} s, lasting ~${p.trans} s, ${Math.round(p.snaps * 100)}% snaps, stills ~${p.gap} s, mostly ${p.eventEase}`)
console.log(`→ ${join(dir, `${name}.json`)}`)
