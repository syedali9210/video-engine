// Flow film: a launch film with no cuts. The flow (src/studio/flow.ts: which scenes, how long, what's in them) is
// composed into a motion graph (src/studio/compose.ts: every element's keyframes, the camera, the grounds, chosen by
// rule for the product), and this draws the graph, generically: grounds blending, one camera over the world (smoothed,
// following a panel's growing edge where the graph says), every element at its state, blurred a little by its own
// speed (motion blur), the frame's edges softened where the graph asks for depth. One clock over the whole film.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compose } from "../../studio/compose";
import { alive, camAt, dofAt, followed, groundsAt, sample, tracks, type El, type Tracks, type View } from "../../studio/graph";
import type { Flow } from "../../studio/flow";
import { Stage, useClock, useFonts } from "../_film/kit";
import { Bands, target, usePanel, zooms, type PanelState } from "../film-unfold/view";
import { params as unfoldDefaults } from "../film-unfold/params";
import { DEMO } from "./demo";
import { ElView, GroundView, H0, W0, buildClock, panelParams } from "./elements";
import { params as defaults, type Params } from "./params";

/** a panel's measuring (the product's own panel is fetched and laid out off the frame), told to the film */
function PanelProbe({ e, accent, onState }: { e: El; accent: string; onState: (id: string, s: PanelState) => void }) {
  const p = useMemo(() => panelParams(e.c, accent, unfoldDefaults), [e.c, accent]);
  const P = usePanel(p);
  useEffect(() => onState(e.id, P), [P.G, P.html, P.captured]); // eslint-disable-line react-hooks/exhaustive-deps
  return P.probe;
}

export default function FlowFilm({ p = defaults }: { p?: Params }) {
  useFonts();
  const flow = useMemo<Flow>(() => {
    try {
      return p.spec ? (JSON.parse(p.spec) as Flow) : DEMO;
    } catch {
      return DEMO;
    }
  }, [p.spec]);
  const g = useMemo(() => compose(flow), [flow]);
  const t = useClock(g.dur);
  const tr = useMemo(() => new Map<string, Tracks>(g.els.map((e) => [e.id, tracks(e)])), [g]);
  const [panels, setPanels] = useState<Record<string, PanelState>>({});
  const onState = useCallback((id: string, s: PanelState) => setPanels((x) => ({ ...x, [id]: s })), []);
  const panelEls = useMemo(() => g.els.filter((e) => e.kind === "panel"), [g]);
  const pp = useMemo(() => Object.fromEntries(panelEls.map((e) => [e.id, panelParams(e.c, g.accent, unfoldDefaults)])), [panelEls, g.accent]);

  // where the camera looks while it follows a panel: the unfold's own framing of it (its growing edge), placed where
  // the panel is in the world
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const focus = useCallback(
    (id: string, at: number): View | null => {
      const P = panelsRef.current[id];
      const k0 = tr.get(id);
      if (!P || !k0) return null;
      const s = sample(k0, at);
      const G = P.G;
      const [x, y, z] = target(G, zooms(G), buildClock(s.build));
      const k = s.w / G.pill.h;
      return { x: s.x + (x - (G.pill.left + G.pill.h / 2)) * k, y: s.y + (y - (G.pill.top + G.pill.h / 2)) * k, z: z / k, rx: 0, ry: 0, rz: 0 };
    },
    [tr],
  );
  const v = camAt(g.cam, t, focus, g.lag);
  const v0 = camAt(g.cam, Math.max(0, t - 1 / 60), focus, g.lag);
  const world = `translate(${W0 / 2}px, ${H0 / 2}px) rotateZ(${v.rz}deg) rotateX(${v.rx}deg) rotateY(${v.ry}deg) scale(${v.z}) translate(${-v.x}px, ${-v.y}px)`;
  const shift = { x: -(v.x - W0 / 2) * 0.06 * v.z, y: -(v.y - H0 / 2) * 0.06 * v.z };
  const live = alive(g, t);
  // motion blur: how far an element moved on screen since the frame before (a little, only when it's fast). What the
  // camera follows is what the eye tracks: only its own moves blur it, never the camera's (a pan keeps its subject sharp)
  const tracked = followed(g.cam, t);
  const mbOf = (e: El) => {
    const k = tr.get(e.id)!;
    const a = sample(k, t);
    const b = sample(k, Math.max(0, t - 1 / 60));
    // (a component being built is what the camera is on all through its scene: tracked too)
    const own = e.id === tracked || e.kind === "assembly";
    // (what's the camera's own move counts for a third: a camera easing between framings shouldn't smear what it
    // shows; a thing that moves itself blurs by its whole speed)
    const ox = (a.x - b.x) * v.z;
    const oy = (a.y - b.y) * v.z;
    const sx = own ? ox : ox + ((a.x - v.x) * v.z - (b.x - v0.x) * v0.z - ox) * 0.35;
    const sy = own ? oy : oy + ((a.y - v.y) * v.z - (b.y - v0.y) * v0.z - oy) * 0.35;
    const ds = own ? Math.abs(a.w - b.w) * v.z : Math.abs(a.w - b.w) * v.z + Math.abs(a.w * v.z - b.w * v0.z - (a.w - b.w) * v.z) * 0.35;
    return Math.min(5, Math.max(0, (Math.hypot(sx, sy) + ds * 0.5 - 6) * 0.12));
  };
  return (
    <Stage background="#000">
      {groundsAt(g.grounds, t).map(({ g: gr, k }, i) => (
        <div key={`g${i}-${JSON.stringify(gr)}`} style={{ position: "absolute", inset: 0, opacity: k }}>
          <GroundView g={gr} t={t} accent={g.accent} shift={shift} cam={v} />
        </div>
      ))}
      {panelEls.map((e) => (
        <PanelProbe key={e.id} e={e} accent={g.accent} onState={onState} />
      ))}
      <div style={{ position: "absolute", inset: 0, perspective: 2200, perspectiveOrigin: "50% 50%" }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: world }}>
          {live
            .filter((e) => !e.screen)
            .map((e) => (
              <ElView key={e.id} e={e} p={sample(tr.get(e.id)!, t)} t={t} mb={mbOf(e)} accent={g.accent} panel={panels[e.id]} panelP={pp[e.id]} zHand={v.z} />
            ))}
        </div>
      </div>
      <Bands k={dofAt(g.dof, t)} />
    </Stage>
  );
}
