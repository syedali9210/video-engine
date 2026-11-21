#!/usr/bin/env node
// Make a film from a plan, the whole pipeline (the engine's dev server must be up: npm run dev):
//   npm run film -- <plan.json> [--draft] [--force] [--out file.mp4] [--check]
// The plan is a flow (src/studio/flow.ts: { name, accent, tone?, motion?, scenes: [...] }). It is fitted (every scene as
// long as its own animation needs), composed by the generator (compose.ts: motion, shots, transitions, backdrops,
// assemblies) and judged against the guardrails (guardrails.ts). A plan that breaks one isn't made: the findings are
// printed (--force makes it anyway). Then it's rendered (headless Chrome, frame by frame, H.264 with its score) and
// saved, and how long each part took is printed. --check stops after the judging.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ENGINE = process.env.ENGINE_URL || "http://localhost:5180"
const file = process.argv[2]
const has = (f) => process.argv.includes(`--${f}`)
const val = (f) => process.argv[process.argv.indexOf(`--${f}`) + 1]
if (!file || file.startsWith("--")) {
  console.log("npm run film -- <plan.json> [--draft] [--force] [--out file.mp4] [--check]")
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** a request to the engine, tried again a few times (the dev server restarts when its own files change) */
async function ask(url, init) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, init)
      if (r.status >= 500 && i < 4) throw new Error(`${r.status}`)
      return r
    } catch (e) {
      if (i >= 4) throw e
      await sleep(1500 * (i + 1))
    }
  }
}
const plan = JSON.parse(readFileSync(resolve(file), "utf8"))
const t0 = Date.now()
const res = await fetch(`${ENGINE}/__film/flow`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow: plan, name: plan.name, force: has("force"), dry: has("check") }) }).catch(() => null)
if (!res) throw new Error(`No engine at ${ENGINE}: start it with npm run dev.`)
const made = await res.json()
const findings = made.verdict?.findings ?? []
for (const f of findings) console.log(`${f.level === "error" ? "✗" : "!"} ${f.rule}: ${f.text}`)
if (res.status === 422) {
  console.log("It breaks the guardrails, so it wasn't made. Change the plan (or --force).")
  process.exit(2)
}
if (!res.ok) throw new Error(made.error || `The engine said ${res.status}`)
console.log(`${findings.length ? "" : "✓ guardrails all kept · "}${made.id ? `film ${made.id}` : "judged"}: ${made.length.toFixed(2)} s · ${made.scenes.map((s) => `${s.kind} ${s.dur.toFixed(2)}`).join(" · ")}`)
if (has("check")) process.exit(0)
const t1 = Date.now()
const { job, error } = await (await ask(`${ENGINE}/__film/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: made.id, draft: has("draft") }) })).json()
if (!job) throw new Error(error || "The render didn't start.")
const t2 = Date.now()
let last = -1
for (;;) {
  const s = await (await ask(`${ENGINE}/__studio/jobs/${job}`)).json()
  if (s.state === "error") throw new Error(`The render failed: ${s.error}`)
  if (s.state === "done") {
    for (const f of s.checks?.findings ?? []) console.log(`! ${f.text}`)
    break
  }
  const pct = s.total ? Math.floor((100 * s.frame) / s.total / 10) * 10 : 0
  if (pct !== last) (process.stdout.write(`rendering ${pct}%\r`), (last = pct))
  await sleep(2000)
}
const t3 = Date.now()
const out = resolve(has("out") ? val("out") : join(root, ".engine-data", "films", `${String(plan.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}${has("draft") ? "-draft" : ""}.mp4`))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(await (await ask(`${ENGINE}/__studio/jobs/${job}/file`)).arrayBuffer()))
const s = (a, b) => ((b - a) / 1000).toFixed(1)
console.log(`saved ${out}\ntimes: compose and judge ${s(t0, t1)} s · start the render ${s(t1, t2)} s · render and encode ${s(t2, t3)} s · all ${s(t0, Date.now())} s`)
