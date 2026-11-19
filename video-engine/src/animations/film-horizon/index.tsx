// Horizon launch: a launch film in deep space, replicated from the Arcane Pay film. Its cuts (measured: 1.5, 2.75,
// 3.1, 5.6, 9.87, 11.63, 13.0, 15.87, 18.7, 21.1 s), its framing and its navy-and-periwinkle light are the
// reference's; the product, its words and its accent are params. The panels are drawn here, in the reference's glass.
import type { CSSProperties, ReactNode } from "react";
import { Cursor, Shown, Stage, alpha, at, back, clamp, expo, fill, hexMix, inOut, lerp, out, rng, seg, useClock, useFonts, useWebFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 23.6;
const T = { swap: 1.5, tilt: 2.75, space: 3.1, intro: 5.0, panel: 5.6, wallet: 7.8, hashes: 9.87, easy: 11.63, pills: 13.0, collect: 14.45, orbit: 15.87, zoom: 17.2, dash: 18.7, end: 21.1 };
const FONTS = "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap";
const SANS = '"Manrope", "Geist", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const NIGHT = "#0b0b10";

/* ---------------- the sky ---------------- */

const STARS = (() => {
  const r = rng(12);
  return Array.from({ length: 170 }, () => ({ x: r() * 1920, y: r() * 1080, s: 0.6 + r() * 1.8, ph: r() * 6 }));
})();
const Stars = ({ t, o = 1 }: { t: number; o?: number }) => (
  <svg width={1920} height={1080} style={{ ...at(0, 0), opacity: o }}>
    {STARS.map((s, i) => (
      <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#dfe4ff" opacity={0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.ph))} />
    ))}
  </svg>
);

/** blue light falling from above: soft wedges, drifting */
const Rays = ({ t, a, o = 1, from = 0.5 }: { t: number; a: string; o?: number; from?: number }) => (
  <div style={{ ...fill, opacity: o, overflow: "hidden" }}>
    {[
      [-14, 0.9, 260],
      [6, 0.7, 180],
      [22, 0.55, 320],
      [-30, 0.45, 140],
    ].map(([ang, op, w], i) => (
      <div
        key={i}
        style={at(1920 * from - w / 2 + Math.sin(t * 0.4 + i) * 40, -200, {
          width: w,
          height: 1500,
          transformOrigin: "50% 0",
          transform: `rotate(${ang + Math.sin(t * 0.3 + i * 2) * 3}deg)`,
          background: `linear-gradient(180deg, ${alpha(a, op)}, ${alpha(a, op * 0.4)} 40%, transparent 75%)`,
          filter: "blur(38px)",
          mixBlendMode: "screen",
        })}
      />
    ))}
  </div>
);

/** a planet's edge: the dark body, its rim lit from behind */
const Horizon = ({ y, a }: { y: number; a: string }) => (
  <div style={{ ...fill, overflow: "hidden" }}>
    <div style={at(960 - 1500, y, { width: 3000, height: 1400, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 0%, ${alpha(hexMix(a, "#ffffff", 0.6), 0.55)}, transparent 30%)`, filter: "blur(30px)", transform: "translateY(-60px)" })} />
    <div style={at(960 - 1500, y, { width: 3000, height: 1400, borderRadius: "50%", background: "#07070b", boxShadow: `0 -3px 0 ${hexMix(a, "#ffffff", 0.75)}, 0 -10px 24px ${alpha(a, 0.9)}, 0 -40px 90px ${alpha(a, 0.5)}` })} />
  </div>
);

/** a comet: a line of light with a bright head */
const Comet = ({ x, y, len, ang = -4, o = 1 }: { x: number; y: number; len: number; ang?: number; o?: number }) => (
  <div style={at(x - len, y, { width: len, height: 3, transformOrigin: "100% 50%", transform: `rotate(${ang}deg)`, opacity: o })}>
    <div style={{ ...fill, background: "linear-gradient(90deg, transparent, rgba(220,228,255,.75))", borderRadius: 3 }} />
    <div style={at(len - 14, -12, { width: 28, height: 28, borderRadius: 99, background: "radial-gradient(circle, #fff, rgba(200,210,255,.6) 35%, transparent 70%)" })} />
  </div>
);

/** clouds of blue: the nebula behind the later shots */
const Nebula = ({ t, a, o = 1 }: { t: number; a: string; o?: number }) => (
  <div style={{ ...fill, opacity: o, overflow: "hidden" }}>
    {[
      [300, 200, 900, 500, 0.55],
      [1300, 100, 1000, 600, 0.45],
      [700, 700, 1200, 500, 0.35],
    ].map(([x, y, w, h, op], i) => (
      <div key={i} style={at(x + Math.sin(t * 0.25 + i) * 60, y + Math.cos(t * 0.2 + i) * 30, { width: w, height: h, borderRadius: "50%", background: alpha(hexMix(a, "#2a3a9a", 0.3), op), filter: "blur(90px)" })} />
    ))}
  </div>
);

/** the product's mark: a spiral of light */
const Spiral = ({ s, glow = 1 }: { s: number; glow?: number }) => (
  <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "inline-block", verticalAlign: "middle", filter: `drop-shadow(0 0 ${8 * glow}px rgba(190,200,255,.9))` }}>
    <path d="M0 -38 A38 38 0 1 1 -33 19 M0 -24 A24 24 0 1 1 -21 12 M0 -10 A10 10 0 1 1 -9 5" fill="none" stroke="#f3f5ff" strokeWidth="9" strokeLinecap="round" />
  </svg>
);

/* ---------------- words ---------------- */

/** a line arriving letter by letter out of a blur (the reference's light, airy entrance) */
function Light({ text, t, at: t0, per = 0.03, size, color = "#f2f4ff", style }: { text: string; t: number; at: number; per?: number; size: number; color?: string; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: SANS, fontSize: size, fontWeight: 400, letterSpacing: "0.02em", color, whiteSpace: "pre", ...style }}>
      {[...text].map((c, i) => {
        const k = out(seg(t, t0 + i * per, t0 + i * per + 0.5));
        return (
          <span key={i} style={{ display: "inline-block", opacity: k, filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined, transform: `translateY(${(1 - k) * 10}px)` }}>
            {c}
          </span>
        );
      })}
    </span>
  );
}

/* ---------------- glass panels ---------------- */

const glass = (o: CSSProperties = {}): CSSProperties => ({
  borderRadius: 26,
  background: "linear-gradient(160deg, rgba(40,42,66,.92), rgba(16,17,28,.94))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.18), 0 0 0 1px rgba(160,170,255,.16), 0 60px 120px -40px rgba(0,0,0,.8)",
  fontFamily: SANS,
  color: "#e8eaff",
  overflow: "hidden",
  ...o,
});
const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(220,225,255,.5)", ...style }}>{children}</div>;

function SendPanel({ p, a, press }: { p: P; a: string; press: number }) {
  if (p.screen1) return <Shown pick="screen1" src={p.screen1} w={1000} style={glass({ transform: `scale(${1 - press * 0.02})` })} />;
  return (
    <div style={{ ...glass({ width: 900, height: 940, padding: "40px 46px", boxSizing: "border-box" }) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 600 }}>
        <span style={{ opacity: 0.5 }}>‹</span> Send <span style={{ marginLeft: "auto", width: 10, height: 10, borderRadius: 9, background: a }} />
      </div>
      <div style={{ marginTop: 34, borderRadius: 18, padding: 26, background: `linear-gradient(160deg, ${alpha(a, 0.22)}, rgba(255,255,255,.03))`, boxShadow: "inset 0 0 0 1px rgba(170,180,255,.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Label>Recipient 1</Label>
          <Label>Max 4,980 {p.unit}</Label>
        </div>
        <Label style={{ marginTop: 18 }}>Amount</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <div style={{ flex: 1, textAlign: "center", fontSize: 56, fontWeight: 300, letterSpacing: "0.02em" }}>220</div>
          <span style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(255,255,255,.08)", fontSize: 18 }}>{p.unit} ⌄</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26, fontSize: 18, color: "rgba(230,232,255,.7)" }}>
          {["0.1", "1", "5", "10", "50", "100", "500"].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <Label style={{ marginTop: 26 }}>Address</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, height: 60, borderRadius: 12, background: "rgba(0,0,0,.25)", padding: "0 10px 0 18px", fontFamily: MONO, fontSize: 17, color: "rgba(230,232,255,.6)" }}>
          9xQ2…mW4k <span style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 9, background: a, color: "#0b0b14", fontFamily: SANS, fontWeight: 600 }}>Paste</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 46, marginTop: 34 }}>
        {[
          ["Total", `5890 ${p.unit}`],
          ["Recipients", "3"],
          ["Routes", "2"],
        ].map(([k, v]) => (
          <div key={k}>
            <Label>{k}</Label>
            <div style={{ fontSize: 30, fontWeight: 600, marginTop: 6 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 40, height: 76, borderRadius: 99, background: `linear-gradient(90deg, #ffffff, ${hexMix(a, "#ffffff", 0.55)})`, color: "#0b0b14", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 600, transform: `scale(${1 - press * 0.03})` }}>Continue</div>
    </div>
  );
}

function ImportPanel({ p, a }: { p: P; a: string }) {
  if (p.screen2) return <Shown pick="screen2" src={p.screen2} w={900} style={glass()} />;
  return (
    <div style={{ ...glass({ width: 860, height: 660, padding: "40px 48px", boxSizing: "border-box" }) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 600 }}>
        <span style={{ opacity: 0.5 }}>‹</span> Import & Send
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[a, "#555a7a", "#555a7a"].map((c, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: c }} />
          ))}
        </span>
      </div>
      <div style={{ marginTop: 34, fontSize: 24, fontWeight: 600 }}>Disperse through independent relayers</div>
      <div style={{ marginTop: 12, fontSize: 18, lineHeight: 1.5, color: "rgba(225,228,255,.55)" }}>Import up to 20 wallet keys and privately move their assets through independent relayers to a single destination. Great for consolidating {p.unit} after a launch.</div>
      <div style={{ marginTop: 40, height: 230, borderRadius: 18, border: "1.5px dashed rgba(170,180,255,.3)", display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 30, opacity: 0.6 }}>⇪</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>Import Source Wallets (CSV)</div>
          <div style={{ fontSize: 16, color: "rgba(225,228,255,.5)", marginTop: 6 }}>Up to 20 private keys · drag & drop or click to browse</div>
        </div>
      </div>
    </div>
  );
}

