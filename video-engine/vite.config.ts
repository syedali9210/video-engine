import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { studio } from "./server/studio";
import { lab } from "./server/lab";
import { work } from "./server/work";
import { templates } from "./server/templates";
import { kits } from "./server/kits";
import { gates } from "./server/gates";
import { versions } from "./server/versions";
import { briefs } from "./server/briefs";
import { voice } from "./server/voice";
import { reviews } from "./server/reviews";
import { search } from "./server/search";
import { shaders } from "./server/shaders";
import { maker } from "./server/maker";
import ts from "typescript";

// The canvas's real devices (src/canvas/device3d.ts): canvas.js loads them from canvas-3d.js beside it. Built, that's
// a file of its own; in development, the dev server hands over the source.
const canvas3d = (): Plugin => ({
  name: "canvas-3d",
  configureServer(s) {
    s.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0] !== "/canvas-3d.js") return next();
      res.statusCode = 302;
      res.setHeader("location", "/src/canvas/device3d.ts");
      res.end();
    });
  },
});

// Phosphor's index re-exports all 3,000 icons in six weights: 17 MB of JavaScript the dev server parsed on every load.
// Each `import { A, B } from "@phosphor-icons/react"` becomes one import per icon from its own file; a name with no
// file of its own (a type, like IconProps) stays a type-only import, which compiles away.
const ICONS = "node_modules/@phosphor-icons/react/dist/csr/";
const isIcon = new Map<string, boolean>();
const phosphorPerIcon = (): Plugin => ({
  name: "phosphor-per-icon",
  enforce: "pre",
  transform(code, id) {
    if (id.includes("node_modules") || !/\.[jt]sx?$/.test(id.split("?")[0]) || !code.includes("@phosphor-icons/react\"")) return;
    return code.replace(/import\s*\{([^}]+)\}\s*from\s*"@phosphor-icons\/react";?/g, (_, names: string) => {
      const out: string[] = [];
      const types: string[] = [];
      for (const raw of names.split(",").map((x) => x.trim()).filter(Boolean)) {
        const spec = raw.replace(/^type\s+/, "");
        const name = spec.split(/\s+as\s+/)[0];
        if (!isIcon.has(name)) isIcon.set(name, existsSync(`${ICONS}${name}.es.js`));
        if (raw.startsWith("type ") || !isIcon.get(name)) types.push(spec);
        else out.push(`import { ${spec} } from "@phosphor-icons/react/dist/csr/${name}";`);
      }
      if (types.length) out.push(`import type { ${types.join(", ")} } from "@phosphor-icons/react";`);
      return out.join("\n");
    });
  },
});

// Every element a launch film draws says where in its code it's written (data-k="spotlight:612:7"), so the Studio can
// pick any part of a film and change how it looks (kit.tsx: pickAt, the looks). Copies made by one line (a map) share it.
const FILMS = /src[\\/]animations[\\/](film-[\w-]+|reel-[\w-]+|_film)[\\/][\w.-]+\.tsx$/;
const filmKeys = (): Plugin => ({
  name: "film-keys",
  enforce: "pre",
  transform(code, id) {
    const m = FILMS.exec(id.split("?")[0]);
    if (!m) return;
    const sf = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const name = m[1].replace(/^(film|reel)-/, "");
    const at: [number, string][] = [];
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && /^[a-z]/.test(n.tagName.text)) {
        const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        at.push([n.tagName.end, ` data-k="${name}:${line + 1}:${character + 1}"`]);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    let out = code;
    for (const [i, attr] of at.sort((a, b) => b[0] - a[0])) out = out.slice(0, i) + attr + out.slice(i);
    return { code: out, map: null };
  },
});

// Every colour a launch film's code names becomes a variable with itself as the fallback (`var(--t-f5f4f0, #f5f4f0)`)
// and its sans and display faces too (`--t-sans`, `--t-display`), so a film is drawn in a product's palette without
// its code changing (_film/tone.ts maps them). Colours inside a drawn picture (a data: SVG) stay: a variable can't
// reach into one. The film's palette goes out with it as `__tones`.
const HEX = /(?<![\w&]|url\(|href=")#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/g;
const filmTones = (): Plugin => ({
  name: "film-tones",
  enforce: "pre",
  transform(code, id) {
    const m = /src[\\/]animations[\\/](film-[\w-]+|reel-[\w-]+)[\\/]index\.tsx$/.exec(id.split("?")[0]);
    if (!m) return;
    const sf = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edits: [number, number, string][] = [];
    const seen = new Set<string>();
    const six = (h: string) => (h.length === 3 ? [...h].map((c) => c + c).join("") : h).toLowerCase();
    const visit = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        const [a, b] = [n.getStart(sf), n.end];
        let raw = code.slice(a, b);
        if (!/<svg|data:/.test(raw)) {
          // the faces a film is set in, by the constant that names them
          const decl = n.parent && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : "";
          if (decl === "SANS" || decl === "DISPLAY") raw = raw.replace(/^(['"`])("[^"]+")/, `$1var(--t-${decl.toLowerCase()}, $2)`);
          raw = raw.replace(HEX, (_, h: string) => (seen.add(six(h)), `var(--t-${six(h)}, #${six(h)})`));
          if (raw !== code.slice(a, b)) edits.push([a, b, raw]);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    let out = code;
    for (const [a, b, s] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
    return { code: `${out}\nexport const __tones = ${JSON.stringify([...seen])};\n`, map: null };
  },
});

// Five pages: the engine UI, the stage document every device iframe loads, the mockup studio's export page (headless
// Chrome renders it frame by frame; the studio plugin drives that), the web player a film plays in on a site, and a
// film's review link. And the canvas's real devices, as a module of their own.
export default defineConfig({
  plugins: [phosphorPerIcon(), filmTones(), filmKeys(), react(), tailwindcss(), studio(), lab(), work(), templates(), kits(), gates(), versions(), briefs(), voice(), reviews(), search(), shaders(), maker(), canvas3d()],
  // the icons come one file each (above), never as the whole set
  optimizeDeps: { exclude: ["@phosphor-icons/react"] },
  // the template lab keeps its proposals in .engine-data: a reload for every write would interrupt the admin
  server: { port: 5180, watch: { ignored: ["**/.engine-data/**"] } },
  build: {
    rollupOptions: {
      input: { main: "index.html", stage: "stage.html", render: "render.html", play: "play.html", review: "review.html", shader: "shader.html", "canvas-3d": "src/canvas/device3d.ts" },
      // canvas-3d keeps its exports (mountDevice) and a name a site can ask for
      preserveEntrySignatures: "exports-only",
      output: { entryFileNames: (c) => (c.name === "canvas-3d" ? "canvas-3d.js" : "assets/[name]-[hash].js") },
    },
  },
});
