// The website check: a web address, on every device at its own screen size. The panel says how the page is loaded and
// why, and which breakpoint each device lands on.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowSquareOut, ArrowRight, CaretRight, Globe, WarningCircle } from "@phosphor-icons/react";
import { DEVICES, breakpoint, viewport, type Posture } from "./devices";
import { field } from "./controls";
import { Segmented } from "./ui";

export type SiteHow = "auto" | "direct" | "engine";
export type SiteCheck = { state: "checking" } | { state: "error"; message: string } | { state: "ok"; url: string; status: number; frameable: boolean; why: string; title: string };

/** "example.com" → "https://example.com/", "localhost:3000" → "http://localhost:3000/"; null when it can't be one. */
export function webAddress(input: string) {
  const s = input.trim();
  if (!s) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost)(:\d+)?(\/|$)/i.test(s);
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : `${local ? "http" : "https"}://${s}`);
    // a single word ("hello") is a typo, not a site, unless it's this machine
    return /^https?:$/.test(u.protocol) && (u.hostname.includes(".") || /localhost$/i.test(u.hostname) || u.hostname.startsWith("[")) ? u.href : null;
  } catch {
    return null;
  }
}
export const isLocal = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)(:\d+)?\//i.test(u);
export const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

/** One field and a button: type an address, Enter opens it everywhere. */
export function AddressForm({ url, onOpen, autoFocus, big }: { url: string; onOpen: (u: string) => void; autoFocus?: boolean; big?: boolean }) {
  const [draft, setDraft] = useState(url);
  const [error, setError] = useState("");
  useEffect(() => setDraft(url), [url]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const u = webAddress(draft);
        if (!u) return setError("Enter a web address, like example.com or localhost:3000");
        setError("");
        onOpen(u);
      }}
    >
      <label htmlFor="site-url" className="sr-only">
        Web address
      </label>
      <div className="flex gap-1.5">
        <input
          ref={input}
          id="site-url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="example.com"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "site-url-error" : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${field} min-w-0 flex-1 px-2.5 text-body ${big ? "h-11 text-[16px]" : "h-8"}`}
        />
        <button type="submit" className={`press grid shrink-0 place-items-center rounded-md bg-fg text-surface ${big ? "h-11 w-11" : "h-8 w-8"}`} aria-label="Open on every device">
          <ArrowRight size={big ? 18 : 15} weight="bold" aria-hidden />
        </button>
      </div>
      {error && (
        <p id="site-url-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-caption text-fg-2">
          <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />
          {error}
        </p>
      )}
    </form>
  );
}

const HOW: { value: SiteHow; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "direct", label: "Direct" },
  { value: "engine", label: "Through the engine" },
];

