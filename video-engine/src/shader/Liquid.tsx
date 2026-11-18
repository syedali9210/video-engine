// Liquid logo (github.com/collidingScopes/liquid-logo, MIT, Alan Ang): its flowing field and colour curve kept, with
// three changes for video. The logo's distance field (not just its one-pixel outline) bends the flow, so the bands
// follow the shape's contours all the way in; the edge is a lit bevel, so it reads as liquid metal; and time runs in
// whole cycles round the loop, so the video loops.
import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { GRAIN, NOISE4 } from "./glsl"
import { clock, pending, vec, GRAIN_SEED } from "./clock"
import type { LiquidSpec, Mark } from "./spec"

const VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`
const FRAG = /* glsl */ `
uniform vec2 uRes;
uniform float uPhase, uCycles, uR, uIter, uScale, uDot, uDotMul, uVOff, uInt, uExp, uNoise, uShift, uEdge, uContour, uRim, uSize, uGrain, uSeed, uPx, uHasBg, uTexel;
uniform vec3 uRGB, uBg;
uniform sampler2D uMask, uSdf;
${NOISE4}
${GRAIN}
// signed distance to the logo's edge, in logo-box units (+ inside)
float sdfAt(vec2 luv) { return (texture2D(uSdf, luv).g - 0.5) * 0.5; }
void main() {
  vec2 r = uRes;
  vec2 FC = gl_FragCoord.xy;
  float time = uPhase * 6.28318530718 * uCycles;
  vec2 luv = (FC - 0.5 * r) / (uSize * r.y) + 0.5;
  float inBox = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
  float m = texture2D(uMask, luv).a * inBox;
  if (m < 0.002) {
    gl_FragColor = uHasBg > 0.5 ? vec4(uBg, 1.0) : vec4(0.0);
    return;
  }
  float sd = sdfAt(luv);
  float edge = (1.0 - smoothstep(0.0, 0.008, sd)) * uEdge;

  // liquid-logo's field, over the logo's own square (theirs fills its canvas), so it looks the same at any frame size
  vec2 p = (luv - 0.5) * 2.0;
  vec2 l = vec2(0.0);
  l.x += abs(uDot - dot(p, p)) * uDotMul;
  vec2 v = p * (1.0 - l.x) / uScale;
  v += vec2(sin(edge * 10.0), cos(edge * 8.0)) * edge * 3.0;
  // the contours: the flow's phase follows the distance in from the edge
  v += uContour * 9.0 * sd * vec2(1.0, 0.7);
  float flow = loopNoise(vec3(p * 2.0, 0.0), uPhase, uR) * uNoise;
  v += vec2(flow, flow * 0.7);
  vec4 o = vec4(0.0);
  for (float i = 0.0; i < 16.0; i++) {
    if (i >= uIter) break;
    float idx = i + 1.0;
    vec2 off = cos(v.yx * idx + vec2(0.0, idx) + time) / idx + uVOff;
    off *= 1.0 + edge * 4.0;
    v += off;
    o += (sin(vec4(v.x, v.y, v.y, v.x)) + 1.0) * abs(v.x - v.y) * uInt;
  }
  if (uShift > 0.0) o = o.wxyz * uShift + o * (1.0 - uShift);
  vec4 expPy = exp(p.y * vec4(uRGB, 0.0));
  float expLx = exp(-uExp * l.x);
  vec4 ratio = expPy * expLx / o;
  vec4 e2 = exp(2.0 * ratio);
  o = (e2 - 1.0) / (e2 + 1.0);
  float hl = pow(0.5 + 0.5 * sin(edge * 6.0), 8.0) * edge;
  vec3 col = clamp(o.rgb + hl * vec3(0.4, 0.3, 0.5), 0.0, 1.0);
  col = mix(col, col * 0.8 + 0.2, 0.3);
  col += pow(edge * 1.2, 4.0) * vec3(0.6, 0.7, 0.8);

  // the bevel: the edge rounded over, catching a light from the upper left
  if (uRim > 0.0) {
    float bw = 0.022;
    float hC = smoothstep(0.0, bw, sd);
    float hX = smoothstep(0.0, bw, sdfAt(luv + vec2(uTexel, 0.0)));
    float hY = smoothstep(0.0, bw, sdfAt(luv + vec2(0.0, uTexel)));
    vec3 nrm = normalize(vec3(-(hX - hC), -(hY - hC), uTexel * 4.0));
    vec3 L = normalize(vec3(-0.5, 0.6, 0.6));
    float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    col = col * mix(1.0, 0.7 + 0.4 * max(dot(nrm, L), 0.0), uRim) + spec * uRim * 0.6;
  }
  col = clamp(grain(col, FC / uPx, uGrain, uSeed), 0.0, 1.0);
  gl_FragColor = uHasBg > 0.5 ? vec4(mix(uBg, col, m), 1.0) : vec4(col * m, m);
}`

// the built-in marks, drawn in a 100 × 100 box (this engine's own, not anyone's brand)
const MARKS: Record<Mark, { d: string; rule?: CanvasFillRule }> = {
  sparkle: { d: "M50 2 C54 34 66 46 98 50 C66 54 54 66 50 98 C46 66 34 54 2 50 C34 46 46 34 50 2 Z" },
  drop: { d: "M50 3 C50 3 16 42 16 64 A34 34 0 0 0 84 64 C84 42 50 3 50 3 Z" },
  ring: { d: "M50 4 A46 46 0 1 0 50.01 4 Z M50 28 A22 22 0 1 1 49.99 28 Z", rule: "evenodd" },
  bolt: { d: "M60 2 L14 58 H46 L36 98 L86 38 H54 Z" },
}

const MASK = 2048
const FIELD = 512

/** The logo drawn white on a clear square, as large as fits. */
async function drawLogo(logo: LiquidSpec["logo"]): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas")
  c.width = c.height = MASK
  const x = c.getContext("2d")!
  x.fillStyle = "#fff"
  const pad = MASK * 0.07
  if (logo.type === "text") {
    const face = `"Inter", "Geist", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
    await document.fonts.load(`900 200px ${face}`).catch(() => {})
    let size = MASK
    x.font = `900 ${size}px ${face}`
    const m = x.measureText(logo.text || " ")
    const w = m.width
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    size *= Math.min((MASK - 2 * pad) / Math.max(1, w), (MASK - 2 * pad) / Math.max(1, h))
    x.font = `900 ${size}px ${face}`
    const n = x.measureText(logo.text || " ")
    x.textBaseline = "alphabetic"
    x.fillText(logo.text, (MASK - n.width) / 2 - n.actualBoundingBoxLeft * 0, (MASK + n.actualBoundingBoxAscent - n.actualBoundingBoxDescent) / 2)
  } else if (logo.type === "mark") {
    const k = (MASK - 2 * pad) / 100
    x.setTransform(k, 0, 0, k, pad, pad)
    const m = MARKS[logo.mark] ?? MARKS.sparkle
    x.fill(new Path2D(m.d), m.rule ?? "nonzero")
  } else {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = logo.src
    await img.decode()
    const k = Math.min((MASK - 2 * pad) / img.naturalWidth, (MASK - 2 * pad) / img.naturalHeight)
    const w = img.naturalWidth * k
    const h = img.naturalHeight * k
    x.drawImage(img, (MASK - w) / 2, (MASK - h) / 2, w, h)
    // a picture with no transparency (a JPEG, a logo on white): its ink is the shape, against its corners' colour
    const d = x.getImageData(0, 0, MASK, MASK)
    let opaque = true
    for (let i = 3; i < d.data.length && opaque; i += 4 * 97) if (d.data[i] < 250 && d.data[i] > 0) opaque = false
    const corner = d.data[(Math.round((MASK - h) / 2 + 2) * MASK + Math.round((MASK - w) / 2 + 2)) * 4]
    if (opaque) {
      const light = corner > 127
      for (let i = 0; i < d.data.length; i += 4) {
        if (!d.data[i + 3]) continue
        const lum = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255
        const a = Math.max(0, Math.min(1, ((light ? 1 - lum : lum) - 0.12) / 0.5))
        d.data[i] = d.data[i + 1] = d.data[i + 2] = 255
        d.data[i + 3] = Math.round(a * 255)
      }
      x.putImageData(d, 0, 0)
    }
  }
  return c
}

