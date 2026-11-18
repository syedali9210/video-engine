// Verb drop: a launch film on warm paper, replicated from the Vector Studio film. Its beats (a verb every 0.5 s to
// 3.0, typing 3.0, outline 4.3, ungroup 4.9, icon 5.45, star 6.0, sun 6.5, the app 7.0, the whip 9.0, the pen 9.2 s),
// its paper, black, red and yellow are the reference's; the verbs, the line, the glyph and the tool are params.
import type { CSSProperties, ReactNode } from "react";
import { Caret, Slot, Stage, at, back, blink, clamp, expo, fill, inOut, lerp, measure, out, rng, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 11.77;
const T = { line: 3.0, outline: 4.3, ungroup: 4.9, icon: 5.45, star: 6.0, sun: 6.5, app: 7.0, whip: 8.95, pen: 9.2, fillIn: 11.05 };
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const PAPER = "#f3f2ee";
const INK = "#121212";
const SUN = "#f6c432";
const split = (s: string) => s.split("|").map((x) => x.trim());

/* ---------------- the six verbs, each wearing what it does ---------------- */

const outline: CSSProperties = { color: "transparent", WebkitTextStroke: `5px ${INK}` };
const clipFill = (bg: string): CSSProperties => ({ background: bg, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextStroke: `4px ${INK}` });
/** how letter i of verb v is drawn */
function letterStyle(v: number, i: number, n: number, a: string): CSSProperties {
  const last = i >= n - 2;
  // the reference's eight: draw, then the six below, with extrude between warp and repeat
  if (v === 0) return i === 0 || last ? { color: INK } : i % 2 ? { color: a } : outline; // draw: strokes in the accent
  if (v === 5) return i === 0 || last ? { color: INK } : { color: "#2338d8", textShadow: `6px 6px 0 ${INK}`, WebkitTextStroke: `3px ${INK}` }; // extrude: blue, cast deep
  v = v >= 6 ? v - 2 : v - 1;
  switch (v) {
    case 0: // shape: black, yellow, outline in turn
      return i % 3 === 0 ? { color: INK } : i % 3 === 1 ? { color: SUN, WebkitTextStroke: `4px ${INK}` } : outline;
    case 1: // color: outlines, then a gradient running through a letter
      return i === 1 ? clipFill("conic-gradient(from 200deg at 45% 55%, #ff7a18, #ff2d8a, #7b2ff7, #ff7a18)") : i === 0 ? clipFill(`linear-gradient(90deg, transparent 50%, #f8a24c 50%)`) : last || i === 4 ? { color: INK } : outline;
    case 2: // type: outlines with a line of type running through
      return last ? { color: INK } : outline;
    case 3: // warp: the accent, each letter bent its own way
      return { color: i === 0 ? INK : a, transform: `skewY(${Math.sin(i * 1.7) * 9}deg) scaleY(${1 + Math.cos(i * 1.3) * 0.08})`, display: "inline-block" };
    case 4: // repeat: outlines echoing behind themselves, the last ones solid
      return last || i === 3 ? { color: INK } : { ...outline, textShadow: `14px 0 0 ${PAPER}, 16px 0 0 ${INK}` };
    default: // trace: a picture inside the first letters
      return i < 3 ? clipFill(`repeating-radial-gradient(circle at 0 110%, #1d3557 0 7px, #f1ede2 7px 13px, #4f6d8a 13px 16px, #f1ede2 16px 22px)`) : i === 3 ? outline : { color: INK };
  }
}

/** a little panel of the app beside the word: the reference's interface fragments */
const Tip = ({ x, y, children }: { x: number; y: number; children: ReactNode }) => <div style={at(x, y, { padding: "6px 12px", borderRadius: 8, background: "#1d1d1f", color: "#f2f2f2", fontFamily: SANS, fontSize: 17, whiteSpace: "nowrap", boxShadow: "0 8px 20px -8px rgba(0,0,0,.4)" })}>{children}</div>;

/** when each verb comes in (measured): a beat of about 0.4 s */
const BEATS = [0, 0.08, 0.48, 0.98, 1.38, 1.78, 2.18, 2.58];
function Verb({ t, p, a }: { t: number; p: P; a: string }) {
  const verbs = split(p.verbs);
  const v = Math.min(verbs.length - 1, BEATS.filter((b) => t >= b).length - 1);
  const word = `${verbs[v] ?? ""}.`;
  const t0 = BEATS[v];
  const size = Math.min(560, (1760 / measure(word, `800 100px ${SANS}`)) * 100);
  const r = rng(v + 3);
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      <div style={at(0, 540 - size * 0.62, { width: 1920, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: "-0.045em", whiteSpace: "nowrap" })}>
        {[...word].map((c, i) => {
          // each verb cuts in whole (the reference's), the first already there as the film opens
          const k = v === 0 ? 1 : seg(t, t0, t0 + 0.04);
          return (
            <span key={`${v}-${i}`} style={{ display: "inline-block", position: "relative", opacity: k, transform: `translateY(${(1 - k) * 50}px)`, ...letterStyle(v, i, word.length, a) }}>
              {c}
              {v === 3 && i < 2 && <span aria-hidden style={at(size * 0.08, size * 0.25, { fontSize: size * 0.07, fontWeight: 500, color: INK, WebkitTextStroke: "0", transform: `rotate(${i ? 70 : 20}deg)`, letterSpacing: 0 })}>{i ? "flow" : "hello"}</span>}
              {v === 6 && i === 0 && <span style={at(size * 0.18, size * 0.38, { fontSize: size * 0.22, color: SUN, WebkitTextStroke: "0", textShadow: "none" })}>✦</span>}
            </span>
          );
        })}
      </div>
      {/* the interface around it: a panel or two, a few points of a path */}
      <Tip x={1560 + r() * 120} y={300 + r() * 120}>
        {["Brush", "Layers", "Quick Actions", "Blend", "Pathfinder", "Depth", "Spray", "Offset"][v]}
      </Tip>
      <Tip x={1200 + r() * 300} y={700 + r() * 60}>
        {["Stroke 4", "Pathfinder", "Fill", "Text on path", "Bend 42%", "Extrude 40", "Copies 6", "Threshold"][v]}
      </Tip>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} style={at(300 + r() * 1300, 160 + r() * 40 + (t - t0) * 20 * r(), { width: 7, height: 7, borderRadius: 9, background: INK, opacity: 0.7 })} />
      ))}
    </div>
  );
}

