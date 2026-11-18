// Lit desk: a vertical reel shot like a phone filming a laptop in a dark room. The screen plays the story; its light
// washes the keys, the deck and the desk, and changes colour with every cut. Rebuilt from a reel studied with
// motiscope: its cut points (3.02, 4.4, 5.71, 8.61, 10.0, 11.28, 12.0, 19.84, 21.0, 22.64, 24.4, 26.45, 27.33, 28.3 s),
// its hand-held camera and its palette (one hot orange, its yellows and deep reds, slate and plum) are the reel's; the
// words and the heat are params. The laptop is CSS 3D so the screen stays live, crisp DOM.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from "react";
import { Caret, Cursor, Stage, acc, back, blink, clamp, expo, inOut, lerp, out, seg, typed, useClock, useFonts, useWebFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;

const DUR = 29.1;
/** the reel's cuts and beats, measured (seconds) */
const C = { ask: 3.02, dive: 4.42, land: 5.71, thing: 7.2, flash: 8.61, dots: 10.0, push: 11.28, verbs: 12.0, product: 19.84, arcs: 21.0, ring: 22.64, sunset: 24.4, recap: 26.45, sun: 27.33, dark: 28.3 };
const RECAP = [26.45, 26.53, 26.6, 26.68, 26.81, 27.01, 27.23];

const FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@100..900&display=swap";
const SERIF = '"Instrument Serif", Georgia, serif';
const GEO = '"Outfit", "Geist", system-ui, sans-serif';
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const IMG = "/anim/swiggy-home/img/";
/** the laptop screen's own drawing space */
const SW = 1600;
const SH = 1000;

/* ---------------- colour: everything from one heat ---------------- */

const hexOf = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0xf05a1c;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** `a` mixed `k` of the way to `b`, as hex (so it can be mixed again) */
const hx = (a: string, b: string, k: number) => {
  const [x, y] = [hexOf(a), hexOf(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * clamp(k)).toString(16).padStart(2, "0")).join("");
};
const rgba = (h: string, o: number) => `rgba(${hexOf(h).join(",")},${clamp(o)})`;
function palette(a: string) {
  return {
    hot: a,
    gold: hx(a, "#ffd23c", 0.66),
    cream: hx(a, "#fff4cc", 0.82),
    red: hx(a, "#b8200c", 0.5),
    deep: hx(a, "#2a0a0c", 0.66),
    slate: "#3e3646",
    plum: "#2e2229",
  };
}
type Pal = ReturnType<typeof palette>;

const rng = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const abs = (x: number, y: number, o: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: x, top: y, ...o });
const fill: CSSProperties = { position: "absolute", inset: 0 };

/** what the screen throws into the room at t: its colour and how bright */
function lightAt(t: number, pal: Pal): [string, number] {
  const keys: [number, string, number][] = [
    [0, "#4a3058", 0.35],
    [C.ask, pal.hot, 0.85],
    [C.land, hx(pal.hot, pal.red, 0.3), 0.8],
    [C.flash, hx(pal.hot, "#ffffff", 0.25), 0.9],
    [C.dots, pal.hot, 0.85],
    [C.verbs, hx(pal.hot, pal.plum, 0.35), 0.75],
    [C.product, "#efe9e6", 1],
    [C.arcs, hx(pal.red, pal.deep, 0.3), 0.55],
    [C.ring, pal.hot, 0.65],
    [C.sunset, hx(pal.hot, pal.slate, 0.3), 0.75],
    [C.recap, "#f3eeec", 0.95],
    [C.sun, hx(pal.hot, pal.gold, 0.3), 0.9],
    [C.dark, "#101014", 0.06],
  ];
  let i = 0;
  while (i < keys.length - 1 && t >= keys[i + 1][0]) i++;
  const [at, c, b] = keys[i];
  const prev = keys[Math.max(0, i - 1)];
  const k = i === 0 ? 1 : seg(t, at, at + 0.15);
  return [hx(prev[1], c, k), lerp(prev[2], b, k)];
}

/* ---------------- a canvas drawn from t (so a frame is the same however it's reached) ---------------- */

function Paint({ draw, t }: { draw: (g: CanvasRenderingContext2D, t: number) => void; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    // at half size: the screen is never seen bigger than that, and a frame paints in a quarter of the time
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    draw(g, t);
  });
  return <canvas ref={ref} width={SW / 2} height={SH / 2} style={{ ...fill, width: SW, height: SH }} />;
}

/** a wireframe land flown over, lit from the left: rows far to near, each strip filled so it hides what's behind */
const terrain = (pal: Pal) => (g: CanvasRenderingContext2D, t: number) => {
  const bg = g.createLinearGradient(0, 0, SW, SH);
  bg.addColorStop(0, pal.gold);
  bg.addColorStop(0.3, pal.hot);
  bg.addColorStop(0.68, pal.red);
  bg.addColorStop(1, pal.deep);
  g.fillStyle = bg;
  g.fillRect(0, 0, SW, SH);
  const sun = g.createRadialGradient(150, 360, 0, 150, 360, 620);
  sun.addColorStop(0, rgba(pal.cream, 0.95));
  sun.addColorStop(0.35, rgba(pal.gold, 0.55));
  sun.addColorStop(1, rgba(pal.gold, 0));
  g.fillStyle = sun;
  g.fillRect(0, 0, SW, SH);
  const travel = (t - C.land) * 1.6;
  const hgt = (x: number, z: number) => {
    const w = z + travel;
    return 0.62 * Math.sin(x * 0.33 + w * 0.31) + 0.42 * Math.sin(x * 0.81 - w * 0.52 + 1.3) + 0.3 * Math.sin(w * 1.07 + x * 0.21) + 0.9 * Math.exp(-((x - 3) ** 2) / 6) * (0.5 + 0.5 * Math.sin(w * 0.4));
  };
  const f = 760;
  const horizon = 300;
  const camH = 2.2;
  const xs = Array.from({ length: 81 }, (_, i) => -26 + i * 0.65);
  const rows = 44;
  let prev: [number, number][] | null = null;
  const line = g.createLinearGradient(0, 0, SW, 0);
  line.addColorStop(0, pal.cream);
  line.addColorStop(0.35, pal.gold);
  line.addColorStop(0.7, pal.hot);
  line.addColorStop(1, pal.red);
  for (let r = rows; r >= 0; r--) {
    const z = 1.4 * Math.pow(26 / 1.4, r / rows);
    const pts = xs.map((x): [number, number] => [SW / 2 + (x * f) / z, horizon + ((camH - hgt(x, z)) * f) / z]);
    const near = 1 - r / rows;
    if (prev) {
      g.beginPath();
      g.moveTo(prev[0][0], prev[0][1]);
      for (const [x, y] of prev) g.lineTo(x, y);
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fillStyle = hx(pal.deep, pal.red, 0.25 + near * 0.2);
      g.fill();
      g.strokeStyle = line;
      g.globalAlpha = 0.25 + near * 0.75;
      g.lineWidth = 0.6 + near * 1.6;
      g.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        g.moveTo(prev[i][0], prev[i][1]);
        g.lineTo(pts[i][0], pts[i][1]);
      }
      g.stroke();
    }
    g.strokeStyle = line;
    g.globalAlpha = 0.3 + near * 0.7;
    g.lineWidth = 0.7 + near * 1.8;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.globalAlpha = 1;
    prev = pts;
  }
  // haze where the land meets the light
  const haze = g.createLinearGradient(0, horizon - 120, 0, horizon + 160);
  haze.addColorStop(0, rgba(pal.gold, 0));
  haze.addColorStop(0.5, rgba(pal.gold, 0.25));
  haze.addColorStop(1, rgba(pal.gold, 0));
  g.fillStyle = haze;
  g.fillRect(0, horizon - 120, SW, 280);
};

