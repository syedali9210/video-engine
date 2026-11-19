// Feature unfold's colours, worked out here rather than in index.tsx: the build turns every colour a film's index.tsx
// names into a CSS variable (vite.config.ts film-tones), and these are sums on colours, not colours to draw.
// (The ground is a composed field: src/studio/field.ts.)
import { hex, lch } from "../../theme";

export const ACCENT = "#5b5bf7";
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
export const accentOr = (c: string) => (isHex(c) ? c : ACCENT);

/** a colour that reads on the accent: near-black on a light one, white on a dark one */
export const onAccent = (a: string) => (lch(accentOr(a)).l > 0.72 ? "#111114" : "#ffffff");
/** the accent at another lightness (its hue and chroma kept, as far as sRGB lets them) */
export const shade = (a: string, l: number) => hex({ ...lch(accentOr(a)), l });
/** the accent's ink on a tinted chip: dark enough to read on the light panel, light on the dark one */
export const chipInk = (a: string, dark: boolean) => (dark ? shade(a, 0.82) : shade(a, Math.min(0.5, lch(accentOr(a)).l)));

export type Skin = { surface: string; ink: string; muted: string; line: string; soft: string; border: string; blur: boolean };
export const SKINS: Record<string, Skin> = {
  light: { surface: "rgba(255,255,255,0.94)", ink: "#111114", muted: "#6b6b78", line: "rgba(17,17,20,0.08)", soft: "rgba(17,17,20,0.055)", border: "rgba(255,255,255,0.7)", blur: false },
  dark: { surface: "rgba(16,16,20,0.92)", ink: "#f4f4f7", muted: "#9b9ba8", line: "rgba(255,255,255,0.09)", soft: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.08)", blur: false },
  glass: { surface: "rgba(255,255,255,0.2)", ink: "#ffffff", muted: "rgba(255,255,255,0.78)", line: "rgba(255,255,255,0.22)", soft: "rgba(255,255,255,0.16)", border: "rgba(255,255,255,0.45)", blur: true },
};