/* ---------------- the line, taken apart into an icon ---------------- */

const Key = ({ keys, at: x, t, from, to }: { keys: string[]; at: number; t: number; from: number; to: number }) => {
  const k = seg(t, from, from + 0.15) * (1 - seg(t, to - 0.1, to));
  return (
    <div style={at(x, 950, { display: "flex", gap: 12, opacity: k })}>
      {keys.map((s, i) => (
        <span key={i} style={{ minWidth: 54, height: 54, padding: "0 14px", boxSizing: "border-box", borderRadius: 12, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.12), 0 6px 14px -6px rgba(0,0,0,.2)", display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 22, fontWeight: 600, color: INK }}>
          {s}
        </span>
      ))}
    </div>
  );
};

function Star({ s, color }: { s: number; color: string }) {
  const pts = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 0.78 : 1;
    return `${50 + Math.cos(a) * 50 * r},${50 + Math.sin(a) * 50 * r}`;
  }).join(" ");
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
      <polygon points={pts} fill={color} />
    </svg>
  );
}

function Line({ t, p, a }: { t: number; p: P; a: string }) {
  const full = `${p.glyph} ${p.line}`;
  const n = Math.floor(clamp((t - 2.88) / (full.length * 0.0333)) * full.length);
  const busy = n < full.length;
  const sel = seg(t, T.outline, T.outline + 0.12);
  const apart = inOut(seg(t, T.ungroup, T.ungroup + 0.45));
  const icon = back(seg(t, T.icon, T.icon + 0.35), 1.4);
  const star = back(seg(t, T.star, T.star + 0.4), 1.6);
  const sun = back(seg(t, T.sun, T.sun + 0.35), 1.8);
  const under = inOut(seg(t, T.sun + 0.15, T.sun + 0.55));
  const settle = inOut(seg(t, T.star, T.sun + 0.3));
  const words = p.line.split(" ");
  const mid = Math.ceil(words.length / 2);
  // the glyph slides out on its own; the words fold into two lines beside it
  const gx = lerp(220, lerp(470, 590, settle), apart);
  const gy = lerp(500, lerp(600, 560, settle), apart);
  const iconSize = 420;
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden" }}>
      {t < T.ungroup ? (
        <div style={at(200, 480, { fontFamily: SANS, fontSize: 84, fontWeight: 500, letterSpacing: "-0.01em", color: sel > 0 ? "transparent" : INK, WebkitTextStroke: sel > 0 ? "1.6px #2f4cf5" : undefined, whiteSpace: "nowrap", outline: sel > 0 ? "2px solid #2f4cf5" : undefined, outlineOffset: 10 })}>
          {full.slice(0, n)}
          {sel === 0 && <Caret on={blink(t, busy)} />}
        </div>
      ) : (
        <>
          {star > 0 && (
            <div style={at(lerp(gx - 40, 360, settle) - 160, lerp(gy, 470, settle) - 230, { transform: `scale(${star}) rotate(${(1 - star) * -40 + t * 12}deg)` })}>
              <Star s={iconSize * 0.95} color={INK} />
            </div>
          )}
          {sun > 0 && <div style={at(410 - 100, 470 - 160, { width: 300, height: 300, borderRadius: 999, background: SUN, transform: `scale(${sun})` })} />}
          {icon > 0 && <div style={at(gx - 70, gy - iconSize / 2 + 40, { width: iconSize, height: iconSize, borderRadius: lerp(0, 72, settle), background: a, transform: `scale(${icon})`, boxShadow: settle < 0.5 ? "0 0 0 2px #2f4cf5" : undefined })} />}
          <div style={at(gx, gy, { fontFamily: SANS, fontSize: lerp(66, 190, icon), fontWeight: lerp(500, 600, icon), color: icon > 0.5 ? "#fff" : INK, whiteSpace: "nowrap", letterSpacing: "-0.03em", lineHeight: 1 })}>{p.glyph}</div>
          <div style={at(lerp(700, 1030, apart), lerp(500, 500, apart), { fontFamily: SANS, fontSize: 66, fontWeight: 500, lineHeight: 1.12, color: INK, whiteSpace: "nowrap" })}>
            <div>{words.slice(0, mid).join(" ")}</div>
            <div style={{ position: "relative", display: "inline-block" }}>
              {words.slice(mid).join(" ")}
              {under > 0 && (
                <svg width="460" height="40" viewBox="0 0 460 40" style={at(-10, 72)}>
                  <path d="M5 30 Q 230 0 455 22" fill="none" stroke="#2f4cf5" strokeWidth="9" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - under} />
                </svg>
              )}
            </div>
          </div>
        </>
      )}
      <Key keys={["T"]} at={110} t={t} from={T.line} to={T.outline} />
      <Key keys={["⇧⌘O"]} at={110} t={t} from={T.outline} to={T.ungroup} />
      <Key keys={["⇧⌘G"]} at={110} t={t} from={T.ungroup} to={T.icon} />
      <Key keys={["M"]} at={110} t={t} from={T.icon} to={T.star} />
      <Key keys={["↑", "↑", "L", "M"]} at={110} t={t} from={T.star} to={T.sun} />
      <Key keys={["⇧⌘A", "P", "↑", "↑", "↑"]} at={110} t={t} from={T.sun} to={T.app} />
    </div>
  );
}