function Ledger({ p }: { p: P }) {
  const rows = [
    ["Recv", "Payroll", "3pK…aLs", "+5.000"],
    ["Send", "Jupiter", "9wQ…rT2", "-0.342"],
    ["Send", "Magic Eden", "2vR…hN8", "-3.200"],
    ["Recv", "Friend", "7kL…4JE", "+2.300"],
  ];
  if (p.screen3) return <Shown pick="screen3" src={p.screen3} w={860} style={glass()} />;
  return (
    <div style={{ ...glass({ width: 760, height: 740, padding: "40px 44px", boxSizing: "border-box" }) }}>
      <Label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: "#ff5d6a" }} /> Without {p.name}
      </Label>
      <div style={{ fontFamily: MONO, fontSize: 22, marginTop: 26, opacity: 0.8 }}>5xT8…k09p</div>
      <div style={{ fontSize: 64, fontWeight: 300, marginTop: 6 }}>
        12.47 <span style={{ fontSize: 22, opacity: 0.6 }}>{p.unit}</span>
      </div>
      {rows.map(([k, who, addr, v]) => (
        <div key={who} style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 30, padding: "18px 20px", borderRadius: 14, background: "rgba(255,255,255,.04)", fontFamily: MONO, fontSize: 19 }}>
          <span style={{ opacity: 0.5, width: 60 }}>{k.toUpperCase()}</span>
          <span style={{ fontFamily: SANS }}>{who}</span>
          <span style={{ opacity: 0.45 }}>· {addr}</span>
          <span style={{ marginLeft: "auto", color: v.startsWith("+") ? "#7ee2a8" : "#ff8a94" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/** a panel standing in space, turned: it swings in, and the camera breathes */
function Tilted({ t, from, x, y, ry, rx = 8, children }: { t: number; from: number; x: number; y: number; ry: number; rx?: number; children: ReactNode }) {
  const k = expo(seg(t, from, from + 1.1));
  return (
    <div style={{ ...fill, perspective: 1700 }}>
      <div style={at(x + (1 - k) * -160, y + (1 - k) * 60, { transformStyle: "preserve-3d", transform: `rotateY(${ry + (1 - k) * ry * 0.8 + Math.sin(t * 0.6) * 1.5}deg) rotateX(${rx}deg)`, opacity: k })}>{children}</div>
    </div>
  );
}

/* ---------------- the shots ---------------- */

const SQUARES = (() => {
  const r = rng(3);
  return Array.from({ length: 18 }, (_, i) => ({ x: r() * 1920, y: r() * 1080, w: i % 3 === 0 ? 200 + r() * 60 : 50 + r() * 40, h: i % 3 === 0 ? 70 + r() * 20 : 0, kind: i % 3, v: 0.4 + r() * 0.8 }));
})();

function Grid({ t, p, a }: { t: number; p: P; a: string }) {
  const tilt = inOut(seg(t, T.tilt, T.space));
  const swap = t >= T.swap;
  const slide = expo(seg(t, T.swap, T.swap + 0.6));
  const tx = swap ? lerp(1020, 730, slide) : 1020;
  const ty = lerp(420, 420, slide) + tilt * 240;
  const words = (swap ? p.to : p.from).split(" ");
  const hidden = swap ? 1 : 1;
  // the bar wipes from the box outward: the word nearest the box first
  const reveal = (i: number) => {
    const j = swap ? i : words.length - 1 - i;
    const t0 = swap ? T.swap + 0.32 : -0.02;
    return clamp(seg(t, t0 + j * 0.09, t0 + 0.12 + j * 0.09));
  };
  const glyph = [
    <path key="w" d="M20 30h50a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8Zm42 22h16v12H62z" fill="#141a3a" />,
    <g key="c">
      <circle cx="50" cy="50" r="30" fill="#141a3a" />
      <circle cx="50" cy="50" r="18" fill="none" stroke={hexMix(a, "#ffffff", 0.5)} strokeWidth="5" />
    </g>,
  ][swap ? 1 : 0];
  return (
    <div style={{ ...fill, background: NIGHT, overflow: "hidden" }}>
      <div style={{ ...fill, transform: `translateY(${tilt * 300}px)` }}>
        <div style={{ ...fill, inset: -200, backgroundImage: "linear-gradient(rgba(140,150,220,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(140,150,220,.07) 1px, transparent 1px)", backgroundSize: "240px 240px" }} />
        {SQUARES.map((q, i) => {
          const y = q.y + t * 14 * q.v + (swap ? 30 * q.v : 0);
          return q.kind === 0 ? (
            <div key={i} style={at(q.x + Math.sin(t * 0.5 + i) * 10, y, { width: q.w, height: q.h, background: `linear-gradient(90deg, ${alpha(a, 0.95)}, ${alpha(hexMix(a, "#ffffff", 0.6), 0.85)})` })} />
          ) : (
            <div key={i} style={at(q.x, y, { width: q.w, height: q.w, background: q.kind === 1 ? "#cfd0d6" : a, opacity: q.kind === 1 ? 0.9 : 0.7 })} />
          );
        })}
        {!swap && [420, 640].map((gy) => <div key={gy} style={at(0, gy, { width: 1920, height: 1, background: "rgba(200,205,255,.18)" })} />)}
        {!swap && [1060, 1320].map((gx) => <div key={gx} style={at(gx, 0, { width: 1, height: 1080, background: "rgba(200,205,255,.18)" })} />)}
        <div style={at(tx, ty, { width: 250, height: 225, background: `linear-gradient(150deg, ${hexMix(a, "#ffffff", 0.75)}, ${a})` })}>
          <svg width="250" height="225" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ transform: `rotate(${Math.sin(t * 2) * 8}deg)` }}>
            {glyph}
          </svg>
          {[
            [0, 0],
            [250, 0],
            [0, 225],
            [250, 225],
          ].map(([x, y], i) => (
            <div key={i} style={at(x - 7, y - 7, { width: 14, height: 14, background: "#fff" })} />
          ))}
        </div>
        <div style={at(swap ? tx + 290 : tx - 60, ty + 88, { transform: swap ? undefined : "translateX(-100%)", display: "flex", gap: 18, fontFamily: SANS, fontSize: 58, fontWeight: 500, color: "#f4f5ff", whiteSpace: "nowrap", opacity: 1 - tilt * 0.35 })}>
          {words.map((w, i) => (
            <span key={i} style={{ position: "relative" }}>
              <span style={{ opacity: hidden && reveal(i) > 0.5 ? 1 : 0 }}>{w}</span>
              {reveal(i) < 1 && <span style={{ ...fill, background: "#fff", transformOrigin: "100% 50%", transform: `scaleX(${1 - reveal(i)})` }} />}
            </span>
          ))}
        </div>
      </div>
      {tilt > 0 && (
        <div style={{ ...fill, transform: `translateY(${(1 - tilt) * -400}px)`, opacity: tilt }}>
          <div style={at(-300, -1400, { width: 2520, height: 1560, borderRadius: "50%", boxShadow: `0 3px 0 ${hexMix(a, "#ffffff", 0.7)}, 0 20px 60px ${alpha(a, 0.8)}` })} />
        </div>
      )}
    </div>
  );
}

function Space({ t, p, a }: { t: number; p: P; a: string }) {
  const settle = expo(seg(t, T.space, T.space + 1.2));
  const flare = seg(t, 4.55, T.intro);
  const intro = t >= T.intro;
  const [name, line] = [p.product.split(" ")[0], p.product.split(" ").slice(1).join(" ")];
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 50% 100%, #1a2050, ${NIGHT} 70%)`, overflow: "hidden" }}>
      <Stars t={t} o={0.6} />
      <Rays t={t} a={a} o={0.8} />
      <Horizon y={lerp(980, 820, settle)} a={a} />
      <Comet x={lerp(160, 1300, seg(t, 3.1, 4.1))} y={lerp(455, 420, seg(t, 3.1, 4.1)) * 4 - 1380} len={760} o={1 - seg(t, 3.9, 4.2)} />
      {flare > 0 && flare < 1 && <Comet x={lerp(2000, 1010, out(flare))} y={498} len={380} ang={8} />}
      {!intro && (
        <div style={at(0, 420, { width: 1920, textAlign: "center" })}>
          <Light text={p.promise} t={t} at={T.space + 0.2} size={64} />
        </div>
      )}
      {intro && (
        <div style={at(0, 455, { width: 1920, display: "flex", justifyContent: "center", alignItems: "center", gap: 26 })}>
          <Light text="Introducing" t={t} at={T.intro} size={60} />
          <span style={{ transform: `scale(${back(seg(t, T.intro, T.intro + 0.5), 2)})` }}>
            <Spiral s={72} glow={1.4} />
          </span>
          <Light text={`${name.toUpperCase()} ${line.toUpperCase()}`.trim()} t={t} at={T.intro + 0.15} size={52} color={hexMix(a, "#ffffff", 0.45)} style={{ letterSpacing: "0.32em", fontWeight: 500 }} />
        </div>
      )}
    </div>
  );
}