/** halftone: a grid of dots, each as big as the light under it */
const halftone = (pal: Pal) => (g: CanvasRenderingContext2D, t: number) => {
  const bg = g.createRadialGradient(560, 600, 0, 560, 600, 1100);
  bg.addColorStop(0, pal.hot);
  bg.addColorStop(0.45, pal.red);
  bg.addColorStop(1, pal.deep);
  g.fillStyle = bg;
  g.fillRect(0, 0, SW, SH);
  const cx = 560 + Math.sin(t * 0.8) * 40;
  const step = 15;
  for (let y = step / 2; y < SH; y += step)
    for (let x = step / 2; x < SW; x += step) {
      const i = Math.exp(-((x - cx) ** 2 + (y - 600) ** 2) / (2 * 380 ** 2)) + 0.45 * Math.exp(-((x - 1350) ** 2 + (y - 220) ** 2) / (2 * 260 ** 2));
      const k = Math.min(1, i);
      g.fillStyle = hx(pal.red, pal.gold, k);
      g.beginPath();
      g.arc(x, y, 1.1 + 5.6 * k, 0, Math.PI * 2);
      g.fill();
    }
};

/* ---------------- small pieces ---------------- */

/** the "thinking" burst: rays of uneven length, turning */
function Burst({ s, color, turn = 0 }: { s: number; color: string; turn?: number }) {
  const rays = [1, 0.72, 0.95, 0.68, 1, 0.75, 0.9, 0.7];
  return (
    <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "inline-block", verticalAlign: "middle", transform: `rotate(${turn}deg)` }}>
      {rays.map((k, i) => {
        const a = (i / rays.length) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 46 * k} y2={Math.sin(a) * 46 * k} stroke={color} strokeWidth="12" strokeLinecap="round" />;
      })}
    </svg>
  );
}

const Glass = (o: CSSProperties = {}): CSSProperties => ({ background: "rgba(255,255,255,.13)", border: "1.5px solid rgba(255,255,255,.34)", backdropFilter: "blur(14px)", boxShadow: "0 30px 60px -30px rgba(0,0,0,.45)", ...o });

/** the prompt box: what's typed, the model and its effort, the send button */
function Prompt({ x, y, w, h, text, t, at, cps, p, pal, dark = false }: { x: number; y: number; w: number; h: number; text: string; t: number; at: number; cps: number; p: P; pal: Pal; dark?: boolean }) {
  const s = typed(text, t, at, cps);
  const busy = t >= at && s.length < text.length;
  return (
    <div style={abs(x, y, { width: w, height: h, borderRadius: 22, ...(dark ? { background: "rgba(34,16,14,.62)", border: "1.5px solid rgba(255,255,255,.22)" } : Glass()) })}>
      <div style={abs(28, 24, { right: 28, fontFamily: SANS, fontSize: 27, lineHeight: "36px", color: "rgba(255,255,255,.94)" })}>
        {s}
        {t >= at - 0.4 && <Caret on={blink(t, busy)} />}
      </div>
      <div style={{ position: "absolute", right: 22, bottom: 18, display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 17, color: "rgba(255,255,255,.7)" }}>
        <span style={{ color: "#fff" }}>{p.model}</span>
        <span>{p.effort}</span>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: pal.hot, display: "grid", placeItems: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M12 19V5m-6 6 6-6 6 6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ---------------- the screen, scene by scene (drawn at 1600×1000) ---------------- */

function HookSite({ t, pal }: { t: number; pal: Pal }) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < 13; r++)
    for (let c = 0; c < 22; c++) {
      const v = 0.5 + 0.5 * Math.sin(c * 0.55 + t * 3.2 + Math.sin(r * 0.7) * 2) * Math.cos(r * 0.45 - t * 2.1);
      cells.push(<div key={`${r}-${c}`} style={abs(c * 20, r * 20, { width: 16, height: 16, borderRadius: 2, background: hx(pal.red, pal.gold, v), opacity: 0.25 + 0.75 * v })} />);
    }
  const bob = (ph: number) => Math.sin(t * 1.4 + ph) * 6;
  return (
    <div style={{ ...fill, background: "radial-gradient(circle at 62% 42%, #3a2340, #1a1220 58%, #0d0a10)" }}>
      <div style={abs(620, 250 + bob(0), { width: 440, height: 260 })}>{cells}</div>
      <div style={abs(170, 300 + bob(1), { width: 340, height: 230, borderRadius: 12, background: "#17121b", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)" })}>
        <div style={abs(14, 12, { display: "flex", gap: 7 })}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: 9, background: c }} />
          ))}
        </div>
        <div style={abs(130, 80, { width: 80, height: 80, borderRadius: 99, background: "#f4f1ee" })} />
        <div style={abs(40, 190, { width: 260, height: 8, borderRadius: 4, background: "rgba(255,255,255,.12)" })} />
      </div>
      <div style={abs(200, 590 + bob(2), { width: 200, height: 150, borderRadius: 12, background: "#120f18", border: "1px solid rgba(255,255,255,.1)", display: "grid", placeItems: "center" })}>
        <div style={{ width: 70, height: 70, borderRadius: 14, background: "#3d6bff", boxShadow: "0 0 50px 10px rgba(61,107,255,.55)" }} />
      </div>
      <div style={abs(1120, 560 + bob(3), { width: 240, height: 170, borderRadius: 10, background: "#efe9e4", transform: `rotate(${-4 + Math.sin(t) * 2}deg)`, boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)" })} />
      <Cursor x={lerp(900, 1180, inOut(seg(t, 0.6, 2.4)))} y={lerp(720, 640, inOut(seg(t, 0.6, 2.4)))} size={1.4} />
    </div>
  );
}

