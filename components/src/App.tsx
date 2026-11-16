import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DialogHead } from "./Gloss";
import { ArrowCounterClockwise, BookOpen, CaretUp, CaretDown, CaretLeft, CaretRight, CaretUpDown, Check, Columns, Cursor, DeviceMobile, DeviceRotate, DeviceTablet, FileCode, Sparkle, ArrowsClockwise, DotsThree, DownloadSimple, FileZip, Gauge, Globe, HandPointing, ImageSquare, Keyboard, Question, CornersOut, CornersIn, Laptop, Moon, PenNib, PersonArmsSpread, Plus, SidebarSimple, SlidersHorizontal, SquaresFour, Stack, Sun, WarningCircle } from "@phosphor-icons/react";
import { ANIMS, byId, htmlUrl, withDefaults, type AnimMeta, type Value, type Values } from "./registry";
import { DEVICES, DUO_MOVE, DeviceFrame, breakpoint, frameSize, viewport, type Device, type DeviceId, type Posture, type ScreenInk } from "./devices";
import Inspector, { CodeExport, Dot, Insights, PropertiesPanel, changedCount, fpsTone, health, issueCount, type Perf } from "./Inspector";
import Library from "./Library";
import { AdjustBar, field } from "./controls";
import { DropOutline, Ghost, LayerHandle, ScreenPanel, aggregate, layerBox, newLayer, type Layer, type Media, type Scene } from "./scene";
import { Button, CATEGORY_ICON, Count, Dialog, IconButton, Kbd, MenuItem, Popover, Segmented, Sheet, Switch, closePopover, useMedia, type Icon, Select } from "./ui";
import { Back, DockBack, InBar, Island, KindTile, SPACES as PLACES, type Space } from "./shell";
import { LibraryPage } from "./Galleries";
import { barrelRoll, rain, useKonami } from "./fun";
import { Palette, type PaletteItem } from "./Palette";
import { SPACES } from "./shell";
import { detectHost, suggest, type Suggestion } from "./suggest";
import { downloadZip } from "./exporter";
import { ImportDialog } from "./ImportDialog";
import { AddressForm, SitePanel, hostOf, isLocal, type SiteCheck, type SiteHow } from "./site";


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
type Mode = "single" | "screen" | "site";

