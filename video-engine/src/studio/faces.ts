// Faces a film's titles and words can be set in: a curated set from Google Fonts, each with the weights it really has
// (asking Google for a weight a face doesn't have fails the whole stylesheet), loaded by the Studio and the export
// from the film's brand. Pure.
export type Face = { name: string; kind: "sans" | "display" | "serif"; axis: string; hint: string }
export const FACES: Face[] = [
  { name: "Geist", kind: "sans", axis: "wght@100..900", hint: "The engine's own: neutral, exact, modern." },
  { name: "Inter Tight", kind: "sans", axis: "wght@100..900", hint: "Inter set tight for headlines: product-grade, quiet." },
  { name: "Manrope", kind: "sans", axis: "wght@200..800", hint: "Round, open, friendly: a consumer app's voice." },
  { name: "Space Grotesk", kind: "display", axis: "wght@300..700", hint: "Quirky grotesk: tech with a personality." },
  { name: "Sora", kind: "display", axis: "wght@100..800", hint: "Geometric and wide: Web3, fintech, bold launches." },
  { name: "Syne", kind: "display", axis: "wght@400..800", hint: "Art-school wide display: loud, creative." },
  { name: "Unbounded", kind: "display", axis: "wght@200..900", hint: "Rounded and wide: playful, big type films." },
  { name: "Outfit", kind: "sans", axis: "wght@100..900", hint: "Clean geometric: calm SaaS." },
  { name: "Instrument Serif", kind: "serif", axis: "ital@0;1", hint: "Editorial serif: slow, premium, considered." },
  { name: "Fraunces", kind: "serif", axis: "opsz,wght@9..144,100..900", hint: "A soft old-style serif with character." },
  { name: "Playfair Display", kind: "serif", axis: "wght@400..900", hint: "High-contrast serif: fashion, luxury." },
  { name: "DM Serif Display", kind: "serif", axis: "ital@0;1", hint: "A punchy display serif: magazine covers." },
]
/** Google Fonts' stylesheet for faces by name (only the curated ones: anything else isn't asked for). */
export function fontsUrl(names: (string | undefined)[]) {
  const faces = [...new Set(names)].map((n) => FACES.find((f) => f.name === n)).filter((f): f is Face => !!f && f.name !== "Geist")
  return faces.length ? `https://fonts.googleapis.com/css2?${faces.map((f) => `family=${f.name.replace(/ /g, "+")}:${f.axis}`).join("&")}&display=swap` : ""
}
/** Loads faces into this page (once each), for what draws them in the app: previews, thumbnails, the editor. */
export function loadFaces(names: (string | undefined)[]) {
  const href = fontsUrl(names)
  if (href && typeof document !== "undefined" && ![...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => l.href === href)) document.head.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href }))
}