/** the first prompt, then the dive into it */
function Ask({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const k = expo(seg(t, C.ask, C.ask + 0.55));
  const dive = acc(seg(t, C.dive, C.land));
  return (
    <div style={{ ...fill, background: `radial-gradient(circle at 18% 108%, ${pal.cream} 0, ${pal.gold} 14%, transparent 42%), radial-gradient(circle at 88% 96%, ${pal.red}, transparent 46%), linear-gradient(180deg, ${pal.slate} 0%, #5b4558 34%, ${pal.red} 60%, ${pal.hot} 78%, ${pal.gold} 100%)` }}>
      <div style={{ ...fill, transformOrigin: "1080px 560px", transform: `scale(${lerp(1.14, 1, k) * lerp(1, 5.2, dive)})`, filter: k < 1 || dive > 0.02 ? `blur(${(1 - k) * 8 + dive * 14}px)` : undefined, opacity: lerp(0.3, 1, k) }}>
        <div style={abs(0, 300, { width: SW, textAlign: "center", fontFamily: SERIF, fontSize: 64, color: "#fff", letterSpacing: "-0.01em" })}>
          <Burst s={44} color="#fff" turn={t * 40} /> <span style={{ marginLeft: 10 }}>{p.ask}</span>
        </div>
        <Prompt x={310} y={400} w={980} h={170} text={p.prompt} t={t} at={C.ask + 0.15} cps={44} p={p} pal={pal} />
      </div>
      {t < C.dive + 0.3 && <Cursor x={lerp(1350, 1172, out(seg(t, 3.7, 4.2)))} y={lerp(700, 538, out(seg(t, 3.7, 4.2)))} press={clamp(seg(t, 4.3, 4.36))} size={1.5} />}
    </div>
  );
}

/** a white slab being made, turning over the land; then cards flying past */
function Made({ t, pal }: { t: number; pal: Pal }) {
  const fly = expo(seg(t, C.thing, C.thing + 0.9));
  const after = t >= C.flash;
  const rx = after ? 18 + Math.sin(t * 1.2) * 6 : lerp(52, 14, fly) + Math.sin(t * 1.5) * 4;
  const ry = after ? -26 + (t - C.flash) * 18 : lerp(-60, -8, fly) + Math.sin(t * 0.9) * 6;
  const x = after ? 760 : lerp(-200, 720, fly);
  const y = after ? 330 : lerp(820, 360, fly);
  const s = after ? 1.05 : lerp(1.7, 1, fly);
  const cards = rng(4);
  return (
    <div style={{ ...fill, perspective: 1100 }}>
      <div style={abs(x, y, { width: 320, height: 320, transformStyle: "preserve-3d", transform: `scale(${s}) rotateX(${rx}deg) rotateY(${ry}deg)` })}>
        <div style={{ ...fill, borderRadius: 46, background: "#d9d3da", transform: "translateZ(-34px)" }} />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ ...fill, borderRadius: 46, background: "#e7e2e7", transform: `translateZ(${-4 * i}px)` }} />
        ))}
        <div style={{ ...fill, borderRadius: 46, background: "linear-gradient(150deg, #ffffff, #f1edf1 60%, #e3dde4)", boxShadow: "inset 0 2px 0 #fff" }}>
          {after ? (
            <div style={abs(60, 90, { width: 200, height: 130, borderRadius: 14, background: "#1d1a20", boxShadow: "0 20px 30px -12px rgba(0,0,0,.4)" })}>
              <div style={abs(12, 10, { display: "flex", gap: 6 })}>
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <span key={c} style={{ width: 9, height: 9, borderRadius: 9, background: c }} />
                ))}
              </div>
              <div style={abs(24, 46, { width: 150, height: 56, borderRadius: 8, background: `linear-gradient(90deg, ${pal.hot}, ${pal.gold})` })} />
            </div>
          ) : (
            <div style={abs(110, 147, { width: 100, height: 26, borderRadius: 13, background: "#2a272d" })} />
          )}
        </div>
      </div>
      {after &&
        Array.from({ length: 7 }, (_, i) => {
          const v = 900 + cards() * 700;
          const y0 = 120 + cards() * 760;
          const t0 = C.flash + i * 0.14;
          const x = 1700 - (t - t0) * v;
          return t > t0 ? (
            <div key={i} style={abs(x, y0 + Math.sin(t * 2 + i) * 20, { width: 110 + cards() * 80, height: 70 + cards() * 40, borderRadius: 10, background: "#f6f2f5", transform: `rotate(${(cards() - 0.5) * 40 + (t - t0) * 60}deg)`, boxShadow: "0 16px 30px -12px rgba(0,0,0,.45)", filter: "blur(1.5px)" })} />
          ) : null;
        })}
    </div>
  );
}

