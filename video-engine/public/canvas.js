// Animation Engine — the canvas runtime. Draws a canvas made in the engine (its JSON) inside any page: shapes, type,
// pictures, drawn lines, device mockups and components that are live pages from the engine, each answering the
// visitor the way the canvas says (coming in as it's seen, lifting under the pointer, following it, moving with the
// scroll, linking somewhere). Under 744 px wide it takes the canvas's phone layout, if it has one.
//
// One small script, no dependencies, for any number of canvases on a page: each is read and drawn only as it comes
// near the screen, live pages load at most three at a time (the nearest first), everything rests while it's off
// screen, and canvases a page adds later (a single-page app's) are picked up by themselves.
//
//   <div data-engine-canvas="hero.json"></div>            a file's address, the JSON itself, or "#z=" + a packed one
//   <script type="module" src="https://<engine>/canvas.js"></script>
//
//   import { mount } from "https://<engine>/canvas.js"
//   const c = mount(element, doc, { origin: "https://<engine>" })   // c.update(doc), c.destroy()

const SCRIPT_ORIGIN = new URL(import.meta.url).origin
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)"
const PHONE_BELOW = 744
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

// the engine's device geometry (src/devices.tsx), in points: outer size, where the screen (the web page) sits in it,
// the display's corner radius, and the body's
const DEVICES = {
  iphone: { w: 440, h: 912, sx: 19, sy: 19, vw: 402, vh: 874, r: 62, body: 81, island: [126, 37, 11] },
  ipad: { w: 928, h: 1304, sx: 47, sy: 47, vw: 834, vh: 1210, r: 18, body: 65 },
  macbook: { w: 1640, h: 1063, sx: 64, sy: 57, vw: 1512, vh: 950, r: 10, body: 22, mac: true },
  duo: { w: 504, h: 716, sx: 19, sy: 19, vw: 466, vh: 678, r: 58, body: 77, hole: true },
  "duo-open": { w: 989, h: 707, sx: 19, sy: 19, vw: 951, vh: 669, r: 40, body: 59, hinge: true },
}

let styled = false
function style() {
  if (styled) return
  styled = true
  const s = document.createElement("style")
  s.textContent = `
.ec{position:relative;width:100%;overflow:hidden;container-type:inline-size;isolation:isolate;-webkit-font-smoothing:antialiased}
.ec-n{position:absolute;outline:none}
.ec-p,.ec-m,.ec-c{position:absolute;inset:0}
.ec-bd{position:absolute;pointer-events:none}
.ec-fx{position:absolute;inset:0;width:100%;height:100%;display:block}
.ec-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.ec-sheen{position:absolute;pointer-events:none;opacity:0;z-index:4;background:linear-gradient(105deg,transparent 36%,rgba(255,255,255,.16) 48%,transparent 60%);background-size:260% 100%;mix-blend-mode:screen}
.ec-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.15}
.ec-img{display:block;width:100%;height:100%;object-fit:cover;user-select:none;-webkit-user-drag:none}
.ec-path{display:block;width:100%;height:100%;overflow:visible}
.ec-live{position:absolute;overflow:hidden}
.ec-live iframe{position:absolute;left:0;top:0;border:0;display:block;background:transparent;opacity:0;transition:opacity .45s ${EASE}}
.ec-live iframe.on{opacity:1}
.ec[data-mode=edit] iframe{pointer-events:none}
.ec-link{cursor:pointer}
.ec-link:focus-visible{outline:2px solid #1f95ff;outline-offset:2px}
.ec-dev{position:absolute;left:0;top:0;transform-style:preserve-3d}
.ec-3d{position:absolute;inset:0}
.ec-status{position:absolute;left:0;right:0;top:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 32px 0 40px;box-sizing:border-box;font:600 17px/1 Geist,-apple-system,system-ui,sans-serif;pointer-events:none;z-index:2}`
  document.head.appendChild(s)
  if (![...document.querySelectorAll("link")].some((l) => /family=Geist/.test(l.href) && /Instrument\+Serif/.test(l.href))) {
    const l = document.createElement("link")
    l.rel = "stylesheet"
    l.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Geist+Mono:wght@400..600&family=Instrument+Serif:ital@0;1&display=swap"
    document.head.appendChild(l)
  }
}
// the faces a canvas's texts are set in (src/studio/faces.ts): one stylesheet, from Google Fonts only
const sheets = new Set()
function faceSheet(href) {
  if (typeof href !== "string" || !href.startsWith("https://fonts.googleapis.com/css2?") || sheets.has(href)) return
  sheets.add(href)
  const l = document.createElement("link")
  l.rel = "stylesheet"
  l.href = href
  document.head.appendChild(l)
}

/* ---------------- titles that come in piece by piece ---------------- */
// The Studio's title animations (src/studio/textanim.ts, Kit.tsx), played the same way here: what moves on its own
// (the whole title, each line, word or letter), where each piece starts, how long each takes, how far apart they
// start, in what order, on what curve, clipped to its line or not, and how it moves once in.

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const BEZ = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/
const curves = new Map()
/** A CSS cubic-bezier as a function of 0 → 1. */
function curveOf(s) {
  let f = curves.get(s)
  if (f) return f
  const m = BEZ.exec(s || "") || [0, 0.16, 1, 0.3, 1]
  const [x1, y1, x2, y2] = m.slice(1, 5).map(Number)
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
  const by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
  f = (u) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      if (bx(mid) < u) lo = mid
      else hi = mid
    }
    return by((lo + hi) / 2)
  }
  curves.set(s, f)
  return f
}
/** A title animation from anywhere, held to its ranges, or null. */
function titleAnim(r) {
  if (!r || typeof r !== "object" || !["all", "line", "word", "char"].includes(r.by)) return null
  const fr = r.from && typeof r.from === "object" ? r.from : {}
  const from = {}
  for (const [k, lo, hi] of [["x", -6, 6], ["y", -6, 6], ["scale", 0, 6], ["rotate", -180, 180], ["flip", -180, 180], ["skew", -60, 60], ["blur", 0, 1], ["opacity", 0, 1], ["spacing", -0.2, 2]]) if (typeof fr[k] === "number" && Number.isFinite(fr[k])) from[k] = clampN(fr[k], lo, hi, 0)
  return {
    by: r.by,
    from,
    dur: clampN(r.dur, 0.05, 6, 0.7),
    stagger: clampN(r.stagger, 0, 1.5, 0.06),
    ease: BEZ.test(r.ease || "") ? r.ease : "cubic-bezier(0.16, 1, 0.3, 1)",
    order: ["last", "middle", "random"].includes(r.order) ? r.order : "first",
    mask: r.mask === true,
    tint: typeof r.tint === "string" && /^#[0-9a-f]{3,8}$/i.test(r.tint) ? r.tint : "",
    idle: ["wave", "float", "shimmer"].includes(r.idle) ? r.idle : "",
  }
}
/** Splits a title into its pieces (words kept whole, so a line never breaks inside one), each in its own clip when
    masked, under a root that carries the tracking. */
function textPieces(el, text, a) {
  const span = (cls, style) => Object.assign(document.createElement("span"), cls ? { className: cls } : {}, { style })
  const clip = (child, block) => {
    if (!a.mask) return child
    const c = document.createElement("span")
    c.style.cssText = `display:${block ? "block" : "inline-block"};overflow:hidden;vertical-align:top;padding:.08em .04em .16em;margin:-.08em -.04em -.16em`
    c.appendChild(child)
    return c
  }
  const piece = (s, block) => {
    const p = document.createElement("span")
    p.dataset.p = ""
    p.style.cssText = `display:${block ? "block" : "inline-block"};max-width:100%`
    p.textContent = s
    return p
  }
  const root = span("", "display:contents")
  root.dataset.root = ""
  const words = (each) =>
    text.split(/(\s+)/).forEach((w) => {
      if (!w) return
      if (/^\s+$/.test(w)) root.appendChild(w.includes("\n") ? document.createElement("br") : document.createTextNode(w))
      else root.appendChild(each(w))
    })
  if (a.by === "all") root.appendChild(clip(piece(text, false), false))
  else if (a.by === "line") text.split("\n").forEach((line) => root.appendChild(clip(piece(line || " ", true), true)))
  else if (a.by === "word") words((w) => clip(piece(w, false), false))
  else
    words((w) => {
      const word = span("", "display:inline-block;white-space:nowrap")
      for (const ch of w) word.appendChild(clip(piece(ch, false), false))
      return word
    })
  el.replaceChildren(root)
}
const ranked = new Map()
function rankOf(order, n) {
  const key = `${order}:${n}`
  let r = ranked.get(key)
  if (r) return r
  const idx = [...Array(n).keys()]
  if (order === "last") r = idx.map((i) => n - 1 - i)
  else if (order === "middle") r = idx.map((i) => Math.round(Math.abs(i - (n - 1) / 2)))
  else if (order === "random") {
    const h = (i) => {
      const s = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453
      return s - Math.floor(s)
    }
    r = []
    ;[...idx].sort((p, q) => h(p) - h(q)).forEach((i, k) => (r[i] = k))
  } else r = idx
  ranked.set(key, r)
  return r
}
const animLen = (a, n) => a.dur + a.stagger * Math.max(0, a.order === "middle" ? Math.ceil((n - 1) / 2) : n - 1)
/** Moves a title's pieces to `t` seconds into its entrance (before 0: waiting at their start). */
function playText(el, a, t) {
  const list = el.querySelectorAll("[data-p]")
  const n = list.length
  if (!n) return
  const ease = curveOf(a.ease)
  const f = a.from
  const rank = rankOf(a.order, n)
  list.forEach((p, i) => {
    const start = rank[i] * a.stagger
    const k = clamp01((t - start) / a.dur)
    const e = ease(k)
    const u = 1 - e
    let y = (f.y || 0) * u
    let op = (f.opacity ?? 1) + (1 - (f.opacity ?? 1)) * clamp01(e * 1.5)
    const after = t - start - a.dur
    if (after > 0 && a.idle) {
      const ramp = clamp01(after / 0.8)
      if (a.idle === "wave") y += Math.sin(t * 3 - i * 0.5) * 0.07 * ramp
      else if (a.idle === "float") y += Math.sin(t * 1.4) * 0.06 * ramp
      else {
        const head = ((t * 9) % (n + 14)) - 4
        op *= 1 - ramp * 0.45 * (1 - Math.exp(-((i - head) ** 2) / 4))
      }
    }
    const tr = []
    if (f.x || y) tr.push(`translate(${((f.x || 0) * u).toFixed(4)}em, ${y.toFixed(4)}em)`)
    if (f.flip) tr.push(`perspective(4em) rotateX(${(f.flip * u).toFixed(2)}deg)`)
    if (f.rotate) tr.push(`rotate(${(f.rotate * u).toFixed(2)}deg)`)
    if (f.skew) tr.push(`skewX(${(f.skew * u).toFixed(2)}deg)`)
    if (f.scale != null && f.scale !== 1) tr.push(`scale(${(f.scale + (1 - f.scale) * e).toFixed(4)})`)
    p.style.transform = tr.join(" ")
    p.style.transformOrigin = f.flip ? "50% 100%" : "50% 60%"
    p.style.opacity = String(clamp01(op))
    const blur = (f.blur || 0) * u
    p.style.filter = blur > 0.002 ? `blur(${blur.toFixed(3)}em)` : ""
    if (a.tint) p.style.color = k < 1 ? `color-mix(in oklab, ${a.tint} ${Math.round(u * 100)}%, currentColor)` : ""
  })
  const root = el.querySelector("[data-root]")
  if (root) root.style.letterSpacing = f.spacing ? `calc(var(--ls, 0em) + ${(f.spacing * (1 - ease(clamp01(t / animLen(a, n))))).toFixed(4)}em)` : ""
}

/* ---------------- what's safe to draw ---------------- */

const css = (v) => (typeof v === "string" && !/url\(|expression|[;{}<>]/i.test(v) ? v : "")
const ownPath = (p) => typeof p === "string" && /^\/(stage\.html|anim\/[\w-]+\/[\w.-]+\.html)$/.test(p)
const picture = (s) => typeof s === "string" && /^(data:image\/(png|jpe?g|webp|gif|svg\+xml);|https:\/\/)/.test(s)
const web = (s) => typeof s === "string" && /^https?:\/\//.test(s)

/* ---------------- live pages from the engine: one queue for the whole page ---------------- */

const lives = new Map() // frame id -> { iframe, live, scheme, bare, origin, status }
let loading = 0
const waiting = []
function enqueue(job) {
  waiting.push(job)
  pump()
}
function pump() {
  while (loading < 3 && waiting.length) {
    // the one nearest the middle of the screen first
    let at = 0
    let best = Infinity
    waiting.forEach((j, i) => {
      const r = j.iframe.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2)
      if (d < best) [at, best] = [i, d]
    })
    const job = waiting.splice(at, 1)[0]
    if (!job.iframe.isConnected) continue
    loading++
    let done = false
    const finish = () => {
      if (done) return
      done = true
      loading--
      job.iframe.classList.add("on")
      pump()
    }
    job.iframe.addEventListener("load", finish, { once: true })
    setTimeout(finish, 8000)
    job.iframe.src = job.src
  }
}
addEventListener("message", (e) => {
  const d = e.data
  if (!d || d.source !== "anim-engine-stage" || typeof d.frame !== "string") return
  const f = lives.get(d.frame)
  if (!f || e.origin !== f.origin || e.source !== f.iframe.contentWindow) return
  const say = (m) => f.iframe.contentWindow.postMessage({ source: "anim-engine-host", ...m }, f.origin)
  if (d.type === "ready") {
    say({ type: "params", values: f.live.values || {} })
    say({ type: "theme", scheme: f.scheme })
    if (f.bare) say({ type: "bare", on: true })
  }
  // a screen says what's under its status bar: the bar's ink follows
  if (d.type === "status" && f.status) f.status.style.color = d.top === "light" ? "#fff" : d.top === "dark" ? "#000" : f.status.style.color
  // what the page is made of, when the editor asked (its colours: the theme matcher's anchor)
  if (d.type === "describe" && f.asked) {
    f.asked(Array.isArray(d.colors) ? d.colors.filter((c) => typeof c === "string").slice(0, 8) : [])
    f.asked = null
  }
  // a component's own size, measured in its page: the editor fits its box to it
  if (d.type === "size" && f.onSize && Number(d.w) > 0 && Number(d.h) > 0) f.onSize({ w: Number(d.w), h: Number(d.h), ...(typeof d.x === "number" ? { x: d.x, y: Number(d.y) || 0, vw: Number(d.vw) || 0, vh: Number(d.vh) || 0 } : {}) })
})

/** A live page from the engine, `w` × `h` CSS pixels, loading when its turn comes. */
function livePage(id, live, scheme, bare, origin, w, h, title) {
  const box = document.createElement("div")
  box.className = "ec-live"
  box.style.cssText = `left:0;top:0;width:${w}px;height:${h}px`
  const iframe = document.createElement("iframe")
  iframe.title = title
  iframe.allow = "autoplay"
  iframe.style.width = `${w}px`
  iframe.style.height = `${h}px`
  box.appendChild(iframe)
  const q = new URLSearchParams({ ...(live.query || {}), frame: id, rm: reduced() ? "1" : "0", cs: scheme, host: location.origin })
  const entry = { iframe, live, scheme, bare, origin, status: null, src: `${origin}${live.path}?${q}` }
  lives.set(id, entry)
  return { box, entry }
}

/* ---------------- animated raster effects: one GPU context for the whole page ---------------- */

// A moving field (flow, waves, rings, orbs, a picture) is drawn into a small texture, one texel per cell; then every
// pixel draws its cell's shape (a pixel, a halftone dot, a cross-stitch, a character, a scanline, a block) in the
// palette, with glow from the field's own blurred copies (its mipmaps) and grain. One WebGL2 context draws every effect
// on the page in turn and hands each its picture, so a page of many canvases never runs out of contexts. Effects off
// screen aren't drawn; under reduced motion each is drawn once, still.

