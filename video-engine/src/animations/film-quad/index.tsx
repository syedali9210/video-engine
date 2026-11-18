// Quad grid: a feature launch as four little ads looping at once, replicated from an "instant / replay share cards"
// film. Each quarter's beats are the reference's (measured cuts 1.7, 3.4, 6.07, 7.77, 10.4 s; each quarter loops in
// about 4.6 s); its periwinkle, white, peach and black grounds are the reference's; the words are params.
import type { CSSProperties, ReactNode } from "react";
import { Slot, Stage, alpha, at, back, clamp, expo, fill, hexMix, inOut, lerp, out, rng, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 4.37;
const W = 960;
const H = 540;
const LOOP = 4.37;
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const PERI = "#7f86ea";
const ORANGE = "#ff7a45";
const split = (s: string) => s.split("|").map((x) => x.trim());

/* ---------------- pieces ---------------- */

/** a coin seen at an angle: its face and its rim */
function Coin({ x, y, s, turn = 0, face = "#f5a524", mark = "◎", style }: { x: number; y: number; s: number; turn?: number; face?: string; mark?: string; style?: CSSProperties }) {
  const k = Math.abs(Math.cos(turn));
  return (
    <div style={at(x - s / 2, y - s / 2, { width: s, height: s, ...style })}>
      <div style={{ ...fill, borderRadius: 999, background: hexMix(face, "#5a3200", 0.45), transform: `translateX(${s * 0.08}px) scaleX(${Math.max(0.15, k)})` }} />
      <div style={{ ...fill, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, ${hexMix(face, "#ffffff", 0.45)}, ${face} 55%, ${hexMix(face, "#7a4200", 0.3)})`, transform: `scaleX(${Math.max(0.12, k)})`, display: "grid", placeItems: "center", color: hexMix(face, "#4a2600", 0.55), fontFamily: SANS, fontWeight: 800, fontSize: s * 0.4 }}>{k > 0.4 ? mark : ""}</div>
    </div>
  );
}

const Phone = ({ x, y, w, dark = false, children, style }: { x: number; y: number; w: number; dark?: boolean; children: ReactNode; style?: CSSProperties }) => (
  <div style={at(x, y, { width: w, height: w * 2.05, borderRadius: w * 0.16, background: "#111", padding: w * 0.035, boxSizing: "border-box", boxShadow: "0 30px 60px -24px rgba(0,0,0,.45)", ...style })}>
    <div style={{ width: "100%", height: "100%", borderRadius: w * 0.13, overflow: "hidden", background: dark ? "#0b0b14" : "#fff", position: "relative", fontFamily: SANS, color: dark ? "#fff" : "#111" }}>{children}</div>
  </div>
);

/** the trading screen: a balance, its line climbing, the app's name */
function Trading({ t, p, w }: { t: number; p: P; w: number }) {
  const k = w / 220;
  const pts = Array.from({ length: 24 }, (_, i) => `${i * 8 * k},${(60 - Math.sin(i * 0.7) * 14 - i * 1.6 - Math.sin(t * 2 + i) * 3) * k}`).join(" ");
  return (
    <div style={{ padding: 14 * k, fontSize: 9 * k }}>
      <div style={{ textAlign: "center", opacity: 0.7, fontSize: 8 * k }}>Replaying trade</div>
      <div style={{ marginTop: 10 * k, borderRadius: 12 * k, background: "#151530", border: `1.5px solid ${alpha("#7f86ea", 0.8)}`, padding: 10 * k }}>
        <div style={{ fontWeight: 700 }}>unipcs</div>
        <svg width={190 * k} height={70 * k} style={{ marginTop: 6 * k }}>
          <polyline points={pts} fill="none" stroke="#38e07b" strokeWidth={2 * k} />
        </svg>
        <div style={{ color: "#38e07b", fontWeight: 700, fontSize: 13 * k }}>+$1,084,340.92</div>
      </div>
      <div style={{ marginTop: 10 * k, display: "flex", justifyContent: "space-between", opacity: 0.7 }}>
        <span>$1,597</span>
        <span>$4,550</span>
        <span>$10,450</span>
      </div>
      <div style={{ position: "absolute", bottom: 12 * k, left: 14 * k, right: 14 * k, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: 13 * k }}>
        {p.app}
        <span style={{ fontSize: 8 * k, opacity: 0.6 }}>Replay</span>
      </div>
    </div>
  );
}

/** a list of tokens, then the keyboard for a search */
function Tokens({ w, keyboard }: { w: number; keyboard: number }) {
  const k = w / 220;
  return (
    <div style={{ padding: 14 * k, fontSize: 8 * k }}>
      <div style={{ fontWeight: 700, marginTop: 14 * k }}>Trending Tokens</div>
      {["CASHCAT", "Cea Industries", "STONK", "Pons"].map((n, i) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 * k, marginTop: 10 * k }}>
          <span style={{ width: 16 * k, height: 16 * k, borderRadius: 99, background: ["#ffb020", "#222", "#38e07b", "#7f86ea"][i] }} />
          <span style={{ flex: 1 }}>{n}</span>
          <span>$0.{160 + i * 37}</span>
        </div>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150 * k * keyboard, background: "#eef0f4", overflow: "hidden" }}>
        {[10, 9, 7].map((n, r) => (
          <div key={r} style={{ display: "flex", justifyContent: "center", gap: 3 * k, marginTop: 8 * k }}>
            {Array.from({ length: n }, (_, i) => (
              <span key={i} style={{ width: 16 * k, height: 22 * k, borderRadius: 4 * k, background: "#fff", fontSize: 8 * k, display: "grid", placeItems: "center" }}>
                {"qwertyuiopasdfghjklzxcvbnm"[(r * 10 + i) % 26]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** the wallet: a balance, three actions */
function Balance({ v, w, a, hot = 0 }: { v: string; w: number; a: string; hot?: number }) {
  const k = w / 220;
  return (
    <div style={{ padding: 14 * k, fontSize: 8 * k, color: "#111" }}>
      <div style={{ display: "flex", gap: 4 * k, marginTop: 14 * k }}>
        {["All", "Trading", "Card", "Staking"].map((s, i) => (
          <span key={s} style={{ padding: `${2 * k}px ${6 * k}px`, borderRadius: 99, border: "1px solid #ddd", background: i ? undefined : alpha(ORANGE, 0.15), color: i ? "#555" : ORANGE }}>
            {s}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 14 * k, color: "#888" }}>Net Worth</div>
      <div style={{ fontSize: 20 * k, fontWeight: 700, marginTop: 4 * k, textAlign: "center" }}>{v}</div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 12 * k, color: "#555" }}>
        {["Deposit", "Withdraw", "Transfer"].map((s, i) => (
          <span key={s} style={{ padding: `${3 * k}px ${6 * k}px`, borderRadius: 6 * k, background: i === 0 && hot ? alpha(a, 0.15 * hot) : undefined, color: i === 0 && hot ? hexMix("#555555", ORANGE, hot) : undefined }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- the four loops ---------------- */

/** the beats every quarter cuts on together (measured), in the 4.37 s loop */
const B = { one: 0.15, two: 1.58, three: 2.5, four: 3.35 };

/** a four-pointed sparkle */
const Sparkle = ({ s, style }: { s: number; style?: CSSProperties }) => (
  <svg width={s} height={s} viewBox="-50 -50 100 100" style={style}>
    <path d="M0 -46 C 6 -8, 8 -6, 46 0 C 8 6, 6 8, 0 46 C -6 8, -8 6, -46 0 C -8 -6, -6 -8, 0 -46Z" fill="#fff" />
  </svg>
);

function Peri({ lt, p }: { lt: number; p: P }) {
  const word = lt >= B.one && lt < B.two;
  const phone = lt >= B.two && lt < B.four;
  const intro = !word && !phone;
  // the word grows the whole time it's up; a sparkle swings in from the lower left and away
  const grow = lerp(1, 1.68, seg(lt, B.one, B.two));
  const sk = seg(lt, B.one, 1.45);
  const [sx, sy, ss] = [lerp(300, -60, sk), lerp(410, 560, sk * sk), lerp(150, 330, sk)];
  const rise = out(seg(lt, B.two, B.four));
  // introducing: a coin flips in beside it, shows its face, and goes to a dot
  const il = lt >= B.four ? lt - B.four : lt + (LOOP - B.four);
  const flip = seg(il, 0.2, 0.75);
  const away = inOut(seg(il, 0.8, 0.95));
  return (
    <div style={{ ...fill, background: `radial-gradient(circle at 50% 55%, ${hexMix(PERI, "#ffffff", 0.18)}, ${PERI} 70%)`, overflow: "hidden" }}>
      {[6, 5, 4, 3, 2, 1].map((i) => {
        const r = i + ((lt * 0.35) % 1);
        return <div key={i} style={{ position: "absolute", left: W / 2 - r * 110, top: H * 0.5 - r * 80, width: r * 220, height: r * 160, borderRadius: "50%", boxShadow: `inset 0 -10px 26px ${alpha("#ffffff", 0.1)}`, opacity: clamp(1.2 - r / 6) }} />;
      })}
      {word && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "grid", placeItems: "center", transform: `scale(${grow})`, willChange: "transform" }}>
            <div style={{ fontFamily: SANS, fontSize: 52, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>{p.feature}</div>
          </div>
          <Sparkle s={ss} style={{ position: "absolute", left: 0, top: 0, transform: `translate3d(${sx - ss / 2}px, ${sy - ss / 2}px, 0) rotate(${sk * 30}deg)` }} />
          {[
            [0.36, 0.42],
            [0.62, 0.38],
            [0.55, 0.6],
          ].map(([x, y], i) => (
            <Sparkle key={i} s={14 + 6 * Math.sin(lt * 5 + i)} style={{ position: "absolute", left: W * x * grow - (grow - 1) * W * 0.5, top: H * y, opacity: 0.8 }} />
          ))}
        </>
      )}
      {phone && (
        <Phone x={W / 2 - lerp(140, 160, rise)} y={lerp(70, 50, rise)} w={lerp(280, 320, rise)} dark>
          <Slot pick="screen1" src={p.screen1} t={lt} w={lerp(280, 320, rise) * 0.93} h={lerp(280, 320, rise) * 1.98}>
            <Trading t={lt} p={p} w={lerp(280, 320, rise) * 0.93} />
          </Slot>
        </Phone>
      )}
      {intro && (
        <div style={at(0, 0, { width: W, height: H, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: lerp(66, 56, seg(il, 0, 1)), color: "#fff", letterSpacing: "-0.02em" })}>
          {p.intro}
          <div style={{ width: 70, height: 70, position: "relative", transform: `translate(${(1 - out(seg(il, 0.1, 0.4))) * 200}px, ${away * 30}px) scale(${lerp(1, 0.18, away)})`, opacity: seg(il, 0.1, 0.2) }}>
            <Coin x={35} y={35} s={70} turn={Math.PI * (0.5 + flip * 1.5)} face="#3138f0" mark="ƒ" />
          </div>
        </div>
      )}
    </div>
  );
}

function Instant({ lt, p, a }: { lt: number; p: P; a: string }) {
  const list = lt >= B.one && lt < B.three;
  const paste = lt >= B.three && lt < B.four;
  const word = !list && !paste;
  const wl = lt >= B.four ? lt - B.four : lt + (LOOP - B.four);
  const wk = expo(seg(wl, 0, 0.45));
  // the list rises and comes closer; then the keyboard, closer still
  const zoom = lerp(1.15, 1.75, inOut(seg(lt, B.one, B.three)));
  const pw = 330;
  return (
    <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
      {word && (
        <>
          <div style={at(0, 0, { width: W, height: H, display: "grid", placeItems: "center" })}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 150, letterSpacing: "-0.045em", color: a, transform: `scale(${lerp(0.88, 1, wk)})`, opacity: wk, backgroundImage: `linear-gradient(90deg, ${hexMix(a, "#ffffff", 0.55)} 0%, ${a} 30%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{p.name}</div>
          </div>
          {[
            [170, 470, 210, "#d8dce2", "◢", 0],
            [860, 470, 190, "#1f2a2a", "S", 0.15],
            [130, 380, 120, "#3fbf5a", "", 0.05],
            [430, 70, 60, "#d8dce2", "", 0.2],
          ].map(([x, y, sz, f, m, d], i) => {
            const k = expo(seg(wl, d as number, (d as number) + 0.5));
            return <Coin key={i} x={(x as number) + Math.sin(wl * 2 + i) * 14} y={(y as number) + (1 - k) * 220} s={sz as number} turn={wl * 2.4 + i} face={f as string} mark={m as string} style={{ opacity: k }} />;
          })}
        </>
      )}
      {list && (
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "50% 30%", transform: `scale(${zoom}) translateY(${lerp(60, -120, inOut(seg(lt, B.one, B.three)))}px)` }}>
          <Phone x={W / 2 - pw / 2} y={40} w={pw}>
            <Slot pick="screen2" src={p.screen2} t={lt} w={pw * 0.93} h={pw * 1.98}>
              <Tokens w={pw * 0.93} keyboard={inOut(seg(lt, 1.45, 1.75))} />
            </Slot>
          </Phone>
        </div>
      )}
      {paste && (
        <div style={at(0, 0, { width: W, height: H, display: "grid", placeItems: "center" })}>
          <div style={{ width: 330, height: 130, borderRadius: 99, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.06), 0 24px 50px -16px rgba(0,0,0,.22)", display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 58, fontWeight: 600, transform: `scale(${back(seg(lt, B.three, B.three + 0.3), 1.6) * lerp(1, 1.3, seg(lt, B.three + 0.3, B.four))})` }}>Paste</div>
        </div>
      )}
    </div>
  );
}

