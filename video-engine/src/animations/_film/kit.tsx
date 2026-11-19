// The launch-film kit: what every film in "Launch films" is drawn with. A film is a pure function of one clock (t, in
// seconds), so the engine's stepped export renders it exactly; this file holds that clock, the 1920×1080 stage it's
// drawn on, GSAP-named easings, the entrance every title uses, typed text and its caret, words that open from nothing,
// a cursor, and a live product screen (any of the engine's React animations, running inside the film).
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { byId, htmlUrl, withDefaults } from "../../registry";
import "./film.css";
import { resolve } from "./tone";

/* ---------------- time and easing (GSAP's names, in comments) ---------------- */

export const clamp = (x: number) => Math.min(1, Math.max(0, x));
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** power4.out */
export const out = (x: number) => 1 - (1 - clamp(x)) ** 5;
/** expo.out */
export const expo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * clamp(x)));
/** power3.inOut */
export const inOut = (x: number) => {
  const k = clamp(x);
  return k < 0.5 ? 8 * k ** 4 : 1 - (-2 * k + 2) ** 4 / 2;
};
/** power3.in */
export const acc = (x: number) => clamp(x) ** 4;
/** back.out(s) */
export const back = (x: number, s = 1.7) => {
  const k = clamp(x) - 1;
  return 1 + (s + 1) * k ** 3 + s * k ** 2;
};
export const typed = (s: string, t: number, at: number, cps = 18) =>
  s.slice(0, Math.max(0, Math.min(s.length, Math.floor((t - at) * cps))));
export const typingEnd = (s: string, at: number, cps = 18) => at + s.length / cps;
/** the caret: solid while typing, blinking (0.5 s) when it waits */
export const blink = (t: number, busy: boolean) => (busy || Math.floor(t * 2) % 2 === 0 ? 1 : 0);
export const visible = (t: number, a: number, b: number) => t >= a - 0.05 && t <= b + 0.05;

export type Fx = { at: number; dur?: number; out?: number; outDur?: number; dy?: number; blur?: number; scale?: number; outDy?: number };
/** In: rise from below, out of a blur (power4.out). Out: up and away, blurring (power3.in). */
export function fx(t: number, o: Fx): CSSProperties {
  const i = (o.dur ?? 0.7) <= 0 ? 1 : out(seg(t, o.at, o.at + (o.dur ?? 0.7)));
  const e = o.out == null ? 0 : acc(seg(t, o.out, o.out + (o.outDur ?? 0.35)));
  const dy = (1 - i) * (o.dy ?? 36) + e * (o.outDy ?? -30);
  const blur = (1 - i) * (o.blur ?? 10) + e * 10;
  return {
    opacity: i * (1 - e),
    transform: `translateY(${dy}px) scale(${lerp(o.scale ?? 0.97, 1, i)})`,
    filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
  };
}

/** A huge word arriving the way the launch films throw one in: out of a wide motion blur, settling (expo.out). */
export function smear(t: number, at: number, dur = 0.6, from = -90): CSSProperties {
  const k = expo(seg(t, at, at + dur));
  return {
    opacity: k,
    transform: `translateX(${(1 - k) * from}px) scaleX(${lerp(1.22, 1, k)})`,
    filter: k < 1 ? `blur(${(1 - k) * 30}px)` : undefined,
  };
}

/* ---------------- the clock and the stage ---------------- */

/**
 * Seconds since the film mounted. `?t=12.5` holds one frame (for stills); in the engine it loops; in an export (the
 * stepped clock, `?vt=1`) it stops on its last frame, so a frame's clock running a little ahead can't wrap it. In the
 * Studio the playhead drives it: once the host sends a "clock" (the moment to show; a film cut into scenes shows its
 * slice in each), the film's own clock stops and it follows.
 */
