// Macro glide: an editor laid flat in the dark, filmed with a macro lens. Replicated from a timeline editor's film
// (a 12.35 s loop), beat by beat: the wide shot as the clips grow onto their tracks (0.36 s), the playhead sets off
// (1.95) and the panel's edge lights (2.35); a macro pan along the timeline (4.35); the play button in close-up, lit
// (7.9), its light rising, pressed into pause (9.38), a halo opening round it as the playhead runs.
// The editor is drawn once (baked) and only the camera moves it; your own app can stand in for it (a screen slot).
import type { CSSProperties, ReactNode } from "react";
import { Baked, Cursor, Slot, Stage, alpha, at, fill, hexMix, inOut, lerp, out, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 12.35;
const T = { grow: 0.36, head: 1.95, glow: 2.35, macro: 4.35, button: 7.55, lit: 7.68, press: 9.38 };
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const SEC = 110; // a second of timeline, in the panel's pixels
const X0 = 800; // where 0:00 is
const ROW0 = 120; // where the layers begin
const ROW = 76;
const PW = 1760;
const PH = 720;
/** the clips' rows */
const CY = [200, 354, 431, 508];
/** the transport's buttons */
const TX = { first: 1000, back: 1066, fwd: 1198, last: 1264, loop: 1340 };
const LENS = 4000;
const split = (s: string) => s.split("|").map((x) => x.trim());

/** where the playhead is (seconds of the edit) at t: off, then running; parked at 1.7 for the macro; running from the press */
const head = (t: number) => (t < T.head ? 0 : t < T.macro ? Math.min(1.7, (t - T.head) * 0.73) : t < T.press ? 1.7 : 1.7 + (t - T.press) * 0.78);
const clock = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
const stripes = (c: string) => `repeating-linear-gradient(-45deg, ${c} 0 14px, ${hexMix(c, "#ffffff", 0.22)} 14px 28px)`;

/* ---------------- the panel, drawn once ---------------- */

const Clip = ({ x, w, y, h = 56, bg, ink = "#151515", children, style }: { x: number; w: number; y: number; h?: number; bg: string; ink?: string; children?: ReactNode; style?: CSSProperties }) => (
  <div style={at(x, y, { width: w, height: h, borderRadius: 14, background: bg, color: ink, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", boxSizing: "border-box", fontFamily: SANS, fontSize: 30, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", ...style })}>{children}</div>
);
const Diamond = ({ x, y, c = "#f6c445" }: { x: number; y: number; c?: string }) => <div style={at(x - 9, y - 9, { width: 18, height: 18, background: c, transform: "rotate(45deg)", borderRadius: 3, boxShadow: "0 0 0 2px rgba(0,0,0,.4)" })} />;
const Btn = ({ x, d }: { x: number; d: string }) => (
  <svg width="44" height="44" viewBox="0 0 24 24" style={at(x, 24)}>
    <path d={d} fill="#e9ebf0" />
  </svg>
);

/** a line icon, small */
const Ico = ({ d, size = 30, color = "#7b8090" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
    <path d={d} />
  </svg>
);
const I = {
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  pipette: "M19 5l-2-2-4 4-1-1-2 2 1 1-7 7v3h3l7-7 1 1 2-2-1-1z",
  tag: "M3 12V4h8l9 9-8 8z",
  section: "M4 6v12M20 6v12M4 12h16",
};
/** the keyframe controls at a row's end: back, the key, on; then a dot */
const Keys = ({ x, y, dim = false }: { x: number; y: number; dim?: boolean }) => (
  <div style={at(x, y, { display: "flex", alignItems: "center", gap: 12, color: "#7b8090", fontSize: 22, opacity: dim ? 0.55 : 1 })}>
    {dim && <span style={{ fontFamily: MONO, marginRight: 8 }}>0.62</span>}
    <span>‹◆</span>
    <span style={{ width: 18, height: 18, border: "3px solid #f6c445", transform: "rotate(45deg)", borderRadius: 3 }} />
    <span>◆›</span>
    {!dim && <span style={{ marginLeft: 18, width: 22, height: 22, borderRadius: 99, border: "2.5px solid #4b4f5c" }} />}
  </div>
);
const RowIcons = ({ y, swatch }: { y: number; swatch?: string }) => (
  <div style={at(36, y, { display: "flex", alignItems: "center", gap: 28 })}>
    <Ico d={I.lock} />
    <Ico d={I.eye} />
    {swatch ? <span style={{ width: 40, height: 40, borderRadius: 10, background: swatch }} /> : <Ico d={I.pipette} />}
    <Ico d={I.tag} />
  </div>
);

/** the panel without what moves on it: the layers on the left (as the reference has them), the transport, the ruler, the sections */
function PanelBase({ p, a }: { p: P; a: string }) {
  const tracks = split(p.tracks);
  const sections = split(p.sections);
  const row = (i: number) => ROW0 + i * ROW;
  return (
    <div style={{ position: "relative", width: PW, height: PH, borderRadius: 34, background: "#0c0d10", boxShadow: "0 0 0 2px #1f2127", fontFamily: SANS, color: "#e6e8ee", overflow: "hidden" }}>
      {/* tools, Add, Name */}
      <div style={at(30, 26, { display: "flex", gap: 10, alignItems: "center", padding: 6, borderRadius: 18, background: "#15171c" })}>
        <span style={{ width: 62, height: 56, borderRadius: 13, background: alpha(a, 0.3), boxShadow: `inset 0 0 0 2px ${alpha(a, 0.6)}`, display: "grid", placeItems: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24">
            <path d="M5 3l13 8-6 1.5L9 19z" fill={hexMix(a, "#ffffff", 0.5)} />
          </svg>
        </span>
        <span style={{ width: 56, height: 56, display: "grid", placeItems: "center", fontSize: 28, color: "#cfd3dc" }}>✂</span>
      </div>
      <div style={at(200, 26, { height: 68, padding: "0 26px", borderRadius: 18, background: "#15171c", display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 700 })}>+ Add ⌄</div>
      <div style={at(430, 52, { fontSize: 36, color: "#9aa0ab", fontWeight: 500 })}>Name</div>
      {/* the layers */}
      <RowIcons y={row(0) + 12} />
      <Keys x={520} y={row(0) + 18} />
      <div style={at(110, row(1) + 10, { display: "flex", alignItems: "center", gap: 18, fontSize: 42, fontWeight: 500 })}>
        <Ico d={I.section} color="#38bdf8" size={34} />
        {tracks[0]}
      </div>
      <div style={at(116, row(2) + 14, { width: 66, height: 66, borderRadius: 16, background: "#3a2030", boxShadow: "inset 0 0 0 2px #6b3a55", display: "grid", placeItems: "center", fontSize: 34, color: "#f472d0" })}>✺</div>
      <div style={at(212, row(2) + 4, { fontSize: 42, fontWeight: 500 })}>{tracks[1]}</div>
      <Keys x={500} y={row(2) + 12} dim />
      <div style={at(150, row(2) + 72, { width: 40, height: 40, borderLeft: "2px solid #3a3d47", borderBottom: "2px solid #3a3d47", borderBottomLeftRadius: 10 })} />
      <div style={at(212, row(3) + 2, { fontSize: 36, color: "#8a8f9c" })}>{tracks[2]}</div>
      <RowIcons y={row(4) + 10} swatch="#fcc95b" />
      <div style={at(300, row(4) + 2, { display: "flex", alignItems: "center", gap: 18, fontSize: 42, fontWeight: 500 })}>
        <span style={{ fontFamily: "Georgia, serif", fontSize: 40, color: "#fcc95b" }}>T</span>
        {tracks[3]}
      </div>
      <Keys x={560} y={row(4) + 8} />
      <RowIcons y={row(5) + 10} swatch="#f9a8e8" />
      <div style={at(300, row(5) + 2, { display: "flex", alignItems: "center", gap: 18, fontSize: 42, fontWeight: 500 })}>
        <span style={{ fontSize: 34, color: "#e563d6" }}>✸</span>
        {tracks[4]}
      </div>
      <Keys x={560} y={row(5) + 8} />
      <div style={at(36, row(6) + 14, { display: "flex", alignItems: "center", gap: 24, fontSize: 42, fontWeight: 500 })}>
        <span style={{ color: "#7b8090", fontSize: 28 }}>›</span>
        <span style={{ width: 62, height: 62, borderRadius: 16, background: "#173a28", boxShadow: "inset 0 0 0 2px #1f6b44", display: "grid", placeItems: "center", color: "#3ddc84", fontSize: 30 }}>♫</span>
        {tracks[5]}
      </div>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} style={at(0, row(i) - 2, { width: X0 - 20, height: 1, background: "#17191e" })} />
      ))}
      <div style={at(X0 - 20, 100, { width: 2, height: PH, background: "#1c1e24" })} />
      {/* the transport */}
      <Btn x={TX.first} d="M5 5h2.5v14H5zM19 5v14L8.5 12z" />
      <Btn x={TX.back} d="M17 5v14L8 12zM5 5h2v14H5z" />
      <div style={at(BTN.x - 8, BTN.y - 6, { width: BTN.w + 16, height: BTN.h + 14, borderRadius: 22, background: "#16181d", boxShadow: "inset 0 2px 6px rgba(0,0,0,.6)" })} />
      <Btn x={TX.fwd} d="M7 5v14l10.5-7zM17 5h2v14h-2z" />
      <Btn x={TX.last} d="M5 5v14l11-7zM17 5h2.5v14H17z" />
      <div style={at(TX.loop, 20, { width: 76, height: 52, borderRadius: 14, background: a, display: "grid", placeItems: "center" })}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 9a4 4 0 0 1 4-4h8m0 0-3-3m3 3-3 3M19 15a4 4 0 0 1-4 4H7m0 0 3 3m-3-3 3-3" />
        </svg>
      </div>
      <div style={at(TX.loop + 110, 30, { fontFamily: MONO, fontSize: 32, fontWeight: 700, color: "#9aa0ab" })}>0:05.8</div>
      {/* the ruler and the sections */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((s) => (
        <div key={s} style={at(X0 + s * SEC - 34, 96, { fontFamily: MONO, fontSize: 26, color: "#8a8f9c" })}>{`0:0${s}`}</div>
      ))}
      {Array.from({ length: 36 }, (_, i) => (
        <div key={i} style={at(X0 + i * (SEC / 5), i % 5 ? 132 : 128, { width: 2, height: i % 5 ? 8 : 12, background: "#3a3d47" })} />
      ))}
      <Clip x={X0} w={SEC - 6} y={150} bg="#11294d" ink="#7fb4ff">
        {sections[0]}
      </Clip>
      <Clip x={X0 + SEC} w={SEC - 6} y={126} h={34} bg="#3b82f6" ink="#dbeafe" style={{ fontSize: 20, borderRadius: 9, fontFamily: MONO }}>
        {sections[1]}
      </Clip>
      <Clip x={X0 + 2.1 * SEC} w={1.4 * SEC} y={150} bg="#0f3b3a" ink="#5eead4">
        ⋈ {sections[2]}
      </Clip>
      <Clip x={X0 + 3.55 * SEC} w={1.1 * SEC} y={126} h={34} bg="#1bc768" ink="#0b2a17" style={{ fontSize: 20, borderRadius: 9, fontFamily: MONO }}>
        {sections[3]}
      </Clip>
      <Clip x={X0 + 4.7 * SEC} w={1.6 * SEC} y={150} bg="#2b1d5c" ink="#c4b5fd">
        ⋈ {sections[4]}
      </Clip>
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <div key={s} style={at(X0 + s * SEC, 140, { width: 1, height: PH - 140, background: "rgba(255,255,255,.05)" })} />
      ))}
    </div>
  );
}

