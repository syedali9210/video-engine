// A gradient laid on 3D forms. The ramp is placed in the piece's own space (so it turns with the piece), by axis,
// angle and density, on the faces asked for; light is the engine's own (a soft key from the upper left, a specular,
// a rim tinted by the ramp's lightest colour), so colours stay as chosen. Every motion is a loop. Rules: SHADERS.md.
import { useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { GRAIN, NOISE4, RAMP } from "./glsl"
import { clock, easeInOut, spring, vec, wave, GRAIN_SEED } from "./clock"
import { hex, lch } from "../theme"
import type { ShapeSpec } from "./spec"

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vON;
varying vec3 vN;
varying vec3 vW;
void main() {
  vObj = position;
  vON = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const FRAG = /* glsl */ `
uniform int uAxis;
uniform float uAngle, uDensity, uFaces, uFlow, uPhase, uR, uGlass, uGlow, uGrain, uSeed, uPx, uIndex, uPieces, uSpan, uThick, uSideDark, uLit, uOpacity;
uniform vec3 uBase, uUp;
varying vec3 vObj;
varying vec3 vON;
varying vec3 vN;
varying vec3 vW;
${NOISE4}
${GRAIN}
${RAMP}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vW);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  // where on the ramp: through the stack, across at an angle, out from the middle, by facing, or round the piece
  float c;
  if (uAxis == 0) c = (uIndex + 0.5 + clamp(dot(vObj, uUp) / uThick, -0.5, 0.5) * 0.7) / uPieces;
  // across, out and round are measured in the plane square to the piece's own axis (up for a stack, z for a ring
  // or a tile)
  vec2 flat2 = abs(uUp.z) > 0.5 ? vObj.xy : vObj.xz;
  if (uAxis == 0) {}
  else if (uAxis == 1) c = dot(flat2, vec2(cos(uAngle), sin(uAngle))) / uSpan + 0.5;
  else if (uAxis == 2) c = length(flat2) / (0.5 * uSpan);
  else if (uAxis == 3) c = 1.0 - facing;
  else c = abs(atan(flat2.y, flat2.x)) / 3.14159265;
  c += uFlow * 0.32 * loopNoise(vObj * 0.75 + vec3(0.0, uIndex * 1.7, 0.0), uPhase, uR);
  // past the ends the ramp runs back (no seam), density times over
  float t = c * uDensity;
  t = 1.0 - abs(1.0 - mod(t, 2.0));
  vec3 col = ramp(t);
  float top = smoothstep(0.5, 0.85, dot(normalize(vON), uUp));
  float carry = uFaces < 0.5 ? 1.0 : uFaces < 1.5 ? top : 1.0 - top;
  col = mix(uBase, col, carry);
  // the light: a soft key from the upper left, the sides a step darker, a specular and a rim in the ramp's light
  vec3 L = normalize(vec3(-0.5, 0.85, 0.45));
  float diff = 0.55 + 0.45 * (dot(n, L) * 0.5 + 0.5);
  col *= mix(1.0, diff, uLit);
  col *= mix(1.0 - uSideDark, 1.0, top);
  vec3 lite = ramp(1.0);
  float spec = pow(clamp(dot(reflect(-L, n), v), 0.0, 1.0), 48.0) * 0.35 * uLit;
  float rim = pow(1.0 - facing, 3.0) * 0.28 * uLit;
  col += vec3(spec) + lite * rim;
  float alpha = uOpacity;
  if (uGlass > 0.0) {
    float fres = pow(1.0 - facing, 2.0);
    alpha *= mix(1.0, 0.1 + 0.85 * fres, uGlass);
    col = mix(col, col * 1.2 + lite * fres * 0.65, uGlass);
  }
  col += ramp(t) * uGlow * 0.5 * (0.35 + 0.65 * (1.0 - facing));
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(clamp(grain(col, gl_FragCoord.xy / uPx, uGrain, uSeed), 0.0, 1.0), alpha);
}`

/** A soft light or shadow on a plane: brightest in the middle, gone at the edge. */
const SOFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}`
const SOFT_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

/** A rounded plate (w × d, h thick), its plan corners `r`, its edges bevelled: lying flat, centred, thickness on y. */
function plate(w: number, d: number, h: number, r: number, bevel: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  const rr = Math.max(0.001, Math.min(r, w / 2, d / 2))
  s.moveTo(x + rr, y)
  s.lineTo(x + w - rr, y)
  s.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + d - rr)
  s.absarc(x + w - rr, y + d - rr, rr, 0, Math.PI / 2, false)
  s.lineTo(x + rr, y + d)
  s.absarc(x + rr, y + d - rr, rr, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + rr)
  s.absarc(x + rr, y + rr, rr, Math.PI, 1.5 * Math.PI, false)
  const depth = Math.max(0.001, h - 2 * bevel)
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 40 })
  g.translate(0, 0, -depth / 2)
  return g
}

/** The bento of five tiles (the reference's layout), in a 10 × 5.6 frame: x, y, w, h, turn (°). */
const BENTO: [number, number, number, number, number][] = [
  [-3.15, -0.25, 3.3, 5.3, 0],
  [0.25, 1.15, 2.3, 2.5, -7],
  [3.45, 2.05, 2.8, 1.55, 0],
  [3.6, 0.3, 2.5, 1.5, 0],
  [2.35, -1.95, 4.9, 2.55, 0],
]

const AXES = { stack: 0, across: 1, radial: 2, facing: 3, around: 4 } as const

export function Shapes({ s }: { s: ShapeSpec }) {
  const camera = useThree((x) => x.camera) as THREE.PerspectiveCamera
  const tiles = s.form === "tiles"
  const n = tiles ? Math.min(BENTO.length, Math.max(1, s.count)) : s.form === "orb" || s.form === "ring" ? 1 : Math.max(1, Math.min(9, Math.round(s.count)))
  // a piece's size: plates 2.6 across, discs 2.8, pills 0.6 thick
  const thick = s.form === "slabs" ? 0.36 : s.form === "discs" ? 0.16 : s.form === "pills" ? 0.62 : 1
  const span = s.form === "orb" ? 1.35 : s.form === "ring" ? 1.75 : tiles ? 5 : 2.8

  const geometries = useMemo(() => {
    if (tiles) return BENTO.slice(0, n).map(([, , w, h]) => plate(w, h, 0.08, Math.min(w, h) * 0.12 * (0.4 + s.round), 0.02))
    let g: THREE.BufferGeometry
    if (s.form === "slabs") {
      g = plate(2.6, 2.6, thick, 0.2 + 1.1 * s.round, 0.07)
      g.rotateX(-Math.PI / 2)
    } else if (s.form === "discs") {
      g = plate(2.8, 2.8, thick, 1.4, 0.05)
      g.rotateX(-Math.PI / 2)
    } else if (s.form === "pills") {
      g = new THREE.CapsuleGeometry(0.31, 2.2, 16, 48)
      g.rotateZ(Math.PI / 2)
    } else if (s.form === "orb") g = new THREE.SphereGeometry(1.35, 160, 120)
    else g = new THREE.TorusGeometry(1.35, 0.4, 96, 256)
    return Array.from({ length: n }, () => g)
  }, [s.form, n, s.round, thick, tiles])

  // one material a piece: they share every uniform but where they sit in the stack, their opacity and (tiles) ramp
  const shared = useMemo(
    (): Record<string, THREE.IUniform> => ({
      uAxis: { value: 1 },
      ...Object.fromEntries(["uAngle", "uDensity", "uFaces", "uFlow", "uPhase", "uR", "uGlass", "uGlow", "uGrain", "uSeed", "uPx", "uPieces", "uSpan", "uThick", "uSideDark", "uLit"].map((k) => [k, { value: 0 }])),
      uBase: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uStops: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
      uCount: { value: 2 },
    }),
    [],
  )
  const materials = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const own: Record<string, THREE.IUniform> = tiles ? { uStops: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) }, uCount: { value: 3 } } : {}
        return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true, uniforms: { ...shared, ...own, uIndex: { value: i }, uOpacity: { value: 1 } } })
      }),
    [n, shared, tiles],
  )
  // a tile's own ramp: its colour, deep at one end and lit at the other (one hue a tile, as in the reference)
  const tileRamps = useMemo(
    () =>
      s.colors.map((c) => {
        const o = lch(c)
        return [hex({ l: o.l * 0.72, c: o.c * 1.05, h: o.h - 6 }), c, hex({ l: Math.min(0.97, o.l + 0.14), c: o.c * 0.75, h: o.h + 10 })]
      }),
    [s.colors],
  )

  const pieces = useRef<(THREE.Group | null)[]>([])
  const glow = useRef<THREE.Mesh>(null)
  const softMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Vector3() }, uAlpha: { value: 0 } } }), [])
  const shadowMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG, transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Vector3() }, uAlpha: { value: 0.35 } } }), [])

  // the stack's resting heights
  const H = n * thick + (n - 1) * s.gap * thick
  const restY = (i: number, gap = s.gap) => -(n * thick + (n - 1) * gap * thick) / 2 + thick / 2 + i * (thick + gap * thick)

  useFrame(() => {
    const p = clock.phase
    const u = shared
    u.uAxis.value = AXES[s.axis]
    u.uAngle.value = (s.angle * Math.PI) / 180
    u.uDensity.value = s.density
    u.uFaces.value = s.faces === "all" ? 0 : s.faces === "top" ? 1 : 2
    u.uFlow.value = s.flow
    u.uPhase.value = p
    u.uR.value = (1.6 * s.speed * s.duration) / (2 * Math.PI)
    u.uGlass.value = s.glass
    u.uGlow.value = s.glow
    u.uGrain.value = s.grain
    u.uSeed.value = GRAIN_SEED
    u.uPx.value = clock.px
    u.uPieces.value = n
    u.uSpan.value = span
    u.uThick.value = thick
    u.uSideDark.value = s.form === "slabs" || s.form === "discs" ? 0.28 : 0
    u.uLit.value = tiles ? 0.25 : 1
    u.uUp.value.set(0, tiles || s.form === "ring" ? 0 : 1, tiles || s.form === "ring" ? 1 : 0)
    u.uBase.value.copy(vec(s.base))
    const stops = s.colors.slice(0, 5)
    u.uCount.value = Math.max(2, stops.length)
    stops.forEach((c, i) => u.uStops.value[i].copy(vec(c)))
    if (tiles)
      materials.forEach((m, i) => {
        const r = tileRamps[i % tileRamps.length]
        m.uniforms.uCount.value = 3
        r.forEach((c, k) => (m.uniforms.uStops.value as THREE.Vector3[])[k].copy(vec(c)))
      })

    // each piece where its motion puts it
    const gapNow = s.motion === "breathe" ? s.gap * (1 + 1.4 * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI))) : s.gap
    for (let i = 0; i < n; i++) {
      const g = pieces.current[i]
      if (!g) continue
      const m = materials[i]
      let y = tiles ? BENTO[i][1] : restY(i, gapNow)
      let ry = 0
      let rz = tiles ? (BENTO[i][4] * Math.PI) / 180 : 0
      let rx = 0
      let op = 1
      let sc = 1
      const k = n > 1 ? i / (n - 1) : 0
      if (s.motion === "stack") {
        // dropped in one by one on a spring, held, then lifted away together: the loop starts and ends empty-handed
        const at = 0.04 + i * (0.5 / Math.max(1, n))
        const x = (p - at) / 0.2
        y += (1 - spring(x, 0.3)) * 3.2
        op = Math.min(1, Math.max(0, x * 3))
        const out = easeInOut((p - 0.84) / 0.16)
        y += out * 3.6
        op *= 1 - out
        sc = 0.94 + 0.06 * Math.min(1, Math.max(0, x))
        ry = 0.18 * wave(1)
      } else if (s.motion === "twist") ry = (k - 0.5) * 0.95 * wave(1) + 0.12 * wave(1, 0.25)
      else if (s.motion === "float") {
        y += (tiles ? 0.07 : 0.12) * wave(1, i / n)
        rz += ((tiles ? 1.6 : 3) * Math.PI) / 180 * wave(1, i / n + 0.25)
        rx += (tiles ? 2 : 0) * (Math.PI / 180) * wave(1, i / n + 0.5)
      } else if (s.motion === "fan") ry = k * 1.0 * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI))
      else if (s.motion === "breathe") ry = 0.14 * wave(1)
      // the fan opens from a corner: its pivot
      const pivot = s.motion === "fan" ? -1.1 : 0
      g.position.set(tiles ? BENTO[i][0] : pivot, y, pivot)
      g.rotation.set(rx, ry, rz)
      g.scale.setScalar(sc)
      m.uniforms.uOpacity.value = op
      m.depthWrite = s.glass < 0.3 && op > 0.99
      m.visible = op > 0.002
    }
    // the whole: a turntable (whole turns are seamless), or a sway
    const root = pieces.current[n] as THREE.Group | null
    if (root) {
      const turn = s.motion === "turn" ? (s.spin >= 1 ? p * 2 * Math.PI * Math.round(s.spin) : s.spin * Math.PI * wave(1)) : 0
      // a ring stands facing the camera, leaning back a little, turning in its own plane
      if (s.form === "ring") root.rotation.set(-0.38, 0.3, turn)
      else root.rotation.set(0, turn + (tiles ? 0 : 0.6), 0)
      if (s.motion === "fan") root.rotation.y = -0.5
    }
    // a light under glass, a shadow under solids
    if (glow.current) {
      glow.current.visible = !!s.under
      glow.current.lookAt(camera.position)
      softMat.uniforms.uColor.value.copy(vec(s.under || "#000000"))
      softMat.uniforms.uAlpha.value = 0.75 + 0.25 * wave(1)
    }
    const bgLight = lch(s.bg || "#000000").l > 0.5
    shadowMat.uniforms.uColor.value.set(0, 0, 0)
    shadowMat.uniforms.uAlpha.value = tiles || s.glass > 0.3 ? 0 : bgLight ? 0.32 : 0.5

    // the camera: its height and distance, swaying a few degrees over the loop
    const tilt = (s.tilt * Math.PI) / 180
    const az = tiles ? 0.04 * wave(1) : (0.5 + 0.05 * wave(1, 0.1)) * (s.form === "orb" || s.form === "ring" ? 0 : 1)
    const d = s.dist
    // (tiles are filmed from the front, whatever the tilt)
    const el = tiles ? 0.03 * wave(1, 0.3) : tilt
    camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, tiles ? 0 : -0.1, 0)
    camera.fov = tiles ? 32 : 30
    camera.zoom = 1
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <group ref={(g) => void (pieces.current[n] = g)}>
        {geometries.map((g, i) => (
          <group key={i} ref={(x) => void (pieces.current[i] = x)}>
            {/* the fan opens from a corner: the piece sits off its pivot */}
            <mesh geometry={g} material={materials[i]} position={s.motion === "fan" ? [1.1, 0, 1.1] : [0, 0, 0]} renderOrder={i} />
          </group>
        ))}
      </group>
      {!tiles && (
        <mesh material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -H / 2 - (s.form === "orb" ? 1.2 : s.form === "ring" ? 1.6 : 0.25), 0]} renderOrder={-1}>
          <planeGeometry args={[6, 6]} />
        </mesh>
      )}
      <mesh ref={glow} material={softMat} position={[0, -H / 2 - 0.2, -0.3]} renderOrder={-2}>
        <planeGeometry args={[9, 6]} />
      </mesh>
    </>
  )
}
