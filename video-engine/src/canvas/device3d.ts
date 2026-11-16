// Canvas — the real devices: the Studio's own models (studio/devices3d.ts, lit by studio/scene.ts's photography set),
// for a canvas's device layers. canvas.js loads this once a page has a device (it's built as /canvas-3d.js; in
// development the dev server hands over this file), mounts one per device layer and puts the layer's live screen (or
// its picture) on the glass. Until it has loaded, or where there's no WebGL, the runtime's own drawn device stands in.
import { FINISHES } from "../studio/finishes"
import { BASE, type Pose } from "../studio/poses"
import { StudioScene } from "../studio/scene"

type Opts = {
  device: "iphone" | "ipad" | "macbook" | "duo"
  open?: boolean
  /** the band's and the back's colours, or a case's one colour over both */
  finish?: { metal: string; back: string }
  case?: string
  scheme: "light" | "dark"
}
const HEX = /^#[0-9a-f]{6}$/i

/** One device in `host` (it fills it): its screen goes in `slot`, at the device's own points. */
export function mountDevice(host: HTMLElement, o: Opts) {
  const scene = new StudioScene(host)
  const f0 = FINISHES[o.device][0]
  const finish =
    o.case && HEX.test(o.case)
      ? { ...f0, id: `case:${o.case}`, metal: o.case, back: o.case, rough: 0.62, case: true }
      : o.finish && HEX.test(o.finish.metal) && HEX.test(o.finish.back)
        ? (FINISHES[o.device].find((f) => f.metal === o.finish!.metal && f.back === o.finish!.back) ?? { ...f0, id: `own:${o.finish.metal}${o.finish.back}`, metal: o.finish.metal, back: o.finish.back })
        : f0
  scene.setDevices([{ key: "d", id: o.device, posture: o.device === "duo" && !o.open ? "folded" : "open", landscape: false, finish, screenBg: o.scheme === "dark" ? "#000000" : "#ffffff", slot: "center" }])
  // the layer draws its own shadow round the device's outline, so the floor's stays off
  scene.setLook({ shadow: false, reflections: 1, light: "studio" })
  const slot = scene.slotOf("d")
  // straight on, the camera a touch above, the device filling its box
  let pose: Pose = { ...BASE, elev: 4, lift: 0, zoom: 1.16 }
  let size = { w: 0, h: 0 }
  const draw = () => size.w > 0 && scene.render()
  return {
    slot,
    /** turned: tilted back `rx` and round `ry` (degrees), seen from `lens` box-lengths away */
    turn(rx: number, ry: number, lens: number) {
      const fov = (2 * Math.atan(1 / (2 * Math.max(1.4, lens))) * 180) / Math.PI
      pose = { ...pose, pitch: -rx, yaw: ry, fov }
      scene.setPose(pose)
      draw()
    },
    resize(w: number, h: number) {
      size = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) }
      scene.resize(size.w, size.h, Math.min(2, devicePixelRatio || 1))
      scene.setPose(pose)
      draw()
    },
    destroy() {
      scene.dispose()
    },
  }
}