const VS = `#version 300 es
void main(){vec2 p=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[gl_VertexID];gl_Position=vec4(p,0.,1.);}`

const NOISE = `
float h1(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),u.x),mix(h1(i+vec2(0.,1.)),h1(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n2(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}`

// The finish every effect shares. A CRT (`screen`, 0–1): the glass sits in a bezel and bulges (everything drawn on it
// moves with the curve), with a phosphor mask, scanlines, the tube's falloff to its edges and a little bloom; the bezel
// is dark plastic lit by the glass. (Cells are their own grid: over them the glass curves, without the mask.) Paper (`paper`, 0–1): fibres and blotches that stay still. Then film grain.
const FX_FINISH = `
uniform float CR,PA,GR,MK;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
// where a pixel of the frame looks onto the picture through the curved glass; sd: how far outside the glass it is
vec2 tube(vec2 px,out float sd,out vec2 cc){
  cc=px/R*2.-1.;sd=-1e3;
  if(CR<=0.)return px;
  float m=CR*.07*min(R.x,R.y);
  vec2 hs=R*.5-m;
  vec2 s=(px-R*.5)/hs;
  s*=1.+CR*.075*(s.yx*s.yx);
  cc=s;
  float r=CR*.1*min(R.x,R.y);
  vec2 d=abs(s)*hs-(hs-r);
  sd=length(max(d,0.))+min(max(d.x,d.y),0.)-r;
  return R*.5+s*R*.5;
}
vec4 finish(vec3 c,float a,vec2 px,vec2 cc,float sd){
  if(PA>0.){float f=.7*fbm(px*.03)+.3*h1(floor(px*.8));c*=1.-PA*.2*(f-.45);c=mix(c,c*vec3(1.,.97,.92),PA*.25);}
  if(CR>0.){
    float pitch=max(2.,min(R.x,R.y)/200.);
    float dm=1.-smoothstep(.2,.5,length(fract(px/pitch)-.5));
    float scan=.5+.5*cos(px.y/pitch*6.2832);
    c*=mix(1.,.7+.45*dm,CR*.75*MK)*mix(1.,.9+.1*scan,CR*MK);
    c*=1.-CR*.45*pow(clamp(dot(cc,cc)*.5,0.,1.),1.5);
    c+=c*c*.14*CR;
    vec3 bz=vec3(.014,.016,.02)+vec3(.045,.05,.06)*(1.-smoothstep(0.,min(R.x,R.y)*.06,sd))*(.55+.45*smoothstep(-1.,1.,-cc.y));
    bz+=c*.1*exp(-max(sd,0.)/(min(R.x,R.y)*.015));
    float on=1.-smoothstep(-1.,1.,sd);
    c=mix(bz,c,on);
    a=mix(1.,a,on);
  }
  c+=(hash(px+fract(T*13.)*91.)-.5)*GR*.12*a;
  return vec4(c,a);
}`

// the field, one texel per cell: rgb a picture's colour, alpha the value (0 nothing, 1 dense)
const FIELD_FS = `#version 300 es
precision highp float;
uniform vec2 G;uniform float A,T,SC,AN,SD,CT,LV;uniform int S,INV,HP;uniform sampler2D P;uniform vec2 PS;
out vec4 o;${NOISE}
float flow(vec2 q,float sd){vec2 w=vec2(fbm(q+vec2(sd,T*.12)),fbm(q+vec2(5.2+sd,1.3)-vec2(T*.09,0.)));return smoothstep(.28,.78,fbm(q+1.7*w+vec2(T*.05,-T*.04)));}
void main(){
  vec2 uv=gl_FragCoord.xy/G;
  vec2 p=(uv-.5)*vec2(A,1.);
  float c=cos(AN),s=sin(AN);
  p=mat2(c,s,-s,c)*p;
  vec2 q=p*SC*2.;
  float sd=SD*1.731;
  float v=0.;vec3 col=vec3(0.);
  if(S==0){v=flow(q,sd);}
  else if(S==1){float crest=.22*sin(p.x*2.4*SC+T*.8+sd)+.1*sin(p.x*5.1*SC-T*1.2+sd*2.)+.06*fbm(q*1.5+T*.15);v=clamp(.5-(p.y*2.-crest)*.9,0.,1.);}
  else if(S==2){vec2 cc=.12*vec2(sin(T*.27+sd),cos(T*.21));float r=length(p-cc)*SC;v=.5+.5*cos(r*14.-T*1.5);}
  else if(S==5){vec2 w=vec2(fbm(q*.6+vec2(T*.02,sd)),fbm(q*.6+vec2(3.1+sd,T*.015)));float d=fbm(q*1.1+1.5*w+vec2(T*.035,0.))+(.42-uv.y)*.45;float body=smoothstep(.3,.56,d);v=clamp(body*(.5+.65*smoothstep(.42,.78,d)),0.,1.);}
  else if(S==3){vec2 c1=vec2(.32*sin(T*.29+sd),.22*cos(T*.23+sd));vec2 c2=vec2(.42*cos(T*.17+2.+sd),.3*sin(T*.21+1.));float k=SC*SC;v=exp(-dot(p-c1,p-c1)*3.2*k)+.75*exp(-dot(p-c2,p-c2)*5.*k);v=clamp(v+.15*(fbm(q*1.2+T*.1)-.5),0.,1.);}
  // beam: soft bands of light sweeping slowly across (a screen's glare), along the direction
  else if(S==6){float x=p.x*SC;float b1=exp(-pow((x-.4*sin(T*.16+sd))*3.,2.));float b2=.3*exp(-pow((x+.6-.3*sin(T*.11+1.3+sd))*4.,2.));v=clamp(.2+.8*max(b1,b2)+.06*(fbm(q*1.3+vec2(T*.05,0.))-.5),0.,1.);}
  // cumulus: a tower of puffs rising left of centre and a low bank beside it, lit from above, shaded in its folds,
  // billowing at the edge, drifting
  else if(S==7){vec2 c=p*SC+vec2(.3,0.);float sw=0.,ss=0.;
    for(int i=0;i<20;i++){float fi=float(i),hx=fract(sin(fi*78.233+sd)*43758.5453),hy=fract(sin(fi*12.9898+sd)*43758.5453);
      vec2 ci=i<14?vec2(-.34+.68*hx*(1.-fi/17.),-.62+fi*.062):vec2(-1.45+.36*(fi-14.)+.12*hx,-.5-.07*hy);
      ci+=.025*vec2(sin(T*.2+fi),cos(T*.17+fi));
      float ri=i<14?.27-.012*fi+.06*hy:.17+.08*hy;
      vec2 l=(c-ci)/ri;float m=1.-dot(l,l),w=exp(8.*m);
      sw+=w;ss+=w*(dot(l,normalize(vec2(-.35,.94)))*.5+.5);}
    float field=log(sw)/8.,shade=ss/sw;
    float edge=field+.4*(fbm(c*7.+vec2(sd,-T*.04))-.5)+.15*(n2(c*20.)-.5);
    float body=smoothstep(0.,.1,edge);
    v=clamp(body*(.22+.55*shade+.4*(fbm(c*6.+vec2(0.,T*.03))-.5)+.25*smoothstep(0.,.5,edge)),0.,1.);}
  else if(HP==1){vec2 k=uv-.5;k/=(1.+.04*sin(T*.2))*SC;k+=vec2(.012*sin(T*.13),.009*cos(T*.11));k+=.008*vec2(n2(uv*6.+T*.3)-.5,n2(uv*6.-T*.3+4.)-.5);float pa=PS.x/PS.y;vec2 f=A>pa?vec2(1.,pa/A):vec2(A/pa,1.);col=texture(P,k*f+.5).rgb;v=dot(col,vec3(.2126,.7152,.0722));}
  else{v=flow(q,sd);}
  v=clamp((v-.5)*CT+.5+LV*.5,0.,1.);
  if(INV==1)v=1.-v;
  o=vec4(col,v);
}`

// the cells: each pixel draws its cell's shape, sized and coloured by the field there
const SHAPE_FS = `#version 300 es
precision highp float;
uniform vec2 R,G;uniform float C,GP,SB,DI,SO,GL,T,NC,UN;uniform int SH,NI,TI,FD;uniform vec4 GND;uniform vec3 INK[6];
uniform sampler2D F,AT;
out vec4 o;${NOISE}${FX_FINISH}
float bay(vec2 g){int x=int(mod(g.x,4.)),y=int(mod(g.y,4.));int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);return(float(m[x+y*4])+.5)/16.;}
vec3 ramp(float v){if(NI<2)return INK[0];float x=clamp(v,0.,1.)*float(NI-1);int i=min(int(x),NI-2);return mix(INK[i],INK[i+1],x-float(i));}
void main(){
  float sd;vec2 cc;
  vec2 px=tube(gl_FragCoord.xy,sd,cc);
  vec2 g=floor(px/C);
  vec2 l=fract(px/C)-.5;
  vec4 f=texelFetch(F,ivec2(min(g,G-1.)),0);
  // smooth: no cells, the field itself, read between its texels, a gradient that moves
  if(SH==6)f=texture(F,px/(G*C));
  float v=f.a;
  float b=bay(g);
  float on=mix(1.,step(b,v),DI);
  float sz=mix(1.,sqrt(v),SB);
  float hf=.5*(1.-GP)*sz;
  float aa=1.2/C+SO*.25;
  float cov=0.;
  if(SH==0||SH==5){cov=1.-smoothstep(hf-aa,hf+aa,max(abs(l.x),abs(l.y)));}
  else if(SH==1){cov=1.-smoothstep(hf-aa,hf+aa,length(l));}
  else if(SH==2){float arm=min(abs(l.x-l.y),abs(l.x+l.y))*.7071;float w=.13*(1.-GP)*sz+.02;cov=(1.-smoothstep(w-aa,w+aa,arm))*(1.-smoothstep(hf-aa,hf+aa,max(abs(l.x),abs(l.y))));}
  else if(SH==3){float idx=clamp(floor(v*(NC-1.)+.5+(b-.5)*DI),0.,NC-1.);vec2 q=l/max(sz,.05);if(max(abs(q.x),abs(q.y))<.5)cov=texture(AT,vec2((idx+q.x+.5)/NC,.5-q.y)).a;}
  else if(SH==4){float st=abs(fract((l.x+.5)*3.)-.5);float w=.45*sz;float gy=.5-GP*.25;cov=(1.-smoothstep(w-aa*3.,w+aa*3.,st))*(1.-smoothstep(gy-aa,gy+aa,max(abs(l.x),abs(l.y))));}
  else if(SH==6){cov=1.;on=1.;}
  cov*=on;
  vec2 u=px/R;
  float m=1.;
  if(FD==1)m=smoothstep(0.,.4,u.y);
  else if(FD==2)m=smoothstep(0.,.4,1.-u.y);
  else if(FD==3)m=smoothstep(0.,.18,min(min(u.x,1.-u.x),min(u.y,1.-u.y)));
  else if(FD==4)m=1.-smoothstep(.25,.75,length(u-.5)*1.41);
  cov*=m;
  // the picture itself under the cells, soft (read between the field's texels, a level down): the cells, in its own
  // colours, lifted a little so they read over it
  vec3 under=textureLod(F,px/(G*C),1.2).rgb;
  vec3 gnd=mix(GND.rgb*GND.a,under,UN);
  float ga=max(GND.a,UN);
  vec3 ink=TI==1?mix(f.rgb,vec3(1.),UN*.42):ramp(v);
  vec3 c=ink*cov+gnd*(1.-cov);
  float a=cov+ga*(1.-cov);
  float gv=textureLod(F,px/(G*C),2.5).a*m;
  float gw=GL*gv*gv*.55;
  c+=INK[max(NI-1,0)]*gw;
  a=max(a,min(1.,gw));
  o=finish(c,a,px,cc,sd);
}`

