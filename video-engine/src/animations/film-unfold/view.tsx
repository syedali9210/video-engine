// Feature unfold (view): a product's panel built in front of the viewer, the way a feature is shown when it is a panel in the
// product's code (the director casts it: src/studio/panels.ts finds the panel, screenplay.ts films it). With `src` it
// is the product's own panel, exactly: captured from the running app (public/panel-capture.js freezes it, every
// element's look inlined, its title, property rows and buttons marked); without, it's drawn from the panel's words.
// 6.4 s, one clock, so the stepped export renders it exactly:
//   0.05  a blob lands (a circle, overshooting) where the title starts
//   0.55  it stretches into a pill hugging the title as the title is typed; the camera rides along with its edge
//   ~1.8  a beat's hold (the caret waits)
//   2.2   the pill drops open: it widens to the panel and its bottom edge falls; each property arrives as the edge
//         passes it; the camera follows the edge down
//   3.4   it keeps falling into the buttons' row; the camera with it; each button forms as the title did: a blob that
//         stretches into its pill
//   4.25  a hand comes in and presses the main button
//   5.05  the camera pulls back to the whole panel, and holds
// The camera looks at the panel from an angle (`angle`, held all through), follows the container's moving edge with a
// little lag (a weighted average of where it wanted to be over the last quarter second: pure in t) and leans a few
// degrees more the way it's moving. A soft depth of field: what's far from where it looks goes a little out of focus,
// and the frame's top and bottom edges soften (`blur`). The ground is a composed field of the brand's colour, with
// this scene's own grain (`grain`).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { composedField, type Composition } from "../../studio/field";
import { FieldView } from "../_film/field";
import { Cursor, Stage, alpha, back, blink, clamp, expo, glide, inOut, lerp, measure, out, seg, useClock, useFonts } from "../_film/kit";
import { SKINS, accentOr, chipInk, onAccent, shade } from "./colour";
import { params as defaults, type Params } from "./params";

export const DUR = 6.4;
const W0 = 1920;
const H0 = 1080;
export const T = { blob: 0.05, type: 0.55, grow: 2.2, rows: 3.4, cta: 4.0, btn: 3.72, hand: 4.25, press: 4.78, settle: 5.05, wide: 6.05 };
const split = (s: string) => (s ?? "").split("|").map((x) => x.trim()).filter(Boolean);
/** a property's label that reads as a state, shown as a chip */
const STATE = /^(status|state|priority|severity|stage|health|risk|type|tag|label|level|plan|mode)$/i;

/* ---------------- the panel's geometry (world px, the panel's own top left at 0, 0) ---------------- */

export type Box = { x: number; y: number; w: number; h: number };
export type Geo = {
  W: number;
  H: number;
  /** the panel's own corner */
  R: number;
  /** the title's pill: where it starts, its top and height */
  pill: { left: number; top: number; h: number };
  /** the pill's right edge after n letters (0: the blob, a circle) */
  edge: (n: number) => number;
  /** where the caret stands after n letters */
  caretX: (n: number) => number;
  len: number;
  title: Box & { fs: number; color: string };
  rows: Box[];
  /** where the properties end (the drop's first stop) */
  rowsEnd: number;
  ctas: (Box & { r: number })[];
  typeDur: number;
};
/** typing: about 20 letters a second, between 0.75 and 1.3 s, so the hold before the drop is ~0.35 s or more */
const typeDurOf = (len: number) => Math.min(1.3, Math.max(0.75, len / 20));