export function useClock(duration: number) {
  const q = new URLSearchParams(location.search);
  const hold = Number(q.get("t"));
  const held = Number.isFinite(hold) && hold > 0;
  const once = q.get("vt") === "1";
  const [t, setT] = useState(held ? hold : 0);
  useEffect(() => {
    // a held frame can be moved to another (stills of many moments without reloading)
    if (held) return void ((window as unknown as { __hold?: (s: number) => void }).__hold = setT);
    let id = 0;
    let driven = false;
    const host = q.get("host");
    const follow = (e: MessageEvent) => {
      const d = e.data;
      if (e.origin !== host || d?.source !== "anim-engine-host" || d.type !== "clock" || typeof d.t !== "number") return;
      driven = true;
      cancelAnimationFrame(id);
      setT(Math.max(0, Math.min(d.t, duration - 0.001)));
    };
    addEventListener("message", follow);
    answerPicks();
    // the host may have sent it before this listened
    if (host) window.engine?.report("clock?", {});
    const t0 = performance.now();
    // a stepped export reads where the film's clock began, so it can land any frame exactly
    if (once) (window as unknown as { __filmT0?: number }).__filmT0 = t0;
    // where the film is, for the tools that measure how smoothly it plays
    else (window as unknown as { __filmClock?: () => number }).__filmClock = () => ((performance.now() - t0) / 1000) % duration;
    const tick = () => {
      if (driven) return;
      const s = (performance.now() - t0) / 1000;
      setT(once ? Math.min(s, duration - 0.001) : s % duration);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      removeEventListener("message", follow);
    };
  }, [held, once, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  return t;
}

/* ---------------- click-to-edit ---------------- */

type Box = { x: number; y: number; w: number; h: number };
/** One part of a film under a click: the element (by where it's written, `data-k`, shared by the copies one line makes),
    what it is, how many copies, where it is, and how many of the frame's widths one of its own px is (to move it). */
export type Bit = { k: string; name: string; kind: "text" | "picture" | "shape" | "drawing" | "box"; count: number; box: Box; unit: number; color: string; fill: string };
/**
 * What the film shows at a point (fractions of its frame): the params to edit there, and where each is (fractions; for a
 * list param split by |, which of its pieces it is). An element (a `Slot`, a `Baked` drawing, anything with
 * `data-pick="key|key"`) says which params it is; words say by matching the film's words (a drawing keeps its words in
 * `data-text`). Only what can be seen counts.
 */
export function pickAt(x: number, y: number): { keys: string[]; box: Box; at: Record<string, { box: Box; piece?: number }>; bits: Bit[] } | null {
  const meta = byId(new URLSearchParams(location.search).get("a"));
  if (!meta) return null;
  const p = withDefaults(meta, window.engine?.params ?? undefined);
  const texts = Object.keys(meta.schema).filter((k) => meta.schema[k].type === "text" && typeof p[k] === "string" && String(p[k]).trim());
  const norm = (v: string) => v.replace(/[*.,!?…:;"'“”‘’]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  // what an element says, without the copies drawn for effect (a typed word's ink over its pale letters is aria-hidden)
  const said = (el: Element) => {
    let out = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let i = 0, tn = w.nextNode(); tn && i < 400; tn = w.nextNode(), i++) if (!tn.parentElement?.closest('[aria-hidden="true"]') || !el.contains(tn.parentElement.closest('[aria-hidden="true"]'))) out += tn.textContent;
    return out.replace(/\s+/g, " ").trim();
  };
  const words = (el: Element) => {
    if (el instanceof HTMLCanvasElement) return norm(el.dataset.text ?? "");
    let out = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let i = 0, tn = w.nextNode(); tn && i < 400; tn = w.nextNode(), i++) {
      const copy = tn.parentElement?.closest('[aria-hidden="true"]');
      if (!copy || copy === el || !el.contains(copy)) out += tn.textContent;
    }
    return norm(out);
  };
  // a short word only as all of what's there ("your" is in a lot of sentences); a longer one as whole words; and what's
  // there as a piece of a param (a line half typed)
  const within = (seen: string, part: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(seen);
  const says = (seen: string) =>
    texts.flatMap((k) => {
      const piece = String(p[k])
        .split("|")
        .map(norm)
        .findIndex((part) => part.length > 1 && (seen === part || (part.length >= 5 && within(seen, part)) || (seen.length >= 3 && part.startsWith(seen))));
      return piece < 0 ? [] : [{ k, piece }];
    });
  // elements a film draws over others without meaning to be touched still say what's under the pointer
  // words count where their letters are, not where a box around them is (a row of tags over a word is mostly air)
  const [px, py] = [x * innerWidth, y * innerHeight];
  const range = document.createRange();
  const lettersHere = (n: Element) => {
    if (n instanceof HTMLCanvasElement) return true;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let i = 0, tn = w.nextNode(); tn && i < 300; tn = w.nextNode(), i++) {
      if (!tn.textContent?.trim() || !tn.parentElement?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      range.selectNodeContents(tn);
      for (const r of range.getClientRects()) if (px >= r.left - 4 && px <= r.right + 4 && py >= r.top - 4 && py <= r.bottom + 4) return true;
    }
    return false;
  };
  const all = document.createElement("style");
  all.textContent = "*{pointer-events:auto!important}";
  document.head.appendChild(all);
  let under = document.elementsFromPoint(x * innerWidth, y * innerHeight);
  // what paints something here: a box that's only there to place others (a full-frame layer of a film) isn't a part
  const SHAPES = /^(img|canvas|video|path|circle|rect|ellipse|line|polygon|polyline|text|image)$/i;
  const paints = (n: Element) => {
    if (SHAPES.test(n.tagName)) return true;
    if (n instanceof SVGElement) return false;
    const cs = getComputedStyle(n);
    const seen = (c: string) => !!c && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(c);
    // a shadow or a border paints round a box, not in it: what's in it shows through
    return seen(cs.backgroundColor) || cs.backgroundImage !== "none" || ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim()) && lettersHere(n));
  };
  // a drawing (Baked) has no parts left to touch: its parts are laid out again, unseen, over it, and asked instead
  const painted = under.find((n) => n.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && paints(n));
  const drawing = painted instanceof HTMLCanvasElement && (painted as { __markup?: string }).__markup ? (painted as HTMLCanvasElement & { __markup: string }) : null;
  let probe: HTMLDivElement | null = null;
  if (drawing) {
    probe = document.createElement("div");
    probe.style.cssText = drawing.style.cssText;
    Object.assign(probe.style, { opacity: "0", visibility: "visible", overflow: "hidden" });
    if (getComputedStyle(drawing).position === "static") Object.assign(probe.style, { position: "relative", marginTop: `-${drawing.style.height}` });
    probe.innerHTML = drawing.__markup!;
    drawing.after(probe);
    under = document.elementsFromPoint(x * innerWidth, y * innerHeight);
  }
  const shown = (n: Element) => (probe?.contains(n) ? n !== probe : n.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  try {
  // the part of an element that's in the frame (a camera close on a window runs it past the edges), as fractions
  const boxOf = (el: Element): Box => {
    const r = getComputedStyle(el).display === "contents" ? (range.selectNodeContents(el), range.getBoundingClientRect()) : el.getBoundingClientRect();
    const [x0, y0] = [Math.max(0, r.left), Math.max(0, r.top)];
    const [x1, y1] = [Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)];
    return { x: x0 / innerWidth, y: y0 / innerHeight, w: Math.max(0, x1 - x0) / innerWidth, h: Math.max(0, y1 - y0) / innerHeight };
  };
  // the parts under the point: the smallest thing painted there first, then each bigger one holding it that paints (a
  // card, a window), up to the film's own frame; ones as big as the frame (its grounds) aren't parts
  const bits: Bit[] = [];
  let top = under.find((n) => shown(n) && paints(n));
  // a word drawn a letter at a time is picked whole: from a letter, up to what holds the word
  const own = (n: Element) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent ?? "").join("").trim();
  const copy = top?.closest('[aria-hidden="true"]');
  if (copy?.parentElement && copy !== top?.closest("[data-film]")) top = copy.parentElement;
  let climbed = false;
  while (top && own(top).length <= 2 && words(top).length <= 2 && top.parentElement && (top.parentElement as HTMLElement).dataset?.k && words(top.parentElement).length > words(top).length && words(top.parentElement).length <= 40) {
    top = top.parentElement;
    climbed = true;
  }
  for (let n: Element | null = top ?? null; n && n !== document.body && bits.length < 6; n = n.parentElement) {
    if ((n as HTMLElement).dataset?.film !== undefined) break;
    const k = (n as HTMLElement).dataset?.k;
    if (!k || bits.some((b) => b.k === k) || n === probe || (n !== top && bits.length && !paints(n))) continue;
    const b = boxOf(n);
    if (b.w * b.h > 0.9 && !(n instanceof HTMLCanvasElement)) continue;
    const tag = n.tagName.toLowerCase();
    const kind: Bit["kind"] = tag === "img" ? "picture" : tag === "canvas" ? "drawing" : n instanceof SVGElement ? "shape" : own(n) || (n === top && climbed) ? "text" : "box";
    const r = n.getBoundingClientRect();
    const html = n instanceof HTMLElement ? n : n.closest("div, span");
    const cs = getComputedStyle(n);
    bits.push({
      k,
      kind,
      name: kind === "text" ? `“${(own(n) || said(n)).slice(0, 22)}”` : kind === "picture" ? "Picture" : kind === "shape" ? "Shape" : kind === "drawing" ? "Drawing" : "Box",
      count: (probe ?? document).querySelectorAll(`[data-k="${CSS.escape(k)}"]`).length,
      box: b,
      unit: (html instanceof HTMLElement && html.offsetWidth ? html.getBoundingClientRect().width / html.offsetWidth : r.width / Math.max(1, (n as SVGGraphicsElement).getBBox?.().width ?? r.width)) / innerWidth,
      color: hexOf(cs.color),
      fill: hexOf(n instanceof SVGElement ? cs.fill : cs.backgroundColor),
    });
  }
  for (const hit of under) {
    if (!shown(hit)) continue;
    const at: Record<string, { box: Box; piece?: number }> = {};
    let first: Element | null = null;
    for (let n: Element | null = hit, depth = 0; n && n !== document.body && depth < 12; n = n.parentElement, depth++) {
      for (const k of (n as HTMLElement).dataset?.pick?.split("|") ?? []) {
        if (!(k in meta.schema) || at[k]) continue;
        at[k] = { box: boxOf(n) };
        first ??= n;
      }
      // the nearest words that are the film's (not a container's, holding half the frame and everything in it)
      const seen = words(n);
      const r = n.getBoundingClientRect();
      const whole = !(n instanceof HTMLCanvasElement) && r.width * r.height > innerWidth * innerHeight * 0.5;
      if (seen && seen.length <= 600 && !whole && !Object.keys(at).some((k) => texts.includes(k)) && lettersHere(n)) {
        for (const { k, piece } of says(seen)) {
          at[k] = { box: boxOf(n), piece };
          first ??= n;
        }
      }
    }
    if (!first) continue;
    const keys = Object.keys(at).slice(0, 6);
    return { keys, box: boxOf(first), at: Object.fromEntries(keys.map((k) => [k, at[k]])), bits };
  }
  return bits.length ? { keys: [], box: bits[0].box, at: {}, bits } : null;
  } finally {
    probe?.remove();
  }
}
const hexOf = (c: string) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c);
  if (!m || m[4] === "0") return "";
  return `#${[m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, "0")).join("")}`;
};