// Scenes: whole pictures drawn at every pixel in the palette, with no cells (a sky over the sea, a painted coast,
// 1970s swirls, overlapping circles, Bauhaus tiles, a tunnel of rounded light, blocks of stepped colour). The palette
// is the ground then up to six inks; what each one paints is in src/canvas/effects.md.
const SCENE_FS = `#version 300 es
precision highp float;
uniform vec2 R;uniform float T,SC,SD,CT,LV;uniform int SN,NI,FD;uniform vec4 GND;uniform vec3 INK[6];
out vec4 o;${NOISE}${FX_FINISH}
vec3 pal(int i){return i<=0?GND.rgb:INK[min(i-1,NI-1)];}
vec3 ramp(float v){if(NI<2)return INK[0];float x=clamp(v,0.,1.)*float(NI-1);int i=min(int(x),NI-2);return mix(INK[i],INK[i+1],x-float(i));}
// a shape's coverage, antialiased over one pixel (PXW: a pixel in the scene's own units, set by each scene)
float PXW=.001;
float cover(float d){return 1.-smoothstep(-PXW,PXW,d);}
float sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
float sdTri(vec2 p,vec2 a,vec2 b,vec2 c){vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;
  vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.),q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.),q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
  float s=sign(e0.x*e2.y-e0.y*e2.x);
  vec2 d=min(min(vec2(dot(q0,q0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(q1,q1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(q2,q2),s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
// a cell's random number, exact in integers: the float hash gives the same cell a slightly different number in each
// neighbour's pass on some GPUs, and a disc or a block drawn from two cells then disagrees with itself
float hc(vec2 c,float salt){uvec3 v=uvec3(ivec3(ivec2(floor(c))+32768,int(salt*97.)+4096));v=v*1664525u+1013904223u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;v^=v>>16u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;return float(v.x&0xffffffu)/16777215.;}
vec4 hc4(vec2 c,float salt){uvec3 v=uvec3(ivec3(ivec2(floor(c))+32768,int(salt*97.)+4096));v=v*1664525u+1013904223u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;v^=v>>16u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;return vec4(v.x&0xffffu,v.x>>16u,v.y&0xffffu,v.y>>16u)/65535.;}

// a sky over a still sea: a soft gradient into haze, long cirrus drifting, mist breathing on the horizon, ripples
// crowding toward it. ground: the sky's top; inks: the haze, the sea, the cirrus. level: the horizon's height
vec4 horizon(vec2 uv,vec2 p){
  float hz=.28+.2*LV;
  vec3 top=pal(0),haze=pal(1),sea=pal(2),wisp=pal(3);
  float y=uv.y;vec3 c;
  if(y>=hz){
    float k=clamp((y-hz)/(1.-hz),0.,1.);
    c=mix(haze,top,pow(smoothstep(0.,.8,k),.6));
    float wx=p.x*SC*.9-T*.02;
    float s=fbm(vec2((wx+.45*fbm(vec2(wx*1.5,y*5.)+SD))*1.8,(y+.05*fbm(vec2(wx*1.2+SD,0.)))*18.));
    c=mix(c,wisp,smoothstep(.58,.78,s)*smoothstep(.08,.3,k)*smoothstep(.88,.5,k)*.7*CT);
  }else{
    float d=hz-y;
    c=mix(haze,sea,smoothstep(0.,hz,d));
    float z=1./(d+.03);
    float r=fbm(vec2(p.x*z*.8+T*.03,z*2.-T*.3));
    c+=(r-.5)*.08*smoothstep(0.,.04,d);
  }
  float mist=exp(-pow((y-hz-.012)/(.055+.012*sin(T*.2)),2.));
  c=mix(c,mix(haze,vec3(1.),.22),mist*(.5+.2*fbm(vec2(p.x*2.-T*.03,y*4.))));
  return vec4(c,1.);
}

// a painted coast: a sky with clouds (and the sun, when it's up), hills and a town across the water, two sailboats
// rocking with their reflections, gulls, the sun's road on the waves, a rocky cliff in front with scrub, and a tree
// leaning out over it, swaying. ground: the sky; inks: the glow at the horizon, the sea, ink (rock, shadow, outlines),
// the sun, clouds, leaves. level: the sun's height; below -0.6 it's behind the clouds: no disc, white gulls, an olive
// tree and daisies (an oil painting), else an ink-and-wash pine. contrast: how cloudy
vec4 coast(vec2 uv){
  float A=R.x/R.y;PXW=1./R.y;
  vec2 u=uv+.003*(vec2(n2(uv*vec2(90.,60.)),n2(uv*vec2(60.,90.)+7.))-.5);
  vec2 q=vec2(u.x*A,u.y);
  float hz=.46;
  vec3 sky=pal(0),glow=pal(1),sea=pal(2),ink=pal(3),sun=pal(4),cloud=pal(5),leaf=pal(6);
  bool ink2=LV>-.6;
  vec2 sp=vec2(.72*A,hz+.16+.1*LV);
  float sdist=length(q-sp);
  vec3 c=mix(glow,sky,smoothstep(hz,1.,u.y));
  c=mix(c,glow,(ink2?.6:.3)*exp(-sdist*2.4));
  if(ink2)c=mix(c,sun,cover(sdist-.08)*.95);
  // clouds: lit on top, washed with shadow underneath, drifting
  float band=smoothstep(hz+.05,hz+.25,u.y);
  vec2 cq=vec2(q.x*(ink2?.8:1.1)-T*.012,u.y*(ink2?4.:3.))+vec2(SD*3.,0.);
  float cl=smoothstep(.52,.62,fbm(cq*1.5)+.3*band-.3+.22*(CT-1.)+.1*(u.y-.7))*band*mix(1.,smoothstep(1.05,.8,u.y),ink2?.6:.2);
  float lit=smoothstep(.4,.75,fbm(cq*3.1+vec2(0.,1.3))+.6*(u.y-.72));
  c=mix(c,mix(ink2?mix(cloud,ink,.45):mix(cloud,sky,.6),cloud,lit),cl*.92);
  // hills across the water, hazed by the distance, and the headland on the right with its town
  float far=hz+.012+.04*fbm(vec2(q.x*5.+SD,1.))*smoothstep(.1,.3,u.x)*smoothstep(.78,.6,u.x);
  c=mix(c,mix(ink,glow,.62),cover(u.y-far)*.85*step(hz,u.y));
  float right=hz+smoothstep(.58,.98,u.x)*(.12+.06*fbm(vec2(q.x*4.+SD,3.)))+.015*fbm(vec2(q.x*14.,5.))*smoothstep(.6,.7,u.x);
  c=mix(c,mix(mix(ink,sky,ink2?.5:.68),ink,(ink2?.55:.3)*fbm(q*vec2(8.,14.))),cover(u.y-right)*.9*step(hz,u.y));
  c=mix(c,mix(cloud,vec3(1.),.3),cover(u.y-hz-.005-.022*h1(vec2(floor(u.x*170.),1.)))*.8*step(.8,u.x)*step(hz,u.y));
  // the sea: lighter toward the horizon, broken strokes of trough and crest crowding toward it, the sun's road
  if(u.y<hz){
    float d=hz-u.y;
    c=mix(mix(sea,glow,.35),sea,smoothstep(0.,.16,d));
    c=mix(c,mix(sea,ink,.3),smoothstep(.15,.45,d));
    float z=1./(d+.03);
    float r=fbm(vec2(q.x*z*.45+T*.02,z*1.2-T*.2));
    c=mix(c,mix(sea,ink,.45),smoothstep(.5,.34,r)*.5);
    c=mix(c,mix(glow,vec3(1.),.4),smoothstep(.6,.78,r)*.55);
    float road=exp(-pow((q.x-sp.x)/(.03+.28*d),2.));
    float glint=smoothstep(.6,.9,n2(vec2(q.x*70./(1.+d*5.),z*5.-T*1.4)));
    c=mix(c,ink2?mix(sun,cloud,.35):vec3(1.),road*glint*(ink2?.9:.5));
  }
  // two sailboats, rocking, their reflections broken by the water
  for(int i=0;i<2;i++){
    float fi=float(i);
    vec2 b=vec2((.285+.125*fi)*A+.01*sin(T*.04+fi*2.),hz-.016-.014*fi+.003*sin(T*1.1+fi*1.7));
    float s=mix(.085,.16,fi);
    vec2 l=rot(.04*sin(T*.9+fi))*(q-b);
    float sail=min(sdTri(l,vec2(-s*.04,s*.1),vec2(-s*.04,s),vec2(s*.36,s*.12)),sdTri(l,vec2(-s*.1,s*.1),vec2(-s*.1,s*.82),vec2(-s*.42,s*.12)));
    float hull=max(abs(l.x)-s*.3+max(0.,-l.y)*1.5,abs(l.y+s*.02)-s*.05);
    float mast=sdSeg(l,vec2(-s*.07,0.),vec2(-s*.07,s*1.06))-s*.012;
    vec3 sc=mix(mix(sky,vec3(1.),.6),glow,.25);
    c=mix(c,mix(sc,ink,.25*smoothstep(-.3,.4,l.x/s)),cover(sail));
    c=mix(c,ink,cover(abs(sail)-s*.01)*.5);
    c=mix(c,ink,cover(min(hull,mast)));
    vec2 rl=vec2(l.x+.003*sin(l.y*500.+T*3.),-l.y-s*.1);
    float rs=min(sdTri(rl,vec2(-s*.04,s*.1),vec2(-s*.04,s),vec2(s*.36,s*.12)),sdTri(rl,vec2(-s*.1,s*.1),vec2(-s*.1,s*.82),vec2(-s*.42,s*.12)));
    c=mix(c,mix(sc,sea,.45),cover(rs)*.4*step(l.y,-s*.06));
  }
  // gulls, beating their wings, drifting across
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 b=vec2((fract(.3+fi*.11+T*.006)*1.3-.15)*A,.8-fi*.06+.02*sin(T*.3+fi));
    float s=.045-.008*fi,f=sin(T*4.5+fi*2.1);
    vec2 l=q-b;
    vec2 el=vec2(s*.5,s*(.15+.25*f)),tip=vec2(s,s*(.05+.45*f));
    float w=min(min(sdSeg(l,vec2(0.),vec2(-el.x,el.y)),sdSeg(l,vec2(-el.x,el.y),vec2(-tip.x,tip.y))),min(sdSeg(l,vec2(0.),el),sdSeg(l,el,tip)));
    if(!ink2)c=mix(c,mix(ink,sky,.4),cover(w-s*.13)*.8);
    c=mix(c,ink2?ink:vec3(1.),cover(w-s*.09));
    if(!ink2)c=mix(c,ink,cover(max(w-s*.09,s*.78-abs(l.x)))*.85);
  }
  // the cliff in front: lit rock and inked cracks falling from the left edge to the water, scrub along it, rocks
  // and a line of surf where it meets the sea
  float top=mix(.6,0.,smoothstep(.03,.58,u.x))+.07*(fbm(vec2(u.x*5.+SD,2.))-.5)+.03*(fbm(vec2(u.x*28.,4.))-.5);
  top=max(top,step(u.x,.8)*smoothstep(.42,.5,u.x)*.085*smoothstep(.48,.62,fbm(vec2(u.x*11.+SD,9.)))*(.6+.4*fbm(vec2(u.x*40.,3.))));
  float ridge=1.-abs(2.*fbm(q*vec2(4.,14.)+3.)-1.);
  vec3 rock=mix(mix(ink,glow,ink2?.45:.25),mix(glow,cloud,ink2?.3:.5),smoothstep(.22,.62,fbm(q*vec2(6.,9.)+SD)));
  rock=mix(rock,ink,smoothstep(.82,.95,ridge)*(ink2?.8:.5));
  rock=mix(rock,ink,smoothstep(.6,.8,fbm(q*vec2(26.,7.)))*(ink2?.45:.25));
  float scrub=smoothstep(.55,.62,fbm(q*12.+5.)+.25*smoothstep(.12,0.,top-u.y));
  rock=mix(rock,mix(mix(leaf,ink,.45),mix(leaf,cloud,.25),smoothstep(.5,.8,fbm(q*40.))),scrub);
  if(!ink2){
    vec2 g=q*11.,id=floor(g),ctr=id+.5+.4*(vec2(h1(id+3.),h1(id+5.))-.5),f=g-ctr;
    float sz=mix(.6,1.,h1(id+9.)),here=step(.4,h1(id))*step(ctr.x/11./A,.2)*step(ctr.y/11.,.34),r=length(f)/sz,pet=.32+.08*cos(atan(f.y,f.x)*7.+h1(id)*6.);
    rock=mix(rock,mix(cloud,vec3(1.),.5),cover((r-pet)*sz/11.)*here);
    rock=mix(rock,sun,cover((r-.1)*sz/11.)*here);
  }
  c=mix(c,rock,cover(u.y-top));
  c=mix(c,ink,cover(abs(u.y-top)-.002)*.45*step(u.x,.6));
  c=mix(c,mix(cloud,vec3(1.),.5),smoothstep(.01,0.,abs(u.y-top-.007))*step(.42,u.x)*step(u.x,.8)*.5*n2(vec2(q.x*40.,T)));
  // the tree, swaying: a trunk and branches, a crown of layered pine clumps (ink) or a round olive crown (oil)
  vec2 tq=q+vec2((.006*sin(T*.7)+.003*sin(T*1.9))*max(0.,u.y-.45)*3.,0.);
  float tr=sdSeg(tq,vec2(.1*A,.42),vec2(.08*A,.6))-.022;
  tr=min(tr,sdSeg(tq,vec2(.08*A,.6),vec2(.05*A,.8))-.016);
  tr=min(tr,sdSeg(tq,vec2(.075*A,.66),vec2(.2*A,.82))-.007);
  tr=min(tr,sdSeg(tq,vec2(.06*A,.74),vec2(.16*A,.92))-.006);
  tr=min(tr,sdSeg(tq,vec2(.055*A,.78),vec2(0.,.9))-.006);
  float crown=-1.;
  for(int i=0;i<5;i++){
    vec4 k=ink2?(i==0?vec4(.05,.93,.13,.065):i==1?vec4(.16,.88,.12,.055):i==2?vec4(.26,.82,.09,.045):i==3?vec4(.1,.79,.1,.05):vec4(0.,.84,.08,.08))
               :(i==0?vec4(.08,.94,.19,.11):i==1?vec4(.22,.9,.15,.09):i==2?vec4(.33,.84,.11,.07):i==3?vec4(.13,.79,.12,.08):vec4(.02,.83,.09,.11));
    crown=max(crown,1.-length((tq-vec2(k.x*A,k.y))/k.zw));
  }
  float lv=step(-.2,crown)*smoothstep(.5,.56,fbm(tq*vec2(24.,30.)+SD*2.)+crown*.6);
  vec3 lc=ink2?mix(ink,mix(leaf,cloud,.3),smoothstep(.55,.85,fbm(tq*60.))):mix(mix(leaf,ink,.35),mix(leaf,cloud,.45),smoothstep(.45,.8,fbm(tq*45.)+tq.y-.85));
  c=mix(c,ink,cover(tr)*.9);
  c=mix(c,lc,lv);
  c*=.95+.1*fbm(q*vec2(14.,40.));
  return vec4(c,1.);
}

// 1970s swirls: contour bands of slow, interfering waves: ribbons of three stripes, a gap of the ground between,
// the colours turning from ribbon to ribbon. contrast: how many bands
vec4 swirl(vec2 p){
  vec2 q=p*SC*2.8+vec2(SD*1.7,SD);
  float t=T*.6;
  vec2 w=q+.6*vec2(sin(q.y*1.3+t),cos(q.x*1.1-t*.8));
  float f=sin(w.x*1.4+sin(w.y*1.9+t)*1.1)+sin(w.y*1.2+sin(w.x*1.6-t*.9)*1.3)+.6*sin((w.x-w.y)*.8+t*.6);
  float k=f*4.5*CT,b=floor(k),fr=fract(k),aa=min(fwidth(k)*1.5,.5);
  float n=float(NI);
  vec3 c1=mod(b,4.)<.5?pal(0):pal(1+int(mod(floor(b/4.)*3.+mod(b,4.)-1.,n)));
  float b2=b+1.;
  vec3 c2=mod(b2,4.)<.5?pal(0):pal(1+int(mod(floor(b2/4.)*3.+mod(b2,4.)-1.,n)));
  return vec4(mix(c1,c2,smoothstep(1.-aa,1.,fr)),1.);
}

// circles: clusters of overlapping discs, darker where they cross like ink over ink, floating; small dots between
vec4 circles(vec2 p){
  vec2 q=p*SC*2.2;PXW=SC*2.2/R.y;
  vec3 c=vec3(0.);float cov=0.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 cell=floor(q)+vec2(i,j);
    // one hash for the cluster (is it there, where, how many discs), one for each disc (its size, place, ink); the
    // coverage is measured in pixels, not by derivatives, so skipping empty cells and spare discs is safe
    vec4 hk=hc4(cell,SD);
    if(hk.x<.15)continue;
    vec2 ctr=cell+.5+.3*(hk.yz-.5)+.04*vec2(sin(T*.3+hk.x*6.),cos(T*.25+hk.x*5.));
    float k=1.+floor(hk.w*3.99);
    for(int d=0;d<4;d++){
      float fd=float(d);
      if(fd>=k)break;
      vec4 hd=hc4(cell,SD+1.+fd);
      float r=mix(.18,.5,hd.x)*(d==0?1.:.85)*(1.+.035*sin(T*.4+hd.w*6.));
      vec2 o=ctr+(d==0?vec2(0.):.3*(hd.yz-.5))+.025*vec2(sin(T*.2+hd.w*9.),cos(T*.17+hd.w*7.));
      float a=cover(length(q-o)-r);
      vec3 col=pal(1+int(hd.w*float(NI)*.999));
      c=cov>0.?mix(c,mix(c*col*1.45,col,.45),a*.75):(a>0.?col:c);
      cov=max(cov,a);
    }
  }
  vec2 g=q*3.,id=floor(g);
  vec4 hs=hc4(id,SD+9.);
  float a=cover((length(g-id-.5-.25*(hs.xy-.5))-mix(.12,.22,hs.z))/3.)*step(.86,hs.w);
  vec3 col=pal(1+int(fract(hs.z*7.)*float(NI)*.999));
  c=cov>0.?mix(c,c*col*1.45,a*.75):(a>0.?col:c);
  cov=max(cov,a);
  return vec4(c,cov);
}

// Bauhaus tiles: a grid of squares, each a motif (half and quarter discs, triangles, circles, rings and fields of
// dots, stripes, two-tone halves) in the inks, the last ink drawing the grid. Now and then a tile turns a quarter.
vec4 tiles(vec2 px){
  float ts=R.y/max(1.,4./SC);PXW=1./ts;
  vec2 g=px/ts,cell=floor(g),l=fract(g);
  float h=h1(cell+SD*1.7),h2=h1(cell+3.1+SD),h3=h1(cell+7.7+SD);
  float per=7.,tt=T*.7+h*per;
  float ang=(floor(tt/per)+smoothstep(0.,.12,fract(tt/per))+floor(h2*4.))*1.5708;
  vec2 r=rot(ang)*(l-.5);
  int m=int(h3*11.);
  int ni=max(NI-1,1);
  vec3 col=pal(1+int(fract(h*13.)*float(NI)*.999)),col2=pal(1+int(fract(h*29.)*float(ni)*.999));
  float dots=cover((length(fract(l*9.)-.5)-.17)/9.),stripes=cover((abs(fract(r.y*7.)-.5)-.2)/7.);
  vec3 c=pal(0);
  if(m==0)c=mix(c,col,cover(length(r-vec2(-.5,0.))-.5));
  else if(m==1)c=mix(c,col,cover(length(r+.5)-1.));
  else if(m==2)c=mix(c,col,cover((r.x+r.y)*.7071));
  else if(m==3)c=mix(c,col,cover(length(r)-.33));
  else if(m==4){float ring=abs(length(r)-.34)-.13;c=mix(c,col,cover(ring)*dots);c=mix(c,col,cover(abs(ring)-.008));}
  else if(m==5)c=mix(c,col,stripes*cover(r.x));
  else if(m==6)c=mix(c,col,cover((r.x+r.y)*.7071)*dots);
  else if(m==7){c=mix(c,col,cover(r.x));c=mix(c,col2,cover(-r.x)*cover(r.y));}
  else if(m==8){c=mix(c,col,stripes*(1.-cover(length(r)-.28)));c=mix(c,col,cover(abs(length(r)-.28)-.01));}
  else if(m==9){c=mix(c,col,cover(length(r-vec2(0.,-.5))-.5)*dots);c=mix(c,col,cover(abs(length(r-vec2(0.,-.5))-.5)-.008)*step(-.5,r.y));}
  float e=min(min(l.x,1.-l.x),min(l.y,1.-l.y))*ts;
  c=mix(c,pal(NI),1.-smoothstep(.5,1.3,e-max(.4,ts*.004)));
  return vec4(c,1.);
}

// a tunnel of rounded light: nested rounded rectangles (twice as wide as tall) rising from the foot, flowing outward,
// each band its colour on the ramp from the first ink (the heart) to the last (the outside, then the ground),
// shaded where it steps down to the next
vec4 tunnel(vec2 uv){
  float A=R.x/R.y;
  vec2 q=vec2((uv.x-.5)*A,uv.y)/SC;
  vec2 a=abs(q)/vec2(1.9,1.);
  float s=pow(pow(a.x,5.)+pow(a.y,5.),.2);
  float N=7.*CT,k=s*N-T*.3,b=floor(k),fr=fract(k);
  float v=(b+.5+T*.3)/N;
  vec3 col=v>1.?pal(0):ramp(v);
  float aa=min(fwidth(k)*1.5,.4);
  vec3 c=col*(.72+.36*smoothstep(0.,.55,fr));
  c=mix(c,(v+1./N>1.?pal(0):ramp(v+1./N))*.72,smoothstep(1.-aa,1.,fr));
  return vec4(c,1.);
}

// blocks of stepped colour: squares, dominoes and L shapes fitted together with a dark seam, each one hue stepping
// from light at its edge to deep at its heart (or the other way), the steps flowing inward
vec2 blockOf(vec2 c){
  vec2 s=floor(c*.5)*2.,l=c-s;
  int k=int(hc(s,SD*3.1)*7.);
  if(k==0)return s;
  if(k==1)return s+vec2(0.,l.y);
  if(k==2)return s+vec2(l.x,0.);
  vec2 one=k==3?vec2(1.):k==4?vec2(0.,1.):k==5?vec2(1.,0.):vec2(0.);
  return l==one?s+l:s+.5;
}
vec4 blocks(vec2 px){
  float cs=R.y/max(1.,4./SC);PXW=1./cs;
  vec2 g=px/cs,c=floor(g),B=blockOf(c);
  // the distance to the block's edge, side by side (an edge split across cells is still one edge), rounded only where
  // edges meet at a corner
  float dl=1e3,dr=1e3,dd=1e3,du=1e3;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 m=c+vec2(i,j);
    if(blockOf(m)!=B)continue;
    if(blockOf(m+vec2(-1.,0.))!=B)dl=min(dl,sdSeg(g,m,m+vec2(0.,1.)));
    if(blockOf(m+vec2(1.,0.))!=B)dr=min(dr,sdSeg(g,m+vec2(1.,0.),m+1.));
    if(blockOf(m+vec2(0.,-1.))!=B)dd=min(dd,sdSeg(g,m,m+vec2(1.,0.)));
    if(blockOf(m+vec2(0.,1.))!=B)du=min(du,sdSeg(g,m+vec2(0.,1.),m+1.));
  }
  float d=smin(smin(dl,dr,.2),smin(dd,du,.2),.2);
  float h=hc(B*2.+1.,SD+1.37);
  vec3 hue=pal(1+int(h*float(NI)*.999));
  vec3 light=mix(hue,vec3(1.),.62),deep=hue*.3;
  float N=14.*CT,k=d*N+T*.3,b=floor(k),fr=fract(k);
  float x=clamp((b+.5-T*.3)/(N*.5),0.,1.);
  if(fract(h*7.31)<.5)x=1.-x;
  // pale, through the full hue, to deep
  vec3 col=x<.5?mix(light,hue,x*2.):mix(hue,deep,x*2.-1.);
  vec3 cl=col*(.74+.34*smoothstep(0.,.5,fr));
  return vec4(mix(pal(0),cl,cover(.035-d)),1.);
}

void main(){
  float sd;vec2 cc;
  vec2 px=tube(gl_FragCoord.xy,sd,cc);
  vec2 uv=px/R,p=(uv-.5)*vec2(R.x/R.y,1.);
  vec4 s=SN==1?horizon(uv,p):SN==2?coast(uv):SN==3?swirl(p):SN==4?circles(p):SN==5?tiles(px):SN==6?tunnel(uv):blocks(px);
  float m=1.;
  if(FD==1)m=smoothstep(0.,.4,uv.y);
  else if(FD==2)m=smoothstep(0.,.4,1.-uv.y);
  else if(FD==3)m=smoothstep(0.,.18,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
  else if(FD==4)m=1.-smoothstep(.25,.75,length(uv-.5)*1.41);
  float cov=s.a*m;
  o=finish(s.rgb*cov+GND.rgb*GND.a*(1.-cov),cov+GND.a*(1.-cov),px,cc,sd);
}`

