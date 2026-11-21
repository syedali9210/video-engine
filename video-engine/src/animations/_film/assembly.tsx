// A component of the product's own, built in front of the camera (src/studio/assemble.ts says what arrives when and
// how): the frozen copy (public/panel-capture.js) is drawn as it is, and each of its parts is held back and brought in
// by its opacity, transform, clip and blur alone, over its own look, so nothing is re-laid out: when a part is done
// its own style is exactly as captured, and when all are, the component is the product's, to the pixel.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { back, ease, outlineAt, type Assembly } from "../../studio/assemble";

type Orig = { opacity: string; transform: string; filter: string; clipPath: string; transformOrigin: string };
type Word = { el: HTMLElement; o: Orig; chars: number; x: number; y: number; w: number; h: number };
type Piece = { el: HTMLElement; o: Orig; words: Word[]; w: number; h: number };

const keep = (el: HTMLElement): Orig => ({ opacity: el.style.opacity, transform: el.style.transform, filter: el.style.filter, clipPath: el.style.clipPath, transformOrigin: el.style.transformOrigin });
const put = (el: HTMLElement, o: Orig, s: { op?: number; tf?: string; blur?: number; clip?: string; origin?: string }) => {
  const base = o.opacity === "" ? 1 : parseFloat(o.opacity);
  el.style.opacity = s.op === undefined ? o.opacity : String(Math.max(0, Math.min(1, s.op)) * base);
  el.style.transform = s.tf ? `${s.tf} ${o.transform === "none" ? "" : o.transform}`.trim() : o.transform;
  el.style.filter = s.blur && s.blur > 0.05 ? `blur(${s.blur.toFixed(2)}px) ${o.filter === "none" ? "" : o.filter}`.trim() : o.filter;
  el.style.clipPath = s.clip ?? o.clipPath;
  el.style.transformOrigin = s.origin ?? o.transformOrigin;
};
/** where an element sits inside the root (its own layout, not as the camera turns it) */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
    if (!e.offsetParent) break;
  }
  return { x, y };
}