/* ---------------- the app ---------------- */

const THUMBS = (() => {
  const r = rng(8);
  const kinds = ["sun", "dot", "star", "pill", "stripes", "blank", "rings", "flag"];
  return Array.from({ length: 36 }, () => kinds[Math.floor(r() * kinds.length)]);
})();
function Thumb({ kind, a }: { kind: string; a: string }) {
  const inner: Record<string, ReactNode> = {
    sun: <div style={{ width: 54, height: 54, borderRadius: 99, background: SUN }} />,
    dot: <div style={{ width: 50, height: 50, borderRadius: 99, background: a }} />,
    star: <Star s={60} color={SUN} />,
    pill: <div style={{ width: 70, height: 30, borderRadius: 99, background: "#2f4cf5" }} />,
    stripes: <div style={{ width: 80, height: 60, background: `repeating-linear-gradient(0deg, ${a} 0 6px, #fff 6px 12px)` }} />,
    blank: null,
    rings: <div style={{ width: 60, height: 60, borderRadius: 99, boxShadow: `inset 0 0 0 5px ${INK}, inset 0 0 0 14px #fff, inset 0 0 0 19px ${a}` }} />,
    flag: <div style={{ width: 70, height: 46, background: `linear-gradient(90deg, #2f4cf5 33%, #fff 33% 66%, ${a} 66%)` }} />,
  };
  return <div style={{ width: 120, height: 120, borderRadius: 6, background: "#f5f4f0", display: "grid", placeItems: "center" }}>{inner[kind]}</div>;
}
function AppWindow({ a, src }: { a: string; src?: string }) {
  return (
    <div style={{ width: 1240, height: 780, borderRadius: 16, background: "#1c1c1e", boxShadow: "0 40px 100px -30px rgba(0,0,0,.5)", overflow: "hidden", position: "relative", fontFamily: SANS }}>
      <div style={at(0, 0, { width: 1240, height: 40, background: "#232325", display: "flex", gap: 8, alignItems: "center", paddingLeft: 16 })}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 9, background: c }} />
        ))}
      </div>
      {/* the product's own window, when there's one: no drawn editor around it */}
      {src ? (
        <div data-pick="screen" style={at(0, 40, { width: 1240, height: 740, overflow: "hidden" })}>
          <Slot src={src} w={1240} h={740} />
        </div>
      ) : (
      <>
      <div style={at(0, 40, { width: 56, height: 740, background: "#202022" })}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={at(18, 18 + i * 42, { width: 20, height: 20, borderRadius: 5, border: "2px solid #6c6c70" })} />
        ))}
      </div>
      <div style={at(80, 80, { display: "grid", gridTemplateColumns: "repeat(7, 120px)", gap: 14 })}>
        {THUMBS.slice(0, 28).map((k, i) => (
          <Thumb key={i} kind={k} a={a} />
        ))}
      </div>
      <div style={at(1010, 40, { width: 230, height: 740, background: "#252527", padding: 18, boxSizing: "border-box", color: "#bbb", fontSize: 15 })}>
        {["Properties", "Fill", "Stroke", "Opacity", "Effects", "Layers"].map((s, i) => (
          <div key={s} style={{ marginTop: i ? 26 : 4, display: "flex", justifyContent: "space-between" }}>
            {s} <span style={{ width: i === 1 ? 18 : 40, height: 12, borderRadius: 3, background: i === 1 ? a : "#3a3a3d" }} />
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

function Meet({ t, p, a }: { t: number; p: P; a: string }) {
  const k = expo(seg(t, T.app, T.app + 0.8));
  const whip = acc2(seg(t, T.whip - 0.3, T.pen));
  return (
    <div style={{ ...fill, background: PAPER, overflow: "hidden", perspective: 1800 }}>
      <div style={{ ...fill, perspective: 1800, perspectiveOrigin: "700px 520px", transformOrigin: "800px 520px", transform: `scale(${lerp(1, 2.6, whip)})`, filter: whip > 0 ? `blur(${whip * 10}px)` : undefined }}>
        <div style={at(lerp(60, 90, k), lerp(240, 160, k), { transform: `rotateY(${lerp(18, 7, k)}deg) rotateX(3deg) scale(${lerp(0.92, 1, k)})`, opacity: k, transformOrigin: "0 50%" })}>
          <AppWindow a={a} src={p.screen} />
        </div>
      </div>
      <div style={at(1450, 470, { fontFamily: SANS, fontSize: 66, fontWeight: 500, lineHeight: 1.12, color: INK, opacity: 1 - whip })}>
        {["Meet", p.name + "."].map((w, i) => (
          <div key={i} style={{ opacity: out(seg(t, T.app + 0.3 + i * 0.25, T.app + 0.6 + i * 0.25)) }}>
            {w}
          </div>
        ))}
      </div>
      <Key keys={["⌥⌘O"]} at={110} t={t} from={T.app} to={T.whip} />
    </div>
  );
}
const acc2 = (x: number) => clamp(x) ** 3;

/* ---------------- the pen ---------------- */

const LEAF = "M860 150 C 1110 360, 1110 720, 860 930 C 610 720, 610 360, 860 150 Z";
function Pen({ t, p, a }: { t: number; p: P; a: string }) {
  const draw = inOut(seg(t, 9.75, T.fillIn));
  const fillK = inOut(seg(t, T.fillIn - 0.25, T.fillIn + 0.35));
  const card = expo(seg(t, 9.85, 10.4));
  // where the pen is along the leaf (left side up, then the right side down)
  const ang = draw * Math.PI * 2;
  const pen = { x: 860 - Math.sin(ang) * 230, y: 540 + Math.cos(ang) * 390 };
  return (
    <div style={{ ...fill, background: "#1c1c1e", overflow: "hidden" }}>
      <div style={at(0, 0, { width: 70, height: 1080, background: "#202022" })}>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={at(24, 30 + i * 52, { width: 22, height: 22, borderRadius: 5, border: `2px solid ${i === 3 ? a : "#6c6c70"}` })} />
        ))}
      </div>
      <div style={at(1500, 0, { width: 420, height: 1080, background: "#232325", padding: 26, boxSizing: "border-box", fontFamily: SANS, color: "#bbb", fontSize: 18 })}>
        {["Appearance", "Fill", "Stroke", "Opacity 100", "Align", "Quick Actions", "Layers"].map((s, i) => (
          <div key={s} style={{ marginTop: i ? 34 : 0, display: "flex", alignItems: "center", gap: 10 }}>
            {i === 1 && <span style={{ width: 18, height: 18, borderRadius: 4, background: a }} />}
            {s}
          </div>
        ))}
      </div>
      <div style={at(360, 0, { width: 1020, height: 1080, background: PAPER })}>
        <svg width={1020} height={1080} viewBox="360 0 1020 1080" style={{ display: "block" }}>
          <path d={LEAF} fill="none" stroke="#9a9a9a" strokeWidth="2" strokeDasharray="7 7" />
          <line x1="860" y1="150" x2="860" y2="930" stroke="#9a9a9a" strokeWidth="2" strokeDasharray="7 7" />
          <path d={LEAF} fill={a} fillOpacity={fillK} stroke={a} strokeWidth="6" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
          {draw > 0 && draw < 1 && (
            <g>
              <line x1={pen.x - 90} y1={pen.y - 120} x2={pen.x + 90} y2={pen.y + 120} stroke="#2f4cf5" strokeWidth="2" />
              <circle cx={pen.x - 90} cy={pen.y - 120} r="7" fill="#fff" stroke="#2f4cf5" strokeWidth="2" />
              <rect x={pen.x - 8} y={pen.y - 8} width="16" height="16" fill="#fff" stroke="#2f4cf5" strokeWidth="2.5" />
            </g>
          )}
          {fillK > 0.9 &&
            [
              [630, 540],
              [1090, 540],
            ].map(([x, y]) => <rect key={x} x={x - 8} y={y - 8} width="16" height="16" fill="#fff" stroke="#2f4cf5" strokeWidth="2.5" />)}
        </svg>
      </div>
      <div style={at(80, 830, { width: 690, padding: "26px 34px", borderRadius: 16, background: "#fff", boxShadow: "0 20px 50px -20px rgba(0,0,0,.4)", opacity: card, filter: card < 1 ? `blur(${(1 - card) * 10}px)` : undefined, transform: `translateY(${(1 - card) * 20}px)` })}>
        <div style={{ fontFamily: SANS, fontSize: 68, fontWeight: 700, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{p.tool}</div>
        <div style={{ fontFamily: MONO, fontSize: 20, color: "#666", marginTop: 12 }}>{p.how}</div>
      </div>
      <Key keys={["P"]} at={830} t={t} from={T.pen + 0.2} to={DUR + 1} />
    </div>
  );
}

export default function VerbDrop({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  return (
    <Stage background={PAPER} style={{ fontFamily: SANS, color: INK }}>
      <div data-film="" style={fill}>
        {t < T.line && <Verb t={t} p={p} a={a} />}
        {t >= T.line && t < T.app && <Line t={t} p={p} a={a} />}
        {t >= T.app && t < T.pen && <Meet t={t} p={p} a={a} />}
        {t >= T.pen && <Pen t={t} p={p} a={a} />}
      </div>
    </Stage>
  );
}