/** the four clips on their tracks: [x, y, w, h, the clip] — each drawn once and grown onto its track */
function clipsOf(p: P): [number, number, number, number, ReactNode][] {
  const clips = split(p.clips);
  const end = PW - 30;
  const from = [1.5, 2.7, 1.5, 1.8].map((s) => X0 + s * SEC);
  return [
    [
      from[0],
      CY[0],
      end - from[0],
      120,
      <>
        <Clip x={0} w={end - from[0]} y={0} bg={stripes("#f472d0")}>
          ✺ {clips[0]}
        </Clip>
        <div style={at(0, 95, { width: end - from[0], height: 3, background: "#f472d0", opacity: 0.7 })} />
        {[0, 1.3, 2.6, 3.9].map((s) => (
          <Diamond key={s} x={s * SEC + 10} y={96} />
        ))}
      </>,
    ],
    [
      from[1],
      CY[1],
      end - from[1],
      60,
      <Clip x={0} w={end - from[1]} y={0} bg="#fcc95b">
        <span style={{ fontFamily: "Georgia, serif" }}>T</span> {clips[1]}
      </Clip>,
    ],
    [
      from[2],
      CY[2],
      end - from[2],
      60,
      <Clip x={0} w={end - from[2]} y={0} bg={stripes("#e563d6")}>
        ✸ {clips[2]}
      </Clip>,
    ],
    [
      from[3],
      CY[3],
      end - from[3],
      60,
      <Clip x={0} w={end - from[3]} y={0} bg="linear-gradient(90deg, #1f7a45, #3ddc84)" ink="#062712">
        ♫ {clips[3]}
        <svg width="900" height="40" viewBox="0 0 900 40" style={{ marginLeft: 20, opacity: 0.6 }}>
          {Array.from({ length: 90 }, (_, i) => {
            const h = 6 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.4)) * 30;
            return <rect key={i} x={i * 10} y={20 - h / 2} width="5" height={h} rx="2" fill="#062712" />;
          })}
        </svg>
      </Clip>,
    ],
  ];
}
/** when each clip starts growing onto its track, and how long it takes (measured) */
const GROW = [
  [T.grow, 0.75],
  [0.5, 0.7],
  [0.7, 0.7],
  [0.83, 0.6],
];