export function SitePanel({
  url,
  onOpen,
  how,
  setHow,
  check,
  viaEngine,
  recent,
  landscape,
  posture,
  canProxy,
}: {
  url: string;
  onOpen: (u: string) => void;
  how: SiteHow;
  setHow: (h: SiteHow) => void;
  check: SiteCheck | null;
  viaEngine: boolean;
  recent: string[];
  landscape: boolean;
  posture: Posture;
  /** the engine is on localhost, so each device can have a stand-in site of its own */
  canProxy: boolean;
}) {
  const why =
    !url || !check
      ? ""
      : check.state === "checking"
        ? "Checking how the site may be shown…"
        : check.state === "error"
          ? check.message
          : viaEngine
            ? how === "engine"
              ? "Through the engine: each device gets its own user agent, the frame rate shows, and a link clicked on one device opens on all of them."
              : `${hostOf(check.url)} refuses to be shown in a frame (${check.why}), so it comes through the engine. Sign-ins and site data don't carry over.`
            : !canProxy && (how === "engine" || !check.frameable)
              ? `${check.frameable ? "Through the engine" : `${hostOf(check.url)} refuses to be shown in a frame (${check.why}). Seeing it anyway`} needs the engine opened at localhost, where each device gets a site of its own.`
              : isLocal(url)
                ? "Your own dev server, loaded as it is."
                : "Loaded as a browser loads it, with nothing in between.";
  return (
    <>
      <Section title="Web address" aside={check?.state === "ok" && check.status >= 400 ? `HTTP ${check.status}` : undefined}>
        <AddressForm url={url} onOpen={onOpen} autoFocus={!url} />
        {check?.state === "ok" && check.title && <p className="mt-2 truncate text-caption text-fg-2">{check.title}</p>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="press mt-1.5 inline-flex items-center gap-1 text-caption font-medium text-fg-2 underline decoration-fg-3 underline-offset-4 hover:text-fg"
          >
            Open in a new tab <ArrowSquareOut size={12} aria-hidden />
          </a>
        )}
        <Hint>Each device shows it at its own screen size. Press 5 to see all four side by side; rotate and fold them from the dock.</Hint>
      </Section>
      <Section title="How it loads">
        <Segmented full size="sm" label="How the page loads" value={how} onChange={setHow} options={HOW} />
        {why && (
          <p role={check?.state === "error" ? "alert" : undefined} className="mt-2 text-caption text-fg-3">
            {why}
          </p>
        )}
      </Section>
      <Section title="Breakpoints" aside={landscape ? "landscape" : "portrait"}>
        <table className="w-full text-caption">
          <caption className="sr-only">The viewport each device gives the page, and the Tailwind breakpoint it lands on</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Viewport</th>
              <th scope="col">Breakpoint</th>
            </tr>
          </thead>
          <tbody>
            {DEVICES.map((d) => {
              const v = viewport(d, landscape, posture);
              return (
                <tr key={d.id} className="border-b last:border-b-0">
                  <th scope="row" className="py-1.5 text-left font-normal text-fg-2">
                    {d.short}
                    {d.fold ? ` · ${posture === "folded" ? "cover" : posture === "half" ? "half open" : "open"}` : ""}
                  </th>
                  <td className="py-1.5 text-right tabular-nums text-fg-2">
                    {v.w}×{v.h}
                  </td>
                  <td className="w-12 py-1.5 text-right font-medium text-fg">{breakpoint(v.w)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      {recent.length > 0 && (
        <Section title="Recent">
          <ul className="-mx-1.5">
            {recent.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => onOpen(r)}
                  aria-current={r === url || undefined}
                  className={`press flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-body ${r === url ? "bg-surface-2 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
                >
                  <Globe size={14} aria-hidden className="shrink-0 text-fg-3" />
                  <span className="truncate">{r.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

/* ---------------- a folding section and a hint (the panel's own) ---------------- */

const Hint = ({ children }: { children: ReactNode }) => <p className="hint mt-1.5 text-caption text-fg-3">{children}</p>

const FOLDS = "anim-engine:folds"
const folds: Record<string, boolean> = (() => {
  try {
    return JSON.parse(localStorage.getItem(FOLDS) ?? "{}")
  } catch {
    return {}
  }
})()

/** A titled group of settings that folds. `fold`: closed until it's opened (what fewer people need); the title opens
    and closes it, and it's remembered. */
function Section({ title, aside, children, fold = false }: { title: string; aside?: ReactNode; children: ReactNode; fold?: boolean }) {
  const [open, setOpen] = useState(() => folds[title] ?? !fold)
  const toggle = () => {
    folds[title] = !open
    setOpen(!open)
    try {
      localStorage.setItem(FOLDS, JSON.stringify(folds))
    } catch {
      // private window: it just isn't remembered
    }
  }
  return (
    <section aria-label={title} className="break-inside-avoid border-b border-line px-4 last:border-b-0 [.cols_&]:border-b-0">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} onClick={toggle} className="press group -ml-1 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-body font-semibold text-fg">
            <CaretRight size={11} weight="bold" aria-hidden className={`shrink-0 text-fg-3 transition-transform duration-150 ease-out group-hover:text-fg ${open ? "rotate-90" : ""}`} />
            <span className="truncate">{title}</span>
          </button>
        </h3>
        {aside && <span className="flex shrink-0 items-center text-caption text-fg-3">{aside}</span>}
      </div>
      {open && <div className="rise-in space-y-1.5 pb-4">{children}</div>}
    </section>
  )
}
