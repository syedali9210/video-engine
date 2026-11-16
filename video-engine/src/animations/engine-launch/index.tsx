// Animation Engine — its own launch film. 57 s on a 120 BPM grid (0.5 s beats, 2 s bars), drawn from one clock: every
// frame is a pure function of t, so the engine's stepped export renders it exactly, frame by frame.
//
// The story: you built an animation; making its launch video is a pile of windows (record, crop, mock up, keyframe,
// export, again). Everything collapses into a dot, and the dot draws the engine's mark: an easing curve. Then the
// engine at work, made by the engine itself: your animations live in the real device frames, the Studio's own
// three.js phone under a moving camera, the Kit's title animations (the same code the Studio plays), the templates by
// kind and the canvas, both real screenshots. Then the MCP: one sentence to Claude, the engine makes the film. Then the
// lab: it studies films at night and learns from what you approve and reject. The end card is the command that
// connects it.
//
// Facts on screen are the engine's own: its device sizes, its template kinds, its MCP tools and their progress
// messages, the lab's own notice, and the one measured render (a 15 s film, 450 frames, made in 76 s). The "launch
// video the usual way" at the start is a dramatisation, not a claim about any tool, so it names none.
import { createPortal } from "react-dom";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Caret, Cursor, Phone, Stage, Words, acc, back, blink, clamp, expo, fx, inOut, lerp, out, seg, typed, typingEnd, useClock, useFonts, visible } from "../_film/kit";
import { byId } from "../../registry";
import { pieces, playPieces } from "../../studio/Kit";
import { TEXT_ANIMS, type TextAnim } from "../../studio/textanim";
import { StudioScene } from "../../studio/scene";
import { FINISHES } from "../../studio/finishes";
import { angle, mix, type Pose } from "../../studio/poses";
import shotTemplates from "./shots/templates.webp";
import shotCanvas from "./shots/canvas.webp";
import "./film.css";

export const DURATION = 57;

const AZURE = "#1f95ff";
const INK = "#f4f4f5";
const anim = (id: string) => TEXT_ANIMS.find((a) => a.id === id)!.anim;
/** a quiet drift, so no shot ever holds dead still */
const drift = (t: number, a: number, b: number, from = 1, to = 1.04) => lerp(from, to, seg(t, a, b));

/* ---------------- the grounds: black, the desktop's grey, obsidian, paper, the night ---------------- */

type Key = [number, string];
const GROUND: Key[] = [
  [0, "#050506"],
  [4.5, "#050506"],
  [4.7, "#141417"],
  [10.9, "#141417"],
  [11.5, "#030304"],
  [26.4, "#030304"],
  [26.8, "#f2f2f4"],
  [36.4, "#f2f2f4"],
  [36.8, "#050506"],
  [57, "#050506"],
];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function groundAt(t: number) {
  for (let i = 1; i < GROUND.length; i++) {
    const [b, cb] = GROUND[i];
    const [a, ca] = GROUND[i - 1];
    if (t <= b) {
      const k = inOut(seg(t, a, b));
      const [x, y] = [hex(ca), hex(cb)];
      return `rgb(${x.map((v, j) => Math.round(v + (y[j] - v) * k)).join(",")})`;
    }
  }
  return GROUND[GROUND.length - 1][1];
}

export default function Film() {
  useFonts();
  const t = useClock(DURATION);
  return (
    <Stage background="#000" className="elf">
      <div className="elf-ground" style={{ background: groundAt(t) }} />
      {visible(t, 0, 4.7) && <Hook t={t} />}
      {visible(t, 2.8, 11.7) && <Grind t={t} />}
      {visible(t, 11.4, 16.1) && <Reveal t={t} />}
      {visible(t, 14.4, 21.1) && <Devices t={t} />}
      {visible(t, 19.5, 26.8) && <Direct t={t} />}
      {visible(t, 26.5, 31.8) && <Kit t={t} />}
      {visible(t, 31.5, 36.8) && <Templates t={t} />}
      {visible(t, 36.5, 45.2) && <Ask t={t} />}
      {visible(t, 44.9, 52.2) && <Taste t={t} />}
      {visible(t, 51.9, 57) && <End t={t} />}
      {/* the signature: the mark's own easing curve, drawn across the frame between acts */}
      <CurveWipe t={t} at={15.55} color={AZURE} />
      <CurveWipe t={t} at={26.25} color={AZURE} />
      <CurveWipe t={t} at={44.6} color={AZURE} />
    </Stage>
  );
}

/* ---------------- your animations, live: framed the way the engine frames them, on the film's clock ---------------- */

type Stepped = Window & { __adv?: (ms: number) => Promise<number>; __now?: () => number; __nested?: boolean };
const STEPPED = new URLSearchParams(location.search).get("vt") === "1";
// In an export the film runs on the bridge's stepped clock (?vt=1). The pages it frames (the coin is a WebGL page that
// fills its own window, so it has to be a frame) run on clocks of their own, so each step of the film's clock is handed
// on to them: a frame's time is the film's, from the moment it was put on screen.
(() => {
  const w = window as Stepped;
  if (!STEPPED || !w.__adv || w.__nested) return;
  w.__nested = true;
  const own = w.__adv;
  w.__adv = async (dt) => {
    const at = await own(dt);
    await Promise.all(
      [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-born]")].map(async (f) => {
        const c = f.contentWindow as Stepped | null;
        if (!c?.__adv || !c.__now) return;
        const d = at - Number(f.dataset.born) - c.__now();
        if (d > 0) await c.__adv(d);
      }),
    );
    return at;
  };
})();