export function AssemblyView({ src, a, t, accent }: { src: string; a: Assembly; t: number; accent: string }) {
  const [html, setHtml] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLDivElement>(null);
  const pieces = useRef<Map<number, Piece> | null>(null);
  const rootRef = useRef<{ el: HTMLElement; o: Orig } | null>(null);
  useEffect(() => {
    let live = true;
    document.documentElement.dataset.baking = "1";
    fetch(src)
      .then((r) => (r.ok ? r.text() : ""))
      .then((s) => live && setHtml(s))
      .catch(() => null)
      .finally(() => setTimeout(() => delete document.documentElement.dataset.baking, 80));
    return () => {
      live = false;
    };
  }, [src]);
  // the parts, found once the copy is in: each with its own look kept, its words measured
  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>("[data-unfold-root]");
    if (!root) return;
    rootRef.current = { el: root, o: keep(root) };
    const m = new Map<number, Piece>();
    root.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => {
      const words = [...el.querySelectorAll<HTMLElement>("[data-w]")].map((w) => {
        const p = offsetIn(w, root);
        return { el: w, o: keep(w), chars: (w.textContent ?? "").length, x: p.x, y: p.y, w: w.offsetWidth, h: w.offsetHeight };
      });
      m.set(Number(el.dataset.part), { el, o: keep(el), words, w: el.offsetWidth, h: el.offsetHeight });
    });
    pieces.current = m;
  }, [html]);
  // every frame: each part as its arrival makes it
  useLayoutEffect(() => {
    const m = pieces.current;
    const r = rootRef.current;
    if (!m || !r) return;
    const [ow, oh] = outlineAt(a, t);
    const done = t >= a.grow[a.grow.length - 1][0] + 0.5;
    put(r.el, r.o, done ? {} : { clip: `inset(0 ${Math.max(0, a.w - ow).toFixed(1)}px ${Math.max(0, a.h - oh).toFixed(1)}px 0 round ${Math.min(a.r, oh / 2).toFixed(1)}px)`, op: Math.min(1, (t - a.grow[0][0] + 0.12) / 0.18) });
    let caretAt: { x: number; y: number; h: number } | null = null;
    for (const s of a.steps) {
      const p = m.get(s.id);
      if (!p) continue;
      const u = (t - s.at) / s.len;
      if (t < s.at) {
        put(p.el, p.o, { op: 0 });
        continue;
      }
      // after its arrival (and its words'), exactly as captured
      const wordsEnd = s.at + (s.how === "form" ? s.len * 0.45 : 0) + ((s.n ?? 1) - 1) * (s.step ?? 0) + 0.34;
      const over = t >= s.at + s.len && (s.how !== "words" && s.how !== "form" ? true : t >= wordsEnd);
      const pressed = a.press && a.press.id === s.id ? pressK(t - a.press.at) : 0;
      if (over) {
        put(p.el, p.o, pressed ? { tf: `scale(${1 - 0.045 * pressed})`, origin: "50% 50%" } : {});
        for (const w of p.words) put(w.el, w.o, {});
        continue;
      }
      const e = ease(u);
      switch (s.how) {
        case "draw":
          put(p.el, p.o, { op: Math.min(1, e * 1.6), clip: `inset(0 0 ${((1 - e) * 100).toFixed(1)}% 0 round 2px)`, tf: `translateY(${((1 - e) * -6).toFixed(1)}px)` });
          break;
        case "line":
          put(p.el, p.o, { op: Math.min(1, e * 2), tf: `scaleX(${e.toFixed(3)})`, origin: "0 50%" });
          break;
        case "pop":
          put(p.el, p.o, { op: Math.min(1, u * 2.2), tf: `scale(${(0.4 + 0.6 * back(u)).toFixed(3)})`, origin: "50% 50%" });
          break;
        case "fade":
          put(p.el, p.o, { op: e, tf: `scale(${(1.06 - 0.06 * e).toFixed(3)})`, origin: "50% 50%" });
          break;
        case "slide":
          put(p.el, p.o, { op: e, tf: `translateX(${((1 - e) * -14).toFixed(1)}px)` });
          break;
        case "type": {
          // letter by letter at the style's speed, a caret at the newest
          put(p.el, p.o, {});
          let left = (t - s.at) * a.cps;
          for (const w of p.words) {
            if (left >= w.chars) {
              put(w.el, w.o, {});
              left -= w.chars + 1;
              continue;
            }
            if (left <= 0) {
              put(w.el, w.o, { op: 0 });
              continue;
            }
            const f = left / w.chars;
            put(w.el, w.o, { clip: `inset(-20% ${((1 - f) * 100).toFixed(1)}% -20% -4px)` });
            caretAt = { x: w.x + w.w * f + 2, y: w.y, h: w.h };
            left = 0;
          }
          if (!caretAt && p.words.length) {
            const w = p.words[p.words.length - 1];
            caretAt = { x: w.x + w.w + 3, y: w.y, h: w.h };
          }
          break;
        }
        case "form": {
          // a dot stretching to the button's width, then its label word by word
          const f = ease((t - s.at) / (s.len * 0.6));
          const cut = Math.max(0, (p.w - p.h) * (1 - f));
          put(p.el, p.o, { op: Math.min(1, (t - s.at) / 0.08), clip: `inset(0 ${cut.toFixed(1)}px 0 0 round ${(p.h / 2).toFixed(1)}px)` });
          p.words.forEach((w, j) => {
            const k = ease((t - s.at - s.len * 0.45 - j * (s.step ?? 0.05)) / 0.3);
            put(w.el, w.o, { op: k, tf: `translateY(${((1 - k) * 10).toFixed(1)}px)`, blur: (1 - k) * 4 });
          });
          break;
        }
        default: {
          // words: each rising out of a little blur, one after another
          put(p.el, p.o, { op: Math.min(1, (t - s.at) / 0.15) });
          if (!p.words.length) put(p.el, p.o, { op: e, tf: `translateY(${((1 - e) * 12).toFixed(1)}px)`, blur: (1 - e) * 5 });
          p.words.forEach((w, j) => {
            const k = ease((t - s.at - j * (s.step ?? 0.05)) / 0.32);
            put(w.el, w.o, { op: k, tf: `translateY(${((1 - k) * 14).toFixed(1)}px)`, blur: (1 - k) * 5 });
          });
        }
      }
    }
    const c = caret.current;
    if (c) {
      const blink = caretAt ? 1 : 0;
      c.style.opacity = String(blink);
      if (caretAt) {
        c.style.left = `${caretAt.x}px`;
        c.style.top = `${caretAt.y + caretAt.h * 0.12}px`;
        c.style.height = `${caretAt.h * 0.76}px`;
      }
    }
  }, [t, a, html]);
  return (
    <div ref={box} style={{ position: "relative" }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <div ref={caret} style={{ position: "absolute", left: 0, top: 0, width: 3, height: 0, borderRadius: 2, background: accent, opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

/** a press: down quickly, back up slower */
function pressK(d: number) {
  if (d < 0 || d > 0.4) return 0;
  return d < 0.08 ? d / 0.08 : Math.max(0, 1 - (d - 0.08) / 0.3);
}
