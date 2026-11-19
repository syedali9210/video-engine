import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DialogHead } from "./Gloss";
import { ArrowArcLeft, ArrowArcRight, ArrowLeft, BookOpen, ChatCircle, ClockCounterClockwise, Package, PencilSimpleLine, CaretUp, CaretDown, Cube, FrameCorners, FilmSlate, FilmStrip, PaintBrush, Tray, Sparkle, ArrowsClockwise, DotsThree, Flask, DownloadSimple, ImageSquare, Keyboard, Question, CornersOut, CornersIn, Moon, PaintBucket, SidebarSimple, SlidersHorizontal, Stack, Sun, X, ListChecks, Microphone } from "@phosphor-icons/react";
import { ANIMS, byId, htmlUrl, withDefaults, type AnimMeta, type Values } from "./registry";
import { DEVICES, type Device, type DeviceId, type Posture } from "./devices";
import Inspector from "./Inspector";
import { Button, Dialog, IconButton, Kbd, MenuItem, Popover, Segmented, Sheet, Switch, Tip, useMedia } from "./ui";
import { FpsMeter } from "./studio/FpsMeter";
import { VoicePanel } from "./studio/VoicePanel";
import { Versions, keepHistory, keptHistory } from "./studio/Versions";
import { NoteEdit } from "./studio/NoteEdit";
import { lookLayer } from "./studio/story";
import { Checks, runCheck, type Fix } from "./studio/Checks";
import { fillSlots } from "./studio/product";
import { slotsFor } from "./studio/library";
import { FloatingPanel } from "./FloatingPanel";
import { LIBRARY, retimed } from "./studio/library";
import { reframe, type Focus } from "./studio/formats";
import FOCUS from "./studio/lib/focus.json";
import { ProductPage } from "./Product";
import { kitCopy, type ProductKit } from "./studio/product";
import { Back, BarBack, InBar, Sidebar, SPACES as PLACES, type Space } from "./shell";
import { RenderCard } from "./RenderCard";
import { Loading } from "./Thinking";
import { CreativesPage, FilmsPage } from "./Galleries";
import { barrelRoll, burstAt, rain, useKonami } from "./fun";
import { Home } from "./Home";
import { ReviewSheet } from "./studio/ReviewSheet";
import { Palette, type PaletteItem } from "./Palette";
import { OpenSettings } from "./States";
import { SPACES } from "./shell";
import { SIZES, type RenderConfig } from "./studio/config";
import { serverMedia, submitJob, useExport, type ExportKind } from "./studio/export";
import { brandFrom } from "./studio/brand";
import { BrandDialog, StudioExport, StudioInspector, inspectorIcon, inspectorTitle } from "./studio/Studio";
import { AnimPicker, BG, LayersPanel, TemplateDialog } from "./studio/Layers";
import { MatchVideo } from "./studio/MatchVideo";
import { SEEDS } from "./studio/lab/seeds";
import { compileScript, scriptTemplate, toScript, validateScript, type ScriptShot, type TemplateScript } from "./studio/script";
import { KitPanel, glowPaints, kitTitle } from "./studio/Kit";
import { CATEGORIES, type KitItem } from "./refs";
import { useScreenAccents } from "./studio/looks";
import { SceneIdeas } from "./studio/Ideas";
import { LabDialog, LabNotice, useLab } from "./studio/Lab";
import { ArtistDialog } from "./studio/ArtistDialog";
import { direct as directFilm, rankDirections, type Brief } from "./studio/artist";
import type { LabFilms } from "./studio/NewFilms";
import { WEB_DEFAULTS, pack, type WebFilm, type WebOpts } from "./studio/web";
import { InteractivePanel } from "./studio/Interactive";
import { CanvasWorkspace, productCanvas } from "./canvas/Canvas";
import { bake, type CanvasDoc } from "./canvas/doc";
import { addDevice, breakdown, callout, component as newComponent, cursor as newCursor, defaultComp, devicesOf, scene as newScene, shape as newShape, starts, text as newText, total, uid, type Comp, type ComponentLayer, type Layer as CompLayer, type Template, TEMPLATES, SAMPLE_COPY } from "./studio/comp";
import { newPaint } from "./studio/paint";
import type { AddKind } from "./studio/Layers";
import { copyFor, type Copy } from "./studio/copy";
import { isDark } from "./studio/look";
import { direct } from "./studio/director";
import type { Sel } from "./studio/Stage";
import type { FrameSpec, Resolve, ScreenSpec } from "./studio/view";

// the 3D stage brings three.js, so it loads the first time the studio opens
const StudioStage = lazy(() => import("./studio/Stage"));

const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem("anim-engine:" + k);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem("anim-engine:" + k, JSON.stringify(v));
    } catch {
      /* private mode: edits just don't persist */
    }
  },
};

type View = DeviceId | "compare";

/** What the engine can be asked from outside (window.__engine): by the MCP server (mcp/server.mjs) and scripted checks. */
type FilmBrief = {
  /** a template script's id (the gallery's films); the light product film by default */
  template?: string;
  /** the product's words: name, tagline, features, call to action… (the rest is made from them) */
  copy?: Partial<Copy>;
  /** the product's design system as text (CSS, a Tailwind config, tokens, a page's HTML): its colours and type */
  design?: string;
  /** pictures of the product's own screens (addresses on the engine's server), on the devices shot by shot */
  images?: string[];
  /** or a library screen for the devices */
  screen?: string;
  device?: DeviceId;
  size?: string;
  fps?: 30 | 60;
  /** the Artist directs it (artist.ts) instead of a template: the kind of film, an art direction (or "auto"), how long */
  artist?: { category?: string; style?: string; length?: "short" | "standard" | "long" };
};
type CanvasBrief = { name?: string; kicker?: string; tagline?: string; screen?: string; picture?: string; origin?: string };
type EngineApi = {
  templates: () => { id: string; name: string; summary: string; shots: number; seconds: number }[];
  film: (o: FilmBrief) => Promise<{ template: string; name: string; scenes: number; seconds: number }>;
  /** hands the film in the Studio to the renderer: the job's id (GET /__studio/jobs/:id, then /file) */
  render: (kind?: ExportKind) => Promise<string>;
  canvas: (o: CanvasBrief) => Promise<{ doc: CanvasDoc; z: string }>;
};
type PhoneSheet = "layers" | "edit" | "export";
const fromHash = () => decodeURIComponent(location.hash.slice(1));
const DEFAULT_ANIM = byId("maze-walk")?.id ?? ANIMS[0].id;

// On a dev machine each device gets its own site (iphone.localhost, duo.localhost, …), so Chrome runs it in its own
// process: one device's main-thread work isn't measured on top of another's. Layers of a built screen share their
// device's site, so they share a main thread the way one app's views do. Frame ids are "device" or "device~layer".
const isolate = location.hostname === "localhost";
const frameOrigin = (fid: string) => {
  const device = fid.split("~")[0];
  return isolate ? `${location.protocol}//${device}.localhost:${location.port}` : location.origin;
};
const SCREEN_BG = (dark: boolean) => (dark ? "#09090b" : "#fafafa");
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const SHORTCUTS: [string, string[]][] = [
  ["Search from anywhere", [MOD, "K"]],
  ["Light / dark theme", ["T"]],
  ["Studio: undo / redo", [MOD, "Z", "/", MOD, "Shift", "Z"]],
  ["Studio: copy, cut, paste (a layer or a scene; a picture from the clipboard)", [MOD, "C", "X", "V"]],
  ["Studio: duplicate / delete what's picked", [MOD, "D", "/", "Del"]],
  ["Studio, a part of a film: nudge it / hide it", ["←", "→", "↑", "↓", "/", "Del"]],
  ["Show shortcuts", ["?"]],
];

/** The studio's composition, kept between visits (a first visit starts from the old single-shot settings, if any). */
const loadComp = (): Comp => {
  const c = store.get<Comp | null>("comp", null);
  // layers whose animation is gone, or of a kind this engine no longer draws, are dropped
  const kinds = ["device", "component", "image", "text", "breakdown", "callout", "shape", "cursor"];
  if (c?.v === 2 && c.scenes?.length)
    return { ...c, scenes: c.scenes.map((s) => ({ ...s, layers: s.layers.filter((l) => kinds.includes(l.kind) && (!("anim" in l) || byId(l.anim))) })) };
  const v = store.get<string>("view", "iphone");
  const old = store.get<{ size?: string; fps?: 30 | 60; backdrop?: string; shadow?: boolean; reflections?: number }>("shot", {});
  const base = defaultComp(v === "compare" ? "iphone" : (v as DeviceId), store.get<Posture>("posture", "open"));
  const phone = matchMedia("(max-width: 767.98px) and (orientation: portrait)").matches;
  return { ...base, size: old.size ?? (phone ? "9x16" : base.size), fps: old.fps ?? base.fps, fill: old.backdrop ?? base.fill, shadow: old.shadow ?? base.shadow, reflections: old.reflections ?? base.reflections };
};

/** The Lab (template ideas, new films, studied films, the AI's settings and keys) is for this machine: the dev server
    runs its routes and holds the keys. A build for the web has none of it. */
const LAB = import.meta.env.DEV;

