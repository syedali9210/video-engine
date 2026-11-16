// A tool window floating over the work: a title bar you can drag it by (the grip), its close, the tool's own preview
// and settings, and its actions along the foot. Not modal: the stage stays live beside it, so a knob turned shows on
// the work at once. Escape closes it. It opens where it's asked to and stays inside the window.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { DotsSixVertical, X } from "@phosphor-icons/react"
import { IconButton } from "./ui"

export function FloatingPanel({ open, title, onClose, children, footer, at = { right: 336, top: 64 }, width = 320 }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; /** where it first opens (px from the window's edges) */ at?: { right?: number; left?: number; top: number }; width?: number }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return setPos(null)
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", k)
    return () => removeEventListener("keydown", k)
  }, [open, onClose])
  if (!open) return null
  const x = pos?.x ?? (at.left ?? innerWidth - (at.right ?? 0) - width)
  const y = pos?.y ?? at.top
  return (
    <section ref={box} aria-label={title} className="float-in panel fixed z-[65] flex max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-[18px] shadow-[var(--sh-panel),0_28px_70px_-24px_rgb(0_0_0/0.6)]" style={{ left: Math.max(8, Math.min(innerWidth - width - 8, x)), top: Math.max(8, Math.min(innerHeight - 120, y)), width }}>
      <header
        className="flex h-11 shrink-0 cursor-grab touch-none select-none items-center gap-1.5 border-b pl-2 pr-1.5 active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return
          const r = box.current!.getBoundingClientRect()
          drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })}
        onPointerUp={() => (drag.current = null)}
      >
        <DotsSixVertical size={16} aria-hidden className="text-fg-3" />
        <h2 className="min-w-0 flex-1 truncate text-body font-semibold">{title}</h2>
        <IconButton size="sm" label="Close" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
      {footer && <footer className="grid shrink-0 grid-cols-2 gap-2 border-t p-3">{footer}</footer>}
    </section>
  )
}
