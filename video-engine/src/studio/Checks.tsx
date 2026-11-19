// The check before an export: the film run through the quality gates on the export page itself (server/gates.ts), and
// the critic's notes. Every finding names its scene (a click goes there); what the engine can fix itself (a hook moved
// first, a shot retimed into its range, the length brought to target, a title's ink, a line written shorter) it fixes
// on "Fix what it can", then checks again, at most three rounds, saying what it did each time.
import { Problem } from "../States"
import { useEffect, useRef, useState } from "react"
import { ArrowsClockwise, Check, WarningCircle, Wrench } from "@phosphor-icons/react"
import { Button } from "../ui"
import { Glyph } from "../Thinking"
import type { RenderConfig } from "./config"

export type Fix =
  | { kind: "shorten"; film: string; key: string; to: number }
  | { kind: "ink"; scene: number; layer: string }
  | { kind: "retime"; scene: number; to: number }
  | { kind: "length"; to: number }
  | { kind: "first"; scene: number }
type Finding = { level: "error" | "warn" | "info"; text: string; at?: number; scene?: number; fix?: Fix }
type Gate = { id: string; name: string; pass: boolean; findings: Finding[] }
type Report = { gates: Gate[]; frames: { t: number; scene: number }[]; critic?: { score: number; verdict: string; notes: { scene?: number; problem: string; fix: string }[]; by: string } | { error: string }; seconds: number }

