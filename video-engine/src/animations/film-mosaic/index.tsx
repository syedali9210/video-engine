// Prompt to page: a product demo as a 2×2 mosaic, replicated from the Alpaca film. Each quarter runs the same story
// on its own clock, cut where the reference cuts (measured: 4.17, 4.77, 6.37, 6.97, 8.2, 9.5, 10.43, 11.77, 12.47 s);
// the light grey, white cards, one blue and the dark interludes are the reference's; the words are params.
import type { CSSProperties, ReactNode } from "react";
import { Caret, Cursor, Shown, Slot, Stage, alpha, at, blink, clamp, expo, fill, hexMix, lerp, out, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 13.0;
const W = 960;
const H = 540;
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const GREY = "#efefef";
const INK = "#151515";
const CORAL = "#e2644a";
const split = (s: string) => s.split("|").map((x) => x.trim());

type Card = "logo" | "picker" | "begin" | "log" | "made" | "monitor" | "phone" | "connect" | "team" | "tools" | "page" | "ready" | "brand";
/** each quarter's cuts: [from, card] */
const CELLS: [number, Card][][] = [
  [[0, "logo"], [2.6, "begin"], [5.6, "picker"], [8.4, "log"], [12.1, "ready"], [12.6, "logo"]],
  // (the loop is 13 s: the second quarter's prompt, typed at 12.47, is still on screen as the film begins again)
  [[-0.53, "begin"], [0.15, "picker"], [2.4, "log"], [6.37, "made"], [6.97, "monitor"], [9.5, "connect"], [10.43, "team"], [11.77, "page"], [12.47, "begin"]],
  [[0, "picker"], [1.9, "log"], [4.17, "made"], [4.77, "monitor"], [6.97, "connect"], [8.2, "team"], [10.0, "page"], [11.0, "tools"], [12.47, "picker"]],
  [[0, "tools"], [2.6, "page"], [5.6, "phone"], [8.2, "brand"], [12.6, "tools"]],
];

/* ---------------- the pieces ---------------- */

/** the product's mark: an asterisk of six strokes */
const Asterisk = ({ s, color = INK, src }: { s: number; color?: string; src?: string }) =>
  src ? (
    <span style={{ display: "inline-block", verticalAlign: "middle", width: s, height: s }}>
      <Slot src={src} w={s} h={s} fit="contain" />
    </span>
  ) : (
  <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "inline-block", verticalAlign: "middle" }}>
    {[0, 30, 60, 90, 120, 150].map((a) => (
      <line key={a} x1={Math.cos((a * Math.PI) / 180) * -44} y1={Math.sin((a * Math.PI) / 180) * -44} x2={Math.cos((a * Math.PI) / 180) * 44} y2={Math.sin((a * Math.PI) / 180) * 44} stroke={color} strokeWidth="13" strokeLinecap="round" />
    ))}
  </svg>
  );
const Burst = ({ s }: { s: number }) => (
  <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "inline-block", verticalAlign: "middle" }}>
    {Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const k = i % 2 ? 0.75 : 1;
      return <line key={i} x1={0} y1={0} x2={Math.cos(a) * 46 * k} y2={Math.sin(a) * 46 * k} stroke={CORAL} strokeWidth="12" strokeLinecap="round" />;
    })}
  </svg>
);
const Pill = ({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: CSSProperties }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 26px", borderRadius: 99, background: dark ? INK : "#fff", color: dark ? "#fff" : INK, fontFamily: SANS, fontSize: 26, fontWeight: 500, boxShadow: dark ? undefined : "0 1px 2px rgba(0,0,0,.06), 0 8px 20px -10px rgba(0,0,0,.2)", ...style }}>{children}</span>
);
const UI = ({ w, h, children, style }: { w: number; h: number; children?: ReactNode; style?: CSSProperties }) => <div style={{ position: "relative", width: w, height: h, borderRadius: 18, background: "#fff", boxShadow: "0 0 0 1px #e6e6e6, 0 20px 40px -24px rgba(0,0,0,.2)", overflow: "hidden", fontFamily: SANS, color: INK, ...style }}>{children}</div>;

