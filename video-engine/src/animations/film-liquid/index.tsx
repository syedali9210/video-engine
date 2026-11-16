// Liquid prompt: a launch film for an AI product, replicated from the Runner film (a 12.55 s loop), beat by beat: a
// dark sphere pulled into liquid (0.55 s) that splits (1.1) in a flash of light (1.33) and rings up in three pairs
// (1.55), turns and collapses (2.75) into a face (2.92) that becomes a speech bubble (3.55); "Ask about anything",
// huge, typed as the camera follows (3.95), drawn back (5.85) with ideas wheeling past (6.15); one picked (7.3) and
// typed on as the prompt (7.55), the input it becomes (8.58), its send pressed (10.32), the agent thinking (11.06)
// and starting to answer (12.15). Every word is drawn once (baked) and revealed; the camera only moves it.
import type { CSSProperties, ReactNode } from "react";
import { Baked, Slot, Stage, alpha, at, back, clamp, fill, glide, hexMix, inOut, lerp, measure, out, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 12.55;
const T = { stretch: 0.55, split: 1.1, flash: 1.33, ring: 1.55, collapse: 2.75, face: 2.92, bubble: 3.55, ask: 3.95, type: 4.72, out: 5.85, ideas: 6.15, pick: 7.3, bar: 7.55, box: 8.58, dive: 9.45, press: 10.32, runner: 11.06, think: 11.6, reply: 12.15, end: 12.45 };
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const GROUND = "#141414";
const INK = "#d9d9d9";
const split = (s: string) => s.split("|").map((x) => x.trim());

/* ---------------- the liquid ---------------- */

type Key = [number, ...number[]];
/** the six balls: one sphere, pulled apart, split, three pairs in a ring (turning), collapsed to a dot */
const BALLS: Key[][] = [
  [[0, 954, 540, 360], [T.stretch, 940, 530, 375], [0.9, 915, 510, 340], [1.15, 820, 370, 140], [1.42, 840, 330, 110]],
  [[0, 954, 540, 300], [T.stretch, 800, 640, 280], [0.9, 450, 800, 300], [1.15, 660, 590, 140], [1.42, 690, 570, 115]],
  [[0, 954, 540, 280], [T.stretch, 900, 600, 250], [0.9, 700, 850, 230], [1.15, 840, 945, 120], [1.42, 810, 810, 125]],
  [[0, 954, 540, 260], [T.stretch, 960, 580, 240], [0.9, 800, 900, 200], [1.15, 1000, 960, 120], [1.42, 1065, 825, 125]],
  [[0, 954, 540, 260], [T.stretch, 960, 520, 240], [0.9, 950, 560, 230], [1.15, 1296, 720, 70], [1.42, 1230, 600, 115]],
  [[0, 954, 540, 260], [T.stretch, 960, 520, 240], [0.9, 940, 500, 260], [1.15, 1296, 720, 70], [1.42, 1140, 405, 110]],
];
/** the ring: three pairs round the middle, turning a little and drawing in */
const ringAt = (k: number, t: number) => {
  const turn = 32 * inOut(seg(t, 1.8, 2.6));
  const pair = [-150, 90, -30][Math.floor(k / 2)];
  const ang = ((pair + (k % 2 ? 28 : -28) + turn) * Math.PI) / 180;
  const R = lerp(242, 205, inOut(seg(t, 1.9, 2.6)));
  return [960 + Math.cos(ang) * R, 540 + Math.sin(ang) * R, lerp(100, 90, seg(t, 1.9, 2.6))];
};
function ball(k: number, t: number) {
  if (t < 1.42) return glide(t, BALLS[k]);
  const ring = ringAt(k, t);
  if (t < 1.8) return BALLS[k][4].slice(1).map((v, i) => lerp(v, ring[i], inOut(seg(t, 1.42, 1.8))));
  if (t < T.collapse - 0.2) return ring;
  const k2 = inOut(seg(t, T.collapse - 0.2, T.face - 0.05));
  return [lerp(ring[0], 960, k2), lerp(ring[1], 540, k2), lerp(ring[2], 18, k2)];
}

function Liquid({ t }: { t: number }) {
  const bs = BALLS.map((_, k) => ball(k, t));
  // the light: dull on the sphere, from the lower right as it's pulled, from above on the ring
  const lit = seg(t, 0.4, 1.0);
  const top = seg(t, 1.0, 1.4);
  const [x1, y1, x2, y2] = [lerp(lerp(600, 500, lit), 960, top), lerp(lerp(250, 300, lit), 250, top), lerp(lerp(1300, 1300, lit), 960, top), lerp(lerp(800, 760, lit), 860, top)];
  const c1 = hexMix(hexMix("#22292a", "#1d2525", lit), "#e2f6f4", top);
  const c2 = hexMix(hexMix("#4a5d5a", "#d4ecea", lit), "#27322f", top);
  const flash = seg(t, T.flash - 0.04, T.flash + 0.02) * (1 - seg(t, 1.5, 1.6));
  const glow = seg(t, 1.05, 1.15) * (1 - seg(t, 1.3, 1.4));
  const dot = seg(t, T.collapse, T.face);
  return (
    <div style={fill}>
      <div style={{ ...fill, opacity: flash, background: "linear-gradient(118deg, #d9e5ea 0%, #b9c6cb 40%, #8a979b 72%, #57626a 100%)" }} />
      {/* drawn at half size and doubled: the goo is a blur, it doesn't need the pixels */}
      <svg width={960} height={540} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: "scale(2)", filter: "blur(0.6px)" }}>
        <defs>
          <filter id="liq-goo" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="26" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 40 -18" />
          </filter>
          <linearGradient id="liq-shade" gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0" stopColor={c1} />
            <stop offset={lerp(0, 0.55, lit * (1 - top))} stopColor={hexMix(c1, c2, 0.15 * (1 - top))} />
            <stop offset="1" stopColor={c2} />
          </linearGradient>
          <mask id="liq-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <g filter="url(#liq-goo)">
              {bs.map(([x, y, r], k) => (
                <circle key={k} cx={x} cy={y} r={r} fill="#fff" />
              ))}
            </g>
          </mask>
          <radialGradient id="liq-hot">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.7" stopColor="#d9fbff" />
            <stop offset="1" stopColor="#bdf3f7" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#liq-shade)" mask="url(#liq-mask)" opacity={1 - dot * 0.4} />
        {glow > 0 && <circle cx={lerp(1330, 1296, seg(t, 1.05, 1.3))} cy={lerp(700, 720, seg(t, 1.05, 1.3))} r={118} fill="url(#liq-hot)" opacity={glow} />}
      </svg>
    </div>
  );
}