const FX = { gl: null, el: null, field: null, shape: null, scene: null, vao: null, dead: false, raf: 0, all: new Set(), pics: new Map(), atlases: new Map(), stub: null }
const SRC = ["flow", "waves", "rings", "orb", "picture", "clouds", "beam", "cumulus", "horizon", "coast", "swirl", "circles", "tiles", "tunnel", "blocks"]
/** the sources drawn as whole pictures at every pixel (the scene program), in its order: SN 1, 2, … */
const SCENES = SRC.slice(8)
const CELL = ["pixel", "dot", "cross", "char", "line", "block", "smooth"]
const FADE = ["none", "bottom", "top", "edges", "radial"]
const clampN = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)

/** An effect's settings from anywhere, held to their ranges (the editor's check is in src/canvas/effects.ts). */
function fxParams(r = {}) {
  const colors = (Array.isArray(r.colors) ? r.colors : []).filter((c) => typeof c === "string" && css(c)).slice(0, 7)
  return {
    source: SRC.includes(r.source) ? r.source : "flow",
    picture: picture(r.picture) ? r.picture : "",
    cell: CELL.includes(r.cell) ? r.cell : "dot",
    chars: typeof r.chars === "string" && r.chars.length > 1 ? [...r.chars].slice(0, 16).join("") : " .:-=+*#",
    size: clampN(r.size, 3, 120, 12),
    gap: clampN(r.gap, 0, 0.9, 0.1),
    sizeBy: clampN(r.sizeBy, 0, 1, 1),
    dither: clampN(r.dither, 0, 1, 0),
    soft: clampN(r.soft, 0, 1, 0),
    contrast: clampN(r.contrast, 0.2, 3, 1.3),
    level: clampN(r.level, -1, 1, 0),
    invert: !!r.invert,
    scale: clampN(r.scale, 0.2, 5, 1.2),
    speed: clampN(r.speed, 0, 3, 0.3),
    angle: clampN(r.angle, -360, 360, 0),
    colors: colors.length >= 2 ? colors : ["#ffffff", "#2f8ff0"],
    tint: !!r.tint,
    under: clampN(r.under, 0, 1, 0),
    glow: clampN(r.glow, 0, 1, 0),
    grain: clampN(r.grain, 0, 1, 0),
    fade: FADE.includes(r.fade) ? r.fade : "none",
    seed: clampN(r.seed, 0, 1000, 0),
    screen: clampN(r.screen, 0, 1, 0),
    paper: clampN(r.paper, 0, 1, 0),
  }
}

// any CSS colour to [r, g, b, a] in 0–1, by letting the browser read it
const colours = new Map()
function rgba(c) {
  if (colours.has(c)) return colours.get(c)
  let out = [0, 0, 0, 0]
  if (c !== "transparent") {
    FX.stub ??= document.createElement("canvas").getContext("2d")
    const x = FX.stub
    x.fillStyle = "#000"
    x.fillStyle = c
    const v = String(x.fillStyle)
    const hex = /^#([0-9a-f]{6})$/i.exec(v)
    if (hex) {
      const n = parseInt(hex[1], 16)
      out = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
    } else {
      const m = /rgba?\(([^)]+)\)/.exec(v)
      if (m) {
        const [r, g, b, a = 1] = m[1].split(",").map(Number)
        out = [r / 255, g / 255, b / 255, a]
      }
    }
  }
  colours.set(c, out)
  return out
}

/** The shared WebGL2 context and its two programs. The shaders compile in the background where the browser can
    (KHR_parallel_shader_compile): asking for a program's status straight away made the page wait for the GPU driver,
    seconds on Direct3D. Returns the context, null when effects can't run, or undefined while still compiling. */
function fxGL() {
  if (FX.gl || FX.dead) return FX.gl
  if (!FX.boot) {
    const el = document.createElement("canvas")
    const gl = el.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) {
      FX.dead = true
      return null
    }
    const shader = (type, src) => {
      const sh = gl.createShader(type)
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const start = (fs) => {
      const p = gl.createProgram()
      const v = shader(gl.VERTEX_SHADER, VS)
      const f = shader(gl.FRAGMENT_SHADER, fs)
      gl.attachShader(p, v)
      gl.attachShader(p, f)
      gl.linkProgram(p)
      return { p, v, f }
    }
    FX.boot = { el, gl, ext: gl.getExtension("KHR_parallel_shader_compile"), field: start(FIELD_FS), shape: start(SHAPE_FS), scene: start(SCENE_FS) }
  }
  const { el, gl, ext, field, shape, scene } = FX.boot
  if (ext && !(gl.getProgramParameter(field.p, ext.COMPLETION_STATUS_KHR) && gl.getProgramParameter(shape.p, ext.COMPLETION_STATUS_KHR))) return undefined
  FX.boot = null
  const finish = ({ p, v, f }) => {
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getShaderInfoLog(f) || gl.getShaderInfoLog(v) || gl.getProgramInfoLog(p))
    const u = {}
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const a = gl.getActiveUniform(p, i)
      u[a.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, a.name)
    }
    return { p, u }
  }
  try {
    FX.field = finish(field)
    FX.shape = finish(shape)
  } catch (e) {
    console.warn("[canvas] effects are off:", e.message)
    FX.dead = true
    return null
  }
  // the scene program is the biggest: it finishes compiling on its own, and the cell effects don't wait for it
  FX.sceneBoot = { ext, scene, finish }
  FX.vao = gl.createVertexArray()
  // a 1 × 1 clear texture for samplers with nothing to read (the field's picture, the cells' characters), so neither
  // ever points at the texture being drawn into
  FX.blank = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, FX.blank)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  el.addEventListener("webglcontextlost", (e) => {
    e.preventDefault()
    FX.gl = null
    FX.dead = true
    FX.scene = null
    FX.sceneBoot = null
    for (const x of FX.all) Object.assign(x, { tex: null, fbo: null, tw: 0, th: 0, drawn: "" })
    FX.pics.clear()
    FX.atlases.clear()
  })
  el.addEventListener("webglcontextrestored", () => {
    FX.dead = false
    fxGL()
    fxKick()
  })
  FX.gl = gl
  FX.el = el
  // characters drawn before the page's fonts arrived are drawn again once they have
  document.fonts?.ready.then(() => {
    for (const t of FX.atlases.values()) gl.deleteTexture(t.tex)
    FX.atlases.clear()
    for (const x of FX.all) x.drawn = ""
    fxKick()
  })
  return gl
}

/** The scene program, once it has compiled; undefined while it still is, null if this GPU can't run it. */
function sceneGL(gl) {
  if (FX.scene !== null || !FX.sceneBoot) return FX.scene ?? null
  const { ext, scene, finish } = FX.sceneBoot
  if (ext && !gl.getProgramParameter(scene.p, ext.COMPLETION_STATUS_KHR)) return undefined
  FX.sceneBoot = null
  try {
    FX.scene = finish(scene)
  } catch (e) {
    console.warn("[canvas] scene effects are off:", e.message)
  }
  return FX.scene
}

/** The characters of a "char" effect as a strip of glyphs, white on clear. */
function atlas(gl, chars) {
  let a = FX.atlases.get(chars)
  if (a) return a
  const S = 64
  const list = [...chars]
  const c = Object.assign(document.createElement("canvas"), { width: S * list.length, height: S })
  const x = c.getContext("2d")
  x.fillStyle = "#fff"
  x.textAlign = "center"
  x.textBaseline = "middle"
  x.font = `600 ${S * 0.8}px "Geist Mono", ui-monospace, monospace`
  list.forEach((ch, i) => x.fillText(ch, i * S + S / 2, S / 2 + S * 0.04))
  // uploads go through a spare unit, so they never unbind what a draw is reading
  gl.activeTexture(gl.TEXTURE3)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  a = { tex, n: list.length }
  FX.atlases.set(chars, a)
  return a
}

/** A picture for a "picture" effect, loaded once per page; a picture another site won't share stays a flow. */
function pic(gl, src) {
  let p = FX.pics.get(src)
  if (p) return p
  p = { tex: null, w: 1, h: 1, ready: false }
  FX.pics.set(src, p)
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  img.onload = () => {
    try {
      gl.activeTexture(gl.TEXTURE3)
      p.tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, p.tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      Object.assign(p, { w: img.naturalWidth, h: img.naturalHeight, ready: true })
      for (const x of FX.all) x.drawn = ""
      fxKick()
    } catch {
      /* not ours to read */
    }
  }
  img.src = src
  return p
}

/** One effect on the page: its own canvas (the shared context hands it its picture), what it draws, at what size. */
function fxEntry(params, visible) {
  const el = Object.assign(document.createElement("canvas"), { className: "ec-fx" })
  el.setAttribute("aria-hidden", "true")
  const e = { el, ctx: el.getContext("2d"), p: params, w: 0, h: 0, scale: 1, visible, t0: performance.now(), drawn: "", sig: "", tex: null, fbo: null, tw: 0, th: 0 }
  FX.all.add(e)
  return e
}
function fxDrop(e) {
  FX.all.delete(e)
  if (FX.gl && e.tex) {
    FX.gl.deleteTexture(e.tex)
    FX.gl.deleteFramebuffer(e.fbo)
  }
}
const fxSig = (e) => `${JSON.stringify(e.p)}|${Math.round(e.w)}x${Math.round(e.h)}|${e.scale.toFixed(3)}`

/** The palette (the ground, then up to six inks) and the finish (the screen, paper, grain), into either program. */
function fxShared(gl, P, p) {
  const ground = rgba(p.colors[0])
  const inks = p.colors.slice(1).map(rgba)
  gl.uniform4f(P.u.GND, ground[0], ground[1], ground[2], ground[3])
  gl.uniform3fv(P.u.INK, new Float32Array([0, 1, 2, 3, 4, 5].flatMap((i) => (inks[i] || inks[inks.length - 1]).slice(0, 3))))
  gl.uniform1i(P.u.NI, inks.length)
  gl.uniform1i(P.u.FD, FADE.indexOf(p.fade))
  gl.uniform1f(P.u.CR, p.screen)
  gl.uniform1f(P.u.PA, p.paper)
  gl.uniform1f(P.u.GR, p.grain)
  gl.uniform1f(P.u.MK, SCENES.includes(p.source) || p.cell === "smooth" ? 1 : 0)
}