/** The drawn panel: laid out from its words. */
function drawnLayout(p: Params) {
  const sans = p.font ? `"${p.font}", "Geist", "Inter", system-ui, sans-serif` : '"Geist", "Inter", system-ui, sans-serif';
  const title = (p.title || "Your feature").trim().slice(0, 48);
  const FS = 50;
  const HH = 116;
  const DOT = 18;
  const textX = 40 + DOT + 22;
  const tf = `600 ${FS}px ${sans}`;
  const widths = Array.from({ length: title.length + 1 }, (_, i) => measure(title.slice(0, i), tf));
  const raw = split(p.rows).slice(0, 6);
  const LF = `450 27px ${sans}`;
  const VF = `550 28px ${sans}`;
  const pairs = raw.map((r) => {
    const i = r.indexOf(":");
    return i > 0 && i < 28 ? { label: r.slice(0, i).trim(), value: r.slice(i + 1).trim() } : { label: r, value: "" };
  });
  const need = Math.max(0, ...pairs.map((x) => measure(x.label, LF) + (x.value === "~" ? 330 : x.value ? measure(x.value, VF) + 120 : 0) + 80));
  const BF = `600 26px ${sans}`;
  const BH = 68;
  let bx = 40;
  const btns = split(p.ctas)
    .slice(0, 3)
    .map((label) => {
      const w = Math.max(BH * 1.6, measure(label, BF) + 68);
      const b = { label, x: bx, w };
      bx += w + 14;
      return b;
    });
  const hug = (n: number) => (n <= 0 ? HH : textX + widths[Math.min(title.length, n)] + 16 + 44);
  const W = Math.round(Math.min(1240, Math.max(860, hug(title.length) + 60, need, bx + 26)));
  const RH = 74;
  const top = HH + 16;
  const rows = pairs.map((x, i) => ({ ...x, chip: !!x.value && x.value !== "~" && STATE.test(x.label) && x.value.length <= 18, y: top + i * RH }));
  const yR = top + rows.length * RH + (rows.length ? 12 : 0);
  const yB = yR + 24;
  const H = btns.length ? yB + BH + 34 : yR + 12;
  const geo: Geo = {
    W,
    H,
    R: 34,
    pill: { left: 0, top: 0, h: HH },
    edge: hug,
    caretX: (n) => textX + widths[Math.min(title.length, Math.max(0, n))] + 6,
    len: title.length,
    title: { x: textX, y: 0, w: widths[title.length], h: HH, fs: FS, color: "" },
    rows: rows.map((r) => ({ x: 40, y: r.y, w: W - 80, h: RH })),
    rowsEnd: yR,
    ctas: btns.map((b) => ({ x: b.x, y: yB, w: b.w, h: BH, r: BH / 2 })),
    typeDur: typeDurOf(title.length),
  };
  return { geo, sans, title, tf, FS, HH, DOT, textX, rows, btns, BF, BH, yB, LF, VF };
}
type Drawn = ReturnType<typeof drawnLayout>;

/** The captured panel, measured as it lays out (untransformed, off the frame): its size and corner, its title letter by
    letter, its property rows and its buttons, each by the marks the capture left on it. */
