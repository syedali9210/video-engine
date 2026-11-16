// Site flyover: a website laid down and flown over, replicated from a newsletter product's site film. One 3D camera
// over the page (perspective, tilt, distance), on one smooth path: the hero tilting back as two planes fly past, a
// glide down the page with its cards rising as they come under the lens (shallow focus: soft near and far), a whip
// back to the whole page standing, a dive into its app window, and the closing line over that window.
// Your site, your app's screen and your logo can stand in for the drawn ones (screen slots).
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Baked, Slot, Stage, acc, alpha, at, expo, fill, glide, hexMix, inOut, lerp, out, seg, useAspect, useClock, useFonts, useWebFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 14.56;
const FONTS = "https://fonts.googleapis.com/css2?family=Gloock&family=Instrument+Serif:ital@0;1&display=swap";
const DISPLAY = '"Gloock", "Instrument Serif", Georgia, serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const INK = "#121212";
const PW = 1440; // the page's width, and its height when drawn here
const PH = 8640;
const split = (s: string) => s.split("|").map((x) => x.trim());
/** the beats, in seconds */
const T = { whip: 8.03, flat: 8.36, whole: 8.9, dive: 9.3, close: 9.7, words: 9.93 };

/* ---------------- small parts ---------------- */

/** a paper plane, the product's mark when it has none */
const PlaneIcon = ({ size, color = INK }: { size: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M22 2 2 9.5l7.8 3.2L13 21z" fill={color} />
    <path d="M22 2 9.8 12.7l.9 6.6z" fill={hexMix(color, "#ffffff", 0.35)} />
  </svg>
);
const Mark = ({ p, size, color }: { p: P; size: number; color?: string }) => (
  <span style={{ display: "inline-block", width: size, height: size, flex: "none", verticalAlign: "middle" }}>
    <Slot pick="mark" src={p.mark} w={size} h={size} fit="contain">
      <PlaneIcon size={size} color={color} />
    </Slot>
  </span>
);
/** a crumpled grey paper plane drifting over the hero */
const PaperPlane = ({ w, flip, style }: { w: number; flip?: boolean; style?: CSSProperties }) => (
  <svg width={w} height={w * 0.5} viewBox="0 0 60 30" aria-hidden style={{ transform: flip ? "scaleX(-1)" : undefined, ...style }}>
    <path d="M0 14 60 2 22 30z" fill="#cfcfcf" />
    <path d="M0 14 60 2 26 18z" fill="#9a9a9a" />
    <path d="M26 18 60 2 22 30z" fill="#e6e6e6" />
  </svg>
);
const Bar = ({ w, h = 8, c = "#e6e6e6", style }: { w: number | string; h?: number; c?: string; style?: CSSProperties }) => (
  <div style={{ width: w, height: h, borderRadius: h / 2, background: c, ...style }} />
);
/** a line icon, small (just enough to read as an icon) */
const Ico = ({ d, size = 14, color = "#8a8a8a" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none" }}>
    <path d={d} />
  </svg>
);
const ICON = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  news: "M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  key: "M15 7a4 4 0 1 1-3.5 6L4 20.5 2.5 19M8 16l2 2",
  pen: "M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z",
  cal: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  flask: "M9 3h6M10 3v6L4 20h16L14 9V3",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  chev: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  check: "M20 6 9 17l-5-5",
};

/* ---------------- the app window (on the page and in the closing shot) ---------------- */

const DRAWN_W = 968;
const DRAWN_H = 560;
/** the app window's size on the page, against its own */
const WK = 1290 / DRAWN_W;
/** A dark photo, the editor's picture: a car's dashboard screen at night. */
const Photo = ({ w, h, r = 8 }: { w: number; h: number; r?: number }) => (
  <div style={{ position: "relative", width: w, height: h, borderRadius: r, overflow: "hidden", background: "linear-gradient(180deg, #2a2522 0%, #15110f 60%, #0c0a09)" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 30% 45% at 50% 48%, rgba(150,180,210,.55), transparent 70%)" }} />
    <div style={{ position: "absolute", left: "37%", top: "18%", width: "26%", height: "58%", borderRadius: 4, background: "linear-gradient(180deg, #8fa7bd, #4c6176 55%, #2b3640)", boxShadow: "0 0 0 3px #111, 0 6px 18px rgba(0,0,0,.6)" }}>
      <div style={{ position: "absolute", left: "44%", top: "40%", width: "12%", height: "60%", background: "linear-gradient(180deg, transparent, #d9c26a)", clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)" }} />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "38%", background: "linear-gradient(180deg, transparent, #3b2f28 70%)" }} />
  </div>
);

/** The editor as the reference films it, at 968×560 (`zoom` scales it); your screen fills it below the address bar. */
function AppWindow({ p, t, zoom = 1, style }: { p: P; t: number; zoom?: number; style?: CSSProperties }) {
  const nav: [string, string][] = [
    ["Overview", ICON.grid],
    ["Campaigns", ICON.send],
    ["Contacts", ICON.users],
    ["Newsletters", ICON.news],
    ["Domains", ICON.globe],
    ["API keys", ICON.key],
  ];
  return (
    <div style={{ zoom, width: DRAWN_W, height: DRAWN_H, borderRadius: 14, background: "#fff", overflow: "hidden", fontFamily: SANS, color: INK, boxShadow: "0 0 0 1px rgba(0,0,0,.06), 0 30px 60px -30px rgba(0,0,0,.25), 0 12px 24px -16px rgba(0,0,0,.18)", ...style }}>
      <div style={{ height: 35, display: "flex", alignItems: "center", justifyContent: "center", background: "#fbfbfb", borderBottom: "1px solid #efefef", position: "relative" }}>
        <span style={{ position: "absolute", left: 14, display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: "#e2e2e2" }} />
          ))}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 6, background: "#f3f3f3", fontFamily: MONO, fontSize: 11, color: "#7a7a7a" }}>
          <Ico d={ICON.lock} size={10} />
          {p.url}
        </span>
      </div>
      <Slot pick="screen" src={p.screen} t={t} w={DRAWN_W} h={DRAWN_H - 35}>
        <div style={{ display: "flex", height: DRAWN_H - 35 }}>
          <div style={{ width: 186, borderRight: "1px solid #f0f0f0", padding: "20px 9px 0", boxSizing: "border-box", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 7px", fontWeight: 600, fontSize: 13 }}>
              <Mark p={p} size={14} />
              {p.name}
            </div>
            <div style={{ marginTop: 26 }}>
              {nav.map(([s, d], i) => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 7px", marginBottom: 3.5, borderRadius: 7, background: i === 1 ? "#f2f2f2" : undefined, fontSize: 12.5, color: i === 1 ? INK : "#555", fontWeight: i === 1 ? 500 : 400 }}>
                  <Ico d={d} size={13} color={i === 1 ? INK : "#888"} />
                  {s}
                </div>
              ))}
            </div>
            <div style={{ position: "absolute", left: 16, bottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, background: "radial-gradient(circle at 50% 35%, #f3c79a, #c27a45)" }} />
              Marc
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 48, display: "flex", alignItems: "center", gap: 8, padding: "0 13px 0 16px", borderBottom: "1px solid #f3f3f3", fontSize: 12.5 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg, #f9a8d4, #a78bfa 50%, #60a5fa)" }} />
              <span style={{ color: "#888" }}>Campaigns</span>
              <Ico d={ICON.chev} size={11} color="#aaa" />
              <span style={{ fontWeight: 500 }}>New campaign</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
                <span style={{ padding: "4px 9px", borderRadius: 99, boxShadow: "0 0 0 1px #ececec", color: "#555" }}>● Draft</span>
                <span style={{ padding: "5px 10px", borderRadius: 7, boxShadow: "0 0 0 1px #e6e6e6" }}>Test</span>
                <span style={{ padding: "5px 10px", borderRadius: 7, boxShadow: "0 0 0 1px #e6e6e6" }}>Schedule</span>
                <span style={{ padding: "5px 12px", borderRadius: 7, background: INK, color: "#fff", display: "flex", gap: 5, alignItems: "center" }}>
                  <Ico d={ICON.send} size={11} color="#fff" /> Send
                </span>
              </span>
            </div>
            <div style={{ margin: "16px 14px 0 15px", borderRadius: 10, boxShadow: "0 0 0 1px #efefef", height: 446, overflow: "hidden", fontSize: 12.5 }}>
              {[
                ["Subject", p.subject, INK],
                ["Preview", "A Tesla app, an AI chat tool and a wedding video plugin.", "#666"],
              ].map(([k, v, c]) => (
                <div key={k} style={{ height: 43, display: "flex", alignItems: "center", gap: 26, padding: "0 15px", borderBottom: "1px solid #f1f1f1" }}>
                  <span style={{ color: "#999", width: 44 }}>{k}</span>
                  <span style={{ color: c, fontWeight: k === "Subject" ? 500 : 400 }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 36, display: "flex", alignItems: "center", gap: 16, padding: "0 15px", borderBottom: "1px solid #f4f4f4", color: "#777", fontSize: 11 }}>
                <b>B</b>
                <i>I</i>
                <span>H₂</span>
                <span>☰</span>
                <span style={{ padding: "2px 4px", borderRadius: 4, background: "#f1f1f1" }}>▣</span>
              </div>
              <div style={{ padding: "22px 0 0 110px" }}>
                <div style={{ fontSize: 18.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{p.campaign}</div>
                <div style={{ marginTop: 18 }}>Hi friend,</div>
                <div style={{ marginTop: 9, width: 540, lineHeight: 1.7, color: "#222" }}>Every week I pick the 3 startups on TrustMRR that grew the most. Every number is verified revenue.</div>
                <div style={{ marginTop: 14, width: 440, borderRadius: 10, boxShadow: "0 0 0 1.5px #d6d6d6", padding: 1.5 }}>
                  <Photo w={437} h={136} />
                </div>
                <div style={{ marginTop: 16, fontWeight: 600 }}>This week&apos;s 3</div>
              </div>
            </div>
          </div>
        </div>
      </Slot>
    </div>
  );
}

/* ---------------- the page, in bands (each its own white strip, so the far ones can be left out) ---------------- */

type CardSpec = { x: number; y: number; w: number; h: number; up: number; style?: CSSProperties; body: ReactNode };
/** room round a baked card or band for its shadow */
const SH = 60;
/**
 * A card on the page that rises toward the lens as the camera comes over it (`up` px at most), its shadow left on the
 * page growing as it goes. Both drawn once (baked): the camera only moves them.
 */
function Card({ c, fy, flying, deps, cam, shown }: { c: CardSpec; fy: number; flying: number; deps: unknown[]; cam: string; shown: boolean }) {
  // it rises as it comes into the lower half of the frame, and stays up once the camera has passed
  const k = expo(seg(fy - c.y, -760, 120)) * flying;
  const place = (z: number): CSSProperties => ({ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `${cam} translate3d(${c.x - SH}px, ${c.y - SH}px, ${z}px)` });
  return (
    <>
      <div style={{ ...place(0), opacity: shown ? k : 0 }}>
        <Baked w={c.w + 2 * SH} h={c.h + 2 * SH} scale={0.25} deps={deps}>
          <div style={at(SH + 10, SH + 26, { width: c.w - 20, height: c.h - 10, borderRadius: 26, background: "rgba(0,0,0,.2)", filter: "blur(22px)" })} />
        </Baked>
      </div>
      <div style={{ ...place(c.up * k), opacity: shown ? 1 : 0 }}>
        <Baked pick="page" w={c.w + 2 * SH} h={c.h + 2 * SH} deps={deps}>
          <div style={at(SH, SH, { width: c.w, height: c.h, borderRadius: 22, background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,.05), 0 8px 18px -8px rgba(0,0,0,.1)", overflow: "hidden", padding: 24, boxSizing: "border-box", fontFamily: SANS, color: INK, ...c.style })}>{c.body}</div>
        </Baked>
      </div>
    </>
  );
}
const CardHead = ({ title, line }: { title: string; line: string }) => (
  <>
    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 26, lineHeight: 1 }}>{title}</div>
    <div style={{ marginTop: 6, fontSize: 13.5, color: "#888", lineHeight: 1.4 }}>{line}</div>
  </>
);
/** a strip of the page, drawn once (baked), with the sheet's shadow along its sides */
const Band = ({ y, h, top, deps, children }: { y: number; h: number; top?: boolean; deps: unknown[]; children: ReactNode }) => (
  <div>
    <Baked pick="page" w={PW + 2 * SH} h={h + 1} deps={deps}>
      <div style={at(SH, 0, { width: PW, height: h + 1, background: "#fcfcfb", borderRadius: top ? "44px 44px 0 0" : undefined, boxShadow: "-40px 0 50px -40px rgba(0,0,0,.2), 40px 0 50px -40px rgba(0,0,0,.2)", overflow: "hidden", fontFamily: SANS, color: INK })}>
        <div style={{ position: "absolute", left: 0, top: -y }}>{children}</div>
      </div>
    </Baked>
  </div>
);

/** The page's strips (drawn once each) and its rising cards, made once per set of words. */
function pageParts(p: P, a: string) {
  const [h1, h2] = split(p.hero);
  const [s1, s2] = split(p.sub);
  const [f1, f2] = split(p.features);
  const [ai1, ai2] = split(p.ai);
  const [c1, c2] = split(p.close);
  const deps = [JSON.stringify(p)];
  // the cards that rise off the page as the camera comes over them (drawn apart from the page)
  const cards: CardSpec[] = [
    {
      x: 130,
      y: 1780,
      w: 790,
      h: 480,
      up: 70,
      body: (
        <>
            <CardHead title="Write and send" line="Write with images, headings, lists and links. See the email as you type, in a live preview." />
            <div style={{ display: "flex", gap: 16, marginTop: 22 }}>
              {[0, 1].map((i) => (
                <div key={i} style={{ flex: 1, borderRadius: 14, boxShadow: "0 0 0 1px #eee", padding: 16, height: 300, boxSizing: "border-box" }}>
                  <div style={{ fontSize: 11, color: "#999" }}>{i ? "Marc · Campaign" : "B  I  H₂  ☰"}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, margin: "10px 0" }}>{p.subject}</div>
                  <Photo w={300} h={110} />
                  <Bar w="90%" style={{ marginTop: 14 }} />
                  <Bar w="70%" style={{ marginTop: 9 }} />
                  <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600 }}>This week&apos;s 3</div>
                </div>
              ))}
            </div>
        </>
      ),
    },
    {
      x: 940,
      y: 1780,
      w: 370,
      h: 480,
      up: 110,
      body: (
        <>
            <CardHead title="Schedule" line="Pick a day and a time. It goes out on its own." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 20 }}>
              {Array.from({ length: 28 }, (_, i) => (
                <span key={i} style={{ height: 30, borderRadius: 6, background: i === 17 ? INK : "#f4f4f4", color: i === 17 ? "#fff" : "#999", fontSize: 11, display: "grid", placeItems: "center" }}>
                  {i + 1}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              {["9:00", "12:30", "18:00"].map((s, i) => (
                <span key={s} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, background: i === 1 ? INK : "#f3f3f3", color: i === 1 ? "#fff" : "#666" }}>
                  {s}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 18, height: 40, borderRadius: 10, background: INK, color: "#fff", fontSize: 13, display: "grid", placeItems: "center" }}>Schedule for Tuesday</div>
        </>
      ),
    },
    {
      x: 130,
      y: 2290,
      w: 570,
      h: 430,
      up: 200,
      body: (
        <>
            <CardHead title="Website" line="Every issue is also a page. Your archive, your domain." />
            <div style={{ marginTop: 18, textAlign: "center" }}>
              <span style={{ display: "inline-block", width: 40, height: 40, borderRadius: 20, background: "linear-gradient(135deg, #60a5fa, #a78bfa)" }} />
              <div style={{ fontFamily: DISPLAY, fontSize: 22, marginTop: 6 }}>{p.name} weekly</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ height: 90, borderRadius: 10, background: i % 3 ? "linear-gradient(135deg, #c8a27a, #7a5a3c)" : "linear-gradient(135deg, #3a3f4a, #12141a)" }} />
              ))}
            </div>
        </>
      ),
    },
    {
      x: 720,
      y: 2290,
      w: 590,
      h: 430,
      up: 60,
      body: (
        <>
            <CardHead title="Signup forms and API" line="A form for your site, or one call from your app." />
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <div style={{ flex: 1, height: 40, borderRadius: 9, boxShadow: "0 0 0 1px #e8e8e8", fontSize: 13, color: "#aaa", display: "flex", alignItems: "center", padding: "0 12px" }}>you@example.com</div>
              <div style={{ width: 110, height: 40, borderRadius: 9, background: INK, color: "#fff", fontSize: 13, display: "grid", placeItems: "center" }}>Subscribe</div>
            </div>
            {["Ava Thompson", "Leo Martins", "Mia Chen", "Noah Patel", "Zoe Rossi"].map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, height: 44, borderBottom: "1px solid #f3f3f3", fontSize: 13 }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, background: `hsl(${i * 60 + 20} 60% 75%)` }} />
                {s}
                <span style={{ marginLeft: "auto", color: "#1a9c5b" }}>+ {["2 min", "8 min", "1 h", "3 h", "1 d"][i]}</span>
              </div>
            ))}
        </>
      ),
    },
    {
      x: 130,
      y: 2750,
      w: 380,
      h: 460,
      up: 90,
      body: (
        <>
            <CardHead title="Import" line="From beehiiv, Substack, Mailchimp, in a minute." />
            <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
              {[
                ["beehiiv", "#f5b83d"],
                ["Substack", "#ff6719"],
                ["Mailchimp", "#ffe01b"],
                ["Kit", "#6b7cf6"],
              ].map(([s, c]) => (
                <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, boxShadow: "0 0 0 1px #eee", fontSize: 12 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: c }} />
                  {s}
                </span>
              ))}
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, height: 42, borderBottom: "1px solid #f3f3f3" }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: ["#ede9fe", "#ffedd5", "#dcfce7", "#e0f2fe", "#fce7f3"][i] }} />
                <Bar w={120 + ((i * 37) % 60)} />
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#1a9c5b" }}>✓</span>
              </div>
            ))}
        </>
      ),
    },
    {
      x: 530,
      y: 2750,
      w: 780,
      h: 460,
      up: 300,
      body: (
        <>
            <CardHead title="Stats" line="Opens, clicks and who joined, for every issue." />
            <div style={{ display: "flex", marginTop: 20, borderBottom: "1px solid #f1f1f1", paddingBottom: 14 }}>
              {[
                ["Sent", "61.2K"],
                ["Opened", "48.6%"],
                ["Clicked", "8.8%"],
                ["Unsubscribed", "0.01%"],
              ].map(([k, v]) => (
                <div key={k} style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#999" }}>{k}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{v}</div>
                  <div style={{ fontSize: 11, color: "#1a9c5b", marginTop: 2 }}>↑ {k.length}.4%</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "#999" }}>Subscribers</div>
            <div style={{ fontSize: 30, fontWeight: 600 }}>
              15,641 <span style={{ fontSize: 13, color: "#1a9c5b", fontWeight: 400 }}>+1,203 in 30 days</span>
            </div>
            <svg width="730" height="170" viewBox="0 0 730 170" style={{ marginTop: 6 }}>
              <defs>
                <linearGradient id="fly-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#d4d4d4" />
                  <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              <path d="M0 150 C120 140 200 128 300 112 S520 70 730 30 V170 H0Z" fill="url(#fly-area)" />
              <path d="M0 150 C120 140 200 128 300 112 S520 70 730 30" fill="none" stroke="#9a9a9a" strokeWidth="2" />
            </svg>
        </>
      ),
    },
    {
      x: 130,
      y: 3240,
      w: 570,
      h: 230,
      up: 50,
      body: (
        <>
            <CardHead title="Deliverability" line="Warmed up, authenticated, out of spam." />
            {["SPF", "DKIM", "DMARC"].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", height: 34, fontSize: 13, borderBottom: "1px solid #f4f4f4" }}>
                {s}
                <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 99, background: "#e9f8ef", color: "#1a9c5b", fontSize: 11 }}>Verified</span>
              </div>
            ))}
        </>
      ),
    },
    {
      x: 720,
      y: 3240,
      w: 590,
      h: 230,
      up: 80,
      body: (
        <>
            <CardHead title="Your domain" line="Send from your own name." />
            <div style={{ marginTop: 18, height: 42, borderRadius: 10, boxShadow: "0 0 0 1.5px #d9d9d9", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 14, gap: 8 }}>
              <Ico d={ICON.globe} />
              news.{p.name.toLowerCase()}.com
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#1a9c5b" }}>Connected</span>
            </div>
        </>
      ),
    },
    {
      x: 140,
      y: 5400,
      w: 1160,
      h: 600,
      up: 70,
      style: {  padding: 0, display: "flex"  },
      body: (
        <>
            <div style={{ flex: 1, padding: 40, borderRight: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 14, color: "#888" }}>
                Emails a month
                <span style={{ marginLeft: "auto", display: "flex", gap: 4, padding: 3, borderRadius: 8, background: "#f4f4f4", fontSize: 12 }}>
                  <span style={{ padding: "4px 10px", borderRadius: 6, background: "#fff", color: INK }}>Monthly</span>
                  <span style={{ padding: "4px 10px" }}>
                    Yearly <span style={{ color: "#1a9c5b" }}>2 months free</span>
                  </span>
                </span>
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 92, lineHeight: 1, marginTop: 30 }}>20,000</div>
              <div style={{ fontSize: 14, color: "#999", marginTop: 8 }}>For up to 10,000 subscribers</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 200, marginTop: 40 }}>
                {[
                  ["$12", 40],
                  ["$15", 56],
                  ["$19", 80],
                  ["$149", 110],
                  ["$399", 170],
                ].map(([s, h], i) => (
                  <div key={i} style={{ flex: 1, height: h as number, borderRadius: 8, background: i === 0 ? INK : "#f1f1f1", color: i === 0 ? "#fff" : "#999", fontSize: 12, display: "grid", placeItems: "start center", paddingTop: 8 }}>
                    {s}
                  </div>
                ))}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "#eee", marginTop: 16, position: "relative" }}>
                <span style={{ position: "absolute", left: -2, top: -9, width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: "0 0 0 5px #111 inset" }} />
              </div>
            </div>
            <div style={{ width: 460, padding: 40, boxSizing: "border-box" }}>
              <div style={{ fontSize: 14, color: "#888" }}>Starter</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 64, lineHeight: 1, marginTop: 10 }}>
                {p.price}
                <span style={{ fontFamily: SANS, fontSize: 15, color: "#999" }}> /month</span>
              </div>
              <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>Billed monthly</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 24 }}>Every plan includes</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 12, fontSize: 13.5, color: "#444" }}>
                {["Campaigns", "Scheduling", "Website", "Your own domain", "Signup forms", "Welcome emails", "Imports", "Stats", "AI agents and API", "Chat support"].map((s) => (
                  <span key={s} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <Ico d={ICON.check} size={13} color="#1a9c5b" />
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 30, height: 50, borderRadius: 10, background: INK, color: "#fff", display: "grid", placeItems: "center", fontSize: 15 }}>Subscribe →</div>
              <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#666" }}>83% cheaper than beehiiv</div>
            </div>
        </>
      ),
    },
  ];
  const bands: [number, number, () => ReactNode][] = [
    [
      0,
      1480,
      () => (
        <>
          <div style={at(180, 34, { width: 1080, display: "flex", alignItems: "center", fontFamily: SANS, fontSize: 15 })}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 17 }}>
              <Mark p={p} size={17} />
              {p.name}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 34, color: "#777", alignItems: "center" }}>
              {["Pricing", "Compare", "Docs", "Sign in"].map((s) => (
                <span key={s}>{s}</span>
              ))}
              <span style={{ padding: "7px 16px", borderRadius: 7, background: INK, color: "#fff" }}>Get started</span>
            </span>
          </div>
          <div style={at(0, 128, { width: PW, textAlign: "center", fontFamily: DISPLAY, fontSize: 78, lineHeight: 1.0, letterSpacing: "-0.01em", color: INK })}>
            {h1}
            <br />
            {h2}
          </div>
          <div style={at(0, 316, { width: PW, textAlign: "center", fontFamily: SANS, fontSize: 19, lineHeight: 1.45, color: "#777" })}>
            {s1}
            <br />
            {s2}
          </div>
          <div style={at(PW / 2 - 92, 388, { width: 184, height: 50, borderRadius: 10, background: INK, color: "#fff", display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 17, fontWeight: 500, boxShadow: "0 14px 24px -12px rgba(0,0,0,.45)" })}>Get started →</div>
          <div style={at(PW / 2 - 330, 478, { width: 660, height: 50, borderRadius: 25, background: "#f1f1f0", display: "flex", alignItems: "center", padding: 4, boxSizing: "border-box", gap: 4, fontFamily: SANS, fontSize: 16, color: "#888" })}>
            {[
              ["Write", ICON.pen],
              ["Schedule", ICON.cal],
              ["Stats", ICON.chart],
              ["Website", ICON.globe],
            ].map(([s, d], i) => (
              <span key={s} style={{ flex: 1, height: 42, borderRadius: 21, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: i ? undefined : "#fff", color: i ? "#888" : INK, fontWeight: i ? 400 : 500, boxShadow: i ? undefined : "0 2px 6px rgba(0,0,0,.08)" }}>
                <Ico d={d} size={16} color={i ? "#999" : INK} />
                {s}
              </span>
            ))}
          </div>
          <div style={at(75, 566)}>
            <AppWindow p={p} t={0} zoom={WK} />
          </div>
          <div style={at(0, 1356, { width: PW, textAlign: "center", fontFamily: SANS, fontSize: 15, color: "#999" })}>Everything you can do here, your AI agent can do too. Pick yours ›</div>
          <div style={at(PW / 2 - 106, 1394, { display: "flex", gap: 14 })}>
            {["#e8613c", "#1c1c1c", "#6b7cf6", "#bdbdbd"].map((c, i) => (
              <span key={i} style={{ width: 42, height: 42, borderRadius: 11, background: i === 3 ? "#f2f2f2" : `linear-gradient(160deg, ${hexMix(c, "#ffffff", 0.25)}, ${c})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" }} />
            ))}
          </div>
        </>
      ),
    ],
    [
      1480,
      2080,
      () => (
        <>
          <div style={at(0, 1556, { width: PW, textAlign: "center", fontFamily: DISPLAY, fontSize: 64, lineHeight: 1.0, color: INK })}>
            {f1}
            <br />
            {f2}
          </div>
          <div style={at(100, 1748, { width: 1240, height: 1752, borderRadius: 40, background: "#f3f3f2", transformStyle: "preserve-3d" })} />
        </>
      ),
    ],
    [
      3560,
      740,
      () => (
        <>
          <div style={at(120, 3640, { width: 1200, height: 560, borderRadius: 40, background: "#0a0a0a", color: "#fff", textAlign: "center", boxShadow: "0 30px 60px -30px rgba(0,0,0,.5)" })}>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: -26 }}>
              {["#10a37f", "#d97757", "#111111", "#4f7cff", "#9a9a9a"].map((c, i) => (
                <span key={i} style={{ width: 62, height: 62, borderRadius: 16, background: "#fafafa", display: "grid", placeItems: "center", boxShadow: "0 10px 20px -8px rgba(0,0,0,.6)" }}>
                  <span style={{ width: 34, height: 34, borderRadius: i === 2 ? 8 : 17, background: `radial-gradient(circle at 35% 30%, ${hexMix(c, "#ffffff", 0.35)}, ${c})` }} />
                </span>
              ))}
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 56, lineHeight: 1.0, marginTop: 34 }}>
              {ai1}
              <br />
              {ai2}
            </div>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 44, color: "#d4d4d4", marginTop: 34 }}>{p.aiLine}</div>
            <div style={{ fontFamily: SANS, fontSize: 15, color: "#8a8a8a", marginTop: 22, lineHeight: 1.6 }}>
              Your agent drafts the issue, picks the links and schedules it, with your {p.name} key.
              <br />
              You read it, change a word, and send.
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 36, marginTop: 30, fontFamily: SANS, fontSize: 15, color: "#cfcfcf" }}>
              {["MCP setup ›", "API reference ›", "Read the docs ›"].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
        </>
      ),
    ],
    [
      4300,
      900,
      () => (
        <>
          <div style={at(0, 4380, { width: PW, textAlign: "center", fontFamily: DISPLAY, fontSize: 48, color: INK })}>
            {p.why} {p.name}
          </div>
          <div style={at(420, 4480, { width: 600, fontFamily: SANS, fontSize: 16, lineHeight: 1.75, color: "#444" })}>
            <p style={{ margin: 0 }}>
              Hi, I&apos;m <b>Marc</b>, and I build startups on the internet.
            </p>
            <p style={{ margin: "14px 0 0" }}>
              I paid for <b>beehiiv</b> for two years. They kept raising prices and didn&apos;t add the features I need. When I saw how much I was paying, <b>I built my own</b>.
            </p>
            <p style={{ margin: "14px 0 0" }}>People on the internet asked me for the same thing. So I turned it into {p.name}, for everyone.</p>
            <p style={{ margin: "14px 0 0" }}>
              I use it for <b>my newsletter</b>, with <b>over 50,000 subscribers</b>, and for <b>TrustMRR</b>&apos;s newsletter, with over 15,000.
            </p>
            <ol style={{ margin: "14px 0 0", paddingLeft: 20 }}>
              <li>
                <b>Affordable</b>: at 20,000 subscribers it&apos;s 83% cheaper than beehiiv.
              </li>
              <li>
                <b>Open source</b>: read the code on GitHub, or run it on your own server.
              </li>
              <li>
                <b>AI agent first</b>: your agent can do everything you can.
              </li>
            </ol>
          </div>
        </>
      ),
    ],
    [
      5200,
      1100,
      () => (
        <>
          <div style={at(0, 5250, { width: PW, textAlign: "center", fontFamily: DISPLAY, fontSize: 58, color: INK })}>{p.plans}</div>
        </>
      ),
    ],
    [
      6300,
      700,
      () => (
        <>
          <div style={at(180, 6400, { fontFamily: SERIF, fontStyle: "italic", fontSize: 58, color: INK })}>{p.faq}</div>
          <div style={at(620, 6380, { width: 640, fontFamily: SANS })}>
            {["How do you keep my emails out of spam?", "Why do you charge per email and not per subscriber?", "How does it work with my AI agent?", "Can I bring my list from beehiiv, Substack or Mailchimp?", "Do I need my own domain?", "What happens if I go over my plan?", "Is there a free trial?", "Can I get a refund?", "Who is behind it?"].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", height: 62, borderBottom: "1px solid #ededed", fontSize: 17, color: "#222" }}>
                {s}
                <span style={{ marginLeft: "auto" }}>
                  <Ico d={ICON.down} size={16} color="#999" />
                </span>
              </div>
            ))}
          </div>
        </>
      ),
    ],
    [
      7000,
      700,
      () => (
        <>
          <div style={at(PW / 2 - 130, 7070, { display: "flex", alignItems: "center", gap: 6 })}>
            {["#8b5cf6", "#f97316", "#facc15", "#3b82f6", "#111111"].map((c) => (
              <span key={c} style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(160deg, ${hexMix(c, "#ffffff", 0.3)}, ${c})` }} />
            ))}
            <span style={{ marginLeft: 18, width: 52, height: 34, borderRadius: 17, background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,.1)", display: "grid", placeItems: "center" }}>
              <Mark p={p} size={18} />
            </span>
          </div>
          <div style={at(0, 7140, { width: PW, textAlign: "center", fontFamily: DISPLAY, fontSize: 64, lineHeight: 1.0, color: INK })}>
            {c1}
            <br />
            {c2}
          </div>
          <div style={at(0, 7300, { width: PW, textAlign: "center", fontFamily: SANS, fontSize: 17, color: "#888", lineHeight: 1.5 })}>
            Import it from beehiiv, Substack, Mailchimp and more.
            <br />
            From {p.price} a month, for 20,000 emails.
          </div>
          <div style={at(PW / 2 - 92, 7380, { width: 184, height: 50, borderRadius: 10, background: INK, color: "#fff", display: "grid", placeItems: "center", fontFamily: SANS, fontSize: 16 })}>Get started →</div>
        </>
      ),
    ],
    [
      7700,
      940,
      () => (
        <>
          <div style={at(0, 7760, { width: PW, textAlign: "center", fontFamily: SANS, fontSize: 15, color: "#999" })}>Loved by the people who write on the internet</div>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={at(150 + (i % 6) * 190, 7820 + Math.floor(i / 6) * 210, { width: 170, height: 190, borderRadius: 16, background: "#fff", boxShadow: "0 0 0 1px #eee, 0 10px 20px -12px rgba(0,0,0,.15)", padding: 14, boxSizing: "border-box" })}>
              <span style={{ display: "block", width: 30, height: 30, borderRadius: 15, background: `linear-gradient(135deg, ${alpha(a, 0.5)}, ${a})` }} />
              <Bar w="80%" style={{ marginTop: 14 }} />
              <Bar w="95%" style={{ marginTop: 8 }} />
              <Bar w="60%" style={{ marginTop: 8 }} />
            </div>
          ))}
          <div style={at(180, 8320, { width: 1080, display: "flex", fontFamily: SANS, fontSize: 14, color: "#888", gap: 120 })}>
            <span style={{ display: "flex", gap: 8, alignItems: "center", color: INK, fontWeight: 600 }}>
              <Mark p={p} size={15} />
              {p.name}
            </span>
            {[
              ["Product", "Pricing", "Compare", "Docs"],
              ["Company", "About", "Blog", "Contact"],
              ["Legal", "Terms", "Privacy"],
            ].map((col) => (
              <span key={col[0]} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.map((s, i) => (
                  <span key={s} style={{ color: i ? "#999" : INK }}>
                    {s}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </>
      ),
    ],
  ];
  return {
    deps,
    cards,
    bands: bands.map(([y, h, draw], i) => ({
      y,
      h,
      el: (
        <Band y={y} h={h} top={i === 0} deps={deps}>
          {draw()}
        </Band>
      ),
    })),
  };
}

/**
 * The page under the camera `cam` (its transform from page pixels to the lens): every strip, card and plane a flat
 * sibling placed by the camera itself (one shared 3D space would have the browser sort and split them every frame).
 */
function Page({ p, t, fy, flying, a, show, cam }: { p: P; t: number; fy: number; flying: number; a: string; show: (y0: number, y1: number) => boolean; cam: string }) {
  const key = JSON.stringify(p);
  // made once per set of words: a frame only moves the camera and lifts the cards
  const { bands, cards, deps } = useMemo(() => pageParts(p, a), [key, a]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = (x: number, y: number, z = 0, more = ""): CSSProperties => ({ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `${cam} translate3d(${x}px, ${y}px, ${z}px)${more}` });
  return (
    <>
      {/* far strips are hidden (see-through, never dropped or taken out of the page): each keeps what it has drawn */}
      {bands.map(({ y, h, el }, i) => (
        <div key={i} style={{ ...place(-SH, y), opacity: show(y, y + h) ? 1 : 0 }}>
          {el}
        </div>
      ))}
      {cards.map((c, i) => (
        <Card key={`c${i}`} c={c} fy={fy} flying={flying} deps={deps} cam={cam} shown={show(c.y, c.y + c.h)} />
      ))}
      {/* a video or a live screen in the app window can't be drawn once: it plays over the drawn window */}
      {/^(video|anim):/.test(p.screen) && show(566, 1400) && (
        <div style={{ ...place(75, 566 + 35 * WK), width: DRAWN_W * WK, height: (DRAWN_H - 35) * WK, overflow: "hidden", borderRadius: `0 0 ${14 * WK}px ${14 * WK}px` }}>
          <div style={{ zoom: WK }}>
            <Slot pick="screen" src={p.screen} t={t} w={DRAWN_W} h={DRAWN_H - 35} />
          </div>
        </div>
      )}
      {/* paper planes drifting over the hero; they fly off as the camera pulls back */}
      {t < 0.8 &&
        [
          [300, 182, 74, false, 0],
          [400, 322, 58, false, 1],
          [1102, 300, 50, true, 2],
        ].map(([x, y, w, flip, i]) => {
          const k = acc(seg(t, 0.05 + (i as number) * 0.05, 0.55 + (i as number) * 0.05));
          return (
            <div key={i as number} style={{ ...place((x as number) + ((x as number) < PW / 2 ? -1 : 1) * 160 * k, (y as number) - 120 * k, 40 + 260 * k, ` rotate(${(flip ? 1 : -1) * 12}deg)`), opacity: 1 - k }}>
              <PaperPlane w={w as number} flip={flip as boolean} />
            </div>
          );
        })}
    </>
  );
}

/** Your own page: a picture drawn once into a canvas (a texture the camera only moves), or a video; rounded like the sheet. */
function OwnPage({ src, t, w, h }: { src: string; t: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const url = src.startsWith("image:") ? src.slice(6) : "";
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => ref.current?.getContext("2d")?.drawImage(img, 0, 0, w, h);
    img.src = url;
  }, [url, w, h]);
  return (
    <div data-pick="page" style={{ width: w, height: h, borderRadius: 44, overflow: "hidden", background: "#fff", boxShadow: "0 0 80px rgba(0,0,0,.12)" }}>
      {url ? <canvas ref={ref} width={w} height={Math.round(h)} style={{ display: "block", width: w, height: h }} /> : <Slot src={src} t={t} w={w} h={h} />}
    </div>
  );
}

/* ---------------- the camera ---------------- */

/**
 * The camera, one smooth path: [t, page y under the lens, tilt back (deg), scale there, lens (perspective px), where on
 * the frame that page y sits]. It opens on a long lens close to the hero and widens as it pulls back; glides down the
 * page; whips back to the page standing; draws back to the whole page; dives into its app window (measured against
 * the reference frame by frame).
 */
const PATH: [number, ...number[]][] = [
  [0, 566, 56, 0.99, 3085, 485],
  [0.5, 660, 56, 0.9, 2200, 410],
  [0.95, 820, 55, 0.82, 1500, 330],
  [1.45, 1150, 54, 0.77, 1100, 330],
  [2.2, 1900, 54, 0.77, 1100, 340],
  [2.73, 2350, 54, 0.77, 1100, 350],
  [3.6, 2800, 54, 0.77, 1100, 360],
  [4.5, 3600, 54, 0.77, 1100, 360],
  [5.5, 4400, 54, 0.77, 1100, 360],
  [6.4, 5200, 54, 0.77, 1100, 360],
  [7.4, 6500, 54, 0.77, 1100, 360],
  [7.83, 7000, 54, 0.77, 1100, 360],
  [T.whip, 7280, 52, 0.75, 1100, 380],
  [T.flat, 7360, 12, 0.38, 1100, 540],
  [8.6, 6300, 2, 0.19, 1100, 540],
  [T.whole, 4320, 0, 0.124, 1100, 540],
  [T.dive, 4300, 0, 0.127, 1100, 540],
  [9.5, 940, 0, 0.22, 1100, 150],
  [T.close, 940, 0, 0.6, 1100, 360],
];
/** the two planes flying off the hero past the lens: [t, out from the middle, y, scale] */
const PLANES: [number, ...number[]][] = [
  [0.1, 300, 290, 0.35],
  [0.45, 615, 165, 0.66],
  [0.75, 625, 92, 0.72],
  [0.95, 635, 52, 0.8],
  [1.2, 640, 38, 0.86],
  [1.45, 670, -20, 0.95],
  [1.75, 760, -200, 1.1],
];

export default function SiteFlyover({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const ready = useWebFonts(FONTS, ['400 40px "Gloock"', '400 40px "Instrument Serif"', 'italic 40px "Instrument Serif"']);
  const t = useClock(DUR);
  const a = p.accent;
  const [c1, c2] = split(p.close);
  // your site in place of the one drawn here: as tall as its picture, the camera's path scaled to it
  const ar = useAspect(p.page, PW / PH);
  const own = /^(image|video):/.test(p.page);
  const ph = own ? PW / ar : PH;
  const sy = ph / PH;

  const [fy0, rx, s0, lens, cy] = glide(t, PATH);
  const fy = fy0 * sy;
  const z = lens / s0 - lens;
  const whip = seg(t, T.whip, T.flat);
  const flying = 1 - seg(t, T.whip, T.flat);
  const closing = t >= T.close;
  // shallow focus: far soft, near softer; gone once the page stands, back for the dive
  const dof = Math.max(flying, seg(t, 9.38, 9.6));
  // the whip smears the page along its travel; the dive blurs it (the lens can't keep up)
  const smear = 70 * Math.sin(Math.PI * whip);
  const blur = 10 * inOut(seg(t, 9.38, 9.66));
  const cam = `translate3d(960px, ${cy}px, ${-z}px) rotateX(${rx}deg) translate3d(${-PW / 2}px, ${-fy}px, 0)`;
  const near = (y0: number, y1: number) => !flying || (y1 > fy - 2200 && y0 < fy + 1700);

  // the closing shot: out of focus as it cuts in, then sharp; the line written in word by word
  const sharp = expo(seg(t, T.close, T.close + 0.2));
  return (
    <Stage background="#ebeae7" style={{ fontFamily: SANS, color: INK }}>
      {ready && (
        <div data-film="" style={{ ...fill, background: "radial-gradient(ellipse 80% 70% at 50% 35%, #f4f3f1, #e7e6e3)" }}>
          {/* kept while the closing shot plays (hidden), so its drawn strips are there when the film loops */}
          {(
            <div style={{ ...fill, opacity: closing ? 0 : 1, perspective: lens, perspectiveOrigin: "960px 540px", willChange: "filter", filter: smear + blur > 0.3 ? `blur(${smear * 0.15 + blur}px)` : undefined }}>
              {own ? (
                <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: cam }}>
                  <OwnPage src={p.page} t={t} w={PW} h={ph} />
                </div>
              ) : (
                <Page p={p} t={t} fy={fy} flying={flying} a={a} show={near} cam={cam} />
              )}
            </div>
          )}
          {/* shallow focus: the near page (the bottom of the frame) melts, the far edge softens */}
          {!closing && dof > 0.01 && (
            <>
              <div style={at(0, 560, { width: 1920, height: 520, backdropFilter: `blur(${14 * dof}px)`, WebkitBackdropFilter: `blur(${14 * dof}px)`, maskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.6) 34%, #000 67%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.6) 34%, #000 67%)" })} />
              <div style={at(0, 0, { width: 1920, height: 200, backdropFilter: `blur(${3 * dof}px)`, WebkitBackdropFilter: `blur(${3 * dof}px)`, maskImage: "linear-gradient(180deg, #000 0%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 100%)" })} />
            </>
          )}
          {/* two planes fly off the hero, past the lens, as the camera pulls back */}
          {t > 0.1 &&
            t < 1.75 &&
            [-1, 1].map((side) => {
              const [dx, y, s] = glide(t, PLANES);
              return (
                <div key={side} style={at(960 + side * dx - 60, y - 60, { width: 120, height: 120, opacity: seg(t, 0.1, 0.22), transform: `scale(${s}) rotateY(${side * -16}deg) rotateZ(${side * -4}deg)`, borderRadius: 26, background: "linear-gradient(180deg, #fbfbfa, #f1f1f0)", boxShadow: "0 0 0 1px rgba(0,0,0,.04), 0 16px 30px -14px rgba(0,0,0,.3)", display: "grid", placeItems: "center", })}>
                  <Mark p={p} size={70} />
                </div>
              );
            })}
          {(
            <div style={{ ...fill, opacity: closing ? 1 : 0, willChange: "filter, opacity", filter: sharp < 0.999 ? `blur(${(1 - sharp) * 14}px)` : undefined }}>
              <div style={at(281, 0, { width: 1357, height: 1080 })}>
                {/* out-of-focus planes in the foreground, low in the corners */}
                <div style={at(-140, 860, { width: 420, height: 300, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(90,90,90,.34), transparent)", filter: "blur(30px)" })} />
                <div style={at(1080, 880, { width: 420, height: 300, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(90,90,90,.3), transparent)", filter: "blur(30px)" })} />
                <div style={at(596, 40, { height: 42, padding: "0 18px 0 14px", borderRadius: 21, background: "rgba(255,255,255,.55)", boxShadow: "0 0 0 1px rgba(255,255,255,.7)", display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, fontSize: 25, color: INK, opacity: seg(t, T.words - 0.1, T.words + 0.2) })}>
                  <Mark p={p} size={17} />
                  {p.name}
                </div>
                <div style={at(0, 92, { width: 1357, textAlign: "center", fontFamily: SERIF, fontSize: 73, lineHeight: "67px", letterSpacing: "-0.012em", color: INK, WebkitTextStroke: "0.5px currentColor" })}>
                  {[c1, c2].map((line, row) => (
                    <div key={row} style={{ fontStyle: row ? "italic" : undefined, color: row ? "#6a6a68" : INK }}>
                      {line.split(" ").map((w, i, all) => {
                        // word by word out of a blur, each landing grey and inking in; the second line follows the first
                        const at0 = T.words + (row ? 0.26 + i * 0.08 : i * 0.08);
                        const k = out(seg(t, at0, at0 + 0.32));
                        const ink = seg(t, at0 + 0.08, at0 + 0.32);
                        return (
                          <span key={i} style={{ display: "inline-block", opacity: k, filter: k < 0.99 ? `blur(${(1 - k) * 8}px)` : undefined, color: row ? undefined : mixInk(ink) }}>
                            {w}
                            {i < all.length - 1 ? " " : ""}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div style={at(194 - 60, 262 - 60)}>
                  <Baked w={DRAWN_W + 120} h={DRAWN_H + 120} scale={1} deps={[JSON.stringify(p)]}>
                    <div style={at(60, 60)}>
                      <AppWindow p={p} t={0} />
                    </div>
                  </Baked>
                </div>
                {/* a video or a live screen of yours plays over the drawn window */}
                {/^(video|anim):/.test(p.screen) && (
                  <div style={at(194, 262 + 35, { width: DRAWN_W, height: DRAWN_H - 35, overflow: "hidden", borderRadius: "0 0 14px 14px" })}>
                    <Slot pick="screen" src={p.screen} t={t} w={DRAWN_W} h={DRAWN_H - 35} />
                  </div>
                )}
                {[
                  [147, 185, 105, 1],
                  [1094, 180, 117, -1],
                ].map(([x, y, s, side]) => (
                  <div key={side} style={at(x, y, { width: s, height: s, borderRadius: s * 0.22, background: "linear-gradient(180deg, #fbfbfa, #f1f1f0)", boxShadow: "0 0 0 1px rgba(0,0,0,.03), 0 18px 30px -16px rgba(0,0,0,.28)", display: "grid", placeItems: "center", transform: `perspective(600px) rotateY(${side * 14}deg) translateY(${Math.sin((t - T.close) * 1.4 + side) * 3}px)` })}>
                    <Mark p={p} size={s * 0.58} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Stage>
  );
}

/** the last word of the closing line starts grey and inks in */
const mixInk = (k: number) => `rgb(${Math.round(lerp(150, 18, k))},${Math.round(lerp(150, 18, k))},${Math.round(lerp(148, 18, k))})`;