/* ---------------- the looks: the user's changes to a film's parts ---------------- */

/** A change to one part (and its copies), by its `data-k`: its colour, fill, size, place, turn, hidden, or (a picture)
    another picture. Kept in the film's values as `looks` (JSON); drawn as CSS over the live parts and into drawings. */
export type Look = { color?: string; fill?: string; scale?: number; x?: number; y?: number; rotate?: number; hide?: boolean; src?: string };
let looksCss = "";
const lookers = new Set<() => void>();
const onLooks = (f: () => void) => (lookers.add(f), () => void lookers.delete(f));
const colour = (v?: string) => (v && /^#[0-9a-f]{3,8}$/i.test(v) ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const cssOfLooks = (raw: unknown) => {
  let looks: Record<string, Look> = {};
  try {
    looks = typeof raw === "string" && raw ? JSON.parse(raw) : {};
  } catch {
    /* a broken value draws nothing */
  }
  return Object.entries(looks)
    .map(([k, l]) => {
      const s = `[data-k="${k.replace(/[^\w:-]/g, "")}"]`;
      const d: string[] = [];
      if (colour(l.color)) d.push(`color:${l.color}!important`, `-webkit-text-fill-color:${l.color}!important`, `fill:${l.color}!important`);
      if (colour(l.fill)) d.push(`background:${l.fill}!important`);
      if (num(l.scale) && l.scale !== 1) d.push(`scale:${num(l.scale)}`);
      if (num(l.x) || num(l.y)) d.push(`translate:${num(l.x)}px ${num(l.y)}px`);
      if (num(l.rotate)) d.push(`rotate:${num(l.rotate)}deg`);
      if (l.hide) d.push("visibility:hidden!important");
      if (l.src && /^(\/|data:image\/|https?:)/.test(l.src)) d.push(`content:url("${l.src.replace(/["\\()\s]/g, "")}")`);
      return d.length ? `${s}{${d.join(";")}}` : "";
    })
    .join("\n");
};
let looked = false;
/** The looks, kept in step with the film's values (and a part dragged in the Studio, moved before it's let go). */
function keepLooks() {
  if (looked) return;
  looked = true;
  const sheet = document.head.appendChild(document.createElement("style"));
  const nudged = new Set<HTMLElement>();
  const set = (raw: unknown) => {
    const css = cssOfLooks(raw);
    for (const el of nudged) el.style.translate = "";
    nudged.clear();
    if (css === looksCss) return;
    looksCss = sheet.textContent = css;
    for (const f of lookers) f();
  };
  set(window.engine?.params?.looks);
  window.engine?.onParams((v) => set(v.looks));
  const host = new URLSearchParams(location.search).get("host");
  addEventListener("message", (e) => {
    const d = e.data;
    if (e.origin !== host || d?.source !== "anim-engine-host" || d.type !== "nudge" || typeof d.k !== "string") return;
    for (const el of document.querySelectorAll<HTMLElement>(`[data-k="${CSS.escape(d.k)}"]`)) {
      el.style.translate = `${num(d.x)}px ${num(d.y)}px`;
      nudged.add(el);
    }
  });
}
let answering = false;
/** The Studio asks what's at a point ("pick", with an `id` to answer to); the film says (`picked`). */
function answerPicks() {
  keepLooks();
  if (answering) return;
  answering = true;
  const host = new URLSearchParams(location.search).get("host");
  addEventListener("message", (e) => {
    const d = e.data;
    if (e.origin !== host || d?.source !== "anim-engine-host" || d.type !== "pick") return;
    window.engine?.report("picked", { id: d.id, hover: !!d.hover, ...(pickAt(+d.x, +d.y) ?? { keys: [] }) });
  });
}

