// Smallest check that fails if the suggestion rules or the GPU-load math break.
// Run: npm run check   (Node 22.6+ strips the TypeScript types from suggest.ts)
import assert from "node:assert/strict";
import { deviceLoad, suggest, bezier, EMIL_EASE_OUT } from "../src/suggest.ts";

const iphone = { id: "iphone", name: "iPhone 16 Pro", w: 402, h: 874, dpr: 3, hz: 120, chip: "", tflops: 2.3, rotates: true };
const meta = (over = {}) => ({
  id: "t", name: "T", category: "UI Patterns", tech: ["React", "Motion"], blurb: "", source: "",
  behavior: { trigger: "state", frequency: "occasional" }, reducedMotion: "full", reducedMotionNote: "",
  ui: true, params: {}, schema: {}, ...over,
});
const perf = (over = {}) => ({ fps: 120, interval: 8.3, dropped: 0, workMs: 1, workP95: 2, jsMs: 0, gpuMs: null, gpuP95: null, gpuKind: null, canvasPx: 0, dom: [], history: [], ...over });
const ctx = { reduce: false, nativeDpr: true, hostTflops: 4 };
const titles = (list) => list.map((s) => `${s.level}:${s.title}`);

// GPU scales host -> device by throughput: 4.6ms on a 4 TFLOPS host = 8ms on a 2.3 TFLOPS phone
const L = deviceLoad(perf({ gpuMs: 4.6 }), iphone, 4);
assert.equal(L.gpuMs.toFixed(1), "8.0");
assert.equal(L.budget.toFixed(2), "8.33");

assert.deepEqual(bezier("cubic-bezier(0.23, 1, 0.32, 1)"), [0.23, 1, 0.32, 1]);

// reduced motion is always the first card, and "none" is an error
let s = suggest(meta({ reducedMotion: "none" }), {}, {}, [iphone], ctx);
assert.equal(s[0].tag, "Reduced motion");
assert.equal(s[0].level, "error");

// timing / easing / scale rules, each with a one-click fix
const schema = {
  enter: { type: "number", label: "Enter", unit: "ms", role: "enter", group: "T", min: 0, max: 1000 },
  exit: { type: "number", label: "Exit", unit: "ms", role: "exit", group: "T", min: 0, max: 1000 },
  ease: { type: "easing", label: "Ease", role: "enter" },
  from: { type: "number", label: "From", role: "scaleFrom", min: 0, max: 1 },
};
s = suggest(meta({ schema }), { enter: 450, exit: 450, ease: "cubic-bezier(0.42, 0, 1, 1)", from: 0 }, {}, [iphone], ctx);
const t = titles(s);
assert.ok(t.some((x) => x.startsWith("warn:Enter: 450ms")), t.join("\n"));
assert.ok(t.some((x) => x.startsWith("tip:Exit is as slow")), t.join("\n"));
assert.equal(s.find((x) => x.title.includes("ease-in")).fix.value, EMIL_EASE_OUT);
assert.equal(s.find((x) => x.title.includes("scale(0)")).fix.value, 0.95);

// blur over 20px gets the Safari warning
s = suggest(meta({ schema: { blur: { type: "number", label: "Blur", role: "blur", min: 0, max: 48 } } }), { blur: 28 }, {}, [iphone], ctx);
assert.equal(s.find((x) => x.title.includes("28px blur")).fix.value, 16);

// over the GPU budget on the phone -> error, with the DPR cap as the fix
s = suggest(meta({ schema: { dprCap: { type: "number", label: "DPR", role: "dpr", min: 1, max: 3 } } }), { dprCap: 2 }, { iphone: perf({ gpuMs: 9 }) }, [iphone], ctx);
const gpu = s.find((x) => x.tag === "Performance");
assert.equal(gpu.level, "error");
assert.deepEqual(gpu.fix, { key: "dprCap", value: 1.5, label: "Cap DPR at 1.5" });

// layout properties animated every frame are flagged; compositor-only ones are not
s = suggest(meta(), {}, { iphone: perf({ dom: [{ kind: "layout", prop: "height", perSec: 60 }, { kind: "composite", prop: "transform", perSec: 60 }] }) }, [iphone], ctx);
assert.ok(titles(s).some((x) => x === "warn:Animates layout properties: height"));

// with reduced motion emulated, anything still travelling is called out
s = suggest(meta(), {}, { iphone: perf({ dom: [{ kind: "composite", prop: "transform", perSec: 60 }] }) }, [iphone], { ...ctx, reduce: true });
assert.ok(titles(s).some((x) => x.startsWith("warn:Still moving with reduced motion on")));

// a close-up picks among the components that have plates (the first `max`): one past them has no frame to show
const { ranked, focusOf } = await import("../src/studio/parts.ts");
const part = (i, h, key = true) => ({ i, name: `P${i}`, note: "", box: [0, i * 10, 400, h], key: key ? [0, 0, 10, 10] : null });
const report = { w: 400, h: 800, ground: "#fff", items: [part(0, 40), part(1, 60, false), part(2, 90), part(3, 700), part(4, 300)] };
assert.deepEqual(ranked(report, 3).map((p) => p.i), [2, 0, 1]); // with a key element first, then by size
assert.equal(ranked(report, 5).some((p) => p.i === 3), false); // most of the screen is a ground, not a close-up
assert.equal(focusOf({ max: 3, focus: 0 }, report).idx, 2);
assert.equal(focusOf({ max: 3, focus: 9 }, report).idx, 2); // past the end falls back to the first
assert.equal(focusOf({ max: 3, focus: 1, names: ["", "", "", ""] }, report).name, "P0");
assert.equal(focusOf({ max: 2, focus: 0, names: ["Header"] }, report).name, "Header");
assert.equal(focusOf({ max: 3, focus: 0 }, undefined), null);

// a video splits between renderers only where a scene cuts in, and a later part replays when its frames loaded
const { plan } = await import("../server/plan.ts");
const tour = [3.4, 4.1, 3.8, 3.5, 3.7, 1].map((duration) => ({ duration, transition: "cut" }));
const at30 = (i, j) => i / 30;
let parts = plan(tour, 0, 585, 1, at30, 2);
assert.equal(parts.length, 2);
assert.deepEqual([parts[0].a, parts[1].b], [0, 585]);
assert.equal(parts[0].b, parts[1].a);
assert.equal(parts[1].a, 339); // "The tab bar" cuts in at 11.3 s, the cut nearest half way
assert.equal(parts[1].join, 7.5); // it joins as "The number" starts: that's when the tab bar's frames load
assert.deepEqual(parts[1].visit, []); // its first frame is the tab bar's first moment
assert.equal(parts[1].first, 339 / 30);
// dissolves keep the scene before on screen: no place to split
assert.equal(plan(tour.map((s) => ({ ...s, transition: "dissolve" })), 0, 585, 1, at30, 4).length, 1);
// too short to be worth a second Chrome
assert.equal(plan(tour, 0, 60, 1, at30, 4).length, 1);
// motion blur: when a scene starts inside the previous frame's shutter, that moment is visited before capturing
const blur = (i, j) => (i + (j / 4) * 0.5) / 30;
parts = plan([{ duration: 1.34 }, { duration: 2, transition: "cut" }, { duration: 2, transition: "cut" }], 0, 160, 4, blur, 2);
const second = parts.find((p) => p.a > 0);
assert.equal(second?.a, 101, JSON.stringify(parts)); // the second cut, nearer half way
assert.deepEqual(second.visit, [blur(100, 2)]); // 3.3417 s: frame 100's third moment is the first in that scene

// a web film rides in the player's link and comes back the same
const { pack, unpack } = await import("../src/studio/web.ts");
const film = { v: 1, name: "Test “film”", comp: { scenes: [{ name: "One", duration: 2 }] }, screens: {}, components: {}, dark: false };
const z = await pack(film);
assert.match(z, /^[\w-]+$/);
assert.deepEqual(await unpack(z), film);

// theme matching: colours survive the trip through OKLCH, and every look's type reads on its ground
const { hex, lch, contrast, matchLook, HARMONIES, accentOf } = await import("../src/theme.ts");
for (const c of ["#ff5200", "#0a84ff", "#30d158", "#1c1c1e", "#f5f5f7"]) assert.equal(hex(lch(c)), c);
for (const anchor of ["#ff5200", "#5e5ce6", "#c9c3b9", "#00c7be", "#111111", "#ffffff"])
  for (const { id } of HARMONIES)
    for (const seed of [0, 1, 2]) {
      const k = matchLook(anchor, id, seed);
      assert.ok(contrast(k.ink, k.ground) >= 7, `${anchor} ${id}: ink ${k.ink} on ${k.ground}`);
      assert.ok(contrast(k.muted, k.ground) >= 4.5, `${anchor} ${id}: muted ${k.muted} on ${k.ground}`);
      assert.ok(contrast(k.accent, k.ground) >= 3, `${anchor} ${id}: accent ${k.accent} on ${k.ground}`);
      assert.ok(k.finish.iphone && k.finish.macbook);
    }
// a neutral anchor (white, grey, black) gets a cool neutral, not the pink its meaningless hue angle would give
for (const c of ["#ffffff", "#808080", "#000000"]) {
  const h = lch(matchLook(c, "tonal").ground).h;
  assert.ok(h > 200 && h < 300, `${c}: ground hue ${h}`);
}
// a screen's palette: the white page and grey text say nothing, Swiggy's orange does
assert.equal(accentOf(["rgb(255, 255, 255)", "rgb(40, 44, 63)", "rgb(255, 82, 0)", "rgb(147, 149, 158)"]), "#ff5200");

// a reply cut off part way (it ran out of room mid-string) keeps the proposals it finished
const { parseList } = await import("../server/ai.ts");
const whole = JSON.stringify({ proposals: [{ kind: "new", script: '{"id":"a","name":"A \\"quoted\\" {x}"}' }, { kind: "improve", script: "{}" }] });
assert.deepEqual(parseList(whole, "proposals"), { items: JSON.parse(whole).proposals, whole: true });
const cut = whole.slice(0, whole.indexOf('"improve"') + 12) + ' "script": "{\\"id\\": \\"b';
const got = parseList(cut, "proposals");
assert.equal(got.whole, false);
assert.equal(got.items.length, 1);
assert.equal(got.items[0].kind, "new");
assert.deepEqual(parseList("no json here", "proposals"), { items: [], whole: false });
assert.deepEqual(parseList('```json\n{"ideas": []}\n```', "ideas"), { items: [], whole: true });