/** One of the library's animations in its own frame, at a device's own size (`w` × `h` CSS px), drawn `k` times. */
function Live({ id, w, h, k = 1, style }: { id: string; w: number; h: number; k?: number; style?: CSSProperties }) {
  const meta = byId(id);
  const page = meta?.html ? `/anim/${id}/index.html` : `/stage.html?a=${id}`;
  const born = useMemo(() => String((window as Stepped).__now?.() ?? 0), []);
  const src = STEPPED ? `${page}${page.includes("?") ? "&" : "?"}vt=1` : page;
  return (
    <div style={{ position: "relative", width: w * k, height: h * k, overflow: "hidden", background: "#000", ...style }}>
      <iframe data-born={born} src={src} title={meta?.name ?? id} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, border: 0, transform: `scale(${k})`, transformOrigin: "0 0", pointerEvents: "none" }} />
    </div>
  );
}

/* ---------------- the pieces every act uses ---------------- */

/** A title in one of the Kit's own animations (studio/textanim.ts), played at `t` seconds into its entrance. */
function Kinetic({ text, a, t, style }: { text: string; a: TextAnim; t: number; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const body = useMemo(() => pieces(text, a), [text, a]);
  useLayoutEffect(() => {
    if (ref.current) playPieces(ref.current, a, t);
  });
  return (
    <span ref={ref} style={{ display: "inline-block", whiteSpace: "pre-wrap", ["--ls" as string]: "-0.045em", letterSpacing: "var(--ls)", ...style }}>
      {body}
    </span>
  );
}

/** The engine's mark: an easing curve between two dots on a rounded tile. `draw` 0 → 1 draws the curve, `tile` the
    tile behind it, `dot` where a dot rides along the curve (−1: no rider). */
const CURVE = "M6.5 17C11.5 17 12.5 7 17.5 7";
function Mark({ size, draw = 1, tile = 1, ink = "#0b0b0d", paper = INK, glow = 0 }: { size: number; draw?: number; tile?: number; ink?: string; paper?: string; glow?: number }) {
  const len = 13.6;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ overflow: "visible", filter: glow ? `drop-shadow(0 0 ${size * 0.18 * glow}px ${AZURE})` : undefined }} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={paper} style={{ opacity: tile, transform: `scale(${lerp(0.86, 1, tile)})`, transformOrigin: "12px 12px" }} />
      <path d={CURVE} fill="none" stroke={tile > 0.02 ? ink : paper} strokeWidth="1.8" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      <circle cx="6.5" cy="17" r="1.9" fill={tile > 0.02 ? ink : paper} />
      <circle cx="17.5" cy="7" r={1.9 * back(seg(draw, 0.85, 1), 2.2)} fill={tile > 0.02 ? ink : paper} />
    </svg>
  );
}

/** The mark's curve, huge, drawn across the whole frame and gone again, a dot riding its tip: the cut between acts. */
function CurveWipe({ t, at, color }: { t: number; at: number; color: string }) {
  if (t < at || t > at + 0.75) return null;
  const draw = inOut(seg(t, at, at + 0.45));
  const erase = inOut(seg(t, at + 0.3, at + 0.75));
  const len = 2600;
  // the logo's S, stretched over 1920 × 1080: from the bottom left to the top right
  const d = "M-120 980C620 980 1300 100 2040 100";
  return (
    <svg className="elf-wipe" viewBox="0 0 1920 1080" width={1920} height={1080} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={46} strokeLinecap="round" strokeDasharray={`${len * (draw - erase)} ${len * 2}`} strokeDashoffset={-len * erase} style={{ filter: `drop-shadow(0 0 30px ${color})` }} />
    </svg>
  );
}

/** One word in a dimensional pill: it arrives squashed, stretches, and settles (the genre's signature, once). */
function Pill({ t, at, children }: { t: number; at: number; children: ReactNode }) {
  const a = out(seg(t, at, at + 0.43));
  const b = back(seg(t, at + 0.43, at + 0.77), 1.55);
  const sx = t < at + 0.43 ? lerp(0.93, 1.08, a) : lerp(1.08, 1, b);
  const sy = t < at + 0.43 ? lerp(1.06, 0.95, a) : lerp(0.95, 1, b);
  const sheen = inOut(seg(t, at + 0.9, at + 1.66));
  return (
    <span className="elf-pill" style={{ opacity: clamp((t - at) * 5), transform: `scale(${sx}, ${sy})` }}>
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
      <span className="elf-pill-sheen" style={{ left: `${lerp(-40, 130, sheen)}%`, opacity: sheen > 0 && sheen < 1 ? 1 : 0 }} />
    </span>
  );
}

/** A window on the desktop: dark chrome, three grey dots, a title. It pops in at `at`. */
function Win({ t, at, x, y, w, h, title, children, z = 1 }: { t: number; at: number; x: number; y: number; w: number; h: number; title: string; children?: ReactNode; z?: number }) {
  const k = out(seg(t, at, at + 0.55));
  return (
    <div className="elf-win" style={{ left: x, top: y, width: w, height: h, zIndex: z, opacity: clamp(k * 1.6), transform: `translateY(${(1 - k) * 46}px) scale(${lerp(0.93, 1, k)})`, filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined }}>
      <div className="elf-win-bar">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className="elf-win-body">{children}</div>
    </div>
  );
}

