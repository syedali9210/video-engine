// Studio — the film on a site (from Export): the film in the Studio as a page that plays by itself on a site, a portfolio
// or a landing page. Here are its settings (the embed's shape at each width, how it plays, how it answers the pointer)
// and the code that puts it on a site; embed.js sizes it per breakpoint there.
import { useState } from "react"
import { ArrowSquareOut, Copy as CopyIcon, DownloadSimple } from "@phosphor-icons/react"
import { SliderField, field } from "../controls"
import { Button, Segmented, Switch, Select } from "../ui"
import { Hint } from "./Layers"
import { Row, Section } from "./Studio"
import { embedCode, playerLink, type WebFilm, type WebOpts } from "./web"

const SHAPES: [string, string][] = [
  ["16x9", "16:9"],
  ["3x2", "3:2"],
  ["4x3", "4:3"],
  ["1x1", "1:1"],
  ["4x5", "4:5"],
  ["9x16", "9:16"],
]
const SCREENS: [string, string][] = [
  ["Laptop", "Mac · from 1024 px"],
  ["Tablet", "iPad, Duo open · 744–1023 px"],
  ["Phone", "iPhone, Duo folded · under 744 px"],
]

export function InteractivePanel({ opts, setOpts, film, z }: { opts: WebOpts; setOpts: (o: WebOpts) => void; film: WebFilm | null; z: string }) {
  // where the engine is deployed: the film plays from there on a site (remembered, it's the same every time)
  const [origin, setOrigin] = useState(() => {
    try {
      return localStorage.getItem("anim-engine:player") || location.origin
    } catch {
      return location.origin
    }
  })
  const [copied, setCopied] = useState(false)
  const set = (patch: Partial<WebOpts>) => {
    setCopied(false)
    setOpts({ ...opts, ...patch })
  }
  const code = z && film ? embedCode(origin, z, opts, `${film.name} film`) : ""
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin.trim())
  const media = !!film && JSON.stringify(film).includes("/__studio/media/")
  const save = () => {
    if (!film) return
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(film)], { type: "application/json" })), download: `${film.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "film"}.json` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <div>
      <Section title="Shape on each screen" aside="automatic">
        <div className="space-y-1">
          {SCREENS.map(([name, note], i) => (
            <div key={name} className="flex min-h-9 items-center justify-between gap-3">
              <label htmlFor={`web-shape-${i}`} className="min-w-0">
                <span className="block text-body text-fg-2">{name}</span>
                <span className="block truncate text-micro text-fg-3">{note}</span>
              </label>
              <Select
                id={`web-shape-${i}`}
                value={opts.shapes[i]}
                onChange={(e) => set({ shapes: opts.shapes.map((x, j) => (j === i ? e.target.value : x)) as WebOpts["shapes"] })}
                className={`${field} h-7 w-[92px] shrink-0 cursor-pointer px-2 text-body`}
              >
                {SHAPES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
        <Hint>The embed takes the shape for the page's width by itself, and the film reflows to it. Open shows it: resize the window.</Hint>
      </Section>

      <Section title="How it plays">
        <Segmented<WebOpts["play"]>
          full
          label="How it plays"
          value={opts.play}
          onChange={(play) => set({ play })}
          options={[
            { value: "loop", label: "By itself" },
            { value: "scroll", label: "With the scroll" },
          ]}
        />
        <Hint>{opts.play === "scroll" ? "It scrubs as it crosses the screen, start to end. Open it to try it." : "It loops, and rests while it's off screen."}</Hint>
      </Section>

      <Section title="Pointer">
        <SliderField id="web-lean" label="Lean toward it" unit="%" min={0} max={100} step={5} value={Math.round(opts.lean * 100)} def={100} set={(v) => set({ lean: v / 100 })} hint="The device turns a few degrees toward the pointer, on a spring." />
        <Row label="A click or Space pauses" htmlFor="web-pause">
          <Switch id="web-pause" on={opts.pause} onChange={(pause) => set({ pause })} />
        </Row>
      </Section>

      <Section title="Embed">
        <label htmlFor="web-origin" className="block pb-1 text-caption text-fg-2">
          Plays from
        </label>
        <input
          id="web-origin"
          value={origin}
          spellCheck={false}
          onChange={(e) => {
            setOrigin(e.target.value)
            setCopied(false)
          }}
          onBlur={() => {
            try {
              localStorage.setItem("anim-engine:player", origin.trim())
            } catch {
              /* private mode */
            }
          }}
          className={`${field} mono h-7 w-full px-2 text-caption`}
        />
        {local && <Hint>That's this machine: the film plays while the engine runs. On a site, put the address the engine is deployed at.</Hint>}
        <label htmlFor="web-code" className="block pb-1 pt-3 text-caption text-fg-2">
          Code for the page
        </label>
        <textarea id="web-code" readOnly rows={5} value={code} placeholder="Packing the film…" onFocus={(e) => e.currentTarget.select()} className={`${field} mono block w-full resize-none px-2 py-1.5 text-micro`} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" disabled={!code} onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}>
            <CopyIcon size={14} aria-hidden />
            {copied ? "Copied" : "Copy the code"}
          </Button>
          <Button size="sm" disabled={!z} onClick={() => window.open(playerLink(origin, z, opts), "_blank", "noopener")}>
            <ArrowSquareOut size={14} aria-hidden />
            Open
          </Button>
          <Button size="sm" variant="ghost" disabled={!film} onClick={save}>
            <DownloadSimple size={14} aria-hidden />
            JSON
          </Button>
        </div>
        <Hint>
          Paste it where the film goes: the frame and one script that sizes it on every screen{opts.play === "scroll" ? ", plays it with the scroll" : ""} and loads it as it comes near, so a page of many films opens as fast as one. To host the film yourself, save its JSON and use play.html?src= its address.
          {media ? " A picture or video you dropped stays on this machine: it isn't in the web film." : ""}
        </Hint>
      </Section>
    </div>
  )
}
