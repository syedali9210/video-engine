// A satin field drawn (src/studio/field.ts `satinField` says in what colours and where): the material of the reference
// picture, a satin weave. A slow height field folds it; the brand's colours lie on it the way a composed field lays
// them (a mass, a glow, a light, a deep corner); a sheen runs across the folds where they face the light, moving
// slowly; and fine diagonal threads, each a little uneven, show most where the sheen catches them. One fragment shader,
// a pure function of the clock (frame-exact for export), moving against the camera (its shift, roll and zoom).
import { useLayoutEffect, useRef } from "react";
import type { Satin } from "../../studio/field";

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uT, uSeed, uPitch, uAngle, uSheen, uRoll, uZoom, uScale;
uniform vec2 uShift, uAt, uLit;
uniform vec3 uDeep, uMass, uGlow, uLight, uSheenC;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.3) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float smooth3(vec2 p) {
  float a = 0.55, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 1.9 + vec2(3.1, 7.7); a *= 0.45; }
  return s;
}
// the folds: broad and slow, as cloth lies (a smooth height field, gently warped)
float folds(vec2 w) { return smooth3(w + 0.5 * smooth3(w * 0.7 + vec2(uT * 0.03, -uT * 0.02))); }
void main() {
  // frame px at 1080p (y down), seen through the camera: its roll and zoom about the middle, its shift
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) * uScale;
  vec2 c = vec2(960.0, 540.0);
  vec2 q = px - c;
  float cr = cos(uRoll), sr = sin(uRoll);
  q = mat2(cr, -sr, sr, cr) * q / uZoom + c - uShift;
  vec2 uv = q / 1080.0;
  vec2 w = uv * 1.25 + vec2(uT * 0.035, -uT * 0.025);
  float h = folds(w);
  // where it lies: the mass and the light, pushed about a little by the folds
  vec2 asp = vec2(1920.0 / 1080.0, 1.0);
  float dA = length((uv - uAt * asp) * vec2(0.85, 1.0)) + (h - 0.5) * 0.45;
  float dB = length(uv - uLit * asp) + (h - 0.5) * 0.4;
  vec3 col = mix(uLight, uGlow, smoothstep(0.05, 0.85, dB));
  col = mix(col, uMass, smoothstep(0.95, 0.15, dA));
  col = mix(col, uDeep, smoothstep(0.7, 1.5, dA * 0.75 + (1.0 - min(dB, 1.0)) * 0.35) * 0.6);
  // the folds lit: their slope (a wide step, so it's smooth) tilts the cloth to a light that wanders slowly; satin
  // throws a long soft sheen where a fold faces it, and shades where it turns away
  float e = 0.025;
  vec2 g = vec2(folds(w + vec2(e, 0.0)) - folds(w - vec2(e, 0.0)), folds(w + vec2(0.0, e)) - folds(w - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-g * 0.55, 1.0));
  vec3 L = normalize(vec3(0.45 * cos(uT * 0.11), -0.4 + 0.15 * sin(uT * 0.09), 0.8));
  float face = clamp(dot(n, L), 0.0, 1.0);
  float sheen = pow(face, 14.0);
  col *= mix(0.84, 1.04, smoothstep(0.55, 0.98, face));
  col = mix(col, uSheenC, sheen * uSheen);
  // the weave: fine threads across the diagonal, each a little uneven, showing most where the light catches them
  float a = radians(uAngle);
  vec2 dir = vec2(cos(a), sin(a));
  float across = dot(q, vec2(-dir.y, dir.x));
  float thread = 0.5 + 0.5 * sin(across * 6.2831853 / uPitch);
  float uneven = noise(vec2(across / uPitch, dot(q, dir) * 0.012));
  float weave = mix(0.87, 1.08, thread) * mix(0.94, 1.05, uneven);
  col *= mix(1.0, weave, 0.5 + 0.5 * sheen);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function SatinView({ s, t, cam, shift }: { s: Satin; t: number; cam?: { z?: number; rz?: number }; shift?: { x: number; y: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{ g: WebGLRenderingContext; prog: WebGLProgram } | null>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || gl.current) return;
    const g = cv.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
    if (!g) return;
    const sh = (type: number, src: string) => {
      const o = g.createShader(type)!;
      g.shaderSource(o, src);
      g.compileShader(o);
      return o;
    };
    const prog = g.createProgram()!;
    g.attachShader(prog, sh(g.VERTEX_SHADER, VERT));
    g.attachShader(prog, sh(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(prog);
    g.useProgram(prog);
    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, "p");
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    gl.current = { g, prog };
  }, []);
  // every frame: drawn for t
  useLayoutEffect(() => {
    const c = gl.current;
    const cv = ref.current;
    if (!c || !cv) return;
    const { g, prog } = c;
    const u = (n: string) => g.getUniformLocation(prog, n);
    g.viewport(0, 0, cv.width, cv.height);
    g.uniform2f(u("uRes"), cv.width, cv.height);
    g.uniform1f(u("uScale"), 1920 / cv.width);
    g.uniform1f(u("uT"), t);
    g.uniform1f(u("uSeed"), s.seed);
    g.uniform1f(u("uPitch"), s.pitch);
    g.uniform1f(u("uAngle"), s.angle);
    g.uniform1f(u("uSheen"), s.sheenK);
    g.uniform1f(u("uRoll"), (((cam?.rz ?? 0) * 0.5) * Math.PI) / 180);
    g.uniform1f(u("uZoom"), 1 + ((cam?.z ?? 1) - 1) * 0.05);
    g.uniform2f(u("uShift"), shift?.x ?? 0, shift?.y ?? 0);
    g.uniform2f(u("uAt"), s.at[0], s.at[1]);
    g.uniform2f(u("uLit"), s.lit[0], s.lit[1]);
    g.uniform3fv(u("uDeep"), rgb(s.deep));
    g.uniform3fv(u("uMass"), rgb(s.mass));
    g.uniform3fv(u("uGlow"), rgb(s.glow));
    g.uniform3fv(u("uLight"), rgb(s.light));
    g.uniform3fv(u("uSheenC"), rgb(s.sheen));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  });
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