/** Exact Euclidean distance (Felzenszwalb & Huttenlocher), one line at a time: f holds 0 on the shape, ∞ off it. */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}
function edt(inside: Uint8Array, n: number, want: 0 | 1) {
  const g = new Float64Array(n * n)
  for (let i = 0; i < n * n; i++) g[i] = inside[i] === want ? 0 : 1e20
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) f[y] = g[y * n + x]
    edt1(f, n, d, v, z)
    for (let y = 0; y < n; y++) g[y * n + x] = d[y]
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) f[x] = g[y * n + x]
    edt1(f, n, d, v, z)
    for (let x = 0; x < n; x++) g[y * n + x] = d[x]
  }
  return g
}

/** The mask (sharp, at full size) and the signed distance field (smaller: it only has to be smooth). */
async function logoTextures(logo: LiquidSpec["logo"]) {
  const big = await drawLogo(logo)
  const mask = new THREE.CanvasTexture(big)
  mask.anisotropy = 4
  mask.minFilter = THREE.LinearMipmapLinearFilter
  const small = document.createElement("canvas")
  small.width = small.height = FIELD
  const sx = small.getContext("2d")!
  sx.drawImage(big, 0, 0, FIELD, FIELD)
  const a = sx.getImageData(0, 0, FIELD, FIELD).data
  const inside = new Uint8Array(FIELD * FIELD)
  for (let i = 0; i < inside.length; i++) inside[i] = a[i * 4 + 3] > 127 ? 1 : 0
  // how far each pixel is from the shape, and from the outside
  const toShape = edt(inside, FIELD, 1)
  const toOutside = edt(inside, FIELD, 0)
  // + inside, in logo-box units, ±0.25 of the box over the byte's range; rows bottom up (the canvas is drawn top
  // down, the mask's texture is flipped to match, so this is too)
  const data = new Uint8Array(FIELD * FIELD * 4)
  for (let i = 0; i < inside.length; i++) {
    const s = (Math.sqrt(toOutside[i]) - Math.sqrt(toShape[i])) / FIELD
    const o = ((FIELD - 1 - Math.floor(i / FIELD)) * FIELD + (i % FIELD)) * 4
    data[o + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + s * 2)))
    data[o + 3] = 255
  }
  const sdf = new THREE.DataTexture(data, FIELD, FIELD, THREE.RGBAFormat)
  sdf.magFilter = sdf.minFilter = THREE.LinearFilter
  sdf.needsUpdate = true
  return { mask, sdf }
}