function Land({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const words = p.thinking.split("|");
  const word = words[Math.floor((t - C.land) / 0.55) % words.length];
  const flash = t >= C.flash ? 1 - seg(t, C.flash, C.flash + 0.18) : 0;
  const glare = seg(t, 9.45, C.dots);
  const draw = terrain(pal);
  return (
    <div style={fill}>
      <Paint draw={draw} t={t} />
      <div style={abs(170, 410, { fontFamily: SANS, fontSize: 24, color: "#fff", display: "flex", alignItems: "center", gap: 14, opacity: out(seg(t, C.land + 0.1, C.land + 0.4)) })}>
        <Burst s={30} color="#fff" turn={t * 160} />
        <span>{word}…</span>
      </div>
      <div style={abs(1030, 110, { width: 440, padding: "18px 22px", borderRadius: 16, background: "rgba(30,14,20,.5)", border: "1px solid rgba(255,255,255,.18)", fontFamily: SANS, fontSize: 17, lineHeight: "25px", color: "rgba(255,255,255,.9)", opacity: out(seg(t, C.land + 0.2, C.land + 0.6)) })}>{p.prompt}</div>
      {t >= C.thing && <Made t={t} pal={pal} />}
      {flash > 0 && <div style={{ ...fill, background: "#fff", opacity: flash * 0.85 }} />}
      {glare > 0 && <div style={{ ...fill, background: `radial-gradient(circle at ${lerp(-10, 60, glare)}% 55%, ${pal.cream} 0, ${pal.gold} ${lerp(5, 40, glare)}%, ${rgba(pal.hot, 0)} ${lerp(30, 90, glare)}%)`, opacity: Math.sin(Math.PI * glare) * 1.1 }} />}
    </div>
  );
}

function Dots({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const draw = halftone(pal);
  const k = out(seg(t, C.dots, C.dots + 0.5));
  return (
    <div style={fill}>
      <Paint draw={draw} t={t} />
      <div style={{ ...fill, opacity: k, transform: `translateY(${(1 - k) * 20}px)` }}>
        <div style={abs(0, 336, { width: SW, textAlign: "center", fontFamily: SERIF, fontSize: 40, color: "#fff" })}>
          <Burst s={28} color="#fff" turn={t * 40} /> <span style={{ marginLeft: 6 }}>{p.ask}</span>
        </div>
        <Prompt x={450} y={410} w={700} h={130} text={p.edit} t={t} at={10.5} cps={9} p={p} pal={pal} dark />
      </div>
      <Cursor x={lerp(1260, 1080, out(seg(t, 10.3, 10.9)))} y={lerp(760, 600, out(seg(t, 10.3, 10.9)))} size={1.5} />
      <div style={abs(1100, 620, { width: 120, height: 34, borderRadius: 6, background: "#fff", opacity: out(seg(t, 10.9, 11.1)) })} />
    </div>
  );
}

/** the word drum and the picture it edits: remove, create, enhance, 3D */
function Verbs({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const verbs = p.verbs.split("|");
  const at = (n: number) => Math.min(verbs.length - 1, n);
  const steps: [number, number, number][] = [
    [14.8, at(5), 0.42],
    [16.6, at(6), 0.42],
    [18.05, 0, 0.55],
  ];
  let f = at(4);
  for (const [s, to, d] of steps) f = lerp(f, to, back(seg(t, s, s + d), 1.15));
  const active = Math.round(f);
  const spinning = Math.abs(f - active) > 0.04;
  const flare = (a: number, b: number) => {
    const k = seg(t, a, b);
    return k > 0 && k < 1 ? `radial-gradient(circle at ${lerp(-30, 120, inOut(k))}% ${lerp(70, 55, k)}%, #fffbd0 0, ${pal.gold} 9%, ${rgba(pal.gold, 0.5)} 18%, ${rgba(pal.hot, 0)} 38%), ` : "";
  };
  const edit = active === at(5) ? "create" : active === at(6) ? "enhance" : active === 0 ? "3d" : "remove";
  const removed = seg(t, 12.35, 12.85);
  const created = back(seg(t, 15.0, 15.4), 1.8);
  const enhanced = edit === "enhance" || edit === "3d" ? inOut(seg(t, 16.75, 17.2)) : 0;
  const deep = inOut(seg(t, 18.4, 19.0));
  const zoom = inOut(seg(t, 19.3, C.product));
  return (
    <div style={fill}>
      <div style={abs(0, 0, { width: 800, height: SH, overflow: "hidden", background: `${flare(12.25, 13.5)}${flare(18.0, 19.1)}radial-gradient(circle at 8% 100%, ${pal.gold}, transparent 40%), linear-gradient(160deg, ${pal.hot} 0%, ${hx(pal.hot, pal.red, 0.3)} 45%, ${pal.red} 78%, ${hx(pal.red, pal.deep, 0.5)} 100%)` })}>
        {verbs.map((v, i) => {
          const d = i - f;
          return (
            <div
              key={i}
              style={abs(110, 450 + d * 102, {
                fontFamily: GEO,
                fontSize: 92,
                fontWeight: 400,
                lineHeight: "100px",
                color: "#fff",
                whiteSpace: "nowrap",
                opacity: clamp(1.3 - Math.abs(d) * 0.1),
                filter: spinning ? `blur(${Math.min(5, Math.abs(f - Math.round(f)) * 12)}px)` : undefined,
              })}
            >
              {i === active && !spinning && (
                <span style={abs(-64, 10)}>
                  <Burst s={52} color="#fff" turn={t * 90} />
                </span>
              )}
              <span style={{ marginLeft: i === active ? 10 : 0 }}>{v}</span>
            </div>
          );
        })}
      </div>
      <div style={abs(800, 0, { width: 800, height: SH, background: `radial-gradient(circle at 60% 45%, #3a2a34, ${pal.plum} 60%)`, overflow: "hidden", perspective: 1200 })}>
        {[
          [120, 180],
          [680, 140],
          [90, 760],
          [700, 820],
        ].map(([x, y], i) => (
          <div key={i} style={abs(x, y, { width: 6, height: 6, borderRadius: 9, background: "#fff", opacity: 0.6 + 0.4 * Math.sin(t * 3 + i) })} />
        ))}
        <svg width="54" height="42" viewBox="0 0 9 7" style={abs(690, 40)} shapeRendering="crispEdges">
          {[
            [3, 0],
            [4, 0],
            [5, 0],
            [2, 1],
            [3, 1],
            [4, 1],
            [5, 1],
            [6, 1],
            [1, 2],
            [3, 2],
            [5, 2],
            [7, 2],
            [1, 3],
            [2, 3],
            [3, 3],
            [4, 3],
            [5, 3],
            [6, 3],
            [7, 3],
            [2, 4],
            [6, 4],
            [1, 5],
            [7, 5],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="1" height="1" fill={pal.hot} />
          ))}
        </svg>
        <div
          style={abs(190, 250, {
            width: 420,
            height: 460,
            transformStyle: "preserve-3d",
            transform: `translateZ(${zoom * 260}px) rotateY(${-24 * deep + Math.sin(t * 1.4) * 4 * deep}deg) rotateX(${10 * deep}deg)`,
          })}
        >
          <div
            style={{
              ...fill,
              borderRadius: 8,
              overflow: "hidden",
              background: enhanced > 0 ? `radial-gradient(circle at 50% 40%, #fff6e8, ${hx("#ffd8b0", pal.gold, 0.3)} 70%)` : "#f6f4f2",
              boxShadow: `0 ${30 + deep * 40}px ${60 + deep * 40}px -20px rgba(0,0,0,.6)`,
            }}
          >
            <img src={`${IMG}photo-1742281257687-092746ad6021.jpg`} alt="" style={{ ...fill, width: "100%", height: "100%", objectFit: "cover", opacity: 1 - removed, filter: "blur(1px)" }} />
            {removed > 0 && removed < 1 && <div style={abs(lerp(-40, 440, removed), 0, { width: 6, height: 460, background: "#fff", boxShadow: `0 0 30px 10px ${rgba("#ffffff", 0.8)}` })} />}
            {enhanced > 0 && <div style={{ ...fill, background: `linear-gradient(115deg, transparent ${lerp(-20, 120, seg(t, 16.8, 17.6)) - 10}%, rgba(255,255,255,.55) ${lerp(-20, 120, seg(t, 16.8, 17.6))}%, transparent ${lerp(-20, 120, seg(t, 16.8, 17.6)) + 10}%)` }} />}
          </div>
          <img
            src={`${IMG}dishes/biryani-cutout.png`}
            alt=""
            style={abs(20, 90, {
              width: 380,
              transform: `translateZ(${deep * 90}px) scale(${lerp(1, 1.06, enhanced)})`,
              filter: `saturate(${lerp(1, 1.45, enhanced)}) contrast(${lerp(1, 1.12, enhanced)}) drop-shadow(0 ${18 + deep * 30}px ${20 + deep * 20}px rgba(0,0,0,.35))`,
            })}
          />
          {created > 0 && (
            <img src={`${IMG}dishes/tea-cutout.png`} alt="" style={abs(230, 290, { width: 200, transform: `translateZ(${deep * 140}px) scale(${created}) rotate(${(1 - created) * -20}deg)`, filter: "drop-shadow(0 14px 16px rgba(0,0,0,.35))" })} />
          )}
        </div>
      </div>
    </div>
  );
}

function Product({ t, pal }: { t: number; pal: Pal }) {
  const k = expo(seg(t, C.product, C.product + 0.6));
  const blobs = [
    [1130, 560, 70, 0],
    [430, 760, 46, 1.4],
  ];
  return (
    <div style={{ ...fill, background: "radial-gradient(circle at 50% 45%, #fbf9f8, #e9e4e1)", perspective: 1400 }}>
      {blobs.map(([x, y, r, ph], i) => (
        <div key={i} style={abs(x + Math.sin(t * 2 + ph) * 30, y + Math.cos(t * 1.6 + ph) * 20, { width: r * 2, height: r * 2, borderRadius: 99, background: `radial-gradient(circle at 35% 35%, ${pal.gold}, ${pal.hot} 55%, ${rgba(pal.hot, 0)} 72%)`, filter: "blur(4px)" })} />
      ))}
      <div style={abs(470, 230, { width: 660, transform: `rotateY(${Math.sin((t - C.product) * 2.2) * 26}deg) rotateX(${8 + Math.sin(t * 1.3) * 4}deg) scale(${lerp(0.8, 1, k)})`, opacity: k })}>
        <img src={`${IMG}dishes/biryani-cutout.png`} alt="" style={{ width: "100%", display: "block", filter: "drop-shadow(0 40px 40px rgba(60,20,10,.3)) saturate(1.2)" }} />
      </div>
      <div style={abs(560, 830, { width: 480, height: 40, borderRadius: "50%", background: "rgba(80,40,30,.18)", filter: "blur(14px)" })} />
    </div>
  );
}

function Arcs({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const words = p.together.split("|");
  const grow = (t - C.arcs) * 70;
  const ring = (r: number) => `radial-gradient(circle at 1500px 520px, transparent ${r - 40}px, ${rgba(pal.red, 0.9)} ${r - 30}px, ${pal.hot} ${r - 6}px, ${pal.cream} ${r}px, ${rgba(pal.hot, 0.6)} ${r + 8}px, ${rgba(pal.red, 0.3)} ${r + 40}px, transparent ${r + 90}px)`;
  return (
    <div style={{ ...fill, background: `${[420, 720, 1020, 1320].map((r) => ring(r + grow)).join(", ")}, #150d12` }}>
      {words.map((w, i) => (
        <div key={i} style={abs(320 + i * 420 - (t - C.arcs) * 260, 470, { fontFamily: SANS, fontSize: 64, color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 60 })}>
          {w}
          <span style={{ width: 8, height: 8, borderRadius: 9, background: "rgba(255,255,255,.7)" }} />
        </div>
      ))}
    </div>
  );
}

/** a ring of fire: flame edges from turbulence, its seed stepped with the clock */
function Ring({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const k = expo(seg(t, C.ring, C.ring + 0.9));
  const flash = 1 - seg(t, C.ring, C.ring + 0.35);
  const seed = Math.floor(t * 12);
  return (
    <div style={{ ...fill, background: "radial-gradient(circle at 50% 56%, #2a1416, #120a0e 70%)" }}>
      <svg width={SW} height={SH} style={abs(0, 0)}>
        <defs>
          <filter id="desk-fire" x="-20%" y="-40%" width="140%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="38" />
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="desk-glow" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
        </defs>
        <g transform={`translate(800 560) scale(${lerp(0.7, 1.06, k) + (t - C.ring) * 0.03})`}>
          <ellipse rx="560" ry="215" fill="none" stroke={pal.red} strokeWidth="90" opacity="0.7" filter="url(#desk-glow)" />
          <ellipse rx="560" ry="215" fill="none" stroke={pal.hot} strokeWidth="46" filter="url(#desk-fire)" />
          <ellipse rx="560" ry="215" fill="none" stroke={pal.gold} strokeWidth="16" filter="url(#desk-fire)" />
          <ellipse rx="560" ry="215" fill="none" stroke={pal.cream} strokeWidth="4" />
          <ellipse rx="330" ry="125" fill="none" stroke={pal.hot} strokeWidth="26" filter="url(#desk-fire)" />
          <ellipse rx="330" ry="125" fill="none" stroke={pal.gold} strokeWidth="6" />
          <ellipse rx="300" ry="112" fill="#1c1013" />
        </g>
      </svg>
      <div style={abs(0, 538, { width: SW, textAlign: "center", fontFamily: SANS, fontSize: 34, color: "#fff", opacity: out(seg(t, C.ring + 0.3, C.ring + 0.7)) })}>{p.everything}</div>
      {flash > 0 && <div style={{ ...fill, background: `radial-gradient(circle at 50% 56%, #fff, ${pal.cream} 40%, ${pal.gold})`, opacity: flash * 0.9 }} />}
    </div>
  );
}

function Sunset({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const line = p.line;
  const typedTo = Math.floor(clamp((t - 24.65) / 1.0) * line.length);
  const back2 = Math.floor(clamp((t - 25.95) / 0.35) * (line.length - 2));
  const s = line.slice(0, Math.max(0, typedTo - back2));
  const busy = (t > 24.65 && t < 25.65) || (t > 25.95 && t < 26.3);
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 50% -10%, ${pal.gold} 0, ${rgba(pal.gold, 0)} 45%), linear-gradient(180deg, ${pal.hot} 0%, ${hx(pal.hot, pal.red, 0.4)} 28%, ${hx(pal.red, pal.slate, 0.5)} 55%, ${pal.slate} 78%, #2d2b40 100%)` }}>
      <div style={abs(0, 466, { width: SW, textAlign: "center", fontFamily: SANS, fontSize: 52, color: "#fff", letterSpacing: "-0.015em" })}>
        {s}
        <Caret on={blink(t, busy)} />
      </div>
    </div>
  );
}

/** a quick recap: a collage, then the film so far, a tenth of a second each */
function Recap({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const i = RECAP.filter((x) => t >= x).length - 1;
  if (i === 1) return <Dots t={10.6} p={p} pal={pal} />;
  if (i === 3) return <Land t={6.4} p={p} pal={pal} />;
  if (i === 4) return <Verbs t={17.4} p={p} pal={pal} />;
  if (i === 5) return <Ring t={23.4} p={p} pal={pal} />;
  const r = rng(i + 3);
  return (
    <div style={{ ...fill, background: "#fbf8f6", overflow: "hidden" }}>
      {Array.from({ length: 6 }, (_, k) => (
        <div key={k} style={abs(r() * 1300, r() * 800, { width: 220 + r() * 180, height: 160 + r() * 140, background: "#fff", border: "1px solid #e4dfdc", boxShadow: "0 12px 30px -14px rgba(0,0,0,.25)", transform: `rotate(${(r() - 0.5) * 24}deg) translateX(${-(t - RECAP[i]) * 900}px)` })}>
          <svg width="100%" height="100%" viewBox="0 0 100 70" preserveAspectRatio="none">
            <path d={`M10 ${20 + r() * 30} Q 50 ${r() * 70} 90 ${20 + r() * 30}`} stroke="#999" strokeWidth="0.6" fill="none" />
            <path d={`M15 55 L ${40 + r() * 40} 55`} stroke="#bbb" strokeWidth="0.6" />
          </svg>
        </div>
      ))}
      <img src={`${IMG}dishes/tea-cutout.png`} alt="" style={abs(860 - (t - RECAP[i]) * 500, 260, { width: 420 })} />
      {i === 6 && <div style={abs(900, 120, { width: 700, height: 700, borderRadius: 999, background: `radial-gradient(circle, ${pal.cream}, ${pal.gold} 30%, ${pal.hot} 55%, transparent 70%)` })} />}
      <div style={abs(120, 380, { fontFamily: SERIF, fontSize: 150, color: "rgba(40,30,30,.85)", whiteSpace: "nowrap" })}>{p.ask.split(" ").slice(-2).join(" ")}</div>
    </div>
  );
}

function Sun({ t, pal }: { t: number; pal: Pal }) {
  const k = expo(seg(t, C.sun, C.sun + 0.5));
  const seed = Math.floor(t * 12);
  return (
    <div style={{ ...fill, background: `radial-gradient(circle at 50% 52%, ${pal.red}, ${pal.deep} 60%, #1a0608)` }}>
      <svg width={SW} height={SH} style={abs(0, 0)}>
        <defs>
          <filter id="desk-sun" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="70" />
          </filter>
          <radialGradient id="desk-core">
            <stop offset="0" stopColor="#fffdf0" />
            <stop offset="0.25" stopColor={pal.cream} />
            <stop offset="0.5" stopColor={pal.gold} />
            <stop offset="0.75" stopColor={pal.hot} />
            <stop offset="1" stopColor={pal.red} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(800 520) scale(${lerp(0.4, 1, k) * (1 + Math.sin(t * 9) * 0.015)})`}>
          <circle r="330" fill={pal.hot} opacity="0.35" filter="url(#desk-sun)" />
          <circle r="280" fill="none" stroke={pal.gold} strokeWidth="40" filter="url(#desk-sun)" />
          <circle r="250" fill="url(#desk-core)" />
        </g>
      </svg>
    </div>
  );
}

function Dark({ t }: { t: number }) {
  const k = 1 - seg(t, C.dark + 0.15, C.dark + 0.8);
  return (
    <div style={{ ...fill, background: "#050507" }}>
      <div style={abs(770, 470, { width: 60, height: 60, borderRadius: 99, background: "radial-gradient(circle, #fff, rgba(255,255,255,.5) 35%, transparent 70%)", filter: "blur(4px)", opacity: k, transform: `scale(${lerp(0.6, 1, k)})` })} />
    </div>
  );
}

function Content({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  if (t < C.ask) return <HookSite t={t} pal={pal} />;
  if (t < C.land) return <Ask t={t} p={p} pal={pal} />;
  if (t < C.dots) return <Land t={t} p={p} pal={pal} />;
  if (t < C.verbs) return <Dots t={t} p={p} pal={pal} />;
  if (t < C.product) return <Verbs t={t} p={p} pal={pal} />;
  if (t < C.arcs) return <Product t={t} pal={pal} />;
  if (t < C.ring) return <Arcs t={t} p={p} pal={pal} />;
  if (t < C.sunset) return <Ring t={t} p={p} pal={pal} />;
  if (t < C.recap) return <Sunset t={t} p={p} pal={pal} />;
  if (t < C.sun) return <Recap t={t} p={p} pal={pal} />;
  if (t < C.dark) return <Sun t={t} pal={pal} />;
  return <Dark t={t} />;
}

/** the Mac's own chrome over whatever plays: the menu bar, the notch, the dock */
function Chrome({ dark, b }: { dark: boolean; b: number }) {
  const icons = ["#3b82f6", "#f97316", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#0ea5e9", "#f43f5e", "#14b8a6", "#64748b", "#f59e0b", "#6366f1", "#10b981", "#ec4899", "#84cc16", "#06b6d4", "#d946ef", "#fb923c"];
  return (
    <>
      <div style={abs(0, 0, { width: SW, height: 26, background: dark ? "rgba(20,16,22,.55)" : "rgba(240,236,240,.82)", display: "flex", alignItems: "center", gap: 22, paddingLeft: 22, fontFamily: SANS, fontSize: 13, fontWeight: 600, color: dark ? "#ddd" : "#222" })}>
        <span></span>
        {["File", "Edit", "View", "History", "Window"].map((s) => (
          <span key={s} style={{ fontWeight: s === "File" ? 700 : 500 }}>
            {s}
          </span>
        ))}
      </div>
      <div style={abs(SW / 2 - 95, 0, { width: 190, height: 30, background: "#000", borderRadius: "0 0 14px 14px" })} />
      <div style={abs(SW / 2 - 400, SH - 62, { opacity: lerp(0.35, 1, clamp(b * 1.4)), width: 800, height: 54, borderRadius: 18, background: "rgba(40,30,40,.38)", border: "1px solid rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, backdropFilter: "blur(12px)" })}>
        {icons.map((c, i) => (
          <span key={i} style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(160deg, ${hx(c, "#ffffff", 0.3)}, ${c})` }} />
        ))}
      </div>
    </>
  );
}

