// Feature spotlight: a square feature film on warm paper, replicated from a design tool's "Tabs" film (an 8.3 s loop).
// Its beats, measured frame by frame: the camera along the app's window to its +, clicked (1.3 s); a new tab,
// "Introducing…", typed inside a selection (1.75); the feature's name huge among its tags (2.58), whipped away
// (3.25); four words typed over the app as it slides by, switching pages (3.66, 4.25, 4.75, 5.15); everything
// fading under a selection that closes on the mark (5.45); the mark opening into an artboard (6.45) that gathers
// into the app icon (7.2), clicked (8.12), which opens the app: the start again.
// The home screen, the three pages, the mark and the icon can be the user's own (screen slots).
import type { CSSProperties, ReactNode } from "react";
import { Baked, Cursor, Slot, Stage, at, expo, fill, glide, hexMix, inOut, lerp, measure, move, out, readSlot, seg, useClock, useFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 8.3;
const S = 1080;
const T = { plus: 1.3, intro: 1.75, word: 2.58, whip: 3.25, words: 3.66, ghost: 5.45, mark: 5.9, blue: 6.36, board: 6.45, shrink: 7.2, icon: 7.6, fillBlue: 7.86, press: 8.12 };
const CUTS = [T.words, 4.28, 4.76, 5.17];
const PAPER = "#f5f4f0";
const LINE = "#e4e3de";
const INK = "#141414";
const SANS = '"Geist", "Inter", system-ui, sans-serif';
const split = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);
/** the paper's grain, drawn once */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>')}")`;

/* ---------------- small pieces of the app ---------------- */

/** six dots in two rows: the tab's grip, in shades of the accent */
const Grip = ({ s, a }: { s: number; a: string }) => (
  <svg width={s * 1.5} height={s} viewBox="0 0 15 10" style={{ flex: "none" }} aria-hidden>
    {[0, 1].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={2 + c * 5.5} cy={2.5 + r * 5} r={1.7} fill={hexMix(a, "#ffffff", (2 - c) * 0.28 + r * 0.05)} />))}
  </svg>
);

function Pill({ label, a, h = 34, style }: { label: ReactNode; a: string; h?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: h * 0.32, height: h, padding: `0 ${h * 0.4}px`, borderRadius: h * 0.24, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.05), 0 4px 14px -6px rgba(0,0,0,.1), 0 0 0 1px rgba(0,0,0,.035)", fontFamily: SANS, fontSize: h * 0.45, fontWeight: 500, color: "#2b2b2b", whiteSpace: "nowrap", ...style }}>
      <Grip s={h * 0.3} a={a} />
      <span>{label}</span>
    </div>
  );
}

const Lights = ({ s = 16 }: { s?: number }) => (
  <div style={{ display: "flex", gap: s * 0.5 }}>
    {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
      <span key={c} style={{ width: s, height: s, borderRadius: s, background: c }} />
    ))}
  </div>
);
const Icon = ({ k }: { k: "grid" | "page" }) =>
  k === "grid" ? (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#777" strokeWidth="1.2" aria-hidden>
      <rect x="1" y="1" width="4.5" height="4.5" rx="1" />
      <rect x="7.5" y="1" width="4.5" height="4.5" rx="1" />
      <rect x="1" y="7.5" width="4.5" height="4.5" rx="1" />
      <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" />
    </svg>
  ) : (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="#777" strokeWidth="1.2" aria-hidden>
      <path d="M2 1h5l3 3v8H2z" />
    </svg>
  );

const TAB_FONT = `500 15px ${SANS}`;
const EDIT_FONT = `500 13px ${SANS}`;
/** where each tab starts, and where the + is, in the window's own pixels */
const tabRow = (tabs: string[]) => {
  let x = 104;
  const xs = tabs.map((t) => {
    const w = 13 + 8 + measure(t, TAB_FONT) + 28;
    const r = { x, w };
    x += w + 16;
    return r;
  });
  return { xs, plus: x + 10 };
};