export function Liquid({ s }: { s: LiquidSpec }) {
  const [tex, setTex] = useState<{ mask: THREE.Texture; sdf: THREE.Texture } | null>(null)
  const done = useRef<() => void>(() => {})
  const logoKey = JSON.stringify(s.logo)
  useEffect(() => {
    let gone = false
    const ready = new Promise<void>((r) => (done.current = r))
    pending.add(ready)
    void logoTextures(s.logo)
      .catch(() => logoTextures({ type: "mark", mark: "sparkle" }))
      .then((t) => !gone && setTex(t))
    return () => {
      gone = true
      pending.delete(ready)
      done.current()
    }
  }, [logoKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tex) done.current()
  }, [tex])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        uniforms: {
          ...Object.fromEntries(["uPhase", "uCycles", "uR", "uIter", "uScale", "uDot", "uDotMul", "uVOff", "uInt", "uExp", "uNoise", "uShift", "uEdge", "uContour", "uRim", "uSize", "uGrain", "uSeed", "uPx", "uHasBg", "uTexel"].map((k) => [k, { value: 0 }])),
          uRes: { value: new THREE.Vector2() },
          uRGB: { value: new THREE.Vector3() },
          uBg: { value: new THREE.Vector3() },
          uMask: { value: null },
          uSdf: { value: null },
        },
      }),
    [],
  )
  useFrame(({ gl }) => {
    const u = material.uniforms
    const size = gl.getDrawingBufferSize(new THREE.Vector2())
    u.uRes.value.copy(size)
    u.uPhase.value = clock.phase
    // liquid-logo's time only ever shows through a cosine: whole cycles round the loop make it seamless
    u.uCycles.value = Math.max(1, Math.round((s.speed * s.duration) / (2 * Math.PI)))
    u.uR.value = (0.15 * s.speed * s.duration) / (2 * Math.PI) + 0.3
    u.uIter.value = s.iterations
    u.uScale.value = s.scale
    u.uDot.value = s.dot
    u.uDotMul.value = s.dotMul
    u.uVOff.value = s.vOffset
    u.uInt.value = s.intensity
    u.uExp.value = s.exp
    u.uNoise.value = s.noise
    u.uShift.value = s.shift
    u.uEdge.value = s.edge
    u.uContour.value = s.contour
    u.uRim.value = s.rim
    u.uSize.value = s.size
    u.uGrain.value = s.grain
    u.uSeed.value = GRAIN_SEED
    u.uPx.value = clock.px
    u.uHasBg.value = s.bg ? 1 : 0
    u.uTexel.value = 1 / FIELD
    u.uRGB.value.set(...s.rgb)
    u.uBg.value.copy(vec(s.bg || "#000000"))
    u.uMask.value = tex?.mask ?? null
    u.uSdf.value = tex?.sdf ?? null
  })
  if (!tex) return null
  return (
    <mesh material={material} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