/* ---------------- the laptop, the desk, the room ---------------- */

/** the desk's light, painted at a tenth of its size: a soft pool of the screen's colour, a shadow under the laptop */
function Desk({ glow, b }: { glow: string; b: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0a0809";
    g.fillRect(0, 0, 700, 520);
    const pool = (x: number, y: number, rx: number, ry: number, c: string) => {
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, c);
      gr.addColorStop(0.7, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    };
    pool(350, 170, 150, 110, rgba(glow, 0.32 * b));
    pool(350, 290, 90, 50, "rgba(0,0,0,.65)");
  }, [glow, b]);
  return <canvas ref={ref} width={700} height={520} style={{ display: "block", width: 7000, height: 5200 }} />;
}

const LW = 1660;
const LH = 1056;
const BD = 1140;
const BT = 26;

function Laptop({ t, p, pal }: { t: number; p: P; pal: Pal }) {
  const [glow, b] = lightAt(t, pal);
  // the deck: dark aluminium, lit from the screen, brightest at the hinge
  const lit = (k: number) => hx("#0c0c0f", hx("#e6dde9", glow, 0.3), clamp(k * b));
  const keys: ReactNode[] = [];
  const rows = [
    { y: 0, h: 40, n: 14 },
    { y: 50, h: 66, n: 14 },
    { y: 126, h: 66, n: 14 },
    { y: 202, h: 66, n: 13 },
    { y: 278, h: 66, n: 12 },
    { y: 354, h: 66, n: 10 },
  ];
  rows.forEach((r, ri) => {
    const gap = 10;
    const wide = ri === 5 ? [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] : null;
    const total = 1180;
    const unit = wide ? (total - gap * (r.n - 1) - 380) / (r.n - 1) : (total - gap * (r.n - 1)) / r.n;
    let x = 0;
    for (let i = 0; i < r.n; i++) {
      const w = wide?.[i] ? unit + 380 : ri >= 3 && (i === 0 || i === r.n - 1) ? unit * (1 + (ri - 2) * 0.35) - ((ri - 2) * 0.35 * unit * 2) / (r.n - 2) : unit;
      keys.push(<div key={`${ri}-${i}`} style={abs(x, r.y, { width: Math.max(10, w), height: r.h, borderRadius: 9, background: `linear-gradient(180deg, ${hx("#202024", glow, 0.12 * b)}, #111114)`, boxShadow: `inset 0 1.5px 0 ${rgba(hx("#ffffff", glow, 0.5), 0.18 + 0.3 * b)}` })} />);
      x += Math.max(10, w) + gap;
    }
  });
  const grille = { background: "radial-gradient(circle, rgba(0,0,0,.55) 1.4px, transparent 1.8px) 0 0 / 10px 10px" } as CSSProperties;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformStyle: "preserve-3d" }}>
      {/* the desk, and the screen's light on it: painted small into a canvas (a texture: the swaying camera never re-draws it) */}
      <div style={abs(-3500, BT, { width: 7000, height: 5200, transformOrigin: "50% 0", transform: "translateZ(-1600px) rotateX(90deg)" })}>
        <Desk glow={glow} b={b} />
      </div>
      {/* the base: top, front and left faces */}
      <div style={abs(-LW / 2, 0, { width: LW, height: BD, transformOrigin: "50% 0", transform: "rotateX(90deg)", borderRadius: "0 0 36px 36px", background: `linear-gradient(180deg, ${lit(0.95)} 0%, ${lit(0.62)} 26%, ${lit(0.34)} 60%, ${lit(0.16)} 100%)`, overflow: "hidden" })}>
        <div style={abs(60, 150, { width: 150, height: 470, ...grille })} />
        <div style={abs(LW - 210, 150, { width: 150, height: 470, ...grille })} />
        <div style={abs(230, 140, { width: 1200, height: 440, borderRadius: 18, background: "#09090b", padding: 10, boxSizing: "border-box" })}>
          <div style={{ position: "relative" }}>{keys}</div>
        </div>
        <div style={abs(LW / 2 - 300, 640, { width: 600, height: 400, borderRadius: 24, background: lit(0.42), boxShadow: `inset 0 0 0 1.5px ${rgba(hx("#ffffff", glow, 0.4), 0.12 + 0.2 * b)}` })} />
        <div style={{ ...fill, background: `linear-gradient(180deg, ${rgba(glow, 0.5 * b)} 0%, ${rgba(glow, 0.12 * b)} 45%, transparent 75%)`, mixBlendMode: "screen" }} />
      </div>
      <div style={abs(-LW / 2, 0, { width: LW, height: BT, transform: `translateZ(${BD}px)`, borderRadius: "0 0 14px 14px", background: `linear-gradient(180deg, ${lit(0.3)}, ${lit(0.08)})` })} />
      <div style={abs(-LW / 2, 0, { width: BD, height: BT, transformOrigin: "0 0", transform: "rotateY(-90deg)", background: `linear-gradient(90deg, ${lit(0.35)}, ${lit(0.12)})` })} />
      {/* the lid: a black glass bezel round the live screen, an aluminium rim */}
      <div style={abs(-LW / 2, -LH, { width: LW, height: LH, transformOrigin: "50% 100%", transform: "translateZ(14px) rotateX(13deg)", borderRadius: "34px 34px 6px 6px", background: "#060607", boxShadow: `0 0 0 3px ${lit(0.5)}, 0 0 ${140 * b}px ${30 * b}px ${rgba(glow, 0.35 * b)}` })}>
        <div style={abs(30, 26, { width: SW, height: SH, borderRadius: "16px 16px 4px 4px", overflow: "hidden", background: "#000" })}>
          <Content t={t} p={p} pal={pal} />
          <Chrome dark={t < C.ask || (t >= C.arcs && t < C.sunset) || t >= C.dark} b={b} />
          {/* the screen's glass catches a little of the room */}
          <div style={{ ...fill, background: "linear-gradient(115deg, rgba(255,255,255,.05) 0%, transparent 30%, transparent 70%, rgba(255,255,255,.03) 100%)" }} />
        </div>
      </div>
    </div>
  );
}

