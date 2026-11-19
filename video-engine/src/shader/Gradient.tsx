// ShaderGradient (github.com/ruucm/shadergradient, MIT) rebuilt for frame-exact video: the same meshes, the same
// fold (noise along the normal) and the same colour mapping (colour 1 → 2 across, colour 3 on the folds' height), lit
// the way its "3d" light lights it (flat, brightness × 0.8). Two changes: time walks a circle through 4D noise, so
// every video loops, and the grain is film grain drawn in the same pass (it also breaks up banding).
import { useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { GRAIN, NOISE4 } from "./glsl"
import { clock, vec, GRAIN_SEED } from "./clock"
import type { GradientSpec } from "./spec"

const VERT = /* glsl */ `
uniform float uPhase, uR, uDensity, uStrength, uFreq, uAmp, uTwist, uSphere, uLimit;
varying vec3 vPos;
varying vec3 vView;
${NOISE4}
mat3 rotY(float a) { float s = sin(a), c = cos(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
void main() {
  vec3 pos;
  if (uSphere > 0.5) {
    float d = 2.0 * loopNoise(normal * uDensity, uPhase, uR) * uStrength;
    pos = position + normal * d;
    pos = rotY(sin(uv.y * uFreq + uTwist) * uAmp) * pos;
  } else {
    // (ShaderGradient's classic noise runs wider than simplex), the fold eased off before it reaches the camera: past
    // that a plane folds through the lens and tears
    float d = 0.75 * 1.7 * loopNoise(0.43 * position * uDensity, uPhase, uR) * uStrength;
    pos = position + normal * uLimit * tanh(d / uLimit);
  }
  vPos = pos;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

const FRAG = /* glsl */ `
uniform vec3 uC1, uC2, uC3;
uniform float uBright, uLight, uGrain, uSeed, uPx, uSphere;
varying vec3 vPos;
varying vec3 vView;
${GRAIN}
void main() {
  vec3 col = uSphere > 0.5
    ? mix(uC3, mix(uC2, uC1, smoothstep(-1.0, 1.0, vPos.y)), length(vPos))
    : mix(mix(uC1, uC2, smoothstep(-3.0, 3.0, vPos.x)), uC3, vPos.z);
  col *= uBright * 0.8;
  if (uLight > 0.0) {
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    vec3 l = normalize(vec3(-0.45, 0.7, 0.55));
    vec3 v = normalize(vView);
    float diff = clamp(dot(n, l), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-l, n), v), 0.0, 1.0), 28.0);
    float rim = pow(1.0 - abs(dot(n, v)), 3.0);
    col = mix(col, col * (0.5 + 0.65 * diff) + vec3(spec * 0.22 + rim * 0.12), uLight);
  }
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(clamp(grain(col, gl_FragCoord.xy / uPx, uGrain, uSeed), 0.0, 1.0), 1.0);
}`

const D = Math.PI / 180

export function Gradient({ s }: { s: GradientSpec }) {
  const camera = useThree((x) => x.camera) as THREE.PerspectiveCamera
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        uniforms: {
          ...Object.fromEntries(["uPhase", "uR", "uDensity", "uStrength", "uFreq", "uAmp", "uTwist", "uSphere", "uLimit", "uBright", "uLight", "uGrain", "uSeed", "uPx"].map((k) => [k, { value: 0 }])),
          ...Object.fromEntries(["uC1", "uC2", "uC3"].map((k) => [k, { value: new THREE.Vector3() }])),
        },
      }),
    [],
  )
  const geometry = useMemo(
    () => (s.mesh === "sphere" ? new THREE.IcosahedronGeometry(1, 64) : s.mesh === "water" ? new THREE.PlaneGeometry(10, 10, 192, 192) : new THREE.PlaneGeometry(10, 10, 1, 192)),
    [s.mesh],
  )
  useFrame(() => {
    const u = material.uniforms
    // the loop's radius through the noise: one lap is as long as `speed` would travel in a straight line
    u.uPhase.value = clock.phase
    u.uR.value = (1.7 * s.speed * s.duration) / (2 * Math.PI)
    u.uTwist.value = clock.phase * 2 * Math.PI * Math.max(1, Math.round((s.speed * s.duration) / (2 * Math.PI)))
    u.uDensity.value = s.density
    u.uStrength.value = s.strength
    u.uFreq.value = s.frequency
    u.uAmp.value = s.amplitude
    u.uSphere.value = s.mesh === "sphere" ? 1 : 0
    u.uLimit.value = Math.max(0.5, s.cam.dist * 0.55)
    u.uBright.value = s.brightness
    u.uLight.value = s.light
    u.uGrain.value = s.grain
    u.uSeed.value = GRAIN_SEED
    u.uPx.value = clock.px
    u.uC1.value.copy(vec(s.colors[0]))
    u.uC2.value.copy(vec(s.colors[1]))
    u.uC3.value.copy(vec(s.colors[2]))
    // ShaderGradient's camera: round the middle, a sphere seen from 14 through a long lens (its zoom)
    const sph = new THREE.Spherical(s.cam.dist, s.cam.polar * D, (s.cam.az + s.orbit * Math.sin(clock.phase * 2 * Math.PI)) * D).makeSafe()
    camera.position.setFromSpherical(sph)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    camera.fov = 45
    camera.zoom = s.cam.zoom
    camera.near = 0.1
    camera.far = 100
    camera.updateProjectionMatrix()
  })
  return <mesh geometry={geometry} material={material} position={s.pos} rotation={[s.rot[0] * D, s.rot[1] * D, s.rot[2] * D]} frustumCulled={false} />
}
