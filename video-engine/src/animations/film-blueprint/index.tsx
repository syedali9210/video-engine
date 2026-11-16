// Blueprint: a brand film drawn as a diagram, replicated from a "Start Building Beautiful Ads" film. Its cuts
// (measured: 2.6, 4.9, 6.0, 6.83, 10.2, 12.2, 14.83, 17.0, 19.4, 24.4, 26.8, 29.6 s), its grey paper, its 1.5 px ink
// and its node shapes are the reference's; the words, the post and the numbers are params, the picture is the engine's.
import type { CSSProperties, ReactNode } from "react";
import { Phone, Stage, at, back, clamp, expo, fill, inOut, lerp, out, rng, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 31;
const T = { photo: 2.6, lead: 3.1, white: 4.9, overlay: 6.0, corridor: 6.83, cta: 10.2, carousel: 12.2, phone: 14.83, measured: 17.12, stats: 19.4, close: 24.4, orbit: 26.8, again: 29.6 };
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const PAPER = "#f0f0f0";
const INK = "#111111";
const PHOTO = "/anim/swiggy-home/img/photo-1497034825429-c343d7c6a68f.jpg";
/** the picture the ad is about: yours (a "screen" param, a picture) or the engine's */
const photoOf = (p: P) => (/^image:/.test(p.photo) ? p.photo.slice(6) : PHOTO);
const split = (s: string) => s.split("|").map((x) => x.trim());

/* ---------------- the diagram's vocabulary ---------------- */

type Node = { kind: "circle" | "square" | "diamond" | "dot" | "bar" | "ring"; x: number; s: number };
function NodeShape({ n, y }: { n: Node; y: number }) {
  const common: CSSProperties = { position: "absolute", boxSizing: "border-box", border: `1.5px solid ${INK}`, background: PAPER };
  if (n.kind === "dot") return <div style={at(n.x - 4, y - 4, { width: 8, height: 8, borderRadius: 9, background: INK })} />;
  if (n.kind === "bar") return <div style={{ ...common, left: n.x - n.s / 2, top: y - 8, width: n.s, height: 16 }} />;
  if (n.kind === "diamond") return <div style={{ ...common, left: n.x - n.s / 2, top: y - n.s / 2, width: n.s, height: n.s, transform: "rotate(45deg)" }} />;
  if (n.kind === "square") return <div style={{ ...common, left: n.x - n.s / 2, top: y - n.s / 2, width: n.s, height: n.s }} />;
  return <div style={{ ...common, left: n.x - n.s / 2, top: y - n.s / 2, width: n.s, height: n.s, borderRadius: 999 }} />;
}
/** a rail: a hairline across the frame with its nodes, sliding */
function Rail({ y, nodes, shift = 0, o = 1, children }: { y: number; nodes: Node[]; shift?: number; o?: number; children?: ReactNode }) {
  return (
    <div style={{ ...fill, opacity: o }}>
      <div style={at(0, y, { width: 1920, height: 1.5, background: INK })} />
      <div style={{ ...fill, transform: `translateX(${-shift}px)` }}>
        {nodes.map((n, i) => (
          <NodeShape key={i} n={n} y={y} />
        ))}
        {children}
      </div>
    </div>
  );
}
const railNodes = (seed: number, from = -200, to = 5000): Node[] => {
  const r = rng(seed);
  const kinds: Node["kind"][] = ["circle", "dot", "square", "bar", "diamond", "dot", "circle"];
  const out: Node[] = [];
  for (let x = from; x < to; x += 120 + r() * 160) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    out.push({ kind, x, s: kind === "bar" ? 90 + r() * 120 : kind === "circle" ? 30 + r() * 26 : 26 });
  }
  return out;
};

