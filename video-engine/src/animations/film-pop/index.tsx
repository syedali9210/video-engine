// Pop blue: a brand film in one loud blue, replicated from the Venmo splitting ad. Its cuts (measured: 0.5, 1.0,
// 1.5, 2.0, 3.23, 5.0, 5.37, 6.25, 6.8, 7.87, 8.3, 9.97 s), its blue, navy, yellow flash and white are the
// reference's; the words, the amounts and the name are params, the pictures are the engine's.
import type { CSSProperties, ReactNode } from "react";
import { Cursor, Slot, Stage, alpha, at, back, clamp, expo, fill, hexMix, inOut, lerp, out, rng, seg, useClock, useFonts, useWebFonts } from "../_film/kit";
import { params as defaults } from "./params";

type P = typeof defaults;
const DUR = 11.27;
const T = { never: 0.5, amount: 1.0, yellow: 1.5, pills: 2.0, sky: 3.23, hassle: 4.1, mark: 5.0, grid: 5.37, photos: 6.25, cards: 6.8, social: 7.3, glitch: 7.87, word: 8.3, end: 9.97 };
const FONTS = "https://fonts.googleapis.com/css2?family=Outfit:wght@400..900&display=swap";
const DISPLAY = '"Outfit", "Geist", system-ui, sans-serif';
const NAVY = "#0e2a55";
const YELLOW = "#fdf8c2";
const GREEN = "#8be36a";
const IMG = "/anim/swiggy-home/img/";
const PHOTOS = ["photo-1512621776951-a57141f2eefd.jpg", "photo-1578985545062-69928b1d9587.jpg", "photo-1589301760014-d929f3979dbc.jpg", "photo-1694849789325-914b71ab4075.jpg", "photo-1742281257687-092746ad6021.jpg"].map((f) => IMG + f);
const split = (s: string) => s.split("|").map((x) => x.trim());

/* ---------------- pieces ---------------- */