function Peach({ lt, p, a }: { lt: number; p: P; a: string }) {
  const bal = split(p.balances);
  const button = lt >= B.one && lt < B.two;
  const coins = lt >= B.two && lt < B.three;
  const settle = lt >= B.three && lt < B.four;
  const end = !button && !coins && !settle;
  const el = lt >= B.four ? lt - B.four : lt + (LOOP - B.four);
  const r = rng(11);
  const drops = Array.from({ length: 10 }, (_, i) => ({ ang: (i / 10) * Math.PI * 2 + r() * 0.5, d: 150 + r() * 260, s: 70 + r() * 70, delay: r() * 0.25 }));
  // the balance counts up to the first figure as the card comes close, and Deposit lights
  const target = Number((bal[0] ?? "$1,597").replace(/[^0-9.]/g, "")) || 1597;
  const counted = Math.round(lerp(target * 0.57, target, out(seg(el, 0.05, 0.75))));
  const shown = end ? `$${counted.toLocaleString("en-US")}` : settle ? bal[1] : bal[0];
  const pw = end ? lerp(600, 330, out(seg(el, 0, 1))) : settle ? 300 : 260;
  return (
    <div style={{ ...fill, background: `linear-gradient(180deg, #ffffff 45%, ${hexMix(ORANGE, "#ffffff", 0.75)})`, overflow: "hidden" }}>
      {button && (
        <div style={at(0, 0, { width: W, height: H, display: "grid", placeItems: "center" })}>
          <div style={{ width: 580, height: 170, borderRadius: 99, background: `linear-gradient(180deg, #ff9f73, ${ORANGE} 55%, #f2552c)`, boxShadow: `inset 0 3px 0 rgba(255,255,255,.45), 0 24px 46px -14px ${alpha(ORANGE, 0.7)}`, display: "flex", justifyContent: "center", alignItems: "center", gap: 22, fontFamily: SANS, fontSize: 74, fontWeight: 500, color: "#fff", transform: `translateY(${lerp(10, -40, seg(lt, B.one, B.two))}px)` }}>⤓ {p.action}</div>
        </div>
      )}
      {!button && (
        <Phone x={W / 2 - pw / 2} y={end ? lerp(170, 50, out(seg(el, 0, 1))) : lerp(40, 60, settle ? 1 : 0)} w={pw} style={{ boxShadow: "none" }}>
          <Slot pick="screen3" src={p.screen3} t={lt} w={pw * 0.93} h={pw * 1.98}>
            <Balance v={shown} w={pw * 0.93} a={a} hot={end ? seg(el, 0.8, 0.9) : 0} />
          </Slot>
        </Phone>
      )}
      {coins &&
        drops.map((d, i) => {
          const k = out(seg(lt, B.two + d.delay, B.three));
          return <Coin key={i} x={W / 2 + Math.cos(d.ang) * d.d * k} y={H * 0.45 + Math.sin(d.ang) * d.d * 0.6 * k} s={d.s} turn={lt * 4 + i} mark="◎" style={{ opacity: seg(lt, B.two + d.delay, B.two + d.delay + 0.05) * (1 - seg(lt, B.three - 0.15, B.three)) }} />;
        })}
      {end && <div style={{ ...fill, background: `radial-gradient(ellipse 60% 40% at 50% 110%, ${alpha(ORANGE, 0.85 * seg(el, 0.8, 0.95))}, transparent)` }} />}
    </div>
  );
}

