// What a flow film's elements look like (graph.ts says where they are and how they move, compose.ts writes them):
// a box (solid or glass), words (wiped on, typed with their newest letters arriving out of the accent's light,
// clipped at a point), a mark, an app icon, a window on a screen or recording, a card (drawn or the product's own),
// a send button, and a panel (the unfold's body: the product's own when captured). Nothing here knows a scene.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { composedField, satinField, type Composition } from "../../studio/field";
import { SatinView } from "../_film/satin";
import type { Card } from "../../studio/flow";
import type { El, Ground, P } from "../../studio/graph";
import { FieldView } from "../_film/field";
import { BackdropView, type Cam } from "../_film/backdrop";
import { AssemblyView } from "../_film/assembly";
import type { Assembly } from "../../studio/assemble";
import { Cursor, Slot, alpha, hexMix, measure } from "../_film/kit";
import { PanelBody, type PanelState } from "../film-unfold/view";
import type { Params as UnfoldParams } from "../film-unfold/params";

export const W0 = 1920;
export const H0 = 1080;
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const INK = "#111114";
const WHITE = "#ffffff";

/* ---------------- grounds ---------------- */

/** A ground, moving against the camera: its shift, and (`cam`) the camera's turn, tilt, roll and zoom, by less than the
    world does (it's further away), so an angle reads in the gradient too; and its moving graphics over it, if any. */
export function GroundView({ g, t, accent, shift, cam }: { g: Ground; t: number; accent: string; shift?: { x: number; y: number }; cam?: Partial<Cam> }) {
  const c = { z: 1, rx: 0, ry: 0, rz: 0, ...cam };
  const par = { x: (shift?.x ?? 0) - c.ry * 9, y: (shift?.y ?? 0) + c.rx * 7 };
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "-6%", top: "-6%", width: "112%", height: "112%", transform: `rotate(${(c.rz * 0.5).toFixed(3)}deg) scale(${(1 + (c.z - 1) * 0.05).toFixed(4)})` }}>
        <Plain g={g} t={t} accent={accent} shift={par} />
      </div>
      {g.motion && <BackdropView b={g.motion} t={t} cam={c} shift={shift} />}
    </div>
  );
}

function Plain({ g, t, accent, shift }: { g: Ground; t: number; accent: string; shift?: { x: number; y: number } }) {
  const field = useMemo(() => (g.tone === "field" ? composedField(accent, { variant: g.variant as Composition }) : null), [g, accent]);
  const satin = useMemo(() => (g.tone === "field" && g.finish !== "matte" ? satinField(accent, { variant: g.variant as Composition }) : null), [g, accent]);
  if (satin) return <SatinView s={satin} t={t} shift={shift} />;
  if (g.tone === "field" && field) return <FieldView field={field} t={t} grain={g.grain ?? 0} shift={shift} />;
  if (g.tone === "image") {
    // a picture of the library's: cover, drifting slowly closer, a little behind the camera's moves
    const f = g.focus ?? { x: 0.5, y: 0.5 };
    const k = 1.06 + Math.min(0.08, t * 0.006);
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0b0b0d" }}>
        <img src={g.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${f.x * 100}% ${f.y * 100}%`, transformOrigin: `${f.x * 100}% ${f.y * 100}%`, transform: `translate3d(${(shift?.x ?? 0) * 0.6}px, ${(shift?.y ?? 0) * 0.6}px, 0) scale(${k})` }} />
      </div>
    );
  }
  if (g.tone === "white") return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 45%, #ffffff 55%, #ececee 100%)" }} />;
  if (g.tone === "light") return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 40%, #f6f6f8 40%, #dedee3 100%)" }} />;
  // dark: two soft lights behind the product, the brand's and a warm one, drifting (and moving a little with the camera)
  const cool = hexMix(accent, WHITE, 0.15);
  const warm = "#ff7a3d";
  const lx = 0.28 + Math.sin(t * 0.2) * 0.05;
  const rx = 0.74 + Math.cos(t * 0.17) * 0.05;
  const sx = shift?.x ?? 0;
  const sy = shift?.y ?? 0;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#08080a", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: lx * W0 - 700 + sx, top: -260 + sy, width: 1400, height: 1000, background: `radial-gradient(closest-side, ${alpha(cool, 0.34)}, ${alpha(cool, 0.12)} 55%, transparent)` }} />
      <div style={{ position: "absolute", left: rx * W0 - 560 + sx * 0.7, top: -200 + sy * 0.7, width: 1120, height: 760, background: `radial-gradient(closest-side, ${alpha(warm, 0.3)}, ${alpha(warm, 0.08)} 60%, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.55))" }} />
    </div>
  );
}