const KIT = "anim-engine:kit"
const kitId = () => {
  try {
    return localStorage.getItem(KIT) ?? undefined
  } catch {
    return undefined
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Runs the gates on a film; resolves to the report (or throws in words). */
export async function runCheck(config: RenderConfig, size: { w: number; h: number }, o: { target?: number; critic?: boolean; onProgress?: (p: number) => void } = {}): Promise<{ id: string; report: Report }> {
  const r = await fetch("/__gates/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config, width: size.w, height: size.h, kit: kitId(), target: o.target, critic: o.critic }) }).catch(() => null)
  if (!r?.ok) throw new Error((await r?.json().catch(() => null))?.error ?? "The check runs on the engine's server: start it with npm run dev.")
  const { id } = (await r.json()) as { id: string }
  for (;;) {
    await sleep(500)
    const j = (await (await fetch(`/__gates/${id}`)).json()) as { state: string; progress: number; report?: Report; error?: string }
    if (j.state === "error") throw new Error(j.error ?? "The check failed")
    if (j.state === "done" && j.report) return { id, report: j.report }
    o.onProgress?.(j.progress)
  }
}

export function Checks({ config, size, scenes, onScene, onFix }: { config: () => Promise<RenderConfig>; size: { w: number; h: number }; scenes: string[]; onScene: (i: number) => void; /** apply one fix; says what it did, or nothing when it couldn't */ onFix: (f: Fix) => Promise<string | null> }) {
  const [busy, setBusy] = useState<"" | "check" | "fix">("")
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ id: string; report: Report } | null>(null)
  const [error, setError] = useState("")
  const [log, setLog] = useState<string[]>([])
  const [target, setTarget] = useState<number | "">("")
  const live = useRef(true)
  useEffect(() => () => void (live.current = false), [])

  const check = async (critic = true) => {
    setError("")
    setProgress(0)
    const r = await runCheck(await config(), size, { target: target || undefined, critic, onProgress: (p) => live.current && setProgress(p) })
    if (live.current) setResult(r)
    return r.report
  }
  const go = async () => {
    setBusy("check")
    setLog([])
    try {
      await check()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }
  // the auto-fix: apply every fix the findings carry, check again, up to three rounds
  const fixAll = async () => {
    setBusy("fix")
    const said: string[] = []
    try {
      let report = result!.report
      for (let round = 1; round <= 3; round++) {
        const fixes = report.gates.flatMap((g) => g.findings).filter((f) => f.fix && f.level !== "info")
        if (!fixes.length) break
        const did: string[] = []
        for (const f of fixes) {
          const what = await onFix(f.fix!)
          if (what) did.push(what)
        }
        if (!did.length) {
          said.push(`Round ${round}: nothing it could fix by itself.`)
          break
        }
        said.push(`Round ${round}: ${did.join("; ")}.`)
        setLog([...said])
        // the composition takes a moment to settle before it's checked again
        await sleep(400)
        report = await check(false)
      }
      setLog([...said, said.length ? "Checked again: what's left is below." : "Nothing to fix."])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy("")
    }
  }

  const r = result?.report
  const fixable = r?.gates.some((g) => g.findings.some((f) => f.fix && f.level !== "info"))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!!busy} onClick={() => void go()}>
          {busy === "check" ? <><Glyph variant="scan" size={14} /> Checking… {progress}%</> : r ? <><ArrowsClockwise size={14} aria-hidden /> Check again</> : "Check the film"}
        </Button>
        {fixable && (
          <Button disabled={!!busy} onClick={() => void fixAll()}>
            {busy === "fix" ? <><Glyph variant="slide" size={14} /> Fixing…</> : <><Wrench size={14} aria-hidden /> Fix what it can</>}
          </Button>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-caption text-fg-3">
          Target
          <input type="number" min={3} max={180} value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")} placeholder="—" className="h-7 w-14 rounded-md bg-surface-2 px-1.5 text-right text-caption text-fg" />s
        </label>
      </div>
      {!r && !busy && !error && <p className="text-caption text-fg-3">Every scene, sampled on the export page itself: the words' size and contrast, the story, the shots' timing, the product's colours, and the critic's eye. A minute or so.</p>}
      {error && <Problem compact error={error} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--line)]" />}
      {log.length > 0 && (
        <ul className="space-y-0.5 text-caption text-fg-2">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {r && (
        <>
          <ul className="grid grid-cols-2 gap-1.5">
            {r.gates.map((g) => {
              const errors = g.findings.filter((f) => f.level === "error").length
              const warns = g.findings.filter((f) => f.level === "warn").length
              return (
                <li key={g.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-caption">
                  {g.pass ? <Check size={14} aria-hidden className="shrink-0 text-good-ink" /> : <WarningCircle size={14} aria-hidden className="shrink-0 text-bad-ink" />}
                  <span className="font-medium">{g.name}</span>
                  <span className="ml-auto text-fg-3">{errors ? `${errors} to fix` : warns ? `${warns} to look at` : "passes"}</span>
                </li>
              )
            })}
          </ul>
          {r.gates.map(
            (g) =>
              g.findings.length > 0 && (
                <section key={g.id}>
                  <h3 className="pb-1 text-caption font-medium text-fg-3">{g.name}</h3>
                  <ul className="space-y-1">
                    {g.findings.slice(0, 12).map((f, i) => (
                      <li key={i}>
                        <button type="button" disabled={f.scene === undefined} onClick={() => f.scene !== undefined && onScene(f.scene)} className="press flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-caption hover:bg-surface-2 disabled:hover:bg-transparent">
                          <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${f.level === "error" ? "bg-bad-ink" : f.level === "warn" ? "bg-warn-ink" : "bg-fg-3"}`} />
                          <span className="text-fg-2">
                            {f.text}
                            {f.fix && <span className="ml-1 text-fg-3">(it can fix this)</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                    {g.findings.length > 12 && <li className="pl-4 text-caption text-fg-3">and {g.findings.length - 12} more</li>}
                  </ul>
                </section>
              ),
          )}
          {r.critic && (
            <section>
              <h3 className="pb-1 text-caption font-medium text-fg-3">The critic{"score" in r.critic ? ` · ${r.critic.score}/100` : ""}</h3>
              {"error" in r.critic ? (
                <p className="text-caption text-fg-3">No critic this time: {r.critic.error}</p>
              ) : (
                <>
                  <p className="text-caption text-fg-2">{r.critic.verdict}</p>
                  <ul className="mt-1.5 space-y-1">
                    {r.critic.notes.map((n, i) => (
                      <li key={i}>
                        <button type="button" disabled={n.scene === undefined} onClick={() => n.scene !== undefined && onScene(n.scene)} className="press block w-full rounded-md px-1 py-0.5 text-left text-caption hover:bg-surface-2">
                          <span className="text-fg-2">{n.scene !== undefined && scenes[n.scene] ? `“${scenes[n.scene]}”: ` : ""}{n.problem}</span>
                          <span className="block text-fg-3">→ {n.fix}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          {r.frames.length > 0 && result && (
            <div>
              <h3 className="pb-1 text-caption font-medium text-fg-3">What it looked at</h3>
              <div className="grid grid-cols-3 gap-1">
                {r.frames.map((f, i) => (
                  <button key={i} type="button" onClick={() => onScene(f.scene)} title={`${scenes[f.scene] ?? ""} · ${f.t.toFixed(2)} s`} className="press overflow-hidden rounded">
                    <img src={`/__gates/${result.id}/frame/${i}`} alt="" loading="lazy" className="block w-full" />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-caption text-fg-3">{r.frames.length} moments in {r.seconds} s.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