/* ---------------- 1. the hook (0–4.6 s) ---------------- */

function Hook({ t }: { t: number }) {
  const away = acc(seg(t, 4.05, 4.6));
  return (
    <div className="elf-scene" style={{ transform: `scale(${drift(t, 0, 4.6, 1, 1.05)})` }}>
      <div className="elf-hook-card" style={{ ...fx(t, { at: 0.15, dur: 0.9, dy: 60, blur: 18, scale: 0.92 }), transform: `translate(-50%, -50%) translateY(${(1 - out(seg(t, 0.15, 1.05))) * 60 + away * 700}px) rotate(${away * -9}deg) scale(${lerp(0.92, 1, out(seg(t, 0.15, 1.05)))})` }}>
        <Live id="coins-notes" w={402} h={874} k={0.75} style={{ position: "absolute", left: 0, top: -118 }} />
      </div>
      <h1 className="elf-h1" style={{ top: 132 }}>
        {t < 2.3 ? (
          <Words text="You built the animation." t={t} at={0.55} />
        ) : (
          <span style={{ opacity: 1 - acc(seg(t, 4.0, 4.4)) }}>
            <Words text="Now make the" t={t} at={2.35} /> <span style={{ color: AZURE }}><Words text="launch video." t={t} at={2.6} /></span>
          </span>
        )}
      </h1>
    </div>
  );
}

/* ---------------- 2. the usual way: a pile of windows (4.6–11.6 s) ---------------- */

const STEPS: [number, string][] = [
  [4.6, "Record."],
  [5.6, "Crop."],
  [6.6, "Mock up."],
  [7.6, "Keyframe."],
  [8.6, "Export."],
  [9.6, "Again."],
];
const FILES = ["launch.mp4", "launch_v2.mp4", "launch_final.mp4", "launch_final_v2.mp4", "launch_FINAL_final.mp4", "launch_final_v7_REAL.mp4"];

