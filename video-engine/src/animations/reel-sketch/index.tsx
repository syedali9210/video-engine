// Sketch to screen: a vertical reel. A hand-drawn wireframe on a white card sits beside the finished screen it became,
// and the film cuts to a new sketch each time the screen moves on to a new idea. Rebuilt from a reel studied with
// motiscope: its cut points (1.15, 2.95, 6.41, 7.71, 10.44, 12.21, 14.65 s), its layout on a 1080×1920 frame and its
// colours are the reel's; the product, its mark and the words are params, so it's a template for any product.
import type { CSSProperties, ReactNode } from "react";
import { Baked, Caret, Cursor, Marked, Slot, Spark, Stage, acc, alpha, back, blink, clamp, expo, inOut, lerp, mix, out, seg, unmark, useClock, useFonts, useWebFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;

const DUR = 17.4;
/** the reel's beats, measured (seconds) */
const T = { burst: 1.15, logo: 1.33, spin: 1.75, shatter: 2.62, rain: 2.95, zoom: 3.75, type: 4.3, unzoom: 5.5, drop: 5.82, list: 6.41, bento: 7.71, roll: 10.44, green: 12.05, mood: 12.21, dust: 14.48, lock: 15.95 };
/** where the sketch on the card changes (the reel's own cuts) */
const SKETCH_AT = [0, 1.15, 2.95, 6.41, 7.71, 10.44, 12.21, 14.65];

const FONTS = "https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Instrument+Serif:ital@0;1&family=Outfit:wght@100..900&display=swap";
const HAND = '"Caveat", "Segoe Print", cursive';
const SERIF = '"Instrument Serif", Georgia, serif';
const DISPLAY = '"Outfit", "Geist", system-ui, sans-serif';
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const CORAL = "#e8643c";
const INK = "#1d1d1f";
const GROUND = "#101011";
/** the right panel's own drawing space, scaled up to its 572×1018 box on the frame */
const PW = 360;
const PH = 640;
const PK = 572 / PW;

const rng = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
let ctx2d: CanvasRenderingContext2D | null = null;
const measure = (s: string, font: string) => {
  ctx2d ??= document.createElement("canvas").getContext("2d");
  ctx2d!.font = font;
  return ctx2d!.measureText(s).width;
};
const abs = (x: number, y: number, o: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: x, top: y, ...o });
const fill: CSSProperties = { position: "absolute", inset: 0 };

/* ---------------- the product's mark (a stand-in: a disc with three bars) ---------------- */

function Mark({ s, a, ink = "#000" }: { s: number; a: string; ink?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
      <circle cx="50" cy="50" r="50" fill={a} />
      <rect x="26" y="38" width="11" height="26" rx="5.5" fill={ink} />
      <rect x="44.5" y="25" width="11" height="50" rx="5.5" fill={ink} />
      <rect x="63" y="33" width="11" height="34" rx="5.5" fill={ink} />
    </svg>
  );
}

/** the "made with" glyph: eight rays of a burst, the way the reel signs it */
function Burst({ s, color }: { s: number; color: string }) {
  const rays = [1, 0.72, 0.95, 0.68, 1, 0.75, 0.9, 0.7];
  return (
    <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "block" }}>
      {rays.map((k, i) => {
        const a = (i / rays.length) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={Math.cos(a) * 9} y1={Math.sin(a) * 9} x2={Math.cos(a) * 46 * k} y2={Math.sin(a) * 46 * k} stroke={color} strokeWidth="13" strokeLinecap="round" />;
      })}
    </svg>
  );
}

/* ---------------- the sketches: wobbly marker lines on a white card (160×288) ---------------- */

