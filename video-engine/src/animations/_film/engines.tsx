// The engines drawn (src/studio/engines.ts says what): dither, cartoon, motion graphics in panels, and embeds of any of
// them in styled frames. Each fills the box it's given and is a pure function of the clock (frame-exact for export).
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import type { CartoonSpec, DitherSpec, EmbedSpec, EngineSpec, MographSpec, Shape } from "../../studio/engines";
import { satinField } from "../../studio/field";
import { SatinView } from "./satin";

const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
const inOut = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const back = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
};
const rgb = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** a seeded wobble: the same at the same (i, frame), so lines boil on eights, not every frame */
const wob = (i: number, k: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233 + seed * 3.7) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

/* ---------------- dither ---------------- */

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);

/** how light the subject is at (u, v) (−1…1 down the height, wider across), t seconds in */
function lightAt(s: DitherSpec["subject"], u: number, v: number, t: number): number {
  const open = ease(t / 1.6);
  if (s === "butterfly") {
    // its wings: the butterfly curve, folded shut at first, opening, then flapping; eyespots, a dark body
    const flap = open < 1 ? 0.12 + 0.88 * open : 0.74 + 0.26 * Math.cos((t - 1.6) * 4.6);
    const x = u / Math.max(0.06, flap);
    const y = -v + 0.15;
    const r = Math.hypot(x, y);
    const th = Math.atan2(y, Math.abs(x));
    const R = 0.24 * (Math.exp(Math.sin(th)) - 2 * Math.cos(4 * th) + Math.sin((2 * th - Math.PI) / 24) ** 5);
    if (Math.abs(u) < 0.025 && Math.abs(v) < 0.42) return 0.06;
    if (r > R) return 0;
    const spot = Math.hypot(Math.abs(x) - 0.33, y - 0.18) < 0.09 || Math.hypot(Math.abs(x) - 0.22, y + 0.28) < 0.06 ? 0.1 : 0;
    return Math.max(0, Math.min(1, 1.1 - 0.5 * (r / R) + 0.2 * Math.sin(th * 6) * (r / R) - spot * 6));
  }
  if (s === "flower") {
    // petals unfolding from a bud, an inner ring after the outer, the centre a dotted disc
    const r = Math.hypot(u, v);
    const th = Math.atan2(v, u) + t * 0.15;
    const disc = 0.1 + 0.03 * open;
    if (r < disc) return 0.25 + 0.5 * ((Math.floor((u + 1) * 40) + Math.floor((v + 1) * 40)) % 2);
    let best = 0;
    for (const [n, len, lag, rot] of [[7, 0.82, 0, 0], [7, 0.5, 0.35, Math.PI / 7]] as const) {
      const o = ease((t - lag) / 1.7);
      const L = disc + (len - disc) * o;
      const a = (((th + rot) % ((2 * Math.PI) / n)) + (2 * Math.PI) / n) % ((2 * Math.PI) / n) - Math.PI / n;
      const w = (0.12 + 0.26 * o) * Math.sin(Math.PI * Math.min(1, (r - disc * 0.6) / Math.max(0.01, L - disc * 0.6))) ** 0.8;
      if (r < L && Math.abs(a) < w) best = Math.max(best, 0.35 + 0.55 * (r / L) - 0.4 * (Math.abs(a) / Math.max(0.01, w)) ** 2 + (len < 0.6 ? 0.1 : 0));
    }
    return Math.max(0, Math.min(1, best));
  }
  if (s === "orb") {
    // a lit sphere turning, bands across it, the light coming round
    const R = 0.15 + 0.65 * open;
    const x = u / R;
    const y = v / R;
    const d = x * x + y * y;
    if (d > 1) return 0.04 * Math.exp(-(Math.sqrt(d) - 1) * 6);
    const z = Math.sqrt(1 - d);
    const lx = Math.cos(t * 0.6) * 0.6;
    const ly = -0.45;
    const lz = 0.66;
    const dif = Math.max(0, x * lx + y * ly + z * lz);
    const bands = 0.12 * Math.sin(Math.asin(y) * 9 + t * 1.4);
    return Math.max(0, Math.min(1, 0.08 + 0.9 * dif + bands * dif));
  }
  // ripple: rings opening from the middle, fading out
  const r = Math.hypot(u, v);
  return Math.max(0, (0.5 + 0.5 * Math.sin(r * 22 - t * 5)) * Math.exp(-r * 1.6) * Math.min(1, t * 1.2));
}