function Grind({ t }: { t: number }) {
  // the whole desktop pushes in as the pile grows, then collapses to one point
  const fold = inOut(seg(t, 10.9, 11.55));
  const push = drift(t, 4.6, 10.9, 1, 1.1);
  const step = [...STEPS].reverse().find(([at]) => t >= at);
  const begun = t >= 4.55;
  const rec = Math.max(0, Math.floor((t - 4.7) * 4));
  const crop = out(seg(t, 5.65, 6.4));
  const handle = inOut(seg(t, 7.9, 8.5));
  const bar = clamp((t - 8.75) * 0.018);
  return (
    <div className="elf-scene" style={{ transform: `scale(${push * lerp(1, 0.015, fold)})`, opacity: begun ? 1 - acc(seg(t, 11.25, 11.55)) : 0, filter: fold > 0.01 ? `blur(${fold * 14}px)` : undefined }}>
      <Win t={t} at={4.65} x={140} y={120} w={620} h={540} title="Screen Recording" z={1}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#0a0a0b", overflow: "hidden" }}>
          <Live id="coins-notes" w={402} h={874} k={0.56} />
          {/* the crop marquee closing in on it */}
          <div className="elf-crop" style={{ inset: `${lerp(14, 70, crop)}px ${lerp(20, 140, crop)}px ${lerp(14, 120, crop)}px ${lerp(20, 130, crop)}px`, opacity: t > 5.6 ? 1 : 0 }} />
        </div>
        <span className="elf-rec">
          <i /> 00:00:{String(rec).padStart(2, "0")}
        </span>
      </Win>
      <Win t={t} at={6.65} x={1080} y={90} w={700} h={560} title="mockup_iphone_FINAL.psd" z={2}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 250px" }}>
          <div style={{ position: "relative", display: "grid", placeItems: "center", background: "#202024" }}>
            <div className="elf-flatphone">
              {/* pasted in, a few degrees off: the mock-up never quite fits */}
              <div style={{ position: "absolute", inset: 10, borderRadius: 26, overflow: "hidden", transform: `rotate(${lerp(4, 2.2, out(seg(t, 6.9, 7.4)))}deg) translate(6px, -4px)`, opacity: 0.92 }}>
                <Live id="coins-notes" w={402} h={874} k={0.42} />
              </div>
            </div>
          </div>
          <div className="elf-layers">
            {["Shadow copy 3", "Glare", "Screen — paste here", "iPhone frame v2", "Reflection", "Background"].map((n, i) => (
              <div key={n} style={{ ...fx(t, { at: 6.85 + i * 0.06, dur: 0.4, dy: 10, blur: 4 }), background: i === 2 ? "rgba(31,149,255,.22)" : undefined }}>
                <b />
                {n}
              </div>
            ))}
          </div>
        </div>
      </Win>
      <Win t={t} at={7.65} x={260} y={600} w={1400} h={330} title="Timeline" z={3}>
        <div className="elf-timeline">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="elf-track">
              <span>{["Position", "Scale", "Opacity", "Rotation"][r]}</span>
              {[0, 1, 2, 3, 4].map((c) => (
                <i key={c} style={{ left: 210 + c * 230 + ((r * 71) % 90), opacity: clamp((t - 7.8 - (r * 5 + c) * 0.03) * 6) }} />
              ))}
            </div>
          ))}
          {/* a curve handle dragged, again */}
          <svg className="elf-graph" viewBox="0 0 400 120" aria-hidden="true">
            <path d={`M10 110C${lerp(120, 60, handle)} ${lerp(110, 20, handle)} ${lerp(260, 300, handle)} ${lerp(10, 100, handle)} 390 10`} fill="none" stroke={AZURE} strokeWidth="3" />
          </svg>
        </div>
      </Win>
      <Win t={t} at={8.65} x={700} y={380} w={560} h={190} title="Export" z={4}>
        <div style={{ padding: "26px 30px", color: "#d4d4d8", fontSize: 22 }}>
          Rendering…
          <div className="elf-bar">
            <i style={{ width: `${(0.06 + bar) * 100}%` }} />
          </div>
          <span style={{ color: "#8b8b93", fontSize: 18 }}>About 2 hours remaining</span>
        </div>
      </Win>
      <Win t={t} at={9.65} x={40} y={300} w={560} h={420} title="Downloads" z={5}>
        <div className="elf-files">
          {FILES.map((f, i) => (
            <div key={f} style={fx(t, { at: 9.75 + i * 0.12, dur: 0.35, dy: -16, blur: 3 })}>
              <b />
              {f}
            </div>
          ))}
        </div>
      </Win>
      <Cursor x={lerp(lerp(560, 760, out(seg(t, 5.6, 6.3))), 900, inOut(seg(t, 7.8, 8.5)))} y={lerp(lerp(560, 300, out(seg(t, 5.6, 6.3))), 760, inOut(seg(t, 7.8, 8.5)))} press={t > 7.95 && t < 8.5 ? 1 : 0} size={1.6} />
      {step && (
        <div key={step[1]} className="elf-step">
          <Kinetic text={step[1]} a={step[1] === "Again." ? anim("slam") : anim("mask-letters")} t={t - step[0]} />
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. the reveal: the dot draws the mark (11.6–16 s) ---------------- */

function Reveal({ t }: { t: number }) {
  const draw = inOut(seg(t, 11.65, 12.45));
  const tile = out(seg(t, 12.35, 12.95));
  const slide = expo(seg(t, 12.8, 13.6));
  const gone = acc(seg(t, 15.5, 15.9));
  return (
    <div className="elf-scene" style={{ opacity: 1 - gone, transform: `scale(${drift(t, 11.6, 16, 1, 1.03)})` }}>
      <div style={{ position: "absolute", left: "50%", top: 440, display: "flex", alignItems: "center", gap: 46, transform: `translate(-50%, -50%) translateX(${(1 - slide) * 300}px)` }}>
        <Mark size={lerp(260, 150, slide)} draw={draw} tile={tile} glow={1 - tile} />
        <span style={{ fontSize: 132, fontWeight: 680, color: INK, opacity: slide, whiteSpace: "nowrap" }}>
          <Kinetic text="Animation Engine" a={{ ...anim("tracking"), dur: 1.4 }} t={t - 12.85} style={{ whiteSpace: "nowrap" }} />
        </span>
      </div>
      <p className="elf-line" style={{ top: 650 }}>
        <Words text="Your animations," t={t} at={14.15} /> <Pill t={t} at={14.45}>launch-ready.</Pill>
      </p>
    </div>
  );
}

/* ---------------- 4. live, in the real device (16–21 s) ---------------- */

function Tablet({ children, scale }: { children: ReactNode; scale: number }) {
  return (
    <div className="elf-tablet" style={{ zoom: scale }}>
      <div style={{ position: "relative", width: 834, height: 1210, borderRadius: 30, overflow: "hidden", transform: "translateZ(0)" }}>{children}</div>
    </div>
  );
}
function Laptop({ children, scale }: { children: ReactNode; scale: number }) {
  return (
    <div style={{ zoom: scale, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className="elf-lid">
        <div style={{ position: "relative", width: 1512, height: 950, borderRadius: 14, overflow: "hidden", transform: "translateZ(0)" }}>{children}</div>
        <i />
      </div>
      <div className="elf-base" />
    </div>
  );
}
function Fold({ children, scale }: { children: ReactNode; scale: number }) {
  return (
    <div className="elf-fold" style={{ zoom: scale }}>
      <div style={{ position: "relative", width: 466, height: 678, borderRadius: 40, overflow: "hidden", transform: "translateZ(0)" }}>{children}</div>
      <i />
    </div>
  );
}

const DEVICES: { at: number; label: string; size: string }[] = [
  { at: 16.35, label: "iPhone 16 Pro", size: "402 × 874" },
  { at: 16.5, label: "iPhone Duo", size: "466 × 678" },
  { at: 16.65, label: "iPad Pro", size: "834 × 1210" },
  { at: 16.8, label: "MacBook Pro", size: "1512 × 950" },
];

function Devices({ t }: { t: number }) {
  const rise = (i: number) => {
    const at = DEVICES[i].at;
    const k = back(seg(t, at, at + 0.75), 1.3);
    return { opacity: clamp((t - at) * 4), transform: `translateY(${(1 - k) * 220}px)` };
  };
  const label = (i: number) => (
    <span className="elf-dev-label" style={fx(t, { at: DEVICES[i].at + 0.45, dur: 0.5, dy: 12, blur: 4 })}>
      {DEVICES[i].label}
      <em>{DEVICES[i].size}</em>
    </span>
  );
  const gone = acc(seg(t, 20.6, 21.0));
  return (
    <div className="elf-scene" style={{ opacity: t < 16 ? 0 : 1 - gone, transform: `scale(${drift(t, 16, 21, 1, 1.06)})` }}>
      <div className="elf-glow" style={{ left: 960, top: 640, opacity: 0.55 }} />
      <h2 className="elf-h2" style={{ top: 110 }}>
        <Words text="Live, in the real device." t={t} at={16.1} />
      </h2>
      <div className="elf-row">
        <div className="elf-dev" style={rise(0)}>
          <Phone scale={0.55}>
            <Live id="coins-notes" w={402} h={874} />
          </Phone>
          {label(0)}
        </div>
        <div className="elf-dev" style={rise(1)}>
          <Fold scale={0.68}>
            <Live id="pet-buddy-greeting" w={466} h={678} />
          </Fold>
          {label(1)}
        </div>
        <div className="elf-dev" style={rise(2)}>
          <Tablet scale={0.4}>
            <Live id="thinking-cube" w={834} h={1210} />
          </Tablet>
          {label(2)}
        </div>
        <div className="elf-dev" style={rise(3)}>
          <Laptop scale={0.34}>
            <Live id="chat-quiz" w={1512} h={950} />
          </Laptop>
          {label(3)}
        </div>
      </div>
      <div className="elf-chips" style={{ top: 930 }}>
        {["Light and dark", "Reduced motion", "Frame rate per device", "GPU load"].map((c, i) => (
          <span key={c} style={{ opacity: clamp((t - 18.6 - i * 0.12) * 5), transform: `scale(${back(seg(t, 18.6 + i * 0.12, 19.1 + i * 0.12), 2)})` }}>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 5. direct it like a film: the Studio's own phone (21–26.6 s) ---------------- */

const OVER_A: Pose = { ...angle("over", "iphone"), zoom: 2.3, pan: -0.14, rise: 0.16 };
const OVER_B: Pose = { ...OVER_A, pan: 0.12, yaw: 7 };
const HERO: Pose = { ...angle("hero", "iphone"), zoom: 0.86, pan: 0.17 };

function Phone3D({ t }: { t: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StudioScene | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const s = new StudioScene(host.current!);
    s.setDevices([{ key: "phone", id: "iphone", posture: "open", landscape: false, finish: FINISHES.iphone[1], screenBg: "#000000", slot: "center" }]);
    s.setLook({ shadow: true, reflections: 1, light: "dramatic" });
    s.resize(1920, 1080, Math.min(2, devicePixelRatio || 1));
    scene.current = s;
    setSlot(s.slotOf("phone"));
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);
  // the camera never stops: a linear glide over the top, a cut, then the hero turn
  const pose = t < 23.2 ? mix(OVER_A, OVER_B, seg(t, 21, 23.2)) : { ...HERO, yaw: lerp(-38, 16, inOut(seg(t, 23.2, 26.6))) };
  useLayoutEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.setPose(pose);
    s.render();
  });
  return (
    <div ref={host} style={{ position: "absolute", inset: 0 }}>
      {slot && createPortal(<Live id="coins-notes" w={402} h={874} />, slot)}
    </div>
  );
}

function Direct({ t }: { t: number }) {
  const on = t >= 21;
  const flash = t > 23.1 && t < 23.32 ? 1 - Math.abs(t - 23.2) / 0.12 : 0;
  return (
    // mounted from 19.5 s, unseen, so the scene and its screen are loaded when the cut comes
    <div className="elf-scene elf-room" style={{ opacity: on ? 1 - acc(seg(t, 26.3, 26.6)) : 0 }}>
      <Phone3D t={Math.max(21, t)} />
      <div className="elf-flash" style={{ opacity: clamp(flash) }} />
      <span className="elf-angle" style={{ opacity: on ? 1 : 0 }}>
        <i />
        {t < 23.2 ? "Over the top · a linear glide" : "¾ hero · the turn"}
      </span>
      <h2 className="elf-h2 elf-left elf-direct">{t > 23.6 && <Kinetic text={"Direct it\nlike a film."} a={anim("mask-lines")} t={t - 23.65} />}</h2>
    </div>
  );
}

/* ---------------- 6. the kit: every title, every move (26.6–31.6 s) ---------------- */

const KIT = ["blur-up", "mask-lines", "tracking", "slam", "flip-up", "cascade", "slide", "skew", "spotlight", "scatter", "bloom", "wave"];

function Kit({ t }: { t: number }) {
  const grab = t > 29.0;
  const drag = inOut(seg(t, 29.15, 29.75));
  const big = t > 29.75;
  const fade = out(seg(t, 29.2, 29.7));
  return (
    <div className="elf-scene" style={{ opacity: 1 - acc(seg(t, 31.4, 31.7)), transform: `scale(${drift(t, 26.6, 31.6, 1, 1.04)})` }}>
      <h2 className="elf-h2 elf-dark" style={{ top: 86, opacity: 1 - fade }}>
        <Kinetic text="Every title. Every move." a={anim("mask-lines")} t={t - 26.75} />
      </h2>
      <div className="elf-kit" style={{ opacity: 1 - fade * 0.85 - (big ? 0.15 : 0), transform: `scale(${lerp(1, 0.94, fade)})` }}>
        {KIT.map((id, i) => {
          const a = TEXT_ANIMS.find((x) => x.id === id)!;
          const at = 26.9 + i * 0.05;
          // each card loops its animation: the entrance, a held beat, again
          const local = Math.max(0, t - at - 0.3) % (a.anim.dur + a.anim.stagger * 8 + 1.1);
          const lifted = id === "slam" && grab;
          return (
            <div key={id} className="elf-kit-card" style={{ ...fx(t, { at, dur: 0.6, dy: 40, blur: 8 }), visibility: lifted ? "hidden" : undefined }}>
              <span className="elf-kit-face">
                <Kinetic text="Launch day" a={a.anim} t={local} />
              </span>
              <span className="elf-kit-name">{a.name}</span>
            </div>
          );
        })}
      </div>
      {/* the card picked up and dragged to the middle, where it becomes the title it plays */}
      {grab && !big && (
        <div className="elf-kit-card elf-kit-lift" style={{ left: lerp(1335, 795, drag), top: lerp(230, 420, drag), transform: `rotate(${lerp(0, -4, Math.sin(drag * Math.PI))}deg) scale(${lerp(1.04, 1.25, drag)})` }}>
          <span className="elf-kit-face">Launch day</span>
          <span className="elf-kit-name">Slam</span>
        </div>
      )}
      {big && (
        <div className="elf-slam">
          <Kinetic text="Launch day." a={{ ...anim("slam"), dur: 0.45 }} t={t - 29.78} />
        </div>
      )}
      <p className="elf-line elf-dark" style={{ top: 720 }}>
        {t > 30.3 && <Words text="Drag it in. Or teach it one from a film you love." t={t} at={30.35} />}
      </p>
      {t > 27.6 && t < 29.8 && <Cursor x={lerp(lerp(1700, 1500, out(seg(t, 28.4, 29.0))), 960, drag)} y={lerp(lerp(760, 300, out(seg(t, 28.4, 29.0))), 490, drag)} press={grab ? 1 : 0} hand={grab} size={1.6} />}
    </div>
  );
}

/* ---------------- 7. templates by kind, and the canvas (31.6–36.6 s) ---------------- */

function Shot({ src, t, at, end, from, to, tilt }: { src: string; t: number; at: number; end: number; from: [number, number, number]; to: [number, number, number]; tilt: [number, number] }) {
  // the camera on a real screenshot: [scale, x, y] from → to, tilted back a little and straightening
  const k = inOut(seg(t, at, end));
  const s = lerp(from[0], to[0], k);
  const x = lerp(from[1], to[1], k);
  const y = lerp(from[2], to[2], k);
  const i = out(seg(t, at, at + 0.8));
  return (
    <div className="elf-shot" style={{ opacity: i, transform: `perspective(2200px) translate(${x}px, ${y + (1 - i) * 80}px) rotateX(${lerp(tilt[0], tilt[0] * 0.3, k)}deg) rotateY(${lerp(tilt[1], tilt[1] * 0.3, k)}deg) scale(${s})` }}>
      <img src={src} alt="" width={1440} height={900} />
    </div>
  );
}

const KINDS = ["Product launch", "Feature launch", "Product demo", "Teaser", "Brand film", "Social"];

function Templates({ t }: { t: number }) {
  const first = t < 34.1;
  return (
    <div className="elf-scene" style={{ opacity: 1 - acc(seg(t, 36.3, 36.6)) }}>
      {first ? (
        <>
          <Shot src={shotTemplates} t={t} at={31.6} end={34.1} from={[0.86, 220, 80]} to={[1.12, 120, 40]} tilt={[10, -14]} />
          <div className="elf-side">
            <h2 className="elf-h2 elf-dark elf-left">
              <Words text="Templates, by kind." t={t} at={31.75} />
            </h2>
            <div className="elf-kinds">
              {KINDS.map((k, i) => (
                <span key={k} style={{ opacity: clamp((t - 32.3 - i * 0.1) * 5), transform: `translateX(${(1 - out(seg(t, 32.3 + i * 0.1, 32.8 + i * 0.1))) * -30}px)` }}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <Shot src={shotCanvas} t={t} at={34.1} end={36.6} from={[0.9, 230, 70]} to={[1.16, 300, 60]} tilt={[8, -12]} />
          <div className="elf-side">
            <h2 className="elf-h2 elf-dark elf-left">
              <Words text="Then put it on your site." t={t} at={34.2} />
            </h2>
            <div className="elf-kinds">
              {["Real 3D devices", "Clouds, dithers, characters", "Titles that play as you scroll", "One script"].map((k, i) => (
                <span key={k} style={{ opacity: clamp((t - 34.8 - i * 0.1) * 5), transform: `translateX(${(1 - out(seg(t, 34.8 + i * 0.1, 35.3 + i * 0.1))) * -30}px)` }}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 8. or just ask: the MCP (36.6–45 s) ---------------- */

const PROMPT = "make a launch film for this app";
const STEPS_MCP: [number, string][] = [
  [40.85, "Reading the project"],
  [41.25, "Capturing http://localhost:3000"],
  [41.65, "Building the film"],
  [42.05, ""],
  [43.15, "Saving"],
];

function Ask({ t }: { t: number }) {
  const termIn = out(seg(t, 37.75, 38.45));
  const typedAt = 38.5;
  const busy = t < typingEnd(PROMPT, typedAt, 20);
  const frame = Math.round(lerp(1, 450, seg(t, 42.05, 43.05)));
  const card = back(seg(t, 43.6, 44.3), 1.2);
  return (
    <div className="elf-scene" style={{ opacity: 1 - acc(seg(t, 44.65, 45)) }}>
      <h2 className="elf-giant" style={{ opacity: 1 - acc(seg(t, 37.6, 37.85)) }}>
        {t < 37.85 && <Kinetic text="Or just ask." a={{ ...anim("tracking"), dur: 1.0 }} t={t - 36.65} />}
      </h2>
      {t > 37.7 && (
        <div className="elf-term" style={{ opacity: termIn, transform: `translateY(${(1 - termIn) * 80}px) translateX(${lerp(0, -230, out(seg(t, 43.4, 44.1)))}px)` }}>
          <div className="elf-term-bar">
            <i />
            <i />
            <i />
            <span>Claude Code · ~/my-app</span>
          </div>
          <div className="elf-term-body">
            <p>
              <b style={{ color: AZURE }}>&gt;</b> {typed(PROMPT, t, typedAt, 20)}
              {t < 40.2 && <Caret on={blink(t, busy)} />}
            </p>
            {t > 40.3 && (
              <div className="elf-tool" style={fx(t, { at: 40.3, dur: 0.4, dy: 10, blur: 4 })}>
                <p>
                  <b style={{ color: AZURE }}>●</b> animation-engine · <b>make_video</b>
                </p>
                <p className="elf-dim">
                  &nbsp;&nbsp;project ~/my-app &nbsp;·&nbsp; url http://localhost:3000
                </p>
                {STEPS_MCP.map(([at, label], i) =>
                  t > at ? (
                    <p key={i} className="elf-dim" style={fx(t, { at, dur: 0.25, dy: 6, blur: 2 })}>
                      &nbsp;&nbsp;⎿ {label || `Rendering frame ${frame} of 450`}
                      {(label ? t > at + 0.3 : frame >= 450) && <b style={{ color: "#3ecf8e" }}> ✓</b>}
                    </p>
                  ) : null,
                )}
              </div>
            )}
            {t > 43.35 && (
              <p style={fx(t, { at: 43.35, dur: 0.35, dy: 8, blur: 3 })}>
                Saved the film: engine-exports/my-app-film.mp4
                <br />
                <span className="elf-dim">15 s, 16x9. Made in 76 s.</span>
              </p>
            )}
          </div>
        </div>
      )}
      {/* the film it made, out of the terminal and playing (its frame loads, unseen, while the render runs) */}
      {t > 41 && (
        <div className="elf-film" style={{ opacity: clamp((t - 43.6) * 4), transform: `translate(${lerp(-200, 0, card)}px, ${lerp(60, 0, card)}px) rotateY(${lerp(-24, -8, card)}deg) scale(${lerp(0.7, 1, card)})` }}>
          <div className="elf-film-shot">
            <Live id="coins-notes" w={402} h={874} k={0.62} style={{ position: "absolute", left: 155, top: -114 }} />
            <span className="elf-film-title">
              <Kinetic text="Launch day" a={anim("blur-up")} t={t - 43.9} />
            </span>
          </div>
          <div className="elf-film-bar">
            <i style={{ width: `${clamp((t - 43.6) / 5) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="elf-tools">
        {["make_video", "make_interactive", "list_templates", "job_status", "engine_status"].map((n, i) => (
          <span key={n} style={{ opacity: clamp((t - 44.0 - i * 0.07) * 5), transform: `translateY(${(1 - out(seg(t, 44.0 + i * 0.07, 44.4 + i * 0.07))) * 16}px)` }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 9. it learns your taste (45–52 s) ---------------- */

/** What a studied film is torn into: shots (a phone at an angle), titles, grounds. */
const STRIP: { kind: 0 | 1 | 2; render: ReactNode; bg: string }[] = [
  { kind: 0, bg: "radial-gradient(80% 90% at 50% 40%, #13306a, #050a18)", render: <i className="elf-mini-phone" style={{ transform: "rotate(-14deg) translateY(6px)" }} /> },
  { kind: 1, bg: "#0b0b0e", render: <b style={{ fontSize: 34, fontWeight: 760, letterSpacing: "-0.04em" }}>Launch day</b> },
  { kind: 2, bg: "radial-gradient(70% 90% at 30% 30%, #ff8a3d, #4a1d6b 60%, #0b0b10)", render: null },
  { kind: 0, bg: "radial-gradient(80% 90% at 50% 40%, #2a2a30, #0b0b0d)", render: <i className="elf-mini-phone" style={{ transform: "rotateX(40deg) rotate(8deg) scale(1.5)" }} /> },
  { kind: 1, bg: "#f2f2f4", render: <b style={{ fontSize: 30, fontWeight: 600, color: "#0b0b0d", fontFamily: "Georgia, serif", fontStyle: "italic" }}>made to move</b> },
  { kind: 2, bg: "radial-gradient(70% 90% at 70% 40%, #2ecf9a, #0e3a5c 65%, #050a12)", render: null },
];
const REASON = "less going on, more craft.";

function Taste({ t }: { t: number }) {
  const apart = inOut(seg(t, 46.4, 47.2));
  const merge = inOut(seg(t, 47.7, 48.2));
  const typedAt = 49.05;
  const better = back(seg(t, 50.85, 51.4), 1.3);
  const noticeIn = fx(t, { at: 47.95, dur: 0.6, dy: 40, blur: 8 });
  const aside = out(seg(t, 50.75, 51.3));
  return (
    <div className="elf-scene elf-night" style={{ opacity: t < 45 ? 0 : 1 - acc(seg(t, 51.85, 52.15)) }}>
      <span className="elf-clock" style={fx(t, { at: 45.1, dur: 0.5, dy: 8, blur: 4 })}>
        00:00 · the template lab
      </span>
      <h2 className="elf-h2" style={{ top: 110 }}>
        <Kinetic text="It learns your taste." a={anim("blur-up")} t={t - 45.1} />
      </h2>
      {/* a film it studied, torn down into what it's made of */}
      {t < 48.3 && (
        <div className="elf-strip" style={{ opacity: (1 - merge) * clamp((t - 45.6) * 3) }}>
          {STRIP.map((f, i) => {
            const row = (i - 2.5) * 236;
            const pile = (f.kind - 1) * 540 + (i < 3 ? -26 : 26);
            const x = lerp(row, pile, apart) * (1 - merge);
            const y = lerp(0, i < 3 ? -22 : 22, apart) * (1 - merge);
            return (
              <div key={i} className="elf-frame" style={{ background: f.bg, transform: `translate(${x}px, ${y}px) rotate(${lerp(0, (i < 3 ? -1 : 1) * 3, apart)}deg) scale(${1 - merge * 0.6})`, color: INK }}>
                {f.render}
              </div>
            );
          })}
          {["Shots", "Titles", "Backgrounds"].map((n, i) => (
            <span key={n} className="elf-part-label" style={{ left: (i - 1) * 540, opacity: apart * (1 - merge) }}>
              {n}
            </span>
          ))}
        </div>
      )}
      {/* the morning: the lab's own notice, a rejection with a reason, and the better version it reads it into */}
      {t > 47.9 && (
        <div className="elf-notice" style={{ ...noticeIn, transform: `${noticeIn.transform} translateX(${lerp(0, -330, aside)}px) scale(${lerp(1, 0.92, aside)})`, opacity: Number(noticeIn.opacity) * lerp(1, 0.5, aside) }}>
          <p className="elf-notice-title">1 new template idea from last night</p>
          <p className="elf-dim">Nothing joins the gallery until you approve it.</p>
          <div className="elf-notice-row">
            <span className={`elf-btn ${t > 48.75 ? "elf-btn-on" : ""}`}>Reject</span>
            <span className="elf-btn elf-btn-ink">Approve</span>
          </div>
          {t > 48.9 && (
            <div className="elf-reason" style={fx(t, { at: 48.9, dur: 0.3, dy: 6, blur: 2 })}>
              {typed(REASON, t, typedAt, 22)}
              <Caret on={blink(t, t < typingEnd(REASON, typedAt, 22))} />
            </div>
          )}
          {t > 50.3 && (
            <p className="elf-dim" style={{ ...fx(t, { at: 50.3, dur: 0.4, dy: 8, blur: 3 }), marginTop: 14 }}>
              The next run reads why.
            </p>
          )}
        </div>
      )}
      {t > 50.85 && (
        <div className="elf-notice elf-notice-next" style={{ opacity: clamp((t - 50.85) * 4), transform: `translate(${lerp(360, 330, better)}px, ${lerp(60, 0, better)}px)` }}>
          <p className="elf-notice-title">Improved, from your reason</p>
          <p className="elf-dim">One effect. Slower glides. More room.</p>
          <div className="elf-notice-row">
            <span className={`elf-btn elf-btn-ink ${t > 51.45 ? "elf-btn-done" : ""}`}>{t > 51.45 ? "Approved ✓" : "Approve"}</span>
          </div>
        </div>
      )}
      {t > 48.2 && t < 51.6 && <Cursor x={t < 49 ? lerp(1180, 750, out(seg(t, 48.2, 48.75))) : lerp(750, 1100, inOut(seg(t, 50.9, 51.4)))} y={t < 49 ? lerp(860, 600, out(seg(t, 48.2, 48.75))) : lerp(600, 600, inOut(seg(t, 50.9, 51.4)))} press={(t > 48.7 && t < 48.85) || (t > 51.38 && t < 51.5) ? 1 : 0} size={1.6} />}
    </div>
  );
}

/* ---------------- 10. the end card (52–57 s) ---------------- */

function End({ t }: { t: number }) {
  const draw = inOut(seg(t, 52.1, 52.8));
  return (
    <div className="elf-scene" style={{ transform: `scale(${drift(t, 52, 57, 1, 1.025)})` }}>
      <div className="elf-glow" style={{ left: 960, top: 470, opacity: 0.35 }} />
      <div style={{ position: "absolute", left: "50%", top: 400, display: "flex", alignItems: "center", gap: 34, transform: "translate(-50%, -50%)" }}>
        <Mark size={120} draw={draw} tile={out(seg(t, 52.6, 53.1))} />
        <span style={{ fontSize: 104, fontWeight: 680, color: INK, whiteSpace: "nowrap" }}>
          <Kinetic text="Animation Engine" a={{ ...anim("tracking"), dur: 1.3 }} t={t - 52.6} style={{ whiteSpace: "nowrap" }} />
        </span>
      </div>
      <p className="elf-line" style={{ top: 560 }}>
        <Words text="From animation to launch film." t={t} at={53.4} />
      </p>
      <div style={{ position: "absolute", left: 0, right: 0, top: 690, display: "flex", justifyContent: "center" }}>
        <div className="elf-cmd" style={fx(t, { at: 54.2, dur: 0.7, dy: 24, blur: 8 })}>
          <span style={{ color: AZURE }}>$</span> claude mcp add animation-engine -- node mcp/server.mjs
        </div>
      </div>
    </div>
  );
}