function measureCaptured(root: HTMLElement): Geo | null {
  const box = root.getBoundingClientRect();
  if (!box.width || !box.height || !root.offsetWidth) return null;
  // (the frame's stage is scaled to fit: what's measured on screen, back in the panel's own px)
  const k = box.width / root.offsetWidth;
  const rel = (r: DOMRect): Box => ({ x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k });
  const tEl = root.querySelector<HTMLElement>('[data-unfold="title"]');
  if (!tEl) return null;
  // each letter's right edge, from the text itself (ranges over its text nodes)
  let first = NaN;
  const rights: number[] = [];
  const walker = document.createTreeWalker(tEl, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent ?? "";
    for (let i = 0; i < s.length; i++) {
      if (!s[i].trim() && !rights.length) continue;
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (Number.isNaN(first)) first = (r.left - box.left) / k;
      rights.push(Math.max((r.right - box.left) / k, rights.at(-1) ?? 0));
    }
  }
  // (trailing spaces typed are no letters)
  while (rights.length > 1 && rights.at(-1)! <= rights.at(-2)!) rights.pop();
  if (!rights.length) return null;
  const tBox = rel(tEl.getBoundingClientRect());
  const cs = getComputedStyle(tEl);
  const fs = parseFloat(cs.fontSize) || 20;
  const textLeft = Number.isNaN(first) ? tBox.x : first;
  // the pill around the title: its line's height and some room either side
  const ph = fs * 1.9;
  const lineTop = Math.max(0, tBox.y + tBox.h / 2 - ph / 2);
  const pad = fs * 0.75;
  // an icon or a dot leading the title on its line starts in the blob with it (as the drawn panel's dot does)
  const mid = tBox.y + tBox.h / 2;
  let lineStart = textLeft;
  root.querySelectorAll<Element>("*").forEach((el) => {
    if (el === tEl || tEl.contains(el) || el.contains(tEl)) return;
    const r = rel(el.getBoundingClientRect());
    if (r.w > 0 && r.w < fs * 2.6 && r.h < fs * 2.6 && r.y < mid && r.y + r.h > mid && r.x + r.w <= textLeft + 1 && r.x >= textLeft - fs * 3.5) lineStart = Math.min(lineStart, r.x);
  });
  const pillLeft = Math.max(0, lineStart - (lineStart < textLeft ? pad * 0.6 : pad));
  const at = (n: number) => (n <= 0 ? textLeft : rights[Math.min(rights.length, n) - 1]);
  const groups = new Map<string, Box>();
  root.querySelectorAll<HTMLElement>("[data-unfold-row]").forEach((el) => {
    const k = el.dataset.unfoldRow!;
    const r = rel(el.getBoundingClientRect());
    const was = groups.get(k);
    groups.set(k, was ? { x: Math.min(was.x, r.x), y: Math.min(was.y, r.y), w: Math.max(was.x + was.w, r.x + r.w) - Math.min(was.x, r.x), h: Math.max(was.y + was.h, r.y + r.h) - Math.min(was.y, r.y) } : r);
  });
  const rows = [...groups.entries()].sort((a, b) => +a[0] - +b[0]).map(([, b]) => b);
  const ctas = [...root.querySelectorAll<HTMLElement>('[data-unfold="cta"]')].map((el) => ({ ...rel(el.getBoundingClientRect()), r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }));
  const W = root.offsetWidth;
  const H = root.offsetHeight;
  const ctaTop = ctas.length ? Math.min(...ctas.map((c) => c.y)) : H;
  const rowsEnd = Math.min(ctaTop - 4, rows.length ? Math.max(...rows.map((r) => r.y + r.h)) + 8 : H * 0.7);
  return {
    W,
    H,
    R: parseFloat(getComputedStyle(root).borderTopLeftRadius) || 0,
    pill: { left: pillLeft, top: lineTop, h: ph },
    edge: (n) => (n <= 0 ? pillLeft + ph : at(n) + pad),
    caretX: (n) => at(n) + fs * 0.08,
    len: rights.length,
    title: { ...tBox, fs, color: cs.color },
    rows,
    rowsEnd: Math.max(lineTop + ph, rowsEnd),
    ctas,
    typeDur: typeDurOf(rights.length),
  };
}

/* ---------------- the container and the camera over time ---------------- */

/** letters typed by t (fractional: the pill's edge moves smoothly between letters) */
const typedAt = (G: Geo, t: number) => clamp((t - T.type) / G.typeDur) * G.len;
/** the container at t: its edges, its corner, how it lands and squashes (the blob's give) */
export function shape(G: Geo, t: number) {
  const n = typedAt(G, t);
  const k = Math.floor(n);
  const hug = lerp(G.edge(k), G.edge(k + 1), n - k);
  const land = back(seg(t, T.blob, T.blob + 0.45), 1.9);
  const widen = inOut(seg(t, T.grow, T.grow + 0.62));
  const x0 = lerp(G.pill.left, 0, widen);
  const y0 = lerp(G.pill.top, 0, widen);
  const x1 = lerp(Math.max(G.pill.left + G.pill.h, hug), G.W, widen);
  const [y1] = glide(t, [
    [T.grow, G.pill.top + G.pill.h],
    [T.rows, G.rowsEnd],
    [T.cta, G.H],
  ]);
  const r = lerp(G.pill.h / 2, G.R, inOut(seg(t, T.grow, T.grow + 0.5)));
  const squash = 0.07 * Math.sin(Math.PI * seg(t, T.type - 0.05, T.type + 0.32)) + 0.04 * Math.sin(Math.PI * seg(t, T.grow - 0.04, T.grow + 0.3));
  return { x0, y0, x1, y1, r, land, squash };
}

/** the camera's zooms for this panel: the blob big, the title in frame, the panel's width in frame while it drops, the
    whole of it at the end (with room for the angle) */