/** The fonts have to be in before anything measures text. */
export function useFonts() {
  const [, set] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => live && set((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
}

/**
 * Faces from Google Fonts a film needs beyond Geist (the Studio loads its faces the same way). `families` are CSS
 * font shorthands to wait for ('700 40px "Caveat"'); true once they're in, so nothing measures or films a fallback.
 */
export function useWebFonts(href: string, families: string[]) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (![...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].some((l) => l.href === href))
      document.head.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
    let live = true;
    // offline, it films in the fallbacks rather than never
    const give = setTimeout(() => live && setReady(true), 6000);
    Promise.all(families.map((f) => document.fonts.load(f))).finally(() => live && setReady(true));
    return () => {
      live = false;
      clearTimeout(give);
    };
  }, [href]); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}

/** The film's stage (1920×1080, or `w`×`h`: 1080×1920 for a reel), scaled to fit whatever frame it plays in (letterboxed, centred). */
export function Stage({
  children,
  background = "#000",
  className = "",
  style,
  w = 1920,
  h = 1080,
}: {
  children: ReactNode;
  background?: string;
  className?: string;
  style?: CSSProperties;
  w?: number;
  h?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current!;
    const fit = () => setK(Math.min(el.clientWidth / w, el.clientHeight / h) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden", background }}>
      <div
        className={className}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: w,
          height: h,
          overflow: "hidden",
          transformOrigin: "50% 50%",
          transform: `translate(-50%, -50%) scale(${k})`,
          WebkitFontSmoothing: "antialiased",
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- type ---------------- */

/** Text that opens from nothing to its own width (`p` 0 → 1), the way a word appears between braces. */
export function Reveal({ p, children, style }: { p: number; children: ReactNode; style?: CSSProperties }) {
  const inner = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (el && el.offsetWidth !== w) setW(el.offsetWidth);
  });
  return (
    <span style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", verticalAlign: "bottom", width: w * p, ...style }}>
      <span ref={inner} style={{ display: "inline-block" }}>
        {children}
      </span>
    </span>
  );
}

/** Words rising in one after another. */
export function Words({
  text,
  t,
  at,
  gap = 0.07,
  style,
}: {
  text: string;
  t: number;
  at: number;
  gap?: number;
  style?: (i: number, w: string) => CSSProperties | undefined;
}) {
  return (
    <>
      {text.split(" ").map((w, i, all) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            whiteSpace: "pre",
            ...fx(t, { at: at + i * gap, dur: 0.6, dy: 26, blur: 8 }),
            ...style?.(i, w),
          }}
        >
          {w + (i < all.length - 1 ? " " : "")}
        </span>
      ))}
    </>
  );
}

