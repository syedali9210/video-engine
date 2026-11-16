// Import an animation from its code. Drop the component (and its CSS or helpers) or a page; the engine's server reads it
// and lists what it found worth tuning, each with the line it came from. Nothing is written until "Add to the library".
import { DialogHead } from "./Gloss"
import { useState } from "react";
import { UploadSimple, WarningCircle, FileCode } from "@phosphor-icons/react";
import { field, importer as post } from "./controls";
import { CATEGORIES } from "./registry";
import { Button, Dialog, Select } from "./ui";

type Found = { key: string; label: string; type: string; group: string; value: string | number; unit?: string; setup: boolean; suggested: boolean; line: string };
type Read = { kind: string; name: string; found: Found[]; missing: string[]; mapped: [string, string][]; absent: string[]; problem?: string };
type Dropped = { name: string; code: string };


export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<Dropped[]>([]);
  const [read, setRead] = useState<Read | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UI Patterns");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const take = async (list: File[]) => {
    const code = list.filter((f) => /\.(tsx|jsx|ts|js|mjs|css|html?|json|svg)$/i.test(f.name));
    if (!code.length) return setError("Drop a component (.tsx, .jsx, .js) or a page (.html), with its CSS if it has one.");
    setBusy(true);
    setError("");
    try {
      const dropped = await Promise.all(code.map(async (f) => ({ name: f.name, code: await f.text() })));
      const r: Read = await post("read", { files: dropped });
      setFiles(dropped);
      setRead(r);
      setKeep(new Set(r.found.filter((f) => f.suggested).map((f) => f.key)));
      setName(r.name);
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "The engine's server isn't answering. Run it with npm run dev." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const { id } = await post("add", { files, name, category, keep: [...keep], labels });
      // a new folder in the library: load the page again so it's listed, and open it
      location.hash = id;
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const groups = read ? [...new Set(read.found.map((f) => f.group))] : [];
  return (
    <Dialog open={open} onClose={onClose} label="Import an animation" className="modal">
      <div className="flex max-h-[inherit] flex-col">
        <DialogHead icon={FileCode} tone="var(--k-callout)" title="Import an animation" sub="Its colours, words, timings and sizes become properties you can tune." onClose={onClose} />
        <div className="scroll-thin min-h-0 space-y-3 overflow-y-auto p-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void take([...e.dataTransfer.files]);
            }}
            className={`press flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center ${over ? "border-fg bg-surface-2" : "border-line-strong hover:bg-surface-2"}`}
          >
            <UploadSimple size={22} aria-hidden className="text-fg-2" />
            <span className="text-body font-medium">{busy && !read ? "Reading…" : files.length ? files.map((f) => f.name).join(", ") : "Drop the code, or choose it"}</span>
            <span className="text-caption text-fg-3">A React component (.tsx, .jsx) with its CSS and helpers, or a page (.html)</span>
            <input type="file" multiple accept=".tsx,.jsx,.ts,.js,.mjs,.css,.html,.htm,.json,.svg" className="sr-only" onChange={(e) => void take([...(e.target.files ?? [])])} />
          </label>
          {read && (
            <>
              {[
                read.problem,
                ...read.mapped.map(([a, b]) => `${a} is read as ${b}, the same API, already installed.`),
                ...read.missing.map((m) => `${m} isn't installed: run npm i ${m}, or it won't load.`),
                ...read.absent.map((m) => `It imports ${m}, which wasn't dropped: drop it with the component.`),
              ]
                .filter(Boolean)
                .map((t) => (
                  <p key={t} className="flex items-start gap-1.5 text-caption text-fg-2">
                    <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />
                    {t}
                  </p>
                ))}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={`${field} h-8 px-2.5 text-body`} />
                <Select aria-label="Group" value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} h-8 cursor-pointer px-2 text-body`}>
                  {CATEGORIES.filter((c) => c !== "Launch films" && c !== "Swiggy App").map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <p className="text-caption text-fg-3">
                {read.found.length ? `Found ${read.found.length} values, ${keep.size} ticked. Sizes are left for you to add.` : "It found nothing to tune; it will still run as it is."}
              </p>
              {groups.map((g) => (
                <section key={g} aria-label={g}>
                  <h3 className="pb-1 text-caption font-medium text-fg-3">{g}</h3>
                  <ul className="space-y-1">
                    {read.found
                      .filter((f) => f.group === g)
                      .map((f) => (
                        <li key={f.key} className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                          <input
                            type="checkbox"
                            aria-label={`Make ${f.label} a property`}
                            checked={keep.has(f.key)}
                            onChange={(e) => setKeep((k) => (e.target.checked ? new Set([...k, f.key]) : new Set([...k].filter((x) => x !== f.key))))}
                            className="mt-2 accent-[var(--fg)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <input aria-label={`Label for ${f.key}`} value={labels[f.key] ?? f.label} onChange={(e) => setLabels((l) => ({ ...l, [f.key]: e.target.value }))} className={`${field} h-7 min-w-0 flex-1 px-2 text-body`} />
                              {f.type === "color" && <span aria-hidden className="h-5 w-5 shrink-0 rounded shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: String(f.value) }} />}
                              {f.type !== "color" && <span className="max-w-[40%] shrink-0 truncate text-caption tabular-nums text-fg-2">{String(f.value)}{f.unit && f.type === "number" ? ` ${f.unit}` : ""}</span>}
                            </span>
                            <span className="mono mt-0.5 block truncate text-micro text-fg-3" title={f.line}>
                              {f.setup ? "read at start · " : ""}
                              {f.line}
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-caption text-fg-2">
              <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!read || !!read.problem || busy} onClick={() => void add()}>
            {busy && read ? "Adding…" : "Add to the library"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