type Pt = [number, number];
const jit = (r: () => number, a: number) => (r() - 0.5) * 2 * a;
/** a line drawn by hand through the points: each corner a little off, each stretch slightly bowed */
function hand(pts: Pt[], seed: number, close: boolean, wob = 0.8) {
  const r = rng(seed);
  const q = pts.map(([x, y]) => [x + jit(r, wob), y + jit(r, wob)] as Pt);
  if (close) q.push([q[0][0] + jit(r, 1.1), q[0][1] + jit(r, 1.1)]);
  let d = `M${q[0][0].toFixed(1)} ${q[0][1].toFixed(1)}`;
  for (let i = 1; i < q.length; i++) {
    const [x0, y0] = q[i - 1];
    const [x1, y1] = q[i];
    d += ` Q${((x0 + x1) / 2 + jit(r, wob * 0.7)).toFixed(1)} ${((y0 + y1) / 2 + jit(r, wob * 0.7)).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
const box = (x: number, y: number, w: number, h: number, r = 3): Pt[] => [
  [x + r, y],
  [x + w - r, y],
  [x + w, y + r],
  [x + w, y + h - r],
  [x + w - r, y + h],
  [x + r, y + h],
  [x, y + h - r],
  [x, y + r],
];
const ring = (cx: number, cy: number, rad: number, seed = 1, n = 30): Pt[] => {
  const r = rng(seed);
  const a0 = r() * 6;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (i / n) * (Math.PI * 2 + 0.3);
    const k = rad * (1 + jit(r, 0.018));
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
  });
};
const arc = (cx: number, cy: number, rad: number, a0: number, a1: number, n = 14): Pt[] => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(lerp(a0, a1, i / n)) * rad, cy + Math.sin(lerp(a0, a1, i / n)) * rad]);
const scrib = (x: number, y: number, w: number): Pt[] => {
  const n = Math.max(2, Math.round(w / 3.5));
  return Array.from({ length: n + 1 }, (_, i) => [x + (i / n) * w, y + (i % 2 ? -1 : 1) * 0.9]);
};

function S({ pts, seed, close = false, w = 1.45, dash, op = 1 }: { pts: Pt[]; seed: number; close?: boolean; w?: number; dash?: string; op?: number }) {
  return (
    <>
      <path d={hand(pts, seed, close)} fill="none" stroke={INK} strokeOpacity={op} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      {!dash && <path d={hand(pts, seed + 101, close, 1)} fill="none" stroke={INK} strokeOpacity={0.4 * op} strokeWidth={w * 0.65} strokeLinecap="round" />}
    </>
  );
}
const Word = ({ x, y, s, children, w = 500, italic = false, fill: f = INK }: { x: number; y: number; s: number; children: ReactNode; w?: number; italic?: boolean; fill?: string }) => (
  <text x={x} y={y} fontFamily={HAND} fontSize={s} fontWeight={w} fontStyle={italic ? "italic" : undefined} fill={f}>
    {children}
  </text>
);
const Arrow = ({ pts, seed, dash }: { pts: Pt[]; seed: number; dash?: string }) => {
  const [x1, y1] = pts[pts.length - 1];
  const [x0, y0] = pts[pts.length - 2];
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = (da: number): Pt => [x1 - Math.cos(a + da) * 5, y1 - Math.sin(a + da) * 5];
  return (
    <>
      <S pts={pts} seed={seed} dash={dash} w={1} />
      <S pts={[head(0.5), [x1, y1], head(-0.5)]} seed={seed + 3} w={1} />
    </>
  );
};
const MiniMark = ({ x, y, r, seed }: { x: number; y: number; r: number; seed: number }) => (
  <>
    <S pts={ring(x, y, r, seed)} seed={seed} />
    <S pts={[[x - r * 0.4, y - r * 0.18], [x - r * 0.4, y + r * 0.22]]} seed={seed + 1} />
    <S pts={[[x, y - r * 0.45], [x, y + r * 0.45]]} seed={seed + 2} />
    <S pts={[[x + r * 0.4, y - r * 0.28], [x + r * 0.4, y + r * 0.3]]} seed={seed + 3} />
  </>
);
const Dots = ({ seed, n = 14 }: { seed: number; n?: number }) => {
  const r = rng(seed);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={8 + r() * 144} cy={12 + r() * 266} r={0.7 + r() * 0.5} fill={INK} />
      ))}
    </>
  );
};
const Rain = ({ seed, n, y0, y1 }: { seed: number; n: number; y0: number; y1: number }) => {
  const r = rng(seed);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = 10 + r() * 140;
        const y = y0 + r() * (y1 - y0);
        return <S key={i} pts={[[x, y], [x - 1.6, y + 5 + r() * 3]]} seed={seed + i * 7} w={0.9} />;
      })}
    </>
  );
};

function Sketch({ i, p }: { i: number; p: P }) {
  const moods = p.moods.split("|");
  const lead = moods[moods.length - 1] ?? "Play";
  const [small, big] = p.poster.split("|");
  const art: ReactNode[] = [
    // 0: a dock of icons, a cursor clicking the third
    <>
      <S pts={box(10, 118, 140, 26, 9)} seed={1} close />
      {[0, 1, 2, 3, 4].map((k) => (k === 2 ? null : <S key={k} pts={box(16 + k * 26, 123, 20, 16, 3)} seed={10 + k} close />))}
      <S pts={box(68, 123, 20, 16, 3)} seed={12} close />
      <MiniMark x={78} y={131} r={5} seed={20} />
      <S pts={[[79, 133], [79, 146], [82.5, 143], [85, 148.5], [87, 147.5], [84.5, 142], [89, 141.5]]} seed={30} close w={1} />
      <Word x={102} y={168} s={9}>
        click
      </Word>
      <Arrow pts={[[93, 152], [112, 178], [124, 200], [130, 222]]} seed={40} dash="2 3" />
      <S pts={[[140, 108], [143, 103]]} seed={50} w={0.9} />
      <S pts={[[144, 109], [147, 104]]} seed={51} w={0.9} />
    </>,
    // 1: the mark, an arrow saying it spins, and that it shatters
    <>
      <S pts={ring(80, 150, 50, 3)} seed={3} />
      <MiniMark x={80} y={150} r={36} seed={60} />
      <Arrow pts={arc(80, 150, 63, -2.65, -0.55)} seed={70} />
      <Word x={62} y={80} s={9.5}>
        spin
      </Word>
      <S pts={ring(24, 106, 3, 4, 12)} seed={4} />
      <S pts={ring(33, 97, 2.4, 5, 12)} seed={5} />
      {[
        [132, 160],
        [138, 184],
        [128, 206],
        [140, 132],
      ].map(([x, y], k) => (
        <S key={k} pts={[[x, y], [x + 4, y + 3], [x, y + 6]]} seed={80 + k} close w={0.9} />
      ))}
      <Word x={108} y={262} s={9}>
        shatters
      </Word>
    </>,
    // 2: rain, a search bar to zoom into and type in, the results under it
    <>
      <Rain seed={7} n={13} y0={18} y1={118} />
      <Word x={30} y={140} s={9}>
        zoom in + type
      </Word>
      {[
        [12, 146, 1, 1],
        [150, 146, -1, 1],
        [12, 216, 1, -1],
        [150, 216, -1, -1],
      ].map(([x, y, sx, sy], k) => (
        <S key={k} pts={[[x, y + sy * 7], [x, y], [x + sx * 7, y]]} seed={90 + k} w={1} />
      ))}
      <S pts={box(18, 154, 126, 20, 10)} seed={100} close />
      <S pts={ring(28, 164, 3.4, 8, 14)} seed={8} w={1} />
      <S pts={[[30.5, 166.5], [33.5, 169.5]]} seed={101} w={1} />
      <S pts={scrib(38, 164, 70)} seed={102} w={0.8} />
      <S pts={[[114, 158], [114, 170]]} seed={103} w={1} />
      <S pts={box(16, 180, 130, 30, 3)} seed={104} close />
      <S pts={box(21, 186, 10, 10, 1)} seed={105} close w={1} />
      <S pts={scrib(36, 190, 64)} seed={106} w={0.8} />
      <S pts={scrib(36, 198, 40)} seed={107} w={0.8} />
      <Rain seed={9} n={3} y0={226} y1={262} />
    </>,
    // 3: a playlist: the cover, its title, a play button and the tracks
    <>
      <S pts={box(52, 30, 84, 84, 4)} seed={110} close />
      <S pts={box(57, 35, 6, 6, 1)} seed={111} close w={0.9} />
      <Rain seed={11} n={4} y0={52} y1={96} />
      <S pts={scrib(14, 140, 84)} seed={112} w={0.9} />
      <S pts={scrib(14, 148, 34)} seed={113} w={0.9} />
      <Arrow pts={[[126, 112], [130, 132], [128, 150], [132, 163]]} seed={114} dash="1.5 2.5" />
      <S pts={ring(133, 172, 8, 12, 18)} seed={12} w={1} />
      <S pts={[[130.5, 168], [137, 172], [130.5, 176]]} seed={115} close w={0.9} />
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <S pts={box(16, 200 + k * 17, 9, 9, 1)} seed={120 + k} close w={1} />
          <S pts={scrib(30, 205 + k * 17, 76 - k * 10)} seed={124 + k} w={0.8} />
        </g>
      ))}
    </>,
    // 4: a wall of covers, three columns, a finger tapping one
    <>
      {[
        [10, 40, 44, 60],
        [10, 106, 44, 62],
        [10, 174, 44, 104],
        [60, 22, 44, 64],
        [60, 92, 44, 82],
        [60, 180, 44, 98],
        [110, 50, 40, 62],
        [110, 118, 40, 96],
        [110, 220, 40, 62],
      ].map(([x, y, w, h], k) => (
        <S key={k} pts={box(x, y, w, h, 3)} seed={130 + k} close />
      ))}
      <S pts={ring(97, 150, 4, 13, 14)} seed={13} w={1} />
      <S pts={[[98, 152], [98, 163], [101, 160.5], [103, 165], [105, 164], [103, 159.5], [107, 159]]} seed={140} close w={0.9} />
    </>,
    // 5: the roller: the words before, the last one boxed, and the way it scrolls
    <>
      {moods.slice(-4, -1).map((m, k) => (
        <Word key={k} x={30} y={72 + k * 24} s={11} fill="#5a5a5e">
          {m.toLowerCase()}
        </Word>
      ))}
      <S pts={box(30, 138, 62, 26, 2)} seed={150} close />
      {[
        [30, 138],
        [92, 138],
        [30, 164],
        [92, 164],
      ].map(([x, y], k) => (
        <S key={k} pts={box(x - 1.8, y - 1.8, 3.6, 3.6, 0.5)} seed={151 + k} close w={0.8} />
      ))}
      <Word x={40} y={157} s={19} w={700}>
        {lead}
      </Word>
      <Arrow pts={[[134, 222], [133.5, 160], [134, 66]]} seed={160} />
    </>,
    // 6: the poster: a record, a little ball, the boxed word, the huge word, a star
    <>
      <S pts={ring(32, 74, 13, 14)} seed={14} />
      <S pts={ring(32, 74, 4, 15, 14)} seed={15} w={1} />
      <S pts={ring(140, 74, 3.5, 16, 12)} seed={16} w={1} />
      <S pts={box(38, 136, 26, 14, 1)} seed={170} close w={1} />
      <Word x={41} y={147} s={9}>
        {lead}
      </Word>
      <Word x={68} y={147} s={9}>
        {small}
      </Word>
      <Word x={12} y={196} s={34} w={700} italic>
        {big.toUpperCase()}
      </Word>
      <S pts={[[136, 248], [139, 258], [149, 262], [139, 266], [136, 276], [133, 266], [123, 262], [133, 258]]} seed={171} close w={1} />
      <Dots seed={17} />
    </>,
    // 7: everything flying back into the mark, the name beside it
    <>
      <Arrow pts={[[18, 88], [26, 104], [38, 118]]} seed={180} dash="2 3" />
      <Arrow pts={[[142, 88], [134, 104], [122, 118]]} seed={183} dash="2 3" />
      <Arrow pts={[[24, 276], [28, 262], [36, 248]]} seed={186} dash="2 3" />
      <Arrow pts={[[138, 276], [132, 262], [124, 248]]} seed={189} dash="2 3" />
      <MiniMark x={44} y={200} r={22} seed={190} />
      <Word x={72} y={208} s={21} w={600} italic>
        {p.name}
      </Word>
      <Word x={46} y={242} s={9}>
        {p.line}
      </Word>
      <Dots seed={19} n={10} />
    </>,
  ];
  return (
    <svg viewBox="0 0 160 288" width="100%" height="100%" style={{ display: "block" }}>
      {art[i]}
    </svg>
  );
}

/* ---------------- the screen, scene by scene (drawn at 360×640) ---------------- */

/** icons on a white dock, one of them the product's */
function Icon({ kind, a }: { kind: string; a: string }) {
  const tile: CSSProperties = { width: 52, height: 52, borderRadius: 13, overflow: "hidden", position: "relative", boxShadow: "0 1px 2px rgba(0,0,0,.12)" };
  if (kind === "brand")
    return (
      <div style={{ ...tile, background: "#121212", display: "grid", placeItems: "center" }}>
        <Mark s={34} a={a} />
      </div>
    );
  if (kind === "notes")
    return (
      <div style={{ ...tile, background: "#fff" }}>
        <div style={{ height: 14, background: "linear-gradient(#ffd84a, #f6c428)" }} />
        {[22, 30, 38].map((y) => (
          <div key={y} style={abs(8, y, { width: 36, height: 1.5, background: "#ddd" })} />
        ))}
      </div>
    );
  if (kind === "compass")
    return (
      <div style={{ ...tile, background: "#fff", display: "grid", placeItems: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: 99, background: "radial-gradient(circle at 50% 30%, #4fb5ff, #1173e6)", display: "grid", placeItems: "center" }}>
          <div style={{ width: 5, height: 30, background: "linear-gradient(#ff3b30 50%, #fff 50%)", transform: "rotate(45deg)", borderRadius: 3 }} />
        </div>
      </div>
    );
  if (kind === "photos")
    return (
      <div style={{ ...tile, background: "#fff" }}>
        {["#ff9500", "#ffcc00", "#34c759", "#5ac8fa", "#af52de", "#ff2d55"].map((c, k) => (
          <div key={k} style={abs(19, 9, { width: 14, height: 17, borderRadius: 8, background: c, opacity: 0.85, transformOrigin: "7px 17px", transform: `rotate(${k * 60}deg)` })} />
        ))}
      </div>
    );
  return (
    <div style={{ ...tile, background: "linear-gradient(#6ef08a, #28c845)", display: "grid", placeItems: "center" }}>
      <div style={{ width: 32, height: 26, borderRadius: "50%", background: "#fff" }} />
    </div>
  );
}

function Dock({ t, a }: { t: number; a: string }) {
  const kinds = ["messages", "notes", "compass", "brand", "photos", "messages", "notes"];
  const drift = lerp(-8, 30, clamp(t / T.burst));
  const xOf = (k: number) => 180 + (k - 3) * 66 + drift - 26;
  const bx = xOf(3) + 26;
  const reach = out(seg(t, 0.3, 0.95));
  const press = clamp(seg(t, 0.98, 1.06)) * (1 - seg(t, 1.06, T.burst));
  const burst = seg(t, T.burst, T.logo + 0.1);
  const r = rng(5);
  const shards = Array.from({ length: 22 }, (_, k) => ({ a: (k / 22) * Math.PI * 2 + r(), v: 50 + r() * 110, s: 6 + r() * 10, c: k % 3 ? "#111" : a, spin: (r() - 0.5) * 600 }));
  return (
    <div style={{ ...fill, background: "#f2f2ef" }}>
      <div style={abs(-30, 354, { width: 420, height: 72, borderRadius: 24, background: "#fff", boxShadow: "0 8px 30px -10px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.04)" })} />
      {kinds.map((k, i) =>
        i === 3 && burst > 0 ? null : (
          <div key={i} style={abs(xOf(i), 364, { transform: i === 3 ? `scale(${1 - 0.08 * press})` : undefined, opacity: 1 - 0.6 * burst })}>
            <Icon kind={k} a={a} />
          </div>
        ),
      )}
      {burst > 0 &&
        shards.map((q, k) => {
          const e = out(burst);
          return (
            <div
              key={k}
              style={abs(bx + Math.cos(q.a) * q.v * e - q.s / 2, 390 + Math.sin(q.a) * q.v * e - q.s / 2, {
                width: q.s,
                height: q.s,
                background: q.c,
                clipPath: "polygon(50% 0, 100% 100%, 0 80%)",
                transform: `rotate(${q.spin * e}deg)`,
                opacity: 1 - burst * 0.4,
              })}
            />
          );
        })}
      <Cursor x={lerp(300, bx - 2, reach)} y={lerp(520, 384, reach)} press={press} size={0.9} />
    </div>
  );
}

/** the shards a disc breaks into: polar cells, each split in two, coloured by where they were */
const SHARDS = (() => {
  const r = rng(11);
  const radii = [0, 36, 70, 108, 130, 152];
  const counts = [6, 11, 15, 19, 23];
  const out: { c: Pt; v: Pt[]; ring: number; dir: number; far: number; spin: number }[] = [];
  for (let ri = 0; ri < counts.length; ri++) {
    const n = counts[ri];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + ri * 0.3;
      const a1 = ((k + 1) / n) * Math.PI * 2 + ri * 0.3;
      const p = (rad: number, a: number): Pt => [Math.cos(a) * rad, Math.sin(a) * rad];
      const quads: Pt[][] = [
        [p(radii[ri], a0), p(radii[ri + 1], a0), p(radii[ri + 1], a1)],
        [p(radii[ri], a0), p(radii[ri + 1], a1), p(radii[ri], a1)],
      ];
      for (const tri of quads) {
        if (radii[ri] === 0 && tri[0][0] === 0 && tri[2][0] === 0 && tri[2][1] === 0) continue;
        const c: Pt = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
        out.push({ c, v: tri.map(([x, y]) => [x - c[0], y - c[1]] as Pt), ring: ri, dir: Math.atan2(c[1], c[0]), far: 120 + r() * 230, spin: (r() - 0.5) * 900 });
      }
    }
  }
  return out;
})();

function Logo({ t, a }: { t: number; a: string }) {
  const k = expo(seg(t, T.logo, T.logo + 0.55));
  const spin = inOut(seg(t, T.spin, T.shatter - 0.08)) * 360;
  const sh = seg(t, T.shatter, T.shatter + 0.8);
  const ground = 1 - seg(t, T.shatter + 0.05, T.rain + 0.05);
  return (
    <>
      {ground > 0 && (
        <div style={{ ...fill, background: a, opacity: ground, overflow: "hidden" }}>
          <div
            style={{
              ...fill,
              background: `repeating-radial-gradient(circle at 180px 330px, transparent 0 40px, ${alpha("#ffffff", 0.08)} 40px 80px)`,
              transformOrigin: "180px 330px",
              transform: `scale(${1 + (t - T.logo) * 0.08})`,
            }}
          />
        </div>
      )}
      {sh <= 0 ? (
        <div style={abs(180 - 152, 330 - 152, { width: 304, height: 304, transform: `scale(${lerp(0.8, 1, k)}) rotate(${spin - 30 * (1 - k)}deg)`, opacity: k })}>
          <div style={{ ...fill, borderRadius: 999, background: "#0c0c0c", boxShadow: "0 30px 60px -20px rgba(0,0,0,.45)" }} />
          <div style={abs(44, 44)}>
            <Mark s={216} a={a} />
          </div>
        </div>
      ) : (
        <svg width={PW} height={PH} style={abs(0, 0)}>
          {SHARDS.map((q, i) => {
            const e = out(sh);
            const swirl = e * 1.5;
            const d = Math.hypot(q.c[0], q.c[1]) + e * q.far;
            const cx = 180 + Math.cos(q.dir + swirl) * d;
            const cy = 330 + Math.sin(q.dir + swirl) * d;
            const rot = (q.spin * e * Math.PI) / 180;
            const sc = 1 - 0.45 * e;
            const pts = q.v.map(([x, y]) => `${(cx + (x * Math.cos(rot) - y * Math.sin(rot)) * sc).toFixed(1)},${(cy + (x * Math.sin(rot) + y * Math.cos(rot)) * sc).toFixed(1)}`).join(" ");
            const inner = q.ring < 3;
            return <polygon key={i} points={pts} fill={inner ? (i % 5 === 0 ? "#0c0c0c" : a) : "#0c0c0c"} opacity={1 - acc(seg(sh, 0.5, 1))} />;
          })}
        </svg>
      )}
    </>
  );
}

const BOKEH = (() => {
  const r = rng(21);
  const cs = ["#f2a65a", "#e98fa6", "#7aa2ff", "#ffd27a", "#c08bd8", "#ff8a65"];
  return Array.from({ length: 17 }, (_, i) => ({ x: r() * 380 - 10, y: 380 + r() * 280, r: 18 + r() * 30, c: cs[i % cs.length], ph: r() * 6 }));
})();
const STREAKS = (() => {
  const r = rng(22);
  return Array.from({ length: 46 }, () => ({ x: r() * 420 - 20, y: r() * 760, len: 14 + r() * 18, v: 700 + r() * 420, o: 0.1 + r() * 0.22 }));
})();
const DROPS = (() => {
  const r = rng(23);
  return Array.from({ length: 28 }, () => ({ x: r() * 360, y: r() * 600, r: 1.2 + r() * 2.2, v: r() < 0.3 ? 8 + r() * 14 : 0 }));
})();

function RainRoom({ t, zoom = 1 }: { t: number; zoom?: number }) {
  return (
    <div style={{ ...fill, overflow: "hidden", background: "linear-gradient(180deg, #2a3152 0%, #353a5b 42%, #47456a 68%, #5d5571 100%)" }}>
      {/* the city's lights out of focus: drawn once (blurring them every frame was the reel's stutter), swaying a little */}
      <div style={{ ...fill, transformOrigin: "40px 320px", transform: `translate3d(${Math.sin(t * 0.6) * 5}px, 0, 0) scale(${1 + (zoom - 1) * 0.22})`, opacity: 0.6 + 0.06 * Math.sin(t * 1.3) }}>
        <Baked w={PW + 40} h={PH + 40} scale={0.5} deps={[]}>
          {BOKEH.map((b, i) => (
            <div key={i} style={abs(20 + b.x - b.r, 20 + b.y - b.r, { width: b.r * 2, height: b.r * 2, borderRadius: 999, background: `radial-gradient(circle, ${alpha(b.c, 0.8)}, ${alpha(b.c, 0.25)} 62%, transparent 72%)`, filter: "blur(9px)" })} />
          ))}
        </Baked>
      </div>
      {STREAKS.map((s, i) => {
        const y = ((s.y + t * s.v) % 760) - 60;
        return <div key={i} style={{ position: "absolute", left: 0, top: 0, width: 1, height: s.len, background: `linear-gradient(transparent, rgba(255,255,255,${s.o}))`, transform: `translate3d(${s.x - y * 0.18}px, ${y}px, 0) rotate(10deg)` }} />;
      })}
      {DROPS.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate3d(${d.x}px, ${(d.y + t * d.v) % 640}px, 0)`,
            width: d.r * 2,
            height: d.r * 2.2,
            borderRadius: 999,
            background: "radial-gradient(circle at 38% 35%, rgba(255,255,255,.7), rgba(255,255,255,.14) 55%, rgba(0,0,0,.08) 70%)",
          }}
        />
      ))}
    </div>
  );
}