function Panels({ t, p, a }: { t: number; p: P; a: string }) {
  const second = t >= T.wallet;
  const press = clamp(seg(t, 9.0, 9.06)) * (1 - seg(t, 9.06, 9.2));
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 20% 0%, #222a66, ${NIGHT} 60%)`, overflow: "hidden" }}>
      <Rays t={t} a={a} o={0.6} from={0.25} />
      <Comet x={lerp(400, 1600, seg(t, 7.6, 8.6))} y={300} len={600} ang={-12} o={seg(t, 7.6, 7.8) * (1 - seg(t, 8.4, 8.6))} />
      {!second ? (
        <>
          <Tilted t={t} from={T.panel} x={200} y={60} ry={22} rx={6}>
            <SendPanel p={p} a={a} press={0} />
          </Tilted>
          <div style={at(1272, 494)}>
            <Light text={p.send} t={t} at={T.panel + 0.3} size={72} />
          </div>
        </>
      ) : (
        <>
          <Tilted t={t} from={T.wallet} x={840} y={110} ry={-20} rx={6}>
            <SendPanel p={p} a={a} press={press} />
          </Tilted>
          <div style={at(100, 494)}>
            <Light text={p.wallet} t={t} at={T.wallet + 0.2} size={72} />
          </div>
          <Cursor x={lerp(1500, 1250, out(seg(t, 8.4, 8.95)))} y={lerp(1080, 940, out(seg(t, 8.4, 8.95)))} press={press} size={2.2} />
        </>
      )}
    </div>
  );
}