/** a box with an ink border and words in it, growing as the words come */
function Box({ lines, t, at: t0, size = 92, per = 0.32, style }: { lines: string[]; t: number; at: number; size?: number; per?: number; style?: CSSProperties }) {
  let n = 0;
  return (
    <div style={{ display: "inline-block", padding: `${size * 0.28}px ${size * 0.42}px`, background: "#fff", border: `2px solid ${INK}`, fontFamily: SANS, fontSize: size, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap", ...style }}>
      {lines.map((line, li) => (
        <div key={li}>
          {line.split(" ").map((w, wi) => {
            const k = out(seg(t, t0 + n++ * per, t0 + (n - 1) * per + 0.3));
            return k > 0 ? (
              <span key={wi} style={{ opacity: k, marginRight: "0.25em" }}>
                {w}
              </span>
            ) : null;
          })}
        </div>
      ))}
    </div>
  );
}

/** words arriving one at a time, with a soft rise (the reference's captions) */
function Words({ text, t, at: t0, per = 0.22, size = 96, style }: { text: string; t: number; at: number; per?: number; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: size, fontWeight: 500, lineHeight: 1.05, letterSpacing: "-0.025em", color: INK, ...style }}>
      {text.split(" ").map((w, i) => {
        const k = out(seg(t, t0 + i * per, t0 + i * per + 0.35));
        return (
          <span key={i} style={{ display: "inline-block", opacity: k, transform: `translateY(${(1 - k) * 18}px)`, marginRight: "0.26em" }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** the post: who posted it, what it says, the picture with words on it, the buttons */
function Post({ p, w = 640, cta = 0, carousel = 0 }: { p: P; w?: number; cta?: number; carousel?: number }) {
  const [o1, o2] = split(p.overlay);
  const k = w / 640;
  const pic = (pos: string, hue = 0) => (
    <div style={{ position: "relative", width: 560 * k, height: 470 * k, flex: "none", borderRadius: 14 * k, overflow: "hidden" }}>
      <img data-pick="photo" src={photoOf(p)} alt="" style={{ ...fill, width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, filter: hue ? `hue-rotate(${hue}deg)` : undefined }} />
      <div style={at(0, 60 * k, { width: "100%", textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 52 * k, lineHeight: 1, letterSpacing: "-0.03em", color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.25)" })}>
        {o1}
        <br />
        {o2}
      </div>
      {cta > 0 && <div style={at(230 * k, 180 * k, { padding: `${8 * k}px ${22 * k}px`, borderRadius: 99, background: "#fff", fontFamily: SANS, fontSize: 18 * k, fontWeight: 600, transform: `scale(${back(cta, 2)})` })}>Try now</div>}
    </div>
  );
  return (
    <div style={{ width: w, background: "#fff", border: "1.5px solid #e2e2e2", borderRadius: 18 * k, padding: 22 * k, boxSizing: "border-box", fontFamily: SANS, color: INK, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 * k, fontSize: 20 * k }}>
        <span style={{ width: 46 * k, height: 46 * k, borderRadius: 99, border: "1.5px solid #ddd", display: "grid", placeItems: "center", fontWeight: 800 }}>{p.account[0]}</span>
        <b>{p.account}</b>
        <span style={{ width: 18 * k, height: 18 * k, borderRadius: 99, background: "#1d9bf0" }} />
        <span style={{ color: "#777" }}>{p.handle} · 1h</span>
        <span style={{ marginLeft: "auto", color: "#999" }}>···</span>
      </div>
      <div style={{ fontSize: 19 * k, lineHeight: 1.35, margin: `${12 * k}px 0 ${14 * k}px`, paddingLeft: 58 * k }}>{p.post}</div>
      <div style={{ paddingLeft: 58 * k, display: "flex", gap: 10 * k, transform: `translateX(${-carousel * 570 * k}px)` }}>
        {pic("50% 60%")}
        {carousel > 0 && pic("30% 50%", 140)}
        {carousel > 0 && pic("70% 50%", 250)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: `${14 * k}px ${10 * k}px 0 ${58 * k}px`, color: "#777", fontSize: 18 * k }}>
        {["○", "⇄", "♡", "▮▮", "⬚"].map((s, i) => (
          <span key={i}>{s}</span>
        ))}
      </div>
    </div>
  );
}

/** a room drawn in hairlines: the frame's corners to a back wall, a few uprights */
const Corridor = ({ t }: { t: number }) => {
  const d = Math.sin(t * 0.4) * 20;
  const [x0, y0, x1, y1] = [260 + d, 200, 1660 + d, 900];
  return (
    <svg width={1920} height={1080} style={at(0, 0)}>
      <g stroke={INK} strokeWidth="1.2" fill="none" opacity="0.6">
        <line x1="0" y1="0" x2={x0} y2={y0} />
        <line x1="1920" y1="0" x2={x1} y2={y0} />
        <line x1="0" y1="1080" x2={x0} y2={y1} />
        <line x1="1920" y1="1080" x2={x1} y2={y1} />
        {[0.2, 0.4, 0.6, 0.8].map((k) => (
          <line key={k} x1={lerp(x0, x1, k)} y1={y0 - 120} x2={lerp(x0, x1, k)} y2={y1 + 120} strokeDasharray={k === 0.4 ? "5 7" : undefined} opacity="0.5" />
        ))}
      </g>
    </svg>
  );
};

/** the brand's mark: its initial in a white disc */
const Mark = ({ name, s }: { name: string; s: number }) => (
  <div style={{ width: s, height: s, borderRadius: 999, background: "#fff", border: "1.5px solid #ddd", display: "grid", placeItems: "center", fontFamily: SANS, fontWeight: 800, fontSize: s * 0.42, color: INK }}>{name.trim()[0]?.toUpperCase()}</div>
);

/* ---------------- the shots ---------------- */

function Opening({ t, p }: { t: number; p: P }) {
  const lines = split(p.start);
  const z = lerp(0.82, 1, expo(seg(t, 0, 1.2)));
  const grow = inOut(seg(t, 0.3, 1.6));
  const end = t >= T.again;
  const lt = end ? t - T.again : t;
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <svg width={1920} height={1080} style={at(0, 0)}>
        <g stroke={INK} strokeWidth="1.5" fill="none">
          <line x1="0" y1={lerp(780, 140, grow)} x2="1920" y2={lerp(780, 140, grow)} opacity={grow} />
          <line x1="0" y1={lerp(300, 940, grow)} x2="1920" y2={lerp(300, 940, grow)} opacity={grow} />
          <line x1={lerp(620, 1760, grow)} y1="0" x2={lerp(620, 1760, grow)} y2="1080" opacity={grow * 0.5} />
          <path d={`M${960 - 480} ${540 + 140} C ${720} ${700}, ${340} ${600}, ${120} ${lerp(900, 620, grow)}`} />
          <path d={`M${960 + 480} ${540 - 60} C ${1560} ${400}, ${1700} ${300}, ${1800} ${lerp(180, 300, grow)}`} />
          <line x1="760" y1="360" x2="700" y2="200" opacity={1 - grow} />
          <line x1="1150" y1="700" x2="1240" y2="860" opacity={1 - grow} />
        </g>
        <circle cx={120} cy={lerp(900, 620, grow)} r="9" fill={PAPER} stroke={INK} strokeWidth="1.5" />
        <circle cx={1800} cy={lerp(180, 300, grow)} r="9" fill={INK} />
        <circle cx="700" cy="200" r="10" fill={PAPER} stroke={INK} strokeWidth="1.5" opacity={1 - grow} />
        <circle cx="1240" cy="860" r="10" fill={PAPER} stroke={INK} strokeWidth="1.5" opacity={1 - grow} />
      </svg>
      <div style={{ ...fill, display: "grid", placeItems: "center", transform: `scale(${end ? 0.6 : z})` }}>
        <Box lines={end ? [lines[0]] : lines} t={lt} at={end ? 0.05 : -0.4} per={end ? 0.2 : 0.75} />
      </div>
    </div>
  );
}

function Lead({ t, p }: { t: number; p: P }) {
  const tips = split(p.tips);
  // the picture fills the frame, then pulls back into its place on the line
  const k = inOut(seg(t, T.photo + 0.05, T.lead + 0.5));
  const w = lerp(1300, 520, k);
  const nodes = railNodes(31, -100, 2200);
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <Rail y={600} nodes={nodes.filter((n) => n.x < 640 || n.x > 1280)} shift={(t - T.photo) * 40} o={k} />
      <div style={at(960 - w / 2, lerp(-110, 340, k), { width: w, height: w, overflow: "hidden", background: "#8cc8ff" })}>
        <img data-pick="photo" src={photoOf(p)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={at(0, 190, { width: 1920, display: "flex", justifyContent: "center" })}>
        <Words text={tips[0]} t={t} at={T.lead + 0.2} size={84} />
      </div>
    </div>
  );
}

function Overlays({ t, p }: { t: number; p: P }) {
  const tips = split(p.tips);
  const asPost = seg(t, T.overlay, T.overlay + 0.5);
  return (
    <div style={{ ...fill, background: lerp(1, 0, asPost) > 0.5 ? "#fff" : PAPER, overflow: "hidden" }}>
      {t < T.overlay ? (
        <div style={at(640, 300, { width: 680, height: 680, overflow: "hidden", transform: `scale(${lerp(1.08, 1, expo(seg(t, T.white, T.white + 0.6)))})` })}>
          <img data-pick="photo" src={photoOf(p)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <>
          <Corridor t={t} />
          <div style={at(0, 90, { width: 1920, display: "flex", justifyContent: "center" })}>
            <Words text={tips[1]} t={t} at={T.overlay + 0.1} size={84} />
          </div>
          <div style={at(560, lerp(340, 250, expo(asPost)), { opacity: expo(asPost) })}>
            <Post p={p} w={800} />
          </div>
        </>
      )}
    </div>
  );
}

function Rules({ t, p }: { t: number; p: P }) {
  const tips = split(p.tips);
  const which = t < T.cta ? 2 : t < T.carousel ? 3 : 4;
  const from = [T.corridor, T.corridor, T.corridor, T.cta, T.carousel][which];
  const enter = expo(seg(t, from, from + 0.7));
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <Corridor t={t} />
      {which === 2 && (
        <>
          <div style={at(300 - (1 - enter) * 80, 240, { opacity: enter })}>
            <Post p={p} w={640} />
          </div>
          <div style={at(1030, 440, { width: 780 })}>
            <Words text={tips[2]} t={t} at={T.corridor + 0.25} size={92} per={0.25} />
          </div>
        </>
      )}
      {which === 3 && (
        <>
          <div style={at(170, 450, { width: 760 })}>
            <Words text={tips[3]} t={t} at={T.cta + 0.15} size={92} />
          </div>
          <div style={at(980 + (1 - enter) * 80, 240, { opacity: enter })}>
            <Post p={p} w={620} cta={seg(t, T.cta + 0.7, T.cta + 1.1)} />
          </div>
        </>
      )}
      {which === 4 && (
        <>
          <div style={at(0, 70, { width: 1920, display: "flex", justifyContent: "center", textAlign: "center" })}>
            <Words text={tips[4]} t={t} at={T.carousel + 0.1} size={84} style={{ maxWidth: 900 }} />
          </div>
          <div style={at(640, 330, { width: 640, overflow: "hidden", opacity: enter })}>
            <Post p={p} w={640} carousel={inOut(seg(t, T.carousel + 0.9, T.phone - 0.4)) * 2} />
          </div>
        </>
      )}
    </div>
  );
}

function Feed({ t, p }: { t: number; p: P }) {
  const rise = expo(seg(t, T.phone, T.phone + 1.0));
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <div style={at(960 - 213 * 1.7, lerp(1200, 70, rise), { transform: `rotate(${lerp(6, 0, rise)}deg)` })}>
        <Phone scale={1.7}>
          <div style={{ ...fill, background: "#fff", fontFamily: SANS, color: INK, paddingTop: 64 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "0 18px" }}>
              <span style={{ width: 34, height: 34, borderRadius: 99, background: "linear-gradient(135deg, #f6a, #48f)" }} />
              <span style={{ margin: "0 auto", transform: "translateX(-17px)" }}>
                <Mark name={p.name} s={34} />
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-around", fontSize: 15, marginTop: 14, borderBottom: "1px solid #eee", paddingBottom: 10 }}>
              <b>For you</b>
              <span style={{ color: "#777" }}>Following</span>
            </div>
            <div style={{ padding: 10, transform: `translateY(${-seg(t, 15.8, 16.8) * 60}px)` }}>
              <Post p={p} w={380} />
            </div>
          </div>
        </Phone>
      </div>
    </div>
  );
}

function Measured({ t, p }: { t: number; p: P }) {
  const pan = (t - T.measured) * 60;
  // the words come in one by one, big; then the camera draws back as the rails come in round them (measured)
  const back = inOut(seg(t, 17.82, 18.08));
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <div style={{ ...fill, opacity: back }}>
        <Rail y={100} nodes={railNodes(41).filter((_, i) => i % 3 === 0)} shift={pan} />
        <Rail y={960} nodes={railNodes(42).filter((_, i) => i % 3 === 0)} shift={-pan} />
      </div>
      <div style={at(0, 470, { width: 1920, display: "flex", justifyContent: "center", transform: `scale(${lerp(1.45, 0.86, back)})` })}>
        <Words text={p.proof} t={t} at={T.measured + 0.06} per={0.17} size={96} />
      </div>
    </div>
  );
}

function Stats({ t, p }: { t: number; p: P }) {
  const s = split(p.stats);
  const pan = lerp(0, 2600, inOut(seg(t, T.stats, T.close - 0.2)));
  const boxes = [0, 1, 2].map((i) => ({ x: 960 + i * 1300, n: s[i * 2], what: s[i * 2 + 1] }));
  /** a figure counting up to itself as it arrives */
  const count = (v: string, k: number) => {
    const m = /^(\D*)([\d.]+)(.*)$/.exec(v);
    if (!m) return v;
    const n = parseFloat(m[2]) * clamp(k);
    return `${m[1]}${m[2].includes(".") ? n.toFixed(1) : Math.round(n)}${m[3]}`;
  };
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <Rail y={260} nodes={railNodes(51)} shift={pan * 0.8} />
      <Rail y={808} nodes={railNodes(52)} shift={pan * 1.15} />
      <Rail y={532} nodes={railNodes(53).filter((n) => !boxes.some((b) => Math.abs(n.x - b.x) < 260))} shift={pan}>
        {boxes.map((b, i) => {
          const sx = b.x - pan;
          const k = seg(sx, 1500, 900);
          return (
            <div key={i} style={at(b.x - 200, 532 - 96, { width: 400, height: 192, background: "#fff", border: `2px solid ${INK}`, display: "grid", placeItems: "center", textAlign: "center", fontFamily: SANS })}>
              <div>
                <div style={{ fontSize: 88, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>{count(b.n, k)}</div>
                <div style={{ fontSize: 26, color: "#444", marginTop: 6 }}>{b.what}</div>
              </div>
            </div>
          );
        })}
      </Rail>
    </div>
  );
}

function Close({ t, p }: { t: number; p: P }) {
  const chips = split(p.chips);
  const k = expo(seg(t, T.close, T.close + 0.8));
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <div style={at(0, 200, { width: 1920, display: "flex", justifyContent: "center" })}>
        <Words text={p.close} t={t} at={T.close + 0.1} size={92} per={0.28} />
      </div>
      {chips.map((c, i) => (
        <Rail key={c} y={400 + i * 210} nodes={railNodes(61 + i).filter((n) => Math.abs(n.x - 960) > 230)} shift={(t - T.close) * (i % 2 ? -50 : 50) + 200} o={k}>
          <div style={at(960 - 140 + (t - T.close) * (i % 2 ? -50 : 50) + 200, 400 + i * 210 - 34, { width: 280, height: 68, background: "#fff", border: `2px solid ${INK}`, display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 32, fontWeight: 500 })}>{c}</div>
        </Rail>
      ))}
    </div>
  );
}

function Orbit({ t, p }: { t: number; p: P }) {
  const z = lerp(1.25, 0.85, inOut(seg(t, T.orbit, T.again)));
  const a = (t - T.orbit) * 1.4;
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <div style={{ ...fill, transform: `scale(${z})`, transformOrigin: "960px 540px" }}>
        <svg width={1920} height={1080} style={at(0, 0)}>
          <circle cx="960" cy="540" r="700" fill="none" stroke={INK} strokeWidth="1.5" strokeDasharray="6 9" opacity="0.5" />
          <ellipse cx="960" cy="540" rx="370" ry="110" fill="none" stroke={INK} strokeWidth="1.5" transform="rotate(-8 960 540)" />
          <circle cx={960 + Math.cos(a) * 370} cy={540 + Math.sin(a) * 110} r="10" fill={INK} />
        </svg>
        <div style={at(960 - 220, 540 - 220)}>
          <Mark name={p.name} s={440} />
        </div>
      </div>
    </div>
  );
}

export default function Blueprint({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  return (
    <Stage background={PAPER} style={{ fontFamily: SANS, color: INK }}>
      <div data-film="" style={fill}>
        {(t < T.photo || t >= T.again) && <Opening t={t} p={p} />}
        {t >= T.photo && t < T.white && <Lead t={t} p={p} />}
        {t >= T.white && t < T.corridor && <Overlays t={t} p={p} />}
        {t >= T.corridor && t < T.phone && <Rules t={t} p={p} />}
        {t >= T.phone && t < T.measured && <Feed t={t} p={p} />}
        {t >= T.measured && t < T.stats && <Measured t={t} p={p} />}
        {t >= T.stats && t < T.close && <Stats t={t} p={p} />}
        {t >= T.close && t < T.orbit && <Close t={t} p={p} />}
        {t >= T.orbit && t < T.again && <Orbit t={t} p={p} />}
      </div>
    </Stage>
  );
}
