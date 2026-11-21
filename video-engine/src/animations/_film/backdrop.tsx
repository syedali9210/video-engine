// A backdrop drawn (src/studio/backdrop.ts says which and in what colours): moving graphics behind words alone, a pure
// function of the clock. Every layer has a depth: it moves against the camera (its shift, turn, roll and zoom) by that
// much, so the camera's angles read in the ground too. Kept quiet behind the words (a soft mask round them) and
// answering them: each word landing (a beat) lifts it a little.
import type { ReactNode } from "react";
import type { Backdrop } from "../../studio/backdrop";

const W = 1920;
const H = 1080;
export type Cam = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/** a seeded random sequence (mulberry32) */
function rng(seed: number) {
  let a = seed * 2654435761 + 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgba = (c: string, a: number) => {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
/** how much the words landing lift it at t: each beat a quick rise and a slower fall */
const lift = (t: number, beats: number[]) => beats.reduce((a, b) => (t >= b ? a + Math.exp(-(t - b) * 2.6) * Math.min(1, (t - b) / 0.06) : a), 0);

export function BackdropView({ b, t, cam, shift }: { b: Backdrop; t: number; cam?: Partial<Cam>; shift?: { x: number; y: number } }) {
  const c = { z: 1, rx: 0, ry: 0, rz: 0, ...cam };
  const s = shift ?? { x: 0, y: 0 };
  const tt = Math.max(0, t - b.t0) * b.speed;
  const up = Math.min(1, lift(t, b.beats));
  /** a layer at a depth (0: far, 1: near): its move against the camera */
  const at = (d: number) => `translate(${(s.x - c.ry * 9) * d} ${(s.y + c.rx * 7) * d}) rotate(${c.rz * 0.6 * d} ${W / 2} ${H / 2}) translate(${W / 2} ${H / 2}) scale(${1 + (c.z - 1) * 0.14 * d}) translate(${-W / 2} ${-H / 2})`;
  const r = rng(b.seed + 11);
  const A = b.amount;
  const q = b.quiet;
  const id = `bd${b.seed}`;
  let body: ReactNode = null;

  if (b.kind === "orbs") {
    const orbs = Array.from({ length: 5 }, (_, i) => ({ x: 0.12 + r() * 0.76, y: 0.15 + r() * 0.7, R: 190 + r() * 210, w: 0.1 + r() * 0.12, p: r() * 6.28, d: 0.3 + r() * 0.7, c: b.colors[i % b.colors.length] }));
    body = orbs.map((o, i) => {
      const x = o.x * W + Math.sin(tt * o.w + o.p) * 150;
      const y = o.y * H + Math.cos(tt * o.w * 0.8 + o.p * 1.3) * 110;
      return (
        <g key={i} transform={at(o.d)}>
          <circle cx={x} cy={y} r={o.R * (1 + up * 0.06)} fill={`url(#${id}o${i % b.colors.length})`} opacity={A * (0.55 + 0.35 * o.d) * (1 + up * 0.35)} />
        </g>
      );
    });
  } else if (b.kind === "ribbons") {
    body = Array.from({ length: 3 }, (_, i) => {
      const base = H * (0.32 + i * 0.2 + (r() - 0.5) * 0.08);
      const amp = 70 + r() * 90;
      const f = 0.0016 + r() * 0.0012;
      const ph = r() * 6.28;
      const d = 0.4 + i * 0.25;
      const pts: string[] = [];
      for (let x = -240; x <= W + 240; x += 60) pts.push(`${x},${(base + amp * Math.sin(x * f + tt * 0.55 + ph) + amp * 0.4 * Math.sin(x * f * 2.3 - tt * 0.37 + ph)).toFixed(1)}`);
      return (
        <g key={i} transform={at(d)} filter={`url(#${id}soft)`}>
          <polyline points={pts.join(" ")} fill="none" stroke={`url(#${id}r${i})`} strokeWidth={90 + i * 40} strokeLinecap="round" strokeLinejoin="round" opacity={A * (0.75 + up * 0.25)} />
        </g>
      );
    });
  } else if (b.kind === "grid") {
    // a floor receding to a horizon, the camera's tilt raising or lowering it, its turn moving where it vanishes
    const hy = H * 0.62 + c.rx * 14;
    const vx = W / 2 - c.ry * 22;
    const lines: ReactNode[] = [];
    for (let i = -16; i <= 16; i++) lines.push(<line key={`v${i}`} x1={vx + i * 22} y1={hy} x2={vx + i * 260} y2={H + 60} stroke={b.colors[1]} strokeWidth={1.2} opacity={A * 0.55} />);
    const phase = (tt * 0.45) % 1;
    for (let k = 0; k < 16; k++) {
      const z = 16 - k - phase;
      if (z < 0.6) continue;
      const y = hy + 560 / z;
      if (y > H + 40) continue;
      lines.push(<line key={`h${k}`} x1={0} y1={y} x2={W} y2={y} stroke={b.colors[1]} strokeWidth={1.1 + 1.2 / z} opacity={A * Math.min(0.75, 1.6 / z) * (1 + up * 0.4)} />);
    }
    body = (
      <>
        <g transform={at(0.25)}>
          <ellipse cx={vx} cy={hy} rx={W * 0.55} ry={150 + up * 30} fill={`url(#${id}o0)`} opacity={A * 0.9} />
        </g>
        <g transform={at(0.5)} mask={`url(#${id}floor)`}>
          {lines}
        </g>
      </>
    );
  } else if (b.kind === "rings") {
    // one ring opening from behind the words as each lands, and one every so often between
    const every = 1.7;
    const emits = [...b.beats, ...Array.from({ length: Math.ceil((t - b.t0) / every) + 1 }, (_, k) => b.t0 + k * every)].filter((e) => e <= t && t - e < 4.2);
    body = (
      <g transform={at(0.6)}>
        {emits.map((e, i) => {
          const a = (t - e) * b.speed;
          const R = 70 + 1250 * (1 - Math.exp(-a * 0.9));
          return <circle key={i} cx={q.x * W} cy={q.y * H} r={R} fill="none" stroke={b.colors[i % 2 ? 2 : 1]} strokeWidth={1.4 + 2 * Math.exp(-a)} opacity={A * 1.1 * Math.exp(-a * 0.75) * Math.min(1, (t - e) / 0.08)} />;
        })}
      </g>
    );
  } else if (b.kind === "streaks") {
    const ang = -18;
    const n = 9;
    const span = W + 1600;
    const streaks = Array.from({ length: n }, () => ({ lane: (r() - 0.5) * 1500, L: 500 + r() * 600, v: 700 + r() * 800, off: r() * span, d: 0.3 + r() * 0.7, c: r() }));
    const burst = b.beats.filter((e) => e <= t && t - e < 1.4).map((e, i) => ({ lane: (rng(b.seed + i * 7)() - 0.5) * 900, L: 900, v: 2300, off: -(e - b.t0) * 2300 * b.speed + 0, d: 0.9, c: 0.5, from: e }));
    body = (
      <g transform={`rotate(${ang} ${W / 2} ${H / 2})`}>
        {[...streaks, ...burst].map((k, i) => {
          const pos = (((tt * k.v + k.off) % span) + span) % span - 800;
          const y = H / 2 + k.lane;
          return (
            <g key={i} transform={at(k.d)}>
              <line x1={pos - k.L} y1={y} x2={pos} y2={y} stroke={`url(#${id}s)`} strokeWidth={1.5 + k.d * 2.2} strokeLinecap="round" opacity={A * (0.5 + 0.5 * k.d)} />
            </g>
          );
        })}
      </g>
    );
  } else if (b.kind === "dust") {
    const motes = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, d: r(), v: 14 + r() * 30, tw: r() * 6.28 }));
    const bokeh = Array.from({ length: 9 }, (_, i) => ({ x: r() * W, y: r() * H, R: 10 + r() * 18, v: 10 + r() * 16, c: b.colors[i % b.colors.length] }));
    body = (
      <>
        <g transform={at(0.3)}>
          {motes.map((m, i) => {
            const y = ((((m.y - tt * m.v * (0.5 + m.d)) % (H + 40)) + H + 40) % (H + 40)) - 20;
            return <circle key={i} cx={m.x + Math.sin(tt * 0.3 + m.tw) * 12} cy={y} r={0.9 + m.d * 2.2} fill={b.colors[2]} opacity={A * (0.35 + 0.6 * m.d) * (0.7 + 0.3 * Math.sin(tt * 1.3 + m.tw)) * (1 + up * 0.5)} />;
          })}
        </g>
        <g transform={at(0.9)}>
          {bokeh.map((m, i) => {
            const y = ((((m.y - tt * m.v) % (H + 80)) + H + 80) % (H + 80)) - 40;
            return <circle key={i} cx={m.x} cy={y} r={m.R} fill={`url(#${id}o${i % b.colors.length})`} opacity={A * 0.8} />;
          })}
        </g>
      </>
    );
  } else {
    // contours: loops round a point off the words, slowly reshaping and turning
    const cx = (q.x + (q.x > 0.5 ? -0.24 : 0.24)) * W;
    const cy = (q.y + 0.12) * H;
    body = (
      <g transform={at(0.55)}>
        {Array.from({ length: 8 }, (_, k) => {
          const R = 110 + k * 92;
          const pts: string[] = [];
          for (let j = 0; j <= 96; j++) {
            const th = (j / 96) * Math.PI * 2;
            const rr = R * (1 + 0.07 * Math.sin(3 * th + tt * 0.32 + k) + 0.045 * Math.sin(5 * th - tt * 0.21 + k * 1.7) + up * 0.02);
            pts.push(`${(cx + rr * Math.cos(th + tt * 0.03)).toFixed(1)},${(cy + rr * 0.78 * Math.sin(th + tt * 0.03)).toFixed(1)}`);
          }
          // (the lighter colours on a dark ground, the deeper on a light one: lines have to show)
          return <polygon key={k} points={pts.join(" ")} fill="none" stroke={b.dark ? b.colors[k % 2 ? 1 : 2] : b.colors[k % 2 ? 2 : 3]} strokeWidth={1.6} opacity={Math.min(1, A * 1.5 * (1 - k / 11) * (1 + up * 0.3))} />;
        })}
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden>
      <defs>
        {b.colors.map((col, i) => (
          <radialGradient key={i} id={`${id}o${i}`}>
            <stop offset="0" stopColor={rgba(col, 0.95)} />
            <stop offset="0.45" stopColor={rgba(col, 0.42)} />
            <stop offset="1" stopColor={rgba(col, 0)} />
          </radialGradient>
        ))}
        {[0, 1, 2].map((i) => (
          <linearGradient key={i} id={`${id}r${i}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={rgba(b.colors[(i + 1) % b.colors.length], 0)} />
            <stop offset="0.5" stopColor={rgba(b.colors[(i + 1) % b.colors.length], 0.9)} />
            <stop offset="1" stopColor={rgba(b.colors[(i + 2) % b.colors.length], 0)} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}s`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={rgba(b.colors[2], 0)} />
          <stop offset="1" stopColor={rgba(b.colors[2], 1)} />
        </linearGradient>
        <filter id={`${id}soft`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        {/* quiet behind the words: the whole of it, less round where they sit */}
        <radialGradient id={`${id}q`} cx={q.x} cy={q.y} r={Math.max(q.w, q.h * 1.6) * 1.5} gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="0.6" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#fff" stopOpacity={1} />
        </radialGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill={`url(#${id}q)`} />
        </mask>
        <linearGradient id={`${id}fl`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.75" stopColor="#fff" stopOpacity={1} />
        </linearGradient>
        <mask id={`${id}floor`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill={`url(#${id}fl)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`} style={{ mixBlendMode: b.dark ? "screen" : "normal" }}>
        {body}
      </g>
    </svg>
  );
}
