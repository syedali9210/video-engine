// Lab → Settings → Work API: the AI the film work runs on (server/work.ts), on keys of its own. Gemini shows first;
// the backups it moves on to, and the jobs with what they answered lately, fold away.
import { useEffect, useState } from "react"
import { CaretRight, Check, WarningCircle } from "@phosphor-icons/react"
import { field } from "../controls"
import { Button, Segmented, Select } from "../ui"

type Provider = { id: string; name: string; keys?: { url: string; where: string }; needsKey: boolean; key: boolean; keyHint: string; model: string; account?: string; url?: string; ready: boolean; cooling?: number; refused?: string; used: number; tokens: number; cap: number }
type Line = { at: string; job: string; ok: boolean; provider?: string; model?: string; cached?: boolean; ms: number; tokens?: number; tried: { id: string; why: string }[]; error?: string }
type WorkState = { providers: Provider[]; jobs: { id: string; name: string; sees: boolean; chain: string[] }[]; log: Line[] }

async function work<T>(path: string, body?: object): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/__work/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined)
  } catch {
    throw new Error("The Work API runs on the engine's server: start it with npm run dev.")
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `The engine's server said ${r.status}`)
  return j as T
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const until = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
const health = (p: Provider) => (p.refused ? "Key refused" : p.cooling ? `Out of requests until ${until(p.cooling)}` : p.ready ? `Ready · ${p.used} today${p.tokens ? ` · ${k(p.tokens)} tokens` : ""}` : "Not set up")

