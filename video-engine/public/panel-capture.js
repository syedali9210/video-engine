// Panel capture: finds one of a product's panels on its running page by its words (the title the code gave it, its
// properties' labels, its buttons: src/studio/panels.ts read them) and freezes it as one piece of HTML that needs
// nothing else: every element's computed look inlined, its ::before/::after made real, its pictures and the fonts it
// uses carried as data, the SVG sprites it points at copied in. Its title, its property rows and its buttons are
// marked (data-unfold, data-unfold-row) for the unfold film (src/animations/film-unfold) to build them one by one.
// Every capture also marks the parts it's made of (data-part: its surfaces, dividers, words, icons, pictures, buttons,
// controls), with where each sits and what it's inside, and each word of its text in a span of its own (data-w): the
// manifest (`parts`) is what the assembly (src/studio/assemble.ts) builds the component from, one piece at a time.
// Runs in the page: headless Chrome evaluates it (server/maker.ts), and pasted into a browser's console it defines
// the same `window.__capturePanel(spec)` -> Promise<{ html, w, h, found, parts } | { error }>, and
// `window.__captureComponent({ selector? | title? | text? })` for any component.
(() => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "box-sizing", "width", "height", "min-width", "min-height", "max-width", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "justify-content", "align-items", "align-self", "align-content", "order", "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "grid-auto-flow", "place-items",
    "overflow-x", "overflow-y", "float", "clear", "vertical-align",
    "color", "background-color", "background-image", "background-size", "background-position", "background-repeat", "background-clip",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    "outline-width", "outline-style", "outline-color", "outline-offset", "box-shadow", "opacity", "filter", "backdrop-filter", "mix-blend-mode",
    "transform", "transform-origin",
    "font-family", "font-size", "font-weight", "font-style", "font-variant-numeric", "font-feature-settings", "line-height", "letter-spacing", "word-spacing",
    "text-align", "text-transform", "text-decoration-line", "text-decoration-color", "text-overflow", "text-shadow", "white-space", "word-break", "overflow-wrap", "-webkit-line-clamp", "-webkit-box-orient",
    "list-style-type", "list-style-position", "object-fit", "object-position", "aspect-ratio", "visibility", "cursor",
    "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  ];
  const DEFAULT_SKIP = new Set(["auto", "normal", "none", "0px", "rgba(0, 0, 0, 0)", "visible", "static"]);
  const KEEP_ALWAYS = new Set(["display", "position", "box-sizing", "color", "font-family", "font-size", "font-weight", "line-height", "width", "height"]);
  const style = (cs) => {
    let s = "";
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (!v || (!KEEP_ALWAYS.has(p) && DEFAULT_SKIP.has(v))) continue;
      s += `${p}:${v};`;
    }
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05;
  };
  const ownText = (el) => norm([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "));

  /** the panel's title on the page: an element whose words are the title's (headings and bigger type first) */
  function findTitle(title) {
    const want = norm(title);
    const all = [...document.body.querySelectorAll("*")].filter((el) => norm(el.textContent) === want && visible(el) && ![...el.children].some((c) => norm(c.textContent) === want));
    const score = (el) => (/^H[1-6]$/.test(el.tagName) ? 100 : 0) + parseFloat(getComputedStyle(el).fontSize) + parseFloat(getComputedStyle(el).fontWeight) / 100;
    return all.sort((a, b) => score(b) - score(a))[0] ?? null;
  }
  /** the smallest box round the title that holds most of the panel's words; then the one that draws it (a card's own
      background, border or shadow) if it's only a little bigger */
  function findPanel(head, items) {
    let el = head;
    let best = null;
    while (el && el !== document.body && el !== document.documentElement) {
      const r = el.getBoundingClientRect();
      if (r.width > innerWidth * 0.97 && r.height > innerHeight * 0.97) break;
      const text = norm(el.innerText);
      const has = items.filter((x) => text.includes(x)).length;
      if (has >= Math.max(1, Math.ceil(items.length * 0.6))) {
        best = el;
        break;
      }
      el = el.parentElement;
    }
    best ||= head.parentElement;
    const drawn = (e) => {
      const cs = getComputedStyle(e);
      return cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0 || cs.backgroundImage !== "none";
    };
    let up = best;
    for (let e = best.parentElement, i = 0; e && i < 4 && e !== document.body; e = e.parentElement, i++) {
      const a = best.getBoundingClientRect();
      const b = e.getBoundingClientRect();
      if (b.width > a.width + 64 || b.height > a.height + 64) break;
      if (drawn(e)) up = e;
    }
    return drawn(best) ? best : up;
  }
  /** the ground under an element: its own background, else the nearest opaque one behind it */
  function groundOf(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    }
    return "#ffffff";
  }
  const dataUrl = (url) =>
    fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && new Promise((ok) => {
        const f = new FileReader();
        f.onload = () => ok(f.result);
        f.onerror = () => ok(null);
        f.readAsDataURL(b);
      }))
      .catch(() => null);

  /** the parts a component is made of, marked on its copy: what each is, where (px inside the component, at the page's
      own scale), what part it's inside; each word of its words in a span of its own */
  function annotate(pairs, root) {
    const rb = root.getBoundingClientRect();
    const k = rb.width / (root.offsetWidth || rb.width) || 1;
    const parts = [];
    const idOf = new Map();
    const rawOwn = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    const isDrawn = (cs) => (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const chroma = (c) => {
      const m = (c.match(/[\d.]+/g) || []).map(Number);
      return m.length >= 3 ? Math.max(m[0], m[1], m[2]) - Math.min(m[0], m[1], m[2]) : 0;
    };
    const wrap = (dst, deep) => {
      const nodes = [];
      const walk = (n) => n.childNodes.forEach((c) => (c.nodeType === 3 ? nodes.push(c) : deep && c.nodeType === 1 && c.tagName !== "svg" && walk(c)));
      walk(dst);
      for (const node of nodes) {
        if (!node.textContent.trim()) continue;
        const frag = document.createDocumentFragment();
        for (const w of node.textContent.split(/(\s+)/)) {
          if (!w) continue;
          if (/^\s+$/.test(w)) frag.append(w);
          else {
            const sp = document.createElement("span");
            sp.setAttribute("data-w", "");
            sp.setAttribute("style", "display:inline-block;white-space:pre");
            sp.textContent = w;
            frag.append(sp);
          }
        }
        node.replaceWith(frag);
      }
    };
    for (const [src, dst] of pairs) {
      if (src === root || !(src instanceof Element) || !visible(src)) continue;
      const tag = src.tagName.toLowerCase();
      if (tag !== "svg" && src.closest("svg")) continue;
      // inside a button or a control, the button is the part
      const host = src.parentElement && src.parentElement.closest("button, [role=button], select, [role=switch], [role=tab]");
      if (host && root.contains(host) && host !== src) continue;
      const cs = getComputedStyle(src);
      const r = src.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        if (!(r.width >= 12 || r.height >= 12)) continue;
      }
      const role = src.getAttribute("role") || "";
      const drawn = isDrawn(cs);
      const own = rawOwn(src);
      const thin = (r.height <= 2.5 && r.width > 12) || (r.width <= 2.5 && r.height > 12);
      const kind =
        tag === "button" || role === "button" || (tag === "a" && drawn) || (tag === "input" && /submit|button/.test(src.type)) ? "button"
        : ["input", "select", "textarea"].includes(tag) || ["switch", "checkbox", "slider", "radio", "tab"].includes(role) ? "control"
        : tag === "svg" ? "icon"
        : tag === "img" || tag === "canvas" || /url\(/.test(cs.backgroundImage) ? (r.width > 48 && r.height > 48 ? "image" : "icon")
        : thin && (drawn || parseFloat(cs.borderTopWidth) > 0) ? "divider"
        : own ? "text"
        : drawn && r.width >= 14 && r.height >= 10 ? "surface"
        : null;
      if (!kind) continue;
      let up = -1;
      for (let e = src.parentElement; e && e !== root; e = e.parentElement) if (idOf.has(e)) { up = idOf.get(e); break; }
      const id = parts.length;
      idOf.set(src, id);
      const part = { id, kind, x: (r.left - rb.left) / k, y: (r.top - rb.top) / k, w: r.width / k, h: r.height / k, depth: up < 0 ? 0 : parts[up].depth + 1, up };
      if (kind === "text" || kind === "button") {
        const words = (kind === "button" ? (src.innerText || src.value || "") : own).replace(/\s+/g, " ").trim();
        if (words) Object.assign(part, { text: words, size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400 });
        wrap(dst, kind === "button");
      }
      if (kind === "button") part.primary = chroma(cs.backgroundColor) > 60 || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && chroma(cs.color) < 20 && parseFloat(cs.fontWeight) >= 500);
      if (kind === "control" && (src.getAttribute("aria-checked") === "true" || src.checked)) part.on = true;
      dst.setAttribute("data-part", String(id));
      dst.setAttribute("data-kind", kind);
      parts.push(part);
      if (parts.length >= 220) break;
    }
    return parts;
  }

  /** one element frozen: its copy with every look inlined (`mark` marks the parts on the copy), its fonts and sprites */
  async function freeze(panel, mark) {
    const box = panel.getBoundingClientRect();
    const out = panel.cloneNode(true);
    const pairs = [];
    // every element's look, inlined, walking the page and its copy together
    const walk = (src, dst) => {
      pairs.push([src, dst]);
      const kids = [...src.children];
      const copies = [...dst.children];
      kids.forEach((k, i) => copies[i] && walk(k, copies[i]));
    };
    walk(panel, out);
    const used = new Set();
    const sprites = new Set();
    for (const [src, dst] of pairs) {
      const cs = getComputedStyle(src);
      dst.setAttribute("style", style(cs));
      // (its classes and ids aren't needed now its look is inline; an SVG keeps its ids, which its gradients point at)
      for (const a of [...dst.attributes]) if (/^on/i.test(a.name) || a.name === "class" || (a.name === "id" && !(dst instanceof SVGElement)) || a.name.startsWith("data-") || a.name === "hidden") dst.removeAttribute(a.name);
      cs.fontFamily.split(",").forEach((f) => used.add(f.trim().replace(/^["']|["']$/g, "").toLowerCase()));
      if (src instanceof HTMLInputElement || src instanceof HTMLTextAreaElement) dst.setAttribute("value", src.value);
      if (src instanceof HTMLImageElement) dst.setAttribute("src", (await dataUrl(src.currentSrc || src.src)) || src.currentSrc || src.src);
      if (src instanceof HTMLCanvasElement) {
        try {
          const img = document.createElement("img");
          img.src = src.toDataURL();
          img.setAttribute("style", style(cs));
          dst.replaceWith(img);
        } catch {
          /* a tainted canvas: left empty */
        }
      }
      if (src instanceof SVGUseElement) {
        const ref = src.getAttribute("href") || src.getAttribute("xlink:href") || "";
        if (ref.startsWith("#")) sprites.add(ref.slice(1));
      }
      const bg = cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (bg && !bg[1].startsWith("data:")) {
        const d = await dataUrl(bg[1]);
        if (d) dst.style.backgroundImage = `url("${d}")`;
      }
      // ::before and ::after made real elements (icons and dots are often drawn with them)
      for (const which of ["::before", "::after"]) {
        const ps = getComputedStyle(src, which);
        const c = ps.getPropertyValue("content");
        if (!c || c === "none" || c === "normal") continue;
        const span = document.createElement("span");
        span.setAttribute("style", style(ps));
        span.textContent = /^["'].*["']$/.test(c) ? c.slice(1, -1) : "";
        if (which === "::before") dst.prepend(span);
        else dst.append(span);
      }
    }
    // the panel itself: where it is, its size, its ground (a card on the page's ground keeps it)
    out.style.position = "relative";
    out.style.left = "0";
    out.style.top = "0";
    out.style.right = "auto";
    out.style.bottom = "auto";
    out.style.margin = "0";
    out.style.transform = "none";
    // (its own size, not as a transform on the page scales it)
    const own = box.width / (panel.offsetWidth || box.width) || 1;
    out.style.width = `${box.width / own}px`;
    out.style.height = `${box.height / own}px`;
    out.style.boxSizing = "border-box";
    out.style.overflow = "hidden";
    out.style.backgroundColor = groundOf(panel);
    out.setAttribute("data-unfold-root", "");
    const copyOf = new Map(pairs);
    const found = mark ? mark(copyOf) : {};
    const parts = annotate(pairs, panel);
    // the SVG sprites it points at, and the fonts it's set in, carried along
    let defs = "";
    for (const id of sprites) {
      const s = document.getElementById(id);
      if (s) defs += s.outerHTML;
    }
    let fonts = "";
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) {
        if (!(r instanceof CSSFontFaceRule)) continue;
        const fam = r.style.getPropertyValue("font-family").replace(/^["']|["']$/g, "").toLowerCase();
        if (!used.has(fam)) continue;
        let css = r.cssText;
        for (const m of [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]) {
          if (m[2].startsWith("data:")) continue;
          const abs = new URL(m[2], sheet.href || location.href).href;
          const d = await dataUrl(abs);
          css = css.replace(m[0], `url("${d || abs}")`);
        }
        fonts += css + "\n";
      }
    }
    const html = `${fonts ? `<style>${fonts}</style>` : ""}${defs ? `<svg width="0" height="0" style="position:absolute">${defs}</svg>` : ""}${out.outerHTML}`;
    // (its ground as hex: what the film mixes a shape's colour from)
    const rgb = (groundOf(panel).match(/[\d.]+/g) || ["255", "255", "255"]).slice(0, 3).map((v) => Math.round(+v).toString(16).padStart(2, "0"));
    // (its size at the page's own scale: what the parts are measured in)
    const k = box.width / (panel.offsetWidth || box.width) || 1;
    return { html, w: Math.round(box.width / k), h: Math.round(box.height / k), bg: `#${rgb.join("")}`, found, parts, url: location.href };
  }

  window.__capturePanel = async function capture(spec) {
    await document.fonts.ready;
    const head = findTitle(spec.title);
    if (!head) return { error: `No “${spec.title}” on ${location.href}` };
    const labels = (spec.rows || []).map((r) => norm(String(r).split(":")[0])).filter(Boolean);
    const ctas = (spec.ctas || []).map(norm).filter(Boolean);
    const panel = findPanel(head, [...labels, ...ctas]);
    // the marks: the title, the rows (each label's line, and the value beside it), the buttons
    return freeze(panel, (copyOf) => {
    copyOf.get(head)?.setAttribute("data-unfold", "title");
      const labelEls = labels
        .map((l) => [...panel.querySelectorAll("*")].filter((e) => norm(e.textContent).startsWith(l) && ![...e.children].some((c) => norm(c.textContent).startsWith(l)) && visible(e))[0])
        .filter(Boolean);
      if (labelEls.length) {
        // a row is the label's ancestor just under the box all the labels share
        const chain = (e) => {
          const c = [];
          for (let x = e; x && x !== panel; x = x.parentElement) c.unshift(x);
          return c;
        };
        const chains = labelEls.map(chain);
        let depth = 0;
        while (chains.every((c) => c[depth] && c[depth] === chains[0][depth])) depth++;
        chains.forEach((c, i) => {
          const row = c[depth] ?? labelEls[i];
          copyOf.get(row)?.setAttribute("data-unfold-row", String(i));
          // a <dt>'s <dd>, a label's value beside it (a sibling that's no other row): the same row
          const next = row.nextElementSibling;
          if (next && !chains.some((d) => d[depth] === next) && !ctas.includes(norm(next.textContent)) && next.getBoundingClientRect().top < row.getBoundingClientRect().bottom + 4) copyOf.get(next)?.setAttribute("data-unfold-row", String(i));
        });
      }
      let marked = 0;
      for (const c of ctas) {
        const el = [...panel.querySelectorAll("button, [role=button], a, input[type=submit]")].find((e) => norm(e.textContent || e.value) === c && visible(e));
        if (el && copyOf.get(el)) (copyOf.get(el).setAttribute("data-unfold", "cta"), marked++);
      }
      return { title: true, rows: labelEls.length, ctas: marked, of: { rows: labels.length, ctas: ctas.length } };
    });
  };

  /** Any component: by a selector, by its title (with its rows and buttons, as a panel), or by words in it (as a card). */
  window.__captureComponent = async function captureComponent(spec) {
    if (spec.selector) {
      await document.fonts.ready;
      const el = document.querySelector(spec.selector);
      if (!el) return { error: `No ${spec.selector} on ${location.href}` };
      return freeze(el, null);
    }
    if (spec.title) return window.__capturePanel(spec);
    return window.__captureCard(spec);
  };

  /** A card (a post, a message, a result) by words in it: the smallest drawn box (its own ground, edge or shadow)
      round the element that holds them, frozen the same way. */
  window.__captureCard = async function captureCard(spec) {
    await document.fonts.ready;
    const want = norm(spec.text).slice(0, 60);
    const hits = [...document.body.querySelectorAll("*")].filter((el) => visible(el) && norm(el.textContent).includes(want) && ![...el.children].some((c) => norm(c.textContent).includes(want)));
    if (!hits.length) return { error: `No “${spec.text}” on ${location.href}` };
    const drawn = (e) => {
      const cs = getComputedStyle(e);
      return cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none" || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
    };
    let card = hits[0];
    for (let e = hits[0], i = 0; e && e !== document.body && i < 8; e = e.parentElement, i++) {
      const r = e.getBoundingClientRect();
      if (r.width > innerWidth * 0.9 || r.height > innerHeight * 0.8) break;
      card = e;
      if (drawn(e) && r.height > 40) break;
    }
    return freeze(card, null);
  };
})();
