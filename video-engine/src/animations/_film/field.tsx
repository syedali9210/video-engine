// A composed field drawn (src/studio/field.ts says what goes where): each shape a soft ellipse of its colour, its edge
// falling off on an eased curve so nothing bands, drifting a little and breathing, never wandering off its place.
// `shift` moves the whole field against the camera (parallax). `grain` is this scene's own, over the field only:
// a film never wears one grain all through.
import type { CSSProperties } from "react";
import type { Field } from "../../studio/field";

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .55 0"/></filter><rect width="220" height="220" filter="url(#n)"/></svg>')}")`;

/** a colour at a strength, from #rrggbb */
const rgba = (c: string, a: number) => {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
/** an ellipse of colour with a full core, falling off on an eased curve (a straight fall-off shows its rings) */
const FALL = [[0, 1], [0.25, 0.97], [0.42, 0.86], [0.56, 0.68], [0.68, 0.47], [0.79, 0.27], [0.89, 0.11], [0.96, 0.03], [1, 0]];
const soft = (c: string, a: number) => `radial-gradient(closest-side, ${FALL.map(([k, v]) => `${rgba(c, a * v)} ${Math.round(k * 100)}%`).join(", ")})`;

export function FieldView({ field, t, w = 1920, h = 1080, shift = { x: 0, y: 0 }, grain = 0, drift = 1, style }: { field: Field; t: number; w?: number; h?: number; shift?: { x: number; y: number }; grain?: number; drift?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: field.base, ...style }}>
      <div style={{ position: "absolute", left: -w * 0.08, top: -h * 0.08, width: w * 1.16, height: h * 1.16, transform: `translate3d(${shift.x}px, ${shift.y}px, 0)` }}>
        {field.blobs.map((b, i) => {
          // each shape drifts round its place, slowly and out of step with the others, and breathes
          const dx = Math.sin(t * 0.19 + i * 1.7) * 0.022 * drift;
          const dy = Math.cos(t * 0.16 + i * 2.3) * 0.018 * drift;
          const k = 1 + Math.sin(t * 0.23 + i) * 0.035 * drift;
          // (the layer reaches 8% past each edge, so it can shift without showing one)
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (b.x + dx + 0.08) * w - b.rx * w * k,
                top: (b.y + dy + 0.08) * h - b.ry * h * k,
                width: b.rx * 2 * w * k,
                height: b.ry * 2 * h * k,
                transform: `rotate(${b.rot + Math.sin(t * 0.11 + i) * 3 * drift}deg)`,
                background: soft(b.color, b.a),
              }}
            />
          );
        })}
      </div>
      {grain > 0 && <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: grain, mixBlendMode: "overlay" }} />}
    </div>
  );
}