/** a column of digits rolling past, the way a counter spins */
function Roll({ x, y, w, h, t, speed = 900, flip = false, ink = "#fff", bg = "transparent", size = 120 }: { x: number; y: number; w: number; h: number; t: number; speed?: number; flip?: boolean; ink?: string; bg?: string; size?: number }) {
  const digits = "3470962581".repeat(4);
  return (
    <div style={at(x, y, { width: w, height: h, overflow: "hidden", background: bg })}>
      <div style={{ transform: `translateY(${-((t * speed) % (size * 10))}px) ${flip ? "scaleX(-1)" : ""}`, fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: `${size}px`, color: ink, textAlign: "center" }}>
        {[...digits].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
    </div>
  );
}

/** angular blue shards, turning slowly */
function Shards({ t, a, cover }: { t: number; a: string; cover: number }) {
  const shapes = [
    "polygon(0 30%, 40% 0, 55% 60%, 10% 100%)",
    "polygon(35% 0, 100% 0, 85% 70%, 50% 45%)",
    "polygon(55% 40%, 100% 55%, 100% 100%, 40% 100%)",
    "polygon(0 60%, 30% 45%, 45% 100%, 0 100%)",
  ];
  return (
    <>
      {shapes.map((s, i) => (
        <div key={i} style={{ ...fill, clipPath: s, background: i % 2 ? a : hexMix(a, "#ffffff", 0.18), transform: `rotate(${Math.sin(t * 1.5 + i) * 4 + (1 - cover) * (i % 2 ? 12 : -12)}deg) scale(${lerp(0.9, 1.25, cover)})`, transformOrigin: "50% 50%", opacity: 0.95 }} />
      ))}
    </>
  );
}

/** a share of the bill: a face and an amount in a green pill */
const Share = ({ amount, who, style }: { amount: string; who: string; style?: CSSProperties }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px 8px 8px", borderRadius: 99, background: `linear-gradient(180deg, #b6f08f, ${GREEN})`, boxShadow: "0 10px 20px -10px rgba(40,120,20,.5)", fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, color: NAVY, ...style }}>
    <span style={{ width: 40, height: 40, borderRadius: 99, background: "#e8eef7", display: "grid", placeItems: "center", fontSize: 18 }}>{who}</span>
    {amount}
  </div>
);

/** the product's badge: its initial, italic, in a blue disc */
const Badge = ({ name, s, a }: { name: string; s: number; a: string }) => (
  <div style={{ width: s, height: s, borderRadius: 999, background: a, display: "grid", placeItems: "center", color: "#fff", fontFamily: DISPLAY, fontWeight: 900, fontStyle: "italic", fontSize: s * 0.6, boxShadow: `0 10px 30px -10px ${alpha(a, 0.6)}` }}>{(name.trim()[0] ?? "•").toLowerCase()}</div>
);

const CLOUDS = (() => {
  const r = rng(13);
  return Array.from({ length: 16 }, () => ({ x: r() * 2200 - 140, y: 300 + r() * 900, s: 260 + r() * 360, v: 0.5 + r() }));
})();
function Sky({ t, depth }: { t: number; depth: number }) {
  return (
    <div style={{ ...fill, background: "linear-gradient(180deg, #2f8fe0, #5fb0ee 55%, #a8d6f6)", overflow: "hidden" }}>
      {CLOUDS.map((c, i) => {
        const z = 1 + depth * c.v * 0.9;
        return (
          <div key={i} style={at(960 + (c.x - 960) * z + Math.sin(t * 0.3 + i) * 20, 540 + (c.y - 540) * z, { width: c.s * z, height: c.s * 0.6 * z, borderRadius: "50%", background: "radial-gradient(ellipse at 50% 40%, #fff, rgba(255,255,255,.85) 45%, rgba(255,255,255,0) 70%)", filter: "blur(6px)" })} />
        );
      })}
    </div>
  );
}

const Photo = ({ src, w, h, style, pick }: { src: string; w: number; h: number; style?: CSSProperties; pick?: string }) => (
  <div data-pick={pick} style={{ width: w, height: h, borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 40px -20px rgba(0,0,0,.4)", border: "5px solid #fff", ...style }}>
    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  </div>
);

/** a card of the app: the reference's drawn one, or the product's own screen filling it (`src`) */
function Card({ x, y, w, h, src, pick, children }: { x: number; y: number; w: number; h: number; src?: string; pick?: string; children: ReactNode }) {
  if (src) return <div data-pick={pick} style={at(x, y, { width: w, height: h, borderRadius: 30, overflow: "hidden", background: "#fff", boxShadow: "0 20px 40px -20px rgba(0,0,40,.35)" })}><Slot src={src} w={w} h={h} /></div>;
  return <div style={at(x, y, { width: w, height: h, borderRadius: 30, background: "#fff", padding: "28px 34px", boxSizing: "border-box", fontFamily: DISPLAY, color: NAVY, boxShadow: "0 20px 40px -20px rgba(0,0,40,.35)" })}>{children}</div>;
}

/* ---------------- the film ---------------- */

export default function PopBlue({ p: given }: { p?: Partial<P> }) {
  const p = { ...defaults, ...given } as P;
  // the pictures: yours where you've given them (screen params), the engine's food photos elsewhere
  const photos = PHOTOS.map((d, i) => {
    const v = String(p[`photo${i + 1}` as keyof P] ?? "");
    return /^image:/.test(v) ? v.slice(6) : d;
  });
  useFonts();
  const ready = useWebFonts(FONTS, ['700 40px "Outfit"', 'italic 900 40px "Outfit"']);
  const t = useClock(DUR);
  const a = p.accent;
  const [hook, never] = split(p.hook);
  const [skip1, skip2] = split(p.skip);
  const words = split(p.words);
  const chars = [...p.amount];
  let shot: ReactNode = null;

  if (t < T.amount) {
    const cover = inOut(seg(t, 0, T.amount));
    shot = (
      <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
        <Shards t={t} a={a} cover={cover} />
        {t < T.never ? (
          <div style={at(120, 330, { fontFamily: DISPLAY, fontWeight: 700, fontSize: 330, lineHeight: 1, letterSpacing: "-0.03em", color: NAVY, transform: `translateX(${(1 - expo(seg(t, 0, 0.35))) * -60}px)` })}>{hook}</div>
        ) : (
          <>
            <Roll x={240} y={0} w={150} h={480} t={t} flip bg="#4aa8f5" />
            <Roll x={1250} y={680} w={180} h={150} t={t + 1} flip bg="#4aa8f5" size={130} />
            <div style={at(0, 470, { width: 1920, textAlign: "center", fontFamily: DISPLAY, fontWeight: 500, fontSize: 92, color: "#fff" })}>{never}</div>
          </>
        )}
      </div>
    );
  } else if (t < T.yellow) {
    const z = lerp(2.2, 1, expo(seg(t, T.amount, T.yellow)));
    shot = (
      <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
        <div style={at(320, 0, { width: 240, height: 1080, background: a })} />
        <Roll x={320} y={0} w={240} h={1080} t={t} size={190} />
        <div style={at(560, 260, { fontFamily: DISPLAY, fontWeight: 700, fontSize: 620, lineHeight: 1, letterSpacing: "-0.05em", color: a, transformOrigin: "0 50%", transform: `scale(${z})` })}>{p.amount}</div>
      </div>
    );
  } else if (t < T.pills) {
    const r = rng(Math.floor(t * 12));
    shot = (
      <div style={{ ...fill, background: YELLOW, overflow: "hidden" }}>
        {t < 1.62 &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} style={at(r() * 1700, r() * 900 - 200, { width: 220 + r() * 300, height: 300 + r() * 300, background: "#fff" })} />
          ))}
        <div style={at(0, 380, { width: 1920, display: "flex", justifyContent: "space-around", fontFamily: DISPLAY, fontWeight: 600, fontSize: 300, lineHeight: 1, color: a })}>
          {chars.map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      </div>
    );
  } else if (t < T.sky) {
    const press = clamp(seg(t, 2.7, 2.76)) * (1 - seg(t, 2.76, 2.9));
    const spots = [
      [260, 230, "rk"],
      [900, 250, "ss"],
      [480, 600, "cr"],
      [1240, 580, "jt"],
    ] as const;
    shot = (
      <div style={{ ...fill, background: "#fbfbf9", overflow: "hidden" }}>
        <div style={at(0, 380, { width: 1920, display: "flex", justifyContent: "center", gap: 190, fontFamily: DISPLAY, fontWeight: 600, fontSize: 210, lineHeight: 1, color: a })}>
          {chars.map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        {spots.map(([x, y, who], i) => {
          const k = back(seg(t, T.pills + 0.1 + i * 0.12, T.pills + 0.45 + i * 0.12), 1.8);
          return (
            <div key={i} style={at(x + Math.sin(t * 2 + i) * 8, y + Math.cos(t * 2 + i) * 6, { transform: `scale(${1.6 * k * (i === 3 ? 1 - press * 0.06 : 1)})`, transformOrigin: "0 0" })}>
              <Share amount={p.share} who={who} />
            </div>
          );
        })}
        <Cursor x={lerp(1750, 1560, out(seg(t, 2.3, 2.68)))} y={lerp(900, 650, out(seg(t, 2.3, 2.68)))} press={press} size={1.8} />
      </div>
    );
  } else if (t < T.mark) {
    const depth = seg(t, T.sky, T.mark);
    const second = t >= T.hassle;
    const line = (second ? skip2 : skip1).split(" ");
    shot = (
      <div style={fill}>
        <Sky t={t} depth={depth} />
        <div style={at(lerp(380, 250, depth), 360, { transform: `rotate(-3deg) scale(${lerp(1, 1.15, depth)})` })}>
          <Photo pick="photo1" src={photos[0]} w={360} h={260} />
        </div>
        <div style={at(lerp(1240, 1320, depth), 240, { transform: `rotate(4deg) scale(${lerp(1, 1.12, depth)})` })}>
          <Photo pick="photo4" src={photos[3]} w={300} h={380} />
        </div>
        <div style={at(second ? 870 : 820, 330, { fontFamily: DISPLAY, fontWeight: 600, fontSize: 120, lineHeight: 0.95, color: second ? "#fff" : NAVY, letterSpacing: "-0.02em" })}>
          {line.map((w, i) => (
            <div key={`${second}${i}`} style={{ opacity: out(seg(t, (second ? T.hassle : T.sky) + 0.1 + i * 0.12, (second ? T.hassle : T.sky) + 0.4 + i * 0.12)) }}>
              {w}
            </div>
          ))}
        </div>
        {[
          [300, 260, "+64*-24*3"],
          [1580, 720, "473/8 + 298"],
          [260, 760, "$6600-78.43"],
        ].map(([x, y, s], i) => (
          <div key={i} style={at(x as number, y as number, { fontFamily: DISPLAY, fontSize: 24, color: "#fff", opacity: 0.85 })}>
            {s}
          </div>
        ))}
      </div>
    );
  } else if (t < T.grid) {
    shot = (
      <div style={{ ...fill, background: "#fff", display: "grid", placeItems: "center" }}>
        <div style={{ transform: `scale(${back(seg(t, T.mark, T.mark + 0.3), 2)})` }}>
          <Badge name={p.name} s={150} a={a} />
        </div>
      </div>
    );
  } else if (t < T.photos) {
    const turn = Math.floor((t - T.grid) / 0.22) * 90;
    shot = (
      <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} style={at(-200 + (row % 2 ? -1 : 1) * (t - T.grid) * 160, 30 + row * 210, { display: "flex", gap: 20, whiteSpace: "nowrap" })}>
            {Array.from({ length: 9 }, (_, i) => {
              const word = row >= 1 && row <= 3 && i === 4 ? words[row - 1] : null;
              const arrow = (i + row) % 2 === 1;
              return arrow ? (
                <span key={i} style={{ width: 180, height: 180, borderRadius: 99, background: a, display: "grid", placeItems: "center", color: "#fff", fontSize: 90, transform: `rotate(${turn + i * 90}deg)` }}>↑</span>
              ) : (
                <span key={i} style={{ height: 180, padding: "0 60px", borderRadius: 99, background: a, color: "#fff", display: "grid", placeItems: "center", fontFamily: DISPLAY, fontSize: word ? 96 : 70, fontWeight: 500, letterSpacing: word ? "-0.02em" : "0.1em" }}>
                  {word ?? "$ € £ ₹ ₽"}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (t < T.cards) {
    shot = (
      <div style={{ ...fill, background: a, overflow: "hidden" }}>
        <div style={at(110, 60, { width: 1700, height: 960, display: "flex", flexDirection: "column", gap: 0, borderRadius: 20, overflow: "hidden" })}>
          {photos.slice(0, 4).map((src, i) => (
            <div key={i} data-pick={`photo${i + 1}`} style={{ height: 240, flex: "none", overflow: "hidden", transform: `translateX(${(i % 2 ? 1 : -1) * (1 - expo(seg(t, T.photos + i * 0.05, T.photos + 0.4))) * 300}px)` }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
        <div style={at(960 - 75, 540 - 75)}>
          <Badge name={p.name} s={150} a={a} />
        </div>
      </div>
    );
  } else if (t < T.word) {
    const z = lerp(1.25, 0.9, inOut(seg(t, T.cards, T.glitch)));
    const n1 = Math.round(lerp(69, 125, seg(t, T.cards + 0.2, T.glitch)));
    const n2 = Math.round(lerp(119, 202, seg(t, T.cards + 0.2, T.glitch)));
    const glitch = seg(t, T.glitch, T.word);
    const r = rng(Math.floor(t * 30));
    shot = (
      <div style={{ ...fill, background: a, overflow: "hidden" }}>
        <div style={{ ...fill, transformOrigin: "960px 540px", transform: `scale(${z})`, filter: glitch > 0 ? `blur(${glitch * 3}px) saturate(${1 - glitch})` : undefined, opacity: 1 - glitch * 0.7 }}>
          <Card x={300} y={130} w={620} h={340} src={p.screen1} pick="screen1">
            <div style={{ fontSize: 56, fontWeight: 600 }}>Budget</div>
            <div style={{ display: "flex", alignItems: "center", gap: 40, marginTop: 20 }}>
              <span style={{ width: 70, height: 70, borderRadius: 99, background: "#e5e7eb", display: "grid", placeItems: "center", fontSize: 50 }}>−</span>
              <span style={{ fontSize: 130, fontWeight: 600, lineHeight: 1 }}>{n1}</span>
              <span style={{ width: 70, height: 70, borderRadius: 99, background: "#ef2b3c", color: "#fff", display: "grid", placeItems: "center", fontSize: 50 }}>+</span>
            </div>
          </Card>
          <Card x={1000} y={160} w={560} h={260} src={p.screen2} pick="screen2">
            <div style={{ fontSize: 30 }}>4 more installments</div>
            <div style={{ fontSize: 76, fontWeight: 600 }}>${n2}</div>
            <div style={{ height: 10, borderRadius: 5, background: "#e5e7eb", marginTop: 10, position: "relative" }}>
              <div style={{ width: `${30 + seg(t, T.cards, T.glitch) * 20}%`, height: 10, borderRadius: 5, background: "#ff6a1a" }} />
            </div>
          </Card>
          <Card x={300} y={620} w={560} h={300} src={p.screen3} pick="screen3">
            <div style={{ fontSize: 50, fontWeight: 600 }}>Split the bill</div>
            <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
              {["rk", "ss", "cr"].map((s, i) => (
                <span key={s} style={{ width: 100, height: 100, borderRadius: 99, background: ["#8be36a", "#f472d0", "#7cc8ff"][i], display: "grid", placeItems: "center", fontSize: 40, fontWeight: 600 }}>
                  {s}
                </span>
              ))}
            </div>
          </Card>
          <Card x={1000} y={580} w={560} h={380} src={p.screen4} pick="screen4">
            <div style={{ fontSize: 56, fontWeight: 600 }}>Eating</div>
            {[
              ["50", "#ffb21f", 100],
              ["30", "#f472d0", 70],
              ["20", "#7cc8ff", 45],
            ].map(([n, c, w], i) => (
              <div key={i} style={{ marginTop: 10, width: `${w}%`, height: 64, borderRadius: 12, background: c as string, fontSize: 40, fontWeight: 600, padding: "6px 16px", boxSizing: "border-box" }}>
                {n}
              </div>
            ))}
          </Card>
          {t >= T.social && <div style={at(0, 490, { width: 1920, textAlign: "center", fontFamily: DISPLAY, fontWeight: 600, fontSize: 100, color: "#fff", letterSpacing: "-0.02em", opacity: out(seg(t, T.social, T.social + 0.3)) })}>{p.social}</div>}
        </div>
        {glitch > 0 &&
          Array.from({ length: 30 }, (_, i) => <div key={i} style={at(r() * 1920, r() * 1080, { width: 40 + r() * 200, height: 8 + r() * 40, background: r() < 0.5 ? "#fff" : hexMix(a, "#ffffff", 0.5), opacity: glitch })} />)}
      </div>
    );
  } else if (t < T.end) {
    const trail = out(seg(t, T.word, T.word + 0.8));
    shot = (
      <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
        <div style={at(0, 470, { width: 1920, textAlign: "center", fontFamily: DISPLAY, fontWeight: 900, fontStyle: "italic", fontSize: 120, letterSpacing: "-0.03em", color: a, opacity: expo(seg(t, T.word + 0.4, T.word + 0.9)) })}>{p.name}</div>
        {Array.from({ length: 8 }, (_, i) => {
          const k = clamp(trail * 1.4 - i * 0.08);
          return <div key={i} data-pick={`photo${(i % photos.length) + 1}`} style={at(lerp(1800 + i * 70, 960, k), lerp(820 - i * 30, 540, k) - 45, { width: 90, height: 90, borderRadius: 99, overflow: "hidden", opacity: 1 - k, border: "4px solid #fff", boxShadow: "0 6px 16px -6px rgba(0,0,0,.3)" })}><img src={photos[i % photos.length]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
        })}
      </div>
    );
  } else {
    const k = inOut(seg(t, T.end, T.end + 0.6));
    shot = (
      <div style={{ ...fill, background: "#fff", overflow: "hidden" }}>
        <div style={{ ...fill, background: a, clipPath: `polygon(${lerp(-10, 8, k)}% 0, ${lerp(110, 92, k)}% 0, ${lerp(90, 72, k)}% 50%, ${lerp(110, 92, k)}% 100%, ${lerp(-10, 8, k)}% 100%, ${lerp(10, 28, k)}% 50%)` }} />
      </div>
    );
  }

  return (
    <Stage background="#fff" style={{ fontFamily: DISPLAY, color: NAVY }}>
      {ready && (
        <div data-film="" style={fill}>
          {shot}
        </div>
      )}
    </Stage>
  );
}
