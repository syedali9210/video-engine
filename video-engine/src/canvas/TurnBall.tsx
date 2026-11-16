// Canvas — the ball that turns a device in 3D, the way a 3D tool's rotate gizmo does. Each ring turns it about one
// axis (X tilts it back, Y turns it, the outer Z rolls it), dragging inside turns it freely, and a small device in the
// middle shows which way it faces. The Canvas reads the drags off `data-handle="orbit"` and `data-axis`.
import type { CSSProperties } from "react"

export type Axis = "free" | "x" | "y" | "z"
/** The axis colours every 3D tool uses: X red, Y green, Z blue. */
export const AXIS_COLOR = { x: "#e5484d", y: "#30a46c", z: "#0090ff" } as const

const R = 34

export function TurnBall({ rx, ry, rz, active, style }: { rx: number; ry: number; rz: number; active: Axis | null; style: CSSProperties }) {
  const ring = (axis: "x" | "y" | "z") => {
    const shape = axis === "z" ? { rx: R, ry: R } : axis === "y" ? { rx: R, ry: 11 } : { rx: 11, ry: R }
    const on = active === axis
    return (
      <g key={axis} className="group/ring">
        <ellipse {...shape} fill="none" stroke={AXIS_COLOR[axis]} strokeWidth={on ? 2.5 : 1.5} opacity={active && !on ? 0.3 : 0.9} className="transition-[stroke-width] duration-100 group-hover/ring:[stroke-width:2.5]" />
        {/* a wide, invisible stroke to grab it by */}
        <ellipse {...shape} fill="none" stroke="transparent" strokeWidth={13} pointerEvents="stroke" data-handle="orbit" data-axis={axis} style={{ cursor: axis === "z" ? "alias" : axis === "y" ? "ew-resize" : "ns-resize" }} />
      </g>
    )
  }
  return (
    <div data-ball className="absolute h-[84px] w-[84px] rounded-full bg-surface/90 shadow-[0_0_0_1px_var(--line),var(--sh-md)] backdrop-blur" style={style}>
      <svg viewBox="-42 -42 84 84" className="absolute inset-0 h-full w-full overflow-visible">
        {/* inside the rings: a free turn */}
        <circle r={R - 6} fill="transparent" pointerEvents="fill" data-handle="orbit" data-axis="free" style={{ cursor: "grab" }} />
        {ring("z")}
        {ring("y")}
        {ring("x")}
        <text x={0} y={-R - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={AXIS_COLOR.x} className="pointer-events-none select-none">
          X
        </text>
        <text x={R + 4} y={3} fontSize={8} fontWeight={600} fill={AXIS_COLOR.y} className="pointer-events-none select-none">
          Y
        </text>
        <text x={R * 0.74} y={-R * 0.74} fontSize={8} fontWeight={600} fill={AXIS_COLOR.z} className="pointer-events-none select-none">
          Z
        </text>
      </svg>
      {/* the device, small, turned as it is */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[30px] w-[16px] -translate-x-1/2 -translate-y-1/2 [perspective:140px]">
        <div className="relative h-full w-full [transform-style:preserve-3d]" style={{ transform: `rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)` }}>
          <div className="absolute inset-0 rounded-[4px] bg-surface shadow-[inset_0_0_0_1.5px_var(--fg)] [backface-visibility:hidden]">
            <span className="absolute left-1/2 top-[3px] h-[2px] w-[6px] -translate-x-1/2 rounded-full bg-fg" />
          </div>
          <div className="absolute inset-0 rounded-[4px] bg-fg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="absolute left-[3px] top-[3px] h-[6px] w-[6px] rounded-[2px] bg-surface/70" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** While it turns: the angles about each axis, in their colours. */
export function TurnReadout({ rx, ry, rz, style }: { rx: number; ry: number; rz: number; style: CSSProperties }) {
  const v = (axis: "x" | "y" | "z", d: number) => (
    <span className="tabular-nums">
      <span style={{ color: AXIS_COLOR[axis] }}>{axis.toUpperCase()}</span> {Math.round(d)}°
    </span>
  )
  return (
    <div aria-live="polite" className="pointer-events-none absolute flex -translate-x-1/2 gap-2 whitespace-nowrap rounded-full bg-fg px-2.5 py-1 text-micro font-medium text-surface shadow-[var(--sh-md)]" style={style}>
      {v("x", rx)}
      {v("y", ry)}
      {v("z", rz)}
    </div>
  )
}