/** Draws an effect into its canvas; false while the program it needs is still compiling. */
function fxDraw(gl, e, t) {
  const p = e.p
  const scene = SCENES.includes(p.source)
  // a retina screen's own density: characters and dots stay crisp at their edges (a painted scene is soft enough at
  // the frame's own, and it's the heaviest to draw)
  const dpr = Math.min(devicePixelRatio || 1, p.source === "coast" || p.source === "horizon" ? 1 : 2)
  const W = Math.max(1, Math.round(e.w * dpr))
  const H = Math.max(1, Math.round(e.h * dpr))
  if (scene) {
    const P = sceneGL(gl)
    if (P === undefined) return false
    if (!P) {
      fxPlain(e)
      return true
    }
  }
  if (e.el.width !== W || e.el.height !== H) Object.assign(e.el, { width: W, height: H })
  if (FX.el.width < W || FX.el.height < H) Object.assign(FX.el, { width: Math.max(FX.el.width, W), height: Math.max(FX.el.height, H) })
  if (scene) {
    const P = FX.scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, W, H)
    gl.useProgram(P.p)
    gl.bindVertexArray(FX.vao)
    gl.uniform2f(P.u.R, W, H)
    gl.uniform1f(P.u.T, t)
    gl.uniform1f(P.u.SC, p.scale)
    gl.uniform1f(P.u.SD, p.seed)
    gl.uniform1f(P.u.CT, p.contrast)
    gl.uniform1f(P.u.LV, p.level)
    gl.uniform1i(P.u.SN, SCENES.indexOf(p.source) + 1)
    fxShared(gl, P, p)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    e.ctx.clearRect(0, 0, W, H)
    e.ctx.drawImage(FX.el, 0, FX.el.height - H, W, H, 0, 0, W, H)
    return true
  }
  const C = Math.max(2, p.size * e.scale * dpr)
  const cols = Math.ceil(W / C)
  const rows = Math.ceil(H / C)
  // the field, into the effect's own small texture
  if (!e.tex) {
    e.tex = gl.createTexture()
    e.fbo = gl.createFramebuffer()
  }
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, e.tex)
  if (e.tw !== cols || e.th !== rows) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, e.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0)
    e.tw = cols
    e.th = rows
  }
  const photo = p.source === "picture" && p.picture ? pic(gl, p.picture) : null
  const F = FX.field
  gl.bindFramebuffer(gl.FRAMEBUFFER, e.fbo)
  gl.viewport(0, 0, cols, rows)
  gl.useProgram(F.p)
  gl.bindVertexArray(FX.vao)
  gl.uniform2f(F.u.G, cols, rows)
  gl.uniform1f(F.u.A, W / H)
  gl.uniform1f(F.u.T, t)
  gl.uniform1i(F.u.S, SRC.indexOf(p.source))
  gl.uniform1f(F.u.SC, p.scale)
  gl.uniform1f(F.u.AN, (p.angle * Math.PI) / 180)
  gl.uniform1f(F.u.SD, p.seed)
  gl.uniform1f(F.u.CT, p.contrast)
  gl.uniform1f(F.u.LV, p.level)
  gl.uniform1i(F.u.INV, p.invert ? 1 : 0)
  gl.uniform1i(F.u.HP, photo?.ready ? 1 : 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, photo?.ready ? photo.tex : FX.blank)
  gl.uniform1i(F.u.P, 1)
  gl.uniform2f(F.u.PS, photo?.ready ? photo.w : 1, photo?.ready ? photo.h : 1)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, e.tex)
  gl.generateMipmap(gl.TEXTURE_2D)
  // the cells, into the bottom-left corner of the shared canvas
  const S = FX.shape
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, W, H)
  gl.useProgram(S.p)
  gl.uniform1i(S.u.F, 0)
  gl.uniform2f(S.u.R, W, H)
  gl.uniform2f(S.u.G, cols, rows)
  gl.uniform1f(S.u.C, C)
  gl.uniform1i(S.u.SH, CELL.indexOf(p.cell))
  gl.uniform1f(S.u.GP, p.gap)
  gl.uniform1f(S.u.SB, p.sizeBy)
  gl.uniform1f(S.u.DI, p.dither)
  gl.uniform1f(S.u.SO, p.soft)
  gl.uniform1f(S.u.GL, p.glow)
  gl.uniform1f(S.u.T, t)
  gl.uniform1i(S.u.TI, p.tint && photo?.ready ? 1 : 0)
  gl.uniform1f(S.u.UN, photo?.ready ? p.under : 0)
  fxShared(gl, S, p)
  const chars = p.cell === "char" ? atlas(gl, p.chars) : null
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, chars ? chars.tex : FX.blank)
  gl.uniform1i(S.u.AT, 2)
  gl.uniform1f(S.u.NC, chars ? chars.n : 1)
  gl.activeTexture(gl.TEXTURE0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  e.ctx.clearRect(0, 0, W, H)
  e.ctx.drawImage(FX.el, 0, FX.el.height - H, W, H, 0, 0, W, H)
  return true
}

/** Without WebGL2: the ground, with the first ink as a soft light. */
function fxPlain(e) {
  const W = Math.max(1, Math.round(e.w))
  const H = Math.max(1, Math.round(e.h))
  Object.assign(e.el, { width: W, height: H })
  const x = e.ctx
  x.fillStyle = e.p.colors[0]
  x.fillRect(0, 0, W, H)
  const g = x.createRadialGradient(W * 0.6, H * 0.45, 0, W * 0.6, H * 0.45, Math.max(W, H) * 0.6)
  g.addColorStop(0, e.p.colors[1])
  g.addColorStop(1, "rgba(0,0,0,0)")
  x.fillStyle = g
  x.fillRect(0, 0, W, H)
}

function fxFrame(now) {
  FX.raf = 0
  const gl = fxGL()
  // the shaders are still compiling in the background: look again next frame, draw nothing yet
  if (gl === undefined) {
    FX.raf = requestAnimationFrame(fxFrame)
    return
  }
  let again = false
  for (const e of FX.all) {
    if (!e.el.isConnected || !e.w || !e.h || !e.visible()) continue
    const still = reduced() || !(e.p.speed > 0)
    e.sig = fxSig(e)
    if (still && e.drawn === e.sig) continue
    // a preview (the gallery, the lab) moves at its own pace, under the screen's: a slow drift reads the same at 30
    if (!still && e.fps && now - (e.last || 0) < 1000 / e.fps - 2) {
      again = true
      continue
    }
    e.last = now
    // a scene whose program is still compiling shows its plain ground, and is drawn again next frame
    if (gl && fxDraw(gl, e, still ? 7.3 : ((now - e.t0) / 1000) * e.p.speed) === false) {
      fxPlain(e)
      again = true
      continue
    }
    if (!gl) fxPlain(e)
    e.drawn = e.sig
    if (!still) again = true
  }
  if (again) FX.raf = requestAnimationFrame(fxFrame)
}
const fxKick = () => {
  if (!FX.raf) FX.raf = requestAnimationFrame(fxFrame)
}

/** An effect on its own, outside a canvas (the editor's gallery, the template lab's previews): drawn in `el`, moving
    while it's on screen. `frame`: the width of the frame its sizes are for (cells keep their share of it). `fps`: how
    often a moving one redraws (30: a gallery of them shares the screen with everything else). Returns
    { update(effect), destroy() }. */
export function effect(el, settings, { frame = 1440, fps = 30 } = {}) {
  style()
  const vis = { on: false }
  const e = fxEntry(fxParams(settings), () => vis.on)
  e.fps = fps
  el.replaceChildren(e.el)
  const size = () => {
    e.w = el.clientWidth
    e.h = el.clientHeight
    e.scale = Math.max(0.5, e.w / frame)
    fxKick()
  }
  const io = new IntersectionObserver(([x]) => {
    vis.on = x.isIntersecting
    fxKick()
  })
  const ro = new ResizeObserver(size)
  io.observe(el)
  ro.observe(el)
  size()
  return {
    update(next) {
      e.p = fxParams(next)
      fxKick()
    },
    destroy() {
      io.disconnect()
      ro.disconnect()
      fxDrop(e)
      e.el.remove()
    },
  }
}

/* ---------------- device mockups ---------------- */

/** A picture's first rows, averaged: the colour Safari would paint the status bar's strip, and whether it's light. */
function topColour(img) {
  try {
    const c = Object.assign(document.createElement("canvas"), { width: 8, height: 1 })
    const x = c.getContext("2d")
    x.drawImage(img, 0, 0, img.naturalWidth, Math.max(1, img.naturalHeight * 0.01), 0, 0, 8, 1)
    const d = x.getImageData(0, 0, 8, 1).data
    let [r, g, b] = [0, 0, 0]
    for (let i = 0; i < 32; i += 4) [r, g, b] = [r + d[i] / 8, g + d[i + 1] / 8, b + d[i + 2] / 8]
    return { css: `rgb(${r | 0},${g | 0},${b | 0})`, light: 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 }
  } catch {
    return null // a picture from another site can't be read: the scheme's colours stay
  }
}

function mockup(id, n, origin) {
  const key = n.device === "duo" && n.open ? "duo-open" : n.device
  const g = DEVICES[key] || DEVICES.iphone
  const dark = n.scheme === "dark"
  const fin = finishOf(n)
  const t = DEPTH[key] || 40
  const dev = document.createElement("div")
  dev.className = "ec-dev"
  dev.style.width = `${g.w}px`
  dev.style.height = `${g.h}px`
  // every face the light falls on: which way it faces (in the device's own frame) and what it's made of
  const faces = []
  // everything seen from the front, on one face at z = 0: the band behind it gives the body its thickness
  const face = document.createElement("div")
  face.className = "ec-face"
  const body = document.createElement("div")
  if (g.mac) {
    // the lid (bezel and display) and the base under it
    body.style.cssText = `position:absolute;left:39px;top:0;width:${g.w - 78}px;height:${g.h - 22}px;border-radius:22px 22px 6px 6px;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.18)`
    const bezel = document.createElement("div")
    bezel.style.cssText = `position:absolute;left:12px;top:12px;right:12px;bottom:20px;border-radius:14px;background:#050506`
    body.appendChild(bezel)
    const base = document.createElement("div")
    base.style.cssText = `position:absolute;left:0;bottom:0;width:${g.w}px;height:24px;border-radius:0 0 22px 22px/0 0 18px 18px;box-shadow:inset 0 2px 0 rgba(255,255,255,.4)`
    const lip = document.createElement("div")
    lip.style.cssText = `position:absolute;left:50%;top:0;width:220px;height:9px;margin-left:-110px;border-radius:0 0 10px 10px;background:rgba(0,0,0,.18)`
    base.appendChild(lip)
    face.appendChild(base)
    faces.push({ el: base, n: [0, -0.35, 0.94], kind: "metal" })
  } else {
    // the band's rounded front edge round the glass; under a case, the case's raised lip in its colour
    body.style.cssText = `position:absolute;inset:0;border-radius:${g.body}px;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.22)${fin.matte ? ",inset 0 0 0 3px rgba(255,255,255,.08)" : ",inset 0 0 0 5px rgba(0,0,0,.1)"}`
    const glass = document.createElement("div")
    glass.style.cssText = `position:absolute;inset:${g.sx - (fin.matte ? 4 : 6)}px;border-radius:${g.r + (fin.matte ? 4 : 6)}px;background:#050506`
    body.appendChild(glass)
  }
  face.appendChild(body)
  faces.push({ el: body, n: [0, 0, 1], kind: "metal" })
  // the screen: a picture of it (a product's own screen, captured), or the live page at the device's own viewport, so
  // it lays itself out as it would on the device
  let entry = null
  let shot = null
  if (picture(n.picture)) {
    // Safari keeps a page below the status bar and paints the strip in the page's own colour: the picture's first rows
    const inset = g.mac ? 0 : key === "ipad" ? 24 : 54
    const strip = document.createElement("div")
    strip.style.cssText = `position:absolute;left:${g.sx}px;top:${g.sy}px;width:${g.vw}px;height:${g.vh}px;overflow:hidden;border-radius:${g.mac ? 0 : g.r}px;background:${dark ? "#000" : "#fff"}`
    const img = Object.assign(document.createElement("img"), { alt: n.name || "The screen", src: n.picture, decoding: "async", loading: "lazy", draggable: false })
    img.style.cssText = `position:absolute;left:0;top:${inset}px;width:100%;height:${g.vh - inset}px;object-fit:cover;object-position:top`
    strip.appendChild(img)
    face.appendChild(strip)
    shot = { strip, img }
  } else {
    const live = livePage(id, n.screen, n.scheme, false, origin, g.vw, g.vh, `${n.name || n.screen.anim} on a ${key}`)
    entry = live.entry
    const box = live.box
    box.style.left = `${g.sx}px`
    box.style.top = `${g.sy}px`
    box.style.borderRadius = g.mac ? "0" : `${g.r}px`
    box.style.background = dark ? "#000" : "#fff"
    face.appendChild(box)
  }
  if (g.mac) {
    const bar = document.createElement("div")
    bar.style.cssText = `position:absolute;left:${g.sx}px;top:${g.sy - 32}px;width:${g.vw}px;height:32px;background:${dark ? "#1c1c1f" : "#ececee"};border-radius:10px 10px 0 0`
    const notch = document.createElement("div")
    notch.style.cssText = `position:absolute;left:50%;top:0;width:200px;height:32px;margin-left:-100px;border-radius:0 0 12px 12px;background:#050506`
    bar.appendChild(notch)
    face.appendChild(bar)
  } else {
    const status = document.createElement("div")
    status.className = "ec-status"
    status.style.left = `${g.sx}px`
    status.style.top = `${g.sy}px`
    status.style.width = `${g.vw}px`
    status.style.color = dark ? "#fff" : "#000"
    if (shot)
      shot.img.addEventListener(
        "load",
        () => {
          const c = topColour(shot.img)
          if (!c) return
          shot.strip.style.background = c.css
          status.style.color = c.light ? "#000" : "#fff"
        },
        { once: true },
      )
    status.innerHTML = `<span>9:41</span><svg width="74" height="14" viewBox="0 0 74 14" fill="currentColor" aria-hidden="true"><rect x="0" y="8" width="3.5" height="5" rx="1"/><rect x="5.5" y="6" width="3.5" height="7" rx="1"/><rect x="11" y="3.5" width="3.5" height="9.5" rx="1"/><rect x="16.5" y="1" width="3.5" height="12" rx="1"/><path d="M33 3.2a9 9 0 0 1 11 0l-1.6 1.7a6.6 6.6 0 0 0-7.8 0zM35.6 6a5.2 5.2 0 0 1 5.8 0l-1.6 1.7a2.8 2.8 0 0 0-2.6 0zM38.5 9.2l1.6 1.7-1.6 1.7-1.6-1.7z"/><rect x="50" y="1.5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45"/><rect x="51.8" y="3.3" width="17.4" height="7.4" rx="2"/><rect x="72" y="5.2" width="1.8" height="3.6" rx=".8" opacity=".45"/></svg>`
    if (entry) entry.status = status
    face.appendChild(status)
    if (g.island) {
      const [iw, ih, it] = g.island
      const island = document.createElement("div")
      island.style.cssText = `position:absolute;left:${g.sx + (g.vw - iw) / 2}px;top:${g.sy + it}px;width:${iw}px;height:${ih}px;border-radius:${ih / 2}px;background:#000;z-index:3`
      face.appendChild(island)
    }
    if (g.hole) {
      const hole = document.createElement("div")
      hole.style.cssText = `position:absolute;left:${g.sx + g.vw / 2 - 9}px;top:${g.sy + 12}px;width:18px;height:18px;border-radius:9px;background:#000;z-index:3`
      face.appendChild(hole)
    }
    if (g.hinge) {
      const hinge = document.createElement("div")
      hinge.style.cssText = `position:absolute;left:${g.sx + g.vw / 2 - 1}px;top:${g.sy}px;width:2px;height:${g.vh}px;background:linear-gradient(90deg,rgba(0,0,0,.18),rgba(255,255,255,.12),rgba(0,0,0,.18));z-index:3;pointer-events:none`
      face.appendChild(hinge)
    }
  }
  // light sliding across the glass as the device turns
  const sheen = document.createElement("div")
  sheen.className = "ec-sheen"
  sheen.style.cssText = `left:${g.sx}px;top:${g.sy}px;width:${g.vw}px;height:${g.vh}px;border-radius:${g.mac ? 0 : g.r}px`
  face.appendChild(sheen)
  solid(dev, faces, g, t, key)
  dev.appendChild(face)
  dev.style.transformOrigin = `${g.w / 2}px ${g.h / 2}px ${-t / 2}px`
  const screen = entry ? face.querySelector(".ec-live") || null : shot?.strip || null
  return { dev, entry, g, sheen, t, faces, fin, screen, status: face.querySelector(".ec-status") }
}