/** the play button, three ways (grey; lit; lit and paused), drawn once each at the close-up's scale */
const BTN = { x: 1089, y: 22, w: 86, h: 48 };
function PlayButton({ a, state }: { a: string; state: 0 | 1 | 2 }) {
  const lit = state > 0;
  return (
    <div
      style={at(40, 40, {
        width: BTN.w,
        height: BTN.h,
        borderRadius: 14,
        background: lit ? `linear-gradient(160deg, ${hexMix(a, "#ffffff", 0.5)}, ${a} 52%, ${hexMix(a, "#3a1fd1", 0.45)})` : "linear-gradient(160deg, #4a4d55, #34363c)",
        boxShadow: lit ? `inset 0 2px 0 rgba(255,255,255,.65), inset 0 -3px 6px ${alpha(hexMix(a, "#000000", 0.4), 0.6)}, 0 8px 0 ${hexMix(a, "#0a1440", 0.55)}, 0 0 34px ${alpha(a, 0.75)}` : "inset 0 1px 0 rgba(255,255,255,.18), 0 8px 0 #1c1d22, 0 10px 20px rgba(0,0,0,.6)",
        display: "grid",
        placeItems: "center",
      })}
    >
      {state === 2 ? (
        <svg width="28" height="28" viewBox="0 0 24 24">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24">
          <path d="M7 4v16l13-8z" fill="#fff" />
        </svg>
      )}
    </div>
  );
}