function Hashes({ t, p, a }: { t: number; p: P; a: string }) {
  const r = rng(21);
  const hs = Array.from({ length: 10 }, () => ({ x: r() * 1700 + 40, y: r() < 0.5 ? 110 + r() * 300 : 760 + r() * 230, s: `# ${Array.from({ length: 19 }, () => "abcdefghkmnpqrstuvwxyz0123456789"[Math.floor(r() * 32)]).join("")}`, v: 20 + r() * 40 }));
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 60% 40%, #1b2155, ${NIGHT} 70%)`, overflow: "hidden" }}>
      <Nebula t={t} a={a} o={0.5} />
      {hs.map((h, i) => (
        <div key={i} style={at(h.x - (t - T.hashes) * h.v, h.y, { fontFamily: MONO, fontSize: 30, color: "rgba(235,238,255,.85)", opacity: expo(seg(t, T.hashes + i * 0.05, T.hashes + 0.4 + i * 0.05)) })}>
          {h.s}
        </div>
      ))}
      <Comet x={lerp(300, 2300, inOut(seg(t, T.hashes, T.easy)))} y={lerp(560, 500, seg(t, T.hashes, T.easy))} len={420} ang={-6} />
      <div style={at(0, 600, { width: 1920, textAlign: "center" })}>
        <Light text={p.import} t={t} at={T.hashes + 0.4} size={58} style={{ fontStyle: "italic" }} />
      </div>
    </div>
  );
}