/* ---------------- the real devices ---------------- */
// The Studio's own models (three.js, lit by its photography set), from canvas-3d.js beside this file: loaded once, the
// first time a page has a device. Until then, and where there's no WebGL, the drawn device above stands in.
let three3d = null
const load3d = () =>
  (three3d ??= import(/* @vite-ignore */ new URL("canvas-3d.js", import.meta.url).href).catch((e) => {
    console.warn("canvas: the real devices didn't load, the drawn ones stay", e)
    return null
  }))

// how thick each device is, in its own points (from the real ones: 8.25 mm on a 71.5 mm iPhone, 5.3 mm on an iPad,
// two 5.2 mm halves folded on the Duo, a 6 mm lid)
const DEPTH = { iphone: 51, ipad: 28, duo: 62, "duo-open": 31, macbook: 30 }
// when a layer names no finish: a light titanium, or a dark one, by its screen's scheme
const FINISH = { light: { metal: "#cfccc5", back: "#e4e1da" }, dark: { metal: "#55555b", back: "#2e2e33" } }
const HEX6 = /^#[0-9a-f]{6}$/i
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
/** A device's colours: its finish (the band, and the glass behind), or a case's one matte colour over both. */
function finishOf(n) {
  const f = n.finish && HEX6.test(n.finish.metal || "") && HEX6.test(n.finish.back || "") ? n.finish : FINISH[n.scheme === "dark" ? "dark" : "light"]
  const c = HEX6.test(n.case || "") ? n.case : ""
  return { metal: rgbOf(c || f.metal), back: rgbOf(c || f.back), matte: !!c }
}

// one light for every device on the page: a key from above left and in front, a dimmer fill from the right
const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2])
  return v.map((c) => c / l)
}
const KEY = norm3([-0.36, -0.8, 0.48])
const FILL = norm3([0.9, -0.15, 0.32])
const HALF = norm3([KEY[0], KEY[1], KEY[2] + 1])
/** A turn as a matrix: rolled (z, the layer's own rotation) after tilted (x) after turned (y), the order CSS applies. */
function turnMatrix(rx, ry, rz) {
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 180)
  const X = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]]
  const Y = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]]
  const Z = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]]
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]))
  return mul(Z, mul(X, Y))
}
/** How lit a face is once turned: how bright, and how much highlight (polished metal shines narrow, a case broad and
    dim), with a little light round the rims. */
function lightOf(m, n, matte) {
  const w = [0, 1, 2].map((i) => m[i][0] * n[0] + m[i][1] * n[1] + m[i][2] * n[2])
  const dot = (a) => a[0] * w[0] + a[1] * w[1] + a[2] * w[2]
  const d = Math.max(0, dot(KEY))
  const f = Math.max(0, dot(FILL))
  const s = Math.max(0, dot(HALF)) ** (matte ? 5 : 30)
  const rim = (1 - Math.abs(w[2])) ** 3
  return { k: 0.56 + 0.4 * d + 0.12 * f + 0.08 * rim, s: (matte ? 0.08 : 0.5) * s }
}
const shade = (rgb, l, dim = 1) => `rgb(${rgb.map((c) => Math.round(Math.min(255, (c * l.k + 255 * l.s) * dim))).join(",")})`

/** Lights a device's faces for its turn: the band and the buttons in its finish's metal, the back in its glass, the
    plateau polished. Only when the turn has changed. */
function lightDevice(d, rx, ry, rz) {
  const at = `${rx.toFixed(1)}|${ry.toFixed(1)}|${rz.toFixed(1)}`
  if (d.lit === at) return
  d.lit = at
  const m = turnMatrix(rx, ry, rz)
  const { metal, back, matte } = d.fin
  for (const f of d.faces) {
    const rgb = f.kind === "metal" ? metal : back
    const l = lightOf(m, f.n, matte || f.kind === "back")
    if (f.band) {
      const mid = shade(rgb, l)
      const rim = shade(rgb, l, matte ? 0.86 : 0.68)
      f.el.style.background = `linear-gradient(${rim},${mid} 30%,${mid} 70%,${rim})`
    } else if (f.kind === "back") f.el.style.background = `linear-gradient(160deg,${shade(rgb, l, 1.05)},${shade(rgb, l, 0.9)})`
    else f.el.style.background = shade(rgb, l)
  }
}

/** The rest of the solid behind the front: the band round the edge (the straight runs, and each rounded corner a fan
    of narrow faces, so it turns smooth), the back, and on a phone or a tablet the camera plateau standing off the
    glass with its lenses, and the buttons on the band. */
function solid(dev, faces, g, t, key) {
  const rad = Math.PI / 180
  const add = (css, kind, n, band) => {
    const el = document.createElement("div")
    el.style.cssText = `position:absolute;backface-visibility:hidden;-webkit-backface-visibility:hidden;${css}`
    dev.appendChild(el)
    if (kind) faces.push({ el, n, kind, band })
    return el
  }
  // a narrow face standing on the outline at (cx, cy), `len` along it and `depth` deep about z = zc, facing `th`°
  const strip = (cx, cy, len, depth, zc, th, kind) =>
    add(`left:${(cx - len / 2 - 0.3).toFixed(2)}px;top:${(cy - depth / 2).toFixed(2)}px;width:${(len + 0.6).toFixed(2)}px;height:${depth}px;transform:translateZ(${zc.toFixed(2)}px) rotateZ(${(th + 90).toFixed(2)}deg) rotateX(90deg)`, kind, [Math.cos(th * rad), Math.sin(th * rad), 0], true)
  const ring = (x, y, w, h, [tl, tr, br, bl], depth, zc, kind, K) => {
    const run = (cx, cy, len, th) => len > 0.5 && strip(cx, cy, len, depth, zc, th, kind)
    run(x + tl + (w - tl - tr) / 2, y, w - tl - tr, 270)
    run(x + w, y + tr + (h - tr - br) / 2, h - tr - br, 0)
    run(x + bl + (w - bl - br) / 2, y + h, w - bl - br, 90)
    run(x, y + tl + (h - tl - bl) / 2, h - tl - bl, 180)
    const corner = (cx, cy, R, from) => {
      if (R < 1) return
      const k = Math.max(2, Math.round(K * Math.sqrt(R / 60)))
      const step = 90 / k
      const chord = 2 * R * Math.sin((step * rad) / 2)
      const rm = R * Math.cos((step * rad) / 2)
      for (let i = 0; i < k; i++) {
        const th = from + (i + 0.5) * step
        strip(cx + rm * Math.cos(th * rad), cy + rm * Math.sin(th * rad), chord, depth, zc, th, kind)
      }
    }
    corner(x + tl, y + tl, tl, 180)
    corner(x + w - tr, y + tr, tr, 270)
    corner(x + w - br, y + h - br, br, 0)
    corner(x + bl, y + h - bl, bl, 90)
  }
  const box = g.mac ? { x: 39, y: 0, w: g.w - 78, h: g.h - 22, r: [22, 22, 6, 6] } : { x: 0, y: 0, w: g.w, h: g.h, r: [g.body, g.body, g.body, g.body] }
  ring(box.x, box.y, box.w, box.h, box.r, t, -t / 2, "metal", g.mac ? 4 : 10)
  // the back, turned about its own middle so it covers the same place, facing away
  add(`left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-radius:${box.r.map((r) => `${r}px`).join(" ")};transform:translateZ(${-t}px) rotateY(180deg)`, "back", [0, 0, -1])
  if (g.mac) return
  // what stands on the back, placed as it's seen from behind (`l` from the left there), `z` behind the front
  const behind = (l, tp, w, h, z, css, kind) => add(`left:${(g.w - l - w).toFixed(2)}px;top:${tp.toFixed(2)}px;width:${w.toFixed(2)}px;height:${h.toFixed(2)}px;transform:translateZ(${z.toFixed(2)}px) rotateY(180deg);${css}`, kind, [0, 0, -1])
  const B = key === "iphone" ? 9 : 5
  const plateau = (l, tp, w, h, r) => {
    ring(g.w - l - w, tp, w, h, [r, r, r, r], B, -t - B / 2, "plate", 4)
    behind(l, tp, w, h, -t - B, `border-radius:${r}px`, "plate")
  }
  const lens = (l, tp, d) => {
    behind(l - d * 0.1, tp - d * 0.1, d * 1.2, d * 1.2, -t - B - 0.6, "border-radius:50%", "metal")
    behind(l, tp, d, d, -t - B - 2.4, "border-radius:50%;background:#0b0c0f")
    behind(l + d * 0.13, tp + d * 0.13, d * 0.74, d * 0.74, -t - B - 3.2, "border-radius:50%;background:radial-gradient(circle at 34% 30%,#7d8fb5 0,#1b2232 22%,#05060a 62%)")
  }
  const dot = (l, tp, d, c) => behind(l, tp, d, d, -t - B - 0.8, `border-radius:50%;background:${c}`)
  if (g.island) {
    plateau(28, 28, 196, 196, 58)
    lens(44, 44, 70)
    lens(44, 128, 70)
    lens(124, 86, 70)
    dot(150, 40, 24, "radial-gradient(circle,#fff6d8,#c9b98a 60%,#6b6250)")
    dot(156, 166, 18, "#121316")
    // the buttons: action and volume on the left, the side button and Camera Control on the right
    const button = (side, y, len) => strip(side < 0 ? -2.2 : g.w + 2.2, y, len, t * 0.36, -t / 2, side < 0 ? 180 : 0, "metal")
    button(-1, 210, 62)
    button(-1, 306, 96)
    button(-1, 418, 96)
    button(1, 340, 150)
    button(1, 610, 84)
  } else if (g.hole || g.hinge) {
    plateau(26, 26, 76, 150, 38)
    lens(39, 40, 50)
    lens(39, 112, 50)
  } else {
    plateau(30, 30, 116, 116, 30)
    lens(46, 46, 52)
    dot(112, 112, 16, "#121316")
  }
}

/* ---------------- moving along a path, by physics ---------------- */

const PRESETS = ["spring", "bounce", "slide", "drop", "elastic", "glide", "float"]
const TRIGGERS = ["enter", "scroll", "loop", "hover", "click"]
const STEP = 1 / 240
const PATH_D = /^[MLCQZmlcqz0-9.,\s-]*$/

/** A damped spring pulling progress to its target: `w` its stiffness (rad/s), `z` its damping (1 is critical). */
function spring(m, w, z, h) {
  m.v += (-w * w * (m.s - m.T) - 2 * z * w * m.v) * h
  m.s += m.v * h
}
/** One frame of a preset: progress `s` (0 at the start of the path, 1 at its end) chasing its target `T`, integrated in
    small fixed steps so it moves the same at any frame rate. Spring and elastic overshoot and settle; glide arrives
    without overshoot; slide is friction, slowing the whole way; float drifts; bounce and drop fall under gravity and
    bounce off the end, losing energy each time, drop landing with a squash. */
function physics(m, dt) {
  const k = m.strength
  const sp = m.speed
  for (let t = dt; t > 1e-6; t -= STEP) {
    const h = Math.min(STEP, t)
    if (m.preset === "slide") {
      m.v = (m.T - m.s) * 3.2 * sp
      m.s += m.v * h
    } else if (m.preset === "bounce" || m.preset === "drop") {
      const side = m.from <= m.T ? 1 : -1
      m.v += side * (m.preset === "drop" ? 15 : 9) * sp * sp * h
      m.s += m.v * h
      if ((m.s - m.T) * side >= 0) {
        m.s = m.T
        if (Math.abs(m.v) > 0.06) {
          m.squash = Math.min(0.24, Math.abs(m.v) * (m.preset === "drop" ? 0.08 : 0.04))
          m.v = -m.v * (m.preset === "drop" ? 0.2 + 0.3 * k : 0.36 + 0.4 * k)
        } else m.v = 0
      }
    } else {
      const [w, z] = m.preset === "elastic" ? [7.2, 0.24 - 0.14 * k] : m.preset === "glide" ? [4.7, 1] : m.preset === "float" ? [2.8, 0.5] : [6, 0.72 - 0.5 * k]
      spring(m, w * sp, z, h)
    }
    // an impact's squash springs back (a little past, then settles)
    m.sqv += (-320 * m.squash - 20 * m.sqv) * h
    m.squash += m.sqv * h
  }
}
const settled = (m) => Math.abs(m.s - m.T) < 0.0015 && Math.abs(m.v) < 0.01 && Math.abs(m.squash) < 0.002

/** A path, measured once: 96 points along it. */
let measure = null
function sampled(d) {
  const NS = "http://www.w3.org/2000/svg"
  if (!measure?.isConnected) {
    measure = document.createElementNS(NS, "svg")
    measure.setAttribute("aria-hidden", "true")
    measure.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden"
    document.body.appendChild(measure)
  }
  const p = document.createElementNS(NS, "path")
  p.setAttribute("d", d)
  measure.appendChild(p)
  const L = p.getTotalLength() || 1
  const pts = []
  for (let i = 0; i <= 96; i++) {
    const q = p.getPointAtLength((L * i) / 96)
    pts.push([q.x, q.y])
  }
  p.remove()
  return { pts, L }
}
/** Where on the path progress `s` is, and which way it heads there; past either end it goes on along the heading. */
function along(sp, s) {
  const n = sp.pts.length - 1
  const f = Math.min(Math.max(s, 0), 1) * n
  const i = Math.min(Math.floor(f), n - 1)
  const [a, b] = [sp.pts[i], sp.pts[i + 1]]
  let x = a[0] + (b[0] - a[0]) * (f - i)
  let y = a[1] + (b[1] - a[1]) * (f - i)
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const over = s > 1 ? s - 1 : s < 0 ? s : 0
  if (over) {
    const [p, q] = s > 1 ? [sp.pts[n - 1], sp.pts[n]] : [sp.pts[0], sp.pts[1]]
    const hd = Math.atan2(q[1] - p[1], q[0] - p[0])
    x += Math.cos(hd) * over * sp.L
    y += Math.sin(hd) * over * sp.L
  }
  return { x, y, ang }
}

/* ---------------- a canvas ---------------- */

let canvases = 0

/** Draws `doc` in `el`. opts: origin (where the engine is; the canvas's own `origin`, else where this script came
    from), mode ("live": it answers the visitor; "edit": a picture the editor draws over), view ("desktop" | "phone":
    forced; otherwise by width). Returns { update(doc, opts), destroy() }. */