/* ---------------- the face, the bubble ---------------- */

const BUBBLE = "M22 14h56a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14H44L26 90V76h-4A14 14 0 0 1 8 62V28a14 14 0 0 1 14-14Z";
/** the chat bubble with two eyes: the product's face */
const Bubble = ({ s, color = INK, stroke = 7 }: { s: number; color?: string; stroke?: number }) => (
  <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block", flex: "none" }}>
    <path d={BUBBLE} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
    <rect x="33" y="35" width="9" height="16" rx="4.5" fill={color} />
    <rect x="56" y="35" width="9" height="16" rx="4.5" fill={color} />
  </svg>
);

function Face({ t }: { t: number }) {
  const pop = back(seg(t, T.face - 0.06, T.face + 0.2), 1.4);
  const shrink = lerp(1, 0.88, inOut(seg(t, 3.25, 3.45)));
  const morph = inOut(seg(t, T.bubble, T.bubble + 0.2));
  const s = 210 * pop * shrink;
  return (
    <div style={{ ...fill, opacity: 1 - seg(t, T.ask + 0.02, T.ask + 0.05) }}>
      {/* the face: a ring with two eyes */}
      <svg width={300} height={300} viewBox="-50 -50 100 100" style={{ position: "absolute", left: 810, top: 390, transform: `scale(${s / 210})`, opacity: 1 - morph }}>
        <circle r="44" fill="none" stroke={INK} strokeWidth="6.5" />
        <rect x="-15" y="-14" width="9" height="17" rx="4.5" fill={INK} />
        <rect x="6" y="-14" width="9" height="17" rx="4.5" fill={INK} />
      </svg>
      <div style={{ position: "absolute", left: 960 - 150, top: 560 - 150, transform: `scale(${lerp(0.75, 0.96, out(morph))})`, opacity: morph }}>
        <Bubble s={300} />
      </div>
    </div>
  );
}

/* ---------------- "Ask about anything", and the ideas ---------------- */