type Drag = { anim: string; x: number; y: number; over: { device: string; cx: number; cy: number } | null };
type PhoneSheet = "props" | "insights";
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
/** Light or dark system ink over a CSS colour (rgb(), #hex): whichever reads. */
const inkOn = (c: string): "light" | "dark" => {
  const n = c.startsWith("#") ? [1, 3, 5].map((i) => parseInt((c.length === 4 ? c[Math.ceil(i / 2)].repeat(2) : c.slice(i, i + 2)), 16)) : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const [r = 255, g = 255, b = 255] = n.map((x) => (Number.isFinite(x) ? x : 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140 ? "light" : "dark";
};

const VIEWS: { value: View; label: string; icon: Icon; kbd: string }[] = [
  { value: "iphone", label: "iPhone", icon: DeviceMobile, kbd: "1" },
  { value: "duo", label: "iPhone Duo", icon: BookOpen, kbd: "2" },
  { value: "ipad", label: "iPad", icon: DeviceTablet, kbd: "3" },
  { value: "macbook", label: "MacBook", icon: Laptop, kbd: "4" },
  { value: "compare", label: "Compare", icon: Columns, kbd: "5" },
];
const POSTURES: { value: Posture; label: string }[] = [
  { value: "folded", label: "Folded" },
  { value: "half", label: "Half open" },
  { value: "open", label: "Open" },
];

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const SHORTCUTS: [string, string[]][] = [
  ["Search animations", ["/"]],
  ["Search from anywhere", [MOD, "K"]],
  ["Previous / next animation", ["[", "]"]],
  ["iPhone, iPhone Duo, iPad, MacBook, Compare", ["1", "2", "3", "4", "5"]],
  ["Fold / unfold the iPhone Duo", ["F"]],
  ["Rotate", ["L"]],
  ["Replay", ["R"]],
  ["Emulate reduced motion", ["M"]],
  ["Hairline: redraw as thin lines", ["H"]],
  ["Light / dark theme", ["T"]],
  ["Screen builder: move the picked layer", ["←", "→", "↑", "↓"]],
  ["Screen builder: remove the picked layer", ["Del"]],
  ["Show shortcuts", ["?"]],
];

const loadScene = (): Scene => {
  const s = store.get<Scene>("scene", { layers: [], bg: "" });
  return { bg: s.bg ?? "", layers: (s.layers ?? []).filter((l) => byId(l.anim)) };
};

/** Importing a component writes its files into this app's library, on this machine: a build for the web leaves it out. */
const IMPORT = import.meta.env.DEV;

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
  const [view, setView] = useState<View>(() => store.get("view", "iphone"));
  const [landscape, setLandscape] = useState(false);
  const [posture, setPosture] = useState<Posture>(() => store.get("posture", "open"));
  // the pose the Duo's hinge is actually moving to; it can start a beat after a posture change, and the stage zooms with it
  const [duoPose, setDuoPose] = useState({ posture, landscape: false });
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [reduce, setReduce] = useState(false);
  const [nativeDpr, setNativeDpr] = useState(true);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [replay, setReplay] = useState(0);
  const [sheet, setSheet] = useState<PhoneSheet | null>(null); // phone: the panel pulled up over the stage
  const [perf, setPerf] = useState<Record<string, Perf>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inks, setInks] = useState<Record<string, ScreenInk>>({}); // status bar / home indicator ink a screen asked for
  // which document each frame has finished loading (frame key + src), for the loading veil
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  // auto-detected until someone picks a class themselves; only an explicit pick is remembered
  const [hostTflops, setHostTflops] = useState(() => store.get("hostGpu", detectHost().tflops));
  const [libOpen, setLibOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [keys, setKeys] = useState(() => store.get("keys", true)); // WCAG 2.1.4: single-key shortcuts can be turned off
  const [exporting, setExporting] = useState(false);
  const [said, say] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Screen builder: animations placed on one screen, run and measured together
  // (an older engine's "web" mode, the film on a page, became the Canvas)
  const [mode, setMode] = useState<Mode>(() => (store.get<string>("mode", "single") === "web" ? "single" : store.get<Mode>("mode", "single")));
  const [scene, setScene] = useState<Scene>(loadScene);
  const [sel, setSel] = useState<string | null>(null);
  const [arrange, setArrange] = useState(true); // false: pointer goes to the animations instead of moving them
  const [media, setMediaState] = useState<Media | null>(null); // a dropped image/video background, this tab only
  const [drag, setDrag] = useState<Drag | null>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const screen = mode === "screen";

  // Website check: a web address on every device, at each one's own screen size
  const siteMode = mode === "site";
  const [site, setSite] = useState(() => store.get("site", ""));
  const [siteHow, setSiteHow] = useState<SiteHow>(() => store.get("siteHow", "auto"));
  const [siteCheck, setSiteCheck] = useState<SiteCheck | null>(null);
  // the colours each device's page asked Safari to paint around it (the status bar's strip, the home indicator's)
  const [siteGround, setSiteGround] = useState<Record<string, { top: string; bottom: string }>>({});
  const [recent, setRecent] = useState<string[]>(() => store.get("sites", []));
  const openSite = (u: string) => {
    setSite(u);
    setRecent((r) => [u, ...r.filter((x) => x !== u)].slice(0, 6));
    setMode("site");
    setLibOpen(false);
  };
  useEffect(() => store.set("site", site), [site]);
  useEffect(() => store.set("siteHow", siteHow), [siteHow]);
  useEffect(() => store.set("sites", recent), [recent]);
  // can it be shown in a frame? (asked of the engine's server, which can read the headers a page can't)
  useEffect(() => {
    if (mode !== "site" || !site) return setSiteCheck(null);
    let on = true;
    setSiteCheck({ state: "checking" });
    fetch(`/__site/check?u=${encodeURIComponent(site)}`)
      .then((r) => r.json())
      .then((j) => on && setSiteCheck(j.error ? { state: "error", message: j.error } : { state: "ok", ...j }))
      .catch(() => on && setSiteCheck({ state: "error", message: "The engine's server isn't answering. Run it with npm run dev." }));
    return () => {
      on = false;
    };
  }, [mode, site]);
  // through the engine needs a site of its own per device, which only localhost gives (see frameOrigin)
  const siteVia = isolate && (siteHow === "engine" || (siteHow === "auto" && !isLocal(site) && siteCheck?.state === "ok" && !siteCheck.frameable));
  // Auto waits for the check before loading anything, so a page isn't loaded twice
  const siteWaiting = siteHow === "auto" && !isLocal(site) && (!siteCheck || siteCheck.state === "checking");
  // where you are: browsing the library, or at work on a component in its devices
  const [space, setSpace] = useState<Space | "work">(() => store.get("space", "library"));
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
  // tips: the sentences that say how a control works, off until asked for
  const [tips, setTips] = useState(() => store.get("tips", false));
  useEffect(() => {
    document.documentElement.classList.toggle("tips", tips);
    store.set("tips", tips);
  }, [tips]);
  const [importing, setImporting] = useState(false);
  // Preview: the hairline treatment over the animation
  const [hl, setHl] = useState(false);
  // the phone layout is for portrait phones; landscape phones and short windows get the side panel, with tighter
  // margins; the library stays open beside the stage from iPad-landscape widths up
  const phone = useMedia("(max-width: 767.98px) and (orientation: portrait)");
  const short = useMedia("(max-height: 560px)");
  // a tablet held upright: the stage gets the full width, and a panel under it holds the properties or the library
  const tablet = useMedia("(min-width: 768px) and (max-width: 1119.98px) and (orientation: portrait)");
  const [panel, setPanel] = useState<"inspect" | "library">("inspect");
  const [panelOpen, setPanelOpen] = useState(() => store.get("panelOpen", true));
  const wide = useMedia("(min-width: 1120px)");
  const [leftPanel, setLeftPanel] = useState<boolean | null>(null);
  // the library beside Components: there unless hidden
  const sideOn = leftPanel ?? true;
  // focus: both side panels away, the stage as big as the window allows (Ctrl . toggles it)
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setFocus((f) => !f);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  // a desktop (or a tablet on its side) has the rail of places down the left; a phone and an upright tablet switch in their header
  const rail = !phone && !tablet;
  railRef.current = rail;
  const coarse = useMedia("(pointer: coarse)");

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
  useEffect(() => store.set("view", view), [view]);
  useEffect(() => store.set("posture", posture), [posture]);
  useEffect(() => store.set("mode", mode), [mode]);
  useEffect(() => store.set("keys", keys), [keys]);
  useEffect(() => store.set("panelOpen", panelOpen), [panelOpen]);
  useEffect(() => {
    const t = setTimeout(() => store.set("scene", scene), 250); // not on every pointer move
    return () => clearTimeout(t);
  }, [scene]);
  useEffect(() => {
    document.title = `${screen ? "Screen builder" : siteMode ? (site ? hostOf(site) : "Website check") : anim.name} · Components`;
  }, [anim, screen, siteMode, site]);
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

  // phones don't get Compare: four devices side by side would be thumbnails
  const shown: View = phone && view === "compare" ? "iphone" : view;
  const devices = useMemo(() => (shown === "compare" ? DEVICES : DEVICES.filter((d) => d.id === shown)), [shown]);
  const hasDuo = devices.some((d) => d.fold);

  /* ---------- screen builder state ---------- */
  const visible = screen ? scene.layers.filter((l) => !l.hidden) : [];
  const layer = screen ? (scene.layers.find((l) => l.id === sel) ?? null) : null;
  const subject = layer ? byId(layer.anim)! : anim; // whose properties the inspector shows
  const subjectValues = useMemo(() => (layer ? withDefaults(byId(layer.anim)!, layer.values) : values), [layer, values]);
  const edited = changedCount(subject, layer ? layer.values : (overrides[id] ?? {}));

  const updateLayer = useCallback(
    (lid: string, patch: Partial<Layer>) => setScene((s) => ({ ...s, layers: s.layers.map((l) => (l.id === lid ? { ...l, ...patch } : l)) })),
    [],
  );
  const removeLayer = (lid: string) => {
    setScene((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== lid) }));
    setSel((x) => (x === lid ? null : x));
  };
  const reorderLayer = (lid: string, dir: 1 | -1) =>
    setScene((s) => {
      const i = s.layers.findIndex((l) => l.id === lid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.layers.length) return s;
      const layers = [...s.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...s, layers };
    });
  /** At the drop point, or (a tap) cascading down the screen so new layers don't land on each other. */
  const addLayer = (aid: string, cx?: number, cy?: number) => {
    const a = byId(aid);
    if (!a) return;
    const n = scene.layers.length;
    const l = newLayer(a, cx ?? 0.5, cy ?? (n ? 0.22 + 0.14 * (n % 5) : 0.5));
    setScene((s) => ({ ...s, layers: [...s.layers, l] }));
    setSel(l.id);
    setMode("screen");
    say(`${a.name} added to the screen`);
  };
  const openScreen = () => {
    if (!scene.layers.length) addLayer(id); // start from what you were looking at
    else setMode("screen");
    setLibOpen(false);
  };
  const stepAnim = (dir: number) => {
    setMode("single");
    setId((cur) => ANIMS[(ANIMS.findIndex((a) => a.id === cur) + dir + ANIMS.length) % ANIMS.length].id);
  };
  const openAnim = (aid: string) => {
    setId(aid);
    setMode("single");
    setLibOpen(false);
  };
  const setMedia = (f: File | null) => {
    if (media) URL.revokeObjectURL(media.url);
    setMediaState(f ? { url: URL.createObjectURL(f), video: f.type.startsWith("video/"), name: f.name } : null);
  };

  // a fresh document means fresh measurements; the theme flips live and rotation/folding resize, so neither reloads
  const docKey = `${mode}|${id}|${shown}|${reduce}|${nativeDpr}|${replay}|${siteMode ? `${site}|${siteVia}` : ""}`;
  const measureKey = `${docKey}|${landscape}|${posture}`;
  useEffect(() => {
    setPerf({});
    setErrors({});
  }, [measureKey]);

  /* ---------- engine <-> iframe messaging ---------- */
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  // the src each frame said "ready" from: until the current document says it, there's nobody to talk to
  const ready = useRef(new WeakMap<HTMLIFrameElement, string>());
  const sent = useRef(new Map<string, string>()); // last params each frame got, so a drag doesn't re-send them
  const live = useRef({ values, dark, scene, media, hl, replay });
  live.current = { values, dark, scene, media, hl, replay };
  const valuesOf = (fid: string): Values => {
    const lid = fid.split("~")[1];
    if (!lid) return live.current.values;
    const l = live.current.scene.layers.find((x) => x.id === lid);
    const a = l && byId(l.anim);
    return a ? withDefaults(a, l.values) : {};
  };
  const post = (fid: string, el: HTMLIFrameElement, msg: object) => el.contentWindow?.postMessage({ source: "anim-engine-host", ...msg }, frameOrigin(fid));
  const sendParams = (fid: string, el: HTMLIFrameElement, force = false) => {
    const v = valuesOf(fid);
    const json = JSON.stringify(v);
    if (!force && sent.current.get(fid) === json) return;
    sent.current.set(fid, json);
    post(fid, el, { type: "params", values: v });
  };
  const isReady = (el: HTMLIFrameElement) => ready.current.get(el) === el.src;
  // A layer is bare (its stand-in skeleton app steps aside) when anything is behind it: a background image, video
  // or colour, or another visible layer under it. Only a lone animation on an empty screen gets the skeleton.
  const bareSent = useRef(new Map<string, boolean>());
  const sendBare = (fid: string, el: HTMLIFrameElement, force = false) => {
    const lid = fid.split("~")[1];
    if (!lid) return;
    const { scene: sc, media: m } = live.current;
    const below = sc.layers.filter((l) => !l.hidden).findIndex((l) => l.id === lid);
    const on = !!m || !!sc.bg || below > 0;
    if (!force && bareSent.current.get(fid) === on) return;
    bareSent.current.set(fid, on);
    post(fid, el, { type: "bare", on });
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (d?.source !== "anim-engine-stage" || typeof d.frame !== "string" || e.origin !== frameOrigin(d.frame)) return;
      const el = frames.current.get(d.frame);
      if (!el || e.source !== el.contentWindow) return; // a frame we already replaced
      if (d.type === "ready") {
        setInks(({ [d.frame]: _, ...rest }) => rest); // a fresh document hasn't asked for anything yet
        ready.current.set(el, el.src);
        post(d.frame, el, { type: "theme", scheme: live.current.dark ? "dark" : "light" });
        sendParams(d.frame, el, true);
        sendBare(d.frame, el, true);
        if (live.current.hl) post(d.frame, el, { type: "hairline", on: true });
      } else if (d.type === "perf") setPerf((p) => ({ ...p, [d.frame]: { ...d, history: [...(p[d.frame]?.history ?? []).slice(-47), d.fps] } }));
      else if (d.type === "error") setErrors((x) => ({ ...x, [d.frame]: d.message }));
      else if (d.type === "status") {
        const ink = (k: string) => (d[k] === "light" || d[k] === "dark" ? d[k] : undefined);
        setInks((x) => ({ ...x, [d.frame]: { top: ink("top"), bottom: ink("bottom") } }));
      } else if (d.type === "painted") setLoaded((x) => ({ ...x, [d.frame]: `${live.current.replay}|${el.src}` }));
      else if (d.type === "ground" && typeof d.top === "string" && typeof d.bottom === "string") {
        setSiteGround((x) => ({ ...x, [d.frame]: { top: d.top, bottom: d.bottom } }));
        setInks((x) => ({ ...x, [d.frame]: { top: inkOn(d.top), bottom: inkOn(d.bottom) } }));
      }
      else if (d.type === "navigate" && typeof d.url === "string" && d.frame.startsWith("site-")) {
        // a link clicked on one device: every device follows
        setSite(d.url);
        setRecent((r) => [d.url, ...r.filter((x) => x !== d.url)].slice(0, 6));
      } else if (d.type === "size") {
        // a freshly placed animation reports its natural size a few times as it plays; the box follows until
        // someone resizes it by hand
        const lid = d.frame.split("~")[1];
        const l = live.current.scene.layers.find((x) => x.id === lid);
        const fit = (n: number) => Math.round(Math.min(1600, Math.max(80, Number(n) || 0)));
        if (l?.auto) updateLayer(l.id, { w: fit(d.w), h: fit(d.h) });
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [updateLayer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => frames.current.forEach((el, fid) => isReady(el) && sendParams(fid, el)), [values, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => frames.current.forEach((el, fid) => isReady(el) && sendBare(fid, el)), [scene, media]); // eslint-disable-line react-hooks/exhaustive-deps
  // theme switches live inside every device — no reload, the animation keeps playing
  useEffect(() => frames.current.forEach((el, fid) => isReady(el) && post(fid, el, { type: "theme", scheme: dark ? "dark" : "light" })), [dark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => frames.current.forEach((el, fid) => isReady(el) && post(fid, el, { type: "hairline", on: hl })), [hl]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadTimer = useRef(0);
  const setParam = (k: string, v: Value) => {
    if (layer) updateLayer(layer.id, { values: { ...layer.values, [k]: v } });
    else setOverrides((o) => ({ ...o, [id]: { ...o[id], [k]: v } }));
    if (subject.html && subject.schema[k]?.reload) {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => setReplay((r) => r + 1), 400);
    }
  };
  const resetParams = () => {
    if (layer) updateLayer(layer.id, { values: {} });
    else setOverrides(({ [id]: _, ...rest }) => rest);
    if (subject.html) setReplay((r) => r + 1);
  };

  const exportZip = () => {
    setExporting(true);
    downloadZip(subject, subjectValues)
      .then(() => say(`Downloaded ${subject.id}-export.zip`))
      .catch(() => say("Export failed"))
      .finally(() => setExporting(false));
  };

  // the theme a frame loads with is only its first paint; after that it's driven by messages
  const loadTheme = useRef({ key: "", dark });
  if (loadTheme.current.key !== docKey) loadTheme.current = { key: docKey, dark };
  const src = (d: Device, a: AnimMeta, fid: string) => {
    const q = new URLSearchParams({ frame: fid, rm: reduce ? "1" : "0", cs: loadTheme.current.dark ? "dark" : "light", host: location.origin });
    if (nativeDpr) q.set("dpr", String(d.dpr));
    if (!a.html) q.set("a", a.id);
    if (fid.includes("~")) q.set("layer", "1");
    return `${frameOrigin(fid)}${a.html ? htmlUrl(a) : "/stage.html"}?${q}`;
  };
  // on its own site (preview.localhost), like the device frames: Chrome runs it in a process of its own, so a live
  // product never takes frames from the page around it (same-origin, Home's phone held the page to ~20 fps)
  const previewSrc = (a: AnimMeta) => {
    const q = new URLSearchParams({ frame: "ghost", rm: "0", cs: dark ? "dark" : "light", host: location.origin });
    if (!a.html) q.set("a", a.id);
    return `${frameOrigin("preview")}${a.html ? htmlUrl(a) : "/stage.html"}?${q}`;
  };

  /* ---------- keyboard ---------- */
  const firstViewport = viewport(devices[0], landscape, posture);
  const env = useRef({ wide, tablet, keys, screen, sel, vp: firstViewport, layers: scene.layers });
  env.current = { wide, tablet, keys, screen, sel, vp: firstViewport, layers: scene.layers };
  const stepRef = useRef(stepAnim);
  stepRef.current = stepAnim;
  const openLibrary = useCallback((focusSearch: boolean) => {
    if (env.current.tablet) {
      setPanel("library");
      setPanelOpen(true);
    } else if (!env.current.wide) setLibOpen(true);
    if (focusSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, []);
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openLibrary(true);
        return;
      }
      const t = e.target instanceof Element ? e.target : null;
      const typing = t?.closest("input, textarea, select, [contenteditable]");
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      const s = env.current;
      // the picked layer: arrows move it, Delete removes it (not character keys, so they stay on)
      if (s.screen && s.sel && !t?.closest('[role="radiogroup"], [role="tablist"], [role="dialog"], dialog, [popover]')) {
        const l = s.layers.find((x) => x.id === s.sel);
        const step = e.shiftKey ? 10 : 1;
        const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
        if (l && by && !l.fill) {
          e.preventDefault();
          updateLayer(l.id, { cx: Math.min(1, Math.max(0, l.cx + by[0] / s.vp.w)), cy: Math.min(1, Math.max(0, l.cy + by[1] / s.vp.h)) });
          return;
        }
        if (l && (e.key === "Delete" || e.key === "Backspace")) {
          e.preventDefault();
          setScene((sc) => ({ ...sc, layers: sc.layers.filter((x) => x.id !== l.id) }));
          setSel(null);
          return;
        }
        if (e.key === "Escape") return setSel(null);
      }
      if (!s.keys) return;
      const map: Record<string, () => void> = {
        "1": () => setView("iphone"),
        "2": () => setView("duo"),
        "3": () => setView("ipad"),
        "4": () => setView("macbook"),
        "5": () => setView("compare"),
        f: () => setPosture((p) => (p === "folded" ? "open" : "folded")),
        l: () => setLandscape((x) => !x),
        t: flipTheme,
        m: () => setReduce((x) => !x),
        h: () => setHl((x) => !x),
        r: () => setReplay((x) => x + 1),
        "[": () => stepRef.current(-1),
        "]": () => stepRef.current(1),
        "/": () => openLibrary(true),
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
  }, [openLibrary, updateLayer]);

  /* ---------- drag an animation out of the library onto a screen ---------- */
  // Listeners go on the moment the drag starts (not in an effect after the next render), so a quick release can't
  // slip past and leave a drag stuck; cancel, Escape and the window losing focus all end it.
  const addRef = useRef(addLayer);
  addRef.current = addLayer;
  const beginDrag = (anim: string, x: number, y: number) => {
    setLibOpen(false);
    getSelection()?.removeAllRanges();
    document.body.classList.add("select-none");
    let over: Drag["over"] = null;
    setDrag({ anim, x, y, over });
    const move = (e: PointerEvent) => {
      // the shield sits over every iframe, so the screen under the pointer is found by looking through it
      const el = document.elementsFromPoint(e.clientX, e.clientY).find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.screen);
      const r = el?.getBoundingClientRect();
      over = el && r ? { device: el.dataset.screen!, cx: (e.clientX - r.left) / r.width, cy: (e.clientY - r.top) / r.height } : null;
      setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, over });
    };
    const end = (drop: boolean) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", cancel);
      removeEventListener("keydown", esc);
      removeEventListener("blur", cancel);
      document.body.classList.remove("select-none");
      if (drop && over) addRef.current(anim, over.cx, over.cy);
      setDrag(null);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && end(false);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", cancel);
    addEventListener("keydown", esc);
    addEventListener("blur", cancel);
  };

  // drop an image or video anywhere on the page to put it behind the screen
  useEffect(() => {
    const enter = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && setFileDrag(true);
    addEventListener("dragenter", enter);
    return () => removeEventListener("dragenter", enter);
  }, []);

  /* ---------- stage fit ---------- */
  const [box, setBox] = useState({ w: 800, h: 600 });
  const observer = useRef<ResizeObserver | null>(null);
  // a callback ref: the stage element changes when the layout switches between phone and desktop
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    observer.current.observe(el);
  }, []);
  const compare = devices.length > 1;
  const sizes = devices.map((d) => (d.fold ? frameSize(d, duoPose.landscape, duoPose.posture) : frameSize(d, landscape, posture)));
  const PAD = phone ? 16 : short ? 12 : 40;
  const GAP = phone ? 24 : 48;
  // the floating dock under the devices (on a phone the Duo's posture gets a second row)
  const DOCK = phone ? 64 + (hasDuo ? 48 : 0) : short ? 56 : 64;
  const fit = Math.min(
    (box.w - PAD * 2 - GAP * (devices.length - 1)) / sizes.reduce((s, f) => s + f.w, 0),
    (box.h - PAD * 2 - DOCK - (compare ? 84 : 44)) / Math.max(...sizes.map((f) => f.h)),
    1,
  );
  const scale = !compare && zoom !== "fit" ? zoom : Math.max(0.05, fit);
  const canRotate = devices.some((d) => d.rotates);
  // when a fold or a rotation changes the device's footprint, the stage zooms with the hinge instead of jumping
  const [morph, setMorph] = useState(false);
  useEffect(() => {
    setMorph(true);
    const t = setTimeout(() => setMorph(false), DUO_MOVE + 150);
    return () => clearTimeout(t);
  }, [duoPose, landscape]);
  const ease = `${DUO_MOVE}ms cubic-bezier(0.32, 0.72, 0, 1)`;

  /* ---------- what the panels read ---------- */
  const stagePerf = useMemo(() => {
    if (siteMode) return Object.fromEntries(devices.flatMap((d) => (perf[`site-${d.id}`] ? [[d.id, perf[`site-${d.id}`]]] : [])));
    if (!screen) return perf;
    const out: Record<string, Perf> = {};
    for (const d of devices) {
      const ps = visible.map((l) => perf[`${d.id}~${l.id}`]).filter((p): p is Perf => !!p);
      if (ps.length) out[d.id] = aggregate(ps);
    }
    return out;
  }, [screen, siteMode, perf, devices, visible]);
  const subjectPerf = useMemo(() => {
    if (!layer) return perf;
    return Object.fromEntries(devices.flatMap((d) => (perf[`${d.id}~${layer.id}`] ? [[d.id, perf[`${d.id}~${layer.id}`]]] : [])));
  }, [layer, perf, devices]);
  const suggestions = useMemo(
    () => ((screen && !layer) || siteMode ? [] : suggest(subject, subjectValues, subjectPerf, devices, { reduce, nativeDpr, hostTflops })),
    [screen, siteMode, layer, subject, subjectValues, subjectPerf, devices, reduce, nativeDpr, hostTflops],
  );
  const issues = issueCount(suggestions);
  const act = (s: Suggestion) => (s.fix ? setParam(s.fix.key, s.fix.value) : s.action === "reduce" ? setReduce(true) : setNativeDpr(true));
  const h = health(devices, stagePerf, hostTflops);
  const insights = (
    <Insights
      devices={devices}
      perf={stagePerf}
      hostTflops={hostTflops}
      setHostTflops={(v) => {
        setHostTflops(v);
        store.set("hostGpu", v);
      }}
      nativeDpr={nativeDpr}
      setNativeDpr={setNativeDpr}
      suggestions={suggestions}
      act={act}
      breakdown={screen ? visible.map((l) => ({ id: l.id, name: byId(l.anim)!.name, perf: perf[`${devices[0].id}~${l.id}`] })) : undefined}
    />
  );
  // frame rate at a glance; everything else waits behind it
  const insightsChip = (onClick?: () => void) => (
    <button
      type="button"
      popoverTarget={onClick ? undefined : "insights"}
      onClick={onClick}
      aria-label={`Performance and checks: ${h ? `${Math.round(h.fps)} frames a second` : "measuring"}${issues ? `, ${issues} to fix` : ""}`}
      className="press flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-caption font-medium tabular-nums text-fg-2 hover:bg-surface-2 hover:text-fg"
    >
      <Dot tone={h ? fpsTone(h.fps) : "idle"} />
      {h ? `${Math.round(h.fps)} fps` : "Measuring"}
      {issues > 0 && <Count n={issues} tone="warn" />}
    </button>
  );

  const screenPanel = screen && (
    <ScreenPanel
      scene={scene}
      sel={sel}
      setSel={setSel}
      update={updateLayer}
      remove={removeLayer}
      reorder={reorderLayer}
      setBg={(bg) => setScene((s) => ({ ...s, bg }))}
      media={media}
      setMedia={setMedia}
    />
  );
  const sitePanel = siteMode && <SitePanel url={site} onOpen={openSite} how={siteHow} setHow={setSiteHow} check={siteCheck} viaEngine={siteVia} recent={recent} landscape={landscape} posture={posture} canProxy={isolate} />;
  const resetBtn = (big?: boolean) =>
    edited > 0 && (
      <Button size={big ? "md" : "sm"} variant="ghost" onClick={resetParams}>
        <ArrowCounterClockwise size={13} aria-hidden />
        Reset
      </Button>
    );

  /* ---------------- phone sheet ---------------- */
  const [lastSheet, setLastSheet] = useState<PhoneSheet | null>(null);
  useEffect(() => {
    if (sheet) return setLastSheet(sheet);
    const t = setTimeout(() => setLastSheet(null), 260); // keep the content while it slides away
    return () => clearTimeout(t);
  }, [sheet]);
  const closeSheet = useCallback(() => setSheet(null), []);

  /** The live frames on a device: the animation, or every visible layer of the built screen. */
  const itemsFor = (d: Device) =>
    screen
      ? visible.map((l) => ({ fid: `${d.id}~${l.id}`, a: byId(l.anim)!, key: `${l.id}-${d.id}-${replay}`, l }))
      : [{ fid: d.id, a: anim, key: `${anim.id}-${d.id}-${replay}`, l: null as Layer | null }];
  // system ink: the top-most layer that asked for one decides (a bare layer asks for nothing)
  const inkFor = (d: Device) => (siteMode ? inks[`site-${d.id}`] : itemsFor(d).map((it) => inks[it.fid]).filter((x) => x?.top || x?.bottom).at(-1));
  /** A web page on a device: as it is, or through the engine (for pages that refuse frames). Each device is its own site
      (site-iphone.localhost…), so a page through the engine never shares an origin with the engine or another device. */
  const siteFrame = (d: Device, zoomed: number) => {
    const page = site;
    if (!page)
      return (
        <div className="pointer-events-none absolute inset-6 grid place-items-center rounded-[28px] border-2 border-dashed border-line-strong p-8 text-center text-balance">
          <span>
            <Globe size={34} aria-hidden className="mx-auto text-fg-3" />
            <span className="mt-3 block text-[19px] font-semibold text-fg-2">Type a web address</span>
            <span className="mt-1 block text-[15px] text-fg-3">It opens on every device, each at its own screen size</span>
          </span>
        </div>
      );
    const fid = `site-${d.id}`;
    let url = page;
    if (siteVia) {
      const q = new URLSearchParams({ u: site, ua: d.id, frame: fid, rm: reduce ? "1" : "0", cs: loadTheme.current.dark ? "dark" : "light", host: location.origin });
      if (nativeDpr) q.set("dpr", String(d.dpr));
      url = `${frameOrigin(fid)}/__site/go?${q}`;
    }
    const doc = `${replay}|${url}`;
    // Safari keeps a page out from under the status bar and the home indicator, and paints those strips in its colours
    const v = viewport(d, landscape, posture);
    const inset = d.id === "iphone" && v.h > v.w ? { top: 54, bottom: 34 } : d.id === "ipad" ? { top: 24, bottom: 20 } : { top: 0, bottom: 0 };
    const ground = siteGround[fid] ?? { top: SCREEN_BG(dark), bottom: SCREEN_BG(dark) };
    return (
      <div className="absolute inset-0" style={{ background: `linear-gradient(${ground.top} 50%, ${ground.bottom} 50%)`, paddingTop: inset.top, paddingBottom: inset.bottom }}>
        <div className="relative h-full w-full">
        {!siteWaiting && (
          <iframe
            key={doc}
            ref={(el) => {
              if (el) frames.current.set(fid, el);
              else frames.current.delete(fid);
            }}
            title={`${hostOf(site)} on ${d.name}`}
            src={url}
            // never navigates the engine away (through the engine it's on a site of its own, so it keeps an origin)
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
            allow="fullscreen; clipboard-write; autoplay"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded((x) => ({ ...x, [fid]: doc }))}
            className="block h-full w-full border-0"
            style={{ background: "#fff" }}
          />
        )}
        {(siteWaiting || loaded[fid] !== doc) && (
          <div className={`absolute inset-0 grid place-items-center ${siteWaiting ? "" : "veil-late"}`} style={{ background: SCREEN_BG(dark) }}>
            <Spinner size={22 / zoomed} />
          </div>
        )}
        </div>
      </div>
    );
  };
  /** What's on a device's screen: the background file, then the frames. The stage and the studio both draw it. */
  const screenFor = (d: Device, zoomed: number) => (
    <>
      {screen &&
        media &&
        (media.video ? (
          <video src={media.url} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ))}
      {itemsFor(d).map(({ fid, a, key, l }) => {
        const url = src(d, a, fid);
        const doc = `${key}|${url}`;
        return (
          <div key={key} style={l ? layerBox(l) : { position: "absolute", inset: 0 }}>
            <iframe
              ref={(el) => {
                if (el) frames.current.set(fid, el);
                else frames.current.delete(fid);
              }}
              title={`${a.name} on ${d.name}`}
              src={url}
              onLoad={() => setLoaded((x) => ({ ...x, [fid]: doc }))}
              className="block h-full w-full border-0"
              style={{ background: l ? "transparent" : SCREEN_BG(dark) }}
            />
            {loaded[fid] !== doc && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: l ? undefined : SCREEN_BG(dark) }}>
                <Spinner size={22 / zoomed} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  /** The command palette's items: the components opened lately, quick actions (with their keys), every component. */
  const paletteItems = (): PaletteItem[] => {
    const thumb = (aid: string) => `/thumbs/${aid}-${dark ? "dark" : "light"}.webp`;
    const open = (aid: string) => (openAnim(aid), setSpace("work"));
    return [
      ...recentAnims
        .slice(0, 4)
        .map((x) => byId(x))
        .filter((a): a is AnimMeta => !!a)
        .map((a) => ({ id: `r-${a.id}`, group: "recent" as const, title: a.name, sub: a.category, picture: thumb(a.id), run: () => open(a.id) })),
      { id: "a-screen", group: "actions", title: "Build a screen", sub: "Several components on one device, measured together", icon: Stack, tone: "var(--k-component)", run: () => (setSpace("work"), openScreen()) },
      { id: "a-site", group: "actions", title: "Check a website", sub: "Any address on every device", icon: Globe, tone: "var(--k-scene)", run: () => (setSpace("work"), setMode("site")) },
      ...(IMPORT ? [{ id: "a-import", group: "actions" as const, title: "Import a component from code", icon: FileCode, tone: "var(--k-callout)", run: () => setImporting(true) }] : []),
      { id: "a-theme", group: "actions", title: dark ? "Light theme" : "Dark theme", icon: dark ? Sun : Moon, kbd: "T", run: flipTheme },
      { id: "a-tips", group: "actions", title: tips ? "Hide tips" : "Show tips", icon: Question, run: () => setTips(!tips) },
      { id: "a-keys", group: "actions", title: "Keyboard shortcuts", icon: Keyboard, kbd: "?", run: () => setHelp(true) },
      { id: "s-party", group: "actions", secret: true, title: "Throw a party", sub: "You found a secret", icon: Sparkle, words: "party confetti celebrate fun", run: party },
      { id: "s-roll", group: "actions", secret: true, title: "Do a barrel roll", sub: "You found a secret", icon: ArrowsClockwise, words: "barrel roll spin flip", run: barrelRoll },
      ...SPACES.map((sp) => ({ id: `p-${sp.id}`, group: "places" as const, title: sp.name, icon: sp.icon, run: () => setSpace(sp.id) })),
      ...ANIMS.map((a) => ({ id: `c-${a.id}`, group: "products" as const, title: a.name, sub: a.category, picture: thumb(a.id), words: `${a.blurb} ${a.tech.join(" ")} ${a.brand ?? ""}`, run: () => open(a.id) })),
    ];
  };

  // devices on row 1 sharing a baseline, captions on row 2, so a caption that wraps never lifts its device
  const stage = (
    <div
      ref={stageRef}
      className="scroll-thin relative min-h-0 flex-1 overflow-auto"
      onPointerDown={(e) => screen && !(e.target as Element).closest("[data-screen]") && setSel(null)}
    >
      <div className="flex min-h-full min-w-full items-center justify-center" style={{ width: "max-content", padding: PAD, paddingBottom: PAD + DOCK }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${devices.length}, auto)`, columnGap: GAP, rowGap: 14 }}>
          {devices.map((d, i) => {
            const v = viewport(d, landscape, posture);
            const items = itemsFor(d);
            const fps = stagePerf[d.id]?.fps;
            const error = items.map((it) => errors[it.fid]).find(Boolean);
            const w = sizes[i].w * scale;
            const dropping = drag?.over?.device === d.id ? drag : null;
            const ink = inkFor(d);
            return (
              <figure key={d.id} className="contents">
                <div
                  style={{ gridColumn: i + 1, gridRow: 1, alignSelf: "end", justifySelf: "center", width: w, height: sizes[i].h * scale, transition: morph ? `width ${ease}, height ${ease}` : undefined }}
                >
                  <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", transition: morph ? `transform ${ease}` : undefined }}>
                    <DeviceFrame d={d} landscape={landscape} dark={dark} posture={posture} onPose={setDuoPose} ink={ink}>
                      <div data-screen={d.id} className="absolute inset-0 overflow-hidden" style={screen ? { background: scene.bg || SCREEN_BG(dark) } : undefined}>
                        {siteMode ? siteFrame(d, scale) : screenFor(d, scale)}
                        {screen &&
                          arrange &&
                          visible.map((l) => (
                            <LayerHandle key={l.id} l={l} selected={l.id === sel} onSelect={() => setSel(l.id)} onChange={(p) => updateLayer(l.id, p)} screen={v} scale={scale} />
                          ))}
                        {screen && !visible.length && !dropping?.over && (
                          <div className="pointer-events-none absolute inset-6 grid place-items-center rounded-[28px] border-2 border-dashed border-line-strong p-8 text-center text-balance">
                            <span>
                              <Plus size={34} aria-hidden className="mx-auto text-fg-3" />
                              <span className="mt-3 block text-[19px] font-semibold text-fg-2">Drop animations here</span>
                              <span className="mt-1 block text-[15px] text-fg-3">{coarse ? "Tap + on a card in the library" : "Drag a card from the library, or press + on it"}</span>
                            </span>
                          </div>
                        )}
                        {dropping?.over && (
                          <DropOutline l={{ cx: dropping.over.cx, cy: dropping.over.cy, w: 340, h: 340, fill: byId(dropping.anim)?.layout === "fill" }} scale={scale} />
                        )}
                      </div>
                    </DeviceFrame>
                  </div>
                </div>
                <figcaption
                  className={`flex flex-wrap content-start items-center justify-center gap-x-2 gap-y-1 text-center text-caption text-fg-3 ${compare ? "flex-col" : ""}`}
                  style={{ gridColumn: i + 1, gridRow: 2, alignSelf: "start", justifySelf: "center", width: compare ? Math.max(w, 96) : undefined, maxWidth: compare ? undefined : Math.max(240, box.w - PAD * 2) }}
                >
                  <span className="font-medium text-fg-2">{compare ? d.short : d.name}</span>
                  <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 tabular-nums">
                    {d.fold && <span>{POSTURES.find((p) => p.value === posture)!.label}</span>}
                    <span>
                      {v.w}×{v.h} · {breakpoint(v.w)}
                    </span>
                    {compare && fps != null && (
                      <span className="flex items-center gap-1.5">
                        <Dot tone={fpsTone(fps)} />
                        {Math.round(fps)} fps
                      </span>
                    )}
                    {reduce && <span className="text-fg-2">Reduced motion</span>}
                  </span>
                  {error && (
                    <span role="alert" className="flex w-full items-start justify-center gap-1.5 pt-1 text-left">
                      <WarningCircle size={14} aria-hidden className="mt-px shrink-0 text-bad-ink" />
                      <span className="mono text-caption text-fg-2">{error}</span>
                    </span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );

  const size = phone ? "lg" : "md";
  const tip = phone ? "bottom" : "top"; // the desktop dock sits at the bottom, so its tooltips open upwards
  const divider = <span aria-hidden className="dock-sep mx-1 h-5 w-px shrink-0 bg-line-strong" />;
  const rmBtn = (
    <IconButton size={size} label="Emulate reduced motion" kbd="M" tipSide={tip} active={reduce} onClick={() => setReduce(!reduce)}>
      <PersonArmsSpread size={18} />
    </IconButton>
  );
  const hlBtn = (
    <IconButton size={size} label="Hairline: redraw as thin lines" kbd="H" tipSide={tip} active={hl} onClick={() => setHl(!hl)}>
      <PenNib size={18} />
    </IconButton>
  );
  const rotateBtn = (
    <IconButton size={size} label="Rotate" kbd="L" tipSide={tip} active={landscape} disabled={!canRotate} onClick={() => setLandscape(!landscape)}>
      <DeviceRotate size={18} />
    </IconButton>
  );
  const replayBtn = (
    <IconButton size={size} label="Replay" kbd="R" tipSide={tip} onClick={() => setReplay((r) => r + 1)}>
      <ArrowCounterClockwise size={18} />
    </IconButton>
  );
  const themeBtn = (
    <IconButton size={phone ? "lg" : "md"} label={dark ? "Light theme" : "Dark theme"} kbd="T" tipSide={phone ? "bottom" : "top"} tipAlign="start" onClick={flipTheme}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
  const postureSeg = <Segmented size={phone ? "sm" : "md"} label="iPhone Duo posture" value={posture} onChange={setPosture} options={POSTURES} />;
  const pointerSeg = (
    <Segmented
      size={phone ? "sm" : "md"}
      label="Pointer"
      value={arrange ? "arrange" : "interact"}
      onChange={(v) => setArrange(v === "arrange")}
      tipSide={tip}
      hideLabels={phone ? undefined : "always"}
      options={[
        { value: "arrange", label: "Arrange layers", icon: Cursor },
        { value: "interact", label: "Use the animations", icon: HandPointing },
      ]}
    />
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
    </>
  );
  const library = (
    <Library
      id={id}
      overrides={overrides}
      searchRef={searchRef}
      screen={screen}
      onScreen={openScreen}
      layers={scene.layers.length}
      site={mode === "site"}
      siteHost={site ? hostOf(site) : ""}
      onSite={() => {
        setMode("site");
        setLibOpen(false);
      }}
      onImport={
        IMPORT
          ? () => {
              setLibOpen(false);
              setImporting(true);
            }
          : undefined
      }
      onPick={openAnim}
      onAdd={(x) => {
        addLayer(x);
        setLibOpen(false);
      }}
      onDrag={coarse ? undefined : beginDrag}
      onClose={wide || tablet ? undefined : () => setLibOpen(false)}
      visible={wide || libOpen || (tablet && panel === "library" && panelOpen)}
      bare={tablet}
      dark={dark}
      previewSrc={previewSrc}
      footer={rail ? undefined : appFoot}
    />
  );
  const dragAnim = drag && byId(drag.anim);
  const overlays = (
    <>
      {!wide && !tablet && (
        <Dialog open={libOpen} onClose={() => setLibOpen(false)} label="Library" className="drawer">
          {library}
        </Dialog>
      )}
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
      <ImportDialog key={`import-${importing}`} open={importing} onClose={() => setImporting(false)} />
      {rail && <Palette open={!!palette} query={palette?.q ?? ""} onClose={() => setPalette(null)} items={palette ? paletteItems() : []} />}
      {drag && dragAnim && (
        <>
          {/* over every iframe, so the pointer stays ours until the drop */}
          <div aria-hidden className="fixed inset-0 z-[90] cursor-grabbing" />
          <Ghost a={dragAnim} x={drag.x} y={drag.y} src={previewSrc(dragAnim)} over={!!drag.over} />
        </>
      )}
      {fileDrag && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(9_9_11/0.4)] p-6"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => e.target === e.currentTarget && setFileDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setFileDrag(false);
            const f = [...e.dataTransfer.files].find((x) => /^(image|video)\//.test(x.type));
            if (!f) return say("Only images and videos can go behind the screen");
            setMedia(f);
            if (!screen) openScreen();
            say(`${f.name} is now the screen background`);
          }}
        >
          <div className="pointer-events-none flex max-w-sm flex-col items-center gap-2 rounded-2xl bg-overlay px-8 py-7 text-center shadow-lg">
            <ImageSquare size={28} className="text-fg-2" aria-hidden />
            <p className="text-ui font-semibold">Drop to use as the screen background</p>
            <p className="text-body text-fg-2">Images and videos sit behind every animation on the screen you're building.</p>
          </div>
        </div>
      )}
      <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4 ${phone ? "top-[calc(env(safe-area-inset-top)+68px)]" : "bottom-[calc(env(safe-area-inset-bottom)+88px)]"}`}>
        {said && (
          <p key={said} className="pop-in btn-ink rounded-full px-4 py-2 text-caption font-medium">
            {said}
          </p>
        )}
      </div>
    </>
  );

  const surface = (
    <div className="fade-in relative flex min-h-0 flex-1 flex-col">
      {stage}
    </div>
  );

  /* ---------------- the island: the library, and the way back to it from the editor ---------------- */
  const home: Space = "library";
  const at: Space = space === "work" ? home : space;
  // straight there: a View Transition has to snapshot the page first (Home's live phone and sky took ~800 ms), so the
  // pages bring their own entrance instead (the title and cards rise in)
  // a place or an editor renders as a transition: what was pressed answers at once (a pill, a press), and the new page
  // is drawn in slices the browser can paint between, instead of one long block that held the pointer's answer back
  const go = (to: Space) =>
    startTransition(() => {
      setLibOpen(false);
      setSpace(to);
    });
  // the editor, full-screen: a component in its devices
  const edit = () =>
    startTransition(() => {
      setLibOpen(false);
      setSpace("work");
    });
  // + on the island: what can be started here
  const newMenu = (
    <div className="w-[288px] p-1.5">
      <p className="px-2.5 pb-1 pt-1.5 text-micro font-medium uppercase tracking-[0.06em] text-fg-3">Make</p>
      <MenuItem icon={Stack} tone="var(--k-component)" hint="Several components on one device, measured together." onSelect={() => (edit(), openScreen())}>
        A screen
      </MenuItem>
      <MenuItem icon={Globe} tone="var(--k-scene)" hint="Any web address on every device, each at its own size." onSelect={() => (edit(), setMode("site"))}>
        A website check
      </MenuItem>
      {IMPORT && (
        <MenuItem icon={FileCode} hint="Bring a component in from its code." onSelect={() => setImporting(true)}>
          A component, from code
        </MenuItem>
      )}
    </div>
  );
  // you: the avatar's menu (the theme, tips, shortcuts)
  const me = (
    <>
      <button type="button" popoverTarget="me-menu" aria-label="You" className="press ml-1 h-7 w-7 shrink-0 rounded-full shadow-[0_0_0_1px_var(--line-strong)] transition-transform duration-150 hover:scale-105" style={{ background: "conic-gradient(from 210deg at 35% 35%, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-1))" }} />
      <Popover id="me-menu" align="end" label="You">
        <div className="w-[260px] p-1.5">
          <div className="px-2.5 pb-2.5 pt-2">
            <p className="text-body font-medium">Syed</p>
            <p className="text-caption text-fg-3">Components</p>
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
              Show tips
            </label>
            <Switch id="me-tips" on={tips} onChange={setTips} />
          </div>
          <div className="mx-2 my-1.5 border-t" />
          <MenuItem icon={Keyboard} onSelect={() => setHelp(true)}>
            Keyboard shortcuts
          </MenuItem>
        </div>
      </Popover>
    </>
  );
  const island = <Island at={at} go={go} dance={dance} onLogo={party} onSearch={() => setPalette({ q: "" })} newMenu={newMenu} me={me} />;
  const back = space === "work" ? { label: SPACE_NAME[home], go: () => go(home) } : null;
  // a page has the island floating over its foot; an editor has its way back on its own dock instead
  const withRail = (body: ReactNode) => (
    <InBar.Provider value>
      <Back.Provider value={back}>
        <div className="flex h-full min-h-0">{body}</div>
        {space !== "work" && island}
      </Back.Provider>
    </InBar.Provider>
  );
  // the gallery: browse, then open full-screen
  if (rail && space === "library")
    return withRail(
      <>
        <LibraryPage dark={dark} current={anim.id} onOpen={(aid) => (openAnim(aid), edit())} onImport={IMPORT ? () => setImporting(true) : undefined} onScreen={() => (edit(), openScreen())} />
        {overlays}
      </>,
    );
  /* ---------------- phone: one top bar, the stage, one bar of tuning, sheets ---------------- */
  if (phone) {
    const content = sheet ?? lastSheet;
    const DeviceIcon = VIEWS.find((v) => v.value === shown)!.icon;
    const deviceMenu = (
      <>
        <button
          type="button"
          popoverTarget="device-menu"
          aria-label={`Device: ${devices[0].name}`}
          className="press flex h-10 items-center gap-1 rounded-lg pl-2.5 pr-2 text-fg hover:bg-surface-2"
        >
          <DeviceIcon size={18} aria-hidden />
          <CaretUpDown size={12} aria-hidden className="text-fg-3" />
        </button>
        <Popover id="device-menu" side="top" align="start" label="Device">
          <div role="radiogroup" aria-label="Device" className="w-[248px] p-1.5">
            {DEVICES.map((d) => {
              const V = VIEWS.find((x) => x.value === d.id)!;
              const on = shown === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={(e) => {
                    setView(d.id);
                    closePopover(e.currentTarget);
                  }}
                  className="press flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left text-body hover:bg-surface-2"
                >
                  <V.icon size={18} aria-hidden className="text-fg-2" />
                  <span className="flex-1">{d.name}</span>
                  {on && <Check size={15} weight="bold" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Popover>
      </>
    );
    return (
      <div className="flex h-full flex-col bg-canvas">
        <header className="shrink-0 border-b bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1.5 pl-1.5 pr-2">
            <button
              type="button"
              onClick={() => openLibrary(false)}
              aria-haspopup="dialog"
              aria-expanded={libOpen}
              aria-label={screen ? "Screen builder. Open the library" : siteMode ? "Website check. Open the library" : `${anim.name}, ${anim.category}. Choose another animation`}
              className="press flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-ui font-semibold">
                  <span className="truncate">{screen ? "Screen builder" : siteMode ? "Website check" : anim.name}</span>
                  <CaretDown size={12} weight="bold" aria-hidden className="shrink-0 text-fg-3" />
                </span>
                <span className="block truncate text-caption text-fg-3">{screen ? `${visible.length} on the screen` : siteMode ? (site ? hostOf(site) : "Any web address") : anim.category}</span>
              </span>
            </button>
            <IconButton size="lg" label="More" popover="phone-more">
              <DotsThree size={20} weight="bold" />
            </IconButton>
            <Popover id="phone-more" align="end" label="More">
              <div className="w-[280px] p-1.5">
                <MenuItem icon={screen ? DeviceMobile : Stack} onSelect={() => (screen ? setMode("single") : openScreen())}>
                  {screen ? "Back to the animation" : "Screen builder"}
                </MenuItem>
                <MenuItem icon={Gauge} hint={h ? `${Math.round(h.fps)} fps${issues ? `, ${issues} to fix` : ""}` : "Measuring"} onSelect={() => setSheet("insights")}>
                  Performance and checks
                </MenuItem>
                <MenuItem icon={FileZip} disabled={exporting || (screen && !layer)} onSelect={exportZip}>
                  {exporting ? "Packing…" : "Download the code"}
                </MenuItem>
                <MenuItem icon={dark ? Sun : Moon} onSelect={flipTheme}>
                  {dark ? "Light theme" : "Dark theme"}
                </MenuItem>
              </div>
            </Popover>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <main aria-label="Stage" className="relative flex min-h-0 flex-1 flex-col">
            {surface}
            {(
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-3">
                {hasDuo && <div className="pointer-events-auto rounded-xl bg-overlay p-1 shadow-md">{postureSeg}</div>}
                <div role="toolbar" aria-label="Stage" className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-overlay p-1 shadow-md">
                  {deviceMenu}
                  {rotateBtn}
                  {screen && (
                    <IconButton size="lg" label="Use the animations (off: arrange the layers)" active={!arrange} onClick={() => setArrange(!arrange)}>
                      <HandPointing size={18} />
                    </IconButton>
                  )}
                  {rmBtn}
                  {hlBtn}
                  {replayBtn}
                </div>
              </div>
            )}
          </main>
          {siteMode ? (
            <section aria-label="Website" className="shrink-0 border-t bg-surface px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
              <AddressForm url={site} onOpen={openSite} big />
              <button type="button" onClick={() => setSheet("props")} className="press mt-2 px-1 text-caption font-medium text-fg-2 underline decoration-fg-3 underline-offset-4">
                How it loads, breakpoints, recent
              </button>
            </section>
          ) : screen && !layer ? (
            <section aria-label="Screen builder" className="shrink-0 border-t bg-surface px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
              <p className="px-1 text-caption text-fg-3">{scene.layers.length ? "Tap a layer on the device to tune it." : "Add an animation to start building a screen."}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button size="lg" variant="primary" onClick={() => openLibrary(false)}>
                  <Plus size={16} weight="bold" aria-hidden />
                  Add animation
                </Button>
                <Button size="lg" onClick={() => setSheet("props")}>
                  <Stack size={16} aria-hidden />
                  Layers
                </Button>
              </div>
            </section>
          ) : (
            <AdjustBar anim={subject} values={subjectValues} setParam={setParam} onShowAll={() => setSheet("props")} />
          )}
          <Sheet
            open={!!sheet}
            onClose={closeSheet}
            title={
              content === "insights" ? "Performance" : screen ? "Screen" : siteMode ? "Website" : "Properties"
            }
            actions={content === "props" && !siteMode && (!screen || layer) ? resetBtn(true) : undefined}
          >
            {content === "insights" ? (
              <div className="[&>div]:w-full [&>div]:max-w-none [&>div]:max-h-none">{insights}</div>
            ) : (
              content === "props" &&
              (siteMode ? (
                sitePanel
              ) : (
                <>
                  {screenPanel}
                  {(!screen || layer) && <PropertiesPanel anim={subject} values={subjectValues} setParam={setParam} big />}
                </>
              ))
            )}
          </Sheet>
        </div>
        {overlays}
      </div>
    );
  }

  /* ---------------- tablet & desktop: library | stage | inspector ---------------- */
  const crumbs = !wide ? (
    <button
      type="button"
      onClick={() => openLibrary(!coarse)}
      aria-haspopup="dialog"
      aria-expanded={libOpen}
      aria-label={screen ? "Screen builder. Open the library" : siteMode ? "Website check. Open the library" : `${anim.name}, ${anim.category}. Choose another animation`}
      className="press flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-body hover:bg-surface-2"
    >
      <span className="truncate font-medium">{screen ? "Screen builder" : siteMode ? (site ? hostOf(site) : "Website check") : anim.name}</span>
      <CaretDown size={11} weight="bold" aria-hidden className="shrink-0 text-fg-3" />
    </button>
  ) : (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-body">
        {screen ? (
          <li aria-current="page" className="truncate font-medium">
            Screen builder
          </li>
        ) : siteMode ? (
          <>
            <li className="hidden shrink-0 text-fg-3 lg:block">Website check</li>
            {site && (
              <>
                <li aria-hidden className="hidden text-fg-3 lg:block">
                  /
                </li>
                <li aria-current="page" className="truncate font-medium">
                  {hostOf(site)}
                </li>
              </>
            )}
          </>
        ) : (
          <>
            <li className="hidden shrink-0 text-fg-3 lg:block">{anim.category}</li>
            <li aria-hidden className="hidden text-fg-3 lg:block">
              /
            </li>
            <li aria-current="page" title={anim.blurb} className="truncate font-medium">
              {anim.name}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
  const exportBtn = (
    <>
      <Button variant="primary" popover="export-pop">
        <DownloadSimple size={14} weight="bold" aria-hidden />
        Export
      </Button>
      <Popover id="export-pop" align="end" label="Export">
        <CodeExport anim={subject} values={subjectValues} exporting={exporting} exportZip={exportZip} say={say} />
      </Popover>
    </>
  );
  const dock = (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
      <div role="toolbar" aria-label="Stage" className="dock pointer-events-auto max-w-full overflow-x-auto no-scrollbar">
        <DockBack />
        <Segmented label="Device" value={shown} onChange={setView} options={VIEWS} hideLabels="always" tipSide="top" />
        {rotateBtn}
        {hasDuo && divider}
        {hasDuo && postureSeg}
        {screen && divider}
        {screen && pointerSeg}
        {divider}
        {rmBtn}
        {hlBtn}
        {replayBtn}
        {divider}
        {insightsChip()}
        <Popover id="insights" side="top" align="end" label="Performance and checks">
          {insights}
        </Popover>
      </div>
    </div>
  );

  /** What the inspector shows, wherever it sits: the mockup's settings, the screen's layers, or the properties. */
  const inspectorBody = (cols: boolean) =>
    siteMode ? (
      sitePanel
    ) : screen ? (
      <>
        {screenPanel}
        {layer ? (
          <>
            <div className="flex h-11 items-center gap-2 border-y bg-surface-2/50 pl-4 pr-2.5">
              <SlidersHorizontal size={15} aria-hidden className="shrink-0 text-fg-3" />
              <p className="mr-auto truncate text-body font-medium">{subject.name}</p>
              {resetBtn()}
            </div>
            <PropertiesPanel anim={subject} values={subjectValues} setParam={setParam} cols={cols} />
          </>
        ) : (
          scene.layers.length > 0 && <p className="px-6 py-8 text-center text-caption text-fg-3">Pick a layer to tune its properties.</p>
        )}
      </>
    ) : (
      <PropertiesPanel anim={subject} values={subjectValues} setParam={setParam} cols={cols} />
    );
  // the inspector names what it's showing, beside its kind: the picked layer, the screen, the site, the animation
  const inspectTitle = screen ? "Screen" : siteMode ? "Website" : anim.name;

  /* ---------------- tablet held upright: the stage full width, a panel under it ---------------- */
  if (tablet) {
    return (
      <div className="flex h-full flex-col bg-canvas">
        <header className="@container grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-surface px-2">
          <div className="flex min-w-0 items-center gap-1 pl-1">
            {crumbs}
            {!screen && !siteMode && (
              <span className="flex items-center">
                <IconButton label="Previous animation" kbd="[" onClick={() => stepAnim(-1)}>
                  <CaretLeft size={16} />
                </IconButton>
                <IconButton label="Next animation" kbd="]" onClick={() => stepAnim(1)}>
                  <CaretRight size={16} />
                </IconButton>
              </span>
            )}
          </div>
          <span />
          <div className="flex min-w-0 items-center justify-end gap-1.5">{!siteMode && exportBtn}</div>
        </header>
        <main aria-label="Stage" className="relative flex min-h-0 flex-1 flex-col">
          {surface}
          {dock}
        </main>
        {/* a sheet over the bottom of the stage: the handle says it moves, the header says what's in it */}
        <section
          aria-label={panel === "library" ? "Library" : inspectTitle}
          className={`flex shrink-0 flex-col rounded-t-2xl border-t bg-surface shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] ${panelOpen ? "h-[40%]" : ""}`}
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
            <>
              <div className="flex h-12 shrink-0 items-center gap-2 pl-3 pr-2">
                <Segmented
                  label="Panel"
                  value={panel}
                  onChange={(v) => {
                    setPanel(v);
                    setPanelOpen(true);
                  }}
                  options={[
                    { value: "inspect", label: inspectTitle, icon: SlidersHorizontal },
                    { value: "library", label: "Library", icon: SquaresFour },
                  ]}
                />
                {panel === "inspect" && panelOpen && resetBtn()}
                <span className="ml-auto" />
                <IconButton label={panelOpen ? "Hide the panel" : "Show the panel"} expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
                  {panelOpen ? <CaretDown size={18} /> : <CaretUp size={18} />}
                </IconButton>
              </div>
              {panelOpen && <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t">{panel === "library" ? library : inspectorBody(true)}</div>}
            </>
        </section>
        {overlays}
      </div>
    );
  }

  // the library beside the stage, unless hidden or focused
  const sideShown = !focus && !rail && wide && sideOn;
  const desk = (
    <div className="flex h-full min-w-0 flex-1">
      <a href="#inspector" className="skip-link">
        Skip to inspector
      </a>
      {sideShown && <aside className="w-[248px] shrink-0 overflow-hidden border-r bg-surface">{library}</aside>}

      <main aria-label="Stage" className="stage-ground relative flex min-w-0 flex-1 flex-col">
        {/* the stage's toolbar: the panel toggle and where you are (left), what you can do with it (right) */}
        <div className="@container relative z-30 grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-surface px-2">
          <div className="flex h-10 min-w-0 items-center gap-0.5 justify-self-start">
            {!rail && (
              <IconButton label={sideShown ? "Hide the sidebar" : "Show the sidebar"} expanded={sideShown} onClick={() => (setFocus(false), setLeftPanel(!sideShown))}>
                <SidebarSimple size={17} />
              </IconButton>
            )}
            {!sideShown && <span className="truncate px-1.5 text-body font-medium">{screen ? "Screen builder" : siteMode ? (site ? hostOf(site) : "Website check") : anim.name}</span>}
          </div>
          <span />
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            {!compare && (
              <span className="relative hidden lg:block">
                <Select
                  aria-label="Zoom"
                  value={String(zoom)}
                  onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
                  className={`${field} h-8 w-[72px] cursor-pointer appearance-none pl-2.5 pr-6 text-body tabular-nums`}
                >
                  <option value="fit">Fit</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                </Select>
              </span>
            )}
            <IconButton label={focus ? "Show the panels" : "Focus: hide the panels"} kbd="Ctrl ." active={focus} onClick={() => setFocus(!focus)} tipAlign="end">
              {focus ? <CornersIn size={17} /> : <CornersOut size={17} />}
            </IconButton>
            {!siteMode && exportBtn}
          </div>
        </div>
        {surface}
        {dock}
      </main>

      {!focus && <Inspector title={inspectTitle} icon={<KindTile icon={screen ? Stack : siteMode ? Globe : CATEGORY_ICON[anim.category]} tone="var(--fg-2)" />} actions={!screen ? resetBtn() : undefined}>
        {inspectorBody(false)}
      </Inspector>}
      {overlays}
    </div>
  );
  return rail ? withRail(desk) : desk;
}

const SPACE_NAME = Object.fromEntries(PLACES.map((x) => [x.id, x.name])) as Record<Space, string>;

function Spinner({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="animate-spin text-fg-3 motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label="Loading">
      <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" opacity=".2" />
    </svg>
  );
}