/** "*marked*" words of a line, typed: each run keeps its colour while it grows */
function TypedLine({ text, n, accent }: { text: string; n: number; accent: string }) {
  let left = n;
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) => {
        const mark = part.startsWith("*") && part.endsWith("*");
        const s = mark ? part.slice(1, -1) : part;
        const shown = s.slice(0, Math.max(0, left));
        left -= s.length;
        return shown ? (
          <span key={i} style={{ color: mark ? accent : undefined }}>
            {shown}
          </span>
        ) : null;
      })}
    </>
  );
}

const Glass = (o: CSSProperties = {}): CSSProperties => ({ background: "rgba(16,16,24,.6)", border: "1px solid rgba(255,255,255,.26)", backdropFilter: "blur(6px)", ...o });

function Search({ t, p, a }: { t: number; p: P; a: string }) {
  const zin = back(seg(t, T.zoom, T.zoom + 0.6), 1.05);
  const zout = inOut(seg(t, T.unzoom, T.unzoom + 0.34));
  const zoom = lerp(1, lerp(1, 2.7, zin), 1 - zout);
  const plain = unmark(p.query);
  const cps = plain.length / 1.15;
  const n = Math.max(0, Math.min(plain.length, Math.floor((t - T.type) * cps)));
  const busy = t >= T.type && n < plain.length;
  const tw = measure(plain.slice(0, n), `500 11.5px ${SANS}`);
  // keep the caret in view while the bar is blown up
  const shift = Math.max(0, 40 + (56 - 40 + tw) * zoom - 300) / zoom;
  const enter = out(seg(t, T.rain + 0.1, T.rain + 0.6));
  const drop = seg(t, T.drop, T.drop + 0.4);
  return (
    <>
      <RainRoom t={t} zoom={zoom} />
      {drop > 0 && <div style={{ ...fill, background: "rgba(14,14,16,.78)", opacity: out(drop) }} />}
      <div style={{ ...fill, transformOrigin: "40px 319px", transform: `scale(${zoom})` }}>
        <div style={abs(22, 302 + (1 - enter) * 14, { width: 316, height: 34, borderRadius: 17, ...Glass(), opacity: enter, overflow: "hidden" })}>
          <svg width="14" height="14" viewBox="0 0 24 24" style={abs(13, 10)}>
            <circle cx="10" cy="10" r="6.5" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2.4" />
            <path d="m15 15 5 5" stroke="rgba(255,255,255,.75)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div style={abs(34 - shift, 9, { whiteSpace: "nowrap", fontFamily: SANS, fontSize: 11.5, fontWeight: 500, color: "#fff", lineHeight: "16px" })}>
            {n === 0 ? (
              <span style={{ color: "rgba(255,255,255,.55)" }}>
                {t >= T.type - 0.15 && <Caret on={blink(t, busy)} color={a} />}What do you want to play?
              </span>
            ) : (
              <>
                <TypedLine text={p.query} n={n} accent={a} />
                <Caret on={blink(t, busy)} color={a} />
              </>
            )}
          </div>
        </div>
      </div>
      {drop > 0 && (
        <div style={abs(22, 346, { width: 316, fontFamily: SANS, color: "#fff" })}>
          {[0, 1, 2].map((k) => {
            const e = out(seg(t, T.drop + 0.1 + k * 0.06, T.drop + 0.5 + k * 0.06));
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, height: 38, opacity: e, transform: `translateY(${(1 - e) * 10}px)`, borderBottom: k < 2 ? "1px solid rgba(255,255,255,.08)" : undefined, fontSize: 11 }}>
                {k < 2 ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <circle cx="10" cy="10" r="6.5" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2.4" />
                      <path d="m15 15 5 5" stroke="rgba(255,255,255,.5)" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                    <span style={{ color: k ? "rgba(255,255,255,.55)" : "#fff" }}>{k ? plain.replace(/evening|night|day/i, "morning") : <Marked text={p.query} accent={a} />}</span>
                  </>
                ) : (
                  <>
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: "radial-gradient(circle at 30% 70%, #7aa2ff, #1e3a8a 70%)" }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.playlist}</div>
                      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,.55)" }}>Playlist · {p.name}</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {t > T.drop + 0.2 && <Cursor x={lerp(290, 120, out(seg(t, T.drop + 0.2, T.drop + 0.5)))} y={lerp(560, 440, out(seg(t, T.drop + 0.2, T.drop + 0.5)))} press={clamp(seg(t, 6.22, 6.3))} size={0.75} />}
    </>
  );
}

/** a cover in the rain: blues out of focus, the name on it */
const RainCover = ({ s, name, a }: { s: number; name: string; a: string }) => (
  <div style={{ width: s, height: s, position: "relative", overflow: "hidden", borderRadius: 4, background: "radial-gradient(circle at 70% 30%, #4f7cff 0, transparent 34%), radial-gradient(circle at 25% 60%, #8ab4ff 0, transparent 30%), radial-gradient(circle at 60% 80%, #6b4fd8 0, transparent 30%), linear-gradient(160deg, #1d3a9a, #0e1c4d)", boxShadow: "0 18px 40px -14px rgba(0,0,0,.6)" }}>
    <div style={{ ...fill, backdropFilter: "blur(3px)" }} />
    <div style={abs(s * 0.06, s * 0.06)}>
      <Mark s={s * 0.09} a={a} ink="#000" />
    </div>
    <div style={abs(s * 0.08, s * 0.68, { fontFamily: SANS, fontWeight: 700, fontSize: s * 0.085, color: "#fff", lineHeight: 1.05, width: s * 0.6 })}>{name}</div>
  </div>
);

function Playlist({ t, p, a }: { t: number; p: P; a: string }) {
  const k = out(seg(t, T.list, T.list + 0.45));
  const tracks = [
    ["Late Tram", "Cold Coast", "#f59e0b"],
    ["Soft Hours", "Hall & Glo", "#ec4899"],
    ["Grey Light", "Tamin Rows", "#14b8a6"],
    ["Puddles", "Juno Park", "#f97316"],
    ["Night Glass", "Ode Vale", "#6366f1"],
  ];
  const playPop = back(seg(t, 6.85, 7.15), 2);
  const press = clamp(seg(t, 7.38, 7.45)) * (1 - seg(t, 7.45, 7.55));
  return (
    <div style={{ ...fill, background: "linear-gradient(180deg, #2546a0 0%, #1a2e66 34%, #131c38 62%, #10141f 100%)", fontFamily: SANS, color: "#fff" }}>
      <div style={abs(105, 62, { transform: `scale(${lerp(0.88, 1, k)})`, opacity: k })}>
        <RainCover s={150} name={p.playlist} a={a} />
      </div>
      <div style={abs(24, 236, { fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", opacity: out(seg(t, T.list + 0.15, T.list + 0.5)) })}>{p.playlist}</div>
      <div style={abs(24, 266, { display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: "rgba(255,255,255,.75)", opacity: out(seg(t, T.list + 0.2, T.list + 0.55)) })}>
        <Mark s={12} a={a} /> {p.name}
      </div>
      <div style={abs(24, 282, { fontSize: 8.5, color: "rgba(255,255,255,.5)", opacity: out(seg(t, T.list + 0.25, T.list + 0.6)) })}>1,234,215 saves · 2 hr 46 min</div>
      <div style={abs(24, 304, { display: "flex", gap: 14, opacity: out(seg(t, T.list + 0.3, T.list + 0.65)) })}>
        <div style={{ width: 16, height: 16, borderRadius: 99, border: "1.5px solid rgba(255,255,255,.6)" }} />
        <div style={{ fontSize: 14, lineHeight: "12px", color: "rgba(255,255,255,.6)" }}>···</div>
      </div>
      <div style={abs(292, 290, { width: 46, height: 46, borderRadius: 99, background: a, display: "grid", placeItems: "center", transform: `scale(${playPop * (1 - 0.1 * press)})`, boxShadow: `0 10px 24px -8px ${alpha(a, 0.6)}` })}>
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M7 4v16l13-8Z" fill="#000" />
        </svg>
      </div>
      {tracks.map(([n, by, c], i) => {
        const e = out(seg(t, 6.85 + i * 0.06, 7.3 + i * 0.06));
        return (
          <div key={i} style={abs(24, 350 + i * 44, { display: "flex", alignItems: "center", gap: 10, opacity: e, transform: `translateY(${(1 - e) * 14}px)` })}>
            <div style={{ width: 32, height: 32, borderRadius: 3, background: `linear-gradient(135deg, ${c}, ${mix(c, "#000000", 0.45)})` }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{n}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,.55)" }}>{by}</div>
            </div>
          </div>
        );
      })}
      {t > 6.95 && <Cursor x={lerp(250, 314, out(seg(t, 6.95, 7.35)))} y={lerp(470, 314, out(seg(t, 6.95, 7.35)))} press={press} size={0.75} />}
    </div>
  );
}

type Tile = { col: number; h: number; kind: "vinyl" | "big" | "sun" | "rings" | "orb" | "waves" | "rain" | "word"; label: string; c1: string; c2: string };
const TILES: Tile[] = [
  { col: 0, h: 150, kind: "vinyl", label: "ink static", c1: "#f06a8a", c2: "#111" },
  { col: 0, h: 170, kind: "big", label: "grey light", c1: "#1fb4a0", c2: "#ecfffb" },
  { col: 0, h: 140, kind: "sun", label: "Morning Coast", c1: "#f6b27a", c2: "#e63946" },
  { col: 0, h: 150, kind: "rings", label: "", c1: "#3b1d8f", c2: "#c4b5fd" },
  { col: 0, h: 160, kind: "big", label: "slow fade", c1: "#fde047", c2: "#1f2937" },
  { col: 1, h: 118, kind: "orb", label: "Glass Hours", c1: "#7c3aed", c2: "#f0abfc" },
  { col: 1, h: 118, kind: "big", label: "cold chrome", c1: "#e3edff", c2: "#1d4ed8" },
  { col: 1, h: 150, kind: "rain", label: "", c1: "#1e3a8a", c2: "#93c5fd" },
  { col: 1, h: 150, kind: "waves", label: "Night Grass", c1: "#16a34a", c2: "#2563eb" },
  { col: 1, h: 150, kind: "orb", label: "Low Tide", c1: "#0f766e", c2: "#99f6e4" },
  { col: 2, h: 58, kind: "word", label: "puddles", c1: "#e4fb9c", c2: "#1a2e05" },
  { col: 2, h: 130, kind: "big", label: "warm tea", c1: "#c4ec58", c2: "#1a2e05" },
  { col: 2, h: 150, kind: "sun", label: "Late Tram", c1: "#fde9b0", c2: "#ea580c" },
  { col: 2, h: 150, kind: "rings", label: "", c1: "#a855f7", c2: "#f5d0fe" },
  { col: 2, h: 160, kind: "waves", label: "after rain", c1: "#0ea5e9", c2: "#f472b6" },
];
const COL_X = [6, 124, 242];
const COL_Y = [-24, 8, -44];
const LAID = (() => {
  const y = [...COL_Y];
  return TILES.map((tile) => {
    const top = y[tile.col];
    y[tile.col] += tile.h + 6;
    return { ...tile, x: COL_X[tile.col], y: top };
  });
})();
/** how far the wall has scrolled at t (columns at their own speeds) */
const scrollOf = (t: number, col: number) => lerp(30, -260, seg(t, T.bento, T.roll)) * [1, 0.86, 1.12][col];

function Cover({ tile, p }: { tile: (typeof LAID)[number]; p: P }) {
  const { kind, c1, c2, h } = tile;
  const label = kind === "rain" ? p.playlist : tile.label;
  const small = (o: CSSProperties = {}) => ({ position: "absolute", left: 8, bottom: 7, fontFamily: SANS, fontWeight: 700, fontSize: 10, lineHeight: 1.05, color: "#fff", ...o }) as CSSProperties;
  const base: CSSProperties = { position: "absolute", inset: 0, borderRadius: 6, overflow: "hidden", background: c1 };
  if (kind === "vinyl")
    return (
      <div style={base}>
        <div style={abs(-30, 16, { width: 110, height: 110, borderRadius: 99, background: `radial-gradient(circle, ${c1} 0 12px, #111 13px 54px)` })} />
        <div style={small({ color: "#111" })}>{label}</div>
      </div>
    );
  if (kind === "big")
    return (
      <div style={base}>
        <div style={{ position: "absolute", left: 7, bottom: 6, right: 4, fontFamily: SANS, fontWeight: 800, fontSize: 31, lineHeight: 0.9, letterSpacing: "-0.04em", color: c2 }}>{label}</div>
      </div>
    );
  if (kind === "sun")
    return (
      <div style={{ ...base, background: `linear-gradient(180deg, ${c1}, ${mix(c1, c2, 0.25)})` }}>
        <div style={abs(30, h * 0.42, { width: 70, height: 70, borderRadius: 99, background: `radial-gradient(circle at 40% 35%, ${mix(c2, "#ffffff", 0.35)}, ${c2})` })} />
        <div style={small({ color: mix(c2, "#000000", 0.4) })}>{label}</div>
      </div>
    );
  if (kind === "rings") return <div style={{ ...base, background: `repeating-radial-gradient(circle at 100% 50%, ${c2} 0 7px, ${c1} 7px 15px)` }} />;
  if (kind === "orb")
    return (
      <div style={{ ...base, background: `linear-gradient(150deg, ${c1}, ${mix(c1, "#000000", 0.35)})` }}>
        <div style={abs(50, 14, { width: 54, height: 54, borderRadius: 99, background: `radial-gradient(circle at 35% 30%, #fff, ${c2} 40%, ${alpha(c2, 0)} 72%)` })} />
        <div style={small({ top: 8, bottom: undefined })}>{label}</div>
      </div>
    );
  if (kind === "waves")
    return (
      <div style={{ ...base, background: `repeating-linear-gradient(168deg, ${c1} 0 11px, ${c2} 11px 22px)` }}>
        <div style={small()}>{label}</div>
      </div>
    );
  if (kind === "rain")
    return (
      <div style={base}>
        <RainCover s={112} name={label} a={p.accent} />
      </div>
    );
  return (
    <div style={base}>
      <div style={small({ color: c2, fontSize: 13 })}>{label}</div>
    </div>
  );
}

function Wall({ t, p, a, frozen }: { t: number; p: P; a: string; frozen?: number }) {
  const at = frozen ?? t;
  const target = LAID.find((x) => x.kind === "rain")!;
  const tx = target.x + 56;
  const ty = target.y + scrollOf(at, target.col) + 75;
  const reach = out(seg(t, 8.3, 8.85));
  const press = clamp(seg(t, 8.88, 8.95)) * (1 - seg(t, 8.95, 9.05));
  const badge = back(seg(t, 8.98, 9.3), 2.2);
  return (
    <div style={{ ...fill, background: "#0f1724", overflow: "hidden" }}>
      {LAID.map((tile, i) => {
        const e = frozen != null ? 1 : out(seg(t, T.bento + (14 - i) * 0.03, T.bento + 0.5 + (14 - i) * 0.03));
        return (
          <div key={i} style={abs(tile.x, tile.y + scrollOf(at, tile.col), { width: 112, height: tile.h, opacity: e, transform: `translateY(${(1 - e) * 36}px) scale(${lerp(0.94, 1, e)})` })}>
            <Cover tile={tile} p={p} />
            {tile.kind === "rain" && badge > 0 && (
              <div style={abs(80, 116, { width: 24, height: 24, borderRadius: 99, background: a, display: "grid", placeItems: "center", transform: `scale(${badge})` })}>
                <svg width="10" height="10" viewBox="0 0 24 24">
                  <rect x="5" y="4" width="5" height="16" rx="1" fill="#000" />
                  <rect x="14" y="4" width="5" height="16" rx="1" fill="#000" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
      {frozen == null && t > 8.3 && t < 9.6 && <Cursor x={lerp(330, tx, reach)} y={lerp(600, ty, reach)} press={press} size={0.75} />}
    </div>
  );
}

function Bento({ t, p, a }: { t: number; p: P; a: string }) {
  // a purple cover opens out to fill the screen: the way into the roller
  const g = inOut(seg(t, 9.55, 10.15));
  const src = LAID.filter((x) => x.kind === "rings")[1];
  const sy = src.y + scrollOf(t, src.col);
  return (
    <>
      <Wall t={t} p={p} a={a} />
      {g > 0 && <div style={abs(lerp(src.x, 0, g), lerp(sy, 0, g), { width: lerp(112, PW, g), height: lerp(src.h, PH, g), borderRadius: lerp(6, 0, g), background: mix(src.c1, "#2a1650", g) })} />}
    </>
  );
}

/** where the roller is at t: the steps it takes, each a quick spring */
function rollAt(t: number, last: number) {
  const steps: [number, number][] = [
    [10.86, 2],
    [11.22, 3],
    [11.62, last],
  ];
  let f = 0;
  for (const [at, to] of steps) f = lerp(f, to, back(seg(t, at, at + 0.32), 1.25));
  return f;
}

function Roller({ t, p, a }: { t: number; p: P; a: string }) {
  const words = p.moods.split("|");
  const last = words.length - 1;
  const f = rollAt(t, last);
  const g = seg(t, T.green, T.green + 0.2);
  const font = `760 36px ${SANS}`;
  const i0 = Math.max(0, Math.min(last, Math.floor(f)));
  const i1 = Math.min(last, i0 + 1);
  const bw = lerp(measure(words[i0], font), measure(words[i1], font), f - i0) + 24;
  const ink = g > 0.5 ? "#0b0b0b" : "#fff";
  const enter = seg(t, 10.0, T.roll);
  return (
    <div style={{ ...fill, opacity: enter }}>
      <div style={{ ...fill, filter: "blur(12px) brightness(.42) saturate(1.2)", transform: "scale(1.1)" }}>
        <Wall t={t} p={p} a={a} frozen={T.roll} />
      </div>
      {g > 0 && <div style={{ ...fill, background: a, opacity: g }} />}
      {words.map((w, i) => {
        const d = i - f;
        const on = i === last && t >= T.green;
        return (
          <div
            key={i}
            style={abs(0, 300 + d * 48, {
              width: PW,
              textAlign: "center",
              fontFamily: SANS,
              fontWeight: 760,
              fontSize: 36,
              lineHeight: "40px",
              letterSpacing: "-0.02em",
              color: on ? mix("#ffffff", "#0b0b0b", g) : "#fff",
              opacity: on ? 1 : (Math.abs(d) < 0.5 ? 1 : 0.3 / (0.6 + Math.abs(d) * 0.4)) * (1 - g),
              filter: Math.abs(d) > 0.5 ? `blur(${Math.min(4, Math.abs(d) * 1.4)}px)` : undefined,
            })}
          >
            {w}
          </div>
        );
      })}
      <div style={abs(180 - bw / 2, 296, { width: bw, height: 48, border: `1.5px solid ${alpha(g > 0.5 ? "#0b0b0b" : "#ffffff", 0.9)}`, background: alpha(ink === "#fff" ? "#ffffff" : "#000000", 0.04) })}>
        {[
          [-3.5, -3.5],
          [bw - 4.5, -3.5],
          [-3.5, 44.5],
          [bw - 4.5, 44.5],
        ].map(([x, y], k) => (
          <div key={k} style={abs(x, y, { width: 6, height: 6, background: "#fff", border: `1px solid ${g > 0.5 ? "#0b0b0b" : a}` })} />
        ))}
      </div>
    </div>
  );
}

const Handles = ({ w, h, ink, a }: { w: number; h: number; ink: string; a: string }) => (
  <>
    {[
      [-3.5, -3.5],
      [w - 4.5, -3.5],
      [-3.5, h - 3.5],
      [w - 4.5, h - 3.5],
    ].map(([x, y], k) => (
      <div key={k} style={abs(x, y, { width: 6, height: 6, background: a, border: `1px solid ${ink}` })} />
    ))}
  </>
);

function Poster({ t, p, a }: { t: number; p: P; a: string }) {
  const words = p.moods.split("|");
  const lead = words[words.length - 1];
  const [small, big] = p.poster.split("|");
  const m = inOut(seg(t, 12.55, 12.95));
  const leadFont = lerp(36, 22, m);
  const lw = measure(lead, `760 ${leadFont}px ${SANS}`) + lerp(24, 14, m);
  const lh = lerp(48, 30, m);
  const lx = lerp(180 - lw / 2, 96, m);
  const ly = lerp(296, 246, m);
  const slam = expo(seg(t, 13.0, 13.42));
  const bigFont = `800 104px ${DISPLAY}`;
  const bw = measure(big, bigFont);
  const fade = 1 - seg(t, T.dust, T.dust + 0.3);
  const bx = 180 - bw / 2;
  const sel = seg(t, 13.35, 13.5);
  const vinyl = back(seg(t, 12.85, 13.3), 1.6);
  return (
    <div style={{ ...fill, background: a }}>
      <div style={{ ...fill, opacity: fade }}>
        <div style={abs(lx, ly, { width: lw, height: lh, border: "1.5px solid #0b0b0b", fontFamily: SANS, fontWeight: 760, fontSize: leadFont, lineHeight: `${lh}px`, textAlign: "center", color: "#0b0b0b", letterSpacing: "-0.02em" })}>
          {lead}
          <Handles w={lw} h={lh} ink="#0b0b0b" a="#ffffff" />
        </div>
        <div style={abs(lx + lw + 7, ly + 1, { fontFamily: SERIF, fontStyle: "italic", fontSize: 25, color: "#0b0b0b", ...fadeIn(t, 12.92) })}>{small}</div>
        {slam > 0 && (
          <div
            style={abs(bx, 290, {
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 104,
              lineHeight: "100px",
              letterSpacing: "-0.045em",
              color: "#0b0b0b",
              whiteSpace: "nowrap",
              transformOrigin: "50% 60%",
              transform: `scale(${lerp(1.5, 1, slam)})`,
              opacity: clamp(slam * 3),
              filter: slam < 1 ? `blur(${(1 - slam) * 10}px)` : undefined,
            })}
          >
            {big}
          </div>
        )}
        {sel > 0 && (
          <div style={abs(bx - 8, 292, { width: bw + 16, height: 100, border: "1.5px solid #0b0b0b", opacity: sel })}>
            <Handles w={bw + 16} h={100} ink="#0b0b0b" a="#ffffff" />
          </div>
        )}
        {vinyl > 0 && (
          <div style={abs(40, lerp(90, 148, vinyl), { width: 52, height: 52, borderRadius: 99, background: "radial-gradient(circle, #0b0b0b 0 2px, #f472b6 2.5px 9px, #151515 9.5px 24px, #2a2a2a 24.5px 25px, #151515 25.5px)", transform: `rotate(${t * 220}deg)`, boxShadow: "0 8px 18px -6px rgba(0,0,0,.45)", opacity: clamp(vinyl * 2) })} />
        )}
        <div style={abs(298, 172, { width: 16, height: 16, borderRadius: 99, background: "radial-gradient(circle at 35% 30%, #fff, #b9b9b9 45%, #6b6b6b)", transform: `scale(${back(seg(t, 13.32, 13.6), 2)})` })} />
        <div style={abs(62, 450, { width: 10, height: 10, borderRadius: 99, background: "#0b0b0b", transform: `scale(${back(seg(t, 13.42, 13.7), 2)})` })} />
        <div style={abs(284, 456, { transform: `scale(${back(seg(t, 13.5, 13.85), 2.4)}) rotate(${lerp(-60, 0, out(seg(t, 13.5, 14)))}deg)` })}>
          <Spark size={58} color="#f472b6" style={{ display: "block", filter: "drop-shadow(0 6px 10px rgba(236,72,153,.35))" }} />
        </div>
      </div>
    </div>
  );
}
const fadeIn = (t: number, at: number): CSSProperties => {
  const k = out(seg(t, at, at + 0.35));
  return { opacity: k, transform: `translateX(${(1 - k) * -8}px)` };
};

const DUST = (() => {
  const r = rng(31);
  return Array.from({ length: 720 }, (_, i) => ({ x: r() * PW, y: 60 + r() * 520, kind: i % 7 === 0 ? 1 : i % 9 === 0 ? 2 : 0, s: 0.8 + r() * 1.6, rt: 18 + Math.sqrt(r()) * 66, at: r() * Math.PI * 2, d: 18 + r() * 30 }));
})();

function Dust({ t, p, a }: { t: number; p: P; a: string }) {
  const pa = seg(t, T.dust, 14.95);
  const pb = seg(t, 14.95, 15.7);
  const dark = seg(t, 14.85, 15.1);
  const hole = out(seg(t, 14.6, 14.95)) * (1 - seg(t, 15.0, 15.3));
  const markIn = out(seg(t, 15.45, 15.8));
  const lock = inOut(seg(t, T.lock, T.lock + 0.45));
  const nameFont = `700 40px ${SANS}`;
  const nw = measure(p.name, nameFont);
  const ms = lerp(160, 64, lock);
  const total = 64 + 16 + nw;
  const mx = lerp(180, 180 - total / 2 + 32, lock);
  const reveal = out(seg(t, T.lock + 0.2, T.lock + 0.75));
  const cx = 180;
  const cy = 320;
  return (
    <>
      <div style={{ ...fill, background: GROUND, opacity: dark }} />
      {hole > 0 && <div style={abs(cx - 50 * hole, cy - 50 * hole, { width: 100 * hole, height: 100 * hole, borderRadius: 99, background: "#0b0b0b", filter: "blur(3px)" })} />}
      {markIn > 0 && <div style={abs(cx - 170, cy - 170, { width: 340, height: 340, borderRadius: 999, background: `radial-gradient(circle, ${alpha(a, 0.22)}, transparent 62%)`, opacity: markIn * (1 - lock * 0.7) })} />}
      <svg width={PW} height={PH} style={abs(0, 0)}>
        {DUST.map((d, i) => {
          const r0 = Math.hypot(d.x - cx, d.y - cy);
          const a0 = Math.atan2(d.y - cy, d.x - cx);
          const ra = r0 + out(pa) * d.d;
          const e = inOut(pb);
          const rr = lerp(ra, d.rt, e);
          const ang = lerp(a0, d.at + 2.2, e) + e * 0.6;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr;
          const base = d.kind === 1 ? "#ffffff" : d.kind === 2 ? mix(a, "#ffffff", 0.4) : "#0b0b0b";
          const col = pb > 0 ? mix(base === "#0b0b0b" ? "#1a1a1a" : base, a, seg(pb, 0, 0.45)) : base;
          const o = seg(t, T.dust, T.dust + 0.12) * (1 - seg(t, 15.55, 15.9));
          return o > 0 ? <circle key={i} cx={x} cy={y} r={d.s * (1 - 0.3 * e)} fill={col} opacity={o} /> : null;
        })}
      </svg>
      {markIn > 0 && (
        <div style={abs(mx - ms / 2, cy - ms / 2, { width: ms, height: ms, opacity: markIn, transform: `scale(${lerp(0.9, 1, markIn)})` })}>
          <Mark s={ms} a={a} />
        </div>
      )}
      {reveal > 0 && (
        <div style={abs(mx + ms / 2 + 16, cy - 24, { fontFamily: SANS, fontWeight: 700, fontSize: 40, lineHeight: "48px", letterSpacing: "-0.03em", color: "#fff", clipPath: `inset(-10px ${(1 - reveal) * 100}% -10px -10px)` })}>{p.name}</div>
      )}
      <div style={abs(0, cy + 44, { width: PW, textAlign: "center", fontFamily: SANS, fontSize: 11, color: "rgba(255,255,255,.5)", ...fadeIn(t, T.lock + 0.45), transform: undefined })}>{p.line}</div>
    </>
  );
}

function Screen({ t, p }: { t: number; p: P }) {
  const a = p.accent;
  return (
    <div style={{ ...fill, overflow: "hidden" }}>
      {t < T.logo && <Dock t={t} a={a} />}
      {t >= T.shatter && t < T.list && <Search t={t} p={p} a={a} />}
      {t >= T.logo && t < T.rain + 0.5 && <Logo t={t} a={a} />}
      {t >= T.list && t < T.bento && (p.screen ? <div data-pick="screen" style={{ ...fill, background: "#000" }}><Slot src={p.screen} t={t} w={PW} h={PH} /></div> : <Playlist t={t} p={p} a={a} />)}
      {t >= T.bento && t < T.roll && <Bento t={t} p={p} a={a} />}
      {t >= 10.0 && t < T.mood && <Roller t={t} p={p} a={a} />}
      {t >= T.mood && t < 15.2 && <Poster t={t} p={p} a={a} />}
      {t >= T.dust && <Dust t={t} p={p} a={a} />}
    </div>
  );
}

export default function SketchToScreen({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const ready = useWebFonts(FONTS, ['700 40px "Caveat"', 'italic 40px "Instrument Serif"', '800 40px "Outfit"']);
  const t = useClock(DUR);
  const sketch = SKETCH_AT.filter((x) => t >= x).length - 1;
  return (
    <Stage w={1080} h={1920} background={GROUND} style={{ fontFamily: SANS, color: "#fff" }}>
      {ready && (
        <>
          <div style={abs(432, 410 - 34, { width: 572, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, fontSize: 58, fontWeight: 620, letterSpacing: "-0.02em" })}>
            <Burst s={50} color={CORAL} />
            {p.made}
          </div>
          <div style={abs(75, 718 - 34, { width: 321, textAlign: "center", fontSize: 56, fontWeight: 650, letterSpacing: "-0.02em" })}>Drawing</div>
          <div style={abs(75, 767, { width: 321, height: 577, background: "#fbfbf8", borderRadius: 6, overflow: "hidden" })}>
            <Sketch i={sketch} p={p} />
          </div>
          <div style={abs(432, 475, { width: 572, height: 1018, overflow: "hidden", borderRadius: 4, background: "#000" })}>
            <div style={abs(0, 0, { width: PW, height: PH, transformOrigin: "0 0", transform: `scale(${PK})` })}>
              <Screen t={t} p={p} />
            </div>
          </div>
          <div style={abs(0, 1576 - 30, { width: 1080, textAlign: "center", fontSize: 50, fontWeight: 600, letterSpacing: "-0.015em" })}>
            <Marked text={p.cta} accent={CORAL} />
          </div>
        </>
      )}
    </Stage>
  );
}