/** a world seen by a camera: what's at (cx, cy) in the middle of the frame, z times its size (moved, never re-laid) */
const Cam = ({ cx, cy, z, o = 1, children }: { cx: number; cy: number; z: number; o?: number; children: ReactNode }) => (
  <div style={{ position: "absolute", left: 0, top: 0, opacity: o, transformOrigin: "0 0", willChange: "transform", transform: `translate3d(${960 - cx * z}px, ${540 - cy * z}px, 0) scale(${z})` }}>{children}</div>
);
/** text drawn once, shown up to `w` of its width */
const Shown = ({ x, y, w, total, h, children, style }: { x: number; y: number; w: number; total: number; h: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={{ position: "absolute", left: x, top: y, width: total, height: h, clipPath: `inset(0 ${Math.max(0, total - w)}px 0 0)`, ...style }}>{children}</div>
);

const ASK = { font: 270, x: 320 };
/** an idea's icon: a small outline, the brands' in their colours */
function IdeaIcon({ i, s }: { i: number; s: number }) {
  const c = ["#9a9a9a", "#bdbdbd", "#3b82f6", "#22c55e", "#ea4335", "#9a9a9a", "#3b82f6", "#3de8e4"][i % 8];
  return <span style={{ width: s, height: s, borderRadius: s * 0.22, border: `${s * 0.09}px solid ${c}`, boxSizing: "border-box", flex: "none" }} />;
}

function AskScene({ t, p, a }: { t: number; p: P; a: string }) {
  const font = `500 ${ASK.font}px ${SANS}`;
  const [first, ...rest] = p.ask.split(" ");
  const restText = ` ${rest.join(" ")}`;
  const total = measure(p.ask, font);
  const firstW = measure(first, font);
  // typed: the first word slides in whole, the rest a letter at a time; the caret's place, smooth between letters
  const typedF = clamp((t - T.type) / 1.0) * restText.length;
  const n = Math.floor(typedF);
  const w = firstW + lerp(measure(restText.slice(0, n), font), measure(restText.slice(0, Math.min(restText.length, n + 1)), font), typedF - n);
  const caret = ASK.x + w;
  // the camera: on the bubble, then along with the caret (a little behind it), then back to see the ideas
  const follow = Math.max(453, caret - 875);
  const [cx, z] =
    t < T.out
      ? [t < 4.3 ? lerp(140, 453, inOut(seg(t, T.ask - 0.05, 4.3))) : t < T.type ? 453 - 94 * inOut(seg(t, 4.3, T.type)) : Math.max(359, follow), 0.96]
      : glide(t, [
          [T.out, ASK.x + total - 875, 0.96],
          [6.1, ASK.x + total - 717, 0.43],
          [6.5, ASK.x + total - 589, 0.32],
          [7.1, ASK.x + total - 589, 0.32],
          [7.5, ASK.x + total - 304, 0.317],
        ]);
  const slide = out(seg(t, T.ask, T.ask + 0.3));
  const ideas = split(p.ideas);
  const picked = ideas.length - 1;
  // the wheel of ideas: one in the middle, the others above and below, fainter and set in as on a drum
  const s = glide(t, [
    [T.ideas, 0],
    [6.6, 1.5],
    [7.1, picked - 1],
    [7.4, picked],
  ])[0];
  const pick = seg(t, T.pick, T.pick + 0.2);
  const LX = ASK.x + total + 270;
  const IF = 175;
  return (
    <Cam cx={cx} cy={0} z={z} o={1 - seg(t, T.bar + 0.05, T.bar + 0.2)}>
      <div style={{ position: "absolute", left: 0, top: -140, transform: `translateX(${(1 - slide) * -40}px)` }}>
        <Bubble s={280} stroke={7} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, opacity: 1 - pick * 0.6 }}>
        <Shown x={ASK.x + (1 - slide) * 420} y={-185} w={t < T.type ? firstW : w} total={total + 20} h={370} style={{ opacity: slide }}>
          <Baked w={total + 20} h={370} scale={1} deps={[p.ask]}>
            <div style={{ font, color: INK, letterSpacing: "-0.01em", lineHeight: "370px", whiteSpace: "nowrap" }}>{p.ask}</div>
          </Baked>
        </Shown>
      </div>
      {t >= T.ideas &&
        ideas.map((idea, i) => {
          const d = i - s;
          const ad = Math.abs(d);
          const shown = seg(t, T.ideas + i * 0.07, T.ideas + 0.12 + i * 0.07);
          const isPick = i === picked;
          const o = shown * clamp(1.3 - 0.55 * ad) * (isPick ? 1 : 1 - pick);
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: 0, opacity: o, transform: `translate3d(${LX + 90 * Math.pow(ad, 1.4)}px, ${d * 430 - IF * 0.7}px, 0) scale(${1 - 0.1 * Math.min(2, ad)})`, transformOrigin: "0 50%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 50, font: `400 ${IF}px ${SANS}`, color: isPick ? hexMix(INK, a, pick) : INK, whiteSpace: "nowrap", height: IF * 1.4 }}>
                {isPick ? (
                  <svg width={IF * 0.8} height={IF * 0.8} viewBox="0 0 24 24" fill="none" stroke={hexMix("#9a9a9a", a, pick)} strokeWidth="2" style={{ flex: "none" }}>
                    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
                  </svg>
                ) : (
                  <IdeaIcon i={i} s={IF * 0.7} />
                )}
                {idea}
              </div>
            </div>
          );
        })}
      {/* the caret, after the typing */}
      {t >= T.type && t < T.out && <div style={{ position: "absolute", left: caret + 14, top: -120, width: 14, height: 240, background: INK, opacity: Math.floor(t * 2.2) % 2 ? 0.2 : 1 }} />}
    </Cam>
  );
}