function Terminal({ lt, p }: { lt: number; p: P }) {
  const [r1, r2] = split(p.received);
  const r = rng(7);
  const phase = lt < 0.55 || lt >= B.four ? 0 : lt < B.two ? 1 : lt < B.three ? 2 : 3;
  const from = [0, 0.55, B.two, B.three][phase];
  const typed = (s: string, k: number) => s.slice(0, Math.floor(clamp((lt - from - k) / 0.5) * s.length));
  const dots = Array.from({ length: 16 }, () => ({ x: r() * W, y: r() * H, ph: r() * 6 }));
  const route = "M80 60 C 300 80, 420 260, 560 300 S 820 440, 940 470";
  const glitch = (i: number) => {
    const k = (lt * 1.7 + i * 0.37) % 1;
    return k < 0.3;
  };
  return (
    <div style={{ ...fill, background: "#050506", backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "48px 48px", overflow: "hidden" }}>
      {dots.map((d, i) => (
        <div key={i} style={at(d.x, d.y, { width: 5, height: 5, borderRadius: 9, background: "#3ad07a", opacity: 0.3 + 0.5 * Math.abs(Math.sin(lt * 2 + d.ph)) })} />
      ))}
      {phase === 0 && (
        <svg width={W} height={H} style={at(0, 0)}>
          <path d={route} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="2.5" strokeDasharray="7 9" strokeDashoffset={-lt * 40} />
          {[
            [200, 70],
            [560, 300],
          ].map(([x, y], i) => (
            <g key={i}>
              <rect x={x - 90} y={y - 26} width="180" height="52" fill="rgba(0,0,0,.6)" stroke="rgba(255,255,255,.3)" />
              <circle cx={x - 62} cy={y} r="7" fill="#3ad07a" />
              <rect x={x - 42} y={y - 5} width="110" height="10" rx="5" fill="rgba(233,233,233,.55)" />
            </g>
          ))}
        </svg>
      )}
      {phase === 1 && (
        <div style={at(120, 170, { fontFamily: SANS, fontSize: 40, lineHeight: 1.3, color: "#e9e9e9" })}>
          {typed(r1, 0)}
          <br />
          <span style={{ color: "#3ad07a" }}>{typed(r2, 0.3)}</span>
        </div>
      )}
      {phase === 2 && <div style={at(0, 250, { width: W, textAlign: "center", fontFamily: SANS, fontSize: 40, color: "#e9e9e9" })}>{typed(p.than, 0)}</div>}
      {phase === 3 && <div style={at(0, 330, { width: W, textAlign: "center", fontFamily: SANS, fontSize: 40, color: "#e9e9e9" })}>{typed(p.would, 0)}</div>}
      {/* pixel glitches: white blocks and stars blinking in */}
      {[0, 1, 2, 3, 4].map((i) =>
        phase === 0 && glitch(i) ? <div key={i} style={at(120 + ((i * 197) % 760), 60 + ((i * 131) % 420), { width: 40 + (i % 3) * 20, height: 40 + (i % 2) * 20, background: "#fff", clipPath: i % 2 ? "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)" : undefined })} /> : null,
      )}
    </div>
  );
}

export default function QuadGrid({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  // the four quarters cut together, on one 4.37 s loop (measured)
  const lt = t % LOOP;
  const cells = [<Peri key="0" lt={lt} p={p} />, <Instant key="1" lt={lt} p={p} a={a} />, <Peach key="2" lt={lt} p={p} a={a} />, <Terminal key="3" lt={lt} p={p} />];
  return (
    <Stage background="#000" style={{ fontFamily: SANS, color: "#111" }}>
      <div data-film="" style={fill}>
        {cells.map((c, i) => (
          <div key={i} style={at((i % 2) * W, Math.floor(i / 2) * H, { width: W, height: H, overflow: "hidden" })}>
            {c}
          </div>
        ))}
      </div>
    </Stage>
  );
}