export function zooms(G: Geo) {
  // (a small panel, a sidebar's, is gone into further: the camera's zoom, so its type is drawn at that size)
  const start = Math.min(7, Math.max(0.6, 236 / G.pill.h));
  const title = Math.min(start * 0.86, (0.74 * W0) / Math.max(1, G.edge(G.len) - G.pill.left));
  const drop = Math.min(title, (0.8 * W0) / G.W);
  const fit = Math.min(drop * 0.95, (0.74 * W0) / G.W, (0.72 * H0) / G.H);
  return { start, title, drop, cta: Math.min(drop * 1.07, title), fit };
}
type Zooms = ReturnType<typeof zooms>;
/** where the camera wants to be at t (world px, zoom): on the blob, riding the pill's edge as it stretches, falling
    with the bottom edge, down to the buttons, then back to the whole panel */
export function target(G: Geo, Z: Zooms, t: number): [number, number, number] {
  const s = shape(G, t);
  const [z0] = glide(t, [
    [0, Z.start * 1.06],
    [0.55, Z.start],
    [1.9, Z.title],
    [T.grow, Z.title],
    [T.rows, Z.drop],
    [T.cta, Z.cta],
    [T.settle, Z.cta],
  ]);
  const wide = inOut(seg(t, T.settle, T.wide));
  const z = lerp(z0, Z.fit, wide);
  const a = inOut(seg(t, T.grow - 0.1, T.grow + 0.5));
  const x = lerp(s.x0 + (s.x1 - s.x0) * 0.56, s.x0 + (s.x1 - s.x0) * 0.5, a);
  const follow = Math.max(G.pill.top + G.pill.h / 2, s.y1 - (0.31 * H0) / z0);
  return [x, lerp(follow, G.H / 2, wide), z];
}
/** the camera: a lagged follow of the target (where it wanted to be over the last ~0.25 s, the nearest weighing most) */
function cameraAt(G: Geo, Z: Zooms, t: number): [number, number, number] {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sw = 0;
  for (let i = 0; i < 10; i++) {
    const w = Math.exp(-i / 3.2);
    const [x, y, z] = target(G, Z, Math.max(0, t - i * 0.028));
    sx += x * w;
    sy += y * w;
    sz += z * w;
    sw += w;
  }
  return [sx / sw, sy / sw, sz / sw];
}
/** when the container's bottom edge first passes `y` (s): what a row waits for */
function passes(G: Geo, y: number) {
  for (let t = T.grow; t < DUR; t += 0.01) if (shape(G, t).y1 >= y) return t;
  return DUR;
}

/* ---------------- the film ---------------- */

type Btn = { land: number; stretch: number; label: number };

/** The panel's geometry: drawn from its words, or (with `src`) the product's own, fetched, laid out off the frame and
    measured; the export waits while it is (data-baking). Render `probe` somewhere in the stage. */
export function usePanel(p: Params) {
  const [html, setHtml] = useState("");
  const [cap, setCap] = useState<Geo | null>(null);
  const probe = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setHtml("");
    setCap(null);
    if (!p.src) return;
    let live = true;
    document.documentElement.dataset.baking = "1";
    fetch(p.src)
      .then((r) => (r.ok ? r.text() : ""))
      .then((s) => {
        if (!live) return;
        setHtml(s);
        if (!s) delete document.documentElement.dataset.baking;
      })
      .catch(() => delete document.documentElement.dataset.baking);
    return () => {
      live = false;
    };
  }, [p.src]);
  useLayoutEffect(() => {
    if (!html || !probe.current) return;
    let live = true;
    const root = probe.current.querySelector<HTMLElement>("[data-unfold-root]");
    const imgs = [...probe.current.querySelectorAll("img")];
    Promise.all([document.fonts.ready, ...imgs.map((i) => i.decode().catch(() => null))]).then(() => {
      if (!live) return;
      setCap(root ? measureCaptured(root) : null);
      delete document.documentElement.dataset.baking;
    });
    return () => {
      live = false;
    };
  }, [html]);
  const fonts = typeof document !== "undefined" ? document.fonts.status : "loaded";
  const D: Drawn = useMemo(() => drawnLayout(p), [p.title, p.rows, p.ctas, p.font, fonts]); // eslint-disable-line react-hooks/exhaustive-deps
  const captured = !!(p.src && cap);
  const G: Geo = captured ? cap! : D.geo;
  const probeEl = p.src && html ? <div ref={probe} aria-hidden style={{ position: "absolute", left: -30000, top: 0, visibility: "hidden" }} dangerouslySetInnerHTML={{ __html: html }} /> : null;
  return { G, D, html, captured, pending: !!p.src && !captured, probe: probeEl };
}
export type PanelState = ReturnType<typeof usePanel>;

