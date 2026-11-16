// Studio — a film for the web: the composition and every screen in it, resolved, as JSON. Packed (deflated, base64url)
// it rides in the player's link, so an embed needs nothing hosted but the engine; or it's a file the player fetches.
// The Interactive section's settings ride along: the embed's shape at each width, and how it plays.
import type { Comp } from "./comp"
import type { RenderConfig } from "./config"

export type WebFilm = { v: 1; name: string; comp: Comp; screens: RenderConfig["screens"]; components: RenderConfig["components"]; dark: boolean }

/** How a film behaves on a site: the embed's shape on a laptop (from 1024 px), a tablet or an open Duo (744–1023 px)
    and a phone or a folded Duo (below), whether it loops or plays with the scroll, how far the device leans toward
    the pointer (0–1), and whether a click or Space pauses it. */
export type WebOpts = { shapes: [string, string, string]; play: "loop" | "scroll"; lean: number; pause: boolean }
export const WEB_DEFAULTS: WebOpts = { shapes: ["16x9", "4x3", "4x5"], play: "loop", lean: 1, pause: true }

const b64url = (bytes: Uint8Array) => {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function pack(film: WebFilm) {
  const z = new Blob([JSON.stringify(film)]).stream().pipeThrough(new CompressionStream("deflate-raw"))
  return b64url(new Uint8Array(await new Response(z).arrayBuffer()))
}

export async function unpack(z: string): Promise<WebFilm> {
  const bytes = Uint8Array.from(atob(z.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text())
}

/** The settings as the player's link carries them, after the film. */
export const optsQuery = (o: WebOpts) => new URLSearchParams({ shape: o.shapes.join(","), play: o.play, lean: String(o.lean), pause: o.pause ? "1" : "0" }).toString()
export const playerLink = (origin: string, z: string, o: WebOpts) => `${origin.trim().replace(/\/+$/, "")}/play.html#z=${z}&${optsQuery(o)}`

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** The embed: the film's frame, and the script that fits it to every screen and drives scroll-to-play. Without the
    script the frame still shows, at the laptop's shape. */
export function embedCode(origin: string, z: string, o: WebOpts, title: string) {
  const [w, h] = o.shapes[0].split("x")
  // its link in data-src: embed.js loads it as it comes near the screen, a few films at a time on a page of many
  return `<iframe class="engine-film" data-src="${attr(playerLink(origin, z, o))}" title="${attr(title)}" allow="autoplay" style="display:block;width:100%;aspect-ratio:${w} / ${h};border:0"></iframe>
<script src="${attr(origin.trim().replace(/\/+$/, ""))}/embed.js" defer></script>`
}