/** room round the baked home window for its shadow */
const DM = 100;
/** the home window's sidebar and recent files (yours in their place, below the tabs) */
const HomeContent = ({ p }: { p: P }) => (
  <Slot pick="dashboard" src={p.dashboard} w={1480} h={848}>
    <div style={{ ...at(0, 0), width: 260, height: 848, background: "#f7f7f5", borderRight: "1px solid #ecebe7", fontSize: 14 }}>
      <div style={at(20, 14, { display: "flex", alignItems: "center", gap: 10, fontWeight: 500, fontSize: 15 })}>
        <span style={{ width: 26, height: 26, borderRadius: 99, background: `linear-gradient(135deg, #22d3ee, #3b82f6 55%, #3b5bdb)` }} />
        {p.user} <span style={{ color: "#999", fontSize: 11 }}>⌄</span>
      </div>
      {["Recents", "Learn", "", p.name.toLowerCase().slice(0, 3), "Files", "Archive", "Settings"].map((n, i) =>
        n ? (
          <div key={i} style={at(12, 72 + i * 36, { width: 216, height: 30, borderRadius: 7, paddingLeft: 16, display: "flex", alignItems: "center", background: i === 0 ? "#ebebe8" : undefined, color: "#444" })}>
            {n}
          </div>
        ) : (
          <div key={i} style={at(0, 72 + i * 36 + 14, { width: 260, height: 1, background: "#e8e7e3" })} />
        ),
      )}
    </div>
    <div style={at(340, 30, { fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" })}>Recent</div>
    {["Scratchpad", "Quirky umbrella", "Launch notes"].map((n, i) => (
      <div key={n} style={at(336 + i * 358, 108, { width: 330, height: 360, borderRadius: 10, border: "1px solid #ecebe7", background: "#fff", padding: 14, boxSizing: "border-box" })}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{n} ✎</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>{i ? "Edited just now" : "Your permanent draft"}</div>
        <div style={{ marginTop: 12, height: 280, borderRadius: 6, background: "#ededeb" }} />
      </div>
    ))}
  </Slot>
);

/**
 * The home window: drawn once at the camera's zoom (baked: moving it never re-draws it), its tabs and the + live on
 * top (they fade in, and the + is clicked). A video or a live screen of yours plays over it.
 */
function Dashboard({ p, t, a, adding = 0, tabsIn = 1 }: { p: P; t: number; a: string; adding?: number; tabsIn?: number }) {
  const tabs = split(p.tabs);
  const { xs, plus } = tabRow(tabs);
  const live = /^(video|anim):/.test(p.dashboard);
  return (
    <div style={{ position: "relative", width: 1480, height: 900, fontFamily: SANS, color: "#222" }}>
      <div style={at(-DM, -DM)}>
        <Baked w={1480 + 2 * DM} h={900 + 2 * DM} scale={2.17} deps={[p.user, p.name, p.dashboard]}>
          <div style={at(DM, DM, { width: 1480, height: 900, borderRadius: 16, background: "#fff", overflow: "hidden", boxShadow: "0 30px 80px -30px rgba(0,0,0,.16), 0 0 0 1px #e6e5e0", fontFamily: SANS, color: "#222" })}>
            <div style={{ ...at(0, 0), width: 1480, height: 52, background: "#f7f7f5", borderBottom: "1px solid #ecebe7" }}>
              <div style={at(18, 18)}>
                <Lights />
              </div>
            </div>
            <div style={{ ...at(0, 52), width: 1480, height: 848 }}>{!live && <HomeContent p={p} />}</div>
          </div>
        </Baked>
      </div>
      {live && (
        <div style={at(0, 52, { width: 1480, height: 848, overflow: "hidden", borderRadius: "0 0 16px 16px" })}>
          <Slot pick="dashboard" src={p.dashboard} t={t} w={1480} h={848} />
        </div>
      )}
      {tabs.map((tab, i) => (
        <div key={tab} style={at(xs[i].x, 9, { opacity: tabsIn, width: xs[i].w, height: 34, borderRadius: 8, display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, boxSizing: "border-box", background: i === 0 ? "#fff" : undefined, boxShadow: i === 0 ? "0 0 0 1px #e8e7e3" : undefined, fontSize: 15, fontWeight: 500, color: i === 0 ? "#222" : "#444" })}>
          <Icon k={i === 0 ? "grid" : "page"} />
          {tab}
        </div>
      ))}
      <div style={at(plus - 12, 14, { width: 24, height: 24, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 20, lineHeight: 1, color: adding > 0 ? "#2f55c8" : "#777", background: adding > 0 ? hexMix(a, "#ffffff", 0.35) : undefined })}>+</div>
    </div>
  );
}

/* ---------------- the editor, switching pages under the words ---------------- */

function Blocks({ a }: { a: string }) {
  const cubes = [
    [0, 0, "#f2c94c"],
    [1, 0, "#2d9cdb"],
    [0, 1, "#27ae60"],
    [1, 1, "#f2c94c"],
    [0, 2, a],
  ] as const;
  return (
    <div style={{ ...fill, background: "#3a3a3c", perspective: 900 }}>
      <div style={at(16, 14, { width: 40, height: 16, borderRadius: 8, background: "#1c1c1c", color: "#bbb", fontSize: 8, display: "grid", placeItems: "center" })}>Closed</div>
      <div style={at(420, 220, { transformStyle: "preserve-3d", transform: "rotateX(-24deg) rotateY(38deg)" })}>
        {cubes.map(([x, y, c], i) => (
          <div key={i} style={{ position: "absolute", transformStyle: "preserve-3d", transform: `translate3d(${x * 92}px, ${-y * 92}px, 0)` }}>
            {[
              ["translateZ(45px)", c],
              ["rotateY(90deg) translateZ(45px)", hexMix(c, "#000000", 0.25)],
              ["rotateX(90deg) translateZ(45px)", hexMix(c, "#ffffff", 0.2)],
            ].map(([tf, col], j) => (
              <div key={j} style={{ position: "absolute", width: 90, height: 90, background: col, transform: tf }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const Landing = ({ p }: { p: P }) => (
  <div style={{ ...fill, background: "#fff" }}>
    <div style={at(24, 22, { width: 26, height: 18, borderRadius: 4, background: "#111" })} />
    <div style={at(380, 20, { display: "flex", gap: 6 })}>
      {["Features", "Examples", "Waitlist"].map((s, i) => (
        <span key={s} style={{ fontSize: 10, padding: "4px 10px", borderRadius: 99, background: i ? undefined : "#f1f1f1", color: "#666" }}>
          {s}
        </span>
      ))}
    </div>
    <div style={at(150, 140, { width: 600, textAlign: "center", fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05, color: "#111" })}>{p.headline}</div>
    <div style={at(250, 262, { width: 400, textAlign: "center", fontSize: 11, lineHeight: 1.5, color: "#999" })}>A real-time motion graphics editor built around reusable modules. Create complex 3D animations in an advanced interface.</div>
    <div style={at(390, 330, { width: 120, height: 26, borderRadius: 99, background: "#111", color: "#fff", fontSize: 10, display: "grid", placeItems: "center" })}>Request access</div>
  </div>
);

const Device = () => (
  <div style={{ ...fill, background: "#050505" }}>
    <div style={at(150, 60, { width: 600, height: 600, borderRadius: 40, background: "linear-gradient(160deg, #d9dadc, #a9abaf)", boxShadow: "inset 0 2px 0 #fff" })}>
      <div style={at(70, 120, { width: 460, height: 460, borderRadius: 999, background: "radial-gradient(circle at 45% 40%, #e4e5e7, #b8babd 60%, #8e9094)", boxShadow: "inset 0 0 0 3px rgba(0,0,0,.08)" })} />
      <div style={at(420, 30, { width: 130, height: 66, borderRadius: 8, background: "#111", color: "#fff", fontFamily: '"Geist Mono", monospace', fontSize: 16, padding: 8, boxSizing: "border-box" })}>TODAY</div>
      <div style={at(40, 30, { fontFamily: '"Geist Mono", monospace', fontSize: 26, color: "#555" })}>TP-7</div>
      <div style={at(540, 160, { width: 18, height: 18, borderRadius: 9, background: "#f26b1d" })} />
    </div>
  </div>
);

/** the app's editor (1500×700 at 1×): its pages as tabs, the page for word `page` open on its canvas */
function Editor({ p, t, a, page }: { p: P; t: number; a: string; page: number }) {
  const pages = ["Dashboard", ...split(p.pages)];
  const xs: number[] = [];
  let x = 100;
  for (const pg of pages) {
    xs.push(x);
    x += 13 + 8 + measure(pg, EDIT_FONT) + 18;
  }
  const canvas = [
    <div key="m" style={{ ...fill, background: "#ededeb" }} />,
    <Slot key="1" pick="screen1" src={p.screen1} t={t} w={900} h={600}>
      <Blocks a={a} />
    </Slot>,
    <Slot key="2" pick="screen2" src={p.screen2} t={t} w={900} h={600}>
      <Landing p={p} />
    </Slot>,
    <Slot key="3" pick="screen3" src={p.screen3} t={t} w={900} h={600}>
      <Device />
    </Slot>,
  ];
  const mine = [p.dashboard, p.screen1, p.screen2, p.screen3][page] ?? "";
  return (
    <div style={{ position: "relative", width: 1500, height: 700, borderRadius: 14, background: "#fff", overflow: "hidden", boxShadow: "0 30px 80px -30px rgba(0,0,0,.18), 0 0 0 1px #e6e5e0", fontFamily: SANS, color: "#333" }}>
      <div style={{ ...at(0, 0), width: 1500, height: 46, background: "#f7f7f5", borderBottom: "1px solid #ecebe7" }}>
        <div style={at(18, 15)}>
          <Lights />
        </div>
        {pages.map((pg, i) => (
          <div key={pg} style={at(xs[i] - 5, 7, { height: 32, borderRadius: 7, display: "flex", alignItems: "center", gap: 8, padding: "0 9px", fontSize: 13, fontWeight: 500, background: i === page + 1 ? "#fff" : undefined, boxShadow: i === page + 1 ? "0 0 0 1px #e8e7e3" : undefined, color: i === page + 1 ? "#222" : "#555" })}>
            <Icon k="grid" />
            {pg}
          </div>
        ))}
      </div>
      {/* the product's own screen for this page, filling the window from its top: no drawn editor around it */}
      {mine ? (
        <div style={at(0, 46, { width: 1500, height: 654, overflow: "hidden" })}>
          <Slot src={mine} t={t} w={1500} h={654} style={readSlot(mine).focus ? undefined : { objectPosition: "50% 0%" }} />
        </div>
      ) : (
      <>
      <div style={{ ...at(0, 46), width: 240, height: 654, background: "#f7f7f5", borderRight: "1px solid #ecebe7", fontSize: 13 }}>
        <div style={at(18, 18, { display: "flex", alignItems: "center", gap: 8, fontWeight: 500 })}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: "#222" }} /> {p.name}
        </div>
        <div style={at(14, 56, { width: 210, height: 28, borderRadius: 7, background: "#ebebe8", display: "flex", padding: 2, boxSizing: "border-box" })}>
          {["Design", "Theme"].map((s, i) => (
            <span key={s} style={{ flex: 1, display: "grid", placeItems: "center", borderRadius: 5, background: i ? undefined : "#fff", fontSize: 12, color: i ? "#888" : "#222" }}>
              {s}
            </span>
          ))}
        </div>
        <div style={at(18, 104, { fontSize: 12, color: "#666" })}>⌄ Pages</div>
        {["moodboard", p.name.toLowerCase(), `${p.name.toLowerCase()} light`].map((s, i) => (
          <div key={s} style={at(10, 130 + i * 30, { width: 220, height: 26, borderRadius: 6, paddingLeft: 26, display: "flex", alignItems: "center", background: i === 2 ? "#ebebe8" : undefined, color: "#444" })}>
            {s}
          </div>
        ))}
      </div>
      <div style={{ ...at(240, 46), width: 46, height: 654, borderRight: "1px solid #ecebe7" }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={at(14, 16 + i * 40, { width: 18, height: 18, borderRadius: 4, border: "1.5px solid #888" })} />
        ))}
      </div>
      {/* the page's artboard, at the editor's zoom (drawn at 900×600) */}
      <div style={at(365, 88)}>
        <div style={{ width: 900, height: 600, borderRadius: 8, overflow: "hidden", zoom: 0.46 }}>{canvas[page]}</div>
      </div>
      </>
      )}
    </div>
  );
}

/* ---------------- the mark and the icon ---------------- */

/** the product's mark when it has none: its first letter, heavy, over a black lozenge */
const Mark = ({ p, s }: { p: P; s: number }) => (
  <Slot pick="mark" src={p.mark} w={s} h={s} fit="contain">
    <svg width={s} height={s} viewBox="0 0 100 100" aria-hidden>
      <text x="50" y="50" textAnchor="middle" fontFamily={SANS} fontWeight="900" fontSize="54" letterSpacing="-3" fill={INK}>
        {(p.name.trim()[0] ?? "•").toLowerCase()}
      </text>
      <rect x="14" y="54" width="72" height="30" rx="15" fill={INK} />
      <rect x="45" y="58" width="10" height="22" rx="3" fill="#fff" />
    </svg>
  </Slot>
);

/** a selection: a frame with four handles, and (optionally) the guides through its edges */
function Selection({ x, y, w, h, o = 1, guides = true, fillColor = "#ebeae6", line = "transparent", children }: { x: number; y: number; w: number; h: number; o?: number; guides?: boolean; fillColor?: string; line?: string; children?: ReactNode }) {
  const handle = (hx: number, hy: number) => <div key={`${hx}${hy}`} style={at(hx - 7, hy - 7, { width: 14, height: 14, borderRadius: 4, background: "#fff", boxShadow: "0 0 0 1.5px #d2d1cc" })} />;
  return (
    <div style={{ ...fill, opacity: o }}>
      {guides && [x, x + w].map((gx, i) => <div key={`v${i}`} style={at(gx, 0, { width: 1.5, height: S, background: LINE })} />)}
      {guides && [y, y + h].map((gy, i) => <div key={`h${i}`} style={at(0, gy, { width: S, height: 1.5, background: LINE })} />)}
      <div style={at(x, y, { width: w, height: h, background: fillColor, boxShadow: `inset 0 0 0 2px ${line}`, overflow: "hidden" })}>{children}</div>
      {[handle(x, y), handle(x + w, y), handle(x, y + h), handle(x + w, y + h)]}
    </div>
  );
}

/** the paper's rulers along the top and the left, and the artboard's edge */
const Rulers = ({ o = 1 }: { o?: number }) => (
  <div style={{ ...fill, opacity: o }}>
    <div style={at(0, 0, { width: S, height: 14, background: `repeating-linear-gradient(90deg, ${LINE} 0 1.5px, transparent 1.5px 12px)` })} />
    <div style={at(0, 0, { width: 14, height: S, background: `repeating-linear-gradient(180deg, ${LINE} 0 1.5px, transparent 1.5px 12px)` })} />
    <div style={at(60, 52, { width: 962, height: 970, boxShadow: `inset 0 0 0 1.5px ${LINE}` })} />
  </div>
);

/* ---------------- typing ---------------- */

/**
 * Letters coming in left to right, each landing pale and inking in (the reference's typing). The ink is a copy of the
 * letter over it, fading in on its own layer: a big word inks in without being re-drawn every frame.
 */
function Typed({ text, t, at: t0, per = 0.017, ink = 0.22, color = "#1a1a1a", pale = "#d6d5d0" }: { text: string; t: number; at: number; per?: number; ink?: number; color?: string; pale?: string }) {
  return (
    <>
      {[...text].map((c, i) => {
        const k = t - t0 - i * per;
        const inked = seg(k, 0, ink);
        return (
          <span key={i} style={{ position: "relative", color: pale, opacity: k > 0 ? 1 : 0 }}>
            {c}
            <span aria-hidden style={{ position: "absolute", left: 0, top: 0, lineHeight: "normal", color, opacity: inked, willChange: "opacity" }}>
              {c}
            </span>
          </span>
        );
      })}
    </>
  );
}

/* ---------------- the scenes ---------------- */

/** the camera along the home window: rising into view as the last shot's icon opens it, up to its tabs, on to the +, into it */
const homePath = (plus: number): [number, ...number[]][] => [
  [-0.15, 186, -230, 2.17],
  [-0.03, 188, -23, 2.17],
  [0.02, 188, 55, 2.17],
  [0.3, 201, 155, 2.17],
  [0.6, 364, 188, 2.17],
  [T.plus, plus + 6.5, 187, 2.17],
  [1.5, plus + 6.5, 187, 2.17],
  [1.62, plus + 6.5, 126, 2.6],
  [T.intro, plus + 5, 105, 3.6],
];

function Home({ t, p, a, plus, press = 0 }: { t: number; p: P; a: string; plus: number; press?: number }) {
  const [cx, cy, z] = glide(t, homePath(plus));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate3d(${S / 2}px, ${S / 2}px, 0) scale(${z}) translate3d(${-cx}px, ${-cy}px, 0)` }}>
      <Dashboard p={p} t={t} a={a} adding={press} tabsIn={seg(t, 0.04, 0.4)} />
    </div>
  );
}

function Opening({ t, p, a }: { t: number; p: P; a: string }) {
  const fade = seg(t, 1.55, T.intro);
  const [mx, my] = glide(t, [
    [0.75, 690, 760],
    [1.0, 470, 292],
    [1.22, 516, 212],
    [T.plus, 524, 200],
  ]);
  return (
    <div style={fill}>
      <Rulers o={1 - fade} />
      <div style={{ ...fill, opacity: 1 - fade * 0.75 }}>{t > 0.75 && <Cursor x={mx - 4} y={my - 4} press={seg(t, T.plus - 0.06, T.plus) * (1 - seg(t, T.plus + 0.05, T.plus + 0.15))} size={1.25} />}</div>
    </div>
  );
}

function Introducing({ t, p, a }: { t: number; p: P; a: string }) {
  const label = split(p.tags).find((x) => /introduc/i.test(x)) ?? "Introducing…";
  // typed fast, already under way as it cuts in; the pill hugs what's typed so far
  const typedAt = 1.716;
  const per = 0.014;
  const shown = label.slice(0, Math.max(1, Math.min(label.length, Math.ceil((t - typedAt) / per))));
  const FONT = 74;
  const pw = 75 + 77 + 46 + measure(shown, `500 ${FONT}px ${SANS}`) + 103;
  const ph = 146;
  // the camera on the pill, inside the selection (the frame all grey), the selection closing in round it, then
  // drawing back and up as the selection lets more of the board in below (measured off the reference)
  const [s, cy, padX, padTop, padBottom] = glide(t, [
    [T.intro, 0.88, 457, 640, 640, 640],
    [1.9, 0.96, 513, 140, 200, 200],
    [2.2, 1, 540, 44, 82, 82],
    [2.3, 1, 540, 44, 82, 82],
    [T.word, 0.82, 459, 100, 104, 280],
  ]);
  const X = (wx: number) => S / 2 + (wx - 540) * s;
  const Y = (wy: number) => cy + (wy - 540) * s;
  const rw = pw + padX * 2;
  return (
    <div style={fill}>
      <Selection x={X(540 - rw / 2)} y={Y(540 - ph / 2 - padTop)} w={rw * s} h={(ph + padTop + padBottom) * s} />
      <div style={at(X(540 - pw / 2), Y(540 - ph / 2), { transformOrigin: "0 0", transform: `scale(${s})` })}>
        <div style={{ width: pw, height: ph, boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 0 0 75px", borderRadius: 30, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.05), 0 6px 18px -8px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.035)", fontFamily: SANS, fontSize: FONT, fontWeight: 500, color: "#2b2b2b", whiteSpace: "nowrap" }}>
          <Grip s={51} a={a} />
          <span style={{ marginLeft: 46 }}>
            <Typed text={label} t={t} at={typedAt} per={per} ink={0.22} color="#2b2b2b" pale="#d9d9d6" />
          </span>
        </div>
      </div>
    </div>
  );
}

function Feature({ t, p, a }: { t: number; p: P; a: string }) {
  const tags = split(p.tags);
  const rows = [0, 1, 2, 3].map((r) => tags.slice(r * 5, r * 5 + 5));
  const rowY = [113, 237, 846, 954];
  const start = [-60, -10, -66, -7];
  // rows drift against each other (the 1st and 3rd right, the 2nd and 4th left), the word left; then the whip throws it all left
  const drift = [55, -240, 65, -230];
  const dt = t - T.word;
  const w = Math.max(0, t - 3.22);
  const whip = 9000 * w * w;
  const z = lerp(1.07, 1, out(seg(t, T.word, 2.85)));
  // the board stretches to the full height and narrows to a column, which fades under the words
  const col = inOut(seg(t, 3.36, 3.52));
  const box = { x: lerp(60, 368, col), y: lerp(56, 0, col), w: lerp(962, 352, col), h: lerp(938, S, col) };
  const gone = seg(t, 3.6, 3.78);
  const H = 72;
  return (
    <div style={fill}>
      <Selection x={box.x} y={box.y} w={box.w} h={box.h} o={1 - gone} guides={false} />
      <div style={at(60, 56, { width: 962, height: 938, overflow: "hidden", opacity: 1 - seg(t, 3.38, 3.47) })}>
        <div style={{ ...fill, transformOrigin: "480px 470px", transform: `scale(${z})` }}>
          {rows.map((row, ri) => (
            <div key={ri} style={move(start[ri] - 60 + dt * drift[ri] - whip, rowY[ri] - 56 - H / 2, { display: "flex", gap: 28, willChange: "transform" })}>
              {row.map((tag, i) => {
                const fadeAt = 3.27 + ((i * 7 + ri * 3) % 5) * 0.03;
                return (
                  <div key={i} style={{ opacity: (1 - seg(t, fadeAt, fadeAt + 0.06)) * seg(t, T.word, T.word + 0.08) }}>
                    <Pill label={tag} a={a} h={H} />
                  </div>
                );
              })}
            </div>
          ))}
          <div style={move(120 - 60 - dt * 50 - whip * 0.4, 248, { fontFamily: SANS, fontWeight: 600, fontSize: 436, lineHeight: "436px", letterSpacing: "-0.05em", whiteSpace: "nowrap", willChange: "transform" })}>
            <Typed text={p.feature} t={t} at={T.word} per={0.04} ink={0.18} color={INK} pale="#c9c8c3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** what's at work with each word: the product's mark, then its screens (round, cropped to where to look), one a word.
    Without screens, discs in shades of the accent (never another company's mark). */
function Faces({ step, p, a }: { step: number; p: P; a: string }) {
  const disc = (k: number) => `radial-gradient(circle at 35% 30%, ${hexMix(a, "#ffffff", 0.35 - k * 0.1)}, ${a} 55%, ${hexMix(a, "#000000", 0.25 + k * 0.08)})`;
  const round = (src: string, k: number) =>
    src ? (
      <span key={`s${k}`} style={{ ...face, overflow: "hidden", background: "#fff" }}>
        <Slot src={src} w={110} h={110} />
      </span>
    ) : (
      <span key={`d${k}`} style={{ ...face, background: disc(k) }} />
    );
  const screens = [p.dashboard, p.screen1, p.screen2, p.screen3];
  const sets: ReactNode[][] = [[null, round(screens[0], 0), round(screens[1], 1)], [null, round(screens[1], 1)], [null, round(screens[2], 2)], [null, round(screens[3], 3)]];
  return (
    <div style={{ display: "inline-flex", padding: 8, borderRadius: 99, background: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,.05), 0 14px 30px -12px rgba(0,0,0,.18)" }}>
      <span style={{ ...face, overflow: "hidden", background: p.mark ? "#fff" : disc(0) }}>{p.mark && <Slot src={p.mark} w={110} h={110} fit="contain" />}</span>
      {sets[Math.min(3, step)].slice(1).map((f, i) => (
        <span key={i} style={{ marginLeft: -24, borderRadius: 99, boxShadow: "0 0 0 6px #fff", display: "grid" }}>
          {f}
        </span>
      ))}
    </div>
  );
}
const face: CSSProperties = { width: 110, height: 110, borderRadius: 99, display: "grid", placeItems: "center", lineHeight: 1 };

function Together({ t, p, a }: { t: number; p: P; a: string }) {
  const words = split(p.words);
  const i = Math.max(0, CUTS.findLastIndex((c) => t >= c));
  const next = CUTS[i + 1] ?? T.ghost + 0.3;
  // the app slides in under the words and keeps going, a page per word. The drawn editor is shot close (2×, its
  // corner); the product's own screens are shown whole (0.8×) and drift by, so each reads and none is blown up
  const own = !!(p.dashboard || p.screen1 || p.screen2 || p.screen3);
  const zoom = own ? 0.8 : 2;
  const [wx, wy] = glide(
    t,
    own
      ? [
          [3.45, 1080, 560],
          [3.6, 380, 530],
          [3.7, 60, 520],
          [3.9, -10, 520],
          [4.5, -60, 520],
          [5.0, -100, 520],
          [T.ghost, -140, 520],
          [5.75, -170, 520],
        ]
      : [
          [3.45, 1080, 600],
          [3.6, 570, 553],
          [3.7, 262, 540],
          [3.9, 154, 540],
          [4.5, -244, 540],
          [5.0, -460, 540],
          [T.ghost, -654, 540],
          [5.75, -760, 540],
        ],
  );
  const [fx] = glide(t, [
    [3.45, 1180],
    [3.6, 767],
    [3.7, 615],
    [3.9, 551],
    [4.1, 540],
  ]);
  const fade = seg(t, T.ghost, 5.72);
  const dim = seg(t, next - 0.09, next - 0.02);
  return (
    <div style={{ ...fill, opacity: 1 - fade, filter: fade > 0.01 ? `grayscale(${fade})` : undefined }}>
      <div style={at(0, 92, { width: S, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 182, lineHeight: "200px", letterSpacing: "-0.045em", whiteSpace: "nowrap", opacity: 1 - dim * 0.6 })}>
        {t >= T.words && <Typed key={i} text={words[i] ?? ""} t={t} at={CUTS[i]} ink={0.12} />}
      </div>
      <div style={at(0, 400 - 63, { width: S, display: "flex", justifyContent: "center", transform: `translateX(${fx - 540}px)`, opacity: dim > 0 ? 1 - dim * 0.5 : 1 })}>
        <Faces step={i} p={p} a={a} />
      </div>
      <div style={move(wx, wy, { transformOrigin: "0 0", willChange: "transform" }, ` scale(${zoom})`)}>
        <Editor p={p} t={t} a={a} page={t < T.words ? 0 : i} />
      </div>
    </div>
  );
}

/** the selection closing on the mark; the mark opening into an artboard; the artboard gathering into the icon */
function Brand({ t, p, a }: { t: number; p: P; a: string }) {
  const blueLine = hexMix(a, "#ffffff", 0.15);
  // the selection: from the whole frame down to the mark's tile
  const tile = 174;
  const [rs] = glide(t, [
    [5.66, 1100],
    [5.8, 616],
    [5.87, 300],
    [5.95, tile],
  ]);
  const close = seg(t, 5.7, 5.9);
  const r0 = { x: 540 - rs / 2, y: 540 - rs / 2, w: rs, h: rs };
  // the tile opens into the artboard, holds, then gathers into the icon
  const [opened] = glide(t, [
    [T.board, 174],
    [6.52, 220],
    [6.58, 350],
    [6.65, 650],
    [6.8, 735],
    [6.9, 756],
  ]);
  const open = (opened - 174) / (756 - 174);
  const gather = inOut(seg(t, T.shrink, T.icon));
  const side = t < T.board ? tile : t < T.shrink ? opened : lerp(756, 216, gather);
  const x0 = 540 - side / 2;
  const blue = seg(t, T.blue, T.board);
  const markO = seg(t, 5.8, 5.98) * (1 - seg(t, 6.5, 6.62));
  const iconFill = inOut(seg(t, T.fillBlue, 7.96));
  const press = seg(t, T.press, T.press + 0.05) * (1 - seg(t, T.press + 0.08, T.press + 0.16));
  const grow = 1 + 0.05 * iconFill - 0.05 * press;
  // the two squares: around the mark, out to the artboard's corners, in to the icon's overlap
  const sq = (which: 0 | 1) => {
    const corner = which === 0 ? [0.84, 0.2, 0.1, 0.14] : [0.2, 0.82, 0.14, 0.09]; // centre x, y, w, h (fractions of the artboard)
    const icon = which === 0 ? [0.583, 0.347, 0.555, 0.38] : [0.343, 0.588, 0.389, 0.528];
    const around = which === 0 ? [0.72, 0.28, 0.42, 0.42] : [0.28, 0.72, 0.42, 0.42];
    return t < T.shrink ? corner.map((v, i) => lerp(around[i], v, open)) : corner.map((v, i) => lerp(v, icon[i], gather));
  };
  const sqO = seg(t, 6.47, 6.56);
  const boardFill = t < T.board ? "#ebeae6" : hexMix("#ebeae6", "#ffffff", seg(t, T.board, 6.62));
  const radius = t < T.shrink ? 0 : lerp(0, 50, gather);
  const sqColor = hexMix(a, "#ffffff", 0.12 + 0.88 * iconFill);
  const tileBg = hexMix("#ffffff", hexMix(a, "#ffffff", 0.1), iconFill);
  return (
    <div style={fill}>
      <Rulers o={seg(t, 7.3, 7.6)} />
      {t < T.board ? (
        <Selection x={r0.x} y={r0.y} w={r0.w} h={r0.h} o={seg(t, 5.6, 5.68)} guides={close > 0.3} line={blue > 0 ? hexMix("#ebeae6", blueLine, blue) : "transparent"}>
          <div style={at(r0.w / 2 - 50, r0.h / 2 - 50, { opacity: markO })}>
            <Mark p={p} s={100} />
          </div>
        </Selection>
      ) : (
        <div data-pick="icon" style={at(x0, x0, { width: side, height: side, transform: `scale(${grow})`, background: t < T.shrink ? boardFill : tileBg, borderRadius: radius, boxShadow: t < T.shrink ? `inset 0 0 0 2px ${blueLine}` : `0 0 0 1.5px ${hexMix(a, "#ffffff", 0.55)}, 0 ${10 * gather}px ${30 * gather}px -12px rgba(0,0,0,.16)`, overflow: "hidden" })}>
          <div style={at(side / 2 - 50, side / 2 - 50, { opacity: markO })}>
            <Mark p={p} s={100} />
          </div>
          {p.icon && t >= T.shrink ? (
            <div style={{ ...fill, opacity: gather }}>
              <Slot pick="icon" src={p.icon} t={t} w={side} h={side} />
            </div>
          ) : (
            [0, 1].map((w) => {
              const [cx, cy, ww, hh] = sq(w as 0 | 1);
              return <div key={w} style={at((cx - ww / 2) * side, (cy - hh / 2) * side, { width: ww * side, height: hh * side, background: sqColor, opacity: sqO })} />;
            })
          )}
          {/* where the squares overlap in the icon, the paper shows through */}
          {!p.icon && gather > 0.6 && <div style={at(0.305 * side, 0.324 * side, { width: 0.232 * side, height: 0.213 * side, background: tileBg, opacity: (gather - 0.6) / 0.4 })} />}
        </div>
      )}
      {t > 7.38 && t < 8.22 && (() => {
        const [cx, cy, cs] = glide(t, [
          [7.38, 1020, 960, 4.2],
          [7.5, 760, 735, 3.2],
          [T.icon, 650, 650, 2.7],
          [T.press, 636, 636, 2.6],
        ]);
        return <Cursor x={cx - 4 * cs} y={cy - 4 * cs} press={press} size={cs} />;
      })()}
    </div>
  );
}

export default function FeatureSpotlight({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  useFonts();
  const t = useClock(DUR);
  const a = p.accent;
  const { plus } = tabRow(split(p.tabs));
  const home = t < T.intro || t > 8.16;
  return (
    <Stage w={S} h={S} background={PAPER} style={{ fontFamily: SANS }}>
      <div data-film="" style={{ ...fill, background: `${GRAIN}, ${PAPER}` }}>
        {t >= 5.6 && <Brand t={t} p={p} a={a} />}
        {/* the home window, one (drawn once) for the opening and for the end, where the icon opens it and it rises
            into the opening: kept, hidden, between */}
        <div style={{ ...fill, display: home ? undefined : "none", opacity: t < T.intro ? 1 - seg(t, 1.55, T.intro) * 0.75 : 1 }}>
          <Home t={t > 4 ? t - DUR : t} p={p} a={a} plus={plus} press={seg(t, T.plus - 0.02, T.plus + 0.04) * (t < 4 ? 1 : 0)} />
        </div>
        {t < T.intro && <Opening t={t} p={p} a={a} />}
        {t >= T.intro && t < T.word && <Introducing t={t} p={p} a={a} />}
        {t >= T.word && t < 3.8 && <Feature t={t} p={p} a={a} />}
        {t >= 3.47 && t < 5.75 && <Together t={t} p={p} a={a} />}
      </div>
    </Stage>
  );
}