export function WorkApi({ row }: { row: string }) {
  const [st, setSt] = useState<WorkState | null>(null)
  const [error, setError] = useState("")
  const [open, setOpen] = useState({ backups: false, jobs: false })
  useEffect(() => {
    void work<WorkState>("state").then(setSt, (e: Error) => setError(e.message))
  }, [])
  if (!st) return error ? <p className="py-3.5 text-caption text-fg-3">{error}</p> : null
  const gemini = st.providers.find((p) => p.id === "gemini")!
  const backups = st.providers.filter((p) => p.id !== "gemini")
  const name = (id: string) => st.providers.find((p) => p.id === id)?.name ?? id
  const fold = (id: keyof typeof open, title: string, aside: string) => (
    <button type="button" aria-expanded={open[id]} onClick={() => setOpen({ ...open, [id]: !open[id] })} className="press group flex w-full items-center gap-2 py-3.5 text-left">
      <CaretRight size={11} weight="bold" aria-hidden className={`shrink-0 text-fg-3 transition-transform duration-150 ease-out group-hover:text-fg ${open[id] ? "rotate-90" : ""}`} />
      <span className="text-body font-medium">{title}</span>
      <span className="text-caption text-fg-3">{aside}</span>
    </button>
  )
  return (
    <>
      <div className="pb-3.5 pt-4">
        <h2 className="text-body font-semibold">Work API</h2>
        <p className="mt-0.5 max-w-[60ch] text-caption text-fg-3">The AI the film work runs on: reading what you drop in, planning films, the critic, the words. Its own key, apart from the Lab's below. When Gemini is out of requests or down, the work moves on to the backups that are set up.</p>
      </div>
      <ProviderRow p={gemini} row={row} set={setSt} />
      <div className={row}>
        <span>
          <span className="block text-body font-medium" id="work-cap-label">
            Gemini requests a day
          </span>
          <span className="block text-caption text-fg-3">{gemini.used} used today</span>
        </span>
        <span className="min-w-0">
          <Segmented size="sm" labelledBy="work-cap-label" value={gemini.cap} onChange={(v) => void work<WorkState>("settings", { provider: "gemini", cap: v }).then(setSt)} options={[50, 200, 1000, 0].map((n) => ({ value: n, label: n ? String(n) : "No cap" }))} />
          <span className="mt-1.5 block text-caption text-fg-3">A guard against a runaway loop on a billed key; past it, the work goes to the backups. Set the money limit itself as a budget alert in Google Cloud billing.</span>
        </span>
      </div>
      <div>
        {fold("backups", "Backups", `${backups.filter((p) => p.ready).length} of ${backups.length} set up`)}
        {open.backups && (
          <div className="rise-in divide-y border-t pl-5">
            {backups.map((p) => (
              <ProviderRow key={p.id} p={p} row={row} set={setSt} />
            ))}
          </div>
        )}
      </div>
      <div>
        {fold("jobs", "Jobs and recent answers", st.log.length ? `last ${new Date(st.log[0].at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : "nothing asked yet")}
        {open.jobs && (
          <div className="rise-in space-y-4 border-t pb-4 pl-5 pt-3.5">
            <ul className="space-y-1.5">
              {st.jobs.map((j) => (
                <li key={j.id} className="grid gap-x-6 text-caption sm:grid-cols-[180px_1fr]">
                  <span className="text-body text-fg">
                    {j.name}
                    {j.sees && <span className="ml-1.5 text-caption text-fg-3">sees pictures</span>}
                  </span>
                  <span className="text-fg-3">{j.chain.map(name).join(" → ")}</span>
                </li>
              ))}
            </ul>
            {st.log.length > 0 && (
              <ul className="space-y-1.5 border-t pt-3.5">
                {st.log.map((l, i) => (
                  <li key={i} className="text-caption text-fg-3">
                    <span className="text-fg-2">{st.jobs.find((j) => j.id === l.job)?.name ?? l.job}</span>
                    {" · "}
                    {l.ok ? (l.cached ? `the same question as before: answered from the cache` : `${name(l.provider!)} (${l.model}) in ${(l.ms / 1000).toFixed(1)} s${l.tokens ? `, ${k(l.tokens)} tokens` : ""}`) : `no answer: ${l.error}`}
                    {l.ok && l.tried.length > 0 && <span className="block">Passed over: {l.tried.map((t) => `${name(t.id)} (${t.why})`).join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** One provider: its key (named, with where to get it), what else its address needs, its model from its own list,
    and a test. */
function ProviderRow({ p, row, set }: { p: Provider; row: string; set: (s: WorkState) => void }) {
  const [key, setKey] = useState("")
  const [extra, setExtra] = useState(p.account ?? p.url ?? "")
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const listable = (p.needsKey ? p.key : true) && (p.id !== "cloudflare" || !!p.account)
  useEffect(() => {
    if (!listable) {
      setModels([])
      return
    }
    work<string[]>(`models?p=${p.id}`).then(setModels, (e: Error) => {
      setModels([])
      setMsg({ ok: false, text: p.id === "ollama" ? `Ollama isn't answering at ${p.url}: start it (ollama serve), or set its address.` : e.message })
    })
  }, [p.id, p.key, p.url, p.account, listable])
  const save = async (patch: object, what: string) => {
    setBusy(what)
    setMsg(null)
    try {
      set(await work<WorkState>("settings", { provider: p.id, ...patch }))
      return true
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return false
    } finally {
      setBusy("")
    }
  }
  const saveKey = () => key.trim() && void save({ key: key.trim() }, "key").then((ok) => ok && setKey(""))
  const saveExtra = () => extra.trim() !== (p.account ?? p.url ?? "") && void save(p.id === "cloudflare" ? { account: extra } : { url: extra }, "extra")
  const test = async () => {
    setBusy("test")
    setMsg(null)
    try {
      const r = await work<{ ok: boolean; model?: string; ms?: number; reply?: string; error?: string; state?: WorkState }>("test", { provider: p.id })
      if (r.state) set(r.state)
      setMsg(r.ok ? { ok: true, text: `${r.model} answered in ${((r.ms ?? 0) / 1000).toFixed(1)} s: “${r.reply}”` } : { ok: false, text: r.error ?? "No answer." })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy("")
    }
  }
  const options = [...new Set([p.model, ...models].filter(Boolean))]
  const id = `work-${p.id}`
  return (
    <div className={row}>
      <span>
        <span className="block text-body font-medium" id={`${id}-label`}>
          {p.name}
        </span>
        {p.keys && (
          <a href={p.keys.url} target="_blank" rel="noreferrer" className="block text-caption text-fg-3 underline decoration-fg-3/50 underline-offset-4 hover:text-fg">
            {p.keys.where} → Get {p.id === "cloudflare" ? "API token" : "API key"}
          </a>
        )}
        <span className={`block text-caption ${p.refused || p.cooling ? "text-warn-ink" : "text-fg-3"}`}>{health(p)}</span>
      </span>
      <span className="min-w-0 space-y-2">
        {p.needsKey && (
          <span className="block">
            <span className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-label={`${p.name} ${p.id === "cloudflare" ? "API token" : "API key"}`}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
                placeholder={p.key ? `Set (${p.keyHint}). Paste a new one to replace it` : `Paste your ${p.id === "cloudflare" ? "token" : "key"}`}
                className={`${field} mono h-8 min-w-0 flex-1 px-2.5 text-body`}
              />
              <Button disabled={!key.trim() || busy === "key"} onClick={saveKey}>
                {busy === "key" ? "Saving…" : "Save"}
              </Button>
            </span>
            {p.key && (
              <span className="mt-1 block text-caption text-fg-3">
                Kept in .env.local on this machine; the page never sees it.
                <button type="button" onClick={() => void save({ key: "" }, "key")} className="press ml-1.5 font-medium text-fg-2 underline decoration-fg-3 underline-offset-4">
                  Remove it
                </button>
              </span>
            )}
          </span>
        )}
        {(p.id === "cloudflare" || p.id === "ollama") && (
          <input
            spellCheck={false}
            aria-label={p.id === "cloudflare" ? "Cloudflare account ID" : "Ollama's address"}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onBlur={saveExtra}
            onKeyDown={(e) => e.key === "Enter" && saveExtra()}
            placeholder={p.id === "cloudflare" ? "Account ID (the dashboard's Account home)" : "http://localhost:11434/v1"}
            className={`${field} mono h-8 w-full px-2.5 text-body`}
          />
        )}
        <span className="flex gap-2">
          {/* a list, not a text box: the provider's own models once it can be asked */}
          <Select aria-label={`${p.name} model`} disabled={!options.length} value={p.model} onChange={(e) => void save({ model: e.target.value }, "model")} className={`${field} mono h-8 min-w-0 flex-1 cursor-pointer px-2 text-body`}>
            {options.length ? (
              options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            ) : (
              <option value="">{p.needsKey && !p.key ? "Add the key to list its models" : p.id === "cloudflare" ? "Add the account ID" : "No models found"}</option>
            )}
          </Select>
          <Button disabled={!p.ready || !!busy} onClick={() => void test()}>
            {busy === "test" ? "Testing…" : "Test"}
          </Button>
        </span>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className="flex items-start gap-1.5 text-caption text-fg-2">
            {msg.ok ? <Check size={14} aria-hidden className="mt-px shrink-0" /> : <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />}
            {msg.text}
          </p>
        )}
        {p.refused && !msg && <p className="text-caption text-fg-3">{p.refused}</p>}
      </span>
    </div>
  )
}