function Easy({ t, p, a }: { t: number; p: P; a: string }) {
  const pills = p.pills.split("|");
  const toPills = t >= T.pills;
  const second = t >= T.collect;
  // the line scatters into its words and gathers into the next one
  const scatter = Math.sin(Math.PI * seg(t, T.collect - 0.55, T.collect + 0.15));
  const line = (second ? pills[3] : pills[1]) ?? "";
  const r = rng(5);
  return (
    <div style={{ ...fill, background: NIGHT, overflow: "hidden" }}>
      <Nebula t={t} a={a} o={1} />
      {!toPills ? (
        <>
          <Tilted t={t} from={T.easy} x={940} y={170} ry={-18} rx={6}>
            <div style={{ position: "relative" }}>
              <div style={at(-180, -140, { width: 760, height: 760, borderRadius: 999, boxShadow: `inset 0 0 0 14px ${alpha(a, 0.5)}, 0 0 80px ${alpha(a, 0.4)}`, filter: "blur(2px)" })} />
              <ImportPanel p={p} a={a} />
            </div>
          </Tilted>
          <div style={at(280, 480)}>
            <Light text={p.easy} t={t} at={T.easy + 0.3} size={72} />
          </div>
        </>
      ) : (
        <div style={at(0, 470, { width: 1920, display: "flex", justifyContent: "center", alignItems: "center", gap: 26 })}>
          <span style={{ padding: "16px 48px", borderRadius: 99, background: "#f4f5ff", color: "#11121c", fontFamily: SANS, fontSize: 70, fontWeight: 500, transform: `scale(${back(seg(t, second ? T.collect : T.pills, (second ? T.collect : T.pills) + 0.4), 1.6)})` }}>{second ? pills[2] : pills[0]}</span>
          <span style={{ display: "flex", gap: 18 }}>
            {line.split(" ").map((w, i) => (
              <span key={`${second}${i}`} style={{ display: "inline-block", transform: `translate(${(r() - 0.4) * 240 * scatter}px, ${(r() - 0.5) * 180 * scatter}px)`, opacity: 1 - scatter * 0.5 }}>
                <Light text={w} t={t} at={(second ? T.collect - 0.3 : T.pills) + 0.1 + i * 0.08} size={82} />
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function Orbit({ t, p, a }: { t: number; p: P; a: string }) {
  const [one, two] = p.orbit.split("|");
  const zoom = inOut(seg(t, T.zoom - 0.4, T.zoom + 0.6));
  const k = seg(t, T.orbit, T.dash);
  const head = { x: lerp(820, 1100, k), y: 540 };
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 50% 40%, #232a6a, ${NIGHT} 75%)`, overflow: "hidden" }}>
      <Nebula t={t} a={a} o={0.6} />
      <div style={{ ...fill, transformOrigin: `${head.x}px ${head.y}px`, transform: `scale(${lerp(1, 1.9, zoom)})` }}>
        <svg width={1920} height={1080} style={at(0, 0)}>
          {[
            [head.x, head.y, 520, 120, 0.25],
            [head.x - 200, head.y, 300, 210, 0.2],
            [head.x - 60, head.y, 190, 190, 0.28],
            [head.x + 140, head.y, 240, 280, 0.22],
          ].map(([cx, cy, rx, ry, o], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#dfe4ff" strokeOpacity={o} strokeWidth="1.5" transform={`rotate(${Math.sin(t * 0.4 + i) * 4} ${cx} ${cy})`} />
          ))}
        </svg>
        <Comet x={head.x} y={head.y} len={lerp(380, 820, zoom)} ang={0} />
        <div style={at(head.x + 120, head.y - 260, { width: 160, height: 520, borderRadius: "50%", boxShadow: `inset -14px 0 30px ${alpha(hexMix(a, "#ffffff", 0.5), 0.6)}`, opacity: zoom })} />
      </div>
      <div style={at(0, 830, { width: 1920, textAlign: "center" })}>{t < T.zoom ? <Light text={one} t={t} at={T.orbit + 0.3} size={58} /> : <Light text={two} t={t} at={T.zoom} size={58} />}</div>
    </div>
  );
}

function Dash({ t, p, a }: { t: number; p: P; a: string }) {
  const [line, button] = p.switch.split("|");
  const press = clamp(seg(t, 20.4, 20.46)) * (1 - seg(t, 20.46, 20.6));
  return (
    <div style={{ ...fill, background: `radial-gradient(ellipse at 30% 30%, #1d2458, ${NIGHT} 70%)`, overflow: "hidden" }}>
      <Stars t={t} o={0.5} />
      <Tilted t={t} from={T.dash} x={120} y={150} ry={24} rx={4}>
        <Ledger p={p} />
      </Tilted>
      <div style={at(1048, 400)}>
        <Light text={line} t={t} at={T.dash + 0.3} size={72} />
      </div>
      <div style={at(1170, 620, { padding: "16px 44px", borderRadius: 99, background: "#f4f5ff", color: "#11121c", fontFamily: SANS, fontSize: 30, fontWeight: 600, transform: `scale(${back(seg(t, T.dash + 0.6, T.dash + 1), 1.8) * (1 - press * 0.05)})` })}>{button}</div>
      <svg width="54" height="54" viewBox="0 0 24 24" style={at(lerp(1300, 1350, out(seg(t, 19.6, 20.3))), lerp(1000, 690, out(seg(t, 19.6, 20.3))), { filter: `drop-shadow(0 0 10px ${alpha(a, 0.8)})` })}>
        <path d="M12 2 21 21 12 16 3 21Z" fill={hexMix(a, "#ffffff", 0.3)} />
      </svg>
    </div>
  );
}

function End({ t, p, a }: { t: number; p: P; a: string }) {
  const k = expo(seg(t, T.end, T.end + 0.9));
  return (
    <div style={{ ...fill, background: NIGHT, overflow: "hidden" }}>
      {/* the aurora: wide soft bands across the top, waving */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={at(-300 + Math.sin(t * 0.5 + i) * 80, -120 + i * 110, {
            width: 2520,
            height: 260,
            borderRadius: "50%",
            background: `linear-gradient(90deg, transparent, ${alpha(hexMix(a, "#b48cff", i * 0.3), 0.7)}, ${alpha(hexMix(a, "#ffffff", 0.3), 0.5)}, transparent)`,
            filter: "blur(60px)",
            transform: `rotate(${-8 + i * 7 + Math.sin(t * 0.4 + i) * 3}deg)`,
          })}
        />
      ))}
      <Stars t={t} o={0.8} />
      <div style={at(0, 440, { width: 1920, display: "flex", justifyContent: "center", alignItems: "center", gap: 30, opacity: k, transform: `scale(${lerp(0.94, 1, k)})` })}>
        <Spiral s={110} glow={1.6} />
        <span style={{ fontFamily: SANS, fontSize: 92, fontWeight: 400, letterSpacing: "0.3em", color: "#f4f5ff" }}>{p.name.toUpperCase()}</span>
      </div>
      <div style={at(0, 590, { width: 1920, textAlign: "center" })}>
        <Light text={p.tagline} t={t} at={T.end + 0.4} size={34} color="rgba(230,233,255,.75)" />
      </div>
      <div style={at(0, 975, { width: 1920, textAlign: "center", fontFamily: SANS, fontSize: 24, color: "rgba(230,233,255,.6)", opacity: seg(t, T.end + 1, T.end + 1.5) })}>{p.url}</div>
    </div>
  );
}

export default function HorizonLaunch({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const ready = useWebFonts(FONTS, ['400 40px "Manrope"']);
  const t = useClock(DUR);
  const a = p.accent;
  return (
    <Stage background={NIGHT} style={{ fontFamily: SANS }}>
      {ready && (
        <div data-film="" style={fill}>
          {t < T.space && <Grid t={t} p={p} a={a} />}
          {t >= T.space && t < T.panel && <Space t={t} p={p} a={a} />}
          {t >= T.panel && t < T.hashes && <Panels t={t} p={p} a={a} />}
          {t >= T.hashes && t < T.easy && <Hashes t={t} p={p} a={a} />}
          {t >= T.easy && t < T.orbit && <Easy t={t} p={p} a={a} />}
          {t >= T.orbit && t < T.dash && <Orbit t={t} p={p} a={a} />}
          {t >= T.dash && t < T.end && <Dash t={t} p={p} a={a} />}
          {t >= T.end && <End t={t} p={p} a={a} />}
        </div>
      )}
    </Stage>
  );
}