/* ---------------- the pieces ---------------- */

/** a line wiped on: what's revealed (0 → 1) solid, its edge soft */
const wipe = (r: number): CSSProperties => {
  if (r >= 1) return {};
  const e = r * 1.25 - 0.1;
  const m = `linear-gradient(90deg, #000 ${(e - 0.14) * 100}%, transparent ${e * 100}%)`;
  return { maskImage: m, WebkitMaskImage: m };
};
/** a prompt streaming in: what's typed solid, the newest letters arriving out of the accent's light, each settling
    by its own age (`n` letters' worth of time has passed: past the last letter it keeps counting, so the last ones
    settle too and the line finishes solid) */
function Stream({ text, n, tail }: { text: string; n: number; tail: string }) {
  const run = 9;
  const shown = Math.min(text.length, Math.floor(n));
  const from = Math.max(0, Math.min(shown, Math.floor(n - run)));
  return (
    <>
      {text.slice(0, from)}
      {[...text.slice(from, shown)].map((ch, i) => {
        const f = Math.max(0, Math.min(1, (n - (from + i)) / run));
        return (
          <span key={i} style={f >= 1 ? undefined : { color: hexMix(hexMix(tail, WHITE, 0.45), INK, f), opacity: 0.25 + 0.75 * f }}>
            {ch}
          </span>
        );
      })}
    </>
  );
}
function Logo({ logo, name, size, color = WHITE }: { logo?: string; name: string; size: number; color?: string }) {
  return logo ? <img src={logo} alt="" style={{ width: size, height: size, objectFit: "contain" }} /> : <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size * 0.62, color, lineHeight: 1 }}>{(name[0] ?? "•").toUpperCase()}</span>;
}
/** the 2D and 3D turns an element carries */
const turned = (p: P, extra = "") => `perspective(1100px) rotateX(${p.ty}deg) rotateY(${p.tx}deg) rotate(${p.rot}deg) scale(${p.s})${extra}`;
const shadow = (lift: number) => (lift > 0 ? `0 ${30 * lift}px ${70 * lift}px -${24 * lift}px rgba(0,0,0,${0.4 * lift})` : undefined);
const blurOf = (b: number) => (b > 0.05 ? `blur(${b}px)` : undefined);