export function DitherView({ s, t, w, h }: { s: DitherSpec; t: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gw = Math.max(16, Math.round(w / s.cell));
  const gh = Math.max(9, Math.round(h / s.cell));
  useLayoutEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    const img = g.createImageData(gw, gh);
    const ink = rgb(s.ink);
    const paper = rgb(s.paper);
    const tt = Math.max(0, t - s.t0);
    const asp = gw / gh;
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const u = ((x + 0.5) / gw - 0.5) * 2 * asp;
        const v = ((y + 0.5) / gh - 0.5) * 2;
        const L = lightAt(s.subject, u * 1.05, v * 1.05, tt);
        const on = L > BAYER[(y % 8) * 8 + (x % 8)];
        const c = on ? ink : paper;
        const i = (y * gw + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  });
  return <canvas ref={ref} width={gw} height={gh} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }} />;
}

/* ---------------- cartoon ---------------- */

/** a closed wobbly loop round (cx, cy): a hand-drawn ring, boiling on eights */
function loop(cx: number, cy: number, rx: number, ry: number, k: number, seed: number, amp = 6) {
  const pts: string[] = [];
  for (let j = 0; j <= 48; j++) {
    const a = (j / 48) * Math.PI * 2;
    const r = 1 + (wob(j % 48, k, seed) * amp) / Math.max(rx, 40);
    pts.push(`${(cx + Math.cos(a) * rx * r).toFixed(1)},${(cy + Math.sin(a) * ry * r).toFixed(1)}`);
  }
  return `M${pts.join(" L")}Z`;
}
/** a flower's outline as one line (petals round a middle), for drawing on */
function flowerPath(cx: number, cy: number, R: number, n: number, k: number, seed: number) {
  let d = "";
  for (let i = 0; i <= n * 24; i++) {
    const a = (i / (n * 24)) * Math.PI * 2;
    const r = R * (0.55 + 0.45 * Math.abs(Math.sin((a * n) / 2))) * (1 + wob(i % (n * 24), k, seed) * 0.03);
    d += `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + "Z";
}
/** squash and stretch as a thing pops in */
const pop = (u: number): string => {
  const x = Math.max(0, Math.min(1, u));
  const s = back(x);
  const st = 1 + 0.18 * Math.sin(x * Math.PI) * (1 - x);
  return `scale(${(s * st).toFixed(3)}, ${(s / st).toFixed(3)})`;
};

export function CartoonView({ s, t }: { s: CartoonSpec; t: number }) {
  const tt = Math.max(0, t - s.t0);
  const k = Math.floor(tt * 8);
  const W = 1920;
  const H = 1080;
  const cx = W / 2;
  const cy = H / 2;
  const lines: ReactNode[] = [];
  if (s.pattern === "rings")
    for (let i = 0; i < 14; i++) lines.push(<path key={i} d={loop(cx - 80, cy + 20, 90 + i * 120 + ((tt * 30) % 120), 55 + i * 78 + ((tt * 20) % 78), k, s.seed + i)} fill="none" stroke={s.lines} strokeWidth={9} />);
  else
    for (let i = -10; i < 22; i++) {
      let d = "";
      for (let j = 0; j <= 40; j++) {
        const x = -200 + j * 60;
        const y = i * 70 + x * 0.55 + Math.sin(j * 0.6 + i) * 14 + wob(j, k, s.seed + i) * 5 - ((tt * 40) % 70);
        d += `${j ? "L" : "M"}${x},${y.toFixed(1)}`;
      }
      lines.push(<path key={i} d={d} fill="none" stroke={s.lines} strokeWidth={9} strokeLinecap="round" />);
    }
  let subject: ReactNode = null;
  if (s.subject === "flower") {
    // one white line drawing itself into a flower, then breathing
    const d = flowerPath(cx, cy, 150, 5, k, s.seed);
    const len = 2600;
    const on = ease(tt / 1.8);
    subject = <path d={d} fill="none" stroke={s.ink} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - on)} transform={`rotate(${(-20 * (1 - on)).toFixed(1)} ${cx} ${cy})`} />;
  } else if (s.subject === "blob") {
    // a blob icon popping in, a flower in it, then its arrow bumping on
    const a = Math.min(1, tt / 0.55);
    const b = Math.min(1, Math.max(0, (tt - 1.1) / 0.45));
    subject = (
      <g>
        <g style={{ transformOrigin: `${cx}px ${cy}px`, transform: pop(a) }}>
          <path d={loop(cx, cy, 190, 175, k, s.seed, 18)} fill={s.fills[1]} />
          <path d={flowerPath(cx, cy, 105, 5, k, s.seed + 3)} fill={s.fills[4]} />
          <circle cx={cx} cy={cy} r={34} fill={s.fills[3]} />
        </g>
        {b > 0 && (
          <g style={{ transformOrigin: `${cx - 20}px ${cy + 70}px`, transform: `${pop(b)} rotate(${(-22 * (1 - b)).toFixed(1)}deg)` }}>
            <path d={loop(cx - 20, cy + 70, 115, 80, k, s.seed + 9, 14)} fill="#e0402f" transform={`rotate(-28 ${cx - 20} ${cy + 70})`} />
            <path d={`M${cx - 60},${cy + 74} L${cx + 20},${cy + 70} M${cx - 8},${cy + 44} L${cx + 22},${cy + 70} L${cx - 6},${cy + 98}`} fill="none" stroke="#fff" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
    );
  } else {
    // doodles round the middle: cards popping in, outlined flowers drawing themselves
    const cards = [[-560, -170, 230, 330, 0], [-430, 40, 330, 230, 1], [440, -230, 300, 170, 2], [500, 70, 190, 200, 0]] as const;
    const flowers = [[-300, -210, 70], [-150, -260, 48], [330, 170, 60], [-260, 220, 58], [180, -250, 44]] as const;
    subject = (
      <g>
        {cards.map(([x, y, w, h, f], i) => {
          const u = Math.min(1, Math.max(0, (tt - i * 0.18) / 0.5));
          return (
            <g key={i} style={{ transformOrigin: `${cx + x + w / 2}px ${cy + y + h / 2}px`, transform: `${pop(u)} rotate(${(wob(i, Math.floor(k / 4), s.seed) * 6).toFixed(1)}deg)` }}>
              <rect x={cx + x} y={cy + y} width={w} height={h} rx={10} fill={s.fills[f]} />
              <path d={loop(cx + x + w / 2, cy + y + h / 2, w * 0.28, h * 0.24, k, s.seed + i, 8)} fill="none" stroke={s.fills[4]} strokeWidth={8} />
            </g>
          );
        })}
        {flowers.map(([x, y, r], i) => {
          const on = ease((tt - 0.5 - i * 0.15) / 0.9);
          return <path key={`f${i}`} d={flowerPath(cx + x, cy + y, r, 5, k, s.seed + 20 + i)} fill="none" stroke={s.fills[2]} strokeWidth={6} strokeDasharray={1400} strokeDashoffset={1400 * (1 - on)} />;
        })}
      </g>
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <rect width={W} height={H} fill={s.ground} />
      {lines}
      {subject}
    </svg>
  );
}

/* ---------------- motion graphics in panels ---------------- */

function ShapeIn({ shape, ink, u }: { shape: Shape; ink: string; u: number }) {
  const s = back(u);
  const box: CSSProperties = { position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${s.toFixed(3)})`, opacity: Math.min(1, u * 2) };
  if (shape === "flower")
    return (
      <svg viewBox="-100 -100 200 200" style={{ ...box, width: "62%", maxWidth: 200 }}>
        <path d={flowerPath(0, 0, 90, 8, 0, 1)} fill={ink} transform={`rotate(${(u * 40).toFixed(1)})`} />
      </svg>
    );
  if (shape === "moons")
    return (
      <svg viewBox="0 0 200 120" style={{ ...box, width: "70%", maxWidth: 240 }}>
        <path d="M60 0 A60 60 0 0 0 60 120 Z M120 0 A60 60 0 0 0 120 120 Z M180 0 A60 60 0 0 0 180 120 Z" fill={ink} />
      </svg>
    );
  if (shape === "question")
    return (
      <div style={{ ...box, width: 150, height: 150, background: "rgba(0,0,0,0.28)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: '"Geist", system-ui, sans-serif', fontWeight: 700, fontSize: 96, boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>?</div>
    );
  if (shape === "circle") return <div style={{ ...box, width: 220, height: 220, borderRadius: "50%", background: ink }} />;
  return null;
}

export function MographView({ s, t, w, h }: { s: MographSpec; t: number; w: number; h: number }) {
  // the beat we're in, and how far the change into it has gone (0.6 s, strong at both ends)
  const i = Math.max(0, s.beats.findLastIndex((b) => b.at <= t));
  const cur = s.beats[i];
  const prev = s.beats[Math.max(0, i - 1)];
  const u = i === 0 ? ease((t - cur.at) / 0.6) : inOut((t - cur.at) / 0.6);
  const n = Math.max(cur.widths.length, prev.widths.length);
  const wOf = (b: typeof cur, j: number) => b.widths[j] ?? 0;
  const widths = Array.from({ length: n }, (_, j) => (i === 0 ? wOf(cur, j) : wOf(prev, j) + (wOf(cur, j) - wOf(prev, j)) * u));
  let x = i === 0 ? (1 - u) * w * 0.3 : 0;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: (cur.panels[0] ?? prev.panels[0]).fill }}>
      {widths.map((f, j) => {
        const p = cur.panels[j] ?? prev.panels[j];
        const pw = f * w;
        const left = x;
        x += pw;
        if (!p || pw < 1) return null;
        const into = Math.max(0, Math.min(1, (t - cur.at - 0.25 - j * 0.08) / 0.5));
        const bg = p.src ? `center / cover no-repeat url("${p.src}")` : p.to ? `linear-gradient(180deg, ${p.fill}, ${p.to})` : p.fill;
        const pressK = cur.press === j ? Math.max(0, 1 - Math.abs(t - cur.at - 0.95) / 0.12) : 0;
        const sel = cur.select === j ? ease((t - cur.at - 0.6) / 0.35) : 0;
        return (
          <div key={j} style={{ position: "absolute", left, top: 0, width: pw, height: h, background: bg, overflow: "hidden" }}>
            <ShapeIn shape={p.shape} ink={s.shapeInk} u={into} />
            {p.label && (
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${(1 - 0.05 * pressK).toFixed(3)})`, background: "#fff", color: "#111", padding: "14px 22px", fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 40, whiteSpace: "nowrap", opacity: Math.min(1, into * 2), boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                {p.label.slice(0, Math.ceil(p.label.length * Math.min(1, into * 1.6)))} →
              </div>
            )}
            {sel > 0 && <div style={{ position: "absolute", inset: `${(14 + (1 - sel) * 10).toFixed(1)}%`, border: "2px solid #fff", opacity: sel, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- embeds ---------------- */

const FRAMES: Record<EmbedSpec["style"], (r: number) => CSSProperties> = {
  glass: (r) => ({ borderRadius: r, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.35)" }),
  flat: (r) => ({ borderRadius: r * 0.4 }),
  device: (r) => ({ borderRadius: r * 1.2, boxShadow: "0 0 0 14px #111, 0 0 0 16px #2a2a2e, 0 40px 90px -20px rgba(0,0,0,0.5)" }),
  polaroid: () => ({ borderRadius: 4, boxShadow: "0 0 0 18px #fbfaf7, 0 0 0 18px #fbfaf7, 0 34px 70px -20px rgba(0,0,0,0.35)" }),
};

export function EmbedView({ s, t, w, h }: { s: EmbedSpec; t: number; w: number; h: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {s.slots.map((sl, i) => {
        const u = ease((t - sl.at) / 0.55);
        const bw = sl.w * w;
        const bh = sl.h * h;
        return (
          <div key={i} style={{ position: "absolute", left: sl.x * w, top: sl.y * h, width: bw, height: bh, overflow: "hidden", opacity: u, transform: `translateY(${((1 - u) * 40).toFixed(1)}px) scale(${(0.94 + 0.06 * u).toFixed(3)}) rotate(${s.style === "polaroid" ? (i % 2 ? 2.5 : -2) : 0}deg)`, ...FRAMES[s.style](Math.min(bw, bh) * 0.06) }}>
            <EngineView s={sl.spec} t={t} w={bw} h={bh} />
          </div>
        );
      })}
    </div>
  );
}

/** any engine, filling a w × h box */
export function EngineView({ s, t, w, h }: { s: EngineSpec; t: number; w: number; h: number }) {
  const satin = useMemo(() => (s.engine === "satin" ? satinField(s.accent, { dark: s.dark, variant: "diagonal" }) : null), [s]);
  switch (s.engine) {
    case "dither":
      return <DitherView s={s} t={t} w={w} h={h} />;
    case "cartoon":
      return <CartoonView s={s} t={t} />;
    case "mograph":
      return <MographView s={s} t={t} w={w} h={h} />;
    case "embed":
      return <EmbedView s={s} t={t} w={w} h={h} />;
    default:
      return satin ? <SatinView s={satin} t={t} /> : null;
  }
}