export function Caret({ on, color }: { on: number; color?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "0.07em",
        height: "0.9em",
        marginLeft: "0.05em",
        verticalAlign: "-0.08em",
        borderRadius: 2,
        background: color ?? "currentColor",
        opacity: on,
      }}
    />
  );
}

/** "*word*" in a line becomes the accent; everything else stays ink. */
export function Marked({ text, accent }: { text: string; accent: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <span key={i} style={{ color: accent }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
export const unmark = (s: string) => s.replace(/\*/g, "");

/* ---------------- colour and the product's mark ---------------- */

const rgbOf = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(resolve(h).trim());
  const n = m ? parseInt(m[1], 16) : 0xfc8019;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** `a` mixed `k` of the way to `b` (hex in, rgb() out). */
export const mix = (a: string, b: string, k: number) => {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
};
export const alpha = (a: string, o: number) => `rgba(${rgbOf(a).join(",")},${o})`;
/** `a` mixed `k` of the way to `b`, as hex (so it can be mixed again). */
export const hexMix = (a: string, b: string, k: number) => {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * clamp(k)).toString(16).padStart(2, "0")).join("");
};

/* ---------------- placing, measuring, chance ---------------- */

/** A seeded random: the same numbers on every render, so a film exports exactly. */
export const rng = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
/** Absolutely placed at (x, y), with whatever else. */
export const at = (x: number, y: number, o: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: x, top: y, ...o });
export const fill: CSSProperties = { position: "absolute", inset: 0 };
/** Placed at (x, y) by transform: for whatever moves every frame (a moving `left`/`top` lays out and re-draws). */
export const move = (x: number, y: number, o: CSSProperties = {}, more = ""): CSSProperties => ({ position: "absolute", left: 0, top: 0, transform: `translate3d(${x}px, ${y}px, 0)${more}`, ...o });
let ctx2d: CanvasRenderingContext2D | null = null;
/** How wide a line of text is in a CSS font ("700 40px Geist"). */
export const measure = (s: string, font: string) => {
  ctx2d ??= document.createElement("canvas").getContext("2d");
  ctx2d!.font = resolve(font);
  return ctx2d!.measureText(s).width;
};
/** A camera over a flat world: what's at (cx, cy) sits at the frame's centre, `z` times bigger. */
export const camera = (cx: number, cy: number, z: number, w = 1920, h = 1080): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  transformOrigin: "0 0",
  transform: `translate(${w / 2}px, ${h / 2}px) scale(${z}) translate(${-cx}px, ${-cy}px)`,
});
/** Keyframes [t, ...values] eased between with `ease` (inOut by default): the value at t. */
export function keys(t: number, frames: [number, ...number[]][], ease: (x: number) => number = inOut): number[] {
  if (t <= frames[0][0]) return frames[0].slice(1);
  for (let i = 1; i < frames.length; i++) {
    const [a, ...va] = frames[i - 1];
    const [b, ...vb] = frames[i];
    if (t <= b) {
      const k = ease(seg(t, a, b));
      return va.map((v, j) => lerp(v, vb[j], k));
    }
  }
  return frames[frames.length - 1].slice(1);
}

/**
 * A camera path through keyframes [t, ...values] with no stop between them: one smooth curve (cubic Hermite, tangents
 * from the neighbouring keys, so speed carries through a key; it only stops where the move turns back), easing out
 * of the first key and into the last. What `keys` is for a path a camera glides along; `keys` stops at every key.
 */
export function glide(t: number, frames: [number, ...number[]][]): number[] {
  const n = frames.length;
  if (t <= frames[0][0]) return frames[0].slice(1);
  if (t >= frames[n - 1][0]) return frames[n - 1].slice(1);
  let i = 1;
  while (t > frames[i][0]) i++;
  const [a, b] = [frames[i - 1], frames[i]];
  const h = b[0] - a[0];
  const k = (t - a[0]) / h;
  // the slope at a key: the neighbours' average, 0 at the ends and where the path turns back
  const slope = (j: number, c: number) => {
    if (j === 0 || j === n - 1) return 0;
    const [p, q, r] = [frames[j - 1], frames[j], frames[j + 1]];
    const d0 = (q[c] - p[c]) / (q[0] - p[0]);
    const d1 = (r[c] - q[c]) / (r[0] - q[0]);
    // (held under 3× the gentler side, so it never overshoots a key: Fritsch–Carlson)
    return d0 * d1 <= 0 ? 0 : Math.sign(d0) * Math.min(Math.abs(d0 + d1) / 2, 3 * Math.min(Math.abs(d0), Math.abs(d1)));
  };
  const [k2, k3] = [k * k, k * k * k];
  return a.slice(1).map((_, c) => {
    const [p0, p1] = [a[c + 1], b[c + 1]];
    const [m0, m1] = [slope(i - 1, c + 1) * h, slope(i, c + 1) * h];
    return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * m0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * m1;
  });
}