/** The panel at its build time `t` (the unfold's clock), in its own px (its top left at 0, 0): the container (the
    blob, the pill, the panel, its shadow following the clip), the caret, the press, the hand. `dof`: how far out of
    focus a part is (px); `zHand`: the camera's zoom where the hand comes in (it's sized on screen). */
export function PanelBody({ P, p, t, dof = () => 0, zHand }: { P: PanelState; p: Params; t: number; dof?: (b: Box) => number; zHand: number }) {
  const { G, D, html, captured } = P;
  const accent = accentOr(p.accent);
  const skin = SKINS[p.panel] ?? SKINS.light;
  const dark = p.panel === "dark";
  const host = useRef<HTMLDivElement>(null);
  const rowAt = useMemo(() => G.rows.map((r) => passes(G, r.y + r.h * 0.55)), [G]);
  const btnAt = useMemo(() => G.ctas.map((c, i) => Math.max(T.btn + i * 0.14, passes(G, c.y + c.h * 0.5))), [G]);
  const s = shape(G, t);
  // the title: typed (letters, or the captured title clipped letter by letter), the caret solid while typing and
  // blinking while it holds, gone as the panel drops
  const n = Math.floor(typedAt(G, t));
  const typing = t >= T.type && n < G.len;
  const caret = t >= T.type - 0.1 ? blink(t, typing) * (1 - seg(t, T.grow, T.grow + 0.2)) : 0;
  const titleBlur = dof(G.title);
  // the hand: in from the lower right, onto the main button, pressing it
  const main = G.ctas[0];
  const hand = p.press && main ? glide(t, [[T.hand, main.x + main.w + 260, main.y + main.h / 2 + 240], [T.press, main.x + main.w * 0.55, main.y + main.h / 2 + 4]]) : null;
  const handIn = p.press && main ? out(seg(t, T.hand, T.hand + 0.25)) * (1 - seg(t, T.wide - 0.2, T.wide + 0.15)) : 0;
  const press = p.press ? Math.sin(Math.PI * seg(t, T.press, T.press + 0.26)) : 0;
  const ripple = p.press ? seg(t, T.press + 0.05, T.press + 0.75) : 0;
  const rowK = (i: number) => out(seg(t, rowAt[i] - 0.05, rowAt[i] + 0.42));
  const btn = (i: number): Btn => {
    const a = btnAt[i];
    return { land: back(seg(t, a, a + 0.32), 1.8), stretch: expo(seg(t, a + 0.16, a + 0.62)), label: out(seg(t, a + 0.36, a + 0.7)) };
  };

  // the captured panel's parts, styled every frame (they're the product's own elements, so they're moved in place)
  useLayoutEffect(() => {
    const root = host.current?.querySelector<HTMLElement>("[data-unfold-root]");
    if (!captured || !root) return;
    const tEl = root.querySelector<HTMLElement>('[data-unfold="title"]');
    if (tEl) {
      // the letters not typed yet are cut off at the caret (the title's own text, in its own face)
      const cut = Math.max(0, G.title.x + G.title.w - G.caretX(n) + G.title.fs * 0.06);
      tEl.style.clipPath = t < T.grow ? `inset(-30% ${n <= 0 ? G.title.w + 8 : cut}px -30% -8px)` : "";
      tEl.style.filter = titleBlur > 0.05 ? `blur(${titleBlur}px)` : "";
    }
    const groups = new Map<string, HTMLElement[]>();
    root.querySelectorAll<HTMLElement>("[data-unfold-row]").forEach((el) => groups.set(el.dataset.unfoldRow!, [...(groups.get(el.dataset.unfoldRow!) ?? []), el]));
    [...groups.entries()]
      .sort((a, b) => +a[0] - +b[0])
      .forEach(([, els], i) => {
        if (i >= G.rows.length) return;
        const k = rowK(i);
        const b = (1 - k) * 6 + dof(G.rows[i]);
        for (const el of els) {
          el.style.opacity = String(k);
          el.style.transform = `translateY(${(1 - k) * 18}px)`;
          el.style.filter = b > 0.05 ? `blur(${b}px)` : "";
        }
      });
    root.querySelectorAll<HTMLElement>('[data-unfold="cta"]').forEach((el, i) => {
      const c = G.ctas[i];
      if (!c) return;
      const b = btn(i);
      const w = lerp(Math.min(c.w, c.h), c.w, b.stretch);
      const r = lerp(c.h / 2, c.r, b.stretch);
      el.style.clipPath = `inset(0 ${c.w - w}px 0 0 round ${r}px)`;
      el.style.transformOrigin = `${c.h / 2}px 50%`;
      el.style.transform = `scale(${b.land * (1 - (i === 0 ? 0.045 * press : 0))})`;
      const f = dof(c);
      el.style.filter = f > 0.05 ? `blur(${f}px)` : "";
    });
  });

  const clip = `inset(${s.y0}px ${G.W - s.x1}px ${G.H - s.y1}px ${s.x0}px round ${s.r}px)`;
  const bx = G.pill.left + G.pill.h / 2;
  const by = G.pill.top + G.pill.h / 2;
  const landing: CSSProperties = { transformOrigin: `${bx}px ${by}px`, transform: `scale(${s.land * (1 + s.squash * 0.6)}, ${s.land * (1 - s.squash)})` };
  const lift = seg(t, T.grow, T.cta);
  const shadow = `drop-shadow(0 ${18 + 22 * lift}px ${34 + 26 * lift}px ${alpha(shade(accent, 0.25), 0.42)}) drop-shadow(0 6px 12px rgba(0,0,0,0.14))`;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: G.W, height: G.H, filter: shadow, opacity: P.pending ? 0 : 1 }}>
        {captured ? (
          <div ref={host} style={{ position: "absolute", left: 0, top: 0, width: G.W, height: G.H, clipPath: clip, ...landing }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <DrawnPanel D={D} G={G} t={t} n={n} caret={caret} clip={clip} landing={landing} skin={skin} dark={dark} accent={accent} rowK={rowK} btn={btn} press={press} dof={dof} titleBlur={titleBlur} />
        )}
      </div>
      {/* the caret, over the captured title (the drawn one carries its own) */}
      {captured && caret > 0 && <div style={{ position: "absolute", left: G.caretX(n), top: G.title.y + G.title.h / 2 - G.title.fs * 0.55, width: Math.max(2, G.title.fs * 0.08), height: G.title.fs * 1.1, borderRadius: 2, background: accent, opacity: caret }} />}
      {/* the press: a ripple on the main button */}
      {main && ripple > 0 && ripple < 1 && (
        <div style={{ position: "absolute", left: main.x, top: main.y, width: main.w, height: main.h, borderRadius: main.r, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: main.w * 0.55 - 40, top: main.h / 2 - 40, width: 80, height: 80, borderRadius: 40, background: "rgba(255,255,255,0.35)", opacity: 1 - ripple, transform: `scale(${1 + ripple * 5})` }} />
        </div>
      )}
      {hand && handIn > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: handIn }}>
          <Cursor x={hand[0] - 14 / zHand} y={hand[1] - 6 / zHand} press={press} hand size={64 / (28 * zHand)} />
        </div>
      )}
    </>
  );
}

