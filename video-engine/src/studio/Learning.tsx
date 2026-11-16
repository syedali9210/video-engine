// The template lab's Learning: how the lab improves itself.
//   - What your decisions taught: every approval and rejection weighs the features of the film it was about (its cuts,
//     angles, moves, pace, look, kind), and your reasons become rules every new proposal is checked against. The
//     generators read it: the shapes and carriers you keep come up more, the pace follows what you said.
//   - How its own generators are doing: every shape the inventor writes in, read by the critic over a few films; the
//     weakest first, its weakest film one click from an improvement in the inbox.
//   - The gallery, re-read: every template scored the same way, the weakest first, with Fix by rules beside it.
import { useEffect, useMemo, useState } from "react"
import { ArrowsClockwise, Brain, Check, Play, Quotes, Sparkle, WarningCircle, Wrench } from "@phosphor-icons/react"
import type { Reference } from "../refs"
import { Button, IconButton } from "../ui"
import { analyze, generatorHealth } from "./concepts"
import { cutName } from "./cuts"
import { Score, ScoreRow } from "./IdeasLab"
import type { TemplateScript } from "./script"
import type { Taste, Weight } from "./taste"
import type { LabState } from "./Lab"

type Api = <T>(path: string, body?: object) => Promise<T>

/** A lean from −1 to 1, as a bar from the middle: right for what you keep, left for what you turn down. */
function Lean({ w }: { w: Weight }) {
  const pct = Math.abs(w.lean) * 50
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_96px_56px] items-center gap-2" title={`${w.yes} kept, ${w.no} turned down`}>
      <span className="truncate text-caption text-fg-2">{w.label}</span>
      <span aria-hidden className="relative h-1.5 rounded-full bg-surface-3">
        <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--line-strong)" }} />
        <span className="absolute inset-y-0 rounded-full bg-fg" style={{ left: w.lean >= 0 ? "50%" : `${50 - pct}%`, width: `${pct}%`, opacity: w.lean >= 0 ? 0.85 : 0.4 }} />
      </span>
      <span className="text-right text-micro tabular-nums text-fg-3">
        {w.yes} · {w.no}
        <span className="sr-only"> kept, turned down</span>
      </span>
    </li>
  )
}