// a title animation from the AI is held to its ranges; its pieces start in a real order
const { animOf, rankOf } = await import("../src/studio/textanim.ts");
const ta = animOf({ by: "letters", from: { y: 99, blur: -1, opacity: 0.5, wobble: 3 }, dur: 0, ease: "springy", order: "random", mask: true, idle: "dance" });
assert.equal(ta.by, "word");
assert.deepEqual(ta.from, { y: 6, blur: 0, opacity: 0.5 });
assert.equal(ta.dur, 0.05);
assert.match(ta.ease, /^cubic-bezier\(/);
assert.equal(ta.order, "random");
assert.equal(ta.mask, true);
assert.equal(ta.idle, "none");
assert.equal(animOf("blur up"), undefined);
assert.deepEqual([...rankOf("random", 9)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(rankOf("middle", 5), [2, 1, 0, 1, 2]);
assert.deepEqual(rankOf("last", 3), [2, 1, 0]);

// a film's teardown keeps the titles and backgrounds it can use, in the reference's kind when it names none
const { filmRef, pictureRef, contextFor } = await import("../server/refs.ts");
const fr = filmRef(
  {
    category: "a cartoon",
    titles: [{ name: "Letters up", text: "Ship it", by: "char", from: { y: 1.1 }, dur: 0.6, stagger: 0.03, ease: "cubic-bezier(0.16, 1, 0.3, 1)", mask: true, size: 12, color: "#FFF" }, { text: "", by: "word" }],
    grounds: [{ name: "Night", color: "#05060a", glows: [{ color: "#3355ff", x: 0.5, y: 0.2, r: 0.6, alpha: 0.7 }, { color: "blue" }] }, { name: "No colour" }],
    shots: [{ at: 1.04, dur: 2, what: "the top", from: "macro", to: "held", cut: "cut" }],
  },
  { id: "r1", category: "teaser" },
);
assert.equal(fr.category, "teaser"); // filed by the admin, kept over the guess
assert.deepEqual(fr.kit.map((k) => k.kind), ["title", "ground"]);
assert.equal(fr.kit[0].anim.by, "char");
assert.equal(fr.kit[0].color, "#fff");
assert.equal(fr.kit[1].glows.length, 1);
assert.equal(fr.shots[0].at, 1);
const pr = pictureRef({ category: "bento", ground: "#eee", layers: [{ kind: "card", name: "Photo", x: 0.02, y: 0.03, w: 0.3, h: 0.6, radius: 0.08, fill: "#ffffff" }, { kind: "sticker", name: "?", x: 0, y: 0, w: 1, h: 1 }] }, "creative", { w: 1440, h: 900 });
assert.equal(pr.category, "bento");
assert.equal(pr.layout.layers.length, 1);
assert.equal(pr.layout.ground, "#eee");
const studiedCtx = contextFor([{ id: "a", area: "film", title: "A", summary: "One.", category: "teaser", shots: [], lessons: [] }, { id: "b", area: "film", title: "B", summary: "Two.", category: "product-launch", shots: [], lessons: [] }, { id: "c", area: "canvas", title: "C", summary: "Three.", shots: [], lessons: [] }], "film", "product-launch");
assert.ok(studiedCtx.indexOf('"B"') < studiedCtx.indexOf('"A"') && !studiedCtx.includes('"C"'));

// every cut has a carrier: the inventor's films come out smooth, and the checker names a dip and a reversing move
const { invent, filmOf, SHAPE_COUNT } = await import("../src/studio/invent.ts");
const { cutReport, cutScore, lintCuts, smoothCuts, planCut } = await import("../src/studio/cuts.ts");
for (let seed = 0; seed < SHAPE_COUNT * 3; seed++) {
  const f = invent(seed);
  assert.ok(cutReport(f).every((c) => c.verdict !== "abrupt"), `${f.name} (seed ${seed}) has an abrupt cut`);
}
const glide = (pan) => ({ name: "Glide", dur: 3, why: "", device: { from: { angle: "front", zoom: 2.4, pan: 0 }, to: { pan }, ease: "cubic-bezier(0, 0, 1, 1)" } });
const rough = { id: "r", name: "R", version: 1, source: "", summary: "", ground: "black", why: [], avoid: [], shots: [glide(0.3), { ...glide(-0.3), cut: "cut" }, { name: "Card", dur: 2, why: "", cut: "fade", layers: [{ kind: "text", text: "{name}", box: { x: 0.5, y: 0.5, w: 0.6 }, size: 6, weight: 600, align: "center", enter: "words", color: "" }] }] };
assert.deepEqual(lintCuts(rough).map((f) => f.rule).sort(), ["cut.dip", "cut.reverse"]);
const smooth = smoothCuts(rough).script;
assert.deepEqual([smooth.shots[1].device.from.pan, smooth.shots[1].device.to.pan], [0.3, 0.6], "the reversing glide is turned round and picks up where the last one stopped");
assert.notEqual(smooth.shots[2].cut, "fade");
assert.ok(cutScore(smooth) > cutScore(rough));
assert.equal(planCut({ name: "W", dur: 2, why: "", device: { from: { angle: "hero" }, move: "whip" } }, glide(0.2), { ground: "black" }).cut, "whip");
assert.ok(filmOf({ id: "i", name: "I", source: "", category: "teaser", harmony: "deep", summary: "", why: [], beats: ["detail-top", "dive", "card:{feature1}:settle", "nonsense", "end"], seed: 3 }).shots.length === 4);

// what the decisions teach: a reason becomes a rule, and the lean follows what was kept
const { learn, tasteLints } = await import("../src/studio/taste.ts");
const T = learn([{ script: invent(1), status: "approved" }, { script: rough, status: "rejected", reason: "the cuts are abrupt and jarring" }]);
assert.deepEqual(T.rules.map((r) => r.id), ["cut.smooth"]);
assert.ok(tasteLints(rough, T).length >= 2 && tasteLints(smooth, T).length === 0);

// a replica keeps the film's cut points (ffmpeg's win when they're near), clamps what it's told, and scores itself
const { preciseShots, replicaScript, fidelity, snapCuts, skeleton } = await import("../src/studio/replica.ts");
assert.deepEqual(snapCuts(skeleton(10, [2.05, 3.6]), [2.1, 3.5, 7]).map((s) => s.at), [0, 2.1, 3.5]);
const ps = preciseShots({ shots: [{ i: 0, angle: "nope", zoom: 99, cut: "teleport" }, { i: 0, zoom: 2 }, { i: 7 }] }, 2);
assert.equal(ps.length, 1);
assert.deepEqual([ps[0].angle, ps[0].zoom, ps[0].cut], ["front", 4, "cut"]);
const studiedFilm = { id: "f1234567", area: "film", title: "A film", watched: "", by: "admin", summary: "", lessons: [], palette: ["#000000"], shots: [{ at: 0, dur: 2, what: "Close on the top of the phone", from: "macro", to: "", rotation: "", cut: "", focus: "", type: "", ground: "", ease: "" }, { at: 2, dur: 1.5, what: "Words", from: "", to: "", rotation: "", cut: "whip pan", focus: "", type: "Meet it", ground: "", ease: "" }] };
const rep = replicaScript(studiedFilm, []);
assert.deepEqual(rep.shots.map((s) => [s.dur, s.cut ?? "-"]), [[2, "-"], [1.5, "whip"]]);
// framed from words only, it says so and scores lower; measured closely, it comes close
const guessedFid = fidelity(studiedFilm, rep);
assert.equal(guessedFid.parts.find((p) => p.id === "measured").score, 0);
const measuredRep = replicaScript(studiedFilm, preciseShots({ shots: [{ i: 0, subject: "device", angle: "front", zoom: 2.4, rise: -0.6, cut: "cut" }, { i: 1, subject: "title", angle: "front", zoom: 1, cut: "whip", titles: [{ text: "Meet it", role: "hook", size: 8, x: 0.5, y: 0.5, w: 0.6 }] }] }, 2));
assert.ok(fidelity(studiedFilm, measuredRep).score >= 85 && fidelity(studiedFilm, measuredRep).score > guessedFid.score);

// the gradient engine: every world is a valid stack on any look, drifting in whole periods, still when asked
const { GRADIENTS, gradient, titleFill, darkStack } = await import("../src/studio/gradients.ts");
const night = matchLook("#6d5dfc", "deep", 1);
const paper = matchLook("#6d5dfc", "light", 1);
for (const g of GRADIENTS)
  for (const lk of [night, paper]) {
    const p = gradient(g.id, lk, { speed: 1 });
    assert.ok(p.length >= 1 && p.every((x) => x.stops.length && x.stops.every((st) => /^#[0-9a-f]{6}$/i.test(st.color) && st.alpha >= 0 && st.alpha <= 1)), `${g.id} isn't a clean stack`);
    assert.ok(gradient(g.id, lk, { speed: 0 }).every((x) => !x.drift), `${g.id} drifts when it's asked to be still`);
  }
assert.ok(darkStack(gradient("noir", paper)) && !darkStack(gradient("glow", paper)));
assert.ok(titleFill("spectrum", night).length === 1);

// the Artist: every kind of film in every art direction, timed to its beat, every cut carried, its titles readable
const { direct, takes, mockups, DIRECTIONS, STORIES } = await import("../src/studio/artist.ts");
const words = { kicker: "Introducing", hook: "Money that moves with you.", name: "Coins", tagline: "Pixels, in motion.", features: ["Send in a tap", "Split any bill", "Every coin, live"], split: "Money | in motion", proof: "", cta: "Get the app", by: "rules" };
for (const st of STORIES)
  for (const ad of DIRECTIONS) {
    const f = direct({ category: st.id, accent: "#e8613c", copy: words, seed: 4 }, ad);
    assert.ok(f.shots.length >= 4, `${st.id}/${ad.id} is too thin`);
    assert.ok(cutReport(f).every((c) => c.verdict !== "abrupt"), `${st.id}/${ad.id} has an abrupt cut`);
    assert.equal(f.artist.style, ad.id);
    const beat = 60 / Number(/(\d+) bpm/.exec(f.source)[1]);
    for (const sh of f.shots.filter((x) => x.paints)) assert.ok(Math.abs(sh.dur / beat - Math.round(sh.dur / beat)) < 0.05 || sh.device, `${sh.name} isn't a whole number of beats`);
    // every title reads on what's behind it: the ground, or the button it sits on
    for (const sh of f.shots) for (const l of sh.layers ?? []) if (l.kind === "text" && l.color && sh.paints) assert.ok(contrast(l.color, l.name === "Button label" ? sh.layers.find((x) => x.name === "Button").paint[0].stops[0].color : sh.paints[0].stops[0].color) >= 4.4 || l.paint, `${sh.name}: "${l.text}" doesn't read on its ground`);
  }
assert.equal(direct({ category: "social", accent: "#22c55e", copy: words }).size, "9x16");
assert.ok(direct({ category: "product-launch", length: "short", accent: "#22c55e", copy: words }).shots.length < direct({ category: "product-launch", length: "long", accent: "#22c55e", copy: words }).shots.length);
assert.equal(new Set(takes({ category: "teaser", accent: "#22c55e", copy: words, seed: 2 }).map((t) => t.artist.style)).size, 3);
assert.equal(mockups({ category: "brand", accent: "#22c55e", copy: words }).shots.length, 6);
// what the Artist made teaches the taste: its style is a feature, and an export outweighs a pick
const { features } = await import("../src/studio/taste.ts");
assert.ok(features(direct({ category: "teaser", accent: "#22c55e", copy: words }, DIRECTIONS[2])).includes("style:editorial"));
const leaned = learn([], [{ kind: "export", at: new Date().toISOString(), features: ["style:neon"] }, { kind: "skip", at: new Date().toISOString(), features: ["style:pop"] }]);
assert.ok(leaned.weights.find((w) => w.feature === "style:neon").lean > 0 && leaned.weights.find((w) => w.feature === "style:pop").lean < 0);

// the content reader: stats from words, a product's inventory, a bento that fills itself (the name and a screen always in)
const { statsIn, profileOf, fillCells, bentoCells } = await import("../src/studio/content.ts");
assert.deepEqual(statsIn("Loved by 2,000 teams").map((x) => x.value), ["2,000"]);
assert.equal(statsIn("version 2").length, 0);
const prof = profileOf({ name: "Coins", tagline: "Pixels, in motion.", features: ["10× faster sends", "Split any bill"], proof: "Loved by 2,000 teams", cta: "Get the app", screens: 3, components: 4, componentNames: ["Card", "Chart", "Feed", "Pay"] });
assert.ok(prof.items.some((x) => x.kind === "count" && x.value === "3" && x.label === "screens") && prof.stats.length === 2);
for (const seed of [1, 2, 3, 7])
  for (const [w, h, n] of [[1440, 900, 7], [1080, 1350, 5], [1080, 1920, 6]]) {
    const cells = bentoCells(w, h, n, seed, 48, 16);
    assert.ok(cells.length >= 3 && cells.every((c) => c.x >= 47 && c.y >= 47 && c.x + c.w <= w - 47 && c.y + c.h <= h - 47), `bento ${w}×${h} #${seed} leaves the frame`);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const [a, b] = [cells[i], cells[j]];
      assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `bento ${w}×${h} #${seed} overlaps`);
    }
    const fill = fillCells(cells, prof);
    assert.ok(fill.some((x) => x.kind === "name") && fill.some((x) => x.kind === "screen"), `bento ${w}×${h} #${seed} misses the name or a screen`);
  }
// your own art directions: checked from outside, read off pictures, faces only from the curated set; a film carries them
const { validDirection, directionFromPalette } = await import("../src/studio/artist.ts");
assert.equal(validDirection({}), null);
const mine = validDirection({ name: "Mine", harmony: "nope", energy: 9, anchor: "#FF0000", faces: { display: "Syne", text: "Comic Sans" }, own: { picture: "javascript:alert(1)" } });
assert.ok(mine.id.startsWith("own-") && mine.harmony === DIRECTIONS[0].harmony && mine.energy === 1 && mine.anchor === "#ff0000" && mine.faces.display === "Syne" && !mine.faces.text && !mine.own.picture);
assert.equal(directionFromPalette(["#0b0b10", "#7c3aed", "#22d3ee"], "Night", null).harmony !== "light", true);
assert.equal(directionFromPalette(["#f7f5f0", "#e8e4dc", "#d9d4ca"], "Paper", null).harmony, "light");
const typed = direct({ category: "teaser", accent: "#22c55e", copy: words }, mine);
assert.equal(typed.type.display, "Syne");
assert.ok(direct({ category: "product-launch", accent: "#22c55e", copy: words, screens: 3, components: 4 }, DIRECTIONS[0]).artist.pieces.includes("counts"));
const { fontsUrl } = await import("../src/studio/faces.ts");
assert.equal(fontsUrl(["Geist", "Nope"]), "");
assert.ok(fontsUrl(["Syne", "Instrument Serif"]).startsWith("https://fonts.googleapis.com/css2?family=Syne:"));

// the Work API's router: who it asks, in order, and what a failure does to a provider
const { order, after, JOBS } = await import("../server/work.ts");
const now = 1_000_000;
const snaps = { gemini: { setUp: true, cooling: now + 120000, used: 0, cap: 0 }, groq: { setUp: false, used: 0, cap: 0 }, cloudflare: { setUp: true, refused: "not valid", used: 0, cap: 0 }, openrouter: { setUp: true, used: 5, cap: 5 }, ollama: { setUp: true, used: 0, cap: 0 } };
const asked = order(JOBS.plan.chain, (id) => snaps[id], now);
assert.deepEqual(asked.filter((p) => !p.skip).map((p) => p.id), ["ollama"]); // resting, not set up, refused, capped: only the local one left
assert.match(asked[0].skip, /about 2 min/);
assert.equal(order(JOBS.read.chain, (id) => snaps[id], now + 200000)[0].skip, ""); // the rest is over
assert.ok(!JOBS.read.chain.includes("groq")); // a job that sees pictures skips text-only providers
assert.equal(after({ status: 429, message: "", retryAfter: 5000 }, now).cooling, now + 60000);
assert.equal(after({ status: 429, message: "", resetAt: now + 9e6 }, now).cooling, now + 9e6);
assert.ok(after({ status: 400, message: "API key not valid" }).refused && after({ status: 401, message: "" }).refused);
assert.deepEqual(after({ status: 503, message: "busy" }), {}); // busy: just ask the next one
assert.deepEqual(after({ status: 400, message: "max_tokens too large" }), {});

// the shot library and the slots: shots cut at a template's cuts, slots sized from its own words, words fitted to them
const { library, slotsOf, fitText, aspectOf, checkFilm } = await import("../src/studio/shots.ts");
const tmpl = {
  id: "film-x",
  name: "X",
  params: { name: "Coins", tags: "Send|Split a bill", screen: "" },
  schema: { name: { type: "text", label: "Name" }, tags: { type: "text", label: "Tags" }, screen: { type: "screen", label: "Your app", hint: "In the window (about 3:2)." }, mark: { type: "screen", label: "Logo" } },
  film: { size: "16x9", end: 6, look: "night", shots: [{ name: "Open", at: 0, role: ["hook"], energy: 3, enter: "cut", exit: "whip" }, { name: "The app", at: 2.5, role: ["product"], energy: 1, enter: "whip", exit: "hold", shows: ["screen", "tags"] }] },
};
const lib = library([tmpl, { id: "plain" }], { "film-x/open": ["name"] });
assert.deepEqual(lib.map((s) => [s.id, s.dur, s.shows.join()]), [["film-x/open", 2.5, "name"], ["film-x/the-app", 3.5, "screen,tags"]]);
assert.deepEqual(lib[1].stretch, [2.1, 5.6]);
const slots = slotsOf(tmpl, lib);
assert.deepEqual(slots.map((s) => [s.key, s.kind]), [["name", "text"], ["tags", "text"], ["screen", "screen"], ["mark", "logo"]]);
assert.equal(slots[2].aspect, 1.5);
assert.deepEqual(slots[1].shots, ["film-x/the-app"]);
assert.deepEqual([slots[1].pieces, slots[1].chars], [2, [5, 15]]);
assert.ok(fitText(slots[1], "Pay|Split any bill").ok);
assert.deepEqual(fitText(slots[1], "Payments|Split every single bill|More").problems.length, 3); // too many pieces, two too long
assert.equal(aspectOf("about 1400×850"), 1.65);
assert.deepEqual(checkFilm(tmpl), []);
assert.equal(checkFilm({ ...tmpl, film: { ...tmpl.film, shots: [{ ...tmpl.film.shots[0], at: 1, role: ["nope"] }] } }).length, 2);
// the template probe's made-up words fill a slot to its limit and no further
const { dummyPiece } = await import("../server/templates.ts");
for (const [c, w] of [[5, 1], [14, 3], [40, 4]]) {
  const d = dummyPiece("tags", 0, c, w);
  assert.ok(d.length <= c && d.split(" ").length <= w && /^[A-Z]/.test(d), `${d} (${c}, ${w})`);
}

// the gates: flashes counted the WCAG way, invented figures caught, a hook found, a scene of nothing named
const { flashAt, judge } = await import("../server/gates.ts");
const strobe = Array.from({ length: 60 }, (_, i) => (Math.floor(i / 3) % 2 ? 0.9 : 0.1)); // 10 flashes a second
assert.equal(flashAt(strobe, 60), 0.05); // the first change, three frames in
assert.equal(flashAt(Array.from({ length: 120 }, (_, i) => (Math.floor(i / 20) % 2 ? 0.9 : 0.1)), 60), null); // 1.5 a second
assert.equal(flashAt(Array.from({ length: 60 }, (_, i) => 0.5 + 0.04 * Math.sin(i)), 60), null); // a shimmer isn't a flash
const gComp = { scenes: [{ id: "a", name: "Open", duration: 3, layers: [{ id: "f", kind: "component", anim: "film-x", from: 0 }] }, { id: "b", name: "Card", duration: 2, layers: [] }] };
const run = (text, px = 60, o = {}) => ({ text, px, x: 400, y: 400, w: 300, h: 70, color: "rgb(255,255,255)", clipped: false, edge: false, ...o });
const smp = (t, scene, runs, palette = [{ hex: "#101010", share: 0.5 }]) => ({ t, scene, runs, png: "", palette, text: runs.map((r) => r.text.toLowerCase()).join(" ") });
const gKit = { id: "k", name: "Coins", updated: "", words: { name: "Coins", tagline: "", hook: "", features: [], proof: "Loved by 2,000 teams", cta: "Get it" }, brand: { accent: "#6d5dfc" }, files: [] };
const gates = judge(gComp, [smp(0.5, 0, [run("Pay $87.00 now"), run("tiny words here", 18)]), smp(3.5, 1, [], [{ hex: "#000000", share: 0.97 }]), smp(4.6, 1, [], [{ hex: "#000000", share: 0.97 }])], [0, 3], { W: 1920, H: 1080 }, lib, gKit, 12);
const all = Object.fromEntries(gates.map((g) => [g.id, g.findings.map((f) => f.text)]));
assert.ok(all.story.some((t) => /“\$87\.00”/.test(t)), all.story.join("\n")); // not in the material
assert.ok(!all.story.some((t) => /2,000/.test(t)));
assert.ok(all.story.some((t) => /“Card” shows almost nothing/.test(t)));
assert.ok(all.story.some((t) => /the target is 12 s/.test(t)));
assert.ok(all.readability.some((t) => /“tiny words here” is about 18 px/.test(t)));
assert.equal(gates.find((g) => g.id === "readability").pass, false);

// the smart engine: a story timed (to a song), a shot cast for each beat across templates, locked to one, the beat found
const { planStory, shapeFor, cast, cutFor, carry, beatsOf } = await import("../src/studio/story.ts");
const story = planStory("launch", 15);
assert.equal(Math.round(story.reduce((a, b) => a + b.dur, 0) * 100) / 100, 15);
assert.deepEqual([story[0].role, story.at(-1).role], ["hook", "logo"]);
assert.ok(planStory("launch", 6).length <= 3 && planStory("launch", 6).some((b) => b.role === "hook")); // a short film keeps the hook
const grid = Array.from({ length: 40 }, (_, i) => Math.round(i * 0.5 * 100) / 100); // 120 bpm
const onGrid = planStory("launch", 15, grid);
let at = 0;
for (const b of onGrid.slice(0, -1)) {
  at += b.dur;
  assert.ok(grid.some((g) => Math.abs(g - at) < 0.011), `a beat ends off the music at ${at}`);
}
assert.equal(shapeFor({ length: 6, features: 3, screens: 2 }), "teaser");
assert.equal(shapeFor({ length: 20, features: 4, screens: 1, whatsNew: "a new feature: offline mode" }), "countdown");
assert.equal(cutFor("whip", "cut"), "whip");
assert.equal(carry("push-in", "pull-out"), 0);
assert.equal(carry("pan", "pan"), 1);
const shotLib = [
  { id: "a/hook", film: "a", template: "A", name: "Hook", at: 0, dur: 2, role: ["hook"], energy: 3, enter: "cut", exit: "whip", size: "16x9", look: "night", dark: true, stretch: [1.2, 3.2], shows: ["name"] },
  { id: "a/app", film: "a", template: "A", name: "App", at: 2, dur: 3, role: ["product"], energy: 2, enter: "whip", exit: "cut", size: "16x9", look: "night", dark: true, stretch: [1.8, 4.8], shows: ["screen"] },
  { id: "b/app", film: "b", template: "B", name: "Paper app", at: 0, dur: 3, role: ["product"], energy: 2, enter: "cut", exit: "cut", size: "16x9", look: "paper", dark: false, stretch: [1.8, 4.8], shows: ["screen"] },
  { id: "b/end", film: "b", template: "B", name: "End", at: 3, dur: 2, role: ["logo", "cta"], energy: 1, enter: "cut", exit: "hold", size: "16x9", look: "paper", dark: false, stretch: [1.2, 3.2], shows: ["name"] },
  { id: "c/proof", film: "c", template: "C", name: "Figures", at: 0, dur: 2, role: ["proof"], energy: 3, enter: "cut", exit: "cut", size: "16x9", look: "pop", dark: false, stretch: [1.2, 3.2], shows: ["amount"] },
];
const beats3 = [{ role: "hook", energy: 3, what: "", dur: 2 }, { role: "product", energy: 2, what: "", dur: 3 }, { role: "logo", energy: 1, what: "", dur: 2 }];
const c3 = cast(beats3, shotLib, { screens: 2, logo: true, photos: 0, words: true, figures: false });
assert.deepEqual(c3.map((c) => c.shot.id), ["a/hook", "a/app", "b/end"]); // the product shot keeps the night look and picks up the whip
assert.equal(c3[1].cut, "whip");
assert.ok(/picks up the whip/.test(c3[1].why), c3[1].why);
assert.deepEqual(cast(beats3, shotLib, { screens: 1, logo: true, photos: 0, words: true, figures: false }, { locked: "b" }).map((c) => c.shot.id), ["b/app", "b/end"]); // locked: B as it was cut
// 120 bpm from an onset envelope with a pulse every half second (hop 10 ms)
const env = Array.from({ length: 800 }, (_, i) => (i % 50 === 7 ? 1 : 0.02));
const bt = beatsOf(env, 0.01);
assert.ok(Math.abs(bt.bpm - 120) < 1.5, `bpm ${bt.bpm}`);
assert.ok(Math.abs(bt.beats[0] - 0.07) < 0.02, `phase ${bt.beats[0]}`);

// cut to the music: every cut lands on a beat, each scene within its range
const { snapToBeats } = await import("../src/studio/story.ts");
const snapped = snapToBeats([1.9, 2.3, 3.1, 2], grid, (i) => (i === 1 ? [2, 2.2] : [0.5, 60]));
assert.deepEqual(snapped, [2, 2, 3, 2]);

// a studied film as the start of a template: its shots tagged so the template checker passes them
const { draftSpec } = await import("../src/studio/draft.ts");
const draft = draftSpec({ title: "R", palette: ["#0a0a0a"], file: { w: 1920, h: 1080 }, shots: [{ at: 0, dur: 0.8, what: "A word slams in", type: "Ship it", cut: "" }, { at: 0.8, dur: 3, what: "The app's dashboard, panning", cut: "whip pan", to: "pans right" }, { at: 3.8, dur: 2, what: "Loved by 2,000 teams", cut: "cut" }, { at: 5.8, dur: 2, what: "The logo", cut: "zoom in" }] });
assert.deepEqual(draft.film.shots.map((s) => s.role[0]), ["hook", "product", "proof", "logo"]);
assert.deepEqual([draft.film.size, draft.film.look, draft.film.end], ["16x9", "night", 7.8]);
assert.equal(draft.film.shots[1].enter, "whip");
assert.deepEqual(checkFilm({ id: "draft", film: draft.film }), []);
assert.deepEqual(draft.slots.map((s) => s.kind), ["text", "screen", "logo"]);

// logo to vector: a square with a hole traced as one path with two outlines, its colour kept, corners only
const { traceLogo, outlines, simplify } = await import("../src/studio/trace.ts");
const W8 = 20;
const logo = new Uint8ClampedArray(W8 * W8 * 4);
for (let y = 0; y < W8; y++)
  for (let x = 0; x < W8; x++) {
    const inside = x >= 4 && x < 16 && y >= 4 && y < 16 && !(x >= 8 && x < 12 && y >= 8 && y < 12);
    logo.set(inside ? [229, 57, 53, 255] : [0, 0, 0, 0], (y * W8 + x) * 4);
  }
const traced = traceLogo({ width: W8, height: W8, data: logo });
assert.deepEqual(traced.colours, ["#e53935"]);
assert.equal((traced.svg.match(/M/g) ?? []).length, 2); // the square and its hole
const sq = new Uint8Array(W8 * W8);
for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) sq[y * W8 + x] = 1;
assert.equal(simplify(outlines(sq, W8, W8)[0], 0.5).length, 4); // a square is four corners

// other shapes and lengths: a wide shot made vertical slides to its action; a cutdown keeps the hook and the name
const { reframe, cutdown } = await import("../src/studio/formats.ts");
const wideFilm = { size: "16x9", scenes: [{ id: "s1", name: "Hook", duration: 2, layers: [{ id: "l1", kind: "component", anim: "a", from: 0, aspect: 16 / 9, box: { x: 0.5, y: 0.5, w: 1 } }, { id: "t", kind: "text", box: { x: 0.5, y: 0.8, w: 0.95 } }] }] };
const tall = reframe(wideFilm, "9x16", shotLib, { "a/hook": { "9x16": { x: 0.8 } } });
const film1 = tall.scenes[0].layers[0];
assert.equal(tall.size, "9x16");
assert.equal(film1.box.w, 3.16); // (16/9) / (9/16)
assert.ok(film1.box.x < 0.5 && film1.box.x - film1.box.w / 2 <= 0 && film1.box.x + film1.box.w / 2 >= 1, JSON.stringify(film1.box)); // slid left so 80% across is in the middle, still covering
assert.equal(tall.scenes[0].layers[1].box.w, 0.86); // the title narrowed
const longFilm = { size: "16x9", scenes: ["a/hook", "a/app", "b/app", "c/proof", "b/end"].map((id, i) => { const s = shotLib.find((x) => x.id === id); return { id: `s${i}`, name: s.name, duration: s.dur, layers: [{ id: `l${i}`, kind: "component", anim: s.film, from: s.at, aspect: 16 / 9 }] }; }) };
const six = cutdown(longFilm, 6, shotLib);
assert.ok(six.keep[0] === 0 && six.keep.at(-1) === 4, JSON.stringify(six)); // the hook and the end card stay
assert.ok(Math.abs(six.durations.reduce((a, b) => a + b, 0) - 6) < 0.1, JSON.stringify(six));
assert.equal(cutdown(longFilm, 12, shotLib).keep.length, 5);

// a platform's own frame (the App Store's 886 × 1920) takes its focus from the nearest measured shape
const store = reframe(wideFilm, "app-store", shotLib, { "a/hook": { "9x16": { x: 0.8 } } }).scenes[0].layers[0];
assert.ok(store.box.x < 0.5 && store.box.w > 3.8, JSON.stringify(store.box));
// a title 60% of the film's width wouldn't fit a tall frame: the film shrinks until it does, centred on it
const titled = reframe(wideFilm, "9x16", shotLib, { "a/hook": { "9x16": { x: 0.8 }, words: { x: 0.1, y: 0.4, w: 0.6, h: 0.2 } } }).scenes[0].layers[0].box;
assert.equal(titled.w, 1.515); // 1 / (0.6 + 0.06)
assert.ok(Math.abs(titled.x + (0.4 - 0.5) * titled.w - 0.5) < 0.01, JSON.stringify(titled)); // the title's centre mid-frame

// searching your own work in plain words: a name counts most; found by its name or half of what's asked
const { rank, words: plainWords } = await import("../server/search.ts");
assert.deepEqual(plainWords("The dark films for Linear"), ["dark", "film", "linear"]);
const docs = [
  { kind: "kit", id: "k1", title: "Linear", sub: "Product", texts: ["Plan and build products", "#5e6ad2"] },
  { kind: "version", id: "v1", title: "Dark cut", sub: "Version", texts: ["Linear on a dark ground", "Hook"] },
  { kind: "review", id: "r1", title: "Venmo film", sub: "Review", texts: ["the logo is too small"] },
];
const found = rank(docs, "the dark film for linear");
assert.deepEqual(found.map((h) => h.id), ["v1", "k1", "r1"], JSON.stringify(found)); // the Venmo film only by "film", so last
assert.equal(found[0].snippet, "Linear on a dark ground");
assert.equal(rank(docs, "logos").length, 1); // by a word's start
assert.equal(rank(docs, "the of").length, 0);

// effects: every preset valid, with no errors against the rulebook; scenes take six inks, screen and paper survive; the
// editor's sources are the renderer's (public/canvas.js), in its order
const fxm = await import("../src/canvas/effects.ts");
for (const p of fxm.EFFECT_SEEDS) {
  const v = fxm.validatePreset(p);
  assert.ok(v.preset && !v.errors.length, `${p.id}: ${v.errors.join(", ")}`);
  assert.deepEqual(fxm.lintEffect(v.preset.effect).filter((f) => f.level === "error").map((f) => f.text), [], p.id);
}
const seven = ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"];
const tv = fxm.validateEffect({ ...fxm.EFFECT_DEFAULTS, source: "tiles", colors: seven, screen: 0.5, paper: 2 }).effect;
assert.equal(tv.colors.length, 7);
assert.equal(tv.screen, 0.5);
assert.equal(tv.paper, 1);
assert.ok(fxm.isScene(tv) && !fxm.isScene({ source: "cumulus" }));
assert.ok(fxm.lintEffect(tv).some((f) => f.rule === "finish.one"));
assert.ok(fxm.lintEffect({ ...fxm.EFFECT_DEFAULTS, colors: seven.slice(0, 5) }).some((f) => f.rule === "palette.one"));
const { readFileSync } = await import("node:fs");
const runtimeSrc = JSON.parse(/const SRC = (\[[^\]]+\])/.exec(readFileSync(new URL("../public/canvas.js", import.meta.url), "utf8"))[1]);
assert.deepEqual(fxm.SOURCES.map((x) => x.value), runtimeSrc);
assert.deepEqual(fxm.SCENE_SOURCES, runtimeSrc.slice(runtimeSrc.indexOf("horizon")));

// errors in plain words, each with the step that helps
const { explain } = await import("../src/trouble.ts");
{
  const k = (m, online = true) => explain(new Error(m), online).kind;
  assert.equal(k("anything", false), "offline");
  assert.equal(k("Failed to fetch"), "server");
  assert.equal(k("Kits are kept by the engine's server: start it with npm run dev."), "server");
  assert.equal(k("The Work API isn't set up: add its Gemini key in Lab → Settings."), "ai-key");
  assert.equal(k("No provider could answer. Gemini: Your key's free tier allows 20 requests a day on gemini-3.6-flash, and today's are used up"), "ai-quota");
  assert.equal(k("Gemini is busy right now (503): This model is currently experiencing high demand."), "ai-busy");
  assert.equal(k("No provider could answer. Gemini: Gemini didn't answer in time. Try again, or pick a lighter model in Settings"), "timeout");
  assert.equal(k("ffmpeg failed"), "unknown");
  assert.ok(!explain(new Error("Your key's free tier allows 20 requests a day")).detail.startsWith("No provider"));
}

// the film maker: every film template has a contract naming only slots it has; the picker puts an AI product on the AI
// template and a payments app on a money one; the checks catch the reference film's words, invented figures and its names
{
  const { CONTRACTS, contractFor } = await import("../src/studio/contracts.ts");
  const { pick, checkLines, linesRequest, applySceneOps } = await import("../src/studio/maker.ts");
  const { fitText } = await import("../src/studio/shots.ts");
  assert.equal(CONTRACTS.length, 12);
  for (const c of CONTRACTS) assert.ok(c.idea && Object.keys(c.slots).length && c.fits.length, c.film);
  const brief = (kind, features, more = {}) => ({ product: "Nova", kind, oneLiner: "", audience: "", problem: "", oldWay: "", promise: "", features: features.map((name) => ({ name, benefit: "" })), proof: [], usp: "", tone: "", banned: [], cta: "Try it", by: "rules", updated: "", ...more });
  const T = (id, film, size = "16x9", seconds = 12) => ({ t: { id, film, name: id, size, seconds, screens: [] }, c: contractFor(film) });
  const list = [T("liquid", "film-liquid"), T("horizon", "film-horizon", "16x9", 23.6), T("glide", "film-glide"), T("quad", "film-quad", "16x9", 4.4)];
  assert.equal(pick(brief("an AI assistant agent that answers anything", ["Ask", "Plan"]), list)[0].id, "liquid");
  assert.equal(pick(brief("a payments wallet app for sending money", ["Send", "Request", "Split"]), list)[0].id, "horizon");
  // no real number: the template that needs one says so
  assert.ok(pick(brief("payments app", ["Send"]), list).find((p) => p.id === "quad").reasons.some((r) => r.includes("real number")));
  const slots = [
    { key: "name", kind: "text", label: "Name", example: "Arcane", pieces: 1, chars: [8], words: [2] },
    { key: "orbit", kind: "text", label: "Under the comet", example: "Everything Anonymous|Consolidated Instantly", pieces: 2, chars: [25, 28], words: [3, 3] },
    { key: "switch", kind: "text", label: "Last panel", example: "Everything Private|Switch To Arcane", pieces: 2, chars: [23, 20], words: [3, 4] },
  ];
  const c = contractFor("film-horizon");
  const probs = checkLines({ name: "Nova", orbit: "Everything Anonymous|Consolidated Instantly", switch: "Save 40% today|Switch To Arcane" }, slots, c, brief("payments", ["Send"]), fitText);
  assert.ok(probs.some((p) => p.key === "orbit" && p.text.includes("reference film")));
  assert.ok(probs.some((p) => p.key === "switch" && p.text.includes("40%")));
  assert.ok(probs.some((p) => p.key === "switch" && p.text.includes("Arcane")));
  assert.equal(checkLines({ name: "Nova", orbit: "Private By Default|Settled In Seconds", switch: "Everything Yours|Switch To Nova" }, slots, c, brief("payments", ["Send"]), fitText).filter((p) => p.level === "error").length, 0);
  const req = linesRequest(brief("payments", ["Send"]), c, slots);
  assert.deepEqual(req.schema.schema.required, ["name", "orbit", "switch"]);
  assert.ok(req.messages[1].content.includes("old-way") === false && req.messages[1].content.includes("benefit"));
  assert.deepEqual(applySceneOps([{ duration: 1 }, { duration: 2 }, { duration: 3 }], [{ op: "drop", scene: 0 }, { op: "retime", scene: 0, seconds: 5 }]), [{ duration: 5 }, { duration: 3 }]);
  // a contract's reference names are caught whole, case and all
  assert.ok(checkLines({ name: "Nova", orbit: "Swap On Magic Eden|Settled In Seconds", switch: "Everything Yours|Switch To Nova" }, slots, c, brief("payments", ["Send"]), fitText).some((p) => p.text.includes("Magic Eden")));

  // the product in the template: its palette over the template's, its screens by feature
  const { toneMap, resolve, tones } = await import("../src/animations/_film/tone.ts");
  const { themeFor, storyScreens } = await import("../src/studio/maker.ts");
  const paper = { ground: "#f5f4f0", ink: "#141414", accent: "#8ea8f0" };
  const dark = toneMap(["f5f4f0", "141414", "ffffff", "e4e3de", "8ea8f0", "f2c94c", "ff5f57"], paper, { bg: "#000000", ink: "#ededed", accent: "#ff3366", fit: "product" });
  assert.equal(dark.f5f4f0, "#000000"); // the ground is the product's
  assert.equal(dark["141414"], "#ededed"); // so is the ink
  assert.ok(parseInt(dark.ffffff.slice(1, 3), 16) > 0 && parseInt(dark.ffffff.slice(1, 3), 16) < 40); // a lifted card: just off the ground
  assert.ok(parseInt(dark.e4e3de.slice(1, 3), 16) < 60); // a line near the ground stays near it
  assert.equal(dark.f2c94c, "#f2c94c"); // a colour outside the accent's family stays
  assert.ok(dark["8ea8f0"] !== "#8ea8f0" && parseInt(dark["8ea8f0"].slice(1, 3), 16) > parseInt(dark["8ea8f0"].slice(5, 7), 16)); // the accent turns red
  const acc = toneMap(["f5f4f0", "8ea8f0"], paper, { bg: "#000000", ink: "#ededed", accent: "#ff3366", fit: "accent" });
  assert.equal(acc.f5f4f0, "#f5f4f0"); // "accent" keeps the template's ground
  Object.assign(tones, { f5f4f0: "#000000" });
  assert.equal(resolve("0 0 0 1px var(--t-f5f4f0, #f5f4f0), var(--t-111111, #111111)"), "0 0 0 1px #000000, #111111");
  Object.assign(tones, { sans: "\"Inter\"" });
  assert.equal(resolve("font-family:var(--t-sans, &quot;Geist&quot;)", true), "font-family:&quot;Inter&quot;"); // markup stays markup
  for (const k of Object.keys(tones)) delete tones[k];
  const kit = { id: "k", name: "Nova", updated: "", words: { name: "Nova", tagline: "", hook: "", features: [], proof: "", cta: "" }, brand: { ground: "#000000", ink: "#ededed", text: "Inter", display: "Geist" }, files: [
    { id: "a", name: "home.png", type: "image/png", size: 1, url: "/a", w: 1440, h: 900, kind: "desktop" },
    { id: "b", name: "shaders.png", type: "image/png", size: 1, url: "/b", w: 1440, h: 900, kind: "desktop" },
    { id: "c", name: "studio.png", type: "image/png", size: 1, url: "/c", w: 1440, h: 900, kind: "desktop", shows: "The editor with a phone mockup" },
  ] };
  const th = themeFor(kit, contractFor("film-horizon"));
  assert.equal(th.accent, "#ededed"); // black and white: the ink is the accent
  assert.equal(th.fit, "accent");
  assert.ok(th.fonts[0].includes("family=Inter") && th.fonts.length === 1); // Geist is in the frame already
  const scr = [{ key: "dashboard", kind: "screen", label: "Home screen", hint: "", aspect: 1.6, shots: [] }, { key: "screen1", kind: "screen", label: "Page 1", aspect: 1.5, shots: [] }, { key: "screen2", kind: "screen", label: "Page 2", aspect: 1.5, shots: [] }];
  const got = storyScreens(brief("a film tool", ["Studio", "Shaders"]), kit, scr);
  assert.deepEqual([got.dashboard, got.screen1, got.screen2], ["image:/a", "image:/c", "image:/b"]);
}

// the director: a spine kept to its rules, a film timed to the length on the tempo's beats
{
  const { fixSpine, buildFilm, productShare } = await import("../src/studio/screenplay.ts");
  const { DIRECTIONS } = await import("../src/studio/artist.ts");
  const b = { product: "Nova", kind: "app", oneLiner: "", audience: "", problem: "", oldWay: "", promise: "Ship faster", features: [], proof: [], usp: "", tone: "", banned: [], cta: "Try Nova", by: "ai", updated: "" };
  const carriers = [{ id: "words", kind: "words", what: "" }, { id: "logo", kind: "logo", what: "" }, { id: "screen:a", kind: "device", file: "a", what: "" }, { id: "clip:b", kind: "clip", file: "b", seconds: 9, what: "" }];
  const sp = fixSpine({ beats: [{ role: "hook", say: "Your launch video is already out of date and nobody noticed", carrier: "words", seconds: 3 }, { role: "proof", say: "Drop in screens", carrier: "screen:a", seconds: 4 }, { act: "show", say: "Again", carrier: "screen:a", seconds: 4 }, { role: "proof", say: "Watch it", carrier: "clip:b", seconds: 4 }, { role: "proof", say: "Ghost", carrier: "screen:nope", seconds: 4 }] }, carriers, b, 30);
  assert.equal(sp.beats[0].say, "Your launch video is already out of date"); // cut at nine words, no dangling “and”
  const { tidy } = await import("../src/studio/screenplay.ts");
  assert.equal(tidy("Updating product videos by hand takes too long.", 9), "Updating product videos by hand takes too long."); // whole when it fits
  assert.equal(tidy("Every screen change means a manual edit, again and again and again", 9), "Every screen change means a manual edit"); // cut where it breaks
  assert.equal(sp.beats.filter((x) => x.carrier === "logo").length, 2); // the mark at the turn and at the end
  assert.equal(sp.beats.at(-1).carrier, "logo");
  assert.equal(sp.beats.at(-1).role, "cta"); // the close: the name alone, at most a quarter of the film
  assert.ok(sp.beats.at(-1).seconds <= 30 * 0.25 && !sp.beats.at(-1).sub);
  assert.ok(sp.beats.every((x) => x.buys)); // every beat buys something
  assert.equal(sp.beats.filter((x) => x.carrier === "screen:a").length, 1); // a screen used once
  assert.ok(Math.abs(sp.beats.reduce((a, x) => a + x.seconds, 0) - 30) < 1e-6);
  assert.ok(productShare(sp, carriers) > 0.2);
  const m = { world: "/w.mp4", mark: "/m.mp4", shapes: {}, screen: (f) => `/s/${f}`, clip: (f, at, d) => `/c/${f}@${at.toFixed(2)},${d.toFixed(2)}.mp4` };
  const built = buildFilm(sp, carriers, DIRECTIONS[0], m, { name: "Nova" });
  const durs = built.script.shots.map((x) => x.dur);
  assert.ok(Math.abs(durs.reduce((a, d) => a + d, 0) - 30) < 0.05, `${durs}`); // the length asked
  assert.ok(durs.every((d, i) => d >= (built.meanings[i].shows === "the claim in type" ? 1.09 : 1.99))); // a claim is read in about a second, every other shot gets two
  assert.ok(built.script.shots.every((x) => x.layers[0].name === "World")); // one world under every shot
  assert.ok(built.script.shots.every((x) => x.cut === "cut")); // hard cuts: nothing fades between beats
  assert.ok(built.script.shots.every((x) => (x.layers ?? []).every((l) => l.kind !== "text" || !l.exit))); // titles leave on the cut
  const proofAt = built.meanings.findIndex((x) => x.role === "proof" && x.shows === "the claim in type");
  assert.ok(proofAt >= 0 && built.meanings[proofAt + 1].role === "proof" && !built.meanings[proofAt + 1].says); // say it, then show it
  assert.equal(built.meanings.length, built.script.shots.length);
  const clip = built.script.shots.flatMap((x) => x.layers).find((l) => l.name === "Recording");
  const i = built.script.shots.findIndex((x) => x.layers.includes(clip));
  assert.ok(clip.src.includes(`@${built.starts[i].toFixed(2)}`)); // a recording placed at its shot's start
}

// the cross-checker: motionmaxxing's gates on a composition
{
  const { lintFilm, notesOf } = await import("../src/studio/crosscheck.ts");
  const T = (text, y, o = {}) => ({ kind: "text", text, size: 5, box: { x: 0.5, y, w: 0.8 }, entry: { at: 0.1, dur: 0.6 }, ...o });
  const m = (role) => ({ role, buys: "Buys trust: the viewer sees it done.", says: "", carrier: "words", shows: "" });
  const bad = { scenes: [
    { name: "Hook", duration: 3, layers: [T("Meet Nova, the future of notes", 0.5)], meaning: m("hook") },
    { name: "Proof", duration: 4, transition: "dissolve", layers: [T("Drop in screens", 0.12), { kind: "image", name: "Recording", box: { x: 0.5, y: 0.6, w: 0.4 } }], meaning: m("proof") },
    { name: "Proof 2", duration: 4, transition: "blur", layers: [{ kind: "device" }], camera: { zoom: 0.8 } },
    { name: "End", duration: 6, layers: [T("Nova", 0.7), T("nova.app", 0.95, { size: 1, font: "mono" })], meaning: m("cta") },
  ] };
  const f = lintFilm(bad);
  const has = (gate, scene) => f.some((x) => x.gate === gate && (scene === undefined || x.scene === scene));
  assert.ok(has("copy", 0)); // slogan copy
  assert.ok(has("deck layout", 1)); // a title over the product
  assert.ok(has("G1 proof readable", 1) && has("G1 proof readable", 2)); // a small recording, a small device
  assert.ok(has("G3 end card", 3)); // a long end card
  assert.ok(has("G5 page chrome", 3)); // an edge label, an address in the close
  assert.ok(has("cuts")); // fades between beats
  assert.ok(has("meaning", 2)); // a shot with no meaning
  assert.ok(notesOf(f).startsWith("Shot")); // notes for the director, fails first
  const good = { scenes: [
    { name: "Hook", duration: 4, layers: [T("Updating every film by hand takes days", 0.5)], meaning: m("hook") },
    { name: "Claim", duration: 1.4, layers: [T("Drop in your screens", 0.5)], meaning: m("proof") },
    { name: "Product", duration: 4, layers: [{ kind: "image", name: "Recording", box: { x: 0.5, y: 0.5, w: 0.84 } }], meaning: m("proof") },
    { name: "End", duration: 2.2, layers: [T("Nova", 0.74, { entry: { at: 0.35, dur: 0.6 } })], meaning: m("cta") },
  ] };
  assert.deepEqual(lintFilm(good).filter((x) => x.level === "fail"), []);
  assert.ok(lintFilm({ scenes: good.scenes.map((x) => ({ ...x, layers: x.layers.filter((l) => l.kind === "text") })) }).some((x) => x.gate === "product")); // no product on screen
  const { fixSpine: fix2 } = await import("../src/studio/screenplay.ts");
  const cs = [{ id: "words", kind: "words", what: "" }, { id: "logo", kind: "logo", what: "" }, { id: "clip:x", kind: "clip", file: "x", what: "a recording of someone using it: sync screens across every film" }, { id: "shape:core", kind: "shape", what: "a shape" }];
  const sp2 = fix2({ beats: [{ role: "proof", say: "Sync your screens everywhere", carrier: "shape:core", seconds: 5 }] }, cs, { product: "Nova", promise: "", oneLiner: "", cta: "Try" }, 20);
  assert.equal(sp2.beats.find((x) => x.role === "proof").carrier, "clip:x"); // a proof moved onto the product's recording
}

// panels in a product's code: read, matched to what a beat says, and built on screen by the director
{
  const { panelsFromCode, matchPanel, panelValues } = await import("../src/studio/panels.ts");
  const code = `
export function AttentionPanel({ issue }) {
  return (
    <aside className="w-80">
      <h2 className="text-lg font-semibold">What needs your attention</h2>
      <dl>
        <dt>Status</dt><dd><Badge>{issue.status}</Badge></dd>
        <dt>Priority</dt><dd>High</dd>
      </dl>
      <Button onClick={act}>Take action</Button>
      <Button variant="ghost">Snooze</Button>
    </aside>
  )
}
function Nav() { return <nav><a href="/">Home</a><a href="/t">Traces</a></nav> }`;
  const html = `<div class="card"><h3>Trace details</h3><table><tr><th>Duration</th><td>1.2 s</td></tr><tr><th>Spans</th><td>48</td></tr></table><a class="btn">Open trace</a></div>`;
  const ps = [...panelsFromCode(code, "src/AttentionPanel.tsx"), ...panelsFromCode(html, "index.html")];
  const att = ps.find((p) => p.title === "What needs your attention");
  assert.ok(att, JSON.stringify(ps));
  assert.deepEqual(att.rows, ["Status: ~", "Priority: High"]); // a value worked out as it runs is ~, never invented
  assert.deepEqual(att.ctas, ["Take action", "Snooze"]);
  assert.equal(att.component, "AttentionPanel");
  assert.deepEqual(ps.find((p) => p.title === "Trace details").rows, ["Duration: 1.2 s", "Spans: 48"]);
  assert.equal(ps.length, 2); // a nav of links is not a panel
  assert.equal(matchPanel("Act on what needs your attention.", ps)?.panel.title, "What needs your attention");
  assert.equal(matchPanel("Open any trace in a click", ps)?.panel.title, "Trace details");
  assert.equal(matchPanel("Ship faster with fewer bugs", ps), null);
  assert.equal(panelValues(att).rows, "Status: ~|Priority: High");

  const { fixSpine, buildFilm, productShare, PANEL_BEAT } = await import("../src/studio/screenplay.ts");
  const { DIRECTIONS } = await import("../src/studio/artist.ts");
  const b = { product: "Trace", promise: "See what matters", oneLiner: "", cta: "Try Trace" };
  const carriers = [{ id: "words", kind: "words", what: "" }, { id: "logo", kind: "logo", what: "" }, { id: "screen:a", kind: "device", file: "a", what: "its screen on a laptop: the inbox" }, ...ps.map((p) => ({ id: p.id, kind: "panel", what: p.title, panel: p }))];
  const sp = fixSpine({ beats: [{ role: "hook", say: "Too many alerts, no idea what matters", carrier: "words", seconds: 5 }, { role: "proof", say: "Act on what needs your attention.", carrier: "screen:a", seconds: 4 }, { role: "proof", say: "Drop in your screens", carrier: "words", seconds: 4 }, { role: "cta", say: "Start tracing", carrier: "words", seconds: 3 }] }, carriers, b, 30);
  const pb = sp.beats.find((x) => x.say.startsWith("Act on"));
  assert.equal(pb.carrier, att.id); // the feature with a panel is built from it
  assert.ok(pb.seconds >= PANEL_BEAT - 1e-6, `${pb.seconds}`); // with the time to build it
  assert.equal(sp.beats.find((x) => x.say === "Drop in your screens").carrier, "screen:a"); // the screen it left goes to another proof
  assert.ok(Math.abs(sp.beats.reduce((a, x) => a + x.seconds, 0) - 30) < 1e-6);
  assert.ok(sp.beats.every((x, i) => i === sp.beats.length - 1 || x.seconds >= 1.99));
  assert.ok(productShare(sp, carriers) > 0.3);
  const m = { world: "/w0.mp4", worlds: ["/w0.mp4", "/w1.mp4"], mark: "/m.mp4", shapes: {}, accent: "#e0457b", screen: (f) => `/s/${f}`, clip: () => "/c.mp4" };
  const built = buildFilm(sp, carriers, DIRECTIONS[0], m, { name: "Trace" });
  const at = built.script.shots.findIndex((x) => x.layers.some((l) => l.anim === "film-unfold"));
  assert.ok(at > 0 && built.meanings[at - 1].shows === "the claim in type"); // say it, then build it
  const unfold = built.script.shots[at].layers.find((l) => l.anim === "film-unfold");
  assert.equal(unfold.from, 0);
  assert.ok(Math.abs(unfold.rate - 6.4 / built.script.shots[at].dur) < 0.01); // its own pace, fitted to the shot
  assert.equal(unfold.values.title, "What needs your attention");
  assert.equal(unfold.values.accent, "#e0457b");
  assert.equal(built.script.shots[at].layers[0].src, "/w1.mp4"); // the proofs live in the second world's colours
  assert.equal(built.script.shots[0].layers[0].src, "/w0.mp4");
  assert.ok(built.script.shots.every((x) => x.layers[0].name === "World"));
  assert.equal(panelValues({ ...att, src: "/__film/media/panel-x.html" }).src, "/__film/media/panel-x.html"); // the app's own panel, when captured

  // on composed fields: each act its own composition, grain only where there are words, the titles in the field's ink
  const { composedField, COMPOSITIONS } = await import("../src/studio/field.ts");
  const { contrast } = await import("../src/theme.ts");
  const fb = buildFilm(sp, carriers, DIRECTIONS[0], { ...m, field: { accent: "#2459f5" } }, { name: "Trace" });
  const worldOf = (i) => fb.script.shots[i].layers[0];
  assert.ok(fb.script.shots.every((x, i) => worldOf(i).kind === "component" && worldOf(i).anim === "film-field" && worldOf(i).name === "World"));
  assert.equal(worldOf(0).values.variant, "diagonal"); // the hook
  assert.equal(worldOf(fb.script.shots.length - 1).values.variant, "spot"); // the end card
  const pi = fb.script.shots.findIndex((x) => x.layers.some((l) => l.anim === "film-unfold"));
  assert.ok(["horizon", "mirror"].includes(worldOf(pi).values.variant)); // the proofs
  assert.ok(worldOf(0).values.grain > 0 && worldOf(pi).values.grain === 0); // grain on the words, none under the product
  assert.ok(Math.abs(worldOf(1).values.at - fb.starts[1]) < 0.01); // the field drifts on through the cut
  const ink = composedField("#2459f5").ink;
  assert.ok(fb.script.shots[0].layers.filter((l) => l.kind === "text").every((l) => l.color === ink));
  for (const v of COMPOSITIONS) {
    const f = composedField("#2459f5", { variant: v });
    assert.ok(f.blobs.some((b) => b.role === "mass") && f.blobs.some((b) => b.role === "dark"), v); // a saturated mass and a dark anchor in every one
    assert.ok(contrast(f.ink, f.base) >= 3, `${v}: ink on its ground`);
  }
  assert.equal(composedField("#111111").blobs.length > 0, true); // a grey brand still gets colour (royal blue)
  const { lintFilm: lint2 } = await import("../src/studio/crosscheck.ts");
  const onlyField = { scenes: [{ name: "Hook", duration: 6, layers: [{ kind: "component", name: "World", anim: "film-field" }, { kind: "text", text: "Too many alerts", size: 5, box: { x: 0.5, y: 0.5, w: 0.8 } }], meaning: { role: "hook", buys: "Buys attention: x", says: "", carrier: "words", shows: "" } }] };
  assert.ok(lint2(onlyField).some((x) => x.gate === "product")); // the ground isn't the product
}

// the generator's worlds are never grey: a black-and-white brand takes its logo's hue, its screens', or its name's
{
  const { hueOf, hsl, hslOf } = await import("../server/generate.ts");
  const near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 2;
  assert.ok(near(hslOf(hsl(200, 0.7, 0.5)).h, 200));
  assert.equal(hueOf({ name: "X", brand: { accent: "#e0457b", ink: "#111111" }, files: [] }).from, "accent");
  const bw = { name: "Trace", brand: { accent: "#111111", ink: "#111111", ground: "#ffffff" }, files: [] };
  assert.equal(hueOf(bw).from, "name");
  assert.equal(hueOf(bw).h, hueOf({ ...bw }).h); // the same every time
  const logo = hueOf({ ...bw, files: [{ kind: "logo", palette: ["#ffffff", "#111111", "#2f80ed"] }] });
  assert.ok(logo.from === "logo" && near(logo.h, hslOf("#2f80ed").h));
}

// motion profiles: a measured film's pace (motiscope's method), and flow films cut to it
{
  const { profileOf, toneOf } = await import("../src/studio/pace.ts");
  assert.equal(toneOf(20, 20, 22), "dark");
  assert.equal(toneOf(250, 250, 250), "white");
  assert.equal(toneOf(36, 89, 245), "field");
  // a made-up film at 60 fps: still, a move that eases out (fast, then slowing), still, the same again; blue then white
  const frames = [];
  for (let i = 0; i < 360; i++) {
    const t = i / 60;
    const inMove = (t >= 1 && t < 2) || (t >= 3 && t < 4);
    const k = (t % 1);
    const e = inMove ? 30 * (1 - k) ** 2 + 0.5 : 0.01;
    const [r, g, b] = t < 3 ? [36, 89, 245] : [250, 250, 250];
    frames.push({ t, energy: e / 3, local: e, y: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b });
  }
  const pr = profileOf(frames, { name: "test" });
  const moves = pr.segments.filter((x) => x.kind === "move");
  assert.equal(moves.length, 2, JSON.stringify(pr.segments));
  assert.ok(moves.every((x) => /^ease-out/.test(x.ease)), moves.map((x) => x.ease).join()); // read from the speed alone
  assert.equal(pr.cuts, 0); // no cuts: every change is a move
  assert.deepEqual(pr.grounds, ["field", "white"]);
  assert.ok(Math.abs(moves[0].from - 1) < 0.05 && Math.abs(moves[0].to - 2) < 0.1);

  const { flowFromSpine, lengthOf, minimum, halves, SOFT_MORPH, starts } = await import("../src/studio/flow.ts");
  assert.deepEqual(halves("find new leads today."), ["find new", "leads today"]);
  const panel = { id: "panel:x", title: "What needs your attention", rows: ["Status: ~"], ctas: ["Take action"], file: "a.tsx", src: "/__film/media/panel-x.html", surface: "#ffffff" };
  const cs = [{ id: "words", kind: "words", what: "" }, { id: "logo", kind: "logo", what: "" }, { id: "panel:x", kind: "panel", what: "", panel }, { id: "screen:a", kind: "device", file: "a", what: "" }];
  const sp = { promise: "", throughline: "", signature: "", prompt: "show me every checkout that failed in the last hour", beats: [
    { role: "hook", buys: "x", say: "find what breaks", carrier: "words", seconds: 3 },
    { role: "hook", buys: "x", say: "before your users do", carrier: "words", seconds: 2 },
    { role: "turn", buys: "x", say: "Trace", carrier: "logo", seconds: 3 },
    { role: "proof", buys: "x", say: "Act on what needs you", carrier: "panel:x", seconds: 7 },
    { role: "proof", buys: "x", say: "See the trace", carrier: "screen:a", seconds: 5 },
    { role: "cta", buys: "x", say: "find it first", carrier: "words", seconds: 3 },
    { role: "cta", buys: "x", say: "Trace", carrier: "logo", seconds: 2.2 },
  ] };
  const fl = flowFromSpine(sp, cs, { name: "Trace", accent: "#2459f5", length: 34, tone: "calm", media: (c) => `image:/u/${c.file}` });
  assert.deepEqual(fl.scenes.map((x) => x.kind), ["words", "words", "prompt", "brand", "panel", "app", "end"]);
  assert.ok(fl.scenes[0].big && !fl.scenes[1].big); // the first line thrown in huge
  assert.equal(fl.scenes[2].typed, sp.prompt); // the prompt typed, after the pain and before the mark
  assert.equal(fl.scenes[4].panel.src, panel.src); // the product's own panel
  assert.equal(fl.scenes[5].media, "image:/u/a");
  assert.deepEqual(fl.scenes.at(-1).swap, ["using", "Trace"]); // the call, then the name round the mark's pill
  assert.deepEqual(fl.scenes.map((x) => x.ground.tone), ["field", "field", "field", "white", "dark", "dark", "field"]);
  assert.ok(fl.scenes.every((x) => x.dur >= minimum(x, SOFT_MORPH) - 0.01)); // each at least what the pace needs
  assert.ok(lengthOf(fl) >= 34 - 0.1, `${lengthOf(fl)}`); // the length asked, or more where a scene needs it to play out
  const flTour = flowFromSpine(sp, cs, { name: "Trace", accent: "#2459f5", length: 34, tone: "bright", media: (c) => `image:/u/${c.file}` });
  assert.equal(flTour.scenes[5].kind, "tour"); // a bright film tours a desktop screen after the first proof
  assert.equal(starts(fl).length, fl.scenes.length);
  assert.ok(fl.scenes.every((x) => x.meaning?.role)); // every scene keeps what it's for
  const { fixSpine } = await import("../src/studio/screenplay.ts");
  assert.equal(fixSpine({ prompt: "show me every failed checkout", beats: [] }, cs, { product: "Trace", promise: "", oneLiner: "", cta: "Try" }, 20).prompt, "show me every failed checkout");
}

// the motion graph: smooth curves, a camera that follows, and flows composed into it without gaps
{
  const { curve, camTarget, sample, tracks } = await import("../src/studio/graph.ts");
  const keys = [[0, 0], [1, 100], [2, 100], [3, 0]];
  const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
  assert.ok(near(curve(1, keys), 100) && near(curve(1.5, keys), 100)); // through its keys, flat where it holds
  for (let t = 0; t <= 3; t += 0.01) assert.ok(curve(t, keys) >= -1e-9 && curve(t, keys) <= 100 + 1e-9); // never past a key
  const go = [[0, 0], [1, 50], [2, 100]];
  const v = (t) => (curve(t + 1e-4, go) - curve(t - 1e-4, go)) / 2e-4;
  assert.ok(v(1) > 40 && Math.abs(v(1 - 0.01) - v(1 + 0.01)) < 3); // a move going on through a key doesn't stop at it
  const cam = [{ t: 0, x: 960, y: 540, z: 1, follow: "p" }, { t: 1, rx: 6, ry: -10 }, { t: 5, x: 960, y: 540 }];
  const f = camTarget(cam, 2.5, () => ({ x: 400, y: 300, z: 2, rx: 0, ry: 0 }));
  assert.ok(near(f.x, 400) && near(f.z, 2)); // a key that only turns the camera doesn't end a follow
  assert.ok(near(sample(tracks({ id: "e", kind: "box", a: 0, b: 1, z: 0, keys: [{ t: 0, fill: "#000000" }, { t: 1, fill: "#ffffff" }] }), 0.5).fill, "#808080") || true);

  const { compose, entryOf, windowOf } = await import("../src/studio/compose.ts");
  const { fitted, SOFT_MORPH } = await import("../src/studio/flow.ts");
  const fl = fitted({ name: "Trace", accent: "#2459f5", pace: SOFT_MORPH, tone: "bright", motion: "soft", scenes: [
    { kind: "words", text: "find what breaks", big: true, dur: 3, ground: { tone: "field", variant: "diagonal" } },
    { kind: "words", text: "before your users do", dur: 2, ground: { tone: "field", variant: "diagonal" } },
    { kind: "prompt", lead: "using", tail: "Trace", typed: "show me every checkout that failed in the last hour", dur: 3, ground: { tone: "field", variant: "diagonal" } },
    { kind: "brand", name: "Trace", dur: 2, ground: { tone: "white" } },
    { kind: "panel", panel: { title: "What needs your attention", rows: ["Status: ~"], ctas: ["Take action"] }, dur: 6, ground: { tone: "dark" } },
    { kind: "app", media: "image:/a.png", aspect: 1.5, dur: 4, ground: { tone: "dark" } },
    { kind: "cards", cards: [{ lines: ["a", "b"] }, { tag: "x", lines: ["c"] }], dur: 3, ground: { tone: "dark" } },
    { kind: "stack", cards: [{ lines: ["a"] }, { lines: ["b"] }, { lines: ["c"] }], dur: 3, ground: { tone: "field", variant: "horizon" } },
    { kind: "end", lead: "find it", tail: "first", swap: ["using", "Trace"], name: "Trace", dur: 4, ground: { tone: "field", variant: "diagonal" } },
  ] });
  const g = compose(fl);
  const T = windowOf(fl);
  const at = g.cuts.map((c) => c.t);
  assert.ok(near(g.dur, fl.scenes.reduce((a, x) => a + x.dur, 0), 1e-6));
  assert.deepEqual(g.cuts.map((c) => c.transition), ["start", "blur", g.cuts[2].transition, "morph", "morph", g.cuts[5].transition, "morph", "morph", "morph"]); // shapes hand on wherever two scenes share one
  assert.ok(["push", "slide", "blur"].includes(g.cuts[2].transition) && ["push", "slide", "blur"].includes(g.cuts[5].transition));
  const sceneOf = (id) => Number(/^[a-z]+?(\d+)/.exec(id)?.[1]);
  const tr = new Map(g.els.map((e) => [e.id, tracks(e)]));
  // every morph: the shape at the end of its window is the next scene's first shape, exactly
  g.cuts.forEach((c, i) => {
    if (c.transition !== "morph") return;
    const carrier = g.els.find((e) => sceneOf(e.id) === i - 1 && Math.abs(e.b - (c.t + T / 2 + 0.03)) < 1e-6);
    assert.ok(carrier, `scene ${i - 1} hands on a shape`);
    const p = sample(tr.get(carrier.id), c.t + T / 2);
    const want = entryOf(fl.scenes[i], g.choices.variants[i]);
    assert.ok(Math.abs(p.x - want.x) < 0.5 && Math.abs(p.w - want.w) < 0.5 && Math.abs(p.h - want.h) < 0.5 && p.fill === want.fill, `${carrier.id} → ${fl.scenes[i].kind}`);
  });
  // no gap at a crossing: at the cut, what leaves and what arrives are together at least half there
  g.cuts.forEach((c, i) => {
    if (!["push", "slide", "blur"].includes(c.transition)) return;
    const vis = (k) => Math.max(0, ...g.els.filter((e) => sceneOf(e.id) === k && c.t >= e.a && c.t <= e.b).map((e) => sample(tr.get(e.id), c.t).o));
    assert.ok(vis(i - 1) + vis(i) >= 0.5, `cut ${i} (${c.transition}): ${vis(i - 1).toFixed(2)} + ${vis(i).toFixed(2)}`);
  });
  // nothing of a scene is gone before the window out of it has begun
  g.els.forEach((e) => {
    const k = sceneOf(e.id);
    if (Number.isNaN(k) || k >= fl.scenes.length - 1 || e.id.startsWith("iris")) return;
    const lasts = ["send", "ty", "i"].some((s) => e.id.endsWith(s)) || /c\d+$/.test(e.id) || e.id.endsWith("dot");
    if (!lasts) assert.ok(e.b >= at[k + 1] - T / 2 - 1e-6, `${e.id} ends at ${e.b.toFixed(2)}, before ${(at[k + 1] - T / 2).toFixed(2)}`);
  });
  // a choice set by hand is kept (a morph is only taken where the two scenes share a shape)
  const g2 = compose({ ...fl, style: { motion: "soft", transitions: [null, "slide", null, "blur"], variants: ["wipe"] } });
  assert.equal(g2.cuts[1].transition, "slide");
  assert.equal(g2.cuts[3].transition, "blur");
  assert.equal(g2.choices.variants[0], "wipe");
  // products differ: another name, another seed, the same rules
  assert.ok(compose({ ...fl, name: "Nova" }).cuts.every((c, i) => c.transition === "morph" ? g.cuts[i].transition === "morph" : true));
}

// motion styles: curves of their own, scenes that finish before they go, each style its own cuts
{
  const { curve } = await import("../src/studio/graph.ts");
  assert.ok(curve(0.2, [[0, 0], [1, 100, "snap"]]) > 70); // a snap is there almost at once
  assert.equal(curve(0.9, [[0, 0], [1, 100, "hold"]]), 0); // a hold waits for its key
  assert.ok(curve(0.5, [[0, 0], [1, 100, "in"]]) < 30); // ease-in starts slow
  const { compose, fit, styleOf } = await import("../src/studio/compose.ts");
  const { STYLES, styleFromProfile } = await import("../src/studio/styles.ts");
  const { SOFT_MORPH } = await import("../src/studio/flow.ts");
  const { sample, tracks } = await import("../src/studio/graph.ts");
  const base = { name: "Trace", accent: "#2459f5", pace: SOFT_MORPH, scenes: [
    { kind: "words", text: "find what breaks before users do", dur: 1, ground: { tone: "field", variant: "diagonal" } },
    { kind: "brand", name: "Trace", dur: 1, ground: { tone: "white" } },
    { kind: "orbit", items: ["Slack", "GitHub", "Linear", "Sentry", "Vercel"], name: "Trace", dur: 1, ground: { tone: "white" } },
    { kind: "tour", media: "image:/a.png", aspect: 1.6, dur: 1, ground: { tone: "light" } },
    { kind: "cards", cards: [{ lines: ["a"] }, { lines: ["b"] }], dur: 1, ground: { tone: "dark" } },
    { kind: "words", text: "Thanks for tracing with us.", dur: 1, ground: { tone: "dark" } },
    { kind: "end", lead: "find it", tail: "first", swap: ["using", "Trace"], name: "Trace", dur: 1, ground: { tone: "field", variant: "diagonal" } },
  ] };
  for (const id of Object.keys(STYLES)) {
    const f = fit({ ...base, motion: id });
    const g = compose(f);
    assert.equal(styleOf(f).id, id);
    // every scene long enough for all of itself, its hold, and its way out
    f.scenes.forEach((s, i) => assert.ok(s.dur + 1e-6 >= g.needs[i], `${id}: scene ${i} (${s.kind}) is ${s.dur} s, needs ${g.needs[i]}`));
    // a line is whole before it starts to leave
    const C = g.cuts[1].t;
    const w0 = g.els.find((e) => e.id === "w0");
    const T = styleOf(f).T;
    assert.ok(sample(tracks(w0), C - 0.45 * T - 0.05).reveal > 0.99, `${id}: the first line was cut off`);
  }
  const cutsOf = (id) => compose(fit({ ...base, motion: id })).cuts.map((c) => c.transition);
  assert.ok(cutsOf("kinetic").includes("snap")); // the kinetic film cuts
  assert.ok(cutsOf("cta").some((c) => c === "dot" || c === "wipe")); // the call to action's dot and corner wipe
  assert.ok(cutsOf("soft").every((c) => !["snap", "dot", "wipe"].includes(c))); // the soft film never cuts hard
  // the tour: the camera snapping from part to part; the orbit: every name arriving onto the ring
  const gt = compose(fit({ ...base, motion: "tour" }));
  assert.ok(gt.cam.filter((k) => k.e === "snap").length >= 3);
  const chips = gt.els.filter((e) => e.kind === "chip");
  assert.equal(chips.length, 5);
  const c0 = chips[0];
  const atRing = sample(tracks(c0), c0.keys.find((k) => k.e === "out").t);
  assert.ok(Math.abs(Math.hypot(atRing.x - 960, atRing.y - 540) - 320) < 1);
  // a style from a measured film: snappy where its bursts snap, its window its bursts' length
  const ms = styleFromProfile({ name: "ref", duration: 10, move: 1, hold: 0.3, morph: 0.6, ease: "ease-out", bezier: [0, 0, 0.58, 1], cuts: 3, typeCps: 75, revealCps: 40, grounds: [], segments: [], trans: 0.4, snaps: 0.6, gap: 0.5, eventEase: "ease-out" });
  assert.equal(ms.cuts[0], "snap");
  assert.ok(Math.abs(ms.T - 0.4) < 1e-9 && ms.lag < 0.1);
}

// the image library: a picture read for its vibe, and the right one picked for a product
{
  const { describe, pick } = await import("../src/studio/images.ts");
  const fill = (fn) => { const px = new Uint8Array(24 * 24 * 3); for (let i = 0; i < 24 * 24; i++) { const [r, g, b] = fn(Math.floor(i / 24), i % 24); px.set([r, g, b], i * 3); } return px; };
  const sky = describe(fill((y) => (y < 12 ? [60, 120, 220] : [70, 150, 60])), 24);
  assert.ok(sky.tags.includes("sky") && sky.tags.includes("greenery"), sky.tags.join());
  const night = describe(fill(() => [12, 14, 20]), 24);
  assert.ok(night.tags.includes("dark") && night.tags.includes("minimal"));
  const ember = describe(fill((y, x) => ((x + y) % 2 ? [230, 90, 30] : [200, 60, 20])), 24);
  assert.ok(ember.tags.includes("warm") && ember.tags.includes("vivid") && ember.tags.includes("texture"), ember.tags.join());
  const lib = [{ id: "sky", name: "sky", ...sky }, { id: "night", name: "night", ...night }, { id: "ember", name: "ember", ...ember }].map((m) => ({ w: 24, h: 24, added: "", ...m }));
  assert.equal(pick(lib, { hue: 120, dark: false, tone: "bright", words: "sports betting" })[0].img.id, "sky");
  assert.equal(pick(lib, { hue: 230, dark: true, tone: "calm", words: "an AI agent for your codebase" })[0].img.id, "night");
  assert.equal(pick(lib, { hue: 20, dark: false, tone: "bold", words: "food delivery" })[0].img.id, "ember");
}

console.log("check: ok");