/* ---------------- the camera ---------------- */

/** [t, focus x, focus y, scale, tilt back, turn] per shot; cuts between shots, a steady drift within each */
const SHOTS: { from: number; to: number; a: number[]; b: number[] }[] = [
  { from: 0, to: T.macro, a: [510, 535, 1.45, 52, -29], b: [535, 525, 1.5, 52, -29] },
  { from: T.macro, to: T.button, a: [957, 222, 2.99, 43, -19], b: [1290, 196, 3.1, 43, -19] },
  { from: T.button, to: DUR, a: [1131, 47, 6.06, 62.8, -20.7], b: [1135, 47, 6.15, 62.8, -20.7] },
];
/** the CSS transform from the panel's pixels to the frame, and a point's place on the frame (for the light and the cursor) */
function camera(t: number) {
  const shot = SHOTS.find((s) => t < s.to) ?? SHOTS[SHOTS.length - 1];
  const k = seg(t, shot.from, shot.to);
  const [fx, fy, s, rx, rz] = shot.a.map((v, i) => lerp(v, shot.b[i], k));
  const css = `translate3d(960px, 540px, 0) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s}) translate3d(${-fx}px, ${-fy}px, 0)`;
  const project = (px: number, py: number) => {
    const [x, y] = [(px - fx) * s, (py - fy) * s];
    const r = (rz * Math.PI) / 180;
    const [x2, y2] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    const q = (rx * Math.PI) / 180;
    const [y3, z3] = [y2 * Math.cos(q), y2 * Math.sin(q)];
    const k2 = LENS / (LENS - z3);
    return { x: 960 + x2 * k2, y: 540 + y3 * k2, scale: s * k2 };
  };
  return { css, project, macro: t >= T.macro && t < T.button, button: t >= T.button };
}