export function Learning({ api, state, gallery, refs, taste, onReload, onPreview, onInbox }: { api: Api; state: LabState | null; gallery: TemplateScript[]; refs: Reference[]; taste?: Taste; onReload: () => void; onPreview: (s: TemplateScript) => void; onInbox: () => void }) {
  const [round, setRound] = useState(0)
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => setMsg(null), [round])
  const ctx = useMemo(() => ({ gallery, refs, taste }), [gallery, refs, taste])
  // the inventor's shapes, a few films each, read by the critic (a new set each round)
  const health = useMemo(() => generatorHealth(ctx, 4, round * 97), [ctx, round])
  const reread = useMemo(() => gallery.map((s) => ({ s, a: analyze(s, ctx) })).sort((x, y) => x.a.score - y.a.score), [gallery, ctx])
  const improve = async (s: TemplateScript, withAI: boolean, key: string) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await api<{ proposal?: { changes: unknown[]; by: string } }>("improve", { script: s, ai: withAI })
      setMsg(r.proposal && !r.proposal.changes.length && r.proposal.by === "rules" ? { ok: true, text: `“${s.name}” already follows every guideline a machine can check.` } : { ok: true, text: `An improvement of “${s.name}” is waiting in the inbox.` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const keeps = (taste?.weights ?? []).filter((w) => w.lean >= 0.15).slice(0, 8)
  const drops = (taste?.weights ?? []).filter((w) => w.lean <= -0.15).slice(0, 8)
  const prefer = taste?.prefer
  const leaning = (o: Record<string, number> = {}) =>
    Object.entries(o)
      .filter(([, v]) => Math.abs(v - 1) >= 0.15)
      .sort((a, b) => b[1] - a[1])
  return (
    <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <section aria-label="What your decisions taught" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-body font-medium">
              <Brain size={15} aria-hidden className="text-k-motion" />
              What your decisions taught it
            </span>
            <span className="mt-0.5 block text-caption text-fg-3">
              {taste?.decisions ? `From ${taste.decisions} decisions (${taste.approved} approved, ${taste.rejected} turned down). Every proposal is checked against the rules below, and the next run reads all of it.` : "Nothing yet: approve or turn down a few proposals in the inbox (say why when you turn one down), and it learns from each one."}
            </span>
          </span>
          <IconButton size="sm" label="Learn again from the decisions" onClick={onReload}>
            <ArrowsClockwise size={14} />
          </IconButton>
        </div>
        {(keeps.length > 0 || drops.length > 0) && (
          <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
            <div>
              <h4 className="pb-1.5 text-caption font-medium text-fg-3">You keep</h4>
              {keeps.length ? <ul className="space-y-1.5">{keeps.map((w) => <Lean key={w.feature} w={w} />)}</ul> : <p className="text-caption text-fg-3">Nothing decisive yet.</p>}
            </div>
            <div>
              <h4 className="pb-1.5 text-caption font-medium text-fg-3">You turn down</h4>
              {drops.length ? <ul className="space-y-1.5">{drops.map((w) => <Lean key={w.feature} w={w} />)}</ul> : <p className="text-caption text-fg-3">Nothing decisive yet.</p>}
            </div>
          </div>
        )}
        {taste && taste.rules.length > 0 && (
          <div className="mt-4">
            <h4 className="pb-1.5 text-caption font-medium text-fg-3">Rules you taught it · every new film is checked against them</h4>
            <ul className="space-y-2">
              {taste.rules.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="block text-body">{r.label}</span>
                      {/* a reason given again and again, as a line for the taste file (TASTE.md), to paste in */}
                      {r.quotes.length >= 2 && (
                        <button type="button" onClick={() => void navigator.clipboard.writeText(`- **${r.label}** (learned from ${r.quotes.length} verdicts: ${r.quotes.slice(0, 3).map((q) => `“${q}”`).join(", ")})`)} className="press shrink-0 rounded-md px-1.5 py-0.5 text-caption text-fg-3 hover:bg-surface-2 hover:text-fg">
                          Copy as a TASTE.md rule
                        </button>
                      )}
                    </span>
                    {r.quotes.map((q, i) => (
                      <span key={i} className="flex gap-1 text-caption text-fg-3">
                        <Quotes size={12} aria-hidden className="mt-0.5 shrink-0" />
                        {q}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {prefer && (leaning(prefer.shapes).length > 0 || leaning(prefer.carriers).length > 0 || prefer.pace !== 1) && (
          <p className="mt-4 border-t pt-3 text-caption text-fg-2">
            <span className="font-medium text-fg">What the generators do with it. </span>
            {[
              leaning(prefer.carriers).some(([, v]) => v > 1) && `Cuts reach for ${leaning(prefer.carriers).filter(([, v]) => v > 1).map(([k, v]) => `${cutName(k as never).replace(/^an? /, "")} (×${v})`).join(", ")}.`,
              leaning(prefer.carriers).some(([, v]) => v < 1) && `Less of ${leaning(prefer.carriers).filter(([, v]) => v < 1).map(([k, v]) => `${cutName(k as never).replace(/^an? /, "")} (×${v})`).join(", ")}.`,
              leaning(prefer.shapes).length && `The inventor's shapes weighted ${leaning(prefer.shapes).map(([k, v]) => `${k} ×${v}`).join(", ")}.`,
              prefer.pace !== 1 && `Ideas are paced ${prefer.pace > 1 ? "slower" : "faster"} (×${prefer.pace}).`,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        )}
      </section>

      {taste?.reviews && (
        <section aria-label="Your verdicts" className="rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="block text-body font-medium">Your verdicts on rendered films</span>
          <span className="mt-0.5 block text-caption text-fg-3">What you said when you kept a film, or sent it back: kept films weigh most, and what could be better becomes rules.</span>
          <div className="mt-3 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {(["praise", "improve"] as const).map((k) => (
              <div key={k}>
                <h4 className="pb-1.5 text-caption font-medium text-fg-3">{k === "praise" ? "You praise" : "You ask to be better"}</h4>
                <ul className="flex flex-wrap gap-1">
                  {Object.entries(taste.reviews![k])
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <li key={t} className="rounded-full px-2.5 py-0.5 text-micro text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
                        {t} <span className="tabular-nums text-fg-3">{n}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-2 border-t pt-3">
            {taste.reviews.notes.map((n, i) => (
              <li key={i} className="text-caption">
                <span className="font-medium text-fg">{n.kind === "accept" ? "Kept" : "Not yet"}</span>
                <span className="text-fg-3"> · {new Date(n.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                {n.why && <span className="block text-fg-2">Works: {n.why}</span>}
                {n.better && <span className="block text-fg-2">Better: {n.better}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className="flex items-start gap-1.5 text-caption text-fg-2">
          {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
          {msg.text}
          {msg.ok && /inbox/.test(msg.text) && (
            <button type="button" onClick={onInbox} className="press ml-1 font-medium text-fg underline decoration-fg-3 underline-offset-4">
              Open it
            </button>
          )}
        </p>
      )}

      <section aria-label="The generators, checked">
        <div className="flex items-end justify-between gap-2 pb-2">
          <span>
            <h3 className="text-caption font-medium text-fg-3">The inventor's shapes, checked · four films each, read by the critic, the weakest first</h3>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setRound((r) => r + 1)}>
            <ArrowsClockwise size={14} aria-hidden />
            Four new films each
          </Button>
        </div>
        <ul className="divide-y rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
          {health.map((g, i) => (
            <li key={g.shape} className="grid gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] sm:items-center">
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="text-body font-medium">{g.name}</span>
                  {i === 0 && <span className="text-micro font-medium text-warn-ink">the weakest</span>}
                </span>
                <span className="block text-caption text-fg-3">Its weakest film: “{g.worst.name}”, {analyze(g.worst, ctx).score}</span>
              </span>
              <ul className="space-y-1">
                <ScoreRow label="Overall" score={g.score} />
                <ScoreRow label="Flow" score={g.flow} />
                <ScoreRow label="Novelty" score={g.novelty} />
              </ul>
              <span className="flex justify-end gap-1">
                <IconButton size="sm" label={`Preview “${g.worst.name}” in the Studio`} onClick={() => onPreview(g.worst)}>
                  <Play size={14} />
                </IconButton>
                <Button size="sm" disabled={!!busy} onClick={() => void improve(g.worst, !!state?.key, `gen:${g.shape}`)}>
                  {state?.key ? <Sparkle size={14} aria-hidden /> : <Wrench size={14} aria-hidden />}
                  {busy === `gen:${g.shape}` ? "Working…" : "Improve its weakest"}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {reread.length > 0 && (
        <section aria-label="The gallery, re-read">
          <h3 className="pb-2 text-caption font-medium text-fg-3">The gallery, re-read by the critic · the weakest first</h3>
          <ul className="divide-y rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
            {reread.map(({ s, a }) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <span className="block text-body font-medium">{s.name}</span>
                  <span className="block truncate text-caption text-fg-3">{a.fixes[0] ?? a.verdict}</span>
                </span>
                <Score value={a.score} verdict="" />
                <span className="flex gap-1">
                  <IconButton size="sm" label={`Preview “${s.name}” in the Studio`} onClick={() => onPreview(s)}>
                    <Play size={14} />
                  </IconButton>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void improve(s, false, `fix:${s.id}`)}>
                    <Wrench size={14} aria-hidden />
                    {busy === `fix:${s.id}` ? "Fixing…" : "Fix by rules"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