/** a screenshot of the page that was made: a soft gradient hero, two columns of features */
function PageShot({ w, a, src }: { w: number; a: string; src?: string }) {
  const k = w / 600;
  if (src) return <Shown pick="page" src={src} w={w} aspect={600 / 420} style={{ background: "#fff", borderRadius: 10 * k, boxShadow: "0 0 0 1px #e6e6e6" }} />;
  return (
    <div style={{ width: w, height: 420 * k, background: "#fff", borderRadius: 10 * k, boxShadow: "0 0 0 1px #e6e6e6", overflow: "hidden", position: "relative", fontFamily: SANS }}>
      <div style={at(16 * k, 12 * k, { display: "flex", gap: 8 * k, alignItems: "center", fontSize: 11 * k, color: "#666" })}>
        <Asterisk s={12 * k} /> Home · Product · Pricing
      </div>
      <div style={at(110 * k, 50 * k, { width: 380 * k, height: 90 * k, borderRadius: 10 * k, background: `linear-gradient(90deg, #f0abfc, #a5b4fc, ${hexMix(a, "#ffffff", 0.3)}, #a5f3fc)` })}>
        <div style={at(70 * k, 30 * k, { width: 240 * k, height: 30 * k, borderRadius: 99, background: "rgba(255,255,255,.8)" })} />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={at((60 + (i % 2) * 250) * k, (170 + Math.floor(i / 2) * 70) * k, { display: "flex", gap: 10 * k, alignItems: "center" })}>
          <span style={{ width: 26 * k, height: 26 * k, borderRadius: 6 * k, background: ["#111", "#7c3aed", "#ef4444", a, "#f59e0b", "#10b981"][i] }} />
          <span>
            <div style={{ width: 120 * k, height: 7 * k, borderRadius: 4, background: "#222" }} />
            <div style={{ width: 160 * k, height: 6 * k, borderRadius: 4, background: "#ddd", marginTop: 6 * k }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- the cards ---------------- */

function CardView({ card, lt, p, a }: { card: Card; lt: number; p: P; a: string }) {
  const tools = split(p.tools);
  const enter = expo(seg(lt, 0, 0.45));
  switch (card) {
    case "logo": {
      const word = out(seg(lt, 0.5, 1.1));
      return (
        <div style={{ ...fill, background: GREY, display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 52, fontWeight: 600, letterSpacing: "-0.02em", color: INK }}>
            <span style={{ transform: `rotate(${lt * 40}deg)` }}>
              <Asterisk s={48} src={p.mark} />
            </span>
            <span style={{ clipPath: `inset(0 ${(1 - word) * 100}% 0 0)` }}>{p.name}</span>
          </div>
        </div>
      );
    }
    case "picker": {
      const reach = out(seg(lt, 0.3, 0.9));
      const press = clamp(seg(lt, 0.95, 1.02)) * (1 - seg(lt, 1.02, 1.15));
      return (
        <div style={{ ...fill, background: GREY }}>
          <div style={at(160, 70, { opacity: enter, transform: `translateY(${(1 - enter) * 20}px)` })}>
            <UI w={620} h={300} style={{ borderRadius: 26 }}>
              <div style={at(40, 50, { display: "flex", alignItems: "center", gap: 16, fontSize: 40 })}>
                <Burst s={38} /> {p.model} <span style={{ color: "#999", fontSize: 30 }}>⌄</span>
                <span style={{ marginLeft: 50, color: "#888", fontSize: 32 }}>🎙</span>
                <span style={{ width: 76, height: 76, borderRadius: 99, background: a, display: "grid", placeItems: "center", transform: `scale(${1 - press * 0.1})` }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <path d="M12 19V5m-6 6 6-6 6 6" />
                  </svg>
                </span>
              </div>
              <div style={at(380, 190)}>
                <Pill dark style={{ fontSize: 30, padding: "14px 34px" }}>
                  Upgrade
                </Pill>
              </div>
            </UI>
          </div>
          <Cursor x={lerp(640, 735, reach)} y={lerp(470, 160, reach)} press={press} size={2} />
        </div>
      );
    }
    case "begin": {
      const n = Math.floor(clamp((lt - 0.5) / 1.4) * p.prompt.length);
      return (
        <div style={{ ...fill, background: "#fff" }}>
          <div style={at(0, 70, { width: W, textAlign: "center", fontFamily: SANS, fontSize: 30, color: "#333" })}>
            <Asterisk s={26} src={p.mark} /> <br />
            {p.begin}
          </div>
          <div style={at(130, 190, { opacity: enter })}>
            <UI w={700} h={230}>
              <div style={at(30, 30, { fontSize: 30 })}>
                {p.prompt.slice(0, n)}
                <Caret on={blink(lt, n < p.prompt.length)} />
              </div>
              <div style={at(30, 130, { display: "flex", alignItems: "center", gap: 14, fontSize: 20, color: "#666" })}>
                + ⊞ ⚙ {p.name} <span style={{ padding: "2px 10px", borderRadius: 6, background: alpha(a, 0.15), color: a, fontSize: 16 }}>New</span>
              </div>
            </UI>
            <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 20, color: "#555" }}>♛ Upgrade to PRO</div>
          </div>
        </div>
      );
    }
    case "log": {
      const rows = ["Running Command", "Edited company.md", "Task update", "Running Command"];
      return (
        <div style={{ ...fill, background: "#fff", fontFamily: SANS, color: INK }}>
          <div style={at(60, 40, { display: "flex", width: 840, fontSize: 24, color: "#555" })}>
            ✳ {p.log} ⌄<span style={{ marginLeft: "auto" }}>6m 12s</span>
          </div>
          {rows.map((r, i) => {
            const k = out(seg(lt, 0.15 + i * 0.2, 0.45 + i * 0.2));
            return (
              <div key={i} style={at(60, 100 + i * 46, { display: "flex", width: 840, alignItems: "center", gap: 14, fontSize: 24, opacity: k })}>
                <span style={{ width: 20, height: 20, borderRadius: 99, border: "2px solid #aaa" }} />
                {r}
                <span style={{ marginLeft: "auto", fontSize: 18, color: "#888", background: "#f2f2f2", padding: "2px 10px", borderRadius: 6 }}>{i % 3 ? "file" : "script"}</span>
              </div>
            );
          })}
          <div style={at(60, 300, { width: 840, height: 160, borderRadius: 14, boxShadow: "0 0 0 1px #e6e6e6", padding: 20, boxSizing: "border-box", fontFamily: MONO, fontSize: 20, opacity: out(seg(lt, 1.0, 1.4)) })}>
            <div style={{ color: "#888" }}>JSON</div>
            {"{"}
            <br />
            &nbsp;&nbsp;"taskId": "11",
            <br />
            &nbsp;&nbsp;"status": <span style={{ color: "#16a34a" }}>"completed"</span>
            <br />
            {"}"}
          </div>
          <div style={at(60, 480, { fontSize: 22, color: "#555", opacity: out(seg(lt, 1.5, 1.8)) })}>✓ Done</div>
        </div>
      );
    }
    case "made":
    case "ready": {
      const text = card === "ready" ? p.ready : p.made;
      const g = seg(lt, 0, 0.6);
      return (
        <div style={{ ...fill, background: "#2a2a2a", overflow: "hidden" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={at(W / 2 - (200 + i * 90 + g * 40), H / 2 - (90 + i * 70 + g * 30), { width: (200 + i * 90 + g * 40) * 2, height: (90 + i * 70 + g * 30) * 2, borderRadius: 999, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.14)" })} />
          ))}
          <div style={{ ...fill, display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 60, color: "#fff", opacity: expo(g) }}>{text}</div>
        </div>
      );
    }
    case "monitor":
    case "brand": {
      const k = expo(seg(lt, 0, 0.7));
      return (
        <div style={{ ...fill, background: GREY }}>
          <div style={at(180, lerp(80, 40, k), { opacity: k })}>
            <div style={{ width: 600, height: 380, borderRadius: 18, background: INK, padding: 14, boxSizing: "border-box", boxShadow: "0 30px 60px -30px rgba(0,0,0,.4)" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 8, background: "#fff", overflow: "hidden", display: "grid", placeItems: "center" }}>
                {card === "brand" ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    <Asterisk s={44} src={p.mark} /> {p.name}
                  </span>
                ) : (
                  <div style={{ transform: `translateY(${-seg(lt, 0.8, 2.2) * 60}px)` }}>
                    <PageShot w={572} a={a} src={p.page} />
                  </div>
                )}
              </div>
            </div>
            <div style={{ width: 120, height: 70, margin: "0 auto", background: "linear-gradient(#d4d4d4, #bdbdbd)" }} />
            {card === "monitor" && <div style={at(440, 360, { width: 4, height: 90, background: "#e0442b" })} />}
          </div>
        </div>
      );
    }
    case "phone": {
      const turn = Math.sin(lt * 1.6) * 28 + lerp(40, 0, expo(seg(lt, 0, 0.8)));
      return (
        <div style={{ ...fill, background: GREY, perspective: 1200 }}>
          <div style={at(W / 2 - 110, 40, { width: 220, height: 460, borderRadius: 38, background: INK, padding: 9, boxSizing: "border-box", transform: `rotateY(${turn}deg) rotateZ(${-6 + Math.sin(lt) * 3}deg)`, boxShadow: "0 30px 50px -20px rgba(0,0,0,.4)" })}>
            <div style={{ width: "100%", height: "100%", borderRadius: 30, background: "#fff", overflow: "hidden", padding: "40px 16px", boxSizing: "border-box", fontFamily: SANS }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Welcome back</div>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: i ? "#e5e5e5" : a }} />
                  <span style={{ width: 120 - i * 8, height: 7, borderRadius: 4, background: "#d4d4d4" }} />
                </div>
              ))}
              <div style={{ marginTop: 40, height: 34, borderRadius: 99, background: INK }} />
            </div>
          </div>
        </div>
      );
    }
    case "connect": {
      const n = Math.floor(clamp((lt - 0.1) / 0.6) * p.connect.length);
      return (
        <div style={{ ...fill, background: GREY, display: "grid", placeItems: "center" }}>
          <span style={{ fontFamily: SANS, fontSize: 40, color: "#444" }}>🔗 {p.connect.slice(0, n)}</span>
        </div>
      );
    }
    case "team": {
      const g = expo(seg(lt, 0, 1.0));
      return (
        <div style={{ ...fill, background: "#262626", overflow: "hidden", display: "grid", placeItems: "center" }}>
          {[3, 2, 1].map((i) => (
            <div key={i} style={at(W / 2 - (130 + i * 85 * g), H / 2 - (40 + i * 60 * g), { width: (130 + i * 85 * g) * 2, height: (40 + i * 60 * g) * 2, borderRadius: 999, background: ["", "#8a8a8a", "#5f5f5f", "#3f3f3f"][i] })} />
          ))}
          <span style={{ position: "relative" }}>
            <Pill style={{ background: "#c9c9c9", color: "#222", fontSize: 30 }}>{p.team}</Pill>
          </span>
        </div>
      );
    }
    case "tools":
      return (
        <div style={{ ...fill, background: "#fff", fontFamily: SANS, color: INK }}>
          <div style={at(40, 0, { width: 880, height: 46, borderRadius: "0 0 12px 12px", background: `linear-gradient(90deg, #f0abfc, #a5b4fc, ${hexMix(a, "#ffffff", 0.2)}, #67e8f9)` })} />
          <div style={at(60, 70, { fontSize: 24, fontWeight: 600 })}>Featured</div>
          {tools.map((tool, i) => {
            const k = out(seg(lt, 0.1 + i * 0.07, 0.4 + i * 0.07));
            return (
              <div key={tool} style={at(60 + (i % 2) * 440, 120 + Math.floor(i / 2) * 96, { display: "flex", gap: 14, alignItems: "center", width: 400, opacity: k })}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: ["#111", "#222", "#e01e5a", "#f06a6a", a, "#3b82f6", "#a259ff", "#111"][i % 8], color: "#fff", display: "grid", placeItems: "center", fontWeight: 700 }}>{tool[0]}</span>
                <span>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{tool}</div>
                  <div style={{ fontSize: 16, color: "#888" }}>Connect it in one click</div>
                </span>
                <span style={{ marginLeft: "auto", color: "#bbb", fontSize: 22 }}>+</span>
              </div>
            );
          })}
        </div>
      );
    default:
      return (
        <div style={{ ...fill, background: GREY, display: "grid", placeItems: "center" }}>
          <div style={{ transform: `scale(${lerp(0.9, 1, enter)}) translateY(${-seg(lt, 0.5, 2.5) * 40}px)`, opacity: enter }}>
            <PageShot w={760} a={a} src={p.page} />
          </div>
        </div>
      );
  }
}

export default function PromptToPage({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  return (
    <Stage background={GREY} style={{ fontFamily: SANS, color: INK }}>
      <div data-film="" style={fill}>
        {CELLS.map((cuts, i) => {
          const j = cuts.filter(([from]) => t >= from).length - 1;
          const [from, card] = cuts[Math.max(0, j)];
          return (
            <div key={i} style={at((i % 2) * W, Math.floor(i / 2) * H, { width: W, height: H, overflow: "hidden", borderRight: i % 2 ? undefined : "1px solid rgba(0,0,0,.05)", borderBottom: i < 2 ? "1px solid rgba(0,0,0,.05)" : undefined })}>
              <CardView card={card} lt={t - from} p={p} a={a} />
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