type Cam = { x: number; y: number; z: number; pitch: number; yaw: number; roll: number };
const HOOK: Cam = { x: 190, y: 560, z: -900, pitch: -6, yaw: 31, roll: -0.6 };
const MAIN: Cam = { x: 250, y: 600, z: -470, pitch: -3.2, yaw: 24, roll: 0.8 };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k), pitch: lerp(a.pitch, b.pitch, k), yaw: lerp(a.yaw, b.yaw, k), roll: lerp(a.roll, b.roll, k) });

/** where the phone is at t: a wide look, then close, a push into the prompt, and always a hand holding it */
function camAt(t: number): Cam {
  let c: Cam;
  if (t < C.ask) c = { ...HOOK, z: HOOK.z + t * 50 };
  else {
    const drift = (t - C.ask) * 9;
    c = { ...MAIN, z: MAIN.z + drift };
    const push = inOut(seg(t, C.push, C.push + 0.5)) * (t < C.verbs ? 1 : 0);
    c = mixCam(c, { ...c, z: c.z + 360, x: c.x + 60, y: c.y + 120, pitch: c.pitch + 2 }, push);
    if (t >= C.verbs && t < C.product) c = { ...c, z: c.z + 60 };
  }
  // the hand: slow sway plus a little tremor
  return {
    x: c.x + Math.sin(t * 0.9) * 9 + Math.sin(t * 2.7 + 1) * 3,
    y: c.y + Math.sin(t * 1.1 + 2) * 7 + Math.sin(t * 3.1) * 2.5,
    z: c.z + Math.sin(t * 0.5) * 18,
    pitch: c.pitch + Math.sin(t * 0.8 + 1) * 0.5,
    yaw: c.yaw + Math.sin(t * 0.6 + 3) * 0.7,
    roll: c.roll + Math.sin(t * 0.7 + 0.5) * 0.45 + Math.sin(t * 2.3) * 0.12,
  };
}