export default function MacroGlide({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  const cam = camera(t);
  const place = (x: number, y: number, more: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `${cam.css} translate3d(${x}px, ${y}px, 0)`, ...more });
  const deps = [JSON.stringify(p)];
  const own = /^(image|video|anim):/.test(p.screen);
  const lit = seg(t, T.glow, T.glow + 0.45) * (t < T.macro ? 1 : 0);
  const ph = X0 + head(t) * SEC;
  // the button: grey, then lit as the close-up begins; pressed into pause
  const btnLit = t < T.button ? 0 : seg(t, T.lit, T.lit + 0.2);
  const paused = t >= T.press + 0.05;
  const press = seg(t, T.press - 0.08, T.press) * (1 - seg(t, T.press + 0.05, T.press + 0.2));
  const halo = seg(t, T.press + 0.15, T.press + 1.2);
  const ring = seg(t, T.press + 0.1, T.press + 0.25) * (1 - seg(t, T.press + 0.3, T.press + 0.6));
  const bc = cam.project(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2);
  const beams = cam.button ? seg(t, T.lit + 0.05, T.lit + 0.4) : 0;
  return (
    <Stage background="#000" style={{ fontFamily: SANS }}>
      <div data-film="" style={{ ...fill, background: "radial-gradient(ellipse at 50% 40%, #0b0d12, #000 70%)", perspective: LENS, perspectiveOrigin: "960px 540px", overflow: "hidden" }}>
        {/* the panel's lit edge (under it) */}
        <div style={place(-120, -120, { opacity: lit })}>
          <Baked w={PW + 240} h={PH + 240} scale={0.5} deps={[a]}>
            <div style={at(120, 120, { width: PW, height: PH, borderRadius: 34, boxShadow: `0 0 0 3px ${alpha(a, 0.95)}, 0 0 40px 4px ${alpha(a, 0.6)}, 0 0 110px 10px ${alpha(a, 0.3)}` })} />
          </Baked>
        </div>
        <div style={place(0, 0)}>
          {own ? (
            <div style={{ width: PW, height: PH, borderRadius: 34, overflow: "hidden", background: "#0c0d10" }}>
              <Slot pick="screen" src={p.screen} t={t} w={PW} h={PH} />
            </div>
          ) : (
            <Baked pick="screen" w={PW} h={PH} scale={1.5} deps={deps}>
              <PanelBase p={p} a={a} />
            </Baked>
          )}
        </div>
        {!own &&
          clipsOf(p).map(([x, y, w, h, body], i) => {
            const [from, dur] = GROW[i];
            const k = out(seg(t, from, from + dur));
            return (
              <div key={i} style={place(x, y, { clipPath: `inset(0 ${(1 - k) * 100}% 0 0)`, opacity: k > 0 ? 1 : 0 })}>
                <Baked w={w} h={h} scale={1.5} deps={deps}>
                  {body}
                </Baked>
              </div>
            );
          })}
        {!own && (
          <>
            {/* the time, the play button, the playhead: what changes on the panel */}
            <div style={place(X0 + 6, 18, { fontFamily: MONO, fontSize: 46, fontWeight: 700, color: "#f2f3f6", letterSpacing: "0.02em" })}>{clock(head(t))}</div>
            {([0, 1, 2] as const).map((st) => {
              const o = st === 0 ? 1 - btnLit : st === 1 ? btnLit * (paused ? 0 : 1) : paused ? 1 : 0;
              return (
                <div key={st} style={place(BTN.x - 40, BTN.y - 40, { opacity: o, transform: `${cam.css} translate3d(${BTN.x - 40}px, ${BTN.y - 40}px, 0) translate3d(${BTN.w / 2 + 40}px, ${BTN.h / 2 + 40}px, 0) scale(${1 - 0.06 * press}) translate3d(${-BTN.w / 2 - 40}px, ${-BTN.h / 2 - 40}px, 0)` })}>
                  <Baked w={BTN.w + 80} h={BTN.h + 80} scale={6.5} deps={[a, st]}>
                    <PlayButton a={a} state={st} />
                  </Baked>
                </div>
              );
            })}
            {/* the white ring as it's pressed, and the halo that opens after */}
            <div style={place(BTN.x - 10, BTN.y - 8, { width: BTN.w + 20, height: BTN.h + 16, borderRadius: 24, boxShadow: "0 0 0 3px rgba(255,255,255,.9)", opacity: ring })} />
            <div style={place(BTN.x + BTN.w / 2, BTN.y + BTN.h / 2, { opacity: halo > 0 ? 0.9 * (1 - 0.35 * halo) : 0 })}>
              <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) scale(${lerp(0.8, 1.05, out(halo))})`, width: 150, height: 88, borderRadius: 34, background: `radial-gradient(closest-side, ${alpha(hexMix(a, "#7fe3ff", 0.5), 0.0)} 55%, ${alpha(hexMix(a, "#7fe3ff", 0.5), 0.35)} 80%, ${alpha(hexMix(a, "#7fe3ff", 0.5), 0.0)})`, boxShadow: `inset 0 0 0 2px ${alpha(hexMix(a, "#7fe3ff", 0.4), 0.55)}` }} />
            </div>
            {t >= T.head && (
              <>
                <div style={place(ph - 2, 126, { width: 4, height: PH - 140, background: "#ff4b3a", boxShadow: "0 0 12px rgba(255,75,58,.6)" })} />
                <div style={place(ph - 24, 96, { width: 48, height: 40, background: "#ff4b3a", clipPath: "polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)", borderRadius: 6 })} />
              </>
            )}
          </>
        )}
        {/* shallow focus: the frame blurs away from what the lens is on */}
        <div style={{ ...fill, backdropFilter: `blur(${cam.macro ? 7 : cam.button ? 5 : 2.5}px)`, WebkitBackdropFilter: `blur(${cam.macro ? 7 : cam.button ? 5 : 2.5}px)`, WebkitMaskImage: `radial-gradient(ellipse ${cam.macro ? "48% 36%" : "60% 50%"} at 50% 45%, transparent 40%, #000 100%)`, maskImage: `radial-gradient(ellipse ${cam.macro ? "48% 36%" : "60% 50%"} at 50% 45%, transparent 40%, #000 100%)` }} />
        {/* light rising from the lit button */}
        {/* (always there, drawn once: it only shows when lit) */}
        {
          <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 100%", transform: `translate3d(${bc.x - 120}px, ${bc.y - 470}px, 0) scale(${bc.scale / 3.1})`, opacity: beams, mixBlendMode: "screen" }}>
            <Baked w={240} h={470} scale={1} deps={[a]}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} style={at(30 + i * 27, 30, { width: 26, height: 440, transformOrigin: "50% 100%", transform: `rotate(${(i - 3) * 2.5}deg)`, background: `linear-gradient(0deg, ${alpha(a, 0.75)}, ${alpha(hexMix(a, "#7fe3ff", 0.4), 0.22)} 50%, transparent 92%)`, filter: "blur(12px)" })} />
              ))}
            </Baked>
          </div>
        }
        {t >= 8.9 && t < 10.2 && <Cursor x={bc.x - 30 + lerp(60, 0, inOut(seg(t, 8.9, 9.3)))} y={bc.y - 120 + lerp(40, 0, inOut(seg(t, 8.9, 9.3)))} press={press} size={0.7} />}
      </div>
    </Stage>
  );
}