export function mount(el, doc, opts = {}) {
  style()
  const uid = `ec${++canvases}`
  const root = document.createElement("div")
  root.className = "ec"
  el.replaceChildren(root)
  let o = { ...opts }
  let d = doc
  const nodes = new Map() // id -> { n, outer, mid, content, kind, live: [entries], dev, comp }
  const state = { scale: 1, view: "desktop", visible: false, woke: false, entered: false, pointer: null, scroll: 0.5, raf: 0, last: 0, cur: new Map() }
  const live = () => (o.mode || "live") === "live"
  const origin = () => (o.origin || d.origin || SCRIPT_ORIGIN).replace(/\/+$/, "")
  const hasPhone = () => d.layers.some((n) => n.phone)
  const pickView = () => o.view || (root.clientWidth && root.clientWidth < PHONE_BELOW && hasPhone() ? "phone" : "desktop")
  const frame = () => (state.view === "phone" ? d.frame.phone : d.frame)
  const boxOf = (n) => {
    const p = state.view === "phone" ? n.phone || {} : {}
    return { x: p.x ?? n.x, y: p.y ?? n.y, w: p.w ?? n.w, h: p.h ?? n.h, rot: p.rot ?? n.rot ?? 0, hidden: !!(n.hidden || p.hidden), size: p.size }
  }
  const unit = (px) => `${(px / frame().w) * 100}cqw`

  /** The page's own things on the frame: its background, then every layer, back to front. */
  function draw() {
    state.view = pickView()
    const f = frame()
    root.dataset.mode = live() ? "live" : "edit"
    root.style.aspectRatio = `${f.w} / ${f.h}`
    root.style.background = css(d.frame.fill) || "#f4f4f6"
    root.style.borderRadius = unit(d.frame.radius || 0)
    root.setAttribute("role", "group")
    root.setAttribute("aria-label", d.name || "Canvas")
    const keep = new Set(d.layers.map((n) => n.id))
    const drop = (id, x) => {
      x.three?.destroy()
      x.outer.remove()
      for (const e of x.live) lives.delete(e.id)
      if (x.fx) fxDrop(x.fx)
      nodes.delete(id)
    }
    for (const [id, x] of nodes) if (!keep.has(id)) drop(id, x)
    d.layers.forEach((n, i) => {
      let x = nodes.get(n.id)
      if (x && signature(x.n) !== signature(n)) {
        drop(n.id, x)
        x = undefined
      }
      if (!x) {
        x = build(n)
        root.appendChild(x.outer)
        nodes.set(n.id, x)
      }
      x.n = n
      place(x, i)
    })
    fit()
    if (state.woke) wakeLive()
  }
  /** A device layer's real model, once it has loaded: the drawn one makes way, its screen (the live page or the
      picture, as it is: an iframe moved before it loads doesn't reload) and status bar go onto the glass. */
  function real(x) {
    void load3d().then((mod) => {
      if (!mod || nodes.get(x.n.id) !== x || x.three) return
      let d3 = null
      try {
        const host = document.createElement("div")
        host.className = "ec-3d"
        d3 = mod.mountDevice(host, { device: x.n.device, open: !!x.n.open, finish: x.n.finish, case: x.n.case, scheme: x.n.scheme })
        for (const el of [x.dev.screen, x.dev.status]) {
          if (!el) continue
          el.style.left = "0px"
          el.style.top = "0px"
          d3.slot.appendChild(el)
        }
        x.content.style.perspective = ""
        x.content.replaceChildren(host)
        x.three = d3
        fit()
      } catch (e) {
        console.warn("canvas: no real device here (WebGL?), the drawn one stays", e)
        d3?.destroy()
      }
    })
  }
  // what makes a layer rebuilt instead of moved: its kind and the live pages in it
  const signature = (n) => `${n.kind}|${n.kind === "device" ? `${n.device}${n.open ? "o" : ""}|${n.finish ? `${n.finish.metal}${n.finish.back}` : ""}${n.case || ""}|${n.picture ? `${n.picture.length}${n.picture.slice(-24)}` : JSON.stringify(n.screen)}|${n.scheme}` : n.kind === "component" ? `${JSON.stringify(n.live)}|${n.scheme}` : ""}`

  function build(n) {
    // outer: where it is; pw: where its path has taken it; mid: how it comes in and answers the pointer; content: what
    // it draws
    const outer = document.createElement("div")
    outer.className = "ec-n"
    outer.dataset.id = n.id
    const pw = document.createElement("div")
    pw.className = "ec-p"
    const mid = document.createElement("div")
    mid.className = "ec-m"
    const content = document.createElement("div")
    content.className = "ec-c"
    mid.appendChild(content)
    pw.appendChild(mid)
    outer.appendChild(pw)
    const x = { n, outer, pw, mid, content, live: [], dev: null, three: null, comp: null, fx: null, bd: null, mo: null, tilt: null, spun: null }
    if (n.kind === "device") {
      const m = mockup(`${uid}-${n.id}`, n, origin())
      content.appendChild(m.dev)
      x.dev = { el: m.dev, g: m.g, sheen: m.sheen, base: "", faces: m.faces, fin: m.fin, lit: "", screen: m.screen, status: m.status }
      real(x)
      // a picture of the screen has no live page to load
      if (m.entry) {
        m.entry.id = `${uid}-${n.id}`
        x.live.push(m.entry)
      }
    } else if (n.kind === "effect") {
      x.fx = fxEntry(fxParams(n.effect), () => state.visible)
      content.appendChild(x.fx.el)
    } else if (n.kind === "component") {
      const id = `${uid}-${n.id}`
      const { box, entry } = livePage(id, n.live, n.scheme, true, origin(), n.view?.w || n.w, n.view?.h || n.h, n.name || n.live.anim)
      entry.id = id
      entry.onSize = (m) => o.onSize?.(n.id, m)
      // a part of a page-filling component: only that part shows
      content.style.overflow = "hidden"
      box.style.transformOrigin = "0 0"
      content.appendChild(box)
      x.comp = box
      x.live.push(entry)
    }
    // links: a click (or Enter) opens them, live only; a click also sends a layer that moves on a click along its path
    outer.addEventListener("click", () => {
      if (!live()) return
      if (x.mo?.trigger === "click") aim(x, x.mo.T > 0.5 ? 0 : 1)
      if (web(x.n.link)) open(x.n.link, "_blank", "noopener")
    })
    outer.addEventListener("keydown", (e) => live() && e.key === "Enter" && web(x.n.link) && open(x.n.link, "_blank", "noopener"))
    // hover: lifts, grows, or tilts toward the pointer; a layer that moves under the pointer goes along its path
    outer.addEventListener("pointermove", (e) => hover(x, e))
    outer.addEventListener("pointerenter", () => live() && x.mo?.trigger === "hover" && aim(x, 1))
    outer.addEventListener("pointerleave", () => {
      hover(x, null)
      if (live() && x.mo?.trigger === "hover") aim(x, 0)
    })
    return x
  }

  /** Blur, a glow around it (text glows by its letters, anything else by its outline), and frosted glass behind it. */
  function look(x) {
    const n = x.n
    const glow = n.glow && n.glow.size > 0 ? n.glow : null
    const filters = []
    if (n.blur > 0) filters.push(`blur(${unit(Math.min(n.blur, 200))})`)
    if (glow && n.kind !== "text") filters.push(`drop-shadow(0 0 ${unit(glow.size)} ${css(glow.color) || "#ffffff"})`)
    // a device's shadow is drawn round what's seen of it, so it follows the outline as it turns
    if (n.kind === "device" && n.shadow !== false) {
      const h = boxOf(n).h
      filters.push(`drop-shadow(0 ${unit(h * 0.03)} ${unit(h * 0.045)} rgba(0,0,0,.24))`)
    }
    x.content.style.filter = filters.join(" ")
    const t = x.content.firstChild
    if (n.kind === "text" && t) t.style.textShadow = glow ? `0 0 ${unit(glow.size)} ${css(glow.color) || "#ffffff"}` : ""
    const b = n.backdrop
    if (b) {
      if (!x.bd) {
        x.bd = document.createElement("div")
        x.bd.className = "ec-bd"
        x.pw.insertBefore(x.bd, x.mid)
      }
      const tint = css(b.tint) || "#ffffff"
      const s = x.bd.style
      s.inset = `calc(${unit(b.pad || 0)} * -1)`
      s.borderRadius = unit(b.radius || 0)
      s.backdropFilter = s.webkitBackdropFilter = `blur(${unit(Math.min(b.blur || 0, 200))})`
      s.background = `color-mix(in srgb, ${tint} ${Math.round(Math.min(1, Math.max(0, b.opacity ?? 0.2)) * 100)}%, transparent)`
      s.boxShadow = "inset 0 0 0 1px rgba(255,255,255,.14)"
    } else if (x.bd) {
      x.bd.remove()
      x.bd = null
    }
  }

  /** A device's turn in 3D: its own (rot3d), plus what the visitor does to it (the pointer, the scroll, a loop). */
  function turn(x) {
    const r = x.n.rot3d || {}
    const rx = (Number(r.x) || 0) + (x.tilt?.rx || 0) + (x.spun?.x || 0)
    const ry = (Number(r.y) || 0) + (x.tilt?.ry || 0) + (x.spun?.y || 0)
    if (x.three) return x.three.turn(rx, ry, Math.min(8, Math.max(1.4, Number(r.p) || 3.2)))
    if (!x.dev?.base) return
    x.dev.el.style.transform = `${x.dev.base} rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
    x.dev.sheen.style.backgroundPosition = `${(50 + ry * 0.9).toFixed(1)}% 0`
    // the turn as −180…180, so the sheen grows with how far it's turned from straight on
    const wrapped = (((ry % 360) + 540) % 360) - 180
    x.dev.sheen.style.opacity = Math.min(1, (Math.abs(rx) + Math.abs(wrapped)) / 30).toFixed(2)
    lightDevice(x.dev, rx, ry, Number(boxOf(x.n).rot) || 0)
  }

  /** The layer's path, measured, with how it moves along it (its preset and what sends it). */
  function motionOf(x) {
    const mo = x.n.motion
    if (!mo || typeof mo.d !== "string" || !PATH_D.test(mo.d) || mo.d.length < 4) {
      if (x.mo) {
        x.pw.style.transform = ""
        x.pw.style.opacity = ""
      }
      x.mo = null
      return
    }
    if (!x.mo || x.mo.d !== mo.d) {
      const sp = sampled(mo.d)
      x.mo = { d: mo.d, sp, ang0: along(sp, 0).ang, s: 0, v: 0, T: 0, from: 0, squash: 0, sqv: 0, rest: 0, preview: false }
    }
    Object.assign(x.mo, {
      preset: PRESETS.includes(mo.preset) ? mo.preset : "spring",
      trigger: TRIGGERS.includes(mo.trigger) ? mo.trigger : "enter",
      strength: clampN(mo.strength, 0, 1, 0.5),
      speed: clampN(mo.speed, 0.2, 3, 1),
      delay: clampN(mo.delay, 0, 10, 0),
      fade: !!mo.fade,
      orient: !!mo.orient,
      reverse: !!mo.reverse,
    })
    if (!live() && !x.mo.preview) {
      x.pw.style.transform = ""
      x.pw.style.opacity = ""
    }
  }
  /** Puts a layer where its path has taken it (the path is in the desktop frame's pixels, so on a phone it scales with
      the frame), turned with the path if it says so, squashed by an impact, faded in if it fades. */
  function moveAlong(x) {
    const m = x.mo
    const p = along(m.sp, m.reverse ? 1 - m.s : m.s)
    const [x0, y0] = m.sp.pts[0]
    const W = d.frame.w
    let tr = `translate(${(((p.x - x0) / W) * 100).toFixed(3)}cqw, ${(((p.y - y0) / W) * 100).toFixed(3)}cqw)`
    if (m.orient) tr += ` rotate(${(((p.ang - m.ang0) * 180) / Math.PI).toFixed(2)}deg)`
    if (Math.abs(m.squash) > 0.002) {
      const deg = ((p.ang * 180) / Math.PI).toFixed(2)
      tr += ` rotate(${deg}deg) scale(${(1 - m.squash).toFixed(3)}, ${(1 + m.squash * 0.6).toFixed(3)}) rotate(${-deg}deg)`
    }
    x.pw.style.transform = tr
    x.pw.style.opacity = m.fade ? String(Math.min(1, Math.max(0, m.s) / 0.35).toFixed(3)) : ""
  }
  /** Sends a layer along its path (target 1) or back (0). Under reduced motion it's simply there, faded in. */
  function aim(x, T) {
    const m = x.mo
    if (!m || m.T === T) return
    m.from = m.s
    m.T = T
    m.rest = 0
    if (reduced()) {
      Object.assign(m, { s: T, v: 0, squash: 0, sqv: 0 })
      x.pw.style.transition = "opacity 300ms ease"
      moveAlong(x)
      return
    }
    kick()
  }

  /** Puts a layer where it is in the current view, and draws what it shows. */
  function place(x, i) {
    const n = x.n
    const f = frame()
    const b = boxOf(n)
    const s = x.outer.style
    s.left = `${(b.x / f.w) * 100}%`
    s.top = `${(b.y / f.h) * 100}%`
    s.width = `${(b.w / f.w) * 100}%`
    s.height = `${(b.h / f.h) * 100}%`
    s.rotate = b.rot ? `${b.rot}deg` : ""
    s.opacity = String(n.opacity ?? 1)
    s.display = b.hidden ? "none" : ""
    // seen through another layer's box and corners
    const win = n.clip ? d.layers.find((l) => l.id === n.clip) : null
    if (win) {
      const cb = boxOf(win)
      const pc = (v, len) => `${((v / len) * 100).toFixed(3)}%`
      s.clipPath = `inset(${pc(cb.y - b.y, b.h)} ${pc(b.x + b.w - cb.x - cb.w, b.w)} ${pc(b.y + b.h - cb.y - cb.h, b.h)} ${pc(cb.x - b.x, b.w)} round ${unit(win.radius || 0)})`
    } else s.clipPath = ""
    s.zIndex = String(i + 1)
    const link = live() && web(n.link)
    x.outer.classList.toggle("ec-link", link)
    x.outer.tabIndex = link ? 0 : -1
    if (link) x.outer.setAttribute("role", "link")
    else x.outer.removeAttribute("role")
    x.outer.setAttribute("aria-label", n.name || (n.kind === "text" ? n.text : n.kind))
    const c = x.content
    if (n.kind === "rect" || n.kind === "ellipse") {
      c.style.background = css(n.fill) || "#d4d4d8"
      c.style.borderRadius = n.kind === "ellipse" ? "50%" : unit(n.radius || 0)
      const shadows = []
      if (n.stroke && n.stroke.width) shadows.push(`inset 0 0 0 ${unit(n.stroke.width)} ${css(n.stroke.color) || "#000"}`)
      if (n.shadow) shadows.push(`0 ${unit(18)} ${unit(40)} ${unit(-14)} rgb(0 0 0 / 0.28)`)
      c.style.boxShadow = shadows.join(",")
    } else if (n.kind === "text") {
      if (!c.firstChild || c.firstChild.className !== "ec-text") c.replaceChildren(Object.assign(document.createElement("div"), { className: "ec-text" }))
      const t = c.firstChild
      const a = titleAnim(n.animation)
      const key = a ? `${a.by}|${a.mask ? 1 : 0}|${n.text}` : ""
      if (t.dataset.k !== key || (!a && t.textContent !== n.text)) {
        if (a) textPieces(t, n.text, a)
        else t.textContent = n.text
        t.dataset.k = key
        // where its pieces are before it's seen (a still editor shows them in place)
        if (a) playText(t, a, live() && !reduced() && !state.entered ? -1 : 99)
      }
      x.ta = a ? { a, on: n.animation.on === "scroll" ? "scroll" : "enter", t0: x.ta?.t0 ?? 0 } : null
      const size = b.size ?? n.size
      t.style.fontSize = unit(size)
      t.style.fontWeight = String(n.weight)
      t.style.color = css(n.color) || css(d.frame.ink) || "#18181b"
      t.style.textAlign = n.align
      const face = typeof n.face === "string" && /^[A-Za-z ]{2,40}$/.test(n.face) ? `"${n.face}",` : ""
      if (face) faceSheet(d.frame.fonts)
      // a face without the weight asked for shows its nearest, never a smeared fake bold
      t.style.fontSynthesisWeight = face ? "none" : ""
      t.style.fontFamily = face + (n.font === "mono" ? '"Geist Mono",ui-monospace,monospace' : n.font === "serif" ? '"Instrument Serif","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif' : 'Geist,ui-sans-serif,system-ui,sans-serif')
      t.style.setProperty("--ls", n.font === "display" ? "-0.025em" : n.font === "mono" ? "0.06em" : n.font === "serif" ? "-0.02em" : "0em")
      t.style.letterSpacing = "var(--ls)"
      t.style.lineHeight = n.font === "serif" ? "1.02" : ""
      t.style.textTransform = n.font === "mono" ? "uppercase" : ""
    } else if (n.kind === "image" && picture(n.src)) {
      let img = c.firstChild
      if (!img || img.tagName !== "IMG") {
        img = Object.assign(document.createElement("img"), { className: "ec-img", alt: n.name || "", draggable: false, decoding: "async", loading: "lazy" })
        c.replaceChildren(img)
      }
      if (img.getAttribute("src") !== n.src) img.src = n.src
      img.style.borderRadius = unit(n.radius || 0)
    } else if (n.kind === "effect" && x.fx) {
      x.fx.p = fxParams(n.effect)
      c.style.borderRadius = n.radius ? unit(n.radius) : ""
      c.style.overflow = n.radius ? "hidden" : ""
      fxKick()
    } else if (n.kind === "path") {
      const NS = "http://www.w3.org/2000/svg"
      let svg = c.firstChild
      if (!svg || svg.tagName !== "svg") {
        svg = document.createElementNS(NS, "svg")
        svg.setAttribute("class", "ec-path")
        svg.setAttribute("preserveAspectRatio", "none")
        svg.appendChild(document.createElementNS(NS, "path"))
        c.replaceChildren(svg)
      }
      svg.setAttribute("viewBox", `0 0 ${n.vw} ${n.vh}`)
      const p = svg.firstChild
      if (/^[MLCQZmlcqz0-9.,\s-]*$/.test(n.d)) p.setAttribute("d", n.d)
      p.setAttribute("fill", css(n.fill) || "none")
      p.setAttribute("stroke", css(n.stroke) || "#000")
      p.setAttribute("stroke-width", String(n.width))
      p.setAttribute("stroke-linecap", "round")
      p.setAttribute("stroke-linejoin", "round")
    }
    look(x)
    motionOf(x)
    turn(x)
  }

  /** Sizes what's drawn at its own scale (devices at their points, components at the frame's pixels) to the frame. */
  function fit() {
    const f = frame()
    state.scale = root.clientWidth / f.w || 1
    for (const x of nodes.values()) {
      const b = boxOf(x.n)
      if (x.three) {
        x.three.resize(b.w * state.scale, b.h * state.scale)
        turn(x)
      } else if (x.dev) {
        // drawn at its own points, scaled into its box about its middle, seen through a lens a few lengths away
        const bw = b.w * state.scale
        const bh = b.h * state.scale
        const { g } = x.dev
        const k = Math.min(bw / g.w, bh / g.h)
        x.dev.base = `translate(${(bw / 2 - g.w / 2).toFixed(2)}px, ${(bh / 2 - g.h / 2).toFixed(2)}px) scale(${k})`
        // the lens: how many box-lengths away it's seen from (long and flat, like a product shot, by default)
        const lens = Math.min(8, Math.max(1.4, Number(x.n.rot3d?.p) || 3.2))
        x.content.style.perspective = `${Math.round(Math.max(bw, bh) * lens)}px`
        turn(x)
      }
      if (x.fx) {
        x.fx.w = b.w * state.scale
        x.fx.h = b.h * state.scale
        x.fx.scale = state.scale
        fxKick()
      }
      if (x.comp) {
        // the page at its own size; shown from (x, y) on, scaled into the box
        const v = x.n.view
        const pw = v ? v.w : x.n.w
        const ph = v ? v.h : x.n.h
        x.comp.style.width = `${pw}px`
        x.comp.style.height = `${ph}px`
        const iframe = x.comp.firstChild
        if (iframe) {
          iframe.style.width = `${pw}px`
          iframe.style.height = `${ph}px`
        }
        // k: the page shown smaller than its own size, to fit a slot
        const k = Math.min(1, Math.max(0.2, Number(v?.k) || 1))
        x.comp.style.transform = `scale(${((b.w * state.scale) / x.n.w) * k}, ${((b.h * state.scale) / x.n.h) * k}) translate(${-(v?.x || 0)}px, ${-(v?.y || 0)}px)`
      }
    }
  }

  /** Loads the live pages, once the canvas is near the screen (all at once in the editor). */
  function wakeLive() {
    for (const x of nodes.values())
      for (const e of x.live) {
        if (e.queued) continue
        e.queued = true
        enqueue({ iframe: e.iframe, src: e.src })
      }
  }

  /* ---- the visitor ---- */

  function hover(x, e) {
    const h = x.n.hover
    if (!live() || !h || reduced() || !state.entered) return
    const m = x.mid.style
    if (!e) {
      m.transform = ""
      return
    }
    const r = x.outer.getBoundingClientRect()
    const u = (e.clientX - r.left) / r.width - 0.5
    const v = (e.clientY - r.top) / r.height - 0.5
    m.transform =
      h.kind === "lift" ? `translateY(${-1.2 * h.amount}cqw)` : h.kind === "scale" ? `scale(${1 + 0.06 * h.amount})` : `perspective(900px) rotateX(${(-v * 14 * h.amount).toFixed(2)}deg) rotateY(${(u * 14 * h.amount).toFixed(2)}deg)`
  }

  /** The first time it's seen: every layer comes in the way it says, then hovers on its own timing. */
  function enter() {
    if (state.entered) return
    state.entered = true
    for (const x of nodes.values()) {
      const e = x.n.enter
      const m = x.mid.style
      if (!e || reduced() || !live()) {
        m.transition = `transform 220ms ${EASE}`
        continue
      }
      m.transition = `opacity ${e.dur}s ${EASE} ${e.delay}s, transform ${e.dur}s ${EASE} ${e.delay}s, filter ${e.dur}s ${EASE} ${e.delay}s`
      m.opacity = "1"
      m.transform = ""
      m.filter = ""
      if (x.bd) Object.assign(x.bd.style, { transition: `opacity ${e.dur}s ${EASE} ${e.delay}s`, opacity: "1" })
      setTimeout(() => (m.transition = `transform 220ms ${EASE}`), (e.delay + e.dur) * 1000 + 50)
    }
    // titles that come in piece by piece: their clock starts now (after their In's delay)
    const now = performance.now()
    for (const x of nodes.values()) if (x.ta) x.ta.t0 = now + (x.n.enter?.delay ?? 0) * 1000
    kick()
    // layers that set off along their path when they're seen (and those that loop on it)
    if (live())
      for (const x of nodes.values()) if (x.mo && (x.mo.trigger === "enter" || x.mo.trigger === "loop")) setTimeout(() => aim(x, 1), x.mo.delay * 1000)
  }
  function ready() {
    // where each layer starts from, before it's seen
    for (const x of nodes.values()) {
      if (x.mo && live()) {
        // at the start of its path (a layer that comes back along it starts at the far end)
        Object.assign(x.mo, { s: 0, v: 0, T: 0, from: 0, squash: 0, sqv: 0, rest: 0 })
        x.pw.style.transition = ""
        moveAlong(x)
      }
      if (x.bd && x.n.enter && live() && !reduced() && !state.entered) Object.assign(x.bd.style, { transition: "none", opacity: "0" })
      const e = x.n.enter
      if (!e || reduced() || !live() || state.entered) continue
      const m = x.mid.style
      m.transition = "none"
      m.opacity = "0"
      m.transform = e.kind === "rise" ? "translateY(3cqw)" : e.kind === "scale" ? "scale(0.94)" : ""
      m.filter = e.kind === "blur" ? "blur(1.2cqw)" : ""
    }
  }

  /** A frame of the visitor: layers that follow the pointer drift or turn toward it, others move with the scroll,
      devices turn with the scroll or on their own, and layers with a path move along it by physics. */
  function frameLoop(now) {
    state.raf = 0
    const dt = Math.min(0.05, (now - (state.last || now)) / 1000)
    state.last = now
    if (!state.visible) return
    const lively = live() && !reduced()
    let moving = false
    for (const x of nodes.values()) {
      const n = x.n
      const fo = n.follow
      const sc = n.scroll
      const spin = x.dev && n.spin && (n.spin.kind === "scroll" || n.spin.kind === "loop") ? n.spin : null
      if (lively && (fo || sc || spin)) {
        const p = state.pointer
        const tx = fo && fo.kind === "parallax" && p ? (p.x - 0.5) * 3 * fo.amount : 0
        const ty = (fo && fo.kind === "parallax" && p ? (p.y - 0.5) * 3 * fo.amount : 0) + (sc ? (0.5 - state.scroll) * sc * 30 : 0)
        const rx = fo && fo.kind === "tilt" && p ? -(p.y - 0.5) * 12 * fo.amount : 0
        const ry = fo && fo.kind === "tilt" && p ? (p.x - 0.5) * 16 * fo.amount : 0
        const c = state.cur.get(n.id) || { tx: 0, ty: 0, rx: 0, ry: 0, sx: 0, sy: 0 }
        const k = 1 - Math.exp(-dt * 7)
        c.tx += (tx - c.tx) * k
        c.ty += (ty - c.ty) * k
        c.rx += (rx - c.rx) * k
        c.ry += (ry - c.ry) * k
        if (Math.abs(tx - c.tx) + Math.abs(ty - c.ty) + Math.abs(rx - c.rx) + Math.abs(ry - c.ry) > 0.01) moving = true
        if (spin?.kind === "loop") {
          // a turntable: degrees a second, with a slow nod if it has one
          c.sy = (now / 1000) * clampN(spin.y, -360, 360, 24)
          c.sx = clampN(spin.x, -45, 45, 0) * Math.sin(now / 1600)
          moving = true
        } else if (spin) {
          // with the scroll: straight on as it crosses the middle of the screen, turned either side of it
          const at = (state.scroll - 0.5) * 2
          const gy = at * clampN(spin.y, -360, 360, 0)
          const gx = at * clampN(spin.x, -90, 90, 0)
          c.sy += (gy - c.sy) * k
          c.sx += (gx - c.sx) * k
          if (Math.abs(gy - c.sy) + Math.abs(gx - c.sx) > 0.01) moving = true
        }
        state.cur.set(n.id, c)
        x.outer.style.translate = `${c.tx.toFixed(3)}cqw ${c.ty.toFixed(3)}cqw`
        if (x.dev) {
          x.tilt = { rx: c.rx, ry: c.ry }
          x.spun = { x: c.sx, y: c.sy }
          turn(x)
        } else x.content.style.transform = c.rx || c.ry ? `perspective(1200px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg)` : ""
      }
      if (x.ta && x.content.firstChild) {
        const a = x.ta.a
        const el = x.content.firstChild
        if (!lively) playText(el, a, 99)
        else if (x.ta.on === "scroll") {
          // with the scroll: the pieces come in as the title rises from the bottom of the screen to its upper third
          const r = x.outer.getBoundingClientRect()
          const p = Math.min(1, Math.max(0, (innerHeight * 0.92 - r.top) / (innerHeight * 0.6)))
          playText(el, a, p * animLen(a, el.querySelectorAll("[data-p]").length))
          if (a.idle) moving = true
        } else if (state.entered) {
          const t = (now - x.ta.t0) / 1000
          playText(el, a, t)
          if (t < animLen(a, el.querySelectorAll("[data-p]").length) + 0.1 || a.idle) moving = true
        }
      }
      const m = x.mo
      if (m && (lively || m.preview)) {
        if (lively && m.trigger === "scroll") {
          // with the scroll: along the path as the canvas comes up from the bottom of the screen to the middle
          const T = Math.min(1, Math.max(0, (state.scroll - 0.15) / 0.55))
          if (Math.abs(T - m.T) > 0.0005) Object.assign(m, { from: m.s, T })
        }
        physics(m, dt)
        moveAlong(x)
        if (!settled(m)) moving = true
        else if (m.preview) {
          // a preview in the editor holds its end for a moment, then puts the layer back
          m.rest += dt
          moving = true
          if (m.rest > 0.7) {
            Object.assign(m, { preview: false, s: 0, v: 0, T: 0, from: 0, rest: 0 })
            x.pw.style.transform = ""
            x.pw.style.opacity = ""
          }
        } else if (lively && m.trigger === "loop") {
          m.rest += dt
          moving = true
          if (m.rest > 0.6) Object.assign(m, { rest: 0, from: m.s, T: m.T > 0.5 ? 0 : 1 })
        }
      }
    }
    if (moving) kick()
  }
  const kick = () => {
    if (!state.raf) state.raf = requestAnimationFrame(frameLoop)
  }
  const onPointer = (e) => {
    const r = root.getBoundingClientRect()
    state.pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    kick()
  }
  const onLeave = () => {
    state.pointer = null
    kick()
  }
  const onScroll = () => {
    const r = root.getBoundingClientRect()
    state.scroll = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)))
    kick()
  }
  root.addEventListener("pointermove", onPointer)
  root.addEventListener("pointerleave", onLeave)
  addEventListener("scroll", onScroll, { passive: true })

  // near the screen: wake (load the live pages); on it: come in, and answer the pointer and the scroll
  const near = new IntersectionObserver((list) => {
    if (list.some((e) => e.isIntersecting) && !state.woke) {
      state.woke = true
      wakeLive()
    }
  }, { rootMargin: "400px" })
  const seen = new IntersectionObserver((list) => {
    for (const e of list) {
      state.visible = e.isIntersecting
      if (state.visible) {
        enter()
        onScroll()
        fxKick()
      }
    }
  }, { threshold: 0.2 })
  const sized = new ResizeObserver(() => {
    if (pickView() !== state.view) draw()
    else fit()
  })

  draw()
  if (live()) ready()
  else state.woke = true
  near.observe(root)
  seen.observe(root)
  sized.observe(root)
  if (!live()) wakeLive()

  return {
    el: root,
    update(next, more) {
      d = next
      if (more) o = { ...o, ...more }
      draw()
    },
    /** In the editor: plays one layer's path once, then puts it back. */
    preview(id) {
      const x = nodes.get(id)
      if (!x?.mo) return
      Object.assign(x.mo, { preview: true, s: 0, v: 0, T: 1, from: 0, rest: 0, squash: 0, sqv: 0 })
      kick()
    },
    /** In the editor: the colours a layer's live page is made of, most used first ([] when it can't say). */
    describe(id) {
      const e = nodes.get(id)?.live[0]
      const w = e?.iframe.contentWindow
      if (!w) return Promise.resolve([])
      return new Promise((done) => {
        e.asked = done
        w.postMessage({ source: "anim-engine-host", type: "describe" }, e.origin)
        setTimeout(() => {
          if (e.asked !== done) return
          e.asked = null
          done([])
        }, 1500)
      })
    },
    /** Live: everything comes in again, as if seen for the first time. */
    replay() {
      if (!live()) return
      state.entered = false
      ready()
      requestAnimationFrame(() => requestAnimationFrame(enter))
    },
    destroy() {
      near.disconnect()
      seen.disconnect()
      sized.disconnect()
      removeEventListener("scroll", onScroll)
      if (state.raf) cancelAnimationFrame(state.raf)
      for (const x of nodes.values()) {
        for (const e of x.live) lives.delete(e.id)
        if (x.fx) fxDrop(x.fx)
        x.three?.destroy()
      }
      root.remove()
    },
  }
}

/* ---------------- canvases already in the page ---------------- */

/** A packed canvas (what the engine puts after "#z="): base64url of the deflated JSON. */
export async function unpack(z) {
  const bytes = Uint8Array.from(atob(z.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text())
}

async function read(spec) {
  const s = spec.trim()
  if (s.startsWith("{")) return JSON.parse(s)
  const z = /(?:^|[#&])z=([\w-]+)/.exec(s)
  if (z) return unpack(z[1])
  const r = await fetch(s)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

/** Every [data-engine-canvas] on the page (or in `scope`), each read and drawn only as it comes near the screen. One
    watcher for all of them, however many; calling it again only adds the new ones. */
let later = null
export function mountAll(scope = document) {
  later ??= new IntersectionObserver(
    (list) => {
      for (const e of list) {
        if (!e.isIntersecting) continue
        later.unobserve(e.target)
        const el = e.target
        read(el.getAttribute("data-engine-canvas") || "")
          .then((doc) => {
            if (!doc || doc.v !== 1) throw new Error("not a canvas")
            el.__engineCanvas = mount(el, doc, { origin: el.getAttribute("data-origin") || undefined })
          })
          .catch(() => {
            el.textContent = ""
          })
      }
    },
    { rootMargin: "600px" },
  )
  for (const el of scope.querySelectorAll("[data-engine-canvas]"))
    if (!el.__engineWatched) {
      el.__engineWatched = true
      later.observe(el)
    }
}

if (typeof document !== "undefined") {
  const start = () => {
    mountAll()
    // canvases a page adds later (a single-page app's), once a frame at most
    let queued = 0
    new MutationObserver(() => queued || (queued = requestAnimationFrame(() => ((queued = 0), mountAll())))).observe(document.body, { childList: true, subtree: true })
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start)
  else start()
}