/** film grain: one noise tile, moved every frame (a layer of its own, so moving it costs nothing) */
function Grain({ t }: { t: number }) {
  const f = Math.floor(t * 30);
  return (
    <svg width={1200} height={2040} style={abs(-60, -60, { opacity: 0.09, mixBlendMode: "overlay", willChange: "transform", transform: `translate(${((f * 37) % 61) - 30}px, ${((f * 53) % 61) - 30}px)`, pointerEvents: "none" })}>
      <filter id="desk-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#desk-grain)" />
    </svg>
  );
}

export default function LitDesk({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const ready = useWebFonts(FONTS, ['italic 40px "Instrument Serif"', '400 40px "Outfit"']);
  const t = useClock(DUR);
  const pal = palette(p.accent);
  const cam = camAt(t);
  const [glow, b] = lightAt(t, pal);
  const hook = t < C.ask;
  return (
    <Stage w={1080} h={1920} background="#07060a" style={{ fontFamily: SANS }}>
      {ready && (
        <>
          {/* the room: dark, with the screen's colour in the air; in the wide look, a lit wall on the right */}
          <div style={{ ...fill, background: `radial-gradient(ellipse 900px 700px at 50% 42%, ${rgba(glow, 0.22 * b)}, transparent 75%), linear-gradient(180deg, #0b090d, #08070a)` }} />
          {hook && <div style={{ ...fill, background: "linear-gradient(90deg, transparent 52%, rgba(70,64,74,.35) 70%, rgba(120,114,124,.55) 86%, rgba(80,76,84,.4) 100%), radial-gradient(ellipse 160px 900px at 930px 600px, rgba(255,250,240,.18), transparent 70%)" }} />}
          <div style={{ ...fill, perspective: 1150, perspectiveOrigin: "540px 900px" }}>
            <div style={abs(540, 960, { transformStyle: "preserve-3d", transform: `translate3d(${cam.x}px, ${cam.y}px, ${cam.z}px) rotateZ(${cam.roll}deg) rotateX(${cam.pitch}deg) rotateY(${cam.yaw}deg)` })}>
              <Laptop t={t} p={p} pal={pal} />
            </div>
          </div>
          {/* the phone's lens: a vignette and grain */}
          <div style={{ ...fill, background: "radial-gradient(ellipse 85% 70% at 50% 48%, transparent 55%, rgba(0,0,0,.55) 100%)" }} />
          <Grain t={t} />
          <div style={abs(0, 368, { width: 1080, display: "flex", justifyContent: "center" })}>
            <div style={{ background: "#fff", borderRadius: 18, padding: "16px 34px 20px", fontFamily: SANS, fontWeight: 700, fontSize: 66, lineHeight: "76px", letterSpacing: "-0.02em", color: "#0a0a0a", boxShadow: "0 10px 30px -10px rgba(0,0,0,.4)" }}>{p.caption}</div>
          </div>
        </>
      )}
    </Stage>
  );
}