/* ---------------- the prompt, the input, the send ---------------- */

const PF = 64;
const BOX = { x: -70, y: -60, w: 2922, h: 533 };
const SEND = { x: BOX.x + BOX.w - 110, y: BOX.y + BOX.h - 90, r: 78 };

function PromptScene({ t, p, a }: { t: number; p: P; a: string }) {
  const font = `400 ${PF}px ${SANS}`;
  const ideas = split(p.ideas);
  const start = ideas[ideas.length - 1];
  const total = measure(p.prompt, font);
  // the picked idea is the prompt's beginning; the rest is typed on
  const typedF = clamp((t - 7.65) / (9.4 - 7.65)) * Math.max(0, p.prompt.length - start.length);
  const n = Math.floor(typedF) + start.length;
  const w = lerp(measure(p.prompt.slice(0, n), font), measure(p.prompt.slice(0, Math.min(p.prompt.length, n + 1)), font), typedF - Math.floor(typedF));
  const box = inOut(seg(t, T.box - 0.05, T.box + 0.15));
  // the camera: from where the idea was, back along the line as it's typed, out to the whole input, in to its send
  const [cx, cy, z] =
    t < T.box
      ? (() => {
          const [ax, az] = glide(t, [
            [T.bar, -216, 1],
            [7.85, 859, 0.66],
          ]);
          return [Math.max(ax, w - (1400 - 960) / 0.66), 0, az];
        })()
      : glide(t, [
          [T.box, w - (1400 - 960) / 0.66, 0, 0.62],
          [9.0, 1430, 224, 0.58],
          [T.dive, 1430, 224, 0.58],
          [9.9, 1951, 321, 0.77],
          [10.4, 2508, 390, 1.22],
          [T.runner, 2474, 393, 1.24],
        ]);
  const barW = w + 140;
  const lines = wrap(p.prompt, font, 2280);
  // in the input, the typing goes on line by line
  let left = n;
  const shownLines = lines.map((l) => {
    const k = Math.max(0, Math.min(l.length, left));
    left -= l.length + 1;
    return measure(l.slice(0, k), font);
  });
  const sendHot = seg(t, 9.0, 9.1) * (1 - seg(t, 9.2, 9.4));
  const glow = seg(t, 10.12, 10.3) * (1 - seg(t, 10.85, 11.05));
  const press = seg(t, T.press - 0.06, T.press) * (1 - seg(t, T.press + 0.08, T.press + 0.2));
  const sel = seg(t, T.bar, 7.65);
  return (
    <Cam cx={cx} cy={cy} z={z} o={seg(t, T.bar, T.bar + 0.1) * (1 - seg(t, T.runner - 0.04, T.runner))}>
      {/* the bar, growing into the input */}
      <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: lerp(barW, BOX.w, box), height: lerp(120, BOX.h, box), borderRadius: lerp(28, 46, box), background: "#1b1b1b", boxShadow: "inset 0 0 0 2px #262626", opacity: sel }} />
      {/* the line, cyan as it's typed */}
      <Shown x={0} y={-PF * 0.75} w={w} total={total + 20} h={PF * 1.6} style={{ opacity: 1 - box }}>
        <Baked w={total + 20} h={PF * 1.6} scale={1} deps={[p.prompt, a]}>
          <div style={{ font, color: a, lineHeight: `${PF * 1.6}px`, whiteSpace: "nowrap" }}>{p.prompt}</div>
        </Baked>
      </Shown>
      {t < T.box && <div style={{ position: "absolute", left: w + 6, top: -PF * 0.55, width: 4, height: PF * 1.1, background: a, opacity: Math.floor(t * 2.4) % 2 ? 0.3 : 1 }} />}
      {/* the input: the prompt in two lines, the model and the send */}
      <div style={{ position: "absolute", left: 0, top: 0, opacity: box }}>
        <div style={at(BOX.x, BOX.y)}>
          {lines.map((l, i) => (
            <Shown key={i} x={70} y={22 + i * PF * 1.5} w={shownLines[i]} total={BOX.w - 100} h={PF * 1.6}>
              <Baked w={BOX.w - 100} h={PF * 1.6} scale={1.25} deps={[l]}>
                <div style={{ font, color: "#e6e6e6", lineHeight: `${PF * 1.6}px`, whiteSpace: "nowrap" }}>{l}</div>
              </Baked>
            </Shown>
          ))}
          <Baked w={BOX.w} h={BOX.h} scale={1.25} deps={[p.prompt, p.name]}>
            <div style={{ position: "relative", width: BOX.w, height: BOX.h, fontFamily: SANS }}>
              <div style={at(70, BOX.h - 140, { font: `300 ${PF}px ${SANS}`, color: "#6f6f6f" })}>+</div>
              <div style={at(BOX.w - 540, BOX.h - 130, { display: "flex", alignItems: "center", gap: 20, font: `400 ${PF * 0.85}px ${SANS}`, color: "#cfcfcf" })}>
                <Flower s={PF * 0.8} />
                {p.name}
                <span style={{ fontSize: PF * 0.55, marginLeft: 6 }}>⌄</span>
              </div>
            </div>
          </Baked>
        </div>
      </div>
      {/* the send: lit when the prompt's in, glowing as it's pressed */}
      <div style={{ position: "absolute", left: SEND.x - 260, top: SEND.y - 260, width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(closest-side, ${alpha(a, 0.75)}, ${alpha(a, 0.28)} 45%, transparent)`, opacity: glow }} />
      <div style={{ position: "absolute", left: SEND.x - SEND.r, top: SEND.y - SEND.r, width: SEND.r * 2, height: SEND.r * 2, borderRadius: "50%", background: hexMix("#ffffff", a, Math.max(sendHot, glow * 0.85)), boxShadow: glow > 0 ? `0 0 ${60 * glow}px ${alpha(a, 0.9 * glow)}` : undefined, display: "grid", placeItems: "center", transform: `scale(${1 - 0.08 * press})`, opacity: box }}>
        <svg width={SEND.r} height={SEND.r} viewBox="0 0 24 24" fill="none" stroke="#151515" strokeWidth="2" strokeLinecap="round">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </div>
    </Cam>
  );
}
/** a line split to fit `max` wide */
function wrap(s: string, font: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, font) > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** the pointer: big and pale, as the reference draws it */
const Pointer = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <svg width={160 * s} height={210 * s} viewBox="0 0 16 21" style={{ position: "absolute", left: 0, top: 0, transform: `translate3d(${x}px, ${y}px, 0)`, filter: "drop-shadow(0 6px 10px rgba(0,0,0,.5))" }}>
    <path d="M8 0 16 21 8 17 0 21Z" fill="#e4e4e4" />
    <path d="M8 0 8 17 0 21Z" fill="#cfcfcf" />
  </svg>
);

/* ---------------- the agent ---------------- */

/** the mark: six small balls in pairs, a flower (turning while it thinks) */
const Flower = ({ s, color = "#e8e8e8", turn = 0 }: { s: number; color?: string; turn?: number }) => (
  <svg width={s} height={s} viewBox="-50 -50 100 100" style={{ display: "block", flex: "none" }}>
    {[0, 1, 2, 3, 4, 5].map((k) => {
      const ang = ((90 + Math.floor(k / 2) * 120 + (k % 2 ? 22 : -22) + turn) * Math.PI) / 180;
      return <circle key={k} cx={Math.cos(ang) * 28} cy={Math.sin(ang) * 28} r="15" fill={color} />;
    })}
  </svg>
);

function RunnerScene({ t, p }: { t: number; p: P }) {
  const up = inOut(seg(t, T.think - 0.05, T.think + 0.3));
  const small = inOut(seg(t, T.reply - 0.05, T.reply + 0.25));
  // the name: big, then a header over the thinking, then smaller over the answer
  const hx = lerp(lerp(390, 600, up), 390, small);
  const hy = lerp(lerp(519, 255, up), 246, small);
  const hz = lerp(lerp(1, 0.8, up), 0.58, small);
  const turn = 120 * inOut(seg(t, 11.25, 11.6)) + (t > T.think ? (t - T.think) * 90 : 0);
  const thinking = seg(t, T.think + 0.1, T.think + 0.3) * (1 - seg(t, T.reply - 0.05, T.reply + 0.05));
  const reply = p.reply;
  const typed = reply.slice(0, Math.max(0, Math.floor((t - 12.08) / 0.0105)));
  const dots = ".".repeat(1 + (Math.floor(t * 4) % 3));
  const sheen = ((t - T.think) * 1.2) % 1;
  return (
    <div style={{ ...fill, opacity: seg(t, T.runner, T.runner + 0.06) * (1 - seg(t, T.end, DUR)) }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 50%", transform: `translate3d(${hx}px, ${hy}px, 0) scale(${hz})`, willChange: "transform" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 46, transform: "translateY(-50%)", font: `400 140px ${SANS}`, color: "#e8e8e8", whiteSpace: "nowrap" }}>
          <Slot pick="logo" src={p.logo} w={150} h={150} fit="contain">
            <Flower s={150} turn={turn} />
          </Slot>
          {p.name}
        </div>
      </div>
      <div style={{ position: "absolute", left: 480, top: 531, transform: "translateY(-50%)", font: `400 100px ${SANS}`, whiteSpace: "nowrap", opacity: thinking, backgroundImage: `linear-gradient(100deg, #5c5c5c ${sheen * 140 - 40}%, #d8d8d8 ${sheen * 140 - 20}%, #5c5c5c ${sheen * 140}%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        {p.thinking}
        {dots}
      </div>
      <div style={{ position: "absolute", left: 375, top: 474, transform: "translateY(-50%)", font: `400 80px ${SANS}`, color: "#f0f0f0", whiteSpace: "nowrap", opacity: t >= T.reply ? 1 : 0 }}>{typed}</div>
    </div>
  );
}

export default function LiquidPrompt({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  // the cursor that presses send: in from the lower right, pressing, then away
  const [px, py] = glide(t, [
    [10.0, 1500, 980],
    [T.press - 0.02, 1185, 555],
    [10.8, 1195, 560],
    [11.05, 1350, 690],
  ]);
  return (
    <Stage background={GROUND} style={{ fontFamily: SANS }}>
      <div data-film="" style={{ ...fill, background: GROUND }}>
        {t < T.face + 0.1 && <Liquid t={t} />}
        {t >= T.face - 0.1 && t < T.ask + 0.1 && <Face t={t} />}
        {/* the scenes stay mounted (their words are drawn once, at the start) and show when it's their turn */}
        <div style={{ ...fill, visibility: t >= T.ask - 0.05 && t < T.bar + 0.25 ? "visible" : "hidden" }}>
          <AskScene t={Math.max(t, T.ask - 0.05)} p={p} a={a} />
        </div>
        <div style={{ ...fill, visibility: t >= T.bar && t < T.runner ? "visible" : "hidden" }}>
          <PromptScene t={Math.max(t, T.bar)} p={p} a={a} />
        </div>
        {t >= 10.0 && t < 11.1 && <Pointer x={px - 80} y={py} />}
        <div style={{ ...fill, visibility: t >= T.runner ? "visible" : "hidden" }}>
          <RunnerScene t={Math.max(t, T.runner)} p={p} />
        </div>
        {/* the loop: out to black, the sphere back in */}
        <div style={{ ...fill, background: GROUND, opacity: Math.max(seg(t, T.end, DUR - 0.02), 1 - seg(t, 0, 0.12)), pointerEvents: "none" }} />
      </div>
    </Stage>
  );
}
