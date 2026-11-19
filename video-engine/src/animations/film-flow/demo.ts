// The flow film's demo (what it plays with no spec): a made-up observability product, "Trace", at the measured pace.
import { SOFT_MORPH, fitted, type Flow } from "../../studio/flow";

export const DEMO: Flow = fitted({
  name: "Trace",
  accent: "#2459f5",
  pace: SOFT_MORPH,
  scenes: [
    { kind: "words", text: "find what breaks", big: true, dur: 2.6, ground: { tone: "field", variant: "diagonal", grain: 0.28 } },
    { kind: "words", text: "before your users do", dur: 1.9, ground: { tone: "field", variant: "diagonal", grain: 0.28 } },
    { kind: "prompt", lead: "using", tail: "Trace", typed: "show me every checkout that failed in the last hour, and why", dur: 3.2, ground: { tone: "field", variant: "diagonal", grain: 0.18 } },
    { kind: "brand", name: "Trace", dur: 2.3, ground: { tone: "white" } },
    { kind: "panel", panel: { title: "What needs your attention", rows: ["Status: Needs review", "Owner: Maya Chen", "Priority: High", "Due: Today, 4:00 PM"], ctas: ["Take action", "Snooze"] }, dur: 5.4, ground: { tone: "dark" } },
    { kind: "app", media: "image:/home/replicate.webp", aspect: 1.5, dur: 4, ground: { tone: "dark" } },
    {
      kind: "cards",
      cards: [
        { by: "Checkout API", handle: "· 2m", lines: ["POST /pay timed out after 30s", "for 214 users in eu-west"] },
        { tag: "Root cause", lines: ["Payment provider's DNS lookups failing", "since the 14:02 deploy"] },
      ],
      dur: 3.4,
      ground: { tone: "dark" },
    },
    {
      kind: "stack",
      cards: [
        { tag: "Fixed", lines: ["Rolled back the 14:02 deploy", "Checkout recovered in 40s"] },
        { tag: "Watching", lines: ["Error rate back under 0.1%"] },
        { tag: "Shared", lines: ["Postmortem drafted for #payments"] },
      ],
      dur: 3.2,
      ground: { tone: "field", variant: "horizon" },
    },
    { kind: "end", lead: "find it", tail: "first", swap: ["using", "Trace"], name: "Trace", dur: 4, ground: { tone: "field", variant: "diagonal", grain: 0.22 } },
  ],
});
