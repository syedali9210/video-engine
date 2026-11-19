// React Three Fiber scenes, each a pure function of the loop's phase: lights, floats and turns are sines over the
// loop or whole laps of something evenly spaced, so the last frame runs into the first. Lighting comes from drei's
// Environment built from Lightformers (no HDR to download), redrawn every frame so moving lights move in reflections.
import { useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from "@react-three/drei"
import * as THREE from "three"
import { GRAIN, NOISE4 } from "./glsl"
import { clock, wave, GRAIN_SEED } from "./clock"
import type { SceneSpec } from "./spec"

const TAU = Math.PI * 2

export function Scenes({ s }: { s: SceneSpec }) {
  return (
    <>
      {s.scene === "showroom" && <Showroom s={s} />}
      {s.scene === "prism" && <Prism s={s} />}
      {s.scene === "candy" && <Candy s={s} />}
      {s.grain > 0 && <Grain amount={s.grain} />}
    </>
  )
}

/** Grain over the finished frame: a full-screen pass drawn last. */
function Grain({ amount }: { amount: number }) {
  const m = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
        fragmentShader: `uniform float uA, uSeed, uPx; ${GRAIN} void main() { float n = hash12(floor(gl_FragCoord.xy / uPx) + uSeed * 91.7) - 0.5; gl_FragColor = vec4(vec3(n > 0.0 ? 1.0 : 0.0), abs(n) * uA * 2.0); }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uA: { value: amount }, uSeed: { value: 0 }, uPx: { value: 1 } },
      }),
    [amount],
  )
  useFrame(() => {
    m.uniforms.uSeed.value = GRAIN_SEED
    m.uniforms.uPx.value = clock.px
  }, -1)
  return (
    <mesh material={m} frustumCulled={false} renderOrder={1e6}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

/* ---------------- Showroom: a dark hall, light strips passing over a lacquered form ---------------- */

const STRIPS = 7
const PITCH = 2.4

function Showroom({ s }: { s: SceneSpec }) {
  const camera = useThree((x) => x.camera) as THREE.PerspectiveCamera
  const overhead = useRef<(THREE.Mesh | null)[]>([])
  const floor = useRef<(THREE.Mesh | null)[]>([])
  const hero = useRef<THREE.Group>(null)
  const [paint, light, accent] = [s.colors[0] ?? "#16161a", s.colors[1] ?? "#ffffff", s.colors[2] ?? "#7aa2ff"]
  useFrame(() => {
    const p = clock.phase
    // the strips travel one pitch a loop each (× speed, whole pitches): evenly spaced, so the loop is seamless
    const laps = Math.max(1, Math.round(s.speed * 3))
    const shift = p * PITCH * laps
    for (let i = 0; i < STRIPS; i++) {
      const z = (((i * PITCH + shift) % (STRIPS * PITCH)) + STRIPS * PITCH) % (STRIPS * PITCH) - (STRIPS * PITCH) / 2
      overhead.current[i]?.position.set(0, 5, z)
      floor.current[i]?.position.set(0, -0.999, z)
    }
    if (hero.current) hero.current.rotation.y = 0.55 + 0.12 * wave(1)
    const az = 0.85 + 0.1 * wave(1, 0.15)
    camera.position.set(Math.sin(az) * 8.6, 1.35 + 0.15 * wave(1, 0.3), Math.cos(az) * 8.6)
    camera.lookAt(0, -0.25, 0)
    camera.fov = 30
    camera.updateProjectionMatrix()
  }, -1)
  return (
    <>
      <fog attach="fog" args={[s.bg || "#020203", 9, 22]} />
      <Environment resolution={256} frames={Infinity}>
        <color attach="background" args={["#000000"]} />
        {Array.from({ length: STRIPS }, (_, i) => (
          <Lightformer key={i} ref={(m: THREE.Mesh | null) => void (overhead.current[i] = m)} form="rect" intensity={6} color={light} scale={[14, 0.5, 1]} rotation={[Math.PI / 2, 0, 0]} position={[0, 5, 0]} />
        ))}
        <Lightformer form="rect" intensity={2.4} color={accent} scale={[20, 2, 1]} position={[-8, 1, 0]} rotation={[0, Math.PI / 2, 0]} />
        <Lightformer form="rect" intensity={1.6} color={light} scale={[20, 1.2, 1]} position={[8, 0.6, 0]} rotation={[0, -Math.PI / 2, 0]} />
        <Lightformer form="ring" intensity={2} color={light} scale={4} position={[6, 3, 6]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.5} color={light} scale={[12, 6, 1]} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </Environment>
      {/* one lacquered pebble on the floor, a light line across its back */}
      <group ref={hero}>
        <mesh position={[0, -0.32, 0]} scale={[2.3, 0.7, 1.15]}>
          <sphereGeometry args={[1, 192, 128]} />
          <meshPhysicalMaterial color={paint} metalness={0.6} roughness={0.14} clearcoat={1} clearcoatRoughness={0.03} envMapIntensity={2.2} />
        </mesh>
        <mesh position={[-2.18, -0.25, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1.6]}>
          <capsuleGeometry args={[0.035, 1.1, 8, 24]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
      <pointLight position={[-3.2, -0.2, 0]} color={accent} intensity={6} distance={5} />
      {Array.from({ length: STRIPS }, (_, i) => (
        <mesh key={i} ref={(m) => void (floor.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[11, 0.045]} />
          <meshBasicMaterial color={light} toneMapped={false} transparent opacity={0.75} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial blur={[300, 90]} resolution={1024} mixBlur={1} mixStrength={36} roughness={1} depthScale={1.1} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#08080a" metalness={0.6} mirror={0.75} />
      </mesh>
    </>
  )
}

/* ---------------- Prism: a beam in, a spectrum out ---------------- */

const RAYS_FRAG = /* glsl */ `
uniform float uPhase, uR, uSpread, uAim, uSeed, uPx;
uniform vec2 uExit;
varying vec2 vP;
${NOISE4}
vec3 spectrum(float x) {
  // red at the outside of the bend, violet inside
  vec3 c = vec3(1.0, 0.0, 0.0);
  c = mix(c, vec3(1.0, 0.55, 0.0), smoothstep(0.0, 0.2, x));
  c = mix(c, vec3(1.0, 0.95, 0.1), smoothstep(0.2, 0.36, x));
  c = mix(c, vec3(0.1, 1.0, 0.3), smoothstep(0.36, 0.55, x));
  c = mix(c, vec3(0.1, 0.6, 1.0), smoothstep(0.55, 0.75, x));
  c = mix(c, vec3(0.5, 0.2, 1.0), smoothstep(0.75, 1.0, x));
  return c;
}
void main() {
  vec2 d = vP - uExit;
  float dist = length(d);
  float a = atan(d.y, d.x) - uAim;
  float x = a / uSpread + 0.5;
  float inFan = smoothstep(-0.04, 0.02, x) * (1.0 - smoothstep(0.98, 1.04, x));
  float shimmer = 0.75 + 0.25 * loopNoise(vec3(dist * 0.6, x * 6.0, 0.0), uPhase, uR);
  float fall = 1.0 / (1.0 + dist * 0.12);
  float wide = exp(-pow((x - 0.5) * 1.6, 2.0)) * 0.25;
  vec3 col = spectrum(clamp(x, 0.0, 1.0)) * (inFan * shimmer * fall * 1.25) + spectrum(clamp(x, 0.0, 1.0)) * wide * fall * 0.6;
  col *= smoothstep(0.0, 0.25, dist);
  gl_FragColor = vec4(col, 1.0);
}`
const BEAM_FRAG = /* glsl */ `
uniform float uPhase, uR;
varying vec2 vUv;
${NOISE4}
void main() {
  float across = abs(vUv.y - 0.5) * 2.0;
  float core = exp(-across * across * 60.0);
  float halo = exp(-across * across * 6.0) * 0.18;
  float flicker = 0.9 + 0.1 * loopNoise(vec3(vUv.x * 4.0, 0.0, 0.0), uPhase, uR);
  float fade = smoothstep(0.0, 0.35, vUv.x);
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * (core + halo) * flicker * fade, 1.0);
}`
const PVERT = /* glsl */ `varying vec2 vUv; varying vec2 vP; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xy; gl_Position = projectionMatrix * viewMatrix * w; }`

function Prism({ s }: { s: SceneSpec }) {
  const camera = useThree((x) => x.camera) as THREE.PerspectiveCamera
  const prism = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }
  const rays = useMemo(() => new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: RAYS_FRAG, ...add, uniforms: { uPhase: { value: 0 }, uR: { value: 1 }, uSpread: { value: 0.5 }, uAim: { value: 0 }, uSeed: { value: 0 }, uPx: { value: 1 }, uExit: { value: new THREE.Vector2(0.78, -0.12) } } }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const beamMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: BEAM_FRAG, ...add, uniforms: { uPhase: { value: 0 }, uR: { value: 0.6 } } }), []) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const p = clock.phase
    // the beam swings a little; the spectrum fans the other way, wider as it swings
    const swing = 0.06 * wave(1)
    const entry = new THREE.Vector2(-0.64, 0.05)
    if (beam.current) {
      const len = 12
      beam.current.position.set(entry.x - (Math.cos(swing) * len) / 2, entry.y - (Math.sin(swing) * len) / 2, 0)
      beam.current.rotation.z = swing
      beam.current.scale.set(len, 0.5, 1)
    }
    beamMat.uniforms.uPhase.value = p
    rays.uniforms.uPhase.value = p
    rays.uniforms.uR.value = 0.8 * s.speed
    rays.uniforms.uAim.value = -0.32 - swing * 1.8
    rays.uniforms.uSpread.value = 0.34 + 0.05 * wave(1, 0.2)
    // the triangle faces the camera, apex up, rocking a little
    if (prism.current) prism.current.rotation.set(0.12 * wave(1, 0.1), 0.18 * wave(1, 0.35), 0.04 * wave(1))
    camera.position.set(0.4 + 0.25 * wave(1, 0.4), 0.15, 9)
    camera.lookAt(0.6, -0.4, 0)
    camera.fov = 40
    camera.updateProjectionMatrix()
  }, -1)
  return (
    <>
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} color="#ffffff" scale={[6, 0.4, 1]} position={[-5, 0, 2]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1} color="#ffffff" scale={[3, 3, 1]} position={[3, 4, 3]} target={[0, 0, 0]} />
      </Environment>
      <mesh ref={beam} material={beamMat} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh material={rays} position={[6, -1, -0.2]} renderOrder={2}>
        <planeGeometry args={[16, 14]} />
      </mesh>
      <group ref={prism}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <cylinderGeometry args={[1.25, 1.25, 1.2, 3, 1]} />
          <meshPhysicalMaterial color="#ffffff" transmission={1} roughness={0.04} thickness={1.6} ior={1.5} envMapIntensity={2.5} clearcoat={1} transparent opacity={0.98} />
        </mesh>
        <lineSegments rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <edgesGeometry args={[new THREE.CylinderGeometry(1.25, 1.25, 1.2, 3, 1), 20]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.6} toneMapped={false} />
        </lineSegments>
      </group>
    </>
  )
}

/* ---------------- Candy: glossy forms floating on a pastel ground ---------------- */

const FORMS = ["sphere", "torus", "capsule", "box", "sphere", "torus", "capsule", "box", "sphere"] as const

function Candy({ s }: { s: SceneSpec }) {
  const camera = useThree((x) => x.camera) as THREE.PerspectiveCamera
  const items = useRef<(THREE.Mesh | null)[]>([])
  const place = useMemo(
    () =>
      FORMS.map((f, i) => {
        const a = (i / FORMS.length) * TAU + 0.4
        const r = i === 0 ? 0 : 2.4 + (i % 3) * 0.55
        return { f, x: Math.cos(a) * r, y: (i % 2 ? 0.55 : -0.35) + (i === 0 ? 0.1 : 0), z: Math.sin(a) * r * 0.55 - (i === 0 ? 0 : 0.6), k: i === 0 ? 1.45 : 0.42 + ((i * 37) % 5) * 0.08, off: i / FORMS.length, spin: (i % 2 ? 1 : -1) }
      }),
    [],
  )
  useFrame(() => {
    const p = clock.phase
    place.forEach((o, i) => {
      const m = items.current[i]
      if (!m) return
      m.position.set(o.x, o.y + 0.18 * Math.sin((p + o.off) * TAU), o.z)
      // a whole turn a loop, about a tilted axis
      m.rotation.set(0.5 + 0.2 * Math.sin((p + o.off) * TAU), o.spin * p * TAU, 0.3 * o.spin)
    })
    camera.position.set(0.5 * wave(1), 1.4 + 0.2 * wave(1, 0.25), 8.5)
    camera.lookAt(0, 0.1, 0)
    camera.fov = 36
    camera.updateProjectionMatrix()
  }, -1)
  return (
    <>
      <color attach="background" args={[s.bg || "#ffd9ea"]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" scale={[10, 4, 1]} position={[0, 6, 3]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" scale={[4, 6, 1]} position={[-6, 1, 2]} target={[0, 0, 0]} />
        <Lightformer form="circle" intensity={1.6} color="#ffffff" scale={3} position={[6, 2, 4]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color={s.bg || "#ffd9ea"} scale={[20, 20, 1]} position={[0, 0, -8]} />
      </Environment>
      <directionalLight position={[3, 6, 4]} intensity={0.6} />
      {place.map((o, i) => (
        <mesh key={i} ref={(m) => void (items.current[i] = m)} scale={o.k}>
          {o.f === "sphere" && <sphereGeometry args={[1, 96, 64]} />}
          {o.f === "torus" && <torusGeometry args={[0.8, 0.36, 48, 128]} />}
          {o.f === "capsule" && <capsuleGeometry args={[0.45, 1.1, 16, 48]} />}
          {o.f === "box" && <boxGeometry args={[1.3, 1.3, 1.3]} />}
          <meshPhysicalMaterial color={s.colors[i % s.colors.length]} roughness={0.22} clearcoat={1} clearcoatRoughness={0.08} sheen={0.6} sheenColor="#ffffff" envMapIntensity={1.1} />
        </mesh>
      ))}
      <ContactShadows position={[0, -1.7, 0]} opacity={0.35} scale={14} blur={2.6} far={4} frames={Infinity} color={new THREE.Color(s.bg || "#ffd9ea").multiplyScalar(0.45).getStyle()} />
    </>
  )
}
