// Studio — your verdict on a film: keep it or not yet, what works and what could be better, in tags and in your own
// words. It's kept with the film's features (taste.ts): a film you keep teaches more than one you only exported, what
// you praise is weighed up, and your "could be better" notes become rules every new film is checked against. The
// lab's Learning tab lists every review.
import { useState } from "react"
import { Check, ChatCircleText, WarningCircle } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, Segmented } from "../ui"
import type { Comp } from "./comp"
import { toScript } from "./script"

export const REVIEW_TAGS = ["Hook", "Story", "Pacing", "Cuts", "Type", "Gradients", "Colour", "Device shots", "Interface shots", "Motion", "Ending"] as const

function Tags({ label, value, set }: { label: string; value: string[]; set: (fn: (v: string[]) => string[]) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {REVIEW_TAGS.map((t) => {
        const on = value.includes(t)
        return (
          <button key={t} type="button" aria-pressed={on} onClick={() => set((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))} className={`press h-6 rounded-full px-2.5 text-micro font-medium ${on ? "bg-fg text-surface" : "text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg"}`}>
            {t}
          </button>
        )
      })}
    </div>
  )
}

export function FilmReview({ comp, done }: { comp: Comp; /** a render just finished: say so */ done?: boolean }) {
  const [open, setOpen] = useState(!!done)
  const [verdict, setVerdict] = useState<"accept" | "rework">("accept")
  const [praise, setPraise] = useState<string[]>([])
  const [improve, setImprove] = useState<string[]>([])
  const [why, setWhy] = useState("")
  const [better, setBetter] = useState("")
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const save = async () => {
    setState("saving")
    try {
      const r = await fetch("/__lab/signal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: verdict, script: toScript(comp, { id: "reviewed", name: comp.brand?.name ? `${comp.brand.name} film` : "A film" }), praise, improve, why: why.trim() || undefined, note: better.trim() || undefined }) })
      if (!r.ok) throw new Error(String(r.status))
      setState("saved")
    } catch {
      setState("error")
    }
  }
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="press mt-3 flex w-full items-center gap-2 rounded-md border-t pt-3 text-left text-caption text-fg-2 hover:text-fg">
        <ChatCircleText size={15} aria-hidden className="shrink-0 text-k-motion" />
        <span className="flex-1">Your verdict: why you'd keep it, what could be better</span>
        <span aria-hidden>→</span>
      </button>
    )
  if (state === "saved")
    return (
      <p role="status" className="mt-3 flex items-start gap-1.5 border-t pt-3 text-caption text-fg-2">
        <Check size={14} aria-hidden className="mt-px shrink-0" />
        Kept with the film. The next films learn from it: Template lab → Learning shows what it took.
      </p>
    )
  return (
    <section aria-label="Your verdict on this film" className="mt-3 space-y-2.5 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body font-medium">{done ? "Rendered. Your verdict?" : "Your verdict"}</span>
        <Segmented
          size="sm"
          label="Verdict"
          value={verdict}
          onChange={setVerdict}
          options={[
            { value: "accept", label: "Keep it" },
            { value: "rework", label: "Not yet" },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <span className="block text-caption text-fg-3">{verdict === "accept" ? "Why it works" : "What does work"}</span>
        <Tags label="What works" value={praise} set={setPraise} />
        <textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="In your words: the hook lands, the gradients feel premium…" aria-label="Why it works, in your words" className={`${field} w-full resize-none px-2.5 py-2 text-body`} />
      </div>
      <div className="space-y-1.5">
        <span className="block text-caption text-fg-3">What could be better</span>
        <Tags label="What could be better" value={improve} set={setImprove} />
        <textarea rows={2} value={better} onChange={(e) => setBetter(e.target.value)} placeholder="Too much text in the middle; the cuts into the cards feel abrupt…" aria-label="What could be better, in your words" className={`${field} w-full resize-none px-2.5 py-2 text-body`} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {state === "error" && (
          <span role="alert" className="mr-auto flex items-center gap-1 text-caption text-fg-2">
            <WarningCircle size={14} aria-hidden className="text-bad-ink" />
            The lab didn't answer: is the engine's server running?
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Later
        </Button>
        <Button size="sm" variant="primary" disabled={state === "saving" || (!praise.length && !improve.length && !why.trim() && !better.trim())} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : "Save the verdict"}
        </Button>
      </div>
    </section>
  )
}