/** The product's mark when it has none of its own: its first letter on the accent, in a rounded tile. */
export function Mark({ name, a, size, glass = false }: { name: string; a: string; size: number; glass?: boolean }) {
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        flex: "none",
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: glass
          ? `linear-gradient(160deg, rgba(255,255,255,.85), ${alpha(a, 0.35)} 60%, ${alpha(a, 0.75)})`
          : `linear-gradient(160deg, ${mix(a, "#ffffff", 0.25)}, ${a} 55%, ${mix(a, "#000000", 0.2)})`,
        boxShadow: glass
          ? `inset 0 1px 0 rgba(255,255,255,.9), inset 0 0 0 1px rgba(255,255,255,.6), 0 ${size * 0.2}px ${size * 0.5}px -${size * 0.14}px ${alpha(a, 0.55)}`
          : `inset 0 1px 0 rgba(255,255,255,.4), 0 ${size * 0.18}px ${size * 0.45}px -${size * 0.12}px ${alpha(a, 0.55)}`,
        backdropFilter: glass ? "blur(10px)" : undefined,
        color: glass ? mix(a, "#000000", 0.15) : "#fff",
        fontSize: size * 0.56,
        fontWeight: 700,
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}
    >
      {(name.trim()[0] ?? "•").toUpperCase()}
    </span>
  );
}

/* ---------------- the cursor ---------------- */