export default function App() {
  // #id in the URL picks the animation, so a link opens straight to it
  // the product open by default: the maze walk, light enough to run live beside everything else. The first load after
  // the change opens it once, over the old pick (the WebGL coin) kept in the address or storage; picks stick after that
  const [id, setId] = useState(() => {
    if (!store.get("lightDefault", false)) {
      store.set("lightDefault", true);
      return DEFAULT_ANIM;
    }
    return byId(fromHash())?.id ?? byId(store.get("last", ""))?.id ?? DEFAULT_ANIM;
  });
  const anim = byId(id)!;
  const [overrides, setOverrides] = useState<Record<string, Values>>(() => store.get("values", {}));
  const values = useMemo(() => withDefaults(anim, overrides[id]), [anim, overrides, id]);
  const [view] = useState<View>(() => store.get("view", "iphone"));
  const [posture] = useState<Posture>(() => store.get("posture", "open"));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [sheet, setSheet] = useState<PhoneSheet | null>(null); // phone: the panel pulled up over the stage
  const [help, setHelp] = useState(false);
  const [keys, setKeys] = useState(() => store.get("keys", true)); // WCAG 2.1.4: single-key shortcuts can be turned off
  const [said, say] = useState("");

  // the Studio's film on a site (from its Export): the embed's settings (its shape per width, how it plays), and the
  // film packed for the web player while they're open
  const [webOpts, setWebOpts] = useState<WebOpts>(() => ({ ...WEB_DEFAULTS, ...store.get<Partial<WebOpts>>("web", {}) }));
  useEffect(() => store.set("web", webOpts), [webOpts]);
  const [webFilm, setWebFilm] = useState<{ film: WebFilm; z: string } | null>(null);
  const [webOpen, setWebOpen] = useState(false);
  // Canvas: an interactive design for a site (devices with live screens, components, type, drawings), made a design
  // tool's way and exported as JSON and one small script. A workspace of its own, like the Studio.
  const [canvasOn, setCanvas] = useState(() => store.get("canvas", store.get<string>("mode", "") === "web"));
  useEffect(() => store.set("canvas", canvasOn), [canvasOn]);

  // Studio: a composition of scenes (devices in 3D with live screens, components, pictures, titles), exported as a
  // still or a video
  const [comp, setCompState] = useState<Comp>(loadComp);
  // its history: every change is a step back (a burst of them, typing or dragging a slider, one step), 100 deep; a
  // change the engine makes by itself (`quiet`: a component measuring itself) joins the step it belongs to
  const past = useRef<Comp[]>([]);
  const future = useRef<Comp[]>([]);
  const lastEdit = useRef(0);
  const setComp = useCallback(
    (fn: (c: Comp) => Comp, quiet = false) =>
      setCompState((c) => {
        const next = fn(c);
        if (next === c || quiet) return next;
        const now = performance.now();
        if ((now - lastEdit.current > 600 || !past.current.length) && past.current.at(-1) !== c) {
          past.current.push(c);
          if (past.current.length > 100) past.current.shift();
        }
        lastEdit.current = now;
        future.current = [];
        return next;
      }),
    [],
  );
  // each undo or redo (the stage lets go of a part of a film picked, which may have moved)
  const [jumps, setJumps] = useState(0);
  const travel = (from: { current: Comp[] }, to: { current: Comp[] }) => {
    const c = from.current.pop();
    if (!c) return;
    lastEdit.current = 0;
    setJumps((j) => j + 1);
    setCompState((now) => {
      if (to.current.at(-1) !== now) to.current.push(now);
      return c;
    });
  };
  const undoStep = () => travel(past, future);
  const redoStep = () => travel(future, past);
  // the history outlives a reload: kept a moment after each change, brought back for the composition it belongs to
  const restored = useRef(false);
  useEffect(() => {
    if (!restored.current) {
      restored.current = true;
      void keptHistory(comp).then((h) => {
        if (!h || past.current.length) return;
        past.current = h.past;
        future.current = h.future;
        setJumps((j) => j + 1);
      });
      return;
    }
    keepHistory(comp, past.current, future.current);
  }, [comp]);
  const studioComp = comp;
  const [cselState, setCsel] = useState<Sel>({ scene: "" });
  // the pick, always one that exists: a deleted scene falls back to the first
  const csel: Sel = comp.scenes.some((s) => s.id === cselState.scene) ? cselState : { scene: comp.scenes[0].id, layer: cselState.layer === BG ? BG : undefined };
  const cscene = comp.scenes.find((s) => s.id === csel.scene)!;
  const [picker, setPicker] = useState<{ title: string; then: (id: string) => void } | null>(null);
  const [templates, setTemplates] = useState(false);
  const [artistOpen, setArtistOpen] = useState(false);
  // on a "two framings" scene, which framing the stage sets
  const [framing, setFraming] = useState<"start" | "end">("start");
  const [matching, setMatching] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  // template scripts: the seeds, and what the template lab's admin approved (newer versions replace the seeds)
  const lab = useLab();
  const [labOpen, setLabOpen] = useState(false);
  // the lab opened at a tab (the kit's "References")
  const [labTab, setLabTab] = useState<string | undefined>();
  const openLab = (tab?: string) => {
    if (!LAB) return;
    setLabTab(tab);
    // on a desktop the lab is a place of its own; on a phone or an upright tablet, a sheet over the work
    if (rail) setSpace("lab");
    else setLabOpen(true);
  };
  // where you are: a page (Home, the Library, Films, Creatives, the Lab) or at work in an editor (the Studio and Canvas
  // flags say which: the film editor, the canvas, or a component in its devices)
  const [space, setSpace] = useState<Space | "work">(() => {
    const s = store.get<string>("space", "home");
    return (SPACES.some((x) => x.id === s) || s === "work" ? s : "home") as Space | "work";
  });
  useEffect(() => store.set("space", space), [space]);
  // the products opened lately, newest first: the product menu's way to switch back
  const [recentAnims, setRecentAnims] = useState<string[]>(() => store.get("recentAnims", []));
  useEffect(() => {
    setRecentAnims((r) => {
      const next = [id, ...r.filter((x) => x !== id)].slice(0, 8);
      store.set("recentAnims", next);
      return next;
    });
  }, [id]);
  // a party: five quick clicks on the mark, the Konami code, or the palette's secret
  const [dance, setDance] = useState(0);
  const party = useCallback(() => {
    setDance((d) => d + 1);
    rain(1900);
    say("Party mode. You found it.");
  }, []);
  useKonami(party);
  // the command palette (Ctrl K): open, with what was typed
  const [palette, setPalette] = useState<{ q: string } | null>(null);
  const railRef = useRef(false);
  // the review sheet: what's waiting for a verdict, over whatever is open
  const [reviewOpen, setReviewOpen] = useState(false);
  // Create opened at a kind from Home (taken once by the Canvas)
  const [createKind, setCreateKind] = useState<string | null>(null);
  // tips: the sentences that say how a control works, off until asked for
  const [tips, setTips] = useState(() => store.get("tips", false));
  useEffect(() => {
    document.documentElement.classList.toggle("tips", tips);
    store.set("tips", tips);
  }, [tips]);
  // the lab's scripts: the app's own launch films (each written as a script of its shots, so the lab can check,
  // improve and learn from them), the seeds, and what the lab approved over them
  const filmScripts = useMemo(
    () =>
      TEMPLATES.filter((t) => t.film).flatMap((t) => {
        try {
          const c = t.make({ device: "iphone", posture: "open", name: "Product", anim: ANIMS[0].id, copy: SAMPLE_COPY });
          return [{ ...toScript(c, { id: t.id, name: t.name, source: "a launch film template (replicated from a reference)", summary: t.hint }), ...(t.category ? { category: t.category } : {}) }];
        } catch {
          return [];
        }
      }),
    [],
  );
  const scripts = useMemo(() => {
    const byId = new Map([...filmScripts, ...SEEDS].map((s) => [s.id, s]));
    for (const s of lab.approved) if (!byId.has(s.id) || byId.get(s.id)!.version <= s.version) byId.set(s.id, s);
    return [...byId.values()];
  }, [lab.approved, filmScripts]);
  // the server's nightly run sees them too (it improves the weakest and keeps its ideas off them)
  useEffect(() => {
    if (!LAB) return;
    void fetch("/__lab/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scripts: filmScripts }) }).catch(() => {});
  }, [filmScripts]);
  const [undo, setUndo] = useState<{ label: string; run: () => void } | null>(null);
  // the copy writer's lines for what's open, and the brand dialog
  const [copy, setCopy] = useState<Copy | null>(null);
  const [writing, setWriting] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  // the move previews on its own unless the system asks for less motion
  // the Studio waits for Play
  const [playing, setPlaying] = useState(false);
  const exporter = useExport();

  // the phone layout is for portrait phones; landscape phones and short windows get the side panel, with tighter
  // margins; the library stays open beside the stage from iPad-landscape widths up
  const phone = useMedia("(max-width: 767.98px) and (orientation: portrait)");
  const short = useMedia("(max-height: 560px)");
  // a tablet held upright: the stage gets the full width, and a panel under it holds the properties or the library
  const tablet = useMedia("(min-width: 768px) and (max-width: 1119.98px) and (orientation: portrait)");
  const [panelOpen, setPanelOpen] = useState(() => store.get("panelOpen", true));
  // the Studio's layers panel: shown on a roomy window unless hidden, folded on a narrow one unless shown
  const roomy = useMedia("(min-width: 1280px)");
  const [leftPanel, setLeftPanel] = useState<boolean | null>(null);
  const studioLeft = leftPanel ?? roomy;
  // the sidebar: open or folded to its glyphs (null until you choose: then it follows the room and the place)
  const [sideCollapsed, setSideCollapsed] = useState<boolean | null>(() => store.get<boolean | null>("side", null));
  useEffect(() => {
    if (sideCollapsed != null) store.set("side", sideCollapsed);
  }, [sideCollapsed]);
  // focus: both side panels away, the stage as big as the window allows (Ctrl . toggles it)
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setFocus((f) => !f);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setSideCollapsed((c) => !(c ?? false));
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  // a desktop (or a tablet on its side) has the rail of places down the left; a phone and an upright tablet switch in their header
  const rail = !phone && !tablet;
  railRef.current = rail;

  useEffect(() => {
    store.set("last", id);
    history.replaceState(null, "", `#${id}`);
  }, [id]);
  useEffect(() => {
    const onHash = () => byId(fromHash()) && setId(fromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => store.set("values", overrides), [overrides]);
  useEffect(() => store.set("keys", keys), [keys]);
  useEffect(() => store.set("panelOpen", panelOpen), [panelOpen]);
  useEffect(() => {
    const t = setTimeout(() => store.set("comp", comp), 250);
    // a reload (the dev server's, after code is imported into a screen) keeps the last edit
    const now = () => store.set("comp", comp);
    addEventListener("pagehide", now);
    return () => {
      clearTimeout(t);
      removeEventListener("pagehide", now);
    };
  }, [comp]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 15000);
    return () => clearTimeout(t);
  }, [undo]);
  useEffect(() => {
    document.title = `${space === "work" ? (canvasOn ? "Canvas" : "Studio") : (SPACES.find((x) => x.id === space)?.name ?? "Home")} · Video Engine`;
  }, [canvasOn, space]);
  // a studio export says how it went even after its popover has closed
  const xs = exporter.state;
  useEffect(() => {
    if (xs.phase === "done") {
      // the render card says it; the first one done also ticks the guide's last step on Home
      store.set("exported", true);
      burstAt(document.querySelector(".render-card") ?? document.querySelector('[popovertarget="export-pop"]'), { count: 54 });
    }
  }, [xs]);
  // what a toast says stays a moment, then clears (the live region announces it once)
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => say(""), 2600);
    return () => clearTimeout(t);
  }, [said]);

  // the theme: light, dark, or the system's ("auto", also until someone picks), which follows the system as it changes
  const [themePick, setThemePick] = useState<"light" | "dark" | "auto">(() => {
    const v = store.get<boolean | null>("dark", null);
    return v == null ? "auto" : v ? "dark" : "light";
  });
  // the colours change at once, the way Linear and Vercel do it: a crossfade's two full-window snapshots cost 35–49 ms
  // frames on an integrated GPU, an instant change one 14–21 ms frame
  const showTheme = (next: boolean) => {
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };
  const pickTheme = (p: "light" | "dark" | "auto") => {
    store.set("dark", p === "auto" ? null : p === "dark");
    setThemePick(p);
    showTheme(p === "auto" ? matchMedia("(prefers-color-scheme: dark)").matches : p === "dark");
  };
  const flipTheme = () => pickTheme(dark ? "light" : "dark");
  useEffect(() => {
    if (themePick !== "auto") return;
    const m = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => showTheme(m.matches);
    m.addEventListener("change", follow);
    return () => m.removeEventListener("change", follow);
  }, [themePick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111113" : "#ffffff");
  }, [dark]);

  // at work, it's the film editor unless it's the canvas
  const studio = !canvasOn;
  // the device a template's film starts on
  const shown: DeviceId = view === "compare" ? "iphone" : view;

  /** Which component is your product's screen: what a film's devices show. */
  const openAnim = (aid: string) => setId(aid);

  /* ---------- keyboard ---------- */
  const env = useRef({ keys, studio, csel, canvas: canvasOn });
  env.current = { keys, studio, csel, canvas: canvasOn };
  // Ctrl K opens the command palette everywhere on a desktop (the canvas's own keys included)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!railRef.current || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPalette((p) => (p ? null : { q: "" }));
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the canvas has keys of its own
      if (env.current.canvas) return;
      const t = e.target instanceof Element ? e.target : null;
      const typing = t?.closest("input, textarea, select, [contenteditable]");
      // the Studio's history and copies (typing keeps the field's own undo)
      if (env.current.studio && (e.metaKey || e.ctrlKey) && !e.altKey && !typing && !t?.closest('dialog, [role="dialog"]')) {
        const k = e.key.toLowerCase();
        const op = k === "z" ? (e.shiftKey ? "redo" : "undo") : k === "y" ? "redo" : k === "d" ? "duplicatePicked" : "";
        if (op) {
          e.preventDefault();
          (studioOps.current[op as "undo"] as () => void)();
          return;
        }
        // copy, cut, paste: the clipboard's own events do it (and carry pictures); where a window doesn't send them,
        // the keys do it a moment later, from the engine's own clipboard
        if ((k === "c" || k === "x" || k === "v") && !window.getSelection()?.toString()) {
          const at = performance.now();
          setTimeout(() => {
            if (clipEventAt.current >= at) return;
            const o = studioOps.current;
            if (k === "v") return o.clip.current && o.pasteClip(o.clip.current);
            o.clip.current = o.picked();
            if (k === "x") o.removePicked();
            say(k === "x" ? "Cut: paste it where it goes" : "Copied: paste it where it goes");
          }, 80);
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      const s = env.current;
      // the studio's picked layer (or scene, with no layer picked): Delete removes it (Ctrl Z brings it back)
      if (s.studio && s.csel.layer !== BG && (e.key === "Delete" || e.key === "Backspace") && !t?.closest('[role="dialog"], dialog, [popover], [role="tablist"], [role="radiogroup"]')) {
        e.preventDefault();
        studioOps.current.removePicked();
        return;
      }
      if (!s.keys) return;
      const map: Record<string, () => void> = {
        t: flipTheme,
        "?": () => setHelp(true),
      };
      const fn = map[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [setComp]);

  // a picture dropped anywhere goes into the scene
  const [fileDrag, setFileDrag] = useState(false);
  useEffect(() => {
    const enter = (e: DragEvent) => env.current.studio && e.dataTransfer?.types.includes("Files") && setFileDrag(true);
    addEventListener("dragenter", enter);
    return () => removeEventListener("dragenter", enter);
  }, []);

  /* ---------------- phone sheet ---------------- */
  const [lastSheet, setLastSheet] = useState<PhoneSheet | null>(null);
  useEffect(() => {
    if (sheet) return setLastSheet(sheet);
    const t = setTimeout(() => setLastSheet(null), 260); // keep the content while it slides away
    return () => clearTimeout(t);
  }, [sheet]);
  const closeSheet = useCallback(() => setSheet(null), []);

  /* ---------- studio ---------- */
  const scheme = (on: boolean) => (on ? "dark" : "light") as "dark" | "light";
  const frameSpec = (a: AnimMeta, key: string, v: Values, d: Device | null, o: { box?: CSSProperties; bare: boolean; layer: boolean }, hairline: boolean, cs: "light" | "dark"): FrameSpec => ({
    key,
    path: a.html ? htmlUrl(a) : "/stage.html",
    query: { ...(a.html ? {} : { a: a.id }), ...(o.layer ? { layer: "1" } : {}), ...(d ? { dpr: String(d.dpr) } : {}) },
    values: v,
    box: o.box,
    bare: o.bare,
    hairline,
    scheme: cs,
  });
  /** What the composition's references mean right now: a "live" screen is whatever the engine has open. */
  const studioResolve: Resolve = {
    screen(content, d, key, hairline): ScreenSpec {
      if (content.kind === "image") return { frames: [], bg: "#000", image: content.src };
      if (content.kind === "anim") {
        const a = byId(content.id);
        return { frames: a ? [frameSpec(a, `${key}:${a.id}`, withDefaults(a, overrides[a.id]), d, { bare: false, layer: false }, hairline, scheme(dark))] : [], bg: SCREEN_BG(dark) };
      }
      // the product's screen, as it's tuned
      return { frames: [frameSpec(anim, `${key}:${d.id}`, values, d, { bare: false, layer: false }, hairline, scheme(dark))], bg: SCREEN_BG(dark) };
    },
    // a component on its own: no stand-in app around it, the composition's background behind it
    component: (aid, key, hairline, cs, own) => frameSpec(byId(aid)!, key, withDefaults(byId(aid)!, { ...overrides[aid], ...own }), null, { bare: true, layer: true }, hairline, cs),
    // a screen taken apart: held still (no demo scroll, so its components stay where they are), whole and reporting
    // its components, only its grounds, or only one component (the bridge does the cutting)
    part: (aid, key, which, hairline, cs) => {
      const a = byId(aid)!;
      const v = { ...withDefaults(a, overrides[aid]), ...("autoplay" in a.params ? { autoplay: false } : {}) };
      const f = frameSpec(a, key, v, null, { bare: false, layer: false }, hairline, cs);
      return { ...f, query: { ...f.query, ...(which === "full" ? { parts: "1" } : { part: String(which) }) } };
    },
    image: (src) => src,
    dark,
    stepped: false,
    origin: location.origin,
    frames: isolate ? frameOrigin("studio") : undefined,
  };
  const liveName = anim.name;
  // the open animation's own colours, read off its screen once: what templates' looks are matched to
  const accents = useScreenAccents(studio ? id : undefined);
  // new animation, new copy
  useEffect(() => setCopy(null), [id]);
  const getCopy = async () => {
    setWriting(true);
    try {
      const c = await copyFor(id, { layers: [], brand: comp.brand?.name });
      setCopy(c);
      return c;
    } finally {
      setWriting(false);
    }
  };

  const toWork = (to: "videos" | "creatives") => {
    setSpace("work");
    setCanvas(to === "creatives");
  };
  // your own work, found in plain words (server/search.ts): each opens where it lives
  const [productKey, setProductKey] = useState(0);
  const WORK = { kit: Package, version: ClockCounterClockwise, brief: PencilSimpleLine, proposal: Tray, reference: BookOpen, review: ChatCircle } as const;
  const searchWork = async (q: string): Promise<PaletteItem[]> => {
    const hits = (await fetch(`/__search?q=${encodeURIComponent(q)}`).then((r) => r.json(), () => [])) as { kind: keyof typeof WORK; id: string; title: string; sub: string; snippet: string }[];
    const open = async (h: (typeof hits)[number]) => {
      if (h.kind === "kit") {
        try {
          localStorage.setItem("anim-engine:kit", h.id); // kept raw: the Product page reads it as it is
        } catch {
          // a private window: the Product page opens on its first kit
        }
        setProductKey((k) => k + 1);
        setSpace("product");
      } else if (h.kind === "version") {
        const v = (await (await fetch(`/__versions/get?id=${h.id}`)).json()) as { comp: Comp; name: string };
        setComp(() => v.comp);
        setCsel({ scene: v.comp.scenes[0].id });
        toWork("videos");
        say(`Back to “${v.name}”`);
      } else if (h.kind === "review") window.open(`/review.html#${h.id}`, "_blank", "noopener");
      else openLab(h.kind === "brief" ? "briefs" : h.kind === "proposal" ? "inbox" : "references");
    };
    return Array.isArray(hits) ? hits.map((h) => ({ id: `w-${h.kind}-${h.id}`, group: "work" as const, found: true, title: h.title, sub: h.snippet ? `${h.sub} · ${h.snippet}` : h.sub, icon: WORK[h.kind], run: () => void open(h) })) : [];
  };
  /** The command palette's items: recent products, quick actions (with their keys), places, every product, every film. */
  const paletteItems = (): PaletteItem[] => {
    const thumb = (aid: string) => `/thumbs/${aid}-${dark ? "dark" : "light"}.webp`;
    const product = comp.brand?.name || anim.brand || anim.name;
    const waiting = (lab.state?.pending ?? 0) + (lab.state?.films ?? 0);
    // the templates are the films replicated from references and the device mockups (the lab's scripts drive the API)
    const films = TEMPLATES.filter((t) => t.category);
    return [
      ...recentAnims
        .slice(0, 4)
        .map((x) => byId(x))
        .filter((a): a is AnimMeta => !!a)
        .map((a) => ({ id: `r-${a.id}`, group: "recent" as const, title: a.name, sub: a.category, picture: thumb(a.id), run: () => (openAnim(a.id), say(`${a.name} is your films' screen now`)) })),
      { id: "a-film", group: "actions", title: "Direct a launch film", sub: `The Artist, from ${product}`, icon: PaintBrush, tone: "var(--k-motion)", run: () => (toWork("videos"), setArtistOpen(true)) },
      { id: "a-template", group: "actions", title: "Start a film from a template", sub: "Product launch, feature, demo, teaser…", icon: FilmSlate, tone: "var(--k-scene)", run: () => (toWork("videos"), setTemplates(true)) },
      { id: "a-creative", group: "actions", title: "Make a creative", sub: "A hero, a bento, a poster or a post", icon: FrameCorners, tone: "var(--k-image)", run: () => (setCreateKind(""), toWork("creatives")) },
      ...(LAB ? [{ id: "a-review", group: "actions" as const, title: "Review new films", sub: waiting ? `${waiting} waiting for a verdict` : "Have the Artist make four", icon: Tray, tone: "var(--k-component)", run: () => setReviewOpen(true) }] : []),
      { id: "a-theme", group: "actions", title: dark ? "Light theme" : "Dark theme", icon: dark ? Sun : Moon, kbd: "T", run: flipTheme },
      { id: "a-tips", group: "actions", title: tips ? "Hide tips" : "Show tips", icon: Question, run: () => setTips(!tips) },
      { id: "a-keys", group: "actions", title: "Keyboard shortcuts", icon: Keyboard, kbd: "?", run: () => setHelp(true) },
      { id: "s-party", group: "actions", secret: true, title: "Throw a party", sub: "You found a secret", icon: Sparkle, words: "party confetti celebrate fun", run: party },
      { id: "s-roll", group: "actions", secret: true, title: "Do a barrel roll", sub: "You found a secret", icon: ArrowsClockwise, words: "barrel roll spin flip", run: barrelRoll },
      ...SPACES.map((s) => ({ id: `p-${s.id}`, group: "places" as const, title: s.name, icon: s.icon, run: () => setSpace(s.id) })),
      ...ANIMS.filter((a) => a.category !== "Launch films").map((a) => ({ id: `c-${a.id}`, group: "products" as const, title: a.name, sub: a.category, picture: thumb(a.id), words: `${a.blurb} ${a.tech.join(" ")} ${a.brand ?? ""}`, run: () => (openAnim(a.id), say(`${a.name} is your films' screen now`)) })),
      ...films.map((t) => ({ id: `f-${t.id}`, group: "films" as const, title: t.name, sub: `${t.category ? (CATEGORIES.film.find((c) => c.id === t.category)?.name ?? "Film") : "Film"} · ${t.scenes} scenes`, icon: FilmStrip, run: () => (toWork("videos"), void applyTemplate(t)) })),
    ];
  };

  /** Everything the export's own page needs to draw the composition by itself. A still is the picked scene, settled,
      with its camera where it's set (no move), and its screens caught where their library card is. */
  const renderConfig = async (kind: ExportKind, comp: Comp = studioComp): Promise<RenderConfig> => {
    const screens: Record<string, ScreenSpec> = {};
    const components: Record<string, FrameSpec> = {};
    const looks = direct(comp);
    for (const [j, s] of comp.scenes.entries())
      for (const l of s.layers) {
        if (l.hidden) continue;
        const cs = scheme(isDark(looks[j].fill));
        if (l.kind === "device") {
          const sp = studioResolve.screen(l.content, DEVICES.find((d) => d.id === l.device)!, l.id, !!l.hairline);
          screens[l.id] = { ...sp, media: sp.media && { ...sp.media, url: await serverMedia(sp.media.url) } };
        } else if (l.kind === "component") components[`${s.id}:${l.id}`] = studioResolve.component(l.anim, `${s.id}:${l.id}`, !!l.hairline, cs, l.values);
        else if (l.kind === "breakdown")
          for (const w of ["full", "none", ...Array.from({ length: l.max }, (_, i) => i)] as const)
            components[`${s.id}:${l.id}:${w}`] = studioResolve.part(l.anim, `${s.id}:${l.id}:${w}`, w, l.lines, cs);
      }
    const still = kind === "png";
    const i = Math.max(0, comp.scenes.indexOf(cscene));
    const start = still ? starts(comp)[i] + Math.min(1.8, comp.scenes[i].duration * 0.6) : 0;
    return {
      comp: still ? { ...comp, scenes: comp.scenes.map((s) => ({ ...s, move: "still", arrival: "none" })) } : comp,
      dark,
      screens,
      components,
      start,
      duration: still ? 0 : total(comp),
      preroll: still ? Math.max(0, (anim.poster?.at ?? 1800) - start * 1000) : 0,
      transparent: comp.fill === "transparent",
    };
  };
  // the lab's New films: the Artist directs a batch from what's open (a different kind of film and art direction each,
  // your taste first), and each plays in the web player, drawn by the export's own renderer
  const labFilms: LabFilms = {
    product: comp.brand?.name || anim.brand || anim.name,
    copy: copy ? { ...copy, name: comp.brand?.name || copy.name } : undefined,
    make: async (n) => {
      const lines = copy ?? (await getCopy());
      const kinds = ["product-launch", "feature-launch", "product-demo", "teaser", "brand", "social"];
      const seed = Math.floor(Math.random() * 1e5);
      const brief: Brief = {
        category: "product-launch",
        accent: accents[0] ?? comp.brand?.accent ?? "#6d5dfc",
        copy: { ...lines, name: comp.brand?.name || lines.name },
        screens: Math.max(1, Math.min(3, anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout === "fill").length : 1)),
        components: anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout !== "fill").length : 0,
        componentNames: anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout !== "fill").map((a) => a.name) : [],
        seed,
        taste: lab.taste,
      };
      const used = new Set<string>();
      return Array.from({ length: n }, (_, i) => {
        const b = { ...brief, category: kinds[(seed + i) % kinds.length], seed: seed + i * 977 };
        // a different art direction for each, the ones your taste leans to first
        const ad = rankDirections(b).find((d) => !used.has(d.id)) ?? rankDirections(b)[0];
        used.add(ad.id);
        return directFilm(b, ad);
      });
    },
    check: async (film) => {
      // with the product kit the Product page has open (its words and screens in every film), else what's open
      let kit: ProductKit | null = null;
      try {
        const kid = localStorage.getItem("anim-engine:kit");
        kit = kid ? await (await fetch(`/__kit/get?id=${kid}`)).json() : null;
      } catch {
        kit = null;
      }
      const lines = kit ? kitCopy(kit) : (copy ?? (await getCopy()));
      const films = [...new Set(film.shots.map((x) => x.clip?.split("/")[0]).filter((x): x is string => !!x))];
      const values = kit ? Object.fromEntries(films.map((f) => [f, fillSlots(kit!, slotsFor(f)).values])) : undefined;
      const c = compileScript(film, { device: "iphone", posture, anim: id, copy: lines, brand: comp.brand, accent: kit?.brand.accent ?? accents[0] ?? comp.brand?.accent, values });
      const cfg = await renderConfig("video", { ...c, fps: comp.fps });
      const { report } = await runCheck(cfg, SIZES.find((x) => x.id === c.size) ?? SIZES[0], { critic: true });
      const gates = report.gates.map((g) => ({ name: g.name, pass: g.pass, findings: g.findings.filter((f) => f.level !== "info").length }));
      const critic = report.critic && "score" in report.critic ? { score: report.critic.score, verdict: report.critic.verdict } : undefined;
      // each gate passed is worth 15, the rest the critic's score (or 40 when there's no critic), less a little a finding
      const score = Math.max(0, Math.min(100, gates.filter((g) => g.pass).length * 15 + (critic ? critic.score * 0.4 : 40) - gates.reduce((a, g) => a + g.findings, 0)));
      return { score: Math.round(score), gates, critic };
    },
    link: async (film) => {
      const lines = copy ?? (await getCopy());
      const ctx = { device: "iphone", posture, name: anim.name, anim: id, copy: { ...lines, name: comp.brand?.name || lines.name }, brand: comp.brand, accent: accents[0] ?? comp.brand?.accent } as const;
      const c = scriptTemplate(film).make(ctx);
      const cfg = await renderConfig("video", { ...c, fps: comp.fps });
      return `/play.html#z=${await pack({ v: 1, name: film.name, comp: cfg.comp, screens: cfg.screens, components: cfg.components, dark: cfg.dark })}&play=loop&pause=0`;
    },
  };
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scene";
  const lastExport = useRef<{ kind: ExportKind; draft: boolean }>({ kind: "video", draft: false });
  const [cardGone, setCardGone] = useState<unknown>(null);
  const exportComp = (kind: ExportKind, draft = false) => {
    lastExport.current = { kind, draft };
    const size = SIZES.find((x) => x.id === comp.size) ?? SIZES[0];
    // a draft: half the size (still even: H.264 takes no odd sides), 30 fps, no motion blur, a fast encode
    return exporter.run(kind, async () => (draft ? { ...(await renderConfig(kind, { ...studioComp, blur: undefined })) } : renderConfig(kind)), draft ? { w: Math.round(size.w / 4) * 2, h: Math.round(size.h / 4) * 2 } : size, draft ? 30 : comp.fps, `${anim.id}-${kind === "png" ? slug(cscene.name) : "film"}${draft ? "-draft" : ""}`, draft);
  };
  const studioExport = <StudioExport comp={comp} set={(p) => setComp((c) => ({ ...c, ...p }))} scene={cscene} exporting={exporter.state} onExport={exportComp} onWeb={() => setWebOpen(true)} />;
  // the film packed for the web player, again whenever the composition changes while its settings are open
  useEffect(() => {
    if (!webOpen) return;
    let on = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const cfg = await renderConfig("video");
          const film: WebFilm = { v: 1, name: comp.brand?.name || anim.name, comp: cfg.comp, screens: cfg.screens, components: cfg.components, dark: cfg.dark };
          const z = await pack(film);
          if (on) setWebFilm((w) => (w?.z === z ? w : { film, z }));
        } catch {
          if (on) say("The film couldn't be packed for the web");
        }
      })();
    }, 250);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [webOpen, comp, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  /* adding to the composition */
  const imageInput = useRef<HTMLInputElement>(null);
  const imageThen = useRef<(src: string, file: string, aspect: number) => void>(() => {});
  const pickAnim = (title: string, then: (aid: string) => void) => setPicker({ title, then });
  const pickImage = (then: (src: string, file: string, aspect: number) => void) => {
    imageThen.current = then;
    imageInput.current?.click();
  };
  /** A picture goes to the dev server, so it outlives a reload and the export can load it too. */
  const takeImage = async (f: File) => {
    const blob = URL.createObjectURL(f);
    const aspect = await new Promise<number>((r) => {
      const img = new Image();
      img.onload = () => r(img.naturalWidth / img.naturalHeight || 1);
      img.onerror = () => r(1);
      img.src = blob;
    });
    let src = blob;
    try {
      src = await serverMedia(blob);
    } catch {
      say("The picture lasts until you reload: run the engine with npm run dev to keep it");
    }
    imageThen.current(src, f.name, aspect);
  };
  /** A component layer sized to its component: its shape follows what it measured, and a new component in it grows or
      shrinks the box by how much wider it is than the last one, so every component shows at the same scale. */
  const fitComponent = useCallback(
    (key: string, w: number, h: number) =>
      setComp((c) => {
        const [sid, lid] = key.split(":");
        let changed = false;
        const scenes = c.scenes.map((s) =>
          s.id !== sid
            ? s
            : {
                ...s,
                layers: s.layers.map((l) => {
                  if (l.id !== lid || l.kind !== "component" || !l.fit) return l;
                  const was = l.natural;
                  if (was && Math.abs(was.w - w) / was.w < 0.03 && Math.abs(was.h - h) / was.h < 0.03) return l;
                  changed = true;
                  return { ...l, natural: { w, h }, aspect: w / h, box: { ...l.box, w: was ? Math.min(1, Math.max(0.04, l.box.w * (w / was.w))) : l.box.w } };
                }),
              },
        );
        return changed ? { ...c, scenes } : c;
      }, true),
    [setComp],
  );
  /* ---------- the Studio's edits: copy, cut, paste, duplicate, delete (Ctrl C X V D, Del, and the stage's menu) ---------- */
  type Clip = { kind: "layer"; data: CompLayer } | { kind: "scene"; data: Comp["scenes"][number] };
  const clip = useRef<Clip | null>(null);
  const clipEventAt = useRef(0);
  const picked = (): Clip | null => {
    const l = csel.layer && csel.layer !== BG ? cscene.layers.find((x) => x.id === csel.layer) : undefined;
    return l ? { kind: "layer", data: l } : { kind: "scene", data: cscene };
  };
  /** what's picked, removed: a layer, or a scene (not the last) */
  const removePicked = () => {
    const x = picked();
    if (x?.kind === "layer") {
      setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === cscene.id ? { ...s, layers: s.layers.filter((l) => l.id !== x.data.id) } : s)) }));
      setCsel({ scene: cscene.id });
    } else if (comp.scenes.length > 1) {
      const i = comp.scenes.findIndex((s) => s.id === cscene.id);
      setComp((c) => ({ ...c, scenes: c.scenes.filter((s) => s.id !== cscene.id) }));
      setCsel({ scene: comp.scenes[i + 1]?.id ?? comp.scenes[i - 1].id });
    }
  };
  /** a copy put in: a layer into the scene that's picked (a little apart, when its original is there too), a scene after it */
  const pasteClip = (x: Clip) => {
    if (x.kind === "scene") {
      const copy = { ...x.data, id: uid(), name: x.data.name.endsWith(" copy") ? x.data.name : `${x.data.name} copy`, layers: x.data.layers.map((l) => ({ ...l, id: uid() })) };
      setComp((c) => {
        const i = c.scenes.findIndex((s) => s.id === cscene.id);
        return { ...c, scenes: [...c.scenes.slice(0, i + 1), copy, ...c.scenes.slice(i + 1)] };
      });
      setCsel({ scene: copy.id });
      return;
    }
    const l = x.data;
    if (l.kind === "device") {
      const next = addDevice(cscene, l.device);
      if (!next) return say("Every place in this scene has a device");
      const added = next.layers.find((y) => !cscene.layers.includes(y))!;
      setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === cscene.id ? { ...next, layers: next.layers.map((y) => (y === added ? { ...l, id: added.id, slot: added.kind === "device" ? added.slot : l.slot } : y)) } : s)) }));
      setCsel({ scene: cscene.id, layer: added.id });
      return;
    }
    const twin = cscene.layers.some((y) => y.id === l.id || ("box" in y && "box" in l && JSON.stringify(y.box) === JSON.stringify(l.box)));
    const moved = "box" in l && twin ? { ...l, box: { ...l.box, x: Math.min(0.95, l.box.x + 0.03), y: Math.min(0.95, l.box.y + 0.03) } } : l;
    putLayer({ ...moved, id: uid() } as CompLayer);
  };
  const duplicatePicked = () => {
    const x = picked();
    if (x) pasteClip(x);
  };
  const studioOps = useRef({ undo: undoStep, redo: redoStep, picked, removePicked, pasteClip, duplicatePicked, clip, takePicture: (f: File) => void f });
  studioOps.current = { undo: undoStep, redo: redoStep, picked, removePicked, pasteClip, duplicatePicked, clip, takePicture: (f: File) => {
    imageThen.current = addImageLayer;
    void takeImage(f);
  } };
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable], dialog, [role=dialog]");
    const label = (x: Clip) => (x.kind === "scene" ? `“${x.data.name}”` : "the layer");
    const copy = (e: ClipboardEvent, cut: boolean) => {
      if (!env.current.studio || env.current.canvas || typing(e.target) || window.getSelection()?.toString()) return;
      clipEventAt.current = performance.now();
      const x = studioOps.current.picked();
      if (!x) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", JSON.stringify({ animEngine: x.kind, data: x.data }));
      studioOps.current.clip.current = x;
      if (cut) studioOps.current.removePicked();
      say(`${cut ? "Cut" : "Copied"} ${label(x)}: ${MOD} V puts it in`);
    };
    const paste = (e: ClipboardEvent) => {
      if (!env.current.studio || env.current.canvas || typing(e.target)) return;
      clipEventAt.current = performance.now();
      const pic = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (pic) {
        e.preventDefault();
        return studioOps.current.takePicture(pic);
      }
      let x: Clip | null = null;
      try {
        const j = JSON.parse(e.clipboardData?.getData("text/plain") || "null");
        if (j && (j.animEngine === "layer" || j.animEngine === "scene") && j.data?.id) x = { kind: j.animEngine, data: j.data };
      } catch {
        /* other words: not ours */
      }
      x ??= studioOps.current.clip.current;
      if (!x) return;
      e.preventDefault();
      studioOps.current.pasteClip(x);
    };
    const onCopy = (e: ClipboardEvent) => copy(e, false);
    const onCut = (e: ClipboardEvent) => copy(e, true);
    addEventListener("copy", onCopy);
    addEventListener("cut", onCut);
    addEventListener("paste", paste);
    return () => {
      removeEventListener("copy", onCopy);
      removeEventListener("cut", onCut);
      removeEventListener("paste", paste);
    };
  }, []);
  const putLayer = (l: Comp["scenes"][number]["layers"][number], patch?: Partial<Comp["scenes"][number]>) => {
    setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === cscene.id ? { ...s, ...patch, layers: [...s.layers, l] } : s)) }));
    setCsel({ scene: cscene.id, layer: l.id });
  };
  const addImageLayer = (src: string, file: string, aspect: number) =>
    putLayer({ id: uid(), kind: "image", src, file, aspect, box: { x: 0.5, y: 0.5, w: aspect > 1 ? 0.42 : 0.26 }, radius: 1.2, enter: "rise" });
  const addToComp = (kind: AddKind, d?: DeviceId) => {
    const s = cscene;
    if (kind === "scene") {
      // the next shot keeps the devices and the camera, so it reads as the same story moving on
      const next = newScene(
        `Scene ${comp.scenes.length + 1}`,
        s.layers.filter((l) => l.kind === "device").map((l) => ({ ...l, id: uid() })),
        { camera: { ...s.camera }, frame: s.frame, transition: "dissolve" },
      );
      setComp((c) => {
        const i = c.scenes.findIndex((x) => x.id === s.id);
        return { ...c, scenes: [...c.scenes.slice(0, i + 1), next, ...c.scenes.slice(i + 1)] };
      });
      setCsel({ scene: next.id });
    } else if (kind === "device" && d) {
      const next = addDevice(s, d);
      if (!next) return say("Every place in this scene has a device: change one in the scene's Devices");
      setComp((c) => ({ ...c, scenes: c.scenes.map((x) => (x.id === s.id ? next : x)) }));
      setCsel({ scene: s.id, layer: next.layers.find((l) => !s.layers.includes(l))!.id });
    } else if (kind === "component")
      pickAnim("Add a component", (aid) => {
        // beside the devices: they move over to one side, the component takes the other
        const devs = devicesOf(s).length > 0;
        const frame = devs && s.frame === "center" ? "left" : s.frame;
        putLayer(newComponent(aid, devs ? { x: frame === "right" ? 0.28 : 0.72, y: 0.5, w: 0.3 } : { x: 0.5, y: 0.5, w: 0.4 }), { frame });
      });
    else if (kind === "breakdown") pickAnim("Take apart", (aid) => putLayer(breakdown(aid, "table")));
    else if (kind === "image") pickImage(addImageLayer);
    else if (kind === "text") putLayer(newText(copy?.features[0] ?? anim.name, { x: 0.5, y: 0.12, w: 0.8 }, 4.5));
    else if (kind === "callout") putLayer(callout(copy?.features[0] ?? "Label", "A smaller line", { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.28, w: 0.2 }));
    else if (kind === "rect") putLayer(newShape("rect", [newPaint("solid", "#ffffff")], { x: 0.5, y: 0.5, w: 0.3 }, { shadow: true }));
    else if (kind === "ellipse") {
      // a glossy orb: the accent, lit from the top left
      const accent = /^#[0-9a-f]{6}$/i.test(comp.brand?.accent ?? "") ? comp.brand!.accent : "#2563eb";
      const glow = { ...newPaint("radial", "#ffffff"), from: { x: 0.34, y: 0.3 }, to: { x: 0.8, y: 0.3 }, stops: [{ at: 0, color: "#ffffff", alpha: 0.7 }, { at: 1, color: "#ffffff", alpha: 0 }] };
      putLayer(newShape("ellipse", [newPaint("solid", accent), glow], { x: 0.5, y: 0.5, w: 0.12 }));
    } else if (kind === "cursor") putLayer(newCursor("Monica", "#1d8cf8"));
  };
  // a piece of the kit: a title (at the drop point, or where its film had it), a background for this scene, a shot
  // made into the next scene
  const takeKit = (item: KitItem, at?: { x: number; y: number }) => {
    if (item.kind === "title") return putLayer(kitTitle(item.ref ? item : { ...item, text: copy?.hook ?? item.text }, at));
    if (item.kind === "ground") {
      setComp((c) => ({ ...c, scenes: c.scenes.map((s) => (s.id === cscene.id ? { ...s, look: { ...s.look, fill: item.ground, paint: glowPaints(item) } } : s)) }));
      return say(`“${item.name}” is this scene's background`);
    }
    const v = validateScript({ shots: [item.shot] });
    if (!v.script) return say("That shot couldn't be read");
    void addShot({ ...v.script.shots[0], name: item.name }, comp.scenes.findIndex((s) => s.id === cscene.id) + 1);
  };
  // what the check can fix by itself (studio/Checks.tsx): a scene's length (its film's motion stretched with it), the
  // whole film's length, a hook moved first; each says what it did
  const applyFix = async (f: Fix): Promise<string | null> => {
    const named = (i: number) => `“${comp.scenes[i]?.name}”`;
    if (f.kind === "first" && comp.scenes[f.scene]) {
      setComp((c) => ({ ...c, scenes: [c.scenes[f.scene], ...c.scenes.filter((_, j) => j !== f.scene)] }));
      return `moved ${named(f.scene)} first`;
    }
    if (f.kind === "retime" && comp.scenes[f.scene]) {
      setComp((c) => ({ ...c, scenes: c.scenes.map((sc, j) => (j === f.scene ? retimed(sc, f.to) : sc)) }));
      return `retimed ${named(f.scene)} to ${f.to.toFixed(2)} s`;
    }
    if (f.kind === "shorten") {
      // a film's line cut off: written again, shorter, in the product's voice (the Work API), on every scene of the film
      let kit: string | null = null;
      try {
        kit = localStorage.getItem("anim-engine:kit");
      } catch {
        // a private window: no kit to write for
      }
      if (!kit) return null;
      const r = await fetch("/__kit/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: kit, film: f.film, only: [f.key], room: f.to }) }).catch(() => null);
      const v = r?.ok ? ((await r.json()) as { values: Record<string, string> }).values[f.key] : undefined;
      if (!v) return null;
      setComp((c) => ({ ...c, scenes: c.scenes.map((sc) => ({ ...sc, layers: sc.layers.map((l) => (l.kind === "component" && l.anim === f.film ? { ...l, values: { ...l.values, [f.key]: v } } : l)) })) }));
      return `wrote “${f.key}” shorter: “${v}”`;
    }
    if (f.kind === "length") {
      const now = total(comp);
      setComp((c) => ({ ...c, scenes: c.scenes.map((sc) => retimed(sc, sc.duration * (f.to / now))) }));
      return `brought it from ${now.toFixed(1)} to about ${f.to} s`;
    }
    return null;
  };
  // a film the planner cast from the whole library: its shots compiled with each film's values, one look over all of them
  const applyPlan = (script: TemplateScript, kit: ProductKit, values: Record<string, Values>) => {
    const old = comp;
    const made = compileScript(script, { device: shown, posture, anim: id, copy: kitCopy(kit), brand: comp.brand, accent: kit.brand.accent, values });
    setComp(() => ({ ...made, scenes: lookLayer(made.scenes, kit.brand.accent), fps: old.fps }));
    setCsel({ scene: made.scenes[0].id });
    setUndo({
      label: `Planned “${script.name}”`,
      run: () => {
        setComp(() => old);
        setCsel({ scene: old.scenes[0].id });
        setUndo(null);
      },
    });
  };
  // a template made with what's open, or with a product kit (its words and screens on the film's own layers, so they
  // travel with the composition and its export)
  const fromTemplate = async (t: Template, kit?: ProductKit, written?: Record<string, string>) => {
    const lines = kit ? kitCopy(kit) : (copy ?? (await getCopy()));
    const ctx = { device: shown, posture, name: anim.name, anim: id, copy: kit ? lines : { ...lines, name: comp.brand?.name || lines.name }, brand: comp.brand, accent: kit?.brand.accent ?? accents[0] ?? comp.brand?.accent, kit } as const;
    const raw = t.make(ctx);
    const film = t.values?.(ctx);
    const filled = kit ? film : undefined;
    const made = filled ? { ...raw, scenes: raw.scenes.map((sc) => ({ ...sc, layers: sc.layers.map((l) => (l.kind === "component" && l.anim === filled.anim ? { ...l, values: { ...l.values, ...filled.values, ...written } } : l)) })) } : raw;
    return { made: { ...made, size: t.size ?? (made.size !== "16x9" ? made.size : comp.size), fps: comp.fps }, film };
  };
  // batch rendering: a template with a product kit (its lines written for it, with a Work API key), in a size, queued
  // on the renderer; the job's id back. Every value is set on its layer, so nothing open in the Studio leaks in.
  const batchJob = async (t: Template, kit: ProductKit, size: string) => {
    const anim = (await fromTemplate(t, kit)).film?.anim;
    const w = anim ? await fetch("/__kit/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: kit.id, film: anim }) }).then((r) => (r.ok ? (r.json() as Promise<{ values: Record<string, string> }>) : null), () => null) : null;
    const { made } = await fromTemplate(t, kit, w?.values);
    const shaped = made.size === size ? made : reframe(made, size, LIBRARY, FOCUS as Focus);
    const c = { ...shaped, scenes: shaped.scenes.map((sc) => ({ ...sc, layers: sc.layers.map((l) => (l.kind === "component" ? { ...l, values: withDefaults(byId(l.anim)!, l.values) } : l)) })) };
    // the lines still the template's own: nothing in the kit (or written for it) says what goes there
    const kept = anim ? fillSlots(kit, slotsFor(anim)).kept.filter((k) => !w?.values?.[k]).length : 0;
    return { id: await submitJob("video", await renderConfig("video", c), SIZES.find((x) => x.id === size) ?? SIZES[0], c.fps), kept };
  };
  const applyTemplate = async (t: Template, kit?: ProductKit, written?: Record<string, string>) => {
    // the guide on Home ticks "Make your first film" once one is made
    store.set("made", true);
    const old = comp;
    setTemplates(false);
    const { made, film } = await fromTemplate(t, kit, written);
    setComp(() => made);
    setCsel({ scene: made.scenes[0].id });
    setTemplates(false);
    // a launch film takes its product's screen, name and accent from what's open
    const before = film ? overrides[film.anim] : undefined;
    // the lines written for the product go over the rules' fill
    if (film) setOverrides((o) => ({ ...o, [film.anim]: { ...o[film.anim], ...film.values, ...written } }));
    setUndo({
      label: `Started from “${t.name}”`,
      run: () => {
        setComp(() => old);
        setCsel({ scene: old.scenes[0].id });
        if (film) setOverrides(({ [film.anim]: _, ...rest }) => (before ? { ...rest, [film.anim]: before } : rest));
        setUndo(null);
      },
    });
  };
  // a new scene from the ideas: made the way a template's scenes are (what's open: its screen, its words, its brand),
  // put where it goes, and picked, so the next ideas continue from it (undoable)
  const addShot = async (shot: ScriptShot, at: number) => {
    const old = comp;
    const lines = copy ?? (await getCopy());
    const ctx = { device: shown, posture, anim: id, copy: { ...lines, name: comp.brand?.name || lines.name }, brand: comp.brand, accent: accents[0] ?? comp.brand?.accent } as const;
    const made = { ...compileScript({ ...toScript(comp, { id: "film", name: "film" }), shots: [shot] }, ctx).scenes[0], transition: shot.cut ?? "cut" };
    setComp((c) => ({ ...c, scenes: [...c.scenes.slice(0, at), made, ...c.scenes.slice(at)] }));
    setCsel({ scene: made.id });
    setUndo({
      label: `Added “${made.name}”`,
      run: () => {
        setComp(() => old);
        setCsel({ scene: old.scenes[Math.min(at, old.scenes.length - 1)].id });
        setUndo(null);
      },
    });
  };
  // for scripted checks and the template lab's previews: load a script into the studio (undoable)
  const applyRef = useRef(applyTemplate);
  applyRef.current = applyTemplate;
  useEffect(() => {
    (window as unknown as { __applyScript?: (s: TemplateScript) => Promise<void> }).__applyScript = (s) => applyRef.current(scriptTemplate(s));
  }, []);
  // the engine driven from outside (see EngineApi): a film from a template with a product's words, design and screens,
  // handed to the renderer; a canvas for a product. Each call reads the engine as it is at that moment.
  const api = useRef<EngineApi>(null!);
  api.current = {
    templates: () => scripts.map((s) => ({ id: s.id, name: s.name, summary: s.summary, shots: s.shots.length, seconds: +s.shots.reduce((a, x) => a + x.dur, 0).toFixed(1) })),
    film: async (o) => {
      const named = scripts.find((s) => s.id === o.template);
      const name = o.copy?.name?.trim() || comp.brand?.name || anim.name;
      const tagline = o.copy?.tagline?.trim() || name;
      const words = tagline.split(/\s+/);
      const half = Math.ceil(words.length / 2);
      const lines: Copy = { kicker: "Introducing", hook: tagline, tagline, features: [], split: `${words.slice(0, half).join(" ")} | ${words.slice(half).join(" ")}`, proof: "", cta: "Try it", ...o.copy, name, by: "rules" };
      const brand = o.design ? { ...(await brandFrom([], o.design)), name } : comp.brand && { ...comp.brand, name };
      const live = o.screen && byId(o.screen) ? o.screen : id;
      // the Artist directs it, unless a template was named
      const t =
        named ??
        directFilm({ category: o.artist?.category ?? "product-launch", style: o.artist?.style ?? "auto", length: o.artist?.length, size: (["16x9", "9x16", "1x1", "4x5"].includes(o.size ?? "") ? o.size : undefined) as Brief["size"], accent: brand?.accent ?? accents[0] ?? "#6d5dfc", copy: lines, screens: o.images?.length ? Math.min(3, o.images.length) : 1, seed: Math.floor(Math.random() * 1e5), taste: lab.taste, live: !o.images?.length });
      const made = compileScript(t, { device: o.device ?? "iphone", posture, anim: live, copy: lines, brand });
      // the product's own screens, or a library one, on the devices shot by shot
      let k = 0;
      const content = () => (o.images?.length ? { kind: "image" as const, src: o.images[k++ % o.images.length], name: `${name}, screen ${k}` } : live !== id ? { kind: "anim" as const, id: live } : { kind: "current" as const });
      // a captured app's screens are pictures: on the devices, and as the cards a live screen would have been
      let j = 0;
      const picture = (l: ComponentLayer): CompLayer => (o.images?.length ? { id: l.id, kind: "image", name: l.name ?? "The screen", src: o.images[j++ % o.images.length], file: `${name}, screen ${j}`, aspect: 0.46, box: l.box, radius: 1.4, enter: l.enter, ...(l.entry ? { entry: l.entry } : {}), ...(l.tweens ? { tweens: l.tweens } : {}), ...(l.tilt ? { tilt: l.tilt } : {}), ...(l.rot ? { rot: l.rot } : {}) } : l);
      const scenes = made.scenes.map((sc) => ({ ...sc, layers: sc.layers.map((l) => (l.kind === "device" ? { ...l, content: content() } : l.kind === "component" ? picture(l) : l)) }));
      setCanvas(false);
      setComp(() => ({ ...made, scenes, size: o.size ?? t.size ?? made.size, fps: o.fps ?? comp.fps }));
      setCsel({ scene: scenes[0].id });
      return { template: t.id, name: t.name, scenes: scenes.length, seconds: +total({ ...made, scenes }).toFixed(1) };
    },
    render: async (kind = "video") => submitJob(kind, await renderConfig(kind), SIZES.find((x) => x.id === comp.size) ?? SIZES[0], comp.fps),
    canvas: async (o) => {
      const doc = productCanvas({ anim: o.screen && byId(o.screen) ? o.screen : id, overrides, name: o.name, kicker: o.kicker, tagline: o.tagline, picture: o.picture });
      const baked = bake({ ...doc, origin: o.origin ?? location.origin });
      return { doc: baked, z: await pack(baked as never) };
    },
  };
  useEffect(() => {
    (window as unknown as { __engine: EngineApi }).__engine = {
      templates: () => api.current.templates(),
      film: (o) => api.current.film(o),
      render: (kind) => api.current.render(kind),
      canvas: (o) => api.current.canvas(o),
    };
  }, []);
  const layersPanel = (onPick?: () => void, inSheet?: boolean, foot?: ReactNode) => (
    <LayersPanel
      foot={foot}
      hideTitle={inSheet}
      comp={comp}
      setComp={setComp}
      sel={csel}
      setSel={(x) => {
        setCsel(x);
        onPick?.();
      }}
      onAdd={addToComp}
      onTemplates={() => setTemplates(true)}
      onArtist={() => setArtistOpen(true)}
      undo={undo ?? undefined}
      kit={<KitPanel onUse={(item) => takeKit(item)} onReferences={() => openLab("references")} />}
    />
  );
  const studioInspector = (cols: boolean) => (
    <StudioInspector
      comp={comp}
      setComp={setComp}
      sel={csel}
      setSel={setCsel}
      liveName={liveName}
      liveAnim={id}
      previewCuts={async (i, ts) => {
        // each version: the cut into scene i, from 0.7 s before to 0.9 s after, small and quick
        const at = comp.scenes.slice(0, i).reduce((a, x) => a + x.duration, 0);
        const size = SIZES.find((x) => x.id === comp.size) ?? SIZES[0];
        const small = { w: Math.round((size.w / Math.max(size.w, size.h)) * 480), h: Math.round((size.h / Math.max(size.w, size.h)) * 480) };
        const urls: string[] = [];
        for (const t of ts) {
          const variant = { ...comp, blur: undefined, music: undefined, sfx: undefined, scenes: comp.scenes.map((x, j) => (j === i ? { ...x, transition: t } : x)) };
          const cfg = await renderConfig("video", variant);
          const start = Math.max(0, at - 0.7);
          const jobId = await submitJob("video", { ...cfg, start, duration: Math.min(1.6, total(variant) - start) }, small, 30, true);
          for (;;) {
            await new Promise((r) => setTimeout(r, 500));
            const st = (await (await fetch(`/__studio/jobs/${jobId}`)).json()) as { state: string; error?: string };
            if (st.state === "error") throw new Error(st.error ?? "The render failed");
            if (st.state === "done") break;
          }
          urls.push(`/__studio/jobs/${jobId}/file`);
        }
        return urls;
      }}
      offerUndo={(label, before) =>
        setUndo({
          label,
          run: () => {
            setComp(() => before);
            setUndo(null);
          },
        })
      }
      pickAnim={pickAnim}
      pickImage={pickImage}
      copy={copy}
      writing={writing}
      writeCopy={() => void getCopy()}
      openBrand={() => setBrandOpen(true)}
      cols={cols}
      framing={framing}
      setFraming={setFraming}
    />
  );

  const studioStage = studio && (
    <Suspense
      fallback={
        <Loading label="Setting up the Studio: the stage, the lights, your devices" />
      }
    >
      <StudioStage
        comp={comp}
        setComp={setComp}
        resolve={studioResolve}
        sel={csel}
        setSel={setCsel}
        playing={playing}
        setPlaying={setPlaying}
        onAddScene={() => addToComp("scene")}
        onAdd={addToComp}
        compact={phone || short}
        framing={framing}
        onSize={fitComponent}
        onMatch={() => setMatching(true)}
        onIdeas={() => setIdeasOpen(true)}
        onKit={takeKit}
        ops={{ jumps, undo: undoStep, redo: redoStep, canUndo: past.current.length > 0, canRedo: future.current.length > 0, copy: () => (studioOps.current.clip.current = picked()), cut: () => ((studioOps.current.clip.current = picked()), removePicked()), paste: () => studioOps.current.clip.current && pasteClip(studioOps.current.clip.current), canPaste: !!clip.current, duplicate: duplicatePicked, remove: removePicked }}
      />
    </Suspense>
  );

  const themeBtn = (
    <IconButton size={phone ? "lg" : "md"} label={dark ? "Light theme" : "Dark theme"} kbd="T" tipSide={phone ? "bottom" : "top"} tipAlign="start" onClick={flipTheme}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
  // under every left panel, in every workspace: the theme, the shortcuts, the lab
  const appFoot = (
    <>
      {themeBtn}
      {!phone && (
        <IconButton label="Keyboard shortcuts" kbd="?" tipSide="top" onClick={() => setHelp(true)}>
          <Keyboard size={18} />
        </IconButton>
      )}
      {LAB && lab.state && (
        <span className="relative">
          <IconButton label={`Template lab${lab.state.pending ? `, ${lab.state.pending} waiting` : ""}`} tipSide="top" onClick={() => openLab()}>
            <Flask size={18} />
          </IconButton>
          {lab.state.pending > 0 && <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-semibold tabular-nums text-surface">{lab.state.pending}</span>}
        </span>
      )}
    </>
  );
  const overlays = (
    <>
      <Dialog open={help} onClose={() => setHelp(false)} label="Keyboard shortcuts" className="modal">
        <div className="flex max-h-[inherit] flex-col">
          <DialogHead icon={Keyboard} tone="light" title="Keyboard shortcuts" sub="Ctrl K finds anything; single keys work where you're not typing." onClose={() => setHelp(false)} />
          <dl className="scroll-thin min-h-0 overflow-y-auto px-5 py-1">
            {SHORTCUTS.map(([what, ks]) => (
              <div key={what} className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
                <dt className="text-body text-fg-2">{what}</dt>
                <dd className="flex shrink-0 gap-1">
                  {/* a "/" between keys means "or"; a "/" alone is the key itself */}
                  {ks.map((k, i) => (k === "/" && i > 0 && i < ks.length - 1 ? <span key={i} className="px-0.5 text-caption text-fg-3">or</span> : <Kbd key={i}>{k}</Kbd>))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center justify-between gap-4 border-t px-5 py-4">
            <div>
              <p id="keys-label" className="text-body font-medium">
                Single-key shortcuts
              </p>
              <p className="mt-0.5 text-caption text-fg-3">Turn these off if they get in the way of a screen reader or voice control.</p>
            </div>
            <Switch on={keys} onChange={setKeys} labelledBy="keys-label" />
          </div>
        </div>
      </Dialog>
      <AnimPicker open={!!picker} onClose={() => setPicker(null)} onPick={(aid) => picker?.then(aid)} dark={dark} title={picker?.title} />
      <Dialog open={webOpen} onClose={() => setWebOpen(false)} label="The film on a site" className="modal">
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b py-3 pl-5 pr-3">
            <h2 className="text-ui font-semibold">The film on a site</h2>
            <IconButton label="Close" onClick={() => setWebOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>
          <div className="scroll-thin min-h-0 overflow-y-auto">{webOpen && <InteractivePanel opts={webOpts} setOpts={setWebOpts} film={webFilm?.film ?? null} z={webFilm?.z ?? ""} />}</div>
        </div>
      </Dialog>
      <TemplateDialog
        open={templates}
        onClose={() => setTemplates(false)}
        onPick={(t) => void applyTemplate(t)}
        accent={accents[0] ?? comp.brand?.accent}
        product={comp.brand?.name || anim.brand || anim.name}
        onArtist={() => {
          setTemplates(false);
          setArtistOpen(true);
        }}
      />
      <ArtistDialog
        open={artistOpen}
        onClose={() => setArtistOpen(false)}
        accents={[...accents, ...(comp.brand?.accent ? [comp.brand.accent] : [])]}
        getCopy={async () => {
          const lines = copy ?? (await getCopy());
          return { ...lines, name: comp.brand?.name || lines.name };
        }}
        screens={Math.max(1, Math.min(3, anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout === "fill").length : 1))}
        components={anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout !== "fill").length : 0}
        componentNames={anim.brand ? ANIMS.filter((a) => a.brand === anim.brand && a.layout !== "fill").map((a) => a.name) : []}
        taste={lab.taste}
        gallery={scripts}
        onUse={(film) => {
          // a take opens in the Studio, made from what's open (undoable)
          setArtistOpen(false);
          void applyTemplate(scriptTemplate(film));
        }}
      />
      {LAB && <LabDialog
        open={labOpen}
        films={labFilms}
        tab={labTab}
        onClose={() => setLabOpen(false)}
        state={lab.state}
        setState={lab.setState}
        scripts={scripts}
        comp={comp}
        onChanged={() => void lab.refresh()}
        onPreview={(s) => {
          // see it in the Studio (undoable); the lab keeps its place for when it's opened again
          setLabOpen(false);
          void applyTemplate(scriptTemplate(s));
        }}
      />}
      {LAB && rail && (
        <ReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          films={labFilms}
          taste={lab.taste}
          onChanged={() => void lab.refresh()}
          onLab={() => {
            setReviewOpen(false);
            openLab("films");
          }}
          onPreview={(s) => {
            setReviewOpen(false);
            edit("films");
            void applyTemplate(scriptTemplate(s));
          }}
        />
      )}
      {rail && <Palette open={!!palette} query={palette?.q ?? ""} onClose={() => setPalette(null)} items={palette ? paletteItems() : []} search={searchWork} />}
      <SceneIdeas open={ideasOpen} onClose={() => setIdeasOpen(false)} comp={comp} picked={Math.max(0, comp.scenes.findIndex((s) => s.id === csel.scene))} gemini={!!lab.state?.key} copy={copy} onAdd={(shot, at) => void addShot(shot, at)} />
      <MatchVideo
        key={`match-${matching}`}
        open={matching}
        onClose={() => setMatching(false)}
        comp={comp}
        onApply={(next, label) => {
          const old = comp;
          setComp(() => next);
          setUndo({
            label,
            run: () => {
              setComp(() => old);
              setUndo(null);
            },
          });
        }}
      />
      <BrandDialog key={String(brandOpen)} open={brandOpen} onClose={() => setBrandOpen(false)} brand={comp.brand} onUse={(b) => setComp((c) => ({ ...c, brand: b, auto: true }))} />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void takeImage(f);
        }}
      />
      {fileDrag && studio && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(9_9_11/0.4)] p-6"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => e.target === e.currentTarget && setFileDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setFileDrag(false);
            const img = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (!img) return say("Only pictures can go into a scene");
            imageThen.current = addImageLayer;
            void takeImage(img);
            return say(`${img.name} added to ${cscene.name}`);
          }}
        >
          <div className="pointer-events-none flex max-w-sm flex-col items-center gap-2 rounded-2xl bg-overlay px-8 py-7 text-center shadow-lg">
            <ImageSquare size={28} className="text-fg-2" aria-hidden />
            <p className="text-ui font-semibold">Drop to add it to {cscene.name}</p>
            <p className="text-body text-fg-2">It comes in as a picture layer you can move, resize and animate in.</p>
          </div>
        </div>
      )}
      <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4 ${phone ? "top-[calc(env(safe-area-inset-top)+68px)]" : space === "work" ? "bottom-[calc(env(safe-area-inset-bottom)+88px)]" : "bottom-6"}`}>
        {said && (
          <p key={said} className="toast pop-in">
            <span aria-hidden className="toast-icon">
              <Sparkle size={13} />
            </span>
            {said}
          </p>
        )}
      </div>
      {exporter.state !== cardGone && (
        <RenderCard
          state={exporter.state}
          onClose={() => setCardGone(exporter.state)}
          onRetry={() => void exportComp(lastExport.current.kind, lastExport.current.draft)}
          onOptions={() => {
            if (space !== "work" || canvasOn) edit("films");
            setTimeout(() => document.getElementById("export-pop")?.showPopover(), space === "work" && !canvasOn ? 0 : 450);
          }}
        />
      )}
      {LAB && !labOpen && (
        <LabNotice
          state={lab.state}
          onReview={() => (rail ? setReviewOpen(true) : openLab(lab.state?.films ? "films" : "inbox"))}
          onDismiss={() => void fetch("/__lab/seen", { method: "POST" }).then(() => lab.refresh())}
        />
      )}
    </>
  );

  const viewSwitch = (
    <Segmented
      label="View"
      value={canvasOn ? "canvas" : "mockup"}
      onChange={(v) => setCanvas(v === "canvas")}
      options={[
        { value: "mockup", label: "Studio", icon: phone ? undefined : Cube },
        { value: "canvas", label: "Canvas", icon: phone ? undefined : FrameCorners },
      ]}
      hideLabels="narrow"
    />
  );
  const surface = <div className="fade-in relative flex min-h-0 flex-1 flex-col">{studioStage}</div>;

  /* ---------------- the island: Home, Product, Films, Creatives, and the Lab on this machine ---------------- */
  // the gallery an editor belongs to: where its way back goes, and which place the island lights
  const home: Space = canvasOn ? "creatives" : "films";
  const at: Space = space === "work" ? home : space;
  // straight there: a View Transition has to snapshot the page first (Home's live phone and sky took ~800 ms), so the
  // pages bring their own entrance instead (the title and cards rise in)
  // a place or an editor renders as a transition: what was pressed answers at once (a pill, a press), and the new page
  // is drawn in slices the browser can paint between, instead of one long block that held the pointer's answer back
  const go = (to: Space) =>
    startTransition(() => {
      setSpace(to);
    });
  // an editor, full-screen: the film editor (Films) or the canvas (Creatives)
  const edit = (to: "films" | "creatives") =>
    startTransition(() => {
      setSpace("work");
      setCanvas(to === "creatives");
    });
  const labBadge = (lab.state?.pending ?? 0) + (lab.state?.films ?? 0);
  // New, in the sidebar: everything that can be started, from anywhere, each with the colour of what it makes
  const newMenu = (
    <div className="w-[300px] p-1.5">
      <p className="px-2.5 pb-1 pt-1.5 text-micro font-medium text-fg-3">Start something</p>
      <MenuItem
        icon={PaintBrush}
        tone="var(--k-motion)"
        hint="The Artist directs a whole film from your product."
        onSelect={() => {
          edit("films");
          setArtistOpen(true);
        }}
      >
        Direct a film
      </MenuItem>
      <MenuItem icon={FilmSlate} tone="var(--k-scene)" hint="Launch, feature, demo, brand, social." onSelect={() => go("films")}>
        Film from a template
      </MenuItem>
      <MenuItem
        icon={FrameCorners}
        tone="var(--k-effect)"
        hint="A hero, a bento, a poster or a post."
        onSelect={() => {
          setCreateKind("");
          edit("creatives");
        }}
      >
        Creative
      </MenuItem>
      {LAB && (
        <>
          <div className="mx-2 my-1 border-t" />
          <MenuItem icon={Package} tone="var(--k-device)" hint="Screens, logo and words, once for every film." onSelect={() => go("product")}>
            Add your product
          </MenuItem>
          <MenuItem icon={FilmStrip} hint="Four new films to keep or pass, with why." onSelect={() => setReviewOpen(true)}>
            Films to review
          </MenuItem>
        </>
      )}
    </div>
  );
  // you: the theme, tips, shortcuts, the lab's settings
  const meMenu = (
    <div className="w-[268px] p-1.5">
      <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: "conic-gradient(from 210deg at 35% 35%, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-1))" }}>
          S
        </span>
        <span>
          <span className="block text-body font-medium">Syed</span>
          <span className="block text-caption text-fg-3">Video Engine</span>
        </span>
      </div>
      <div className="mx-1 mb-1 flex items-center justify-between rounded-lg px-1.5 py-1">
        <span className="text-body text-fg-2">Theme</span>
        <Segmented
          size="sm"
          label="Theme"
          value={themePick}
          onChange={(v) => pickTheme(v as "light" | "dark" | "auto")}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </div>
      <div className="mx-1 flex items-center justify-between rounded-lg px-1.5 py-1.5">
        <label htmlFor="me-tips" className="text-body text-fg-2">
          Show tips in panels
        </label>
        <Switch id="me-tips" on={tips} onChange={setTips} />
      </div>
      <div className="mx-2 my-1.5 border-t" />
      <MenuItem icon={Keyboard} onSelect={() => setHelp(true)}>
        Keyboard shortcuts
      </MenuItem>
      {LAB && (
        <MenuItem icon={Flask} onSelect={() => openLab("settings")}>
          Lab settings
        </MenuItem>
      )}
    </div>
  );
  // what you opened lately, in the sidebar: a click puts it on the devices and opens the Studio
  const recentItems = recentAnims
    .map((rid) => ANIMS.find((a) => a.id === rid))
    .filter((a): a is AnimMeta => !!a)
    .slice(0, 6)
    .map((a) => ({ id: a.id, name: a.name, thumb: `/thumbs/${a.id}-${dark ? "dark" : "light"}.webp`, onOpen: () => (openAnim(a.id), edit("films")) }));
  // the Lab has its own list of rooms down its side: the sidebar folds to its glyphs there unless you opened it
  const folded = sideCollapsed ?? (space === "lab" || !roomy);
  const sidebar = <Sidebar at={at} go={go} dance={dance} onLogo={party} onSearch={() => setPalette({ q: "" })} review={LAB ? { count: labBadge, open: reviewOpen, toggle: () => setReviewOpen((o) => !o) } : undefined} newMenu={newMenu} meMenu={meMenu} recent={recentItems} collapsed={folded} onCollapse={(c) => setSideCollapsed(c)} />;
  const back = space === "work" ? { label: SPACE_NAME[home], go: () => go(home) } : null;
  // a page sits on a sheet beside the sidebar; an editor is full-screen, its way back first in its toolbar
  const withRail = (body: ReactNode) => (
    <InBar.Provider value>
      <Back.Provider value={back}>
        <OpenSettings.Provider value={LAB ? () => openLab("settings") : null}>
          {space === "work" ? (
            <div className="flex h-full min-h-0">{body}</div>
          ) : (
            <div className="app-frame">
              {sidebar}
              <div className="app-sheet">{body}</div>
            </div>
          )}
        </OpenSettings.Provider>
      </Back.Provider>
    </InBar.Provider>
  );
  if (rail && space === "home")
    return withRail(
      <>
        <Home
          product={comp.brand?.name || anim.brand || anim.name}
          anim={anim.id}
          overrides={overrides}
          dark={dark}
          accent={accents[0] ?? comp.brand?.accent}
          film={studioComp}
          lab={lab.state ? { films: lab.state.films ?? 0, ideas: lab.state.pending } : null}
          onStudio={() => edit("films")}
          onCanvas={() => edit("creatives")}
          onArtist={() => {
            edit("films");
            setArtistOpen(true);
          }}
          onTemplates={() => {
            edit("films");
            setTemplates(true);
          }}
          onFilm={(t) => {
            edit("films");
            void applyTemplate(t);
          }}
          onAllFilms={() => go("films")}
          onCreative={(kind) => {
            if (kind === undefined) return go("creatives");
            setCreateKind(kind);
            edit("creatives");
          }}
          onComponent={(aid) => {
            openAnim(aid);
            edit("films");
          }}
          onComponents={() => pickAnim("Your product's screen", openAnim)}
          onProduct={() => go("product")}
          onReview={() => setReviewOpen(true)}
          onLab={(tab) => openLab(tab)}
          onSettings={() => openLab("settings")}
          recent={recentAnims}
          labOn={LAB}
          onSearch={(q) => setPalette({ q })}
        />
        {overlays}
      </>,
    );
  if (rail && space === "product")
    return withRail(
      <>
        <ProductPage key={productKey} templates={TEMPLATES.filter((t) => t.film)} onMake={(t, kit, lines) => (edit("films"), void applyTemplate(t, kit, lines))} onPlan={(script, kit, values) => (edit("films"), applyPlan(script, kit, values))} onBatch={batchJob} />
        {overlays}
      </>,
    );
  if (LAB && rail && space === "lab")
    return withRail(
      <>
        <LabDialog
          page
          open
          tab={labTab}
          onClose={() => go("home")}
          state={lab.state}
          setState={lab.setState}
          scripts={scripts}
          comp={comp}
          onChanged={() => void lab.refresh()}
          films={labFilms}
          onPreview={(s) => {
            edit("films");
            void applyTemplate(scriptTemplate(s));
          }}
        />
        {overlays}
      </>,
    );
  // the galleries: browse, then open full-screen
  const product = comp.brand?.name || anim.brand || anim.name;
  if (rail && space === "films")
    return withRail(
      <>
        <FilmsPage
          product={product}
          anim={anim.id}
          dark={dark}
          accent={accents[0] ?? comp.brand?.accent}
          templates={TEMPLATES.filter((t) => t.category)}
          film={studioComp}
          waiting={lab.state?.films ?? 0}
          onContinue={() => edit("films")}
          onTemplate={(t) => (edit("films"), void applyTemplate(t))}
          onArtist={() => (edit("films"), setArtistOpen(true))}
          onReview={() => setReviewOpen(true)}
          onSwitch={() => pickAnim("Your product's screen", openAnim)}
        />
        {overlays}
      </>,
    );
  if (rail && space === "creatives")
    return withRail(
      <>
        <CreativesPage product={product} anim={anim.id} overrides={overrides} dark={dark} accent={accents[0] ?? comp.brand?.accent} onContinue={() => edit("creatives")} onCreate={(kind) => (setCreateKind(kind ?? ""), edit("creatives"))} onSwitch={() => pickAnim("Your product's screen", openAnim)} />
        {overlays}
      </>,
    );

  // the Canvas is a workspace of its own: its layers and assets, the frame, its inspector (on a phone or an upright
  // tablet it only plays: too narrow to design on)
  if (canvasOn) {
    const body = (
      <div className="flex h-full min-w-0 flex-1">
        <CanvasWorkspace dark={dark} anim={anim.id} overrides={overrides} switcher={rail ? undefined : viewSwitch} compact={phone || tablet} say={say} foot={rail ? undefined : appFoot} create={createKind} onCreateShown={() => setCreateKind(null)} />
        {overlays}
      </div>
    );
    return rail ? withRail(body) : body;
  }

  /* ---------------- phone: one top bar, the film, a bar of four places, sheets ---------------- */
  if (phone) {
    const content = sheet ?? lastSheet;
    // the studio on a phone: four labelled places to go, each a sheet
    const picked = inspectorTitle(comp, csel);
    const studioBar = (
      <nav aria-label="Studio" className="grid shrink-0 grid-cols-4 gap-1 border-t bg-surface px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5">
        {(
          [
            { id: "layers", label: "Layers", note: `${comp.scenes.length} scene${comp.scenes.length > 1 ? "s" : ""}`, icon: Stack, open: () => setSheet("layers") },
            { id: "edit", label: "Edit", note: csel.layer === BG ? cscene.name : picked, icon: SlidersHorizontal, open: () => setSheet("edit") },
            {
              id: "bg",
              label: "Background",
              note: "Colour, effects",
              icon: PaintBucket,
              open: () => {
                setCsel({ scene: csel.scene, layer: BG });
                setSheet("edit");
              },
            },
            { id: "export", label: "Export", note: exporter.state.phase === "working" ? "Rendering…" : comp.kind === "png" ? "Image" : "Video", icon: DownloadSimple, open: () => setSheet("export") },
          ] as const
        ).map((b) => {
          const on = b.id === "bg" ? sheet === "edit" && csel.layer === BG : b.id === "edit" ? sheet === "edit" && csel.layer !== BG : sheet === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={on}
              onClick={b.open}
              className={`press flex h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 ${on ? "bg-surface-2 text-fg" : "text-fg-2 hover:bg-surface-2"}`}
            >
              <b.icon size={20} aria-hidden weight={b.id === "export" ? "bold" : "regular"} />
              <span className="text-caption font-medium leading-4 text-fg">{b.label}</span>
              <span className="w-full truncate text-center text-micro leading-3 text-fg-3">{b.note}</span>
            </button>
          );
        })}
      </nav>
    );
    return (
      <div className="flex h-full flex-col bg-canvas">
        <header className="shrink-0 border-b bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1.5 pl-1.5 pr-2">
            <button
              type="button"
              onClick={() => pickAnim("Your product's screen", openAnim)}
              aria-haspopup="dialog"
              aria-label={`${anim.name} is on the devices. Choose another screen`}
              className="press flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-ui font-semibold">
                  <span className="truncate">{anim.name}</span>
                  <CaretDown size={12} weight="bold" aria-hidden className="shrink-0 text-fg-3" />
                </span>
                <span className="block truncate text-caption text-fg-3">{anim.category}</span>
              </span>
            </button>
            {viewSwitch}
            <IconButton size="lg" label="More" popover="phone-more">
              <DotsThree size={20} weight="bold" />
            </IconButton>
            <Popover id="phone-more" align="end" label="More">
              <div className="w-[280px] p-1.5">
                <MenuItem icon={dark ? Sun : Moon} onSelect={flipTheme}>
                  {dark ? "Light theme" : "Dark theme"}
                </MenuItem>
                {LAB && lab.state && (
                  <MenuItem icon={Flask} hint={lab.state.pending ? `${lab.state.pending} waiting for you` : "Templates the AI improves every night"} onSelect={() => setLabOpen(true)}>
                    Template lab
                  </MenuItem>
                )}
              </div>
            </Popover>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <main aria-label="Stage" className="relative flex min-h-0 flex-1 flex-col">
            {surface}
          </main>
          {studioBar}
          <Sheet open={!!sheet} onClose={closeSheet} half title={content === "layers" ? "Layers" : content === "edit" ? (csel.layer === BG ? "Background" : picked) : "Export"}>
            {content === "layers" ? (
              // picking a layer goes straight to its settings
              <div className="h-full [&>div]:bg-transparent">{layersPanel(() => setSheet("edit"), true)}</div>
            ) : content === "edit" ? (
              studioInspector(false)
            ) : content === "export" ? (
              <div className="[&>div]:w-full [&>div]:max-w-none">{studioExport}</div>
            ) : null}
          </Sheet>
        </div>
        {overlays}
      </div>
    );
  }
  /* ---------------- tablet & desktop: layers | the film | inspector ---------------- */
  // which component is your product's screen, and the way to pick another
  const crumbs = (
    <button
      type="button"
      onClick={() => pickAnim("Your product's screen", openAnim)}
      aria-haspopup="dialog"
      aria-label={`${anim.name} is on the devices. Choose another screen`}
      className="press flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-body hover:bg-hover"
    >
      <span className="truncate font-medium">{anim.name}</span>
      <CaretDown size={11} weight="bold" aria-hidden className="shrink-0 text-fg-3" />
    </button>
  );
  const exportBtn = (
    <>
      <FpsMeter comp={comp} playing={playing} />
      <IconButton label="Voice and words" onClick={() => setVoiceOpen(true)}>
        <Microphone size={17} />
      </IconButton>

      <FloatingPanel open={voiceOpen} title="Voice and words" onClose={() => setVoiceOpen(false)} width={380}>
        <VoicePanel comp={comp} setComp={setComp} />
      </FloatingPanel>

      <Button onClick={() => setCheckOpen(true)}>
        <ListChecks size={14} aria-hidden />
        Check
      </Button>

      <FloatingPanel open={checkOpen} title="Check the film" onClose={() => setCheckOpen(false)} width={380}>
        <Checks config={() => renderConfig("video")} size={SIZES.find((x) => x.id === comp.size) ?? SIZES[0]} scenes={comp.scenes.map((x) => x.name)} onScene={(i) => comp.scenes[i] && setCsel({ scene: comp.scenes[i].id })} onFix={applyFix} />
      </FloatingPanel>

      <Button variant="primary" popover="export-pop">
        <DownloadSimple size={14} weight="bold" aria-hidden />
        {exporter.state.phase === "working" ? (exporter.state.total > 1 ? `${Math.round((exporter.state.done / exporter.state.total) * 100)}%` : "Rendering…") : "Export"}
      </Button>
      <Popover id="export-pop" align="end" label="Export">
        {studioExport}
      </Popover>
    </>
  );
  // the inspector names what it's showing, beside its kind: the picked layer or scene
  const inspectTitle = inspectorTitle(comp, csel);

  /* ---------------- tablet held upright: the stage full width, a panel under it ---------------- */
  if (tablet) {
    return (
      <div className="flex h-full flex-col bg-canvas">
        <header className="@container grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-surface px-2">
          <div className="flex min-w-0 items-center gap-1 pl-1">
            {crumbs}
          </div>
          {viewSwitch}
          <div className="flex min-w-0 items-center justify-end gap-1.5">{exportBtn}</div>
        </header>
        <main aria-label="Stage" className="relative flex min-h-0 flex-1 flex-col">
          {surface}
        </main>
        {/* a sheet over the bottom of the stage: the handle says it moves, the header says what's in it */}
        <section
          aria-label="Studio"
          className={`flex shrink-0 flex-col rounded-t-2xl border-t bg-surface shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] ${panelOpen ? "h-[44%]" : ""}`}
        >
          <button
            type="button"
            aria-label={panelOpen ? "Hide the panel" : "Show the panel"}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
            className="group flex h-4 shrink-0 cursor-pointer items-end justify-center"
          >
            <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong transition-colors duration-150 group-hover:bg-fg-3" />
          </button>
          {panelOpen ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,36%)_1fr]">
                <div className="min-h-0 border-r">{layersPanel()}</div>
                <div className="flex min-h-0 flex-col">
                  <div className="flex h-12 shrink-0 items-center gap-2 border-b pl-4 pr-2">
                    {inspectorIcon(comp, csel)}
                    <h2 className="mr-auto truncate text-body font-semibold">{inspectTitle}</h2>
                    <IconButton label="Hide the panel" onClick={() => setPanelOpen(false)}>
                      <CaretDown size={18} />
                    </IconButton>
                  </div>
                  <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{studioInspector(false)}</div>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setPanelOpen(true)} className="press flex h-12 items-center gap-2.5 px-4 text-left">
                <Stack size={16} aria-hidden className="text-fg-2" />
                <span className="text-body font-semibold">Layers and settings</span>
                <span className="truncate text-caption text-fg-3">{inspectTitle}</span>
                <CaretUp size={18} aria-hidden className="ml-auto shrink-0 text-fg-2" />
              </button>
            )}
        </section>
        {overlays}
      </div>
    );
  }

  // the layers beside the film, unless hidden or focused
  const sideShown = !focus && studioLeft;
  const desk = (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-app">
      <a href="#inspector" className="skip-link">
        Skip to inspector
      </a>
      {/* the editor's bar, full width on the ground: the way back and what's open (left), what you do with it (right) */}
      <header className="editor-bar @container">
        <div className="flex h-10 min-w-0 items-center gap-0.5 justify-self-start">
          <BarBack />
          <IconButton label={sideShown ? "Hide the panel" : "Show the panel"} expanded={sideShown} onClick={() => (setFocus(false), setLeftPanel(!sideShown))}>
            <SidebarSimple size={17} />
          </IconButton>
          {crumbs}
        </div>
        {rail ? (
          <span className="hidden truncate text-caption tabular-nums text-fg-3 @min-[52rem]:block">
            {comp.scenes.length} {comp.scenes.length === 1 ? "scene" : "scenes"} · {total(comp).toFixed(1)} s · {comp.size.replace("x", ":")}
          </span>
        ) : (
          viewSwitch
        )}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <IconButton label="Undo" kbd={`${MOD} Z`} disabled={!past.current.length} onClick={undoStep}>
            <ArrowArcLeft size={17} />
          </IconButton>
          <IconButton label="Redo" kbd={`${MOD} Shift Z`} disabled={!future.current.length} onClick={redoStep}>
            <ArrowArcRight size={17} />
          </IconButton>
          <Versions comp={comp} onRestore={(c, name) => (setComp(() => c), setCsel({ scene: c.scenes[0].id }), say(`Back to “${name}” (Undo takes you back)`))} />
          <NoteEdit
            comp={comp}
            onApply={(s, note) => {
              // compiled with each film's values as they are now: only what the note asked for changes
              const values = Object.fromEntries(comp.scenes.flatMap((sc) => sc.layers).flatMap((l) => (l.kind === "component" && l.values ? [[l.anim, l.values] as const] : [])));
              const made = compileScript(s, { device: shown, posture, anim: id, copy: copy ?? SAMPLE_COPY, brand: comp.brand, accent: accents[0] ?? comp.brand?.accent, values });
              setComp((c) => ({ ...c, scenes: made.scenes }));
              setCsel({ scene: made.scenes[0].id });
              say(`Changed: “${note}” (Undo takes it back)`);
            }}
          />
          <IconButton label={focus ? "Show the panels" : "Focus: hide the panels"} kbd="Ctrl ." active={focus} onClick={() => setFocus(!focus)} tipAlign="end">
            {focus ? <CornersIn size={17} /> : <CornersOut size={17} />}
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
          {exportBtn}
        </div>
      </header>
      {/* the panel, the stage and the inspector: three tones side by side, no rules between them */}
      <div className="flex min-h-0 flex-1">
        {sideShown && <aside className="flex w-[300px] shrink-0 overflow-hidden">{layersPanel(undefined, false, rail ? null : appFoot)}</aside>}
        <main aria-label="Stage" className="stage-ground relative flex min-w-0 flex-1 flex-col">
          {surface}
        </main>
        {!focus && (
          <Inspector title={inspectTitle} icon={inspectorIcon(comp, csel)}>
            {studioInspector(false)}
          </Inspector>
        )}
      </div>
      {overlays}
    </div>
  );
  return rail ? withRail(desk) : desk;
}

const SPACE_NAME = Object.fromEntries(PLACES.map((x) => [x.id, x.name])) as Record<Space, string>;
