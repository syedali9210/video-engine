// Errors in plain words: any error the engine meets (its server, the network, the AI's key, demand, allowance or
// patience), with the step that helps. Plain data: `npm run check` runs it; States.tsx draws it.

export type Trouble = {
  kind: "offline" | "server" | "ai-key" | "ai-busy" | "ai-quota" | "timeout" | "unknown"
  title: string
  detail: string
  /** what helps: trying again, the AI's settings, or both */
  retry: boolean
  settings: boolean
}

/** Any error the engine meets, in plain words with the step that helps. Plain data: `npm run check` runs it. */
export function explain(e: unknown, online = typeof navigator === "undefined" || navigator.onLine): Trouble {
  const msg = (e instanceof Error ? e.message : typeof e === "string" ? e : "").trim()
  const has = (re: RegExp) => re.test(msg)
  if (!online) return { kind: "offline", title: "You're offline", detail: "The AI needs the internet. Everything else keeps working; try again once you're back.", retry: true, settings: false }
  if (has(/failed to fetch|networkerror|load failed|npm run dev|server isn't answering|ECONNREFUSED/i))
    return { kind: "server", title: "The engine's server isn't answering", detail: "Start it with npm run dev in the project's folder, then try again.", retry: true, settings: false }
  if (has(/isn't set up|add (its|a|the) (gemini )?key|needs the work api|no key|api key/i))
    return { kind: "ai-key", title: "The AI isn't set up yet", detail: import.meta.env?.DEV === false ? "The AI runs when the engine runs on your own machine, with your key." : "Add a Gemini key in Lab → Settings → Work API. It stays on this machine.", retry: false, settings: true }
  if (has(/free tier|used up|quota|429|requests a day|out of requests/i))
    return { kind: "ai-quota", title: "Out of AI requests for now", detail: msg.replace(/^No provider could answer\.\s*/i, "") || "Today's allowance on this model is used up. Pick another model in Settings, or wait.", retry: false, settings: true }
  if (has(/busy|503|high demand|overloaded|unavailable/i))
    return { kind: "ai-busy", title: "The AI is busy right now", detail: "Google's servers are under heavy demand. It usually passes in a minute.", retry: true, settings: false }
  if (has(/in time|timed? ?out|aborted/i))
    return { kind: "timeout", title: "The AI took too long", detail: "Try again, or pick a lighter model in Lab → Settings.", retry: true, settings: true }
  return { kind: "unknown", title: "Something went wrong", detail: msg || "The engine couldn't finish that.", retry: true, settings: false }
}