export function Cursor({
  x,
  y,
  press = 0,
  hand = false,
  size = 1,
}: {
  x: number;
  y: number;
  press?: number;
  hand?: boolean;
  size?: number;
}) {
  const s = size * (1 - 0.12 * press);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 34"
      width={28}
      height={34}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        // moved by transform only, so a frame never lays the page out or re-draws it
        transform: `translate3d(${x}px, ${y}px, 0) scale(${s})`,
        transformOrigin: "4px 4px",
        pointerEvents: "none",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))",
        zIndex: 20,
      }}
    >
      {hand ? (
        <path
          d="M10.5 15.5V5.6a2 2 0 0 1 4 0v8.1-2.3a2 2 0 0 1 4 0v2.6-1.6a2 2 0 0 1 4 0v2.8-.8a2 2 0 0 1 4 0v7.4c0 5-3.7 8.7-8.6 8.7h-1.6c-2.6 0-4.4-1-6-3.1l-4.2-5.6a2 2 0 0 1 3.1-2.6l1.3 1.4Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ) : (
        <path d="M4 3.5v23.2l6.1-5.6 3.9 9.1 4.3-1.9-3.9-8.9h8.5Z" fill="#111" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/* ---------------- a live product screen ---------------- */


/**
 * One of the engine's animations, running live inside the film at a phone's size (402×874, or `w`×`h`), drawn at
 * `scale`. A transform on the box makes it the containing block, so the animation's fixed layers stay inside it.
 */
export function Screen({
  id,
  w = 402,
  h = 874,
  scale = 1,
  radius = 0,
  style,
}: {
  id: string;
  w?: number;
  h?: number;
  scale?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  const meta = byId(id);
  const Comp = useMemo(() => (meta?.load ? lazy(meta.load as () => Promise<{ default: ComponentType<{ p: unknown }> }>) : null), [meta]);
  const p = useMemo(() => (meta ? withDefaults(meta) : {}), [meta]);
  const center = meta?.layout !== "fill";
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        overflow: "hidden",
        borderRadius: radius,
        transform: "translateZ(0)",
        zoom: scale,
        background: "#fff",
        ...(center ? { display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" } : null),
        ...style,
      }}
    >
      {Comp && (
        <Suspense>
          <Comp p={p} />
        </Suspense>
      )}
      {/* a page (an imported .html): in its own frame, stepped with this one in an export (engine-bridge.js) */}
      {meta?.html && <iframe title={meta.name} src={`${htmlUrl(meta)}?layer=1&frame=screen&host=${encodeURIComponent(location.origin)}${new URLSearchParams(location.search).get("vt") === "1" ? "&vt=1" : ""}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />}
    </div>
  );
}

/**
 * One of a film's screens, as the user filled it (a "screen" param): "anim:<id>" runs a library animation live,
 * "image:<url>" and "video:<url>" are their own (a video kept on the film's clock `t`); "" shows the film's own
 * drawing, `children`. It fills `w`×`h` (or its box), cropped to cover.
 */
export function Slot(o: { src?: string; t?: number; w?: number; h?: number; fit?: "cover" | "contain"; style?: CSSProperties; children?: ReactNode; /** the param it is, for click-to-edit */ pick?: string }) {
  return o.pick ? (
    <span data-pick={o.pick} style={{ display: "contents" }}>
      <SlotBody {...o} />
    </span>
  ) : (
    <SlotBody {...o} />
  );
}
/** A product's own screen in place of a panel a film draws (its reference product's interface): the panel's card (its
    ground, edge and shadow: `style`) at the screen's shape, `w` wide, the screen filling it. */
export function Shown({ src, t, w, aspect = 1.6, style, pick }: { src: string; t?: number; w: number; aspect?: number; style?: CSSProperties; pick?: string }) {
  return (
    <div data-pick={pick} style={{ ...style, position: "relative", width: w, height: Math.round(w / aspect), padding: 0, overflow: "hidden", boxSizing: "border-box" }}>
      <Slot src={src} t={t} />
    </div>
  );
}
/** A slot's value, read: its kind, its address, and what a product kit says after `#` (studio/product.ts slotValue): where to
    look (`focus=x,y`, fractions: the crop keeps it), a clip's part (`t=from,to`, s), chrome cut off each edge
    (`crop=top,right,bottom,left`, fractions). */
export function readSlot(src = "") {
  const i = src.indexOf(":");
  const kind = i > 0 ? src.slice(0, i) : "";
  const [url, frag = ""] = (i > 0 ? src.slice(i + 1) : "").split("#");
  const q = new URLSearchParams(frag);
  const nums = (k: string) => q.get(k)?.split(",").map(Number).filter(Number.isFinite);
  const [fx, fy] = nums("focus") ?? [];
  const [from, to] = nums("t") ?? [];
  const crop = nums("crop");
  return { kind, url, focus: fx === undefined ? null : { x: fx, y: fy ?? 0.5 }, trim: from === undefined || !(to > from) ? null : { from, to }, crop: crop?.length === 4 ? crop : null };
}
function SlotBody({ src, t = 0, w, h, fit = "cover", style, children }: { src?: string; t?: number; w?: number; h?: number; fit?: "cover" | "contain"; style?: CSSProperties; children?: ReactNode }) {
  const { kind, url, focus, trim, crop } = readSlot(src);
  const box = {
    display: "block",
    width: w ?? "100%",
    height: h ?? "100%",
    objectFit: fit,
    ...(focus ? { objectPosition: `${focus.x * 100}% ${focus.y * 100}%` } : null),
    ...(crop ? { objectViewBox: `inset(${crop.map((c) => `${c * 100}%`).join(" ")})` } : null),
    ...style,
  } as CSSProperties;
  if (kind === "anim" && (byId(url)?.load || byId(url)?.html)) return <Screen id={url} w={w ?? 402} h={h ?? 874} style={style} />;
  if (kind === "image") return <img src={url} alt="" draggable={false} style={box} />;
  if (kind === "video") return <FilmVideo url={url} t={t} trim={trim} style={box} />;
  return <>{children}</>;
}

/** A slot's picture or video's width ÷ height once it's known (`fallback` until then, and for the film's own). */
export function useAspect(src: string | undefined, fallback: number) {
  const [ar, setAr] = useState(fallback);
  useEffect(() => {
    const m = /^(image|video):([^#]+)/.exec(src ?? "");
    if (!m) return setAr(fallback);
    if (m[1] === "image") {
      const img = new Image();
      img.onload = () => setAr(img.naturalWidth / img.naturalHeight || fallback);
      img.src = m[2];
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => setAr(v.videoWidth / v.videoHeight || fallback);
      v.src = m[2];
    }
  }, [src, fallback]);
  return ar;
}

const steppedClock = () => {
  const q = new URLSearchParams(location.search);
  return q.get("vt") === "1" || Number(q.get("t")) > 0;
};
/** A video on the film's clock: it plays on its own and is pulled back when it drifts; in an export it's placed frame by frame. */
function FilmVideo({ url, t, trim, style }: { url: string; t: number; trim?: { from: number; to: number } | null; style: CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const stepped = useMemo(steppedClock, []);
  useEffect(() => {
    const v = ref.current;
    if (!v || !v.duration) return;
    // a part of the clip: it loops within that part
    const a = trim ? Math.min(trim.from, v.duration) : 0;
    const b = trim ? Math.min(trim.to, v.duration) : v.duration;
    const want = a + (t % Math.max(0.05, b - a));
    if (stepped) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.001) v.currentTime = want;
    } else if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
  }, [t, stepped, trim?.from, trim?.to]);
  return <video ref={ref} src={url} muted playsInline loop={!trim} autoPlay={!stepped} preload="auto" style={style} />;
}

/* ---------------- baked: drawn once, then only moved ---------------- */

const asDataUrl = async (url: string) => {
  const b = await (await fetch(url)).blob();
  return await new Promise<string>((ok) => {
    const f = new FileReader();
    f.onload = () => ok(f.result as string);
    f.readAsDataURL(b);
  });
};
let faces: Promise<{ family: string; css: string }[]> | null = null;
/** Every @font-face the page has (Latin only), its file inlined: a picture can't fetch anything. */
const fontFaces = () =>
  (faces ??= (async () => {
    const blocks: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      try {
        for (const r of [...sheet.cssRules]) if (r instanceof CSSFontFaceRule) blocks.push(r.cssText);
      } catch {
        // Google Fonts' sheet is another site's: read it again, it allows that
        if (sheet.href) blocks.push(...(((await (await fetch(sheet.href)).text()).match(/@font-face\s*{[^}]*}/g) ?? [])));
      }
    }
    const latin = blocks.filter((b) => !/unicode-range/.test(b) || /U\+0000-00FF/i.test(b));
    return Promise.all(
      latin.map(async (b) => {
        const family = /font-family:\s*["']?([^"';]+)/.exec(b)?.[1] ?? "";
        const m = /url\(["']?([^"')]+)["']?\)/.exec(b);
        try {
          return { family, css: m ? b.replace(m[0], `url(${await asDataUrl(new URL(m[1], location.href).href)})`) : "" };
        } catch {
          return { family, css: "" };
        }
      }),
    );
  })());

/** Markup drawn into a canvas: an SVG picture of it (its fonts and pictures inlined), rasterized once at `scale`. */
async function bake(canvas: HTMLCanvasElement, markup: string, w: number, h: number, scale: number) {
  const win = window as unknown as { __bakes?: number };
  win.__bakes = (win.__bakes ?? 0) + 1;
  let html = markup.replace(/<svg(?![^>]*xmlns=)/g, '<svg xmlns="http://www.w3.org/2000/svg"');
  for (const src of new Set([...html.matchAll(/<img[^>]*?src="([^"]+)"/g)].map((m) => m[1]))) {
    if (src.startsWith("data:")) continue;
    try {
      html = html.split(`src="${src}"`).join(`src="${await asDataUrl(src.replace(/&amp;/g, "&"))}"`);
    } catch {
      /* a picture that won't load stays out */
    }
  }
  const fonts = (await fontFaces()).filter((f) => f.css && html.includes(f.family)).map((f) => f.css).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${w}px;height:${h}px;-webkit-font-smoothing:antialiased"><style>${fonts}</style>${html}</div></foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let baking = 0;
/**
 * Its children drawn once into a canvas, w×h (drawn again only when they change). A camera can then move, turn and
 * zoom it every frame and the browser never re-draws it: a canvas is a texture, where text and shapes are re-drawn
 * at every new scale (what made the films stutter). For what doesn't move inside itself: no live screens or videos.
 * Mount it with the film and hide it with opacity until it shows: one that mounts mid-film is drawn late.
 */
export function Baked({ w, h, scale = 1, deps, children, style, onReady, pick }: { w: number; h: number; scale?: number; /** what it's drawn from: drawn again only when one changes */ deps: unknown[]; children: ReactNode; style?: CSSProperties; onReady?: () => void; /** the params it shows, for click-to-edit (see `pickAt`) */ pick?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const markup = useMemo(() => renderToStaticMarkup(<>{children}</>), deps); // eslint-disable-line react-hooks/exhaustive-deps
  // a drawing has no words or marks left in it: it keeps them, so a click on it can still say what it shows
  const said = useMemo(() => ({ text: wordsOf(markup), picks: [pick, ...[...markup.matchAll(/data-pick="([^"]+)"/g)].map((m) => m[1])].filter(Boolean).join("|") }), [markup, pick]);
  const [drawn, setDrawn] = useState("");
  // the user's changes to its parts (the looks) are drawn in with it
  const looks = useSyncExternalStore(onLooks, () => looksCss);
  // (a drawing is an image: the theme's variables are written into it, since an image can't read them)
  const full = resolve(looks ? `<style>${looks}</style>${markup}` : markup, true);
  useEffect(() => {
    (ref.current as HTMLCanvasElement & { __markup?: string }).__markup = full;
    let live = true;
    baking++;
    document.documentElement.dataset.baking = String(baking);
    bake(ref.current!, full, w, h, scale)
      .catch(() => {})
      .finally(() => {
        if (--baking === 0) delete document.documentElement.dataset.baking;
        else document.documentElement.dataset.baking = String(baking);
        if (live) {
          setDrawn(markup);
          onReady?.();
        }
      });
    return () => {
      live = false;
    };
  }, [full, w, h, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} data-text={said.text} data-pick={said.picks || undefined} width={Math.round(w * scale)} height={Math.round(h * scale)} style={{ display: "block", width: w, height: h, visibility: drawn ? "visible" : "hidden", ...style }} />;
}
const wordsOf = (markup: string) => {
  const d = document.createElement("textarea");
  d.innerHTML = markup.replace(/<[^>]+>/g, " ");
  return d.value.replace(/\s+/g, " ").trim().slice(0, 2000);
};

/** A phone around a screen: the black bezel, the island, the rounded glass. `scale` sizes the whole thing. */
export function Phone({ id, scale = 1, shadow = true, children }: { id?: string; scale?: number; shadow?: boolean; children?: ReactNode }) {
  return (
    <div
      style={{
        zoom: scale,
        position: "relative",
        width: 402 + 24,
        height: 874 + 24,
        padding: 12,
        borderRadius: 68,
        background: "#0b0b0c",
        boxShadow: shadow
          ? "inset 0 0 0 1.5px rgba(255,255,255,.12), 0 0 0 1px rgba(0,0,0,.6), 0 60px 120px -40px rgba(0,0,0,.45), 0 20px 50px -20px rgba(0,0,0,.3)"
          : "inset 0 0 0 1.5px rgba(255,255,255,.12)",
      }}
    >
      <div style={{ position: "relative", width: 402, height: 874, borderRadius: 56, overflow: "hidden", transform: "translateZ(0)" }}>
        {children ?? (id ? <Screen id={id} /> : null)}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 11,
            width: 124,
            height: 36,
            marginLeft: -62,
            borderRadius: 20,
            background: "#000",
            zIndex: 30,
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- confetti and a spark ---------------- */

/** A seeded burst: the same pieces every render, so it exports exactly. `p` 0 → 1 is the burst's life. */
export function Confetti({
  p,
  x,
  y,
  colors,
  count = 46,
  spread = 520,
}: {
  p: number;
  x: number;
  y: number;
  colors: string[];
  count?: number;
  spread?: number;
}) {
  if (p <= 0 || p >= 1) return null;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pieces = Array.from({ length: count }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const v = 0.45 + rnd() * 0.55;
    return { a, v, r: rnd() * 360, s: 10 + rnd() * 16, c: colors[i % colors.length], spin: (rnd() - 0.5) * 900 };
  });
  const k = out(p);
  return (
    <>
      {pieces.map((q, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: x + Math.cos(q.a) * spread * q.v * k,
            top: y + Math.sin(q.a) * spread * 0.62 * q.v * k + 260 * p * p,
            width: q.s,
            height: q.s * 0.62,
            borderRadius: 3,
            background: q.c,
            opacity: 1 - acc(seg(p, 0.6, 1)),
            transform: `rotate(${q.r + q.spin * p}deg) skewX(${(q.v - 0.7) * 40}deg)`,
          }}
        />
      ))}
    </>
  );
}

/** A four-pointed spark. */
export function Spark({ size, color, style }: { size: number; color: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={style}>
      <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" fill={color} />
    </svg>
  );
}