/** The unfold at time `t`, drawn into whatever 1920×1080 stage holds it: its own camera over the panel, at an angle. */
export function UnfoldView({ p, t }: { p: Params; t: number }) {
  useFonts();
  const accent = accentOr(p.accent);
  const field = useMemo(() => composedField(accent, { variant: p.variant as Composition }), [accent, p.variant]);
  const P = usePanel(p);
  const G = P.G;
  const Z = useMemo(() => zooms(G), [G]);
  const [cx, cy, z] = cameraAt(G, Z, t);
  // the camera's speed (screen px a second) leans it a few degrees more the way it's going
  const [px, py] = cameraAt(G, Z, Math.max(0, t - 1 / 30));
  const lean = (v: number) => Math.max(-3, Math.min(3, v / 300));
  const vx = (cx - px) * 30 * z;
  const vy = (cy - py) * 30 * z;
  const angle = Math.max(0, Math.min(35, Number(p.angle) || 0));
  // depth of field: blurred by how far (on screen) a part is from where the camera looks, a few px at most
  const blurAmt = Math.max(0, Math.min(1, Number(p.blur) || 0));
  const dof = (b: Box) => {
    const d = Math.hypot((b.x + b.w / 2 - cx) * 0.35, b.y + b.h / 2 - cy) * z;
    return (blurAmt * 4 * clamp((d - H0 * 0.22) / (H0 * 0.4))) / z;
  };
  const world: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "0 0",
    transform: `translate(${W0 / 2}px, ${H0 / 2}px) rotateX(${angle * 0.5 - lean(vy)}deg) rotateY(${-angle + lean(vx)}deg) rotateZ(${angle * 0.07}deg) scale(${z}) translate(${-cx}px, ${-cy}px)`,
  };
  return (
    <div style={{ position: "absolute", inset: 0, background: p.ground === "none" ? "transparent" : field.base }}>
      {p.ground !== "none" && <FieldView field={field} t={t} shift={{ x: -(cx - G.W / 2) * 0.05 * z, y: -(cy - G.H / 2) * 0.05 * z }} grain={Math.max(0, Math.min(1, Number(p.grain) || 0))} />}
      {P.probe}
      <div style={{ position: "absolute", inset: 0, perspective: 2200, perspectiveOrigin: "50% 50%" }}>
        <div style={world}>
          <PanelBody P={P} p={p} t={t} dof={dof} zHand={Z.cta} />
        </div>
      </div>
      <Bands k={blurAmt} />
    </div>
  );
}