/** a card's words, drawn (when it isn't the product's own) */
function CardBody({ card, accent }: { card: Card; accent: string }) {
  if (card.src) return <CapturedCard src={card.src} />;
  return (
    <div style={{ position: "absolute", inset: 0, padding: "30px 36px", font: `450 26px ${SANS}`, color: INK, lineHeight: 1.42 }}>
      {(card.by || card.handle) && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: hexMix(accent, WHITE, 0.55) }} />
          <span style={{ fontWeight: 650 }}>{card.by}</span>
          {card.handle && <span style={{ color: "#6b6b78" }}>{card.handle}</span>}
        </div>
      )}
      {card.tag && <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 14px", borderRadius: 999, background: alpha(accent, 0.12), color: accent, font: `650 21px ${SANS}`, marginBottom: 10 }}>{card.tag}</div>}
      {card.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
/** the product's own card (public/panel-capture.js), its frozen HTML drawn inline at the card's width */
function CapturedCard({ src }: { src: string }) {
  const [html, setHtml] = useState("");
  const [k, setK] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    document.documentElement.dataset.baking = "1";
    fetch(src)
      .then((r) => (r.ok ? r.text() : ""))
      .then((s) => live && setHtml(s))
      .catch(() => null)
      .finally(() => setTimeout(() => delete document.documentElement.dataset.baking, 60));
    return () => {
      live = false;
    };
  }, [src]);
  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>("[data-unfold-root]");
    if (root?.offsetWidth) setK(900 / root.offsetWidth);
  }, [html]);
  return <div ref={box} style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${k})` }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** a line word by word: each word there almost at once as the reveal passes it, the words from `from` on in the accent */
function ByWord({ text, k, from, accent }: { text: string; k: number; from: number; accent: string }) {
  const ws = text.split(/(\s+)/);
  const n = ws.filter((w) => w.trim()).length;
  let i = -1;
  return (
    <>
      {ws.map((w, j) => {
        if (!w.trim()) return <span key={j}>{w}</span>;
        i++;
        const v = Math.max(0, Math.min(1, (k * n - i) * 2.5));
        return (
          <span key={j} style={{ display: "inline-block", opacity: v, transform: `translateY(${(1 - v) * 14}px)`, filter: v < 0.98 ? `blur(${(1 - v) * 5}px)` : undefined, color: i >= from ? accent : undefined }}>
            {w}
          </span>
        );
      })}
    </>
  );
}

/** a panel's params for the unfold's body, from what the flow says of it */
export const panelParams = (c: El["c"], accent: string, defaults: UnfoldParams): UnfoldParams => {
  const p = (c?.panel ?? {}) as { title?: string; rows?: string[]; ctas?: string[]; src?: string };
  return { ...defaults, title: p.title ?? "", rows: (p.rows ?? []).join("|"), ctas: (p.ctas ?? []).join("|"), src: p.src ?? "", accent, ground: "none", grain: 0, panel: "light" };
};
/** the unfold's clock for a panel's build (0 → 1): from the title starting to type to the panel whole */
export const buildClock = (b: number) => 0.55 + Math.max(0, Math.min(1, b)) * (6.05 - 0.55);

/* ---------------- one element ---------------- */

/** An element drawn at its state `p` (motion blur from how far it moved since the frame before). `mb`: that blur. */
export function ElView({ e, p, t, mb, accent, panel, panelP, zHand }: { e: El; p: P; t: number; mb: number; accent: string; panel?: PanelState; panelP?: UnfoldParams; zHand?: number }) {
  const c = (e.c ?? {}) as Record<string, unknown>;
  const blur = p.blur + mb;
  const base: CSSProperties = { position: "absolute", opacity: p.o, filter: blurOf(blur) };
  const box = (extra: CSSProperties = {}): CSSProperties => ({ ...base, left: p.x - p.w / 2, top: p.y - p.h / 2, width: p.w, height: p.h, borderRadius: Math.min(p.r, p.w / 2, p.h / 2), transform: turned(p), ...extra });
  let body: ReactNode = null;
  switch (e.kind) {
    case "box": {
      // glass by degrees: the fill thinning to a frost, its edge coming up (a solid card becoming a glass pill, smoothly)
      const g = Math.max(0, Math.min(1, p.gl));
      const n = parseInt((/^#([0-9a-f]{6})$/i.exec(p.fill)?.[1] ?? "ffffff"), 16);
      const fill = g > 0 ? `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${1 - g * 0.74})` : p.fill;
      body = <div style={box({ background: fill, backdropFilter: g > 0.02 ? `blur(${22 * g}px) saturate(${1 + 0.3 * g})` : undefined, border: g > 0.02 ? `1.5px solid rgba(255,255,255,${0.55 * g})` : undefined, boxShadow: shadow(Math.max(p.lift, 0.5 * (1 - g))) })} />;
      break;
    }
    case "send":
      body = (
        <div style={{ ...base, left: p.x - p.w / 2, top: p.y - p.w / 2, width: p.w, height: p.w, borderRadius: p.w / 2, background: INK, transform: `scale(${p.s})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={p.w * 0.42} height={p.w * 0.42} viewBox="0 0 20 20" fill="none" stroke={WHITE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
          </svg>
        </div>
      );
      break;
    case "text": {
      const text = String(c.text ?? "");
      const size = Number(c.size ?? 64);
      const weight = Number(c.weight ?? 500);
      const color = e.keys.some((k) => k.fill !== undefined) ? p.fill : String(c.color ?? WHITE);
      const align = (c.align as string) ?? "center";
      const width = c.width ? Number(c.width) : measure(text, `${weight} ${size}px ${SANS}`) + 8;
      const left = align === "center" ? p.x - width / 2 : align === "right" ? p.x - width : p.x;
      const top = c.top ? p.y : p.y - size * 0.68;
      const clip = p.cx > 0 ? Math.max(0, p.cx - left) : 0;
      // (past its last typed key the count goes on at the speed it was typed, so the newest letters settle)
      const tk = e.keys.filter((k) => k.typed !== undefined).sort((a, b) => a.t - b.t);
      const tl = tk[tk.length - 1];
      const tp = tk[tk.length - 2];
      const cps = tl && tp && tl.t > tp.t ? (tl.typed! - tp.typed!) / (tl.t - tp.t) : 60;
      const typed = p.typed < 1e5 ? p.typed + (tl && t > tl.t ? (t - tl.t) * Math.max(20, cps) : 0) : undefined;
      const byWord = c.mode === "words";
      body = (
        <div style={{ ...base, left, top, width, transformOrigin: align === "center" ? "50% 50%" : align === "right" ? "100% 50%" : "0 50%", transform: `scale(${p.s}) rotate(${p.rot}deg)`, fontFamily: SANS, fontSize: size, fontWeight: weight, letterSpacing: size > 40 ? "-0.025em" : "-0.01em", lineHeight: c.top ? 1.36 : 1.3, color, whiteSpace: c.width ? "normal" : "nowrap", clipPath: clip ? `inset(-20% -10% -20% ${clip}px)` : undefined, ...(byWord ? {} : wipe(p.reveal)) }}>
          {typed !== undefined ? <Stream text={text} n={typed} tail={String(c.tail ?? accent)} /> : byWord ? <ByWord text={text} k={p.reveal} from={Number(c.accentFrom ?? 1e9)} accent={hexMix(String(c.accent ?? accent), WHITE, 0.25)} /> : text}
        </div>
      );
      break;
    }
    case "cursor":
      body = (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: p.o }}>
          <Cursor x={p.x - 8} y={p.y - 4} press={1 - p.s > 0 ? Math.min(1, (1 - p.s) / 0.15) : 0} hand size={1.6} />
        </div>
      );
      break;
    case "glow":
      body = <div style={{ position: "absolute", left: p.x - p.w / 2, top: p.y - p.w / 2, width: p.w, height: p.w, borderRadius: "50%", opacity: p.o, background: `radial-gradient(closest-side, ${alpha(hexMix(p.fill, WHITE, 0.55), 0.95)}, ${alpha(p.fill, 0.45)} 45%, transparent)`, mixBlendMode: "screen", pointerEvents: "none" }} />;
      break;
    case "ring":
      body = <div style={{ ...base, left: p.x - p.w / 2, top: p.y - p.w / 2, width: p.w, height: p.w, borderRadius: "50%", border: "2px solid rgba(17,17,20,0.12)", boxSizing: "border-box" }} />;
      break;
    case "chip": {
      // a name in a pill, dark or light, out of a glow of the accent while it's still arriving
      const dark = !!c.dark;
      const glowK = Math.min(1, p.blur / 12);
      body = (
        <div style={{ ...base, left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${p.s}) rotate(${p.rot}deg)`, padding: "14px 26px", borderRadius: 18, background: dark ? INK : WHITE, color: dark ? hexMix(String(c.accent ?? accent), WHITE, 0.3) : INK, fontFamily: SANS, fontWeight: 650, fontSize: 30, whiteSpace: "nowrap", boxShadow: `0 0 ${40 + 60 * glowK}px ${alpha(String(c.accent ?? accent), 0.25 + 0.5 * glowK)}, 0 14px 30px -12px rgba(0,0,0,0.35)` }}>
          {String(c.text ?? "")}
        </div>
      );
      break;
    }
    case "mark": {
      const d = p.w;
      body = c.plain ? (
        <div style={{ ...base, left: p.x - d / 2, top: p.y - d / 2, width: d, height: d, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${p.s})` }}>
          <Logo logo={c.logo as string | undefined} name={String(c.name ?? "")} size={d} />
        </div>
      ) : (
        <div style={{ ...base, left: p.x - d / 2, top: p.y - d / 2, width: d, height: d, borderRadius: d / 2, background: INK, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${p.s})` }}>
          <Logo logo={c.logo as string | undefined} name={String(c.name ?? "")} size={d * 0.7} />
        </div>
      );
      break;
    }
    case "icon": {
      const d = p.w;
      body = (
        <div style={{ ...base, left: p.x - d / 2, top: p.y - d / 2, width: d, height: d, borderRadius: d * 0.23, background: WHITE, boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)", transform: turned(p), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Logo logo={c.logo as string | undefined} name={String(c.name ?? "")} size={d * 0.6} color={INK} />
        </div>
      );
      break;
    }
    case "media":
      body = (
        <div style={box({ overflow: "hidden", background: p.fill, boxShadow: shadow(Math.max(0.6, p.lift)), transformOrigin: "0 0" })}>
          <div style={{ position: "absolute", inset: 0, opacity: p.co }}>
            <Slot src={String(c.src ?? "")} t={Math.max(0, t - e.a)} />
          </div>
        </div>
      );
      break;
    case "card": {
      const card = c.card as Card;
      body = (
        <div style={box({ overflow: "hidden", background: c.bare ? "transparent" : p.fill, boxShadow: c.bare ? undefined : shadow(Math.max(0.6, p.lift)) })}>
          <div style={{ position: "absolute", left: (p.w - 900) / 2, top: 0, width: 900, height: p.h, opacity: p.co, filter: blurOf((1 - p.co) * 10) }}>
            <CardBody card={card} accent={accent} />
          </div>
        </div>
      );
      break;
    }
    case "assembly": {
      // a component built piece by piece, `w` wide in the world, centred at (x, y)
      const a = c.a as Assembly;
      const k = p.w / Number(c.cw ?? a.w);
      body = (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: p.o, filter: blurOf(blur), transformOrigin: "0 0", transform: `translate(${p.x - (a.w * k) / 2}px, ${p.y - (a.h * k) / 2}px) scale(${k})` }}>
          <AssemblyView src={String(c.src)} a={a} t={t} accent={accent} />
        </div>
      );
      break;
    }
    case "panel": {
      if (!panel || !panelP) break;
      // placed so its pill sits at (x, y), the pill as tall as w: the shape it was arrived through
      const G = panel.G;
      const k = p.w / G.pill.h;
      const pcx = G.pill.left + G.pill.h / 2;
      const pcy = G.pill.top + G.pill.h / 2;
      body = (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: p.o, filter: blurOf(blur), transformOrigin: "0 0", transform: `translate(${p.x - pcx * k}px, ${p.y - pcy * k}px) scale(${k})` }}>
          <PanelBody P={panel} p={panelP} t={buildClock(p.build)} zHand={(zHand ?? 1) * k} />
        </div>
      );
      break;
    }
  }
  return <>{body}</>;
}