/** the frame's top and bottom edges out of focus, softly (a lens's depth, not a filter over everything) */
export function Bands({ k }: { k: number }) {
  if (k <= 0) return null;
  const edge = 1.5 + 5 * k;
  const band = (dir: "top" | "bottom"): CSSProperties => ({
    position: "absolute",
    left: 0,
    right: 0,
    [dir]: 0,
    height: "26%",
    backdropFilter: `blur(${edge}px)`,
    WebkitBackdropFilter: `blur(${edge}px)`,
    maskImage: `linear-gradient(to ${dir === "top" ? "bottom" : "top"}, black, transparent)`,
    WebkitMaskImage: `linear-gradient(to ${dir === "top" ? "bottom" : "top"}, black, transparent)`,
    pointerEvents: "none",
  });
  return (
    <>
      <div style={band("top")} />
      <div style={band("bottom")} />
    </>
  );
}

export default function Unfold({ p = defaults }: { p?: Params }) {
  const t = useClock(DUR);
  return (
    <Stage background="transparent">
      <UnfoldView p={p} t={t} />
    </Stage>
  );
}

/** The panel drawn from its words (when there's no capture of the product's own). */
function DrawnPanel(o: { D: Drawn; G: Geo; t: number; n: number; caret: number; clip: string; landing: CSSProperties; skin: (typeof SKINS)[string]; dark: boolean; accent: string; rowK: (i: number) => number; btn: (i: number) => Btn; press: number; dof: (b: Box) => number; titleBlur: number }) {
  const { D, G, t, n, caret, skin, dark, accent } = o;
  const dotIn = out(seg(t, T.blob + 0.2, T.blob + 0.55));
  const dotX = lerp(D.HH / 2, 40 + D.DOT / 2, inOut(seg(t, T.type - 0.1, T.type + 0.35)));
  const pulse = (((t - 0.4) % 1.4) + 1.4) % 1.4 / 1.4;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: G.W, height: G.H, clipPath: o.clip, background: skin.surface, backdropFilter: skin.blur ? "blur(28px) saturate(1.4)" : undefined, fontFamily: D.sans, color: skin.ink, ...o.landing }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: G.R, border: `1px solid ${skin.border}`, pointerEvents: "none" }} />
      {/* the attention dot, and its pulse */}
      <div style={{ position: "absolute", left: dotX - D.DOT / 2, top: D.HH / 2 - D.DOT / 2, width: D.DOT, height: D.DOT, borderRadius: "50%", background: accent, transform: `scale(${dotIn})` }} />
      <div style={{ position: "absolute", left: dotX - D.DOT / 2, top: D.HH / 2 - D.DOT / 2, width: D.DOT, height: D.DOT, borderRadius: "50%", border: `2px solid ${accent}`, opacity: dotIn * (1 - pulse) * 0.6, transform: `scale(${1 + pulse * 1.6})` }} />
      {/* the title, typed */}
      <div style={{ position: "absolute", left: D.textX, top: 0, height: D.HH, display: "flex", alignItems: "center", whiteSpace: "nowrap", font: D.tf, letterSpacing: "-0.02em", filter: o.titleBlur > 0.05 ? `blur(${o.titleBlur}px)` : undefined }}>
        <span>{D.title.slice(0, Math.max(0, n))}</span>
        <span style={{ display: "inline-block", width: 4, height: D.FS * 1.02, marginLeft: 6, borderRadius: 2, background: accent, opacity: caret }} />
      </div>
      {/* under the title: a hairline drawn across as it drops */}
      <div style={{ position: "absolute", left: 40, top: D.HH, width: G.W - 80, height: 1, background: skin.line, transformOrigin: "0 50%", transform: `scaleX(${out(seg(t, T.grow + 0.1, T.grow + 0.7))})` }} />
      {/* the properties, each arriving as the edge passes it */}
      {D.rows.map((r, i) => {
        const k = o.rowK(i);
        const b = (1 - k) * 6 + o.dof(G.rows[i]);
        const lineK = out(seg(t, T.grow + 0.3 + i * 0.12, T.grow + 0.9 + i * 0.12));
        return (
          <div key={i} style={{ position: "absolute", left: 40, top: r.y, width: G.W - 80, height: 74, opacity: k, transform: `translateY(${(1 - k) * 22}px)`, filter: b > 0.05 ? `blur(${b}px)` : undefined }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: 74, display: "flex", alignItems: "center", font: r.value ? D.LF : D.VF, color: r.value ? skin.muted : skin.ink, whiteSpace: "nowrap" }}>{r.label}</div>
            {r.value && (
              <div style={{ position: "absolute", right: 0, top: 0, height: 74, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
                {r.value === "~" ? (
                  // a value the product works out as it runs: a soft bar where it goes, never an invented one
                  <span style={{ display: "inline-block", width: 120 + ((r.label.length * 37) % 90), height: 18, borderRadius: 9, background: skin.soft }} />
                ) : r.chip ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 44, padding: "0 18px", borderRadius: 22, background: alpha(accent, dark ? 0.22 : 0.12), color: chipInk(accent, dark), font: `600 24px ${D.sans}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: accent }} />
                    {r.value}
                  </span>
                ) : (
                  <span style={{ font: D.VF, color: skin.ink }}>{r.value}</span>
                )}
              </div>
            )}
            {i < D.rows.length - 1 && <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: 1, background: skin.line, transformOrigin: "0 50%", transform: `scaleX(${lineK})` }} />}
          </div>
        );
      })}
      {/* the buttons, each forming as the title did: a blob stretching into its pill */}
      {D.btns.map((b, i) => {
        const k = o.btn(i);
        const w = lerp(D.BH, b.w, k.stretch);
        const primary = i === 0;
        const f = o.dof(G.ctas[i]);
        return (
          <div key={i} style={{ position: "absolute", left: b.x, top: D.yB, width: w, height: D.BH, borderRadius: D.BH / 2, overflow: "hidden", background: primary ? accent : skin.soft, color: primary ? onAccent(accent) : skin.ink, transformOrigin: `${D.BH / 2}px 50%`, transform: `scale(${k.land * (1 - (primary ? 0.045 * o.press : 0))})`, boxShadow: primary ? `0 10px 26px -10px ${alpha(accent, 0.7)}` : undefined, filter: f > 0.05 ? `blur(${f}px)` : undefined }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: D.BF, whiteSpace: "nowrap", opacity: k.label, transform: `translateX(${(1 - k.label) * -14}px)` }}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}
